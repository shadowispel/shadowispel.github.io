/**
 * Fjällracet – procedurella bilmodeller (22 bilar).
 *
 * Karossen byggs som en "loft": tvärsnitt (superellips-liknande profiler) längs bilens längdaxel med
 * höjdkurvor (huv/tak/botten) och planform (smalare nos/akter, utställda skärmar). Hjulhusen skärs ut
 * genom att lyfta tvärsnittets underkant runt hjulen, och kupén är en egen loft där varje fyrhörning
 * klassas som glas, stolpe/tak (lack) eller tätningslist.
 * Allt delas: geometri cachas per (kaross, kit, spoiler), hjul per (fälg, storlek), material delas
 * mellan bilar (lack, baklyse och strålkastare är per bil). En bil blir ~11–13 draw calls.
 *
 * Koordinater: y = 0 vid hjulens underkant, nosen mot +z, bredd längs x.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FINISHES = [
  { id: 'gloss', name: 'Blank' }, { id: 'metallic', name: 'Metallic' }, { id: 'matte', name: 'Matt' },
  { id: 'pearl', name: 'Pärlemor' }, { id: 'chrome', name: 'Krom' }
];
export const RIMS = [
  { id: 'std', name: 'Standard' }, { id: 'fem', name: '5-ekrars' }, { id: 'mesh', name: 'Flerekrars' },
  { id: 'turbin', name: 'Turbinfälg' }, { id: 'skal', name: 'Djup skål' }, { id: 'stal', name: 'Stålfälg med navkapsel' },
  { id: 'racing', name: 'Racing 6-ekrars' }, { id: 'trad', name: 'Klassisk trådekrar' }
];
export const SPOILERS = [
  { id: 'none', name: 'Ingen' }, { id: 'lip', name: 'Läppspoiler' }, { id: 'duck', name: 'Ducktail' },
  { id: 'rally', name: 'Rallyvinge' }, { id: 'gt', name: 'GT-vinge' }, { id: 'swan', name: 'Svanhals' }
];
export const KITS = [
  { id: 'none', name: 'Original' }, { id: 'sport', name: 'Sportkit' }, { id: 'wide', name: 'Breddkit' },
  { id: 'rally', name: 'Rallykit' }, { id: 'retro', name: 'Retrokit' }
];
export const DECALS = [
  { id: 'none', name: 'Ingen' }, { id: 'race', name: 'Racerränder' }, { id: 'side', name: 'Sidoränder' },
  { id: 'flames', name: 'Lågor' }, { id: 'checker', name: 'Rutigt' }, { id: 'camo', name: 'Kamouflage' },
  { id: 'bolt', name: 'Blixtar' }, { id: 'fade', name: 'Toning' }, { id: 'geo', name: 'Geometriskt' }
];
export const TINTS = [
  { id: 'clear', name: 'Ljus' }, { id: 'dark', name: 'Mörk' }, { id: 'blue', name: 'Blå' },
  { id: 'gold', name: 'Guld' }, { id: 'green', name: 'Grön' }
];

/* ================================================================== Verktyg */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const PI = Math.PI;
const _q = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _mtx = new THREE.Matrix4();

/** Monoton kubisk interpolation genom [[x, y], …] (x stigande). Ger inga översvängningar. */
function spline(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  for (let i = 0; i < n; i++) m.push(i === 0 ? d[0] : i === n - 1 ? d[n - 2] : (d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Gör geometri icke-indexerad med exakt attributen position, normal, uv (uv fylls med konstant om den saknas). */
function prep(g, u = 0.5, v = 0.5) {
  let r = g.index ? g.toNonIndexed() : g;
  if (!r.attributes.normal) r.computeVertexNormals();
  for (const k of Object.keys(r.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') r.deleteAttribute(k);
  if (!r.attributes.uv) {
    const n = r.attributes.position.count, a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
    r.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  }
  r.morphAttributes = {};
  return r;
}
function mergeList(list) {
  if (!list.length) return null;
  const g = mergeGeometries(list.map(x => prep(x)));
  g.computeBoundingSphere();
  return g;
}
/** Sätter konstant uv på alla hörn (för hjulens 3-texel-textur). */
function constUv(g, u) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count, a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  return g;
}
/** Bygger en BufferGeometry av triangellistor (pos/normal som platta arrayer). */
function triGeo(pos, nor, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** Extruderar en 2D-form (i planet x/y) med tjocklek längs z, centrerad. */
function slab(shape, depth, bevel = 0.004, curveSeg = 8) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curveSeg });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}
/** Extruderar en sidoprofil (form i (z, y)) med bredd längs x, centrerad på x = 0. */
function sideSlab(shape, width, bevel = 0.004) {
  const g = slab(shape, width, bevel);
  g.rotateY(-PI / 2); // formens x → +z, formens y → y
  return g;
}
function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function poly(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; }
function ellipse(rx, ry) { const s = new THREE.Shape(); s.absellipse(0, 0, rx, ry, 0, PI * 2, false, 0); return s; }
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function cyl(r1, r2, len, seg, axis, x, y, z, open = false) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'z') g.rotateX(PI / 2);
  return g.translate(x, y, z);
}
/** Rör längs punkter (Catmull-Rom). */
function tube(pts, rad, seg = 24, radSeg = 6) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), seg, rad, radSeg, false);
}

/* ================================================================== Material */
const MAT = {};
const matList = [];
function shared() {
  if (MAT.trim) return MAT;
  MAT.trim = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.08, metalness: 1.0, envMapIntensity: 1.4 });
  MAT.flame = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.ghost = new THREE.MeshStandardMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.32, depthWrite: false, emissive: 0x2a6a8a, emissiveIntensity: 0.6 });
  return MAT;
}
const TINT_DEF = {
  clear: { color: 0x1d2833, metalness: 0.9 }, dark: { color: 0x050608, metalness: 0.85 }, blue: { color: 0x0c2a5c, metalness: 0.9 },
  gold: { color: 0x5c4410, metalness: 1.0 }, green: { color: 0x0f3d24, metalness: 0.9 }
};
const glassCache = {};
function glassMat(tint, dbl) {
  const k = tint + (dbl ? '2' : '');
  if (glassCache[k]) return glassCache[k];
  const d = TINT_DEF[tint] || TINT_DEF.clear;
  return (glassCache[k] = new THREE.MeshStandardMaterial({ color: d.color, metalness: d.metalness, roughness: 0.04, envMapIntensity: 1.7, side: dbl ? THREE.DoubleSide : THREE.FrontSide }));
}

/** Lackmaterial (per bil). */
function paintMaterial(color, finish, quality) {
  const c = new THREE.Color(color);
  if (quality === 'low') return new THREE.MeshLambertMaterial({ color: c });
  const P = {
    gloss: { metalness: 0.05, roughness: 0.32 }, metallic: { metalness: 0.62, roughness: 0.3 }, matte: { metalness: 0.05, roughness: 0.82 },
    pearl: { metalness: 0.35, roughness: 0.28 }, chrome: { metalness: 1.0, roughness: 0.07 }
  }[finish] || { metalness: 0.05, roughness: 0.32 };
  if (finish === 'chrome') c.lerp(new THREE.Color(0xffffff), 0.35);
  if (quality === 'medium') {
    // utan clearcoat: lite lägre råhet så att lacken ändå glänser
    return new THREE.MeshStandardMaterial({ color: c, metalness: P.metalness, roughness: finish === 'matte' ? P.roughness : P.roughness * 0.75, envMapIntensity: finish === 'chrome' ? 1.5 : 1.0 });
  }
  const m = new THREE.MeshPhysicalMaterial({ color: c, metalness: P.metalness, roughness: P.roughness, envMapIntensity: finish === 'chrome' ? 1.5 : 1.0 });
  if (finish !== 'matte') { m.clearcoat = 1; m.clearcoatRoughness = finish === 'chrome' ? 0.02 : 0.06; }
  if (finish === 'pearl') {
    m.iridescence = 0.75; m.iridescenceIOR = 1.5; m.iridescenceThicknessRange = [180, 520];
    m.sheen = 0.6; m.sheenRoughness = 0.4; m.sheenColor = c.clone().lerp(new THREE.Color(0xffffff), 0.6);
  }
  return m;
}

/* ---------------- Hjulmaterial: 3 texlar (däck, fälg, accent) styr färg/råhet/metall via uv */
const RIM_U = { tire: 1 / 6, rim: 3 / 6, acc: 5 / 6 };
let mrTex = null;
const wheelMatCache = {};
function wheelMat(rimColor, painted) {
  const k = rimColor + (painted ? 'p' : 'm');
  if (wheelMatCache[k]) return wheelMatCache[k];
  if (!mrTex) {
    // G = råhet, B = metall (three-konvention)
    mrTex = {};
    for (const p of [0, 1]) {
      const d = new Uint8Array([0, 235, 0, 255, 0, p ? 110 : 60, p ? 90 : 230, 255, 0, 30, 255, 255]);
      const t = new THREE.DataTexture(d, 3, 1); t.needsUpdate = true; t.magFilter = t.minFilter = THREE.NearestFilter;
      mrTex[p] = t;
    }
  }
  const c = new THREE.Color(rimColor);
  const col = new Uint8Array([20, 20, 22, 255, ...[c.r, c.g, c.b].map(v => Math.round(Math.pow(v, 1 / 2.2) * 255)), 255, 226, 230, 236, 255]);
  const ct = new THREE.DataTexture(col, 3, 1); ct.colorSpace = THREE.SRGBColorSpace; ct.needsUpdate = true; ct.magFilter = ct.minFilter = THREE.NearestFilter;
  const m = new THREE.MeshStandardMaterial({ map: ct, roughnessMap: mrTex[painted ? 1 : 0], metalnessMap: mrTex[painted ? 1 : 0], roughness: 1, metalness: 1, envMapIntensity: 1.1 });
  return (wheelMatCache[k] = m);
}

/* ================================================================== Kaross (loft) */
// Tvärsnittets högra halva, från bottenmitt runt sidan upp till takmitt: [andel av halvbredd, andel av höjd]
const PROF_BOX = [[0, 0], [0.9, 0], [0.975, 0.025], [1, 0.1], [1, 0.3], [1.006, 0.5], [1, 0.68], [0.99, 0.82], [0.965, 0.92], [0.9, 0.975], [0.72, 0.996], [0.4, 1], [0, 1]];
const PROF_ROUND = [[0, 0], [0.6, 0], [0.82, 0.04], [0.94, 0.14], [0.99, 0.3], [1, 0.48], [0.985, 0.64], [0.94, 0.79], [0.86, 0.9], [0.72, 0.965], [0.5, 0.993], [0.25, 1], [0, 1]];
// Kupéns högra halva (öppen nedtill): list, sidoruta, stolphörn, tak
const CAB = [[1, 0], [1, 0.07], [1, 0.5], [1, 0.86], [0.985, 0.94], [0.93, 0.99], [0.78, 1], [0.4, 1], [0, 1]];
const CAB_FULL = [...CAB, ...CAB.slice(0, -1).reverse().map(([x, y]) => [-x, y])];

/** Delar en indexerad geometri i flera icke-indexerade efter fack (binOf(a, b, c) → index eller -1). */
function splitTris(pos, nor, idx, nBins, binOf) {
  const nt = idx.length / 3, bin = new Int8Array(nt), cnt = new Int32Array(nBins);
  for (let t = 0; t < nt; t++) { const b = binOf(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2], t); bin[t] = b; if (b >= 0) cnt[b]++; }
  const P = [], N = [], o = new Int32Array(nBins);
  for (let b = 0; b < nBins; b++) { P.push(new Float32Array(cnt[b] * 9)); N.push(new Float32Array(cnt[b] * 9)); }
  for (let t = 0; t < nt; t++) {
    const b = bin[t]; if (b < 0) continue;
    for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k] * 3, w = o[b]; P[b][w] = pos[v]; P[b][w + 1] = pos[v + 1]; P[b][w + 2] = pos[v + 2]; N[b][w] = nor[v]; N[b][w + 1] = nor[v + 1]; N[b][w + 2] = nor[v + 2]; o[b] += 3; }
  }
  return P.map((p, b) => { if (!p.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N[b], 3)); return g; });
}

