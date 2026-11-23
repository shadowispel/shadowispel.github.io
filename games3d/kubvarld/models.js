/** Lådmodeller (spelare, djur, varelser) och föremålsgeometrier. */
import * as THREE from 'three';
import { BLOCKS, T_FACE, M_CUBE, M_BOX, itemTile, isBlock } from './blocks.js';
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

export const AMBER_MAT = new THREE.MeshBasicMaterial({ color: 0xffa424 });
export const BLACK_MAT = new THREE.MeshBasicMaterial({ color: 0x111111 });
const ZOMBIE_EYE = new THREE.MeshBasicMaterial({ color: 0xe8e070 });
const SKEL_EYE = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
export const EMBER_MAT = new THREE.MeshBasicMaterial({ color: 0xff7a24 });
export const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xffd060 });
const LAVA_MAT = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
/** Bybornas yrken: tröja, förkläde/detalj och huvudbonad */
export const PROFS = {
  bonde: { name: 'Bonde', def: 'bonden', shirt: '#6a8a3a', apron: '#c8b47a', hat: 'straw' },
  smed: { name: 'Smed', def: 'smeden', shirt: '#5a4a3e', apron: '#2e2a28', hat: 'none' },
  bibliotekarie: { name: 'Bibliotekarie', def: 'bibliotekarien', shirt: '#3a4e8a', apron: '#d8d0c0', hat: 'glasses' },
  fiskare: { name: 'Fiskare', def: 'fiskaren', shirt: '#3a6a7a', apron: '#e8c030', hat: 'sou' },
  kartograf: { name: 'Kartograf', def: 'kartografen', shirt: '#7a2e3a', apron: '#c8a060', hat: 'cap' }
};

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
    // rustning (dold tills den bärs): egen färg per del via eget material
    const am = [0, 1, 2, 3].map(() => new THREE.MeshLambertMaterial({ vertexColors: true }));
    const W = '#ffffff', A = (par, i, w, h, d, pos) => add(par, am[i], w, h, d, W, pos, { mat: am[i] });
    P.armor = [
      [A(P.head, 0, 0.54, 0.16, 0.54, [0, 0.45, 0]), A(P.head, 0, 0.05, 0.26, 0.52, [-0.27, 0.27, -0.01]), A(P.head, 0, 0.05, 0.26, 0.52, [0.27, 0.27, -0.01]), A(P.head, 0, 0.54, 0.3, 0.05, [0, 0.26, -0.26])],
      [A(P.torso, 1, 0.56, 0.6, 0.32, [0, 0.03, 0]), A(P.armL, 1, 0.28, 0.24, 0.28, [0, -0.06, 0]), A(P.armR, 1, 0.28, 0.24, 0.28, [0, -0.06, 0])],
      [A(P.torso, 2, 0.55, 0.12, 0.31, [0, -0.3, 0]), A(P.legL, 2, 0.28, 0.46, 0.28, [0, -0.22, 0]), A(P.legR, 2, 0.28, 0.46, 0.28, [0, -0.22, 0])],
      [A(P.legL, 3, 0.29, 0.2, 0.3, [0, -0.63, 0.01]), A(P.legR, 3, 0.29, 0.2, 0.3, [0, -0.63, 0.01])]
    ];
    for (const list of P.armor) for (const g of list) g.visible = false;
    return { root, mat, parts: P, height: 1.8, width: 0.6, armorMats: am };
  }
  if (type === 'cow') { // ko: rödbrun lantras med ljus mule, bläs och koskälla
    const R = '#9a4a2e', R2 = '#84391f', Lt = '#ead8c4';
    legs4(P, body, mat, 0.2, 0.6, '#8a4028', 0.28, 0.48, 0.6);
    for (const l of P.legs) { add(l, mat, 0.21, 0.12, 0.21, '#3a2a22', [0, -0.54, 0]); add(l, mat, 0.205, 0.16, 0.205, Lt, [0, -0.4, 0]); }
    P.body = add(body, mat, 0.86, 0.74, 1.36, R, [0, 0.98, 0], { faces: [null, null, null, Lt, null, null] });
    add(P.body, mat, 0.5, 0.05, 1.24, R2, [0, 0.38, 0]);
    add(P.body, mat, 0.88, 0.3, 0.34, '#f0e4d2', [0, -0.1, 0.42]); // ljus bringa-fläck
    add(P.body, mat, 0.3, 0.14, 0.28, '#eaa6a0', [0, -0.42, -0.36]); // juver
    add(body, mat, 0.5, 0.07, 0.1, '#5a3a22', [0, 1.06, 0.66]); // halsrem
    add(body, mat, 0.14, 0.15, 0.12, '#d8b040', [0, 0.95, 0.73], { faces: [null, null, null, '#3a3020', null, null] }); // skälla
    P.head = add(body, mat, 0.46, 0.44, 0.46, R, [0, 1.22, 0.68], { pivot: [0, 0, -0.2] });
    add(P.head, mat, 0.4, 0.24, 0.18, '#e2b8a0', [0, -0.11, 0.48]);
    add(P.head, null, 0.06, 0.05, 0.02, '#000', [-0.09, -0.08, 0.575], { mat: BLACK_MAT });
    add(P.head, null, 0.06, 0.05, 0.02, '#000', [0.09, -0.08, 0.575], { mat: BLACK_MAT });
    add(P.head, mat, 0.12, 0.2, 0.02, '#f0e6d6', [0, 0.08, 0.435]); // bläs
    add(P.head, null, 0.06, 0.07, 0.02, '#000', [-0.16, 0.08, 0.435], { mat: BLACK_MAT });
    add(P.head, null, 0.06, 0.07, 0.02, '#000', [0.16, 0.08, 0.435], { mat: BLACK_MAT });
    add(P.head, mat, 0.22, 0.08, 0.12, '#b8664a', [0, 0.25, 0.3]); // lugg
    for (const s of [-1, 1]) { const ear = add(P.head, mat, 0.2, 0.08, 0.12, R2, [s * 0.31, 0.1, 0.16]); ear.rotation.z = s * -0.3; add(ear, mat, 0.12, 0.02, 0.08, '#e8a090', [s * 0.02, -0.04, 0.01]); }
    P.tail = add(body, mat, 0.07, 0.55, 0.07, R2, [0, 1.3, -0.69], { pivot: [0, 0.27, 0] });
    add(P.tail, mat, 0.13, 0.14, 0.13, '#3a2018', [0, -0.55, 0]);
    return { root, mat, parts: P, height: 1.45, width: 0.9 };
  }
  if (type === 'pig') { // gris: ljusrosa med mörka sadelfläckar, borstrygg, hängöron och knorr
    const C = '#e6b2a2';
    legs4(P, body, mat, 0.16, 0.32, '#d89a8a', 0.22, 0.34, 0.32);
    for (const l of P.legs) add(l, mat, 0.17, 0.07, 0.17, '#6a4a40', [0, -0.29, 0]);
    P.body = add(body, mat, 0.7, 0.58, 1.04, C, [0, 0.61, 0]);
    add(P.body, mat, 0.72, 0.24, 0.3, '#5c4040', [0, 0.06, -0.18]);
    add(P.body, mat, 0.3, 0.2, 0.22, '#5c4040', [0.21, 0.12, 0.28]);
    add(P.body, mat, 0.12, 0.06, 0.86, '#c88a7a', [0, 0.31, 0]);
    P.head = add(body, mat, 0.48, 0.42, 0.36, C, [0, 0.72, 0.48], { pivot: [0, 0, -0.17] });
    add(P.head, mat, 0.26, 0.2, 0.12, '#f0a4a0', [0, -0.07, 0.4]);
    add(P.head, null, 0.05, 0.07, 0.02, '#000', [-0.06, -0.07, 0.465], { mat: BLACK_MAT });
    add(P.head, null, 0.05, 0.07, 0.02, '#000', [0.06, -0.07, 0.465], { mat: BLACK_MAT });
    add(P.head, null, 0.05, 0.05, 0.02, '#000', [-0.13, 0.07, 0.355], { mat: BLACK_MAT });
    add(P.head, null, 0.05, 0.05, 0.02, '#000', [0.13, 0.07, 0.355], { mat: BLACK_MAT });
    for (const s of [-1, 1]) { const ear = add(P.head, mat, 0.17, 0.05, 0.2, '#d48c7c', [s * 0.15, 0.22, 0.3]); ear.rotation.x = 0.55; ear.rotation.z = s * -0.15; }
    P.tail = add(body, mat, 0.06, 0.06, 0.12, '#e0a090', [0, 0.8, -0.56]);
    add(P.tail, mat, 0.06, 0.12, 0.06, '#e0a090', [0, 0.06, -0.06]);
    add(P.tail, mat, 0.08, 0.06, 0.06, '#e0a090', [0.04, 0.12, -0.02]);
    return { root, mat, parts: P, height: 0.95, width: 0.75 };
  }
  if (type === 'sheep') { // får: gräddvit tovig ull, mörkbrunt ansikte och små krökta horn
    const W = '#ece6d6';
    P.body = add(body, mat, 0.9, 0.72, 1.15, W, [0, 0.85, 0]);
    add(P.body, mat, 0.96, 0.18, 0.9, '#f4f0e6', [0, 0.36, 0]);
    P.skin = add(body, mat, 0.66, 0.54, 0.98, '#d8c4a8', [0, 0.85, 0]); P.skin.visible = false; // klippt får
    P.wool = [P.body];
    for (const [x, y, z] of [[-0.42, 0.1, 0.3], [0.43, -0.05, -0.2], [0.2, 0.37, -0.35], [-0.25, 0.37, 0.15], [0, -0.3, 0.5]]) add(P.body, mat, 0.2, 0.18, 0.2, '#e2dac6', [x, y, z]);
    P.head = add(body, mat, 0.4, 0.4, 0.44, '#3b3330', [0, 1.05, 0.66], { pivot: [0, 0, -0.18] });
    add(P.head, mat, 0.44, 0.16, 0.3, W, [0, 0.24, -0.06]);
    for (const s of [-1, 1]) {
      add(P.head, mat, 0.14, 0.07, 0.18, '#3b3330', [s * 0.26, 0.08, -0.06]);
      const horn = add(P.head, mat, 0.08, 0.18, 0.08, '#cdbf9a', [s * 0.2, 0.24, -0.02]); horn.rotation.x = -0.6;
      add(horn, mat, 0.08, 0.08, 0.12, '#bfae86', [0, 0.1, -0.06]);
    }
    add(P.head, null, 0.06, 0.06, 0.02, '#fff', [-0.12, 0.07, 0.225], { mat: BLACK_MAT });
    add(P.head, null, 0.06, 0.06, 0.02, '#fff', [0.12, 0.07, 0.225], { mat: BLACK_MAT });
    add(P.head, mat, 0.16, 0.08, 0.02, '#5a4a44', [0, -0.1, 0.225]);
    legs4(P, body, mat, 0.17, 0.5, '#3b3330', 0.27, 0.4, 0.5);
    return { root, mat, parts: P, height: 1.25, width: 0.9 };
  }
  if (type === 'chicken') { // höna: spräcklig brun "blommehöna" med mörk stjärt och röd kam
    const Br = '#a8673a';
    for (const s of [-1, 1]) {
      const leg = add(body, mat, 0.05, 0.22, 0.05, '#c8a040', [s * 0.08, 0.22, 0], { pivot: [0, 0.11, 0] });
      add(leg, mat, 0.12, 0.03, 0.14, '#c8a040', [0, -0.21, 0.03]);
      if (s < 0) P.legL = leg; else P.legR = leg;
    }
    P.body = add(body, mat, 0.36, 0.34, 0.46, Br, [0, 0.4, 0]);
    add(P.body, mat, 0.3, 0.22, 0.06, '#c88a50', [0, -0.02, 0.23]);
    for (const [x, y, z, c] of [[0.185, 0.05, 0.1, '#f0e8dc'], [-0.185, 0.0, -0.06, '#f0e8dc'], [0.185, -0.06, -0.12, '#2a2420'], [-0.185, 0.08, 0.12, '#2a2420'], [0.05, 0.175, -0.1, '#f0e8dc'], [-0.08, 0.175, 0.08, '#2a2420']]) add(P.body, mat, 0.02 + (Math.abs(x) < 0.1 ? 0.06 : 0), Math.abs(x) < 0.1 ? 0.02 : 0.06, 0.06, c, [x, y, z]);
    P.wingL = add(body, mat, 0.06, 0.22, 0.32, '#7a4a2a', [-0.2, 0.5, -0.02], { pivot: [0, 0.1, 0] });
    P.wingR = add(body, mat, 0.06, 0.22, 0.32, '#7a4a2a', [0.2, 0.5, -0.02], { pivot: [0, 0.1, 0] });
    const tail = add(P.body, mat, 0.16, 0.3, 0.1, '#1e2a24', [0, 0.22, -0.25]); tail.rotation.x = -0.45;
    add(tail, mat, 0.1, 0.12, 0.11, '#2e5a46', [0, 0.1, 0]);
    P.head = add(body, mat, 0.2, 0.24, 0.2, '#b87a44', [0, 0.62, 0.2], { pivot: [0, -0.08, -0.04] });
    add(P.head, mat, 0.05, 0.1, 0.14, '#d0302a', [0, 0.25, 0.04]);
    add(P.head, mat, 0.08, 0.05, 0.1, '#e8b030', [0, 0.1, 0.18]);
    add(P.head, mat, 0.05, 0.07, 0.04, '#d0302a', [0, 0.02, 0.15]);
    add(P.head, null, 0.02, 0.04, 0.04, '#000', [-0.1, 0.14, 0.08], { mat: BLACK_MAT });
    add(P.head, null, 0.02, 0.04, 0.04, '#000', [0.1, 0.14, 0.08], { mat: BLACK_MAT });
    return { root, mat, parts: P, height: 0.8, width: 0.45 };
  }
  if (type === 'zombie') { // zombie: blekgrön, framåtlutad vandrare i trasig ockrafärgad kolt
    const Sk = '#8fa284', Sk2 = '#7a9070', Tu = '#8a6a3a';
    P.legL = add(body, mat, 0.24, 0.78, 0.24, '#3c3f46', [-0.13, 0.78, 0], { pivot: [0, 0.39, 0] });
    P.legR = add(body, mat, 0.24, 0.78, 0.24, '#3c3f46', [0.13, 0.78, 0], { pivot: [0, 0.39, 0] });
    add(P.legL, mat, 0.25, 0.12, 0.27, Sk2, [0, -0.72, 0.01]);
    add(P.legR, mat, 0.25, 0.14, 0.27, Sk2, [0, -0.71, 0.01]);
    add(P.legR, mat, 0.26, 0.08, 0.26, '#55585f', [0, -0.5, 0]);
    P.torso = add(body, mat, 0.5, 0.68, 0.28, Tu, [0, 1.12, 0.04]); P.torso.rotation.x = 0.16;
    add(P.torso, mat, 0.52, 0.06, 0.3, '#5a4630', [0, -0.24, 0]);
    add(P.torso, mat, 0.14, 0.16, 0.02, Sk, [0.12, 0.08, 0.145]);
    for (const x of [-0.18, -0.02, 0.15]) add(P.torso, mat, 0.12, 0.1, 0.29, '#7a5c30', [x, -0.37, 0]);
    P.armL = add(body, mat, 0.2, 0.72, 0.2, Tu, [-0.36, 1.42, 0.06], { pivot: [0, 0.3, 0] });
    add(P.armL, mat, 0.21, 0.2, 0.21, Sk, [0, -0.6, 0]);
    P.armR = add(body, mat, 0.19, 0.72, 0.19, Sk, [0.36, 1.42, 0.06], { pivot: [0, 0.3, 0] });
    add(P.armR, mat, 0.2, 0.08, 0.2, '#d8d0b8', [0, -0.25, 0]);
    add(P.armR, mat, 0.2, 0.06, 0.2, '#d8d0b8', [0, -0.36, 0]);
    P.head = add(body, mat, 0.44, 0.44, 0.44, Sk, [0, 1.47, 0.12], { pivot: [0, -0.22, 0] });
    add(P.head, mat, 0.16, 0.12, 0.02, Sk2, [-0.1, 0.36, 0.225]);
    add(P.head, null, 0.11, 0.08, 0.02, '#000', [-0.1, 0.25, 0.225], { mat: BLACK_MAT });
    add(P.head, null, 0.11, 0.08, 0.02, '#000', [0.1, 0.25, 0.225], { mat: BLACK_MAT });
    add(P.head, null, 0.04, 0.04, 0.02, '#fff', [-0.09, 0.25, 0.232], { mat: ZOMBIE_EYE });
    add(P.head, null, 0.04, 0.04, 0.02, '#fff', [0.11, 0.25, 0.232], { mat: ZOMBIE_EYE });
    add(P.head, null, 0.2, 0.05, 0.02, '#000', [0.03, 0.1, 0.225], { mat: BLACK_MAT });
    add(P.head, null, 0.06, 0.03, 0.02, '#000', [-0.06, 0.08, 0.225], { mat: BLACK_MAT });
    add(P.head, mat, 0.36, 0.08, 0.32, '#4a4038', [-0.03, 0.46, -0.04]);
    add(P.head, mat, 0.1, 0.16, 0.1, '#4a4038', [0.17, 0.4, -0.15]);
    add(P.head, mat, 0.06, 0.12, 0.1, Sk2, [-0.25, 0.22, 0]);
    return { root, mat, parts: P, height: 1.85, width: 0.6 };
  }
  if (type === 'skeleton') { // skelett: gulnat ben med glesa revben, käke för sig, trasig mörk huva och båge
    const Bo = '#d8cfb4', Bo2 = '#c4ba9c', Cl = '#2e3a44';
    for (const s of [-1, 1]) {
      const leg = add(body, mat, 0.1, 0.78, 0.1, Bo, [s * 0.11, 0.78, 0], { pivot: [0, 0.39, 0] });
      add(leg, mat, 0.14, 0.08, 0.14, Bo2, [0, -0.38, 0]);
      add(leg, mat, 0.14, 0.06, 0.22, Bo2, [0, -0.75, 0.04]);
      if (s < 0) P.legL = leg; else P.legR = leg;
    }
    add(body, mat, 0.34, 0.12, 0.18, Bo2, [0, 0.82, 0]);
    add(body, mat, 0.08, 0.62, 0.08, Bo2, [0, 1.12, -0.06]);
    for (let i = 0; i < 4; i++) add(body, mat, 0.38 - i * 0.04, 0.05, 0.22, '#e2dac2', [0, 1.33 - i * 0.1, 0]);
    add(body, mat, 0.5, 0.07, 0.14, Bo, [0, 1.42, 0]);
    add(body, mat, 0.5, 0.5, 0.05, Cl, [0, 1.2, -0.13]);
    for (const [x, h] of [[-0.18, 0.16], [0.02, 0.24], [0.17, 0.12]]) add(body, mat, 0.13, h, 0.05, Cl, [x, 0.95 - h / 2 + 0.02, -0.13]);
    for (const s of [-1, 1]) {
      const arm = add(body, mat, 0.09, 0.72, 0.09, Bo, [s * 0.3, 1.42, 0], { pivot: [0, 0.32, 0] });
      add(arm, mat, 0.12, 0.12, 0.12, Bo2, [0, -0.66, 0]);
      if (s < 0) P.armL = arm; else P.armR = arm;
    }
    // båge i vänster hand (staven ligger tvärs armen så att den står upprätt när skelettet siktar)
    P.bow = add(P.armL, mat, 0.05, 0.05, 0.36, '#6a4a2a', [0, -0.68, 0.06]);
    add(P.bow, mat, 0.05, 0.05, 0.26, '#5a3a20', [0, 0.08, 0.28]).rotation.x = -0.5;
    add(P.bow, mat, 0.05, 0.05, 0.26, '#5a3a20', [0, 0.08, -0.28]).rotation.x = 0.5;
    add(P.bow, mat, 0.06, 0.06, 0.1, '#c8a070', [0, 0, 0]);
    add(P.bow, mat, 0.015, 0.015, 0.78, '#e8e8e0', [0, 0.17, 0]);
    P.head = add(body, mat, 0.4, 0.38, 0.4, '#e6dec6', [0, 1.46, 0], { pivot: [0, -0.19, 0] });
    add(P.head, null, 0.13, 0.12, 0.02, '#000', [-0.1, 0.22, 0.205], { mat: BLACK_MAT });
    add(P.head, null, 0.13, 0.12, 0.02, '#000', [0.1, 0.22, 0.205], { mat: BLACK_MAT });
    add(P.head, null, 0.03, 0.03, 0.02, '#fff', [-0.1, 0.21, 0.212], { mat: SKEL_EYE });
    add(P.head, null, 0.03, 0.03, 0.02, '#fff', [0.1, 0.21, 0.212], { mat: SKEL_EYE });
    add(P.head, null, 0.05, 0.06, 0.02, '#000', [0, 0.12, 0.205], { mat: BLACK_MAT });
    P.jaw = add(P.head, mat, 0.3, 0.1, 0.32, Bo, [0, 0.0, 0.03], { pivot: [0, 0, -0.12] });
    add(P.jaw, null, 0.22, 0.02, 0.02, '#000', [0, 0.04, 0.29], { mat: BLACK_MAT });
    add(P.head, mat, 0.46, 0.13, 0.46, Cl, [0, 0.42, -0.01]);
    add(P.head, mat, 0.46, 0.36, 0.08, Cl, [0, 0.24, -0.22]);
    add(P.head, mat, 0.06, 0.26, 0.3, Cl, [-0.23, 0.26, -0.06]);
    add(P.head, mat, 0.06, 0.26, 0.3, Cl, [0.23, 0.26, -0.06]);
    return { root, mat, parts: P, height: 1.85, width: 0.6 };
  }
  if (type === 'spider') { // spindel: korsspindel – rostbrun bakkropp med vitt kors, bandade ben och bärnstensögon
    const Dk = '#3a281c';
    P.body = add(body, mat, 0.5, 0.32, 0.5, '#4a3424', [0, 0.5, 0.22]);
    P.abd = add(body, mat, 0.78, 0.6, 0.8, '#8a5a2e', [0, 0.62, -0.42]);
    add(P.abd, mat, 0.12, 0.02, 0.52, '#f0e6d0', [0, 0.305, 0]);
    add(P.abd, mat, 0.42, 0.02, 0.12, '#f0e6d0', [0, 0.305, 0.08]);
    add(P.abd, mat, 0.8, 0.12, 0.16, '#5a3a1e', [0, 0.12, -0.24]);
    add(P.abd, mat, 0.8, 0.1, 0.12, '#5a3a1e', [0, -0.02, 0.1]);
    add(P.body, mat, 0.36, 0.24, 0.14, Dk, [0, 0.02, 0.3]);
    add(P.body, null, 0.09, 0.09, 0.02, '#fff', [-0.08, 0.08, 0.375], { mat: AMBER_MAT });
    add(P.body, null, 0.09, 0.09, 0.02, '#fff', [0.08, 0.08, 0.375], { mat: AMBER_MAT });
    for (const [x, y] of [[-0.15, 0.1], [0.15, 0.1], [-0.04, 0.16], [0.04, 0.16]]) add(P.body, null, 0.04, 0.04, 0.02, '#fff', [x, y, 0.375], { mat: AMBER_MAT });
    add(P.body, mat, 0.06, 0.12, 0.06, '#2a1c14', [-0.07, -0.12, 0.35]);
    add(P.body, mat, 0.06, 0.12, 0.06, '#2a1c14', [0.07, -0.12, 0.35]);
    P.slegs = [];
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const up = add(body, mat, 0.6, 0.07, 0.07, Dk, [s * 0.22, 0.52, 0.36 - i * 0.12], { pivot: [-s * 0.3, 0, 0] });
      const yaw = s * (0.75 - i * 0.5);
      up.rotation.order = 'YZX'; up.rotation.y = -yaw; up.rotation.z = s * 0.55;
      const lo = add(up, mat, 0.07, 0.8, 0.07, '#4a3424', [s * 0.6, 0, 0], { pivot: [0, 0.4, 0] });
      lo.rotation.z = -s * 0.8;
      add(lo, mat, 0.08, 0.08, 0.08, '#b08850', [0, -0.25, 0]);
      add(lo, mat, 0.08, 0.06, 0.08, '#b08850', [0, -0.5, 0]);
      P.slegs.push({ g: up, s, i, yaw: -yaw });
    }
    return { root, mat, parts: P, height: 0.95, width: 1.2 };
  }
  if (type.startsWith('villager')) { // bybo: rund mössa/hatt, rosiga kinder, skägg eller flätor och yrkesförkläde
    const pr = PROFS[type.split(':')[1]] || PROFS.bonde;
    const Sk = '#e4b896';
    P.legL = add(body, mat, 0.22, 0.6, 0.22, '#4a3a2e', [-0.12, 0.6, 0], { pivot: [0, 0.3, 0] });
    P.legR = add(body, mat, 0.22, 0.6, 0.22, '#4a3a2e', [0.12, 0.6, 0], { pivot: [0, 0.3, 0] });
    add(P.legL, mat, 0.23, 0.1, 0.25, '#2a2018', [0, -0.55, 0.01]); add(P.legR, mat, 0.23, 0.1, 0.25, '#2a2018', [0, -0.55, 0.01]);
    P.torso = add(body, mat, 0.52, 0.66, 0.3, pr.shirt, [0, 0.93, 0]);
    add(P.torso, mat, 0.4, 0.5, 0.02, pr.apron, [0, -0.06, 0.16]);
    add(P.torso, mat, 0.54, 0.07, 0.32, '#3a2a1e', [0, -0.18, 0]);
    P.armL = add(body, mat, 0.18, 0.6, 0.18, pr.shirt, [-0.35, 1.2, 0], { pivot: [0, 0.26, 0] });
    P.armR = add(body, mat, 0.18, 0.6, 0.18, pr.shirt, [0.35, 1.2, 0], { pivot: [0, 0.26, 0] });
    add(P.armL, mat, 0.19, 0.14, 0.19, Sk, [0, -0.52, 0]); add(P.armR, mat, 0.19, 0.14, 0.19, Sk, [0, -0.52, 0]);
    P.head = add(body, mat, 0.5, 0.46, 0.46, Sk, [0, 1.26, 0], { pivot: [0, -0.23, 0] });
    add(P.head, null, 0.07, 0.07, 0.02, '#222', [-0.11, 0.24, 0.235], { mat: BLACK_MAT });
    add(P.head, null, 0.07, 0.07, 0.02, '#222', [0.11, 0.24, 0.235], { mat: BLACK_MAT });
    add(P.head, mat, 0.08, 0.06, 0.02, '#e8907e', [-0.18, 0.14, 0.236]); add(P.head, mat, 0.08, 0.06, 0.02, '#e8907e', [0.18, 0.14, 0.236]);
    add(P.head, mat, 0.1, 0.08, 0.05, '#d8a080', [0, 0.17, 0.25]);
    const beard = type.length % 2 ? '#c8c0b0' : '#8a5a3a';
    if (pr.hat !== 'glasses') { add(P.head, mat, 0.4, 0.16, 0.06, beard, [0, 0.02, 0.24]); add(P.head, mat, 0.18, 0.12, 0.06, beard, [0, -0.08, 0.24]); }
    else { add(P.head, mat, 0.1, 0.32, 0.1, '#b8803a', [-0.27, 0.1, -0.05]); add(P.head, mat, 0.1, 0.32, 0.1, '#b8803a', [0.27, 0.1, -0.05]); add(P.head, mat, 0.12, 0.12, 0.02, '#c8a050', [-0.11, 0.24, 0.245]); add(P.head, mat, 0.12, 0.12, 0.02, '#c8a050', [0.11, 0.24, 0.245]); add(P.head, mat, 0.5, 0.12, 0.48, '#b8803a', [0, 0.44, -0.01]); }
    if (pr.hat === 'straw') { add(P.head, mat, 0.72, 0.05, 0.72, '#e0c060', [0, 0.47, 0]); add(P.head, mat, 0.46, 0.16, 0.46, '#d4b050', [0, 0.56, 0]); add(P.head, mat, 0.47, 0.04, 0.47, '#a83a2a', [0, 0.5, 0]); }
    else if (pr.hat === 'sou') { add(P.head, mat, 0.6, 0.18, 0.62, '#e8c030', [0, 0.5, -0.04]); add(P.head, mat, 0.64, 0.04, 0.3, '#e8c030', [0, 0.42, -0.28]); }
    else if (pr.hat === 'cap') { add(P.head, mat, 0.52, 0.16, 0.5, pr.shirt, [0, 0.48, 0]); add(P.head, mat, 0.12, 0.12, 0.12, '#e8d8b0', [0, 0.62, 0]); add(P.head, mat, 0.52, 0.04, 0.12, '#3a2a1e', [0, 0.4, 0.24]); }
    else if (pr.hat === 'none') { add(P.head, mat, 0.5, 0.1, 0.48, '#3a2a20', [0, 0.46, -0.01]); add(P.torso, mat, 0.3, 0.1, 0.05, '#6c6f78', [0.12, 0.1, 0.18]); }
    return { root, mat, parts: P, height: 1.6, width: 0.55 };
  }
  if (type === 'glodgast') { // glödgast: svävande askmask med glödande kärna och fladdrande eldslöjor
    P.body = add(body, mat, 0.9, 0.8, 0.9, '#3a2622', [0, 1.2, 0]);
    add(P.body, null, 0.5, 0.42, 0.04, '#fff', [0, 0.04, 0.46], { mat: EMBER_MAT });
    add(P.body, null, 0.2, 0.14, 0.04, '#fff', [-0.16, 0.12, 0.485], { mat: GLOW_MAT });
    add(P.body, null, 0.2, 0.14, 0.04, '#fff', [0.16, 0.12, 0.485], { mat: GLOW_MAT });
    add(P.body, null, 0.3, 0.06, 0.04, '#111', [0, -0.08, 0.485], { mat: BLACK_MAT });
    add(P.body, mat, 0.96, 0.14, 0.96, '#5a3a30', [0, 0.38, 0]);
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) add(P.body, mat, 0.16, 0.2, 0.16, '#6a4436', [x, 0.52, z]);
    P.veils = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const v = add(body, null, 0.12, 0.7, 0.12, '#fff', [Math.cos(a) * 0.32, 0.8, Math.sin(a) * 0.32], { pivot: [0, 0.35, 0], mat: i % 2 ? EMBER_MAT : LAVA_MAT }); P.veils.push(v); }
    return { root, mat, parts: P, height: 1.7, width: 1.0 };
  }
  if (type === 'askvandrare') { // askvandrare: grå, sprucken gestalt med glödande ådror, går i flock
    const A = '#5a5552', A2 = '#46423f';
    P.legL = add(body, mat, 0.24, 0.8, 0.24, A2, [-0.14, 0.8, 0], { pivot: [0, 0.4, 0] });
    P.legR = add(body, mat, 0.24, 0.8, 0.24, A2, [0.14, 0.8, 0], { pivot: [0, 0.4, 0] });
    P.torso = add(body, mat, 0.56, 0.74, 0.3, A, [0, 1.2, 0]);
    add(P.torso, null, 0.04, 0.5, 0.02, '#fff', [0.08, 0.0, 0.16], { mat: EMBER_MAT });
    add(P.torso, null, 0.22, 0.04, 0.02, '#fff', [-0.04, 0.14, 0.16], { mat: EMBER_MAT });
    add(P.torso, mat, 0.6, 0.16, 0.34, '#3a3634', [0, 0.32, 0]);
    P.armL = add(body, mat, 0.2, 0.8, 0.2, A, [-0.39, 1.5, 0], { pivot: [0, 0.35, 0] });
    P.armR = add(body, mat, 0.2, 0.8, 0.2, A, [0.39, 1.5, 0], { pivot: [0, 0.35, 0] });
    add(P.armR, null, 0.03, 0.4, 0.02, '#fff', [0, -0.1, 0.11], { mat: EMBER_MAT });
    P.head = add(body, mat, 0.42, 0.44, 0.42, '#6a6460', [0, 1.57, 0], { pivot: [0, -0.22, 0] });
    add(P.head, null, 0.12, 0.06, 0.02, '#fff', [-0.1, 0.24, 0.215], { mat: GLOW_MAT });
    add(P.head, null, 0.12, 0.06, 0.02, '#fff', [0.1, 0.24, 0.215], { mat: GLOW_MAT });
    add(P.head, mat, 0.46, 0.14, 0.46, '#3a3634', [0, 0.42, 0]);
    add(P.head, mat, 0.1, 0.2, 0.1, '#3a3634', [-0.14, 0.56, 0]); add(P.head, mat, 0.1, 0.14, 0.1, '#3a3634', [0.12, 0.52, 0.06]);
    return { root, mat, parts: P, height: 1.95, width: 0.6 };
  }
  if (type === 'salamander') { // eldsalamander: låg, lång ödla i glödrött med svarta fläckar
    P.body = add(body, mat, 0.5, 0.3, 1.1, '#d8401a', [0, 0.36, 0]);
    for (const [x, z] of [[-0.12, 0.3], [0.14, -0.1], [-0.1, -0.35], [0.12, 0.42]]) add(P.body, mat, 0.16, 0.02, 0.16, '#1a1010', [x, 0.16, z]);
    add(P.body, null, 0.08, 0.04, 0.9, '#fff', [0, 0.17, 0], { mat: GLOW_MAT });
    P.head = add(body, mat, 0.42, 0.26, 0.4, '#c8361a', [0, 0.38, 0.7], { pivot: [0, 0, -0.18] });
    add(P.head, null, 0.08, 0.08, 0.02, '#fff', [-0.12, 0.06, 0.205], { mat: GLOW_MAT });
    add(P.head, null, 0.08, 0.08, 0.02, '#fff', [0.12, 0.06, 0.205], { mat: GLOW_MAT });
    P.tail = add(body, mat, 0.22, 0.18, 0.8, '#b8301a', [0, 0.34, -0.9], { pivot: [0, 0, 0.4] });
    add(P.tail, mat, 0.14, 0.12, 0.4, '#ff8a3a', [0, 0, -0.55]);
    P.legs = [];
    for (const [x, z] of [[-0.32, 0.35], [0.32, 0.35], [-0.32, -0.3], [0.32, -0.3]]) P.legs.push(add(body, mat, 0.14, 0.26, 0.14, '#a82a14', [x, 0.26, z], { pivot: [0, 0.13, 0] }));
    return { root, mat, parts: P, height: 0.6, width: 0.8 };
  }
  if (type === 'eldjatte') { // eldjätten: borgens väktare – basaltkropp med lavaådror, krona av glödsten
    const Ba = '#5a4c4c', Ba2 = '#44383a';
    P.legL = add(body, mat, 0.6, 1.3, 0.6, Ba2, [-0.4, 1.3, 0], { pivot: [0, 0.65, 0] });
    P.legR = add(body, mat, 0.6, 1.3, 0.6, Ba2, [0.4, 1.3, 0], { pivot: [0, 0.65, 0] });
    add(P.legL, null, 0.06, 0.8, 0.02, '#fff', [0.1, 0, 0.31], { mat: LAVA_MAT }); add(P.legR, null, 0.06, 0.8, 0.02, '#fff', [-0.1, 0, 0.31], { mat: LAVA_MAT });
    P.torso = add(body, mat, 1.4, 1.3, 0.8, Ba, [0, 2.2, 0]);
    add(P.torso, null, 0.5, 0.5, 0.04, '#fff', [0, 0.1, 0.41], { mat: EMBER_MAT });
    add(P.torso, null, 0.08, 1.0, 0.04, '#fff', [-0.4, 0, 0.41], { mat: LAVA_MAT }); add(P.torso, null, 0.08, 0.8, 0.04, '#fff', [0.45, 0.1, 0.41], { mat: LAVA_MAT });
    add(P.torso, mat, 1.6, 0.36, 0.9, '#3a3436', [0, 0.6, 0]);
    P.armL = add(body, mat, 0.5, 1.5, 0.5, Ba, [-1.0, 2.7, 0], { pivot: [0, 0.6, 0] });
    P.armR = add(body, mat, 0.5, 1.5, 0.5, Ba, [1.0, 2.7, 0], { pivot: [0, 0.6, 0] });
    add(P.armL, mat, 0.62, 0.5, 0.62, '#3a3436', [0, -1.25, 0]); add(P.armR, mat, 0.62, 0.5, 0.62, '#3a3436', [0, -1.25, 0]);
    add(P.armR, null, 0.06, 0.9, 0.02, '#fff', [0, -0.3, 0.26], { mat: LAVA_MAT });
    P.head = add(body, mat, 0.8, 0.7, 0.7, Ba, [0, 2.85, 0.05], { pivot: [0, -0.35, 0] });
    add(P.head, null, 0.2, 0.1, 0.02, '#fff', [-0.18, 0.36, 0.36], { mat: GLOW_MAT }); add(P.head, null, 0.2, 0.1, 0.02, '#fff', [0.18, 0.36, 0.36], { mat: GLOW_MAT });
    add(P.head, null, 0.4, 0.06, 0.02, '#fff', [0, 0.14, 0.36], { mat: EMBER_MAT });
    for (const x of [-0.3, 0, 0.3]) add(P.head, null, 0.14, x === 0 ? 0.36 : 0.24, 0.14, '#fff', [x, 0.78, 0], { mat: GLOW_MAT });
    return { root, mat, parts: P, height: 3.6, width: 1.5 };
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
export function isCubeItem(id) { const d = isBlock(id) ? BLOCKS[id] : null; return !!(d && (d.model === M_CUBE || (d.model === M_BOX && d.boxes && d.boxes.length <= 2 && !d.door && !d.bed && d.light === 0))); }
