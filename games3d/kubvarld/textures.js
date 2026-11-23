/** Procedurellt ritade pixeltexturer (16×16) för block och föremål, samt ikoner. */
import { TILES, TILE, BLOCKS, ITEMS, M_CUBE, M_BOX, itemTile, isBlock, BLOCK_MAX } from './blocks.js';
import { mulberry, hashStr } from './noise.js';

const S = 16;
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const shade = (c, f) => [Math.max(0, Math.min(255, c[0] * f)), Math.max(0, Math.min(255, c[1] * f)), Math.max(0, Math.min(255, c[2] * f))];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Px {
  constructor(name) { this.d = new Uint8ClampedArray(S * S * 4); this.r = mulberry(hashStr(name) + 17); }
  set(x, y, c, a = 255) { x = ((x % S) + S) % S; y = ((y % S) + S) % S; const o = (y * S + x) * 4; this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = a; }
  setIn(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= S || y >= S) return; this.set(x, y, c, a); }
  get(x, y) { x = ((x % S) + S) % S; y = ((y % S) + S) % S; const o = (y * S + x) * 4; return [this.d[o], this.d[o + 1], this.d[o + 2]]; }
  alpha(x, y) { return this.d[(y * S + x) * 4 + 3]; }
  noise(base, amt) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) this.set(x, y, shade(base, 1 + (this.r() - 0.5) * amt)); return this; }
  specks(c, p, amt = 0.15) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (this.r() < p) this.set(x, y, shade(c, 1 + (this.r() - 0.5) * amt)); return this; }
  rect(x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setIn(x, y, c, a); return this; }
  clear() { this.d.fill(0); return this; }
  mask(rows, pal) { rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch !== '.' && pal[ch]) this.setIn(x, y, typeof pal[ch] === 'function' ? pal[ch]() : pal[ch]); } }); return this; }
  line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) this.setIn(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); return this; }
}

/* ---------- målade byggstenar (egen stil: mjuka fläckar, kvantiserade toner, ljus uppifrån-vänster) ---------- */
const sst = t => t * t * (3 - 2 * t);
/** Tilebart värdebrus 0..1 för 16×16; `cell` måste dela 16. */
function vnoise(r, cell) {
  const n = S / cell, g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const G = (i, j) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x + 0.5) / cell - 0.5, fy = (y + 0.5) / cell - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sst(fx - x0), ty = sst(fy - y0);
    const a = G(x0, y0) + (G(x0 + 1, y0) - G(x0, y0)) * tx, b = G(x0, y0 + 1) + (G(x0 + 1, y0 + 1) - G(x0, y0 + 1)) * tx;
    out[y * S + x] = a + (b - a) * ty;
  }
  return out;
}
/** Fält av tre oktaver, sträckt till 0..1 */
function field(p, w8 = 0.5, w4 = 0.32, w2 = 0.18) {
  const a = vnoise(p.r, 8), b = vnoise(p.r, 4), c = vnoise(p.r, 2), f = new Float32Array(S * S);
  let mn = 9, mx = -9;
  for (let i = 0; i < S * S; i++) { f[i] = a[i] * w8 + b[i] * w4 + c[i] * w2; mn = Math.min(mn, f[i]); mx = Math.max(mx, f[i]); }
  for (let i = 0; i < S * S; i++) f[i] = (f[i] - mn) / Math.max(1e-6, mx - mn);
  return f;
}
/** Måla med en tonskala (mörk → ljus) styrd av ett fält; kvantiseras till skalans steg. */
function ramp(p, f, pal, jitter = 0.1, y0 = 0, y1 = S) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < S; x++) {
    const t = Math.max(0, Math.min(0.999, f[y * S + x] + (p.r() - 0.5) * jitter));
    p.set(x, y, pal[Math.floor(t * pal.length)]);
  }
}
/** Mjuk kant: ljust uppe/vänster, mörkt nere/höger – ger blocken en handgjord, "snidad" känsla. */
function bevel(p, amt = 0.08) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (p.alpha(x, y) < 10) continue;
    let f = 1;
    if (y === 0) f += amt; else if (y === 1) f += amt * 0.3; else if (y === S - 1) f -= amt * 1.3; else if (y === S - 2) f -= amt * 0.35;
    if (x === 0) f += amt * 0.5; else if (x === S - 1) f -= amt * 0.8;
    if (f !== 1) p.set(x, y, shade(p.get(x, y), f), p.alpha(x, y));
  }
}
/** Rund cylinderskuggning för stammar (kolumner) */
function roundCols(p, amt = 0.14) { for (let x = 0; x < S; x++) { const f = 1 - amt + amt * 1.25 * Math.sin(Math.PI * (x + 0.5) / S) - (x > 11 ? amt * 0.3 : 0); for (let y = 0; y < S; y++) p.set(x, y, shade(p.get(x, y), f)); } }
const P = a => a.map(hex);
/** Rundade stenar (fältsten) med egen skuggning per sten */
function stones(p, pals, mortar, n = 8, edge = 1.1) {
  const pts = []; for (let i = 0; i < n; i++) pts.push([p.r() * S, p.r() * S, pals[p.r() * pals.length | 0], p.r()]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0;
    for (const q of pts) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dx = x + 0.5 - q[0] - ox, dy = y + 0.5 - q[1] - oy, d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; best = q; bx = dx; by = dy; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1;
    if (e < edge) { p.set(x, y, shade(mortar, 1 + (p.r() - 0.5) * 0.12)); continue; }
    const pal = best[2];
    // ljus från uppe-vänster inne i varje sten
    let t = 0.55 - (bx + by) * 0.055 + (best[3] - 0.5) * 0.3 + (p.r() - 0.5) * 0.12;
    if (e < edge + 1.2) t -= 0.28;
    t = Math.max(0, Math.min(0.999, t));
    p.set(x, y, pal[Math.floor(t * pal.length)]);
  }
}
/** Mjuk mosskant med rundade "kuddar" överst på en sidotextur */
function capScallop(p, top, deep, light, shadow, base = 4, amp = 3, period = 8) {
  // två rundade "kuddar" per block – en mjuk tuva som hänger över kanten
  const ph = (p.r() * 3) | 0;
  for (let x = 0; x < S; x++) {
    const u = (((x + ph) % period) + 0.5) / period;
    const h = base + Math.round(amp * Math.sqrt(Math.max(0, 1 - (u * 2 - 1) ** 2)));
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(1, h - 1);
      const c = y === 0 ? light : t > 0.8 ? deep : t > 0.55 ? shade(top[(p.r() * top.length) | 0], 0.88) : top[(p.r() * top.length) | 0];
      p.set(x, y, c);
    }
    p.set(x, h, shade(p.get(x, h), shadow));
    if (h + 1 < S) p.set(x, h + 1, shade(p.get(x, h + 1), (1 + shadow) / 2));
  }
}
function planks(p, base, grain) {
  // tre bräder (5/5/6 px) med ådring, springor och spikar
  const rows = [0, 5, 10, 16];
  const g = grain || shade(base, 0.82);
  for (let b = 0; b < 3; b++) {
    const bs = 1 + ((b * 37 + 11) % 5 - 2) * 0.035;
    const ph = p.r() * 6;
    for (let y = rows[b]; y < rows[b + 1]; y++) for (let x = 0; x < S; x++) {
      const w = Math.sin((x + ph) * 0.55 + y * 1.7) * 0.5 + 0.5;
      let c = shade(base, bs * (0.95 + w * 0.08) * (1 + (p.r() - 0.5) * 0.04));
      if (((x * 3 + y * 7 + b * 5) % 13 === 0) && p.r() < 0.7) c = shade(g, bs);
      if (y === rows[b + 1] - 1) c = shade(base, 0.6);
      else if (y === rows[b]) c = shade(c, 1.08);
      p.set(x, y, c);
    }
    const nx = b === 1 ? 13 : 2;
    p.set(nx, rows[b] + 2, shade(base, 0.45)); p.set(nx + 1, rows[b] + 2, shade(base, 0.7));
  }
  bevel(p, 0.1);
}
function oreTile(p, col, col2) {
  draw.stone(p);
  const n = 4 + (p.r() * 2 | 0);
  const dark = shade(col, 0.55);
  for (let k = 0; k < n; k++) {
    const cx = 2 + (p.r() * 12 | 0), cy = 2 + (p.r() * 12 | 0);
    const big = p.r() < 0.5;
    const cells = big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [0, 1]];
    for (const [dx, dy] of cells) { p.set(cx + dx + 1, cy + dy + 1, dark); }
    cells.forEach(([dx, dy], i) => p.set(cx + dx, cy + dy, i === 0 ? shade(col2 || col, 1.2) : shade(col, 0.92 + p.r() * 0.16)));
  }
}
/** Lövklumpar: rundade klasar med ljus ovansida, glipor mellan klasarna */
function leafClumps(p, pal, n = 10, rmin = 2.4, rmax = 3.8, base = null) {
  p.clear();
  if (base) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (p.r() < 0.55) p.set(x, y, shade(base, 0.9 + p.r() * 0.15));
  const cl = []; for (let i = 0; i < n; i++) cl.push([p.r() * S, p.r() * S, rmin + p.r() * (rmax - rmin)]);
  cl.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, r] of cl) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
      if (d > 1 || (d > 0.82 && p.r() < 0.45)) continue;
      let t = 0.62 - (dx + dy) / r * 0.3 - d * 0.18 + (p.r() - 0.5) * 0.22;
      t = Math.max(0, Math.min(0.999, t));
      p.set(x, y, pal[Math.floor(t * pal.length)]);
    }
  }
}
function logTop(p, inner, ring, bark) {
  // runda årsringar (inte fyrkantiga) med barkkant
  const ph = p.r() * 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5) + Math.sin(Math.atan2(y - 7.5, x - 7.5) * 3 + ph) * 0.35;
    let c;
    if (d > 7.1) c = shade(bark, 1 + (p.r() - 0.5) * 0.2);
    else if (d > 6.3) c = shade(bark, 1.25);
    else c = (Math.floor(d * 0.9) % 2 === 0) ? shade(inner[(p.r() * inner.length) | 0], 1 + (p.r() - 0.5) * 0.05) : shade(ring, 1 + (p.r() - 0.5) * 0.06);
    p.set(x, y, c);
  }
  p.set(7, 7, shade(ring, 0.8)); p.set(8, 8, shade(ring, 0.85));
}
function wool(p, base) {
  const f = field(p, 0.3, 0.3, 0.4);
  ramp(p, f, [shade(base, 0.88), shade(base, 0.95), base, shade(base, 1.06)], 0.25);
  // stickad rand: små V-maskor
  for (let y = 1; y < S; y += 4) for (let x = 0; x < S; x += 2) { p.set(x, y, shade(base, 1.1)); p.set(x + 1, y + 1, shade(base, 0.85)); }
  bevel(p, 0.06);
}
function blades(p, cols, n, minH, maxH, lean = 1) {
  p.clear();
  for (let k = 0; k < n; k++) {
    const x0 = 1 + (p.r() * 14 | 0), h = minH + (p.r() * (maxH - minH) | 0), dir = (p.r() - 0.5) * lean;
    const c = cols[p.r() * cols.length | 0];
    for (let i = 0; i < h; i++) p.setIn(Math.round(x0 + dir * i * i / h), 15 - i, shade(c, 0.75 + i / h * 0.45));
  }
}
function stem(p, x, y0, y1, c) { for (let y = y0; y <= y1; y++) p.setIn(x, y, shade(c, 0.9 + (y % 3) * 0.05)); }
const TOOLS = {
  pick: ['................', '....hhhhhh......', '...hHHHHHHhh....', '..hH.....sHHh...', '..h.....sS.HHh..', '........sS..Hh..', '.......sS....hh.', '......sS.....h..', '.....sS.........', '....sS..........', '...sS...........', '..sS............', '.sS.............', '................', '................', '................'],
  axe: ['................', '........hh......', '.......hHHh.....', '......hHHHHh....', '......hHHHsS....', '.......hHsS.....', '........sS......', '.......sS.......', '......sS........', '.....sS.........', '....sS..........', '...sS...........', '..sS............', '.sS.............', '................', '................'],
  shovel: ['................', '..........hhh...', '.........hHHHh..', '.........hHHHh..', '..........hHh...', '.........sS.....', '........sS......', '.......sS.......', '......sS........', '.....sS.........', '....sS..........', '...sS...........', '..sS............', '.sS.............', '................', '................'],
  hoe: ['................', '......hhhhhh....', '......hHHHHh....', '.........sSh....', '........sS......', '.......sS.......', '......sS........', '.....sS.........', '....sS..........', '...sS...........', '..sS............', '.sS.............', '................', '................', '................', '................'],
  sword: ['................', '.............hh.', '............hHh.', '...........hHh..', '..........hHh...', '.........hHh....', '........hHh.....', '.......hHh......', '..g...hHh.......', '...g.hHh........', '....gHh.........', '....sg..........', '...sS.g.........', '..sS............', '.hh.............', '................']
};
const TIER_COL = [['#c9995a', '#8a6132'], ['#a3a6ae', '#6c6f78'], ['#eef0f2', '#a9adb2'], ['#e6fbff', '#58b4dc'], ['#fff0a0', '#d8a428'], ['#ff8a3a', '#3a2422']];

// Nordisk palett
const GRASS = P(['#3b6440', '#487246', '#56824b', '#669252', '#78a35b']);
const SOIL = P(['#4e3526', '#5f412d', '#6f4d35', '#7e5a3e']);
const GRANITE = P(['#666973', '#737680', '#80838d', '#8d909a', '#9a9da6']);