function pointInPoly(r, n, x, y) {
  let ins = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], yi = r[i * 2 + 1], xj = r[j * 2], yj = r[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** Bygger karossens skal (underdel + kupé) och mätfunktioner för att placera detaljer på ytan. */
function buildShell(D, kit) {
  const hl = D.L / 2, wide = kit === 'wide';
  const R = D.r + 0.05;
  const wz = [D.wb / 2 + D.wo, -D.wb / 2 + D.wo];
  const topF = spline(D.top);
  const botF = spline(D.bot || [[-hl, D.by + 0.13], [-hl + 0.55, D.by], [hl - 0.6, D.by], [hl, D.by + 0.15]]);
  const fl = [(D.flareF ?? D.flare ?? 0) + (wide ? 0.075 : 0), (D.flareR ?? D.flare ?? 0) + (wide ? 0.085 : 0)];
  const tF = D.taperF ?? 0.15, tR = D.taperR ?? 0.1;
  const hwBase = z => { const a = clamp((z - (hl - 1.1)) / 1.1, 0, 1), b = clamp(((-hl + 1.1) - z) / 1.1, 0, 1); return D.W / 2 * (1 - tF * a * a - tR * b * b); };
  const hwF = z => hwBase(z) + fl[0] * Math.exp(-(((z - wz[0]) / 0.6) ** 2)) + fl[1] * Math.exp(-(((z - wz[1]) / 0.65) ** 2));
  const rnd = D.round ?? 0.4;
  const prof = PROF_BOX.map((p, i) => [lerp(p[0], PROF_ROUND[i][0], rnd), lerp(p[1], PROF_ROUND[i][1], rnd)]);
  const FULL = [...prof, ...prof.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const NR = FULL.length;
  const valley = D.valley ?? 0.015;
  const sF = D.slantF ?? 0, sR = D.slantR ?? 0;

  // ---- stationer längs z (tätare vid hjulhusen, rundade ändar)
  const rn = D.rn ?? 0.2, rt = D.rt ?? 0.14, NE = 7;
  const st = [];
  for (let k = NE; k >= 1; k--) { const a = k / NE * PI / 2; st.push({ z: -hl + rt - rt * Math.sin(a), d: rt * (1 - Math.cos(a)) }); }
  const z0 = -hl + rt, z1 = hl - rn;
  for (let z = z0; z < z1 - 0.01;) { st.push({ z, d: 0 }); z += wz.some(w => Math.abs(z - w) < R + 0.06) ? 0.022 : 0.07; }
  st.push({ z: z1, d: 0 });
  for (let k = 1; k <= NE; k++) { const a = k / NE * PI / 2; st.push({ z: z1 + rn * Math.sin(a), d: rn * (1 - Math.cos(a)) }); }
  const ns = st.length;

  const slantAt = (y, cy, z) => -sF * (y - cy) * smooth(hl - 0.8, hl, z) + sR * (y - cy) * smooth(-hl + 0.8, -hl, z);
  const ringAt = (z, d, r2) => {
    const b = botF(z), t = topF(z), hw = hwF(z), cy = (b + t) / 2;
    for (let i = 0; i < NR; i++) {
      const fx = FULL[i][0], fy = FULL[i][1];
      let x = fx * hw, y = b + fy * (t - b) - valley * (1 - fx * fx) * smooth(0.8, 1, fy);
      if (d > 0) { x = Math.sign(x) * Math.max(0, Math.abs(x) - d); y = y > cy ? Math.max(cy, y - d) : Math.min(cy, y + d); }
      r2[i * 2] = x; r2[i * 2 + 1] = y;
    }
    return cy;
  };
  const dAt = z => z > z1 ? rn * (1 - Math.cos(Math.asin(Math.min(1, (z - z1) / rn)))) : z < z0 ? rt * (1 - Math.cos(Math.asin(Math.min(1, (z0 - z) / rt)))) : 0;
  const pos = new Float32Array(ns * NR * 3);
  for (let j = 0; j < ns; j++) {
    const s = st[j], r2 = new Float32Array(NR * 2);
    const cy = ringAt(s.z, s.d, r2), t = topF(s.z);
    s.cy = cy; s.r2 = r2;
    // skärmbåge: höj skärmarna mjukt där hjulet annars skulle sticka upp genom huven
    let bump = 0;
    for (const w of wz) { const dz = s.z - w, Rb = R + 0.1; if (Math.abs(dz) < Rb) bump = Math.max(bump, D.r + Math.sqrt(Rb * Rb - dz * dz) - t); }
    for (let i = 0; i < NR; i++) {
      const fx = FULL[i][0], fy = FULL[i][1], x = r2[i * 2];
      let Y = r2[i * 2 + 1];
      if (bump > 0) Y += bump * smooth(0.35, 0.97, Math.abs(fx)) * fy * fy;
      const ax = Math.abs(x), hw = hwF(s.z);
      for (const w of wz) {
        const dz = s.z - w;
        if (Math.abs(dz) < R) { // hjulhus: lyft underkanten till bågen
          const ya = D.r + Math.sqrt(R * R - dz * dz);
          if (Y < ya) Y = lerp(Y, ya, smooth(hw - D.tw - 0.32, hw - D.tw - 0.1, ax));
        }
      }
      const o = (j * NR + i) * 3;
      pos[o] = x; pos[o + 1] = Y; pos[o + 2] = s.z + slantAt(Y, cy, s.z);
    }
  }
  // index + ändlock (egna hörn så att locken får platta normaler)
  const idx = [];
  for (let j = 0; j < ns - 1; j++) for (let i = 0; i < NR; i++) {
    const i1 = (i + 1) % NR, a = j * NR + i, b = j * NR + i1, c = (j + 1) * NR + i, d = (j + 1) * NR + i1;
    idx.push(a, b, c, b, d, c);
  }
  const P = new Float32Array(pos.length + (NR + 1) * 6); P.set(pos); let pn = pos.length;
  for (const [j, e] of [[0, -1], [ns - 1, 1]]) {
    const base = pn / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < NR; i++) { const o = (j * NR + i) * 3; P[pn++] = pos[o]; P[pn++] = pos[o + 1]; P[pn++] = pos[o + 2]; cx += pos[o]; cy += pos[o + 1]; cz += pos[o + 2]; }
    P[pn++] = cx / NR; P[pn++] = cy / NR; P[pn++] = cz / NR + e * 0.004;
    const c = base + NR;
    for (let i = 0; i < NR; i++) { const i1 = (i + 1) % NR; if (e > 0) idx.push(c, base + i, base + i1); else idx.push(c, base + i1, base + i); }
  }
  const lower = new THREE.BufferGeometry();
  lower.setAttribute('position', new THREE.BufferAttribute(P, 3));
  lower.setIndex(idx); lower.computeVertexNormals();

  // ---- mätfunktioner (före hjulhuslyft, men med släpning)
  const mid = st.filter(s => s.d === 0);
  const nearest = z => { let lo = 0, hi = mid.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (mid[m].z < z) lo = m; else hi = m; } return Math.abs(mid[lo].z - z) < Math.abs(mid[hi].z - z) ? mid[lo] : mid[hi]; };
  const sideX = (y, z) => { const r = nearest(z).r2; let best = 0; for (let i = 0; i < NR; i++) { const i1 = (i + 1) % NR, y0 = r[i * 2 + 1], y1 = r[i1 * 2 + 1]; if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) { const x = lerp(r[i * 2], r[i1 * 2], (y - y0) / (y1 - y0)); if (x > best) best = x; } } return best; };
  const topY = (x, z) => { const r = nearest(z).r2; let best = -1; for (let i = 0; i < NR; i++) { const i1 = (i + 1) % NR, x0 = r[i * 2], x1 = r[i1 * 2]; if ((x0 - x) * (x1 - x) <= 0 && x0 !== x1) { const y = lerp(r[i * 2 + 1], r[i1 * 2 + 1], (x - x0) / (x1 - x0)); if (y > best) best = y; } } return best < 0 ? topF(z) : best; };
  const endZ = (x, y, e) => {
    const z = endZ0(x, y, e);
    if (z !== null) return z;
    // punkten ligger utanför karossen: flytta den mot mitten tills den träffar
    for (let k = 1; k <= 6; k++) { const yy = lerp(y, S0.cy, k / 6), xx = x * (1 - k / 12), z2 = endZ0(xx, yy, e); if (z2 !== null) return z2; }
    return e * hl;
  };
  const S0 = st[Math.floor(ns / 2)];
  const tmpR = new Float32Array(NR * 2);
  const endZ0 = (x, y, e) => {
    const ax = Math.abs(x);
    let jIn = -1;
    if (e > 0) { for (let j = ns - 1; j >= 0; j--) if (pointInPoly(st[j].r2, NR, ax, y)) { jIn = j; break; } }
    else { for (let j = 0; j < ns; j++) if (pointInPoly(st[j].r2, NR, ax, y)) { jIn = j; break; } }
    if (jIn < 0) return null;
    const jOut = jIn + e;
    let zi = st[jIn].z, cy = st[jIn].cy;
    if (jOut >= 0 && jOut < ns) { // bisektion mot nästa (yttre) station
      let zo = st[jOut].z;
      for (let k = 0; k < 7; k++) { const zm = (zi + zo) / 2, c = ringAt(zm, dAt(zm), tmpR); if (pointInPoly(tmpR, NR, ax, y)) { zi = zm; cy = c; } else zo = zm; }
    }
    return zi + slantAt(y, cy, zi);
  };

  // ---- kupé
  const cab = { paint: [], glass: [], trim: [], chrome: [] };
  if (D.roof) {
    const rp = D.roof.map(p => p.slice());
    const zA = rp[0][0], zE = rp[rp.length - 1][0];
    rp[0][1] = topF(zA) - 0.04; rp[rp.length - 1][1] = topF(zE) - 0.04;
    const roofF = spline(rp);
    const zs = [];
    for (let z = zA; z < zE - 0.005; z += 0.045) zs.push(z);
    zs.push(zE);
    const extra = [D.zrf, D.zrr, D.cpil, ...(D.pillars || []).flatMap(p => [p[0] - p[1], p[0] + p[1]])].filter(v => v > zA && v < zE);
    for (const v of extra) zs.push(v);
    zs.sort((a, b) => a - b);
    const NC = CAB_FULL.length, cw = D.cabW ?? 0.9, tb = D.tumble ?? 0.8;
    const cp = new Float32Array(zs.length * NC * 3);
    zs.forEach((z, j) => {
      const hb = hwBase(z) * cw, ht = hb * tb, Yt = roofF(z);
      for (let i = 0; i < NC; i++) {
        const [fx, fy] = CAB_FULL[i];
        const x = fx * lerp(hb, ht, fy);
        const bx = topY(Math.min(Math.abs(fx * hb), hwBase(z) * 0.98), z) - 0.02;
        let y = Yt > bx ? bx + fy * (Yt - bx) : bx;
        y += 0.02 * (1 - fx * fx) * smooth(0.9, 1, fy) * clamp((Yt - bx) / 0.25, 0, 1);
        const o = (j * NC + i) * 3; cp[o] = x; cp[o + 1] = y; cp[o + 2] = z;
      }
    });
    const ci = [];
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < NC - 1; i++) { const a = j * NC + i, b = a + 1, c = a + NC, d = c + 1; ci.push(a, b, c, b, d, c); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals();
    const cn = cg.attributes.normal.array;
    const BIN = ['paint', 'glass', 'trim', 'chrome', 'glass2'], BI = { paint: 0, glass: 1, trim: 2, chrome: 3, glass2: 4 };
    const quadBin = (j, i) => {
      const seg = i < 8 ? i : 15 - i; // 0 list, 1–2 sida, 3–4 stolphörn, 5–7 tak
      const zm = (zs[j] + zs[j + 1]) / 2;
      const zone = zm > D.zrf ? 'w' : zm < D.zrr ? 'r' : 'm';
      if (D.open) return zone !== 'w' ? -1 : seg >= 5 ? 4 : seg >= 3 ? 3 : -1;
      if (seg === 0) return 2;
      if (seg <= 2) { let b = zm < D.cpil ? 0 : 1; for (const p of (D.pillars || [])) if (Math.abs(zm - p[0]) < p[1]) b = p[2] ? 2 : 0; return b; }
      if (seg <= 4) return 0;
      return zone === 'm' || (zone === 'r' && D.rearGlass === false) ? 0 : 1;
    };
    const res = splitTris(cp, cn, ci, 5, (a, b, c, t) => { const q = t >> 1, j = Math.floor(q / (NC - 1)); return quadBin(j, q - j * (NC - 1)); });
    res.forEach((g, k) => { if (!g) return; if (k === 4) { cab.glass.push(g); cab.glass2 = true; } else cab[BIN[k]].push(g); });
    cab.roofF = roofF; cab.zA = zA; cab.zE = zE;
    cab.hwAt = z => hwBase(z) * cw * tb;
  }

  // dela underdelen: botten (nedåtvänd) → trim, resten lack
  const ln = lower.attributes.normal.array, li = lower.index.array, lpos = lower.attributes.position.array;
  const nq = (ns - 1) * NR * 2;
  const [bodyPaint, bodyTrim] = splitTris(lpos, ln, li, 2, (a, b, c, t) => {
    if (t >= nq) return 0;
    const t0 = (t & ~1) * 3; let sy = 0; for (let k = 0; k < 6; k++) sy += ln[li[t0 + k] * 3 + 1];
    return sy < -5.4 ? 1 : 0; // hela fyrhörningar, så att rundade trösklar inte blir sågtandade
  });
  let Hs = 0; for (let z = -hl; z <= hl; z += 0.1) Hs = Math.max(Hs, topF(z));
  return {
    D, hl, R, wz, topF, botF, hwF, hwBase, sideX, topY, endZ, Hs: Hs + 0.05, cab,
    bodyPaint, bodyTrim
  };
}

