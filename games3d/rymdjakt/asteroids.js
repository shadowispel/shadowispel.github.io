/**
 * Rymdjakt – asteroidfält: deformerade ikosaedrar som instansieras, med rumsligt rutnät för snabba kollisionstester.
 * Asteroider kan skjutas sönder med missiler: de spricker i mindre bitar (reservplatser i instansbuffertarna)
 * eller blir skräp. Uppspräckningen är deterministisk (frö) så att den kan synkas online.
 */
import * as THREE from 'three';
import { makeRng } from '../../engine/kit.js';
import { makeNoise3, mat } from './gfx.js';

const VARIANTS = 6;
/** Asteroidernas tålighet. Riktigt stora block går inte att spräcka. */
export const BIG_ROCK = 75;
export function rockHp(R) { return R > BIG_ROCK ? 1e9 : 10 + R * R * 0.11; }

/** Målbar asteroid (för målväljaren, låsning och missiler). */
class RockTarget {
  constructor(f, i) {
    this.f = f; this.idx = i;
    this.isProxy = true; this.isAsteroid = true; this.kind = 'asteroid'; this.team = -1; this.targetable = true; this.dead = false;
    this.subs = []; this.isLarge = false; this.shield = 0; this.maxShield = 0; this.points = 0;
    this.pos = new THREE.Vector3(f.px[i], f.py[i], f.pz[i]); this.vel = new THREE.Vector3();
    this.radius = this.hitR = this.boundR = f.cr[i];
    this.maxHull = f.hp[i]; this.big = f.hp[i] >= 1e9;
    this.name = this.big ? 'Jätteasteroid' : (f.r[i] < 16 ? 'Stenblock' : 'Asteroid');
  }
  get hull() { return Math.max(0, this.f.hp[this.idx]); }
}
let GEOS = null;
function buildGeos() {
  if (GEOS) return GEOS;
  GEOS = [];
  for (let k = 0; k < VARIANTS; k++) {
    const n = makeNoise3(100 + k * 17);
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    const sx = 0.75 + (k % 3) * 0.18, sy = 0.65 + ((k + 1) % 3) * 0.15, sz = 0.9 + ((k + 2) % 3) * 0.12;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let d = 1 + (n.fbm(v.x * 1.6 + k, v.y * 1.6, v.z * 1.6, 4) - 0.5) * 0.9;
      // kratrar
      const c = n(v.x * 3.2 + 7, v.y * 3.2, v.z * 3.2);
      if (c > 0.68) d -= (c - 0.68) * 0.9;
      const shade = 0.55 + (d - 0.7) * 0.9;
      v.multiplyScalar(d); v.x *= sx; v.y *= sy; v.z *= sz;
      p.setXYZ(i, v.x, v.y, v.z);
      col[i * 3] = shade; col[i * 3 + 1] = shade * 0.97; col[i * 3 + 2] = shade * 0.93;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.userData.rad = (sx + sy + sz) / 3 * 0.95;
    GEOS.push(g);
  }
  return GEOS;
}