/* ---------- ritfunktioner per ruta ---------- */
const draw = {
  missing(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, ((x >> 3) ^ (y >> 3)) ? [255, 0, 255] : [20, 20, 20]); },
  grass_top(p) {
    ramp(p, field(p, 0.45, 0.35, 0.2), GRASS, 0.16);
    // små tuvor och lavprickar
    for (let k = 0; k < 7; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; p.set(x, y, hex('#8fb466')); p.set(x + 1, y - 1, hex('#7ea65a')); }
    for (let k = 0; k < 3; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; p.set(x, y, hex('#c7cf8f')); }
    bevel(p, 0.04);
  },
  dirt(p) {
    ramp(p, field(p), SOIL, 0.18);
    // småsten och rötter
    for (let k = 0; k < 6; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; p.set(x, y, hex('#9a856c')); p.set(x + 1, y + 1, hex('#3f2a1c')); }
    for (let k = 0; k < 2; k++) { let x = p.r() * S | 0, y = p.r() * S | 0; for (let i = 0; i < 4; i++) { p.set(x, y, hex('#46301f')); x += 1; y += p.r() < 0.4 ? 1 : 0; } }
    bevel(p, 0.05);
  },
  grass_side(p) {
    draw.dirt(p);
    capScallop(p, P(['#56824b', '#5f8b4f', '#669252']), hex('#3f6a40'), hex('#86b064'), 0.6);
  },
  stone(p) {
    ramp(p, field(p, 0.4, 0.35, 0.25), GRANITE, 0.12);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = p.r(); if (r < 0.05) p.set(x, y, hex('#b0928a')); else if (r < 0.085) p.set(x, y, hex('#4e505a')); else if (r < 0.1) p.set(x, y, hex('#c2c5cc')); }
    // en mjuk spricka
    let x = p.r() * S | 0, y = p.r() * 8 | 0; for (let i = 0; i < 6; i++) { p.set(x, y, hex('#555862')); p.set(x + 1, y, hex('#a2a5ae')); y++; x += p.r() < 0.4 ? 1 : p.r() < 0.3 ? -1 : 0; }
    bevel(p, 0.05);
  },
  cobble(p) { stones(p, [GRANITE, P(['#6f6a6c', '#7e787a', '#8d8789', '#9c9698', '#aaa4a5']), P(['#626a72', '#6f7780', '#7c848d', '#89919a', '#969ea7'])], hex('#3f4047'), 8); bevel(p, 0.08); },
  mossy_cobble(p) {
    draw.cobble(p);
    const f = field(p, 0.5, 0.3, 0.2);
    const M = P(['#3e5f2f', '#4f7436', '#62893f', '#7a9e4c']);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = f[y * S + x] + (8 - y) * 0.035; if (v > 0.62) p.set(x, y, M[Math.min(3, Math.floor((v - 0.62) * 9))]); }
  },
  bedrock(p) { stones(p, [P(['#25262b', '#303138', '#3c3d45', '#4a4b54'])], hex('#141418'), 11, 0.8); },
  sand(p) {
    ramp(p, field(p, 0.4, 0.3, 0.3), P(['#c9ae78', '#d6bd88', '#e0ca97', '#e9d6a7']), 0.12);
    for (let k = 0; k < 3; k++) { const y = 2 + k * 5 + (p.r() * 2 | 0); for (let x = 0; x < S; x++) if (Math.sin(x * 0.7 + k * 2) > 0.2) p.set(x, y + (Math.sin(x * 0.5 + k) > 0.6 ? 1 : 0), hex('#efdfb4')); }
    for (let k = 0; k < 5; k++) p.set(p.r() * S | 0, p.r() * S | 0, hex('#a88f64'));
    bevel(p, 0.04);
  },
  sandstone_top(p) { ramp(p, field(p), P(['#cbb07a', '#d5bb86', '#dec692', '#e6d09e']), 0.08); bevel(p, 0.09); },
  sandstone_side(p) {
    ramp(p, field(p, 0.2, 0.3, 0.5), P(['#c8ab72', '#d3b77f', '#dcc28c']), 0.1);
    for (let x = 0; x < S; x++) { p.set(x, 0, hex('#e9d6a6')); p.set(x, 4, hex('#b8995f')); p.set(x, 5, hex('#e2cc98')); p.set(x, 10, hex('#b8995f')); p.set(x, 11, hex('#e2cc98')); p.set(x, 15, hex('#a8894f')); }
  },
  gravel(p) { stones(p, [P(['#6d6863', '#7c7671', '#8c8580', '#9b948f']), P(['#5f5c5a', '#6e6a68', '#7d7977', '#8c8886']), P(['#7d6f63', '#8c7d70', '#9a8b7d', '#a8998b'])], hex('#4a4541'), 16, 0.8); },
  snow(p) { ramp(p, field(p), P(['#d8e3ef', '#e3ebf5', '#edf3f9', '#f7fafd']), 0.08); for (let k = 0; k < 5; k++) p.set(p.r() * S | 0, p.r() * S | 0, hex('#ffffff')); bevel(p, 0.04); },
  snow_side(p) { draw.dirt(p); capScallop(p, P(['#edf3f9', '#e3ebf5']), hex('#c2d2e6'), hex('#ffffff'), 0.6); },
  ice(p) {
    const f = field(p);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, shade(hex('#9fcbe8'), 0.92 + f[y * S + x] * 0.14), 185);
    for (let k = 0; k < 2; k++) { let x = p.r() * S | 0, y = 0; for (let i = 0; i < 16; i++) { p.set(x, y, hex('#e8f6ff'), 225); y++; x += p.r() < 0.35 ? 1 : p.r() < 0.3 ? -1 : 0; } }
  },
  clay(p) { ramp(p, field(p, 0.2, 0.3, 0.5), P(['#8a93a0', '#949daa', '#9ea7b3', '#a8b0bc']), 0.08); for (let x = 0; x < S; x++) { if (p.r() < 0.6) p.set(x, 5, hex('#848d9a')); if (p.r() < 0.6) p.set(x, 11, hex('#b0b8c3')); } bevel(p, 0.05); },
  peat(p) { ramp(p, field(p), P(['#2f2219', '#3b2b20', '#473427', '#533d2e']), 0.15); for (let k = 0; k < 12; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; p.line(x, y, x + 3, y + (p.r() < 0.5 ? 1 : 0), shade(hex('#6a4f36'), 0.9 + p.r() * 0.2)); } p.specks(hex('#5a6a2e'), 0.04); bevel(p, 0.05); },
  spruce_log(p) {
    // barkplattor med mörka sprickor och gröngrå lav
    const f = field(p, 0.2, 0.3, 0.5);
    ramp(p, f, P(['#3b2a1d', '#4a3524', '#57402c', '#634a33']), 0.12);
    for (let k = 0; k < 4; k++) { let x = 1 + k * 4 + (p.r() * 2 | 0); for (let y = 0; y < S; y++) { p.set(x, y, hex('#2a1d14')); if (p.r() < 0.25) x += p.r() < 0.5 ? 1 : -1; } }
    for (let k = 0; k < 3; k++) { const x = p.r() * 14 | 0, y = p.r() * 14 | 0; p.set(x, y, hex('#8e9c7a')); p.set(x + 1, y, hex('#7c8a6a')); p.set(x, y + 1, hex('#9aa886')); }
    roundCols(p, 0.16);
  },
  spruce_log_top(p) { logTop(p, P(['#b08a5c', '#c19b6b']), hex('#946e45'), hex('#3f2c1e')); },
  birch_log(p) {
    // gräddvit näver med vågräta lenticeller och persikofärgade flagor
    ramp(p, field(p, 0.3, 0.3, 0.4), P(['#d9d2c2', '#e3ddcf', '#ece7dc', '#f4f0e7']), 0.1);
    for (let k = 0; k < 3; k++) { const x = p.r() * 13 | 0, y = p.r() * 14 | 0; p.rect(x, y, 3, 2, hex('#dcb89c')); p.set(x, y, hex('#e8cbb2')); }
    for (let k = 0; k < 11; k++) { const y = p.r() * S | 0, x = p.r() * S | 0, n = 2 + (p.r() * 5 | 0); for (let i = 0; i < n; i++) p.set(x + i, y, i === 0 || i === n - 1 ? hex('#8c8378') : hex('#4a423b')); }
    roundCols(p, 0.14);
  },
  birch_log_top(p) { logTop(p, P(['#d6c094', '#e2cda2']), hex('#c2aa7c'), hex('#e9e4d8')); },
  pine_log(p) {
    // rödbrun tallbark med flagor
    ramp(p, field(p, 0.2, 0.3, 0.5), P(['#6e3f27', '#7e4a2e', '#8e5535', '#9c603c']), 0.12);
    for (let k = 0; k < 14; k++) { const x = p.r() * 14 | 0, y = p.r() * 15 | 0, w = 2 + (p.r() * 2 | 0); for (let i = 0; i < w; i++) p.set(x + i, y, hex('#c07b4b')); p.set(x, y + 1, hex('#4f2c1b')); }
    roundCols(p, 0.16);
  },
  pine_log_top(p) { logTop(p, P(['#c49562', '#d3a571']), hex('#a87b48'), hex('#6e3f27')); },
  spruce_leaves(p) {
    // täta barr: mörk bas + korta diagonala barrstreck
    p.clear();
    const f = field(p);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (f[y * S + x] < 0.16) continue; p.set(x, y, shade(hex('#1f3a2a'), 0.85 + f[y * S + x] * 0.3)); }
    const N = P(['#2f5a3c', '#3b6b47', '#4a7d53']);
    for (let k = 0; k < 34; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; if (p.alpha(x, y) < 10) continue; const c = N[p.r() * 3 | 0]; const d = p.r() < 0.5 ? 1 : -1; p.set(x, y, c); p.set(x + d, y + 1, shade(c, 0.9)); if (p.r() < 0.5) p.set(x + 2 * d, y + 2, shade(c, 0.8)); }
  },
  birch_leaves(p) { leafClumps(p, P(['#4d7f34', '#5f933e', '#74a84a', '#8bbb58', '#a3cb6a']), 11, 2.3, 3.6, hex('#3f6a2c')); },
  pine_leaves(p) { leafClumps(p, P(['#2a4d2b', '#355d33', '#41703c', '#4f8246', '#5f9150']), 10, 2.6, 4, hex('#22402a')); },
  spruce_planks(p) { planks(p, hex('#a77c4b')); },
  birch_planks(p) { planks(p, hex('#dcc69a')); },
  pine_planks(p) { planks(p, hex('#c98d57')); },
  coal_ore(p) { oreTile(p, hex('#26262a'), hex('#5a5a66')); },
  iron_ore(p) { oreTile(p, hex('#c27e52'), hex('#e8b48a')); },
  gold_ore(p) { oreTile(p, hex('#f0c83c'), hex('#fff2a8')); },
  diamond_ore(p) {
    // egen design: små slipade romber i granit, ljusblå/vita med blänk och svag glimt
    draw.stone(p);
    const D = hex('#24607e'), M = hex('#86d8f0'), L = hex('#cff6ff'), W = hex('#ffffff');
    const spots = [[4, 4], [11, 5], [6, 11], [12, 12]];
    spots.forEach(([bx, by], k) => {
      if (k === 3 && p.r() < 0.5) return;
      const cx = bx + (p.r() * 2 | 0) - 1, cy = by + (p.r() * 2 | 0) - 1, r = k === 1 ? 1 : 2;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const m = Math.abs(dx) + Math.abs(dy); if (m > r) continue;
        p.set(cx + dx, cy + dy, m === r ? D : (dx + dy < 0 ? L : M));
      }
      p.set(cx, cy - r + 1, W); p.set(cx + 1, cy + r, shade(D, 0.7));
    });
    for (let k = 0; k < 3; k++) { const x = 1 + (p.r() * 14 | 0), y = 1 + (p.r() * 14 | 0); p.set(x, y, shade(L, 1.05)); }
  },
  glass(p) { p.clear(); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#e2f2f8'), 235); p.set(i, 15, hex('#a9cad8'), 235); p.set(0, i, hex('#e2f2f8'), 235); p.set(15, i, hex('#a9cad8'), 235); } for (let i = 0; i < 4; i++) { p.set(3 + i, 6 - i, hex('#ffffff'), 190 - i * 20); p.set(10 + i, 13 - i, hex('#ffffff'), 140 - i * 20); } },
  stone_bricks(p) {
    ramp(p, field(p, 0.3, 0.3, 0.4), GRANITE.slice(1), 0.1);
    const M = hex('#4a4c55'), L = hex('#aeb1ba');
    for (let x = 0; x < S; x++) { p.set(x, 7, M); p.set(x, 15, M); p.set(x, 0, L); p.set(x, 8, L); }
    for (let y = 0; y < 7; y++) { p.set(9, y, M); p.set(10, y, L); }
    for (let y = 8; y < 15; y++) { p.set(3, y, M); p.set(4, y, L); }
    bevel(p, 0.06);
  },
  bricks(p) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = y >> 2, off = row & 1 ? 4 : 0;
      const mort = (y & 3) === 3 || ((x + off) & 7) === 7;
      const top = (y & 3) === 0;
      p.set(x, y, mort ? shade(hex('#cbbfa9'), 1 + (p.r() - 0.5) * 0.08) : shade(hex('#a5523d'), (top ? 1.12 : 1) * (1 + (p.r() - 0.5) * 0.14)));
    }
    bevel(p, 0.06);
  },
  bench_top(p) { planks(p, hex('#b08a55')); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#5a4026')); p.set(i, 15, hex('#5a4026')); p.set(0, i, hex('#5a4026')); p.set(15, i, hex('#5a4026')); } for (let i = 3; i < 13; i++) { p.set(i, 5, hex('#6d4e2e')); p.set(i, 10, hex('#6d4e2e')); p.set(5, i, hex('#6d4e2e')); p.set(10, i, hex('#6d4e2e')); } },
  bench_side(p) { planks(p, hex('#a77c4b')); p.rect(0, 0, 16, 3, hex('#6b4b2c')); p.rect(3, 6, 8, 2, hex('#b8bcc2')); p.rect(11, 6, 3, 2, hex('#6b4b2c')); for (let i = 3; i < 11; i += 2) p.set(i, 8, hex('#8a8e94')); },
  bench_front(p) { planks(p, hex('#a77c4b')); p.rect(0, 0, 16, 3, hex('#6b4b2c')); p.rect(4, 5, 2, 8, hex('#6b4b2c')); p.rect(2, 5, 6, 3, hex('#9aa0a8')); p.rect(10, 6, 1, 7, hex('#6b4b2c')); p.rect(9, 5, 4, 2, hex('#c0c4ca')); },
  furnace_side(p) { stones(p, [GRANITE], hex('#3f4047'), 7); bevel(p, 0.1); },
  furnace_top(p) { draw.furnace_side(p); p.rect(4, 4, 8, 8, hex('#3a3b42')); p.rect(5, 5, 6, 6, hex('#2a2a30')); },
  furnace_front(p) { draw.furnace_side(p); p.rect(3, 7, 10, 7, hex('#1b1b1d')); p.rect(3, 6, 10, 1, hex('#55575b')); p.rect(4, 2, 8, 2, hex('#55575b')); },
  furnace_lit(p) { draw.furnace_front(p); for (let x = 4; x < 12; x++) for (let y = 8; y < 14; y++) { const v = (14 - y) / 6 + p.r() * 0.4; p.set(x, y, v > 0.9 ? hex('#ffe27a') : v > 0.5 ? hex('#ff9a2e') : hex('#c2401a')); } },
  chest_side(p) { planks(p, hex('#9c6a38')); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#4a3018')); p.set(i, 15, hex('#4a3018')); p.set(0, i, hex('#4a3018')); p.set(15, i, hex('#4a3018')); p.set(i, 5, hex('#4a3018')); } },
  chest_front(p) { draw.chest_side(p); p.rect(6, 4, 4, 4, hex('#3a3d44')); p.rect(7, 4, 2, 3, hex('#e6c34a')); p.set(7, 6, hex('#a78526')); },
  chest_top(p) { planks(p, hex('#a6743f')); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#4a3018')); p.set(i, 15, hex('#4a3018')); p.set(0, i, hex('#4a3018')); p.set(15, i, hex('#4a3018')); } },
  torch(p) { p.clear(); for (let y = 9; y < 16; y++) { p.set(7, y, hex('#7a5230')); p.set(8, y, hex('#5c3d22')); } p.set(7, 6, hex('#ffe9a0')); p.set(8, 6, hex('#ffd34a')); p.set(7, 7, hex('#ffd34a')); p.set(8, 7, hex('#ff9a2a')); p.set(7, 8, hex('#ff9a2a')); p.set(8, 8, hex('#c8641e')); },
  torch_top(p) { p.clear(); p.set(7, 7, hex('#ffe9a0')); p.set(8, 7, hex('#ffd34a')); p.set(7, 8, hex('#ffd34a')); p.set(8, 8, hex('#ff9a2a')); },
  lantern(p) { p.clear(); p.rect(4, 7, 8, 9, hex('#3a3d42')); p.rect(5, 8, 6, 7, hex('#ffd77a')); p.rect(6, 9, 4, 5, hex('#fff0c0')); p.rect(6, 5, 4, 2, hex('#2a2c30')); p.set(7, 5, hex('#55585e')); },
  lantern_top(p) { p.clear(); p.rect(4, 4, 8, 8, hex('#3a3d42')); p.rect(6, 6, 4, 4, hex('#2a2c30')); },
  wool_white(p) { wool(p, hex('#ecebe6')); }, wool_blue(p) { wool(p, hex('#3f63c4')); }, wool_yellow(p) { wool(p, hex('#e9c534')); },
  wool_pink(p) { wool(p, hex('#e07aa8')); }, wool_red(p) { wool(p, hex('#b8302e')); }, wool_green(p) { wool(p, hex('#4f8a36')); }, wool_black(p) { wool(p, hex('#26262b')); },
  diamond_block(p) {
    // slipad diamantyta: rombmönster i isblått med vita fasettkanter
    const A = P(['#8fd6ea', '#a9e4f4', '#c4effa', '#e2fbff']);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + y) % 8, v = (x - y + 16) % 8;
      const t = (Math.min(u, 8 - u) + Math.min(v, 8 - v)) / 8;
      let c = A[Math.min(3, Math.floor(t * 4))];
      if (u === 0 || v === 0) c = hex('#62b2cf');
      p.set(x, y, shade(c, 1 + (p.r() - 0.5) * 0.05));
    }
    for (let i = 0; i < S; i++) { p.set(i, 0, hex('#f4feff')); p.set(0, i, hex('#f4feff')); p.set(i, 15, hex('#4a96b8')); p.set(15, i, hex('#4a96b8')); }
    for (const [x, y] of [[4, 3], [11, 8], [5, 12]]) { p.set(x, y, hex('#ffffff')); p.set(x + 1, y, hex('#ffffff')); p.set(x, y + 1, hex('#ffffff')); }
  },
  gold_block(p) { p.noise(hex('#f0c63a'), 0.08); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#fff0a0')); p.set(0, i, hex('#fff0a0')); p.set(i, 15, hex('#b8901e')); p.set(15, i, hex('#b8901e')); } p.line(3, 12, 12, 3, hex('#fff6c8')); },
  iron_block(p) { p.noise(hex('#d6d8dc'), 0.06); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#f4f5f6')); p.set(0, i, hex('#f4f5f6')); p.set(i, 15, hex('#9a9da2')); p.set(15, i, hex('#9a9da2')); p.set(i, 7, hex('#b9bcc0')); } },
  tallgrass(p) { blades(p, P(['#5f8b4f', '#56824b', '#78a35b', '#6c9a55']), 8, 5, 12, 1.4); },
  fern(p) { p.clear(); const c = hex('#3f8a40'); for (let k = 0; k < 4; k++) { const x0 = 3 + k * 3, h = 9 + (p.r() * 4 | 0); for (let i = 0; i < h; i++) { const x = x0 + Math.round((k < 2 ? -1 : 1) * i * i / 30), y = 15 - i; p.setIn(x, y, shade(c, 0.85 + i / h * 0.3)); if (i > 2 && i % 2 === 0) { p.setIn(x - 1, y, shade(c, 1.1)); p.setIn(x + 1, y, shade(c, 0.9)); } } } },
  bluebell(p) { p.clear(); const g = hex('#4f8f3a'); stem(p, 7, 5, 15, g); p.set(6, 12, g); p.set(8, 10, g); p.rect(8, 4, 3, 3, hex('#5b74e0')); p.set(9, 7, hex('#3f56c0')); p.set(8, 7, hex('#7b90f0')); p.set(10, 7, hex('#7b90f0')); p.rect(4, 7, 3, 2, hex('#5b74e0')); p.set(5, 9, hex('#3f56c0')); p.set(7, 4, g); },
  buttercup(p) { p.clear(); const g = hex('#4f8f3a'); stem(p, 7, 7, 15, g); p.set(6, 11, g); p.set(5, 10, g); p.set(8, 12, g); p.set(9, 11, g); const y = hex('#ffd52e'); p.rect(6, 4, 3, 3, y); p.set(7, 3, y); p.set(5, 5, y); p.set(9, 5, y); p.set(7, 7, y); p.set(7, 5, hex('#e8a020')); },
  fireweed(p) { p.clear(); const g = hex('#4f8f3a'); stem(p, 7, 3, 15, g); p.set(6, 12, g); p.set(8, 10, g); p.set(6, 9, g); for (let y = 1; y < 9; y++) { p.set(7 + (y % 2 ? 1 : -1), y, hex(y % 3 ? '#e0559a' : '#f07ab4')); if (y > 2) p.set(7, y, hex('#c8407f')); } },
  daisy(p) { p.clear(); const g = hex('#4f8f3a'); stem(p, 7, 7, 15, g); p.set(8, 11, g); p.set(9, 10, g); const w = hex('#f2efe4'); p.rect(5, 3, 5, 5, w); p.d[(3 * 16 + 5) * 4 + 3] = 0; p.d[(3 * 16 + 9) * 4 + 3] = 0; p.d[(7 * 16 + 5) * 4 + 3] = 0; p.d[(7 * 16 + 9) * 4 + 3] = 0; p.rect(6, 4, 3, 3, hex('#f2c230')); },
  lingon_bush(p) { p.clear(); const g = ['#2f6a35', '#3a7d3e', '#28582c'].map(hex); for (let y = 7; y < 16; y++) for (let x = 2; x < 14; x++) if (p.r() < 0.55 - (15 - y) * 0.03 + (Math.abs(x - 8) < 4 ? 0.2 : 0)) p.set(x, y, g[p.r() * 3 | 0]); for (let k = 0; k < 6; k++) { const x = 3 + (p.r() * 10 | 0), y = 8 + (p.r() * 6 | 0); p.set(x, y, hex('#d9222c')); p.set(x + 1, y, hex('#a8141e')); } },
  chanterelle(p) { p.clear(); const o = hex('#f0a830'); p.rect(4, 9, 8, 2, o); p.rect(5, 11, 6, 1, shade(o, 0.85)); p.rect(7, 12, 2, 4, shade(o, 0.95)); p.set(4, 8, shade(o, 1.1)); p.set(11, 8, shade(o, 1.1)); for (let x = 5; x < 11; x++) p.set(x, 8, shade(o, 1.15)); },
  cottongrass(p) { blades(p, ['#7aa05a', '#8db068'].map(hex), 4, 7, 12, 0.5); for (let k = 0; k < 4; k++) { const x = 2 + k * 4 + (p.r() * 2 | 0), y = 2 + (p.r() * 4 | 0); p.rect(x - 1, y, 3, 2, hex('#ffffff')); p.set(x, y - 1, hex('#f2f2f2')); stem(p, x, y + 2, 15, hex('#7aa05a')); } },
  cloudberry_plant(p) { p.clear(); const g = hex('#4e9a42'); for (let k = 0; k < 3; k++) { const x = 3 + k * 4, y = 10 + (k % 2); p.rect(x, y, 4, 3, shade(g, 0.9 + k * 0.08)); stem(p, x + 2, y + 3, 15, shade(g, 0.8)); } stem(p, 8, 6, 15, g); p.rect(7, 3, 3, 3, hex('#f3992b')); p.set(8, 3, hex('#ffc060')); p.set(7, 6, hex('#3f7a35')); p.set(9, 6, hex('#3f7a35')); },
  beachgrass(p) { blades(p, ['#a9b98c', '#97aa7a', '#bccb9e'].map(hex), 8, 8, 15, 2); },
  dead_bush(p) { p.clear(); const c = hex('#8a6a42'); p.line(8, 15, 8, 9, c); p.line(8, 11, 4, 6, c); p.line(8, 10, 12, 5, c); p.line(5, 7, 3, 7, c); p.line(11, 6, 13, 7, c); p.line(8, 9, 9, 4, shade(c, 0.85)); },
  spruce_sapling(p) { p.clear(); stem(p, 7, 10, 15, hex('#4e3a26')); const g = hex('#2e5a3b'); for (let y = 2; y < 12; y++) { const r = Math.floor((y - 2) / 2.5); for (let x = 7 - r; x <= 8 + r; x++) if (p.r() < 0.9) p.set(x, y, shade(g, 0.9 + p.r() * 0.3)); } },
  birch_sapling(p) { p.clear(); stem(p, 7, 7, 15, hex('#e7e3d8')); p.set(7, 10, hex('#4a423b')); const g = hex('#6aa84a'); for (let k = 0; k < 18; k++) p.set(4 + (p.r() * 8 | 0), 2 + (p.r() * 7 | 0), shade(g, 0.85 + p.r() * 0.3)); },
  pine_sapling(p) { p.clear(); stem(p, 7, 5, 15, hex('#7e4f33')); const g = hex('#3e6e3a'); for (let k = 0; k < 16; k++) p.set(4 + (p.r() * 8 | 0), 1 + (p.r() * 5 | 0), shade(g, 0.85 + p.r() * 0.3)); },
  door_lower(p) { planks90(p, hex('#8f6236')); frame(p, hex('#4d3219')); p.line(2, 13, 13, 2, hex('#6b4423')); p.set(12, 2, hex('#e0c060')); },
  door_upper(p) { planks90(p, hex('#8f6236')); frame(p, hex('#4d3219')); p.rect(3, 3, 4, 5, hex('#bfe3f5')); p.rect(9, 3, 4, 5, hex('#bfe3f5')); p.rect(3, 3, 1, 1, hex('#ffffff')); p.rect(9, 3, 1, 1, hex('#ffffff')); },
  bed_head(p) { p.noise(hex('#b83a32'), 0.06); for (let y = 0; y < 6; y++) for (let x = 1; x < 15; x++) p.set(x, y, shade(hex('#f0eee8'), 1 + (p.r() - 0.5) * 0.06)); for (let x = 0; x < 16; x++) { p.set(x, 6, hex('#8e2a24')); if (x % 4 === 1) p.set(x, 10, hex('#f4e6d0')); } },
  bed_foot(p) { p.noise(hex('#b83a32'), 0.06); for (let x = 0; x < 16; x++) { if (x % 4 === 1) { p.set(x, 4, hex('#f4e6d0')); p.set(x, 11, hex('#f4e6d0')); } if (x % 4 === 3) p.set(x, 7, hex('#f4e6d0')); p.set(x, 15, hex('#8e2a24')); } },
  bed_side(p) { planks(p, hex('#9c7444')); for (let x = 0; x < 16; x++) for (let y = 7; y < 10; y++) p.set(x, y, shade(hex('#b83a32'), y === 9 ? 0.75 : 1)); },
  bed_side_head(p) { planks(p, hex('#9c7444')); for (let x = 0; x < 16; x++) for (let y = 7; y < 10; y++) p.set(x, y, shade(x < 6 ? hex('#f0eee8') : hex('#b83a32'), y === 9 ? 0.75 : 1)); },
  water0(p) { waterFrame(p, 0); }, water1(p) { waterFrame(p, 1); }, water2(p) { waterFrame(p, 2); }, water3(p) { waterFrame(p, 3); },
  // ---- föremål ----
  i_stick(p) { p.clear(); for (let i = 0; i < 11; i++) { p.set(3 + i, 13 - i, hex('#8a5f33')); p.set(4 + i, 13 - i, hex('#5e3f20')); } },
  i_coal(p) { p.clear().mask(['................', '................', '.....kkkk.......', '....kKKKkk......', '...kKgKKKkk.....', '...kKKKKgKk.....', '..kKKgKKKKKk....', '..kKKKKKKgKk....', '..kkKKgKKKKk....', '...kKKKKKKk.....', '....kkKKkk......', '......kk........'], { k: hex('#1c1c1e'), K: hex('#2f2f33'), g: hex('#6a6a72') }); },
  i_iron(p) { ingot(p, hex('#e4e6e9'), hex('#a2a6ab')); },
  i_gold(p) { ingot(p, hex('#f6d040'), hex('#b8901e')); },
  i_diamond(p) {
    // briljantslipad sten sedd från sidan: krona, gördel och spetsig paviljong
    p.clear().mask(['................', '................', '................', '.....LLLLLL.....', '....LWWLLMMM....', '...LWLLLMMMMM...', '..DDDDDDDDDDDD..', '...MLLMMMMDDD...', '....MLMMMDDD....', '.....LMMMDD.....', '......MMDD......', '.......MD.......'],
      { L: hex('#c8f4ff'), W: hex('#ffffff'), M: hex('#7fd0ec'), D: hex('#3a8cb8') });
  },
  i_bone_meal(p) {
    p.clear(); const C = P(['#f6f2e6', '#e4ddc9', '#ffffff', '#d2cab4']);
    for (let k = 0; k < 70; k++) { const a = p.r() * Math.PI * 2, r = Math.sqrt(p.r()) * 5.5; const x = Math.round(8 + Math.cos(a) * r), y = Math.round(11.5 + Math.sin(a) * r * 0.42 - (5.5 - r) * 0.6); p.setIn(x, y, C[p.r() * 4 | 0]); }
  },
  i_lingon(p) { p.clear(); const r = hex('#d9222c'); [[5, 8], [8, 7], [10, 10], [6, 11], [9, 12], [12, 8]].forEach(([x, y]) => { p.rect(x, y, 2, 2, r); p.set(x, y, hex('#ff6a70')); p.set(x + 1, y + 1, hex('#8e0e16')); }); p.rect(6, 4, 3, 2, hex('#2f6a35')); p.set(9, 5, hex('#3a7d3e')); },
  i_cloudberry(p) { p.clear(); for (let y = 5; y < 13; y++) for (let x = 4; x < 12; x++) if (Math.hypot(x - 7.5, y - 8.8) < 4) p.set(x, y, ((x + y) % 2) ? hex('#f3992b') : hex('#ffbe55')); p.rect(6, 3, 4, 2, hex('#4e9a42')); p.set(5, 4, hex('#4e9a42')); p.set(10, 4, hex('#4e9a42')); },
  i_chanterelle(p) { draw.chanterelle(p); },
  i_meat(p) { meat(p, hex('#d8505a'), hex('#f0d0c8')); },
  i_meat_cooked(p) { meat(p, hex('#8a5230'), hex('#c89060')); },
  i_pork(p) { slab(p, hex('#e27c7c'), hex('#f6dcd0'), false); },
  i_pork_cooked(p) { slab(p, hex('#a8603a'), hex('#d8a070'), true); },
  i_chicken(p) { drumstick(p, hex('#f0b4a4'), hex('#d89080')); },
  i_chicken_cooked(p) { drumstick(p, hex('#c8803a'), hex('#8a5020')); p.set(5, 4, hex('#f0b868')); p.set(4, 5, hex('#f0b868')); },
  i_feather(p) {
    p.clear();
    const dx = 0.63, dy = -0.77, nx = 0.77, ny = 0.63;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, x = 3 + i * 0.66, y = 13.5 - i * 0.8, w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 2.6;
      for (let k = -w; k <= w; k += 0.5) p.setIn(Math.round(x + nx * k), Math.round(y + ny * k), t > 0.82 ? hex('#8a8c94') : (k > 0 ? hex('#f4f2ee') : hex('#d6d4ce')));
    }
    p.line(2, 15, 12, 3, hex('#b8ae98')); p.set(2, 15, hex('#8a8070'));
    void dx; void dy;
  },
  i_egg(p) {
    p.clear();
    for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) { const e = ((x - 7.5) / 4.2) ** 2 + ((y - 8.8) / (y < 8.8 ? 6 : 5)) ** 2; if (e < 1) p.set(x, y, e > 0.75 ? hex('#c4a478') : hex('#e6d0a8')); }
    for (let k = 0; k < 7; k++) p.set(5 + (p.r() * 6 | 0), 5 + (p.r() * 8 | 0), hex('#b08a5c'));
    p.set(6, 5, hex('#fff6e4')); p.set(6, 6, hex('#fff6e4')); p.set(7, 4, hex('#fff6e4'));
  },
  i_egg_fried(p) {
    p.clear();
    for (let y = 3; y < 14; y++) for (let x = 1; x < 15; x++) { const a = Math.atan2(y - 8.5, x - 8), r = 5.6 + Math.sin(a * 3) * 0.8 + Math.cos(a * 5) * 0.4; if (Math.hypot((x - 8) * 0.85, y - 8.5) < r) p.set(x, y, hex('#f6f4ee')); }
    for (let y = 6; y < 11; y++) for (let x = 6; x < 11; x++) if (Math.hypot(x - 8, y - 8) < 2.3) p.set(x, y, hex('#f0a820'));
    p.set(7, 7, hex('#ffd860')); p.set(3, 9, hex('#e0dcd0')); p.set(13, 8, hex('#e0dcd0'));
  },
  i_rotten(p) { meat(p, hex('#7d8c52'), hex('#a4a684')); for (let k = 0; k < 6; k++) p.set(5 + (p.r() * 6 | 0), 5 + (p.r() * 6 | 0), hex('#46542e')); p.set(9, 6, hex('#c8c070')); },
  i_bone(p) {
    p.clear(); const c = hex('#ece6d4'), d = hex('#bdb498');
    for (let i = 0; i < 9; i++) { p.set(4 + i, 12 - i, c); p.set(5 + i, 12 - i, d); }
    for (const [x, y] of [[2, 12], [3, 11], [3, 13], [4, 14], [12, 2], [13, 1], [14, 3], [13, 4]]) p.set(x, y, c);
    for (const [x, y] of [[4, 13], [5, 14], [14, 2], [14, 4]]) p.set(x, y, d);
  },
  i_arrow(p) {
    p.clear();
    for (let i = 0; i < 10; i++) { p.set(3 + i, 13 - i, hex('#8a5f33')); }
    for (const [x, y] of [[13, 2], [12, 2], [11, 2], [13, 3], [13, 4], [12, 3]]) p.set(x, y, hex('#9a9ca4'));
    p.set(14, 1, hex('#d0d2d8')); p.set(11, 3, hex('#5a5c64'));
    for (const [x, y] of [[1, 12], [2, 12], [2, 11], [3, 14], [4, 14], [4, 15], [1, 13], [2, 14]]) p.set(x, y, hex('#f0ece4'));
    p.set(3, 12, hex('#c83a32')); p.set(3, 13, hex('#c83a32'));
  },
  i_bow(p) {
    p.clear();
    for (let y = 1; y <= 14; y++) { const t = (y - 1) / 13, x = 4 + Math.round(6.5 * Math.sin(Math.PI * t)); p.set(x, y, hex('#8a5f33')); p.set(x + 1, y, hex('#5e3f20')); }
    for (let y = 2; y <= 13; y++) p.set(4, y, hex('#e8e6dc'));
    p.rect(10, 7, 2, 2, hex('#d0a868'));
  },
  i_chanterelle_fried(p) { p.clear(); p.rect(2, 10, 12, 3, hex('#5a5d63')); p.rect(3, 13, 10, 1, hex('#3e4044')); p.rect(13, 10, 3, 1, hex('#3e4044')); [[4, 8], [7, 7], [10, 8], [6, 9], [9, 9]].forEach(([x, y]) => { p.rect(x, y, 2, 2, hex('#d88a28')); p.set(x, y, hex('#f0b050')); }); },
  i_door(p) { p.clear(); p.rect(4, 1, 8, 14, hex('#8f6236')); p.rect(5, 2, 2, 4, hex('#bfe3f5')); p.rect(9, 2, 2, 4, hex('#bfe3f5')); p.set(10, 9, hex('#e0c060')); for (let y = 1; y < 15; y++) { p.set(4, y, hex('#4d3219')); p.set(11, y, hex('#4d3219')); } },
  i_bed(p) { p.clear(); p.rect(1, 8, 14, 3, hex('#b83a32')); p.rect(1, 7, 4, 2, hex('#f0eee8')); p.rect(1, 11, 14, 2, hex('#9c7444')); p.rect(1, 13, 1, 2, hex('#6b4b2c')); p.rect(14, 13, 1, 2, hex('#6b4b2c')); p.rect(0, 5, 1, 10, hex('#6b4b2c')); },
  // ---- utökning: block ----
  smooth_stone(p) { ramp(p, field(p, 0.2, 0.3, 0.5), P(['#8e9198', '#9a9da4', '#a5a8ae']), 0.05); for (let x = 0; x < S; x++) { p.set(x, 7, hex('#7c7f86')); p.set(x, 8, hex('#b4b7bd')); } bevel(p, 0.1); },
  smooth_stone_top(p) { ramp(p, field(p, 0.2, 0.3, 0.5), P(['#979aa1', '#a2a5ab', '#adb0b6']), 0.04); bevel(p, 0.12); },
  obsidian(p) { ramp(p, field(p), P(['#120c1c', '#1a1228', '#241838', '#2e2046']), 0.12); for (let k = 0; k < 5; k++) { const x = p.r() * 14 | 0, y = p.r() * 14 | 0; p.set(x, y, hex('#5a4282')); p.set(x + 1, y + 1, hex('#3e2c5e')); } },
  terracotta(p) { ramp(p, field(p, 0.4, 0.3, 0.3), P(['#a65a38', '#b2633f', '#bc6c46']), 0.06); for (let k = 0; k < 6; k++) p.set(p.r() * 16 | 0, p.r() * 16 | 0, hex('#8e4a2c')); bevel(p, 0.06); },
  packed_ice(p) { ramp(p, field(p), P(['#8cb8e8', '#9cc4ee', '#aed0f2', '#c2dcf6']), 0.05); p.line(2, 3, 9, 8, hex('#e4f0fc')); p.line(9, 8, 13, 6, hex('#e4f0fc')); p.line(5, 12, 12, 14, hex('#d4e6fa')); bevel(p, 0.08); },
  bookshelf(p) {
    planks(p, hex('#a77c4b'));
    const C = P(['#8e2a24', '#2d4f8e', '#3a7d3e', '#c99a2e', '#6a3a7a', '#e8e0cc', '#4a3020']);
    for (const y0 of [2, 9]) { p.rect(1, y0, 14, 5, hex('#3a2616')); let x = 1; while (x < 15) { const w = 1 + (p.r() < 0.3 ? 1 : 0), h = 4 + (p.r() < 0.5 ? 1 : 0), c = C[p.r() * C.length | 0]; for (let i = 0; i < w && x < 15; i++, x++) for (let y = y0 + 5 - h; y < y0 + 5; y++) p.set(x, y, shade(c, i ? 0.85 : 1)); if (p.r() < 0.2) x++; } }
  },
  barrel_side(p) { for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) p.set(x, y, shade(hex('#8a5f36'), (x % 4 === 0 ? 0.78 : 1) * (0.94 + p.r() * 0.1) * (1 - Math.abs(y - 7.5) / 40))); for (const y of [2, 13]) for (let x = 0; x < S; x++) { p.set(x, y, hex('#4a4c52')); p.set(x, y + 1, hex('#2e3034')); } },
  barrel_top(p) { planks(p, hex('#9a6a3e')); for (let a = 0; a < 6.3; a += 0.1) { p.set(Math.round(7.5 + Math.cos(a) * 7.4), Math.round(7.5 + Math.sin(a) * 7.4), hex('#3a3c42')); } p.rect(6, 6, 4, 4, hex('#6a4626')); },
  tnt_side(p) {
    // egen design: trälåda med röda sprängpatroner och en gul varningsskylt
    planks(p, hex('#8a6038')); frame(p, hex('#4e341c'));
    for (const x of [2, 6, 10]) { p.rect(x, 2, 4, 12, hex('#c23a2e')); p.rect(x, 2, 1, 12, hex('#e2604e')); p.rect(x + 3, 2, 1, 12, hex('#8a2218')); p.rect(x, 7, 4, 1, hex('#e8dcc0')); }
    for (const [x, y] of [[7, 9], [6, 10], [7, 10], [8, 10], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11]]) p.set(x + 1, y + 1, hex('#f2c230'));
    p.set(8, 11, hex('#222222')); p.set(8, 12, hex('#222222'));
  },
  tnt_top(p) { planks(p, hex('#8a6038')); frame(p, hex('#4e341c')); for (const [x, y] of [[4, 4], [10, 4], [4, 10], [10, 10], [7, 7]]) { p.rect(x - 1, y - 1, 3, 3, hex('#c23a2e')); p.set(x, y, hex('#3a2a20')); p.set(x + 1, y - 2, hex('#d8d0b8')); } },
  tnt_bottom(p) { planks(p, hex('#7a5430')); frame(p, hex('#4e341c')); },
  anvil(p) { ramp(p, field(p, 0.3, 0.3, 0.4), P(['#3a3c42', '#44474e', '#50535a']), 0.06); for (let x = 0; x < S; x++) p.set(x, 0, hex('#7a7e86')); p.line(2, 3, 13, 3, hex('#5e626a')); },
  farmland(p) { ramp(p, field(p), P(['#4a3220', '#563a24', '#62432a']), 0.1); for (const y of [3, 7, 11, 15]) for (let x = 0; x < S; x++) p.set(x, y, hex('#3a2616')); },
  wheat0(p) { crop(p, 3, 6, ['#5aa040', '#6ab44a'], null); }, wheat1(p) { crop(p, 5, 9, ['#5aa040', '#78b84c'], null); },
  wheat2(p) { crop(p, 6, 12, ['#8aa040', '#a8b450'], null); }, wheat3(p) { crop(p, 6, 14, ['#c8a440', '#d8b85a'], '#e8c870'); },
  carrot0(p) { crop(p, 4, 5, ['#4a9a3a', '#5aae44'], null); }, carrot1(p) { crop(p, 5, 8, ['#4a9a3a', '#5aae44'], null); },
  carrot2(p) { crop(p, 6, 10, ['#3e8e34', '#56a842'], null); for (const x of [3, 8, 12]) { p.rect(x, 13, 2, 3, hex('#f08a28')); p.set(x, 13, hex('#ffb050')); } },
  potato0(p) { crop(p, 5, 5, ['#4e8e3a', '#62a446'], null); }, potato1(p) { crop(p, 6, 8, ['#4e8e3a', '#62a446'], null); },
  potato2(p) { crop(p, 7, 9, ['#467e34', '#5a9a42'], null); for (const [x, y] of [[4, 6], [10, 5], [7, 8]]) { p.set(x, y, hex('#f4f0f8')); p.set(x + 1, y, hex('#e8d0f0')); } for (const x of [3, 10]) p.rect(x, 14, 3, 2, hex('#c09a5a')); },
  reed(p) { p.clear(); for (const [x, h, c] of [[3, 2, '#6a9a42'], [7, 0, '#7aaa4a'], [11, 3, '#5e8e3c'], [13, 6, '#6a9a42']]) { for (let y = h; y < 16; y++) p.set(x, y, shade(hex(c), y % 5 === 0 ? 0.8 : 1)); if (h < 4) { p.rect(x, h, 1, 4, hex('#6a4a2a')); p.set(x, h, hex('#8a6a3a')); } } p.line(7, 8, 10, 4, hex('#7aaa4a')); },
  pumpkin_side(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const rib = Math.abs(((x + 2) % 5) - 2); p.set(x, y, shade(hex('#e07a1e'), (1.08 - rib * 0.08) * (0.95 + p.r() * 0.08))); } bevel(p, 0.1); },
  pumpkin_top(p) { draw.pumpkin_side(p); for (let a = 0; a < 6.3; a += 0.4) p.set(Math.round(7.5 + Math.cos(a) * 6), Math.round(7.5 + Math.sin(a) * 6), hex('#c0601a')); p.rect(7, 6, 2, 3, hex('#5a6a2a')); p.set(9, 6, hex('#6a7a30')); },
  jack_face(p) {
    draw.pumpkin_side(p);
    const G = hex('#ffd34a'), D = hex('#c87a10');
    for (const cx of [4, 11]) { p.rect(cx - 1, 4, 3, 3, G); p.set(cx - 1, 4, D); p.set(cx + 1, 4, D); }
    for (let x = 3; x < 13; x++) { const y = 10 + ((x % 3) === 0 ? 0 : 1); p.set(x, y, G); p.set(x, y + 1, G); }
    p.set(3, 9, G); p.set(12, 9, G);
  },
  melon_side(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const st = (x + Math.round(Math.sin(y * 0.6) * 1.2)) % 4; p.set(x, y, shade(st < 1 ? hex('#2e6a22') : hex('#5aa036'), 0.94 + p.r() * 0.1)); } bevel(p, 0.08); },
  melon_top(p) { draw.melon_side(p); p.rect(7, 7, 2, 2, hex('#8a7a3a')); },
  candle(p) { p.clear(); p.rect(0, 8, 16, 8, hex('#efe6cc')); for (let y = 8; y < 16; y++) { p.set(6, y, hex('#d8cca8')); p.set(9, y, hex('#fff8e6')); } p.rect(7, 9, 2, 1, hex('#f8f0dc')); p.rect(0, 0, 16, 8, hex('#ffd34a')); p.rect(7, 4, 2, 4, hex('#fff6c0')); p.rect(7, 7, 2, 1, hex('#3a2a20')); },
  flowerpot(p) { p.clear(); p.rect(0, 10, 16, 6, hex('#b2633f')); for (let x = 0; x < S; x++) { p.set(x, 10, hex('#c87a52')); p.set(x, 15, hex('#8e4a2c')); } p.rect(0, 6, 16, 4, hex('#3f7a35')); p.rect(0, 0, 16, 6, hex('#5a7ad8')); p.rect(0, 2, 16, 2, hex('#7a9aea')); p.set(7, 3, hex('#f0e060')); p.set(8, 3, hex('#f0e060')); },
  flowerpot_top(p) { p.noise(hex('#4a3220'), 0.15); p.rect(6, 6, 4, 4, hex('#5a7ad8')); p.set(7, 7, hex('#f0e060')); },
  wool_orange(p) { wool(p, hex('#e8862a')); }, wool_purple(p) { wool(p, hex('#7a46a8')); }, wool_lightblue(p) { wool(p, hex('#7ab4e4')); }, wool_grey(p) { wool(p, hex('#7c7e84')); }, wool_brown(p) { wool(p, hex('#7a5232')); },
  ladder(p) { p.clear(); for (let y = 0; y < S; y++) { p.set(2, y, hex('#8a5f33')); p.set(3, y, hex('#6e4a26')); p.set(12, y, hex('#8a5f33')); p.set(13, y, hex('#6e4a26')); } for (const y of [2, 6, 10, 14]) for (let x = 4; x < 12; x++) { p.set(x, y, hex('#a87a46')); p.set(x, y + 1, hex('#6e4a26')); } },
  painting(p) {
    // eget motiv: fjällsjö i midnattssol med norrsken
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mix(hex('#2a3a6a'), hex('#f0a060'), y / 9));
    for (let x = 1; x < 15; x++) { const y = 4 + Math.round(Math.sin(x * 0.7) * 1.2); p.set(x, y, hex('#7af0b0')); p.set(x, y + 1, hex('#4ac08a')); }
    for (let x = 0; x < S; x++) { const h = 9 - Math.round(Math.max(0, 4 - Math.abs(x - 5) * 1.1, 3 - Math.abs(x - 11) * 0.9)); for (let y = h; y < 11; y++) p.set(x, y, y === h ? hex('#e8eef8') : hex('#3a4a6a')); }
    for (let y = 11; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, (x + y) % 5 ? hex('#2a5a8a') : hex('#f0b070'));
    p.rect(9, 6, 2, 2, hex('#ffd890'));
    frame(p, hex('#6a4626')); for (let i = 1; i < 15; i++) { p.set(i, 1, hex('#c89a4a')); p.set(1, i, hex('#c89a4a')); }
  },
  lever(p) { p.clear(); p.rect(0, 0, 16, 14, hex('#8a5f33')); for (let y = 0; y < 14; y++) p.set(7, y, hex('#a87a46')); p.rect(0, 0, 16, 3, hex('#b83a32')); p.rect(0, 14, 16, 2, hex('#7a7c82')); },
  lava(p) { const f = field(p, 0.5, 0.35, 0.15); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const t = f[y * S + x]; p.set(x, y, t > 0.78 ? hex('#ffe070') : t > 0.55 ? hex('#ffa030') : t > 0.3 ? hex('#e8601c') : hex('#a83210')); } },
  emerald_ore(p) { draw.stone(p); for (const [cx, cy] of [[4, 5], [11, 4], [8, 11]]) { p.rect(cx - 1, cy - 2, 2, 5, hex('#2ec46a')); p.rect(cx - 2, cy - 1, 4, 3, hex('#2ec46a')); p.set(cx - 1, cy - 1, hex('#a8f8c8')); p.set(cx, cy + 2, hex('#167a3e')); p.set(cx + 1, cy + 1, hex('#167a3e')); } },
  emerald_block(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, shade(((x >> 2) + (y >> 2)) % 2 ? hex('#3ad47a') : hex('#2ab866'), 0.95 + p.r() * 0.08)); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#a8f8c8')); p.set(0, i, hex('#a8f8c8')); p.set(i, 15, hex('#14703a')); p.set(15, i, hex('#14703a')); } },
  // ---- utökning: föremål ----

  /* ----- utökning 2 ----- */
  oak_log(p) {
    // grov, mörk ekbark med djupa längsgående fåror
    ramp(p, field(p, 0.25, 0.3, 0.45), P(['#3e2f22', '#4b3a2a', '#5a4632', '#66513a']), 0.12);
    for (let k = 0; k < 5; k++) { let x = k * 3 + (p.r() * 2 | 0); for (let y = 0; y < S; y++) { p.set(x, y, hex('#2a2018')); if (p.r() < 0.3) x += p.r() < 0.5 ? 1 : -1; } }
    for (let k = 0; k < 4; k++) { const x = p.r() * 15 | 0, y = p.r() * 15 | 0; p.set(x, y, hex('#7a6448')); }
    roundCols(p, 0.16);
  },
  oak_log_top(p) { logTop(p, P(['#b8925e', '#c6a06a']), hex('#9c774a'), hex('#3e2f22')); },
  oak_leaves(p) { leafClumps(p, P(['#2f5e26', '#3c712e', '#4b8436', '#5c9640', '#6ea84c']), 12, 2.2, 3.4, hex('#28501f')); },
  oak_planks(p) { planks(p, hex('#b98d55'), hex('#8e6a3c')); },
  oak_sapling(p) { p.clear(); stem(p, 7, 8, 15, hex('#5a4632')); const g = P(['#3c712e', '#4b8436', '#5c9640']); for (const [cx, cy] of [[6, 4], [9, 5], [7, 7]]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4 && p.r() < 0.85) p.setIn(cx + dx, cy + dy, g[p.r() * 3 | 0]); },
  stem0(p) { p.clear(); stem(p, 7, 12, 15, hex('#6aa84a')); p.set(6, 12, hex('#7ab85a')); p.set(8, 13, hex('#7ab85a')); },
  stem1(p) { p.clear(); stem(p, 7, 9, 15, hex('#78a848')); p.line(7, 11, 5, 9, hex('#8ab858')); p.line(8, 12, 10, 10, hex('#8ab858')); },
  stem2(p) { p.clear(); stem(p, 7, 5, 15, hex('#8aa848')); p.line(7, 9, 4, 6, hex('#9ab858')); p.line(8, 11, 11, 8, hex('#9ab858')); p.rect(3, 5, 2, 2, hex('#6a9a3a')); p.rect(11, 7, 2, 2, hex('#6a9a3a')); },
  stem3(p) { p.clear(); stem(p, 7, 2, 15, hex('#b0a040')); p.line(7, 7, 3, 3, hex('#c0b050')); p.line(8, 10, 12, 6, hex('#c0b050')); p.rect(2, 2, 3, 2, hex('#7a9a3a')); p.rect(12, 5, 3, 2, hex('#7a9a3a')); p.set(7, 1, hex('#d8c860')); },
  trapdoor(p) {
    planks(p, hex('#9a7044')); frame(p, hex('#4d3219'));
    for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) { p.rect(x - 1, y - 1, 3, 3, hex('#3a2616')); p.set(x, y, hex('#00000000'.slice(0, 7)), 0); }
    p.rect(1, 7, 14, 2, hex('#6a4a2a')); p.set(2, 7, hex('#a8acb4')); p.set(13, 7, hex('#a8acb4'));
  },
  button(p) { draw.smooth_stone_top(p); frame(p, hex('#6c6f78')); },
  spark_ore(p) { draw.stone(p); for (const [cx, cy] of [[4, 4], [11, 6], [6, 11], [12, 12]]) { p.rect(cx - 1, cy - 1, 3, 2, hex('#e0422e')); p.set(cx, cy - 1, hex('#ffb070')); p.set(cx + 1, cy + 1, hex('#8a1a12')); p.set(cx - 1, cy + 1, hex('#ff6a3a')); } },
  wire_0(p) { wireTile(p, '#5a1a14', '#7a2a1e'); },
  wire_1(p) { wireTile(p, '#9a2a1c', '#c0402a'); },
  wire_2(p) { wireTile(p, '#d8402a', '#ff7a4a'); },
  wire_3(p) { wireTile(p, '#ff5a32', '#ffd08a'); },
  spark_torch(p) { p.clear(); for (let y = 9; y < 16; y++) { p.set(7, y, hex('#7a5230')); p.set(8, y, hex('#5c3d22')); } p.rect(7, 6, 2, 3, hex('#ff4a2a')); p.set(7, 6, hex('#ffd0a0')); p.set(8, 8, hex('#a8201a')); },
  spark_torch_off(p) { p.clear(); for (let y = 9; y < 16; y++) { p.set(7, y, hex('#7a5230')); p.set(8, y, hex('#5c3d22')); } p.rect(7, 6, 2, 3, hex('#5a2a22')); p.set(7, 6, hex('#7a3a30')); },
  spark_torch_top(p) { p.clear(); p.rect(7, 7, 2, 2, hex('#ff4a2a')); p.set(7, 7, hex('#ffd0a0')); },
  spark_torch_top_off(p) { p.clear(); p.rect(7, 7, 2, 2, hex('#5a2a22')); },
  repeater_top(p) { repTile(p, false); },
  repeater_top_on(p) { repTile(p, true); },
  repeater_side(p) { draw.smooth_stone_top(p); for (let x = 0; x < S; x++) p.set(x, 13, hex('#6c6f78')); },
  lamp(p) { lampTile(p, ['#4a3a2a', '#6a5038', '#8a6a48'], '#2a2018'); },
  lamp_on(p) { lampTile(p, ['#ffc860', '#ffe0a0', '#fff4d8'], '#a86a28'); },
  piston_side(p) { draw.cobble(p); p.rect(0, 0, 16, 4, hex('#a07a4a')); for (let x = 0; x < S; x++) { p.set(x, 4, hex('#4a4c52')); p.set(x, 0, hex('#c09a62')); } },
  piston_front(p) { planks(p, hex('#a98050')); frame(p, hex('#5a4228')); p.rect(6, 6, 4, 4, hex('#8e9198')); p.set(6, 6, hex('#c8ccd2')); },
  piston_sticky_front(p) { draw.piston_front(p); for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) if ((x - 8) ** 2 + (y - 8) ** 2 < 30 + p.r() * 8) p.set(x, y, shade(hex('#6ac04a'), 0.85 + p.r() * 0.3)); p.set(6, 6, hex('#c8f8a8')); },
  piston_back(p) { draw.cobble(p); p.rect(5, 5, 6, 6, hex('#5a5c62')); p.rect(6, 6, 4, 4, hex('#3a3c42')); },
  dispenser_front(p) { draw.furnace_side(p); p.rect(4, 4, 8, 8, hex('#2a2a30')); p.rect(6, 3, 4, 10, hex('#2a2a30')); p.rect(3, 6, 10, 4, hex('#2a2a30')); p.rect(6, 6, 4, 4, hex('#111114')); },
  observer_front(p) { draw.cobble(p); p.rect(2, 4, 12, 8, hex('#3a3c42')); for (const x of [4, 9]) { p.rect(x, 6, 3, 3, hex('#101014')); p.set(x + 1, 7, hex('#e0422e')); } },
  observer_back(p) { draw.cobble(p); p.rect(5, 5, 6, 6, hex('#3a3c42')); p.rect(7, 7, 2, 2, hex('#e0422e')); },
  observer_side(p) { draw.cobble(p); for (let x = 0; x < S; x++) { p.set(x, 7, hex('#3a3c42')); p.set(x, 8, hex('#5a5c62')); } },
  observer_top(p) { draw.cobble(p); p.rect(3, 3, 10, 10, hex('#5a5c62')); for (let i = 3; i < 13; i++) p.set(i, i, hex('#3a3c42')); },
  daylight_top(p) { p.noise(hex('#2c3a52'), 0.08); for (let y = 1; y < 15; y += 5) for (let x = 1; x < 15; x += 5) { p.rect(x, y, 4, 4, hex('#9ac8ec')); p.set(x, y, hex('#e8f6ff')); } frame(p, hex('#8a6a42')); },
  note_block(p) { planks(p, hex('#7a5030')); frame(p, hex('#3a2616')); const N = hex('#1a1210'); p.rect(5, 4, 1, 7, N); p.rect(10, 3, 1, 7, N); p.rect(5, 4, 6, 1, N); p.rect(5, 3, 6, 1, N); p.rect(3, 10, 3, 2, N); p.rect(8, 9, 3, 2, N); },
  i_shield(p) {
    p.clear();
    for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) {
      const w = y < 10 ? 6 : 6 - (y - 9) * 1.1; if (Math.abs(x - 7.5) > w) continue;
      const edge = Math.abs(x - 7.5) > w - 1.2 || y === 1;
      p.set(x, y, edge ? hex('#8e9198') : shade(hex(y < 8 ? '#2d4f8e' : '#2a4880'), 0.95 + p.r() * 0.1));
    }
    for (let y = 3; y < 13; y++) p.setIn(7, y, hex('#f2c230')), p.setIn(8, y, hex('#f2c230'));
    for (let x = 4; x < 12; x++) p.setIn(x, 6, hex('#f2c230'));
  },
  i_pumpkin_seeds(p) { p.clear(); for (const [x, y] of [[4, 5], [9, 4], [6, 9], [11, 9], [8, 12], [4, 12]]) { p.rect(x, y, 2, 3, hex('#f0e2a8')); p.set(x, y, hex('#fff6d0')); p.set(x + 1, y + 2, hex('#c8b070')); } },
  i_melon_seeds(p) { p.clear(); for (const [x, y] of [[4, 5], [9, 4], [6, 9], [11, 9], [8, 12], [4, 12]]) { p.rect(x, y, 2, 3, hex('#2a2018')); p.set(x, y, hex('#5a4a38')); } },
  /* ----- utökning 3: strukturer och Muspelheim ----- */
  cobweb(p) {
    p.clear(); const W = hex('#e8e8ee');
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; for (let r = 1; r < 9; r++) p.setIn(Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), W, 200); }
    for (const R of [2.5, 4.6, 6.8]) for (let a = 0; a < 6.28; a += 0.12) p.setIn(Math.round(8 + Math.cos(a) * R), Math.round(8 + Math.sin(a) * R), shade(W, 0.85), 170);
  },
  rail(p) {
    p.clear();
    for (const y of [1, 5, 9, 13]) { p.rect(1, y, 14, 2, hex('#7a5530')); p.rect(1, y + 1, 14, 1, hex('#5e3f20')); }
    for (let y = 0; y < S; y++) { p.set(3, y, hex('#b4b7bd')); p.set(4, y, hex('#7c7f86')); p.set(11, y, hex('#b4b7bd')); p.set(12, y, hex('#7c7f86')); }
  },
  portal(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = Math.sin(x * 0.8 + y * 0.4) + Math.sin(y * 0.9 - x * 0.3); p.set(x, y, mix(hex('#6a0a04'), hex('#ffa030'), v * 0.25 + 0.5), 210); } },
  smithing_top(p) { ramp(p, field(p), P(['#2c2e34', '#363940', '#40434b']), 0.06); p.rect(2, 2, 12, 12, hex('#4a4d55')); p.rect(3, 3, 10, 10, hex('#2a2c31')); p.line(4, 11, 10, 5, hex('#9a9da4')); p.rect(9, 4, 3, 2, hex('#7c7f86')); frame(p, hex('#1e2024')); },
  smithing_side(p) { planks(p, hex('#6e4a2c')); p.rect(0, 0, 16, 4, hex('#3a3d44')); p.rect(0, 1, 16, 1, hex('#5a5d65')); p.rect(0, 12, 16, 2, hex('#3a3d44')); },
  smithing_front(p) { draw.smithing_side(p); p.rect(4, 6, 8, 5, hex('#2a2c31')); p.rect(5, 7, 6, 3, hex('#ff8a3a')); p.rect(6, 8, 4, 1, hex('#ffd070')); },
  askesten(p) {
    ramp(p, field(p, 0.45, 0.35, 0.2), P(['#3e3230', '#4a3b37', '#57463f', '#64524a', '#725e54']), 0.14);
    for (let k = 0; k < 4; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; p.set(x, y, hex('#2a201e')); p.set(x + 1, y, hex('#8a7468')); }
    if (p.r() < 2) { const x = p.r() * 14 | 0, y = p.r() * 14 | 0; p.set(x, y, hex('#ff7a30')); p.set(x + 1, y + 1, hex('#c84a1a')); }
    bevel(p, 0.05);
  },
  basalt_side(p) {
    ramp(p, field(p, 0.2, 0.3, 0.5), P(['#1a191e', '#222127', '#2a2930', '#33323a']), 0.1);
    for (const x of [0, 5, 10]) for (let y = 0; y < S; y++) { p.set(x, y, hex('#0f0e12')); p.set(x + 1, y, hex('#3e3d46')); }
    for (let k = 0; k < 3; k++) p.set(p.r() * S | 0, p.r() * S | 0, hex('#5a2a1a'));
  },
  basalt_top(p) { stones(p, [P(['#1c1b20', '#25242a', '#2e2d34', '#38373f'])], hex('#0e0d10'), 6, 0.9); },
  basalt_bricks(p) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = y >> 2, off = row % 2 ? 4 : 0, mortar = (y & 3) === 3 || ((x + off) & 7) === 7;
      p.set(x, y, mortar ? shade(hex('#4a140c'), 0.9 + p.r() * 0.3) : shade(hex(row % 2 ? '#2a2628' : '#24212a'), 0.9 + p.r() * 0.18 + ((y & 3) === 0 ? 0.12 : 0)));
    }
    for (let k = 0; k < 3; k++) p.set(p.r() * S | 0, (p.r() * 4 | 0) * 4 + 3, hex('#ff6a2a'));
  },
  glodsten(p) {
    ramp(p, field(p, 0.5, 0.3, 0.2), P(['#a2481a', '#c8621e', '#e08a2a', '#f4b244', '#ffd870']), 0.16);
    for (let k = 0; k < 7; k++) { const x = p.r() * S | 0, y = p.r() * S | 0; p.set(x, y, hex('#fff4c0')); p.set(x + 1, y, hex('#ffe08a')); p.set(x, y + 1, hex('#8a3a12')); }
  },
  svavelsand(p) {
    ramp(p, field(p, 0.4, 0.3, 0.3), P(['#8e7a2e', '#a08a38', '#b49c44', '#c4ac52', '#d4bc62']), 0.12);
    for (let k = 0; k < 6; k++) p.set(p.r() * S | 0, p.r() * S | 0, hex(p.r() < 0.5 ? '#e8d878' : '#6a5a22'));
    bevel(p, 0.04);
  },
  urmalm(p) {
    draw.basalt_side(p);
    for (let k = 0; k < 4; k++) {
      const cx = 3 + (p.r() * 10 | 0), cy = 3 + (p.r() * 10 | 0);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const d = Math.hypot(dx, dy); if (d < 2.4) p.setIn(cx + dx, cy + dy, d < 1 ? hex('#e6c070') : d < 1.8 ? hex('#8a5a3a') : hex('#5a3a2e')); }
    }
    p.set(7, 7, hex('#fff0b0'));
  },
  eldsvamp(p) {
    p.clear();
    for (let y = 9; y < 16; y++) { p.set(7, y, hex('#d8c8b0')); p.set(8, y, hex('#b8a890')); }
    for (let y = 3; y < 10; y++) { const w = y < 5 ? 3 : y < 8 ? 6 : 5; for (let x = 8 - w; x < 8 + w; x++) p.setIn(x, y, y === 9 ? hex('#7a1a0e') : shade(hex('#e0401a'), 0.9 + p.r() * 0.2)); }
    for (const [x, y] of [[5, 5], [9, 4], [11, 7], [6, 8], [8, 6]]) p.setIn(x, y, hex('#ffd060'));
  },
  glodrot(p) {
    p.clear();
    for (let k = 0; k < 4; k++) { let x = 3 + k * 3, y = 15; for (let i = 0; i < 12; i++) { p.setIn(x, y, i > 8 ? hex('#ffd070') : shade(hex('#e8641e'), 0.8 + p.r() * 0.3)); y--; if (p.r() < 0.4) x += p.r() < 0.5 ? 1 : -1; } }
  },
  spout_top(p) { draw.basalt_top(p); p.rect(3, 3, 10, 10, hex('#141216')); for (let i = 4; i < 12; i += 2) { p.line(i, 4, i, 11, hex('#4a4650')); } p.rect(6, 6, 4, 4, hex('#ff6a1a')); p.rect(7, 7, 2, 2, hex('#ffd070')); },
  spout_side(p) { draw.basalt_bricks(p); p.rect(5, 5, 6, 5, hex('#141216')); p.rect(6, 6, 4, 3, hex('#c8401a')); },
  hay_top(p) { ramp(p, field(p, 0.3, 0.3, 0.4), P(['#a8862a', '#c09a32', '#d4b040', '#e6c454']), 0.12); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - 7.5, y - 7.5) % 3 < 0.8) p.set(x, y, hex('#9a7a24')); },
  hay_side(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, shade(hex(x % 3 ? '#d0aa3c' : '#b8922e'), 0.9 + p.r() * 0.2)); for (const y of [3, 12]) { p.rect(0, y, 16, 1, hex('#8a2a1e')); p.rect(0, y + 1, 16, 1, hex('#6a1e16')); } },
  i_glodkarna(p) {
    p.clear();
    for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) { const d = Math.hypot(x - 8, y - 8.5); if (d < 5.6) p.set(x, y, d > 4.6 ? hex('#7a2a10') : d < 2 ? hex('#fff0b0') : shade(hex('#ff8a2a'), 0.85 + (5 - d) * 0.06)); }
    p.line(5, 9, 11, 7, hex('#3a1208')); p.line(8, 4, 7, 13, hex('#3a1208')); p.set(6, 6, hex('#ffffff'));
  },
  i_glodfragment(p) { p.clear().mask(['................', '................', '.........o......', '........oOo.....', '.......oOYOo....', '......oOYYOo....', '.....oOOYOOo....', '....oOOOOOo.....', '....oOOOOo......', '.....oOOo.......', '......oo........'], { o: hex('#7a2a10'), O: hex('#ff7a2a'), Y: hex('#ffd070') }); },
  i_urskarva(p) { p.clear(); for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) { const e = Math.abs(x - 8) + Math.abs(y - 8.5) * 1.2; if (e < 5.5) p.set(x, y, e > 4.4 ? hex('#1e1416') : shade(hex('#4a3438'), 0.85 + p.r() * 0.3)); } p.line(5, 7, 10, 10, hex('#d8a860')); p.line(7, 5, 9, 11, hex('#a87a44')); p.set(8, 8, hex('#ffe0a0')); },
  i_surtstal(p) { ingot(p, hex('#3a2624'), hex('#1e1212')); p.line(4, 8, 11, 8, hex('#ff7a2a')); p.line(5, 10, 10, 10, hex('#c84a1a')); p.set(6, 7, hex('#ffd070')); },
  i_map_village(p) { mapIcon(p, '#7aa25a'); p.rect(6, 6, 4, 3, hex('#b2633f')); p.rect(5, 5, 6, 1, hex('#5a5d65')); p.line(3, 11, 12, 11, hex('#9a8a6a')); },
  i_map_explore(p) { mapIcon(p, '#c8b484'); p.line(5, 5, 9, 9, hex('#c8302a')); p.line(9, 5, 5, 9, hex('#c8302a')); for (let x = 3; x < 13; x += 2) p.set(x, 12, hex('#6a5a3a')); },
  i_map_fort(p) { mapIcon(p, '#7a2a1e'); p.rect(6, 5, 4, 6, hex('#24212a')); p.rect(5, 4, 1, 2, hex('#24212a')); p.rect(10, 4, 1, 2, hex('#24212a')); p.rect(7, 8, 2, 3, hex('#ff8a3a')); },
  i_glodapple(p) { draw.i_apple(p); for (let y = 4; y < 15; y++) for (let x = 2; x < 14; x++) if (p.alpha(x, y) > 10 && !(x >= 7 && x <= 10 && y <= 4)) { const c = p.get(x, y); if (c[0] > 120) p.set(x, y, mix(c, hex('#ffb030'), 0.55)); } p.set(5, 7, hex('#fff4c0')); p.set(9, 10, hex('#ffe070')); },
  i_pick_5(p) { tool('i_pick_5')(p); glowTool(p); }, i_axe_5(p) { tool('i_axe_5')(p); glowTool(p); }, i_shovel_5(p) { tool('i_shovel_5')(p); glowTool(p); }, i_sword_5(p) { tool('i_sword_5')(p); glowTool(p); },
  i_spark_dust(p) { p.clear(); for (let k = 0; k < 40; k++) { const a = p.r() * 6.28, r = Math.sqrt(p.r()) * 5.5; p.setIn(Math.round(8 + Math.cos(a) * r), Math.round(9 + Math.sin(a) * r * 0.7), shade(hex(p.r() < 0.3 ? '#ff9a5a' : '#e0422e'), 0.8 + p.r() * 0.4)); } p.set(7, 8, hex('#ffe0b0')); },
  i_hoe(p) { p.clear(); for (let i = 0; i < 11; i++) { p.set(3 + i, 14 - i, hex('#8a5f33')); p.set(4 + i, 14 - i, hex('#5e3f20')); } p.rect(9, 2, 5, 2, hex('#8e9198')); p.rect(9, 4, 2, 1, hex('#6c6f78')); p.set(9, 2, hex('#b4b7bd')); },
  i_seeds(p) { p.clear(); for (const [x, y] of [[5, 9], [8, 7], [10, 10], [6, 12], [9, 13], [12, 8], [4, 6]]) { p.set(x, y, hex('#c8a85a')); p.set(x + 1, y, hex('#a88a40')); p.set(x, y - 1, hex('#7aaa4a')); } },
  i_wheat(p) { p.clear(); for (let k = 0; k < 4; k++) { const x0 = 4 + k * 2; p.line(x0, 15, x0 + 2, 6, hex('#b8943a')); for (let y = 1; y < 7; y++) { p.set(x0 + 2 + (y % 2), y, hex('#e8c870')); } } p.rect(5, 11, 7, 1, hex('#8a6a2a')); },
  i_bread(p) { p.clear(); for (let y = 6; y < 13; y++) for (let x = 2; x < 14; x++) { const e = ((x - 7.5) / 6) ** 2 + ((y - 9.5) / 3.6) ** 2; if (e < 1) p.set(x, y, y < 8 ? hex('#d89a4a') : hex('#b8742e')); } for (const x of [5, 8, 11]) { p.set(x, 7, hex('#f0d090')); p.set(x + 1, 8, hex('#f0d090')); } },
  i_carrot(p) { p.clear(); for (let i = 0; i < 9; i++) { const w = Math.max(0, 2 - i * 0.22); for (let k = -w; k <= w; k += 0.5) p.setIn(Math.round(5 + i * 0.9 + k * 0.7), Math.round(5 + i * 0.95 - k * 0.7), i % 3 ? hex('#f08a28') : hex('#d06a18')); } for (const [x, y] of [[3, 2], [4, 3], [5, 2], [2, 4], [4, 1], [6, 3]]) p.set(x, y, hex('#4a9a3a')); },
  i_potato(p) { p.clear(); for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) { const e = ((x - 8) / 5) ** 2 + ((y - 8.5) / 4) ** 2; if (e < 1) p.set(x, y, shade(hex('#c09a5a'), 0.9 + p.r() * 0.15)); } for (const [x, y] of [[6, 7], [10, 9], [8, 11]]) p.set(x, y, hex('#8a6a3a')); },
  i_potato_baked(p) { draw.i_potato(p); for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) if (p.alpha(x, y) > 10) p.set(x, y, shade(hex('#a86a2a'), 0.9 + p.r() * 0.15)); p.line(5, 8, 11, 8, hex('#f8e8a0')); p.rect(7, 7, 2, 1, hex('#ffe070')); },
  i_apple(p) { p.clear(); for (let y = 4; y < 15; y++) for (let x = 2; x < 14; x++) { const e = Math.hypot((x - 7.5) * 1.05, (y - 9.3)); if (e < 5) p.set(x, y, e > 4.2 ? hex('#8e1a1a') : hex('#d02a2a')); } p.set(5, 7, hex('#ff8a7a')); p.set(6, 6, hex('#ff8a7a')); p.rect(7, 2, 1, 3, hex('#5a3a1e')); p.rect(8, 2, 3, 2, hex('#4a9a3a')); },
  i_paper(p) { p.clear(); p.rect(3, 2, 10, 12, hex('#f4f0e4')); for (let y = 2; y < 14; y++) p.set(12, y, hex('#d8d2c0')); for (const y of [5, 7, 9, 11]) p.line(5, y, 10, y, hex('#c8c0a8')); },
  i_melon(p) { p.clear(); for (let y = 3; y < 14; y++) for (let x = 2; x < 15; x++) { const d = Math.hypot(x - 8, y - 14); if (d < 10.5 && y < 13) p.set(x, y, d > 9.4 ? hex('#3e8a2a') : d > 8.6 ? hex('#e8f0c0') : hex('#e83a3a')); } for (const [x, y] of [[6, 8], [9, 7], [11, 10], [7, 11], [4, 11]]) p.set(x, y, hex('#1a1a1a')); },
  i_pie(p) { p.clear(); p.rect(1, 9, 14, 4, hex('#c89a5a')); p.rect(2, 13, 12, 1, hex('#8a6a3a')); p.rect(2, 7, 12, 3, hex('#e07a1e')); for (let x = 2; x < 14; x += 3) p.set(x, 7, hex('#f0c080')); p.line(1, 9, 14, 9, hex('#e0b070')); },
  i_bucket(p) { bucket(p, null); }, i_bucket_water(p) { bucket(p, '#3a7ad0'); }, i_bucket_lava(p) { bucket(p, '#ff8a20'); }, i_bucket_milk(p) { bucket(p, '#f6f4ee'); },
  i_emerald(p) { p.clear().mask(['................', '................', '......cccc......', '.....cCwCCc.....', '....cCwCCCCc....', '....cCCCCCCc....', '....cCCCCCCc....', '....cCCCCCCc....', '....vCCCCCCv....', '.....vCCCCv.....', '......vvvv......'], { c: hex('#1e8a4a'), C: hex('#3ad47a'), w: hex('#c8ffd8'), v: hex('#106a34') }); },
  i_shears(p) { p.clear(); p.line(3, 3, 9, 9, hex('#c8ccd2')); p.line(4, 3, 10, 9, hex('#8e9198')); p.line(12, 3, 6, 9, hex('#c8ccd2')); p.line(13, 3, 7, 9, hex('#8e9198')); for (const [x, y] of [[4, 11], [11, 11]]) { p.rect(x, y, 3, 3, hex('#b83a32')); p.set(x + 1, y + 1, hex('#00000000'.slice(0, 7)), 0); } },
  i_compass(p) { p.clear(); for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) { const d = Math.hypot(x - 8, y - 8.5); if (d < 6) p.set(x, y, d > 5 ? hex('#6c6f78') : hex('#f0ece0')); } p.line(8, 4, 8, 8, hex('#d02a2a')); p.line(8, 9, 8, 12, hex('#3a3c42')); p.set(8, 8, hex('#222')); },
  i_clock(p) { p.clear(); for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) { const d = Math.hypot(x - 8, y - 8.5); if (d < 6) p.set(x, y, d > 5 ? hex('#d8a830') : hex('#f4ecd0')); } p.line(8, 8, 8, 4, hex('#3a2a20')); p.line(8, 8, 11, 9, hex('#3a2a20')); p.set(8, 3, hex('#d8a830')); },
  i_rod(p) { p.clear(); for (let i = 0; i < 12; i++) { p.set(2 + i, 14 - i, i < 4 ? hex('#5e3f20') : hex('#8a5f33')); } p.line(13, 3, 13, 12, hex('#e8e8e0')); p.set(12, 13, hex('#9a9ca4')); p.set(13, 13, hex('#9a9ca4')); p.set(12, 12, hex('#9a9ca4')); },
  i_fish(p) { fish(p, hex('#8aa25a'), hex('#3e5a2a'), hex('#e86a2a')); },
  i_fish_cooked(p) { fish(p, hex('#b8783a'), hex('#7a4a1e'), hex('#c8682a')); },
  i_string(p) {
    p.clear();
    for (let k = 0; k < 3; k++) { const cx = 7 + k * 1.2, cy = 6 + k * 2; for (let a = 0; a < 6.3; a += 0.15) p.setIn(Math.round(cx + Math.cos(a) * 4.6), Math.round(cy + Math.sin(a) * 2), Math.sin(a) > 0 ? hex('#ecebe6') : hex('#b8b4aa')); }
    p.line(12, 11, 14, 14, hex('#ecebe6'));
  },
  i_leather(p) {
    p.clear();
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
      const notch = (x < 4 && (y < 4 || y > 11)) || (x > 11 && (y < 4 || y > 11)) || (y < 3 && x > 6 && x < 9) || (y > 12 && x > 6 && x < 10);
      if (notch) continue;
      const edge = x === 2 || x === 13 || y === 2 || y === 13;
      p.set(x, y, edge ? hex('#7a4622') : shade(hex('#a8683a'), 0.92 + p.r() * 0.16));
    }
    for (let i = 4; i < 12; i += 2) { p.set(i, 4, hex('#e0c090')); p.set(i, 11, hex('#e0c090')); p.set(4, i, hex('#e0c090')); p.set(11, i, hex('#e0c090')); }
  }
};

