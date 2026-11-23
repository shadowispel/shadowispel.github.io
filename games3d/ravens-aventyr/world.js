/* Rävens äventyr – världsbehållare: mynt, stenar, bär, kontrollpunkter, fjädrar, knappar, plattformar, NPC:er, projektiler. */
import * as THREE from 'three';
import { CollisionWorld, DynCollider, trisFrom, toon, basic, TEX, disposeTree, GEO, builderMat } from './core.js';
import { buildStone, buildNPC, P, G as Grp, outline, UG } from './models.js';
import { glow } from './fx.js';

const V3 = THREE.Vector3;
const _v = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _e = new THREE.Euler();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ====================================================================== Mynt */
const COIN_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18).rotateX(Math.PI / 2);
COIN_GEO.userData.shared = true;
class Coins {
  constructor(W) {
    this.W = W; this.list = []; this.mesh = null;
  }
  add(x, y, z, hidden = false) { this.list.push({ p: new V3(x, y, z), home: new V3(x, y, z), active: true, hidden, fly: 0, from: null }); }
  build() {
    const n = this.list.length;
    if (!n) return;
    const mat = toon(0xffc72c, { emissive: 0x8a5a00, emissiveIntensity: 0.55 });
    this.mesh = new THREE.InstancedMesh(COIN_GEO, mat, n);
    this.mesh.userData.sharedGeo = true;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.W.group.add(this.mesh);
  }
  reset() { this.list.forEach(c => { c.active = true; c.fly = 0; c.p.copy(c.home); if (c.wasHidden) c.hidden = true; }); }
  release(c, from) { c.hidden = false; c.fly = 0.6; c.from = from.clone(); }
  update(dt, t, G) {
    if (!this.mesh) return;
    const pp = G.player.pos;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      let show = c.active && !c.hidden;
      if (show) {
        if (c.fly > 0) {
          c.fly -= dt;
          const k = 1 - c.fly / 0.6;
          _v.lerpVectors(c.from, c.p, k); _v.y += Math.sin(k * Math.PI) * 2;
        } else _v.copy(c.p);
        const dx = pp.x - _v.x, dy = pp.y + 0.7 - _v.y, dz = pp.z - _v.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (c.fly <= 0 && d2 < 1.45) { c.active = false; show = false; G.collectCoin(_v); }
        else if (c.fly <= 0 && d2 < 6 && G.player.state !== 'dead') { c.p.x += dx * dt * 6; c.p.y += dy * dt * 6; c.p.z += dz * dt * 6; }
      }
      if (show) {
        _q.setFromAxisAngle(_s.set(0, 1, 0), t * 3 + i * 0.4);
        _m.compose(_v, _q, _s.set(1, 1, 1));
      } else _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ====================================================================== World */
export class World {
  constructor(def, G) {
    this.def = def; this.id = def.id; this.G = G;
    this.group = new THREE.Group();
    this.col = new CollisionWorld();
    this.ents = []; this.updaters = [];
    this.coins = new Coins(this);
    this.stones = []; this.berries = []; this.berryStone = -1; this.berryCount = 0;
    this.checkpoints = []; this.waters = []; this.winds = []; this.movers = [];
    this.killY = -30; this.spawn = new V3(); this.spawnFace = 0;
    this.respawn = new V3(); this.respawnFace = 0;
    this.t = 0;
    this.projectiles = new Projectiles(this);
  }
  /* --- vatten & vind --- */
  water(y, box = null) { this.waters.push({ y, box }); }
  waterAt(x, z) {
    let best = -Infinity;
    for (const w of this.waters) if (!w.box || (x >= w.box[0] && x <= w.box[2] && z >= w.box[1] && z <= w.box[3])) best = Math.max(best, w.y);
    return best;
  }
  wind(box, force, opts = {}) { const w = { box: new THREE.Box3(new V3(...box.slice(0, 3)), new V3(...box.slice(3))), f: new V3(...force), on: true, ...opts }; this.winds.push(w); return w; }
  windAt(p) {
    let out = null;
    for (const w of this.winds) if (w.on && w.box.containsPoint(_v.set(p.x, p.y + 0.6, p.z))) { out = out || new V3(); out.add(w.f); }
    return out;
  }
  /* --- mynt --- */
  coin(x, y, z) { this.coins.add(x, y, z); }
  coinLine(a, b, n) { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); this.coin(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k); } }
  coinRing(x, y, z, r, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.coin(x + Math.cos(a) * r, y, z + Math.sin(a) * r); } }
  coinArc(a, b, h, n) { for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; this.coin(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + Math.sin(k * Math.PI) * h, a[2] + (b[2] - a[2]) * k); } }
  /** Fyll upp/trimma till exakt n mynt (fyllnad placeras i en ring vid fallback-punkten). */
  coinTotal(n, fill) {
    const L = this.coins.list;
    this.coinFill = n - L.length;
    if (L.length > n) L.length = n;
    let k = 0;
    while (L.length < n) { const a = k * 0.7, r = 2 + k * 0.12; this.coin(fill[0] + Math.cos(a) * r, fill[1], fill[2] + Math.sin(a) * r); k++; }
  }
  /* --- stenar --- */
  stone(idx, x, y, z, opts = {}) {
    const st = new Stone(this, idx, new V3(x, y, z), opts);
    this.stones[idx] = st; this.ents.push(st);
    return st;
  }
  revealStone(idx, cam = true) { const s = this.stones[idx]; if (s && s.hidden) s.reveal(cam); }
  /* --- röda bär --- */
  /** Samlarföremål (röda bär som standard; this.berryKind = 'lysmask' ger lysmaskar). */
  berry(x, y, z) { const b = new Berry(this, new V3(x, y, z), this.berryKind || 'berry'); this.berries.push(b); this.ents.push(b); return b; }
  berriesFor(stoneIdx) { this.berryStone = stoneIdx; }
  /* --- övrigt --- */
  checkpoint(x, y, z, face = 0) { const c = new Checkpoint(this, new V3(x, y, z), face); this.checkpoints.push(c); this.ents.push(c); return c; }
  heart(x, y, z) { const h = new Heart(this, new V3(x, y, z)); this.ents.push(h); return h; }
  spring(x, y, z, power = 20, kind = 'mushroom', s = 1) { const sp = new Spring(this, new V3(x, y, z), power, kind, s); this.ents.push(sp); return sp; }
  button(x, y, z, onPress, opts = {}) { const b = new Button(this, new V3(x, y, z), onPress, opts); this.ents.push(b); return b; }
  crate(x, y, z, coins = 3) { const c = new Crate(this, new V3(x, y, z), coins); this.ents.push(c); return c; }
  npc(kind, x, y, z, face, name, talk, opts = {}) { const n = new NPC(this, kind, new V3(x, y, z), face, name, talk, opts); this.ents.push(n); return n; }
  sign(x, y, z, face, lines, title = 'Skylt') { const s = new Sign(this, new V3(x, y, z), face, lines, title); this.ents.push(s); return s; }
  add(e) { this.ents.push(e); return e; }
  /** Rörlig plattform. o: { size:[w,h,d], shape:'box'|'cyl'|'log', color, mat, path:[[x,y,z],...], speed, loop, rot:{axis:'y',speed}, pos, crumble, wait, tag } */
  platform(o) { const p = new Mover(this, o); this.movers.push(p); this.ents.push(p); return p; }
  onUpdate(fn) { this.updaters.push(fn); }

  setSpawn(x, y, z, face = 0) { this.spawn.set(x, y, z); this.spawnFace = face; this.respawn.set(x, y, z); this.respawnFace = face; }

  finalize() { this.coins.build(); }
  update(dt, G) {
    this.t += dt;
    for (const m of this.movers) m.move(dt, this.t);
    for (const fn of this.updaters) fn(dt, this.t, G);
    for (let i = 0; i < this.ents.length; i++) { const e = this.ents[i]; if (!e.dead || e.deadT > 0) e.update(dt, G, this.t); }
    this.projectiles.update(dt, G);
  }
  frame(dt, t, G) {
    this.coins.update(dt, t, G);
    this.group.traverse(o => { if (o.userData.update) o.userData.update(t, G.cam); });
  }
  /** Återställ vid död: mynt tillbaka, fiender tillbaka. */
  resetVisit() {
    this.coins.reset();
    for (const e of this.ents) if (e.resetVisit) e.resetVisit();
    this.projectiles.clear();
  }
  dispose() {
    for (const e of this.ents) if (e.dispose) e.dispose();
    disposeTree(this.group);
    this.group.parent && this.group.parent.remove(this.group);
  }
}

