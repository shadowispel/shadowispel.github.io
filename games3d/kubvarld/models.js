/** Lådmodeller (spelare, djur, varelser) och föremålsgeometrier. */
import * as THREE from 'three';
import { BLOCKS, T_FACE, M_CUBE, M_BOX, itemTile } from './blocks.js';
import { mulberry } from './noise.js';

const tmpC = new THREE.Color();
/** Låda med per-yta-färg (lätt brus) – pivot i (px,py,pz) relativt lådans centrum */
export function boxGeo(w, h, d, color, { pivot = [0, 0, 0], faces = null, noise = 0.06, seed = 1 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(-pivot[0], -pivot[1], -pivot[2]);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const r = mulberry(seed * 7919 + Math.round(w * 100 + h * 10 + d));
  const shadeF = [0.86, 0.86, 1.0, 0.6, 0.94, 0.78];
  for (let f = 0; f < 6; f++) {
    const c = faces && faces[f] != null ? faces[f] : color;
    tmpC.set(c);
    const s = shadeF[f] * (1 + (r() - 0.5) * noise);
    for (let v = 0; v < 4; v++) { const i = (f * 4 + v) * 3; col[i] = tmpC.r * s; col[i + 1] = tmpC.g * s; col[i + 2] = tmpC.b * s; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Skapar en del (Object3D) med mesh förskjuten så att gruppens origo är leden. */
function part(mat, w, h, d, color, pos, opts = {}) {
  const grp = new THREE.Group();
  grp.position.set(pos[0], pos[1], pos[2]);
  const m = new THREE.Mesh(boxGeo(w, h, d, color, opts), opts.mat || mat);
  grp.add(m);
  return grp;
}
function add(parent, mat, w, h, d, color, pos, opts) { const p = part(mat, w, h, d, color, pos, opts); parent.add(p); return p; }

export const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x7ff6ff });
export const AMBER_MAT = new THREE.MeshBasicMaterial({ color: 0xffb030 });
export const BLACK_MAT = new THREE.MeshBasicMaterial({ color: 0x111111 });
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xffd27a });
const GHOST_MAT = new THREE.MeshLambertMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.55, vertexColors: true, depthWrite: false });

/**
 * Bygger en modell. Returnerar { root, mat, parts:{...}, height, width }
 * mat: MeshLambertMaterial (vertexColors) som tonas efter ljus.
 */
