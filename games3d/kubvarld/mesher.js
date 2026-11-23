/**
 * Ljusberäkning (himmels- och blockljus, flodfyllning) + greedy meshing med per-vertex AO och mjukt ljus.
 * Arbetar på en region av 3×3 chunkar (48×130×48 inkl. utfyllnad i höjdled) och meshar mittchunken.
 */
import {
  CX, CY, CZ, T_OPAQUE, T_ATT, T_EMIT, T_MODEL, T_CULLSELF, T_PASS, T_FLAGS, T_FACE, T_BOXES, T_TINTTOP,
  M_CUBE, M_CROSS, M_BOX, M_LIQUID, F_LEAF, F_TINT, F_LIQUID, F_WAVE, F_PORTAL, WATER, B, T_CONN, T_LAVA, fenceLinks, fenceBoxes
} from './blocks.js';
import { hash3 } from './noise.js';

const W = 48, HP = CY + 2, WW = W * W, VOL = WW * HP;
const vol = new Uint16Array(VOL), sky = new Uint8Array(VOL), blk = new Uint8Array(VOL);
const QSIZE = 1 << 20, QMASK = QSIZE - 1;
const queue = new Int32Array(QSIZE);
const colTop = new Int16Array(W * W);
const NOFF = [1, -1, WW, -WW, W, -W];
const UOFF = [W, W, 1, 1, 1, 1];
const VOFF = [WW, WW, W, W, WW, WW];

/* ---------- utdatabuffertar ---------- */
class Out {
  constructor(maxQuads) {
    this.max = maxQuads;
    this.pos = new Uint16Array(maxQuads * 12); this.uv = new Uint16Array(maxQuads * 8);
    this.dat = new Uint8Array(maxQuads * 16); this.lit = new Uint8Array(maxQuads * 16);
    this.n = 0;
  }
  grow() {
    const m = this.max * 2;
    const p = new Uint16Array(m * 12); p.set(this.pos); this.pos = p;
    const u = new Uint16Array(m * 8); u.set(this.uv); this.uv = u;
    const d = new Uint8Array(m * 16); d.set(this.dat); this.dat = d;
    const l = new Uint8Array(m * 16); l.set(this.lit); this.lit = l;
    this.max = m;
  }
  /** v: vertex index 0..3 inom aktuell quad */
  vert(v, x, y, z, u, t, layer, face, tint, top, sk, bl, ao) {
    const q = this.n * 4 + v;
    let o = q * 3; this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    o = q * 2; this.uv[o] = u; this.uv[o + 1] = t;
    o = q * 4; this.dat[o] = layer; this.dat[o + 1] = face; this.dat[o + 2] = tint; this.dat[o + 3] = top;
    this.lit[o] = sk * 17; this.lit[o + 1] = bl * 17; this.lit[o + 2] = ao * 85; this.lit[o + 3] = 0;
  }
  next() { this.n++; if (this.n >= this.max) this.grow(); }
  take() {
    const n = this.n;
    return { quads: n, pos: this.pos.slice(0, n * 12), uv: this.uv.slice(0, n * 8), dat: this.dat.slice(0, n * 16), lit: this.lit.slice(0, n * 16) };
  }
}
const outs = [new Out(24000), new Out(8000)];

/* ---------- region ---------- */
function buildRegion(chunks, topY) {
  // botten (utfyllnad y=-1) = berggrund, topp = luft
  vol.fill(B.bedrock, 0, WW);
  vol.fill(0, WW * (topY + 2), VOL);
  const rows = Math.min(CY, topY + 1);
  for (let k = 0; k < 9; k++) {
    const data = chunks[k]; if (!data) continue;
    const ox = (k % 3) * 16, oz = ((k / 3) | 0) * 16;
    for (let y = 0; y < rows; y++) for (let z = 0; z < 16; z++) {
      const src = (y << 8) | (z << 4);
      vol.set(data.subarray(src, src + 16), ((y + 1) * W + oz + z) * W + ox);
    }
  }
}