/* ====================================================================== Norrskenssten */
class Stone {
  constructor(W, idx, p, o) {
    this.W = W; this.idx = idx; this.p = p; this.home = p.clone();
    this.hidden = !!o.hidden; this.got = false;
    this.obj = new THREE.Group(); this.obj.position.copy(p);
    W.group.add(this.obj);
    this.mesh = null; this.glow = glow(0x9affd8, 3.2, 0.7); this.obj.add(this.glow);
    this.obj.visible = !this.hidden;
    this.t = Math.random() * 6;
  }
  setCollected(c) {
    this.got = c;
    if (this.mesh) this.obj.remove(this.mesh);
    this.mesh = buildStone(c);
    this.obj.add(this.mesh);
    this.glow.material.opacity = c ? 0.3 : 0.75;
  }
  reveal(cam) {
    this.hidden = false; this.obj.visible = true; this.appearT = 1;
    const G = this.W.G;
    G.audio.play('levelup');
    G.fx.burst(this.p.x, this.p.y, this.p.z, 40, { speed: 7, color: [0x8affc8, 0xb08aff, 0x7ad8ff], size: 0.5, life: 1.1 });
    if (cam) G.cutscene(this.p, 'En Norrskenssten har dykt upp!');
  }
  update(dt, G) {
    if (!this.mesh) this.setCollected(G.hasStone(this.W.id, this.idx));
    if (this.hidden || this.taken) return;
    this.t += dt;
    if (this.appearT > 0) { this.appearT -= dt; this.obj.scale.setScalar(1 + this.appearT * 1.5); } else this.obj.scale.setScalar(1);
    this.mesh.rotation.y = this.t * 1.6;
    this.obj.position.set(this.p.x, this.p.y + Math.sin(this.t * 2) * 0.15, this.p.z);
    if (Math.random() < dt * 8) G.fx.emit(this.p.x + (Math.random() - 0.5) * 1.2, this.p.y + (Math.random() - 0.5) * 1.2, this.p.z + (Math.random() - 0.5) * 1.2, { vy: 0.8, life: 0.8, size: 0.25, size1: 0, color: Math.random() < 0.5 ? 0x8affc8 : 0xc0a0ff });
    const pp = G.player.pos;
    const dx = pp.x - this.p.x, dy = pp.y + 0.7 - this.p.y, dz = pp.z - this.p.z;
    if (dx * dx + dz * dz < 1.9 && Math.abs(dy) < 1.5 && G.player.state !== 'dead') {
      this.taken = true; this.obj.visible = false;
      G.collectStone(this.W.id, this.idx, this.p);
    }
  }
  resetVisit() { }
}

