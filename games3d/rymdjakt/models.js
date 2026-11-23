/**
 * Rymdjakt – procedurella skeppsmodeller. Allt byggs av Three-primitiver som slås ihop per material.
 * Framåt = −Z för alla skepp. Varje mall har info: radie, vapenfästen, cockpit, delsystem, kolliderare och kanontorn.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, glowSpriteMat, makeNoise3 } from './gfx.js';
import { makeRng } from '../../engine/kit.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const KEEP = new Set(['position', 'normal', 'uv']);

function prep(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}

/** Modellbyggare: samlar geometrier per material och slår ihop dem. */
class MB {
  constructor() { this.parts = new Map(); }
  add(mk, geo, p, r, s) {
    const g = prep(geo);
    _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); _q.setFromEuler(_e);
    _p.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1);
    _m.compose(_p, _q, _s); g.applyMatrix4(_m);
    if (!this.parts.has(mk)) this.parts.set(mk, []);
    this.parts.get(mk).push(g);
    return this;
  }
  /** Spegla (x → −x) och lägg till båda. */
  pair(mk, geoFn, p, r, s) {
    this.add(mk, geoFn(), p, r, s);
    const p2 = p ? [-p[0], p[1], p[2]] : null, r2 = r ? [r[0], -r[1], -r[2]] : null;
    this.add(mk, geoFn(true), p2, r2, s);
    return this;
  }
  build(group = new THREE.Group()) {
    for (const [mk, list] of this.parts) {
      const g = mergeGeometries(list, false);
      list.forEach(x => x.dispose());
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat(mk));
      mesh.name = 'm_' + mk;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/* -------------------------------------------------------------- Geometrihjälpare */
const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  /** Avsmalnande låda: fram (−Z) skalas med fx/fy. opt: dy (förskjutning fram), sweep (z += |x|·sweep), ct (kordavsmalning), sy (z += (y+h/2)·sy), bx/by (bakre skalning) */
  tbox(w, h, d, fx = 1, fy = 1, opt = {}) {
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (z < 0) { x *= fx; y = y * fy + (opt.dy || 0); }
      else { x *= (opt.bx || 1); y *= (opt.by || 1); }
      if (opt.ct) z *= 1 - opt.ct * Math.abs(x) / (w / 2);
      if (opt.sweep) z += Math.abs(x) * opt.sweep;
      if (opt.sy) z += (y + h / 2) * opt.sy;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  },
  /** Cylinder längs Z, rf = radie fram (−Z), rb = radie bak. */
  cylZ(rf, rb, len, seg = 12, open = false) { const g = new THREE.CylinderGeometry(rb, rf, len, seg, 1, open); g.rotateX(Math.PI / 2); return g; },
  cylY(rt, rb, h, seg = 12, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); },
  cylX(r1, r2, len, seg = 12) { const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateZ(Math.PI / 2); return g; },
  sph(r, ws = 16, hs = 12) { return new THREE.SphereGeometry(r, ws, hs); },
  hemi(r, ws = 16, hs = 8) { return new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2); },
  ico(r, d = 0) { return new THREE.IcosahedronGeometry(r, d); },
  /** Kon med spetsen mot −Z. */
  coneZ(r, len, seg = 10) { const g = new THREE.ConeGeometry(r, len, seg); g.rotateX(-Math.PI / 2); return g; },
  coneY(r, h, seg = 12) { return new THREE.ConeGeometry(r, h, seg); },
  torus(R, r, rs = 10, ts = 40) { return new THREE.TorusGeometry(R, r, rs, ts); },
  disc(r, seg = 16) { return new THREE.CircleGeometry(r, seg); }
};

/* Flamgeometri: bas i z=0, spets i z=1 (bakåt, +Z). */
let FLAME_GEO = null;
function flameGeo() {
  if (!FLAME_GEO) { FLAME_GEO = new THREE.ConeGeometry(1, 1, 12, 1, true); FLAME_GEO.rotateX(Math.PI / 2); FLAME_GEO.translate(0, 0, 0.5); }
  return FLAME_GEO;
}
function addFlame(group, pos, r, len, color = 'blue') {
  const m = new THREE.Mesh(flameGeo(), mat(color === 'blue' ? 'flameBlue' : 'flameOrange'));
  m.position.set(pos[0], pos[1], pos[2]); m.scale.set(r, r, len);
  m.userData.flame = { r, len };
  m.renderOrder = 2;
  group.add(m);
  const s = new THREE.Sprite(glowSpriteMat(color === 'blue' ? '#5ab0ff' : '#ff8a3a', 0.7, 'eng_' + color));
  s.position.set(pos[0], pos[1], pos[2] + r * 0.2); s.scale.setScalar(r * 3.2);
  s.userData.glow = r * 3.2;
  s.renderOrder = 2;
  group.add(s);
}
function navLight(group, pos, color, size = 3, blink = true) {
  const key = 'nav_' + color + (blink ? 'b' : '');
  const s = new THREE.Sprite(glowSpriteMat(color, 2.5, key));
  s.position.set(pos[0], pos[1], pos[2]); s.scale.setScalar(size);
  if (blink) s.userData.blink = true;
  group.add(s);
}

/** Kanontorn: rot → yaw → pitch. Pipan pekar mot −Z. */
function turret(kind, team, scale = 1) {
  const ally = team === 0;
  const hk = ally ? 'hullW' : 'hullD', ak = ally ? 'blue' : 'red';
  const root = new THREE.Group();
  new MB().add('dark', G.cylY(2.4, 3.0, 1.0, 10), [0, 0.5, 0]).build(root);
  const yaw = new THREE.Group(); yaw.name = 'yaw'; root.add(yaw);
  const mbY = new MB();
  if (kind === 'heavy') {
    mbY.add(hk, G.tbox(5.2, 3, 6, 0.8, 0.7), [0, 2.4, 0.5]).add(ak, G.box(5.3, 0.6, 2), [0, 3.4, 1.5]);
  } else {
    mbY.add(hk, G.tbox(3.6, 2.2, 4, 0.75, 0.7), [0, 2.0, 0.3]).add(ak, G.box(3.7, 0.4, 1), [0, 2.8, 1.2]);
  }
  mbY.build(yaw);
  const pitch = new THREE.Group(); pitch.name = 'pitch'; pitch.position.y = kind === 'heavy' ? 2.6 : 2.1; yaw.add(pitch);
  const mbP = new MB();
  if (kind === 'heavy') { mbP.add('grey', G.cylZ(0.55, 0.7, 8), [-1.2, 0, -4.5]).add('grey', G.cylZ(0.55, 0.7, 8), [1.2, 0, -4.5]).add('dark', G.cylZ(0.8, 0.8, 1.2), [-1.2, 0, -8.6]).add('dark', G.cylZ(0.8, 0.8, 1.2), [1.2, 0, -8.6]); }
  else { mbP.add('grey', G.cylZ(0.3, 0.4, 5), [-0.6, 0, -3]).add('grey', G.cylZ(0.3, 0.4, 5), [0.6, 0, -3]); }
  mbP.build(pitch);
  root.userData.turret = { kind, muzzle: kind === 'heavy' ? 9.2 : 5.6 };
  root.scale.setScalar(scale);
  return root;
}