function computeLight(topP) {
  // topP: högsta utfyllda y-lager som kan innehålla block (+1 marginal)
  sky.fill(15, (topP + 1) * WW, VOL);
  blk.fill(0);
  let tail = 0;
  // kolumner uppifrån; top[c] = högsta y där himmelsljuset < 15
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let l = 15, t = -1;
    for (let y = topP; y >= 0; y--) {
      const i = (y * W + z) * W + x, b = vol[i];
      if (T_OPAQUE[b]) l = 0; else if (T_ATT[b]) { l -= T_ATT[b]; if (l < 0) l = 0; }
      sky[i] = l;
      if (l < 15 && t < 0) t = y;
    }
    colTop[z * W + x] = t;
  }
  // frön: 15-celler bredvid täckta grannkolumner, samt dämpade celler (under löv/vatten)
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const c = z * W + x, t = colTop[c];
    let mn = t;
    if (x > 0 && colTop[c - 1] > mn) mn = colTop[c - 1];
    if (x < W - 1 && colTop[c + 1] > mn) mn = colTop[c + 1];
    if (z > 0 && colTop[c - W] > mn) mn = colTop[c - W];
    if (z < W - 1 && colTop[c + W] > mn) mn = colTop[c + W];
    for (let y = t + 1; y <= mn && y <= topP; y++) queue[tail++ & QMASK] = (y * W + z) * W + x;
    for (let y = t; y > 0; y--) {
      const i = (y * W + z) * W + x, s0 = sky[i];
      if (s0 < 2) break;
      queue[tail++ & QMASK] = i;
    }
  }
  flood(sky, 0, tail);
  // blockljus
  tail = 0;
  for (let i = WW; i < (topP + 1) * WW; i++) { const e = T_EMIT[vol[i]]; if (e) { blk[i] = e; queue[tail++ & QMASK] = i; } }
  if (tail) flood(blk, 0, tail);
}

function flood(arr, head, tail) {
  while (head !== tail) {
    const i = queue[head++ & QMASK];
    const l = arr[i]; if (l < 2) continue;
    const x = i % W, z = ((i / W) | 0) % W, y = (i / WW) | 0;
    for (let d = 0; d < 6; d++) {
      if (d === 0 && x === W - 1) continue; if (d === 1 && x === 0) continue;
      if (d === 2 && y === HP - 1) continue; if (d === 3 && y === 0) continue;
      if (d === 4 && z === W - 1) continue; if (d === 5 && z === 0) continue;
      const n = i + NOFF[d], b = vol[n];
      if (T_OPAQUE[b]) continue;
      const nl = l - 1 - T_ATT[b];
      if (nl > arr[n]) { arr[n] = nl; queue[tail++ & QMASK] = n; }
    }
  }
}

/* ---------- per-ytans AO och ljus ---------- */
const fAO = new Uint8Array(4), fSK = new Uint8Array(4), fBL = new Uint8Array(4);
function faceLight(i, d) {
  const f = i + NOFF[d], uo = UOFF[d], vo = VOFF[d];
  const s0 = sky[f], b0 = blk[f];
  for (let k = 0; k < 4; k++) {
    const su = (k === 1 || k === 2) ? uo : -uo, sv = k >= 2 ? vo : -vo;
    const c1 = f + su, c2 = f + sv, cc = f + su + sv;
    const o1 = T_OPAQUE[vol[c1]], o2 = T_OPAQUE[vol[c2]], oc = T_OPAQUE[vol[cc]];
    fAO[k] = (o1 && o2) ? 0 : 3 - o1 - o2 - oc;
    let ss = s0, bb = b0, n = 1;
    if (!o1) { ss += sky[c1]; bb += blk[c1]; n++; }
    if (!o2) { ss += sky[c2]; bb += blk[c2]; n++; }
    if (!oc && !(o1 && o2)) { ss += sky[cc]; bb += blk[cc]; n++; }
    fSK[k] = Math.round(ss / n); fBL[k] = Math.round(bb / n);
  }
}