/* ====================================================================== Röda bär */
const BERRY_GEO = new THREE.SphereGeometry(0.28, 12, 10);
const BUG_WING = new THREE.PlaneGeometry(0.34, 0.16).translate(0.17, 0, 0);
class Berry {
  constructor(W, p, kind = 'berry') {
    this.W = W; this.p = p; this.got = false; this.kind = kind;
    this.obj = new THREE.Group(); this.obj.position.copy(p);
    if (kind === 'lysmask') {
      // lysmask: lysande gulgrön kropp med fladdrande vingar
      const b = new THREE.Mesh(BERRY_GEO, basic(0xd8ff7a)); b.scale.set(0.8, 0.7, 1.1); b.userData.sharedGeo = true;
      const h = new THREE.Mesh(BERRY_GEO, toon(0x3a2a1a)); h.scale.setScalar(0.5); h.position.set(0, 0.06, 0.28); h.userData.sharedGeo = true;
      const wm = basic(0xeaffd0, { transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      this.wings = [-1, 1].map(sx => { const w = new THREE.Mesh(BUG_WING, wm); w.userData.sharedGeo = true; w.position.set(sx * 0.08, 0.14, 0); w.scale.x = sx; this.obj.add(w); return w; });
      this.obj.add(b, h, glow(0xc8ff60, 2.6, 0.8));
    } else {
      const b = new THREE.Mesh(BERRY_GEO, toon(0xe0203a, { emissive: 0x500010, emissiveIntensity: 0.6 })); b.userData.sharedGeo = true;
      const b2 = b.clone(); b2.position.set(0.22, -0.12, 0.05); b2.scale.setScalar(0.8);
      const leaf = new THREE.Mesh(UG.cone, toon(0x3fa03a)); leaf.scale.set(0.16, 0.25, 0.05); leaf.position.set(0.05, 0.3, 0); leaf.rotation.z = -0.6; leaf.userData.sharedGeo = true;
      this.obj.add(b, b2, leaf, glow(0xff6080, 1.6, 0.45));
      outline(this.obj, 0.025);
    }
    W.group.add(this.obj);
    this.t = Math.random() * 5;
  }
  update(dt, G) {
    if (this.got) return;
    this.t += dt;
    if (this.wings) { this.wings.forEach((w, i) => { w.rotation.x = Math.sin(this.t * 30) * 0.8 * (i ? 1 : -1); }); this.obj.rotation.y = Math.sin(this.t * 0.8) * 1.5; this.obj.position.set(this.p.x + Math.sin(this.t * 1.3) * 0.25, this.p.y + Math.sin(this.t * 2.1) * 0.2, this.p.z + Math.cos(this.t * 1.1) * 0.25); }
    else { this.obj.rotation.y = this.t * 1.5; this.obj.position.y = this.p.y + Math.sin(this.t * 2.5) * 0.12; }
    const pp = G.player.pos;
    if (G.player.state !== 'dead' && Math.hypot(pp.x - this.p.x, pp.y + 0.7 - this.p.y, pp.z - this.p.z) < 1.25) {
      this.got = true; this.obj.visible = false;
      const W = this.W; W.berryCount++;
      G.audio.play('power', this.kind === 'lysmask' ? { pitch: 1.25 } : {});
      G.fx.sparkle(this.p.x, this.p.y, this.p.z, 14, this.kind === 'lysmask' ? 0xd8ff7a : 0xff5070);
      G.hud.berries(W.berryCount, W.berries.length, this.kind);
      if (W.onBerry) W.onBerry(this, G);
      if (W.berryCount >= W.berries.length) { if (W.onBerriesDone) W.onBerriesDone(G); else if (W.berryStone >= 0) W.revealStone(W.berryStone); }
    }
  }
  reset() { this.got = false; this.obj.visible = true; this.obj.position.copy(this.p); }
  resetVisit() { }
}

/* ====================================================================== Kontrollpunkt (flagga) */
class Checkpoint {
  constructor(W, p, face) {
    this.W = W; this.p = p; this.face = face; this.on = false;
    const g = this.obj = new THREE.Group(); g.position.copy(p);
    P(g, 'cyl', 0xdedede, [0, 1.3, 0], [0.06, 2.6, 0.06]);
    P(g, 'sph', 0xffd040, [0, 2.65, 0], 0.12);
    P(g, 'cyl', 0x7a6a5a, [0, 0.1, 0], [0.45, 0.2, 0.45]);
    this.flagMat = new THREE.MeshToonMaterial({ color: 0x8a8a9a, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1.1, 0.7, 6, 1); geo.translate(0.55, 0, 0);
    this.flag = new THREE.Mesh(geo, this.flagMat); this.flag.position.set(0.05, 2.2, 0); this.flag.castShadow = true;
    this.basePos = geo.attributes.position.array.slice();
    g.add(this.flag);
    outline(g, 0.02);
    W.group.add(g);
    this.t = 0;
  }
  update(dt, G) {
    this.t += dt;
    const a = this.flag.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { const x = this.basePos[i * 3]; a.setZ(i, Math.sin(this.t * 6 - x * 4) * 0.12 * x); }
    a.needsUpdate = true;
    if (!this.on) {
      const pp = G.player.pos;
      if (Math.hypot(pp.x - this.p.x, pp.z - this.p.z) < 1.6 && Math.abs(pp.y - this.p.y) < 2.5) {
        this.W.checkpoints.forEach(c => { if (c !== this && c.on) { c.on = false; c.flagMat.color.set(0x8a8a9a); } });
        this.on = true; this.flagMat.color.set(0xff8a2a);
        this.W.respawn.copy(this.p).add(_v.set(Math.sin(this.face) * 1.2, 0.2, Math.cos(this.face) * 1.2)); this.W.respawnFace = this.face;
        G.audio.play('select'); G.audio.play('pickup', { pitch: 1.4 });
        G.fx.sparkle(this.p.x, this.p.y + 2.3, this.p.z, 16, 0xffa040);
        G.toast('Kontrollpunkt!');
        G.player.heal(1);
      }
    }
  }
  dispose() { this.flagMat.dispose(); }
}

/* ====================================================================== Hjärta */
const HEART_GEO = (() => {
  const s = new THREE.Shape(); s.moveTo(0, -0.35); s.bezierCurveTo(0.1, -0.25, 0.45, 0, 0.45, 0.2); s.bezierCurveTo(0.45, 0.42, 0.2, 0.48, 0, 0.3); s.bezierCurveTo(-0.2, 0.48, -0.45, 0.42, -0.45, 0.2); s.bezierCurveTo(-0.45, 0, -0.1, -0.25, 0, -0.35);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }); g.translate(0, 0, -0.08); return g;
})();
export { HEART_GEO };
class Heart {
  constructor(W, p) {
    this.W = W; this.p = p; this.got = false;
    this.mesh = new THREE.Mesh(HEART_GEO, toon(0xff3b5c, { emissive: 0x601020, emissiveIntensity: 0.5 })); this.mesh.userData.sharedGeo = true;
    this.mesh.position.copy(p); W.group.add(this.mesh); this.t = 0;
  }
  update(dt, G) {
    if (this.got) return;
    this.t += dt; this.mesh.rotation.y = this.t * 2; this.mesh.position.y = this.p.y + Math.sin(this.t * 3) * 0.1;
    const pp = G.player.pos;
    if (Math.hypot(pp.x - this.p.x, pp.y + 0.7 - this.p.y, pp.z - this.p.z) < 1.2 && G.player.hp < G.player.maxHp) {
      this.got = true; this.mesh.visible = false; G.player.heal(2); G.audio.play('pickup'); G.fx.sparkle(this.p.x, this.p.y, this.p.z, 12, 0xff6080);
      this.respawnT = 30;
    }
  }
  resetVisit() { this.got = false; this.mesh.visible = true; }
}

/* ====================================================================== Studsfjäder (svamp/sjöstjärna) */
class Spring {
  constructor(W, p, power, kind, s) {
    this.W = W; this.p = p; this.power = power; this.r = 1.1 * s; this.top = p.y + 0.55 * s;
    const g = this.obj = new THREE.Group(); g.position.copy(p); g.scale.setScalar(s);
    if (kind === 'mushroom') {
      P(g, 'cyl', 0xf3e6cc, [0, 0.25, 0], [0.3, 0.5, 0.3]);
      this.cap = P(g, 'sph', 0x3a7ae0, [0, 0.5, 0], [1.1, 0.4, 1.1]);
      for (let i = 0; i < 5; i++) { const a = i * 1.26; P(this.cap, 'sph', 0xffffff, [Math.sin(a) * 0.55, 0.65, Math.cos(a) * 0.55], [0.15, 0.08, 0.15]).userData.noOutline = true; }
    } else if (kind === 'starfish') {
      this.cap = Grp(g, [0, 0.25, 0]);
      for (let i = 0; i < 5; i++) { const a = i * 1.2566; P(this.cap, 'caps', 0xff7a50, [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], [0.42, 0.9, 0.2], [Math.PI / 2, 0, -a]); }
      P(this.cap, 'sph', 0xffa070, [0, 0.05, 0], [0.45, 0.2, 0.45]);
      P(this.cap, 'sph', 0x111111, [-0.12, 0.2, 0.25], 0.06); P(this.cap, 'sph', 0x111111, [0.12, 0.2, 0.25], 0.06);
      this.top = p.y + 0.45 * s;
    } else {
      P(g, 'cyl', 0x666a78, [0, 0.15, 0], [0.9, 0.3, 0.9]);
      this.cap = P(g, 'cyl', 0x40e0a0, [0, 0.4, 0], [0.75, 0.2, 0.75]);
    }
    outline(g, 0.03);
    W.group.add(g);
    // fast kollision för foten
    // låg fot (0,32 m i världsskala – går att kliva upp på) och lite smalare än hatten; gruppen är skalad med s
    this.colTop = p.y + 0.32;
    const B = []; B.push({ geo: GEO.cyl, matrix: new THREE.Matrix4().compose(new V3(0, 0.16 / s, 0), new THREE.Quaternion(), new V3(this.r * 0.85 / s, 0.32 / s, this.r * 0.85 / s)) });
    this.dyn = W.col.addDyn(new DynCollider(g, trisFrom(B), 'ground'));
    this.boing = 0;
  }
  update(dt, G) {
    if (this.boing > 0) { this.boing -= dt; const k = this.boing / 0.4; this.cap.scale.y = (this.cap.userData.sy || (this.cap.userData.sy = this.cap.scale.y)) * (1 - Math.sin(k * Math.PI * 3) * 0.35 * k); }
    const pl = G.player;
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z;
    if (dx * dx + dz * dz < (this.r + 0.25) ** 2 && pl.pos.y > this.colTop - 0.2 && pl.pos.y < this.top + 0.5 && pl.vel.y <= 0.5 && pl.state !== 'climb') {
      const pounded = pl.state === 'pound';
      pl.bounce(this.power * (pounded ? 1.12 : 1), false, true);
      pl.flipT = 0.42;
      this.boing = 0.4;
      G.audio.play('jump', { pitch: 0.6 }); G.audio.play('pickup', { pitch: 0.8, vol: 0.5 });
      G.fx.burst(this.p.x, this.top, this.p.z, 10, { speed: 3, color: 0xffffff, size: 0.35, life: 0.4 });
    }
  }
}

/* ====================================================================== Markstötsknapp */
class Button {
  constructor(W, p, onPress, o) {
    this.W = W; this.p = p; this.onPress = onPress; this.o = o; this.pressed = false; this.timer = 0;
    const g = this.obj = new THREE.Group(); g.position.copy(p);
    P(g, 'cyl', o.base || 0x6a6a7a, [0, 0.15, 0], [1.1, 0.3, 1.1]);
    this.top = P(g, 'cyl', o.color || 0xff4a3a, [0, 0.38, 0], [0.8, 0.25, 0.8]);
    if (o.icon !== false) P(this.top, 'cyl', 0xffffff, [0, 0.55, 0], [0.4, 0.1, 0.4]).userData.noOutline = true;
    outline(g, 0.03);
    W.group.add(g);
    const B = [{ geo: GEO.cyl, matrix: new THREE.Matrix4().compose(new V3(0, 0.2, 0), new THREE.Quaternion(), new V3(1.1, 0.4, 1.1)) }];
    W.col.addDyn(new DynCollider(g, trisFrom(B), 'ground'));
  }
  hit(G) {
    if (this.pressed) return;
    this.pressed = true; this.top.position.y = 0.2;
    this.top.material = toon(this.o.onColor || 0x6ad04a);
    G.audio.play('place'); G.audio.play('select', { pitch: 0.8 });
    if (this.o.timed) this.timer = this.o.timed;
    this.onPress && this.onPress(this, G);
  }
  release() { this.pressed = false; this.top.position.y = 0.38; this.top.material = toon(this.o.color || 0xff4a3a); }
  update(dt, G) {
    if (this.timer > 0) {
      this.timer -= dt;
      if (Math.floor(this.timer * (this.timer < 3 ? 6 : 2)) !== Math.floor((this.timer + dt) * (this.timer < 3 ? 6 : 2))) G.audio.play('countdown', { vol: 0.4, pitch: 1.6 });
      if (this.timer <= 0) { this.release(); this.o.onTimeout && this.o.onTimeout(this, G); }
    }
  }
  resetVisit() { if (this.o.resetOnDeath !== false && this.pressed && !this.o.permanent) { this.release(); this.timer = 0; } }
}

/* ====================================================================== Låda */
class Crate {
  constructor(W, p, n) {
    this.W = W; this.p = p; this.broken = false;
    this.mesh = new THREE.Mesh(GEO.box, builderMat('planks')); this.mesh.userData.sharedGeo = true;
    const g = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.mesh.geometry = g; this.mesh.userData.sharedGeo = false;
    this.mesh.position.set(p.x, p.y + 0.6, p.z); this.mesh.castShadow = true;
    W.group.add(this.mesh);
    this.dyn = W.col.addDyn(new DynCollider(this.mesh, trisFrom([{ geo: g }]), 'ground'));
    this.coins = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; W.coins.add(p.x + Math.cos(a) * 1.6, p.y + 0.6, p.z + Math.sin(a) * 1.6, true); this.coins.push(W.coins.list[W.coins.list.length - 1]); this.coins[i].wasHidden = true; }
  }
  update(dt, G) {
    if (this.broken) return;
    const pl = G.player;
    const hit = pl.attackHit(_v.set(this.p.x, this.p.y + 0.6, this.p.z), 0.6);
    const stomp = pl.state === 'pound' && pl.stompCheck(this.p, 0.7, this.p.y + 1.2);
    if (hit || stomp) this.smash(G);
  }
  smash(G) {
    this.broken = true; this.mesh.visible = false; this.dyn.enabled = false;
    G.audio.play('break');
    G.fx.burst(this.p.x, this.p.y + 0.6, this.p.z, 16, { speed: 5, g: 15, color: [0xb98a50, 0x8a6030], size: 0.4, life: 0.7, drag: 1 });
    this.coins.forEach(c => this.W.coins.release(c, _v.set(this.p.x, this.p.y + 0.8, this.p.z)));
    if (G.player.state === 'pound') G.player.bounce(9);
  }
  resetVisit() { this.broken = false; this.mesh.visible = true; this.dyn.enabled = true; }
}