function wireTile(p, c, hi) {
  // ledningskors som går mot alla fyra kanter, prickigt glittrande
  p.clear(); const C = hex(c), H = hex(hi);
  for (let i = 0; i < S; i++) for (const o of [7, 8]) { p.set(i, o, shade(C, 0.9 + p.r() * 0.2)); p.set(o, i, shade(C, 0.9 + p.r() * 0.2)); }
  p.rect(5, 5, 6, 6, C); for (let k = 0; k < 10; k++) p.set(5 + (p.r() * 6 | 0), 5 + (p.r() * 6 | 0), H);
  for (let k = 0; k < 6; k++) { const i = p.r() * S | 0; p.set(i, 7 + (k & 1), H); p.set(7 + (k & 1), i, H); }
}
function repTile(p, on) {
  draw.smooth_stone_top(p);
  const L = hex(on ? '#ff5a32' : '#6a2a20');
  for (let y = 2; y < 14; y++) p.set(7, y, L), p.set(8, y, L);
  for (const y of [3, 10]) { p.rect(6, y, 4, 3, hex(on ? '#ff8a5a' : '#4a2018')); p.set(7, y, hex(on ? '#ffe0b0' : '#7a3a30')); }
  p.set(7, 1, hex('#e8e8e8')); p.set(8, 1, hex('#e8e8e8')); p.set(6, 2, hex('#e8e8e8')); p.set(9, 2, hex('#e8e8e8'));
}
function lampTile(p, pal, frameC) {
  const C = pal.map(hex);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); p.set(x, y, shade(C[d < 3 ? 2 : d < 5.5 ? 1 : 0], 0.95 + p.r() * 0.1)); }
  for (let i = 0; i < S; i++) { p.set(i, 0, hex(frameC)); p.set(i, 15, hex(frameC)); p.set(0, i, hex(frameC)); p.set(15, i, hex(frameC)); p.set(i, 7, hex(frameC)); p.set(7, i, hex(frameC)); }
}
function planks90(p, base) { planks(p, base); const t = new Uint8ClampedArray(p.d); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = (x * S + y) * 4, o = (y * S + x) * 4; p.d[o] = t[s]; p.d[o + 1] = t[s + 1]; p.d[o + 2] = t[s + 2]; p.d[o + 3] = t[s + 3]; } }
function mapIcon(p, land) { p.clear(); p.rect(2, 2, 12, 12, hex('#e8dcb8')); p.rect(3, 3, 10, 10, hex(land)); for (let i = 2; i < 14; i++) { p.set(i, 2, hex('#b8a888')); p.set(i, 13, hex('#a89878')); p.set(2, i, hex('#b8a888')); p.set(13, i, hex('#a89878')); } }
function glowTool(p) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (p.alpha(x, y) < 10) continue; const c = p.get(x, y); if (c[0] < 70 && c[1] < 50 && (x * 5 + y * 3) % 7 === 0) p.set(x, y, hex('#ff5a1a')); } }
function frame(p, c) { for (let i = 0; i < S; i++) { p.set(i, 0, c); p.set(i, 15, c); p.set(0, i, c); p.set(15, i, c); } }
function waterFrame(p, f) {
  // djupt nordiskt sjövatten (blågrönt) med mjuka glittervågor
  const deep = hex('#1f5f7a'), mid = hex('#2a7590'), hi = hex('#5fa9bd'), glint = hex('#bfe6ee');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = Math.sin((x + f * 4) * 0.785 + Math.sin(y * 0.6) * 1.2) * 0.5 + Math.sin((y * 2 + x * 0.5 - f * 4) * 0.39) * 0.5;
    let c = v > 0.7 ? hi : v > -0.15 ? mid : deep;
    if (v > 0.93 && ((x * 3 + y + f) % 7) === 0) c = glint;
    p.set(x, y, c, v > 0.7 ? 185 : 170);
  }
}
function slab(p, c, fat, cooked) { p.clear(); for (let y = 4; y < 13; y++) for (let x = 2; x < 14; x++) { if ((x === 2 || x === 13) && (y === 4 || y === 12)) continue; let col = y < 6 ? fat : y === 8 ? mix(c, fat, 0.6) : shade(c, 0.9 + p.r() * 0.2); p.set(x, y, col); } if (cooked) for (let i = 3; i < 13; i += 3) p.line(i, 6, i + 2, 11, shade(c, 0.6)); }
function drumstick(p, c, d) { p.clear(); for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) { const r = Math.hypot(x - 5.5, y - 5.5); if (r < 4.3) p.set(x, y, r > 3.4 ? d : shade(c, 0.92 + p.r() * 0.14)); } for (let i = 0; i < 5; i++) { p.set(9 + i, 9 + i, hex('#efe8d8')); p.set(10 + i, 9 + i, hex('#c8bea8')); } p.set(14, 13, hex('#efe8d8')); p.set(13, 14, hex('#efe8d8')); p.set(14, 14, hex('#c8bea8')); }
function ingot(p, c, d) { p.clear(); for (let y = 6; y < 12; y++) { const inset = (11 - y) >> 1; for (let x = 2 + inset; x < 14 - inset; x++) p.set(x, y, y === 6 ? shade(c, 1.15) : y === 11 ? d : c); } p.line(4, 8, 7, 8, shade(c, 1.2)); }
function meat(p, c, fat) { p.clear(); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, (y - 7.5) * 1.2); if (d < 4.6) p.set(x, y, d > 3.8 ? fat : shade(c, 0.9 + p.r() * 0.2)); } p.rect(11, 11, 3, 2, hex('#efe8dc')); p.set(14, 13, hex('#efe8dc')); }
function steak(p, c, fat) { p.clear(); for (let y = 4; y < 13; y++) for (let x = 1; x < 15; x++) { const d = Math.hypot((x - 7.5) * 0.6, y - 8.5); if (d < 4.2) p.set(x, y, d > 3.5 ? fat : shade(c, 0.9 + p.r() * 0.2)); } }
function crop(p, n, h, cols, ear) { p.clear(); const C = cols.map(hex); for (let k = 0; k < n; k++) { const x = 1 + Math.round(k * 14 / Math.max(1, n - 1)), hh = h - (k % 2) * 2; for (let y = 16 - hh; y < 16; y++) p.setIn(x + (y < 16 - hh / 2 && k % 3 === 0 ? 1 : 0), y, C[(k + y) % 2]); if (ear) for (let y = 16 - hh; y < 16 - hh + 4; y++) { p.setIn(x, y, hex(ear)); p.setIn(x + 1, y, shade(hex(ear), 0.85)); } } }
function bucket(p, fill) { p.clear(); for (let y = 4; y < 14; y++) { const inset = Math.floor((y - 4) / 4); for (let x = 3 + inset; x < 13 - inset; x++) p.set(x, y, x === 3 + inset ? hex('#6c6f78') : shade(hex('#a3a6ae'), 0.95 + (x % 3 === 0 ? 0.1 : 0))); } p.rect(3, 4, 10, 1, hex('#c8ccd2')); if (fill) { p.rect(4, 4, 8, 2, hex(fill)); p.set(5, 4, shade(hex(fill), 1.25)); } for (let a = 0; a < 3.2; a += 0.2) p.set(Math.round(8 + Math.cos(a) * 5), Math.round(4 - Math.sin(a) * 3), hex('#6c6f78')); }
function fish(p, c, d, fin) { p.clear(); for (let y = 5; y < 12; y++) for (let x = 2; x < 12; x++) { const e = ((x - 7) / 5) ** 2 + ((y - 8.5) / 3.3) ** 2; if (e < 1) p.set(x, y, y > 9 ? shade(c, 1.15) : c); } for (const x of [5, 7, 9]) { p.set(x, 6, d); p.set(x, 7, d); p.set(x, 8, d); } for (let y = 5; y < 12; y++) { const w = Math.abs(y - 8.5) < 3.5 ? 1 + Math.round(Math.abs(y - 8.5) * 0.8) : 0; for (let k = 0; k < w; k++) p.set(12 + k, y, fin); } p.set(4, 7, hex('#111111')); p.set(6, 4, fin); p.set(7, 4, fin); }
/** Rustningsikoner: hjälm, bröstplåt, benskydd, kängor i materialfärg */
const ARMOR_ROWS = {
  helmet: ['................', '................', '................', '....hhhhhhh.....', '...hHHHHHHHh....', '...hHHhhhHHh....', '...hH.....Hh....', '...hH.....Hh....', '...hh.....hh....'],
  chest: ['................', '...hhh...hhh....', '..hHHHhhhHHHh...', '..hHHHHHHHHHh...', '..hhhHHHHHhhh...', '....hHHHHHh.....', '....hHHHHHh.....', '....hHHHHHh.....', '....hHHHHHh.....', '....hhhhhhh.....'],
  legs: ['................', '................', '...hhhhhhhhh....', '...hHHHHHHHh....', '...hHHhhhHHh....', '...hHh...hHh....', '...hHh...hHh....', '...hHh...hHh....', '...hHh...hHh....', '...hhh...hhh....'],
  boots: ['................', '................', '................', '................', '................', '...hh.....hh....', '...hH.....Hh....', '...hH.....Hh....', '..hHH....hHH....', '..hhh....hhh....']
};
const ARMOR_COL = [['#b87a46', '#7a4a22'], ['#dde0e6', '#8e9198'], ['#f6d040', '#b8901e'], ['#a8ecf8', '#3a9ec0'], ['#4a2c28', '#ff7a2a']];
function armorIcon(name) {
  const m = /^i_(helmet|chest|legs|boots)_(\d)$/.exec(name); if (!m) return null;
  const [H, h] = ARMOR_COL[+m[2]].map(hex);
  return p => { p.clear().mask(ARMOR_ROWS[m[1]].map(r => '..' + r.slice(0, 14)), { h, H }); };
}
function tool(name) {
  const m = /^i_(\w+)_(\d)$/.exec(name); if (!m || !TOOLS[m[1]]) return null;
  const rows = TOOLS[m[1]]; const [h, H] = TIER_COL[+m[2]].map(hex);
  return p => { p.clear().mask(rows, { h, H, s: hex('#8a5f33'), S: hex('#5e3f20'), g: hex('#6b6e73') }); };
}

