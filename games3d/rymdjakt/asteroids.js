/**
 * Rymdjakt – asteroidfält: deformerade ikosaedrar som instansieras, med rumsligt rutnät för snabba kollisionstester.
 */
import * as THREE from 'three';
import { makeRng } from '../../engine/kit.js';
import { makeNoise3, mat } from './gfx.js';

const VARIANTS = 6;
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
    this.n = N;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N); this.r = new Float32Array(N);
    this.cr = new Float32Array(N);
    this.ax = []; this.spin = new Float32Array(N); this.ang = new Float32Array(N); this.base = []; this.var = new Uint8Array(N); this.slot = new Uint16Array(N);
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
    this.stamp = new Uint32Array(N); this.stampN = 1;
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
      for (const i of a) { if (this.stamp[i] === s) continue; this.stamp[i] = s; fn(i); }
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
  update(dt, force = false) {
    this.time += dt;
    const q = this._q, m = this._m, p = this._p, s = this._s;
    for (let i = 0; i < this.n; i++) {
      if (!force && this.spin[i] === 0) continue;
      this.ang[i] += this.spin[i] * dt;
      q.setFromAxisAngle(this.ax[i], this.ang[i]).multiply(this.base[i]);
      p.set(this.px[i], this.py[i], this.pz[i]); s.setScalar(this.r[i]);
      m.compose(p, q, s);
      this.meshes[this.var[i]].setMatrixAt(this.slot[i], m);
    }
    for (const mesh of this.meshes) { mesh.instanceMatrix.needsUpdate = true; if (force) mesh.computeBoundingSphere(); }
  }
  /** Normal i punkten (från asteroidens centrum). */
  normalAt(i, x, y, z, out) { return out.set(x - this.px[i], y - this.py[i], z - this.pz[i]).normalize(); }
  dispose() { for (const m of this.meshes) { this.scene.remove(m); m.dispose(); } this.meshes.length = 0; this.grid.clear(); }
}