const maskA = new Int32Array(16 * CY), maskB = new Int32Array(16 * CY);
// hörnordning c0(u-,v-) c1(u+,v-) c2(u+,v+) c3(u-,v+)
const CU = [0, 1, 1, 0], CV = [0, 0, 1, 1];
const ORD_F = [0, 1, 2, 3], ORD_R = [0, 3, 2, 1];

function emitGreedy(d, slice, u0, v0, w, h, A, Bk) {
  const layer = (A & 511) - 1, pass = (A >> 17) & 1, tint = (A >> 18) & 15, leaf = (A >> 22) & 1;
  const out = outs[pass];
  const aos = A >> 9;
  const rev = d === 0 || d === 2 || d === 5;
  let ord = rev ? ORD_R : ORD_F;
  const a0 = aos & 3, a1 = (aos >> 2) & 3, a2 = (aos >> 4) & 3, a3 = (aos >> 6) & 3;
  const flip = a1 + a3 > a0 + a2;
  const face = d | (leaf ? F_LEAF : 0);
  for (let v = 0; v < 4; v++) {
    const k = ord[(v + (flip ? 1 : 0)) & 3];
    const cu = CU[k], cv = CV[k];
    const uu = u0 + cu * w, vv = v0 + cv * h;
    let x, y, z, tu, tv;
    if (d < 2) { x = slice + (d === 0 ? 1 : 0); z = uu; y = vv; tu = d === 0 ? (cu ? 0 : w) : (cu ? w : 0); tv = cv ? 0 : h; }
    else if (d < 4) { y = slice + (d === 2 ? 1 : 0); x = uu; z = vv; tu = cu ? w : 0; tv = cv ? h : 0; }
    else { z = slice + (d === 4 ? 1 : 0); x = uu; y = vv; tu = d === 4 ? (cu ? w : 0) : (cu ? 0 : w); tv = cv ? 0 : h; }
    const sk = (Bk >>> (k * 4)) & 15, bl = (Bk >>> (16 + k * 4)) & 15, ao = (aos >> (k * 2)) & 3;
    out.vert(v, x * 16, y * 16, z * 16, tu * 16, tv * 16, layer, face, tint, 0, sk, bl, ao);
  }
  out.next();
}

function greedyDir(d, ny, biomes, fancy) {
  // u/v-storlekar per riktning
  const Un = 16, Vn = d === 2 || d === 3 ? 16 : ny;
  const slices = d === 2 || d === 3 ? ny : 16;
  const no = NOFF[d];
  for (let s = 0; s < slices; s++) {
    let any = false;
    for (let v = 0; v < Vn; v++) for (let u = 0; u < Un; u++) {
      let x, y, z;
      if (d < 2) { x = s; z = u; y = v; } else if (d < 4) { y = s; x = u; z = v; } else { z = s; x = u; y = v; }
      const i = ((y + 1) * W + z + 16) * W + x + 16;
      const b = vol[i];
      const mi = v * Un + u;
      maskA[mi] = 0;
      if (T_MODEL[b] !== M_CUBE) continue;
      const n = vol[i + no];
      if (T_OPAQUE[n]) continue;
      if (n === b && T_CULLSELF[b]) continue;
      const fl = T_FLAGS[b];
      if (!fancy && (fl & F_LEAF) && (T_FLAGS[n] & F_LEAF)) continue;
      if (d === 3 && y === 0) continue;
      faceLight(i, d);
      const tint = ((fl & F_TINT) || (d === 2 && T_TINTTOP[b])) ? biomes[z * 16 + x] + 1 : 0;
      maskA[mi] = (T_FACE[b * 6 + d] + 1) | ((fAO[0] | fAO[1] << 2 | fAO[2] << 4 | fAO[3] << 6) << 9) | (T_PASS[b] << 17) | (tint << 18) | ((fl & F_LEAF ? 1 : 0) << 22);
      maskB[mi] = fSK[0] | fSK[1] << 4 | fSK[2] << 8 | fSK[3] << 12 | fBL[0] << 16 | fBL[1] << 20 | fBL[2] << 24 | fBL[3] << 28;
      any = true;
    }
    if (!any) continue;
    for (let v = 0; v < Vn; v++) for (let u = 0; u < Un;) {
      const mi = v * Un + u, A = maskA[mi];
      if (!A) { u++; continue; }
      const Bk = maskB[mi];
      let w = 1;
      while (u + w < Un && maskA[mi + w] === A && maskB[mi + w] === Bk) w++;
      let h = 1;
      outer: while (v + h < Vn) {
        const row = mi + h * Un;
        for (let t = 0; t < w; t++) if (maskA[row + t] !== A || maskB[row + t] !== Bk) break outer;
        h++;
      }
      emitGreedy(d, s, u, v, w, h, A, Bk);
      for (let hh = 0; hh < h; hh++) for (let t = 0; t < w; t++) maskA[mi + hh * Un + t] = 0;
      u += w;
    }
  }
}