/** Lägg till delsystemsnod. */
function subNode(group, info, name, type, pos, r, hp, buildFn, extra = {}) {
  const node = new THREE.Group();
  node.name = 'sub_' + info.subs.length;
  node.position.set(pos[0], pos[1], pos[2]);
  if (buildFn) buildFn(node);
  group.add(node);
  info.subs.push(Object.assign({ name, type, pos: pos.slice(), r, hp, node: node.name }, extra));
  return node;
}
function addTurret(group, info, kind, team, pos, opts = {}) {
  const t = turret(kind, team, opts.scale || (kind === 'heavy' ? 1.6 : 1.3));
  t.name = 'sub_' + info.subs.length;
  t.position.set(pos[0], pos[1], pos[2]);
  if (opts.up) { const up = new THREE.Vector3(...opts.up).normalize(); t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up); }
  else if (opts.down) t.rotation.z = Math.PI;
  group.add(t);
  const sc = opts.scale || (kind === 'heavy' ? 1.6 : 1.3);
  info.subs.push({ name: kind === 'heavy' ? 'Tungt kanontorn' : 'Kanontorn', type: 'turret', kind, pos: pos.slice(), r: (kind === 'heavy' ? 6 : 4) * sc, hp: opts.hp || (kind === 'heavy' ? 260 : 130), node: t.name });
}
function greeble(mb, rng, mk, n, x0, x1, y, z0, z1, smin = 1, smax = 4, dir = 1) {
  for (let i = 0; i < n; i++) {
    const w = smin + rng() * (smax - smin), d = smin + rng() * (smax - smin), h = 0.5 + rng() * smax * 0.5;
    mb.add(mk, G.box(w, h, d), [x0 + rng() * (x1 - x0), y + dir * h / 2, z0 + rng() * (z1 - z0)]);
  }
}
function newInfo(radius) { return { radius, hardpoints: [], cockpit: [0, 1, -1], subs: [], colliders: [], camDist: radius * 2.4, camUp: radius * 0.55, tail: null }; }

/* ============================================================== Spelarskepp */
function buildSvala(trim = 'gold') {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(6);
  mb.add('hullW', G.tbox(2.2, 1.5, 8, 0.35, 0.45, { dy: -0.15 }));
  mb.add('hullW', G.coneZ(0.42, 2.2, 8), [0, -0.15, -5.05]);
  mb.add('glass', G.sph(1, 14, 10), [0, 0.62, -1.6], null, [0.72, 0.55, 1.75]);
  mb.add(trim, G.box(0.32, 0.1, 5.5), [0, 0.78, 1.4]);
  mb.add('hullW', G.tbox(10.5, 0.22, 3.4, 1, 1, { ct: 0.45, sweep: 0.2 }), [0, -0.25, 1.0]);
  mb.pair('grey', () => G.cylZ(0.2, 0.26, 2.4), [5.0, -0.25, 2.0]);
  mb.pair(trim, () => G.cylZ(0.27, 0.27, 0.5), [5.0, -0.25, 1.4]);
  mb.pair('blue', () => G.box(2.0, 0.25, 0.45), [3.0, -0.24, 1.95]);
  mb.pair('grey', () => G.cylZ(0.72, 0.8, 3.8), [1.05, -0.05, 3.7]);
  mb.pair('dark', () => G.cylZ(0.84, 0.7, 0.6), [1.05, -0.05, 5.8]);
  mb.pair('glowBlue', () => G.disc(0.62), [1.05, -0.05, 6.12]);
  mb.pair('hullW', () => G.tbox(0.16, 2.0, 2.4, 1, 1, { sy: 0.7 }), [1.25, 1.1, 3.6], [0, 0, -0.3]);
  mb.pair(trim, () => G.box(0.18, 0.4, 1.0), [1.45, 1.75, 4.4], [0, 0, -0.3]);
  mb.pair('dark', () => G.box(0.7, 0.6, 1.8), [1.25, -0.15, -0.4]);
  mb.pair('dark', () => G.cylZ(0.12, 0.14, 2.6), [2.5, -0.4, -0.7]);
  mb.build(g);
  addFlame(g, [1.05, -0.05, 6.1], 0.55, 3.6, 'blue'); addFlame(g, [-1.05, -0.05, 6.1], 0.55, 3.6, 'blue');
  navLight(g, [5.05, -0.25, 3.6], '#ff3030', 1.2); navLight(g, [-5.05, -0.25, 3.6], '#30ff60', 1.2);
  info.hardpoints = [[-2.5, -0.4, -2.0], [2.5, -0.4, -2.0]];
  info.cockpit = [0, 0.78, -1.6];
  info.wingtips = [[-5.1, -0.25, 3.0], [5.1, -0.25, 3.0]];
  info.engines = [[-1.05, -0.05, 6.2], [1.05, -0.05, 6.2]];
  info.camDist = 22; info.camUp = 5;
  return { group: g, info };
}
function buildFalk() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(6);
  mb.add('hullW', G.tbox(1.6, 1.3, 10, 0.25, 0.35, { dy: -0.1 }), [0, 0, 0.5]);
  mb.add('hullW', G.coneZ(0.32, 2.8, 8), [0, -0.1, -5.9]);
  mb.add('glass', G.sph(1, 14, 10), [0, 0.5, -2.0], null, [0.55, 0.48, 1.6]);
  mb.add('hullW', G.tbox(9.2, 0.18, 5, 1, 1, { ct: 0.75, sweep: 0.5 }), [0, -0.15, 2.6]);
  mb.add('hullW', G.tbox(3.4, 0.12, 1.2, 1, 1, { ct: 0.5, sweep: 0.4 }), [0, 0, -3.2]);
  mb.add('grey', G.cylZ(1.0, 1.1, 3.2), [0, 0, 5.3]);
  mb.add('dark', G.cylZ(1.15, 0.95, 0.6), [0, 0, 7.1]);
  mb.add('glowBlue', G.disc(0.85), [0, 0, 7.42]);
  mb.add('hullW', G.tbox(0.15, 2.0, 2.6, 1, 1, { sy: 0.9 }), [0, 1.35, 4.2]);
  mb.add('gold', G.box(0.26, 0.08, 7), [0, 0.67, 0.5]);
  mb.pair('gold', () => G.box(1.6, 0.2, 0.35), [3.3, -0.14, 4.3], [0, -0.45, 0]);
  mb.pair('blue', () => G.box(0.2, 0.9, 1.4), [0.82, 0, 2.5]);
  mb.pair('dark', () => G.cylZ(0.1, 0.12, 2.2), [0.95, -0.3, -2.6]);
  mb.build(g);
  addFlame(g, [0, 0, 7.4], 0.8, 4.8, 'blue');
  navLight(g, [4.6, -0.15, 5.3], '#ff3030', 1.1); navLight(g, [-4.6, -0.15, 5.3], '#30ff60', 1.1);
  info.hardpoints = [[-0.95, -0.35, -3.8], [0.95, -0.35, -3.8]];
  info.cockpit = [0, 0.65, -2.0];
  info.wingtips = [[-4.6, -0.15, 5.0], [4.6, -0.15, 5.0]];
  info.engines = [[0, 0, 7.5]];
  info.camDist = 21; info.camUp = 4.8;
  return { group: g, info };
}
function buildOrn() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(7.5);
  mb.add('hullW', G.tbox(3.4, 2.0, 10, 0.45, 0.5, { dy: -0.2 }));
  mb.add('hullW', G.coneZ(0.75, 2.4, 8), [0, -0.25, -6.2]);
  mb.add('glass', G.sph(1, 14, 10), [0, 0.95, -2.2], null, [0.95, 0.6, 1.9]);
  mb.add('hullW', G.tbox(13.5, 0.42, 3.8, 1, 1, { ct: 0.35, sweep: 0.05 }), [0, -0.2, 1.2]);
  mb.pair('hullW', () => G.cylZ(1.1, 1.25, 8.5), [3.7, -0.2, 1.9]);
  mb.pair('dark', () => G.cylZ(1.18, 1.18, 0.5), [3.7, -0.2, -2.45]);
  mb.pair('dark', () => G.cylZ(1.3, 1.05, 0.7), [3.7, -0.2, 6.4]);
  mb.pair('glowBlue', () => G.disc(0.95), [3.7, -0.2, 6.78]);
  mb.pair('grey', () => G.cylZ(0.36, 0.36, 3.2), [5.9, -0.75, 0.6]);
  mb.pair('red', () => G.coneZ(0.36, 0.9), [5.9, -0.75, -1.45]);
  mb.pair('blue', () => G.box(3.0, 0.45, 1.3), [2.0, -0.18, 1.5]);
  mb.pair('gold', () => G.box(0.6, 0.46, 3.0), [6.4, -0.2, 1.6]);
  mb.pair('hullW', () => G.tbox(0.2, 2.2, 2.6, 1, 1, { sy: 0.8 }), [3.7, 1.4, 4.6]);
  mb.add('gold', G.box(0.4, 0.1, 6), [0, 1.02, 1.5]);
  mb.pair('dark', () => G.cylZ(0.16, 0.18, 3.2), [3.7, -0.8, -3.0]);
  mb.add('dark', G.cylZ(0.18, 0.2, 2.6), [0, -1.1, -4.6]);
  mb.build(g);
  addFlame(g, [3.7, -0.2, 6.75], 0.9, 4.2, 'blue'); addFlame(g, [-3.7, -0.2, 6.75], 0.9, 4.2, 'blue');
  navLight(g, [6.8, -0.2, 2.8], '#ff3030', 1.3); navLight(g, [-6.8, -0.2, 2.8], '#30ff60', 1.3);
  info.hardpoints = [[-3.7, -0.8, -4.6], [3.7, -0.8, -4.6], [0, -1.1, -5.9]];
  info.cockpit = [0, 1.1, -2.2];
  info.wingtips = [[-6.8, -0.2, 2.6], [6.8, -0.2, 2.6]];
  info.engines = [[-3.7, -0.2, 6.9], [3.7, -0.2, 6.9]];
  info.camDist = 26; info.camUp = 6;
  return { group: g, info };
}

