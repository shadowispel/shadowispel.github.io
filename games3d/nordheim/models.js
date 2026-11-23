// Nordheim – procedurella lågpolygonmodeller: byggnader, träd, stenar, figurdelar, skepp.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- Snö-shader (delad uniform) ---------- */
export const SNOW = { value: 0 };
export const NIGHT = { value: 0 };
export function addSnow(mat, opts = {}) {
  const minY = opts.minY != null ? opts.minY.toFixed(2) : '0.15';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = SNOW;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vSnowW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;\nuniform float uSnow;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uSnow > 0.001) {
    vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    vec2 sp = vSnowW.xz * 2.2, si = floor(sp), sfr = fract(sp); sfr = sfr * sfr * (3.0 - 2.0 * sfr);
    #define SNH(q) fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453)
    float nz = mix(mix(SNH(si), SNH(si + vec2(1.0, 0.0)), sfr.x), mix(SNH(si + vec2(0.0, 1.0)), SNH(si + vec2(1.0, 1.0)), sfr.x), sfr.y);
    float sf = smoothstep(0.25, 0.7, wN.y + (nz - 0.5) * 0.35) * smoothstep(${minY}, ${minY} + 0.35, vSnowW.y) * uSnow;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), clamp(sf, 0.0, 1.0));
  }`);
  };
  mat.customProgramCacheKey = () => 'snow' + minY;
  return mat;
}

/* ---------- Geometribyggare ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

function prismGeo(w, d, h) {
  // gavelprisma: bas i y=0, nock längs x
  const x = w / 2, z = d / 2;
  const v = [
    // sluttningar
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0,
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
    // gavlar
    x, 0, z, x, 0, -z, x, h, 0,
    -x, 0, -z, -x, 0, z, -x, h, 0,
    // botten
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, -z, x, 0, z, -x, 0, z
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export class GB {
  constructor() { this.parts = []; this.glow = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, glow = false) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (glow ? this.glow : this.parts).push(g);
    return this;
  }
  // y = underkant
  box(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, rx, ry, rz); }
  cyl(x, y, z, rt, rb, h, color, seg = 7, rx = 0, ry = 0, rz = 0) {
    if (rx || rz) return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz);
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, 0, ry, 0);
  }
  cone(x, y, z, r, h, color, seg = 7, ry = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, 0, ry, 0); }
  sphere(x, y, z, r, color, detail = 0, sx = 1, sy = 1, sz = 1) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  roof(x, y, z, w, d, h, color, ry = 0) { return this.add(prismGeo(w, d, h), color, x, y, z, 0, ry, 0); }
  window(x, y, z, w, h, ry = 0) { return this.add(new THREE.BoxGeometry(w, h, 0.04), 0xffffff, x, y + h / 2, z, 0, ry, 0, 1, 1, 1, true); }
  build() {
    const main = this.parts.length ? mergeGeometries(this.parts, false) : null;
    const glow = this.glow.length ? mergeGeometries(this.glow, false) : null;
    this.parts.forEach(g => g.dispose()); this.glow.forEach(g => g.dispose());
    if (main) { main.computeBoundingBox(); main.computeBoundingSphere(); }
    if (glow) { glow.computeBoundingSphere(); }
    return { main, glow };
  }
}

/* ---------- Palett ---------- */
export const P = {
  woodDark: 0x6a4428, wood: 0x8f6038, woodLight: 0xb07c48, plank: 0xa26e40, log: 0x80552f,
  turf: 0x6c8e43, turfDark: 0x5a7a39, thatch: 0xd2b264, shingle: 0x7d563c, shingleRed: 0x93462f,
  stone: 0x96958f, stoneDark: 0x77766f, stoneLight: 0xb0afa7,
  red: 0xa83a2c, blue: 0x2f5f9a, yellow: 0xd8a83a, white: 0xe8dcc0, green: 0x3f7a3a,
  iron: 0x50555c, gold: 0xd4a632, dark: 0x2a2420, hay: 0xd8b860, fish: 0x9fb3c0, hide: 0xb08a60
};

/* ---------- Byggnadsmodeller ---------- */
function dragonHead(b, x, y, z, ry, color = P.woodDark) {
  b.box(x, y, z, 0.08, 0.28, 0.08, color, ry, 0.35);
  b.box(x + Math.sin(ry) * 0.06, y + 0.24, z + Math.cos(ry) * 0.06, 0.07, 0.07, 0.18, color, ry);
}
function door(b, x, y, z, w = 0.36, h = 0.55, ry = 0) { b.box(x, y, z, w, h, 0.05, P.dark, ry); }
function shieldOnWall(b, x, y, z, color, ry = 0) { b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 8), color, x, y, z, Math.PI / 2, ry, 0); b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6), P.iron, x, y, z + 0.01, Math.PI / 2, ry, 0); }
function logPile(b, x, y, z, n = 3, ry = 0) {
  for (let i = 0; i < n; i++) for (let k = 0; k <= i % 2; k++)
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), P.log, x + Math.cos(ry) * (i - n / 2) * 0.15, y + 0.07 + k * 0.13, z - Math.sin(ry) * (i - n / 2) * 0.15, Math.PI / 2, ry, 0);
}
function crate(b, x, y, z, s = 0.22, c = P.plank) { b.box(x, y, z, s, s, s, c, 0.3); }
function barrel(b, x, y, z) { b.cyl(x, y, z, 0.1, 0.1, 0.24, P.woodLight, 8); b.cyl(x, y + 0.05, z, 0.105, 0.105, 0.03, P.iron, 8); b.cyl(x, y + 0.17, z, 0.105, 0.105, 0.03, P.iron, 8); }
function hayBale(b, x, y, z, ry = 0) { b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), P.hay, x, y + 0.16, z, 0, ry, Math.PI / 2); }

function longhouse(b, L, W, H, roofH, wallC, roofC, opts = {}) {
  // väggar
  b.box(0, 0, 0, L, H, W, wallC);
  // grundsten
  b.box(0, 0, 0, L + 0.08, 0.08, W + 0.08, P.stoneDark);
  // takbjälkar / tak
  b.roof(0, H, 0, L + 0.3, W + 0.42, roofH, roofC);
  // gavlar korsade bjälkar
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 + 0.15);
    b.box(x, H + roofH - 0.05, 0.08, 0.06, 0.5, 0.06, P.woodDark, 0, 0.5);
    b.box(x, H + roofH - 0.05, -0.08, 0.06, 0.5, 0.06, P.woodDark, 0, -0.5);
  }
  // hörnstolpar
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * L / 2, 0, sz * W / 2, 0.09, H + 0.02, 0.09, P.woodDark);
  door(b, 0, 0, W / 2 + 0.01, 0.34, Math.min(0.6, H * 0.8));
  if (opts.windows !== false) {
    const wn = Math.max(1, Math.floor(L / 1.1));
    for (let i = 0; i < wn; i++) {
      const x = -L / 2 + (i + 0.5) * (L / wn);
      if (Math.abs(x) < 0.3) continue;
      b.window(x, H * 0.45, W / 2 + 0.02, 0.16, 0.16);
      b.window(x, H * 0.45, -W / 2 - 0.02, 0.16, 0.16);
    }
  }
}
function chimney(b, x, z, y) { b.box(x, y, z, 0.18, 0.4, 0.18, P.stone); }

function scaffoldGeo(w, d, h) {
  const b = new GB();
  const c = 0x8a6a42;
  const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
  for (const x of xs) for (const z of zs) b.box(x, 0, z, 0.06, h, 0.06, c);
  for (let y = 0.4; y < h; y += 0.55) {
    b.box(0, y, -d / 2, w, 0.04, 0.05, c); b.box(0, y, d / 2, w, 0.04, 0.05, c);
    b.box(-w / 2, y, 0, 0.05, 0.04, d, c); b.box(w / 2, y, 0, 0.05, 0.04, d, c);
  }
  b.box(0, 0, 0, w - 0.1, 0.05, d - 0.1, 0x9c7a50);
  return b.build().main;
}

const BUILDERS = {
  hall(b, lvl) {
    const L = lvl > 1 ? 3.8 : 3.5, W = lvl > 1 ? 2.6 : 2.3;
    if (lvl > 1) b.box(0, 0, 0, L + 0.3, 0.25, W + 0.3, P.stone);
    const y0 = lvl > 1 ? 0.25 : 0;
    b.box(0, y0, 0, L, 1.1, W, P.wood);
    b.box(0, y0, 0, L + 0.1, 0.1, W + 0.1, P.stoneDark);
    b.roof(0, y0 + 1.1, 0, L + 0.5, W + 0.7, 1.45, lvl > 1 ? P.shingleRed : 0x8a5c3c);
    b.roof(0, y0 + 2.5, 0, L * 0.35, 0.5, 0.25, P.woodDark);
    for (const sx of [-1, 1]) {
      dragonHead(b, sx * (L / 2 + 0.25), y0 + 2.45, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, P.woodDark);
      b.box(sx * (L / 2 + 0.25), y0 + 2.25, 0.12, 0.07, 0.7, 0.07, P.woodDark, 0, 0.5);
      b.box(sx * (L / 2 + 0.25), y0 + 2.25, -0.12, 0.07, 0.7, 0.07, P.woodDark, 0, -0.5);
    }
    for (let i = 0; i < 6; i++) b.box(-L / 2 + 0.3 + i * (L - 0.6) / 5, y0, W / 2 + 0.02, 0.1, 1.1, 0.06, P.woodDark);
    // portal
    b.box(0, y0, W / 2 + 0.15, 0.8, 0.95, 0.25, P.woodDark);
    b.roof(0, y0 + 0.95, W / 2 + 0.2, 1.0, 0.5, 0.35, P.shingle, 0);
    door(b, 0, y0, W / 2 + 0.29, 0.44, 0.75);
    const cols = [P.red, P.blue, P.yellow, P.red, P.white, P.blue];
    for (let i = 0; i < 4; i++) shieldOnWall(b, -L / 2 + 0.45 + i * 0.42 + (i > 1 ? 1.0 : 0), y0 + 0.55, W / 2 + 0.06, cols[i]);
    for (let i = 0; i < 4; i++) b.window(-L / 2 + 0.5 + i * (L - 1) / 3, y0 + 0.55, -W / 2 - 0.02, 0.2, 0.18);
    // facklor
    for (const sx of [-1, 1]) { b.cyl(sx * 0.6, 0, W / 2 + 0.5, 0.03, 0.03, 0.8, P.woodDark, 5); b.add(new THREE.BoxGeometry(0.1, 0.12, 0.1), 0xffffff, sx * 0.6, 0.86, W / 2 + 0.5, 0, 0, 0, 1, 1, 1, true); }
    if (lvl > 1) { b.cyl(L / 2 + 0.2, 0, W / 2 + 0.2, 0.03, 0.03, 2.2, P.woodDark); b.box(L / 2 + 0.38, 1.6, W / 2 + 0.2, 0.32, 0.5, 0.02, P.red); }
  },
  house(b, lvl) {
    if (lvl > 1) {
      longhouse(b, 2.7, 1.5, 0.85, 0.95, P.wood, P.turf);
      b.box(0.9, 0, -0.95, 0.8, 0.6, 0.5, P.wood); b.roof(0.9, 0.6, -0.95, 0.9, 0.6, 0.35, P.turfDark);
      chimney(b, -0.7, 0.2, 1.4);
      crate(b, 1.4, 0, 0.9);
    } else {
      longhouse(b, 2.4, 1.3, 0.7, 0.85, P.wood, P.turf);
      chimney(b, -0.6, 0.15, 1.2);
      logPile(b, 1.0, 0, 0.85, 3, 0);
    }
  },
  storehouse(b, lvl) {
    const s = lvl > 1 ? 1.6 : 1.3;
    b.box(0, 0, -0.1, s, 0.25, s * 0.8, P.stoneDark);
    b.box(0, 0.25, -0.1, s, 0.7, s * 0.8, P.plank);
    b.roof(0, 0.95, -0.1, s + 0.2, s * 0.8 + 0.3, 0.55, P.shingle, Math.PI / 2 * 0);
    door(b, 0, 0.25, s * 0.4 - 0.08, 0.4, 0.55);
    crate(b, -0.6, 0, 0.7); crate(b, -0.35, 0, 0.75); crate(b, -0.48, 0.22, 0.72, 0.2);
    barrel(b, 0.55, 0, 0.7); barrel(b, 0.75, 0, 0.55);
    if (lvl > 1) { crate(b, 0.6, 0, -0.85); barrel(b, -0.7, 0, -0.85); }
  },
  well(b) {
    b.cyl(0, 0, 0, 0.32, 0.36, 0.35, P.stone, 9);
    b.cyl(0, 0.3, 0, 0.24, 0.24, 0.06, 0x2a4a66, 9);
    b.box(-0.3, 0, 0, 0.06, 0.85, 0.06, P.woodDark); b.box(0.3, 0, 0, 0.06, 0.85, 0.06, P.woodDark);
    b.roof(0, 0.85, 0, 0.8, 0.6, 0.3, P.shingle);
    b.cyl(0, 0.6, 0, 0.03, 0.03, 0.6, P.wood, 5, 0, 0, Math.PI / 2);
    b.cyl(0.1, 0.4, 0, 0.06, 0.05, 0.1, P.woodLight, 6);
  },
  woodcutter(b, lvl) {
    b.box(-0.2, 0, -0.2, 1.1, 0.65, 0.9, P.log);
    b.roof(-0.2, 0.65, -0.2, 1.3, 1.15, 0.55, P.turf);
    door(b, -0.2, 0, 0.26, 0.3, 0.5);
    chimney(b, -0.55, -0.4, 0.9);
    logPile(b, 0.55, 0, 0.55, 4, Math.PI / 2);
    b.cyl(-0.65, 0, 0.6, 0.13, 0.15, 0.2, P.log, 7);
    b.box(-0.6, 0.2, 0.6, 0.03, 0.3, 0.03, P.woodLight, 0, 0, 0.4);
    b.box(-0.56, 0.42, 0.6, 0.12, 0.08, 0.02, P.iron);
    if (lvl > 1) { for (let i = 0; i < 3; i++) { b.cyl(0.7, 0, -0.7 + i * 0.25, 0.015, 0.015, 0.15, P.wood, 4); b.cone(0.7, 0.12, -0.7 + i * 0.25, 0.08, 0.2, P.green, 5); } }
  },
  quarry(b, lvl) {
    b.box(-0.35, 0, -0.35, 0.9, 0.6, 0.8, P.plank);
    b.roof(-0.35, 0.6, -0.35, 1.1, 1.0, 0.45, P.shingle);
    door(b, -0.35, 0, 0.06, 0.28, 0.45);
    b.box(0.45, 0, 0.45, 0.35, 0.25, 0.3, P.stoneLight, 0.3); b.box(0.62, 0, 0.1, 0.28, 0.2, 0.3, P.stone, 0.9); b.box(0.45, 0.25, 0.4, 0.25, 0.2, 0.22, P.stone, 0.6);
    // lyftkran
    b.box(0.55, 0, -0.55, 0.05, 1.1, 0.05, P.woodDark, 0, 0, 0.25); b.box(0.25, 0, -0.55, 0.05, 1.1, 0.05, P.woodDark, 0, 0, -0.25);
    b.box(0.4, 1.0, -0.55, 0.6, 0.05, 0.05, P.woodDark);
    if (lvl > 1) { b.box(-0.6, 0, 0.6, 0.3, 0.22, 0.3, P.stoneLight, 0.2); b.box(-0.3, 0, 0.7, 0.25, 0.18, 0.25, P.stone, 0.7); }
  },
  mine(b, lvl) {
    b.sphere(0, 0, -0.2, 0.95, P.stoneDark, 0, 1.1, 0.75, 0.9);
    b.box(0, 0, 0.45, 0.62, 0.68, 0.3, P.woodDark);
    b.box(0, 0, 0.52, 0.42, 0.52, 0.2, 0x151210);
    b.box(0, 0.68, 0.45, 0.75, 0.09, 0.36, P.wood);
    // räls och vagn
    b.box(-0.1, 0, 0.85, 0.04, 0.03, 0.7, P.iron); b.box(0.1, 0, 0.85, 0.04, 0.03, 0.7, P.iron);
    b.box(0, 0.05, 0.95, 0.3, 0.2, 0.36, P.woodLight);
    b.box(0, 0.2, 0.95, 0.24, 0.07, 0.3, 0x8a5a40);
    b.cyl(-0.7, 0, 0.6, 0.03, 0.03, 0.9, P.woodDark, 5); b.add(new THREE.BoxGeometry(0.08, 0.1, 0.08), 0xffffff, -0.7, 0.95, 0.6, 0, 0, 0, 1, 1, 1, true);
    if (lvl > 1) { b.box(0.7, 0, 0.3, 0.4, 0.5, 0.5, P.plank); b.roof(0.7, 0.5, 0.3, 0.5, 0.65, 0.3, P.shingle, Math.PI / 2); }
  },
  barn(b, lvl) {
    const L = lvl > 1 ? 1.7 : 1.5;
    b.box(0, 0, -0.15, L, 0.8, 1.2, 0x8a3a2a);
    b.box(0, 0, -0.15, L + 0.05, 0.08, 1.25, P.stoneDark);
    b.roof(0, 0.8, -0.15, L + 0.2, 1.5, 0.75, P.thatch, Math.PI / 2 * 0);
    b.box(0, 0, 0.46, 0.55, 0.6, 0.04, P.woodDark);
    b.box(0, 0.05, 0.48, 0.04, 0.5, 0.02, P.woodLight, 0, 0, 0.8); b.box(0, 0.05, 0.48, 0.04, 0.5, 0.02, P.woodLight, 0, 0, -0.8);
    hayBale(b, -0.65, 0, 0.72); hayBale(b, -0.3, 0, 0.78, 0.4);
    b.box(0.6, 0, 0.7, 0.3, 0.3, 0.3, P.hay);
    if (lvl > 1) { b.cyl(-0.85, 0, -0.65, 0.22, 0.22, 1.2, P.stoneLight, 9); b.cone(-0.85, 1.2, -0.65, 0.28, 0.35, P.shingleRed, 9); }
  },
  fisher(b, lvl) {
    b.box(-0.3, 0, -0.25, 0.95, 0.6, 0.85, P.plank);
    b.roof(-0.3, 0.6, -0.25, 1.15, 1.05, 0.5, P.thatch);
    door(b, -0.3, 0, 0.18, 0.28, 0.45);
    // torkställning med fisk
    b.box(0.35, 0, 0.55, 0.04, 0.6, 0.04, P.woodDark); b.box(0.85, 0, 0.55, 0.04, 0.6, 0.04, P.woodDark);
    b.box(0.6, 0.58, 0.55, 0.55, 0.03, 0.03, P.woodDark);
    for (let i = 0; i < 4; i++) b.box(0.42 + i * 0.12, 0.38, 0.55, 0.05, 0.18, 0.02, P.fish);
    // båt
    b.box(0.55, 0, -0.45, 0.35, 0.12, 0.85, P.wood); b.box(0.55, 0.1, -0.45, 0.25, 0.04, 0.7, P.woodDark);
    b.cone(-0.75, 0, 0.6, 0.12, 0.25, 0x6a8a9a, 6);
    if (lvl > 1) { b.box(-0.7, 0, 0.75, 0.3, 0.18, 0.3, P.plank); barrel(b, -0.4, 0, 0.75); }
  },
  hunter(b) {
    b.box(-0.25, 0, -0.25, 1.0, 0.62, 0.85, P.log);
    b.roof(-0.25, 0.62, -0.25, 1.2, 1.05, 0.55, P.turfDark);
    door(b, -0.25, 0, 0.18, 0.28, 0.45);
    // horn på gaveln
    b.box(-0.25 + 0.62, 0.95, -0.25, 0.03, 0.25, 0.03, 0xe0d0b0, 0, 0, 0.5); b.box(-0.25 + 0.62, 0.95, -0.25, 0.03, 0.25, 0.03, 0xe0d0b0, 0, 0, -0.5);
    // hudram
    b.box(0.55, 0, 0.5, 0.04, 0.7, 0.04, P.woodDark); b.box(0.95, 0, 0.5, 0.04, 0.7, 0.04, P.woodDark);
    b.box(0.75, 0.15, 0.5, 0.36, 0.45, 0.02, P.hide);
    b.box(0.65, 0, -0.6, 0.4, 0.04, 0.25, P.hide, 0.3);
  },
  gatherer(b) {
    b.cyl(-0.2, 0, -0.15, 0.55, 0.6, 0.5, P.plank, 9);
    b.cone(-0.2, 0.5, -0.15, 0.75, 0.75, P.thatch, 9);
    door(b, -0.2, 0, 0.44, 0.28, 0.42);
    for (let i = 0; i < 3; i++) { b.cyl(0.55 + (i % 2) * 0.2, 0, 0.55 - i * 0.22, 0.1, 0.08, 0.13, 0xb08850, 7); b.sphere(0.55 + (i % 2) * 0.2, 0.13, 0.55 - i * 0.22, 0.07, i === 1 ? 0x3a3a8a : 0xb02a3a, 0); }
  },
  harbor(b) {
    // bodhus på land (z<0), brygga ut över vattnet (+z)
    b.box(-0.6, 0, -0.7, 1.4, 0.8, 1.2, P.plank);
    b.roof(-0.6, 0.8, -0.7, 1.6, 1.45, 0.65, P.shingle);
    door(b, -0.6, 0, -0.09, 0.4, 0.55);
    for (let i = 0; i < 6; i++) b.box(0.6, 0, -1.2 + i * 0.75, 0.6, 0.12, 0.7, P.woodLight);
    for (let i = 0; i < 7; i++) { b.cyl(0.32, -1.4, -1.2 + i * 0.7, 0.05, 0.05, 1.6, P.woodDark, 5); b.cyl(0.88, -1.4, -1.2 + i * 0.7, 0.05, 0.05, 1.6, P.woodDark, 5); }
    barrel(b, 0.75, 0.12, -1.0); crate(b, 0.45, 0.12, -0.6);
    b.cyl(-1.2, 0, 0.6, 0.04, 0.04, 1.2, P.woodDark, 5); b.add(new THREE.BoxGeometry(0.1, 0.12, 0.1), 0xffffff, -1.2, 1.25, 0.6, 0, 0, 0, 1, 1, 1, true);
  },
  smithy(b, lvl) {
    b.box(-0.2, 0, -0.25, 1.2, 0.65, 0.95, P.stone);
    b.roof(-0.2, 0.65, -0.25, 1.4, 1.2, 0.5, P.shingle);
    b.box(0.25, 0, 0.25, 0.5, 0.5, 0.05, 0x1a1412);
    chimney(b, -0.55, -0.4, 0.95); b.box(-0.55, 1.35, -0.4, 0.2, 0.3, 0.2, P.stoneDark);
    // ässja med glöd
    b.box(0.55, 0, 0.55, 0.45, 0.35, 0.4, P.stoneDark);
    b.add(new THREE.BoxGeometry(0.3, 0.06, 0.26), 0xffffff, 0.55, 0.37, 0.55, 0, 0, 0, 1, 1, 1, true);
    // städ
    b.box(-0.3, 0, 0.6, 0.12, 0.22, 0.12, P.woodDark); b.box(-0.3, 0.22, 0.6, 0.26, 0.08, 0.12, P.iron);
    if (lvl > 1) { b.box(-0.8, 0, 0.55, 0.05, 0.6, 0.3, P.woodDark); for (let i = 0; i < 3; i++) b.box(-0.78, 0.15 + i * 0.15, 0.55, 0.02, 0.06, 0.25, P.iron); }
  },
  market(b) {
    const cols = [[P.red, P.white], [P.blue, P.white], [P.yellow, P.red], [P.green, P.yellow]];
    const pos = [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]];
    pos.forEach(([x, z], i) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * 0.35, 0, z + sz * 0.3, 0.05, 0.75, 0.05, P.woodDark);
      b.box(x, 0.3, z + 0.18, 0.75, 0.12, 0.25, P.plank);
      b.roof(x, 0.75, z, 0.85, 0.75, 0.25, cols[i][0], 0);
      b.box(x, 0.43, z + 0.18, 0.15, 0.1, 0.15, cols[i][1]);
      crate(b, x - 0.2, 0.42, z + 0.15, 0.12, 0xb07a40);
    });
    b.cyl(0, 0, 0, 0.06, 0.06, 1.6, P.woodDark, 6);
    b.box(0.2, 1.1, 0, 0.4, 0.3, 0.02, P.red);
    barrel(b, 0, 0, 1.1); barrel(b, 0.3, 0, -1.1);
  },
  temple(b, lvl) {
    const s = lvl > 1 ? 1.15 : 1;
    b.box(0, 0, 0, 2.2 * s, 0.15, 2.2 * s, P.stone);
    b.box(0, 0.15, 0, 1.7 * s, 0.9, 1.7 * s, P.woodDark);
    b.add(new THREE.ConeGeometry(1.45 * s, 0.7, 4), P.shingle, 0, 1.05 + 0.35, 0, 0, Math.PI / 4, 0);
    b.box(0, 1.25, 0, 1.0 * s, 0.6, 1.0 * s, P.woodDark);
    b.add(new THREE.ConeGeometry(0.95 * s, 0.6, 4), P.shingle, 0, 1.85 + 0.3, 0, 0, Math.PI / 4, 0);
    b.box(0, 2.0, 0, 0.5 * s, 0.4, 0.5 * s, P.woodDark);
    b.add(new THREE.ConeGeometry(0.5 * s, 0.8, 4), lvl > 1 ? P.gold : P.shingle, 0, 2.4 + 0.4, 0, 0, Math.PI / 4, 0);
    for (const [x, z, r] of [[1, 1, Math.PI / 4], [-1, 1, -Math.PI / 4], [1, -1, 3 * Math.PI / 4], [-1, -1, -3 * Math.PI / 4]]) dragonHead(b, x * 0.85 * s, 1.35, z * 0.85 * s, r);
    door(b, 0, 0.15, 0.86 * s, 0.4, 0.65);
    b.window(-0.5, 0.55, 0.86 * s, 0.14, 0.2); b.window(0.5, 0.55, 0.86 * s, 0.14, 0.2);
    b.window(0, 1.4, 0.51 * s, 0.14, 0.18);
    // runstenar
    b.box(-1.2, 0, 1.15, 0.2, 0.55, 0.1, P.stoneLight, 0.3); b.box(1.2, 0, 1.15, 0.2, 0.5, 0.1, P.stoneLight, -0.3);
  },
  barracks(b, lvl) {
    const L = lvl > 1 ? 2.8 : 2.5;
    longhouse(b, L, 1.2, 0.75, 0.75, P.woodDark, P.shingleRed);
    for (let i = 0; i < 3; i++) shieldOnWall(b, -0.9 + i * 0.6 + (i > 0 ? 0.3 : 0), 0.45, 0.62, [P.red, P.blue, P.yellow][i]);
    // vapenställ
    b.box(-1.1, 0, 0.85, 0.6, 0.04, 0.08, P.woodDark); b.box(-1.35, 0, 0.85, 0.04, 0.5, 0.04, P.woodDark); b.box(-0.85, 0, 0.85, 0.04, 0.5, 0.04, P.woodDark);
    for (let i = 0; i < 4; i++) b.box(-1.25 + i * 0.12, 0, 0.85, 0.02, 0.7, 0.02, P.woodLight, 0, 0.1);
    // träningsdocka
    b.box(1.1, 0, 0.85, 0.05, 0.6, 0.05, P.woodDark); b.box(1.1, 0.4, 0.85, 0.35, 0.05, 0.05, P.woodDark); b.sphere(1.1, 0.68, 0.85, 0.09, P.hay);
    b.cyl(L / 2 + 0.1, 0, -0.5, 0.03, 0.03, 1.8, P.woodDark, 5); b.box(L / 2 + 0.28, 1.35, -0.5, 0.32, 0.4, 0.02, P.red);
  },
  archertower(b, lvl) {
    if (lvl > 1) {
      b.cyl(0, 0, 0, 0.7, 0.8, 2.6, P.stone, 9);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.box(Math.cos(a) * 0.7, 2.6, Math.sin(a) * 0.7, 0.2, 0.25, 0.2, P.stoneLight, -a); }
      b.cyl(0, 2.6, 0, 0.72, 0.72, 0.06, P.stoneDark, 9);
      b.window(0, 1.5, 0.75, 0.12, 0.22);
      b.cyl(0, 2.6, 0, 0.03, 0.03, 0.9, P.woodDark, 4); b.box(0.15, 3.15, 0, 0.3, 0.22, 0.02, P.blue);
      return;
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.55, 0, sz * 0.55, 0.12, 2.3, 0.12, P.log, 0, sz * 0.06, -sx * 0.06);
    for (let y = 0.5; y < 2.2; y += 0.7) { b.box(0, y, 0.52, 1.05, 0.06, 0.05, P.woodDark, 0, 0, 0.6); b.box(0, y, -0.52, 1.05, 0.06, 0.05, P.woodDark, 0, 0, -0.6); }
    b.box(0, 2.2, 0, 1.4, 0.1, 1.4, P.plank);
    for (const sx of [-1, 1]) { b.box(sx * 0.68, 2.3, 0, 0.06, 0.35, 1.4, P.wood); b.box(0, 2.3, sx * 0.68, 1.4, 0.35, 0.06, P.wood); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.62, 2.3, sz * 0.62, 0.06, 0.8, 0.06, P.woodDark);
    b.add(new THREE.ConeGeometry(1.05, 0.6, 4), P.shingle, 0, 3.1 + 0.3, 0, 0, Math.PI / 4, 0);
  },
  watchtower(b) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.3, 0, sz * 0.3, 0.08, 2.6, 0.08, P.log, 0, sz * 0.05, -sx * 0.05);
    b.box(0, 1.2, 0.3, 0.6, 0.04, 0.04, P.woodDark, 0, 0, 0.7);
    b.box(0, 2.5, 0, 0.85, 0.07, 0.85, P.plank);
    for (const sx of [-1, 1]) { b.box(sx * 0.4, 2.57, 0, 0.04, 0.25, 0.85, P.wood); b.box(0, 2.57, sx * 0.4, 0.85, 0.25, 0.04, P.wood); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.38, 2.57, sz * 0.38, 0.04, 0.55, 0.04, P.woodDark);
    b.add(new THREE.ConeGeometry(0.62, 0.45, 4), P.thatch, 0, 3.12 + 0.22, 0, 0, Math.PI / 4, 0);
    b.add(new THREE.BoxGeometry(0.08, 0.1, 0.08), 0xffffff, 0.3, 2.75, 0.3, 0, 0, 0, 1, 1, 1, true);
  },
  gate(b, lvl) {
    const c = lvl > 1 ? P.stone : P.log;
    for (const sx of [-1, 1]) { b.box(sx * 0.42, 0, 0, 0.2, 1.4, 0.3, c); }
    b.box(0, 1.15, 0, 1.05, 0.22, 0.32, lvl > 1 ? P.stoneDark : P.woodDark);
    b.box(0, 0, 0.03, 0.62, 1.0, 0.08, P.plank);
    b.box(0, 0.45, 0.08, 0.62, 0.07, 0.03, P.iron);
    b.roof(0, 1.37, 0, 1.15, 0.5, 0.25, P.shingle);
  },
  // fiendens läger
  tent(b) {
    b.cone(0, 0, 0, 0.75, 1.1, 0x7a2a22, 6);
    b.cyl(0, 1.0, 0, 0.02, 0.02, 0.4, P.woodDark, 4);
    b.box(0, 0, 0.65, 0.3, 0.35, 0.05, 0x2a1210);
  },
  jarlhall(b) {
    longhouse(b, 3.4, 2.1, 1.0, 1.3, 0x3a2418, 0x2a2420, { windows: true });
    for (const sx of [-1, 1]) dragonHead(b, sx * 1.9, 2.25, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0x1a1412);
    for (let i = 0; i < 4; i++) shieldOnWall(b, -1.3 + i * 0.85, 0.55, 1.07, i % 2 ? 0x1a1a1a : 0x8a1a12);
    for (const sx of [-1, 1]) { b.cyl(sx * 1.4, 0, 1.6, 0.04, 0.04, 2.2, P.woodDark, 5); b.box(sx * 1.4 + 0.2, 1.6, 1.6, 0.36, 0.55, 0.02, 0x8a1a12); }
    b.cyl(0, 0, 1.8, 0.05, 0.05, 0.9, P.woodDark, 5);
    b.sphere(0, 1.0, 1.8, 0.12, 0xd8d0c0, 0);
  }
};

const geoCache = new Map();
/** Geometrier som delas mellan omgångar och aldrig ska kasseras. */
export const sharedGeos = new Set();
export function buildingGeo(type, lvl = 1) {
  const key = type + ':' + lvl;
  if (geoCache.has(key)) return geoCache.get(key);
  const b = new GB();
  (BUILDERS[type] || BUILDERS.house)(b, lvl);
  const g = b.build();
  geoCache.set(key, g);
  if (g.main) sharedGeos.add(g.main);
  if (g.glow) sharedGeos.add(g.glow);
  return g;
}
const scaffoldCache = new Map();
export function scaffold(w, d, h) {
  const key = w + 'x' + d + 'x' + h;
  if (!scaffoldCache.has(key)) { const g = scaffoldGeo(w - 0.1, d - 0.1, h); sharedGeos.add(g); scaffoldCache.set(key, g); }
  return scaffoldCache.get(key);
}

/* ---------- Mur-delar (instansierade) ---------- */
export function wallGeos() {
  const pal = new GB();
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; pal.cyl(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, 0.09, 0.1, 1.05 + (i % 2) * 0.1, P.log, 6); pal.cone(Math.cos(a) * 0.1, 1.05 + (i % 2) * 0.1, Math.sin(a) * 0.1, 0.09, 0.2, P.wood, 6); }
  const palArm = new GB();
  for (let i = 0; i < 2; i++) { const z = 0.17 + i * 0.2; palArm.cyl(0, 0, z, 0.09, 0.1, 0.98 + (i % 2) * 0.12, P.log, 6); palArm.cone(0, 0.98 + (i % 2) * 0.12, z, 0.09, 0.18, P.wood, 6); }
  palArm.box(0, 0.55, 0.25, 0.06, 0.08, 0.5, P.woodDark);
  const st = new GB();
  st.box(0, 0, 0, 0.5, 1.25, 0.5, P.stone); st.box(0, 1.25, 0, 0.56, 0.2, 0.56, P.stoneLight);
  const stArm = new GB();
  stArm.box(0, 0, 0.26, 0.42, 1.1, 0.52, P.stone); stArm.box(0, 1.1, 0.12, 0.46, 0.18, 0.18, P.stoneLight); stArm.box(0, 1.1, 0.42, 0.46, 0.18, 0.12, P.stoneLight);
  return { post: pal.build().main, arm: palArm.build().main, spost: st.build().main, sarm: stArm.build().main };
}

/* ---------- Natur ---------- */
export function treeGeos() {
  const pineT = new GB(); pineT.cyl(0, 0, 0, 0.06, 0.09, 0.5, 0x5a3a22, 5);
  const pineC = new GB();
  pineC.cone(0, 0.3, 0, 0.5, 0.75, 0xffffff, 7); pineC.cone(0, 0.7, 0, 0.4, 0.65, 0xffffff, 7); pineC.cone(0, 1.05, 0, 0.27, 0.55, 0xffffff, 7);
  const leafT = new GB(); leafT.cyl(0, 0, 0, 0.05, 0.08, 0.75, 0xd8d0c0, 5); leafT.cyl(0.08, 0.45, 0, 0.02, 0.03, 0.35, 0xd8d0c0, 4, 0, 0, -0.6);
  const leafC = new GB(); leafC.sphere(0, 0.95, 0, 0.42, 0xffffff, 0, 1, 1.05, 1); leafC.sphere(0.18, 0.78, 0.1, 0.26, 0xffffff, 0);
  const stump = new GB(); stump.cyl(0, 0, 0, 0.08, 0.1, 0.12, 0x6a4a2a, 6); stump.cyl(0, 0.12, 0, 0.075, 0.075, 0.005, 0xc8a070, 6);
  const rock = new GB(); rock.sphere(0, 0.15, 0, 0.38, 0xffffff, 0, 1, 0.75, 0.9); rock.sphere(0.25, 0.08, 0.2, 0.22, 0xffffff, 0); rock.sphere(-0.22, 0.06, -0.15, 0.2, 0xffffff, 0);
  const ore = new GB(); ore.sphere(0, 0.2, 0, 0.45, 0x5a5550, 0, 1, 0.85, 1); ore.sphere(0.2, 0.42, 0.15, 0.1, 0xc06a30, 0); ore.sphere(-0.2, 0.35, 0.22, 0.09, 0xd07a38, 0); ore.sphere(0.05, 0.5, -0.2, 0.08, 0xb05a28, 0); ore.sphere(-0.3, 0.12, -0.2, 0.25, 0x4a4540, 0);
  const bush = new GB(); bush.sphere(0, 0.18, 0, 0.26, 0x3d6a30, 0, 1, 0.8, 1); bush.sphere(0.18, 0.12, 0.08, 0.17, 0x467a36, 0);
  const berries = new GB();
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.2 + (i % 3) * 0.03; berries.sphere(Math.cos(a) * r, 0.15 + (i % 4) * 0.06, Math.sin(a) * r, 0.04, 0xffffff, 0); }
  return {
    pineT: pineT.build().main, pineC: pineC.build().main, leafT: leafT.build().main, leafC: leafC.build().main,
    stump: stump.build().main, rock: rock.build().main, ore: ore.build().main, bush: bush.build().main, berries: berries.build().main
  };
}

export function cropGeo() {
  // rader av sädesstrån (smala kägler) med lite variation – ser ut som en åker, inte som lådor
  const b = new GB();
  let q = 1;
  const rnd = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
  for (let r = 0; r < 7; r++) for (let c = 0; c < 9; c++) {
    const x = -1.3 + c * 0.325 + (rnd() - 0.5) * 0.08, z = -1.26 + r * 0.42 + (rnd() - 0.5) * 0.06;
    const h = 0.32 + rnd() * 0.14, sh = 0.85 + rnd() * 0.25;
    b.add(new THREE.ConeGeometry(0.06, h, 4), 0xffffff, x, h / 2, z, (rnd() - 0.5) * 0.25, rnd() * 3, (rnd() - 0.5) * 0.25, 1, sh, 1);
    b.add(new THREE.ConeGeometry(0.045, h * 0.85, 4), 0xeeeeee, x + 0.08, h * 0.42, z + 0.05, (rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3, 1, sh, 1);
  }
  return b.build().main;
}

/* ---------- Figurer ---------- */
export function figureGeos() {
  const g = {};
  const mk = (fn) => { const b = new GB(); fn(b); return b.build().main; };
  g.leg = mk(b => b.box(0, -0.17, 0, 0.055, 0.17, 0.06, 0xffffff));           // pivot i höften (y=0)
  g.torso = mk(b => { b.cyl(0, 0, 0, 0.085, 0.115, 0.22, 0xffffff, 7); });       // underkant y=0
  g.belt = mk(b => b.cyl(0, 0.02, 0, 0.118, 0.118, 0.035, 0xffffff, 7));
  g.arm = mk(b => b.box(0, -0.15, 0, 0.045, 0.15, 0.05, 0xffffff));             // pivot i axeln
  g.head = mk(b => b.sphere(0, 0, 0, 0.075, 0xffffff, 1));
  g.hair = mk(b => { b.sphere(0, 0.025, -0.012, 0.078, 0xffffff, 0, 1, 0.8, 1); b.box(0, -0.07, -0.05, 0.11, 0.07, 0.04, 0xffffff); });
  g.helmet = mk(b => { b.sphere(0, 0.03, 0, 0.08, 0xffffff, 1, 1, 0.75, 1); b.box(0, -0.05, 0.072, 0.02, 0.07, 0.015, 0xffffff); });
  g.hood = mk(b => { b.sphere(0, 0.02, -0.01, 0.088, 0xffffff, 0, 1, 0.9, 1.05); b.cone(0, 0.06, -0.06, 0.05, 0.08, 0xffffff, 5); });
  g.shield = mk(b => { b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 9), 0xffffff, 0, 0, 0, Math.PI / 2, 0, 0); });
  g.boss = mk(b => b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.035, 6), 0x777777, 0, 0, 0.012, Math.PI / 2, 0, 0));
  // verktyg (pivot i handen, pekar framåt/upp)
  g.axe = mk(b => { b.box(0, -0.05, 0, 0.02, 0.32, 0.02, 0x7a5130); b.box(0, 0.22, 0.04, 0.02, 0.08, 0.08, 0x9aa0a8); });
  g.pick = mk(b => { b.box(0, -0.05, 0, 0.02, 0.3, 0.02, 0x7a5130); b.box(0, 0.23, 0, 0.02, 0.03, 0.2, 0x8a9098); });
  g.spear = mk(b => { b.box(0, -0.25, 0, 0.018, 0.65, 0.018, 0x7a5130); b.cone(0, 0.4, 0, 0.025, 0.1, 0xc0c8d0, 4); });
  g.sword = mk(b => { b.box(0, -0.02, 0, 0.02, 0.05, 0.02, 0x5a3a22); b.box(0, 0.03, 0, 0.08, 0.02, 0.025, 0x8a8a8a); b.box(0, 0.05, 0, 0.025, 0.28, 0.01, 0xd0d6dc); });
  g.bow = mk(b => { b.add(new THREE.TorusGeometry(0.2, 0.01, 4, 10, Math.PI * 0.9), 0x6a4020, 0, 0.05, 0, 0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05); b.box(0, 0.05, -0.02, 0.004, 0.38, 0.004, 0xeeeeee); });
  g.rod = mk(b => { b.box(0, 0.15, 0.1, 0.012, 0.6, 0.012, 0x8a6a40, 0, 0.6); });
  g.torch = mk(b => { b.box(0, 0, 0, 0.025, 0.28, 0.025, 0x5a3a22); b.add(new THREE.BoxGeometry(0.05, 0.07, 0.05), 0xffa030, 0, 0.17, 0); });
  g.hammer = mk(b => { b.box(0, -0.03, 0, 0.02, 0.25, 0.02, 0x7a5130); b.box(0, 0.12, 0, 0.05, 0.05, 0.1, 0x6a6a6a); });
  g.club = mk(b => { b.cyl(0, -0.2, 0, 0.06, 0.03, 0.7, 0x5a4a30, 6); b.sphere(0, 0.45, 0, 0.1, 0x5a4a30, 0); });
  g.ladder = mk(b => { b.box(-0.08, -0.3, 0, 0.02, 1.0, 0.02, 0x8a6a40); b.box(0.08, -0.3, 0, 0.02, 1.0, 0.02, 0x8a6a40); for (let i = 0; i < 6; i++) b.box(0, -0.25 + i * 0.17, 0, 0.16, 0.015, 0.015, 0x8a6a40); });
  // last (bärs på axeln)
  g.load = mk(b => b.box(0, 0, 0, 0.16, 0.12, 0.2, 0xffffff));
  g.logLoad = mk(b => { b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), 0xffffff, 0, 0, 0, Math.PI / 2, 0, 0); b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.38, 6), 0xffffff, 0.07, 0.04, 0, Math.PI / 2, 0, 0); });
  // troll
  g.trollBody = mk(b => { b.sphere(0, 0.42, 0, 0.32, 0xffffff, 1, 1, 1.1, 0.85); b.sphere(0, 0.7, 0.08, 0.2, 0xffffff, 0); });
  g.trollHead = mk(b => { b.sphere(0, 0, 0, 0.16, 0xffffff, 0, 1, 0.9, 1); b.cone(0, -0.01, 0.17, 0.05, 0.12, 0xffffff, 5); b.add(new THREE.ConeGeometry(0.04, 0.12, 5), 0xffffff, 0, 0, 0.18, Math.PI / 2, 0, 0); });
  g.trollLeg = mk(b => b.box(0, -0.18, 0, 0.12, 0.2, 0.14, 0xffffff));
  g.trollArm = mk(b => { b.box(0, -0.25, 0, 0.1, 0.32, 0.1, 0xffffff); });
  // murbräcka
  g.ram = mk(b => {
    b.box(0, 0.12, 0, 0.6, 0.06, 1.2, 0x5a3a22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 8), 0x3a2a1a, sx * 0.33, 0.14, sz * 0.42, 0, 0, Math.PI / 2);
    b.roof(0, 0.18, 0, 1.2, 0.8, 0.5, 0x6a4a2a, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 7), 0x7a5130, 0, 0.35, 0.15, Math.PI / 2, 0, 0);
    b.add(new THREE.ConeGeometry(0.1, 0.2, 7), 0x50555c, 0, 0.35, 0.95, Math.PI / 2, 0, 0);
  });
  // hjort
  g.deerBody = mk(b => {
    b.box(0, 0.32, 0, 0.16, 0.16, 0.42, 0xffffff);
    b.box(0, 0.42, 0.24, 0.07, 0.2, 0.08, 0xffffff, 0, -0.5);
    b.box(0, 0.55, 0.3, 0.08, 0.08, 0.15, 0xffffff);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.06, 0, sz * 0.15, 0.035, 0.26, 0.035, 0xffffff);
    b.box(0, 0.36, -0.22, 0.04, 0.06, 0.04, 0xffffff);
  });
  g.antlers = mk(b => { for (const sx of [-1, 1]) { b.box(sx * 0.05, 0.6, 0.28, 0.015, 0.16, 0.015, 0xd8c8a8, 0, 0, sx * 0.5); b.box(sx * 0.1, 0.68, 0.28, 0.015, 0.1, 0.015, 0xd8c8a8, 0, 0.4, -sx * 0.3); } });
  return g;
}

/* ---------- Skepp ---------- */
export function longshipGeo(color = 0x8a1a12) {
  const b = new GB();
  // skrov – sektioner som smalnar mot stäv
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = (i - (segs - 1) / 2) / ((segs - 1) / 2);
    const w = 0.9 * (1 - t * t * 0.7);
    b.box(0, 0, t * 2.0, w, 0.35, 0.62, 0x5a3a22);
    b.box(0, 0.35, t * 2.0, w + 0.06, 0.06, 0.62, 0x3a2414);
  }
  for (const s of [-1, 1]) {
    b.box(0, 0.2, s * 2.35, 0.12, 0.5, 0.25, 0x3a2414, 0, s * 0.5);
    b.box(0, 0.65, s * 2.55, 0.09, 0.35, 0.09, 0x3a2414, 0, s * 0.3);
    b.box(0, 0.86, s * 2.62, 0.07, 0.08, 0.16, 0x3a2414);
  }
  // sköldar längs relingen
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
    const z = -1.5 + i * 0.6;
    b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 8), i % 2 ? color : 0xd8c8a0, sx * (0.46 - Math.abs(z) * 0.08), 0.42, z, 0, 0, Math.PI / 2);
  }
  // mast och segel
  b.cyl(0, 0.35, 0, 0.04, 0.05, 2.2, 0x5a3a22, 6);
  b.box(0, 1.2, 0, 1.6, 1.1, 0.03, 0xd8c8a0);
  for (let i = 0; i < 4; i++) b.box(-0.6 + i * 0.4, 1.2, 0.02, 0.2, 1.1, 0.03, color);
  b.box(0, 2.3, 0, 1.7, 0.05, 0.05, 0x5a3a22);
  return b.build().main;
}
export function boatGeo() {
  const b = new GB();
  b.box(0, 0, 0, 0.45, 0.2, 1.0, 0x7a5130); b.box(0, 0.2, 0, 0.5, 0.04, 1.0, 0x4a3020);
  b.box(0, 0.1, 0.55, 0.15, 0.2, 0.15, 0x4a3020, 0, 0.6);
  b.cyl(0, 0.2, -0.1, 0.02, 0.02, 0.9, 0x5a3a22, 5);
  b.box(0, 0.5, -0.1, 0.5, 0.45, 0.02, 0xe0d4b8);
  return b.build().main;
}
export function cloudGeo() {
  const b = new GB();
  b.sphere(0, 0, 0, 2.2, 0xffffff, 1, 1.4, 0.6, 1); b.sphere(1.8, -0.2, 0.4, 1.6, 0xffffff, 1, 1.2, 0.6, 1); b.sphere(-1.9, -0.3, -0.2, 1.5, 0xffffff, 1, 1.3, 0.55, 1); b.sphere(0.4, 0.6, -0.5, 1.3, 0xffffff, 0);
  return b.build().main;
}
export function birdGeo() {
  const g = new THREE.BufferGeometry();
  const v = [0, 0, 0.12, -0.35, 0.05, -0.05, 0, 0, -0.08, 0, 0, 0.12, 0, 0, -0.08, 0.35, 0.05, -0.05];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