/* ---------- bygg atlas ---------- */
export function buildAtlas() {
  const n = TILES.length;
  const data = new Uint8Array(S * S * 4 * n);
  const pix = [];
  const avg = [];
  for (let i = 0; i < n; i++) {
    const name = TILES[i];
    const p = new Px(name);
    const fn = draw[name] || tool(name) || armorIcon(name) || draw.missing;
    fn(p);
    data.set(p.d, i * S * S * 4);
    pix.push(p.d);
    // medelfärg (för partiklar)
    let r = 0, g = 0, b = 0, c = 0;
    for (let k = 0; k < S * S; k++) if (p.d[k * 4 + 3] > 100) { r += p.d[k * 4]; g += p.d[k * 4 + 1]; b += p.d[k * 4 + 2]; c++; }
    avg.push(c ? [r / c / 255, g / c / 255, b / c / 255] : [1, 0, 1]);
  }
  return { data, count: n, pix, avg, tileOf: (bd, f) => TILE[bd.tex[f]] || 0 };
}

/** Plocka en slumpad färg ur en ruta (för partiklar). */
export function tileColorSample(atlas, tile, rnd) {
  const d = atlas.pix[tile];
  for (let t = 0; t < 8; t++) {
    const k = (rnd() * S * S) | 0;
    if (d[k * 4 + 3] > 100) return [d[k * 4] / 255, d[k * 4 + 1] / 255, d[k * 4 + 2] / 255];
  }
  return atlas.avg[tile];
}

