/* Rävens äventyr – figurer byggda av former: Ylva, NPC:er, fiender. */
import * as THREE from 'three';
import { toon, basic, gradientMap } from './core.js';

export const UG = {
  sph: new THREE.SphereGeometry(1, 18, 14),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  cone: new THREE.ConeGeometry(1, 1, 12),
  cone4: new THREE.ConeGeometry(1, 1, 5),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  caps: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.3, 8, 20),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  plane: new THREE.PlaneGeometry(1, 1)
};
Object.values(UG).forEach(g => { g.userData.shared = true; });

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1a1210, side: THREE.BackSide });

/** Skapa en del. */
export function P(parent, geo, mat, pos = [0, 0, 0], scl = [1, 1, 1], rot = [0, 0, 0], opt = {}) {
  const m = new THREE.Mesh(UG[geo] || geo, typeof mat === 'number' ? toon(mat) : mat);
  m.position.set(...pos);
  if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(...scl);
  m.rotation.set(...rot);
  m.castShadow = opt.cast !== false;
  m.userData.sharedGeo = true;
  parent.add(m);
  return m;
}
export function G(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group(); g.position.set(...pos); g.rotation.set(...rot); parent.add(g); return g;
}
/** Lägg till konturlinje (inverterat skal) på alla meshar under obj. */
export function outline(obj, k = 0.06) {
  const list = [];
  obj.traverse(o => { if (o.isMesh && !o.userData.noOutline && !o.userData.isOutline) list.push(o); });
  list.forEach(o => {
    const s = new THREE.Mesh(o.geometry, OUTLINE);
    s.userData.isOutline = true; s.userData.sharedGeo = true;
    const avg = (o.scale.x + o.scale.y + o.scale.z) / 3;
    s.scale.setScalar(1 + k / Math.max(0.05, avg));
    s.castShadow = false;
    o.add(s);
  });
  return obj;
}
export function setShadows(obj, on) { obj.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.castShadow = on; }); }

const EYE = 0x161012, WHITE = 0xfff7ec;
function eyes(head, x, y, z, s = 0.07, look = 0) {
  for (const sx of [-1, 1]) {
    const e = P(head, 'sph', EYE, [sx * x, y, z], [s * 0.8, s * 1.25, s * 0.6]);
    e.userData.noOutline = true;
    P(head, 'sph', basic(0xffffff), [sx * x + 0.02 + look, y + s * 0.45, z + s * 0.45], s * 0.32, [0, 0, 0], { cast: false }).userData.noOutline = true;
  }
}