/* ================================================================== Hjul */
// Hjulet byggs med axeln längs y (lathe) och vänds sedan så att axeln ligger längs x, fälgens framsida mot +x.
function tireGeo(r, tw, rimR, seg, lugs, depth, simple = false) {
  const h = tw / 2, P = [];
  const add = (rad, y) => P.push(new THREE.Vector2(rad, y));
  add(rimR, -h * 0.9); add(rimR + 0.012, -h); add(lerp(rimR, r, 0.55), -h - 0.01); add(r - 0.028, -h * 0.97); add(r - 0.006, -h * 0.84); if (simple) add(r, -h * 0.66);
  // slitbana med två längsgående spår
  if (!simple) for (const [a, b] of [[-0.66, -0.25], [-0.17, 0.17]]) { add(r, h * a); add(r, h * b); add(r - 0.012, h * b + 0.002); add(r - 0.012, h * (b + 0.08) - 0.002); }
  if (!simple) add(r, h * 0.25);
  add(r, h * 0.66);
  add(r - 0.006, h * 0.84); add(r - 0.028, h * 0.97); add(lerp(rimR, r, 0.55), h + 0.01); add(rimR + 0.012, h); add(rimR, h * 0.9);
  const g = new THREE.LatheGeometry(P, seg);
  if (lugs) { // klossmönster: sänk varannan kloss i slitbanan
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), rad = Math.hypot(x, z);
      if (rad > r - 0.004) {
        const a = Math.atan2(z, x), y = p.getY(i);
        const k = Math.floor(((a / (PI * 2)) * lugs + (y > 0 ? 0.5 : 0) + 100)) % 2;
        if (k) { const s = (rad - depth) / rad; p.setX(i, x * s); p.setZ(i, z * s); }
      }
    }
    g.computeVertexNormals();
  }
  return g;
}
function rimFace(style, rimR, h) {
  // returnerar { rim: [], acc: [], dark: [] } geometrier i lathe-ramen (axel y, framsida +y)
  const rim = [], acc = [], dark = [];
  const deep = style === 'skal';
  const faceY = deep ? -h * 0.15 : h * 0.42;
  // fälgbana + läpp + bakre skiva
  const L = [];
  const add = (a, b) => L.push(new THREE.Vector2(a, b));
  add(0.001, -h * 0.55); add(rimR - 0.03, -h * 0.55); add(rimR - 0.012, -h * 0.75); add(rimR - 0.012, h * 0.72);
  add(rimR + 0.012, h * 0.8); add(rimR + 0.006, h * 0.9); add(rimR - (deep ? 0.055 : 0.022), h * 0.88);
  add(rimR - (deep ? 0.06 : 0.028), faceY + 0.01);
  rim.push(new THREE.LatheGeometry(L, 24));
  dark.push(new THREE.CircleGeometry(rimR - 0.02, 20).rotateX(-PI / 2).translate(0, -h * 0.5, 0)); // mörk insida syns mellan ekrarna
  const hub = (rad, len, y, list = rim, seg = 16) => list.push(new THREE.CylinderGeometry(rad, rad * 1.05, len, seg).translate(0, y, 0));
  const spoke = (ang, w, t, r0, r1, y, twist = 0, list = rim, tilt = 0) => {
    const g = new THREE.BoxGeometry(w, t, r1 - r0);
    if (twist) g.rotateZ(twist);
    g.translate(0, 0, (r0 + r1) / 2);
    if (tilt) g.rotateX(tilt);
    g.translate(0, y, 0); g.rotateY(ang); list.push(g);
  };
  const lugs = (n, rr, y) => { for (let k = 0; k < n; k++) { const a = k / n * PI * 2; acc.push(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6).translate(Math.cos(a) * rr, y + 0.01, Math.sin(a) * rr)); } };
  const R1 = rimR - 0.02;
  switch (style) {
    case 'fem': // fem dubbelekrar
      for (let k = 0; k < 5; k++) for (const o of [-0.09, 0.09]) spoke(k / 5 * PI * 2 + o, 0.022, 0.03, 0.06, R1, faceY, 0);
      hub(0.075, 0.05, faceY); lugs(5, 0.05, faceY + 0.02); acc.push(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12).translate(0, faceY + 0.035, 0));
      break;
    case 'mesh': // flerekrar i kors
      for (let k = 0; k < 12; k++) { spoke(k / 12 * PI * 2, 0.012, 0.02, 0.06, R1, faceY, 0, rim, 0); spoke(k / 12 * PI * 2 + PI / 12, 0.01, 0.018, 0.1, R1, faceY - 0.012, 0.0); }
      for (let k = 0; k < 24; k++) { const g = new THREE.BoxGeometry(0.008, 0.014, (R1 - 0.07) * 0.62); g.translate(0, 0, (R1 + 0.07) / 2); g.rotateY(0.32); g.translate(0, faceY + 0.004, 0); g.rotateY(k / 24 * PI * 2); rim.push(g); }
      hub(0.07, 0.05, faceY); acc.push(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12).translate(0, faceY + 0.035, 0));
      break;
    case 'turbin': { // turbinblad + slät skiva
      const disc = new THREE.CylinderGeometry(R1 * 0.98, R1, 0.012, 28).translate(0, faceY - 0.02, 0); rim.push(disc);
      for (let k = 0; k < 14; k++) spoke(k / 14 * PI * 2, 0.05, 0.012, 0.09, R1 - 0.01, faceY - 0.004, 0.75);
      hub(0.09, 0.05, faceY + 0.005); acc.push(new THREE.CylinderGeometry(0.04, 0.05, 0.02, 14).translate(0, faceY + 0.035, 0));
      break;
    }
    case 'skal': // djup skål: bred polerad läpp + åtta korta ekrar långt in
      acc.push(new THREE.RingGeometry(R1 - 0.05, rimR + 0.005, 28).rotateX(-PI / 2).translate(0, h * 0.89, 0));
      for (let k = 0; k < 8; k++) spoke(k / 8 * PI * 2, 0.035, 0.03, 0.06, R1 - 0.03, faceY, 0);
      hub(0.08, 0.06, faceY); lugs(5, 0.055, faceY + 0.025);
      break;
    case 'stal': { // stålfälg med hål och kromad navkapsel
      rim.push(new THREE.CylinderGeometry(R1, R1, 0.014, 28).translate(0, faceY - 0.02, 0));
      for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; dark.push(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 10).translate(Math.cos(a) * R1 * 0.68, faceY - 0.011, Math.sin(a) * R1 * 0.68)); }
      const cap = new THREE.SphereGeometry(R1 * 0.56, 20, 6, 0, PI * 2, 0, PI * 0.32); cap.translate(0, faceY - 0.02 - R1 * 0.56 * Math.cos(PI * 0.32) + 0.01, 0);
      acc.push(cap);
      break;
    }
    case 'racing': // sex tunna ekrar + centrummutter
      for (let k = 0; k < 6; k++) spoke(k / 6 * PI * 2, 0.026, 0.034, 0.05, R1, faceY, 0, rim, -0.08);
      hub(0.065, 0.05, faceY);
      acc.push(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6).translate(0, faceY + 0.035, 0));
      break;
    case 'trad': { // trådekrar i två lager + knock-off
      for (let k = 0; k < 32; k++) {
        const a = k / 32 * PI * 2, side = k % 2 ? 1 : -1;
        const p0 = new THREE.Vector3(Math.cos(a) * 0.06, faceY - 0.03 * side - 0.02, Math.sin(a) * 0.06);
        const a2 = a + side * 0.5;
        const p1 = new THREE.Vector3(Math.cos(a2) * (R1 - 0.005), faceY - 0.005, Math.sin(a2) * (R1 - 0.005));
        const len = p0.distanceTo(p1);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(_q.setFromUnitVectors(_v1.set(0, 1, 0), _v2.copy(p1).sub(p0).normalize()));
        const cc = new THREE.CylinderGeometry(0.0035, 0.0035, len, 4).applyMatrix4(m).translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
        acc.push(cc);
      }
      hub(0.07, 0.07, faceY - 0.02, acc);
      for (let k = 0; k < 2; k++) { const g = new THREE.BoxGeometry(0.16, 0.025, 0.03); g.rotateY(k * PI / 2 + 0.3); g.translate(0, faceY + 0.03, 0); acc.push(g); }
      break;
    }
    default: // fem breda ekrar (grundfälg)
      for (let k = 0; k < 5; k++) { const sh = poly([[-0.03, 0], [0.03, 0], [0.05, 1], [-0.05, 1]]); const g = slab(sh, 0.035, 0.004); g.scale(1, R1 - 0.06, 1); g.rotateX(PI / 2); g.translate(0, faceY, 0.06); g.rotateY(k / 5 * PI * 2); rim.push(g); }
      hub(0.08, 0.05, faceY); lugs(5, 0.052, faceY + 0.02);
      acc.push(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12).translate(0, faceY + 0.035, 0));
  }
  return { rim, acc, dark };
}
const wheelCache = {};
/** Ett helt hjul (däck + fälg) som en geometri med 3-texel-uv. lod: 0 full, 1 enkel. */
function wheelGeo(style, r, tw, offroad, lod) {
  const k = [style, r, tw, offroad ? 1 : 0, lod].join('|');
  if (wheelCache[k]) return wheelCache[k];
  const rimR = r * (offroad ? 0.56 : 0.66), h = tw / 2;
  const parts = [];
  parts.push(constUv(tireGeo(r, tw, rimR, lod ? 16 : 36, lod ? 0 : 18, offroad ? 0.022 : 0.006, !!lod), RIM_U.tire));
  if (lod) {
    const L = [new THREE.Vector2(0.001, -h * 0.5), new THREE.Vector2(rimR, -h * 0.5), new THREE.Vector2(rimR, h * 0.8), new THREE.Vector2(rimR - 0.03, h * 0.5), new THREE.Vector2(0.001, h * 0.5)];
    parts.push(constUv(new THREE.LatheGeometry(L, 12), RIM_U.rim));
  } else {
    const f = rimFace(style, rimR, h);
    for (const g of f.rim) parts.push(constUv(g, RIM_U.rim));
    for (const g of f.acc) parts.push(constUv(g, RIM_U.acc));
    for (const g of f.dark) parts.push(constUv(g, RIM_U.tire));
  }
  const g = mergeGeometries(parts.map(p => prep(p)));
  g.rotateZ(-PI / 2); // axel y → x, framsida (+y) → +x
  g.computeBoundingSphere();
  return (wheelCache[k] = g);
}

/* ================================================================== Ytdetaljer */
/** Rutnät fn(u, v) → [x, y, z] (u, v ∈ [0, 1]); vänds så att normalen pekar mot `out`. uv = (u, v). */
function surfGrid(nu, nv, fn, out) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; pos.push(...fn(u, v)); uv.push(u, v); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  // riktning: jämför mittfyrhörningens normal med out
  const mi = Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2), P = k => _v1.fromArray(pos, k * 3).clone();
  const n = P(mi + 1).sub(P(mi)).cross(P(mi + nu + 1).sub(P(mi)));
  if (n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Panelformer: (v, w, h) → [vänster, höger] i lokal u-led (u = utåt). */
const PANEL = {
  rect: (v, w) => [-w / 2, w / 2],
  ellipse: (v, w) => { const e = Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2)); return [-w / 2 * e, w / 2 * e]; },
  rrect: (v, w, h) => { const cr = Math.min(0.035, h / 2, w / 2), q = Math.min(v, 1 - v) * h; const ins = q < cr ? cr - Math.sqrt(Math.max(0, cr * cr - (cr - q) ** 2)) : 0; return [-w / 2 + ins, w / 2 - ins]; },
  trap: (v, w) => [-w / 2 * (1 - 0.25 * v), w / 2 * (1 - 0.25 * v)],
  trapInv: (v, w) => [-w / 2 * (0.78 + 0.22 * v), w / 2 * (0.78 + 0.22 * v)],
  slim: (v, w) => [-w / 2 + w * 0.12 * v, w / 2 - w * 0.4 * v],
  hex: (v, w) => { const k = 1 - 0.3 * Math.abs(2 * v - 1) ** 1.5; return [-w / 2 * k, w / 2 * k]; }
};
/** Panel som följer bilens front (e = 1) eller akter (e = -1). cx = mitt i x, s = sida (±1, speglar formen). */
function endPanel(S, e, cx, cy, w, h, shape = 'rect', off = 0.006, s = 1, shear = 0, nu = 6, nv = 4, flipU = false) {
  const f = PANEL[shape] || PANEL.rect;
  return surfGrid(nu, nv, (u, v) => {
    const [a, b] = f(v, w, h);
    const uu = flipU ? 1 - u : u;
    const x = cx + s * lerp(a, b, uu), y = cy + (v - 0.5) * h + (uu - 0.5) * shear;
    return [x, y, S.endZ(x, y, e) + e * off];
  }, [0, 0, e]);
}
/** Remsa längs sidan (s = ±1) mellan z0 och z1; y0(z)/y1(z) ger undre/övre kant. */
function sidePanel(S, s, z0, z1, y0, y1, off = 0.005, nu = 8, nv = 2) {
  return surfGrid(nu, nv, (u, v) => {
    const z = lerp(z0, z1, u), y = lerp(typeof y0 === 'function' ? y0(z) : y0, typeof y1 === 'function' ? y1(z) : y1, v);
    return [s * (S.sideX(y, z) + off), y, z];
  }, [s, 0, 0]);
}
/** Lapp ovanpå karossen (huv/tak/däck). */
function topPanel(S, x0, x1, z0, z1, off = 0.005, nu = 4, nv = 6, yFn = null) {
  return surfGrid(nu, nv, (u, v) => {
    const x = lerp(x0, x1, u), z = lerp(z0, z1, v);
    return [x, (yFn ? yFn(x, z) : S.topY(x, z)) + off, z];
  }, [0, 1, 0]);
}
/** Placerar en geometri (byggd vänd mot +z) på front/akter i (x, y), vinklad efter ytan. */
function place(S, g, x, y, e, out = 0.01) {
  const z = S.endZ(x, y, e);
  const dx = clamp((S.endZ(x + 0.06, y, e) - S.endZ(x - 0.06, y, e)) / 0.12, -2.5, 2.5);
  const dy = clamp((S.endZ(x, y + 0.04, e) - S.endZ(x, y - 0.04, e)) / 0.08, -2.5, 2.5);
  if (e < 0) g.rotateY(PI);
  const n = _v2.set(-e * dx, -e * dy, e).normalize();
  _q.setFromUnitVectors(_v1.set(0, 0, e), n);
  g.applyMatrix4(_mtx.makeRotationFromQuaternion(_q));
  g.translate(x + n.x * out, y + n.y * out, z + n.z * out);
  return g;
}

/* ---------------- Lampor */
// Lampuppsättning per stil: lista av { shape, w, h, ou (utåt), ov (upp), shear } relativt lampans mittpunkt
function lampSet(style, w, h) {
  switch (style) {
    case 'slim': return [{ shape: 'slim', w, h, shear: -h * 0.5 }];
    case 'sharp': return [{ shape: 'trap', w, h, shear: -h * 0.6 }];
    case 'angry': return [{ shape: 'slim', w, h: h * 0.8, shear: -h * 0.9 }];
    case 'slit': return [{ shape: 'rect', w, h: h * 0.45, shear: -h * 0.5 }];
    case 'rect': case 'wrap': return [{ shape: 'rrect', w, h }];
    case 'vert': return [{ shape: 'rrect', w, h }];
    case 'round': case 'roundsmall': return [{ shape: 'ellipse', w: h, h }];
    case 'round2': case 'quadround': case 'round4': return [{ shape: 'ellipse', w: h, h, ou: -w / 4 }, { shape: 'ellipse', w: h * 0.92, h: h * 0.92, ou: w / 4 }];
    case 'square': return [{ shape: 'rect', w: w * 0.46, h, ou: -w / 4 }, { shape: 'rect', w: w * 0.46, h, ou: w / 4 }];
    case 'roundbox': return [{ shape: 'ellipse', w: h * 0.8, h: h * 0.8 }];
    case 'tribar': return [-1, 0, 1].map(k => ({ shape: 'rect', w: w * 0.22, h, ou: k * w * 0.33 }));
    case 'fins': return [{ shape: 'ellipse', w, h }];
    case 'strip': case 'slimbar': return [{ shape: 'slim', w: w * 0.8, h: h * 0.7, shear: -h * 0.2 }];
    case 'rectbar': return [{ shape: 'rrect', w, h }];
    default: return [{ shape: 'rrect', w, h }];
  }
}
function addLamps(S, add, L, e, matKind) {
  if (!L || L.style === 'none') return;
  // håll lamporna innanför hörnrundningen och under huv-/däckkanten
  const hl = S.hl, hwEnd = S.hwF(e * (hl - 0.3)), wide = /round|square|tribar|roundbox/.test(L.style) ? 0 : 1;
  L = Object.assign({}, L);
  L.x = Math.min(L.x, hwEnd * 0.88 - L.w / 2 * wide - 0.02);
  L.y = Math.min(L.y, S.topF(e * (hl - 0.15)) - 0.04 - L.h / 2);
  const set = lampSet(L.style, L.w, L.h);
  const bez = L.bezel || 'trim';
  for (const s of [-1, 1]) for (const p of set) {
    const cx = s * (L.x + (p.ou || 0)), cy = L.y + (p.ov || 0);
    add(matKind, endPanel(S, e, cx, cy, p.w, p.h, p.shape, 0.012, s, p.shear || 0, p.shape === 'ellipse' ? 10 : 6, p.shape === 'ellipse' ? 8 : 4));
    add(bez, endPanel(S, e, cx, cy, p.w + 0.03, p.h + 0.03, p.shape, 0.007, s, p.shear || 0, 6, p.shape === 'ellipse' ? 8 : 4), true);
    if (L.style === 'roundbox') add('chrome', endPanel(S, e, cx, cy, p.h * 1.3, p.h * 1.3, 'rrect', 0.005, s), true);
  }
  // ljuslist tvärs över (eldrivna m.fl.)
  if (L.style === 'strip' || L.style === 'slimbar' || L.bar) {
    const bw = 2 * L.x + (L.style === 'strip' ? L.w * 0.3 : 0), by = L.y + (L.barDy ?? (L.style === 'strip' ? L.h * 0.45 : 0));
    add(matKind, endPanel(S, e, 0, by, bw, L.barH ?? 0.024, 'rect', 0.011, 1, 0, 20, 1));
    add('trim', endPanel(S, e, 0, by, bw + 0.02, (L.barH ?? 0.024) + 0.025, 'rect', 0.007, 1, 0, 20, 1), true);
  }
  if (L.style === 'rectbar' && e < 0) add('trim', endPanel(S, e, 0, L.y, 2 * L.x - L.w - 0.02, L.h * 0.8, 'rect', 0.009, 1, 0, 10, 1));
}