function tileCanvas(atlas, tile) {
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(atlas.pix[tile]), S, S), 0, 0);
  return c;
}

/** Skapar ikon (data-URL) för varje föremål. Block ritas isometriskt. */
export function buildIcons(atlas) {
  const icons = {};
  const cache = new Map();
  const tc = t => { if (!cache.has(t)) cache.set(t, tileCanvas(atlas, t)); return cache.get(t); };
  const Z = 64;
  const make = (id) => {
    const c = document.createElement('canvas'); c.width = Z; c.height = Z;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const bd = isBlock(id) ? BLOCKS[id] : null;
    if (bd && (bd.model === M_CUBE || (bd.model === M_BOX && bd.boxes && bd.boxes.length === 1 && bd.boxes[0][4] >= 8 && bd.boxes[0][0] === 0 && bd.boxes[0][3] === 16 && bd.boxes[0][2] === 0 && bd.boxes[0][5] === 16))) {
      const hh = bd.model === M_BOX ? bd.boxes[0][4] / 16 : 1;
      const top = tc(atlas.tileOf(bd, 2)), left = tc(atlas.tileOf(bd, 4)), right = tc(atlas.tileOf(bd, 0));
      const s = Z / 64;
      const L = [4 * s, 18 * s], T = [32 * s, 4 * s], R = [60 * s, 18 * s], Bt = [32 * s, 32 * s];
      const yOff = (1 - hh) * 28 * s;
      const H = 28 * s * hh;
      // vänster sida
      ctx.setTransform((Bt[0] - L[0]) / 16, (Bt[1] - L[1]) / 16, 0, H / 16 / hh, L[0], L[1] + yOff);
      ctx.drawImage(left, 0, 0, 16, 16 * hh, 0, 16 * (1 - hh), 16, 16 * hh);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 16 * (1 - hh), 16, 16 * hh);
      // höger sida
      ctx.setTransform((R[0] - Bt[0]) / 16, (R[1] - Bt[1]) / 16, 0, H / 16 / hh, Bt[0], Bt[1] + yOff);
      ctx.drawImage(right, 0, 0, 16, 16 * hh, 0, 16 * (1 - hh), 16, 16 * hh);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 16 * (1 - hh), 16, 16 * hh);
      // topp
      ctx.setTransform((T[0] - L[0]) / 16, (T[1] - L[1]) / 16, (Bt[0] - L[0]) / 16, (Bt[1] - L[1]) / 16, L[0], L[1] + yOff);
      ctx.drawImage(top, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const t = itemTile(id);
      ctx.drawImage(tc(t), 0, 0, 16, 16, 0, 0, Z, Z);
    }
    return c.toDataURL();
  };
  for (let i = 1; i < BLOCK_MAX; i++) if (BLOCKS[i]) icons[i] = make(i);
  for (const k in ITEMS) icons[k] = make(+k);
  return icons;
}