/* ====================================================================== Rörlig plattform */
class Mover {
  constructor(W, o) {
    this.W = W; this.o = o;
    const size = o.size || [3, 0.6, 3];
    let geo;
    if (o.shape === 'cyl') geo = new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 20);
    else if (o.shape === 'log') geo = new THREE.CylinderGeometry(size[1] / 2, size[1] / 2, size[2], 12).rotateX(Math.PI / 2);
    else if (o.geo) geo = o.geo;
    else geo = new THREE.BoxGeometry(...size);
    const cnt = geo.attributes.position.count; const col = new Float32Array(cnt * 3);
    const c = new THREE.Color(o.color == null ? 0xffffff : o.color).convertSRGBToLinear();
    for (let i = 0; i < cnt; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (o.mat && o.mat !== 'plain' && o.mat !== 'glow' && o.mat !== 'ice') {
      // världsprojicerade UV:er för texturer
      const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v; if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); } uv.setXY(i, u / 2.5, v / 2.5); }
    }
    this.mesh = new THREE.Mesh(geo, builderMat(o.mat || 'plain'));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    if (o.decor) o.decor(this.root, this.mesh);
    const p0 = o.path ? o.path[0] : o.pos;
    this.root.position.set(...p0);
    if (o.ry) this.root.rotation.y = o.ry;
    if (o.rx) this.root.rotation.x = o.rx;
    if (o.rz) this.root.rotation.z = o.rz;
    this.base = this.root.position.clone();
    this.baseRot = this.root.rotation.clone();
    W.group.add(this.root);
    const tris = trisFrom([{ geo, tag: o.tag || 'ground' }]);
    if (o.extraCol) o.extraCol.forEach(e => trisFrom([e]).forEach(t => tris.push(t)));
    this.dyn = W.col.addDyn(new DynCollider(this.root, tris, o.tag || 'ground'));
    this.segs = [];
    if (o.path) {
      let tot = 0;
      for (let i = 0; i < o.path.length - (o.loop ? 0 : 1); i++) { const a = new V3(...o.path[i]), b = new V3(...o.path[(i + 1) % o.path.length]); const l = a.distanceTo(b); this.segs.push({ a, b, l, s: tot }); tot += l; }
      this.total = tot;
    }
    this.u = (o.phase || 0) * (this.total || 1); this.dir = 1; this.wait = 0;
    this.crumbleT = -1; this.fallV = 0; this.visibleOn = o.visible !== false; this.active = o.active !== false;
    this.setVisible(this.visibleOn);
  }
  setVisible(v) { this.visibleOn = v; this.root.visible = v; this.dyn.enabled = v; }
  move(dt, t) {
    const o = this.o;
    if (o.path && this.active) {
      if (this.wait > 0) this.wait -= dt;
      else {
        this.u += (o.speed || 2) * dt * this.dir;
        if (o.loop) this.u = ((this.u % this.total) + this.total) % this.total;
        else if (this.u >= this.total) { this.u = this.total; this.dir = -1; this.wait = o.wait || 0.6; }
        else if (this.u <= 0) { this.u = 0; this.dir = 1; this.wait = o.wait || 0.6; }
      }
      let k = this.u;
      for (const s of this.segs) { if (k <= s.l + 1e-6 || s === this.segs[this.segs.length - 1]) { const f = clamp(k / s.l, 0, 1); const e = o.smooth === false ? f : f * f * (3 - 2 * f); this.root.position.lerpVectors(s.a, s.b, o.loop ? f : e); break; } k -= s.l; }
    }
    if (o.rot && this.active) {
      const a = o.rot.axis || 'y';
      if (o.rot.swing) this.root.rotation[a] = this.baseRot[a] + Math.sin(t * o.rot.speed + (o.rot.phase || 0)) * o.rot.swing;
      else this.root.rotation[a] += o.rot.speed * dt;
    }
    if (o.bob) this.root.position.y = this.base.y + Math.sin(t * o.bob[1] + (o.bob[2] || 0)) * o.bob[0];
    if (this.crumbleT >= 0) {
      this.crumbleT += dt;
      if (this.crumbleT < 0.9) { this.mesh.position.x = Math.sin(this.crumbleT * 60) * 0.06; }
      else if (this.crumbleT < 3) { this.fallV += 25 * dt; this.root.position.y -= this.fallV * dt; if (this.crumbleT > 1.4) this.dyn.enabled = false; }
      else if (this.crumbleT > 4.5) { this.crumbleT = -1; this.fallV = 0; this.root.position.copy(this.base); this.mesh.position.x = 0; this.dyn.enabled = this.visibleOn; this.root.visible = this.visibleOn; }
      if (this.crumbleT > 3) this.root.visible = false;
    }
    this.dyn.sync();
  }
  update(dt, G) {
    if (this.o.crumble && this.crumbleT < 0 && G.player.onGround && G.player.groundDyn === this.dyn) { this.crumbleT = 0; G.audio.play('break', { vol: 0.5, pitch: 0.7 }); }
    if (this.o.onStand && G.player.onGround && G.player.groundDyn === this.dyn) this.o.onStand(this, G);
  }
  resetVisit() { if (this.o.crumble) { this.crumbleT = -1; this.fallV = 0; this.root.position.copy(this.base); this.mesh.position.x = 0; this.root.visible = this.visibleOn; this.dyn.enabled = this.visibleOn; } }
}

