// Nordheim – synkar speltillståndet till 3D-scenen: byggnader, murar, åkrar, figurer, skepp, pilar, markeringar.
import * as THREE from 'three';
import { BUILDINGS, RES_INFO } from './data.js';
import { G, heightAt, groundY, clamp } from './state.js';
import { buildingGeo, scaffold, wallGeos, cropGeo, figureGeos, longshipGeo, boatGeo, addSnow, NIGHT, P, sharedGeos } from './models.js';
import { bstat } from './sim.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const GOLD = new THREE.Color(0xe0bc48);

export class Render {
  constructor(scene, env, settings) {
    this.scene = scene; this.env = env; this.settings = settings;
    this.group = new THREE.Group(); scene.add(this.group);
    this.mat = addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.glowMat = new THREE.MeshLambertMaterial({ color: 0x3a2814, emissive: 0xffa040, emissiveIntensity: 0 });
    this.bmesh = new Map();
    // murar
    const wg = wallGeos();
    const mkI = (geo, cap, mat = this.mat, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; this.group.add(im); return im; };
    this.wPost = mkI(wg.post, 1500); this.wArm = mkI(wg.arm, 3000); this.sPost = mkI(wg.spost, 1500); this.sArm = mkI(wg.sarm, 3000);
    this.ladders = mkI(figureGeos().ladder, 100);
    this.crops = mkI(cropGeo(), 400, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), false);
    this.crops.setColorAt(0, _c.set(0xffffff));
    this.wallsDirty = true; this.cropsDirty = true;
    // figurer
    const fg = figureGeos();
    this.fg = fg;
    this.figMat = addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { minY: 99 });
    const FIG = 700;
    const mkF = (geo, cap, shadow = false) => { const im = new THREE.InstancedMesh(geo, this.figMat, cap); im.count = 0; im.castShadow = shadow; im.frustumCulled = false; im.setColorAt(0, _c.set(0xffffff)); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(im); return im; };
    this.parts = {
      leg: mkF(fg.leg, FIG * 2), torso: mkF(fg.torso, FIG, true), belt: mkF(fg.belt, FIG), arm: mkF(fg.arm, FIG * 2), head: mkF(fg.head, FIG),
      hair: mkF(fg.hair, FIG), helmet: mkF(fg.helmet, FIG), hood: mkF(fg.hood, FIG), shield: mkF(fg.shield, FIG), boss: mkF(fg.boss, FIG),
      axe: mkF(fg.axe, FIG), pick: mkF(fg.pick, FIG), spear: mkF(fg.spear, FIG), sword: mkF(fg.sword, FIG), bow: mkF(fg.bow, FIG), rod: mkF(fg.rod, 200),
      torch: mkF(fg.torch, 200), hammer: mkF(fg.hammer, FIG), club: mkF(fg.club, 40), ladderC: mkF(fg.ladder, 60),
      load: mkF(fg.load, FIG), logLoad: mkF(fg.logLoad, FIG),
      trollBody: mkF(fg.trollBody, 40, true), trollHead: mkF(fg.trollHead, 40), trollLeg: mkF(fg.trollLeg, 80), trollArm: mkF(fg.trollArm, 80),
      ram: mkF(fg.ram, 30, true), deer: mkF(fg.deerBody, 80), antlers: mkF(fg.antlers, 80)
    };
    // pilar
    const ag = new THREE.CylinderGeometry(0.012, 0.012, 0.45, 4); ag.rotateX(Math.PI / 2);
    this.arrows = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), 300);
    this.arrows.count = 0; this.arrows.frustumCulled = false; this.group.add(this.arrows);
    // skepp
    this.longGeo = longshipGeo(0x8a1a12); this.merchGeo = longshipGeo(0x2a5a9a); this.boatGeo = boatGeo();
    this.shipMeshes = [];
    this.boats = new Map();
    // markeringar
    const ring = new THREE.RingGeometry(0.28, 0.36, 20); ring.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0x7dffa0, transparent: true, opacity: 0.85, depthWrite: false }), 400);
    this.rings.count = 0; this.rings.frustumCulled = false; this.rings.renderOrder = 5; this.group.add(this.rings);
    // röd markering under alla fiender – syns tydligt mot skog och gräs
    const fr = new THREE.RingGeometry(0.2, 0.34, 16); fr.rotateX(-Math.PI / 2);
    this.foeRings = new THREE.InstancedMesh(fr, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.7, depthWrite: false }), 300);
    this.foeRings.count = 0; this.foeRings.frustumCulled = false; this.foeRings.renderOrder = 5; this.group.add(this.foeRings);
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffe066 }));
    this.selBox.visible = false; this.group.add(this.selBox);
    // radie-cirkel
    const cg = new THREE.RingGeometry(0.97, 1, 64); cg.rotateX(-Math.PI / 2);
    this.radius = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.radius.visible = false; this.radius.renderOrder = 6; this.group.add(this.radius);
    // byggspöke + rutnät
    this.ghost = null; this.ghostType = null;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.5, depthWrite: false });
    const gq = new THREE.PlaneGeometry(0.92, 0.92); gq.rotateX(-Math.PI / 2);
    this.grid = new THREE.InstancedMesh(gq, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }), 1400);
    this.grid.count = 0; this.grid.frustumCulled = false; this.grid.renderOrder = 4; this.grid.setColorAt(0, _c.set(0xffffff)); this.group.add(this.grid);
    // flagga (samlingspunkt)
    this.flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), new THREE.MeshBasicMaterial({ color: 0x5a3a22 })); pole.position.y = 0.5;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshBasicMaterial({ color: 0xd03030, side: THREE.DoubleSide })); cloth.position.set(0.2, 0.85, 0);
    this.flag.add(pole, cloth); this.flag.visible = false; this.group.add(this.flag);
    this.moveMarks = [];
    const mm = new THREE.RingGeometry(0.15, 0.25, 16); mm.rotateX(-Math.PI / 2);
    this.markGeo = mm;
    this.t = 0;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const v of this.bmesh.values()) this.disposeB(v);
    this.bmesh.clear();
    const geos = new Set(), mats = new Set([this.mat, this.glowMat, this.figMat, this.ghostMat]);
    this.group.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !sharedGeos.has(o.geometry)) geos.add(o.geometry);
      if (o.material) [].concat(o.material).forEach(m => mats.add(m));
    });
    [this.longGeo, this.merchGeo, this.boatGeo, this.markGeo].forEach(g => g && geos.add(g));
    for (const k in this.fg) geos.add(this.fg[k]);
    geos.forEach(g => g.dispose());
    mats.forEach(m => m && m.dispose());
  }

  /* ---------- Byggnader ---------- */
  modelKey(b) { return b.type; }
  addBuilding(b) {
    if (b.def.wall || b.def.gate && false) { this.wallsDirty = true; return; }
    if (b.type === 'field') { this.cropsDirty = true; return; }
    const g = new THREE.Group();
    g.position.set(b.x, b.y, b.z);
    let rot = -b.rot * Math.PI / 2;
    if (b.face != null) rot = b.face * Math.PI / 2;
    g.rotation.y = rot;
    const v = { g, lvl: 0, main: null, glow: null, scaf: null, built: null };
    this.group.add(g);
    this.bmesh.set(b.id, v);
    this.refreshBuilding(b);
    if (b.def.gate) this.wallsDirty = true;
  }
  refreshBuilding(b) {
    if (b.def.wall) { this.wallsDirty = true; return; }
    if (b.type === 'field') { this.cropsDirty = true; return; }
    const v = this.bmesh.get(b.id); if (!v) return;
    if (b.def.gate) {
      // orientera porten efter murarna
      const n = G.map.n;
      const wx = isWallAt(b.i - 1, b.j) || isWallAt(b.i + 1, b.j);
      v.g.rotation.y = wx ? 0 : Math.PI / 2;
      this.wallsDirty = true;
    }
    if (v.lvl !== b.lvl) {
      if (v.main) { v.g.remove(v.main); }
      if (v.glow) { v.g.remove(v.glow); }
      const geo = buildingGeo(b.type, b.lvl);
      v.main = new THREE.Mesh(geo.main, this.mat); v.main.castShadow = true; v.main.receiveShadow = true; v.main.userData.bid = b.id;
      v.g.add(v.main);
      if (geo.glow) { v.glow = new THREE.Mesh(geo.glow, this.glowMat); v.g.add(v.glow); } else v.glow = null;
      v.lvl = b.lvl;
      v.h = geo.main.boundingBox ? geo.main.boundingBox.max.y : 1.5;
    }
    const building = !b.built;
    if (building && !v.scaf) {
      const fw = (b.rot & 1) && b.face == null ? b.d : b.w, fd = (b.rot & 1) && b.face == null ? b.w : b.d;
      v.scaf = new THREE.Mesh(scaffold(fw, fd, Math.max(1, (v.h || 1.5) * 0.9)), this.mat);
      v.scaf.castShadow = true;
      v.g.add(v.scaf);
    } else if (!building && v.scaf) { v.g.remove(v.scaf); v.scaf = null; }
    this.progressBuilding(b);
  }
  progressBuilding(b) {
    const v = this.bmesh.get(b.id); if (!v || !v.main) return;
    const p = b.built ? 1 : clamp(b.progress, 0.02, 1);
    const sy = b.built ? 1 : (b.upgrading ? 0.7 + p * 0.3 : 0.05 + p * 0.95);
    v.main.scale.set(1, sy, 1);
    if (v.glow) v.glow.scale.set(1, sy, 1), v.glow.visible = b.built;
  }
  disposeB(v) { this.group.remove(v.g); }
  removeBuilding(b) {
    if (b.def.wall || b.def.gate) this.wallsDirty = true;
    if (b.type === 'field') { this.cropsDirty = true; return; }
    const v = this.bmesh.get(b.id); if (!v) return;
    this.disposeB(v); this.bmesh.delete(b.id);
  }
  /** Byggnad under en stråle (träffar själva modellen, inte bara marken). */
  pickBuilding(ray) {
    const objs = this._pickObjs || (this._pickObjs = []); objs.length = 0;
    for (const v of this.bmesh.values()) if (v.main && v.g.visible !== false) objs.push(v.main);
    this._rc = this._rc || new THREE.Raycaster();
    this._rc.ray.copy(ray);
    const hits = this._rc.intersectObjects(objs, false);
    return hits.length ? hits[0].object.userData.bid : 0;
  }
  rebuildAll() {
    for (const v of this.bmesh.values()) this.disposeB(v);
    this.bmesh.clear();
    for (const b of G.buildings.values()) this.addBuilding(b);
    this.wallsDirty = true; this.cropsDirty = true;
  }

  updateWalls() {
    this.wallsDirty = false;
    let np = 0, na = 0, sp = 0, sa = 0, nl = 0;
    const n = G.map.n;
    for (const b of G.buildings.values()) {
      if (!b.def.wall) continue;
      const stone = b.lvl > 1;
      const x = b.i + 0.5, z = b.j + 0.5, y = groundY(x, z) - 0.05;
      const sc = b.built ? 1 : 0.3 + b.progress * 0.7;
      _m.compose(_v.set(x, y, z), _q.identity(), _s.set(1, sc, 1));
      if (stone) this.sPost.setMatrixAt(sp++, _m); else this.wPost.setMatrixAt(np++, _m);
      const dirs = [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]];
      for (const [di, dj, ry] of dirs) {
        if (!isWallAt(b.i + di, b.j + dj, true)) continue;
        _q.setFromEuler(_e.set(0, ry, 0));
        _m.compose(_v.set(x, y, z), _q, _s.set(1, sc, 1));
        if (stone) this.sArm.setMatrixAt(sa++, _m); else this.wArm.setMatrixAt(na++, _m);
      }
      const k = b.j * n + b.i;
      if (G.ladder[k] > 0 && nl < 100) {
        _q.setFromEuler(_e.set(0.45, 0, 0));
        _m.compose(_v.set(x, y + 0.6, z + 0.35), _q, _s.set(1.4, 1.4, 1.4));
        this.ladders.setMatrixAt(nl++, _m);
      }
    }
    this.wPost.count = np; this.wArm.count = na; this.sPost.count = sp; this.sArm.count = sa; this.ladders.count = nl;
    [this.wPost, this.wArm, this.sPost, this.sArm, this.ladders].forEach(im => im.instanceMatrix.needsUpdate = true);
  }

  updateCrops() {
    this.cropsDirty = false;
    let c = 0;
    for (const b of G.buildings.values()) {
      if (!b.field) continue;
      const f = b.field;
      let h = 0;
      if (!b.built) h = 0;
      else if (f.state === 'growing') { h = 0.08 + f.grow * 0.92; _c.set(0x5a9a38).lerp(GOLD, clamp((f.grow - 0.5) * 2, 0, 1)); }
      else if (f.state === 'ripe') { h = 1; _c.copy(GOLD); }
      if (h <= 0) continue;
      _m.compose(_v.set(b.x, groundY(b.x, b.z) - 0.02, b.z), _q.identity(), _s.set(b.w / 3, h, b.d / 3));
      this.crops.setMatrixAt(c, _m);
      this.crops.setColorAt(c, _c);
      c++;
    }
    this.crops.count = c;
    this.crops.instanceMatrix.needsUpdate = true;
    if (this.crops.instanceColor) this.crops.instanceColor.needsUpdate = true;
  }

  /* ---------- Figurer ---------- */
  beginFigs() { this.idx = {}; for (const k in this.parts) this.idx[k] = 0; }
  put(part, M, color) {
    const im = this.parts[part]; const i = this.idx[part];
    if (i >= im.instanceMatrix.count) return;
    im.setMatrixAt(i, M);
    if (color != null) im.setColorAt(i, _c.set(color));
    this.idx[part] = i + 1;
  }
  local(B, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m2.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
    return _m.multiplyMatrices(B, _m2);
  }
  drawHuman(f, opts) {
    const B = this._B || (this._B = new THREE.Matrix4());
    const sc = opts.scale || 1;
    const walk = f.anim === 'walk';
    const ph = f.phase || 0;
    const bob = walk ? Math.abs(Math.sin(ph)) * 0.025 : 0;
    _q.setFromAxisAngle(_v.set(0, 1, 0), f.yaw || 0);
    B.compose(_v.set(f.x, (f.y || 0) + bob, f.z), _q, _s.set(sc, sc, sc));
    const sw = walk ? Math.sin(ph) * 0.65 : 0;
    const legY = 0.17;
    this.put('leg', this.local(B, -0.04, legY, 0, sw, 0, 0), opts.legs || 0x4a3a2a);
    this.put('leg', this.local(B, 0.04, legY, 0, -sw, 0, 0), opts.legs || 0x4a3a2a);
    this.put('torso', this.local(B, 0, legY - 0.01, 0), opts.cloth);
    this.put('belt', this.local(B, 0, legY + 0.02, 0), 0x3a2a1a);
    // armar och verktyg
    let ar = walk ? -sw * 0.8 : 0, al = walk ? sw * 0.8 : 0;
    const a = f.anim;
    const t = (f.phase || 0);
    let toolRx = 0;
    if (a === 'chop' || a === 'pick' || a === 'hammer' || a === 'attack' || a === 'dig' || a === 'scythe') {
      const s = (a === 'attack') ? (f.swing > 0 ? Math.sin((0.35 - f.swing) / 0.35 * Math.PI) : 0) : Math.max(0, Math.sin(t * (a === 'hammer' ? 1.3 : 1)));
      ar = -1.6 + s * 1.9; toolRx = 0;
      if (a === 'dig' || a === 'scythe') { ar = -0.6 + Math.sin(t) * 0.6; al = ar; }
    } else if (a === 'bow') { ar = -1.45; al = -1.5; }
    else if (a === 'fish') { ar = -0.9; al = -0.9; }
    else if (a === 'gather' || a === 'throw') { ar = -0.8 + Math.sin(t * 1.5) * 0.4; al = ar; }
    if (f.carry && opts.carry !== false) { al = -2.6; ar = Math.min(ar, -2.6); }
    const shY = legY + 0.21;
    this.put('arm', this.local(B, -0.13, shY, 0, al, 0, 0.12), opts.cloth);
    const armR = this.local(B, 0.13, shY, 0, ar, 0, -0.12);
    this.put('arm', armR, opts.cloth);
    const tool = opts.tool;
    if (tool) {
      const hand = _m2.copy(armR);
      const tm = this._TM || (this._TM = new THREE.Matrix4());
      _q.setFromEuler(_e.set(tool === 'bow' ? 0 : Math.PI / 2 + toolRx, 0, 0));
      tm.compose(_v.set(0, -0.27, 0.02), _q, _s.set(1, 1, 1));
      this.put(tool, _m.multiplyMatrices(hand, tm));
    }
    this.put('head', this.local(B, 0, shY + 0.1, 0), opts.skin || 0xf0c8a0);
    if (opts.hat) this.put(opts.hat, this.local(B, 0, shY + 0.1, 0), opts.hatColor);
    if (opts.shield) {
      this.put('shield', this.local(B, -0.16, legY + 0.12, 0.06, 0, -0.25, 0), opts.shield);
      this.put('boss', this.local(B, -0.16, legY + 0.12, 0.075, 0, -0.25, 0));
    }
    if (f.carry && opts.carry !== false) {
      const r = f.carry.r;
      if (r === 'wood') this.put('logLoad', this.local(B, 0, shY + 0.25, 0, 0, 0.2, 0), 0x8a6a40);
      else this.put('load', this.local(B, 0, shY + 0.22, 0), r === 'stone' ? 0x9a9a98 : r === 'food' ? (f.carry.ft === 'fish' ? 0x9ab0c0 : f.carry.ft === 'berries' ? 0x8a2a4a : 0xd8b878) : r === 'iron' ? 0x5a5e66 : r === 'weapons' ? 0xc0c8d0 : 0xd4a632);
    }
    if (f.ladder) this.put('ladderC', this.local(B, 0, shY + 0.15, 0, Math.PI / 2 - 0.3, 0, 0));
  }
  drawTroll(f) {
    const B = this._B;
    const walk = f.anim === 'walk', ph = f.phase || 0;
    _q.setFromAxisAngle(_v.set(0, 1, 0), f.yaw || 0);
    B.compose(_v.set(f.x, f.y, f.z), _q, _s.set(2.1, 2.1, 2.1));
    const sw = walk ? Math.sin(ph * 0.6) * 0.5 : 0;
    const skin = 0x6a7a5a;
    this.put('trollLeg', this.local(B, -0.13, 0.22, 0, sw, 0, 0), skin);
    this.put('trollLeg', this.local(B, 0.13, 0.22, 0, -sw, 0, 0), skin);
    this.put('trollBody', this.local(B, 0, 0, 0), skin);
    const swing = f.swing > 0 ? Math.sin((0.35 - f.swing) / 0.35 * Math.PI) : 0;
    this.put('trollArm', this.local(B, -0.34, 0.78, 0, -sw, 0, 0.2), skin);
    const arm = this.local(B, 0.34, 0.78, 0, -1.2 + swing * 1.8 + sw * 0.3, 0, -0.2);
    this.put('trollArm', arm, skin);
    const tm = this._TM || (this._TM = new THREE.Matrix4());
    _q.setFromEuler(_e.set(Math.PI * 0.8, 0, 0)); tm.compose(_v.set(0, -0.32, 0.05), _q, _s.set(0.9, 0.9, 0.9));
    this.put('club', _m.multiplyMatrices(_m2.copy(arm), tm));
    this.put('trollHead', this.local(B, 0, 0.95, 0.1), skin);
  }
  drawRam(f) {
    const B = this._B;
    _q.setFromAxisAngle(_v.set(0, 1, 0), f.yaw || 0);
    const push = f.swing > 0 ? Math.sin((0.35 - f.swing) / 0.35 * Math.PI) * 0.15 : 0;
    B.compose(_v.set(f.x + Math.sin(f.yaw) * push, f.y, f.z + Math.cos(f.yaw) * push), _q, _s.set(1, 1, 1));
    this.put('ram', B);
  }
  drawDeer(d) {
    const B = this._B;
    _q.setFromAxisAngle(_v.set(0, 1, 0), d.yaw || 0);
    if (d.dead) { const q2 = new THREE.Quaternion().setFromAxisAngle(_v.set(0, 0, 1), Math.PI / 2); _q.multiply(q2); }
    const bob = d.anim === 'walk' ? Math.abs(Math.sin(d.phase)) * 0.03 : 0;
    B.compose(_v.set(d.x, d.y + bob + (d.dead ? 0.15 : 0), d.z), _q, _s.set(1, 1, 1));
    if (d.anim === 'graze' && !d.dead) { _m2.makeRotationX(0.35); B.multiply(_m2); }
    this.put('deer', B, 0x9a6a3a);
    if (d.id % 2) this.put('antlers', B);
  }
  endFigs() {
    for (const k in this.parts) {
      const im = this.parts[k];
      im.count = this.idx[k];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  drawAll(camera, dt, viewR) {
    this.t += dt;
    if (this.wallsDirty) this.updateWalls();
    if (this.cropsDirty) this.updateCrops();
    this.glowMat.emissiveIntensity = 0.15 + NIGHT.value * 1.6;
    this.beginFigs();
    const cx = camera.userData.tx, cz = camera.userData.tz, R2 = viewR * viewR;
    const vis = e => (e.x - cx) ** 2 + (e.z - cz) ** 2 < R2;
    const TOOLS = { woodcutter: 'axe', quarry: 'pick', mine: 'pick', smithy: 'hammer', fisher: 'rod', hunter: 'bow', barn: null };
    for (const c of G.citizens) {
      if (c.inside || !vis(c)) continue;
      let tool = null;
      const job = c.job && G.buildings.get(c.job);
      if (c.state === 'build' || c.state === 'repair') tool = 'hammer';
      else if (job) tool = TOOLS[job.type] || null;
      if (c.anim === 'fish') tool = 'rod';
      if (c.anim === 'bow') tool = 'bow';
      if (c.carry) tool = null;
      this.drawHuman(c, { cloth: c.cloth, skin: c.skin, hat: 'hair', hatColor: c.hair, tool });
    }
    for (const u of G.units) {
      if (!vis(u)) continue;
      const t = u.type;
      this.drawHuman(u, {
        cloth: u.cloth, skin: u.skin, hat: 'helmet', hatColor: 0x8a9098,
        tool: t === 'krigare' ? 'axe' : t === 'bagskytt' ? 'bow' : 'spear',
        shield: t === 'bagskytt' ? null : (t === 'skoldmo' ? 0xd8c040 : 0x2f5f9a), scale: t === 'skoldmo' ? 1.08 : 1
      });
    }
    for (const e of G.enemies) {
      if (!vis(e)) continue;
      if (e.type === 'troll') { this.drawTroll(e); continue; }
      if (e.type === 'murbracka') { this.drawRam(e); continue; }
      const t = e.type;
      this.drawHuman(e, {
        cloth: e.cloth, skin: 0xd8a880, hat: t === 'barsark' ? 'hood' : 'helmet', hatColor: t === 'barsark' ? 0x8a8a8a : 0x4a4a4a, legs: 0x2a2220,
        tool: e.torch ? 'torch' : t === 'fbagskytt' ? 'bow' : t === 'barsark' ? 'axe' : t === 'hovding' ? 'sword' : t === 'stege' ? null : 'sword',
        shield: t === 'plundrare' || t === 'hovding' ? 0x8a1a12 : null, scale: t === 'hovding' ? 1.15 : t === 'barsark' ? 1.06 : 1
      });
      if (e.torch && Math.random() < 0.5) this.env.burst('torch', e.x + Math.sin(e.yaw) * 0.1, e.y + 0.62, e.z + Math.cos(e.yaw) * 0.1);
    }
    for (const d of G.deer) if (!d.gone && vis(d)) this.drawDeer(d);
    // lik
    for (const c of G.corpses) {
      if (!vis(c)) continue;
      const B = this._B || (this._B = new THREE.Matrix4());
      _q.setFromEuler(_e.set(-Math.PI / 2, c.yaw, 0, 'YXZ'));
      const sink = Math.max(0, c.t - 18) * 0.05;
      B.compose(_v.set(c.x, c.y + 0.06 - sink, c.z), _q, _s.set(1, 1, 1));
      if (c.type === 'troll') { _s.set(2, 2, 2); B.compose(_v.set(c.x, c.y + 0.2 - sink, c.z), _q, _s); this.put('trollBody', B, 0x5a6a4a); continue; }
      if (c.type === 'murbracka') continue;
      this.put('torso', this.local(B, 0, 0.1, 0), c.cloth || (c.team ? 0x5a2a22 : 0x6a7a5a));
      this.put('head', this.local(B, 0, 0.45, 0), 0xd8b090);
    }
    this.endFigs();
    // pilar
    let na = 0;
    for (const p of G.projectiles) {
      if (na >= 300) break;
      const len = Math.hypot(p.dx || 0, p.dy || 0, p.dz || 0) || 1;
      _v.set(p.dx || 0, p.dy || 0, p.dz || 1).divideScalar(len);
      _q.setFromUnitVectors(this._fwd || (this._fwd = new THREE.Vector3(0, 0, 1)), _v);
      _m.compose(this._pp || (this._pp = new THREE.Vector3()), _q, _s.set(1, 1, 1));
      _m.setPosition(p.x, p.y, p.z);
      this.arrows.setMatrixAt(na++, _m);
    }
    this.arrows.count = na; this.arrows.instanceMatrix.needsUpdate = true;
    this.updateShips(dt);
    this.updateSelection();
  }

  updateShips(dt) {
    let i = 0;
    const need = G.ships.length;
    while (this.shipMeshes.length < need) { const m = new THREE.Mesh(this.longGeo, this.mat); m.castShadow = true; this.group.add(m); this.shipMeshes.push(m); }
    for (; i < need; i++) {
      const s = G.ships[i], m = this.shipMeshes[i];
      m.geometry = s.kind === 'merchant' ? this.merchGeo : this.longGeo;
      m.visible = true;
      m.position.set(s.x, -0.12 + (s.bob || 0), s.z);
      m.rotation.set(Math.sin(s.t * 0.9) * 0.03, s.yaw, Math.sin(s.t * 1.1) * 0.04);
      m.scale.setScalar(s.kind === 'merchant' ? 0.9 : 1);
    }
    for (; i < this.shipMeshes.length; i++) this.shipMeshes[i].visible = false;
    // fiskebåtar vid hamnar
    const seen = new Set();
    for (const b of G.buildings.values()) {
      if (b.type !== 'harbor' || !b.built || b.team) continue;
      seen.add(b.id);
      let bt = this.boats.get(b.id);
      if (!bt) { bt = { m: new THREE.Mesh(this.boatGeo, this.mat), t: 0 }; bt.m.castShadow = true; this.group.add(bt.m); this.boats.set(b.id, bt); }
      const out = b.inside && b.inside.length > 0;
      bt.t = out ? bt.t + dt : Math.max(0, bt.t - dt * 2);
      const dir = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.face || 0];
      const cyc = (bt.t % 22) / 22, dist = out ? 2.8 + Math.sin(cyc * Math.PI) * 9 : 2.8;
      const side = 1.2;
      const px = b.x + dir[0] * dist + dir[1] * side, pz = b.z + dir[1] * dist - dir[0] * side;
      bt.m.position.set(px, -0.05 + Math.sin(this.t * 1.4) * 0.04, pz);
      bt.m.rotation.y = Math.atan2(dir[0], dir[1]) + (cyc > 0.5 && out ? Math.PI : 0);
    }
    for (const [id, bt] of this.boats) if (!seen.has(id)) { this.group.remove(bt.m); this.boats.delete(id); }
  }

  updateSelection() {
    let r = 0;
    const put = (e, s = 1) => { if (r >= 400) return; _m.compose(_v.set(e.x, (e.y || 0) + 0.04, e.z), _q.identity(), _s.set(s, 1, s)); this.rings.setMatrixAt(r++, _m); };
    if (G.selUnits) for (const u of G.selUnits) if (!u.dead) put(u, u.type === 'skoldmo' ? 1.1 : 1);
    if (G.sel && G.sel.kind === 'citizen' && !G.sel.c.inside) put(G.sel.c);
    if (G.sel && G.sel.kind === 'enemy' && !G.sel.e.dead) put(G.sel.e, G.sel.e.type === 'troll' ? 2.4 : G.sel.e.type === 'murbracka' ? 2.4 : 1);
    this.rings.count = r; this.rings.instanceMatrix.needsUpdate = true;
    let fe = 0;
    for (const e of G.enemies) {
      if (fe >= 300 || e.dead) continue;
      const s = e.type === 'troll' ? 2.6 : e.type === 'murbracka' ? 2.4 : 1;
      _m.compose(_v.set(e.x, (e.y || 0) + 0.035, e.z), _q.identity(), _s.set(s, 1, s)); this.foeRings.setMatrixAt(fe++, _m);
    }
    this.foeRings.count = fe; this.foeRings.instanceMatrix.needsUpdate = true;
    this.rings.material.color.set(G.sel && G.sel.kind === 'enemy' ? 0xff6060 : 0x7dffa0);
    const sb = G.sel && G.sel.kind === 'building' ? G.sel.b : null;
    if (sb && G.buildings.has(sb.id)) {
      const h = sb.def.wall || sb.def.gate ? 1.5 : ((this.bmesh.get(sb.id) || {}).h || 1.5);
      this.selBox.visible = true;
      this.selBox.position.set(sb.x, sb.y + h / 2, sb.z);
      this.selBox.scale.set(sb.w + 0.1, h + 0.1, sb.d + 0.1);
      this.selBox.material.color.set(sb.team ? 0xff6060 : 0xffe066);
      const rad = bstat(sb, 'radius') || bstat(sb, 'range');
      if (rad && !sb.team) this.showRadius(sb.x, sb.z, rad, 0xffe066); else this.radius.visible = false;
    } else { this.selBox.visible = false; if (!G.placing) this.radius.visible = false; }
    const rb = G.sel && G.sel.kind === 'building' && G.sel.b.rally ? G.sel.b.rally : null;
    this.flag.visible = !!rb;
    if (rb) this.flag.position.set(rb.x, groundY(rb.x, rb.z), rb.z);
  }
  showRadius(x, z, r, color) {
    this.radius.visible = true;
    this.radius.position.set(x, Math.max(groundY(x, z), 0) + 0.15, z);
    this.radius.scale.set(r, 1, r);
    this.radius.material.color.set(color);
  }

  /* ---------- Byggläge ---------- */
  setGhost(type, i, j, rot, ok, check) {
    if (!type) {
      if (this.ghost) this.ghost.visible = false;
      this.grid.count = 0; this.radius.visible = false;
      return;
    }
    const def = BUILDINGS[type];
    if (this.ghostType !== type) {
      if (this.ghost) { this.group.remove(this.ghost); if (!sharedGeos.has(this.ghost.geometry)) this.ghost.geometry.dispose(); }
      const geo = def.wall ? wallGeos().post : (type === 'road' || type === 'demolish') ? null : type === 'field' ? cropGeo() : buildingGeo(type, 1).main;
      this.ghost = new THREE.Mesh(geo || new THREE.BoxGeometry(0.95, 0.05, 0.95), this.ghostMat);
      this.ghost.renderOrder = 7;
      this.group.add(this.ghost);
      this.ghostType = type;
    }
    const w = check ? check.w : def.size[0], d = check ? check.d : def.size[1];
    const x = i + w / 2, z = j + d / 2;
    this.ghost.visible = true;
    let y = 0; let cnt = 0;
    for (let jj = j; jj <= j + d; jj++) for (let ii = i; ii <= i + w; ii++) { y += Math.max(heightAt(ii, jj), 0); cnt++; }
    y /= cnt;
    this.ghost.position.set(x, y + 0.02, z);
    let rr = -rot * Math.PI / 2;
    if (def.req === 'shore' && check && check.face != null) rr = check.face * Math.PI / 2;
    this.ghost.rotation.y = rr;
    this.ghost.scale.set(1, type === 'field' ? 0.4 : 1, 1);
    this.ghostMat.color.set(ok ? 0x66ff88 : 0xff5050);
    // rutnät runt markören
    const showFish = type === 'fisher' || type === 'harbor';
    const n = G.map.n, R = showFish ? 13 : 7;
    let c = 0;
    const bad = new Set(check ? check.bad : []);
    for (let jj = j - R; jj < j + d + R; jj++) for (let ii = i - R; ii < i + w + R; ii++) {
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const k = jj * n + ii;
      const inFp = ii >= i && ii < i + w && jj >= j && jj < j + d;
      const t = G.map.type[k];
      const blocked = t === 0 || t === 5 || G.occ[k] || G.map.res[k] === 2 || G.map.res[k] === 3;
      const fishSpot = showFish && G.map.res[k] === 5;
      if (!inFp && !fishSpot) continue;
      const dd = Math.max(Math.abs(ii + 0.5 - x) - w / 2, Math.abs(jj + 0.5 - z) - d / 2);
      if (dd > R) continue;
      const hy = Math.max(heightAt(ii + 0.5, jj + 0.5), 0) + 0.04;
      _m.compose(_v.set(ii + 0.5, hy, jj + 0.5), _q.identity(), _s.set(1, 1, 1));
      this.grid.setMatrixAt(c, _m);
      if (fishSpot && !inFp) this.grid.setColorAt(c, _c.set(0x40a0ff));
      else if (inFp) this.grid.setColorAt(c, _c.set(bad.has(k) || !ok ? 0xff4040 : 0x50ff70));
      c++;
      if (c >= 1400) break;
    }
    this.grid.count = c;
    this.grid.instanceMatrix.needsUpdate = true; if (this.grid.instanceColor) this.grid.instanceColor.needsUpdate = true;
    const rad = def.radius || def.range;
    if (rad) this.showRadius(x, z, rad, ok ? 0x9cffb0 : 0xff9090); else this.radius.visible = false;
  }
  /** Förhandsvisning av en dragen linje (vägar/murar). */
  setLine(type, tiles, okTiles) {
    let c = 0;
    const n = G.map.n;
    for (const k of tiles) {
      const ii = k % n, jj = (k / n) | 0;
      const hy = Math.max(heightAt(ii + 0.5, jj + 0.5), 0) + 0.05;
      _m.compose(_v.set(ii + 0.5, hy, jj + 0.5), _q.identity(), _s.set(1, 1, 1));
      this.grid.setMatrixAt(c, _m);
      this.grid.setColorAt(c, _c.set(okTiles.has(k) ? 0x50ff70 : 0xff4040));
      if (++c >= 1400) break;
    }
    this.grid.count = c;
    this.grid.instanceMatrix.needsUpdate = true; if (this.grid.instanceColor) this.grid.instanceColor.needsUpdate = true;
    if (this.ghost) this.ghost.visible = false;
  }
}

function isWallAt(i, j, withGate) {
  const n = G.map.n; if (i < 0 || j < 0 || i >= n || j >= n) return false;
  const id = G.occ[j * n + i]; if (!id) return false;
  const b = G.buildings.get(id);
  return !!b && (b.def.wall || (withGate !== false && b.def.gate));
}
