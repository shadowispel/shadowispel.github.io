/**
 * Fjällracet – procedurella texturer ritade på <canvas>.
 */
import * as THREE from 'three';
import { makeRng } from '../../engine/kit.js';

let maxAniso = 4;
export function setAnisotropy(n) { maxAniso = Math.max(1, Math.min(8, n || 1)); }

const cache = new Map();
/** Texturer som skapas per bana läggs här och frigörs med disposeTrackTextures(). */
const trackTex = new Set();

function canvasTex(key, w, h, draw, opts = {}) {
  if (opts.cache !== false && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  if (opts.cache !== false) cache.set(key, t); else trackTex.add(t);
  return t;
}
export function disposeTrackTextures() { trackTex.forEach(t => t.dispose()); trackTex.clear(); }

function speckle(g, w, h, n, rng, colors, size = 1.5) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rng() * colors.length) | 0];
    const s = size * (0.5 + rng());
    g.fillRect(rng() * w, rng() * h, s, s);
  }
}

/** Asfalt: u = tvärs vägen (0..1), v = längs vägen. */
export function asphaltTex(kind = 'normal') {
  return canvasTex('asphalt:' + kind, 256, 512, (g, w, h) => {
    const rng = makeRng(11);
    const base = { normal: '#3b3d42', wet: '#26282d', light: '#55575c', city: '#2e3035', neo: '#1c1d24', airfield: '#5d5f63' }[kind] || '#3b3d42';
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, rng, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.06)'], 1.6);
    // slitage i spåren
    for (const u of [0.27, 0.36, 0.64, 0.73]) {
      const gr = g.createLinearGradient(u * w - 14, 0, u * w + 14, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, kind === 'wet' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(u * w - 14, 0, 28, h);
    }
    // lagningar
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(rng() * w * 0.8, rng() * h, 20 + rng() * 50, 14 + rng() * 40);
    }
    if (kind === 'airfield') {
      // betongplattor med fogar, gul mittlinje och vita kantlinjer
      g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 2;
      for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (const u of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(u * w, 0); g.lineTo(u * w, h); g.stroke(); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(20,20,20,0.18)'; g.fillRect(rng() * w * 0.4 + w * 0.3, rng() * h, 30 + rng() * 40, 4 + rng() * 6); }
      g.fillStyle = '#e8e8e0'; g.fillRect(w * 0.02, 0, w * 0.025, h); g.fillRect(w * 0.955, 0, w * 0.025, h);
      g.fillStyle = '#e8b830'; g.fillRect(w * 0.49, 0, w * 0.02, h);
    } else if (kind === 'neo') {
      // mörk våt asfalt med kalla streckade körfältslinjer – kanterna ritas av vägens ljuslister
      g.fillStyle = 'rgba(190,225,255,0.85)';
      for (let y = 0; y < h; y += 128) { g.fillRect(w * 0.245, y + 20, w * 0.012, 56); g.fillRect(w * 0.743, y + 20, w * 0.012, 56); }
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let y = 0; y < h; y += 64) g.fillRect(w * 0.494, y + 8, w * 0.012, 36);
    } else {
      // kantlinjer
      g.fillStyle = kind === 'city' ? '#d8d8d0' : '#ecece4';
      g.fillRect(w * 0.025, 0, w * 0.022, h);
      g.fillRect(w * 0.953, 0, w * 0.022, h);
      // mittlinje streckad
      g.fillStyle = kind === 'city' ? '#e6c14a' : '#efefe6';
      for (let y = 0; y < h; y += 128) g.fillRect(w * 0.492, y + 10, w * 0.016, 70);
    }
    // slitna linjer
    speckle(g, w, h, 1500, rng, ['rgba(60,60,60,0.5)'], 2);
  });
}

