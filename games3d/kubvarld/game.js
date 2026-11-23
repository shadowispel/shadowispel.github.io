/** En spelomgång i en värld: binder ihop värld, spelare, varelser, inventarie, HUD och sparning. */
import * as THREE from 'three';
import { BLOCKS, B, I, ITEMS, CY, SEA, isWater, isDoor, isBed, DOOR0, BED0, toolOf, foodOf, itemName, placeOf, T_SOLID, M_CROSS, WATER, itemDef, TOOL0 } from './blocks.js';
import { World, DIR4, ckey } from './world.js';
import { Sky } from './sky.js';
import { Player } from './player.js';
import { Entities, lightColor } from './entities.js';
import { Inventory, newFurnace, tickFurnace } from './inventory.js';
import { UI } from './ui.js';
import { Hand } from './hand.js';
import { matSound, birdChirp } from './sfx.js';
import { placeTree, BIOMES } from './worldgen.js';
import { mulberry } from './noise.js';
import { kv, toast, submitScore, isTouchDevice } from '../../engine/kit.js';
import { Journal } from './journal.js';

export const DAY_LEN = 600; // sekunder per dygn
const SUN_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></g></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/><circle cx="18" cy="5" r="1" fill="currentColor"/><circle cx="21" cy="9" r=".7" fill="currentColor"/></svg>';
const REACH = 5, REACH_C = 6;

export class Game {
  constructor(app, meta) {
    this.app = app;
    this.scene = app.scene; this.camera = app.camera; this.input = app.input; this.audio = app.audio; this.settings = app.settings;
    this.atlas = app.atlas; this.mats = app.mats; this.icons = app.icons;
    this.meta = meta;
    this.id = meta.id;
    this.creative = meta.mode === 'creative';
    this.difficulty = meta.diff ?? 1;
    this.time = 0;
    this.worldTime = meta.worldTime ?? 0.02;
    this.stats = Object.assign({ broken: 0, placed: 0, kills: 0, deaths: 0, lifeStartDay: 0, lifeEdits: 0, bestDays: 0 }, meta.stats || {});
    this.flags = Object.assign({}, meta.flags || {});
    this.flags.tally = Object.assign({}, this.flags.tally || {});
    this.touch = isTouchDevice();
    this.world = new World({ scene: this.scene, mats: this.mats, seed: meta.seed, fancy: this.settings.get('fancyLeaves') });
    this.applyView();
    this.world.onBlockChange = (x, y, z, o, n) => this._onBlockChange(x, y, z, o, n);
    this.world.onFall = (x, y, z, id) => this.ents.fallBlock(x, y, z, id);
    this.world.onDrop = (x, y, z, id) => { if (!this.creative) this._dropsFor(id, x, y, z, null); };
    this.sky = new Sky(this.scene, meta.seed);
    this.player = new Player(this);
    this.player.creative = this.creative;
    this.player.onLand = d => this._onLand(d);
    this.player.onStep = () => this._onStep();
    this.ents = new Entities(this);
    this.inv = new Inventory();
    this.inv.onChange = () => { this._invDirty = true; };
    this.ui = new UI(this);
    this.hand = new Hand(this);
    this.hand.setAspect(this.camera.aspect);
    // markering och sprickor
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.hl = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    this.hl.visible = false; this.scene.add(this.hl);
    const ct = new THREE.CanvasTexture(app.crack); ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter; ct.repeat.set(0.1, 1); ct.colorSpace = THREE.SRGBColorSpace;
    this.crackTex = ct;
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.crack.visible = false; this.scene.add(this.crack);
    // tillstånd
    this.target = null; this._ray = {}; this.mine = null; this.useCd = 0; this.atkCd = 0; this.eatT = 0;
    this.ready = false; this.paused = false; this.sleeping = 0;
    this.saveT = 45; this.musicT = 0; this.ambT = 8; this.curMusic = null;
    this.journal = new Journal(this);
    this.tutMoved = 0; this._lastPos = new THREE.Vector3();
    this.lastW = 0; this.lastSpace = 0;
    this.shake = 0; this.debug = false;
    this.autoJump = this.settings.get('autoJump');
    this._tmp = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this.lifeScoreSubmitted = false;
    // ladda sparat
    if (meta.inv) this.inv.load(meta.inv);
    else if (this.creative) { [B.grass, B.cobble, B.spruce_planks, B.glass, B.torch, B.stone_bricks, B.birch_log, B.lantern, B.wool_red].forEach((id, i) => this.inv.slots[i] = { id, n: 64, d: 0 }); }
    if (meta.furnaces) for (const [k, f] of meta.furnaces) this.world.furnaces.set(k, f);
    if (meta.chests) for (const [k, c] of meta.chests) this.world.chests.set(k, c);
    if (meta.saplings) for (const [k, t] of meta.saplings) this.world.saplings.set(k, t);
    this.spawn = meta.spawn || null;
    this.bed = meta.bed || null;
    this.ui.updateHotbar(true);
    // HUD-effekter delas mellan världar – nollställ dem (t.ex. om man avslutade mitt i en sömn)
    document.getElementById('sleep').style.opacity = 0;
    document.getElementById('vignette').classList.remove('on');
    document.getElementById('water').classList.remove('on');
    document.getElementById('hud').classList.remove('nohud');
    document.getElementById('debug').classList.add('hidden');
    document.getElementById('tut').style.display = '';
  }

