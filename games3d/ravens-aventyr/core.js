/* Rävens äventyr – kärna: material, texturer, banbyggare, kollisionsvärld, himmel, vatten, växtlighet. */
import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = THREE.Vector3;
const _v = new V3(), _v2 = new V3(), _n = new V3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(1, 1, 1);

/* ------------------------------------------------------------------ Material & texturer */
let _grad = null;
export function gradientMap() {
  if (_grad) return _grad;
  const d = new Uint8Array([135, 190, 235, 255]);
  _grad = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}
const matCache = new Map();
/** Toon-material (cachat globalt). */
export function toon(color, opt = {}) {
  const key = 't' + color + JSON.stringify(opt, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradientMap() }, opt));
  matCache.set(key, m);
  return m;
}
export function basic(color, opt = {}) {
  const key = 'b' + color + JSON.stringify(opt);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial(Object.assign({ color }, opt));
  matCache.set(key, m);
  return m;
}

const texCache = new Map();
function canvasTex(key, size, draw, repeat = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const TEX = {
  planks: () => canvasTex('planks', 128, (g, s) => {
    const r = rnd(3);
    for (let i = 0; i < 4; i++) {
      const l = 150 + r() * 40;
      g.fillStyle = `rgb(${l},${l * 0.72 | 0},${l * 0.48 | 0})`; g.fillRect(0, i * 32, s, 32);
      g.fillStyle = 'rgba(60,35,15,.55)'; g.fillRect(0, i * 32 + 30, s, 2);
      g.fillRect((r() * s) | 0, i * 32, 2, 32);
      for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(90,55,25,${0.08 + r() * 0.1})`; g.fillRect(r() * s, i * 32 + r() * 28, 10 + r() * 30, 1); }
    }
  }),
  bricks: () => canvasTex('bricks', 128, (g, s) => {
    const r = rnd(7);
    g.fillStyle = '#8d8a86'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const off = (y % 2) * 16, l = 170 + r() * 50;
      g.fillStyle = `rgb(${l},${l - 4},${l - 12})`;
      g.fillRect(x * 32 + off + 1, y * 16 + 1, 30, 14);
      g.fillRect(x * 32 + off - s + 1, y * 16 + 1, 30, 14);
    }
  }),
  vine: () => canvasTex('vine', 128, (g, s) => {
    const r = rnd(11);
    g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#3f8f2f'; g.lineWidth = 7;
    for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + s, s); g.stroke(); g.beginPath(); g.moveTo(i * 32 + s, 0); g.lineTo(i * 32, s); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? '#5cc04a' : '#86dd5a'; g.beginPath(); g.ellipse(r() * s, r() * s, 6, 3.5, r() * 3, 0, 7); g.fill(); }
  }),
  iceclimb: () => canvasTex('iceclimb', 128, (g, s) => {
    g.fillStyle = '#8fd3ee'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8fbff';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.moveTo(x * 32 + 16, y * 32 + 6); g.lineTo(x * 32 + 28, y * 32 + 24); g.lineTo(x * 32 + 4, y * 32 + 24); g.fill(); }
  }),
  checker: () => canvasTex('checker', 64, (g, s) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#222' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } }),
  noise: () => canvasTex('noise', 256, (g, s) => {
    const r = rnd(5); g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { const v = 200 + r() * 55 | 0; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * s, r() * s, 2 + r() * 5, 2 + r() * 5); }
  }),
  roof: () => canvasTex('roof', 128, (g, s) => {
    g.fillStyle = '#7b2a22'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 3 ? '#93352a' : '#a3422f'; g.beginPath(); g.arc(x * 16 + (y % 2) * 8 + 8, y * 16 + 4, 9, 0, Math.PI); g.fill(); }
  }),
  radial: () => canvasTex('radial', 128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }, false),
  blob: () => canvasTex('blob', 64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.6, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }, false),
  ring: () => canvasTex('ring', 128, (g, s) => {
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 8, 0, 7); g.stroke();
  }, false)
};

/* ------------------------------------------------------------------ Banbyggare
 * Samlar statisk geometri per material (sammanslås vid finish) och kollisionstrianglar med etikett.
 * Etiketter (tag): 'ground' (standard), 'ice' (halt), 'climb' (klätterbar), 'bounce', 'hurt' (skadar), 'nocam' (kameran ignorerar). */
const MATS = {};
export function builderMat(name) {
  if (MATS[name]) return MATS[name];
  const g = gradientMap();
  let m;
  switch (name) {
    case 'plain': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g }); break;
    case 'noise': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.noise() }); break;
    case 'planks': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.planks() }); break;
    case 'bricks': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.bricks() }); break;
    case 'vine': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.vine() }); break;
    case 'iceclimb': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.iceclimb() }); break;
    case 'roof': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.roof() }); break;
    case 'checker': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, map: TEX.checker() }); break;
    case 'glow': m = new THREE.MeshBasicMaterial({ vertexColors: true }); break;
    case 'ice': m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, transparent: true, opacity: 0.88 }); break;
    default: m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g });
  }
  MATS[name] = m;
  return m;
}
export const UV_SCALE = { planks: 2.5, bricks: 3, vine: 2, iceclimb: 2, roof: 2.5, checker: 2, noise: 6 };

const _col = new THREE.Color();
function prepGeo(src, matrix, color, uvScale) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  g.applyMatrix4(matrix);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (uvScale) {
    const p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
      else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
      else { u = p.getX(i); v = p.getY(i); }
      uv.setXY(i, u / uvScale, v / uvScale);
    }
  }
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3);
    _col.set(color == null ? 0xffffff : color).convertSRGBToLinear();
    for (let i = 0; i < n; i++) { c[i * 3] = _col.r; c[i * 3 + 1] = _col.g; c[i * 3 + 2] = _col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return g;
}

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sph: new THREE.SphereGeometry(1, 14, 10),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dode: new THREE.DodecahedronGeometry(1, 0)
};
export { GEO };

export class Builder {
  constructor() {
    this.groups = new Map();
    this.tris = [];   // {a,b,c,tag}
    this.shadowCast = true;
  }
  /** Lägg till geometri. o: { mat='plain', color, tag='ground', collide=true, cast=true, visible=true } */
  add(geo, matrix, o = {}) {
    const matName = o.mat || 'plain';
    const g = prepGeo(geo, matrix, o.color, UV_SCALE[matName] && o.uv !== false ? (o.uvScale || UV_SCALE[matName]) : 0);
    if (o.visible !== false) {
      const key = matName + (o.cast === false ? ':nc' : '');
      if (!this.groups.has(key)) this.groups.set(key, { mat: builderMat(matName), geos: [], cast: o.cast !== false });
      this.groups.get(key).geos.push(g);
    }
    if (o.collide !== false) {
      const p = g.attributes.position;
      const tag = o.tag || 'ground';
      for (let i = 0; i < p.count; i += 3) {
        const t = new THREE.Triangle(new V3().fromBufferAttribute(p, i), new V3().fromBufferAttribute(p, i + 1), new V3().fromBufferAttribute(p, i + 2));
        if (t.getArea() < 1e-6) continue;
        t.tag = tag;
        this.tris.push(t);
      }
    }
    if (o.visible === false) g.dispose();
    return g;
  }
  /** Låda med centrum (x,y,z). rot: [rx,ry,rz] */
  box(x, y, z, w, h, d, o = {}) {
    _e.set(...(o.rot || [0, o.ry || 0, 0]));
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(w, h, d));
    return this.add(o.geo || GEO.box, _m, o);
  }
  /** Plattform med ovansidan på höjden top. */
  plat(x, top, z, w, d, h = 1, o = {}) { return this.box(x, top - h / 2, z, w, h, d, o); }
  /** Cylinder med ovansidan på top. */
  cyl(x, top, z, r, h, o = {}) {
    _e.set(...(o.rot || [0, o.ry || 0, 0]));
    _m.compose(_v.set(x, top - h / 2, z), _q.setFromEuler(_e), _s.set(r, h, o.rz || r));
    return this.add(o.seg === 8 ? GEO.cyl8 : (o.geo || GEO.cyl), _m, o);
  }
  cone(x, y, z, r, h, o = {}) {
    _e.set(...(o.rot || [0, o.ry || 0, 0]));
    _m.compose(_v.set(x, y + h / 2, z), _q.setFromEuler(_e), _s.set(r, h, r));
    return this.add(GEO.cone, _m, o);
  }
  sphere(x, y, z, rx, ry = rx, rz = rx, o = {}) {
    _e.set(...(o.rot || [0, o.ry || 0, 0]));
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(rx, ry, rz));
    return this.add(o.geo || GEO.sph, _m, o);
  }
  /** Sned planka/ramp från punkt a till b (översidans mittlinje). */
  ramp(ax, ay, az, bx, by, bz, width, thick = 0.6, o = {}) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz), hl = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, hl);
    _e.set(pitch, yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    const up = _n.set(0, 1, 0).applyQuaternion(_q);
    _m.compose(_v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2).addScaledVector(up, -thick / 2), _q, _s.set(width, thick, len));
    return this.add(GEO.box, _m, o);
  }
  /** Trappa från (x,y,z) i riktning yaw. */
  stairs(x, y, z, yaw, steps, stepH, stepD, width, o = {}) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < steps; i++) {
      const top = y + stepH * (i + 1);
      this.box(x + fx * stepD * (i + 0.5), top - (top - y + 0.3) / 2, z + fz * stepD * (i + 0.5), width, top - y + 0.3, stepD, Object.assign({ ry: yaw }, o));
    }
  }
  rock(x, y, z, s, o = {}) {
    return this.sphere(x, y, z, s, s * (o.flat || 0.75), s * (o.depth || 1), Object.assign({ geo: GEO.dode, ry: o.ry || x * 1.7 + z, mat: 'noise' }, o));
  }
  /** Avsluta: slå ihop till meshar och bygg octree. Returnerar { meshes:[], octree } */
  finish(parent, shadows) {
    const meshes = [];
    for (const [key, gr] of this.groups) {
      if (!gr.geos.length) continue;
      const merged = mergeGeometries(gr.geos, false);
      gr.geos.forEach(g => g.dispose());
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, gr.mat);
      mesh.castShadow = shadows && gr.cast;
      mesh.receiveShadow = shadows;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes.push(mesh);
    }
    const oct = new Octree();
    this.tris.forEach(t => oct.addTriangle(t));
    if (this.tris.length) oct.build();
    this.groups.clear(); this.tris = [];
    return { meshes, octree: oct };
  }
}

/* ------------------------------------------------------------------ Rörliga kolliderare */
export class DynCollider {
  /** obj: Object3D vars världsmatris styr kollideraren. geos: [{geo, matrix (lokal i obj), tag}] */
  constructor(obj, tris, tag = 'ground') {
    this.obj = obj; this.tag = tag;
    this.oct = new Octree();
    let r = 0;
    tris.forEach(t => { t.tag = t.tag || tag; this.oct.addTriangle(t); r = Math.max(r, t.a.length(), t.b.length(), t.c.length()); });
    this.oct.build();
    this.radius = r;
    this.enabled = true;
    obj.updateMatrixWorld(true);
    this.cur = obj.matrixWorld.clone();
    this.prev = this.cur.clone();
    this.inv = this.cur.clone().invert();
    this.prevInv = this.inv.clone();
    this.center = new V3().setFromMatrixPosition(this.cur);
    this.yaw = 0; this.prevYaw = 0;
  }
  sync() {
    this.prev.copy(this.cur); this.prevInv.copy(this.inv);
    this.obj.updateMatrixWorld(true);
    this.cur.copy(this.obj.matrixWorld);
    this.inv.copy(this.cur).invert();
    this.center.setFromMatrixPosition(this.cur);
  }
  /** Flytta punkten p (världskoord) som om den satt fast i objektet under senaste steget. */
  carry(p) { p.applyMatrix4(this.prevInv).applyMatrix4(this.cur); return p; }
  deltaYaw() {
    _v.set(0, 0, 1).transformDirection(this.prev); const a = Math.atan2(_v.x, _v.z);
    _v.set(0, 0, 1).transformDirection(this.cur); const b = Math.atan2(_v.x, _v.z);
    let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d;
  }
}
/** Bygg triangellista (lokal) från geometrier. */
export function trisFrom(list) {
  const out = [];
  for (const { geo, matrix, tag } of list) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const t = new THREE.Triangle(new V3().fromBufferAttribute(p, i), new V3().fromBufferAttribute(p, i + 1), new V3().fromBufferAttribute(p, i + 2));
      if (matrix) { t.a.applyMatrix4(matrix); t.b.applyMatrix4(matrix); t.c.applyMatrix4(matrix); }
      if (t.getArea() < 1e-6) continue;
      if (tag) t.tag = tag;
      out.push(t);
    }
    if (g !== geo) g.dispose();
  }
  return out;
}

/* ------------------------------------------------------------------ Kollisionsvärld */
const _tris = [];
const _lc = { start: new V3(), end: new V3(), radius: 0 };
import { Capsule } from 'three/addons/math/Capsule.js';
const _localCap = new Capsule();
const _ray = new THREE.Ray();
const _tn = new V3();

export class CollisionWorld {
  constructor() { this.oct = null; this.dyn = []; }
  setStatic(oct) { this.oct = oct; }
  addDyn(d) { this.dyn.push(d); return d; }
  removeDyn(d) { const i = this.dyn.indexOf(d); if (i >= 0) this.dyn.splice(i, 1); }

  _contact(cap, n, depth, tag, dyn, info) {
    if (depth <= 0 || !isFinite(depth)) return;
    if (n.y > 0.55) {
      const dy = Math.min(depth / n.y, 0.6);
      cap.start.y += dy; cap.end.y += dy;
      if (!info.ground || n.y > info.groundNormal.y) { info.groundNormal.copy(n); info.groundTag = tag; info.groundDyn = dyn; }
      info.ground = true;
    } else if (n.y < -0.55) {
      if (dyn && info.ground && !info.groundDyn) {
        // klämd mellan marken och en rörlig plattform: skjut ut i sidled i stället för ned genom marken
        _v.set(cap.start.x - dyn.center.x, 0, cap.start.z - dyn.center.z);
        if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
        cap.translate(_v.normalize().multiplyScalar(Math.min(depth + 0.02, 0.35)));
        info.crush = true;
      } else cap.translate(_v.copy(n).multiplyScalar(depth));
      info.ceiling = true;
    } else {
      cap.translate(_v.copy(n).multiplyScalar(depth));
      if (!info.wall || tag === 'climb') { info.wallNormal.copy(n); info.wallTag = tag; info.wallDyn = dyn; }
      info.wall = true;
      if (n.y > 0.15) { info.steep = true; info.steepNormal.copy(n); }
    }
    if (tag === 'hurt') info.hurt = true;
    if (tag === 'bounce' && n.y > 0.55) info.bounce = true;
  }

  /** Kapsel mot världen. info fylls i. */
  collide(cap, info) {
    info.ground = false; info.wall = false; info.ceiling = false; info.steep = false; info.hurt = false; info.bounce = false; info.crush = false;
    info.groundDyn = null; info.wallDyn = null; info.groundTag = null; info.wallTag = null;
    for (let pass = 0; pass < 2; pass++) {
      if (this.oct && this.oct.box) {
        _tris.length = 0;
        this.oct.getCapsuleTriangles(cap, _tris);
        for (let i = 0; i < _tris.length; i++) {
          const r = this.oct.triangleCapsuleIntersect(cap, _tris[i]);
          if (r) this._contact(cap, r.normal, r.depth, _tris[i].tag, null, info);
        }
      }
      for (let k = 0; k < this.dyn.length; k++) {
        const d = this.dyn[k];
        if (!d.enabled) continue;
        const cr = d.radius + 2;
        if (d.center.distanceToSquared(cap.start) > cr * cr && d.center.distanceToSquared(cap.end) > cr * cr) continue;
        _localCap.start.copy(cap.start).applyMatrix4(d.inv);
        _localCap.end.copy(cap.end).applyMatrix4(d.inv);
        _localCap.radius = cap.radius;
        _tris.length = 0;
        d.oct.getCapsuleTriangles(_localCap, _tris);
        for (let i = 0; i < _tris.length; i++) {
          const r = d.oct.triangleCapsuleIntersect(_localCap, _tris[i]);
          if (r) {
            _localCap.translate(_v2.copy(r.normal).multiplyScalar(r.depth));
            _tn.copy(r.normal).transformDirection(d.cur);
            const before = cap.start.y;
            this._contact(cap, _tn, r.depth, _tris[i].tag || d.tag, d, info);
            // håll lokal kapsel synkad med eventuell vertikal justering
            _localCap.start.copy(cap.start).applyMatrix4(d.inv);
            _localCap.end.copy(cap.end).applyMatrix4(d.inv);
            void before;
          }
        }
      }
    }
    return info;
  }

  /** Stråle. Returnerar { dist, point, normal, tag, dyn } eller null. */
  raycast(origin, dir, maxDist = 100, skipTag = null) {
    let best = null;
    _ray.set(origin, dir);
    if (this.oct && this.oct.box) {
      const h = this._rayOct(this.oct, _ray, skipTag);
      if (h && h.distance <= maxDist) best = { dist: h.distance, point: h.position, tri: h.triangle, dyn: null };
    }
    for (const d of this.dyn) {
      if (!d.enabled) continue;
      // grov koll mot omslutande sfär
      _v.copy(d.center).sub(origin);
      const t = _v.dot(dir);
      const dd = _v.lengthSq() - t * t;
      if (dd > (d.radius + 0.5) ** 2 || t < -d.radius || t - d.radius > maxDist) continue;
      const lr = new THREE.Ray(origin.clone().applyMatrix4(d.inv), dir.clone().transformDirection(d.inv));
      const h = this._rayOct(d.oct, lr, skipTag);
      if (h && h.distance <= maxDist && (!best || h.distance < best.dist)) {
        best = { dist: h.distance, point: h.position.applyMatrix4(d.cur), tri: h.triangle, dyn: d };
      }
    }
    if (best) {
      best.normal = best.tri.getNormal(new V3());
      if (best.dyn) best.normal.transformDirection(best.dyn.cur);
      if (best.normal.dot(dir) > 0) best.normal.negate();
      best.tag = best.tri.tag;
    }
    return best;
  }
  _rayOct(oct, ray, skipTag) {
    if (!skipTag) return oct.rayIntersect(ray);
    _tris.length = 0;
    oct.getRayTriangles(ray, _tris);
    let dist = 1e100, tri = null, pos = null;
    for (const t of _tris) {
      if (t.tag === skipTag) continue;
      const r = ray.intersectTriangle(t.a, t.b, t.c, false, _v2);
      if (r) { const d = r.distanceTo(ray.origin); if (d < dist) { dist = d; tri = t; pos = r.clone(); } }
    }
    return tri ? { distance: dist, triangle: tri, position: pos } : false;
  }
  groundY(x, y, z, maxDist = 60) {
    const h = this.raycast(_v2.set(x, y, z).clone(), new V3(0, -1, 0), maxDist);
    return h ? h.point.y : -Infinity;
  }
}

/* ------------------------------------------------------------------ Himmel */
export function makeSky(opts) {
  // Fyra färgstopp (horisont → mitt → topp, samt under horisonten), solglöd, stjärnor, norrsken med
  // ridåer i två lager och blixtljus. Himlen tonmappas inte – färgerna syns som de är valda.
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(opts.top) }, mid: { value: new THREE.Color(opts.mid) }, bot: { value: new THREE.Color(opts.bot) },
      hor: { value: new THREE.Color(opts.hor == null ? opts.mid : opts.hor) },
      sunDir: { value: new V3(...(opts.sunDir || [0.4, 0.5, -0.6])).normalize() }, sunCol: { value: new THREE.Color(opts.sunCol || 0xfff2c0) },
      sunSize: { value: opts.sunSize == null ? 1 : opts.sunSize }, haze: { value: opts.haze == null ? 1 : opts.haze },
      aurora: { value: opts.aurora || 0 }, time: { value: 0 }, flash: { value: 0 }, stars: { value: opts.stars || 0 }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top, mid, hor, bot, sunDir, sunCol; uniform float aurora, time, flash, stars, sunSize, haze; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.18, 0.8, h));
        col = mix(col, bot, smoothstep(0.0, -0.22, h));
        float s = max(dot(d, sunDir), 0.0);
        float hz = exp(-max(h, 0.0) * 6.0);
        col += sunCol * (pow(s, 900.0) * 3.0 * sunSize + pow(s, 60.0) * 0.35 * sunSize + pow(s, 5.0) * 0.22 * haze * (0.4 + 0.6 * hz));
        float a = atan(d.z, d.x);
        if (stars > 0.0 && h > 0.0) {
          vec2 g = floor(vec2(a * 140.0, h * 180.0));
          float r = h21(g);
          float st = step(0.987, r) * smoothstep(0.04, 0.35, h) * (0.5 + 0.5 * sin(time * (1.5 + r * 3.0) + r * 40.0));
          col += vec3(0.85, 0.9, 1.0) * st * stars * (0.6 + 1.6 * step(0.997, r));
        }
        if (aurora > 0.0 && h > 0.02) {
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float wave = sin(a * 2.0 + time * 0.06 + fi * 2.3) * 0.07 + sin(a * 5.0 - time * 0.09 + fi) * 0.035;
            float y = h - (0.16 + fi * 0.1 + wave);
            float curtain = smoothstep(-0.01, 0.025, y) * exp(-max(y, 0.0) * (5.0 - fi * 1.5));
            float rays = 0.55 + 0.45 * sin(a * (70.0 + fi * 30.0) + sin(a * 11.0 + time * 0.35) * 5.0 + time * 0.5);
            float bands = smoothstep(0.25, 0.95, 0.5 + 0.5 * sin(a * 3.0 + time * 0.1 + fi * 2.1) + 0.25 * sin(a * 7.0 - time * 0.17));
            vec3 ac = mix(vec3(0.12, 1.0, 0.55), vec3(0.8, 0.3, 1.0), smoothstep(0.02, 0.3, y));
            acc += ac * curtain * rays * bands * (1.0 - fi * 0.35);
          }
          col += acc * aurora * 0.85;
        }
        col += vec3(0.75, 0.8, 1.0) * flash;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.userData.update = (t, cam) => { mat.uniforms.time.value = t; mesh.position.copy(cam.position); };
  return mesh;
}

/** Avlägsna bergs-/skogssiluetter i en ring (obelysta, toning mot horisonten) – ger djup utan kollision. */
export function farRing(parent, { r = 140, n = 90, hMin = 8, hMax = 30, cBot = 0x302040, cTop = 0x6a5080, seed = 3, y = -4, jag = 0.5, layers = 1 } = {}) {
  const pos = [], col = [];
  const rr = rnd(seed); const cb = new THREE.Color(cBot), ct = new THREE.Color(cTop);
  for (let L = 0; L < layers; L++) {
    const R = r + L * 28, hs = 1 + L * 0.35;
    const hts = []; for (let i = 0; i < n; i++) hts.push((hMin + (hMax - hMin) * (0.5 + 0.5 * Math.sin(i * 0.37 + L * 2 + seed) * Math.sin(i * 0.11 + seed)) * (1 - jag + jag * rr())) * hs);
    const c2 = cb.clone().lerp(ct, 0.25 * L), t2 = ct.clone().lerp(cb, -0.15 * L);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const h0 = hts[i], h1 = hts[(i + 1) % n];
      const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
      pos.push(x0, y, z0, x1, y, z1, x0, y + h0, z0, x1, y, z1, x1, y + h1, z1, x0, y + h0, z0);
      for (const t of [0, 0, 1, 0, 1, 1]) { const c = t ? t2 : c2; col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  m.userData.disposeMat = [m.material];
  m.renderOrder = -5;
  parent.add(m);
  return m;
}

/* ------------------------------------------------------------------ Vatten */
export function makeWater(w, d, opts = {}) {
  const seg = Math.min(160, Math.max(16, Math.round(Math.max(w, d) / 2.5)));
  const geo = new THREE.PlaneGeometry(w, d, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, deep: { value: new THREE.Color(opts.deep || 0x1a6fa8) }, shallow: { value: new THREE.Color(opts.shallow || 0x47c6d8) },
      foam: { value: new THREE.Color(opts.foam || 0xffffff) }, amp: { value: opts.amp == null ? 0.18 : opts.amp }, opacity: { value: opts.opacity || 0.82 }
    }]),
    vertexShader: `
      uniform float time, amp; varying vec3 vW; varying float vH;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float h = sin(wp.x * 0.35 + time * 1.3) * 0.5 + sin(wp.z * 0.42 + time * 1.1) * 0.35 + sin((wp.x + wp.z) * 0.9 + time * 2.1) * 0.15;
        wp.y += h * amp; vH = h; vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time, opacity; uniform vec3 deep, shallow, foam; varying vec3 vW; varying float vH;
      #include <fog_pars_fragment>
      void main(){
        vec3 col = mix(deep, shallow, clamp(vH * 0.5 + 0.5, 0.0, 1.0));
        vec2 p = vW.xz * 0.6;
        float c = sin(p.x * 2.1 + time * 1.7 + sin(p.y * 1.7 + time)) * sin(p.y * 2.3 - time * 1.3 + sin(p.x * 1.3));
        col += foam * smoothstep(0.72, 0.95, c) * 0.35;
        vec3 vd = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(vd.y, 0.0, 1.0), 3.0);
        col = mix(col, vec3(0.85, 0.95, 1.0), fres * 0.35);
        gl_FragColor = vec4(col, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, fog: true, depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.update = t => { mat.uniforms.time.value = t; };
  mesh.userData.disposeAll = true;
  return mesh;
}

/* ------------------------------------------------------------------ Gräs, blommor, moln */
export function makeGrass(points, opts = {}) {
  // points: Float32Array [x,y,z, ...]
  const blade = new THREE.BufferGeometry();
  const pos = [], col = [];
  const base = new THREE.Color(opts.color || 0x4fae3a), tip = new THREE.Color(opts.tip || 0xa6e25a);
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, ca = Math.cos(a) * 0.12, sa = Math.sin(a) * 0.12;
    const ox = Math.cos(a * 2.3) * 0.06, oz = Math.sin(a * 1.7) * 0.06;
    pos.push(-ca + ox, 0, -sa + oz, ca + ox, 0, sa + oz, ox * 2, 0.55 + k * 0.08, oz * 2);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  blade.computeVertexNormals();
  // normaler uppåt ger mjukare ljussättning
  const nr = blade.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const uni = { time: { value: 0 } };
  mat.onBeforeCompile = sh => {
    sh.uniforms.time = uni.time;
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(time * 1.8 + ip.x * 0.35 + ip.z * 0.27) * 0.5 + sin(time * 3.1 + ip.x * 0.9) * 0.2;
      transformed.x += sway * position.y * 0.35; transformed.z += sway * position.y * 0.2;`);
  };
  mat.customProgramCacheKey = () => 'grass';
  const n = points.length / 3;
  const im = new THREE.InstancedMesh(blade, mat, n);
  const r = rnd(9);
  for (let i = 0; i < n; i++) {
    const s = 0.42 + r() * 0.4;
    _m.compose(_v.set(points[i * 3], points[i * 3 + 1] - 0.05, points[i * 3 + 2]), _q.setFromAxisAngle(_n.set(0, 1, 0), r() * 6.28), _s.set(s, s * (0.8 + r() * 0.6), s));
    im.setMatrixAt(i, _m);
  }
  im.receiveShadow = false; im.castShadow = false;
  im.userData.update = t => { uni.time.value = t; };
  im.userData.disposeAll = true;
  return im;
}

export function makeFlowers(points, colors) {
  const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4).translate(0, 0.2, 0);
  const head = new THREE.IcosahedronGeometry(0.11, 0).translate(0, 0.42, 0);
  const center = new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0.45, 0.06);
  const ni = g => (g.index ? g.toNonIndexed() : g);
  const geo = mergeGeometries([ni(stem), ni(head), ni(center)], true);
  const mat = [toon(0x3e8f2e), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap() }), toon(0xffe14d)];
  const n = points.length / 3;
  const im = new THREE.InstancedMesh(geo, mat, n);
  const r = rnd(21);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const s = 0.8 + r() * 0.7;
    _m.compose(_v.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]), _q.setFromAxisAngle(_n.set(0, 1, 0), r() * 6.28), _s.set(s, s, s));
    im.setMatrixAt(i, _m);
    im.setColorAt(i, c.set(colors[(r() * colors.length) | 0]));
  }
  im.userData.disposeAll = true;
  im.userData.disposeMat = [mat[1]];
  return im;
}

let _cloudGeo = null;
export function makeClouds(count, area, yMin, yMax, opts = {}) {
  if (!_cloudGeo) {
    const parts = [];
    const r = rnd(4);
    for (let i = 0; i < 7; i++) {
      const s = 1 + r() * 1.3;
      parts.push(new THREE.IcosahedronGeometry(1, 1).scale(s, s * 0.75, s).translate((i - 3) * 1.1 + r() * 0.5, r() * 0.6 + (i % 2) * 0.4, (r() - 0.5) * 1.5));
    }
    _cloudGeo = mergeGeometries(parts);
    _cloudGeo.computeVertexNormals();
  }
  const mat = toon(opts.color || 0xffffff, { emissive: opts.emissive || 0x6a7c99, emissiveIntensity: 0.35 });
  const im = new THREE.InstancedMesh(_cloudGeo, mat, count);
  const r = rnd(opts.seed || 8);
  const data = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = area * (0.45 + r() * 0.55);
    data.push({ x: Math.cos(a) * d, y: yMin + r() * (yMax - yMin), z: Math.sin(a) * d, s: 2 + r() * 3, sp: 0.3 + r() * 0.6, ry: r() * 6 });
  }
  im.userData.update = t => {
    for (let i = 0; i < count; i++) {
      const c = data[i];
      let x = c.x + t * c.sp; x = ((x + area) % (area * 2) + area * 2) % (area * 2) - area;
      _m.compose(_v.set(x, c.y, c.z), _q.setFromAxisAngle(_n.set(0, 1, 0), c.ry), _s.set(c.s, c.s, c.s));
      im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  im.userData.update(0);
  im.frustumCulled = false;
  return im;
}

/* ------------------------------------------------------------------ Terräng */
/** Höjdfält: size (världsenheter), res (segment), height(x,z), color(x,y,z,slope)->Color. Lägger till i builder. */
export function terrain(B, { size, res, height, color, cx = 0, cz = 0, tag = 'ground', mat = 'plain', clip = null }) {
  const step = size / res;
  const pos = [], col = [];
  const H = (x, z) => height(x, z);
  const c0 = new THREE.Color(), c1 = new THREE.Color(), c2 = new THREE.Color();
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x0 = cx - size / 2 + i * step, z0 = cz - size / 2 + j * step, x1 = x0 + step, z1 = z0 + step;
    const y00 = H(x0, z0), y10 = H(x1, z0), y01 = H(x0, z1), y11 = H(x1, z1);
    if (clip && clip(x0 + step / 2, z0 + step / 2, Math.min(y00, y10, y01, y11))) continue;
    const quad = [[x0, y00, z0], [x0, y01, z1], [x1, y10, z0], [x1, y10, z0], [x0, y01, z1], [x1, y11, z1]];
    for (let t = 0; t < 2; t++) {
      const a = quad[t * 3], b = quad[t * 3 + 1], c = quad[t * 3 + 2];
      // lutning
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; ny /= l;
      const slope = 1 - Math.abs(ny);
      for (const p of [a, b, c]) {
        pos.push(p[0], p[1], p[2]);
        color(p[0], p[1], p[2], slope, c0); c0.convertSRGBToLinear();
        col.push(c0.r, c0.g, c0.b);
      }
    }
  }
  void c1; void c2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  B.add(g, new THREE.Matrix4(), { mat, tag });
  g.dispose();
}

/** Enkel värdebrus-funktion (deterministisk). */
export function makeNoise(seed = 1) {
  const perm = new Uint8Array(512); const r = rnd(seed);
  const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = t => t * t * (3 - 2 * t);
  const val = (ix, iz) => perm[(perm[ix & 255] + iz) & 255] / 255;
  const n2 = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fz = fade(z - iz);
    const a = val(ix, iz), b = val(ix + 1, iz), c = val(ix, iz + 1), d = val(ix + 1, iz + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz; };
  return (x, z, oct = 3) => { let s = 0, a = 1, f = 1, t = 0; for (let o = 0; o < oct; o++) { s += n2(x * f, z * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
}

export { rnd };

/** Ta bort och frigör allt under ett objekt (utom globalt cachade material/texturer). */
export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.userData.disposeMat) o.userData.disposeMat.forEach(m => m.dispose());
    if (o.isMesh || o.isPoints || o.isInstancedMesh || o.isSprite) {
      if (o.geometry && o.geometry !== _cloudGeo && !Object.values(GEO).includes(o.geometry) && !o.userData.sharedGeo) o.geometry.dispose();
      if (o.material && o.material.isShaderMaterial && !o.material.userData.shared) o.material.dispose();
      if (o.material && o.material.onBeforeCompile && o.material.customProgramCacheKey && o.material.customProgramCacheKey() === 'grass') o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
  });
}