export function curbTex() {
  return canvasTex('curb', 64, 256, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#f2f2ee' : '#c8261e';
      g.fillRect(0, i * h / 4, w, h / 4);
    }
    const rng = makeRng(3);
    speckle(g, w, h, 600, rng, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)'], 2);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.3, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

/** Vägren/terrängdetalj – grå-vit brus som multipliceras med vertexfärger. */
export function groundTex(kind) {
  return canvasTex('ground:' + kind, 256, 256, (g, w, h) => {
    const rng = makeRng(kind.length * 31 + 7);
    const pal = {
      gravel: ['#8c857a', '#6e675d', '#a59e92', '#5a554d'],
      grass: ['#557a35', '#4a6d2c', '#668c3e', '#3f5f27', '#7a9a48'],
      sand: ['#d8b67e', '#c9a46a', '#e3c58f', '#b8945c'],
      snow: ['#eef3f8', '#dfe7f0', '#ffffff', '#cfd9e6'],
      ice: ['#9fc3dc', '#b9d6ea', '#8ab2cf', '#cfe4f2'],
      pave: ['#5c5e63', '#4f5156', '#67696e', '#45474b'],
      moss: ['#4e6a34', '#5a7a3a', '#3e5a2a', '#6a7a40', '#7a6a4a'],
      limestone: ['#cfc8b8', '#bdb6a6', '#ddd6c6', '#aaa494', '#8a9a68'],
      detail: ['#d8d8d8', '#bdbdbd', '#efefef', '#a8a8a8']
    }[kind] || ['#888', '#777', '#999'];
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 7000, rng, pal, kind === 'gravel' ? 2.6 : 2);
    if (kind === 'grass') { for (let i = 0; i < 1600; i++) { g.strokeStyle = pal[(rng() * pal.length) | 0]; g.beginPath(); const x = rng() * w, y = rng() * h; g.moveTo(x, y); g.lineTo(x + rng() * 3 - 1.5, y - 3 - rng() * 5); g.stroke(); } }
    if (kind === 'ice') {
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 40; i++) { g.beginPath(); let x = rng() * w, y = rng() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rng() * 40 - 20; y += rng() * 40 - 20; g.lineTo(x, y); } g.stroke(); }
      g.strokeStyle = 'rgba(40,70,100,0.18)';
      for (let i = 0; i < 60; i++) { g.beginPath(); const x = rng() * w, y = rng() * h; g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + rng() * 60 - 30, x + 60 + rng() * 60, y + rng() * 30 - 15); g.stroke(); }
    }
    if (kind === 'detail') {
      for (let i = 0; i < 120; i++) { g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(rng() * w, rng() * h, 6 + rng() * 22, 0, 7); g.fill(); }
    }
  });
}

export function rockTex() {
  return canvasTex('rock', 256, 256, (g, w, h) => {
    const rng = makeRng(77);
    g.fillStyle = '#8a8580'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rng() * 0.08})`; g.beginPath(); g.ellipse(rng() * w, rng() * h, 5 + rng() * 30, 3 + rng() * 12, rng() * 3, 0, 7); g.fill(); }
    speckle(g, w, h, 4000, rng, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.12)'], 1.6);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 25; i++) { g.beginPath(); let x = rng() * w, y = rng() * h; g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += rng() * 50 - 25; y += rng() * 30; g.lineTo(x, y); } g.stroke(); }
  });
}

export function concreteTex() {
  return canvasTex('concrete', 256, 256, (g, w, h) => {
    const rng = makeRng(5);
    g.fillStyle = '#a7a59f'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 6000, rng, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)'], 1.5);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 3, h);
    const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,20,0.3)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

export function railTex() {
  return canvasTex('rail', 64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9aa2a8'); gr.addColorStop(0.25, '#e4e9ec'); gr.addColorStop(0.5, '#8d959b'); gr.addColorStop(0.75, '#dfe4e8'); gr.addColorStop(1, '#7f878d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

export function woodTex() {
  return canvasTex('wood', 128, 64, (g, w, h) => {
    const rng = makeRng(9);
    g.fillStyle = '#7a5532'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${rng() < 0.5 ? '40,25,10' : '160,120,80'},0.35)`; g.beginPath(); const y = rng() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rng() * 6 - 3, w * 0.6, y + rng() * 6 - 3, w, y + rng() * 4 - 2); g.stroke(); }
  });
}

export function checkerTex() {
  return canvasTex('checker', 128, 32, (g, w, h) => {
    const n = 16, m = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * w / n, j * h / m, w / n + 1, h / m + 1); }
  });
}

export function chevronTex() {
  return canvasTex('chevron', 256, 64, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd21f';
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 60;
      g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 26, 8); g.lineTo(x + 50, 32); g.lineTo(x + 26, 56); g.lineTo(x, 56); g.lineTo(x + 24, 32); g.closePath(); g.fill();
    }
  });
}