/* ---------------- Grill */
function addGrille(S, add, Gr) {
  if (!Gr || Gr.style === 'none') return;
  const { y, w, h } = Gr;
  const slats = (n, mat, ww, hh, yy, off = 0.012) => { for (let k = 0; k < n; k++) add(mat, endPanel(S, 1, 0, yy - hh / 2 + (k + 0.5) * hh / n, ww, 0.012, 'rect', off, 1, 0, 10, 1), true); };
  const vbars = (n, mat, ww, hh, yy) => { for (let k = 0; k < n; k++) add(mat, endPanel(S, 1, -ww / 2 + (k + 0.5) * ww / n, yy, 0.012, hh, 'rect', 0.012, 1, 0, 1, 4), true); };
  switch (Gr.style) {
    case 'modern':
      add('trim', endPanel(S, 1, 0, y + h * 0.35, w * 0.55, h * 0.22, 'rrect', 0.006, 1, 0, 8, 2));
      add('trim', endPanel(S, 1, 0, y - h * 0.25, w, h * 0.45, 'trapInv', 0.006, 1, 0, 10, 3));
      slats(2, 'chrome', w * 0.5, h * 0.18, y + h * 0.35, 0.009);
      break;
    case 'wide':
      add('trim', endPanel(S, 1, 0, y, w, h, 'rrect', 0.006, 1, 0, 10, 3)); slats(3, 'chrome', w * 0.96, h * 0.85, y);
      add('trim', endPanel(S, 1, 0, y - h * 1.1, w * 0.8, h * 0.4, 'trap', 0.006, 1, 0, 10, 2));
      break;
    case 'smile': add('trim', endPanel(S, 1, 0, y, w, h, 'ellipse', 0.006, 1, 0, 14, 6)); break;
    case 'sport':
      add('trim', endPanel(S, 1, 0, y, w, h, 'hex', 0.006, 1, 0, 12, 4));
      for (const s of [-1, 1]) add('trim', endPanel(S, 1, s * (w / 2 + 0.2), y - h * 0.1, 0.24, h * 0.7, 'trap', 0.006, s));
      break;
    case 'oval': add('trim', endPanel(S, 1, 0, y, w, h, 'ellipse', 0.006, 1, 0, 14, 6)); add('chrome', endPanel(S, 1, 0, y, w + 0.03, h + 0.03, 'ellipse', 0.004, 1, 0, 14, 6), true); break;
    case 'muscle':
      add('trim', endPanel(S, 1, 0, y, w, h, 'rect', 0.006, 1, 0, 14, 3));
      add('chrome', endPanel(S, 1, 0, y, w + 0.04, h + 0.04, 'rect', 0.003, 1, 0, 14, 3));
      slats(4, 'chrome', w * 0.3, h * 0.8, y);
      break;
    case 'muscleModern':
      add('trim', endPanel(S, 1, 0, y, w, h, 'trapInv', 0.006, 1, 0, 12, 4));
      slats(3, 'trim', w * 0.9, h * 0.8, y, 0.01);
      add('trim', endPanel(S, 1, 0, y - h * 1.0, w * 1.2, h * 0.45, 'trap', 0.006, 1, 0, 12, 2));
      break;
    case 'classic':
      add('chrome', endPanel(S, 1, 0, y, w + 0.05, h + 0.05, 'ellipse', 0.004, 1, 0, 14, 6));
      add('trim', endPanel(S, 1, 0, y, w, h, 'ellipse', 0.007, 1, 0, 14, 6));
      vbars(7, 'chrome', w * 0.8, h * 0.75, y);
      break;
    case 'slots': for (let k = -2; k <= 2; k++) add('trim', endPanel(S, 1, k * w / 5, y, w / 9, h, 'rrect', 0.007, 1, 0, 2, 4)); break;
    case 'truck':
      add('chrome', endPanel(S, 1, 0, y, w + 0.08, h + 0.08, 'rrect', 0.004, 1, 0, 14, 4));
      add('trim', endPanel(S, 1, 0, y, w, h, 'rect', 0.008, 1, 0, 14, 4));
      slats(3, 'chrome', w, h * 0.9, y, 0.012); vbars(2, 'chrome', w * 0.35, h, y);
      break;
    case 'gt':
      add('chrome', endPanel(S, 1, 0, y, w + 0.04, h + 0.04, 'ellipse', 0.004, 1, 0, 16, 6));
      add('trim', endPanel(S, 1, 0, y, w, h, 'ellipse', 0.007, 1, 0, 16, 6));
      slats(4, 'chrome', w * 0.85, h * 0.7, y, 0.01);
      break;
    case 'ev': add('trim', endPanel(S, 1, 0, y, w, h, 'rrect', 0.006, 1, 0, 10, 2)); break;
  }
}
/** Registreringsskylt (uv 0–1 läsbar från rätt håll). */
function plateGeo(S, e, y) {
  const w = 0.52, h = 0.11;
  return surfGrid(4, 1, (u, v) => { const x = e > 0 ? (u - 0.5) * w : (0.5 - u) * w, yy = y + (v - 0.5) * h; return [x, yy, S.endZ(x, yy, e) + e * 0.014]; }, [0, 0, e]);
}

/* ---------------- Vingar och spoilers */
function airfoil(c, t) {
  const s = new THREE.Shape();
  s.moveTo(c / 2, 0); s.quadraticCurveTo(c / 2, t, c / 5, t); s.quadraticCurveTo(-c / 4, t * 0.95, -c / 2, t * 0.3);
  s.lineTo(-c / 2, 0.004); s.quadraticCurveTo(0, -t * 0.25, c / 2, 0);
  return s;
}
function addSpoiler(S, add, id, isHatch) {
  const D = S.D, hl = S.hl, cab = S.cab;
  if (!id || id === 'none') return;
  const zt = -hl + (D.rt ?? 0.14) + 0.14, yt = S.topY(0, zt);
  const hwT = S.hwF(zt) * 0.92;
  const roofEdge = isHatch && cab.roofF ? { z: D.zrr - 0.02, y: cab.roofF(D.zrr - 0.02), hw: cab.hwAt(D.zrr) } : null;
  const wing = (c, t, width, z, y, aoa, mat = 'paint') => { const g = sideSlab(airfoil(c, t), width, 0.006); g.rotateX(aoa); g.translate(0, y, z); add(mat, g); };
  const plate = (pts, x, z, y, th = 0.02) => add('trim', sideSlab(poly(pts), th, 0.003).translate(x, y, z));
  if (id === 'lip') {
    if (roofEdge) { const g = sideSlab(poly([[0.02, 0], [-0.26, -0.03], [-0.28, 0.0], [0.02, 0.05]]), roofEdge.hw * 2 * 0.98, 0.008); g.translate(0, roofEdge.y + 0.0, roofEdge.z); add('paint', g); }
    else { const g = sideSlab(poly([[0.18, 0], [-0.06, 0.0], [-0.08, 0.055], [0.0, 0.05]]), hwT * 2 * 0.95, 0.008); g.translate(0, yt - 0.01, -hl + 0.12); add('paint', g); }
  } else if (id === 'duck') {
    const zz = roofEdge ? roofEdge.z : -hl + 0.06, yy = roofEdge ? roofEdge.y : S.topY(0, -hl + 0.1);
    const g = sideSlab(poly([[0.45, -0.01], [0.15, 0.01], [-0.06, 0.09], [-0.1, 0.085], [-0.06, 0.0]]), (roofEdge ? roofEdge.hw : hwT) * 2 * 0.98, 0.01);
    g.translate(0, yy - 0.012, zz); add('paint', g);
  } else if (id === 'rally') {
    if (roofEdge) {
      wing(0.34, 0.06, roofEdge.hw * 2 * 1.05, roofEdge.z - 0.12, roofEdge.y + 0.06, 0.1);
      for (const s of [-1, 1]) plate([[0.18, 0.12], [-0.3, 0.1], [-0.3, -0.06], [0.1, -0.08], [0.25, 0.03]], s * roofEdge.hw * 1.05, roofEdge.z - 0.12, roofEdge.y + 0.06);
    } else {
      const y = yt + 0.26;
      wing(0.32, 0.055, hwT * 2 * 1.02, -hl + 0.28, y, 0.12);
      for (const s of [-1, 1]) { add('trim', box(0.03, 0.27, 0.16, s * hwT * 0.55, yt + 0.13, -hl + 0.3)); plate([[0.18, 0.1], [-0.2, 0.12], [-0.2, -0.06], [0.18, -0.04]], s * hwT * 1.02, -hl + 0.28, y); }
    }
  } else if (id === 'gt' || id === 'swan') {
    const swan = id === 'swan', W = Math.min(D.W * 1.0, hwT * 2 + 0.25), c = swan ? 0.42 : 0.36;
    const z = isHatch ? -hl + 0.25 : -hl + 0.32, base = isHatch ? S.topY(0, z) : yt, y = base + (swan ? 0.42 : 0.33);
    wing(c, 0.06, W, z, y, swan ? 0.16 : 0.12, D.wingMat || 'paint');
    if (swan) { wing(c * 0.5, 0.035, W - 0.06, z - c * 0.45, y + 0.08, 0.4, 'trim'); }
    for (const s of [-1, 1]) {
      plate([[c * 0.6, 0.12], [-c * 0.7, 0.16], [-c * 0.7, -0.1], [c * 0.4, -0.08]], s * (W / 2 + 0.01), z, y);
      const sx = s * W * 0.3;
      if (swan) { // svanhals: stöd som går upp bakom och fäster ovanpå vingen
        const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([sx, lerp(base, y + 0.1, Math.sin(t * PI / 2)), z - 0.14 + Math.sin(t * PI) * -0.08 + t * 0.12]); }
        add('trim', tube(pts, 0.018, 12, 6));
      } else plate([[0.08, 0], [-0.1, 0], [-0.06, y - base], [0.04, y - base]], sx, z, base, 0.025);
    }
  }
}