/* ====================================================================== Ylva */
export function buildFox() {
  const ORANGE = 0xf07a2a, DARK = 0x2b1e1b, SCARF = 0x2e7fe0;
  const root = new THREE.Group();
  const R = { root };
  const pivot = R.pivot = G(root, [0, 0.62, 0]);
  const body = R.body = G(pivot);
  P(body, 'sph', ORANGE, [0, 0, 0], [0.3, 0.34, 0.28]);
  P(body, 'sph', WHITE, [0, -0.02, 0.13], [0.21, 0.26, 0.17]).userData.noOutline = true;
  // halsduk
  R.scarf = P(body, 'torus', SCARF, [0, 0.24, 0], [0.24, 0.24, 0.42], [Math.PI / 2, 0, 0]);
  R.scarfTail = G(body, [0.1, 0.24, -0.18]);
  P(R.scarfTail, 'box', SCARF, [0, -0.02, -0.16], [0.12, 0.05, 0.32]);
  // huvud
  const head = R.head = G(body, [0, 0.5, 0.02]);
  P(head, 'sph', ORANGE, [0, 0, 0], [0.36, 0.33, 0.33]);
  P(head, 'sph', WHITE, [-0.16, -0.1, 0.16], [0.15, 0.12, 0.14]).userData.noOutline = true;
  P(head, 'sph', WHITE, [0.16, -0.1, 0.16], [0.15, 0.12, 0.14]).userData.noOutline = true;
  P(head, 'sph', WHITE, [0, -0.1, 0.27], [0.13, 0.1, 0.16]);
  P(head, 'sph', DARK, [0, -0.07, 0.43], [0.055, 0.045, 0.045]).userData.noOutline = true;
  eyes(head, 0.13, 0.04, 0.28, 0.065);
  R.ears = [];
  for (const sx of [-1, 1]) {
    const ear = G(head, [sx * 0.19, 0.26, -0.03], [0, 0, -sx * 0.32]);
    P(ear, 'cone', ORANGE, [0, 0.13, 0], [0.13, 0.3, 0.07]);
    P(ear, 'cone', 0xffd8b8, [0, 0.1, 0.03], [0.07, 0.2, 0.03]).userData.noOutline = true;
    P(ear, 'cone', DARK, [0, 0.25, 0], [0.06, 0.08, 0.04]).userData.noOutline = true;
    R.ears.push(ear);
  }
  // armar
  R.arms = [];
  for (const sx of [-1, 1]) {
    const sh = G(body, [sx * 0.27, 0.12, 0.02]);
    P(sh, 'caps', ORANGE, [0, -0.14, 0], [0.13, 0.2, 0.13]);
    P(sh, 'sph', DARK, [0, -0.3, 0.01], 0.075);
    R.arms.push(sh);
  }
  // ben
  R.legs = [];
  for (const sx of [-1, 1]) {
    const hip = G(body, [sx * 0.13, -0.24, 0]);
    P(hip, 'caps', ORANGE, [0, -0.12, 0], [0.15, 0.16, 0.15]);
    P(hip, 'sph', DARK, [0, -0.3, 0.05], [0.09, 0.07, 0.13]);
    R.legs.push(hip);
  }
  // svans
  R.tail = [];
  let par = G(body, [0, -0.14, -0.24], [0.9, 0, 0]);
  const tr = [0.11, 0.16, 0.2, 0.19, 0.13];
  for (let i = 0; i < tr.length; i++) {
    const seg = G(par, [0, i === 0 ? 0 : 0.17, 0], [-0.22, 0, 0]);
    P(seg, 'sph', i === tr.length - 1 ? WHITE : ORANGE, [0, 0.09, 0], [tr[i], tr[i] * 1.15, tr[i]]);
    R.tail.push(seg);
    par = seg;
  }
  outline(root, 0.035);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  R.trail = null;
  return R;
}