/** Text på skylt/banderoll. */
export function bannerTex(text, bg = '#16306e', fg = '#ffd85c', w = 512, h = 96, sub = null) {
  return canvasTex('banner:' + text + bg + fg + w + h + sub, w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg); gr.addColorStop(1, shade(bg, -0.35));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.floor(h * (sub ? 0.42 : 0.55))}px Rubik, system-ui, sans-serif`;
    g.fillText(text, w / 2, sub ? h * 0.4 : h / 2 + 2);
    if (sub) { g.font = `700 ${Math.floor(h * 0.2)}px Rubik, system-ui, sans-serif`; g.globalAlpha = 0.85; g.fillText(sub, w / 2, h * 0.78); }
  });
}

function shade(hex, f) {
  const c = new THREE.Color(hex); c.multiplyScalar(1 + f); return '#' + c.getHexString();
}

/** Fasad med fönster (dag/natt). Returnerar { map, emissive }. */
export function facadeTex(night) {
  const key = 'facade:' + night;
  if (cache.has(key)) return cache.get(key);
  const rng = makeRng(night ? 21 : 22);
  const W = 256, H = 512, cols = 8, rows = 16;
  const draw = (emis) => (g) => {
    g.fillStyle = emis ? '#000' : (night ? '#3b3f4a' : '#8b8f96'); g.fillRect(0, 0, W, H);
    if (!emis) speckle(g, W, H, 2500, rng, ['rgba(0,0,0,0.1)', 'rgba(255,255,255,0.06)'], 2);
    const r2 = makeRng(night ? 99 : 98);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = r2() < (night ? 0.42 : 0.05);
      const col = ['#ffd890', '#ffe9b8', '#bfe0ff', '#ffc070'][(r2() * 4) | 0];
      const px = x * W / cols + 6, py = y * H / rows + 7, pw = W / cols - 12, ph = H / rows - 12;
      if (emis) { if (lit) { g.fillStyle = col; g.fillRect(px, py, pw, ph); } }
      else { g.fillStyle = lit ? col : (night ? '#1a1d26' : '#3d5568'); g.fillRect(px, py, pw, ph); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, pw, 3); }
    }
  };
  const mk = (emis) => { const c = document.createElement('canvas'); c.width = W; c.height = H; draw(emis)(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
  const res = { map: mk(false), emissive: mk(true) };
  cache.set(key, res);
  return res;
}

/** Neonskylt med glödande text. */
export function neonTex(text, color) {
  return canvasTex('neon:' + text + color, 256, 96, (g, w, h) => {
    g.fillStyle = '#05050a'; g.fillRect(0, 0, w, h);
    g.font = '900 54px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 3);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.65; g.fillText(text, w / 2, h / 2 + 3);
  });
}

/** Mjuk rund prick för partiklar och ljuskäglor. */
export function dotTex() {
  return canvasTex('dot', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { linear: true });
}

/** Ljuspöl på vägen (natt). */
export function poolTex() {
  return canvasTex('pool', 128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,220,160,0.9)'); gr.addColorStop(0.5, 'rgba(255,200,130,0.35)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

/** Normalkarta för vatten (brus). */
export function waterNormalTex() {
  if (cache.has('waternormal')) return cache.get('waternormal');
  const S = 128; const data = new Uint8Array(S * S * 4);
  const rng = makeRng(4);
  const hgt = new Float32Array(S * S);
  const waves = []; for (let i = 0; i < 14; i++) waves.push([1 + ((rng() * 6) | 0), ((rng() * 7) | 0) - 3, rng() * 6.28, 0.3 + rng()]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0; for (const [a, b, p, amp] of waves) v += Math.sin((a * x + b * y) / S * Math.PI * 2 + p) * amp / (a + Math.abs(b));
    hgt[y * S + x] = v;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x - 1 + S) % S];
    const dy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
    const i = (y * S + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  cache.set('waternormal', t);
  return t;
}

/** Siffra/nummer till bilarna. */
export function numberTex(n) {
  return canvasTex('num:' + n, 64, 64, (g, w, h) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.fill();
    g.fillStyle = '#111'; g.font = '900 40px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 2);
  });
}

/** Folkmassa/flaggor – enkel textur för vimplar. */
export function flagTex() {
  return canvasTex('flags', 256, 32, (g, w, h) => {
    const cols = ['#ffcc33', '#1f4fbf', '#c8261e', '#f4f4f4', '#2e8b3a'];
    for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 16, 0); g.lineTo(i * 16 + 8, h); g.closePath(); g.fill(); }
  });
}

/** Grusväg: u tvärs (0..1), v längs. Hjulspår, stenar och gräsrand i mitten. */
export function gravelRoadTex() {
  return canvasTex('road:gravel', 256, 512, (g, w, h) => {
    const rng = makeRng(41);
    g.fillStyle = '#8a7660'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 14000, rng, ['#9a8670', '#76644f', '#a8957c', '#6a5846', '#b8a68c', '#5a4a3a'], 2.4);
    for (const u of [0.28, 0.72]) {
      const gr = g.createLinearGradient(u * w - 26, 0, u * w + 26, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(50,35,20,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(u * w - 26, 0, 52, h);
    }
    // lös sten i kanterna och mitten
    for (let i = 0; i < 900; i++) { const u = rng() < 0.5 ? rng() * 0.12 : rng() < 0.5 ? 0.88 + rng() * 0.12 : 0.46 + rng() * 0.08; g.fillStyle = ['#a89880', '#6a5a48', '#c0b098'][(rng() * 3) | 0]; g.fillRect(u * w, rng() * h, 2 + rng() * 3, 2 + rng() * 3); }
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(40,28,16,0.18)'; g.beginPath(); g.ellipse(rng() * w, rng() * h, 8 + rng() * 16, 5 + rng() * 10, rng() * 3, 0, 7); g.fill(); }
  });
}
/** Packad snöväg med spår och isfläckar. */
export function snowRoadTex() {
  return canvasTex('road:snow', 256, 512, (g, w, h) => {
    const rng = makeRng(43);
    g.fillStyle = '#dfe6ee'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, rng, ['#eef3f8', '#cfd8e2', '#ffffff', '#c4ceda'], 2);
    for (const u of [0.27, 0.36, 0.64, 0.73]) {
      const gr = g.createLinearGradient(u * w - 12, 0, u * w + 12, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(120,140,165,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(u * w - 12, 0, 24, h);
    }
    for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(150,185,215,0.25)'; g.beginPath(); g.ellipse(w * (0.2 + rng() * 0.6), rng() * h, 10 + rng() * 22, 20 + rng() * 40, 0, 0, 7); g.fill(); }
    // plogkanter
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0, 0, w * 0.04, h); g.fillRect(w * 0.96, 0, w * 0.04, h);
  });
}
/** Grovhetskarta med vattenpölar (linjär, för våt asfalt). Ljusare = grövre. */
export function puddleTex() {
  return canvasTex('puddles', 256, 512, (g, w, h) => {
    const rng = makeRng(45);
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, rng, ['rgb(170,170,170)', 'rgb(130,130,130)'], 2);
    for (let i = 0; i < 26; i++) {
      const x = rng() * w, y = rng() * h, rx = 10 + rng() * 34, ry = 20 + rng() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      gr.addColorStop(0, 'rgb(25,25,25)'); gr.addColorStop(0.7, 'rgb(40,40,40)'); gr.addColorStop(1, 'rgba(150,150,150,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
    }
  }, { linear: true });
}
/** Korrugerad plåt (container, hangar) – gråskala som färgas av vertex-/instansfärg. */
export function corrugatedTex() {
  return canvasTex('corrugated', 128, 128, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = 200 + Math.sin(x / w * Math.PI * 2 * 16) * 40; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, h); }
    const rng = makeRng(47);
    speckle(g, w, h, 900, rng, ['rgba(60,40,20,0.15)', 'rgba(255,255,255,0.08)'], 2);
    const gr = g.createLinearGradient(0, h * 0.75, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(80,50,30,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
/** Fasad för framtidsstaden: mörk glas/metall med ljusa fönsterband. Returnerar { map, emissive }. */
export function neoFacadeTex() {
  const key = 'neofacade';
  if (cache.has(key)) return cache.get(key);
  const W = 256, H = 512, rows = 16;
  const mk = (emis) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const rng = makeRng(61);
    g.fillStyle = emis ? '#000' : '#1a1d28'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < rows; y++) {
      const py = y * H / rows;
      const lit = rng();
      if (!emis) { g.fillStyle = '#262a38'; g.fillRect(0, py, W, 6); g.fillStyle = '#0c0e16'; g.fillRect(0, py + 8, W, H / rows - 12); }
      // fönsterband: delvis tända, varma eller kalla
      for (let x = 0; x < 16; x++) {
        const on = rng() < (lit < 0.3 ? 0.9 : 0.35);
        if (!on) continue;
        const col = ['#bfe6ff', '#ffe0a8', '#9ad8ff', '#ffffff', '#ffc8f0'][(rng() * 5) | 0];
        g.fillStyle = emis ? col : '#8a9ab0';
        g.fillRect(x * W / 16 + 1, py + 10, W / 16 - 2, H / rows - 16);
      }
    }
    if (emis) { g.globalAlpha = 0.9; g.fillStyle = '#ffffff'; for (let y = 0; y < rows; y += 4) g.fillRect(0, y * H / rows + 2, W, 2); g.globalAlpha = 1; }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  };
  const res = { map: mk(false), emissive: mk(true) };
  cache.set(key, res);
  return res;
}
/** Hologram/skylt med text (vit på svart – färgas i shadern). */
export function holoTex(text, sub = '') {
  return canvasTex('holo:' + text + sub, 512, 192, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${sub ? 86 : 104}px Rubik, system-ui, sans-serif`; g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 4);
    if (sub) { g.font = '700 34px Rubik, system-ui, sans-serif'; g.fillText(sub, w / 2, h * 0.8); }
  }, { linear: true });
}
/** Randig tältduk / markis. */
export function stripeTex(a = '#d02a2a', b = '#f2efe6') {
  return canvasTex('stripe:' + a + b, 64, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 8, 0, 8, h); } });
}