/* ====================================================================== NPC & skyltar */
class NPC {
  constructor(W, kind, p, face, name, talk, o) {
    this.W = W; this.p = p.clone(); this.face = face; this.name = name; this.talk = talk; this.o = o; this.kind = kind;
    this.rig = buildNPC(kind);
    this.obj = this.rig.root; this.obj.position.copy(p); this.obj.rotation.y = face;
    this.obj.traverse(m => { if (m.isMesh && !m.userData.isOutline) m.castShadow = true; });
    W.group.add(this.obj);
    this.t = Math.random() * 5; this.curFace = face;
    this.r = o.r || 2.4;
    const B = [{ geo: GEO.cyl, matrix: new THREE.Matrix4().compose(new V3(0, 0.7, 0), new THREE.Quaternion(), new V3(0.45 * (o.scale || 1), 1.4, 0.45 * (o.scale || 1))) }];
    this.dyn = W.col.addDyn(new DynCollider(this.obj, trisFrom(B), 'ground'));
    this.moving = false;
    this.marker = new THREE.Mesh(UG.cone, basic(0xffe14d)); this.marker.scale.set(0.18, -0.3, 0.18); this.marker.userData.sharedGeo = true;
    this.marker.position.set(0, 2.5 * (NPCScale(kind)), 0); this.obj.add(this.marker);
    this.marker.visible = !!o.mark;
  }
  near(G) { const pp = G.player.pos; return Math.hypot(pp.x - this.obj.position.x, pp.z - this.obj.position.z) < this.r && Math.abs(pp.y - this.obj.position.y) < 2.5; }
  update(dt, G) {
    this.t += dt;
    const R = this.rig;
    const near = this.near(G);
    if (!this.moving) {
      let want = this.face;
      if (near || G.talkingTo === this) { const pp = G.player.pos; want = Math.atan2(pp.x - this.obj.position.x, pp.z - this.obj.position.z); }
      let d = want - this.curFace; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.curFace += d * Math.min(1, dt * 5);
      this.obj.rotation.y = this.curFace;
      // tomgång
      R.pivot.position.y = 0.55 * (NPC_S[this.kind] || 1) + Math.sin(this.t * 2) * 0.015;
      R.arms[0].rotation.x = R.arms[1].rotation.x = Math.sin(this.t * 2) * 0.05;
      R.legs[0].rotation.x = R.legs[1].rotation.x = 0;
      if (G.talkingTo === this) { R.head.rotation.x = Math.sin(this.t * 9) * 0.06; R.arms[1].rotation.x = -0.6 + Math.sin(this.t * 5) * 0.3; }
      else R.head.rotation.z = Math.sin(this.t * 0.8) * 0.06;
    }
    R.tail.forEach((s, i) => { s.rotation.y = Math.sin(this.t * 3 - i) * 0.2; });
    if (this.marker.visible) { this.marker.position.y = 2.4 * (NPC_S[this.kind] || 1) + Math.sin(this.t * 3) * 0.1; this.marker.rotation.y = this.t * 2; }
    this.dyn.sync();
    if (near && !this.moving && !G.talkingTo && G.player.onGround) G.prompt(this, 'Prata med ' + this.name);
  }
  /** Gå-animation (för lopp och liknande). */
  walkAnim(dt, sp) {
    const R = this.rig; this.t += dt;
    const ph = this.t * (4 + sp * 1.3), k = Math.min(1, sp / 6);
    R.legs[0].rotation.x = Math.sin(ph) * 1.1 * k; R.legs[1].rotation.x = -Math.sin(ph) * 1.1 * k;
    R.arms[0].rotation.x = -Math.sin(ph) * 0.9 * k; R.arms[1].rotation.x = Math.sin(ph) * 0.9 * k;
    R.pivot.position.y = 0.55 * (NPC_S[this.kind] || 1) + Math.abs(Math.sin(ph)) * 0.08 * k;
    R.body.rotation.x = sp * 0.03;
  }
  interact(G) {
    const lines = typeof this.talk === 'function' ? this.talk(G, this) : this.talk;
    if (lines) G.dialog(this.name, lines, this);
  }
}
const NPC_S = { uggla: 1.05, hare: 1, gravling: 1, ekorre: 0.85, mullvad: 0.9, pingvin: 1, sal: 1.1, krake: 0.95, alg: 1.6, igelkott: 0.85, groda: 0.8, hona: 0.95, utter: 0.95 };
function NPCScale(k) { return NPC_S[k] || 1; }
export { NPC };