/* ====================================================================== NPC:er */
/** Generisk tvåbent djurfigur. o: { body, belly, head, ears:'long'|'round'|'tuft'|'none'|'pointy', tail:'puff'|'bushy'|'none'|'short', scale, snout, extra(fn) } */
export function buildAnimal(o) {
  const root = new THREE.Group();
  const R = { root };
  const s = o.scale || 1;
  const pivot = R.pivot = G(root, [0, 0.55 * s, 0]);
  pivot.scale.setScalar(s);
  const body = R.body = G(pivot);
  P(body, 'sph', o.body, [0, 0, 0], o.bodyScale || [0.32, 0.38, 0.3]);
  if (o.belly) P(body, 'sph', o.belly, [0, -0.03, 0.13], [0.23, 0.28, 0.18]).userData.noOutline = true;
  const head = R.head = G(body, [0, 0.52, 0.02]);
  P(head, 'sph', o.head || o.body, [0, 0, 0], o.headScale || [0.34, 0.31, 0.31]);
  if (o.snout) P(head, 'sph', o.snout, [0, -0.08, 0.24], [0.14, 0.1, 0.13]);
  if (o.nose !== false) P(head, 'sph', o.noseColor || 0x2a1a18, [0, -0.04, o.snout ? 0.37 : 0.3], 0.045).userData.noOutline = true;
  eyes(head, 0.12, 0.05, 0.26, 0.06);
  R.ears = [];
  const ec = o.earColor || o.body;
  if (o.ears === 'long') for (const sx of [-1, 1]) { const e = G(head, [sx * 0.12, 0.25, -0.04], [-0.15, 0, -sx * 0.15]); P(e, 'caps', ec, [0, 0.25, 0], [0.12, 0.42, 0.07]); P(e, 'caps', 0xffc9c0, [0, 0.25, 0.03], [0.06, 0.32, 0.02]).userData.noOutline = true; R.ears.push(e); }
  if (o.ears === 'round') for (const sx of [-1, 1]) { const e = G(head, [sx * 0.24, 0.22, -0.03]); P(e, 'sph', ec, [0, 0, 0], [0.1, 0.1, 0.05]); R.ears.push(e); }
  if (o.ears === 'pointy') for (const sx of [-1, 1]) { const e = G(head, [sx * 0.18, 0.27, -0.03], [0, 0, -sx * 0.3]); P(e, 'cone', ec, [0, 0.1, 0], [0.1, 0.24, 0.06]); if (o.tufts) P(e, 'cone', o.tufts, [0, 0.25, 0], [0.03, 0.1, 0.03]); R.ears.push(e); }
  if (o.ears === 'tuft') for (const sx of [-1, 1]) { const e = G(head, [sx * 0.2, 0.26, 0], [0, 0, -sx * 0.5]); P(e, 'cone', ec, [0, 0.08, 0], [0.07, 0.2, 0.05]); R.ears.push(e); }
  R.arms = [];
  for (const sx of [-1, 1]) { const a = G(body, [sx * 0.29, 0.1, 0.02]); P(a, 'caps', o.arm || o.body, [0, -0.13, 0], [0.12, 0.2, 0.12]); R.arms.push(a); }
  R.legs = [];
  for (const sx of [-1, 1]) { const l = G(body, [sx * 0.13, -0.27, 0]); P(l, 'caps', o.leg || o.body, [0, -0.1, 0.02], [0.14, 0.14, 0.16]); P(l, 'sph', o.foot || o.leg || o.body, [0, -0.24, 0.07], [0.1, 0.06, 0.14]); R.legs.push(l); }
  R.tail = [];
  if (o.tail === 'puff') P(body, 'sph', o.tailColor || 0xffffff, [0, -0.18, -0.3], 0.12);
  if (o.tail === 'bushy') { let par = G(body, [0, -0.15, -0.26], [0.6, 0, 0]); for (let i = 0; i < 4; i++) { const sg = G(par, [0, i ? 0.18 : 0, 0], [-0.5, 0, 0]); P(sg, 'sph', o.tailColor || o.body, [0, 0.1, 0], 0.13 + i * 0.04); R.tail.push(sg); par = sg; } }
  if (o.tail === 'short') P(body, 'cone', o.tailColor || o.body, [0, -0.2, -0.3], [0.08, 0.2, 0.08], [-2, 0, 0]);
  if (o.extra) o.extra(R, head, body);
  outline(root, 0.03);
  return R;
}