/* ================================================================== Montering av alla delar */
function buildParts(D, kit, spoiler) {
  const S = buildShell(D, kit);
  const hl = S.hl, cab = S.cab, F = D.feat || {};
  const parts = { paint: [], glass: [], trim: [], chrome: [], head: [], tail: [] };
  const add = (k, g, small = false) => { if (g) parts[k].push({ g, small }); };
  add('paint', S.bodyPaint); add('trim', S.bodyTrim);
  for (const k of ['paint', 'glass', 'trim', 'chrome']) for (const g of cab[k]) add(k, g);
  const isHatch = !!D.roof && D.zrr - (D.roof[0][0]) < 0.6 && D.roof[0][0] < -hl + 0.5 && !D.open;
  const by = D.by, zMid = D.wo;

  // ---- hjulhus (mörka innerskärmar + innervägg)
  const wheelX = [];
  for (const w of S.wz) {
    const hw = S.hwF(w), x1 = hw - 0.012, x0 = Math.max(0.12, hw - D.tw - 0.16), R = S.R - 0.006;
    wheelX.push(hw - D.tw / 2 - 0.03);
    for (const s of [-1, 1]) {
      add('trim', surfGrid(1, 14, (u, v) => { const a = lerp(-0.12, PI + 0.12, v); return [s * lerp(x0, x1, u), D.r + Math.sin(a) * R, w + Math.cos(a) * R]; }, [0, -1, 0]));
      add('trim', surfGrid(14, 1, (u, v) => { const a = lerp(-0.12, PI + 0.12, u); return [s * x0, D.r + Math.sin(a) * R * v, w + Math.cos(a) * R * v]; }, [-s, 0, 0]));
    }
  }

  // ---- lampor, grill, skyltar
  const noseTop = S.topF(hl - (D.rn ?? 0.2) - 0.05), tailTop = S.topF(-hl + (D.rt ?? 0.14) + 0.05);
  const H = Object.assign({ style: 'rect', x: S.hwF(hl - 0.35) * 0.62, y: noseTop - 0.1, w: 0.34, h: 0.1 }, D.head);
  const T = Object.assign({ style: 'wrap', x: S.hwF(-hl + 0.3) * 0.7, y: tailTop - 0.12, w: 0.34, h: 0.1 }, D.tail);
  addLamps(S, add, H, 1, 'head');
  addLamps(S, add, T, -1, 'tail');
  addGrille(S, add, D.grille && Object.assign({ y: H.y - 0.17, w: H.x * 1.1, h: 0.14 }, D.grille));
  const plY = D.plateY || [by + 0.17, T.y - 0.2];
  const plates = [plateGeo(S, 1, plY[0]), plateGeo(S, -1, plY[1])];
  add('trim', endPanel(S, 1, 0, plY[0], 0.55, 0.135, 'rrect', 0.01, 1, 0, 4, 1), true);
  add('trim', endPanel(S, -1, 0, plY[1], 0.55, 0.135, 'rrect', 0.01, 1, 0, 4, 1), true);
  // nedre luftintag / diffusor (moderna bilar)
  if (D.lowerIntake !== false && !D.bumpers) add('trim', endPanel(S, 1, 0, by + 0.07, S.hwF(hl - 0.3) * 1.3, 0.07, 'rrect', 0.006, 1, 0, 12, 1));
  if (!D.bumpers) add('trim', endPanel(S, -1, 0, S.botF(-hl + 0.1) + 0.07, S.hwF(-hl + 0.3) * 1.4, 0.1, 'rrect', 0.006, 1, 0, 12, 1));

  // ---- kromstötfångare
  const chromeBumper = (e, y) => {
    const pts = [];
    const hw = S.hwF(e * (hl - 0.3)) * 0.98;
    for (let k = -6; k <= 6; k++) { const x = k / 6 * hw; pts.push([x, y, S.endZ(x, y, e) + e * 0.04]); }
    pts.unshift([-hw * 1.0, y, pts[0][2] - e * 0.22]); pts.push([hw * 1.0, y, pts[pts.length - 1][2] - e * 0.22]);
    const g = tube(pts, 0.042, 40, 8); g.scale(1, 1.5, 0.7); g.translate(0, -y * 0.5, 0); add('chrome', g);
  };
  if (D.bumpers === 'chrome' || kit === 'retro') { chromeBumper(1, by + 0.13); chromeBumper(-1, S.botF(-hl + 0.1) + 0.13); }

  // ---- avgasrör
  const ex = D.exhaust || 'dual', exY = S.botF(-hl + 0.15) + 0.07, exList = [];
  const exX = { single: [-0.5], dual: [-0.55, 0.55], quad: [-0.62, -0.48, 0.48, 0.62], center: [-0.08, 0.08], big1: [-0.45], twinL: [-0.55, -0.42], none: [] }[ex] || [];
  for (const xx of exX) {
    const x = xx * (D.W / 1.9), z = S.endZ(x, exY + 0.06, -1), rr = ex === 'big1' ? 0.06 : ex === 'center' ? 0.05 : 0.038;
    add('chrome', cyl(rr, rr, 0.16, 14, 'z', x, exY, z - 0.04, true), true);
    add('trim', new THREE.CircleGeometry(rr * 0.85, 12).rotateY(PI).translate(x, exY, z - 0.06), true);
    exList.push([x, exY, z - 0.12]);
  }
  if (!exList.length) exList.push([-0.35, by + 0.12, -hl - 0.05], [0.35, by + 0.12, -hl - 0.05]);
  if (exList.length === 1) exList.push(exList[0]);

  // ---- speglar, handtag, dörrskarvar
  if (D.roof && !D.open) {
    const zm = (D.zMirror ?? cab.zE - 0.22), ym = S.topF(zm) + 0.1, xm = S.hwBase(zm) * (D.cabW ?? 0.9);
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.1, 12, 8); g.scale(0.95, 0.6, 0.5); g.translate(s * (xm + 0.15), ym, zm - 0.02); add('paint', g, true);
      add('trim', box(0.16, 0.03, 0.06, s * (xm + 0.06), ym - 0.02, zm), true);
      add('glass', new THREE.CircleGeometry(0.08, 14).scale(1.05, 0.62, 1).rotateY(PI).translate(s * (xm + 0.15), ym, zm - 0.071), true);
    }
  } else if (D.open) {
    const zm = cab.zE - 0.1, ym = S.topF(zm) + 0.08, xm = S.hwBase(zm) * 0.88;
    for (const s of [-1, 1]) { const g = new THREE.SphereGeometry(0.09, 12, 8); g.scale(0.55, 0.55, 1); g.translate(s * (xm + 0.1), ym, zm); add('paint', g, true); add('trim', box(0.1, 0.025, 0.05, s * (xm + 0.04), ym - 0.03, zm), true); }
  }
  const doorF = Math.min((cab.zE ?? 0.5) + 0.02, S.wz[0] - S.R - 0.08);
  const seams = [doorF];
  const pil = (D.pillars || [])[0];
  if (D.doors === 4 && pil) seams.push(pil[0], Math.max(S.wz[1] + S.R + 0.05, pil[0] - 0.95));
  else seams.push(Math.max(S.wz[1] + S.R + 0.08, doorF - (D.doorLen ?? 1.15)));
  const beltY = z => S.topF(z) - 0.025;
  if (!F.noSeams) for (const z of seams) for (const s of [-1, 1]) {
    const archTop = Math.max(...S.wz.map(w => Math.abs(z - w) < S.R ? D.r + Math.sqrt(S.R * S.R - (z - w) ** 2) : 0));
    add('trim', sidePanel(S, s, z - 0.004, z + 0.004, Math.max(by + 0.06, archTop + 0.02), beltY(z) - 0.03, 0.003, 1, 6), true);
  }
  // handtag
  for (const z of D.doors === 4 && pil ? [pil[0] - 0.12, seams[2] + 0.18] : [seams[1] + 0.2]) for (const s of [-1, 1]) {
    const y = beltY(z) - 0.1;
    add(D.bumpers ? 'chrome' : 'trim', sidePanel(S, s, z - 0.08, z + 0.08, y - 0.015, y + 0.015, 0.008, 2, 1), true);
  }
  // sidlist (klassiker / retrokit)
  if (F.sideChrome || kit === 'retro') for (const s of [-1, 1]) add('chrome', sidePanel(S, s, -hl + 0.35, hl - 0.4, z => S.topF(z) - 0.2, z => S.topF(z) - 0.18, 0.006, 30, 1), true);
  // sidointag (superbilar)
  if (F.sideIntake) for (const s of [-1, 1]) {
    const z0 = S.wz[1] + S.R + 0.06, z1 = z0 + (F.sideIntake === true ? 0.7 : F.sideIntake);
    add('trim', sidePanel(S, s, z0, z1, z => lerp(by + 0.25, by + 0.12, (z - z0) / (z1 - z0)), z => S.topF(z) - lerp(0.12, 0.3, (z - z0) / (z1 - z0)), 0.006, 6, 3));
  }

  // ---- specialdetaljer
  const roofY = z => cab.roofF ? cab.roofF(z) : S.topF(z);
  if (F.rack) {
    const za = D.zrr + 0.05, zb = D.zrf - 0.08;
    for (const s of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 8; k++) { const z = lerp(za, zb, k / 8); pts.push([s * cab.hwAt(z) * 0.82, roofY(z) + 0.065, z]); }
      add('trim', tube(pts, 0.018, 16, 6));
      for (const z of [za + 0.03, zb - 0.03]) add('trim', box(0.04, 0.07, 0.08, s * cab.hwAt(z) * 0.82, roofY(z) + 0.035, z), true);
    }
    if (F.rack === 2) for (const z of [lerp(za, zb, 0.3), lerp(za, zb, 0.75)]) add('trim', box(cab.hwAt(z) * 1.64, 0.025, 0.05, 0, roofY(z) + 0.075, z));
  }
  if (F.lightPod) {
    const z = D.zrf - 0.12, y = roofY(z) + 0.09;
    add('trim', box(1.0, 0.14, 0.1, 0, y, z));
    for (const x of [-0.36, -0.12, 0.12, 0.36]) { add('head', cyl(0.06, 0.06, 0.02, 14, 'z', x, y, z + 0.055)); add('chrome', cyl(0.07, 0.07, 0.02, 14, 'z', x, y, z + 0.048), true); }
  }
  if (F.lightBar) {
    const z = D.zrf - 0.05, y = roofY(z) + 0.07;
    add('trim', box(1.3, 0.08, 0.1, 0, y, z));
    add('head', box(1.24, 0.035, 0.01, 0, y, z + 0.053));
    for (const s of [-1, 1]) add('trim', box(0.04, 0.08, 0.04, s * 0.6, y - 0.06, z - 0.02), true);
  }
  if (F.roofScoop || kit === 'rally') {
    const z = (D.zrf + D.zrr) / 2 + 0.15, y = roofY(z);
    const g = sideSlab(poly([[0.25, 0], [-0.2, 0], [-0.2, 0.09], [0.05, 0.08]]), 0.36, 0.01); g.translate(0, y - 0.005, z); add('trim', g);
  }
  if (F.hoodScoop) {
    const z = (cab.zE + hl) / 2 - 0.05, y = S.topY(0, z), big = F.hoodScoop === 2;
    const g = sideSlab(poly([[0.35, 0], [-0.3, 0], [-0.32, big ? 0.13 : 0.08], [-0.05, big ? 0.12 : 0.07]]), big ? 0.62 : 0.5, 0.012);
    g.translate(0, y - 0.01, z); add(F.scoopMat || 'paint', g);
    add('trim', endPanel({ endZ: () => z + 0.355 }, 1, 0, y + (big ? 0.065 : 0.04), big ? 0.54 : 0.42, big ? 0.07 : 0.04, 'rrect', 0, 1, 0, 6, 1), true);
  }
  if (F.vents) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const z = (cab.zE + hl) / 2 + 0.05 - k * 0.09, x = s * 0.38;
    add('trim', topPanel(S, x - 0.16, x + 0.16, z - 0.02, z + 0.02, 0.006, 3, 1), true);
  }
  if (F.spare) {
    const z = -hl - D.tw / 2 + 0.02, y = tailTop - 0.32;
    const t = tireGeo(D.r * 0.92, D.tw, D.r * 0.5, 28, 18, 0.018); t.rotateX(PI / 2); t.translate(0, y, z); add('trim', t);
    add('paint', new THREE.CircleGeometry(D.r * 0.62, 20).rotateY(PI).translate(0, y, z - D.tw / 2 - 0.004));
    add('chrome', box(0.12, 0.08, 0.1, 0, y, -hl + 0.02), true);
  }
  if (F.bed) {
    const [z0, z1] = F.bed, yb = S.topF((z0 + z1) / 2), H2 = F.bedH;
    for (const s of [-1, 1]) { const hw = S.hwBase((z0 + z1) / 2); add('paint', box(0.09, H2, z1 - z0, s * (hw - 0.05), yb + H2 / 2 - 0.02, (z0 + z1) / 2)); add('trim', box(0.11, 0.025, z1 - z0, s * (hw - 0.05), yb + H2, (z0 + z1) / 2)); }
    const hw = S.hwBase(z0);
    add('paint', box(hw * 2 - 0.02, H2, 0.08, 0, yb + H2 / 2 - 0.02, z0 + 0.0));
    add('trim', box(hw * 2 - 0.2, 0.012, z1 - z0 - 0.06, 0, yb + 0.006, (z0 + z1) / 2));
    for (let k = 0; k < 5; k++) add('trim', box(0.04, 0.025, z1 - z0 - 0.1, (k - 2) * 0.32, yb + 0.02, (z0 + z1) / 2), true);
    add('chrome', box(0.22, 0.04, 0.02, 0, yb + H2 - 0.12, z0 - 0.045), true);
  }
  if (F.fins) for (const s of [-1, 1]) {
    const z0 = -hl + 1.1, x = s * S.hwF(-hl + 0.5) * 0.9;
    const g = sideSlab(poly([[0, 0], [-1.05, 0], [-1.1, 0.1], [-1.0, 0.11], [-0.5, 0.04]]), 0.06, 0.012); g.translate(x, S.topY(Math.abs(x), z0 - 0.6) - 0.03, z0); add('paint', g);
  }
  if (F.bullbar) {
    const y0 = by + 0.05, y1 = H.y + 0.1, zb = S.endZ(0, by + 0.25, 1) + 0.12, xw = S.hwF(hl - 0.2) * 0.72;
    for (const s of [-1, 1]) add('chrome', tube([[s * xw, y0, zb - 0.06], [s * xw, (y0 + y1) / 2, zb], [s * xw * 0.9, y1, zb - 0.04]], 0.03, 10, 6));
    add('chrome', tube([[-xw, y1 - 0.15, zb - 0.01], [0, y1 - 0.12, zb + 0.02], [xw, y1 - 0.15, zb - 0.01]], 0.028, 12, 6));
    add('chrome', box(xw * 1.6, 0.02, 0.4, 0, by + 0.04, zb - 0.25));
  }
  if (D.open) { // cockpit, säten, störtbågar
    const [c0, c1] = F.cockpit, yc = S.topF((c0 + c1) / 2);
    add('trim', topPanel(S, -S.hwBase(c0) * 0.78, S.hwBase(c0) * 0.78, c0, c1, 0.006, 6, 6));
    for (const s of [-1, 1]) {
      const x = s * 0.38;
      add('trim', box(0.42, 0.1, 0.45, x, yc + 0.06, (c0 + c1) / 2 - 0.05));
      add('trim', box(0.42, 0.36, 0.1, x, yc + 0.16, c0 + 0.1));
      const hoop = new THREE.TorusGeometry(0.19, 0.022, 6, 14, PI); hoop.translate(x, yc + 0.28, c0 - 0.02); add('chrome', hoop);
      for (const sx of [-0.19, 0.19]) add('chrome', cyl(0.022, 0.022, 0.32, 6, 'y', x + sx, yc + 0.16, c0 - 0.02));
      const fair = new THREE.SphereGeometry(0.17, 12, 8, 0, PI * 2, 0, PI / 2); fair.scale(1, 0.7, 3.2); fair.translate(x, yc - 0.01, c0 - 0.5); add('paint', fair);
    }
    const sw = new THREE.TorusGeometry(0.17, 0.018, 6, 18); sw.rotateX(-0.4); sw.translate(-0.38, yc + 0.3, c1 - 0.15); add('trim', sw, true);
    // vindrutans ram upptill
    const zr = D.zrf + 0.01, yr = cab.roofF(zr), hr = cab.hwAt(zr);
    add('chrome', tube([[-hr * 0.98, yr - 0.01, zr], [0, yr + 0.012, zr], [hr * 0.98, yr - 0.01, zr]], 0.018, 12, 6));
  }

  // ---- kit
  const ySkirt = by + 0.04;
  if (kit === 'sport') {
    const yb = S.botF(hl - 0.25) + 0.012, zf = S.endZ(0, yb + 0.06, 1);
    add('trim', box(S.hwF(hl - 0.3) * 1.8, 0.022, 0.24, 0, yb, zf - 0.07));
    for (const s of [-1, 1]) { const za = S.wz[1] + S.R + 0.03, zb = S.wz[0] - S.R - 0.03; add('trim', box(0.06, 0.09, zb - za, s * (S.sideX(by + 0.1, zMid) + 0.015), ySkirt + 0.02, (za + zb) / 2)); }
    const yr = S.botF(-hl + 0.2) + 0.02, zr = S.endZ(0, yr + 0.08, -1);
    add('trim', box(S.hwF(-hl + 0.3) * 1.3, 0.02, 0.35, 0, yr, zr + 0.13));
    for (let k = -2; k <= 2; k++) add('trim', sideSlab(poly([[0.3, 0], [-0.05, 0], [-0.05, 0.12]]), 0.015, 0.002).translate(k * 0.22, yr, zr + 0.05));
  }
  if (kit === 'wide') for (const w of S.wz) for (const s of [-1, 1]) {
    const t = new THREE.TorusGeometry(S.R + 0.02, 0.032, 6, 20, PI * 1.12); t.rotateZ(-PI * 0.06); t.rotateY(PI / 2);
    t.scale(1.6, 1, 1); t.translate(s * (S.hwF(w) - 0.02), D.r, w); add('trim', t);
  }
  if (kit === 'rally' || F.flaps) S.wz.forEach((w, i) => { for (const s of [-1, 1]) add('trim', box(D.tw + 0.05, 0.26, 0.012, s * wheelX[i], 0.15, w - S.R - 0.05)); });
  if (kit === 'rally') {
    const yb = by - 0.02, zf = S.endZ(0, by + 0.15, 1);
    const sk = box(S.hwF(hl - 0.4) * 1.4, 0.015, 0.6, 0, 0, 0); sk.rotateX(-0.25); sk.translate(0, yb + 0.05, zf - 0.28); add('chrome', sk);
  }
  if (kit === 'retro') for (const s of [-1, 1]) {
    const x = s * H.x * 0.75, y = by + 0.27;
    add('head', place(S, cyl(0.065, 0.065, 0.02, 14, 'z', 0, 0, 0), x, y, 1, 0.05));
    add('chrome', place(S, cyl(0.075, 0.06, 0.07, 14, 'z', 0, 0, 0), x, y, 1, 0.02), true);
  }
  // ---- spoiler
  const sp = spoiler === 'default' ? (D.spoiler || 'none') : spoiler;
  addSpoiler(S, add, sp, isHatch);

  // ---- slå ihop per material (full + fjärr-LOD utan små detaljer)
  const out = { full: {}, far: {} };
  for (const k of Object.keys(parts)) {
    out.full[k] = mergeList(parts[k].map(p => p.g));
    const big = parts[k].filter(p => !p.small);
    out.far[k] = big.length === parts[k].length ? out.full[k] : mergeList(big.map(p => p.g));
  }
  return {
    S, geos: out, plate: mergeList(plates), wheelX, exList, isHatch,
    _decal: null, get decal() { return this._decal || (this._decal = decalOverlay(S, [S.bodyPaint, ...cab.paint])); },
    doorZ: (seams[0] + seams[1]) / 2 - 0.05, hoodZ: (cab.zE ?? hl - 1) + (hl - (cab.zE ?? hl - 1)) * 0.45
  };
}