  /* ---------- start och laddning ---------- */
  async load(progress) {
    // läs ändrade chunkar
    const prefix = 'kubvarld:w:' + this.id + ':c:';
    const keys = await kv.keys(prefix);
    let i = 0;
    for (const k of keys) {
      const arr = await kv.get(k);
      const [cx, cz] = k.slice(prefix.length).split(',').map(Number);
      if (arr) this.world.loadMods(ckey(cx, cz), arr instanceof Uint32Array ? arr : new Uint32Array(arr));
      if (++i % 20 === 0) progress(0.1 * i / keys.length, 'Läser sparade ändringar…');
    }
    if (!this.spawn) { const s = this.world.findSpawn(); this.spawn = [s.x, s.y, s.z]; }
    const p = this.meta.player;
    if (p) { this.player.pos.set(p.pos[0], p.pos[1], p.pos[2]); this.player.yaw = p.yaw; this.player.pitch = p.pitch; Object.assign(this.player, { health: p.health, food: p.food, sat: p.sat ?? 5, air: 15, flying: !!p.flying && this.creative }); this.player.view = p.view || 0; }
    else { this.player.pos.set(this.spawn[0], this.spawn[1], this.spawn[2]); this.needGround = true; }
    // vänta på närmaste chunkar
    const t0 = performance.now();
    while (true) {
      this.world.update(this.player.pos.x, this.player.pos.z, 0.016);
      const r = this.world.readyAround(this.player.pos.x, this.player.pos.z, 2);
      progress(0.1 + 0.9 * r.ok / r.need, 'Bygger världen… ' + Math.round(r.ok / r.need * 100) + ' %');
      if (r.ok >= r.need) break;
      if (performance.now() - t0 > 30000) break;
      await new Promise(res => setTimeout(res, 16));
    }
    if (this.needGround) this._placeOnGround();
    // se till att spelaren inte är inne i ett block
    this._unstuck();
    this.ready = true;
    this._lastPos.copy(this.player.pos);
    this.log(this.creative ? (this.touch ? 'Kreativt läge: dubbeltryck Hoppa för att flyga.' : 'Kreativt läge: dubbeltryck mellanslag för att flyga.') : `Dag ${this.day}. Lycka till!`);
    this.ui.setQuest(null);
  }
  _placeOnGround() {
    const W = this.world;
    const x0 = Math.floor(this.player.pos.x), z0 = Math.floor(this.player.pos.z);
    const tree = id => id >= B.spruce_log && id <= B.pine_leaves;
    const ground = (x, z) => {
      for (let y = CY - 2; y > 1; y--) {
        const b = W.get(x, y, z); if (b < 0) return -1;
        if (b > 0 && T_SOLID[b] && !tree(b)) return y;
      }
      return -1;
    };
    // fri himmel ovanför (inte inne i en trädkrona) och plats för spelaren
    const open = (x, y, z) => { for (let yy = y + 1; yy < Math.min(CY, y + 14); yy++) { const b = W.get(x, yy, z); if (b > 0 && !BLOCKS[b].replace) return false; } return true; };
    // plan mark: grannarna högst ett block högre/lägre
    const flat = (x, y, z) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const h = ground(x + dx, z + dz); if (h < 0 || Math.abs(h - y) > 1) return false; } return true; };
    let best = null, fallback = null, fallback2 = null;
    for (let r = 0; r <= 14 && !best; r++) for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r && !best; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = x0 + dx, z = z0 + dz, y = ground(x, z);
      if (y < 0 || isWater(W.get(x, y + 1, z)) || isWater(W.get(x, y, z))) continue;
      const a1 = W.get(x, y + 1, z), a2 = W.get(x, y + 2, z);
      if ((a1 === 0 || (a1 > 0 && BLOCKS[a1].replace)) && (a2 === 0 || (a2 > 0 && BLOCKS[a2].replace))) {
        const o = open(x, y, z);
        if (o && flat(x, y, z)) best = [x, y, z]; else if (o && !fallback) fallback = [x, y, z]; else if (!fallback2) fallback2 = [x, y, z];
      }
    }
    best = best || fallback || fallback2;
    if (!best) { const y = W.topY(x0, z0); best = [x0, y, z0]; }
    this.player.pos.set(best[0] + 0.5, best[1] + 1, best[2] + 0.5);
    this.spawn = [best[0] + 0.5, best[1] + 1, best[2] + 0.5];
    this.needGround = false;
    // vänd spelaren mot närmaste trädstam – första uppgiften är att hugga ved
    let near = null, td = 1e9;
    for (let dz = -18; dz <= 18; dz++) for (let dx = -18; dx <= 18; dx++) {
      const d = dx * dx + dz * dz; if (d >= td || d < 4) continue;
      for (let dy = -2; dy <= 4; dy++) { const b = W.get(best[0] + dx, best[1] + dy, best[2] + dz); if (b === B.spruce_log || b === B.birch_log || b === B.pine_log) { near = [dx, dz]; td = d; break; } }
    }
    if (near) { this.player.yaw = Math.atan2(-near[0], -near[1]); this.player.pitch = -0.05; }
  }
  _unstuck() {
    const p = this.player.pos;
    for (let k = 0; k < 60; k++) {
      const b1 = this.world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), b2 = this.world.get(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
      if ((b1 <= 0 || !T_SOLID[b1]) && (b2 <= 0 || !T_SOLID[b2])) return;
      p.y += 1;
    }
  }
  applyView() {
    const v = this.settings.get('viewDist');
    const base = v === 'auto' || !v ? Math.round(8 * this.settings.q.view) : +v;
    this.world.radius = Math.max(3, Math.min(16, base));
    this.viewDist = this.world.radius * 16;
    this.camera.far = Math.max(600, this.viewDist * 2);
    this.camera.updateProjectionMatrix();
  }

  get day() { return Math.floor(this.worldTime) + 1; }
  get tod() { return this.worldTime - Math.floor(this.worldTime); }
  get isNight() { const t = this.tod; return t > 0.52 && t < 0.98; }
  diffDmg() { return [0, 0.75, 1.25][this.difficulty]; }
  diffHp() { return [1, 1, 1.3][this.difficulty]; }
  get score() { if (this.creative) return 0; return Math.max(0, Math.floor(this.worldTime) - this.stats.lifeStartDay) * 100 + Math.floor(this.stats.lifeEdits / 10); }

  log(t, cls) { this.ui.log(t, cls); }
  toast(t) { toast(t); }

  /* ---------- uppdatering ---------- */
  update(dt) {
    this.time += dt;
    const W = this.world, P = this.player, inp = this.input;
    if (!this.ready) return;
    const uiOpen = this.ui.open;
    // tid
    if (this.sleeping > 0) {
      this.sleeping += dt;
      document.getElementById('sleep').style.opacity = Math.min(1, this.sleeping / 1.5);
      if (this.sleeping > 2.2) {
        this.worldTime = Math.floor(this.worldTime) + 1.005;
        this.sleeping = 0;
        document.getElementById('sleep').style.opacity = 0;
        this.log(`God morgon! Dag ${this.day}.`, 'good');
        this.audio.play('levelup', { vol: 0.5 });
        this.ents.clearHostiles();
        this._justSlept = true;
      }
    } else this.worldTime += dt / DAY_LEN;

    // ---- indata ----
    const ctl = { mx: 0, mz: 0, jump: false, sneak: false, sprint: false, down: false };
    if (!uiOpen && P.alive && !this.sleeping) {
      const look = inp.lookDelta();
      P.yaw -= look.dx; P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch - look.dy));
      let mx = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
      let mz = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
      const st = inp.sticks.move; if (st && (Math.abs(st.x) > Math.abs(mx) || Math.abs(st.y) > 0.05)) { if (Math.abs(st.x) > 0.1) mx = st.x; if (Math.abs(st.y) > 0.1) mz = -st.y; }
      const gx = inp.gpAxis(0), gy = -inp.gpAxis(1); if (Math.abs(gx) > Math.abs(mx)) mx = gx; if (Math.abs(gy) > Math.abs(mz)) mz = gy;
      ctl.mx = mx; ctl.mz = mz;
      ctl.jump = inp.down('Space', 'Pad0', 'Jump');
      ctl.sneak = inp.down('ShiftLeft', 'ShiftRight', 'Pad1') || this.touchSneak;
      ctl.down = ctl.sneak;
      if (inp.pressed('KeyW')) { if (this.time - this.lastW < 0.3) this.sprintLatch = true; this.lastW = this.time; }
      if (!inp.down('KeyW')) this.sprintLatch = false;
      ctl.sprint = inp.down('ControlLeft', 'ControlRight', 'Pad10') || this.sprintLatch || (st && st.y < -0.92);
      if (inp.pressed('Space', 'Pad0', 'Jump') && this.creative) { if (this.time - this.lastSpace < 0.3) { P.flying = !P.flying; P.vel.y = 0; this.log(P.flying ? 'Flygning på.' : 'Flygning av.'); } this.lastSpace = this.time; }
      // snabbfält
      for (let i = 0; i < 9; i++) if (inp.pressed('Digit' + (i + 1))) { this.inv.sel = i; this.onSelChange(); }
      if (inp.wheel) { this.inv.sel = (this.inv.sel + (inp.wheel > 0 ? 1 : -1) + 9) % 9; this.onSelChange(); }
      if (inp.pressed('Pad5')) { this.inv.sel = (this.inv.sel + 1) % 9; this.onSelChange(); }
      if (inp.pressed('Pad4')) { this.inv.sel = (this.inv.sel + 8) % 9; this.onSelChange(); }
      if (inp.pressed('KeyQ')) this.dropHeld(inp.down('ControlLeft'));
      if (inp.pressed('F5', 'KeyV', 'Pad8')) { P.view = (P.view + 1) % 3; }
    }
    if (uiOpen && inp.gamepad != null) {
      const sp = 9 * (this.settings.get('sensitivity') || 1);
      this.ui.gamepad(inp.gpAxis(0) * sp, inp.gpAxis(1) * sp, inp.pressed('Pad0'), inp.pressed('Pad2'));
      if (inp.pressed('Pad1')) this.closeInventory();
    }
    if (inp.pressed('F3')) { this.debug = !this.debug; document.getElementById('debug').classList.toggle('hidden', !this.debug); document.getElementById('tut').style.display = this.debug ? 'none' : ''; }
    if (inp.pressed('F1')) document.getElementById('hud').classList.toggle('nohud');
    if (inp.pressed('KeyE', 'Pad3', 'Inv') && P.alive) { if (uiOpen) this.closeInventory(); else this.openInventory(); }
    if (inp.pressed('KeyJ') && P.alive && !this.creative) { if (uiOpen && this.ui.mode === 'journal') this.closeInventory(); else if (!uiOpen) this.openInventory('journal'); }
    if (inp.pressed('KeyR') && P.alive && !this.creative) { if (!uiOpen) { this.ui.showBook = true; this.openInventory(); } else if (this.ui.mode === 'inv' || this.ui.mode === 'bench') { this.ui.showBook = !this.ui.showBook; this.ui.build(); this.ui.refresh(); } }

    // ---- spelare ----
    const loadedHere = W.isLoaded(Math.floor(P.pos.x), Math.floor(P.pos.z));
    if (!loadedHere) P.vel.set(0, 0, 0);
    const pr = (loadedHere ? P.update(dt, ctl) : null) || {};
    P.hurtT = Math.max(0, P.hurtT - dt);
    if (pr.stepped) this._onStep();
    const moved = Math.hypot(P.pos.x - this._lastPos.x, P.pos.z - this._lastPos.z);
    this.tutMoved += moved;
    if (P.sprinting && P.ground) this._exh(moved * 0.1);
    if (P.inWater) this._exh(moved * 0.015);
    this._lastPos.copy(P.pos);

    // ---- mål ----
    P.updateCamera(this.camera, dt, this.settings.get('viewBob'));
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.06; }
    const eye = P.eye(this._tmp), dir = P.lookDir(this._dir);
    const reach = this.creative ? REACH_C : REACH;
    let tgt = (P.alive && !this.sleeping) ? W.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach, this._ray) : null;
    const mobHit = P.alive ? this.ents.raycast(eye, dir, Math.min(3.6, tgt ? tgt.dist : 3.6)) : null;
    if (mobHit) tgt = null;
    this.target = tgt; this.mobTarget = mobHit;
    this._updateHighlight();

    // ---- handlingar ----
    this.useCd = Math.max(0, this.useCd - dt); this.atkCd = Math.max(0, this.atkCd - dt);
    if (!uiOpen && P.alive && !this.sleeping) this._actions(dt);
    else { this.mine = null; this.crack.visible = false; this.eatT = 0; }

    // ---- överlevnad ----
    if (!this.creative && P.alive) this._survival(dt);

    // ---- värld ----
    W.update(P.pos.x, P.pos.z, dt);
    this.ents.update(dt);
    this._tickFurnaces(dt);
    this._tickSaplings();
    if (Math.random() < dt * 0.5) this._randomTicks();

    // ---- himmel/ljus ----
    this.sky.update(this.tod, this.camera, dt, this.viewDist, Math.floor(this.worldTime + 0.1));
    const U = this.mats.uniforms;
    U.uTime.value = this.time;
    U.uSkyLight.value.copy(this.sky.skyLight);
    const bright = this.settings.get('brightness');
    U.uMinLight.value = 0.02 + bright * 0.08;
    U.uFlicker.value = 0.94 + Math.sin(this.time * 7.3) * 0.03 + Math.sin(this.time * 13.1) * 0.03;
    if (P.headInWater) {
      U.uFogColor.value.setRGB(0.04, 0.12, 0.28).multiplyScalar(0.3 + this.sky.daylight * 0.7);
      U.uFogNear.value = 0; U.uFogFar.value = 22;
    } else {
      U.uFogColor.value.copy(this.sky.fog);
      U.uFogNear.value = this.viewDist * 0.6; U.uFogFar.value = this.viewDist * 0.96;
    }
    this.app.renderer.setClearColor(U.uFogColor.value);
    document.getElementById('water').classList.toggle('on', P.headInWater);
    lightColor(W, this.sky.skyLight, P.pos.x, P.pos.y + 1, P.pos.z, P.light, 0.05);
    if (((this._hbT = (this._hbT || 0) - dt)) <= 0) {
      // mät snabbfältet (och mätarna ovanför) så att vanten kan placeras fritt från det
      this._hbT = 0.5;
      const hb = document.getElementById('hotbar').getBoundingClientRect(), st = document.getElementById('stats').getBoundingClientRect();
      const top = st.height > 0 ? Math.min(st.top, hb.top) : hb.top, W = innerWidth, H = innerHeight;
      this.hand.layout = hb.width > 0 ? { xr: (Math.max(hb.right, st.right) / W) * 2 - 1, yt: 1 - (top / H) * 2 } : null;
    }
    this.hand.update(dt, this.inv.held ? this.inv.held.id : 0, P, this.eatT > 0);

    // ---- HUD ----
    if (this._invDirty) { this._invDirty = false; this.ui.updateHotbar(); if (this.ui.open) this.ui.refresh(); }
    this.ui.updateStats(P, this.creative);
    if (this.ui.mode === 'furnace' && (this.time * 4 | 0) !== this._furnT) { this._furnT = this.time * 4 | 0; this.ui.refresh(); }
    if (this.debug && (this.time * 5 | 0) !== this._dbgT) { this._dbgT = this.time * 5 | 0; this._updateDebug(); }
    if (!this.creative) this.journal.update(dt, this.touch);
    this._ambience(dt);
    this._dayEvents();
    // autosparning
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 45; this.save(); }
  }

  _actions(dt) {
    const inp = this.input, P = this.player, W = this.world;
    const lmb = inp.mouseDown(0) || inp.down('Pad7', 'Mine');
    const lmbP = inp.mousePressed(0) || inp.pressed('Pad7', 'Mine');
    const rmb = inp.mouseDown(2) || inp.down('Pad6', 'Use');
    const rmbP = inp.mousePressed(2) || inp.pressed('Pad6', 'Use');
    const held = this.inv.held;
    // anfall
    if (this.mobTarget && lmbP && this.atkCd <= 0) {
      const m = this.mobTarget.mob;
      const t = held ? toolOf(held.id) : null;
      let dmg = t ? t.dmg : 1;
      if (!P.ground && P.vel.y < -1) dmg *= 1.5; // fallande hugg
      const d = this._tmp.set(m.pos.x - P.pos.x, 0, m.pos.z - P.pos.z).normalize();
      if (this.ents.hitMob(m, dmg, d)) {
        this.hand.swing = 1; P.swing = 1; this.atkCd = 0.4;
        if (t && !this.creative) { if (this.inv.wearHeld(t.type === 'sword' ? 1 : 2)) this._broke(held.id); }
        this._exh(0.1);
        this.audio.play('hit', { vol: 0.6 });
      }
      this.mine = null;
    } else if (lmbP && !this.target && !this.mobTarget) { this.hand.swing = 1; }
    // brytning
    if (lmb && this.target && !this.mobTarget) this._mine(dt, lmbP);
    else { this.mine = null; this.crack.visible = false; }
    // ät
    const food = held ? foodOf(held.id) : 0;
    const interactable = this.target && BLOCKS[this.target.id] && BLOCKS[this.target.id].interact && !P.sneaking;
    if (rmb && food && !interactable && (P.food < 20 || this.creative) && !(this.target && held.id === I.chanterelle_item && false)) {
      this.eatT += dt;
      if ((this.eatT * 6 | 0) !== ((this.eatT - dt) * 6 | 0)) this.audio.noise({ dur: 0.08, vol: 0.06, freq: 900 + Math.random() * 600, type: 'bandpass' });
      if (this.eatT >= 1.2) {
        this.eatT = 0;
        P.food = Math.min(20, P.food + food); P.sat = Math.min(P.food, P.sat + food * 0.6);
        this.tally('e', held.id);
        if (!this.creative) this.inv.useHeld(1);
        this.audio.play('power', { vol: 0.35 });
        if (held.id === I.lingon || held.id === I.cloudberry) this.log('Mums, ' + itemName(held.id).toLowerCase() + '!');
      }
      return;
    }
    this.eatT = 0;
    // använd/placera
    if (rmb && (rmbP || this.useCd <= 0)) {
      if (this.target) {
        const done = this._use(rmbP);
        if (done) { this.useCd = 0.25; this.hand.swing = Math.max(this.hand.swing, 0.6); P.swing = 1; }
      }
    }
    // välj block (mittenklick)
    if (inp.mousePressed(1) && this.target) {
      const id = this.target.id; const want = BLOCKS[id] && BLOCKS[id].drop > 0 && !this.creative ? id : id;
      let pick = id;
      if (isDoor(id)) pick = I.door; else if (isBed(id)) pick = I.bed; else if (id >= 36 && id <= 39) pick = B.torch; else if (id === B.furnace_lit) pick = B.furnace; else if (id >= 66 && id <= 72) pick = WATER;
      const at = this.inv.slots.findIndex((s, i) => i < 9 && s && s.id === pick);
      if (at >= 0) { this.inv.sel = at; this.onSelChange(); }
      else if (this.creative) { this.inv.slots[this.inv.sel] = { id: pick, n: 64, d: 0 }; this.inv.changed(); this.onSelChange(); }
    }
  }

  breakTime(id) {
    const d = BLOCKS[id]; if (!d || d.hardness < 0) return Infinity;
    if (this.creative) return 0;
    const held = this.inv.held, t = held ? toolOf(held.id) : null;
    const proper = t && d.tool && t.type === d.tool;
    const speed = proper ? t.speed : 1;
    const canHarvest = d.tier < 0 || (t && t.type === 'pick' && t.tier >= d.tier);
    let time = d.hardness * (canHarvest ? 1.5 : 5) / speed;
    if (this.player.inWater && !this.player.ground) time *= 3;
    else if (!this.player.ground && !this.player.flying) time *= 2;
    return time;
  }
  canHarvest(id) {
    const d = BLOCKS[id]; const held = this.inv.held, t = held ? toolOf(held.id) : null;
    return d.tier < 0 || (t && t.type === 'pick' && t.tier >= d.tier);
  }
  _mine(dt, pressed) {
    const T = this.target;
    const key = T.x + ',' + T.y + ',' + T.z;
    if (this.creative) {
      if (pressed || this.useCd <= 0) { this.breakBlock(T.x, T.y, T.z); this.useCd = 0.22; this.hand.swing = 1; }
      return;
    }
    if (!this.mine || this.mine.key !== key || this.mine.id !== T.id) this.mine = { key, id: T.id, p: 0, t: 0, time: this.breakTime(T.id) };
    const m = this.mine;
    m.time = this.breakTime(T.id);
    if (!isFinite(m.time)) { if (pressed) this.audio.play('error', { vol: 0.5 }); return; }
    m.p += m.time > 0 ? dt / m.time : 1;
    m.t -= dt;
    if (m.t <= 0) {
      m.t = 0.24; this.hand.swing = 1; this.player.swing = 1;
      matSound(this.audio, BLOCKS[T.id].sound, 'hit', { vol: 0.8 });
      this.ents.hitSpark(T.x, T.y, T.z, T.id, T.nx, T.ny, T.nz);
    }
    if (m.p >= 1) { this.breakBlock(T.x, T.y, T.z); this.mine = null; }
  }
  breakBlock(x, y, z) {
    const W = this.world;
    const id = W.get(x, y, z); if (id <= 0) return;
    const d = BLOCKS[id];
    // innehåll i kistor/ugnar
    const k = x + ',' + y + ',' + z;
    if (W.chests.has(k)) { for (const s of W.chests.get(k)) if (s) this.ents.drop(s.id, s.n, x + 0.5, y + 0.5, z + 0.5, s.d); W.chests.delete(k); }
    if (W.furnaces.has(k)) { const f = W.furnaces.get(k); for (const s of [f.in, f.fuel, f.out]) if (s) this.ents.drop(s.id, s.n, x + 0.5, y + 0.5, z + 0.5); W.furnaces.delete(k); }
    W.saplings.delete(k);
    if (id === B.ice && !this.creative) W.set(x, y, z, WATER); else W.set(x, y, z, 0);
    this.ents.blockBurst(x, y, z, id, this.creative ? 10 : 18);
    matSound(this.audio, d.sound, 'break');
    this.stats.broken++; this.stats.lifeEdits++;
    if (!this.creative) {
      if (this.canHarvest(id)) this._dropsFor(id, x, y, z, this.inv.held);
      else if (this.time - (this._toolHintT || -99) > 20) { this._toolHintT = this.time; this.toast(d.tier >= 2 ? 'Det här kräver en järnhacka.' : d.tier === 1 ? 'Det här kräver en stenhacka.' : 'Du behöver en hacka för att få något ur det här.'); }
      const held = this.inv.held, t = held ? toolOf(held.id) : null;
      if (t && d.hardness > 0) { if (this.inv.wearHeld(t.type === 'sword' ? 2 : 1)) this._broke(held.id); }
      this._exh(0.006);
    }
  }
  _dropsFor(id, x, y, z) {
    const d = BLOCKS[id]; if (!d) return;
    const r = Math.random();
    let drop = d.drop, n = 1;
    if (drop === -1) {
      // löv och gräs
      if (id === B.spruce_leaves && r < 0.06) drop = B.spruce_sapling;
      else if (id === B.birch_leaves && r < 0.06) drop = B.birch_sapling;
      else if (id === B.pine_leaves && r < 0.06) drop = B.pine_sapling;
      else if ((id === B.spruce_leaves || id === B.pine_leaves) && r < 0.1) drop = I.stick;
      else if (id === B.tallgrass && r < 0.04) drop = I.lingon;
      else drop = 0;
    }
    if (id === B.crystal_ore) n = 1 + (Math.random() < 0.4 ? 1 : 0);
    if (id === B.lingon_bush) n = 1 + (Math.random() * 2 | 0);
    if (isDoor(id)) drop = I.door;
    if (isBed(id)) drop = I.bed;
    if (drop > 0) this.ents.drop(drop, n, x + 0.5, y + 0.4, z + 0.5);
  }
  _broke(id) { this.audio.play('break', { vol: 0.8 }); this.log(itemName(id) + ' gick sönder!', 'bad'); }

  /** Högerklick på mål. Returnerar true om något hände. */
  _use(pressed) {
    const T = this.target, W = this.world, P = this.player, inv = this.inv;
    const d = BLOCKS[T.id];
    const k = T.x + ',' + T.y + ',' + T.z;
    if (d.interact && !P.sneaking && pressed) {
      if (d.interact === 'bench') { this.openInventory('bench'); return true; }
      if (d.interact === 'furnace') { if (!W.furnaces.has(k)) W.furnaces.set(k, newFurnace()); this.openInventory('furnace', { f: W.furnaces.get(k), key: k }); return true; }
      if (d.interact === 'chest') { if (!W.chests.has(k)) W.chests.set(k, new Array(27).fill(null)); this.openInventory('chest', { c: W.chests.get(k), key: k }); this.audio.play('select', { vol: 0.5, pitch: 0.6 }); return true; }
      if (d.interact === 'door') {
        const dd = d.door, other = dd.upper ? T.y - 1 : T.y + 1;
        const nid = DOOR0 + (dd.upper ? 8 : 0) + (dd.open ? 0 : 4) + dd.f;
        W.set(T.x, T.y, T.z, nid, { noUpdate: true });
        const o = W.get(T.x, other, T.z);
        if (isDoor(o)) W.set(T.x, other, T.z, DOOR0 + (dd.upper ? 0 : 8) + (dd.open ? 0 : 4) + dd.f, { noUpdate: true });
        matSound(this.audio, 'wood', 'place', { vol: 0.8 });
        return true;
      }
      if (d.interact === 'bed') { this._sleep(T); return true; }
    }
    const held = inv.held;
    if (!held) return false;
    let id = held.id;
    // vart?
    let tx = T.x + T.nx, ty = T.y + T.ny, tz = T.z + T.nz;
    if (BLOCKS[T.id].replace && !isWater(T.id)) { tx = T.x; ty = T.y; tz = T.z; }
    // platta på platta → helt block
    if ((id === B.cobble_slab || id === B.plank_slab) && T.id === id && T.ny === 1) {
      W.set(T.x, T.y, T.z, id === B.cobble_slab ? B.cobble : B.spruce_planks);
      this._placed(id, T.x, T.y, T.z); return true;
    }
    if (ty < 1 || ty >= CY) return false;
    const cur = W.get(tx, ty, tz);
    if (cur < 0 || (cur !== 0 && !(BLOCKS[cur] && BLOCKS[cur].replace))) return false;
    const f = ((Math.round(-P.yaw / (Math.PI / 2)) % 4) + 4) % 4;
    if (id === I.door) {
      const above = W.get(tx, ty + 1, tz);
      if (above !== 0 && !(BLOCKS[above] && BLOCKS[above].replace)) return false;
      if (!T_SOLID[Math.max(0, W.get(tx, ty - 1, tz))]) return false;
      if (this._blocked(tx, ty, tz) || this._blocked(tx, ty + 1, tz)) return false;
      W.set(tx, ty, tz, DOOR0 + f, { noUpdate: true }); W.set(tx, ty + 1, tz, DOOR0 + 8 + f, { noUpdate: true });
      this._placed(id, tx, ty, tz, B.spruce_planks); return true;
    }
    if (id === I.bed) {
      const [dx, dz] = DIR4[f];
      const hx = tx + dx, hz = tz + dz;
      const h = W.get(hx, ty, hz);
      if (h !== 0 && !(BLOCKS[h] && BLOCKS[h].replace)) return false;
      if (!T_SOLID[Math.max(0, W.get(tx, ty - 1, tz))] || !T_SOLID[Math.max(0, W.get(hx, ty - 1, hz))]) return false;
      W.set(tx, ty, tz, BED0 + f, { noUpdate: true }); W.set(hx, ty, hz, BED0 + 4 + f, { noUpdate: true });
      this._placed(id, tx, ty, tz, B.wool_red); return true;
    }
    let bid = placeOf(id);
    if (!bid) return false;
    const bd = BLOCKS[bid];
    if (bid === B.torch) {
      if (T.ny === -1) return false;
      if (T.ny === 0) bid = T.nx === 1 ? 37 : T.nx === -1 ? 36 : T.nz === 1 ? 39 : 38;
      else if (!T_SOLID[Math.max(0, W.get(tx, ty - 1, tz))]) return false;
    }
    if (bd.model === M_CROSS) {
      const below = W.get(tx, ty - 1, tz);
      const okGround = [B.grass, B.dirt, B.peat, B.snowgrass, B.sand, B.gravel].includes(below) || (bid === B.chanterelle && T_SOLID[Math.max(0, below)]);
      if (!okGround) return false;
    }
    if (T_SOLID[bid] && this._blocked(tx, ty, tz)) return false;
    W.set(tx, ty, tz, bid);
    if (bid >= B.spruce_sapling && bid <= B.pine_sapling) W.saplings.set(tx + ',' + ty + ',' + tz, this.worldTime + (0.6 + Math.random() * 1.2) / 1);
    if (bid === B.furnace) W.furnaces.set(tx + ',' + ty + ',' + tz, newFurnace());
    if (bid === B.chest) W.chests.set(tx + ',' + ty + ',' + tz, new Array(27).fill(null));
    if (bid === B.workbench) this.flags.bench = true;
    this._placed(id, tx, ty, tz, bid);
    return true;
  }
  _placed(itemId, x, y, z, soundBlock) {
    this.tally('pl', itemId);
    const sb = BLOCKS[soundBlock || itemId] || BLOCKS[B.stone];
    matSound(this.audio, sb.sound, 'place');
    if (!this.creative) this.inv.useHeld(1);
    this.stats.placed++; this.stats.lifeEdits++;
  }
  _blocked(x, y, z) {
    const P = this.player;
    const hit = (px, py, pz, hw, h) => px + hw > x && px - hw < x + 1 && py + h > y && py < y + 1 && pz + hw > z && pz - hw < z + 1;
    if (hit(P.pos.x, P.pos.y, P.pos.z, 0.3, P.height)) return true;
    for (const m of this.ents.mobs) if (!m.dead && hit(m.pos.x, m.pos.y, m.pos.z, m.hw, m.h)) return true;
    return false;
  }
  _sleep(T) {
    const P = this.player;
    this.bed = [T.x + 0.5, T.y + 1, T.z + 0.5];
    if (!this.flags.bedMsg) { this.flags.bedMsg = true; }
    this.log('Återuppståndelsepunkt satt vid sängen.', 'good');
    if (!this.isNight) { this.toast('Du kan bara sova på natten.'); return; }
    if (this.ents.hostileNear(P.pos, 10)) { this.toast('Du kan inte sova – det finns fiender i närheten!'); this.audio.play('error'); return; }
    this.sleeping = 0.001;
    P.vel.set(0, 0, 0);
  }
  _onBlockChange(x, y, z, o, n) {
    if (isDoor(n) || isDoor(o)) return;
  }

  /* ---------- överlevnad ---------- */
  _exh(v) { if (!this.creative) this.player.exh += v; }
  _survival(dt) {
    const P = this.player;
    P.exh += dt * 0.004;
    while (P.exh >= 4) { P.exh -= 4; if (P.sat > 0) P.sat = Math.max(0, P.sat - 1); else if (this.difficulty > 0) P.food = Math.max(0, P.food - 1); }
    this._regenT = (this._regenT || 0) + dt;
    if (P.health < 20 && (P.food >= 18 || this.difficulty === 0) && this._regenT >= (this.difficulty === 0 ? 2 : 3.5)) { P.health = Math.min(20, P.health + 1); this._regenT = 0; P.exh += 3; }
    if (P.food <= 0 && this._regenT >= 4) { this._regenT = 0; if (P.health > (this.difficulty === 2 ? 0 : 1)) this.damagePlayer(1, null, 0, 'svält', true); }
    if (P.health >= 20 && P.food < 18) this._regenT = 0;
    // andning
    if (P.headInWater) {
      P.air -= dt;
      if (P.air <= 0) { P.air = 0; this._drownT = (this._drownT || 0) + dt; if (this._drownT >= 1) { this._drownT = 0; this.damagePlayer(2, null, 0, 'drunkning', true); } }
    } else P.air = Math.min(15, P.air + dt * 6);
  }
  damagePlayer(amount, dir, kb, source, silent) {
    const P = this.player;
    if (this.creative || !P.alive || amount <= 0) return;
    if (P.hurtT > 0.15 && !silent) return;
    P.health -= amount; P.hurtT = 0.5;
    if (dir) { P.vel.x += dir.x * kb; P.vel.z += dir.z * kb; P.vel.y = Math.max(P.vel.y, 4.5); }
    this.audio.play('hurt', { vol: 0.8 });
    this.shake = Math.min(1, this.shake + 0.4);
    const v = document.getElementById('vignette'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on');
    if (P.health <= 0) this.die(source);
  }
  _onLand(dist) {
    const P = this.player;
    if (dist > 1.2) matSound(this.audio, this._groundSound(), 'step', { vol: 1.5 });
    if (this.creative) return;
    const dmg = Math.floor(dist - 3);
    const below = this.world.get(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.2), Math.floor(P.pos.z));
    if (dmg > 0 && !isWater(below) && !isBed(below)) { this.damagePlayer(dmg, null, 0, 'fall', true); this.audio.play('land'); }
  }
  _groundSound() { const P = this.player; const b = this.world.get(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.2), Math.floor(P.pos.z)); return b > 0 && BLOCKS[b] ? BLOCKS[b].sound : 'stone'; }
  _onStep() { if (!this.player.sneaking) matSound(this.audio, this._groundSound(), 'step', { vol: 0.9 }); }
  onJump() { this._exh(this.player.sprinting ? 0.2 : 0.05); }

  die(source) {
    const P = this.player;
    P.alive = false; P.health = 0;
    this.stats.deaths++;
    const days = Math.max(0, Math.floor(this.worldTime) - this.stats.lifeStartDay);
    const score = this.score;
    this.stats.bestDays = Math.max(this.stats.bestDays, days);
    const res = submitScore('kubvarld', score);
    this.lifeScoreSubmitted = true;
    // släpp allt
    for (let i = 0; i < 36; i++) { const s = this.inv.slots[i]; if (s) { this.ents.drop(s.id, s.n, P.pos.x, P.pos.y + 1, P.pos.z, s.d, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6)); this.inv.slots[i] = null; } }
    this.inv.changed();
    this.audio.play('lose', { vol: 0.7 });
    const reason = { fall: 'Du föll för hårt.', 'drunkning': 'Du drunknade.', 'svält': 'Du svalt ihjäl.' }[source] || (source ? `Du besegrades av en ${String(source).toLowerCase()}.` : 'Du dog.');
    this.app.showDeath({ reason, days, score, best: res.best, isNew: res.isNew });
    this.save();
  }
  respawn() {
    const P = this.player;
    let sp = this.spawn;
    if (this.bed) { const b = this.world.get(Math.floor(this.bed[0]), Math.floor(this.bed[1] - 1), Math.floor(this.bed[2])); if (isBed(b) || b < 0) sp = this.bed; else { this.bed = null; this.log('Din säng saknas – du vaknar vid startplatsen.', 'bad'); } }
    P.pos.set(sp[0], sp[1], sp[2]); P.vel.set(0, 0, 0);
    P.health = 20; P.food = 20; P.sat = 5; P.air = 15; P.alive = true; P.fallY = null; P.exh = 0;
    this.stats.lifeStartDay = Math.floor(this.worldTime); this.stats.lifeEdits = 0;
    this.lifeScoreSubmitted = false;
    const tryPlace = () => {
      if (this.world.isLoaded(Math.floor(P.pos.x), Math.floor(P.pos.z))) { this._unstuck(); return; }
      setTimeout(tryPlace, 100);
    };
    tryPlace();
    this.log('Du har återuppstått. Var försiktig!');
  }

  /* ---------- inventarie ---------- */
  openInventory(mode, ctx) {
    if (!mode) mode = this.creative ? 'creative' : 'inv';
    this.ui.openScreen(mode, ctx);
    this.input.exitLock();
    this.audio.play('click', { vol: 0.4 });
  }
  closeInventory() { this.ui.close(); }
  onInventoryClosed() { this.app.onUiClosed(); }
  onSelChange() { this.ui.updateHotbar(true); this.mine = null; this.eatT = 0; }
  onPickup(id, n) { this.tally('p', id, n); }
  onCrafted(id, n) { this.tally('c', id, n); this.audio.play('select', { vol: 0.4 }); }
  onKill(type) { this.tally('k', type); }
  /* ---------- räknare för äventyrsdagboken ---------- */
  tally(kind, key, n = 1) { const k = kind + ':' + key, t = this.flags.tally; t[k] = (t[k] || 0) + n; }
  tl(kind, keys) { let s = 0; const t = this.flags.tally; for (const k of keys) s += t[kind + ':' + k] || 0; return s; }
  have(id) { const t = this.flags.tally, k = 'h:' + id; const c = this.inv.count(id); if (c > (t[k] || 0)) t[k] = c; return t[k] || 0; }
  throwItem(st) {
    const P = this.player, d = P.lookDir(new THREE.Vector3());
    this.ents.drop(st.id, st.n, P.pos.x + d.x * 0.6, P.pos.y + 1.3, P.pos.z + d.z * 0.6, st.d, new THREE.Vector3(d.x * 5, d.y * 5 + 2, d.z * 5)).age = -0.8;
  }
  dropHeld(all) {
    const s = this.inv.held; if (!s) return;
    const n = all ? s.n : 1;
    this.throwItem({ id: s.id, n, d: s.d });
    this.inv.useHeld(n);
    this.hand.swing = 0.6;
  }

  /* ---------- tidsstyrda block ---------- */
  _tickFurnaces(dt) {
    const W = this.world;
    for (const [k, f] of W.furnaces) {
      const burning = tickFurnace(f, dt);
      const [x, y, z] = k.split(',').map(Number);
      const cur = W.get(x, y, z);
      if (cur < 0) continue;
      if (burning && cur === B.furnace) W.set(x, y, z, B.furnace_lit, { noUpdate: true });
      else if (!burning && cur === B.furnace_lit) W.set(x, y, z, B.furnace, { noUpdate: true });
      if (burning && Math.random() < dt * 3) this.ents.particle(x + 0.3 + Math.random() * 0.4, y + 1.05, z + 0.3 + Math.random() * 0.4, 0, 0.6, 0, new THREE.Color(0.4, 0.4, 0.4), 0.08, 1.2, -0.05);
    }
  }
  _tickSaplings() {
    const W = this.world;
    if ((this.time * 2 | 0) === this._sapT) return; this._sapT = this.time * 2 | 0;
    for (const [k, t] of W.saplings) {
      if (this.worldTime < t) continue;
      const [x, y, z] = k.split(',').map(Number);
      const id = W.get(x, y, z);
      if (id < 0) continue;
      W.saplings.delete(k);
      if (id < B.spruce_sapling || id > B.pine_sapling) continue;
      // plats?
      let free = true;
      for (let dy = 1; dy < 8 && free; dy++) { const b = W.get(x, y + dy, z); if (b !== 0 && !(b >= 16 && b <= 20 && b % 2 === 0)) free = false; }
      if (!free) { W.saplings.set(k, this.worldTime + 0.3); continue; }
      W.set(x, y, z, 0, { noUpdate: true });
      const type = id === B.spruce_sapling ? 'spruce' : id === B.birch_sapling ? 'birch' : 'pine';
      const r = mulberry((x * 73 + z * 31 + y) >>> 0);
      placeTree((bx, by, bz, bid, force) => { const c = W.get(bx, by, bz); if (c === 0 || (c > 0 && BLOCKS[c].replace && !isWater(c)) || (force && c >= 16 && c <= 20)) W.set(bx, by, bz, bid, { noUpdate: true }); }, type, x, y, z, r);
      if (this.player.pos.distanceTo(this._tmp.set(x, y, z)) < 24) this.log('En planta har vuxit till ett träd.', 'good');
    }
  }
  _randomTicks() {
    // gräs sprider sig till jord i ljus
    const W = this.world, P = this.player;
    for (let k = 0; k < 30; k++) {
      const x = Math.floor(P.pos.x) + ((Math.random() * 48) | 0) - 24, z = Math.floor(P.pos.z) + ((Math.random() * 48) | 0) - 24;
      const y = W.topY(x, z); if (y <= 0) continue;
      const b = W.get(x, y, z);
      if (b === B.dirt && (W.light(x, y + 1, z) >> 4) >= 9) {
        for (const [dx, dz] of DIR4) for (let dy = -1; dy <= 1; dy++) if (W.get(x + dx, y + dy, z + dz) === B.grass) { W.set(x, y, z, B.grass, { noUpdate: true }); dx; break; }
      }
    }
  }

  /* ---------- presentation ---------- */
  _updateHighlight() {
    const T = this.target;
    if (!T) { this.hl.visible = false; this.crack.visible = false; return; }
    const d = BLOCKS[T.id];
    const b = d.selBox || (d.boxes && d.boxes.length === 1 ? d.boxes[0] : null) || (d.boxes ? [0, 0, 0, 16, d.boxes.reduce((m, q) => Math.max(m, q[4]), 0), 16] : [0, 0, 0, 16, 16, 16]);
    const sx = (b[3] - b[0]) / 16, sy = (b[4] - b[1]) / 16, sz = (b[5] - b[2]) / 16;
    this.hl.visible = true;
    this.hl.position.set(T.x + (b[0] + b[3]) / 32, T.y + (b[1] + b[4]) / 32, T.z + (b[2] + b[5]) / 32);
    this.hl.scale.set(sx + 0.004, sy + 0.004, sz + 0.004);
    this.hl.material.color.setScalar(this.sky.daylight < 0.3 ? 0.85 : 0);
    if (this.mine && this.mine.p > 0) {
      this.crack.visible = true;
      this.crack.position.copy(this.hl.position); this.crack.scale.copy(this.hl.scale);
      this.crackTex.offset.x = Math.min(9, Math.floor(this.mine.p * 10)) / 10;
    } else this.crack.visible = false;
  }
  _updateDebug() {
    const P = this.player, W = this.world;
    const x = Math.floor(P.pos.x), y = Math.floor(P.pos.y), z = Math.floor(P.pos.z);
    const c = W.getChunk(x >> 4, z >> 4);
    const bio = c && c.biomes ? BIOMES[c.biomes[((z & 15) << 4) | (x & 15)]] : '?';
    const L = W.light(x, y + 1, z);
    let loaded = 0, meshed = 0; for (const ch of W.chunks.values()) { if (ch.data) loaded++; if (ch.meshed) meshed++; }
    const t = this.tod * 24 + 6; const hh = Math.floor(t % 24), mm = Math.floor((t % 1) * 60);
    const info = this.app.renderer.info;
    document.getElementById('debug').textContent =
      `Kubvärld · ${this.app.loop.fps} FPS · uppd ${this.app.perf.upd.toFixed(1)} ms · rit ${this.app.perf.ren.toFixed(1)} ms\n` +
      `XYZ: ${P.pos.x.toFixed(1)} / ${P.pos.y.toFixed(1)} / ${P.pos.z.toFixed(1)}  Chunk: ${x >> 4}, ${z >> 4}\n` +
      `Biom: ${bio}  Ljus: himmel ${L >> 4} block ${L & 15}\n` +
      `Dag ${this.day}  Klockan ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}\n` +
      `Chunkar: ${loaded} laddade, ${meshed} meshade, radie ${W.radius}  Frö: ${this.meta.seed}\n` +
      `Varelser: ${this.ents.mobs.length}  Föremål: ${this.ents.drops.length}  Ritanrop: ${info.render.calls}  Trianglar: ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `Generering: ${(W.stats.genMs / Math.max(1, W.stats.gens)).toFixed(1)} ms/chunk  Meshning: ${(W.stats.meshMs / Math.max(1, W.stats.meshes)).toFixed(1)} ms/chunk`;
  }
  _dayEvents() {
    const night = this.isNight, t = this.tod;
    const day = this.day + (t >= 0.98 ? 1 : 0); // gryningen räknas till nästa dag
    const key = day + (night ? 'n' : 'd');
    const m = Math.round(t * 200);
    if (m !== this._dayMark) { this._dayMark = m; document.getElementById('dayMark').style.left = 'calc(' + (t * 100).toFixed(1) + '% - 1px)'; }
    if (key !== this._dayKey) {
      const first = this._dayKey === undefined, wasNight = this._dayNight;
      const slept = this._justSlept; this._justSlept = false;
      this._dayKey = key; this._dayNight = night;
      const chip = document.getElementById('dayChip');
      chip.classList.toggle('night', night); chip.classList.toggle('day', !night);
      document.getElementById('dayIc').innerHTML = night ? MOON_SVG : SUN_SVG;
      document.getElementById('dayTx').textContent = 'Dag ' + day;
      if (!first && !night && (wasNight || slept)) this.tally('x', 'night');
      if (!first && !this.creative && this.player.alive) {
        if (night) { this.log('Natten faller – akta dig för skuggvarelserna!', 'bad'); this.audio.play('countdown', { vol: 0.4, pitch: 0.6 }); }
        else if (!slept && wasNight) { this.log(`Du överlevde natten! Dag ${day} (+100 poäng).`, 'good'); this.audio.play('levelup', { vol: 0.5 }); }
      }
    }
  }
  _ambience(dt) {
    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = 6;
      const want = !this.settings.get('music') ? null : this.player.pos.y < SEA - 12 && this.world.light(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y + 1), Math.floor(this.player.pos.z)) >> 4 < 4 ? 'tense' : this.isNight ? 'night' : (this.day % 2 ? 'calm' : 'adventure');
      if (want !== this.curMusic) { this.curMusic = want; if (want) this.audio.music(want); else this.audio.stopMusic(); }
    }
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 5 + Math.random() * 12;
      const P = this.player;
      if (this.sky.daylight > 0.6 && (this.world.light(Math.floor(P.pos.x), Math.floor(P.pos.y + 1), Math.floor(P.pos.z)) >> 4) > 12) birdChirp(this.audio, 0.9);
    }
  }

  /* ---------- sparning ---------- */
  serialize() {
    const P = this.player;
    return Object.assign({}, this.meta, {
      worldTime: this.worldTime, played: Date.now(), day: this.day,
      player: { pos: [P.pos.x, P.pos.y, P.pos.z], yaw: P.yaw, pitch: P.pitch, health: P.alive ? P.health : 20, food: P.alive ? P.food : 20, sat: P.sat, flying: P.flying, view: P.view },
      inv: this.inv.serialize(), spawn: this.spawn, bed: this.bed, stats: this.stats, flags: this.flags,
      furnaces: [...this.world.furnaces], chests: [...this.world.chests].map(([k, c]) => [k, c]), saplings: [...this.world.saplings]
    });
  }
  async save() {
    if (!this.ready) return;
    // köa sparningar så att två aldrig körs samtidigt (t.ex. autosparning + paus)
    this._saving = (this._saving || Promise.resolve()).then(() => this._save());
    return this._saving;
  }
  async _save() {
    const meta = this.serialize();
    try {
      await kv.set('kubvarld:w:' + this.id, meta);
      const W = this.world;
      // ta en ögonblicksbild: ändringar som görs medan vi sparar ligger kvar som "smutsiga" till nästa gång
      const keys = [...W.dirtyMods];
      for (const key of keys) {
        W.dirtyMods.delete(key);
        const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
        const data = W.modsFor(key);
        try { await kv.set('kubvarld:w:' + this.id + ':c:' + cx + ',' + cz, data); }
        catch (e) { W.dirtyMods.add(key); throw e; }
      }
      await this.app.updateWorldList(meta);
    } catch (e) { console.warn('Sparning misslyckades', e); }
  }
  /** Rapportera poäng (vid sparning/avslut) */
  reportScore() { if (!this.creative && this.player.alive && this.score > 0) return submitScore('kubvarld', this.score); return null; }

  render(renderer) {
    renderer.info.autoReset = false; renderer.info.reset();
    renderer.render(this.scene, this.camera);
    if (this.player.view === 0 && this.player.alive && !document.getElementById('hud').classList.contains('nohud')) this.hand.render(renderer);
  }

  dispose() {
    this.ui.close();
    this.ui.dispose();
    this.hand.dispose();
    this.world.dispose();
    this.sky.dispose(this.scene);
    this.ents.dispose();
    this.player.dispose();
    this.scene.remove(this.hl); this.scene.remove(this.crack);
    this.hl.geometry.dispose(); this.hl.material.dispose(); this.crack.geometry.dispose(); this.crack.material.dispose(); this.crackTex.dispose();
    this.app.renderer.info.autoReset = true;
    this.audio.stopMusic();
  }
}