export const NPC_DEFS = {
  uggla: { body: 0x8a6a4a, belly: 0xe9d8b8, ears: 'tuft', tail: 'none', nose: false, scale: 1.05,
    extra: (R, h, b) => { P(h, 'cone', 0xf2b233, [0, -0.07, 0.3], [0.05, 0.1, 0.05], [Math.PI / 2 + 0.3, 0, 0]); P(h, 'sph', 0xf5ecd8, [-0.12, 0.04, 0.22], [0.11, 0.11, 0.06]).userData.noOutline = true; P(h, 'sph', 0xf5ecd8, [0.12, 0.04, 0.22], [0.11, 0.11, 0.06]).userData.noOutline = true; P(h, 'torus', 0x333333, [0.12, 0.05, 0.3], [0.08, 0.08, 0.08]); P(h, 'torus', 0x333333, [-0.12, 0.05, 0.3], [0.08, 0.08, 0.08]); } },
  hare: { body: 0xb9a58a, belly: 0xf3ead8, ears: 'long', tail: 'puff', snout: 0xf3ead8, noseColor: 0xd98080, scale: 1 },
  gravling: { body: 0x77777d, belly: 0x2c2c2c, head: 0xf2f2f2, ears: 'round', tail: 'short', snout: 0xf2f2f2,
    extra: (R, h) => { P(h, 'sph', 0x222222, [-0.1, 0.08, 0.12], [0.07, 0.2, 0.25]).userData.noOutline = true; P(h, 'sph', 0x222222, [0.1, 0.08, 0.12], [0.07, 0.2, 0.25]).userData.noOutline = true; P(h, 'cyl', 0x5a3e2a, [0, 0.3, 0], [0.22, 0.06, 0.22]); P(h, 'cyl', 0x5a3e2a, [0, 0.36, 0], [0.15, 0.14, 0.15]); } },
  ekorre: { body: 0xc45a22, belly: 0xf3dcc0, ears: 'pointy', tufts: 0x8a3a14, tail: 'bushy', scale: 0.85 },
  mullvad: { body: 0x3c3640, belly: 0x55505a, ears: 'none', tail: 'short', snout: 0xf0a0a8, noseColor: 0xe27a8a, scale: 0.9,
    extra: (R, h) => { P(h, 'cyl', 0xffd23a, [0, 0.28, 0], [0.26, 0.12, 0.26]); P(h, 'sph', basic(0xfff3a0), [0, 0.3, 0.24], 0.06); } },
  pingvin: { body: 0x23262e, belly: 0xffffff, head: 0x23262e, ears: 'none', tail: 'none', nose: false, arm: 0x23262e, foot: 0xf09a2a, leg: 0x23262e,
    extra: (R, h) => { P(h, 'cone', 0xf09a2a, [0, -0.05, 0.33], [0.07, 0.16, 0.06], [Math.PI / 2, 0, 0]); P(h, 'torus', 0xe03a3a, [0, -0.3, 0], [0.26, 0.26, 0.4], [Math.PI / 2, 0, 0]); } },
  sal: { body: 0x8e9aa6, belly: 0xc9d2da, ears: 'none', tail: 'none', snout: 0xc9d2da, scale: 1.1,
    extra: (R, h) => { for (const sx of [-1, 1]) P(h, 'cyl', 0x333333, [sx * 0.1, -0.08, 0.36], [0.005, 0.005, 0.18], [0, 0, Math.PI / 2 + sx * 0.2]); P(h, 'cone', 0x2a5ad0, [0, 0.33, 0], [0.22, 0.25, 0.22]); } },
  krake: { body: 0x2c2a38, belly: 0x3e3b50, ears: 'none', tail: 'short', nose: false, scale: 0.95,
    extra: (R, h) => { P(h, 'cone', 0xe8b23a, [0, -0.03, 0.34], [0.07, 0.2, 0.06], [Math.PI / 2, 0, 0]); P(h, 'cone', 0xd04040, [0, 0.32, -0.05], [0.18, 0.22, 0.18]); } },
  alg: { body: 0x6b4a32, belly: 0x8a6a50, head: 0x6b4a32, ears: 'pointy', tail: 'short', snout: 0x8a6a50, scale: 1.6,
    extra: (R, h) => { for (const sx of [-1, 1]) { const a = G(h, [sx * 0.22, 0.25, 0], [0, 0, -sx * 0.6]); P(a, 'box', 0xe8d8b0, [0, 0.12, 0], [0.06, 0.25, 0.06]); P(a, 'box', 0xe8d8b0, [sx * 0.08, 0.25, 0], [0.3, 0.06, 0.18]); } } },
  igelkott: { body: 0x7a5a3a, belly: 0xe8d0b0, head: 0xe8d0b0, ears: 'round', earColor: 0x7a5a3a, tail: 'none', snout: 0xe8d0b0, scale: 0.85,
    extra: (R, h, b) => { for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 1.6 - 0.8 + Math.PI; P(b, 'cone', 0x4a3220, [Math.sin(a) * 0.2, 0.1 + (i % 3) * 0.1, Math.cos(a) * 0.22], [0.06, 0.22, 0.06], [Math.cos(a) * -1.2, 0, Math.sin(a) * 1.2]); } } },
  groda: { body: 0x5fb34a, belly: 0xd9f0a0, ears: 'none', tail: 'none', nose: false, scale: 0.8, headScale: [0.38, 0.27, 0.32] },
  hona: { body: 0xf6f1e8, belly: 0xe9dcc6, head: 0xf6f1e8, ears: 'none', tail: 'short', tailColor: 0xd8cbb4, nose: false, foot: 0xf0a030, leg: 0xf0a030, scale: 0.95,
    extra: (R, h) => { for (let i = 0; i < 3; i++) P(h, 'sph', 0xe0302a, [0, 0.3 + (i === 1 ? 0.05 : 0), -0.08 + i * 0.09], 0.075); P(h, 'cone', 0xf2b233, [0, -0.04, 0.33], [0.06, 0.14, 0.05], [Math.PI / 2, 0, 0]); P(h, 'sph', 0xe0302a, [0, -0.16, 0.27], [0.04, 0.07, 0.04]); } },
  utter: { body: 0x7a5236, belly: 0xd8c0a0, head: 0x7a5236, ears: 'round', tail: 'short', snout: 0xd8c0a0, scale: 0.95,
    extra: (R, h) => { for (const sx of [-1, 1]) P(h, 'cyl', 0x2a2018, [sx * 0.1, -0.08, 0.37], [0.005, 0.005, 0.16], [0, 0, Math.PI / 2 + sx * 0.2]); P(h, 'torus', 0x2a8ad0, [0, -0.3, 0], [0.26, 0.26, 0.4], [Math.PI / 2, 0, 0]); } }
};
/** Kycklingen Pip – liten gul boll med vingar och ben. */
export function buildChick() {
  const root = new THREE.Group();
  const R = { root };
  const body = R.body = G(root, [0, 0.26, 0]);
  P(body, 'sph', 0xffe14d, [0, 0, 0], [0.22, 0.2, 0.24]);
  const head = R.head = G(body, [0, 0.2, 0.08]);
  P(head, 'sph', 0xffe66a, [0, 0, 0], 0.15);
  P(head, 'cone', 0xf08a1a, [0, -0.01, 0.16], [0.045, 0.09, 0.04], [Math.PI / 2, 0, 0]);
  eyes(head, 0.065, 0.04, 0.12, 0.04);
  P(head, 'sph', 0xffd23a, [0, 0.15, -0.02], [0.03, 0.06, 0.03]).userData.noOutline = true;
  R.wings = [-1, 1].map(sx => { const w = G(body, [sx * 0.2, 0.02, -0.02]); P(w, 'sph', 0xffd23a, [sx * 0.03, 0, 0], [0.06, 0.1, 0.13]); return w; });
  R.legs = [-1, 1].map(sx => { const l = G(root, [sx * 0.08, 0.1, 0]); P(l, 'cyl', 0xf08a1a, [0, -0.04, 0], [0.018, 0.12, 0.018]); P(l, 'sph', 0xf08a1a, [0, -0.1, 0.04], [0.05, 0.02, 0.06]); return l; });
  outline(root, 0.02);
  return R;
}
export function buildNPC(kind) { return buildAnimal(NPC_DEFS[kind]); }

