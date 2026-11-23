/**
 * Figurens utseende ("skin"): egen mall med lådnät för huvud, kropp, armar och ben.
 * Ett skin är ett objekt { px: Uint8ClampedArray (RGBA, SKIN_W×SKIN_H) } och kan exporteras som kompakt text
 * (palett + RLE, base64, prefix "kv1:") – lämpligt att skicka till andra spelare.
 *
 * Mallens delar (mått i pixlar, 1 px ≈ 5,8 cm):
 *   huvud 10×9×9, kropp 10×11×6, armar 4×12×4, ben 5×11×5
 * Varje del vecklas ut som ett kors: topp ovanför framsidan, vänster/höger sida bredvid, baksidan längst till höger,
 * botten under framsidan. Framsidan ritas som man ser figuren framifrån.
 */
import * as THREE from 'three';

export const SKIN_W = 72, SKIN_H = 48;
export const PARTS = {
  head: { name: 'Huvud', w: 10, h: 9, d: 9, ox: 0, oy: 0 },
  body: { name: 'Kropp', w: 10, h: 11, d: 6, ox: 38, oy: 0 },
  armR: { name: 'Höger arm', w: 4, h: 12, d: 4, ox: 0, oy: 27, mirror: 'armL' },
  armL: { name: 'Vänster arm', w: 4, h: 12, d: 4, ox: 16, oy: 27, mirror: 'armR' },
  legR: { name: 'Höger ben', w: 5, h: 11, d: 5, ox: 32, oy: 27, mirror: 'legL' },
  legL: { name: 'Vänster ben', w: 5, h: 11, d: 5, ox: 52, oy: 27, mirror: 'legR' }
};
export const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']; // samma ordning som THREE.BoxGeometry
export const FACE_NAMES = { pz: 'fram', nz: 'bak', nx: 'höger sida', px: 'vänster sida', py: 'topp', ny: 'botten' };
/** Ytans rektangel i mallen: [x, y, bredd, höjd] */
export function faceRect(p, f) {
  const { w, h, d, ox, oy } = p;
  switch (f) {
    case 'py': return [ox + d, oy, w, d];
    case 'nx': return [ox, oy + d, d, h];
    case 'pz': return [ox + d, oy + d, w, h];
    case 'px': return [ox + d + w, oy + d, d, h];
    case 'nz': return [ox + 2 * d + w, oy + d, w, h];
    case 'ny': return [ox + d, oy + d + h, w, d];
  }
}
/* ---------- uppslag: pixel → del/yta, spegling ---------- */
export const TEXEL_PART = new Int8Array(SKIN_W * SKIN_H).fill(-1); // index i PART_KEYS
export const TEXEL_FACE = new Int8Array(SKIN_W * SKIN_H).fill(-1);
export const MIRROR = new Int32Array(SKIN_W * SKIN_H).fill(-1);
export const PART_KEYS = Object.keys(PARTS);
export const USED = [];
PART_KEYS.forEach((k, pi) => {
  const p = PARTS[k];
  FACES.forEach((f, fi) => {
    const [x0, y0, fw, fh] = faceRect(p, f);
    for (let v = 0; v < fh; v++) for (let u = 0; u < fw; u++) { const i = (y0 + v) * SKIN_W + x0 + u; TEXEL_PART[i] = pi; TEXEL_FACE[i] = fi; USED.push(i); }
  });
});
PART_KEYS.forEach((k, pi) => {
  const p = PARTS[k], mp = PARTS[p.mirror || k];
  FACES.forEach(f => {
    const mf = f === 'px' ? 'nx' : f === 'nx' ? 'px' : f;
    const [x0, y0, fw, fh] = faceRect(p, f), [mx, my] = faceRect(mp, mf);
    for (let v = 0; v < fh; v++) for (let u = 0; u < fw; u++) MIRROR[(y0 + v) * SKIN_W + x0 + u] = (my + v) * SKIN_W + mx + (fw - 1 - u);
  });
});

