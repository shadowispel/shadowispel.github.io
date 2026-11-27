/**
 * Fjällracet – procedurella modeller (geometrier med vertexfärger) för banornas miljöer.
 * Allt returneras som (icke-indexerade) BufferGeometry som kan instansieras eller slås ihop.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../../engine/kit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ hjälp */
export function colorize(geo, color) {
  const c = new THREE.Color(color); const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
export function snowTop(geo, base, snow, thresh = 0.55) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal, cnt = n.count; const arr = new Float32Array(cnt * 3);
  const a = new THREE.Color(base), b = new THREE.Color(snow), c = new THREE.Color();
  for (let i = 0; i < cnt; i++) { c.copy(a).lerp(b, smooth01((n.getY(i) - thresh) / 0.25)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
/** Slår ihop delar (alla med 'color'), tar bort uv om någon del saknar den. */
export function merge(list, keepNormals = false) {
  const parts = list.map(x => x.index ? x.toNonIndexed() : x);
  const needUv = parts.every(p => p.attributes.uv);
  parts.forEach(p => { if (!needUv) p.deleteAttribute('uv'); if (!keepNormals) p.deleteAttribute('normal'); });
  const g = mergeGeometries(parts);
  list.forEach(x => x.dispose()); parts.forEach(x => x.dispose());
  if (!keepNormals) g.computeVertexNormals();
  return g;
}
const C = (g, col) => colorize(g, col);
const box = (w, h, d, x, y, z, col) => C(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
const cyl = (rt, rb, h, seg, x, y, z, col) => C(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), col);

/* ------------------------------------------------------------------ träd & växter */
export function treeSpruce(snow) {
  const parts = [C(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6).translate(0, 1.1, 0), 0x4a3426)];
  for (let k = 0; k < 4; k++) {
    const r = 2.2 - k * 0.45, h = 3.0 - k * 0.35, y = 1.6 + k * 1.7;
    const c = new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0);
    if (snow) snowTop(c, 0x1f4a2a, 0xf2f6fa, 0.62); else C(c, k % 2 ? 0x24502c : 0x1e4626);
    parts.push(c);
  }
  return merge(parts);
}
/** Smal, tät gran för skogsrallyt (hög och mörk). */
export function treeSpruceTall() {
  const parts = [C(new THREE.CylinderGeometry(0.16, 0.3, 4, 6).translate(0, 2, 0), 0x3a2a20)];
  for (let k = 0; k < 6; k++) {
    const r = 2.0 - k * 0.3, h = 3.2 - k * 0.25, y = 2.2 + k * 1.9;
    parts.push(C(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), k % 2 ? 0x1c3f24 : 0x173a20));
  }
  return merge(parts);
}
export function treeBirch() {
  const parts = [C(new THREE.CylinderGeometry(0.13, 0.2, 5.5, 6).translate(0, 2.75, 0), 0xe8e4dc)];
  for (let k = 0; k < 4; k++) parts.push(C(new THREE.BoxGeometry(0.3, 0.12, 0.3).translate(0, 1 + k * 1.1, 0), 0x2a2a2a));
  const crowns = [[0, 6.0, 0, 1.9], [0.8, 5.2, 0.3, 1.3], [-0.7, 5.5, -0.4, 1.4], [0.1, 7.1, -0.2, 1.3]];
  crowns.forEach(([x, y, z, r], k) => parts.push(C(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), k % 2 ? 0x7aa840 : 0x6a9a36)));
  return merge(parts);
}
/** Krokig fjällbjörk – vinterkal med snö på grenarna. */
export function fellBirch() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.09, 0.16, 2.6, 5); trunk.translate(0, 1.3, 0); trunk.rotateZ(0.18); parts.push(C(trunk, 0xd8d2c8));
  const rng = makeRng(17);
  for (let k = 0; k < 6; k++) {
    const b = new THREE.CylinderGeometry(0.03, 0.06, 1.4 + rng(), 4); b.translate(0, 0.7, 0);
    b.rotateZ(0.6 + rng() * 0.5); b.rotateY(k * 1.05); b.translate(-0.25, 1.5 + rng() * 1.1, 0);
    parts.push(C(b, 0x6a5a50));
  }
  parts.push(snowTop(new THREE.IcosahedronGeometry(1.1, 0).scale(1.2, 0.55, 1.2).translate(-0.2, 2.9, 0), 0x5a4a44, 0xeef4fa, 0.3));
  return merge(parts);
}
export function treePine(dry) {
  const parts = [C(new THREE.CylinderGeometry(0.16, 0.26, 6, 6).translate(0, 3, 0), 0x8a5a3a)];
  const col = dry ? 0x5a6a30 : 0x2f5a2e;
  parts.push(C(new THREE.IcosahedronGeometry(1.8, 0).scale(1.3, 0.6, 1.3).translate(0, 6.4, 0), col));
  parts.push(C(new THREE.IcosahedronGeometry(1.3, 0).scale(1.3, 0.6, 1.3).translate(0.9, 5.6, 0.4), col));
  return merge(parts);
}
/** Enbuske – smal pelare (alvaret). */
export function juniper() {
  return merge([C(new THREE.CylinderGeometry(0.05, 0.08, 0.4, 4).translate(0, 0.2, 0), 0x4a3a2a),
    C(new THREE.ConeGeometry(0.6, 2.4, 6).translate(0, 1.5, 0), 0x2a4a2a), C(new THREE.IcosahedronGeometry(0.55, 0).scale(1, 1.4, 1).translate(0.15, 0.9, 0), 0x31552f)]);
}
/** Rosenbuske (Gotland). */
export function roseBush() {
  const parts = [C(new THREE.IcosahedronGeometry(0.8, 0).scale(1.2, 0.8, 1.2).translate(0, 0.6, 0), 0x3f6a2e)];
  const rng = makeRng(31);
  for (let k = 0; k < 9; k++) { const a = rng() * 6.28, r = 0.6 + rng() * 0.4; parts.push(C(new THREE.OctahedronGeometry(0.15, 0).translate(Math.cos(a) * r, 0.5 + rng() * 0.6, Math.sin(a) * r), k % 3 ? 0xe0567a : 0xf4a0b8)); }
  return merge(parts);
}
export function rockGeo(seed = 5) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position; const rng = makeRng(seed);
  for (let i = 0; i < p.count; i++) { const f = 0.75 + rng() * 0.5; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.7, p.getZ(i) * f); }
  g.computeVertexNormals();
  return C(g.index ? g.toNonIndexed() : g, 0xffffff);
}
/** Kalkstensrauk – oregelbunden pelare som smalnar i midjan. */
export function raukGeo(seed = 3) {
  const rng = makeRng(seed);
  const pts = []; const H = 9 + rng() * 6;
  for (let k = 0; k <= 10; k++) { const t = k / 10; const r = 2.2 * (1 - 0.55 * Math.sin(t * Math.PI * 0.9) ** 2) * (0.85 + rng() * 0.3) * (t > 0.85 ? 1.15 - (t - 0.85) * 4 : 1); pts.push(new THREE.Vector2(Math.max(0.25, r), t * H)); }
  const g = new THREE.LatheGeometry(pts, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const f = 0.8 + 0.4 * Math.abs(Math.sin(y * 1.7 + p.getX(i))); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * (0.85 + 0.3 * Math.cos(y * 2.3))); }
  return snowTop(g.toNonIndexed(), 0xb8b2a6, 0xd8d2c4, 0.2);
}