/* ---------- korsade växter ---------- */
function emitCross(i, x, y, z, b, wx, wz, biomes) {
  const out = outs[0];
  const layer = T_FACE[b * 6], fl = T_FLAGS[b];
  const sk = sky[i], bl = blk[i];
  const jx = (hash3(1234, wx, 0, wz) - 0.5) * 0.3, jz = (hash3(4321, wx, 0, wz) - 0.5) * 0.3;
  const tint = (fl & F_TINT) ? biomes[z * 16 + x] + 1 : 0;
  const face = 6 | (fl & F_WAVE);
  const a0 = 0.15, a1 = 0.85;
  const P = [
    [x + a0 + jx, z + a0 + jz, x + a1 + jx, z + a1 + jz],
    [x + a0 + jx, z + a1 + jz, x + a1 + jx, z + a0 + jz]
  ];
  for (const [x0, z0, x1, z1] of P) {
    for (let side = 0; side < 2; side++) {
      const vs = side === 0 ? [[x0, 0, z0, 0, 16], [x1, 0, z1, 16, 16], [x1, 1, z1, 16, 0], [x0, 1, z0, 0, 0]]
        : [[x1, 0, z1, 16, 16], [x0, 0, z0, 0, 16], [x0, 1, z0, 0, 0], [x1, 1, z1, 16, 0]];
      for (let v = 0; v < 4; v++) {
        const p = vs[v];
        out.vert(v, Math.round(p[0] * 16), (y + p[1]) * 16, Math.round(p[2] * 16), p[3], p[4], layer, face, tint, p[1] ? 1 : 0, sk, bl, 3);
      }
      out.next();
    }
  }
}