export class AsteroidField {
  /**
   * opts: { count, center:[x,y,z], shape:'sphere'|'belt'|'slab', radius, thickness, minR, maxR, seed, avoid:[{p:Vector3,r}], tint:'#hex' }
   */
  constructor(scene, opts) {
    this.scene = scene;
    const geos = buildGeos();
    const rng = makeRng(opts.seed || 1);
    const N = opts.count;
    const c = new THREE.Vector3(...(opts.center || [0, 0, 0]));
    // reservplatser för bitar från uppspräckta asteroider
    const SPARE = Math.min(220, Math.max(60, Math.round(N * 0.6)));
    const NT = N + SPARE;
    this.n = NT; this.n0 = N;
    this.px = new Float32Array(NT); this.py = new Float32Array(NT); this.pz = new Float32Array(NT); this.r = new Float32Array(NT);
    this.cr = new Float32Array(NT); this.hp = new Float32Array(NT); this.dead = new Uint8Array(NT);
    this.ax = []; this.spin = new Float32Array(NT); this.ang = new Float32Array(NT); this.base = []; this.var = new Uint8Array(NT); this.slot = new Uint16Array(NT);
    this.proxies = new Map();
    this.center = c.clone();
    const counts = new Array(VARIANTS).fill(0);
    const v = new THREE.Vector3();
    const avoid = opts.avoid || [];
    for (let i = 0; i < N; i++) {
      let ok = false, tries = 0, R = 0;
      while (!ok && tries++ < 30) {
        R = opts.minR + (opts.maxR - opts.minR) * Math.pow(rng(), 3.2);
        if (opts.shape === 'belt') {
          const a = rng() * Math.PI * 2, rr = opts.radius + (rng() - 0.5) * opts.thickness;
          v.set(Math.cos(a) * rr, (rng() - 0.5) * opts.thickness * 0.35, Math.sin(a) * rr);
        } else if (opts.shape === 'slab') {
          v.set((rng() - 0.5) * 2 * opts.radius, (rng() - 0.5) * opts.thickness, (rng() - 0.5) * 2 * opts.radius);
        } else {
          v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
          if (v.lengthSq() > 1) continue;
          v.multiplyScalar(opts.radius);
          if (opts.inner && v.length() < opts.inner) continue;
        }
        v.add(c);
        ok = true;
        for (const a of avoid) if (v.distanceTo(a.p) < a.r + R) { ok = false; break; }
      }
      if (!ok) { R = 0.01; v.set(0, -1e6, 0); }
      const k = Math.floor(rng() * VARIANTS);
      this.px[i] = v.x; this.py[i] = v.y; this.pz[i] = v.z; this.r[i] = R; this.cr[i] = R * geos[k].userData.rad;
      this.var[i] = k; this.slot[i] = counts[k]++;
      this.ax.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
      this.spin[i] = (rng() - 0.5) * (R > 60 ? 0.05 : 0.4); this.ang[i] = rng() * 6;
      this.base.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6, rng() * 6, rng() * 6)));
      this.hp[i] = ok ? rockHp(R) : 1e9; this.dead[i] = ok ? 0 : 1;
    }
    this.free = [];
    for (let i = N; i < NT; i++) {
      const k = i % VARIANTS;
      this.px[i] = c.x; this.py[i] = c.y; this.pz[i] = c.z; this.r[i] = 0; this.cr[i] = 0; this.dead[i] = 1;
      this.var[i] = k; this.slot[i] = counts[k]++;
      this.ax.push(new THREE.Vector3(0, 1, 0)); this.base.push(new THREE.Quaternion());
      this.free.push(NT - 1 - (i - N)); // pop() ger lägsta lediga index först
    }
    this.meshes = [];
    const tint = new THREE.Color(opts.tint || '#ffffff');
    const tmpC = new THREE.Color();
    for (let k = 0; k < VARIANTS; k++) {
      const m = new THREE.InstancedMesh(geos[k], mat('rock'), Math.max(1, counts[k]));
      m.count = counts[k];
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let j = 0; j < counts[k]; j++) { const b = 0.75 + rng() * 0.35; tmpC.copy(tint).multiplyScalar(b); m.setColorAt(j, tmpC); }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.meshes.push(m);
      scene.add(m);
    }
    // rutnät
    this.cell = 320;
    this.grid = new Map();
    for (let i = 0; i < N; i++) {
      const R = this.cr[i];
      this._cells(this.px[i], this.py[i], this.pz[i], R, key => { let a = this.grid.get(key); if (!a) this.grid.set(key, a = []); a.push(i); });
    }
    this.stamp = new Uint32Array(this.n); this.stampN = 1;
    this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.time = 0;
    this.update(0, true);
  }
  _cells(x, y, z, r, fn) {
    const C = this.cell;
    const x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C);
    const y0 = Math.floor((y - r) / C), y1 = Math.floor((y + r) / C);
    const z0 = Math.floor((z - r) / C), z1 = Math.floor((z + r) / C);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) fn(((i + 2048) * 4096 + (j + 2048)) * 4096 + (k + 2048));
  }
  /** Anropar fn(index) för asteroider vars rutor överlappar sfären (dubbletter filtreras). */
  query(x, y, z, r, fn) {
    const s = ++this.stampN;
    this._cells(x, y, z, r, key => {
      const a = this.grid.get(key); if (!a) return;
      for (const i of a) { if (this.stamp[i] === s || this.dead[i]) continue; this.stamp[i] = s; fn(i); }
    });
  }
  /** Närmaste kollision mellan sfär (x,y,z,r) och asteroid. Returnerar index eller −1. */
  hitSphere(x, y, z, r) {
    let hit = -1;
    this.query(x, y, z, r, i => {
      if (hit >= 0) return;
      const dx = x - this.px[i], dy = y - this.py[i], dz = z - this.pz[i], rr = r + this.cr[i];
      if (dx * dx + dy * dy + dz * dz < rr * rr) hit = i;
    });
    return hit;
  }
  /** Segment p0→p1 mot asteroider (sfärer). Returnerar { i, t } eller null. */
  hitSegment(p0, p1) {
    const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2, mz = (p0.z + p1.z) / 2;
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const L2 = dx * dx + dy * dy + dz * dz, half = Math.sqrt(L2) / 2;
    let best = null;
    this.query(mx, my, mz, half, i => {
      const ox = this.px[i] - p0.x, oy = this.py[i] - p0.y, oz = this.pz[i] - p0.z;
      let t = L2 > 0 ? (ox * dx + oy * dy + oz * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const cx = p0.x + dx * t - this.px[i], cy = p0.y + dy * t - this.py[i], cz = p0.z + dz * t - this.pz[i];
      const rr = this.cr[i];
      if (cx * cx + cy * cy + cz * cz < rr * rr && (!best || t < best.t)) best = { i, t };
    });
    return best;
  }
  _write(i) {
    const q = this._q, m = this._m, p = this._p, s = this._s;
    q.setFromAxisAngle(this.ax[i], this.ang[i]).multiply(this.base[i]);
    p.set(this.px[i], this.py[i], this.pz[i]); s.setScalar(this.dead[i] ? 0 : this.r[i]);
    m.compose(p, q, s);
    this.meshes[this.var[i]].setMatrixAt(this.slot[i], m);
  }
  update(dt, force = false) {
    this.time += dt;
    for (let i = 0; i < this.n; i++) {
      if (!force && (this.spin[i] === 0 || this.dead[i])) continue;
      this.ang[i] += this.spin[i] * dt;
      this._write(i);
    }
    for (const mesh of this.meshes) { mesh.instanceMatrix.needsUpdate = true; if (force) mesh.computeBoundingSphere(); }
  }
  /** Målobjekt för asteroid i (cachat så att målväljaren får samma objekt varje gång). */
  target(i) {
    let t = this.proxies.get(i);
    if (!t) { t = new RockTarget(this, i); this.proxies.set(i, t); }
    return t;
  }
  /**
   * Spräcker asteroid i. Deterministiskt utifrån seed (samma resultat hos alla onlinespelare).
   * Returnerar { pos, R, frags: [index] } eller null.
   */
  fracture(i, seed) {
    if (i < 0 || i >= this.n || this.dead[i]) return null;
    const R = this.r[i], pos = new THREE.Vector3(this.px[i], this.py[i], this.pz[i]);
    this.dead[i] = 1; this.hp[i] = 0; this._write(i);
    const pr = this.proxies.get(i); if (pr) { pr.dead = true; this.proxies.delete(i); }
    const rng = makeRng((seed | 0) + 1);
    const n = R < 14 ? 0 : R < 28 ? 2 : 3 + (rng() < 0.5 ? 1 : 0);
    const geos = buildGeos(), frags = [], v = new THREE.Vector3();
    for (let k = 0; k < n && this.free.length; k++) {
      const j = this.free.pop();
      const r = R * (0.36 + rng() * 0.16);
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); if (v.lengthSq() < 0.01) v.set(1, 0, 0); v.normalize();
      this.px[j] = pos.x + v.x * R * 0.5; this.py[j] = pos.y + v.y * R * 0.5; this.pz[j] = pos.z + v.z * R * 0.5;
      this.r[j] = r; this.cr[j] = r * geos[this.var[j]].userData.rad; this.hp[j] = rockHp(r); this.dead[j] = 0;
      this.ax[j].set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(); this.spin[j] = (rng() - 0.5) * 0.9; this.ang[j] = rng() * 6;
      this.base[j].setFromEuler(new THREE.Euler(rng() * 6, rng() * 6, rng() * 6));
      this._cells(this.px[j], this.py[j], this.pz[j], this.cr[j], key => { let a = this.grid.get(key); if (!a) this.grid.set(key, a = []); a.push(j); });
      this._write(j);
      frags.push(j);
    }
    for (const mesh of this.meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    return { pos, R, frags };
  }
  /** Normal i punkten (från asteroidens centrum). */
  normalAt(i, x, y, z, out) { return out.set(x - this.px[i], y - this.py[i], z - this.pz[i]).normalize(); }
  dispose() { for (const m of this.meshes) { this.scene.remove(m); m.dispose(); } this.meshes.length = 0; this.grid.clear(); }
}