/* ============================================================== Fiendejakt */
function buildHugg() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(5.5);
  mb.add('hullD', G.ico(1.7, 1), [0, 0, 0.5], null, [1, 0.75, 1.4]);
  mb.add('glassRed', G.sph(0.65, 12, 8), [0, 0.1, -1.55], null, [1, 0.7, 0.6]);
  mb.pair('rust', () => G.tbox(0.9, 0.55, 6.5, 0.3, 0.6), [2.1, 0, -1.4], [0, 0.2, 0]);
  mb.pair('dark', () => G.coneZ(0.28, 1.6, 6), [1.45, 0, -5.3], [0, 0.2, 0]);
  mb.pair('red', () => G.box(0.95, 0.6, 1.0), [2.3, 0, 0.6], [0, 0.2, 0]);
  mb.add('dark', G.tbox(0.2, 2.2, 3.0, 1, 1, { sy: 0.9 }), [0, 1.3, 1.6]);
  mb.add('dark', G.tbox(0.2, 2.2, 3.0, 1, 1, { sy: 0.9 }), [0, -1.3, 1.6], [0, 0, Math.PI]);
  mb.add('dark', G.cylZ(0.8, 1.0, 2.2), [0, 0, 3.0]);
  mb.add('glowOrange', G.disc(0.75), [0, 0, 4.12]);
  mb.build(g);
  addFlame(g, [0, 0, 4.1], 0.7, 3.2, 'orange');
  info.hardpoints = [[-1.5, 0, -4.4], [1.5, 0, -4.4]];
  info.engines = [[0, 0, 4.2]];
  return { group: g, info };
}
function buildSpjut() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(5);
  mb.add('hullD', G.tbox(1.3, 1.1, 10, 0.2, 0.2));
  mb.add('red', G.coneZ(0.26, 3, 6), [0, 0, -6.5]);
  mb.add('glassRed', G.sph(0.4, 10, 8), [0, 0.42, -2.2], null, [1, 0.8, 2]);
  for (let k = 0; k < 4; k++) {
    const fin = G.tbox(0.14, 2.8, 3.6, 1, 1, { sy: 0.75 }); fin.translate(0, 1.9, 0);
    mb.add(k % 2 ? 'rust' : 'hullD', fin, [0, 0, 3.0], [0, 0, Math.PI / 4 + k * Math.PI / 2]);
  }
  mb.pair('red', () => G.cylZ(0.18, 0.18, 2.6), [0.95, -0.55, 0]);
  mb.add('dark', G.cylZ(0.6, 0.75, 2), [0, 0, 5.6]);
  mb.add('glowOrange', G.disc(0.58), [0, 0, 6.62]);
  mb.build(g);
  addFlame(g, [0, 0, 6.6], 0.55, 4.2, 'orange');
  info.hardpoints = [[-0.7, -0.2, -4.4], [0.7, -0.2, -4.4]];
  info.engines = [[0, 0, 6.7]];
  return { group: g, info };
}
function buildTordon() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(9);
  mb.add('hullD', G.tbox(4.6, 3.0, 12, 0.55, 0.55, { dy: 0.2 }));
  mb.add('glassRed', G.sph(1, 12, 8), [0, 1.0, -5.4], null, [1.2, 0.75, 1.2]);
  mb.add('red', G.box(2.4, 0.8, 7), [0, -1.7, 0]);
  mb.add('dark', G.cylZ(0.5, 0.5, 6), [-0.6, -2.0, 0]).add('dark', G.cylZ(0.5, 0.5, 6), [0.6, -2.0, 0]);
  mb.add('rust', G.tbox(12, 0.5, 4, 1, 1, { ct: 0.45, sweep: 0.12 }), [0, 0, 1.2]);
  mb.pair('hullD', () => G.cylZ(1.1, 1.25, 4.4), [1.7, 0, 6.6]);
  mb.pair('glowOrange', () => G.disc(1.0), [1.7, 0, 8.85]);
  mb.add('dark', G.hemi(0.9), [0, 1.5, 4.4]);
  mb.add('grey', G.cylZ(0.15, 0.15, 1.6), [0, 2.0, 5.4]);
  mb.pair('dark', () => G.tbox(0.25, 2.6, 2.4, 1, 1, { sy: 0.6 }), [5.6, 1.0, 2.6]);
  greeble(mb, makeRng(3), 'grey', 10, -1.8, 1.8, 1.5, -2, 4, 0.3, 1.1);
  mb.build(g);
  addFlame(g, [1.7, 0, 8.8], 0.9, 3.6, 'orange'); addFlame(g, [-1.7, 0, 8.8], 0.9, 3.6, 'orange');
  info.hardpoints = [[-1.4, -0.6, -6.2], [1.4, -0.6, -6.2]];
  info.engines = [[-1.7, 0, 9], [1.7, 0, 9]];
  info.tail = [0, 2.0, 6.0];
  return { group: g, info };
}