/* ---------- ritverktyg för mallar ---------- */
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function newSkin() { return { px: new Uint8ClampedArray(SKIN_W * SKIN_H * 4) }; }
export function cloneSkin(s) { return { px: new Uint8ClampedArray(s.px) }; }
function painter(skin, seed = 1) {
  let r = seed >>> 0;
  const rnd = () => { r = (r + 0x6D2B79F5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const P = {
    rnd,
    set(i, c, j = 0.04) { const [R, G, B] = typeof c === 'string' ? hexRGB(c) : c; const q = rnd(); const f = j ? (q < 0.2 ? 1 - j : q > 0.85 ? 1 + j * 0.7 : 1) : 1; const o = i * 4; skin.px[o] = R * f; skin.px[o + 1] = G * f; skin.px[o + 2] = B * f; skin.px[o + 3] = 255; },
    rect(part, f, x, y, w, h, c, j) { const p = PARTS[part], [x0, y0, fw, fh] = faceRect(p, f); for (let v = y; v < y + h; v++) for (let u = x; u < x + w; u++) if (u >= 0 && v >= 0 && u < fw && v < fh) P.set((y0 + v) * SKIN_W + x0 + u, c, j); },
    face(part, f, c, j) { const [, , fw, fh] = faceRect(PARTS[part], f); P.rect(part, f, 0, 0, fw, fh, c, j); },
    fill(part, c, j) { for (const f of FACES) P.face(part, f, c, j); },
    /** vågrätt band runt delens fyra sidor (rader y..y+h-1), plus toppen/botten om rad 0 / sista */
    band(part, y, h, c, j) { for (const f of ['pz', 'nz', 'px', 'nx']) { const [, , fw] = faceRect(PARTS[part], f); P.rect(part, f, 0, y, fw, h, c, j); } },
    both(fn) { fn('armR', 'legR'); fn('armL', 'legL'); }
  };
  return P;
}

/* ---------- färdiga figurer ---------- */
function face(P, skin, eye, hair, mouth = '#9a5a48') {
  P.rect('head', 'pz', 2, 4, 2, 1, '#f4f4f0', 0); P.rect('head', 'pz', 6, 4, 2, 1, '#f4f4f0', 0);
  P.rect('head', 'pz', 3, 4, 1, 1, eye, 0); P.rect('head', 'pz', 6, 4, 1, 1, eye, 0);
  P.rect('head', 'pz', 2, 3, 2, 1, hair, 0.02); P.rect('head', 'pz', 6, 3, 2, 1, hair, 0.02);
  P.rect('head', 'pz', 4, 7, 2, 1, mouth, 0);
}
export const PRESETS = [
  {
    id: 'wanderer', name: 'Vandraren', draw(P) {
      const S = '#e0b090', H = '#e2c06a';
      P.fill('head', S); face(P, S, '#2a3a5a', H); P.rect('head', 'pz', 1, 6, 1, 1, '#e8907e', 0); P.rect('head', 'pz', 8, 6, 1, 1, '#e8907e', 0);
      P.band('head', 0, 3, '#b8302e'); P.face('head', 'py', '#b8302e'); P.band('head', 2, 1, '#e8e4da'); P.rect('head', 'py', 4, 3, 2, 2, '#e8e4da');
      P.rect('head', 'nz', 0, 3, 10, 5, H); P.rect('head', 'px', 0, 3, 9, 3, H); P.rect('head', 'nx', 0, 3, 9, 3, H); P.rect('head', 'pz', 0, 3, 1, 4, H); P.rect('head', 'pz', 9, 3, 1, 4, H);
      P.fill('body', '#2d4f8e'); P.band('body', 0, 1, '#e8e4da'); P.band('body', 1, 1, '#b8302e'); P.band('body', 2, 1, '#e8e4da');
      for (let x = 1; x < 10; x += 3) P.rect('body', 'pz', x, 6, 1, 1, '#e8e4da');
      P.fill('armR', '#2d4f8e'); P.fill('armL', '#2d4f8e'); P.band('armR', 9, 2, '#b8302e'); P.band('armL', 9, 2, '#b8302e'); P.band('armR', 11, 1, S); P.band('armL', 11, 1, S); P.face('armR', 'ny', S); P.face('armL', 'ny', S);
      P.fill('legR', '#3a3c4c'); P.fill('legL', '#3a3c4c'); P.band('legR', 8, 3, '#5a3a22'); P.band('legL', 8, 3, '#5a3a22'); P.face('legR', 'ny', '#4a2e1a'); P.face('legL', 'ny', '#4a2e1a');
    }
  },
  {
    id: 'fisher', name: 'Fiskaren', draw(P) {
      const S = '#d8a47c', Y = '#f2c230';
      P.fill('head', S); face(P, S, '#3a2a1a', '#8a5a32'); P.rect('head', 'pz', 1, 5, 8, 4, '#c8c4bc'); P.rect('head', 'pz', 2, 4, 2, 1, '#f4f4f0', 0); P.rect('head', 'pz', 6, 4, 2, 1, '#f4f4f0', 0); P.rect('head', 'pz', 3, 4, 1, 1, '#3a2a1a', 0); P.rect('head', 'pz', 6, 4, 1, 1, '#3a2a1a', 0); P.rect('head', 'pz', 4, 7, 2, 1, '#8a5a48', 0);
      P.band('head', 0, 3, Y); P.face('head', 'py', Y); P.rect('head', 'nz', 0, 3, 10, 3, Y);
      P.fill('body', Y); P.rect('body', 'pz', 4, 0, 2, 11, '#d8a420'); for (let y = 2; y < 10; y += 3) P.rect('body', 'pz', 5, y, 1, 1, '#3a3a3a', 0);
      P.fill('armR', Y); P.fill('armL', Y); P.band('armR', 11, 1, S); P.band('armL', 11, 1, S); P.face('armR', 'ny', S); P.face('armL', 'ny', S);
      P.fill('legR', '#2a3a4a'); P.fill('legL', '#2a3a4a'); P.band('legR', 6, 5, '#2a5a3a'); P.band('legL', 6, 5, '#2a5a3a'); P.face('legR', 'ny', '#1a3a2a'); P.face('legL', 'ny', '#1a3a2a');
    }
  },
  {
    id: 'smith', name: 'Smeden', draw(P) {
      const S = '#c8906a', H = '#7a3a1e';
      P.fill('head', S); face(P, S, '#1a1a1a', H); P.band('head', 0, 2, H); P.face('head', 'py', H); P.rect('head', 'nz', 0, 0, 10, 6, H);
      P.rect('head', 'pz', 1, 6, 8, 3, H); P.rect('head', 'pz', 4, 6, 2, 1, '#9a5a48', 0); P.rect('head', 'px', 0, 6, 3, 3, H); P.rect('head', 'nx', 6, 6, 3, 3, H);
      P.fill('body', '#8a8c92'); P.rect('body', 'pz', 1, 2, 8, 9, '#5a3a22'); P.rect('body', 'pz', 2, 0, 1, 2, '#5a3a22'); P.rect('body', 'pz', 7, 0, 1, 2, '#5a3a22'); P.band('body', 7, 1, '#3a2416');
      P.fill('armR', S); P.fill('armL', S); P.band('armR', 0, 4, '#8a8c92'); P.band('armL', 0, 4, '#8a8c92'); P.band('armR', 9, 3, '#3a2a1a'); P.band('armL', 9, 3, '#3a2a1a');
      P.fill('legR', '#4a3a30'); P.fill('legL', '#4a3a30'); P.band('legR', 9, 2, '#1e1a18'); P.band('legL', 9, 2, '#1e1a18'); P.face('legR', 'ny', '#1e1a18'); P.face('legL', 'ny', '#1e1a18');
    }
  },
  {
    id: 'astro', name: 'Rymdfararen', draw(P) {
      const W = '#e8eaee', G = '#b8bcc4';
      P.fill('head', W); P.rect('head', 'pz', 1, 2, 8, 5, '#1a2a4a', 0); P.rect('head', 'pz', 2, 3, 3, 1, '#6a9ae8', 0); P.rect('head', 'pz', 6, 5, 2, 1, '#3a5a9a', 0); P.band('head', 8, 1, G);
      P.fill('body', W); P.rect('body', 'pz', 2, 2, 6, 4, G); P.rect('body', 'pz', 3, 3, 1, 1, '#e0422e', 0); P.rect('body', 'pz', 5, 3, 2, 1, '#3ad47a', 0); P.rect('body', 'nz', 1, 1, 8, 8, '#9a9ea8'); P.band('body', 10, 1, G);
      P.fill('armR', W); P.fill('armL', W); P.band('armR', 3, 1, '#2d6ae0'); P.band('armL', 3, 1, '#2d6ae0'); P.band('armR', 10, 2, G); P.band('armL', 10, 2, G);
      P.fill('legR', W); P.fill('legL', W); P.band('legR', 8, 3, G); P.band('legL', 8, 3, G);
    }
  },
  {
    id: 'robot', name: 'Roboten', draw(P) {
      const M = '#7a8a96', D = '#4a5660';
      P.fill('head', M, 0.08); P.rect('head', 'pz', 1, 2, 8, 3, D, 0); P.rect('head', 'pz', 2, 3, 2, 1, '#ff5a32', 0); P.rect('head', 'pz', 6, 3, 2, 1, '#ff5a32', 0); for (let x = 2; x < 8; x += 2) P.rect('head', 'pz', x, 6, 1, 2, D, 0); P.rect('head', 'py', 4, 4, 2, 2, '#ff5a32', 0);
      P.fill('body', M, 0.08); P.rect('body', 'pz', 2, 2, 6, 6, D, 0); P.rect('body', 'pz', 3, 3, 1, 1, '#3ad47a', 0); P.rect('body', 'pz', 5, 3, 2, 1, '#f2c230', 0); P.rect('body', 'pz', 3, 5, 4, 2, '#2a3036', 0);
      P.fill('armR', M, 0.08); P.fill('armL', M, 0.08); P.band('armR', 5, 1, D); P.band('armL', 5, 1, D); P.band('armR', 10, 2, D); P.band('armL', 10, 2, D);
      P.fill('legR', M, 0.08); P.fill('legL', M, 0.08); P.band('legR', 5, 1, D); P.band('legL', 5, 1, D); P.band('legR', 9, 2, D); P.band('legL', 9, 2, D);
    }
  },
  { id: 'blank', name: 'Tom mall', draw(P) { const S = '#e0b090'; for (const k of PART_KEYS) P.fill(k, S, 0); P.fill('body', '#9aa0a8', 0); P.fill('legR', '#6a7078', 0); P.fill('legL', '#6a7078', 0); } }
];
export function presetSkin(id, seed = 7) { const s = newSkin(); (PRESETS.find(p => p.id === id) || PRESETS[0]).draw(painter(s, seed)); return s; }
export const defaultSkin = () => presetSkin('wanderer');

/** Slumpa fram en figur */
export function randomSkin(seed = (Math.random() * 1e9) | 0) {
  const s = newSkin(), P = painter(s, seed), r = P.rnd, pick = a => a[r() * a.length | 0];
  const S = pick(['#f2d0b0', '#e0b090', '#c8906a', '#a86a48', '#7a4a30', '#5a3a26']);
  const H = pick(['#2a1a10', '#5a3a1e', '#8a5a32', '#e2c06a', '#c8401e', '#e8e8e0', '#3a3a3a']);
  const shirt = pick(['#2d4f8e', '#b8302e', '#3a7a3a', '#e0a030', '#6a3a8a', '#2a8a8a', '#e86aa0', '#4a4a4a']);
  const pants = pick(['#3a3c4c', '#2a3a5a', '#5a4630', '#2a2a2a', '#6a6a5a']);
  const shoe = pick(['#5a3a22', '#1e1a18', '#e8e4da', '#8a2a20']);
  for (const k of PART_KEYS) P.fill(k, S);
  face(P, S, pick(['#2a3a5a', '#3a2a1a', '#2a5a2a', '#1a1a1a']), H);
  P.band('head', 0, 2, H); P.face('head', 'py', H); P.rect('head', 'nz', 0, 0, 10, 2 + (r() * 6 | 0), H);
  if (r() < 0.5) { P.rect('head', 'px', 0, 2, 9, 2, H); P.rect('head', 'nx', 0, 2, 9, 2, H); }
  if (r() < 0.3) { const hat = pick(['#b8302e', '#2d4f8e', '#3a7a3a', '#e0a030']); P.band('head', 0, 2, hat); P.face('head', 'py', hat); }
  P.fill('body', shirt);
  const pat = r();
  if (pat < 0.33) { const c2 = pick(['#e8e4da', '#f2c230', '#1e1a18']); for (let y = 1; y < 11; y += 3) P.band('body', y, 1, c2); }
  else if (pat < 0.6) { P.rect('body', 'pz', 3, 0, 4, 2, S); P.rect('body', 'pz', 4, 2, 2, 1, S); }
  const sleeve = r() < 0.6 ? 12 : 5;
  P.both((a, l) => { P.band(a, 0, sleeve - (sleeve === 12 ? 1 : 0), shirt); if (sleeve === 12) P.face(a, 'py', shirt); P.fill(l, pants); P.band(l, 9, 2, shoe); P.face(l, 'ny', shoe); });
  P.band('body', 10, 1, pants);
  return s;
}

/* ---------- export/import (kompakt) ---------- */
export function encodeSkin(skin) {
  const pal = new Map(), cols = [];
  const idxOf = i => {
    const o = i * 4; if (skin.px[o + 3] < 128) return 0;
    const k = (skin.px[o] << 16) | (skin.px[o + 1] << 8) | skin.px[o + 2];
    let n = pal.get(k);
    if (n === undefined) { if (cols.length >= 255) { let best = 1, bd = 1e9; cols.forEach((c, j) => { const d = Math.abs((c >> 16) - (k >> 16)) + Math.abs(((c >> 8) & 255) - ((k >> 8) & 255)) + Math.abs((c & 255) - (k & 255)); if (d < bd) { bd = d; best = j + 1; } }); return best; } cols.push(k); n = cols.length; pal.set(k, n); }
    return n;
  };
  const seq = USED.map(idxOf);
  const out = [1, cols.length];
  for (const c of cols) out.push(c >> 16, (c >> 8) & 255, c & 255);
  for (let i = 0; i < seq.length;) { let n = 1; while (i + n < seq.length && seq[i + n] === seq[i] && n < 255) n++; out.push(n, seq[i]); i += n; }
  let bin = ''; for (const b of out) bin += String.fromCharCode(b);
  return 'kv1:' + btoa(bin);
}
export function decodeSkin(str) {
  try {
    if (typeof str !== 'string' || !str.startsWith('kv1:')) return null;
    const bin = atob(str.slice(4)), b = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (b[0] !== 1) return null;
    const n = b[1], cols = [];
    let p = 2; for (let i = 0; i < n; i++, p += 3) cols.push([b[p], b[p + 1], b[p + 2]]);
    const s = newSkin(); let t = 0;
    while (p + 1 < b.length && t < USED.length) {
      const run = b[p], idx = b[p + 1]; p += 2;
      for (let k = 0; k < run && t < USED.length; k++, t++) { if (!idx) continue; const o = USED[t] * 4, c = cols[idx - 1]; if (!c) continue; s.px[o] = c[0]; s.px[o + 1] = c[1]; s.px[o + 2] = c[2]; s.px[o + 3] = 255; }
    }
    return s;
  } catch (e) { return null; }
}
const STORE_KEY = 'kubvarld:skin';
/** Sparad figur (global för spelet) – eller standardfiguren */
export function loadSkin() { const S = window.Spelhallen; const d = S && S.store.get(STORE_KEY, null); return (d && decodeSkin(d)) || defaultSkin(); }
export function hasCustomSkin() { const S = window.Spelhallen; return !!(S && S.store.get(STORE_KEY, null)); }
export function saveSkin(skin) { const d = encodeSkin(skin); if (window.Spelhallen) window.Spelhallen.store.set(STORE_KEY, d); return d; }

/* ---------- 3D-figur ---------- */
export const PX = 1.8 / 31; // meter per pixel
export function skinTexture(skin, tex) {
  const c = tex ? tex.image : document.createElement('canvas'); c.width = SKIN_W; c.height = SKIN_H;
  const ctx = c.getContext('2d');
  // genomskinliga pixlar på kroppen visas som mörkgrå
  const img = new ImageData(new Uint8ClampedArray(skin.px), SKIN_W, SKIN_H);
  for (const i of USED) if (img.data[i * 4 + 3] < 128) { img.data[i * 4] = 58; img.data[i * 4 + 1] = 60; img.data[i * 4 + 2] = 66; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  if (tex) { tex.needsUpdate = true; return tex; }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function partGeo(p) {
  const g = new THREE.BoxGeometry(p.w * PX, p.h * PX, p.d * PX);
  const uv = g.attributes.uv;
  FACES.forEach((f, fi) => {
    const [x0, y0, fw, fh] = faceRect(p, f);
    for (let v = 0; v < 4; v++) {
      const i = fi * 4 + v, u = uv.getX(i), vv = uv.getY(i);
      uv.setXY(i, (x0 + u * fw) / SKIN_W, 1 - (y0 + (1 - vv) * fh) / SKIN_H);
    }
  });
  return g;
}
/**
 * Bygger figuren. Returnerar { root, mat, parts, height, width, armorMats, setSkin(skin), dispose() }
 * Struktur: root → body → delar (leder som grupper, så att de kan roteras).
 */
export function buildSkinModel(skin) {
  const tex = skinTexture(skin);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const P = {};
  const joint = (key, jx, jy, cy) => { const g = new THREE.Group(); g.position.set(jx, jy, 0); const m = new THREE.Mesh(partGeo(PARTS[key]), mat); m.position.y = cy; g.add(m); body.add(g); return g; };
  const hip = 11 * PX, sh = 22 * PX;
  P.legR = joint('legR', -2.5 * PX, hip, -5.5 * PX);
  P.legL = joint('legL', 2.5 * PX, hip, -5.5 * PX);
  P.torso = joint('body', 0, hip, 5.5 * PX);
  P.armR = joint('armR', -7 * PX, sh - 2 * PX, -4 * PX);
  P.armL = joint('armL', 7 * PX, sh - 2 * PX, -4 * PX);
  P.head = joint('head', 0, sh, 4.5 * PX);
  // rustning (dold tills den bärs)
  const am = [0, 1, 2, 3].map(() => new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const A = (par, i, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), am[i]); m.position.set(x * PX, y * PX, z * PX); m.visible = false; par.add(m); return m; };
  P.armor = [
    [A(P.head, 0, 11, 3, 10, 0, 8, 0), A(P.head, 0, 1, 5, 10, -5.5, 5, 0), A(P.head, 0, 1, 5, 10, 5.5, 5, 0), A(P.head, 0, 11, 5, 1, 0, 5, -5)],
    [A(P.torso, 1, 11, 9, 7, 0, 6.5, 0), A(P.armL, 1, 5, 4, 5, 0, -1, 0), A(P.armR, 1, 5, 4, 5, 0, -1, 0)],
    [A(P.torso, 2, 11, 2, 7, 0, 1, 0), A(P.legL, 2, 6, 7, 6, 0, -3.5, 0), A(P.legR, 2, 6, 7, 6, 0, -3.5, 0)],
    [A(P.legL, 3, 6, 3, 6.4, 0, -9.6, 0.2), A(P.legR, 3, 6, 3, 6.4, 0, -9.6, 0.2)]
  ];
  // sköld på vänster arm
  const shMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const shGeo = new THREE.BoxGeometry(1.2 * PX, 10 * PX, 8 * PX);
  { const col = []; const n = shGeo.attributes.position.count; for (let i = 0; i < n; i++) { const face = (i / 4) | 0; const c = new THREE.Color(face === 0 ? '#2d4f8e' : '#8e9198'); col.push(c.r, c.g, c.b); } shGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
  P.shield = new THREE.Mesh(shGeo, shMat); P.shield.position.set(2.8 * PX, -6 * PX, 1 * PX); P.shield.visible = false; P.armL.add(P.shield);
  const model = {
    root, mat, parts: P, height: 1.8, width: 0.6, armorMats: am, shieldMat: shMat, tex,
    setSkin(s) { skinTexture(s, tex); },
    dispose() { root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); mat.dispose(); am.forEach(m => m.dispose()); shMat.dispose(); tex.dispose(); }
  };
  return model;
}