/* ====================================================================== Fiender */
export function buildEnemy(kind) {
  const root = new THREE.Group();
  const R = { root, parts: {} };
  switch (kind) {
    case 'svampis': {
      const b = R.body = G(root, [0, 0, 0]);
      P(b, 'cyl', 0xf3e6cc, [0, 0.35, 0], [0.28, 0.5, 0.28]);
      const cap = G(b, [0, 0.65, 0]); R.parts.cap = cap;
      P(cap, 'sph', 0xd83a2e, [0, 0.05, 0], [0.55, 0.38, 0.55]);
      for (let i = 0; i < 6; i++) { const a = i * 1.05; P(cap, 'sph', 0xffffff, [Math.sin(a) * 0.35, 0.22, Math.cos(a) * 0.35], [0.1, 0.05, 0.1], [Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6]).userData.noOutline = true; }
      eyes(b, 0.1, 0.42, 0.24, 0.06);
      P(b, 'box', 0x3a1a10, [-0.1, 0.52, 0.27], [0.12, 0.03, 0.02], [0, 0, -0.4]);
      P(b, 'box', 0x3a1a10, [0.1, 0.52, 0.27], [0.12, 0.03, 0.02], [0, 0, 0.4]);
      R.feet = [P(b, 'sph', 0x6a4028, [-0.14, 0.06, 0.05], [0.12, 0.08, 0.16]), P(b, 'sph', 0x6a4028, [0.14, 0.06, 0.05], [0.12, 0.08, 0.16])];
      R.r = 0.55; R.h = 1.0; break;
    }
    case 'taggsvin': {
      const b = R.body = G(root, [0, 0.45, 0]);
      P(b, 'sph', 0x6a4a30, [0, 0, 0], [0.5, 0.42, 0.55]);
      P(b, 'sph', 0xe0c09a, [0, -0.08, 0.42], [0.22, 0.2, 0.2]);
      P(b, 'sph', 0x221510, [0, -0.06, 0.62], 0.06).userData.noOutline = true;
      eyes(b, 0.12, 0.06, 0.48, 0.05);
      for (let i = 0; i < 22; i++) {
        const u = (i * 0.618) % 1, v = (i / 22);
        const th = u * Math.PI * 2, ph = 0.2 + v * 1.2;
        const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th) - 0.5).normalize();
        if (dir.z > 0.55) continue;
        const sp = P(b, 'cone', 0xf2e2c0, [dir.x * 0.45, dir.y * 0.38, dir.z * 0.48], [0.07, 0.38, 0.07]);
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
      R.feet = [P(root, 'sph', 0x3a2a1a, [-0.22, 0.08, 0.1], [0.1, 0.08, 0.14]), P(root, 'sph', 0x3a2a1a, [0.22, 0.08, 0.1], [0.1, 0.08, 0.14])];
      R.r = 0.6; R.h = 0.9; break;
    }
    case 'bi': case 'mas': {
      const b = R.body = G(root, [0, 0, 0]);
      if (kind === 'bi') {
        P(b, 'sph', 0xffc928, [0, 0, 0], [0.32, 0.3, 0.4]);
        P(b, 'torus', 0x2a2218, [0, 0, -0.05], [0.3, 0.3, 0.35], [0, 0, 0]).userData.noOutline = true;
        P(b, 'torus', 0x2a2218, [0, 0, -0.22], [0.25, 0.25, 0.3]).userData.noOutline = true;
        P(b, 'cone', 0x2a2218, [0, 0, -0.45], [0.06, 0.18, 0.06], [-Math.PI / 2, 0, 0]);
        eyes(b, 0.1, 0.08, 0.32, 0.06);
      } else {
        P(b, 'sph', 0xffffff, [0, 0, 0], [0.3, 0.28, 0.5]);
        P(b, 'cone', 0xf2a52a, [0, 0, 0.6], [0.06, 0.2, 0.06], [Math.PI / 2, 0, 0]);
        eyes(b, 0.12, 0.1, 0.38, 0.05);
      }
      const wm = new THREE.MeshBasicMaterial({ color: kind === 'bi' ? 0xdff6ff : 0xdddddd, transparent: true, opacity: kind === 'bi' ? 0.7 : 1, side: THREE.DoubleSide });
      R.wings = [];
      for (const sx of [-1, 1]) {
        const w = G(b, [sx * 0.15, 0.2, 0]);
        const pl = P(w, 'plane', wm, [sx * 0.3, 0, 0], kind === 'bi' ? [0.55, 0.3, 1] : [0.8, 0.35, 1], [-Math.PI / 2, 0, 0], { cast: false });
        pl.userData.noOutline = true;
        R.wings.push(w);
      }
      R.disposeMats = [wm];
      R.r = 0.5; R.h = 0.6; break;
    }
    case 'spoklykta': {
      const b = R.body = G(root, [0, 0.9, 0]);
      const cloth = new THREE.MeshToonMaterial({ color: 0xb9c8ff, transparent: true, opacity: 0.75, gradientMap: gradientMap(), emissive: 0x334488, emissiveIntensity: 0.6 });
      P(b, 'cone', cloth, [0, -0.3, 0], [0.45, 0.9, 0.45], [Math.PI, 0, 0]).userData.noOutline = true;
      P(b, 'sph', cloth, [0, 0.12, 0], [0.42, 0.4, 0.42]).userData.noOutline = true;
      P(b, 'sph', basic(0x10101a), [-0.13, 0.15, 0.36], [0.07, 0.11, 0.04]);
      P(b, 'sph', basic(0x10101a), [0.13, 0.15, 0.36], [0.07, 0.11, 0.04]);
      P(b, 'sph', basic(0x10101a), [0, -0.02, 0.38], [0.08, 0.05, 0.03]);
      const lamp = G(b, [0.45, -0.15, 0.2]); R.parts.lamp = lamp;
      P(lamp, 'box', 0x3a3a46, [0, 0.2, 0], [0.22, 0.04, 0.22]);
      P(lamp, 'box', 0x3a3a46, [0, -0.15, 0], [0.22, 0.04, 0.22]);
      P(lamp, 'sph', basic(0x8affc8), [0, 0.02, 0], [0.1, 0.15, 0.1]);
      R.disposeMats = [cloth];
      R.r = 0.55; R.h = 1.3; R.float = true; break;
    }
    case 'fladdermus': {
      const b = R.body = G(root, [0, 0, 0]);
      P(b, 'sph', 0x4a3a5a, [0, 0, 0], [0.25, 0.28, 0.25]);
      for (const sx of [-1, 1]) P(b, 'cone', 0x4a3a5a, [sx * 0.13, 0.28, 0], [0.07, 0.16, 0.05]);
      eyes(b, 0.09, 0.05, 0.2, 0.05);
      const wm = toon(0x6a4a7a, { side: THREE.DoubleSide });
      R.wings = [];
      for (const sx of [-1, 1]) { const w = G(b, [sx * 0.15, 0.05, 0]); P(w, 'cone4', wm, [sx * 0.35, 0, 0], [0.3, 0.6, 0.05], [0, 0, sx * Math.PI / 2]); R.wings.push(w); }
      R.r = 0.45; R.h = 0.5; break;
    }
    case 'snogubbe': {
      const b = R.body = G(root, [0, 0, 0]);
      P(b, 'sph', 0xf4f8ff, [0, 0.45, 0], 0.5);
      P(b, 'sph', 0xf4f8ff, [0, 1.12, 0], 0.37);
      const h = G(b, [0, 1.62, 0]); R.parts.head = h;
      P(h, 'sph', 0xf4f8ff, [0, 0, 0], 0.27);
      P(h, 'cone', 0xf27a1a, [0, 0, 0.36], [0.06, 0.25, 0.06], [Math.PI / 2, 0, 0]);
      P(h, 'sph', 0x111111, [-0.1, 0.07, 0.23], 0.04); P(h, 'sph', 0x111111, [0.1, 0.07, 0.23], 0.04);
      P(h, 'cyl', 0x22232a, [0, 0.26, 0], [0.26, 0.04, 0.26]); P(h, 'cyl', 0x22232a, [0, 0.42, 0], [0.17, 0.3, 0.17]);
      P(h, 'cyl', 0xc03030, [0, 0.3, 0], [0.18, 0.06, 0.18]);
      for (let i = 0; i < 3; i++) P(b, 'sph', 0x111111, [0, 0.95 + i * 0.15, 0.36 - Math.abs(i - 1) * 0.02], 0.04);
      R.arms = [];
      for (const sx of [-1, 1]) { const a = G(b, [sx * 0.32, 1.2, 0], [0, 0, -sx * 0.9]); P(a, 'cyl', 0x6a4a2a, [0, 0.3, 0], [0.03, 0.6, 0.03]); R.arms.push(a); }
      R.r = 0.6; R.h = 1.9; break;
    }
    case 'krabba': {
      const b = R.body = G(root, [0, 0.35, 0]);
      P(b, 'sph', 0xe2462e, [0, 0, 0], [0.55, 0.3, 0.42]);
      for (const sx of [-1, 1]) {
        P(b, 'cyl', 0xe2462e, [sx * 0.13, 0.3, 0.2], [0.03, 0.25, 0.03]);
        P(b, 'sph', 0xffffff, [sx * 0.13, 0.45, 0.2], 0.08); P(b, 'sph', 0x111111, [sx * 0.13, 0.46, 0.26], 0.04);
        for (let i = 0; i < 3; i++) P(b, 'caps', 0xc23a22, [sx * 0.5, -0.18, -0.15 + i * 0.15], [0.06, 0.25, 0.06], [0, 0, sx * 0.8]);
      }
      R.claws = [];
      for (const sx of [-1, 1]) { const c = G(b, [sx * 0.55, 0.05, 0.3], [0, 0, 0]); P(c, 'sph', 0xf0563a, [sx * 0.1, 0, 0.12], [0.2, 0.16, 0.24]); P(c, 'cone', 0xf0563a, [sx * 0.12, 0.06, 0.32], [0.07, 0.2, 0.05], [Math.PI / 2, 0, 0]); R.claws.push(c); }
      R.r = 0.65; R.h = 0.7; break;
    }
    case 'krak': {
      const b = R.body = G(root, [0, 0, 0]);
      P(b, 'sph', 0x3a2f55, [0, 0, 0], [0.3, 0.3, 0.45]);
      P(b, 'cone', 0xe0b030, [0, 0.05, 0.5], [0.07, 0.22, 0.07], [Math.PI / 2, 0, 0]);
      P(b, 'sph', basic(0xff4a6a), [-0.12, 0.1, 0.35], 0.05); P(b, 'sph', basic(0xff4a6a), [0.12, 0.1, 0.35], 0.05);
      P(b, 'cone', 0x2a2040, [0, 0, -0.5], [0.15, 0.3, 0.05], [-Math.PI / 2, 0, 0]);
      R.wings = [];
      for (const sx of [-1, 1]) { const w = G(b, [sx * 0.2, 0.1, 0]); P(w, 'box', 0x2a2040, [sx * 0.45, 0, 0], [0.9, 0.04, 0.4]); R.wings.push(w); }
      R.r = 0.55; R.h = 0.6; break;
    }
  }
  outline(root, 0.03);
  return R;
}

