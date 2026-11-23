/** En spelomgång i en värld: binder ihop värld, spelare, varelser, inventarie, HUD och sparning. */
import * as THREE from 'three';
import { BLOCKS, B, I, ITEMS, CY, SEA, isWater, isDoor, isBed, DOOR0, BED0, toolOf, foodOf, itemName, placeOf, T_SOLID, M_CROSS, WATER, itemDef, TOOL0, armorOf, LAVA, isLava, waterLevel, isHoe, TRAP0, BUTTON0, GATE0, REP0, PISTON0, STICKY0, DISP0, OBS0, isTrap, isGate, isButton, isRep, DIR6, isBlock, isPortal, ARMOR0, SURT_ARMOR0 } from './blocks.js';
import { rollLoot, LOOT_NAMES, PORTAL_FRAME, PORTAL_INNER } from './structures.js';
import { MUSPEL_SCALE } from './muspel.js';
import { PROFS } from './models.js';
import { World, DIR4, ckey } from './world.js';
import { Sky } from './sky.js';
import { Player } from './player.js';
import { Entities, lightColor, MOBS, AMBIENT } from './entities.js';
import { Inventory, newFurnace, tickFurnace, wantName } from './inventory.js';
import { UI } from './ui.js';
import { Hand } from './hand.js';
import { matSound, birdChirp } from './sfx.js';
import { placeTree, BIOMES } from './worldgen.js';
import { mulberry } from './noise.js';
import { kv, toast, submitScore, isTouchDevice, loadingScreen, show } from '../../engine/kit.js';
import { Achievements } from './achievements.js';
import { Circuits } from './circuits.js';
import { hasCustomSkin } from './skin.js';

const isSapling = id => (id >= B.spruce_sapling && id <= B.pine_sapling) || id === B.oak_sapling;
const isLeaf = id => (id >= 16 && id <= 20 && id % 2 === 0) || id === B.oak_leaves;
const H4_D6 = [0, 1, 4, 5];

export const DAY_LEN = 600; // sekunder per dygn
const SPLASH = new THREE.Color('#d8eef8'), BUBBLE = new THREE.Color('#bfe6ff');
const SUN_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></g></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/><circle cx="18" cy="5" r="1" fill="currentColor"/><circle cx="21" cy="9" r=".7" fill="currentColor"/></svg>';
const REACH = 5, REACH_C = 6;