class Sign {
  constructor(W, p, face, lines, title) {
    this.W = W; this.p = p; this.lines = lines; this.title = title; this.name = title;
    const g = this.obj = new THREE.Group(); g.position.copy(p); g.rotation.y = face;
    P(g, 'box', 0x8a6040, [0, 0.6, 0], [0.14, 1.2, 0.14]);
    P(g, 'box', 0xc8955a, [0, 1.25, 0], [1.3, 0.75, 0.1]);
    P(g, 'box', 0x6a4a30, [0, 1.25, 0.06], [1.0, 0.08, 0.02]).userData.noOutline = true;
    P(g, 'box', 0x6a4a30, [0, 1.1, 0.06], [0.8, 0.08, 0.02]).userData.noOutline = true;
    P(g, 'box', 0x6a4a30, [0, 1.4, 0.06], [0.9, 0.08, 0.02]).userData.noOutline = true;
    outline(g, 0.02);
    W.group.add(g);
    const B = [{ geo: GEO.box, matrix: new THREE.Matrix4().compose(new V3(0, 0.8, 0), new THREE.Quaternion(), new V3(1.3, 1.6, 0.3)) }];
    W.col.addDyn(new DynCollider(g, trisFrom(B), 'ground'));
  }
  update(dt, G) {
    const pp = G.player.pos;
    if (Math.hypot(pp.x - this.p.x, pp.z - this.p.z) < 2.2 && Math.abs(pp.y - this.p.y) < 2 && !G.talkingTo) G.prompt(this, 'Läs skylten');
  }
  interact(G) { G.dialog(this.title, this.lines, this); }
}