/* ================================================================== Dekaler, skyltar, neon */
// Dekalens textur (1024²): rad 0–512 = ovansida (u längs z, v tvärs x), 512–768 = höger sida, 768–1024 = vänster sida.
function decalOverlay(S, geos) {
  const L = S.D.L, W = S.D.W + 0.3, Hs = S.Hs, hl = S.hl;
  const P = [], N = [], U = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let t = 0; t < p.length; t += 9) {
      const ax = p[t + 3] - p[t], ay = p[t + 4] - p[t + 1], az = p[t + 5] - p[t + 2], bx = p[t + 6] - p[t], by = p[t + 7] - p[t + 1], bz = p[t + 8] - p[t + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz; const nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l;
      let reg;
      if (Math.abs(nx) > 0.62) reg = nx > 0 ? 1 : 2; else if (ny > 0.42) reg = 0; else continue;
      if (reg && Math.max(p[t + 1], p[t + 4], p[t + 7]) > Hs) continue;
      for (let k = 0; k < 3; k++) {
        const o = t + k * 3, x = p[o], y = p[o + 1], z = p[o + 2];
        let u, v;
        if (reg === 1) { u = (hl - z) / L; v = 0.25 + 0.25 * clamp(y / Hs, 0, 1); }
        else if (reg === 2) { u = (z + hl) / L; v = 0.25 * clamp(y / Hs, 0, 1); }
        else { u = (z + hl) / L; v = 0.5 + 0.5 * clamp(x / W + 0.5, 0, 1); }
        P.push(x + n[o] * 0.004, y + n[o + 1] * 0.004, z + n[o + 2] * 0.004); N.push(n[o], n[o + 1], n[o + 2]); U.push(u, v);
      }
    }
  }
  return triGeo(P, N, U);
}
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const decalTexCache = {};
function decalTexture(pat, col, num, P) {
  const key = [pat, col, num, P.S.D.id].join('|');
  if (decalTexCache[key]) return decalTexCache[key];
  const S = P.S, L = S.D.L, W = S.D.W + 0.3, Hs = S.Hs, hl = S.hl;
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const c = cv.getContext('2d');
  const C = new THREE.Color(col), css = '#' + C.getHexString();
  const shade = (k, a = 1) => { const q = C.clone().multiplyScalar(k); return `rgba(${q.r * 255 | 0},${q.g * 255 | 0},${q.b * 255 | 0},${a})`; };
  // regioner: kartläggning från bilkoordinater (a = z, b = y för sidor / x för ovansida) till pixlar
  const REG = [
    { id: 'T', m: (a, b) => [(a + hl) / L * 1024, (0.5 - b / W) * 512], clip: [0, 0, 1024, 512], kx: 1024 / L, ky: 512 / W },
    { id: 'R', m: (a, b) => [(hl - a) / L * 1024, 512 + (1 - b / Hs) * 256], clip: [0, 512, 1024, 256], kx: 1024 / L, ky: 256 / Hs },
    { id: 'L', m: (a, b) => [(a + hl) / L * 1024, 768 + (1 - b / Hs) * 256], clip: [0, 768, 1024, 256], kx: 1024 / L, ky: 256 / Hs }
  ];
  const SIDES = REG.slice(1), TOP = REG[0];
  const inReg = (r, fn) => { c.save(); c.beginPath(); c.rect(...r.clip); c.clip(); fn(r); c.restore(); };
  const polyW = (r, pts, fill = css) => { c.fillStyle = fill; c.beginPath(); pts.forEach((p, i) => { const [x, y] = r.m(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fill(); };
  const circW = (r, a, b, rad, fill = css) => { const [x, y] = r.m(a, b); c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rad * r.kx, rad * r.ky, 0, 0, PI * 2); c.fill(); };
  const textW = (r, str, a, b, size, fill) => {
    const [x, y] = r.m(a, b); c.save(); c.fillStyle = fill; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (r.id === 'T') { c.font = `900 ${Math.round(size * r.ky)}px Rubik, system-ui, sans-serif`; c.setTransform(0, 1, -r.kx / r.ky, 0, x, y); }
    else { c.font = `900 ${Math.round(size * r.ky)}px Rubik, system-ui, sans-serif`; c.setTransform(r.kx / r.ky, 0, 0, 1, x, y); }
    c.fillText(str, 0, size * r.ky * 0.06); c.restore();
  };
  const rnd = rng(pat.length * 977 + (col & 0xffff));
  const fr = hl - 0.1, rr = -hl + 0.05; // fram/bak
  switch (pat) {
    case 'race':
      inReg(TOP, r => { for (const s of [-1, 1]) polyW(r, [[-hl, s * 0.08], [hl, s * 0.08], [hl, s * 0.3], [-hl, s * 0.3]]); });
      break;
    case 'side':
      for (const r of SIDES) inReg(r, r => {
        polyW(r, [[rr + 0.25, Hs * 0.48], [fr - 0.4, Hs * 0.48], [fr - 0.1, Hs * 0.58], [rr + 0.25, Hs * 0.58]]);
        polyW(r, [[rr + 0.25, Hs * 0.61], [fr - 0.2, Hs * 0.61], [fr - 0.05, Hs * 0.635], [rr + 0.25, Hs * 0.635]]);
      });
      break;
    case 'flames': {
      const tongue = (r, b0, len, wid, flipB) => {
        const pts = []; const n = 14;
        for (let k = 0; k <= n; k++) { const t = k / n; pts.push([fr - t * len, b0 + wid * (1 - t) * 0.5 + Math.sin(t * PI * 2.2) * wid * 0.25 * t]); }
        for (let k = n; k >= 0; k--) { const t = k / n; pts.push([fr - t * len, b0 - wid * (1 - t) * 0.5 + Math.sin(t * PI * 2.2 + 0.8) * wid * 0.25 * t]); }
        polyW(r, pts.map(p => flipB ? [p[0], -p[1]] : p));
      };
      for (const r of SIDES) inReg(r, r => { for (let k = 0; k < 6; k++) tongue(r, Hs * (0.3 + k * 0.08), 1.0 + rnd() * 1.4, Hs * 0.16); });
      inReg(TOP, r => { for (let k = -3; k <= 3; k++) tongue(r, k * 0.17, 0.7 + rnd() * 0.7, 0.2); });
      break;
    }
    case 'checker': {
      const q = 0.11;
      for (const r of SIDES) inReg(r, r => { for (let a = -hl; a < hl; a += q) for (let row = 0; row < 2; row++) if ((Math.round((a + hl) / q) + row) % 2 === 0) polyW(r, [[a, Hs * 0.3 + row * q], [a + q, Hs * 0.3 + row * q], [a + q, Hs * 0.3 + (row + 1) * q], [a, Hs * 0.3 + (row + 1) * q]]); });
      inReg(TOP, r => { for (let a = -hl; a < hl; a += q) for (let b = -2; b < 2; b++) if ((Math.round((a + hl) / q) + b + 8) % 2 === 0) polyW(r, [[a, b * q], [a + q, b * q], [a + q, (b + 1) * q], [a, (b + 1) * q]]); });
      break;
    }
    case 'camo':
      for (const r of REG) inReg(r, r => {
        for (let k = 0; k < 70; k++) {
          const a = -hl + rnd() * L, b = r.id === 'T' ? (rnd() - 0.5) * W : rnd() * Hs, f = [shade(0.55, 0.95), shade(1, 0.95), shade(1.6, 0.9)][k % 3];
          for (let j = 0; j < 4; j++) circW(r, a + (rnd() - 0.5) * 0.4, b + (rnd() - 0.5) * 0.2, 0.08 + rnd() * 0.12, f);
        }
      });
      break;
    case 'bolt':
      for (const r of SIDES) inReg(r, r => {
        const y = Hs * 0.5;
        polyW(r, [[fr - 0.2, y + 0.1], [fr - 1.3, y + 0.05], [fr - 1.15, y - 0.03], [rr + 0.5, y - 0.04], [fr - 1.6, y + 0.04], [fr - 1.75, y - 0.05], [fr - 0.15, y + 0.02]]);
      });
      inReg(TOP, r => polyW(r, [[fr, 0.05], [fr - 0.5, 0.18], [fr - 0.55, 0.04], [fr - 1.1, 0.14], [fr - 0.6, -0.08], [fr - 0.55, 0.05], [fr - 0.1, -0.06]]));
      break;
    case 'fade':
      for (const r of REG) inReg(r, r => {
        const [x0] = r.m(-hl, 0), [x1] = r.m(0.4, 0);
        const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, shade(1, 1)); g.addColorStop(0.55, shade(1, 0.55)); g.addColorStop(1, shade(1, 0));
        c.fillStyle = g; c.fillRect(...r.clip);
      });
      break;
    case 'geo':
      for (const r of REG) inReg(r, r => {
        for (let k = 0; k < 28; k++) {
          const t = rnd(), a = -hl + t * t * L * 0.75, b = r.id === 'T' ? (rnd() - 0.5) * W : Hs * (0.25 + rnd() * 0.6), s = 0.1 + (1 - t) * 0.25;
          polyW(r, [[a, b], [a + s * (0.6 + rnd()), b + s * (rnd() - 0.5)], [a + s * (rnd() - 0.2), b + s * (rnd() + 0.3) * (rnd() < 0.5 ? -1 : 1)]], k % 3 ? css : shade(0.6));
        }
      });
      break;
  }
  if (num > 0) {
    const n = String(num | 0);
    for (const r of SIDES) inReg(r, r => { circW(r, P.doorZ, Hs * 0.58, 0.24, '#f7f7f2'); circW(r, P.doorZ, Hs * 0.58, 0.225, '#f7f7f2'); textW(r, n, P.doorZ, Hs * 0.58, 0.28, '#111'); });
    inReg(TOP, r => { circW(r, P.hoodZ, 0, 0.25, '#f7f7f2'); textW(r, n, P.hoodZ, 0, 0.3, '#111'); });
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (decalTexCache[key] = t);
}
const decalMatCache = {};
function decalMat(tex, matte) {
  const k = tex.uuid + (matte ? 'm' : '');
  if (decalMatCache[k]) return decalMatCache[k];
  return (decalMatCache[k] = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: matte ? 0.8 : 0.3, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
}
const plateCache = {};
function plateMat(text) {
  if (plateCache[text]) return plateCache[text];
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  const c = cv.getContext('2d');
  c.fillStyle = '#16181c'; c.fillRect(0, 0, 512, 112);
  c.fillStyle = '#f4f4ef'; c.beginPath(); c.roundRect(5, 5, 502, 102, 10); c.fill();
  c.fillStyle = '#1f47a8'; c.beginPath(); c.roundRect(5, 5, 52, 102, [10, 0, 0, 10]); c.fill();
  c.fillStyle = '#fff'; c.font = '700 34px Rubik, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', 31, 76);
  c.fillStyle = '#111'; c.font = '700 80px Rubik, system-ui, sans-serif'; c.fillText(String(text).toUpperCase().slice(0, 8), 282, 60);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (plateCache[text] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.1 }));
}
let neonTex = null;
const neonMatCache = {};
function neonMat(color) {
  if (neonMatCache[color]) return neonMatCache[color];
  if (!neonTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); neonTex = new THREE.CanvasTexture(cv);
  }
  return (neonMatCache[color] = new THREE.MeshBasicMaterial({ color, map: neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
}
const neonGeoCache = {};
function neonGeo(P) {
  const id = P.S.D.id; if (neonGeoCache[id]) return neonGeoCache[id];
  const D = P.S.D, hl = P.S.hl;
  const pl = new THREE.PlaneGeometry(D.W + 1.1, D.L + 0.9).rotateX(-PI / 2).translate(0, 0.025, D.wo * 0.5);
  const tubes = [];
  for (const s of [-1, 1]) tubes.push(constUv(box(0.03, 0.03, D.wb - 0.9, s * (P.S.hwBase(D.wo) - 0.12), D.by - 0.02, D.wo), 0.5));
  tubes.push(constUv(box(D.W * 0.6, 0.03, 0.03, 0, P.S.botF(hl - 0.4) - 0.02, hl - 0.45), 0.5));
  return (neonGeoCache[id] = mergeGeometries([prep(pl), ...tubes.map(t => prep(t))]));
}

/* ================================================================== Bilarna
 * L längd, W bredd, wb hjulbas, wo hjulbasens förskjutning framåt, r hjulradie, tw däckbredd, by tröskelhöjd,
 * round 0 kantig … 1 rund, rn/rt rundning nos/akter, taperF/R avsmalning i planvy, slantF/R lutning av nos/akter,
 * flare utställda skärmar, top = huv/bälteslinje/däck [z, y], roof = taklinje [z, y] (första/sista = rutornas nederkant),
 * zrf/zrr = takets fram-/bakkant (vindruta/bakruta utanför), cpil = sidorutan slutar här (C-stolpe), pillars = [z, halvbredd, svart?].
 */
const CAR_DEFS = {
  viggen: { L: 4.1, W: 1.8, wb: 2.62, wo: 0.08, r: 0.33, tw: 0.22, by: 0.2, round: 0.45, rn: 0.22, rt: 0.14, taperF: 0.18, slantF: 0.25, slantR: 0.12,
    top: [[-2.05, 0.88], [-1.9, 0.95], [-1.6, 0.96], [0.55, 0.95], [1.0, 0.9], [1.7, 0.82], [2.05, 0.72]],
    roof: [[-1.97, 0.95], [-1.75, 1.3], [-1.45, 1.43], [-0.6, 1.47], [-0.1, 1.46], [0.25, 1.28], [0.62, 0.96]], zrf: -0.05, zrr: -1.5, cpil: -1.38, pillars: [[-0.55, 0.05, true]], doors: 4,
    head: { style: 'slim', w: 0.36, h: 0.09 }, tail: { style: 'wrap', w: 0.32, h: 0.1 }, grille: { style: 'modern' }, exhaust: 'single', spoiler: 'lip', rimStd: 'fem', rimColor: 0xb9bfc6 },
  algen: { L: 4.75, W: 1.86, wb: 2.85, wo: 0.05, r: 0.34, tw: 0.23, by: 0.21, round: 0.3, rn: 0.22, rt: 0.1, taperF: 0.16, slantF: 0.2, slantR: 0.04,
    top: [[-2.375, 0.92], [-2.2, 1.0], [0.75, 0.98], [1.2, 0.9], [1.95, 0.8], [2.375, 0.68]],
    roof: [[-2.3, 1.0], [-2.24, 1.36], [-2.08, 1.48], [-0.2, 1.51], [0.25, 1.45], [0.78, 0.99]], zrf: 0.1, zrr: -2.13, cpil: -2.02, pillars: [[-0.35, 0.05, true], [-1.42, 0.07]], doors: 4,
    head: { style: 'rect', w: 0.36, h: 0.1 }, tail: { style: 'vert', w: 0.13, h: 0.24, x: 0.76, y: 0.76 }, grille: { style: 'wide', h: 0.13 }, exhaust: 'twinL', spoiler: 'none', rimStd: 'std', rimColor: 0xa9afb6,
    feat: { rack: 2 } },
  pixel: { L: 3.35, W: 1.66, wb: 2.3, wo: 0.05, r: 0.3, tw: 0.19, by: 0.2, round: 0.6, rn: 0.25, rt: 0.12, taperF: 0.18, slantF: 0.15, slantR: 0.04,
    top: [[-1.675, 0.95], [-1.55, 1.0], [0.75, 0.98], [1.15, 0.9], [1.5, 0.82], [1.675, 0.72]],
    roof: [[-1.6, 1.0], [-1.55, 1.42], [-1.4, 1.57], [0.0, 1.6], [0.35, 1.52], [0.8, 1.0]], zrf: 0.1, zrr: -1.45, cpil: -1.3, pillars: [[-0.4, 0.05, true]], doors: 4, cabW: 0.92, tumble: 0.85,
    head: { style: 'round', w: 0.2, h: 0.16, x: 0.55 }, tail: { style: 'vert', w: 0.12, h: 0.24, x: 0.7, y: 0.9 }, grille: { style: 'smile', w: 0.6, h: 0.1 }, exhaust: 'single', spoiler: 'none', rimStd: 'turbin', rimColor: 0xd9dde2 },
  blixten: { L: 4.35, W: 1.88, wb: 2.62, wo: 0.02, r: 0.35, tw: 0.25, by: 0.17, round: 0.5, rn: 0.2, rt: 0.16, taperF: 0.2, slantF: 0.4, slantR: 0.15, flareR: 0.035,
    top: [[-2.175, 0.78], [-1.95, 0.9], [-1.5, 0.91], [0.45, 0.87], [1.0, 0.78], [1.7, 0.66], [2.175, 0.5]],
    roof: [[-1.85, 0.9], [-1.3, 1.12], [-0.75, 1.26], [-0.3, 1.28], [0.0, 1.24], [0.5, 0.88]], zrf: -0.2, zrr: -0.8, cpil: -0.95, doors: 2,
    head: { style: 'slim', w: 0.4, h: 0.08 }, tail: { style: 'slimbar', w: 0.34, h: 0.08 }, grille: { style: 'sport', w: 0.7, h: 0.17 }, exhaust: 'dual', spoiler: 'lip', rimStd: 'fem', rimColor: 0x2b2e33 },
  falk: { L: 4.0, W: 1.78, wb: 2.4, wo: 0.1, r: 0.33, tw: 0.23, by: 0.18, round: 0.65, rn: 0.25, rt: 0.2, taperF: 0.22, slantF: 0.3, slantR: 0.1, open: true,
    top: [[-2.0, 0.78], [-1.8, 0.86], [-0.2, 0.86], [0.2, 0.84], [1.0, 0.76], [1.6, 0.66], [2.0, 0.52]],
    roof: [[-0.05, 1.15], [0.2, 1.06], [0.45, 0.85]], zrf: -0.06, zrr: -9, cpil: -9, doors: 2,
    head: { style: 'slim', w: 0.34, h: 0.09 }, tail: { style: 'round2', w: 0.26, h: 0.09 }, grille: { style: 'oval', w: 0.5, h: 0.14 }, exhaust: 'dual', spoiler: 'none', rimStd: 'mesh', rimColor: 0xc8ccd2,
    feat: { cockpit: [-1.05, -0.08] } },
  kaze: { L: 4.35, W: 1.76, wb: 2.56, wo: 0.02, r: 0.33, tw: 0.23, by: 0.17, round: 0.2, rn: 0.14, rt: 0.12, taperF: 0.2, slantF: 0.25,
    top: [[-2.175, 0.86], [-1.95, 0.93], [-1.2, 0.93], [0.4, 0.88], [1.0, 0.8], [1.8, 0.68], [2.175, 0.55]],
    roof: [[-1.22, 0.93], [-0.85, 1.2], [-0.6, 1.3], [0.0, 1.31], [0.45, 0.89]], zrf: -0.05, zrr: -0.65, cpil: -0.55, doors: 2,
    head: { style: 'sharp', w: 0.38, h: 0.1 }, tail: { style: 'round4', w: 0.32, h: 0.11 }, grille: { style: 'sport', w: 0.62, h: 0.14 }, exhaust: 'big1', spoiler: 'gt', rimStd: 'racing', rimColor: 0xe8e8e8 },
  vraken: { L: 4.75, W: 1.9, wb: 2.75, wo: 0.1, r: 0.35, tw: 0.26, by: 0.2, round: 0.25, rn: 0.12, rt: 0.1, taperF: 0.08, taperR: 0.06, slantF: -0.15, flareR: 0.04, valley: 0.03,
    top: [[-2.375, 0.9], [-2.2, 0.96], [-1.9, 0.97], [0.2, 0.93], [1.0, 0.9], [2.0, 0.84], [2.375, 0.76]],
    roof: [[-2.15, 0.97], [-1.5, 1.12], [-0.8, 1.28], [-0.4, 1.32], [-0.15, 1.3], [0.35, 0.93]], zrf: -0.25, zrr: -0.8, cpil: -0.75, doors: 2, doorLen: 1.25,
    head: { style: 'round2', w: 0.34, h: 0.13, y: 0.66, x: 0.6, bezel: 'chrome' }, tail: { style: 'rectbar', w: 0.42, h: 0.12 }, grille: { style: 'muscle', y: 0.66, w: 1.5, h: 0.2 }, bumpers: 'chrome',
    exhaust: 'dual', spoiler: 'duck', decal: 'race', rimStd: 'skal', rimColor: 0xc3c8ce, feat: { hoodScoop: 1, scoopMat: 'trim' } },
  bison: { L: 5.1, W: 1.95, wb: 2.95, wo: 0.15, r: 0.36, tw: 0.26, by: 0.22, round: 0.15, rn: 0.08, rt: 0.08, taperF: 0.05, taperR: 0.05, flare: 0.03, valley: 0.03,
    top: [[-2.55, 0.88], [-2.35, 0.95], [-1.2, 0.96], [0.2, 0.94], [1.2, 0.92], [2.2, 0.88], [2.55, 0.84]],
    roof: [[-1.28, 0.96], [-0.95, 1.25], [-0.7, 1.34], [0.0, 1.35], [0.2, 1.32], [0.65, 0.94]], zrf: 0.15, zrr: -0.75, cpil: -0.7, doors: 2, doorLen: 1.3,
    head: { style: 'quadround', w: 0.34, h: 0.12, x: 0.66, y: 0.68, bezel: 'chrome' }, tail: { style: 'rectbar', w: 0.5, h: 0.14 }, grille: { style: 'muscle', y: 0.68, w: 1.62, h: 0.24 }, bumpers: 'chrome',
    exhaust: 'dual', spoiler: 'none', rimStd: 'skal', rimColor: 0x2a2c30, feat: { hoodScoop: 2, sideChrome: true } },
  aska: { L: 4.85, W: 1.92, wb: 2.85, wo: 0.1, r: 0.37, tw: 0.27, by: 0.19, round: 0.3, rn: 0.12, rt: 0.1, taperF: 0.1, slantF: -0.1, flareR: 0.05, valley: 0.03,
    top: [[-2.425, 0.92], [-2.25, 0.99], [-1.6, 1.0], [0.3, 0.96], [1.0, 0.93], [2.0, 0.86], [2.425, 0.76]],
    roof: [[-1.95, 1.0], [-1.3, 1.2], [-0.75, 1.33], [-0.3, 1.35], [0.05, 1.31], [0.45, 0.96]], zrf: -0.15, zrr: -0.75, cpil: -0.8, doors: 2, doorLen: 1.3, cabW: 0.86,
    head: { style: 'angry', w: 0.36, h: 0.08, y: 0.74 }, tail: { style: 'tribar', w: 0.4, h: 0.13 }, grille: { style: 'muscleModern', y: 0.62, w: 1.05, h: 0.2 }, exhaust: 'quad', spoiler: 'duck', rimStd: 'fem', rimColor: 0x1c1d20,
    feat: { hoodScoop: 1, vents: true } },
  lodjuret: { L: 4.05, W: 1.86, wb: 2.56, wo: 0.05, r: 0.34, tw: 0.23, by: 0.28, round: 0.35, rn: 0.2, rt: 0.12, taperF: 0.15, slantF: 0.25, slantR: 0.1, flare: 0.06,
    top: [[-2.025, 0.95], [-1.88, 1.02], [0.55, 1.0], [1.0, 0.93], [1.7, 0.84], [2.025, 0.7]],
    roof: [[-1.95, 1.02], [-1.72, 1.36], [-1.45, 1.48], [-0.6, 1.52], [-0.1, 1.5], [0.25, 1.34], [0.6, 1.01]], zrf: -0.05, zrr: -1.5, cpil: -1.4, pillars: [[-0.55, 0.05, true]], doors: 4,
    head: { style: 'slim', w: 0.36, h: 0.09 }, tail: { style: 'wrap', w: 0.3, h: 0.1 }, grille: { style: 'modern' }, exhaust: 'big1', spoiler: 'rally', rimStd: 'racing', rimColor: 0xf2f2f2,
    offroadish: true, feat: { lightPod: true, roofScoop: true, flaps: true } },
  tempesta: { L: 3.95, W: 1.92, wb: 2.45, wo: -0.02, r: 0.34, tw: 0.25, by: 0.22, round: 0.05, rn: 0.1, rt: 0.06, taperF: 0.06, taperR: 0.04, slantF: 0.2, flare: 0.1,
    top: [[-1.975, 0.95], [-1.8, 1.0], [-0.9, 1.0], [0.4, 0.95], [1.0, 0.88], [1.6, 0.8], [1.975, 0.68]],
    roof: [[-1.3, 1.0], [-0.95, 1.3], [-0.7, 1.38], [-0.1, 1.4], [0.1, 1.37], [0.5, 0.96]], zrf: 0.0, zrr: -0.75, cpil: -0.7, doors: 2, doorLen: 1.0,
    head: { style: 'square', w: 0.4, h: 0.11, x: 0.55 }, tail: { style: 'square', w: 0.3, h: 0.1 }, grille: { style: 'slots', w: 0.6, h: 0.1 }, exhaust: 'twinL', spoiler: 'rally', rimStd: 'turbin', rimColor: 0xd8dcdf,
    feat: { vents: true, roofScoop: true } },
  vega: { L: 4.3, W: 1.68, wb: 2.5, wo: 0.05, r: 0.33, tw: 0.19, by: 0.22, round: 1, rn: 0.42, rt: 0.48, taperF: 0.2, taperR: 0.25, tumble: 0.72,
    top: [[-2.15, 0.74], [-1.95, 0.86], [-1.6, 0.92], [0.4, 0.88], [1.1, 0.84], [1.8, 0.76], [2.15, 0.62]],
    roof: [[-1.95, 0.88], [-1.45, 1.15], [-0.9, 1.38], [-0.4, 1.45], [0.05, 1.42], [0.5, 0.9]], zrf: -0.05, zrr: -0.6, cpil: -0.75, pillars: [[-0.45, 0.04]], doors: 4,
    head: { style: 'round', w: 0.18, h: 0.17, x: 0.56, y: 0.64, bezel: 'chrome' }, tail: { style: 'roundsmall', w: 0.1, h: 0.09, x: 0.5 }, grille: { style: 'classic', w: 0.56, h: 0.16, y: 0.52 }, bumpers: 'chrome',
    exhaust: 'single', spoiler: 'none', rimStd: 'stal', rimColor: 0xe8e2d4, rimPainted: true, lowerIntake: false },
  ankar: { L: 4.6, W: 1.75, wb: 2.6, wo: 0.05, r: 0.33, tw: 0.2, by: 0.2, round: 0.4, rn: 0.2, rt: 0.1, taperF: 0.12, taperR: 0.03,
    top: [[-2.3, 0.86], [-2.1, 0.93], [-1.0, 0.93], [0.4, 0.9], [1.4, 0.86], [2.3, 0.74]],
    roof: [[-1.05, 0.93], [-0.75, 1.22], [-0.5, 1.3], [0.05, 1.31], [0.2, 1.28], [0.6, 0.9]], zrf: 0.1, zrr: -0.55, cpil: -0.62, doors: 2, tumble: 0.78,
    head: { style: 'round', w: 0.17, h: 0.15, x: 0.6, bezel: 'chrome' }, tail: { style: 'fins', w: 0.08, h: 0.2, x: 0.74, y: 0.9 }, grille: { style: 'gt', w: 0.8, h: 0.15 }, bumpers: 'chrome',
    exhaust: 'single', spoiler: 'none', rimStd: 'trad', rimColor: 0xdfe3e8, lowerIntake: false, feat: { fins: true, sideChrome: true } },
  kupol: { L: 3.0, W: 1.42, wb: 1.95, wo: -0.05, r: 0.28, tw: 0.16, by: 0.2, round: 1, rn: 0.45, rt: 0.5, taperF: 0.3, taperR: 0.3, tumble: 0.68, cabW: 0.88,
    top: [[-1.5, 0.64], [-1.3, 0.8], [-1.0, 0.86], [0.3, 0.84], [0.8, 0.78], [1.3, 0.66], [1.5, 0.52]],
    roof: [[-1.35, 0.82], [-1.0, 1.2], [-0.5, 1.38], [0.0, 1.38], [0.35, 1.25], [0.75, 0.84]], zrf: -0.05, zrr: -0.5, cpil: -0.8, doors: 2, doorLen: 0.85,
    head: { style: 'round', w: 0.16, h: 0.15, x: 0.46, y: 0.62, bezel: 'chrome' }, tail: { style: 'roundsmall', w: 0.08, h: 0.08, x: 0.42 }, grille: { style: 'none' }, bumpers: 'chrome',
    exhaust: 'single', spoiler: 'none', rimStd: 'stal', rimColor: 0xece6d6, rimPainted: true, lowerIntake: false },
  fjallbjorn: { L: 4.5, W: 1.92, wb: 2.7, wo: 0.05, r: 0.42, tw: 0.3, by: 0.48, round: 0.0, rn: 0.08, rt: 0.06, taperF: 0.04, taperR: 0.02, flare: 0.06, cabW: 0.95, tumble: 0.92, offroad: true,
    top: [[-2.25, 1.12], [-2.18, 1.16], [0.75, 1.15], [1.0, 1.1], [2.0, 1.07], [2.25, 1.02]],
    roof: [[-2.2, 1.16], [-2.17, 1.74], [-2.1, 1.86], [0.35, 1.88], [0.55, 1.8], [0.85, 1.15]], zrf: 0.42, zrr: -2.12, cpil: -2.0, pillars: [[-0.45, 0.05, true], [-1.35, 0.06]], doors: 4,
    head: { style: 'roundbox', w: 0.2, h: 0.17, x: 0.64, y: 0.92 }, tail: { style: 'vert', w: 0.12, h: 0.28, x: 0.84, y: 1.0 }, grille: { style: 'slots', y: 0.92, w: 0.9, h: 0.2 },
    exhaust: 'single', spoiler: 'none', rimStd: 'stal', rimColor: 0x3a3d42, rimPainted: true, lowerIntake: false, plateY: [0.62, 0.7],
    feat: { spare: true, rack: 2, bullbar: true } },
  timmer: { L: 5.35, W: 2.02, wb: 3.35, wo: 0.1, r: 0.43, tw: 0.3, by: 0.5, round: 0.05, rn: 0.12, rt: 0.05, taperF: 0.06, taperR: 0.0, flare: 0.05, cabW: 0.94, tumble: 0.9, offroad: true,
    top: [[-2.675, 1.18], [-2.62, 0.84], [-0.86, 0.84], [-0.78, 1.22], [0.85, 1.22], [1.2, 1.2], [2.3, 1.15], [2.675, 1.06]],
    roof: [[-0.76, 1.22], [-0.72, 1.82], [-0.6, 1.92], [0.35, 1.94], [0.55, 1.88], [1.0, 1.23]], zrf: 0.45, zrr: -0.65, cpil: -0.62, pillars: [[-0.15, 0.05, true]], doors: 4,
    head: { style: 'rect', w: 0.36, h: 0.16, x: 0.66, y: 1.0 }, tail: { style: 'vert', w: 0.12, h: 0.32, x: 0.92, y: 1.05 }, grille: { style: 'truck', y: 0.9, w: 0.95, h: 0.34 },
    exhaust: 'single', spoiler: 'none', rimStd: 'skal', rimColor: 0x24262a, lowerIntake: false, plateY: [0.62, 0.72],
    feat: { bed: [-2.62, -0.86], bedH: 0.4, lightBar: true } },
  spark: { L: 3.95, W: 1.8, wb: 2.65, wo: 0.05, r: 0.34, tw: 0.21, by: 0.18, round: 0.75, rn: 0.3, rt: 0.2, taperF: 0.2, slantF: 0.25, slantR: 0.1,
    top: [[-1.975, 0.9], [-1.85, 0.96], [0.4, 0.94], [0.9, 0.88], [1.6, 0.76], [1.975, 0.62]],
    roof: [[-1.85, 0.96], [-1.65, 1.32], [-1.35, 1.48], [-0.4, 1.53], [0.0, 1.5], [0.45, 0.95]], zrf: -0.15, zrr: -1.4, cpil: -1.3, pillars: [[-0.5, 0.05, true]], doors: 4,
    head: { style: 'strip', w: 0.26, h: 0.06 }, tail: { style: 'strip', w: 0.26, h: 0.06 }, grille: { style: 'none' }, exhaust: 'none', spoiler: 'none', rimStd: 'turbin', rimColor: 0xeef0f2 },
  aurora: { L: 4.85, W: 1.9, wb: 2.95, wo: 0.05, r: 0.36, tw: 0.24, by: 0.17, round: 0.7, rn: 0.3, rt: 0.18, taperF: 0.2, slantF: 0.3, slantR: 0.15,
    top: [[-2.425, 0.84], [-2.25, 0.92], [-1.6, 0.93], [0.6, 0.9], [1.2, 0.82], [1.9, 0.7], [2.425, 0.56]],
    roof: [[-2.2, 0.93], [-1.6, 1.12], [-0.9, 1.38], [-0.3, 1.43], [0.1, 1.38], [0.65, 0.9]], zrf: -0.1, zrr: -0.85, cpil: -1.25, pillars: [[-0.4, 0.05, true]], doors: 4,
    head: { style: 'strip', w: 0.3, h: 0.055 }, tail: { style: 'strip', w: 0.3, h: 0.06 }, grille: { style: 'ev', y: 0.3, w: 0.7, h: 0.05 }, exhaust: 'none', spoiler: 'lip', rimStd: 'turbin', rimColor: 0x6b7078 },
  ion: { L: 4.6, W: 2.0, wb: 2.7, wo: -0.1, r: 0.35, tw: 0.27, by: 0.13, round: 0.8, rn: 0.35, rt: 0.2, taperF: 0.35, taperR: 0.12, slantF: 0.4, slantR: 0.1, flare: 0.07, cabW: 0.82, tumble: 0.78,
    top: [[-2.3, 0.78], [-2.1, 0.86], [-1.3, 0.86], [-0.6, 0.8], [0.5, 0.76], [1.2, 0.66], [1.9, 0.52], [2.3, 0.42]],
    roof: [[-1.9, 0.84], [-1.3, 1.02], [-0.7, 1.12], [-0.2, 1.14], [0.15, 1.08], [0.75, 0.73]], zrf: -0.15, zrr: -0.6, cpil: -0.75, doors: 2, doorLen: 1.0,
    head: { style: 'strip', w: 0.3, h: 0.045 }, tail: { style: 'strip', w: 0.4, h: 0.05 }, grille: { style: 'ev', y: 0.22, w: 0.9, h: 0.06 }, exhaust: 'none', spoiler: 'none', rimStd: 'turbin', rimColor: 0x2c2f35,
    feat: { sideIntake: 0.55 } },
  norrsken: { L: 4.55, W: 2.02, wb: 2.7, wo: -0.1, r: 0.35, tw: 0.27, by: 0.12, round: 0.15, rn: 0.1, rt: 0.08, taperF: 0.3, taperR: 0.08, slantF: 0.6, flare: 0.06, cabW: 0.84, tumble: 0.74,
    top: [[-2.275, 0.92], [-2.15, 0.98], [-1.5, 0.96], [-0.6, 0.86], [0.4, 0.72], [1.2, 0.6], [2.0, 0.45], [2.275, 0.37]],
    roof: [[-1.6, 0.95], [-1.1, 1.05], [-0.5, 1.1], [-0.1, 1.08], [0.65, 0.7]], zrf: -0.25, zrr: -0.5, cpil: -0.8, doors: 2, doorLen: 1.0,
    head: { style: 'slit', w: 0.42, h: 0.07, y: 0.45 }, tail: { style: 'strip', w: 0.4, h: 0.05 }, grille: { style: 'sport', y: 0.26, w: 0.9, h: 0.1 }, exhaust: 'center', spoiler: 'duck', rimStd: 'racing', rimColor: 0x1a1b1e,
    feat: { sideIntake: true, vents: true, noSeams: false } },
  valkyria: { L: 4.75, W: 1.96, wb: 2.85, wo: 0.2, r: 0.36, tw: 0.26, by: 0.16, round: 0.55, rn: 0.25, rt: 0.15, taperF: 0.2, slantF: 0.25, slantR: 0.12, flareR: 0.05,
    top: [[-2.375, 0.82], [-2.2, 0.9], [-1.6, 0.92], [-0.4, 0.88], [0.1, 0.86], [1.2, 0.8], [2.0, 0.68], [2.375, 0.55]],
    roof: [[-1.9, 0.92], [-1.45, 1.08], [-1.0, 1.22], [-0.6, 1.25], [-0.35, 1.22], [0.15, 0.86]], zrf: -0.5, zrr: -1.0, cpil: -1.05, doors: 2, doorLen: 1.2,
    head: { style: 'slim', w: 0.38, h: 0.08 }, tail: { style: 'round2', w: 0.3, h: 0.09 }, grille: { style: 'gt', w: 0.75, h: 0.16 }, exhaust: 'quad', spoiler: 'lip', rimStd: 'mesh', rimColor: 0xc6cad0,
    feat: { vents: true } },
  stormfagel: { L: 4.7, W: 2.04, wb: 2.7, wo: -0.12, r: 0.35, tw: 0.29, by: 0.1, round: 0.3, rn: 0.15, rt: 0.06, taperF: 0.25, taperR: 0.05, slantF: 0.5, flare: 0.08, cabW: 0.84, tumble: 0.76,
    top: [[-2.35, 0.9], [-2.15, 0.96], [-1.4, 0.94], [-0.6, 0.86], [0.4, 0.74], [1.2, 0.62], [2.0, 0.48], [2.35, 0.38]],
    roof: [[-1.75, 0.92], [-1.2, 1.06], [-0.6, 1.14], [-0.2, 1.14], [0.1, 1.08], [0.65, 0.74]], zrf: -0.2, zrr: -0.6, cpil: -0.75, doors: 2, doorLen: 1.0,
    head: { style: 'slit', w: 0.4, h: 0.07, y: 0.47 }, tail: { style: 'slimbar', w: 0.34, h: 0.07 }, grille: { style: 'sport', y: 0.25, w: 1.0, h: 0.12 }, exhaust: 'center', spoiler: 'swan', decal: 'race', rimStd: 'racing', rimColor: 0xd4af37,
    wingMat: 'trim', feat: { sideIntake: true, roofScoop: true, vents: true } }
};
for (const [id, d] of Object.entries(CAR_DEFS)) d.id = id;
// gamla formnamn (äldre sparfiler/specar utan body)
const LEGACY = { hatch: 'viggen', wagon: 'algen', rally: 'lodjuret', coupe: 'blixten', gt: 'vraken', super: 'stormfagel' };

/* ================================================================== Publikt API */
const partCache = {};
function getParts(D, kit, spoiler) {
  const k = D.id + '|' + kit + '|' + spoiler;
  return partCache[k] || (partCache[k] = buildParts(D, kit, spoiler));
}
function defaultPlate(id) {
  let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const A = 'ABCDEFGHJKLMNOPRSTUWXYZ';
  return A[h % 23] + A[(h >> 5) % 23] + A[(h >> 10) % 23] + ' ' + (100 + (h >> 15) % 900);
}
let flameGeo = null;

/**
 * Bygger en bilmodell.
 * look: lackfärg (tal) eller { color, finish, rims, rimColor, spoiler, kit, decal, decalColor, number, neon, tint, plate }.
 * opts: { ghost, quality: 'low'|'medium'|'high'|'ultra', physical (äldre flagga = high) }.
 */
export function buildCarModel(spec, look, opts = {}) {
  const M = shared();
  const id = spec && CAR_DEFS[spec.body] ? spec.body : spec && LEGACY[spec.shape] ? LEGACY[spec.shape] : (spec && CAR_DEFS[spec.id] ? spec.id : 'viggen');
  const D = CAR_DEFS[id];
  const lk = look !== null && typeof look === 'object' ? look : { color: look };
  const color = lk.color ?? 0xd0d4da;
  const finish = FINISHES.some(f => f.id === lk.finish) ? lk.finish : 'gloss';
  const rimStyle = !lk.rims || lk.rims === 'std' || !RIMS.some(r => r.id === lk.rims) ? D.rimStd : lk.rims;
  const factoryRim = rimStyle === D.rimStd && (!lk.rims || lk.rims === 'std');
  const rimColor = lk.rimColor ?? (factoryRim ? D.rimColor : rimStyle === 'stal' ? 0x30333a : 0xc0c5cb);
  const spoiler = lk.spoiler === undefined || lk.spoiler === null ? 'default' : (lk.spoiler === 'default' || SPOILERS.some(s => s.id === lk.spoiler) ? lk.spoiler : 'default');
  const kit = KITS.some(k => k.id === lk.kit) ? lk.kit : 'none';
  const decal = lk.decal === undefined ? (D.decal || 'none') : (DECALS.some(d => d.id === lk.decal) ? lk.decal : 'none');
  const number = clamp(lk.number | 0, 0, 99);
  const quality = opts.quality || (opts.physical ? 'high' : 'medium');
  const ghost = !!opts.ghost;
  const P = getParts(D, kit, spoiler === 'default' ? 'default' : spoiler);
  const S = P.S;

  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paintMat = ghost ? M.ghost : paintMaterial(color, finish, quality);
  const tailMat = ghost ? M.ghost : new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xff1a10, emissiveIntensity: 0.35, roughness: 0.25 });
  const headMat = ghost ? M.ghost : new THREE.MeshStandardMaterial({ color: 0xf2f4fa, emissive: 0xfff3dc, emissiveIntensity: quality === 'low' ? 0.9 : 1.15, roughness: 0.2 });
  const mats = { paint: paintMat, glass: ghost ? M.ghost : glassMat(lk.tint || 'clear', D.open), trim: ghost ? M.ghost : M.trim, chrome: ghost ? M.ghost : M.chrome, head: headMat, tail: tailMat };
  const meshes = [];
  for (const k of Object.keys(mats)) {
    const g = P.geos.full[k]; if (!g) continue;
    const m = new THREE.Mesh(g, mats[k]);
    m.castShadow = !ghost && (k === 'paint' || k === 'trim' || k === 'glass');
    m.receiveShadow = !ghost && k === 'paint';
    m.userData.lod = [g, P.geos.far[k] || g];
    body.add(m); meshes.push(m);
  }
  let plate = null, decalMesh = null, neon = null;
  if (!ghost) {
    plate = new THREE.Mesh(P.plate, plateMat(lk.plate || defaultPlate(id))); body.add(plate);
    if (decal !== 'none' || number > 0) {
      decalMesh = new THREE.Mesh(P.decal, decalMat(decalTexture(decal, lk.decalColor ?? 0xffffff, number, P), finish === 'matte'));
      decalMesh.renderOrder = 1; body.add(decalMesh);
    }
    if (lk.neon !== null && lk.neon !== undefined && lk.neon !== false) {
      neon = new THREE.Mesh(neonGeo(P), neonMat(lk.neon)); neon.renderOrder = 2; root.add(neon);
    }
  }
  // hjul
  const wmat = ghost ? M.ghost : wheelMat(rimColor, !!(factoryRim && D.rimPainted));
  const wg = [wheelGeo(rimStyle, D.r, D.tw, !!D.offroad, 0), wheelGeo(rimStyle, D.r, D.tw, !!D.offroad, 1)];
  const wheels = [];
  for (const [sx, i, front] of [[-1, 0, true], [1, 0, true], [-1, 1, false], [1, 1, false]]) {
    const z = S.wz[i], x = sx * P.wheelX[i];
    const pivot = new THREE.Group(); pivot.position.set(x, D.r, z);
    const w = new THREE.Mesh(wg[quality === 'low' ? 1 : 0], wmat);
    if (sx < 0) w.rotation.y = PI; // fälgens framsida utåt
    w.castShadow = !ghost;
    const spin = new THREE.Group(); spin.add(w); pivot.add(spin); root.add(pivot);
    wheels.push({ pivot, spin, front, side: sx, baseY: D.r, z, x, mesh: w });
  }
  // avgasflammor
  const flames = [];
  if (!ghost) {
    if (!flameGeo) { flameGeo = new THREE.ConeGeometry(0.1, 0.7, 8, 1, true); flameGeo.rotateX(-PI / 2); flameGeo.translate(0, 0, -0.35); }
    for (const e of [P.exList[0], P.exList[P.exList.length - 1]]) {
      const f = new THREE.Mesh(flameGeo, M.flame); f.position.set(e[0], e[1], e[2]); f.visible = false; body.add(f); flames.push(f);
    }
  }
  // detaljnivå: långt bort → enklare hjul, inga småprylar (samma antal draw calls, färre trianglar)
  const far = quality === 'low' ? 30 : quality === 'ultra' ? 110 : 65;
  let lod = 0;
  const updateLod = dist => {
    const lv = dist === undefined || dist === null || !(dist === dist) ? 0 : dist > far * (lod ? 0.9 : 1) ? 1 : 0;
    if (lv === lod) return;
    lod = lv;
    for (const m of meshes) m.geometry = m.userData.lod[lv];
    for (const w of wheels) w.mesh.geometry = wg[quality === 'low' ? 1 : lv];
    if (plate) plate.visible = lv === 0;
  };
  let H = 0; for (const p of D.roof || []) H = Math.max(H, p[1]);
  return {
    root, body, wheels, flames, paintMat, tailMat, headMat, isGhost: ghost, updateLod,
    shape: { id, L: D.L, W: D.W + 2 * (D.flare ?? 0), r: D.r, wb: D.wb, wo: D.wo, by: D.by, H: Math.max(H, S.Hs), tw: D.tw },
    ownMats: ghost ? [] : [paintMat, tailMat, headMat],
    meshes, plate, decal: decalMesh, neon
  };
}

export function disposeCarModel(model) {
  if (!model) return;
  model.ownMats.forEach(m => m.dispose());
  if (model.cone) model.cone.geometry.dispose();
  if (model.label) { if (model.label.material.map) model.label.material.map.dispose(); model.label.material.dispose(); }
}
