// Nordheim – procedurell ögenerering (ren logik, ingen three).
import { T, R } from './data.js';

export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** 2D-gradientbrus med seedad permutationstabell. */
export function makeNoise(rng) {
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = new Float32Array(8), gy = new Float32Array(8);
  for (let i = 0; i < 8; i++) { gx[i] = Math.cos(i * Math.PI / 4); gy[i] = Math.sin(i * Math.PI / 4); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const g00 = p[p[X] + Y] & 7, g10 = p[p[X + 1] + Y] & 7, g01 = p[p[X] + Y + 1] & 7, g11 = p[p[X + 1] + Y + 1] & 7;
    const d00 = gx[g00] * xf + gy[g00] * yf;
    const d10 = gx[g10] * (xf - 1) + gy[g10] * yf;
    const d01 = gx[g01] * xf + gy[g01] * (yf - 1);
    const d11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    return (d00 + u * (d10 - d00)) + v * ((d01 + u * (d11 - d01)) - (d00 + u * (d10 - d00)));
  }
  function fbm(x, y, oct = 4) {
    let s = 0, a = 1, f = 1, t = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  }
  return { n2, fbm };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Genererar en ö. Returnerar karta med:
 *  n, h (vertexhöjder (n+1)²), type, res, amt, grow (n²), hall {i,j}, camp {i,j}|null
 */
export function generateMap(seed, n, opts = {}) {
  const rng = makeRng(String(seed) + ':' + n);
  const noise = makeNoise(rng);
  const noise2 = makeNoise(rng);
  const N1 = n + 1;
  const h = new Float32Array(N1 * N1);
  const cx = n / 2, cz = n / 2;
  const ang0 = rng() * Math.PI * 2;
  // Bergsregion förskjuten från mitten
  const mx = cx + Math.cos(ang0) * n * 0.22, mz = cz + Math.sin(ang0) * n * 0.22;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const dx = (i - cx) / (n / 2), dz = (j - cz) / (n / 2);
      const d = Math.sqrt(dx * dx + dz * dz);
      const a = Math.atan2(dz, dx);
      const rr = 0.93 + 0.12 * noise.fbm(Math.cos(a) * 1.6 + 3.1, Math.sin(a) * 1.6 + 7.7, 3) + 0.05 * noise2.n2(i * 0.05, j * 0.05);
      const mask = 1 - smooth(rr * 0.74, rr * 1.04, d);
      const base = noise.fbm(i * 0.035, j * 0.035, 4);
      const detail = noise2.fbm(i * 0.11, j * 0.11, 2);
      const md = Math.hypot(i - mx, j - mz) / (n * 0.24);
      const mount = Math.max(0, 1 - md) ** 1.6 * (5.5 + 4 * Math.abs(noise2.fbm(i * 0.06, j * 0.06, 3)));
      let e = mask * (0.9 + base * 2.2 + detail * 0.35 + mount * (0.6 + 0.4 * mask)) - (1 - mask) * 3.2 - 0.35;
      // gör lågland plattare (bra byggmark)
      if (e > 0.25 && e < 2.6) e = 0.25 + (e - 0.25) * 0.55;
      h[j * N1 + i] = e;
    }
  }
  // kanterna alltid djupt hav
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const ed = Math.min(i, j, n - i, n - j);
    if (ed < 4) h[j * N1 + i] = Math.min(h[j * N1 + i], -3 + ed * 0.3);
  }

  // grunda vattenytor blir lite djupare (inga "nästan torra" sjöar)
  for (let k = 0; k < N1 * N1; k++) if (h[k] < 0.06) h[k] -= 0.42;
  const NN = n * n;
  const type = new Uint8Array(NN), res = new Uint8Array(NN), amt = new Float32Array(NN), grow = new Float32Array(NN);
  const th = (i, j) => (h[j * N1 + i] + h[j * N1 + i + 1] + h[(j + 1) * N1 + i] + h[(j + 1) * N1 + i + 1]) * 0.25;
  const slope = (i, j) => {
    const a = h[j * N1 + i], b = h[j * N1 + i + 1], c = h[(j + 1) * N1 + i], d = h[(j + 1) * N1 + i + 1];
    return Math.max(a, b, c, d) - Math.min(a, b, c, d);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, t = th(i, j), s = slope(i, j);
    if (t < 0.02) { type[k] = T.WATER; continue; }
    if (t > 4.4 || s > 1.25) { type[k] = T.ROCK; continue; }
    type[k] = T.GRASS;
  }
  // sand nära vatten
  const nearWater = new Uint8Array(NN);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; if (type[k] === T.WATER) continue;
    let w = 0;
    for (let dj = -2; dj <= 2 && !w; dj++) for (let di = -2; di <= 2; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      if (type[jj * n + ii] === T.WATER) { w = Math.max(Math.abs(di), Math.abs(dj)); break; }
    }
    nearWater[k] = w;
    if (w && w <= 1 && th(i, j) < 0.55 && type[k] !== T.ROCK) type[k] = T.SAND;
    else if (w === 2 && th(i, j) < 0.32 && type[k] !== T.ROCK) type[k] = T.SAND;
  }
  // skog och äng
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; if (type[k] !== T.GRASS) continue;
    const f = noise2.fbm(i * 0.045 + 40, j * 0.045 + 11, 3);
    const m = noise.fbm(i * 0.05 + 90, j * 0.05 + 33, 3);
    if (f > 0.07) {
      type[k] = T.FOREST;
      if (rng() < 0.55 + Math.min(0.35, (f - 0.07) * 3)) { res[k] = R.TREE; grow[k] = 1; amt[k] = rng(); }
    } else if (m > 0.06) {
      type[k] = T.MEADOW;
    } else if (rng() < 0.035) {
      res[k] = R.TREE; grow[k] = 1; amt[k] = rng();
    }
  }
  const isLand = k => type[k] !== T.WATER;
  const inb = (i, j) => i >= 0 && j >= 0 && i < n && j < n;
  // sten-kluster
  const cluster = (ci, cj, kind, count, amount, allow) => {
    let placed = 0;
    for (let t = 0; t < count * 4 && placed < count; t++) {
      const i = ci + Math.round((rng() - 0.5) * 5), j = cj + Math.round((rng() - 0.5) * 5);
      if (!inb(i, j)) continue;
      const k = j * n + i;
      if (!allow(k) || res[k]) continue;
      res[k] = kind; amt[k] = amount; grow[k] = 1; placed++;
    }
    return placed;
  };
  const stoneClusters = Math.round(NN / 900);
  let made = 0;
  for (let t = 0; t < 4000 && made < stoneClusters; t++) {
    const i = 4 + Math.floor(rng() * (n - 8)), j = 4 + Math.floor(rng() * (n - 8)), k = j * n + i;
    if (!isLand(k) || type[k] === T.SAND) continue;
    // nära berg eller slumpmässigt på gräs
    let nearRock = false;
    for (let d = 1; d <= 5 && !nearRock; d++) { if (inb(i + d, j) && type[j * n + i + d] === T.ROCK) nearRock = true; if (inb(i - d, j) && type[j * n + i - d] === T.ROCK) nearRock = true; if (inb(i, j + d) && type[(j + d) * n + i] === T.ROCK) nearRock = true; }
    if (!nearRock && rng() < 0.65) continue;
    if (cluster(i, j, R.STONE, 3 + Math.floor(rng() * 4), 45, kk => type[kk] !== T.WATER && type[kk] !== T.SAND) > 1) made++;
  }
  // malm – på berg som gränsar till byggbar mark
  const oreClusters = Math.max(4, Math.round(NN / 2600));
  made = 0;
  for (let t = 0; t < 8000 && made < oreClusters; t++) {
    const i = 4 + Math.floor(rng() * (n - 8)), j = 4 + Math.floor(rng() * (n - 8)), k = j * n + i;
    if (type[k] !== T.ROCK || res[k]) continue;
    let edge = false;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (inb(ii, jj) && (type[jj * n + ii] === T.GRASS || type[jj * n + ii] === T.MEADOW || type[jj * n + ii] === T.FOREST)) edge = true; }
    if (!edge) continue;
    if (cluster(i, j, R.ORE, 2 + Math.floor(rng() * 3), 260, kk => type[kk] === T.ROCK) > 0) made++;
  }
  // bärbuskar
  const berries = Math.round(NN / 160);
  for (let t = 0; t < berries * 6; t++) {
    const i = Math.floor(rng() * n), j = Math.floor(rng() * n), k = j * n + i;
    if ((type[k] !== T.GRASS && type[k] !== T.FOREST && type[k] !== T.MEADOW) || res[k]) continue;
    if (rng() < 0.5 && type[k] !== T.FOREST) continue;
    res[k] = R.BERRY; amt[k] = 6; grow[k] = 1;
  }
  // fiskevatten – grunt vatten nära kusten, i stim
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; if (type[k] !== T.WATER) continue;
    const t = th(i, j); if (t < -2.2) continue;
    let coast = false;
    for (let dj = -3; dj <= 3 && !coast; dj++) for (let di = -3; di <= 3; di++) { const ii = i + di, jj = j + dj; if (inb(ii, jj) && type[jj * n + ii] !== T.WATER) { coast = true; break; } }
    if (!coast) continue;
    if (noise.fbm(i * 0.09 + 200, j * 0.09, 2) > 0.06) { res[k] = R.FISH; amt[k] = 30; grow[k] = 1; }
  }

  // Startplats för hallen: platt gräs, nära skog, sten och kust
  const flatOk = (i0, j0, w, d) => {
    let mn = 1e9, mx2 = -1e9;
    for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) {
      if (!inb(i, j)) return false; const k = j * n + i;
      if (type[k] === T.WATER || type[k] === T.ROCK || res[k] === R.STONE || res[k] === R.ORE) return false;
    }
    for (let j = j0; j <= j0 + d; j++) for (let i = i0; i <= i0 + w; i++) { const v = h[j * N1 + i]; if (v < mn) mn = v; if (v > mx2) mx2 = v; }
    return mx2 - mn < 1.0;
  };
  const countAround = (ci, cj, r, test) => {
    let c = 0;
    for (let j = cj - r; j <= cj + r; j += 2) for (let i = ci - r; i <= ci + r; i += 2) if (inb(i, j) && test(j * n + i)) c++;
    return c;
  };
  let best = null, bestS = -1e9;
  for (let t = 0; t < 900; t++) {
    const i = 8 + Math.floor(rng() * (n - 16)), j = 8 + Math.floor(rng() * (n - 16));
    if (!flatOk(i - 1, j - 1, 6, 5)) continue;
    const dc = Math.hypot(i - cx, j - cz) / n;
    const trees = Math.min(30, countAround(i, j, 14, k => res[k] === R.TREE));
    const stone = Math.min(6, countAround(i, j, 18, k => res[k] === R.STONE));
    const water = Math.min(12, countAround(i, j, 12, k => type[k] === T.WATER));
    const fish = Math.min(6, countAround(i, j, 16, k => res[k] === R.FISH));
    const meadow = Math.min(16, countAround(i, j, 12, k => type[k] === T.MEADOW || type[k] === T.GRASS));
    const s = trees * 1.0 + stone * 4 + water * 1.2 + fish * 2 + meadow * 0.8 - dc * 30 + rng() * 4;
    if (s > bestS) { bestS = s; best = { i, j }; }
  }
  if (!best) best = { i: Math.floor(cx) - 2, j: Math.floor(cz) - 1 };
  const hall = best;
  // rensa runt hallen
  for (let j = hall.j - 5; j < hall.j + 8; j++) for (let i = hall.i - 5; i < hall.i + 9; i++) {
    if (!inb(i, j)) continue; const k = j * n + i;
    if (res[k] === R.TREE || res[k] === R.BERRY) { res[k] = 0; amt[k] = 0; grow[k] = 0; }
  }
  // garantera malm inom gångavstånd från hallen (annars blir järn och vapen nästan omöjliga)
  const ORE_NEAR = 30;
  let oreNear = false;
  for (let k = 0; k < NN && !oreNear; k++) if (res[k] === R.ORE) { const i = k % n, j = (k / n) | 0; if (Math.hypot(i - hall.i, j - hall.j) < ORE_NEAR) oreNear = true; }
  if (!oreNear) {
    // helst en bergskant 12–28 rutor bort, annars ett stenkluster, annars en malmåder på öppen mark
    let bd = 1e9, bk = -1;
    for (let k = 0; k < NN; k++) {
      const i = k % n, j = (k / n) | 0; const d = Math.hypot(i - hall.i, j - hall.j);
      if (d < 12 || d > 28) continue;
      let score = d;
      if (type[k] === T.ROCK) {
        let edge = false;
        for (let dj = -2; dj <= 2 && !edge; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (inb(ii, jj) && (type[jj * n + ii] === T.GRASS || type[jj * n + ii] === T.MEADOW || type[jj * n + ii] === T.FOREST)) { edge = true; break; } }
        if (!edge) continue;
      } else if (res[k] === R.STONE) score += 6;
      else if (type[k] === T.GRASS || type[k] === T.FOREST) score += 14;
      else continue;
      if (score < bd) { bd = score; bk = k; }
    }
    if (bk >= 0) {
      const bi = bk % n, bj = (bk / n) | 0;
      let made = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = bi + di, j = bj + dj; if (!inb(i, j)) continue; const k = j * n + i;
        if (type[k] === T.WATER || type[k] === T.SAND || (made >= 3 && (di || dj))) continue;
        if (res[k] === R.TREE || res[k] === R.BERRY || res[k] === R.STONE || !res[k]) { if ((di + dj) % 2 === 0 || type[k] === T.ROCK) { res[k] = R.ORE; amt[k] = 260; grow[k] = 1; made++; } }
      }
    }
  }
  // fiendeläger (scenario)
  let camp = null;
  if (opts.camp) {
    let bs = -1;
    for (let t = 0; t < 1500; t++) {
      const i = 8 + Math.floor(rng() * (n - 16)), j = 8 + Math.floor(rng() * (n - 16));
      if (!flatOk(i - 2, j - 2, 8, 7)) continue;
      const d = Math.hypot(i - hall.i, j - hall.j);
      if (d > bs) { bs = d; camp = { i, j }; }
    }
    if (camp) for (let j = camp.j - 6; j < camp.j + 9; j++) for (let i = camp.i - 6; i < camp.i + 10; i++) {
      if (!inb(i, j)) continue; const k = j * n + i;
      if (res[k] === R.TREE || res[k] === R.BERRY) { res[k] = 0; amt[k] = 0; grow[k] = 0; }
    }
  }
  return { n, h, type, res, amt, grow, hall, camp, seed: String(seed) };
}