/* ====================================================================== Föremål */
export function buildStoneGeo() {
  const g = new THREE.OctahedronGeometry(0.55, 0);
  g.scale(0.8, 1.25, 0.8);
  return g;
}
const stoneGeo = buildStoneGeo();
let stoneMat = null, ghostMat = null;
export function stoneMaterial(ghost) {
  if (!stoneMat) {
    const mk = (op) => new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, op: { value: op } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time, op; varying vec3 vN; varying vec3 vP;
        void main(){ float t = vP.y * 1.6 + time * 0.8 + vP.x;
          vec3 a = vec3(0.25, 1.0, 0.6), b = vec3(0.55, 0.4, 1.0), c = vec3(0.3, 0.85, 1.0);
          vec3 col = mix(mix(a, b, sin(t) * 0.5 + 0.5), c, sin(t * 1.7 + 1.0) * 0.5 + 0.5);
          float f = pow(1.0 - abs(vN.z), 2.0);
          col = col * (0.75 + 0.5 * abs(vN.y)) + f * 0.6;
          gl_FragColor = vec4(col * (op < 0.9 ? 0.6 : 1.3), op); }`,
      transparent: op < 1
    });
    stoneMat = mk(1); ghostMat = mk(0.45); stoneMat.userData.shared = ghostMat.userData.shared = true;
  }
  return ghost ? ghostMat : stoneMat;
}
export function stoneTick(t) { if (stoneMat) { stoneMat.uniforms.time.value = t; ghostMat.uniforms.time.value = t; } }
export function buildStone(ghost) {
  const m = new THREE.Mesh(stoneGeo, stoneMaterial(ghost));
  m.userData.sharedGeo = true;
  return m;
}