/* ============================================================== Små föremål */
function buildDrone() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(3.5);
  mb.add('gold', G.sph(1.5, 14, 10));
  mb.add('dark', G.torus(2.4, 0.22, 6, 24), null, [Math.PI / 2, 0, 0]);
  mb.add('dark', G.box(0.4, 0.4, 4.8)).add('dark', G.box(4.8, 0.4, 0.4));
  mb.build(g);
  navLight(g, [0, 1.6, 0], '#ff5020', 2.4);
  return { group: g, info };
}
function buildMine() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(4);
  mb.add('dark', G.sph(2.2, 12, 8));
  mb.add('red', G.torus(2.2, 0.25, 6, 20), null, [Math.PI / 2, 0, 0]);
  const dirs = [[0, 0, 0], [Math.PI, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0]];
  for (const r of dirs) { const c = G.coneZ(0.45, 1.8, 6); c.translate(0, 0, -2.6); mb.add('grey', c, null, r); }
  mb.build(g);
  const s = new THREE.Sprite(glowSpriteMat('#ff2a10', 3, 'mineBlink')); s.scale.setScalar(5); s.userData.mineBlink = true; g.add(s);
  return { group: g, info };
}
function buildContainer() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(8);
  mb.add('rust', G.box(5, 5, 11));
  for (const z of [-4.5, 0, 4.5]) mb.add('grey', G.box(5.4, 5.4, 0.5), [0, 0, z]);
  mb.build(g);
  return { group: g, info };
}
function buildGate() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(140);
  mb.add('grey', G.torus(130, 9, 10, 64));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    mb.add('hullWPlain', G.box(16, 30, 22), [Math.cos(a) * 134, Math.sin(a) * 134, 0], [0, 0, a]);
    mb.add('glowCyan', G.box(4, 32, 23), [Math.cos(a) * 134, Math.sin(a) * 134, 0], [0, 0, a]);
  }
  mb.build(g);
  const portal = new THREE.Mesh(new THREE.CircleGeometry(120, 48), mat('holo'));
  portal.name = 'portal'; g.add(portal);
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; navLight(g, [Math.cos(a) * 140, Math.sin(a) * 140, 0], '#60d0ff', 14); }
  info.colliders = [];
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; info.colliders.push([Math.cos(a) * 132, Math.sin(a) * 132, 0, 16]); }
  return { group: g, info };
}

/* ============================================================== Civila / allierade stora skepp */
function buildFrakt() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(44);
  const rng = makeRng(11);
  mb.add('hullWPlain', G.tbox(11, 8, 14, 0.6, 0.6), [0, 0, -33]);
  mb.add('glass', G.box(6, 1.3, 0.5), [0, 1.6, -40.0], [-0.5, 0, 0]);
  mb.add('grey', G.box(3, 3, 58), [0, 0, 0]);
  const cols = ['blue', 'rust', 'gold', 'grey', 'blue', 'red'];
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
    if (rng() < 0.15) continue;
    mb.add(cols[Math.floor(rng() * cols.length)], G.box(6.5, 6.5, 8.6), [sx * 4.9, 0, -21 + i * 9.4]);
    if (rng() < 0.7) mb.add(cols[Math.floor(rng() * cols.length)], G.box(6.5, 6, 8.6), [sx * 4.9, 6.6, -21 + i * 9.4]);
  }
  mb.add('hullWPlain', G.box(13, 11, 11), [0, 0, 32]);
  for (const p of [[-3.6, -1.8], [3.6, -1.8], [0, 2.8]]) {
    mb.add('dark', G.cylZ(2.0, 2.4, 3.4), [p[0], p[1], 38.6]);
    mb.add('glowBlue', G.disc(1.8), [p[0], p[1], 40.35]);
  }
  mb.add('blue', G.box(11.2, 1.2, 14.2), [0, -2.2, -33]);
  mb.build(g);
  for (const p of [[-3.6, -1.8], [3.6, -1.8], [0, 2.8]]) addFlame(g, [p[0], p[1], 40.3], 1.7, 9, 'blue');
  navLight(g, [5.6, 3, -36], '#ff3030', 3); navLight(g, [-5.6, 3, -36], '#30ff60', 3); navLight(g, [0, 6, 37], '#ffffff', 3);
  info.colliders = [[0, 0, -33, 8], [0, 2, -16, 9], [0, 2, 0, 9], [0, 2, 16, 9], [0, 0, 32, 9]];
  info.engines = [[0, 0, 41]];
  return { group: g, info };
}
function buildFarja() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(20);
  mb.add('hullW', G.tbox(8, 5, 26, 0.35, 0.5, { dy: -0.4 }), [0, 0, 0]);
  mb.add('glass', G.box(4.4, 1.2, 4), [0, 1.9, -9], [-0.35, 0, 0]);
  mb.add('gold', G.box(8.1, 0.6, 20), [0, -0.3, 2]);
  mb.pair('hullW', () => G.tbox(9, 0.5, 6, 1, 1, { ct: 0.5, sweep: 0.3 }), [5, -1, 6]);
  mb.pair('grey', () => G.cylZ(1.4, 1.6, 7), [4.2, 0.6, 10]);
  mb.pair('glowBlue', () => G.disc(1.3), [4.2, 0.6, 13.55]);
  mb.add('hullW', G.tbox(0.4, 4, 5, 1, 1, { sy: 0.8 }), [0, 4, 10]);
  mb.add('blue', G.box(0.45, 1.2, 3), [0, 5.2, 11.5]);
  mb.build(g);
  addFlame(g, [4.2, 0.6, 13.5], 1.2, 6, 'blue'); addFlame(g, [-4.2, 0.6, 13.5], 1.2, 6, 'blue');
  navLight(g, [9, -1, 8], '#ff3030', 2); navLight(g, [-9, -1, 8], '#30ff60', 2);
  info.colliders = [[0, 0, -7, 6], [0, 0, 4, 7], [0, 1, 11, 6]];
  info.engines = [[0, 0, 14]];
  return { group: g, info };
}
function buildVaktare() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(100);
  const rng = makeRng(21);
  mb.add('hullWBig', G.tbox(30, 18, 150, 0.35, 0.55, { dy: -2 }), [0, 0, 0]);
  mb.add('hullWPlain', G.tbox(16, 14, 40, 0.6, 1), [0, 14, 30]);
  mb.add('glass', G.box(17, 2.2, 4), [0, 19, 8]);
  mb.add('blue', G.box(31, 3, 50), [0, -4, 20]);
  mb.add('gold', G.box(2, 18.4, 30), [0, 0, -40]);
  mb.add('hullWPlain', G.box(36, 20, 20), [0, 0, 80]);
  for (const p of [[-10, -5], [10, -5], [-10, 5], [10, 5]]) { mb.add('dark', G.cylZ(4, 4.8, 6), [p[0], p[1], 92]); mb.add('glowBlue', G.disc(3.8), [p[0], p[1], 95.1]); }
  greeble(mb, rng, 'grey', 40, -10, 10, 9, -50, 60, 1, 4);
  mb.build(g);
  for (const p of [[-10, -5], [10, -5], [-10, 5], [10, 5]]) addFlame(g, [p[0], p[1], 95], 3.6, 22, 'blue');
  addTurret(g, info, 'laser', 0, [-9, 9, -30]); addTurret(g, info, 'laser', 0, [9, 9, -30]);
  addTurret(g, info, 'laser', 0, [0, -10, -10], { down: true }); addTurret(g, info, 'heavy', 0, [0, 21, 46]);
  navLight(g, [17, 0, 70], '#ff3030', 5); navLight(g, [-17, 0, 70], '#30ff60', 5); navLight(g, [0, 26, 40], '#ffffff', 5);
  info.colliders = [[0, 0, -60, 9], [0, 0, -35, 13], [0, 0, -10, 15], [0, 2, 15, 16], [0, 4, 40, 17], [0, 0, 65, 15], [0, 0, 82, 14], [0, 15, 30, 12]];
  info.engines = [[0, 0, 96]];
  return { group: g, info };
}
function buildStation() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(300);
  const rng = makeRng(42);
  mb.add('hullWBig', G.cylY(60, 60, 170, 24), [0, 0, 0]);
  mb.add('hullWPlain', G.coneY(60, 50, 24), [0, 110, 0]);
  mb.add('hullWPlain', G.coneY(60, 50, 24), [0, -110, 0], [Math.PI, 0, 0]);
  mb.add('grey', G.cylY(12, 12, 120, 12), [0, 175, 0]);
  mb.add('hullWBig', G.cylY(22, 22, 30, 12), [0, 225, 0]);
  mb.add('grey', G.cylY(4, 4, 70, 8), [0, -170, 0]);
  mb.add('dark', G.sph(30, 20, 10, 0), [0, -215, 0], null, [1, 0.3, 1]);
  mb.add('hullWBig', G.torus(240, 22, 12, 72), null, [Math.PI / 2, 0, 0]);
  mb.add('blue', G.torus(240, 22.6, 6, 72), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.25]);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    mb.add('grey', G.cylX(9, 9, 185, 10), [Math.cos(a) * 150, 0, Math.sin(a) * 150], [0, -a, 0]);
    // solpaneler
    const sx = Math.cos(a + Math.PI / 4), sz = Math.sin(a + Math.PI / 4);
    mb.add('grey', G.cylX(3, 3, 330, 6), [sx * 165, -75, sz * 165], [0, -(a + Math.PI / 4), 0]);
    for (let k = 0; k < 3; k++) mb.add('solar', G.box(80, 1.5, 46), [sx * (110 + k * 85), -75, sz * (110 + k * 85)], [0, -(a + Math.PI / 4), 0]);
  }
  mb.add('gold', G.box(122, 6, 122), [0, 60, 0], [0, Math.PI / 4, 0], [0.98, 1, 0.98]);
  greeble(mb, rng, 'grey', 60, -45, 45, 85, -45, 45, 3, 10);
  mb.build(g);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    addTurret(g, info, i % 3 === 0 ? 'heavy' : 'laser', 0, [Math.cos(a) * 240, 22, Math.sin(a) * 240], { scale: i % 3 === 0 ? 2.4 : 2.2, hp: 260 });
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; navLight(g, [Math.cos(a) * 262, 0, Math.sin(a) * 262], i % 2 ? '#ffffff' : '#ff3030', 9); }
  navLight(g, [0, 245, 0], '#ff3030', 14);
  info.colliders = [[0, 0, 0, 62], [0, 70, 0, 60], [0, -70, 0, 60], [0, 130, 0, 35], [0, 180, 0, 18], [0, 225, 0, 26], [0, -180, 0, 25]];
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; info.colliders.push([Math.cos(a) * 240, 0, Math.sin(a) * 240, 25]); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; for (const r of [90, 150, 200]) info.colliders.push([Math.cos(a) * r, 0, Math.sin(a) * r, 11]); }
  return { group: g, info };
}