const CROP_T = () => 0.1 + Math.random() * 0.1; // dagar per växtsteg
const PORTAL_TIME = 2.6, DIM_NAME = { over: 'den vanliga världen', muspel: 'Muspelheim' };
// Muspelheims musik: långsam frygisk skala, mörka sågtandsackord och trummor som slår som en smedja
const MUSPEL_MUSIC = { tempo: 56, root: 45, scale: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [5, 7, 9], [6, 8, 10], [1, 3, 5]], pad: 'sawtooth', arp: true, arpEvery: 4, arpType: 'square', arpVol: 0.012, bass: true, drums: true };
/** Bybornas byteserbjudanden per yrke: give = [[id, antal]...], get = [id, antal] */
const TRADES = {
  bonde: [[[[I.wheat, 20]], [I.emerald, 1]], [[[I.carrot, 16]], [I.emerald, 1]], [[[I.potato, 18]], [I.emerald, 1]], [[[I.emerald, 1]], [I.bread, 6]], [[[I.emerald, 1]], [I.apple, 4]], [[[I.emerald, 2]], [I.pie, 3]], [[[I.emerald, 1]], [I.pumpkin_seeds, 4]]],
  smed: [[[[I.coal, 15]], [I.emerald, 1]], [[[I.iron_ingot, 4]], [I.emerald, 1]], [[[I.diamond, 1]], [I.emerald, 3]], [[[I.emerald, 3]], [TOOL0 + 8, 1]], [[[I.emerald, 4]], [TOOL0 + 11, 1]], [[[I.emerald, 6]], [ARMOR0 + 5, 1]], [[[I.emerald, 9], [I.iron_ingot, 2]], [TOOL0 + 12, 1]], [[[I.emerald, 6]], [B.obsidian, 2]]],
  bibliotekarie: [[[[I.paper, 24]], [I.emerald, 1]], [[[I.emerald, 2]], [B.bookshelf, 2]], [[[I.emerald, 4]], [I.compass, 1]], [[[I.emerald, 5]], [I.clock, 1]], [[[I.emerald, 3]], [B.lantern, 3]], [[[I.emerald, 10]], [I.glodfragment, 1]]],
  fiskare: [[[[I.fish, 6]], [I.emerald, 1]], [[[I.string, 12]], [I.emerald, 1]], [[[I.emerald, 1]], [I.fish_cooked, 6]], [[[I.emerald, 2]], [I.rod, 1]], [[[I.emerald, 2]], [I.bucket, 1]]],
  kartograf: [[[[I.paper, 12]], [I.emerald, 1]], [[[I.emerald, 1]], [I.paper, 8]], [[[I.emerald, 4]], [I.map_village, 1]], [[[I.emerald, 6]], [I.map_explore, 1]], [[[I.emerald, 10], [I.compass, 1]], [I.map_fort, 1]]]
};
const FOUND_MSG = {
  village: 'Du har hittat en by! Högerklicka på en bybo för att handla.', mine: 'En övergiven gruvgång… Akta dig för spindlarna.', ruin: 'En uråldrig domarring. Kanske finns något gömt vid runstenen?',
  temple: 'Ett ökentempel! Se upp för fällor.', wreck: 'Ett gammalt skeppsvrak.', tower: 'Resterna av ett vakttorn.', cabin: 'En övergiven stuga i skogen.',
  portal: 'En förfallen eldport… Laga bågen med obsidian och tänd den med en Glödkärna.', fortress: 'Surts borg reser sig ur lavan!', ashruin: 'En askruin i Muspelheim.', treasure: 'Skattkammaren under Surts borg!'
};
const KIND_NAME = { village: 'By', mine: 'Gruvgång', ruin: 'Fornlämning', temple: 'Ökentempel', wreck: 'Skeppsvrak', tower: 'Vakttorn', cabin: 'Stuga', portal: 'Förfallen eldport', fortress: 'Surts borg', ashruin: 'Askruin' };
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
    // dimensioner: 'over' (vanliga världen) och 'muspel' (Muspelheim). this.dim är spelarens dimension (synkbart tillstånd).
    this.dim = meta.dim === 'muspel' ? 'muspel' : 'over';
    this.worlds = {}; this.circs = {};
    this.portals = { over: [], muspel: [], ...(meta.portals || {}) };
    this.markers = new Map(); this.spawned = new Set();
    this.world = this._createWorld('over');
    this.applyView();
    this.sky = new Sky(this.scene, meta.seed);
    this.player = new Player(this);
    this.player.creative = this.creative;
    this.player.onLand = d => this._onLand(d);
    this.player.onStep = () => this._onStep();
    this.player.onSplash = v => this._splash(v);
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
    this.achievements = new Achievements(this);
    this.circuits = this.circs.over = new Circuits(this, meta.circ || []);
    this.customSkin = hasCustomSkin();
    this.tutMoved = 0; this._lastPos = new THREE.Vector3();
    this.lastW = 0; this.lastSpace = 0;
    this.shake = 0; this.debug = false;
    this.autoJump = this.settings.get('autoJump');
    this._tmp = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this.lifeScoreSubmitted = false;
    // ladda sparat
    if (meta.inv) this.inv.load(meta.inv);
    else if (this.creative) { [B.grass, B.cobble, B.spruce_planks, B.glass, B.torch, B.stone_bricks, B.birch_log, B.lantern, B.wool_red].forEach((id, i) => this.inv.slots[i] = { id, n: 64, d: 0 }); }
    this._loadWorldState(this.world, meta);
    this.flags.seen = this.flags.seen || {}; this.flags.bosses = this.flags.bosses || {};
    this.spouts = []; this.portalT = 0; this.portalCd = false;
    this._mkOverlay();
    this.spawn = meta.spawn || null;
    this.bed = meta.bed || null;
    this.ui.updateHotbar(true);
    // HUD-effekter delas mellan världar – nollställ dem (t.ex. om man avslutade mitt i en sömn)
    document.getElementById('sleep').style.opacity = 0;
    document.getElementById('vignette').classList.remove('on');
    document.getElementById('water').classList.remove('on');
    document.getElementById('hud').classList.remove('nohud');
    document.getElementById('debug').classList.add('hidden');
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
    // äldre världar: strukturer får inte byggas där spelaren redan har ändrat något
    if (!this.meta.structInit) { this.meta.structInit = 1; if ((this.meta.version || 1) < 3 && this.world.mods.size) this.meta.structSkip = [...this.world.mods.keys()]; }
    if (this.meta.structSkip && this.meta.structSkip.length) this.world.structSkip = new Set(this.meta.structSkip);
    if (!this.spawn) { const s = this.world.findSpawn(); this.spawn = [s.x, s.y, s.z]; }
    if (this.dim === 'muspel') {
      progress(0.08, 'Läser Muspelheim…');
      const W = await this._ensureWorld('muspel');
      this.world.suspend(); W.resume();
      this.world = W; this.circuits = this.circs.muspel;
    }
    this.sky.setDim(this.dim);
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
    this.portalCd = this._inPortal();
    this._lastPos.copy(this.player.pos);
    if (this.dim === 'muspel') this.log('Du är i Muspelheim. Hitta en eldport för att ta dig hem.', 'bad');
    this.log(this.creative ? (this.touch ? 'Kreativt läge: dubbeltryck Hoppa för att flyga.' : 'Kreativt läge: dubbeltryck mellanslag för att flyga.') : `Dag ${this.day}. Lycka till!`);
  }
  _placeOnGround() {
    const W = this.world;
    const x0 = Math.floor(this.player.pos.x), z0 = Math.floor(this.player.pos.z);
    const tree = id => (id >= B.spruce_log && id <= B.pine_leaves) || id === B.oak_log || id === B.oak_leaves;
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
      for (let dy = -2; dy <= 4; dy++) { const b = W.get(best[0] + dx, best[1] + dy, best[2] + dz); if (b === B.spruce_log || b === B.birch_log || b === B.pine_log || b === B.oak_log) { near = [dx, dz]; td = d; break; } }
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
        this._justSlept = true; this.tally('sleep', 1);
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
    if (inp.pressed('F3')) { this.debug = !this.debug; document.getElementById('debug').classList.toggle('hidden', !this.debug); }
    if (inp.pressed('F1')) document.getElementById('hud').classList.toggle('nohud');
    if (inp.pressed('KeyE', 'Pad3', 'Inv') && P.alive) { if (uiOpen) this.closeInventory(); else this.openInventory(); }
    if (inp.pressed('KeyL', 'Ach') && P.alive) { if (uiOpen && this.ui.mode === 'ach') this.closeInventory(); else if (!uiOpen) this.openInventory('ach'); }
    if (inp.pressed('KeyF', 'Pad11') && P.alive && !uiOpen) this.swapHands();
    if (inp.pressed('KeyR') && P.alive && !this.creative) { if (!uiOpen) { this.ui.showBook = true; this.openInventory(); } else if (this.ui.mode === 'inv' || this.ui.mode === 'bench') { this.ui.showBook = !this.ui.showBook; this.ui.build(); this.ui.refresh(); } }

    // ---- spelare ----
    const loadedHere = W.isLoaded(Math.floor(P.pos.x), Math.floor(P.pos.z));
    if (!loadedHere) P.vel.set(0, 0, 0);
    const pr = (loadedHere ? P.update(dt, ctl) : null) || {};
    P.hurtT = Math.max(0, P.hurtT - dt);
    if (pr.stepped) this._onStep();
    const moved = Math.hypot(P.pos.x - this._lastPos.x, P.pos.z - this._lastPos.z);
    this.tutMoved += moved;
    if (!this.creative && P.alive) {
      if (moved > 0 && moved < 3) this.tally('walk', 1, moved);
      const T = this.flags.tally;
      if (P.pos.y < 16 && !T['depth:1']) this.tally('depth', 1);
      if (P.pos.y >= 100 && P.ground && !T['peak:1']) this.tally('peak', 1);
    }
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
    else { this.mine = null; this.crack.visible = false; this.eatT = 0; P.blocking = false; this.hand.block = 0; }

    // ---- överlevnad ----
    if (!this.creative && P.alive) this._survival(dt);

    // ---- värld ----
    W.update(P.pos.x, P.pos.z, dt);
    this.ents.update(dt);
    this.circuits.update(dt);
    this._portalTick(dt);
    if (this.spouts.length) this._tickSpouts(dt);
    if ((this._secT = (this._secT || 0) - dt) <= 0) { this._secT = 1; this._markerTick(); this._discover(); }
    if (this.dim === 'muspel') this._muspelFx(dt);
    this._hudExtras(dt);
    if (!this.ready) return;
    this._tickFish(dt);
    if (P.alive && !this.creative) this._lavaContact(dt);
    this._heldInfo();
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
    if (this.dim === 'muspel') U.uAmbient.value.setRGB(0.2 + bright * 0.08, 0.1 + bright * 0.05, 0.075 + bright * 0.04); else U.uAmbient.value.setRGB(0, 0, 0);
    AMBIENT.copy(U.uAmbient.value);
    U.uFlicker.value = 0.94 + Math.sin(this.time * 7.3) * 0.03 + Math.sin(this.time * 13.1) * 0.03;
    if (P.headInWater) {
      U.uFogColor.value.setRGB(0.04, 0.12, 0.28).multiplyScalar(0.3 + this.sky.daylight * 0.7);
      U.uFogNear.value = 0; U.uFogFar.value = 22;
    } else {
      U.uFogColor.value.copy(this.sky.fog);
      if (this.dim === 'muspel') { U.uFogNear.value = this.viewDist * 0.22; U.uFogFar.value = this.viewDist * 0.88; }
      else { U.uFogNear.value = this.viewDist * 0.6; U.uFogFar.value = this.viewDist * 0.96; }
    }
    this.app.renderer.setClearColor(U.uFogColor.value);
    document.getElementById('water').classList.toggle('on', P.headInWater);
    U.uUnderwater.value = P.headInWater ? 1 : 0;
    this._underwaterAudio(P.headInWater);
    // simtag och bubblor
    if (P.inWater && !P.flying) {
      if ((P.swimT || 0) - (this._strokeAt || 0) > 1.6) { this._strokeAt = P.swimT; matSound(this.audio, 'water', 'step', { vol: P.headInWater ? 0.5 : 0.9 }); }
      if (P.headInWater && Math.random() < dt * 3) this.ents.particle(P.pos.x + (Math.random() - 0.5) * 0.4, P.pos.y + P.camY - 0.2, P.pos.z + (Math.random() - 0.5) * 0.4, 0, 1.4, 0, BUBBLE, 0.05, 1.2, -0.6, false);
    }
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
    this.achievements.update(dt);
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
    // sköld: håll Använd med sköld i handen (eller i andra handen med vapen/tom hand)
    {
      const off = this.inv.off, hs = held && ITEMS[held.id] && ITEMS[held.id].shield, os = off && ITEMS[off.id] && ITEMS[off.id].shield;
      const ht = held && toolOf(held.id);
      const freeHand = !held || (ht && ['sword', 'axe', 'pick', 'shovel'].includes(ht.type));
      const tgt = this.target && BLOCKS[this.target.id];
      const inter = tgt && tgt.interact && !P.sneaking;
      P.blocking = !!(rmb && (hs || (os && freeHand)) && !inter);
      this.hand.block = P.blocking ? (hs ? 1 : 2) : 0;
      if (P.blocking) { this.mine = null; this.crack.visible = false; this.eatT = 0; return; }
    }
    // anfall
    if (this.mobTarget && lmbP && this.atkCd <= 0) {
      const m = this.mobTarget.mob;
      const t = held ? toolOf(held.id) : null;
      let dmg = t && t.dmg ? t.dmg : 1;
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
    // handla med en bybo
    if (rmbP && this.mobTarget && this.mobTarget.mob.def.villager) { this.openTrade(this.mobTarget.mob); return; }
    // ät
    const food = held ? foodOf(held.id) : 0;
    const interactable = this.target && BLOCKS[this.target.id] && BLOCKS[this.target.id].interact && !P.sneaking;
    const planting = this.target && this.target.id === B.farmland && ITEMS[held && held.id] && ITEMS[held.id].place;
    if (rmb && food && !interactable && !planting && (P.food < 20 || this.creative)) {
      this.eatT += dt;
      if ((this.eatT * 6 | 0) !== ((this.eatT - dt) * 6 | 0)) this.audio.noise({ dur: 0.08, vol: 0.06, freq: 900 + Math.random() * 600, type: 'bandpass' });
      if (this.eatT >= 1.2) {
        this.eatT = 0;
        const fdef = itemDef(held.id); P.food = Math.min(20, P.food + food); P.sat = Math.min(P.food, P.sat + food * (fdef && fdef.sat != null ? fdef.sat : 0.6));
        this.tally('e', held.id);
        if (!this.creative) this.inv.useHeld(1);
        this.audio.play('power', { vol: 0.35 });
        if (held.id === I.lingon || held.id === I.cloudberry) this.log('Mums, ' + itemName(held.id).toLowerCase() + '!');
        if (held.id === I.glodapple) { P.fireRes = 60; P.health = Math.min(20, P.health + 6); P.burnT = 0; this.log('Glödäpplet värmer inifrån – du tål eld en stund.', 'good'); }
        if (held.id === I.rotten_flesh && Math.random() < 0.5) { P.sat = 0; P.exh += 10; this.log('Usch! Det ruttna köttet gjorde dig illamående.', 'bad'); }
      }
      return;
    }
    this.eatT = 0;
    // båge: håll in Använd för att spänna, släpp för att skjuta
    if (held && held.id === I.bow && !interactable) {
      if (rmb) this.bowT = (this.bowT || 0) + dt;
      else if (this.bowT > 0) { this._shootBow(); this.bowT = 0; }
      this.hand.pull = Math.min(1, (this.bowT || 0) / 0.9);
      return;
    }
    this.bowT = 0; this.hand.pull = 0;
    // föremål med egna handlingar (rustning, hinkar, sax, mjölk, fiskespö)
    if (rmbP && held && !interactable && this._useSpecial(held)) { this.useCd = 0.25; return; }
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
      else if (BLOCKS[id] && !BLOCKS[id].creative && BLOCKS[id].drop > 0) pick = BLOCKS[id].drop;
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
    if (id === B.chest) this._openLoot(k, x, y, z);
    if (W.chests.has(k)) { for (const s of W.chests.get(k)) if (s) this.ents.drop(s.id, s.n, x + 0.5, y + 0.5, z + 0.5, s.d); W.chests.delete(k); }
    if (W.furnaces.has(k)) { const f = W.furnaces.get(k); for (const s of [f.in, f.fuel, f.out]) if (s) this.ents.drop(s.id, s.n, x + 0.5, y + 0.5, z + 0.5); W.furnaces.delete(k); }
    W.saplings.delete(k); this.circuits.forget(x, y, z);
    if (id === B.ice && !this.creative && this.dim !== 'muspel') W.set(x, y, z, WATER); else W.set(x, y, z, 0);
    this.ents.blockBurst(x, y, z, id, this.creative ? 10 : 18);
    matSound(this.audio, d.sound, 'break');
    this.stats.broken++; this.stats.lifeEdits++;
    if (!this.creative) {
      if (this.canHarvest(id)) this._dropsFor(id, x, y, z, this.inv.held);
      else if (this.time - (this._toolHintT || -99) > 20) { this._toolHintT = this.time; this.toast(d.tier >= 3 ? 'Det här kräver en diamanthacka.' : d.tier >= 2 ? 'Det här kräver en järnhacka.' : d.tier === 1 ? 'Det här kräver en stenhacka.' : 'Du behöver en hacka för att få något ur det här.'); }
      const held = this.inv.held, t = held ? toolOf(held.id) : null;
      if (t && t.type && d.hardness > 0) { if (this.inv.wearHeld(t.type === 'sword' ? 2 : 1)) this._broke(held.id); }
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
      else if ((id === B.tallgrass || id === B.fern) && r < 0.16) drop = I.seeds;
      else if (id === B.tallgrass && r < 0.172) drop = I.carrot;
      else if (id === B.tallgrass && r < 0.184) drop = I.potato;
      else if ((id === B.birch_leaves || id === B.spruce_leaves) && r > 0.98) drop = I.apple;
      else if (id === B.oak_leaves) drop = r < 0.07 ? B.oak_sapling : r < 0.12 ? I.stick : r > 0.96 ? I.apple : 0;
      else drop = 0;
      // saxen klipper löv och gräs hela
      const held = this.inv.held;
      if (held && held.id === I.shears && (BLOCKS[id].flags & 16 || id === B.tallgrass || id === B.fern)) { drop = id; n = 1; if (!this.creative && this.inv.wearHeld(1)) this._broke(I.shears); }
    }
    const cd = d.crop;
    if (cd) {
      if (cd.kind === 'wheat') { if (cd.stage === cd.max) { this.ents.drop(I.wheat, 1, x + 0.5, y + 0.4, z + 0.5); n = 1 + (Math.random() * 3 | 0); } else n = 1; drop = I.seeds; }
      else if (cd.kind === 'pumpkin' || cd.kind === 'melon') { drop = cd.kind === 'pumpkin' ? I.pumpkin_seeds : I.melon_seeds; n = cd.stage === cd.max ? 1 + (Math.random() * 2 | 0) : 1; }
      else { drop = cd.kind === 'carrot' ? I.carrot : I.potato; n = cd.stage === cd.max ? 2 + (Math.random() * 3 | 0) : 1; }
    }
    if (id === B.melon) n = 3 + (Math.random() * 5 | 0);
    if (id === B.diamond_ore) n = 1;
    if (id === B.lingon_bush) n = 1 + (Math.random() * 2 | 0);
    if (isDoor(id)) drop = I.door;
    if (isBed(id)) drop = I.bed;
    if (drop > 0) this.ents.drop(drop, n, x + 0.5, y + 0.4, z + 0.5);
  }
  /* ---------- utökning: rustning, hinkar, sax, fiske, städ, spak, TNT, lava ---------- */
  armorPoints() { let n = 0; for (const s of this.inv.armor) { const a = s && armorOf(s.id); if (a) n += a.pts; } return n; }
  _armorReduce(amount) {
    const pts = this.armorPoints(); if (!pts) return amount;
    const inv = this.inv;
    for (let i = 0; i < 4; i++) { const s = inv.armor[i]; const a = s && armorOf(s.id); if (!a) continue; s.d = (s.d || 0) + 1; if (s.d >= a.dur) { inv.armor[i] = null; this._broke(s.id); } }
    inv.changed();
    return amount * (1 - Math.min(0.8, pts * 0.04));
  }
  _swapHeld(newId) {
    const inv = this.inv, h = inv.held;
    if (h && h.n > 1) { h.n--; const left = inv.add(newId, 1); if (left) this.throwItem({ id: newId, n: 1, d: 0 }); }
    else inv.slots[inv.sel] = { id: newId, n: 1, d: 0 };
    inv.changed(); this.onSelChange();
  }
  /** Första vätskecell längs blicken (källa, eller valfri vattencell för fiske) */
  _liquidRay(maxD = 5, anyWater = false) {
    const P = this.player, W = this.world, e = P.eye(new THREE.Vector3()), d = P.lookDir(new THREE.Vector3());
    let lx = null, ly, lz;
    for (let t = 0; t < maxD; t += 0.05) {
      const x = Math.floor(e.x + d.x * t), y = Math.floor(e.y + d.y * t), z = Math.floor(e.z + d.z * t);
      if (x === lx && y === ly && z === lz) continue; lx = x; ly = y; lz = z;
      const b = W.get(x, y, z);
      if (b === WATER || b === LAVA || (anyWater && isWater(b))) return { x, y, z, id: b };
      if (b > 0 && T_SOLID[b]) return null;
    }
    return null;
  }
  _useSpecial(held) {
    const id = held.id, P = this.player, W = this.world, inv = this.inv;
    const mob = this.mobTarget && this.mobTarget.mob;
    const ar = armorOf(id);
    if (ar) {
      const cur = inv.armor[ar.slot];
      inv.armor[ar.slot] = { id, n: 1, d: held.d || 0 }; inv.slots[inv.sel] = cur;
      inv.changed(); this.onSelChange();
      matSound(this.audio, ar.mat === 0 ? 'wool' : 'metal', 'place'); this.tally('eq', id);
      this.log(itemName(id) + ' på. Skydd: ' + this.armorPoints() + '.');
      return true;
    }
    if (mob && id === I.bucket && mob.type === 'cow') { this._swapHeld(I.bucket_milk); this.log('Du mjölkade kon.'); this.audio.play('pickup', { vol: 0.5, pitch: 0.8 }); this.tally('milk', 1); return true; }
    if (mob && id === I.shears && mob.type === 'sheep') {
      if (mob.sheared) return true;
      mob.sheared = true; mob.regrow = 120 + Math.random() * 120;
      if (mob.model.parts.wool) for (const w of mob.model.parts.wool) w.visible = false;
      if (mob.model.parts.skin) mob.model.parts.skin.visible = true;
      this.ents.drop(B.wool_white, 1 + (Math.random() * 3 | 0), mob.pos.x, mob.pos.y + 1, mob.pos.z);
      matSound(this.audio, 'wool', 'break'); this.tally('shear', 1); if (!this.creative && inv.wearHeld(1)) this._broke(id);
      return true;
    }
    if (id === I.bucket_milk) { P.food = Math.min(20, P.food + 4); P.sat = Math.min(P.food, P.sat + 3); this._swapHeld(I.bucket); this.audio.play('power', { vol: 0.35 }); this.tally('e', id); return true; }
    if (id === I.bucket) {
      const L = this._liquidRay(); if (!L) return false;
      W.set(L.x, L.y, L.z, 0); this._swapHeld(L.id === LAVA ? I.bucket_lava : I.bucket_water);
      matSound(this.audio, 'water', 'break'); this.tally('bk', 1); return true;
    }
    if (id === I.bucket_water || id === I.bucket_lava) {
      const T = this.target; if (!T) return false;
      let tx = T.x + T.nx, ty = T.y + T.ny, tz = T.z + T.nz;
      if (BLOCKS[T.id].replace && !isWater(T.id)) { tx = T.x; ty = T.y; tz = T.z; }
      const cur = W.get(tx, ty, tz);
      if (cur < 0 || !(cur === 0 || (BLOCKS[cur] && BLOCKS[cur].replace) || isLava(cur))) return false;
      if (cur > 0 && !isWater(cur) && !isLava(cur) && BLOCKS[cur].model === M_CROSS) this._dropsFor(cur, tx, ty, tz);
      if (id === I.bucket_water && this.dim === 'muspel') {
        // vatten fräser bort i Muspelheims hetta
        for (let i = 0; i < 24; i++) this.ents.particle(tx + Math.random(), ty + Math.random() * 0.5, tz + Math.random(), (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, new THREE.Color('#e8e8f0'), 0.12 + Math.random() * 0.1, 1.2, -0.3);
        this.audio.noise({ dur: 0.7, vol: 0.3, freq: 4000, type: 'highpass' });
        if (!this.creative) this._swapHeld(I.bucket);
        this.tally('fizz', 1); if (!this.flags.fizzTip) { this.flags.fizzTip = true; this.toast('Pyss! Vattnet kokar bort direkt i Muspelheim.'); }
        return true;
      }
      W.set(tx, ty, tz, id === I.bucket_water ? WATER : LAVA);
      if (!this.creative) this._swapHeld(I.bucket);
      matSound(this.audio, 'water', 'place'); return true;
    }
    if (id === I.rod) return this._fish();
    return false;
  }
  _fish() {
    const W = this.world;
    if (this.bob) {
      const f = this.bob; this._endFish();
      if (f.biteT > 0) {
        const r = Math.random(), got = r < 0.86 ? I.fish : r < 0.92 ? I.leather : r < 0.97 ? I.bone : I.emerald;
        const left = this.inv.add(got, 1); if (left) this.throwItem({ id: got, n: 1, d: 0 });
        this.onPickup(got, 1); this.log('Du fick ' + itemName(got).toLowerCase() + '!', 'good'); this.audio.play('pickup', { vol: 0.6 });
      }
      if (!this.creative && this.inv.wearHeld(1)) this._broke(I.rod);
      this.hand.swing = 0.6; return true;
    }
    const hit = this._liquidRay(16, true);
    if (!hit || !isWater(hit.id)) { this.toast('Kasta mot öppet vatten.'); return true; }
    let y = hit.y; while (isWater(W.get(hit.x, y + 1, hit.z))) y++;
    if (!this._bobGeo) { this._bobGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16); this._bobMat = new THREE.MeshBasicMaterial({ color: 0xe23a2a }); }
    const mesh = new THREE.Mesh(this._bobGeo, this._bobMat);
    mesh.position.set(hit.x + 0.5, y + 0.92, hit.z + 0.5); this.scene.add(mesh);
    this.bob = { mesh, t: 0, bite: 4 + Math.random() * 9, biteT: 0, y };
    this.hand.swing = 0.6; matSound(this.audio, 'water', 'step', { vol: 1.5 });
    return true;
  }
  _tickFish(dt) {
    const f = this.bob; if (!f) return;
    const held = this.inv.held;
    if (!held || held.id !== I.rod || !this.player.alive || this.player.pos.distanceTo(f.mesh.position) > 24) { this._endFish(); return; }
    f.t += dt; const base = f.y + 0.92;
    if (f.biteT > 0) {
      f.biteT -= dt; f.mesh.position.y = base - 0.2;
      if (f.biteT <= 0) f.bite = f.t + 3 + Math.random() * 8;
    } else {
      f.mesh.position.y = base + Math.sin(f.t * 3) * 0.03;
      if (f.t >= f.bite) {
        f.biteT = 1.3; this.ents.puff(f.mesh.position.x, base, f.mesh.position.z, '#cfe8f4', 10, 0.5);
        matSound(this.audio, 'water', 'break', { vol: 1.2 });
        if (!this.flags.fishTip) { this.flags.fishTip = true; this.toast('Napp! Använd spöt igen för att dra in.'); }
      }
    }
  }
  _endFish() { if (!this.bob) return; this.scene.remove(this.bob.mesh); this.bob = null; }
  _anvil(held) {
    const t = held && toolOf(held.id);
    if (!t || !held.d) { this.toast('Håll ett slitet verktyg eller en rustningsdel och använd städet för att laga det.'); return; }
    const a = armorOf(held.id);
    const mat = a ? [I.leather, I.iron_ingot, I.gold_ingot, I.diamond, I.urskarva][a.mat] : (held.id === I.bow || held.id === I.rod) ? I.string : held.id === I.shears ? I.iron_ingot : t.rep || ['#planks', '#stone', I.iron_ingot, I.diamond][t.tier] || '#planks';
    if (!this.creative && this.inv.count(mat) <= 0) { this.toast('Du behöver ' + wantName(mat).toLowerCase() + ' för att laga det.'); this.audio.play('error'); return; }
    if (!this.creative) this.inv.take(mat, 1);
    held.d = Math.max(0, held.d - Math.ceil(t.dur * 0.3));
    this.inv.changed(); matSound(this.audio, 'metal', 'break'); this.tally('fix', 1);
    this.log('Du lagade ' + itemName(held.id).toLowerCase() + ' på städet.', 'good');
  }
  _lever(T) {
    // spaken är en strömkälla – kretsmotorn sköter dörrar, lampor och kolvar i närheten
    const on = T.id === B.lever;
    this.world.set(T.x, T.y, T.z, on ? B.lever_on : B.lever, { noUpdate: true });
    matSound(this.audio, 'wood', 'hit', { vol: 1.2 }); this.audio.play('click', { vol: 0.5, pitch: on ? 1 : 0.8 });
  }
  /** Byt föremål mellan handen och andra handen (F) */
  swapHands() {
    const inv = this.inv, h = inv.slots[inv.sel];
    inv.slots[inv.sel] = inv.off; inv.off = h;
    inv.changed(); this.onSelChange(); this.audio.play('click', { vol: 0.35 });
    if (inv.off) this.log(itemName(inv.off.id) + ' i andra handen.');
  }
  /** Riktning spelaren tittar åt: horisontellt index 0 +x, 1 −x, 2 +z, 3 −z */
  _look4() { const P = this.player, lx = -Math.sin(P.yaw), lz = -Math.cos(P.yaw); return Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 0 : 1) : (lz > 0 ? 2 : 3); }
  /** Som _look4 men med upp/ned (DIR6-index) */
  _look6() { const P = this.player; return P.pitch > 0.85 ? 2 : P.pitch < -0.85 ? 3 : H4_D6[this._look4()]; }
  _ignite(x, y, z, fuse) { this.world.set(x, y, z, 0); this.ents.primeTnt(x, y, z, fuse); }
  explode(c, r = 3.3) {
    const W = this.world, P = this.player;
    const cx = Math.floor(c.x), cy = Math.floor(c.y), cz = Math.floor(c.z), R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dy * dy + dz * dz > r * r * (0.7 + Math.random() * 0.3)) continue;
      const x = cx + dx, y = cy + dy, z = cz + dz, b = W.get(x, y, z);
      if (b <= 0) continue;
      const d = BLOCKS[b];
      if (!d || d.hardness < 0 || b === B.obsidian || d.blast || isPortal(b) || isWater(b) || isLava(b)) continue;
      if (b === B.tnt) { this._ignite(x, y, z, 0.4 + Math.random() * 0.6); continue; }
      const k = x + ',' + y + ',' + z;
      if (b === B.chest) this._openLoot(k, x, y, z);
      if (W.chests.has(k)) { for (const s of W.chests.get(k)) if (s) this.ents.drop(s.id, s.n, x + 0.5, y + 0.5, z + 0.5, s.d); W.chests.delete(k); }
      if (W.furnaces.has(k)) { const f = W.furnaces.get(k); for (const s of [f.in, f.fuel, f.out]) if (s) this.ents.drop(s.id, s.n, x + 0.5, y + 0.5, z + 0.5); W.furnaces.delete(k); }
      W.saplings.delete(k);
      W.set(x, y, z, 0);
      if (!this.creative && Math.random() < 0.3) this._dropsFor(b, x, y, z);
    }
    const E = this.ents;
    for (let i = 0; i < 40; i++) E.particle(c.x + (Math.random() - 0.5) * 2, c.y + Math.random() * 2, c.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12, new THREE.Color(i % 3 ? '#5a5a5a' : '#ffb040'), 0.2 + Math.random() * 0.25, 0.8 + Math.random() * 0.8, i % 3 ? -0.15 : 0.3, i % 3 === 0);
    this.audio.play('boom', { vol: Math.max(0.2, 1 - P.pos.distanceTo(c) / 40) });
    const reach = r * 2.2;
    const pd = this._tmp2 || (this._tmp2 = new THREE.Vector3());
    pd.set(P.pos.x, P.pos.y + 0.9, P.pos.z).sub(c); const dp = pd.length();
    this.shake = Math.min(1, this.shake + Math.max(0, 1 - dp / 30));
    if (dp < reach && P.alive) this.damagePlayer((1 - dp / reach) * 24, pd.setY(0).normalize(), 14 * (1 - dp / reach), 'tnt', true);
    for (const m of E.mobs) { if (m.dead) continue; const d = m.pos.distanceTo(c); if (d < reach) { m.hurtT = 0; E.hitMob(m, (1 - d / reach) * 26, { x: (m.pos.x - c.x) / (d || 1), z: (m.pos.z - c.z) / (d || 1) }); } }
  }
  _lavaContact(dt) {
    const P = this.player, W = this.world;
    const fx = Math.floor(P.pos.x), fz = Math.floor(P.pos.z);
    const inLava = isLava(W.get(fx, Math.floor(P.pos.y + 0.1), fz)) || isLava(W.get(fx, Math.floor(P.pos.y + 0.9), fz));
    if (inLava) { P.burnT = 4; P.vel.x *= 0.85; P.vel.z *= 0.85; }
    if (P.inWater || P.fireRes > 0) P.burnT = 0;
    if (P.burnT > 0) {
      P.burnT -= dt; this._burnAcc = (this._burnAcc || 0) + dt;
      if (Math.random() < dt * 20) this.ents.particle(P.pos.x + (Math.random() - 0.5) * 0.6, P.pos.y + Math.random() * 1.6, P.pos.z + (Math.random() - 0.5) * 0.6, 0, 1.5, 0, new THREE.Color('#ff9a30'), 0.1, 0.5, -0.2, true);
      if (this._burnAcc >= 0.5) { this._burnAcc = 0; this.damagePlayer(inLava ? 3 : 1, null, 0, 'lava', true); if (P.alive) this.tally('lavahurt', 1); }
    }
  }
  /** Kompass och klocka: visar en liten rad i HUD:en när de hålls */
  _heldInfo() {
    const h = this.inv.held, id = h ? h.id : 0;
    let txt = '';
    if (id === I.map_village || id === I.map_explore || id === I.map_fort) txt = this._mapText(id);
    else if (id === I.compass && this.dim === 'muspel') txt = '🧭 Nålen snurrar planlöst i Muspelheims hetta…';
    else if (id === I.compass) {
      const P = this.player, sp = this.bed || this.spawn;
      const dx = sp[0] - P.pos.x, dz = sp[2] - P.pos.z, dist = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, -dz) * 180 / Math.PI; const dirs = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'];
      const rel = (((Math.atan2(-dx, -dz) - P.yaw) * 180 / Math.PI) % 360 + 540) % 360 - 180;
      const arrow = Math.abs(rel) < 22 ? '↑' : Math.abs(rel) > 158 ? '↓' : rel > 0 ? (rel < 68 ? '↖' : rel < 112 ? '←' : '↙') : (rel > -68 ? '↗' : rel > -112 ? '→' : '↘');
      txt = dist < 3 ? '🧭 Du är hemma' : `🧭 ${this.bed ? 'Sängen' : 'Startplatsen'}: ${Math.round(dist)} m åt ${dirs[Math.round(((ang % 360) + 360) % 360 / 45) % 8]} ${arrow}`;
    } else if (id === I.clock) {
      const t = this.tod * 24 + 6; const hh = Math.floor(t % 24), mm = Math.floor((t % 1) * 60);
      txt = `🕰 Klockan ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` + (this.isNight ? ' · natt' : '');
    }
    if (txt === this._infoTxt) return;
    this._infoTxt = txt;
    if (!this._infoEl) { const e = this._infoEl = document.createElement('div'); e.style.cssText = 'position:absolute;left:50%;bottom:96px;transform:translateX(-50%);padding:6px 12px;border-radius:10px;background:rgba(10,16,34,.72);color:#fff;font:600 14px Rubik,system-ui,sans-serif;pointer-events:none;white-space:nowrap;z-index:5'; (document.getElementById('hud') || document.body).appendChild(e); }
    this._infoEl.textContent = txt; this._infoEl.style.display = txt ? 'block' : 'none';
  }
  _shootBow() {
    const P = this.player, pow = Math.min(1, (this.bowT || 0) / 0.9);
    if (pow < 0.15) return;
    if (!this.creative && this.inv.count(I.arrow) <= 0) { this.toast('Du har inga pilar.'); this.audio.play('error'); return; }
    const eye = P.eye(new THREE.Vector3()), dir = P.lookDir(new THREE.Vector3());
    if (!this.creative) { this.inv.take(I.arrow, 1); if (this.inv.wearHeld(1)) this._broke(I.bow); }
    eye.addScaledVector(dir, 0.4);
    this.ents.shootArrow(eye, dir.multiplyScalar(12 + 22 * pow), 'player', 2 + 6 * pow * pow);
    this.hand.swing = 0.3; this._exh(0.1); this.tally('sh', 'bow');
  }
  /** Benmjöl: plantor växer direkt, gräs får blommor */
  _boneMeal(T) {
    const W = this.world, id = T.id;
    let ok = false;
    const cd = BLOCKS[id] && BLOCKS[id].crop;
    if (cd) {
      if (cd.stage >= cd.max) return false;
      W.set(T.x, T.y, T.z, id - cd.stage + cd.max, { noUpdate: true }); W.saplings.delete(T.x + ',' + T.y + ',' + T.z); ok = true;
      if (cd.kind === 'pumpkin' || cd.kind === 'melon') W.saplings.set(T.x + ',' + T.y + ',' + T.z, this.worldTime + CROP_T());
    } else if (id === B.reed) {
      let top = T.y; while (W.get(T.x, top + 1, T.z) === B.reed) top++;
      let h = 1; while (W.get(T.x, top - h, T.z) === B.reed) h++;
      if (h < 3 && W.get(T.x, top + 1, T.z) === 0) { W.set(T.x, top + 1, T.z, B.reed); ok = true; }
    } else if (isSapling(id)) {
      W.saplings.set(T.x + ',' + T.y + ',' + T.z, this.worldTime - 1); this._sapT = -1; this._tickSaplings(); ok = true;
    } else if (id === B.grass) {
      const fl = [B.tallgrass, B.tallgrass, B.tallgrass, B.fern, B.bluebell, B.buttercup, B.daisy, B.fireweed];
      for (let n = 0; n < 14; n++) {
        const x = T.x + (Math.random() * 7 | 0) - 3, z = T.z + (Math.random() * 7 | 0) - 3;
        for (let y = T.y + 1; y >= T.y - 1; y--) if (W.get(x, y, z) === B.grass && W.get(x, y + 1, z) === 0) { W.set(x, y + 1, z, fl[Math.random() * fl.length | 0]); ok = true; break; }
      }
    }
    if (!ok) return false;
    const c = new THREE.Color('#9cff7a');
    for (let i = 0; i < 12; i++) this.ents.particle(T.x + Math.random(), T.y + 0.6 + Math.random() * 0.8, T.z + Math.random(), 0, 0.8, 0, c, 0.07, 0.8, -0.1, true);
    if (!this.creative) this.inv.useHeld(1);
    this.tally('bm', 1); this.audio.play('power', { vol: 0.3 });
    return true;
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
      if (d.interact === 'chest') {
        const lt = this._openLoot(k, T.x, T.y, T.z);
        if (!W.chests.has(k)) W.chests.set(k, new Array(27).fill(null));
        this.openInventory('chest', { c: W.chests.get(k), key: k, title: lt ? LOOT_NAMES[lt] : (T.id === B.barrel ? 'Tunna' : undefined) });
        this.audio.play('select', { vol: 0.5, pitch: lt ? 1.1 : 0.6 }); if (lt) this.audio.play('pickup', { vol: 0.4, pitch: 0.7 });
        return true;
      }
      if (d.interact === 'smith') { this.openInventory('smith'); this.audio.play('select', { vol: 0.5, pitch: 0.8 }); return true; }
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
      if (d.interact === 'anvil') { this._anvil(inv.held); return true; }
      if (d.interact === 'lever') { this._lever(T); return true; }
      if (d.interact === 'trapdoor') { const t = d.trap; W.set(T.x, T.y, T.z, TRAP0 + t.f + (t.open ? 0 : 4), { noUpdate: true }); matSound(this.audio, 'wood', 'place', { vol: 0.8 }); return true; }
      if (d.interact === 'gate') { const q = d.gate; W.set(T.x, T.y, T.z, GATE0 + q.ax + (q.open ? 0 : 2), { noUpdate: true }); matSound(this.audio, 'wood', 'place', { vol: 0.8 }); return true; }
      if (d.interact === 'button') { this.circuits.press(T.x, T.y, T.z, 10); this.audio.play('click', { vol: 0.5 }); return true; }
      if (d.interact === 'repeater') { const n = this.circuits.cycleDelay(T.x, T.y, T.z); this.toast('Fördröjning: ' + n + (n === 1 ? ' steg' : ' steg') + ' (' + (n / 10).toFixed(1).replace('.', ',') + ' s)'); this.audio.play('click', { vol: 0.4, pitch: 0.8 + n * 0.1 }); this.circuits.markAround(T.x, T.y, T.z); return true; }
      if (d.interact === 'note') { const n = this.circuits.cycleNote(T.x, T.y, T.z); this.toast('Ton: ' + this.circuits.noteName(n)); return true; }
      if (d.interact === 'dispenser') { if (!W.chests.has(k)) W.chests.set(k, new Array(9).fill(null)); this.openInventory('chest', { c: W.chests.get(k), key: k, title: 'Utmatare' }); this.audio.play('select', { vol: 0.5, pitch: 0.6 }); return true; }
      if (d.interact === 'tnt' && inv.held && inv.held.id === B.torch) { this._ignite(T.x, T.y, T.z, 3); this.tally('tnt', 1); return true; }
    }
    const held = inv.held;
    if (!held) return false;
    let id = held.id;
    if (id === I.bone_meal) return pressed ? this._boneMeal(T) : false;
    if (id === I.glodkarna) { if (pressed && T.id === B.obsidian) this._ignitePortal(T); else if (pressed) this.toast('Använd Glödkärnan på en obsidianbåge (eldport).'); return pressed; }
    if (isHoe(id)) {
      if (!pressed) return false;
      if ((T.id === B.grass || T.id === B.dirt || T.id === B.snowgrass) && T.ny === 1 && W.get(T.x, T.y + 1, T.z) <= 0) {
        if (W.get(T.x, T.y + 1, T.z) < 0) return false;
        W.set(T.x, T.y, T.z, B.farmland); matSound(this.audio, 'dirt', 'place');
        if (!this.creative && this.inv.wearHeld(1)) this._broke(id);
        this.tally('hoe', 1); return true;
      }
      return false;
    }
    // vart?
    let tx = T.x + T.nx, ty = T.y + T.ny, tz = T.z + T.nz;
    if (BLOCKS[T.id].replace && !isWater(T.id)) { tx = T.x; ty = T.y; tz = T.z; }
    // platta på platta → helt block
    const fullOf = id === B.cobble_slab ? B.cobble : id === B.plank_slab ? B.spruce_planks : (isBlock(id) && BLOCKS[id] && BLOCKS[id].full) || 0;
    if (fullOf && T.id === id && T.ny === 1) {
      W.set(T.x, T.y, T.z, fullOf);
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
    let bd = BLOCKS[bid];
    if (isButton(bid)) {
      if (T.ny === -1) return false;
      bid = T.ny === 1 ? BUTTON0 + 4 : BUTTON0 + (T.nx === 1 ? 1 : T.nx === -1 ? 0 : T.nz === 1 ? 3 : 2);
    } else if (bd.wall !== undefined) {
      // stege och tavla fästs mot väggen man klickar på
      if (T.ny !== 0) return false;
      bid = bid - bd.wall + (T.nx === 1 ? 1 : T.nx === -1 ? 0 : T.nz === 1 ? 3 : 2);
    } else if (bd.stair !== undefined) bid = bid - bd.stair + f;
    else if (isTrap(bid)) bid = TRAP0 + (T.ny === 0 ? (T.nx === 1 ? 1 : T.nx === -1 ? 0 : T.nz === 1 ? 3 : 2) : this._look4());
    else if (isGate(bid)) bid = GATE0 + (this._look4() < 2 ? 1 : 0);
    else if (isRep(bid)) bid = REP0 + this._look4();
    else if (bd.piston) bid = (bd.piston.sticky ? STICKY0 : PISTON0) + (this._look6() ^ 1);
    else if (bd.disp !== undefined) bid = DISP0 + (this._look4() ^ 1);
    else if (bd.obs !== undefined) { const oi = DIR6.findIndex(([a, b, c]) => a === -T.nx && b === -T.ny && c === -T.nz); bid = OBS0 + (oi >= 0 ? oi : this._look6() ^ 1); }
    else if (bid === B.glass_pane && f % 2) bid = B.glass_pane_1;
    bd = BLOCKS[bid];
    if (bid === B.torch) {
      if (T.ny === -1) return false;
      if (T.ny === 0) bid = T.nx === 1 ? 37 : T.nx === -1 ? 36 : T.nz === 1 ? 39 : 38;
      else if (!T_SOLID[Math.max(0, W.get(tx, ty - 1, tz))]) return false;
    }
    if (bd.support && !T_SOLID[Math.max(0, W.get(tx, ty - 1, tz))]) return false;
    if (bd.model === M_CROSS) {
      const below = W.get(tx, ty - 1, tz);
      let okGround;
      if (bd.crop) okGround = below === B.farmland;
      else if (bid === B.reed) okGround = below === B.reed || ([B.grass, B.dirt, B.sand, B.peat].includes(below) && DIR4.some(([dx, dz]) => isWater(W.get(tx + dx, ty - 1, tz + dz))));
      else okGround = [B.grass, B.dirt, B.peat, B.snowgrass, B.sand, B.gravel].includes(below) || (bid === B.chanterelle && T_SOLID[Math.max(0, below)]);
      if (!okGround) return false;
    }
    if (T_SOLID[bid] && this._blocked(tx, ty, tz)) return false;
    W.set(tx, ty, tz, bid);
    if (isSapling(bid)) W.saplings.set(tx + ',' + ty + ',' + tz, this.worldTime + (0.6 + Math.random() * 1.2) / 1);
    if (bd.crop) W.saplings.set(tx + ',' + ty + ',' + tz, this.worldTime + CROP_T());
    if (bid === B.reed) W.saplings.set(tx + ',' + ty + ',' + tz, this.worldTime + 0.3 + Math.random() * 0.3);
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
    if (this.dim === 'muspel') { this.toast('Här finns ingen natt att sova bort – sängen fungerar inte i Muspelheim.'); this.audio.play('error', { vol: 0.4 }); return; }
    this.bed = [T.x + 0.5, T.y + 1, T.z + 0.5];
    if (!this.flags.bedMsg) { this.flags.bedMsg = true; }
    this.log('Återuppståndelsepunkt satt vid sängen.', 'good');
    if (!this.isNight) { this.toast('Du kan bara sova på natten.'); return; }
    if (this.ents.hostileNear(P.pos, 10)) { this.toast('Du kan inte sova – det finns fiender i närheten!'); this.audio.play('error'); return; }
    this.sleeping = 0.001;
    P.vel.set(0, 0, 0);
  }
  _onBlockChange(x, y, z, o, n) {
    if (this.circuits) this.circuits.onBlockChange(x, y, z, o, n);
    if ((o === B.obsidian || isPortal(o)) && n !== B.obsidian && !isPortal(n)) this._collapsePortal(x, y, z);
  }

  /* =====================================================================
   * Dimensioner, eldportar, strukturer, byte och handel
   * ===================================================================== */
  _createWorld(dim) {
    const w = new World({ scene: this.scene, mats: this.mats, seed: this.meta.seed, fancy: this.settings.get('fancyLeaves'), genVer: (this.meta.version || 1) >= 2 ? 2 : 1, dim });
    w.onBlockChange = (x, y, z, o, n) => this._onBlockChange(x, y, z, o, n);
    w.onFall = (x, y, z, id) => this.ents.fallBlock(x, y, z, id);
    w.onDrop = (x, y, z, id) => { if (!this.creative) this._dropsFor(id, x, y, z, null); };
    w.onChunkReady = (c, m) => this._onChunkReady(w, c, m);
    w.loot = new Map();
    w.radius = this.world ? this.world.radius : w.radius;
    this.worlds[dim] = w;
    return w;
  }
  _loadWorldState(w, src) {
    if (!src) return;
    if (src.furnaces) for (const [k, f] of src.furnaces) w.furnaces.set(k, f);
    if (src.chests) for (const [k, c] of src.chests) w.chests.set(k, c);
    if (src.saplings) for (const [k, t] of src.saplings) w.saplings.set(k, t);
  }
  /** Skapa (och läs in) en dimensions värld första gången den behövs */
  async _ensureWorld(dim) {
    if (this.worlds[dim]) return this.worlds[dim];
    const w = this._createWorld(dim);
    const prefix = 'kubvarld:w:' + this.id + (dim === 'muspel' ? ':m:' : ':c:');
    for (const k of await kv.keys(prefix)) {
      const arr = await kv.get(k); if (!arr) continue;
      const [cx, cz] = k.slice(prefix.length).split(',').map(Number);
      w.loadMods(ckey(cx, cz), arr instanceof Uint32Array ? arr : new Uint32Array(arr));
    }
    const src = dim === 'muspel' ? (this.meta.mus || {}) : this.meta;
    this._loadWorldState(w, src);
    const prev = this.world; this.world = w;
    this.circs[dim] = new Circuits(this, src.circ || []);
    this.world = prev;
    w.suspend();
    return w;
  }
  /** En chunk är klar: kretsar, kistor med byte och varelser från strukturer */
  _onChunkReady(w, c, m) {
    const circ = this.circs[w.dim]; if (circ) circ.onChunkReady(c, m);
    const ex = c.extra; if (!ex) return;
    for (const [x, y, z, table, o] of ex.loot) { const k = x + ',' + y + ',' + z; if (!w.chests.has(k)) w.loot.set(k, [table, o]); }
    for (const [type, x, y, z, o] of ex.ents) {
      const key = w.dim + ':' + type + ':' + Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z);
      if (!this.markers.has(key)) this.markers.set(key, { dim: w.dim, type, x, y, z, o: o || {}, key });
    }
  }
  /** Fyll en strukturkista med sitt seedade byte (första gången den öppnas eller går sönder) */
  _openLoot(k, x, y, z) {
    const W = this.world, L = W.loot.get(k);
    if (!L || W.chests.has(k)) return null;
    W.loot.delete(k);
    const slots = rollLoot(this.meta.seed + (W.dim === 'muspel' ? 7 : 0), L[0], x, y, z, L[1]);
    W.chests.set(k, slots);
    this.tally('loot', 1); this.tally('lootT', L[0]);
    return L[0];
  }
  _markerTick() {
    const P = this.player, W = this.world;
    for (const mk of this.markers.values()) {
      if (mk.dim !== this.dim || this.spawned.has(mk.key)) continue;
      if (Math.abs(mk.x - P.pos.x) > 64 || Math.abs(mk.z - P.pos.z) > 64 || !W.isLoaded(Math.floor(mk.x), Math.floor(mk.z))) continue;
      if (mk.type === 'eldjatte' && this.flags.bosses[mk.o.key]) continue;
      this.spawned.add(mk.key);
      if (mk.type === 'askvandrare') { for (let k = 0; k < (mk.o.n || 3); k++) this.ents.spawnMob('askvandrare', mk.x + (k % 2) * 0.9 - 0.4, mk.y, mk.z + (k >> 1) * 0.9 - 0.4); continue; }
      this.ents.spawnMob(mk.type, mk.x, mk.y, mk.z, { prof: mk.o.prof, home: mk.o.home, c: mk.o.c, key: mk.o.key, marker: mk.key });
    }
  }
  onMobRemoved(m) { if (m.marker && !m.dead) this.spawned.delete(m.marker); }
  onMobKilled(m, byPlayer) {
    if (m.def.boss && m.key) { this.flags.bosses[m.key] = 1; if (byPlayer) { this.log('Eldjätten har fallit! Skattkammaren under borgen är din.', 'good'); this.audio.play('victory', { vol: 0.6 }); } }
    if (m.def.villager && byPlayer) this.log('En bybo dog… Byborna kommer att minnas det.', 'bad');
  }
  /** Upptäck strukturer i närheten (för prestationer och meddelanden) */
  _discover() {
    const P = this.player, G = this.world.gen; if (!G.structuresNear) return;
    for (const { s, d } of G.structuresNear(P.pos.x, P.pos.z, 70)) {
      let hit = false;
      if (s.kind === 'mine') hit = (d < s.r && P.pos.y < s.y + 8 && P.pos.y > s.y - 3) || (Math.hypot(P.pos.x - s.x - 3, P.pos.z - s.z - 3) < 7 && Math.abs(P.pos.y - s.surf) < 6);
      else if (s.kind === 'village') hit = d < 38;
      else if (s.kind === 'fortress') hit = d < 40 && Math.abs(P.pos.y - s.y) < 22;
      else hit = d < s.r && Math.abs(P.pos.y - s.y) < 14;
      if (hit && !this.flags.seen[s.id]) { this.flags.seen[s.id] = 1; this.tally('found', s.kind); this.log(FOUND_MSG[s.kind] || 'Du har hittat något!', 'good'); this.audio.play('select', { vol: 0.5, pitch: 1.2 }); }
      if (s.kind === 'fortress' && !this.flags.seen[s.id + ':t'] && Math.abs(P.pos.x - s.x) <= 6 && Math.abs(P.pos.z - s.z) <= 6 && P.pos.y > s.y - 7.5 && P.pos.y < s.y - 0.5) {
        this.flags.seen[s.id + ':t'] = 1; this.tally('found', 'treasure'); this.log(FOUND_MSG.treasure, 'good'); this.audio.play('levelup', { vol: 0.5 });
      }
    }
  }
  /** Närmaste struktur för en karta (eller F3). Returnerar { s, d } eller null */
  nearestStructure(kinds, unseen = true, minD = 0) {
    const G = this.world.gen, P = this.player; if (!G.structuresNear) return null;
    const list = G.structuresNear(P.pos.x, P.pos.z, this.dim === 'muspel' ? 700 : 2200, kinds);
    return list.find(e => e.d >= minD && (!unseen || !this.flags.seen[e.s.id])) || list.find(e => e.d >= minD) || null;
  }
  _dirText(dx, dz) {
    const P = this.player, ang = Math.atan2(dx, -dz) * 180 / Math.PI, dirs = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'];
    const rel = (((Math.atan2(-dx, -dz) - P.yaw) * 180 / Math.PI) % 360 + 540) % 360 - 180;
    const arrow = Math.abs(rel) < 22 ? '↑' : Math.abs(rel) > 158 ? '↓' : rel > 0 ? (rel < 68 ? '↖' : rel < 112 ? '←' : '↙') : (rel > -68 ? '↗' : rel > -112 ? '→' : '↘');
    return `${Math.round(Math.hypot(dx, dz))} m åt ${dirs[Math.round(((ang % 360) + 360) % 360 / 45) % 8]} ${arrow}`;
  }
  _mapText(id) {
    if ((this._mapT = (this._mapT || 0) - 1) > 0 && this._mapId === id) return this._mapCache;
    this._mapT = 30; this._mapId = id;
    let txt;
    if (id === I.map_fort) {
      if (this.dim !== 'muspel') txt = '🗺 Eldkartan visar Muspelheims glödande salar – här är den tom.';
      else { const n = this.nearestStructure(['fortress']); txt = n ? '🗺 Surts borg: ' + this._dirText(n.s.x - this.player.pos.x, n.s.z - this.player.pos.z) : '🗺 Ingen borg i närheten.'; }
    } else if (this.dim !== 'over') txt = '🗺 Kartan är tom här – den visar den vanliga världen.';
    else if (id === I.map_village) { const n = this.nearestStructure(['village'], false, 30); txt = n ? '🗺 By: ' + this._dirText(n.s.x - this.player.pos.x, n.s.z - this.player.pos.z) : '🗺 Inga byar inom räckhåll.'; }
    else { const n = this.nearestStructure(['ruin', 'temple', 'wreck', 'tower', 'cabin', 'portal', 'mine']); txt = n ? `🗺 ${KIND_NAME[n.s.kind]}: ` + this._dirText(n.s.x - this.player.pos.x, n.s.z - this.player.pos.z) : '🗺 Inget okänt inom räckhåll.'; }
    this._mapCache = txt;
    return txt;
  }
  /** Handla med en bybo. Returnerar true om bytet gick igenom. */
  trade(o) {
    const inv = this.inv;
    if (!o.give.every(([id, n]) => inv.count(id) >= n)) { this.audio.play('error', { vol: 0.5 }); return false; }
    for (const [id, n] of o.give) inv.take(id, n);
    const [gid, gn] = o.get;
    const left = inv.add(gid, gn); if (left) this.throwItem({ id: gid, n: left, d: 0 });
    this.tally('trade', 1); this.tally('buy', gid); this.onPickup(gid, gn);
    this.audio.play('pickup', { vol: 0.6, pitch: 1.1 });
    const m = this.ui.ctx && this.ui.ctx.mob; if (m) this.ents.puff(m.pos.x, m.pos.y + 1.8, m.pos.z, '#3ad47a', 6, 0.4, true);
    return true;
  }
  openTrade(m) {
    const offers = (TRADES[m.prof] || TRADES.bonde).map(([give, get]) => ({ give, get }));
    m.trading = true;
    this.openInventory('trade', { mob: m, prof: m.prof, offers });
    this.audio.play('select', { vol: 0.5, pitch: 1.3 });
    if (!this.flags.tradeTip) { this.flags.tradeTip = true; this.toast('Byborna tar betalt i smaragder – och betalar med smaragder för dina varor.'); }
  }
  onSmith(id) { this.tally('smith', 1); this.tally('c', id); this.audio.play('levelup', { vol: 0.45 }); matSound(this.audio, 'metal', 'break', { vol: 1.2 }); this.log(itemName(id) + ' – smidd i surtstål!', 'good'); }

  /* ---------- eldportar ---------- */
  _portalCells(ox, oy, oz, axis, list) { const ax = axis ? 0 : 1, az = axis ? 1 : 0; return list.map(([du, dy]) => [ox + ax * du, oy + dy, oz + az * du]); }
  /** Glödkärnan används på obsidian: hitta en hel båge och tänd den */
  _ignitePortal(T) {
    const W = this.world;
    for (let axis = 0; axis < 2; axis++) for (const [fu, fy] of PORTAL_FRAME) {
      const ax = axis ? 0 : 1, az = axis ? 1 : 0;
      const ox = T.x - ax * fu, oy = T.y - fy, oz = T.z - az * fu;
      const frame = this._portalCells(ox, oy, oz, axis, PORTAL_FRAME), inner = this._portalCells(ox, oy, oz, axis, PORTAL_INNER);
      if (!frame.every(([x, y, z]) => W.get(x, y, z) === B.obsidian)) continue;
      if (!inner.every(([x, y, z]) => { const b = W.get(x, y, z); return b === 0 || (b > 0 && BLOCKS[b].replace && !isWater(b)); })) continue;
      this._fillPortal(W, ox, oy, oz, axis);
      if (!this.creative) this.inv.useHeld(1);
      this.tally('portal', 1);
      this.log('Eldporten flammar upp! Stå i elden en stund för att resa.', 'good');
      return true;
    }
    this.toast('Bygg först en båge av 12 obsidian: 3 i botten, 3 upp på var sida, två axlar och en slutsten överst – öppningen är 3 bred.');
    this.audio.play('error', { vol: 0.5 });
    return false;
  }
  _fillPortal(W, ox, oy, oz, axis) {
    const id = axis ? B.portal_z : B.portal_x;
    for (const [x, y, z] of this._portalCells(ox, oy, oz, axis, PORTAL_INNER)) W.set(x, y, z, id, { noUpdate: true });
    const list = this.portals[W.dim] || (this.portals[W.dim] = []);
    if (!list.some(p => p[0] === ox && p[1] === oy && p[2] === oz)) list.push([ox, oy, oz, axis]);
    this.audio.play('power', { vol: 0.6, pitch: 0.6 }); this.audio.noise({ dur: 1.2, vol: 0.15, freq: 300, type: 'lowpass', to: 900 });
    const c = new THREE.Color('#ff8a30');
    const [mx, , mz] = this._portalCells(ox, oy, oz, axis, [[1, 2]])[0];
    for (let i = 0; i < 40; i++) this.ents.particle(mx + Math.random(), oy + 1 + Math.random() * 4, mz + Math.random(), (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, c, 0.12, 1, -0.3, true);
  }
  _buildPortal(W, ox, oy, oz, axis) {
    const ax = axis ? 0 : 1, az = axis ? 1 : 0, px = az, pz = ax;
    // fri plats och en liten plattform framför och bakom
    for (let du = -2; du <= 4; du++) for (let p = -2; p <= 2; p++) {
      const x = ox + ax * du + px * p, z = oz + az * du + pz * p;
      for (let dy = 1; dy <= 6; dy++) W.set(x, oy + dy, z, 0, { noUpdate: true });
      const f = W.get(x, oy, z); if (f <= 0 || !T_SOLID[f] || isLava(f)) W.set(x, oy, z, W.dim === 'muspel' ? B.basalt_bricks : B.cobble, { noUpdate: true });
    }
    for (const [x, y, z] of this._portalCells(ox, oy, oz, axis, PORTAL_FRAME)) W.set(x, y, z, B.obsidian, { noUpdate: true });
    this._fillPortal(W, ox, oy, oz, axis);
  }
  /** Ramen eller portalen ändrades: släck portalblock som inte längre sitter i en hel båge */
  _collapsePortal(x, y, z) {
    if (this._collapsing) return; this._collapsing = true;
    const W = this.world, seen = new Set(), q = [];
    for (const [dx, dy, dz] of DIR6) { const nx = x + dx, ny = y + dy, nz = z + dz; if (isPortal(W.get(nx, ny, nz))) q.push([nx, ny, nz]); }
    while (q.length && seen.size < 40) {
      const [a, b, c] = q.pop(), k = a + ',' + b + ',' + c; if (seen.has(k)) continue; seen.add(k);
      W.set(a, b, c, 0, { noUpdate: true }); this.ents.puff(a + 0.5, b + 0.3, c + 0.5, '#ff8a30', 3, 0.6, true);
      for (const [dx, dy, dz] of DIR6) if (isPortal(W.get(a + dx, b + dy, c + dz))) q.push([a + dx, b + dy, c + dz]);
    }
    if (seen.size) { this.audio.noise({ dur: 0.6, vol: 0.15, freq: 900, type: 'lowpass', to: 200 }); this.portals[this.dim] = (this.portals[this.dim] || []).filter(p => { const b = W.get(...this._portalCells(p[0], p[1], p[2], p[3], [[1, 1]])[0]); return b < 0 || isPortal(b); }); }
    this._collapsing = false;
  }
  _inPortal() {
    const P = this.player, W = this.world, x = Math.floor(P.pos.x), z = Math.floor(P.pos.z);
    return isPortal(W.get(x, Math.floor(P.pos.y + 0.2), z)) || isPortal(W.get(x, Math.floor(P.pos.y + 1.2), z));
  }
  _portalTick(dt) {
    const inP = this.player.alive && this._inPortal();
    if (!inP) { this.portalCd = false; this.portalT = Math.max(0, this.portalT - dt * 2); }
    else if (!this.portalCd) {
      if (this.portalT === 0) { this.audio.noise({ dur: 2.4, vol: 0.12, freq: 200, type: 'lowpass', to: 1400 }); this.audio.tone({ freq: 90, to: 260, dur: 2.4, vol: 0.06, type: 'sawtooth' }); }
      this.portalT += dt;
      if (Math.random() < dt * 30) { const P = this.player; this.ents.particle(P.pos.x + (Math.random() - 0.5), P.pos.y + Math.random() * 2, P.pos.z + (Math.random() - 0.5), 0, 1.5, 0, new THREE.Color('#ffa040'), 0.08, 0.6, -0.3, true); }
      if (this.portalT >= (this.creative ? 1 : PORTAL_TIME)) { this.portalT = 0; this._travel(); }
    }
    const o = Math.min(1, this.portalT / PORTAL_TIME);
    if (this._portalEl && Math.abs(o - (this._portalO || 0)) > 0.01) { this._portalO = o; this._portalEl.style.opacity = o.toFixed(2); }
  }
  /** Res genom eldporten till den andra dimensionen (koordinatskala 1:8) */
  async _travel() {
    const P = this.player, to = this.dim === 'over' ? 'muspel' : 'over';
    const tx = to === 'muspel' ? P.pos.x / MUSPEL_SCALE : P.pos.x * MUSPEL_SCALE, tz = to === 'muspel' ? P.pos.z / MUSPEL_SCALE : P.pos.z * MUSPEL_SCALE;
    await this._switchDim(to, tx, tz, W => this._arrivePortal(W, tx, tz));
    this.tally('dim', to);
    this.log(to === 'muspel' ? 'Du kliver ut i Muspelheim. Hettan slår emot dig…' : 'Du är tillbaka i den vanliga världen.', to === 'muspel' ? 'bad' : 'good');
  }
  /** Byt dimension med laddskärm. place(W) returnerar [x, y, z] för spelarens fötter när chunkarna finns. */
  async _switchDim(to, tx, tz, place) {
    if (this._traveling) return; this._traveling = true;
    const loadEl = document.getElementById('loading'), ls = loadingScreen(loadEl);
    document.getElementById('loadTitle').textContent = to === 'muspel' ? 'Genom elden…' : 'Hemåt…';
    show('loading'); ls.set(0.05, to === 'muspel' ? 'Reser till Muspelheim…' : 'Reser till den vanliga världen…');
    try {
      if (this.ui.open) this.ui.close();
      await this.save();
      this.ready = false;
      this._endFish(); this.mine = null; this.crack.visible = false;
      const old = this.world;
      const W = await this._ensureWorld(to);
      old.suspend(); this.ents.clearAll(); this.spawned.clear(); this.spouts.length = 0;
      W.resume(); W.radius = old.radius;
      this.world = W; this.circuits = this.circs[to]; this.dim = to; this.sky.setDim(to);
      if (this._disposed) return;
      const P = this.player;
      P.pos.set(tx, 70, tz); P.vel.set(0, 0, 0); P.fallY = null;
      const wait = async (x, z, f0, f1, label) => {
        const t0 = performance.now();
        for (; ;) {
          W.update(x, z, 0.016);
          const r = W.readyAround(x, z, 2);
          ls.set(f0 + (f1 - f0) * r.ok / r.need, label + ' ' + Math.round(r.ok / r.need * 100) + ' %');
          if (r.ok >= r.need || performance.now() - t0 > 20000 || this._disposed) break;
          await new Promise(res => setTimeout(res, 16));
        }
      };
      await wait(tx, tz, 0.1, 0.8, to === 'muspel' ? 'Muspelheim glöder fram…' : 'Världen tar form…');
      if (this._disposed) return;
      const pos = place(W);
      P.pos.set(pos[0], pos[1], pos[2]);
      if (Math.hypot(pos[0] - tx, pos[2] - tz) > 20) await wait(pos[0], pos[2], 0.8, 1, 'Nästan framme…');
      this._unstuck();
      this.portalCd = true; this.portalT = 0;
      this._lastPos.copy(P.pos);
      this.musicT = 0; this.curMusic = null;
    } catch (e) { console.warn('Dimensionsbyte misslyckades', e); }
    ls.done();
    this.ready = true; this._traveling = false;
  }
  /** Hitta en registrerad portal nära målet, annars bygg en ny */
  _arrivePortal(W, tx, tz) {
    const list = this.portals[W.dim] || (this.portals[W.dim] = []);
    const R = W.dim === 'muspel' ? 32 : 200;
    let best = null, bd = R;
    for (const p of list) {
      const [cx, cy, cz] = this._portalCells(p[0], p[1], p[2], p[3], [[1, 1]])[0];
      const d = Math.hypot(cx - tx, cz - tz); if (d >= bd) continue;
      if (!W.isLoaded(cx, cz)) continue;
      if (!isPortal(W.get(cx, cy, cz))) continue;
      best = p; bd = d;
    }
    if (!best) {
      const sp = this._findPortalSpot(W, Math.floor(tx), Math.floor(tz));
      this._buildPortal(W, sp[0], sp[1], sp[2], sp[3]);
      best = sp;
    }
    const [cx, cy, cz] = this._portalCells(best[0], best[1], best[2], best[3], [[1, 1]])[0];
    return [cx + 0.5, cy, cz + 0.5];
  }
  _findPortalSpot(W, tx, tz) {
    const mus = W.dim === 'muspel';
    const solid = b => b > 0 && T_SOLID[b] && !isLava(b) && !isPortal(b) && BLOCKS[b].model === 1;
    const air = b => b === 0 || (b > 0 && BLOCKS[b].replace && !isWater(b) && !isLava(b));
    const fits = (x, y, z, axis) => {
      const ax = axis ? 0 : 1, az = axis ? 1 : 0, px = az, pz = ax;
      for (let du = -1; du <= 3; du++) {
        const bx = x + ax * du, bz = z + az * du;
        if (!solid(W.get(bx, y, bz))) return false;
        for (let dy = 1; dy <= 6; dy++) if (!air(W.get(bx, y + dy, bz))) return false;
        for (const p of [-1, 1]) { if (!air(W.get(bx + px * p, y + 1, bz + pz * p)) || !air(W.get(bx + px * p, y + 2, bz + pz * p))) return false; }
      }
      return true;
    };
    for (let r = 0; r <= 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = tx + dx, z = tz + dz;
      if (!W.isLoaded(x, z)) continue;
      if (mus) { for (let y = 96; y > 33; y--) { if (solid(W.get(x, y, z)) && air(W.get(x, y + 1, z))) { for (let axis = 0; axis < 2; axis++) if (fits(x, y, z, axis)) return [x, y, z, axis]; } } }
      else { const y = W.topY(x, z); if (y > SEA - 1 && !isWater(W.get(x, y + 1, z))) for (let axis = 0; axis < 2; axis++) if (fits(x, y, z, axis)) return [x, y, z, axis]; }
    }
    // ingen bra plats: bygg en plattform
    const y = mus ? 50 : Math.max(SEA + 1, W.topY(tx, tz));
    return [tx, y, tz, 0];
  }

  /* ---------- eldsprutare (fälla) ---------- */
  fireSpout(x, y, z) {
    this.spouts.push({ x, y, z, t: 1.8, hit: 0 });
    const d = this.player.pos.distanceTo(this._tmp.set(x + 0.5, y + 1, z + 0.5));
    this.audio.noise({ dur: 1.2, vol: 0.25 * Math.max(0.1, 1 - d / 24), freq: 700, type: 'bandpass', to: 300 });
  }
  _tickSpouts(dt) {
    const P = this.player;
    for (let i = this.spouts.length - 1; i >= 0; i--) {
      const s = this.spouts[i]; s.t -= dt; s.hit -= dt;
      for (let k = 0; k < 4; k++) this.ents.particle(s.x + 0.2 + Math.random() * 0.6, s.y + 1.05, s.z + 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 5 + Math.random() * 3, (Math.random() - 0.5) * 1.2, new THREE.Color(Math.random() < 0.5 ? '#ff7a20' : '#ffc040'), 0.16, 0.5, -0.2, true);
      if (s.hit <= 0 && P.alive && Math.abs(P.pos.x - s.x - 0.5) < 1.1 && Math.abs(P.pos.z - s.z - 0.5) < 1.1 && P.pos.y > s.y + 0.5 && P.pos.y < s.y + 3.5) {
        s.hit = 0.8; if (!(P.fireRes > 0)) { this.damagePlayer(1.5, null, 0, 'eld', true); P.burnT = Math.max(P.burnT || 0, 2); }
      }
      if (s.t <= 0) this.spouts.splice(i, 1);
    }
  }
  /* ---------- HUD-tillägg: portalglöd, väktarmätare, brand ---------- */
  _mkOverlay() {
    const hud = document.getElementById('hud');
    const mk = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; hud.appendChild(e); return e; };
    this._portalEl = mk('kv-portal'); this._burnEl = mk('kv-burn');
    this._bossEl = mk('kv-boss', '<span>Eldjätten – borgens väktare</span><div class="bar"><i></i></div>'); this._bossEl.style.display = 'none';
  }
  _hudExtras(dt) {
    const P = this.player;
    const boss = this.ents.mobs.find(m => m.def.boss && !m.dead && m.pos.distanceTo(P.pos) < 36);
    if (!!boss !== !!this._bossShown) { this._bossShown = !!boss; this._bossEl.style.display = boss ? '' : 'none'; }
    if (boss) { const f = Math.max(0, boss.hp / (boss.def.hp * this.diffHp())); if (Math.abs(f - (this._bossF || 0)) > 0.005) { this._bossF = f; this._bossEl.querySelector('i').style.transform = `scaleX(${f.toFixed(3)})`; } }
    const burn = (P.burnT > 0 && P.alive) ? 1 : 0;
    if (burn !== this._burnO) { this._burnO = burn; this._burnEl.style.opacity = burn; }
    if (P.fireRes > 0) P.fireRes -= dt;
  }
  /** Muspelheim: glöd som stiger, aska som faller, mullrande lava */
  _muspelFx(dt) {
    const P = this.player;
    if (Math.random() < dt * 14) {
      const x = P.pos.x + (Math.random() - 0.5) * 24, z = P.pos.z + (Math.random() - 0.5) * 24, y = P.pos.y + (Math.random() - 0.3) * 10;
      if (this.world.get(Math.floor(x), Math.floor(y), Math.floor(z)) === 0) this.ents.particle(x, y, z, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, new THREE.Color(Math.random() < 0.3 ? '#ffc060' : Math.random() < 0.5 ? '#ff6a20' : '#6a5a54'), 0.05 + Math.random() * 0.04, 3 + Math.random() * 2, -0.02, true);
    }
    this._rumbleT = (this._rumbleT ?? 3) - dt;
    if (this._rumbleT <= 0) {
      this._rumbleT = 3 + Math.random() * 7;
      try { if (Math.random() < 0.6) this.audio.noise({ dur: 0.18, vol: 0.06, freq: 260 + Math.random() * 200, type: 'lowpass' }); else this.audio.tone({ freq: 48 + Math.random() * 12, to: 36, dur: 2.2, vol: 0.05, type: 'sine' }); } catch (e) { }
    }
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
    // sköld: parera attacker framifrån
    if (P.blocking && dir && source !== 'fall' && source !== 'lava') {
      const lx = -Math.sin(P.yaw), lz = -Math.cos(P.yaw), dl = Math.hypot(dir.x, dir.z) || 1;
      if (-(dir.x * lx + dir.z * lz) / dl > 0.3) {
        P.vel.x += dir.x * kb * 0.25; P.vel.z += dir.z * kb * 0.25;
        matSound(this.audio, 'metal', 'hit', { vol: 1.2 }); this.audio.play('hit', { vol: 0.4, pitch: 0.6 });
        const sh = this.inv.held && ITEMS[this.inv.held.id] && ITEMS[this.inv.held.id].shield ? this.inv.held : this.inv.off;
        if (sh && !this.creative) { sh.d = (sh.d || 0) + Math.max(1, Math.round(amount)); const t = toolOf(sh.id); if (t && sh.d >= t.dur) { if (sh === this.inv.off) this.inv.off = null; else this.inv.slots[this.inv.sel] = null; this._broke(sh.id); } this.inv.changed(); }
        this.tally('block', 1); this.hand.blockHit = 1;
        return 'blocked';
      }
    }
    if (source !== 'fall' && source !== 'svält' && source !== 'drunkning') amount = this._armorReduce(amount);
    if ((source === 'lava' || source === 'eld') && this.inv.armor.some(s => s && s.id >= SURT_ARMOR0 && s.id < SURT_ARMOR0 + 4)) amount *= 1 - 0.15 * this.inv.armor.filter(s => s && s.id >= SURT_ARMOR0 && s.id < SURT_ARMOR0 + 4).length;
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
    if (dmg > 0 && !isWater(below) && !isBed(below)) { this.damagePlayer(dmg, null, 0, 'fall', true); this.audio.play('land'); if (dist >= 15 && P.alive) this.tally('bigfall', 1); }
  }
  /** Plask när spelaren går/faller i vatten */
  _splash(v) {
    const P = this.player;
    if (v < 1.5 && this.time - (this._splashT || -9) < 1) return;
    this._splashT = this.time;
    const n = Math.min(26, 6 + v * 2.5);
    for (let i = 0; i < n; i++) this.ents.particle(P.pos.x + (Math.random() - 0.5) * 0.8, P.pos.y + 0.6, P.pos.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3, 2 + Math.random() * (2 + v * 0.4), (Math.random() - 0.5) * 3, SPLASH, 0.07 + Math.random() * 0.06, 0.6 + Math.random() * 0.4, 1, false);
    matSound(this.audio, 'water', 'break', { vol: Math.min(1.6, 0.5 + v * 0.12) });
  }
  /** Dämpat ljud under ytan: lågpassfilter mellan ljudbussarna och huvudvolymen */
  _underwaterAudio(on) {
    const a = this.audio; if (!a.ctx || !a.sfxBus) return;
    if (!a._kvLP) {
      try {
        const f = a.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0.7;
        a.sfxBus.disconnect(); a.musicBus.disconnect(); a.sfxBus.connect(f); a.musicBus.connect(f); f.connect(a.master);
        a._kvLP = f;
      } catch (e) { a._kvLP = { frequency: { setTargetAtTime() { } } }; }
    }
    if (on === this._uwOn) return; this._uwOn = on;
    a._kvLP.frequency.setTargetAtTime(on ? 650 : 20000, a.ctx.currentTime, 0.08);
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
    for (let i = 0; i < 4; i++) { const s = this.inv.armor[i]; if (s) { this.ents.drop(s.id, 1, P.pos.x, P.pos.y + 1, P.pos.z, s.d, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6)); this.inv.armor[i] = null; } }
    if (this.inv.off) { const s = this.inv.off; this.ents.drop(s.id, s.n, P.pos.x, P.pos.y + 1, P.pos.z, s.d, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6)); this.inv.off = null; }
    for (let i = 0; i < 36; i++) { const s = this.inv.slots[i]; if (s) { this.ents.drop(s.id, s.n, P.pos.x, P.pos.y + 1, P.pos.z, s.d, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6)); this.inv.slots[i] = null; } }
    this.inv.changed();
    this.audio.play('lose', { vol: 0.7 });
    const MD = MOBS[source];
    const reason = { fall: 'Du föll för hårt.', 'drunkning': 'Du drunknade.', 'svält': 'Du svalt ihjäl.', arrow: 'Du sköts ihjäl av ett skelett.', tnt: 'Du sprängdes i luften.', lava: 'Du brann upp i lavan.', eld: 'Du brann upp.' }[source] || (MD ? `Du besegrades av ${MD.art} ${MD.name.toLowerCase()}.` : source ? `Du besegrades av ${String(source).toLowerCase()}.` : 'Du dog.');
    this.app.showDeath({ reason, days, score, best: res.best, isNew: res.isNew });
    this.save();
  }
  respawn() {
    const P = this.player;
    if (this.dim !== 'over') {
      // dör man i Muspelheim vaknar man hemma
      P.health = 20; P.food = 20; P.sat = 5; P.air = 15; P.alive = true; P.fallY = null; P.exh = 0; P.burnT = 0;
      this.stats.lifeStartDay = Math.floor(this.worldTime); this.stats.lifeEdits = 0; this.lifeScoreSubmitted = false;
      const sp = this.bed || this.spawn;
      this._switchDim('over', sp[0], sp[2], () => [sp[0], sp[1], sp[2]]).then(() => this.log('Du vaknar hemma igen. Var försiktig!'));
      return;
    }
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
  /** Ny figur sparad i Min figur – byt utseende direkt */
  setSkin(skin) { this.player.setSkin(skin); this.customSkin = true; }
  onPickup(id, n) { this.tally('p', id, n); }
  onCrafted(id, n) { this.tally('c', id, n); this.audio.play('select', { vol: 0.4 }); }
  onKill(type) { this.tally('k', type); }
  /* ---------- räknare (för prestationer) ---------- */
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
      const cd = BLOCKS[id] && BLOCKS[id].crop;
      if (cd) {
        const fruit = cd.kind === 'pumpkin' || cd.kind === 'melon';
        if (cd.stage < cd.max && W.get(x, y - 1, z) === B.farmland) { W.set(x, y, z, id + 1, { noUpdate: true }); if (cd.stage + 1 < cd.max || fruit) W.saplings.set(k, this.worldTime + CROP_T()); }
        else if (fruit && cd.stage === cd.max) { this._growFruit(x, y, z, cd.kind === 'pumpkin' ? B.pumpkin : B.melon); W.saplings.set(k, this.worldTime + CROP_T() * 1.5); }
        continue;
      }
      if (id === B.reed) {
        let h = 1; while (h < 4 && W.get(x, y - h, z) === B.reed) h++;
        if (h < 3 && W.get(x, y + 1, z) === 0) { W.set(x, y + 1, z, B.reed, { noUpdate: true }); W.saplings.set(x + ',' + (y + 1) + ',' + z, this.worldTime + 0.4 + Math.random() * 0.3); }
        continue;
      }
      if (!isSapling(id)) continue;
      // plats?
      let free = true;
      for (let dy = 1; dy < 8 && free; dy++) { const b = W.get(x, y + dy, z); if (b !== 0 && !isLeaf(b)) free = false; }
      if (!free) { W.saplings.set(k, this.worldTime + 0.3); continue; }
      W.set(x, y, z, 0, { noUpdate: true });
      const type = id === B.spruce_sapling ? 'spruce' : id === B.birch_sapling ? 'birch' : id === B.oak_sapling ? 'oak' : 'pine';
      const r = mulberry((x * 73 + z * 31 + y) >>> 0);
      placeTree((bx, by, bz, bid, force) => { const c = W.get(bx, by, bz); if (c === 0 || (c > 0 && BLOCKS[c].replace && !isWater(c)) || (force && isLeaf(c))) W.set(bx, by, bz, bid, { noUpdate: true }); }, type, x, y, z, r);
      if (this.player.pos.distanceTo(this._tmp.set(x, y, z)) < 24) this.log('En planta har vuxit till ett träd.', 'good');
    }
  }
  /** Mogen stjälk: sätt en pumpa/melon bredvid (om det inte redan finns en) */
  _growFruit(x, y, z, fruit) {
    const W = this.world;
    if (DIR4.some(([dx, dz]) => { const b = W.get(x + dx, y, z + dz); return b === B.pumpkin || b === B.melon; })) return;
    const [dx, dz] = DIR4[Math.random() * 4 | 0], b = W.get(x + dx, y, z + dz), below = W.get(x + dx, y - 1, z + dz);
    if (!(b === 0 || (b > 0 && BLOCKS[b].replace && !isWater(b)))) return;
    if (![B.grass, B.dirt, B.farmland, B.snowgrass].includes(below)) return;
    W.set(x + dx, y, z + dz, fruit);
    this.tally('fruit', 1);
    if (this.player.pos.distanceTo(this._tmp.set(x, y, z)) < 24) this.log((fruit === B.pumpkin ? 'En pumpa' : 'En melon') + ' har vuxit fram.', 'good');
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
    const bio = this.dim === 'muspel' ? 'Muspelheim' : c && c.biomes ? BIOMES[c.biomes[((z & 15) << 4) | (x & 15)]] : '?';
    const ns = this.nearestStructure(null, false);
    const L = W.light(x, y + 1, z);
    let loaded = 0, meshed = 0; for (const ch of W.chunks.values()) { if (ch.data) loaded++; if (ch.meshed) meshed++; }
    const t = this.tod * 24 + 6; const hh = Math.floor(t % 24), mm = Math.floor((t % 1) * 60);
    const info = this.app.renderer.info;
    document.getElementById('debug').textContent =
      `Kubvärld · ${this.app.loop.fps} FPS · uppd ${this.app.perf.upd.toFixed(1)} ms · rit ${this.app.perf.ren.toFixed(1)} ms\n` +
      `XYZ: ${P.pos.x.toFixed(1)} / ${P.pos.y.toFixed(1)} / ${P.pos.z.toFixed(1)}  Chunk: ${x >> 4}, ${z >> 4}\n` +
      `Biom: ${bio}  Ljus: himmel ${L >> 4} block ${L & 15}  Dimension: ${this.dim}\n` +
      `Närmaste struktur: ${ns ? KIND_NAME[ns.s.kind] + ' ' + Math.round(ns.d) + ' m (' + ns.s.x + ', ' + ns.s.y + ', ' + ns.s.z + ')' : '–'}\n` +
      `Dag ${this.day}  Klockan ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}\n` +
      `Chunkar: ${loaded} laddade, ${meshed} meshade, radie ${W.radius}  Frö: ${this.meta.seed}\n` +
      `Varelser: ${this.ents.mobs.length}${this.ents.mobs.length ? ' (' + this.ents.census() + ')' : ''}\n` +
      `Föremål: ${this.ents.drops.length}  Ritanrop: ${info.render.calls}  Trianglar: ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `Kretsar: ${this.circuits.stats.ms.toFixed(2)} ms/steg · ${this.circuits.level.size} ledningar\n` +
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
      if (!first && !this.creative && this.player.alive && this.dim === 'over') {
        if (night) { this.log('Natten faller – akta dig för zombier, skelett och spindlar!', 'bad'); this.audio.play('countdown', { vol: 0.4, pitch: 0.6 }); }
        else if (!slept && wasNight) { this.log(`Du överlevde natten! Dag ${day} (+100 poäng).`, 'good'); this.audio.play('levelup', { vol: 0.5 }); }
      }
    }
  }
  _ambience(dt) {
    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = 6;
      const want = !this.settings.get('music') ? null : this.dim === 'muspel' ? MUSPEL_MUSIC : this.player.pos.y < SEA - 12 && this.world.light(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y + 1), Math.floor(this.player.pos.z)) >> 4 < 4 ? 'tense' : this.isNight ? 'night' : (this.day % 2 ? 'calm' : 'adventure');
      if (want !== this.curMusic) { this.curMusic = want; if (want) this.audio.music(want); else this.audio.stopMusic(); }
    }
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 5 + Math.random() * 12;
      const P = this.player;
      if (this.dim === 'over' && this.sky.daylight > 0.6 && (this.world.light(Math.floor(P.pos.x), Math.floor(P.pos.y + 1), Math.floor(P.pos.z)) >> 4) > 12) birdChirp(this.audio, 0.9);
    }
  }

  /* ---------- sparning ---------- */
  serialize() {
    const P = this.player, O = this.worlds.over, M = this.worlds.muspel;
    const mus = M ? { furnaces: [...M.furnaces], chests: [...M.chests], saplings: [...M.saplings], circ: this.circs.muspel.serialize() } : (this.meta.mus || null);
    return Object.assign({}, this.meta, {
      worldTime: this.worldTime, played: Date.now(), day: this.day,
      player: { pos: [P.pos.x, P.pos.y, P.pos.z], yaw: P.yaw, pitch: P.pitch, health: P.alive ? P.health : 20, food: P.alive ? P.food : 20, sat: P.sat, flying: P.flying, view: P.view },
      inv: this.inv.serialize(), spawn: this.spawn, bed: this.bed, stats: this.stats, flags: this.flags,
      dim: this.dim, portals: this.portals, mus,
      furnaces: [...O.furnaces], chests: [...O.chests].map(([k, c]) => [k, c]), saplings: [...O.saplings], circ: this.circs.over.serialize()
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
      // varje dimension sparas för sig (vanliga världen ':c:', Muspelheim ':m:')
      for (const W of Object.values(this.worlds)) {
        const tag = W.dim === 'muspel' ? ':m:' : ':c:';
        // ta en ögonblicksbild: ändringar som görs medan vi sparar ligger kvar som "smutsiga" till nästa gång
        const keys = [...W.dirtyMods];
        for (const key of keys) {
          W.dirtyMods.delete(key);
          const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
          const data = W.modsFor(key);
          try { await kv.set('kubvarld:w:' + this.id + tag + cx + ',' + cz, data); }
          catch (e) { W.dirtyMods.add(key); throw e; }
        }
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
    this._disposed = true;
    this._endFish(); if (this._bobGeo) { this._bobGeo.dispose(); this._bobMat.dispose(); }
    if (this._infoEl) this._infoEl.remove();
    this.ui.close();
    this.ui.dispose();
    this.hand.dispose();
    for (const W of Object.values(this.worlds)) W.dispose();
    for (const e of [this._portalEl, this._bossEl, this._burnEl]) if (e) e.remove();
    this.sky.dispose(this.scene);
    this.ents.dispose();
    this.player.dispose();
    this.scene.remove(this.hl); this.scene.remove(this.crack);
    this.hl.geometry.dispose(); this.hl.material.dispose(); this.crack.geometry.dispose(); this.crack.material.dispose(); this.crackTex.dispose();
    this.app.renderer.info.autoReset = true;
    this._underwaterAudio(false);
    this.audio.stopMusic();
  }
}
