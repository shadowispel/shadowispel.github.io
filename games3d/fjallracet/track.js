/**
 * Fjällracet – banan: spline-sampling, ramar med doserade kurvor, spårfrågor (projektion),
 * racinglinje för AI samt vägmesh, räcken, tunnlar, broar, startportal.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildLayout } from './trackdata.js';
import { THEMES } from './themes.js';
import * as TX from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

function circSmooth(arr, rad, passes = 1) {
  const n = arr.length; let src = arr;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    let sum = 0; for (let k = -rad; k <= rad; k++) sum += src[(k + n) % n];
    for (let i = 0; i < n; i++) {
      out[i] = sum / (2 * rad + 1);
      sum += src[(i + rad + 1) % n] - src[(i - rad + n) % n];
    }
    src = out;
  }
  return src;
}

export class Track {
  constructor(def, reverse = false) {
    this.def = def; this.reverse = reverse;
    this.theme = THEMES[def.theme];
    this.half = def.half; this.shoulder = def.shoulder; this.limit = def.half + def.shoulder;
    this.grip = def.grip;
    const lay = buildLayout(def, reverse);
    const curve = new THREE.CatmullRomCurve3(lay.points.map(p => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
    const len = curve.getLength();
    const N = Math.max(200, Math.round(len / 2));
    const pts = curve.getSpacedPoints(N); pts.pop();
    this.N = N; this.L = len; this.ds = len / N;
    const ds = this.ds;
    const P = this.P = new Float32Array(N * 3);
    pts.forEach((p, i) => { P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; });

    // flaggor
    this.bridge = new Uint8Array(N); this.tunnel = new Uint8Array(N); this.bridgeKind = new Uint8Array(N); // 1 hängbro, 2 lång bro
    this.openL = new Uint8Array(N); this.openR = new Uint8Array(N);
    this.tags = lay.tags;
    const rangeIdx = (t, padM = 0) => [Math.round(t.from * N - padM / ds), Math.round(t.to * N + padM / ds)];
    const ys = new Float32Array(N); for (let i = 0; i < N; i++) ys[i] = P[i * 3 + 1];
    for (const t of lay.tags) {
      const [a, b] = rangeIdx(t);
      for (let i = a; i <= b; i++) {
        const j = ((i % N) + N) % N;
        if (t.bridge) { this.bridge[j] = 1; this.bridgeKind[j] = t.suspension ? 1 : t.long ? 2 : 0; }
        if (t.tunnel) this.tunnel[j] = 1;
        if (t.open === 'L' || t.open === 'B') this.openL[j] = 1;
        if (t.open === 'R' || t.open === 'B') this.openR[j] = 1;
      }
      if (t.crest) {
        // krön med "kant": stiger mjukt, faller brant
        const mid = (a + b) / 2, segLen = (b - a) * ds;
        const Lb = Math.min(76, segLen * 0.7);
        const s0 = mid * ds - Lb * 0.55, sp = s0 + Lb * 0.64, s1 = s0 + Lb;
        const h = t.crest, k0 = smooth01(0.88);
        for (let i = Math.floor(s0 / ds) - 1; i <= Math.ceil(s1 / ds) + 1; i++) {
          const j = ((i % N) + N) % N, s = i * ds;
          let dy = 0;
          if (s >= s0 && s <= sp) dy = h * smooth01(((s - s0) / (sp - s0)) * 0.88) / k0;
          else if (s > sp && s <= s1) dy = h * (1 - smooth01((s - sp) / (s1 - sp)));
          ys[j] += dy;
        }
      }
      if (t.lift && t.long) {
        // lång bro: valvformad profil – högst i mitten (segelfri höjd), låg vid landfästena
        for (let i = a; i <= b; i++) {
          const j = ((i % N) + N) % N, u = (i - a) / Math.max(1, b - a);
          ys[j] += 1.5 + (t.lift - 1.5) * Math.pow(Math.sin(u * Math.PI), 0.8);
        }
        for (let k = 1; k < 40; k++) { const f = 1.5 * (1 - k / 40); ys[((a - k) % N + N) % N] += f; ys[(b + k) % N] += f; }
      } else if (t.lift) {
        const ramp = 85 / ds;
        for (let i = Math.floor(a - ramp); i <= Math.ceil(b + ramp); i++) {
          const j = ((i % N) + N) % N;
          const f = i < a ? smooth01((i - (a - ramp)) / ramp) : i > b ? smooth01(((b + ramp) - i) / ramp) : 1;
          ys[j] += t.lift * f;
        }
      }
    }
    for (let i = 0; i < N; i++) P[i * 3 + 1] = ys[i];

    // ramar
    const T = this.T = new Float32Array(N * 3), R = this.R = new Float32Array(N * 3), Nn = this.Nm = new Float32Array(N * 3);
    const th = new Float32Array(N);
    const v = new THREE.Vector3(), r0 = new THREE.Vector3(), n0 = new THREE.Vector3(), rr = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = ((i - 1 + N) % N) * 3, b = ((i + 1) % N) * 3;
      v.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]).normalize();
      T[i * 3] = v.x; T[i * 3 + 1] = v.y; T[i * 3 + 2] = v.z;
      th[i] = Math.atan2(v.x, v.z);
    }
    let k = new Float32Array(N);
    for (let i = 0; i < N; i++) k[i] = wrapAng(th[(i + 1) % N] - th[(i - 1 + N) % N]) / (2 * ds);
    k = circSmooth(k, 5, 2);
    this.k = k;
    const bankK = 5.5 * (this.theme.bank == null ? 1 : this.theme.bank);
    let bank = new Float32Array(N);
    for (let i = 0; i < N; i++) bank[i] = clamp(-k[i] * bankK, -0.15, 0.15);
    bank = circSmooth(bank, 10, 2);
    this.bank = bank;
    for (let i = 0; i < N; i++) {
      v.set(T[i * 3], T[i * 3 + 1], T[i * 3 + 2]);
      r0.crossVectors(v, UP).normalize();
      n0.crossVectors(r0, v).normalize();
      const cb = Math.cos(bank[i]), sb = Math.sin(bank[i]);
      rr.copy(r0).multiplyScalar(cb).addScaledVector(n0, -sb).normalize();
      nn.crossVectors(rr, v).normalize();
      R[i * 3] = rr.x; R[i * 3 + 1] = rr.y; R[i * 3 + 2] = rr.z;
      Nn[i * 3] = nn.x; Nn[i * 3 + 1] = nn.y; Nn[i * 3 + 2] = nn.z;
    }
    // vertikal krökning (negativ = krön)
    const slope = new Float32Array(N);
    for (let i = 0; i < N; i++) slope[i] = (P[((i + 1) % N) * 3 + 1] - P[((i - 1 + N) % N) * 3 + 1]) / (2 * ds);
    let kv = new Float32Array(N);
    for (let i = 0; i < N; i++) kv[i] = (slope[(i + 1) % N] - slope[(i - 1 + N) % N]) / (2 * ds);
    this.kv = circSmooth(kv, 1, 1);

    this.minY = Infinity; this.maxY = -Infinity;
    this.bbox = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (let i = 0; i < N; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      this.minY = Math.min(this.minY, y); this.maxY = Math.max(this.maxY, y);
      this.bbox.x0 = Math.min(this.bbox.x0, x); this.bbox.x1 = Math.max(this.bbox.x1, x);
      this.bbox.z0 = Math.min(this.bbox.z0, z); this.bbox.z1 = Math.max(this.bbox.z1, z);
    }
    this._buildRacingLine();
    this.checkpoints = 8;
  }

  /* ---------- frågor ---------- */
  wallAt(i, side) { // side: -1 vänster, +1 höger
    if (this.tunnel[i]) return true;
    return side < 0 ? !this.openL[i] : !this.openR[i];
  }

  /** Projicerar pos på banan. out: {i,t,s,d,h,c,T,R,N} – hint = senaste index (eller -1). */
  project(pos, hint, out) {
    const P = this.P, N = this.N;
    let best = -1, bestD = Infinity, bestT = 0;
    const test = (i) => {
      const j = (i + 1) % N, a = i * 3, b = j * 3;
      const sx = P[b] - P[a], sy = P[b + 1] - P[a + 1], sz = P[b + 2] - P[a + 2];
      const px = pos.x - P[a], py = pos.y - P[a + 1], pz = pos.z - P[a + 2];
      const sl = sx * sx + sy * sy + sz * sz;
      let t = (px * sx + py * sy + pz * sz) / sl; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - sx * t, dy = py - sy * t, dz = pz - sz * t;
      const d2 = dx * dx + dy * dy * 2.5 + dz * dz;
      if (d2 < bestD) { bestD = d2; best = i; bestT = t; }
    };
    if (hint == null || hint < 0) { for (let i = 0; i < N; i++) test(i); }
    else { for (let k = -5; k <= 9; k++) test(((hint + k) % N + N) % N); }
    return this._fill(best, bestT, pos, out);
  }
  _fill(i, t, pos, out) {
    const N = this.N, j = (i + 1) % N, a = i * 3, b = j * 3;
    const P = this.P, T = this.T, R = this.R, Nm = this.Nm;
    out.i = i; out.t = t; out.s = (i + t) * this.ds;
    out.c.set(P[a] + (P[b] - P[a]) * t, P[a + 1] + (P[b + 1] - P[a + 1]) * t, P[a + 2] + (P[b + 2] - P[a + 2]) * t);
    out.T.set(T[a] + (T[b] - T[a]) * t, T[a + 1] + (T[b + 1] - T[a + 1]) * t, T[a + 2] + (T[b + 2] - T[a + 2]) * t).normalize();
    out.R.set(R[a] + (R[b] - R[a]) * t, R[a + 1] + (R[b + 1] - R[a + 1]) * t, R[a + 2] + (R[b + 2] - R[a + 2]) * t).normalize();
    out.N.set(Nm[a] + (Nm[b] - Nm[a]) * t, Nm[a + 1] + (Nm[b + 1] - Nm[a + 1]) * t, Nm[a + 2] + (Nm[b + 2] - Nm[a + 2]) * t).normalize();
    if (pos) {
      const px = pos.x - out.c.x, py = pos.y - out.c.y, pz = pos.z - out.c.z;
      out.d = px * out.R.x + py * out.R.y + pz * out.R.z;
      out.h = px * out.N.x + py * out.N.y + pz * out.N.z;
    } else { out.d = 0; out.h = 0; }
    out.kv = this.kv[i];
    return out;
  }
  /** Ram vid sträcka s (meter). */
  frameAt(s, out) {
    const L = this.L; s = ((s % L) + L) % L;
    const f = s / this.ds; const i = Math.floor(f) % this.N;
    return this._fill(i, f - Math.floor(f), null, out);
  }
  static makeFrame() { return { i: 0, t: 0, s: 0, d: 0, h: 0, kv: 0, c: new THREE.Vector3(), T: new THREE.Vector3(), R: new THREE.Vector3(), N: new THREE.Vector3() }; }
  /** Världsposition för (s, d, h). */
  pointAt(s, d, h, outV, tmpFrame) {
    const f = this.frameAt(s, tmpFrame || (this._tf || (this._tf = Track.makeFrame())));
    return outV.copy(f.c).addScaledVector(f.R, d).addScaledVector(f.N, h);
  }
  sx(i) { return this.P[i * 3]; } sy(i) { return this.P[i * 3 + 1]; } sz(i) { return this.P[i * 3 + 2]; }

  /* ---------- racinglinje + målhastigheter ---------- */
  _buildRacingLine() {
    const N = this.N, P = this.P, R = this.R;
    const lim = this.half - 1.7;
    const o = new Float32Array(N);
    const pass = (kk, iters, rate) => {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < N; i++) {
          const a = ((i - kk + N) % N), b = (i + kk) % N;
          const ax = P[a * 3] + R[a * 3] * o[a], az = P[a * 3 + 2] + R[a * 3 + 2] * o[a];
          const bx = P[b * 3] + R[b * 3] * o[b], bz = P[b * 3 + 2] + R[b * 3 + 2] * o[b];
          const mx = (ax + bx) / 2 - P[i * 3], mz = (az + bz) / 2 - P[i * 3 + 2];
          const rl = Math.hypot(R[i * 3], R[i * 3 + 2]) || 1;
          const target = (mx * R[i * 3] + mz * R[i * 3 + 2]) / rl;
          o[i] = clamp(o[i] + (target - o[i]) * rate, -lim, lim);
        }
      }
    };
    pass(14, 60, 0.6); pass(7, 60, 0.6); pass(3, 30, 0.5);
    this.lineO = circSmooth(o, 3, 2);
    for (let i = 0; i < N; i++) this.lineO[i] = clamp(this.lineO[i], -lim, lim);
    // kurvatur längs linjen
    const qx = new Float32Array(N), qz = new Float32Array(N);
    for (let i = 0; i < N; i++) { qx[i] = P[i * 3] + R[i * 3] * this.lineO[i]; qz[i] = P[i * 3 + 2] + R[i * 3 + 2] * this.lineO[i]; }
    let kl = new Float32Array(N);
    const K = 4;
    for (let i = 0; i < N; i++) {
      const a = (i - K + N) % N, b = (i + K) % N;
      const h1 = Math.atan2(qx[i] - qx[a], qz[i] - qz[a]), h2 = Math.atan2(qx[b] - qx[i], qz[b] - qz[i]);
      const l = Math.hypot(qx[b] - qx[a], qz[b] - qz[a]) || 1;
      kl[i] = Math.abs(wrapAng(h2 - h1)) / l * 2;
    }
    kl = circSmooth(kl, 2, 1);
    const gRef = 14 * this.grip;
    const V = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // dosering hjälper lite; krön sänker (lättare bil)
      const bankHelp = 1 + Math.abs(this.bank[i]) * 2.2;
      const kEff = Math.max(kl[i], Math.abs(this.k[i]) * 0.6);
      let vmax = Math.sqrt(gRef * bankHelp / Math.max(kEff, 1e-4));
      V[i] = Math.min(vmax, 95);
    }
    const dec = 13 * Math.min(1, this.grip * 1.2);
    for (let pass2 = 0; pass2 < 2; pass2++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = V[(i + 1) % N];
        const slope = (P[((i + 1) % N) * 3 + 1] - P[i * 3 + 1]) / this.ds;
        const de = Math.max(4, dec + 15 * 0.9 * slope);
        V[i] = Math.min(V[i], Math.sqrt(nx * nx + 2 * de * this.ds));
      }
    }
    this.lineV = V;
    this.lineK = kl;
    // varning 0..1: hur mycket farten måste sänkas inom ca 110 m framåt
    const warn = new Float32Array(N), look = Math.round(110 / this.ds);
    for (let i = 0; i < N; i++) {
      let m = V[i]; for (let k = 1; k <= look; k += 2) m = Math.min(m, V[(i + k) % N]);
      warn[i] = clamp((Math.min(V[i], 70) - m) / 22, 0, 1);
    }
    this.warn = circSmooth(warn, 4, 1);
  }

  /* ---------- meshbygge ---------- */
  buildMeshes(q) {
    const group = new THREE.Group(); group.name = 'track';
    const th = this.theme, N = this.N, ds = this.ds;
    const disposables = this._disp = [];
    const mat = (m) => { disposables.push(m); return m; };
    const all = []; for (let i = 0; i <= N; i++) all.push(i % N);

    // --- väg ---
    let roadMat;
    const PO = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
    if (th.road === 'ice') {
      const t = TX.groundTex('ice');
      roadMat = mat(new THREE.MeshStandardMaterial(Object.assign({ map: t, color: 0xdcecff, roughness: 0.18, metalness: 0.15 }, PO)));
      this._roadUScale = 2 * this.half / 10;
    } else if (th.road === 'gravel') {
      roadMat = mat(new THREE.MeshStandardMaterial(Object.assign({ map: TX.gravelRoadTex(), roughness: 0.97 }, PO)));
    } else if (th.road === 'snow') {
      roadMat = mat(new THREE.MeshStandardMaterial(Object.assign({ map: TX.snowRoadTex(), roughness: 0.62, metalness: 0.02, envMapIntensity: 0.6 }, PO)));
    } else if (th.road === 'wet' || th.road === 'neo') {
      // våt asfalt: låg grovhet + pölar (grovhetskarta) så att ljus och neon speglas
      const neo = th.road === 'neo';
      roadMat = mat(new THREE.MeshStandardMaterial(Object.assign({ map: TX.asphaltTex(th.road), roughnessMap: TX.puddleTex(), roughness: neo ? 0.5 : 0.55, metalness: neo ? 0.3 : 0.15, envMapIntensity: neo ? 1.25 : 0.9 }, PO)));
    } else {
      roadMat = mat(new THREE.MeshStandardMaterial(Object.assign({ map: TX.asphaltTex(th.road), roughness: th.road === 'airfield' ? 0.85 : 0.88 }, PO)));
    }
    this.roadUniforms = { uTime: { value: 0 } };
    if (th.lamps || th.edgeGlow) this._roadShader(roadMat);
    const h = this.half, lim = this.limit;
    const roadCols = [];
    for (let c = 0; c <= 4; c++) { const d = -h + c * h / 2; roadCols.push({ d, h: 0, u: th.road === 'ice' ? (d + h) / 10 : (d + h) / (2 * h) }); }
    const roadGeo = this.ribbon(all, roadCols, th.road === 'ice' ? 10 : 16);
    if (th.lamps || th.edgeGlow) this._trackAttrs(roadGeo, all, roadCols);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true; road.name = 'road';
    group.add(road);
    this.roadMesh = road;

    // --- vägrenar ---
    const shMat = mat(new THREE.MeshStandardMaterial({ map: TX.groundTex(th.shoulder), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    for (const side of [-1, 1]) {
      const cols = side > 0 ? [{ d: h, h: 0, u: 0 }, { d: lim, h: -0.02, u: (lim - h) / 4 }] : [{ d: -lim, h: -0.02, u: (lim - h) / 4 }, { d: -h, h: 0, u: 0 }];
      const m = new THREE.Mesh(this.ribbon(all, cols, 4), shMat); m.receiveShadow = true; group.add(m);
      // terrängflik under kanten (döljer glipor) – går lite utanför och nedåt
      const flapCols = side > 0 ? [{ d: lim, h: -0.02, u: 0 }, { d: lim + 2.5, h: -0.9, u: 0.6 }] : [{ d: -lim - 2.5, h: -0.9, u: 0.6 }, { d: -lim, h: -0.02, u: 0 }];
      const runs = this.runs(i => this.bridge[i] || this.tunnel[i] ? 0 : 1).filter(r => r.v === 1);
      for (const r of runs) { const fm = new THREE.Mesh(this.ribbon(r.idx, flapCols, 4), shMat); fm.receiveShadow = true; group.add(fm); }
    }

    // --- kantstenar (curbs) i kurvor ---
    const curbMat = mat(new THREE.MeshStandardMaterial({ map: TX.curbTex(), roughness: 0.7 }));
    if (th.road !== 'ice' && th.road !== 'gravel' && th.road !== 'snow' && th.tunnel !== 'city') {
      const curbOn = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (Math.abs(this.k[i]) > 1 / 95 && !this.bridge[i] && !this.tunnel[i]) for (let k2 = -6; k2 <= 6; k2++) curbOn[(i + k2 + N) % N] = 1;
      const runs = this.runs(i => curbOn[i]).filter(r => r.v === 1);
      for (const r of runs) for (const side of [-1, 1]) {
        const cols = side > 0
          ? [{ d: h - 0.25, h: 0.005, u: 0 }, { d: h + 0.55, h: 0.08, u: 0.5 }, { d: h + 1.1, h: 0.01, u: 1 }]
          : [{ d: -h - 1.1, h: 0.01, u: 1 }, { d: -h - 0.55, h: 0.08, u: 0.5 }, { d: -h + 0.25, h: 0.005, u: 0 }];
        const m = new THREE.Mesh(this.ribbon(r.idx, cols, 4), curbMat); m.receiveShadow = true; group.add(m);
      }
    }

    // --- start/mål ---
    const chk = mat(new THREE.MeshStandardMaterial({ map: TX.checkerTex(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    const finIdx = [N - 1, 0, 1];
    const finGeo = this.ribbon(finIdx, [{ d: -h, h: 0.015, u: 0 }, { d: h, h: 0.015, u: 1 }], 4.0, -2 * ds);
    group.add(new THREE.Mesh(finGeo, chk));
    this._buildGantry(group, mat);

    // --- räcken ---
    this._buildBarriers(group, mat, q);
    // --- tunnlar ---
    this._buildTunnels(group, mat);
    // --- broar ---
    this._buildBridges(group, mat);
    // --- pilskyltar ---
    this._buildChevrons(group, mat);
    // --- startrutor ---
    this._buildGridMarks(group, mat);

    group.traverse(o => { if (o.isMesh && o.geometry) disposables.push(o.geometry); });
    return group;
  }
  dispose() { (this._disp || []).forEach(d => d.dispose && d.dispose()); this._disp = []; }

  /** Gatlampornas placering (delas av vägens shader och world.js): var 'sp' meter, växelvis höger/vänster. */
  lampLayout() {
    const th = this.theme.lamps; if (!th) return null;
    if (this._lamps) return this._lamps;
    const n = Math.max(2, 2 * Math.round(this.L / (2 * th.spacing)));
    const sp = this.L / n, off = sp * 0.5, D = this.limit - 1.2;
    const list = []; for (let k = 0; k < n; k++) list.push({ s: off + k * sp, side: k % 2 ? -1 : 1 });
    return (this._lamps = { sp, off, D, list, n });
  }
  /** Lägger till attributen trk = (s, d) och warn på vägbandet. */
  _trackAttrs(geo, idx, cols) {
    const C = cols.length, Rn = idx.length;
    const trk = new Float32Array(Rn * C * 2), wr = new Float32Array(Rn * C);
    for (let r = 0; r < Rn; r++) for (let c = 0; c < C; c++) {
      const o = r * C + c; trk[o * 2] = r * this.ds; trk[o * 2 + 1] = cols[c].d; wr[o] = this.warn[idx[r]];
    }
    geo.setAttribute('trk', new THREE.BufferAttribute(trk, 2));
    geo.setAttribute('warn', new THREE.BufferAttribute(wr, 1));
  }
  /** Ljuslager i vägens shader: ljuspölar från gatlamporna (periodiskt längs banan) och pulserande kantlister. */
  _roadShader(m) {
    const th = this.theme, U = this.roadUniforms, L = th.lamps, lay = this.lampLayout();
    const defs = [];
    if (L) {
      defs.push('#define ROAD_LAMPS');
      Object.assign(U, { uLampSp: { value: lay.sp }, uLampOff: { value: lay.off }, uLampD: { value: lay.D }, uLampR: { value: L.radius }, uLampStr: { value: L.strength }, uLampCol: { value: new THREE.Vector3(...L.color) } });
    }
    if (th.edgeGlow) {
      defs.push('#define ROAD_EDGE');
      Object.assign(U, { uHalf: { value: this.half }, uEdge1: { value: new THREE.Vector3(...th.edgeGlow) }, uEdge2: { value: new THREE.Vector3(...(th.edgeGlow2 || th.edgeGlow)) } });
    }
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute vec2 trk; attribute float warn; varying vec2 vTrk; varying float vWarn;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTrk = trk; vWarn = warn;');
      sh.fragmentShader = defs.join('\n') + `
        varying vec2 vTrk; varying float vWarn; uniform float uTime;
        #ifdef ROAD_LAMPS
        uniform float uLampSp, uLampOff, uLampD, uLampR, uLampStr; uniform vec3 uLampCol;
        #endif
        #ifdef ROAD_EDGE
        uniform float uHalf; uniform vec3 uEdge1, uEdge2;
        #endif
        ` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float s = vTrk.x, d = vTrk.y;
          #ifdef ROAD_LAMPS
          float P2 = uLampSp * 2.0, sl = mod(s - uLampOff, P2);
          float dR = d - uLampD, dL = d + uLampD, ir = 1.0 / (uLampR * uLampR);
          float a0 = sl, a1 = sl - uLampSp, a2 = sl - P2;
          float l = exp(-(a0 * a0 * 0.55 + dR * dR) * ir) + exp(-(a1 * a1 * 0.55 + dL * dL) * ir) + exp(-(a2 * a2 * 0.55 + dR * dR) * ir);
          totalEmissiveRadiance += diffuseColor.rgb * uLampCol * (l * uLampStr);
          #endif
          #ifdef ROAD_EDGE
          float ad = abs(d);
          float e = smoothstep(uHalf - 0.62, uHalf - 0.48, ad) * (1.0 - smoothstep(uHalf - 0.3, uHalf - 0.16, ad));
          float pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(s * 0.22 - uTime * (5.0 + vWarn * 9.0)), 2.0);
          vec3 ec = mix(d > 0.0 ? uEdge1 : uEdge2, vec3(1.0, 0.42, 0.08), smoothstep(0.15, 0.6, vWarn));
          totalEmissiveRadiance += ec * e * pulse * 2.6;
          #endif
        }`);
    };
    m.customProgramCacheKey = () => 'road:' + defs.join(',');
  }

  /** Delar upp banan i sammanhängande körningar där fn(i) har samma värde. Returnerar [{v, idx:[...]}] */
  runs(fn) {
    const N = this.N; const vals = new Array(N); for (let i = 0; i < N; i++) vals[i] = fn(i);
    let start = -1; for (let i = 0; i < N; i++) if (vals[i] !== vals[(i - 1 + N) % N]) { start = i; break; }
    if (start < 0) { const idx = []; for (let i = 0; i <= N; i++) idx.push(i % N); return [{ v: vals[0], idx, closed: true }]; }
    const out = []; let cur = null;
    for (let k = 0; k < N; k++) {
      const i = (start + k) % N;
      if (!cur || vals[i] !== cur.v) { if (cur) cur.idx.push(i); cur = { v: vals[i], idx: [] }; out.push(cur); }
      cur.idx.push(i);
    }
    cur.idx.push(start);
    return out;
  }

  /** Bandgeometri längs index-listan med tvärsnitt cols [{d,h,u}]. vScale = meter per texturrepetition. */
  ribbon(idx, cols, vScale = 8, sOffset = null) {
    const C = cols.length, Rn = idx.length;
    const pos = new Float32Array(Rn * C * 3), uv = new Float32Array(Rn * C * 2);
    const P = this.P, R = this.R, Nm = this.Nm;
    let s = sOffset != null ? sOffset : idx[0] * this.ds;
    for (let r = 0; r < Rn; r++) {
      const i = idx[r];
      if (r > 0) s += this.ds;
      for (let c = 0; c < C; c++) {
        const col = cols[c], o = (r * C + c);
        pos[o * 3] = P[i * 3] + R[i * 3] * col.d + Nm[i * 3] * col.h;
        pos[o * 3 + 1] = P[i * 3 + 1] + R[i * 3 + 1] * col.d + Nm[i * 3 + 1] * col.h;
        pos[o * 3 + 2] = P[i * 3 + 2] + R[i * 3 + 2] * col.d + Nm[i * 3 + 2] * col.h;
        uv[o * 2] = col.u; uv[o * 2 + 1] = s / vScale;
      }
    }
    const index = [];
    for (let r = 0; r < Rn - 1; r++) for (let c = 0; c < C - 1; c++) {
      const a = r * C + c, b = a + 1, c2 = a + C, d2 = c2 + 1;
      index.push(a, b, c2, b, d2, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  /** Extruderar en sidoprofil [[x(utåt), y]] på sida side från avstånd base. */
  sideProfile(idx, side, base, prof, vScale = 4) {
    let cols = []; let u = 0;
    prof.forEach((p, k) => {
      if (k > 0) u += Math.hypot(p[0] - prof[k - 1][0], p[1] - prof[k - 1][1]);
      cols.push({ d: side * (base + p[0]), h: p[1], u: u / 2 });
    });
    if (side < 0) cols = cols.reverse();
    return this.ribbon(idx, cols, vScale);
  }

  _buildBarriers(group, mat, q) {
    const th = this.theme, lim = this.limit;
    const typeAt = (i, side) => {
      if (this.tunnel[i]) return 'none';
      if (side < 0 ? this.openL[i] : this.openR[i]) return 'open';
      if (this.bridge[i]) return 'bridge';
      return th.barrier;
    };
    const railMat = mat(new THREE.MeshStandardMaterial({ map: TX.railTex(), metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    const postMat = mat(new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.5, roughness: 0.5 }));
    const woodMat = mat(new THREE.MeshStandardMaterial({ map: TX.woodTex(), roughness: 0.9 }));
    const concMat = mat(new THREE.MeshStandardMaterial({ map: TX.concreteTex(), roughness: 0.85 }));
    const rockMat = mat(new THREE.MeshStandardMaterial({ map: TX.rockTex(), color: 0xc89a8a, roughness: 0.95 }));
    const snowMat = mat(new THREE.MeshStandardMaterial({ map: TX.groundTex('snow'), roughness: 0.9 }));
    const bankMat = th.barrier === 'bank' ? mat(new THREE.MeshStandardMaterial({ map: TX.groundTex(th.shoulder === 'moss' ? 'moss' : 'gravel'), color: th.bankColor || 0x8a7a60, roughness: 1 })) : null;
    const glowMat = th.barrier === 'neon' ? mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(...(th.edgeGlow || [0.2, 0.8, 1])).multiplyScalar(2.2) })) : null;
    const glowMat2 = th.barrier === 'neon' ? mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(...(th.edgeGlow2 || th.edgeGlow || [1, 0.3, 0.7])).multiplyScalar(2.2) })) : null;
    const steelMat = mat(new THREE.MeshStandardMaterial({ color: 0x4a5560, metalness: 0.6, roughness: 0.4 }));
    const postGeo = new THREE.BoxGeometry(0.14, 1, 0.14); postGeo.translate(0, 0.5, 0);
    this._disp.push(postGeo);
    const posts = []; // {i, side, h, kind}
    for (const side of [-1, 1]) {
      const runs = this.runs(i => typeAt(i, side));
      for (const r of runs) {
        if (r.idx.length < 2) continue;
        const t = r.v;
        if (t === 'none') continue;
        if (t === 'open') {
          // snöpinnar / pållare längs kanten
          for (let k = 0; k < r.idx.length; k += 6) posts.push({ i: r.idx[k], side, kind: 'pole' });
          continue;
        }
        if (t === 'rail' || t === 'bridge' && th.bridge === 'arch') {
          const g = this.sideProfile(r.idx, side, lim, [[0, 0.42], [0, 0.6], [0.06, 0.66], [0, 0.72], [0, 0.88]], 4);
          const m = new THREE.Mesh(g, railMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
          for (let k = 0; k < r.idx.length; k += 2) posts.push({ i: r.idx[k], side, kind: 'post' });
          if (t === 'bridge') {
            const g2 = this.sideProfile(r.idx, side, lim, [[-0.05, -0.02], [-0.05, 0.3], [0.5, 0.3], [0.5, -0.02]], 4);
            const m2 = new THREE.Mesh(g2, concMat); m2.receiveShadow = true; group.add(m2);
          }
        } else if (t === 'wood') {
          for (const y of [0.42, 0.85]) {
            const g = this.sideProfile(r.idx, side, lim, [[0, y], [0, y + 0.2], [0.1, y + 0.2], [0.1, y]], 3);
            const m = new THREE.Mesh(g, woodMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
          }
          for (let k = 0; k < r.idx.length; k += 2) posts.push({ i: r.idx[k], side, kind: 'wpost' });
        } else if (t === 'bridge' && (th.bridge === 'steel' || th.bridge === 'suspension')) {
          // stålräcke på bro: låg betongkant + två rör
          const g = this.sideProfile(r.idx, side, lim, [[-0.05, -0.02], [-0.05, 0.35], [0.4, 0.35], [0.4, -0.02]], 4);
          const m = new THREE.Mesh(g, concMat); m.receiveShadow = true; group.add(m);
          for (const y of [0.75, 1.15]) { const gr = this.sideProfile(r.idx, side, lim, [[0, y], [0, y + 0.12], [0.08, y + 0.12], [0.08, y]], 4); const mr = new THREE.Mesh(gr, glowMat && side > 0 ? glowMat : glowMat2 && side < 0 ? glowMat2 : steelMat); group.add(mr); }
          for (let k = 0; k < r.idx.length; k += 2) posts.push({ i: r.idx[k], side, kind: 'post' });
        } else if (t === 'concrete' || t === 'bridge' || t === 'neon') {
          const g = this.sideProfile(r.idx, side, lim, [[0, -0.05], [0, 0.32], [0.18, 0.95], [0.18, 1.0], [0.5, 1.0], [0.5, 0.95], [0.55, -0.05]], 6);
          const m = new THREE.Mesh(g, concMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
          if (t === 'neon') {
            // ljuslist ovanpå och en tunn list mot vägen
            const g2 = this.sideProfile(r.idx, side, lim, [[0.2, 1.0], [0.2, 1.07], [0.48, 1.07], [0.48, 1.0]], 4);
            group.add(new THREE.Mesh(g2, side > 0 ? glowMat : glowMat2));
            const g3 = this.sideProfile(r.idx, side, lim, [[-0.01, 0.5], [-0.01, 0.56], [0.02, 0.56]], 4);
            group.add(new THREE.Mesh(g3, side > 0 ? glowMat : glowMat2));
          }
        } else if (t === 'bank') {
          // jordvall med mossa/grus (rallysträcka, gruva)
          const g = this.sideProfile(r.idx, side, lim, [[-0.4, -0.08], [0.1, 0.45], [0.7, 0.95], [1.5, 1.1], [2.4, 0.8], [3.4, -0.2]], 5);
          const m = new THREE.Mesh(g, bankMat); m.receiveShadow = true; m.castShadow = true; group.add(m);
        } else if (t === 'stone') {
          const g = this.sideProfile(r.idx, side, lim, [[0, -0.1], [0, 0.72], [0.12, 0.85], [0.75, 0.85], [0.85, 0.7], [0.85, -0.1]], 5);
          const m = new THREE.Mesh(g, rockMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
        } else if (t === 'snow') {
          const g = this.sideProfile(r.idx, side, lim, [[-0.3, -0.05], [0.2, 0.7], [0.9, 1.25], [1.8, 1.35], [2.8, 0.9], [3.8, -0.1]], 6);
          const m = new THREE.Mesh(g, snowMat); m.receiveShadow = true; m.castShadow = true; group.add(m);
        }
      }
    }
    // stolpar (instansierade)
    const kinds = { post: { geo: postGeo, mat: postMat, sx: 1, sy: 0.85, off: 0.12 }, wpost: { geo: postGeo, mat: woodMat, sx: 1.2, sy: 1.15, off: 0.18 }, pole: { geo: postGeo, mat: null, sx: 0.5, sy: 1.6, off: 0.9 } };
    const poleMat = mat(new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6, emissive: 0x401800 }));
    kinds.pole.mat = poleMat;
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), basis = new THREE.Matrix4();
    for (const kind of Object.keys(kinds)) {
      const list = posts.filter(p => p.kind === kind);
      if (!list.length) continue;
      const K = kinds[kind];
      const im = new THREE.InstancedMesh(K.geo, K.mat, list.length);
      list.forEach((p, n) => {
        const i = p.i;
        const rx = this.R[i * 3], ry = this.R[i * 3 + 1], rz = this.R[i * 3 + 2];
        pp.set(this.P[i * 3] + rx * p.side * (lim + K.off), this.P[i * 3 + 1] + ry * p.side * (lim + K.off) - 0.05, this.P[i * 3 + 2] + rz * p.side * (lim + K.off));
        basis.makeBasis(new THREE.Vector3(rx, 0, rz).normalize(), UP, new THREE.Vector3(this.T[i * 3], 0, this.T[i * 3 + 2]).normalize());
        qq.setFromRotationMatrix(basis);
        sc.set(K.sx, K.sy, K.sx);
        m4.compose(pp, qq, sc); im.setMatrixAt(n, m4);
      });
      im.castShadow = kind !== 'pole'; im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
      this._disp.push(im);
    }
  }

  _buildTunnels(group, mat) {
    const th = this.theme, lim = this.limit;
    const runs = this.runs(i => this.tunnel[i]).filter(r => r.v === 1);
    if (!runs.length) return;
    const city = th.tunnel === 'city';
    const innerMat = mat(city
      ? new THREE.MeshStandardMaterial({ map: TX.concreteTex(), color: 0x8a8a90, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x6a5a40, emissiveMap: TX.concreteTex(), emissiveIntensity: 0.35 })
      : new THREE.MeshStandardMaterial({ map: TX.rockTex(), color: 0x9a948e, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x5a5040, emissiveMap: TX.rockTex(), emissiveIntensity: th.night ? 0.3 : 0.18 }));
    const outerMat = city
      ? (() => { const f = TX.facadeTex(true); return mat(new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.8, side: THREE.DoubleSide })); })()
      : mat(new THREE.MeshStandardMaterial({ map: TX.rockTex(), color: th.shoulder === 'snow' ? 0xb8b4b0 : 0x8f7f72, roughness: 1, side: THREE.DoubleSide }));
    const lampMat = mat(new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffd080, emissiveIntensity: 2.2 }));
    const W = lim + 0.35;
    // tvärsnitt: innerväggar + valv, sedan ytterhölje
    const inner = [];
    if (city) {
      inner.push([-W, -0.2], [-W, 6.2], [W, 6.2], [W, -0.2]);
    } else {
      inner.push([-W, -0.2], [-W, 4.6]);
      for (let a = 1; a < 12; a++) { const ang = Math.PI - a / 12 * Math.PI; inner.push([Math.cos(ang) * W, 4.6 + Math.sin(ang) * 3.4]); }
      inner.push([W, 4.6], [W, -0.2]);
    }
    const outer = [];
    if (city) {
      outer.push([W + 14, -0.3], [W + 14, 24], [-W - 14, 24], [-W - 14, -0.3]);
    } else {
      const OW = W + 22;
      for (let a = 0; a <= 10; a++) { const f = a / 10; const x = OW - f * 2 * OW; const y = Math.pow(Math.sin(f * Math.PI), 0.7) * 17 - 1.2 + (a % 2 ? 1.4 : -0.6) * (a > 0 && a < 10 ? 1 : 0); outer.push([x, y]); }
    }
    const loop = inner.concat(outer);
    for (const r of runs) {
      const idx = r.idx;
      // innerdel (valv) och ytterdel som två band (så texturer blir rimliga)
      const mkCols = (pts) => { let u = 0; return pts.map((p, k) => { if (k) u += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]); return { d: p[0], h: p[1], u: u / 6 }; }); };
      const gi = this.ribbon(idx, mkCols(inner), 6);
      const mi = new THREE.Mesh(gi, innerMat); mi.receiveShadow = true; mi.castShadow = true; group.add(mi);
      const go = this.ribbon(idx, mkCols([inner[inner.length - 1]].concat(outer).concat([inner[0]])), city ? 24 : 10);
      const mo = new THREE.Mesh(go, outerMat); mo.receiveShadow = true; mo.castShadow = true; group.add(mo);
      // ändlock (portaler)
      for (const end of [idx[0], idx[idx.length - 1]]) {
        const contour = loop.map(p => new THREE.Vector2(p[0], p[1]));
        const tris = THREE.ShapeUtils.triangulateShape(contour, []);
        const pos = [], uvs = [];
        const i = end;
        for (const p of contour) {
          pos.push(this.P[i * 3] + this.R[i * 3] * p.x + this.Nm[i * 3] * p.y, this.P[i * 3 + 1] + this.R[i * 3 + 1] * p.x + this.Nm[i * 3 + 1] * p.y, this.P[i * 3 + 2] + this.R[i * 3 + 2] * p.x + this.Nm[i * 3 + 2] * p.y);
          uvs.push(p.x / 8, p.y / 8);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(tris.flat()); g.computeVertexNormals();
        const m = new THREE.Mesh(g, outerMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
        // portalram
        const fr = [];
        const ring = inner.slice(1, inner.length - 1);
        const out2 = ring.map(p => [p[0] * 1.12 + Math.sign(p[0]) * 0.4, p[1] * 1.08 + 0.5]).reverse();
        const poly = [[inner[0][0] - 1.2, -0.2]].concat(ring).concat([[inner[inner.length - 1][0] + 1.2, -0.2]]).concat(out2.map((p, k) => k === 0 ? [p[0] + 0.8, p[1]] : k === out2.length - 1 ? [p[0] - 0.8, p[1]] : p));
        const c2 = poly.map(p => new THREE.Vector2(p[0], p[1]));
        let tr2; try { tr2 = THREE.ShapeUtils.triangulateShape(c2, []); } catch (e) { tr2 = []; }
        const dir = end === idx[0] ? -1 : 1;
        for (const p of c2) {
          const off = dir * 0.15;
          fr.push(this.P[i * 3] + this.R[i * 3] * p.x + this.Nm[i * 3] * p.y + this.T[i * 3] * off, this.P[i * 3 + 1] + this.R[i * 3 + 1] * p.x + this.Nm[i * 3 + 1] * p.y + this.T[i * 3 + 1] * off, this.P[i * 3 + 2] + this.R[i * 3 + 2] * p.x + this.Nm[i * 3 + 2] * p.y + this.T[i * 3 + 2] * off);
        }
        const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.Float32BufferAttribute(fr, 3));
        gf.setAttribute('uv', new THREE.Float32BufferAttribute(c2.flatMap(p => [p.x / 6, p.y / 6]), 2));
        gf.setIndex(tr2.flat()); gf.computeVertexNormals();
        const portalMat = this._portalMat || (this._portalMat = mat(new THREE.MeshStandardMaterial({ map: TX.concreteTex(), color: 0xc8c4bc, roughness: 0.8, side: THREE.DoubleSide })));
        group.add(new THREE.Mesh(gf, portalMat));
      }
      // taklampor
      const lamps = [];
      for (let k = 2; k < idx.length - 2; k += 5) lamps.push(idx[k]);
      const lg = new THREE.BoxGeometry(0.5, 0.12, 2.2); this._disp.push(lg);
      const im = new THREE.InstancedMesh(lg, lampMat, lamps.length * 2);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4(), pp = new THREE.Vector3();
      lamps.forEach((i, n) => {
        for (const side of [-1, 1]) {
          const x = city ? side * (W - 2) : side * W * 0.62, y = city ? 6.1 : 4.6 + Math.sin(Math.acos(Math.min(0.99, 0.62))) * 3.4 - 0.15;
          pp.set(this.P[i * 3] + this.R[i * 3] * x + this.Nm[i * 3] * y, this.P[i * 3 + 1] + this.R[i * 3 + 1] * x + this.Nm[i * 3 + 1] * y, this.P[i * 3 + 2] + this.R[i * 3 + 2] * x + this.Nm[i * 3 + 2] * y);
          basis.makeBasis(new THREE.Vector3(this.R[i * 3], this.R[i * 3 + 1], this.R[i * 3 + 2]), new THREE.Vector3(this.Nm[i * 3], this.Nm[i * 3 + 1], this.Nm[i * 3 + 2]), new THREE.Vector3(this.T[i * 3], this.T[i * 3 + 1], this.T[i * 3 + 2]));
          q.setFromRotationMatrix(basis);
          m4.compose(pp, q, new THREE.Vector3(1, 1, 1));
          im.setMatrixAt(n * 2 + (side > 0 ? 1 : 0), m4);
        }
      });
      im.computeBoundingSphere();
      group.add(im); this._disp.push(im);
      if (th.edgeGlow) {
        // ljuslister längs tunnelväggarna
        for (const side of [-1, 1]) for (const y of [0.9, 5.7]) {
          const g = this.ribbon(idx, side > 0 ? [{ d: W - 0.02, h: y, u: 0 }, { d: W - 0.02, h: y + 0.16, u: 1 }] : [{ d: -W + 0.02, h: y + 0.16, u: 1 }, { d: -W + 0.02, h: y, u: 0 }], 4);
          const gm = this._tunGlow || (this._tunGlow = [mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(...th.edgeGlow).multiplyScalar(2.4), side: THREE.DoubleSide })), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(...(th.edgeGlow2 || th.edgeGlow)).multiplyScalar(2.4), side: THREE.DoubleSide }))]);
          group.add(new THREE.Mesh(g, gm[side > 0 ? 0 : 1]));
        }
      }
    }
  }

  _buildBridges(group, mat) {
    const th = this.theme, lim = this.limit;
    const runs = this.runs(i => this.bridge[i]).filter(r => r.v === 1);
    if (!runs.length) return;
    const concMat = mat(new THREE.MeshStandardMaterial({ map: TX.concreteTex(), color: 0xb8b4ac, roughness: 0.85 }));
    const steelCol = th.bridge === 'arch' ? 0xc8312a : th.bridge === 'suspension' ? 0xc0402a : 0x6f7a84;
    const steelMat = mat(new THREE.MeshStandardMaterial({ color: steelCol, metalness: 0.5, roughness: 0.45 }));
    const cableMat = mat(new THREE.MeshStandardMaterial({ color: 0xd8d8d0, metalness: 0.7, roughness: 0.35 }));
    const pillarGeo = new THREE.BoxGeometry(1, 1, 1); pillarGeo.translate(0, -0.5, 0); this._disp.push(pillarGeo);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4(), pp = new THREE.Vector3(), sc = new THREE.Vector3();
    const pillars = [];
    const ground = th.water != null ? this.minY + th.water - 3 : null;
    const P = this.P, R = this.R, T = this.T;
    const at = (i, d, h, out) => out.set(P[i * 3] + R[i * 3] * d, P[i * 3 + 1] + R[i * 3 + 1] * d + h, P[i * 3 + 2] + R[i * 3 + 2] * d);
    for (const r of runs) {
      const idx = r.idx, n = idx.length;
      const kind = this.bridgeKind[idx[Math.floor(n / 2)]];
      const deck = this.ribbon(idx, [{ d: -lim - 0.6, h: 0, u: 0 }, { d: -lim - 0.6, h: -1.6, u: 0.3 }, { d: lim + 0.6, h: -1.6, u: 2.5 }, { d: lim + 0.6, h: 0, u: 2.8 }], 8);
      const dm = new THREE.Mesh(deck, concMat); dm.castShadow = true; dm.receiveShadow = true; group.add(dm);
      if (th.bridge === 'steel' || kind === 1) {
        // lådbalk i stål under däcket
        const gb = this.ribbon(idx, [{ d: -lim * 0.7, h: -1.6, u: 0 }, { d: -lim * 0.55, h: -3.2, u: 0.4 }, { d: lim * 0.55, h: -3.2, u: 1.6 }, { d: lim * 0.7, h: -1.6, u: 2 }], 8);
        group.add(new THREE.Mesh(gb, steelMat));
      }
      const lim2 = (this.limit * 1.7 + 3) ** 2;
      const clear = (i) => { for (let j = 0; j < this.N; j += 2) { if (this.bridge[j] || P[i * 3 + 1] - P[j * 3 + 1] < 3) continue; const dx = P[j * 3] - P[i * 3], dz = P[j * 3 + 2] - P[i * 3 + 2]; if (dx * dx + dz * dz < lim2) return false; } return true; };
      if (kind === 1 && n > 40) {
        this._suspension(group, idx, steelMat, cableMat, concMat, ground);
        // bara pelare på tillfarterna (utanför pylonerna)
        const p1 = Math.round(n * 0.2), p2 = Math.round(n * 0.8);
        for (let k = 6; k < n - 4; k += 10) if ((k < p1 - 8 || k > p2 + 8) && clear(idx[k])) pillars.push(idx[k]);
      } else {
        const step = kind === 2 ? 9 : 14;
        for (let k = 8; k < n - 6; k += step) if (clear(idx[k])) pillars.push(idx[k]);
      }
      if (th.bridge === 'arch' && n > 30) {
        // bågar med hängare på båda sidor
        const a0 = 2, a1 = n - 3;
        for (const side of [-1, 1]) {
          const pts = [];
          for (let k = a0; k <= a1; k += 2) {
            const i = idx[k], f = (k - a0) / (a1 - a0);
            const y = Math.sin(f * Math.PI) * Math.min(22, (a1 - a0) * this.ds * 0.16);
            pts.push(at(i, side * (lim + 0.9), y + 0.6, new THREE.Vector3()));
          }
          const curve = new THREE.CatmullRomCurve3(pts);
          const tg = new THREE.TubeGeometry(curve, pts.length * 2, 0.45, 8, false);
          const tm = new THREE.Mesh(tg, steelMat); tm.castShadow = true; group.add(tm);
          const hg = [];
          for (let k = a0 + 4; k < a1 - 2; k += 4) {
            const i = idx[k], f = (k - a0) / (a1 - a0);
            const y = Math.sin(f * Math.PI) * Math.min(22, (a1 - a0) * this.ds * 0.16);
            const c = new THREE.CylinderGeometry(0.06, 0.06, y, 4); at(i, side * (lim + 0.9), y / 2 + 0.6, pp); c.translate(pp.x, pp.y, pp.z);
            hg.push(c);
          }
          if (hg.length) { const mg = mergeGeometries(hg); hg.forEach(g => g.dispose()); group.add(new THREE.Mesh(mg, steelMat)); }
        }
      }
    }
    if (pillars.length) {
      const im = new THREE.InstancedMesh(pillarGeo, concMat, pillars.length);
      pillars.forEach((i, n) => {
        const y = P[i * 3 + 1] - 1.5;
        const bottom = ground != null ? ground : y - 40;
        pp.set(P[i * 3], y, P[i * 3 + 2]);
        basis.makeBasis(new THREE.Vector3(R[i * 3], 0, R[i * 3 + 2]).normalize(), UP, new THREE.Vector3(T[i * 3], 0, T[i * 3 + 2]).normalize());
        q.setFromRotationMatrix(basis);
        sc.set(this.limit * (this.bridgeKind[i] === 2 ? 0.9 : 1.2), Math.max(2, y - bottom), this.bridgeKind[i] === 2 ? 1.6 : 2.4);
        m4.compose(pp, q, sc); im.setMatrixAt(n, m4);
      });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      group.add(im); this._disp.push(im);
    }
  }

  /** Hängbro: två pyloner, bärkablar (kedjelinjer) och hängare. Tydligt landmärke. */
  _suspension(group, idx, steelMat, cableMat, concMat, ground) {
    const n = idx.length, lim = this.limit, P = this.P, R = this.R, Nm = this.Nm, T = this.T;
    const p1 = Math.round(n * 0.2), p2 = Math.round(n * 0.8);
    const deckY = (k) => P[idx[k] * 3 + 1];
    const topH = 46, sag = 4.5, D = lim + 1.8;
    const tops = [deckY(p1) + topH, deckY(p2) + topH];
    // kabelhöjd (världs-y) vid band-index k
    const cableY = (k) => {
      if (k <= p1) { const f = k / p1; return deckY(0) + 1.5 + (tops[0] - deckY(0) - 1.5) * Math.pow(f, 1.5); }
      if (k >= p2) { const f = (n - 1 - k) / (n - 1 - p2); return deckY(n - 1) + 1.5 + (tops[1] - deckY(n - 1) - 1.5) * Math.pow(f, 1.5); }
      const f = (k - p1) / (p2 - p1), base = tops[0] + (tops[1] - tops[0]) * f, low = (deckY(Math.round((p1 + p2) / 2)) + sag);
      const dip = 4 * f * (1 - f);
      return base + (low - (tops[0] + tops[1]) / 2) * dip;
    };
    const v = new THREE.Vector3();
    const geos = [], cgeos = [];
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k < n; k += 2) { const i = idx[k]; pts.push(new THREE.Vector3(P[i * 3] + R[i * 3] * side * D, cableY(k), P[i * 3 + 2] + R[i * 3 + 2] * side * D)); }
      const i = idx[n - 1]; pts.push(new THREE.Vector3(P[i * 3] + R[i * 3] * side * D, cableY(n - 1), P[i * 3 + 2] + R[i * 3 + 2] * side * D));
      cgeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.42, 6, false));
      for (let k = 3; k < n - 3; k += 3) {
        if (Math.abs(k - p1) < 2 || Math.abs(k - p2) < 2) continue;
        const ii = idx[k], y0 = P[ii * 3 + 1] + 0.2, y1 = cableY(k);
        if (y1 - y0 < 1.2) continue;
        const c = new THREE.CylinderGeometry(0.07, 0.07, y1 - y0, 4);
        c.translate(P[ii * 3] + R[ii * 3] * side * D, (y0 + y1) / 2, P[ii * 3 + 2] + R[ii * 3 + 2] * side * D);
        cgeos.push(c);
      }
    }
    // pyloner: två ben per pylon, tvärbalkar, fundament ner till vattnet
    const bottom = ground != null ? ground : this.minY - 30;
    for (const [pk, top] of [[p1, tops[0]], [p2, tops[1]]]) {
      const i = idx[pk];
      const yaw = Math.atan2(T[i * 3], T[i * 3 + 2]);
      for (const side of [-1, 1]) {
        const x = P[i * 3] + R[i * 3] * side * D, z = P[i * 3 + 2] + R[i * 3 + 2] * side * D;
        const h = top + 2 - bottom;
        const g = new THREE.BoxGeometry(2.6, h, 3.4); g.translate(0, h / 2, 0); g.rotateY(yaw); g.translate(x, bottom, z);
        geos.push(g);
      }
      for (const yy of [top - 1, top - 16, P[i * 3 + 1] - 4.5]) {
        const g = new THREE.BoxGeometry(2 * D + 2.6, 2.4, 2.6); g.rotateY(yaw); g.translate(P[i * 3], yy, P[i * 3 + 2]);
        geos.push(g);
      }
      const f = new THREE.BoxGeometry(2 * D + 10, 6, 12); f.rotateY(yaw); f.translate(P[i * 3], bottom + 3, P[i * 3 + 2]);
      const fm = new THREE.Mesh(f, concMat); fm.receiveShadow = true; group.add(fm); this._disp.push(f);
      // varningsljus på toppen
      const lm = this._beaconMat || (this._beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(3) }));
      this._disp.push(lm);
      for (const side of [-1, 1]) { const b = new THREE.Mesh(this._beaconGeo || (this._beaconGeo = new THREE.SphereGeometry(0.5, 8, 6)), lm); b.position.set(P[i * 3] + R[i * 3] * side * D, top + 2.6, P[i * 3 + 2] + R[i * 3 + 2] * side * D); group.add(b); }
      this._disp.push(this._beaconGeo);
    }
    const pyl = mergeGeometries(geos.map(g => g.toNonIndexed())); geos.forEach(g => g.dispose());
    const pm = new THREE.Mesh(pyl, steelMat); pm.castShadow = true; pm.receiveShadow = true; group.add(pm);
    const cab = mergeGeometries(cgeos.map(g => { const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); return ng; })); cgeos.forEach(g => g.dispose());
    const cm = new THREE.Mesh(cab, cableMat); cm.castShadow = true; group.add(cm);
  }

  _buildGantry(group, mat) {
    const f = Track.makeFrame(); this.frameAt(0, f);
    const lim = this.limit;
    const g = new THREE.Group();
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.R.x, 0, f.R.z).normalize(), UP, new THREE.Vector3(f.T.x, 0, f.T.z).normalize());
    g.quaternion.setFromRotationMatrix(basis);
    g.position.copy(f.c);
    const steel = mat(new THREE.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.4, roughness: 0.5 }));
    const pillarG = new THREE.BoxGeometry(0.7, 8, 0.7);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(pillarG, steel); p.position.set(s * (lim + 1.0), 4, 0); p.castShadow = true; g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * lim + 2.8, 1.6, 0.8), steel); beam.position.set(0, 7.4, 0); beam.castShadow = true; g.add(beam);
    const banner = mat(new THREE.MeshStandardMaterial({ map: TX.bannerTex('FJÄLLRACET', '#16306e', '#ffd85c', 1024, 96, null), emissive: 0xffffff, emissiveIntensity: this.theme.night ? 0.5 : 0.08, emissiveMap: TX.bannerTex('FJÄLLRACET', '#16306e', '#ffd85c', 1024, 96, null) }));
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2 * lim + 2.6, 1.4), banner);
      b.position.set(0, 7.4, s * 0.41); if (s < 0) b.rotation.y = Math.PI; g.add(b);
    }
    // startljus
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 0.0 });
      this._disp.push(m);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 14), m);
      lamp.rotation.x = Math.PI / 2; lamp.position.set((k - 2) * 0.95, 5.95, -0.42);
      g.add(lamp); this.startLights.push(m);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.3), steel); hood.position.set((k - 2) * 0.95, 5.95, -0.25); g.add(hood);
    }
    group.add(g);
  }
  setStartLights(n, green) {
    if (!this.startLights) return;
    this.startLights.forEach((m, k) => {
      if (green) { m.emissive.setHex(0x30ff60); m.emissiveIntensity = 3; }
      else { m.emissive.setHex(0xff2a1a); m.emissiveIntensity = k < n ? 3 : 0; }
    });
  }

  _buildChevrons(group, mat) {
    const list = [];
    const N = this.N;
    for (let i = 0; i < N; i += 6) {
      const k = this.k[i];
      // skarpa kurvor får täta skyltar; snabbare kurvor som ändå kräver inbromsning (racinglinjens
      // fart < ~150 km/h) får glesare skyltar så att man hinner se dem i tid
      const sharp = Math.abs(k) >= 1 / 62;
      const brake = Math.abs(k) > 1 / 160 && this.lineV[i] < 42 && i % 12 === 0;
      if (!(sharp || brake) || this.tunnel[i] || this.bridge[i]) continue;
      const side = k < 0 ? -1 : 1; // högerkurva (k<0) → skylt på vänster sida (yttre)
      if (side < 0 ? this.openL[i] : this.openR[i]) continue;
      list.push({ i, side, right: k < 0 });
    }
    if (!list.length) return;
    const texMat = mat(new THREE.MeshStandardMaterial({ map: TX.chevronTex(), roughness: 0.6, emissive: 0xffffff, emissiveMap: TX.chevronTex(), emissiveIntensity: this.theme.night ? (this.theme.edgeGlow ? 1.4 : 0.6) : 0.05 }));
    for (const dir of [true, false]) {
      const items = list.filter(c => c.right === dir);
      if (!items.length) continue;
      const geo = new THREE.PlaneGeometry(2.6, 0.65); geo.translate(0, 1.55, 0);
      if (!dir) { const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
      const postG = new THREE.BoxGeometry(0.08, 1.3, 0.08); postG.translate(0, 0.65, -0.02);
      const merged = mergeGeometries([geo, postG], true);
      geo.dispose(); postG.dispose();
      const im = new THREE.InstancedMesh(merged, [texMat, this._postMat || (this._postMat = mat(new THREE.MeshStandardMaterial({ color: 0x555a60 })))], items.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4(), pp = new THREE.Vector3();
      items.forEach((c, n) => {
        const i = c.i, d = c.side * (this.limit + (this.theme.barrier === 'snow' ? 4.2 : this.theme.barrier === 'bank' ? 2.6 : 1.6));
        pp.set(this.P[i * 3] + this.R[i * 3] * d, this.P[i * 3 + 1] + this.R[i * 3 + 1] * d, this.P[i * 3 + 2] + this.R[i * 3 + 2] * d);
        // vänd mot inkommande förare
        const tx = -this.T[i * 3], tz = -this.T[i * 3 + 2];
        const fwd = new THREE.Vector3(tx, 0, tz).normalize();
        basis.makeBasis(new THREE.Vector3().crossVectors(UP, fwd), UP, fwd);
        q.setFromRotationMatrix(basis);
        m4.compose(pp, q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(n, m4);
      });
      im.castShadow = true; im.computeBoundingSphere();
      group.add(im); this._disp.push(merged, im);
    }
  }

  gridSlot(k) { // k = 0 är pole position
    const row = Math.floor(k / 2), col = k % 2;
    return { s: -10 - row * 8.5 - col * 3.5, d: (col ? 1 : -1) * Math.min(3.2, this.half * 0.45) };
  }
  _buildGridMarks(group, mat) {
    const m = mat(new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    const geos = [];
    const v = new THREE.Vector3(), f = Track.makeFrame();
    for (let k = 0; k < 8; k++) {
      const gs = this.gridSlot(k);
      this.frameAt(gs.s + 2.6, f);
      const p = v.copy(f.c).addScaledVector(f.R, gs.d).addScaledVector(f.N, 0.02);
      const b = new THREE.PlaneGeometry(2.6, 0.22); b.rotateX(-Math.PI / 2);
      const s1 = new THREE.PlaneGeometry(0.22, 1.4); s1.rotateX(-Math.PI / 2); s1.translate(-1.2, 0, -0.6);
      const s2 = s1.clone(); s2.translate(2.4, 0, 0);
      const mg = mergeGeometries([b, s1, s2]); [b, s1, s2].forEach(g => g.dispose());
      const basis = new THREE.Matrix4().makeBasis(f.R.clone().multiplyScalar(-1), f.N, f.T);
      mg.applyMatrix4(basis); mg.translate(p.x, p.y, p.z);
      geos.push(mg);
    }
    const all = mergeGeometries(geos); geos.forEach(g => g.dispose());
    group.add(new THREE.Mesh(all, m));
  }
}