/* ---------- lådmodeller (fackla, dörr, säng, platta, lykta) ---------- */
function emitBoxes(i, x, y, z, b) {
  const portal = T_FLAGS[b] & F_PORTAL, lava = T_LAVA[b];
  const out = outs[portal ? 1 : 0];
  const def = T_BOXES[b]; if (!def) return;
  const sk0 = sky[i], bl0 = blk[i];
  let boxes = def.boxes;
  if (T_CONN[b] === 1) {
    // staket: koppla mot grannar (+x, −x, +z, −z)
    let mask = 0;
    if (fenceLinks(vol[i + 1], 0)) mask |= 1; if (fenceLinks(vol[i - 1], 1)) mask |= 2;
    if (fenceLinks(vol[i + W], 2)) mask |= 4; if (fenceLinks(vol[i - W], 3)) mask |= 8;
    boxes = fenceBoxes(mask);
  }
  for (const bx of boxes) {
    const [x0, y0, z0, x1, y1, z1] = bx;
    for (let d = 0; d < 6; d++) {
      const boundary = (d === 0 && x1 === 16) || (d === 1 && x0 === 0) || (d === 2 && y1 === 16) || (d === 3 && y0 === 0) || (d === 4 && z1 === 16) || (d === 5 && z0 === 0);
      let sk = sk0, bl = bl0;
      if (boundary) {
        const n = i + NOFF[d];
        if (T_OPAQUE[vol[n]]) continue;
        // inre ytor i lavasjöar och portaler ritas inte
        if (lava && T_LAVA[vol[n]]) continue;
        if (portal && vol[n] === b) continue;
        sk = Math.max(sk, sky[n]); bl = Math.max(bl, blk[n]);
      } else if (lava && d === 2 && T_LAVA[vol[i + WW]]) continue;
      if (T_EMIT[b]) { bl = Math.max(bl, T_EMIT[b]); }
      const layer = T_FACE[b * 6 + d];
      // hörn i (u,v) – samma konvention som greedy
      let c;
      if (d < 2) { const xx = d === 0 ? x1 : x0; c = [[xx, y0, z0], [xx, y0, z1], [xx, y1, z1], [xx, y1, z0]]; }
      else if (d < 4) { const yy = d === 2 ? y1 : y0; c = [[x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1]]; }
      else { const zz = d === 4 ? z1 : z0; c = [[x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz]]; }
      const rev = d === 0 || d === 2 || d === 5;
      const ord = rev ? ORD_R : ORD_F;
      for (let v = 0; v < 4; v++) {
        const p = c[ord[v]];
        let tu, tv;
        if (d === 0) { tu = 16 - p[2]; tv = 16 - p[1] + def.vOff; }
        else if (d === 1) { tu = p[2]; tv = 16 - p[1] + def.vOff; }
        else if (d === 4) { tu = p[0]; tv = 16 - p[1] + def.vOff; }
        else if (d === 5) { tu = 16 - p[0]; tv = 16 - p[1] + def.vOff; }
        else {
          tu = p[0]; tv = p[2];
          for (let r = 0; r < def.topRot; r++) { const t = tu; tu = 16 - tv; tv = t; }
        }
        out.vert(v, x * 16 + p[0], y * 16 + p[1], z * 16 + p[2], tu, tv, layer, d | portal, 0, 0, sk, bl, 3);
      }
      out.next();
    }
  }
}