/* ============================================================== Fiendens stora skepp */
function buildBastion() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(42);
  const rng = makeRng(5);
  mb.add('hullDBig', G.tbox(16, 10, 56, 0.4, 0.5), [0, 0, 0]);
  mb.add('hullDPlain', G.box(8, 6, 16), [0, 7, 8]);
  mb.add('glassRed', G.box(10.2, 1.4, 5), [0, 10.4, 4]);
  mb.add('hullDPlain', G.box(10, 2.5, 5.2), [0, 11.8, 4]);
  mb.add('red', G.box(16.4, 2, 20), [0, -1, -6]);
  mb.pair('rust', () => G.tbox(10, 1.2, 12, 1, 1, { ct: 0.5, sweep: 0.4 }), [11, -2, 14]);
  greeble(mb, rng, 'dark', 26, -6, 6, 5, -24, 22, 0.6, 2.4);
  mb.build(g);
  subNode(g, info, 'Motorer', 'engine', [0, 0, 32], 10, 380, n => {
    const m = new MB(); m.add('dark', G.box(18, 12, 10));
    for (const p of [[-5, -2], [5, -2], [0, 3]]) { m.add('grey', G.cylZ(2.2, 2.6, 3), [p[0], p[1], 6]); m.add('glowOrange', G.disc(2.0), [p[0], p[1], 7.55]); }
    m.build(n);
    for (const p of [[-5, -2], [5, -2], [0, 3]]) addFlame(n, [p[0], p[1], 7.5], 1.9, 10, 'orange');
  });
  addTurret(g, info, 'laser', 1, [0, 5.2, -14]);
  addTurret(g, info, 'laser', 1, [0, -5.2, -4], { down: true });
  navLight(g, [8.2, 0, 26], '#ff3030', 3); navLight(g, [-8.2, 0, 26], '#ff3030', 3);
  info.colliders = [[0, 0, -22, 6], [0, 0, -10, 8], [0, 2, 4, 10], [0, 0, 18, 10], [0, 0, 32, 10]];
  return { group: g, info };
}
function buildKlyvare() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(100);
  const rng = makeRng(8);
  mb.pair('hullDPlain', () => G.tbox(12, 14, 70, 0.3, 0.6), [11, 0, -55]);
  mb.pair('red', () => G.box(12.4, 3, 30), [11, 0, -40]);
  mb.add('hullDBig', G.box(30, 18, 90), [0, 0, 10]);
  mb.add('hullDBig', G.tbox(14, 20, 24, 0.7, 1), [0, 18, 20]);
  mb.add('glassRed', G.box(14.4, 2, 6), [0, 24, 9]);
  mb.add('dark', G.cylY(1.2, 1.2, 14), [0, 35, 26]);
  mb.add('rust', G.box(30.6, 4, 40), [0, -6, 20]);
  greeble(mb, rng, 'dark', 50, -13, 13, 9, -30, 52, 1, 4);
  greeble(mb, rng, 'dark', 30, -13, 13, -9, -30, 52, 1, 3, -1);
  mb.build(g);
  subNode(g, info, 'Sköldgenerator', 'shield', [0, 30, 36], 9, 420, n => {
    new MB().add('grey', G.cylY(3, 5, 8), [0, -4, 0]).add('shieldGenRed', G.sph(7, 16, 12), [0, 3, 0]).build(n);
  });
  subNode(g, info, 'Motorer', 'engine', [0, 0, 63], 14, 600, n => {
    const m = new MB(); m.add('dark', G.box(34, 20, 16));
    for (const p of [[-9, -5], [9, -5], [-9, 5], [9, 5]]) { m.add('grey', G.cylZ(3.6, 4.2, 4), [p[0], p[1], 9]); m.add('glowOrange', G.disc(3.3), [p[0], p[1], 11.05]); }
    m.build(n);
    for (const p of [[-9, -5], [9, -5], [-9, 5], [9, 5]]) addFlame(n, [p[0], p[1], 11], 3.2, 18, 'orange');
  });
  subNode(g, info, 'Bryggan', 'bridge', [0, 24, 9], 8, 500);
  addTurret(g, info, 'laser', 1, [-10, 9, -18]); addTurret(g, info, 'laser', 1, [10, 9, -18]);
  addTurret(g, info, 'laser', 1, [0, 9, 44]); addTurret(g, info, 'laser', 1, [0, -9, 0], { down: true });
  addTurret(g, info, 'heavy', 1, [0, -9, -30], { down: true });
  navLight(g, [16, 0, 50], '#ff3030', 5); navLight(g, [-16, 0, 50], '#ff3030', 5); navLight(g, [0, 42, 26], '#ff3030', 5);
  info.colliders = [[11, 0, -82, 6], [-11, 0, -82, 6], [11, 0, -62, 8], [-11, 0, -62, 8], [11, 0, -40, 9], [-11, 0, -40, 9],
    [0, 0, -25, 14], [0, 0, 0, 15], [0, 0, 25, 15], [0, 0, 48, 15], [0, 0, 63, 13], [0, 18, 20, 13]];
  return { group: g, info };
}
function buildFangskepp() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(72);
  const rng = makeRng(13);
  mb.add('hullDPlain', G.tbox(14, 12, 24, 0.5, 0.6), [0, 0, -50]);
  mb.add('glassRed', G.box(9, 1.4, 1), [0, 3, -62], [-0.4, 0, 0]);
  mb.add('dark', G.box(5, 5, 100), [0, 0, 0]);
  for (let i = 0; i < 6; i++) {
    mb.add('rust', G.box(18, 9, 10), [0, 0, -30 + i * 12]);
    mb.add('glowGold', G.box(18.2, 1, 6), [0, 1.5, -30 + i * 12]);
  }
  greeble(mb, rng, 'grey', 30, -8, 8, 4.5, -36, 40, 1, 3);
  mb.build(g);
  for (const sx of [-1, 1]) subNode(g, info, sx < 0 ? 'Vänster motor' : 'Höger motor', 'engine', [sx * 13, 0, 46], 9, 420, n => {
    const m = new MB(); m.add('dark', G.cylZ(6, 7, 22)).add('grey', G.box(10, 2, 8), [-sx * 6, 0, 0]);
    m.add('glowOrange', G.disc(5.5), [0, 0, 11.05]); m.build(n);
    addFlame(n, [0, 0, 11], 5, 22, 'orange');
  });
  addTurret(g, info, 'laser', 1, [0, 6, -46]); addTurret(g, info, 'laser', 1, [0, -6, 20], { down: true });
  navLight(g, [0, 8, 40], '#ff3030', 5);
  info.colliders = [[0, 0, -52, 9], [0, 0, -30, 10], [0, 0, -6, 10], [0, 0, 18, 10], [0, 0, 36, 9], [13, 0, 46, 8], [-13, 0, 46, 8]];
  return { group: g, info };
}
function buildDomare() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(230);
  const rng = makeRng(17);
  mb.add('hullDBig', G.tbox(70, 34, 380, 0.22, 0.45), [0, 0, 0]);
  mb.add('hullDPlain', G.tbox(26, 20, 240, 0.4, 1), [0, 24, 40]);
  mb.add('hullDBig', G.box(30, 40, 40), [0, 50, 120]);
  mb.add('hullDPlain', G.box(34, 8, 14), [0, 74, 108]);
  mb.add('red', G.box(70.5, 6, 120), [0, -4, 90]);
  mb.add('red', G.tbox(36, 4, 160, 0.4, 1), [0, 17.5, -100]);
  mb.pair('rust', () => G.tbox(40, 4, 70, 1, 1, { ct: 0.6, sweep: 0.5 }), [50, -6, 130]);
  mb.add('dark', G.cylY(2, 2, 40), [0, 90, 125]);
  mb.add('dark', G.box(12, 2, 2), [0, 104, 125]);
  greeble(mb, rng, 'dark', 120, -26, 26, 17, -120, 180, 2, 9);
  greeble(mb, rng, 'dark', 70, -28, 28, -17, -100, 180, 2, 8, -1);
  greeble(mb, rng, 'grey', 40, -11, 11, 34, -60, 150, 1, 5);
  mb.build(g);
  for (const sx of [-1, 1]) subNode(g, info, sx < 0 ? 'Sköldgenerator (babord)' : 'Sköldgenerator (styrbord)', 'shield', [sx * 34, 26, 50], 14, 700, n => {
    new MB().add('grey', G.cylY(5, 8, 14), [0, -6, 0]).add('shieldGenRed', G.sph(12, 18, 12), [0, 6, 0]).add('dark', G.torus(13, 1.5, 6, 24), [0, 6, 0], [Math.PI / 2, 0, 0]).build(n);
  });
  subNode(g, info, 'Motorsektionen', 'engine', [0, 0, 205], 32, 1200, n => {
    const m = new MB(); m.add('dark', G.box(80, 44, 40));
    for (const p of [[-24, -10], [24, -10], [-24, 10], [24, 10], [0, 0]]) { m.add('grey', G.cylZ(8, 10, 8), [p[0], p[1], 24]); m.add('glowOrange', G.disc(8), [p[0], p[1], 28.1]); }
    m.build(n);
    for (const p of [[-24, -10], [24, -10], [-24, 10], [24, 10], [0, 0]]) addFlame(n, [p[0], p[1], 28], 8, 55, 'orange');
  });
  subNode(g, info, 'Hangaren', 'hangar', [0, -21, -30], 16, 800, n => {
    new MB().add('dark', G.box(40, 8, 34)).add('glowOrange', G.box(30, 0.5, 26), [0, -4.2, 0]).build(n);
  });
  subNode(g, info, 'Bryggan', 'bridge', [0, 74, 101], 12, 900);
  const T = [[-20, 17, -90, 'laser'], [20, 17, -90, 'laser'], [-26, 17, -20, 'laser'], [26, 17, -20, 'laser'], [0, 37, 0, 'laser'],
    [-30, -17, -60, 'laser', 1], [30, -17, -60, 'laser', 1], [-30, 19, 100, 'heavy'], [30, 19, 100, 'heavy'], [0, -17, 140, 'laser', 1]];
  for (const t of T) addTurret(g, info, t[3], 1, [t[0], t[1], t[2]], { down: !!t[4], scale: t[3] === 'heavy' ? 2.2 : 1.7, hp: t[3] === 'heavy' ? 380 : 170 });
  for (let z = -150; z <= 150; z += 60) { navLight(g, [35 * (0.3 + 0.7 * (z + 190) / 380) + 2, 0, z], '#ff3030', 8); navLight(g, [-35 * (0.3 + 0.7 * (z + 190) / 380) - 2, 0, z], '#ff3030', 8); }
  for (let z = -170; z <= 180; z += 35) { const hw = 35 * (0.22 + 0.78 * (z + 190) / 380); info.colliders.push([0, 0, z, Math.max(10, Math.min(30, hw * 0.75))]); }
  info.colliders.push([0, 24, -40, 14], [0, 24, 20, 15], [0, 24, 80, 16], [0, 50, 120, 25], [0, 74, 108, 12]);
  info.colliders.push([-34, 26, 50, 14], [34, 26, 50, 14], [0, 0, 205, 30], [-28, 0, 205, 22], [28, 0, 205, 22]);
  return { group: g, info };
}
function buildModern() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(650);
  const rng = makeRng(23);
  mb.add('hullDBig', G.cylZ(40, 75, 1000, 16), [0, 0, 0]);
  mb.add('hullDPlain', G.coneZ(40, 220, 16), [0, 0, -610]);
  mb.add('red', G.cylZ(76, 76, 40, 16), [0, 0, 300]);
  mb.add('red', G.cylZ(52, 52, 30, 16), [0, 0, -300]);
  mb.add('hullDPlain', G.torus(300, 28, 12, 64));
  mb.add('rust', G.torus(300, 29, 6, 64), null, null, [1, 1, 0.3]);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    mb.add('hullDPlain', G.box(250, 20, 30), [Math.cos(a) * 170, Math.sin(a) * 170, 0], [0, 0, a]);
  }
  // reaktorbur
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mb.add('dark', G.box(10, 10, 160), [Math.cos(a) * 95, Math.sin(a) * 95, 380]); }
  mb.add('dark', G.torus(98, 7, 8, 32), [0, 0, 310]); mb.add('dark', G.torus(98, 7, 8, 32), [0, 0, 450]);
  mb.add('hullDBig', G.box(220, 160, 90), [0, 0, 540]);
  greeble(mb, rng, 'dark', 140, -30, 30, 55, -480, 280, 4, 18);
  greeble(mb, rng, 'dark', 100, -30, 30, -55, -480, 280, 4, 16, -1);
  mb.build(g);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const p = [Math.cos(a) * 300, Math.sin(a) * 300, 0];
    const n = subNode(g, info, 'Hangarkapsel ' + (i + 1), 'hangar', p, 48, 900, nn => {
      new MB().add('hullDBig', G.box(90, 60, 110)).add('glowOrange', G.box(60, 30, 1), [0, 0, -55.6]).add('red', G.box(92, 8, 112), [0, 26, 0]).build(nn);
    });
    n.rotation.z = a - Math.PI / 2;
  }
  for (const sy of [1, -1]) subNode(g, info, sy > 0 ? 'Sköldgenerator (övre)' : 'Sköldgenerator (nedre)', 'shield', [0, sy * 110, 200], 30, 1400, n => {
    new MB().add('grey', G.cylY(14, 22, 60), [0, -sy * 30, 0]).add('shieldGenRed', G.sph(28, 20, 14)).add('dark', G.torus(30, 3, 6, 28), null, [Math.PI / 2, 0, 0]).build(n);
  });
  subNode(g, info, 'Kärnreaktorn', 'reactor', [0, 0, 380], 50, 2400, n => {
    new MB().add('core', G.sph(48, 24, 16)).add('glowOrange', G.torus(60, 3, 6, 32), null, [0, 0, 0]).build(n);
  }, { requires: 'shield' });
  subNode(g, info, 'Huvudmotorer', 'engine', [0, 0, 600], 80, 2000, n => {
    const m = new MB();
    for (const p of [[-70, -40], [70, -40], [-70, 40], [70, 40], [0, -50], [0, 50]]) { m.add('grey', G.cylZ(20, 24, 20), [p[0], p[1], 0]); m.add('glowOrange', G.disc(19), [p[0], p[1], 10.1]); }
    m.build(n);
    for (const p of [[-70, -40], [70, -40], [-70, 40], [70, 40], [0, -50], [0, 50]]) addFlame(n, [p[0], p[1], 10], 18, 120, 'orange');
  });
  const T = [];
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; T.push([Math.cos(a) * 300, Math.sin(a) * 300, -28, 'laser', [0, 0, -1]]); T.push([Math.cos(a) * 300, Math.sin(a) * 300, 28, 'laser', [0, 0, 1]]); }
  for (const z of [-420, -220, 120]) { T.push([0, 56, z, 'laser', [0, 1, 0]]); T.push([0, -56, z, 'laser', [0, -1, 0]]); }
  T.push([50, 0, -350, 'heavy', [1, 0, 0]], [-50, 0, -350, 'heavy', [-1, 0, 0]], [0, 70, 470, 'heavy', [0, 1, 0]], [0, -70, 470, 'heavy', [0, -1, 0]]);
  for (const t of T) addTurret(g, info, t[3], 1, [t[0], t[1], t[2]], { up: t[4], scale: t[3] === 'heavy' ? 3.2 : 2.4, hp: t[3] === 'heavy' ? 420 : 200 });
  for (let z = -500; z <= 280; z += 65) { const r = 40 + 35 * (z + 500) / 1000; info.colliders.push([0, 0, z, r]); }
  info.colliders.push([0, 0, -620, 32], [0, 0, -560, 40]);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; info.colliders.push([Math.cos(a) * 300, Math.sin(a) * 300, 0, 34]); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; info.colliders.push([Math.cos(a) * 300, Math.sin(a) * 300, 0, 60]); }
  info.colliders.push([0, 0, 330, 80], [0, 0, 430, 80], [0, 0, 540, 100], [-70, 0, 540, 80], [70, 0, 540, 80], [0, 110, 200, 30], [0, -110, 200, 30]);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; info.colliders.push([Math.cos(a) * 95, Math.sin(a) * 95, 380, 12]); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; for (const r of [100, 170, 240]) info.colliders.push([Math.cos(a) * r, Math.sin(a) * r, 0, 18]); }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; navLight(g, [Math.cos(a) * 330, Math.sin(a) * 330, 0], '#ff3030', 16); }
  return { group: g, info };
}
function buildGruvbas() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(260);
  const rng = makeRng(29), n3 = makeNoise3(29);
  const rock = new THREE.IcosahedronGeometry(170, 4);
  const p = rock.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const d = v.clone().normalize(); const k = 0.82 + 0.35 * n3.fbm(d.x * 2 + 5, d.y * 2, d.z * 2, 4); v.copy(d).multiplyScalar(170 * k); p.setXYZ(i, v.x, v.y, v.z); }
  rock.computeVertexNormals();
  mb.add('rockBase', rock);
  const surfR = d => 170 * (0.82 + 0.35 * n3.fbm(d.x * 2 + 5, d.y * 2, d.z * 2, 4));
  const placeOn = (dir, h) => { const d = new THREE.Vector3(...dir).normalize(); return { d, p: d.clone().multiplyScalar(surfR(d) - 5 + h) }; };
  const upQ = (d) => new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  // borrtorn, tankar och boende
  const structs = [[0.2, 1, 0.1], [-0.5, 0.8, -0.3], [0.6, 0.6, 0.6], [-0.7, 0.2, 0.7], [0.1, -1, 0.3], [0.9, -0.3, -0.4], [-0.3, 0.4, -0.9], [0.4, 0.2, -0.9]];
  structs.forEach((dir, i) => {
    const { d, p } = placeOn(dir, 10); const e = upQ(d);
    const q = new THREE.Quaternion().setFromEuler(e);
    const at = (x, y, z) => { const o = new THREE.Vector3(x, y, z).applyQuaternion(q).add(p); return [o.x, o.y, o.z]; };
    if (i % 3 === 0) {
      mb.add('hullDPlain', G.box(30, 24, 30), at(0, 12, 0), [e.x, e.y, e.z]);
      mb.add('grey', G.cylY(3, 3, 70), at(0, 50, 0), [e.x, e.y, e.z]);
      mb.add('rust', G.box(16, 6, 16), at(0, 80, 0), [e.x, e.y, e.z]);
    } else if (i % 3 === 1) {
      for (let k = 0; k < 3; k++) mb.add(k % 2 ? 'rust' : 'hullDPlain', G.cylY(8, 8, 30, 12), at(-18 + k * 18, 15, 0), [e.x, e.y, e.z]);
    } else {
      mb.add('hullDBig', G.box(50, 20, 22), at(0, 10, 0), [e.x, e.y, e.z]);
      mb.add('dark', G.box(10, 30, 10), at(20, 15, 0), [e.x, e.y, e.z]);
    }
  });
  mb.build(g);
  const reactorDirs = [[1, 0.35, 0.1], [-0.6, 0.6, 0.6], [0.1, -0.3, -1], [-0.4, -0.85, -0.1]];
  reactorDirs.forEach((dir, i) => {
    const { d, p } = placeOn(dir, 14);
    const node = subNode(g, info, 'Malmreaktor ' + (i + 1), 'target', [p.x, p.y, p.z], 16, 520, n => {
      new MB().add('core', G.sph(10, 16, 12), [0, 10, 0]).add('dark', G.cylY(14, 16, 6), [0, 0, 0])
        .add('dark', G.box(2, 22, 2), [12, 10, 0]).add('dark', G.box(2, 22, 2), [-12, 10, 0]).add('dark', G.box(2, 22, 2), [0, 10, 12]).add('dark', G.box(2, 22, 2), [0, 10, -12])
        .add('dark', G.torus(12, 1.2, 6, 20), [0, 21, 0], [Math.PI / 2, 0, 0]).build(n);
    });
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  });
  const turretDirs = [[0.7, 0.7, -0.1], [-0.9, 0.1, 0.2], [0.3, 0.5, 0.8], [0.0, 0.3, -1], [0.6, -0.6, 0.5], [-0.3, -0.9, -0.5], [-0.2, 1, 0.5]];
  turretDirs.forEach((dir) => { const { d, p } = placeOn(dir, 4); addTurret(g, info, 'laser', 1, [p.x, p.y, p.z], { up: [d.x, d.y, d.z], scale: 2.2, hp: 180 }); });
  info.colliders = [[0, 0, 0, 125]];
  for (let i = 0; i < 48; i++) {
    const y = 1 - (i + 0.5) / 48 * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
    const R = surfR(d); const c = d.multiplyScalar(R - 42);
    info.colliders.push([c.x, c.y, c.z, 44]);
  }
  for (const dir of structs) { const { p } = placeOn(dir, 30); info.colliders.push([p.x, p.y, p.z, 30]); }
  for (const s of info.subs) if (s.type === 'target') info.colliders.push([s.pos[0], s.pos[1], s.pos[2], 14]);
  navLight(g, [0, 260, 0], '#ff3030', 12);
  return { group: g, info };
}
function buildVarv() {
  const g = new THREE.Group(), mb = new MB(), info = newInfo(360);
  const rng = makeRng(37);
  mb.add('hullDBig', G.cylY(30, 40, 260, 16), [0, 0, 0]);
  mb.add('hullDPlain', G.cylY(70, 60, 20, 16), [0, 140, 0]);
  mb.add('hullDPlain', G.cylY(60, 70, 20, 16), [0, -140, 0]);
  mb.add('dark', G.cylY(3, 3, 80), [0, 190, 0]);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const cx = Math.cos(a) * 240, cz = Math.sin(a) * 240;
    mb.add('grey', G.box(170, 10, 10), [Math.cos(a) * 115, 60, Math.sin(a) * 115], [0, -a, 0]);
    mb.add('grey', G.box(170, 10, 10), [Math.cos(a) * 115, -60, Math.sin(a) * 115], [0, -a, 0]);
    // dockans ram
    for (const yy of [-55, 55]) for (const xx of [-45, 45]) {
      const ox = cx + Math.cos(a + Math.PI / 2) * xx, oz = cz + Math.sin(a + Math.PI / 2) * xx;
      mb.add('rust', G.box(8, 8, 200), [ox, yy, oz], [0, -a - Math.PI / 2, 0]);
    }
    for (let k = -2; k <= 2; k++) {
      const ox = cx + Math.cos(a) * k * 45, oz = cz + Math.sin(a) * k * 45;
      mb.add('grey', G.box(6, 118, 6), [ox + Math.cos(a + Math.PI / 2) * 45, 0, oz + Math.sin(a + Math.PI / 2) * 45]);
      mb.add('grey', G.box(6, 118, 6), [ox - Math.cos(a + Math.PI / 2) * 45, 0, oz - Math.sin(a + Math.PI / 2) * 45]);
    }
    // halvbyggt skrov
    mb.add('hullDPlain', G.tbox(26, 20, 140, 0.4, 0.6), [cx, 0, cz], [0, -a - Math.PI / 2, 0]);
  }
  greeble(mb, rng, 'dark', 40, -60, 60, 150, -60, 60, 3, 12);
  mb.build(g);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const p = [Math.cos(a) * 240, 22, Math.sin(a) * 240];
    subNode(g, info, 'Dockkärna ' + (i + 1), 'target', p, 18, 650, n => {
      new MB().add('core', G.cylY(10, 10, 16, 12)).add('dark', G.torus(13, 2, 6, 20), [0, 0, 0], [Math.PI / 2, 0, 0]).add('dark', G.cylY(3, 3, 40), [0, -20, 0]).build(n);
    }, { requires: 'shield' });
  }
  for (const sy of [1, -1]) subNode(g, info, sy > 0 ? 'Sköldgenerator (övre)' : 'Sköldgenerator (nedre)', 'shield', [0, sy * 162, 0], 22, 900, n => {
    new MB().add('shieldGenRed', G.sph(20, 18, 12)).add('dark', G.torus(22, 2.4, 6, 24), null, [Math.PI / 2, 0, 0]).build(n);
  });
  subNode(g, info, 'Kontrolltornet', 'target', [0, 40, 36], 20, 900, n => {
    new MB().add('hullDBig', G.box(40, 30, 20)).add('glassRed', G.box(40.5, 4, 20.5), [0, 6, 0]).build(n);
  }, { requires: 'shield' });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const top = i % 2 === 0;
    addTurret(g, info, i % 5 === 0 ? 'heavy' : 'laser', 1, [Math.cos(a) * 65, top ? 150 : -150, Math.sin(a) * 65], { down: !top, scale: i % 5 === 0 ? 2.6 : 2.2, hp: i % 5 === 0 ? 380 : 190 });
  }
  for (let y = -120; y <= 120; y += 40) info.colliders.push([0, y, 0, 38]);
  info.colliders.push([0, 140, 0, 60], [0, -140, 0, 60], [0, 162, 0, 22], [0, -162, 0, 22], [0, 40, 36, 22]);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; for (let k = -2; k <= 2; k++) info.colliders.push([Math.cos(a) * (240 + k * 30), 0, Math.sin(a) * (240 + k * 30), 16]); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; navLight(g, [Math.cos(a) * 75, 150, Math.sin(a) * 75], '#ff3030', 8); }
  return { group: g, info };
}