/* ------------------------------------------------------------------ byggnader */
export function cottageGeo(wall = 0xa0281e, roofCol = 0x2f2f33) {
  const parts = [];
  parts.push(box(7, 3.4, 5, 0, 1.7, 0, wall));
  const roof = new THREE.CylinderGeometry(0.01, 4.3, 2.6, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.3, 1, 0.95); roof.translate(0, 4.7, 0);
  parts.push(C(roof, roofCol));
  for (const x of [-3.52, 3.52]) parts.push(box(0.12, 3.4, 5.1, x, 1.7, 0, 0xf2f2ee));
  for (const x of [-1.8, 1.8]) parts.push(box(1.1, 1.1, 0.1, x, 2.0, 2.52, 0xf2f2ee), box(0.9, 0.9, 0.12, x, 2.0, 2.53, 0x2a3440));
  parts.push(box(1.0, 2.0, 0.1, 0, 1.0, 2.52, 0xf2f2ee));
  parts.push(box(0.6, 1.4, 0.6, 1.8, 5.4, 0, 0x8a3a2a));
  return merge(parts);
}
/** Medeltida stenhus med trappgavel (Visby). */
export function stoneHouseGeo(wall = 0xe8e0d0) {
  const parts = [box(6, 6, 7, 0, 3, 0, wall)];
  const roof = new THREE.CylinderGeometry(0.01, 4.6, 3.4, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(0.95, 1, 1.12); roof.translate(0, 7.7, 0);
  parts.push(C(roof, 0xa8452e));
  for (let k = 0; k < 4; k++) parts.push(box(6 - k * 1.4, 0.85, 0.5, 0, 6.4 + k * 0.85, 3.4, wall));
  for (const x of [-1.6, 1.6]) for (const y of [2, 4.4]) parts.push(box(0.8, 1.1, 0.1, x, y, 3.52, 0x2a2a30));
  return merge(parts);
}
/** Samekåta (lavvu). */
export function kataGeo() {
  const parts = [C(new THREE.ConeGeometry(2.4, 4.2, 9, 1, true).translate(0, 2.1, 0), 0x8a7a66)];
  for (let k = 0; k < 6; k++) { const p = new THREE.CylinderGeometry(0.04, 0.05, 1.6, 4); p.translate(0, 0.8, 0); p.rotateZ(0.25); p.rotateY(k * 1.05); p.translate(0, 3.8, 0); parts.push(C(p, 0x5a4636)); }
  parts.push(snowTop(new THREE.ConeGeometry(2.45, 1.4, 9).translate(0, 0.7, 0), 0xd8e0ea, 0xf2f6fa, 0.1));
  parts.push(box(0.9, 1.3, 0.1, 0, 0.75, 2.0, 0x3a2e24));
  return merge(parts);
}
/** Ren (enkel, lågpoly). Origo mellan hovarna, nosen mot +z. */
export function reindeerGeo() {
  const body = 0x6a5a4a, light = 0xd8d0c0, dark = 0x3a3028;
  const parts = [C(new THREE.CapsuleGeometry(0.42, 1.1, 3, 6).rotateX(Math.PI / 2).translate(0, 1.25, 0), body)];
  parts.push(C(new THREE.CapsuleGeometry(0.22, 0.6, 2, 5).rotateX(-0.9).translate(0, 1.7, 0.75), light));
  parts.push(C(new THREE.BoxGeometry(0.26, 0.3, 0.55).translate(0, 2.05, 1.15), body));
  for (const [x, z] of [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]]) parts.push(cyl(0.06, 0.05, 1.0, 4, x, 0.5, z, dark));
  for (const s of [-1, 1]) {
    const a = new THREE.CylinderGeometry(0.03, 0.04, 0.9, 3); a.translate(0, 0.45, 0); a.rotateZ(-s * 0.5); a.rotateX(-0.3); a.translate(s * 0.1, 2.15, 1.0); parts.push(C(a, 0xc8b89a));
    const b = new THREE.CylinderGeometry(0.02, 0.03, 0.45, 3); b.translate(0, 0.22, 0); b.rotateX(0.7); b.translate(s * 0.45, 2.75, 0.85); parts.push(C(b, 0xc8b89a));
  }
  parts.push(box(0.2, 0.18, 0.15, 0, 1.35, -0.7, light));
  return merge(parts);
}
/** Stor dalahäst (skulptur ca 13 m). Nosen mot +x. */
export function dalahastGeo() {
  const s = new THREE.Shape();
  const P = [[-2.6, 0], [-2.6, 3.2], [-3.2, 4.2], [-3.4, 6.0], [-2.8, 6.4], [-2.2, 5.4], [2.0, 5.4], [2.2, 8.2], [2.0, 9.6], [2.6, 10.4], [4.6, 9.4], [4.9, 8.6], [3.8, 8.3], [3.3, 6.6], [3.3, 3.2], [2.6, 3.0], [2.6, 0], [1.2, 0], [1.2, 2.6], [-1.2, 2.6], [-1.2, 0]];
  s.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 2 });
  g.translate(0, 0, -1.2);
  const parts = [C(g.toNonIndexed(), 0xc8201a)]; g.dispose();
  // målad sele och sadel på båda sidor
  for (const z of [-1.58, 1.58]) {
    parts.push(box(3.0, 0.35, 0.08, 0.1, 5.0, z, 0x1a6ad0), box(2.4, 0.22, 0.09, 0.1, 4.55, z, 0xffd21f), box(0.35, 2.0, 0.08, 1.9, 6.6, z, 0x2a9a3a));
    parts.push(box(0.6, 0.6, 0.09, 3.0, 8.9, z, 0xffffff), box(0.3, 0.3, 0.1, 3.0, 8.9, z, 0x1a1a1a));
    for (let k = 0; k < 4; k++) parts.push(box(0.5, 0.5, 0.09, -1.6 + k * 0.9, 3.6, z, k % 2 ? 0xffd21f : 0x2a9a3a));
  }
  parts.push(box(6.5, 0.8, 3.6, 0, -0.4, 0, 0x6a6058));
  return merge(parts);
}
/** Öländsk stubbkvarn: stomme + tak (utan vingar). Vingarnas nav på (0, 7.2, 1.7). */
export function windmillBodyGeo() {
  const parts = [cyl(0.25, 0.35, 3.5, 6, 0, 1.75, 0, 0x5a4636)];
  for (let k = 0; k < 4; k++) { const b = new THREE.BoxGeometry(0.18, 3.2, 0.18); b.translate(0, 1.4, 0); b.rotateZ(0.55); b.rotateY(k * Math.PI / 2); parts.push(C(b, 0x5a4636)); }
  parts.push(box(2.8, 3.6, 3.0, 0, 5.4, 0, 0x7a5236));
  const roof = new THREE.CylinderGeometry(0.01, 2.3, 1.8, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 1.2); roof.translate(0, 8.1, 0); parts.push(C(roof, 0x4a3a2e));
  parts.push(box(0.12, 4.2, 0.12, 0, 2.4, -2.4, 0x5a4636));
  return merge(parts);
}
export function windmillSailsGeo() {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.BoxGeometry(0.18, 6.2, 0.12); arm.translate(0, 3.2, 0);
    const sail = new THREE.BoxGeometry(1.1, 4.6, 0.05); sail.translate(0.65, 3.8, 0.04);
    arm.rotateZ(k * Math.PI / 2); sail.rotateZ(k * Math.PI / 2);
    parts.push(C(arm, 0x6a5040), C(sail, 0xe8e0cc));
  }
  parts.push(cyl(0.25, 0.25, 0.5, 6, 0, 0, 0, 0x4a3a2e).rotateX(Math.PI / 2));
  return merge(parts);
}
/** Container 12 x 2.6 x 2.4 (vit; färgas per instans). */
export function containerGeo() {
  const g = new THREE.BoxGeometry(12.2, 2.6, 2.44); g.translate(0, 1.3, 0);
  return C(g.toNonIndexed(), 0xffffff);
}
/** Portalkran (STS-kran). Benen står på x = ±9 (längs kajen) och z = ±gauge/2; bommen ut mot +z (vattnet). */
export function craneGeo(col = 0x1f5aa8, gauge = 30) {
  const parts = [], g2 = gauge / 2;
  for (const x of [-9, 9]) for (const z of [-g2, g2]) parts.push(box(1.3, 34, 1.3, x, 17, z, col));
  for (const z of [-g2, g2]) parts.push(box(19.4, 1.8, 1.5, 0, 34, z, col));
  for (const x of [-9, 9]) parts.push(box(1.1, 1.4, gauge, x, 34, 0, col), box(0.8, 0.8, gauge, x, 20, 0, col));
  parts.push(box(3.2, 2.4, gauge + 62, 0, 37, 21, col), box(5.5, 4.5, 8, 0, 40, -g2 - 2, 0xe8e8e0), box(2.8, 2.4, 2.8, 0, 35, g2 + 12, 0x2a2a30));
  parts.push(box(1.8, 18, 1.8, 0, 46, -g2 + 4, col));
  for (const z of [-g2 - 8, g2 + 30]) { const len = Math.hypot(z - (-g2 + 4), 16); const t = new THREE.CylinderGeometry(0.16, 0.16, len, 4); t.rotateX(Math.atan2(z - (-g2 + 4), 16)); t.translate(0, 47, (z + (-g2 + 4)) / 2); parts.push(C(t, 0xd8d8d8)); }
  parts.push(box(0.6, 0.6, 0.6, 0, 55.5, -g2 + 4, 0xff3020));
  return merge(parts);
}
/** Containerfartyg ca 160 m. Längs x. */
export function shipGeo(hullCol = 0x2a3a5a, seed = 1) {
  const rng = makeRng(seed);
  const parts = [box(150, 10, 24, 0, 1, 0, hullCol), box(150.5, 2.6, 24.4, 0, -2.6, 0, 0x8a2a20)];
  const bow = new THREE.CylinderGeometry(12, 12, 12.6, 3, 1, false, 0, Math.PI); bow.rotateY(-Math.PI / 2); bow.scale(1.3, 1, 1); bow.translate(75, 0.7, 0); parts.push(C(bow, hullCol));
  parts.push(box(14, 16, 22, -62, 14, 0, 0xf0f0ea), box(15, 2.5, 23, -62, 22, 0, 0x2a2e36), box(3, 8, 3, -66, 26, 0, 0x2a2a2a));
  const cols = [0xc8261e, 0x1f5aa8, 0xe8a020, 0x2a8a4a, 0xd8d8d0, 0x8a2a8a, 0xe86a1a, 0x3a6a8a];
  for (let x = -48; x <= 60; x += 13) {
    const h = 2 + Math.floor(rng() * 4);
    for (let y = 0; y < h; y++) for (let z = -9; z <= 9; z += 2.6) parts.push(box(12.2, 2.5, 2.44, x, 7.3 + y * 2.6, z, cols[(rng() * cols.length) | 0]));
  }
  return merge(parts);
}
export function hangarGeo() {
  const parts = [];
  const shell = new THREE.CylinderGeometry(22, 22, 50, 18, 1, true, -Math.PI / 2, Math.PI); shell.rotateX(Math.PI / 2); shell.rotateZ(Math.PI / 2); shell.rotateY(Math.PI / 2);
  shell.scale(1, 0.6, 1); parts.push(C(shell, 0x8a929a));
  const back = new THREE.CircleGeometry(22, 18, 0, Math.PI); back.scale(1, 0.6, 1); back.rotateY(Math.PI); back.translate(0, 0, -25); parts.push(C(back, 0x7a828a));
  parts.push(box(40, 9, 0.4, 0, 4.5, 24.6, 0x5a6470), box(30, 2.2, 0.5, 0, 11, 24.4, 0xd8d8d0));
  return merge(parts);
}
export function towerGeo() {
  const parts = [cyl(2.2, 3.0, 26, 10, 0, 13, 0, 0xd8d4cc), cyl(5.0, 4.2, 1.2, 10, 0, 26.6, 0, 0xd8d4cc)];
  parts.push(cyl(5.2, 5.2, 4.2, 10, 0, 29.3, 0, 0x2a5a7a), cyl(5.6, 5.0, 1.0, 10, 0, 31.9, 0, 0xe8e8e0), cyl(0.15, 0.15, 5, 4, 0, 34.5, 0, 0xc8c8c8));
  return merge(parts);
}
/** Trafikflygplan ca 38 m. Nosen mot +x. */
export function planeGeo(tail = 0x1f4fbf) {
  const parts = [];
  const f = new THREE.CapsuleGeometry(2.0, 30, 4, 10); f.rotateZ(Math.PI / 2); f.translate(0, 4.2, 0); parts.push(C(f, 0xf2f2f0));
  const w = new THREE.BoxGeometry(8, 0.5, 34); w.translate(-1, 3.2, 0);
  const wp = w.attributes.position; for (let i = 0; i < wp.count; i++) { const z = wp.getZ(i); wp.setX(i, wp.getX(i) - Math.abs(z) * 0.32); }
  parts.push(C(w, 0xd8dce0));
  const t = new THREE.BoxGeometry(5, 7, 0.5); t.translate(-15, 8.5, 0); const tp = t.attributes.position; for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) - (tp.getY(i) - 5) * 0.5);
  parts.push(C(t, tail));
  const h = new THREE.BoxGeometry(4, 0.4, 12); h.translate(-16, 5, 0); parts.push(C(h, 0xd8dce0));
  for (const z of [-6, 6]) parts.push(C(new THREE.CylinderGeometry(1.1, 1.0, 4, 10).rotateZ(Math.PI / 2).translate(1, 2.1, z), 0x9aa0a8));
  for (const x of [11, -2]) parts.push(cyl(0.2, 0.2, 2.6, 4, x, 1.3, 0, 0x2a2a2a));
  parts.push(box(1.4, 0.6, 3.8, 13.5, 5.2, 0, 0x1a2430));
  return merge(parts);
}
/** Gruvtruck (dumper), ca 12 m lång, mot +x. */
export function truckGeo() {
  const parts = [box(9, 1.6, 5.2, 0, 2.6, 0, 0xe8b020), box(8.2, 3, 6.2, -1, 4.8, 0, 0xd8a018), box(2.6, 2.2, 2.2, 3.9, 4.6, -1.6, 0xe8b020), box(2.0, 1.2, 2.24, 4.3, 4.9, -1.6, 0x2a3440)];
  for (const x of [-3, 3.2]) for (const z of [-2.5, 2.5]) parts.push(C(new THREE.CylinderGeometry(1.7, 1.7, 1.4, 12).rotateX(Math.PI / 2).translate(x, 1.7, z), 0x1a1a1a));
  return merge(parts);
}
/** Gruvlave (fackverkstorn med linhjul). */
export function headframeGeo() {
  const parts = [];
  const col = 0x7a3a2a;
  for (const x of [-3, 3]) for (const z of [-3, 3]) { const l = new THREE.BoxGeometry(0.6, 28, 0.6); l.translate(0, 14, 0); l.rotateZ(-x * 0.012); l.rotateX(z * 0.012); l.translate(x, 0, z); parts.push(C(l, col)); }
  for (let y = 4; y < 28; y += 5) { parts.push(box(6.6, 0.35, 0.35, 0, y, -3, col), box(6.6, 0.35, 0.35, 0, y, 3, col), box(0.35, 0.35, 6.6, -3, y, 0, col), box(0.35, 0.35, 6.6, 3, y, 0, col)); }
  const brace = new THREE.BoxGeometry(0.5, 30, 0.5); brace.translate(0, 15, 0); brace.rotateX(0.55); brace.translate(0, 0, -12); parts.push(C(brace, col));
  for (const x of [-1.6, 1.6]) parts.push(C(new THREE.TorusGeometry(2.4, 0.22, 5, 14).translate(x, 29, 0).rotateY(Math.PI / 2), 0x2a2a2a));
  parts.push(box(10, 9, 9, 0, 4.5, 9, 0x9a3a2a), box(10.4, 0.6, 9.4, 0, 9.2, 9, 0x3a3a3a));
  return merge(parts);
}
/** Cirkustält med ränder. */
export function tentGeo(a = 0xd02a2a, b = 0xf2efe6) {
  const parts = [];
  const seg = 16;
  for (let k = 0; k < seg; k++) {
    const w = new THREE.CylinderGeometry(9, 9, 5, 1, 1, true, k / seg * Math.PI * 2, Math.PI * 2 / seg); w.translate(0, 2.5, 0); parts.push(C(w, k % 2 ? a : b));
    const r = new THREE.ConeGeometry(9.6, 6, 1, 1, true, k / seg * Math.PI * 2, Math.PI * 2 / seg); r.translate(0, 8, 0); parts.push(C(r, k % 2 ? b : a));
  }
  parts.push(cyl(0.12, 0.12, 3, 4, 0, 12, 0, 0x888888), box(0.05, 0.9, 1.4, 0, 13, 0.7, 0xffd21f));
  return merge(parts, false);
}
/** Karusell: fast bas och tak (tak roteras separat). */
export function carouselBaseGeo() {
  return merge([cyl(7.5, 7.8, 0.8, 20, 0, 0.4, 0, 0x8a2a4a), cyl(0.6, 0.6, 7, 8, 0, 3.5, 0, 0xd8b040)]);
}
export function carouselTopGeo() {
  const parts = [];
  for (let k = 0; k < 16; k++) { const r = new THREE.ConeGeometry(8, 3, 1, 1, true, k / 16 * Math.PI * 2, Math.PI * 2 / 16); r.translate(0, 8.4, 0); parts.push(C(r, k % 2 ? 0xffd21f : 0xd02a6a)); }
  parts.push(cyl(8, 8, 0.8, 20, 0, 6.6, 0, 0xf2e6c8));
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2, x = Math.cos(a) * 5.8, z = Math.sin(a) * 5.8;
    parts.push(cyl(0.07, 0.07, 6, 4, x, 3.6, z, 0xe8d080));
    const h = new THREE.BoxGeometry(0.5, 0.9, 1.6); h.rotateY(-a); h.translate(x, 1.9 + (k % 2) * 0.6, z); parts.push(C(h, [0xffffff, 0x2a6ad0, 0xe84a3a, 0x3aa84a][k % 4]));
  }
  return merge(parts);
}
/** Pariserhjul: hjulet (roteras kring x-axeln) – radie 18. */
export function ferrisWheelGeo() {
  const parts = [];
  for (const z of [-1.2, 1.2]) parts.push(C(new THREE.TorusGeometry(18, 0.35, 5, 48).rotateY(Math.PI / 2).translate(0, 0, z), 0xe8e8f0));
  for (let k = 0; k < 16; k++) for (const z of [-1.2, 1.2]) { const s = new THREE.CylinderGeometry(0.1, 0.1, 18, 3); s.translate(0, 9, 0); s.rotateX(k / 16 * Math.PI * 2); s.translate(z, 0, 0); s.rotateY(Math.PI / 2); parts.push(C(s, 0xc8c8d8)); }
  parts.push(C(new THREE.CylinderGeometry(1.2, 1.2, 3.6, 10).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0x888898));
  return merge(parts);
}
export function ferrisStandGeo() {
  const parts = [];
  for (const z of [-3, 3]) for (const x of [-1, 1]) { const l = new THREE.BoxGeometry(0.7, 21, 0.7); l.translate(0, 10.5, 0); l.rotateZ(x * 0.35); l.translate(x * 3.6, 0, z); parts.push(C(l, 0x9aa0b0)); }
  parts.push(box(8, 0.6, 8, 0, 0.3, 0, 0x5a5a6a));
  return merge(parts);
}
export function gondolaGeo() {
  return merge([box(1.8, 1.6, 1.6, 0, -1.4, 0, 0xffffff), box(2.0, 0.2, 1.8, 0, -0.5, 0, 0xffffff), cyl(0.05, 0.05, 0.8, 3, 0, -0.2, 0, 0x888888)]);
}
/** Drönare/svävande farkost (liten, emissiv färg via instans). */
export function flyerGeo() {
  return merge([box(3.2, 0.6, 1.4, 0, 0, 0, 0xffffff), box(1.4, 0.4, 1.2, -0.4, 0.4, 0, 0xffffff), box(0.6, 0.15, 2.6, 1.2, 0, 0, 0xffffff)]);
}
/** Åskådare. */
export function spectatorBody() {
  return merge([C(new THREE.CylinderGeometry(0.26, 0.22, 1.1, 6).translate(0, 0.95, 0), 0xffffff), C(new THREE.BoxGeometry(0.42, 0.5, 0.25).translate(0, 0.25, 0), 0x2a2d3a)]);
}
export function spectatorHead() {
  return C(new THREE.SphereGeometry(0.17, 7, 5).translate(0, 1.68, 0), 0xe8b896);
}
export function turbineTower() {
  return merge([C(new THREE.CylinderGeometry(0.9, 1.8, 60, 10).translate(0, 30, 0), 0xeef0f2), C(new THREE.BoxGeometry(2.4, 2.4, 6).translate(0, 61, 0.8), 0xe6e8ea)]);
}
export function turbineRotor() {
  const parts = [C(new THREE.SphereGeometry(1.2, 10, 8).scale(1, 1, 1.6), 0xe8eaec)];
  for (let k = 0; k < 3; k++) { const b = new THREE.BoxGeometry(1.6, 26, 0.4); b.translate(0, 14, 0); b.rotateZ(k * Math.PI * 2 / 3); parts.push(C(b, 0xf2f3f5)); }
  return merge(parts);
}