export function buildModel(type) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const P = {};
  if (type === 'player') {
    // Vandraren: stickad tröja, mössa
    P.legL = add(body, mat, 0.24, 0.72, 0.24, '#3a3c4c', [-0.13, 0.72, 0], { pivot: [0, 0.36, 0], faces: [null, null, null, '#5a3a22', null, null] });
    P.legR = add(body, mat, 0.24, 0.72, 0.24, '#3a3c4c', [0.13, 0.72, 0], { pivot: [0, 0.36, 0], faces: [null, null, null, '#5a3a22', null, null] });
    add(P.legL, mat, 0.25, 0.16, 0.26, '#5a3a22', [0, -0.64, 0.01]);
    add(P.legR, mat, 0.25, 0.16, 0.26, '#5a3a22', [0, -0.64, 0.01]);
    P.torso = add(body, mat, 0.5, 0.7, 0.26, '#2d4f8e', [0, 1.07, 0]);
    add(P.torso, mat, 0.51, 0.1, 0.27, '#e8e4da', [0, 0.18, 0]);
    add(P.torso, mat, 0.51, 0.06, 0.27, '#b8302e', [0, 0.1, 0]);
    P.armL = add(body, mat, 0.22, 0.7, 0.22, '#2d4f8e', [-0.36, 1.38, 0], { pivot: [0, 0.3, 0] });
    P.armR = add(body, mat, 0.22, 0.7, 0.22, '#2d4f8e', [0.36, 1.38, 0], { pivot: [0, 0.3, 0] });
    add(P.armL, mat, 0.25, 0.18, 0.25, '#b8302e', [0, -0.6, 0]);
    add(P.armR, mat, 0.25, 0.18, 0.25, '#b8302e', [0, -0.6, 0]);
    P.head = add(body, mat, 0.46, 0.46, 0.46, '#e0b090', [0, 1.42, 0], { pivot: [0, -0.23, 0] });
    add(P.head, mat, 0.5, 0.2, 0.5, '#b8302e', [0, 0.43, 0]);
    add(P.head, mat, 0.51, 0.05, 0.51, '#e8e4da', [0, 0.35, 0]);
    add(P.head, mat, 0.14, 0.12, 0.14, '#e8e4da', [0, 0.58, 0]);
    add(P.head, null, 0.07, 0.07, 0.02, '#222', [-0.1, 0.25, 0.235], { mat: BLACK_MAT });
    add(P.head, null, 0.07, 0.07, 0.02, '#222', [0.1, 0.25, 0.235], { mat: BLACK_MAT });
    add(P.head, mat, 0.2, 0.05, 0.02, '#a06850', [0, 0.1, 0.235]);
    // egen vandrare: ljus lugg under mössan, rosiga kinder och flätor
    add(P.head, mat, 0.48, 0.08, 0.06, '#e2c06a', [0, 0.32, 0.215]);
    add(P.head, mat, 0.08, 0.06, 0.02, '#e8907e', [-0.17, 0.15, 0.236]);
    add(P.head, mat, 0.08, 0.06, 0.02, '#e8907e', [0.17, 0.15, 0.236]);
    add(P.head, mat, 0.1, 0.34, 0.1, '#e2c06a', [-0.26, 0.05, -0.05]);
    add(P.head, mat, 0.1, 0.34, 0.1, '#e2c06a', [0.26, 0.05, -0.05]);
    return { root, mat, parts: P, height: 1.8, width: 0.6 };
  }
  if (type === 'sheep') { // tovfår
    P.body = add(body, mat, 0.9, 0.72, 1.15, '#e9e5da', [0, 0.85, 0]);
    add(P.body, mat, 0.96, 0.18, 0.9, '#f2efe6', [0, 0.36, 0]);
    P.head = add(body, mat, 0.42, 0.42, 0.46, '#3b3330', [0, 1.05, 0.66], { pivot: [0, 0, -0.18] });
    add(P.head, mat, 0.44, 0.16, 0.3, '#e9e5da', [0, 0.25, -0.08]);
    add(P.head, mat, 0.14, 0.08, 0.2, '#3b3330', [-0.27, 0.08, -0.08]);
    add(P.head, mat, 0.14, 0.08, 0.2, '#3b3330', [0.27, 0.08, -0.08]);
    add(P.head, null, 0.06, 0.06, 0.02, '#fff', [-0.12, 0.07, 0.235], { mat: BLACK_MAT });
    add(P.head, null, 0.06, 0.06, 0.02, '#fff', [0.12, 0.07, 0.235], { mat: BLACK_MAT });
    legs4(P, body, mat, 0.18, 0.5, '#3b3330', 0.27, 0.4, 0.5);
    return { root, mat, parts: P, height: 1.3, width: 0.9 };
  }
  if (type === 'hare') { // fjällhare
    P.body = add(body, mat, 0.34, 0.32, 0.55, '#cfc8ba', [0, 0.3, 0], { faces: [null, null, '#b8ab96', '#f0ece4', null, null] });
    P.head = add(body, mat, 0.26, 0.26, 0.3, '#cfc8ba', [0, 0.48, 0.3], { pivot: [0, 0, -0.1] });
    P.earL = add(P.head, mat, 0.07, 0.3, 0.05, '#d8d2c6', [-0.07, 0.25, -0.05], { pivot: [0, -0.15, 0], faces: [null, null, '#222', null, null, null] });
    P.earR = add(P.head, mat, 0.07, 0.3, 0.05, '#d8d2c6', [0.07, 0.25, -0.05], { pivot: [0, -0.15, 0], faces: [null, null, '#222', null, null, null] });
    add(P.head, null, 0.04, 0.05, 0.02, '#000', [-0.09, 0.04, 0.15], { mat: BLACK_MAT });
    add(P.head, null, 0.04, 0.05, 0.02, '#000', [0.09, 0.04, 0.15], { mat: BLACK_MAT });
    add(P.body, mat, 0.12, 0.12, 0.1, '#ffffff', [0, 0.06, -0.31]);
    legs4(P, body, mat, 0.09, 0.16, '#bfb6a6', 0.11, 0.18, 0.16);
    return { root, mat, parts: P, height: 0.6, width: 0.4 };
  }
  if (type === 'moose') { // älg
    P.body = add(body, mat, 0.9, 0.95, 1.8, '#4a3424', [0, 1.65, 0]);
    add(P.body, mat, 0.8, 0.3, 0.7, '#3e2b1d', [0, 0.55, 0.45]);
    P.neck = add(body, mat, 0.45, 0.6, 0.5, '#4a3424', [0, 2.0, 0.95], { pivot: [0, -0.2, -0.1] });
    P.head = add(P.neck, mat, 0.4, 0.42, 0.8, '#4a3424', [0, 0.15, 0.45], { pivot: [0, 0, -0.3], faces: [null, null, null, null, '#2a1d14', null] });
    add(P.head, mat, 0.36, 0.3, 0.3, '#2e2018', [0, -0.08, 0.4]);
    add(P.head, mat, 0.12, 0.35, 0.12, '#3e2b1d', [0, -0.35, 0.05]);
    for (const s of [-1, 1]) {
      const ant = add(P.head, mat, 0.6, 0.07, 0.36, '#d6c49c', [s * 0.48, 0.38, -0.1]);
      ant.rotation.z = s * 0.35;
      add(ant, mat, 0.07, 0.18, 0.07, '#e2d2ac', [s * 0.25, 0.12, 0.12]);
      add(ant, mat, 0.07, 0.18, 0.07, '#e2d2ac', [s * 0.12, 0.12, -0.14]);
      add(ant, mat, 0.07, 0.2, 0.07, '#e2d2ac', [s * 0.3, 0.12, -0.1]);
      add(P.head, null, 0.06, 0.06, 0.02, '#000', [s * 0.2, 0.08, 0.1], { mat: BLACK_MAT });
    }
    legs4(P, body, mat, 0.2, 1.25, '#8a7a66', 0.3, 0.7, 1.25);
    return { root, mat, parts: P, height: 2.4, width: 1.2 };
  }
  if (type === 'wolf') { // skuggvarg
    P.body = add(body, mat, 0.5, 0.5, 1.1, '#2a2238', [0, 0.72, 0]);
    for (let i = 0; i < 4; i++) add(P.body, mat, 0.12, 0.14, 0.12, '#4a3a6a', [0, 0.28, 0.35 - i * 0.24]);
    P.head = add(body, mat, 0.44, 0.4, 0.42, '#2a2238', [0, 0.92, 0.66], { pivot: [0, 0, -0.15] });
    add(P.head, mat, 0.26, 0.2, 0.3, '#1e1828', [0, -0.08, 0.32]);
    add(P.head, mat, 0.1, 0.16, 0.08, '#2a2238', [-0.14, 0.27, -0.05]);
    add(P.head, mat, 0.1, 0.16, 0.08, '#2a2238', [0.14, 0.27, -0.05]);
    add(P.head, null, 0.09, 0.06, 0.02, '#7ff6ff', [-0.12, 0.06, 0.215], { mat: EYE_MAT });
    add(P.head, null, 0.09, 0.06, 0.02, '#7ff6ff', [0.12, 0.06, 0.215], { mat: EYE_MAT });
    P.tail = add(body, mat, 0.14, 0.14, 0.55, '#3a2e50', [0, 0.85, -0.55], { pivot: [0, 0, 0.27] });
    P.tail.rotation.x = 0.5;
    legs4(P, body, mat, 0.15, 0.48, '#1e1828', 0.16, 0.36, 0.48);
    return { root, mat, parts: P, height: 0.95, width: 0.7 };
  }
  if (type === 'giant') { // mossbjässe
    P.legL = add(body, mat, 0.45, 0.85, 0.45, '#5f635f', [-0.35, 0.85, 0], { pivot: [0, 0.42, 0] });
    P.legR = add(body, mat, 0.45, 0.85, 0.45, '#5f635f', [0.35, 0.85, 0], { pivot: [0, 0.42, 0] });
    P.torso = add(body, mat, 1.3, 1.2, 0.85, '#6f736f', [0, 1.45, 0]);
    add(P.torso, mat, 1.36, 0.3, 0.9, '#4f7a34', [0, 0.5, 0]);
    add(P.torso, mat, 0.5, 0.2, 0.5, '#5e8a3a', [-0.35, 0.68, 0.1]);
    add(P.torso, mat, 0.3, 0.3, 0.1, '#55594f', [0.2, -0.1, 0.45]);
    P.head = add(body, mat, 0.66, 0.6, 0.6, '#6a6e6a', [0, 2.35, 0.12], { pivot: [0, -0.3, 0] });
    add(P.head, mat, 0.7, 0.14, 0.2, '#4f7a34', [0, 0.25, 0.22]);
    add(P.head, null, 0.13, 0.1, 0.02, '#ffb030', [-0.16, 0.05, 0.31], { mat: AMBER_MAT });
    add(P.head, null, 0.13, 0.1, 0.02, '#ffb030', [0.16, 0.05, 0.31], { mat: AMBER_MAT });
    add(P.head, mat, 0.4, 0.12, 0.1, '#3e423e', [0, -0.15, 0.32]);
    P.armL = add(body, mat, 0.4, 1.4, 0.4, '#666a66', [-0.88, 1.95, 0], { pivot: [0, 0.6, 0], faces: [null, null, '#4f7a34', null, null, null] });
    P.armR = add(body, mat, 0.4, 1.4, 0.4, '#666a66', [0.88, 1.95, 0], { pivot: [0, 0.6, 0], faces: [null, null, '#4f7a34', null, null, null] });
    add(P.armL, mat, 0.46, 0.4, 0.46, '#5a5e5a', [0, -1.25, 0]);
    add(P.armR, mat, 0.46, 0.4, 0.46, '#5a5e5a', [0, -1.25, 0]);
    return { root, mat, parts: P, height: 2.7, width: 1.4 };
  }
  if (type === 'ghost') { // lyktgast
    const gm = GHOST_MAT.clone();
    P.shell = add(body, gm, 0.75, 0.8, 0.75, '#cfe6ff', [0, 1.1, 0], { mat: gm });
    add(P.shell, gm, 0.55, 0.3, 0.55, '#dceeff', [0, 0.5, 0], { mat: gm });
    P.core = add(P.shell, null, 0.32, 0.32, 0.32, '#ffd27a', [0, -0.05, 0], { mat: GLOW_MAT });
    add(P.shell, null, 0.1, 0.12, 0.02, '#000', [-0.16, 0.18, 0.38], { mat: BLACK_MAT });
    add(P.shell, null, 0.1, 0.12, 0.02, '#000', [0.16, 0.18, 0.38], { mat: BLACK_MAT });
    P.t1 = add(body, gm, 0.55, 0.3, 0.55, '#cfe6ff', [0, 0.6, 0], { mat: gm });
    P.t2 = add(P.t1, gm, 0.35, 0.25, 0.35, '#cfe6ff', [0, -0.27, 0], { mat: gm });
    P.t3 = add(P.t2, gm, 0.18, 0.2, 0.18, '#cfe6ff', [0, -0.22, 0], { mat: gm });
    return { root, mat: gm, parts: P, height: 1.6, width: 0.8, ghost: true };
  }
  return { root, mat, parts: P, height: 1, width: 1 };
}
function legs4(P, body, mat, w, h, color, sx, fz, y) {
  P.legs = [];
  for (const [x, z] of [[-sx, fz], [sx, fz], [-sx, -fz], [sx, -fz]]) P.legs.push(add(body, mat, w, h, w, color, [x, y, z], { pivot: [0, h / 2, 0] }));
}