/* ============================================================== Register */
const BUILDERS = {
  svala: () => buildSvala('gold'), svala_w: () => buildSvala('blue'), falk: buildFalk, orn: buildOrn,
  hugg: buildHugg, spjut: buildSpjut, tordon: buildTordon,
  drone: buildDrone, mine: buildMine, container: buildContainer, gate: buildGate,
  frakt: buildFrakt, farja: buildFarja, vaktare: buildVaktare, station: buildStation,
  bastion: buildBastion, klyvare: buildKlyvare, fangskepp: buildFangskepp, domare: buildDomare, modern: buildModern,
  gruvbas: buildGruvbas, varv: buildVarv
};
const CACHE = {};
export function getTemplate(id) {
  if (!CACHE[id]) {
    const b = BUILDERS[id]; if (!b) throw new Error('okänd modell ' + id);
    CACHE[id] = b();
    CACHE[id].group.updateMatrixWorld(true);
  }
  return CACHE[id];
}
export const MODEL_IDS = Object.keys(BUILDERS);

/** Skapar en instans (delar geometri och material med mallen). */
export function instantiate(id) {
  const t = getTemplate(id);
  const group = t.group.clone(true);
  const flames = [], glows = [];
  group.traverse(o => { if (o.userData.flame) flames.push(o); if (o.userData.glow) glows.push(o); });
  const subs = t.info.subs.map(s => {
    const node = group.getObjectByName(s.node);
    const sub = Object.assign({}, s, { node, maxHp: s.hp, alive: true, local: new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]) });
    if (s.type === 'turret' && node) {
      sub.yaw = node.getObjectByName('yaw'); sub.pitch = node.getObjectByName('pitch');
      sub.muzzle = node.userData.turret.muzzle; sub.cd = Math.random() * 2; sub.target = null; sub.retarget = 0;
    }
    if (node) { node.userData.subFlames = []; node.traverse(o => { if (o.userData.flame) node.userData.subFlames.push(o); }); }
    return sub;
  });
  return { group, info: t.info, flames, glows, subs };
}