/** Sprickstadier (10 st) i en 160×16-canvas. */
export function crackCanvas() {
  const c = document.createElement('canvas'); c.width = 160; c.height = 16;
  const ctx = c.getContext('2d');
  const r = mulberry(99);
  const segs = [];
  for (let k = 0; k < 14; k++) { let x = 8, y = 8; const a = r() * Math.PI * 2; const pts = []; for (let i = 0; i < 8; i++) { x += Math.cos(a + (r() - 0.5) * 1.6) * 1.2; y += Math.sin(a + (r() - 0.5) * 1.6) * 1.2; pts.push([Math.floor(x), Math.floor(y)]); } segs.push(pts); }
  for (let s = 0; s < 10; s++) {
    const nSeg = 2 + Math.floor(s * 1.3), len = 2 + Math.floor(s * 0.7);
    for (let k = 0; k < Math.min(segs.length, nSeg); k++) for (let i = 0; i < Math.min(8, len); i++) {
      const [x, y] = segs[k][i]; if (x < 0 || y < 0 || x > 15 || y > 15) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(s * 16 + x, y, 1, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(s * 16 + ((x + 1) & 15), y, 1, 1);
    }
  }
  return c;
}

/**
 * Kubvärlds emblem: nattblå bricka med norrsken, fjäll, granar och en glödande guldkub.
 * variant: 'survival' | 'creative' (annan norrskensfärg). Returnerar data-URL.
 */
export function makeLogo(size = 256, variant = 'survival') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), k = size / 256;
  x.scale(k, k);
  const rr = (X, Y, W, H, R) => { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); };
  // bricka
  rr(8, 8, 240, 240, 58);
  const bg = x.createLinearGradient(0, 8, 0, 248); bg.addColorStop(0, '#16224a'); bg.addColorStop(0.6, '#0e1834'); bg.addColorStop(1, '#0a1226');
  x.fillStyle = bg; x.fill();
  x.save(); x.clip();
  // stjärnor
  const rnd = mulberry(7); x.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) { const sx = 14 + rnd() * 228, sy = 14 + rnd() * 120, r = rnd() < 0.15 ? 1.6 : 0.9; x.globalAlpha = 0.4 + rnd() * 0.6; x.beginPath(); x.arc(sx, sy, r, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  // norrsken (två mjuka band)
  const aur = variant === 'creative' ? ['rgba(176,131,255,', 'rgba(57,213,255,'] : ['rgba(120,255,190,', 'rgba(57,213,255,'];
  for (let b = 0; b < 2; b++) {
    for (let i = 0; i < 26; i++) {
      x.beginPath();
      const yb = 70 + b * 22 + i * 0.9;
      x.moveTo(0, yb);
      for (let X = 0; X <= 256; X += 8) x.lineTo(X, yb + Math.sin(X * 0.028 + b * 2 + i * 0.03) * 16 - Math.sin(X * 0.011 + b) * 10);
      x.strokeStyle = aur[b] + (0.05 * (1 - i / 26)).toFixed(3) + ')'; x.lineWidth = 6 + i * 1.2; x.stroke();
    }
  }
  // fjäll
  x.beginPath(); x.moveTo(-10, 210); x.lineTo(62, 128); x.lineTo(92, 158); x.lineTo(140, 104); x.lineTo(214, 178); x.lineTo(270, 150); x.lineTo(270, 260); x.lineTo(-10, 260); x.closePath();
  const mg = x.createLinearGradient(0, 100, 0, 230); mg.addColorStop(0, '#5c6f9e'); mg.addColorStop(1, '#22305a'); x.fillStyle = mg; x.fill();
  x.beginPath(); x.moveTo(140, 104); x.lineTo(162, 126); x.lineTo(150, 122); x.lineTo(141, 132); x.lineTo(130, 120); x.lineTo(118, 127); x.closePath(); x.fillStyle = '#e9f1ff'; x.fill();
  x.beginPath(); x.moveTo(62, 128); x.lineTo(76, 144); x.lineTo(66, 141); x.lineTo(57, 147); x.lineTo(50, 141); x.closePath(); x.fill();
  // granar i förgrunden
  const spruce = (X, Y, H, col) => { x.fillStyle = col; for (let i = 0; i < 4; i++) { const w = H * (0.42 - i * 0.08), y0 = Y - i * H * 0.22; x.beginPath(); x.moveTo(X - w, y0); x.lineTo(X + w, y0); x.lineTo(X, y0 - H * 0.36); x.closePath(); x.fill(); } x.fillRect(X - 2, Y, 4, 8); };
  x.fillStyle = '#121c38'; x.fillRect(0, 214, 256, 50);
  spruce(34, 222, 62, '#13213f'); spruce(62, 228, 44, '#172748'); spruce(214, 224, 66, '#13213f'); spruce(236, 230, 40, '#172748');
  x.restore();
  // guldkub med glöd
  const cx = 128, cy = 150, R = 50;
  const top = [[cx, cy - R], [cx + R * 0.87, cy - R * 0.5], [cx, cy], [cx - R * 0.87, cy - R * 0.5]];
  const left = [[cx - R * 0.87, cy - R * 0.5], [cx, cy], [cx, cy + R], [cx - R * 0.87, cy + R * 0.5]];
  const right = [[cx, cy], [cx + R * 0.87, cy - R * 0.5], [cx + R * 0.87, cy + R * 0.5], [cx, cy + R]];
  const poly = (pts, fill) => { x.beginPath(); pts.forEach(([X, Y], i) => i ? x.lineTo(X, Y) : x.moveTo(X, Y)); x.closePath(); x.fillStyle = fill; x.fill(); };
  x.save(); x.shadowColor = 'rgba(255, 204, 51, .85)'; x.shadowBlur = 34;
  poly([top[0], top[1], right[2], left[2], left[3]], '#ffcc33'); x.restore();
  const gt = x.createLinearGradient(cx, cy - R, cx, cy); gt.addColorStop(0, '#fff2b0'); gt.addColorStop(1, '#ffd85c');
  const gl = x.createLinearGradient(cx - R, cy, cx, cy + R); gl.addColorStop(0, '#ffcc33'); gl.addColorStop(1, '#e09a1a');
  const gr = x.createLinearGradient(cx, cy, cx + R, cy + R); gr.addColorStop(0, '#d48a12'); gr.addColorStop(1, '#a85f0a');
  poly(top, gt); poly(left, gl); poly(right, gr);
  // runa/inristning: en liten gran på kubens framsidor
  x.strokeStyle = 'rgba(120, 60, 0, .55)'; x.lineWidth = 3; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx - 22, cy + 34); x.lineTo(cx - 22, cy + 6); x.moveTo(cx - 22, cy + 12); x.lineTo(cx - 32, cy + 20); x.moveTo(cx - 22, cy + 12); x.lineTo(cx - 12, cy + 26); x.moveTo(cx - 22, cy + 22); x.lineTo(cx - 30, cy + 28); x.moveTo(cx - 22, cy + 22); x.lineTo(cx - 14, cy + 33); x.stroke();
  x.strokeStyle = 'rgba(255, 250, 220, .9)'; x.lineWidth = 2.5; x.lineJoin = 'round';
  x.beginPath(); top.forEach(([X, Y], i) => i ? x.lineTo(X, Y) : x.moveTo(X, Y)); x.closePath(); x.stroke();
  // kant
  rr(8, 8, 240, 240, 58); x.lineWidth = 4; const eg = x.createLinearGradient(0, 0, 256, 256); eg.addColorStop(0, '#ffd85c'); eg.addColorStop(1, variant === 'creative' ? '#b083ff' : '#7fe0c8'); x.strokeStyle = eg; x.stroke();
  return c.toDataURL();
}
export { TILE };