/* ====================================================================== Projektiler */
const PROJ_KIND = {
  snowball: { geo: new THREE.SphereGeometry(0.32, 12, 8), color: 0xf4f8ff },
  bigsnow: { geo: new THREE.SphereGeometry(1.3, 18, 12), color: 0xeef4ff },
  feather: { geo: new THREE.ConeGeometry(0.18, 0.9, 6).rotateX(Math.PI / 2), color: 0x4a3a7a, emissive: 0x6020a0 },
  spike: { geo: new THREE.ConeGeometry(0.13, 0.9, 6).rotateX(Math.PI / 2), color: 0xf2e2c0 },
  rock: { geo: new THREE.DodecahedronGeometry(0.6, 0), color: 0x8a7a8a },
  crystal: { geo: new THREE.OctahedronGeometry(0.4, 0), color: 0xff70d0, emissive: 0xa02080 },
  bubble: { geo: new THREE.SphereGeometry(0.45, 12, 8), color: 0x9ae0ff, emissive: 0x2060a0 }
};
class Projectiles {
  constructor(W) { this.W = W; this.list = []; this.meshes = {}; }
  spawn(kind, pos, vel, o = {}) {
    let m = this.list.find(p => !p.active && p.kind === kind);
    if (!m) {
      const K = PROJ_KIND[kind];
      const mesh = new THREE.Mesh(K.geo, toon(K.color, K.emissive ? { emissive: K.emissive, emissiveIntensity: 0.6 } : {}));
      mesh.userData.sharedGeo = true; mesh.castShadow = true;
      this.W.group.add(mesh);
      m = { kind, mesh }; this.list.push(m);
    }
    m.active = true; m.p = pos.clone(); m.v = vel.clone(); m.r = o.r || (kind === 'bigsnow' ? 1.3 : 0.35);
    m.g = o.g == null ? 18 : o.g; m.life = o.life || 5; m.reflected = false; m.onHit = o.onHit; m.roll = !!o.roll; m.owner = o.owner; m.bounceFloor = o.floor;
    m.mesh.visible = true; m.mesh.position.copy(pos); m.mesh.scale.setScalar(1);
    return m;
  }
  update(dt, G) {
    const pl = G.player;
    for (const m of this.list) {
      if (!m.active) continue;
      m.life -= dt;
      m.v.y -= m.g * dt;
      m.p.addScaledVector(m.v, dt);
      if (m.roll && m.bounceFloor != null && m.p.y - m.r < m.bounceFloor) { m.p.y = m.bounceFloor + m.r; m.v.y = 0; }
      m.mesh.position.copy(m.p);
      if (m.kind === 'feather' || m.kind === 'spike') m.mesh.lookAt(_v.copy(m.p).add(m.v));
      else { m.mesh.rotation.x += dt * (m.v.length() / m.r) * 0.5; m.mesh.rotation.y += dt * 2; }
      // träffa spelaren
      const dx = pl.pos.x - m.p.x, dy = pl.pos.y + 0.7 - m.p.y, dz = pl.pos.z - m.p.z;
      const rr = m.r + 0.45;
      if (dx * dx + dy * dy + dz * dz < rr * rr * 1.2) {
        const atk = pl.attackHit(m.p, m.r);
        if (atk && !m.reflected && m.kind !== 'feather' && m.kind !== 'spike') {
          m.reflected = true;
          _v.set(-dx, 0, -dz).normalize();
          const sp = Math.max(10, Math.hypot(m.v.x, m.v.z) * 1.2);
          m.v.set(_v.x * sp, m.roll ? 0 : 4, _v.z * sp);
          if (m.owner) { const o = m.owner.p || m.owner.pos; if (o) { _v.set(o.x - m.p.x, 0, o.z - m.p.z).normalize(); m.v.set(_v.x * sp, m.roll ? 0 : 5, _v.z * sp); } }
          G.audio.play('hit'); G.fx.sparkle(m.p.x, m.p.y, m.p.z, 8, 0xffffff);
          continue;
        } else if (!m.reflected) {
          pl.damage(m.p, 1);
          this.kill(m, G); continue;
        }
      }
      if (m.reflected && m.onHit && m.onHit(m)) { this.kill(m, G); continue; }
      if (m.reflected) {
        let hitE = null;
        for (const e of this.W.ents) { if (e.kill && e.rig && !e.dead && e.p && e.obj.visible && Math.hypot(e.p.x - m.p.x, e.p.y + e.rig.h * 0.5 - m.p.y, e.p.z - m.p.z) < e.rig.r + m.r + 0.4) { hitE = e; break; } }
        if (hitE) { hitE.kill(G, 'reflect'); this.kill(m, G); continue; }
      }
      if (m.life <= 0 || m.p.y < this.W.killY) { this.kill(m, G, true); continue; }
      // värld
      if (!m.roll || m.bounceFloor == null) {
        const sp = m.v.length();
        if (sp > 0.01) {
          _v.copy(m.v).divideScalar(sp);
          const h = this.W.col.raycast(m.p, _v, m.r + sp * dt);
          if (h) this.kill(m, G);
        }
      }
    }
  }
  kill(m, G, quiet) {
    m.active = false; m.mesh.visible = false;
    if (!quiet) {
      const c = m.kind === 'feather' ? 0x7a5ac0 : m.kind === 'crystal' ? 0xff80e0 : m.kind === 'rock' ? 0x9a8a8a : 0xffffff;
      G.fx.burst(m.p.x, m.p.y, m.p.z, m.kind === 'bigsnow' ? 24 : 10, { speed: m.kind === 'bigsnow' ? 6 : 3, g: 10, color: c, size: m.kind === 'bigsnow' ? 0.6 : 0.35, life: 0.6 });
      G.audio.play(m.kind === 'bigsnow' ? 'explode' : 'break', { vol: 0.6 });
    }
  }
  clear() { this.list.forEach(m => { m.active = false; m.mesh.visible = false; }); }
}

export { Mover, Button, Spring, Checkpoint };