/* ---------- föremålsgeometrier ---------- */
const extrudeCache = new Map();
/** Extruderad pixelikon (verktyg, föremål) – centrerad, 1 enhet bred */
export function extrudedGeo(atlas, id) {
  if (extrudeCache.has(id)) return extrudeCache.get(id);
  const tile = itemTile(id);
  const px = atlas.pix[tile];
  const pos = [], col = [], nor = [];
  const s = 1 / 16, t = 1 / 16;
  const A = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15) ? 0 : px[(y * 16 + x) * 4 + 3] > 100;
  const quad = (a, b, c, d, n, r, g, bl) => { for (const v of [a, b, c, a, c, d]) { pos.push(...v); nor.push(...n); col.push(r, g, bl); } };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!A(x, y)) continue;
    const o = (y * 16 + x) * 4;
    const c = new THREE.Color().setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
    const x0 = x * s - 0.5, x1 = x0 + s, y1 = 0.5 - y * s, y0 = y1 - s, z0 = -t / 2, z1 = t / 2;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c.r, c.g, c.b);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c.r * 0.8, c.g * 0.8, c.b * 0.8);
    if (!A(x - 1, y)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c.r * 0.7, c.g * 0.7, c.b * 0.7);
    if (!A(x + 1, y)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c.r * 0.7, c.g * 0.7, c.b * 0.7);
    if (!A(x, y - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c.r * 0.9, c.g * 0.9, c.b * 0.9);
    if (!A(x, y + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c.r * 0.6, c.g * 0.6, c.b * 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  extrudeCache.set(id, g);
  return g;
}

const blockGeoCache = new Map();
/** Blockkub i terrängformat (för terrängshaderns ENTITY-variant). Storlek 1, centrerad. */
export function blockGeo(id) {
  if (blockGeoCache.has(id)) return blockGeoCache.get(id);
  const d = BLOCKS[id];
  const boxes = d.model === M_BOX && d.boxes ? d.boxes : [[0, 0, 0, 16, 16, 16]];
  const pos = [], uv = [], dat = [], lit = [];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 1],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 2],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 3],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 4],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 5]
    ];
    for (const [a, b, c, e, f] of faces) {
      const layer = T_FACE[id * 6 + f];
      const vs = [a, b, c, a, c, e];
      for (const v of vs) {
        pos.push(v[0] - 8, v[1] - 8, v[2] - 8);
        let tu, tv;
        if (f < 2) { tu = f === 0 ? 16 - v[2] : v[2]; tv = 16 - v[1]; }
        else if (f < 4) { tu = v[0]; tv = v[2]; }
        else { tu = f === 4 ? v[0] : 16 - v[0]; tv = 16 - v[1]; }
        uv.push(tu, tv); dat.push(layer, f, 0, 0); lit.push(255, 0, 255, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Int16Array(pos), 3));
  g.setAttribute('aUV', new THREE.BufferAttribute(new Uint16Array(uv), 2));
  g.setAttribute('aData', new THREE.BufferAttribute(new Uint8Array(dat), 4));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Uint8Array(lit), 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  blockGeoCache.set(id, g);
  return g;
}
export function isCubeItem(id) { const d = id < 256 ? BLOCKS[id] : null; return !!(d && (d.model === M_CUBE || (d.model === M_BOX && d.boxes && d.boxes.length <= 2 && !d.door && !d.bed && d.light === 0))); }