/* ---------- vätska ---------- */
function liqH(j) {
  const b = vol[j];
  if (b < WATER || b > WATER + 7) return -1;
  const ab = vol[j + WW];
  if (ab >= WATER && ab <= WATER + 7) return 16;
  const L = b - WATER;
  return L === 0 ? 14 : Math.max(2, 14 - L * 1.7);
}
function cornerH(i, dx, dz) {
  // medel av de 4 cellerna som delar hörnet (dx,dz ∈ {0,1})
  let s = 0, n = 0;
  for (let a = -1; a <= 0; a++) for (let c = -1; c <= 0; c++) {
    const j = i + (dx + a) + (dz + c) * W;
    const h = liqH(j);
    if (h === 16) return 16;
    if (h >= 0) { s += h; n++; }
  }
  return n ? s / n : 14;
}
function emitLiquid(i, x, y, z, b) {
  const out = outs[1];
  const layer = T_FACE[b * 6];
  const above = vol[i + WW];
  const aboveW = above >= WATER && above <= WATER + 7;
  const h00 = cornerH(i, 0, 0), h10 = cornerH(i, 1, 0), h11 = cornerH(i, 1, 1), h01 = cornerH(i, 0, 1);
  const sk = sky[i], bl = blk[i];
  const X = x * 16, Y = y * 16, Z = z * 16;
  const face = F_LIQUID;
  const put = (d, pts, uvs, s, l, dep = 0) => { for (let v = 0; v < 4; v++) out.vert(v, pts[v][0], pts[v][1], pts[v][2], uvs[v][0], uvs[v][1], layer, d | face, 0, dep, s, l, 3); out.next(); };
  if (!aboveW && !T_OPAQUE[above]) {
    const s = Math.max(sk, sky[i + WW]), l = Math.max(bl, blk[i + WW]);
    // +y (moturs sett uppifrån): c0,c3,c2,c1
    // djup: antal vattenblock under ytan (för mörkare djupt vatten)
    let dep = 1; for (let j = i - WW; dep < 15 && j > 0; j -= WW) { const b2 = vol[j]; if (b2 < WATER || b2 > WATER + 7) break; dep++; }
    put(2, [[X, Y + h00, Z], [X, Y + h01, Z + 16], [X + 16, Y + h11, Z + 16], [X + 16, Y + h10, Z]], [[0, 0], [0, 16], [16, 16], [16, 0]], s, l, dep);
  }
  const below = vol[i - WW];
  if (!(below >= WATER && below <= WATER + 7) && !T_OPAQUE[below]) {
    put(3, [[X, Y, Z], [X + 16, Y, Z], [X + 16, Y, Z + 16], [X, Y, Z + 16]], [[0, 0], [16, 0], [16, 16], [0, 16]], sk, bl);
  }
  // sidor
  const sides = [
    [0, 1, [[X + 16, Y, Z + 16], [X + 16, Y, Z], [X + 16, Y + h10, Z], [X + 16, Y + h11, Z + 16]]],
    [1, -1, [[X, Y, Z], [X, Y, Z + 16], [X, Y + h01, Z + 16], [X, Y + h00, Z]]],
    [4, W, [[X, Y, Z + 16], [X + 16, Y, Z + 16], [X + 16, Y + h11, Z + 16], [X, Y + h01, Z + 16]]],
    [5, -W, [[X + 16, Y, Z], [X, Y, Z], [X, Y + h00, Z], [X + 16, Y + h10, Z]]]
  ];
  for (const [d, off, pts] of sides) {
    const n = vol[i + off];
    if (n >= WATER && n <= WATER + 7) continue;
    if (T_OPAQUE[n]) continue;
    if (n === B.ice || n === B.glass || n === B.packed_ice) continue;
    const s = Math.max(sk, sky[i + off]), l = Math.max(bl, blk[i + off]);
    put(d, pts, [[0, 16], [16, 16], [16, 16 - Math.round(pts[2][1] - Y)], [0, 16 - Math.round(pts[3][1] - Y)]], s, l);
  }
}

/**
 * chunks: 9 Uint16Array (ordning (dz+1)*3+(dx+1)), maxYs: 9 tal, biomes: mittchunkens biomkarta (256), fancy: bool
 * cx,cz: mittchunkens koordinater (för jitter).
 */
export function meshChunk(chunks, maxYs, biomes, fancy, cx, cz) {
  let top = 0;
  for (let k = 0; k < 9; k++) if (maxYs[k] > top) top = maxYs[k];
  top = Math.min(CY - 1, top + 1);
  buildRegion(chunks, top);
  const topP = Math.min(HP - 1, top + 2);
  computeLight(topP);
  outs[0].n = 0; outs[1].n = 0;
  const ny = Math.min(CY, maxYs[4] + 2);
  for (let d = 0; d < 6; d++) greedyDir(d, ny, biomes, fancy);
  for (let y = 0; y < ny; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = ((y + 1) * W + z + 16) * W + x + 16;
    const b = vol[i];
    const m = T_MODEL[b];
    if (m === M_CROSS) emitCross(i, x, y, z, b, cx * 16 + x, cz * 16 + z, biomes);
    else if (m === M_BOX) emitBoxes(i, x, y, z, b);
    else if (m === M_LIQUID) emitLiquid(i, x, y, z, b);
  }
  // ljus för mittchunken (för varelser, spawn, föremål)
  const light = new Uint8Array(CX * CY * CZ);
  for (let y = 0; y < CY; y++) for (let z = 0; z < 16; z++) {
    const ri = ((y + 1) * W + z + 16) * W + 16, ci = (y << 8) | (z << 4);
    for (let x = 0; x < 16; x++) light[ci + x] = (sky[ri + x] << 4) | blk[ri + x];
  }
  return { opaque: outs[0].take(), trans: outs[1].take(), light };
}
