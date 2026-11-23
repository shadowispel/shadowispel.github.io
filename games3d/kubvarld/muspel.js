/**
 * Muspelheim – eldvärlden. Ren modul (körs i arbetarna och på huvudtråden).
 * Stora grottsalar ur 3D-brus under ett tak av berggrund, ett lavahav (nivå 31), askesten, svartbasalt, svavelsand,
 * glödsten som hänger från taket, eldsvampar och glödrötter. Djupt nere: sällsynt urmalm.
 * Strukturer: Surts borg (fästning med broar, korridorer, torn, fällor och skattkammare) och askruiner.
 */
import { makeNoise, mulberry, hash3 } from './noise.js';
import { CX, CY, CZ, CHUNK_VOL, B, LAVA } from './blocks.js';
import { Ctx, newExtra } from './structures.js';

export const MUSPEL_LAVA = 31;
export const MUSPEL_SCALE = 8;
const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function createMuspelGen(seed0) {
  const seed = (seed0 ^ 0x6d757370) >>> 0;
  const N = makeNoise(seed), N2 = makeNoise((seed ^ 0x9e3779b9) >>> 0), N3 = makeNoise((seed * 13 + 7) >>> 0);
  /** Täthet: > 0 = fast berg */
  function density(x, y, z) {
    const n = N.n3(x / 58, y / 34, z / 58) * 0.78 + N2.n3(x / 23, y / 19, z / 23) * 0.3 + N3.n3(x / 10, y / 10, z / 10) * 0.07;
    const bias = (y < 22 ? (22 - y) / 8 : 0) + (y > 92 ? (y - 92) / 11 : 0);
    return n + bias - 0.2;
  }
  // grovt rutnät (var 4:e block) som interpoleras
  const GX = 5, GY = CY / 4 + 1;
  const grid = new Float32Array(GX * GX * GY);
  function fillGrid(cx, cz) {
    let i = 0;
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++, i++) grid[i] = density(cx * CX + gx * 4, gy * 4, cz * CZ + gz * 4);
  }
  function sample(lx, y, lz) {
    const fx = lx / 4, fy = y / 4, fz = lz / 4;
    const x0 = Math.min(GX - 2, fx | 0), y0 = Math.min(GY - 2, fy | 0), z0 = Math.min(GX - 2, fz | 0);
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    const S = GX * GX, i = (y0 * GX + z0) * GX + x0;
    const a = grid[i] + (grid[i + 1] - grid[i]) * tx, b = grid[i + GX] + (grid[i + GX + 1] - grid[i + GX]) * tx;
    const c = grid[i + S] + (grid[i + S + 1] - grid[i + S]) * tx, d = grid[i + S + GX] + (grid[i + S + GX + 1] - grid[i + S + GX]) * tx;
    const p = a + (b - a) * tz, q = c + (d - c) * tz;
    return p + (q - p) * ty;
  }

  /* ---------- strukturer ---------- */
  const FCELL = 160, RCELL = 80;
  const cache = new Map();
  const cellRng = (gx, gz, salt) => mulberry((seed ^ Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663) ^ Math.imul(salt, 83492791)) >>> 0);
  function fortress(gx, gz) {
    const id = 'f' + gx + ',' + gz;
    if (cache.has(id)) return cache.get(id);
    const r = cellRng(gx, gz, 5);
    let res = null;
    if (r() < 0.75) {
      const x = gx * FCELL + 60 + (r() * (FCELL - 120) | 0), z = gz * FCELL + 60 + (r() * (FCELL - 120) | 0);
      res = { id, kind: 'fortress', x, y: 50, z, box: [x - 58, 8, z - 58, x + 58, 72, z + 58], r: 56 };
    }
    cache.set(id, res); return res;
  }
  /** Golvnivå (fast block med luft ovanför) i en kolumn, sökt uppifrån från y0 ned till lavan */
  function floorAt(x, z, y0 = 74) {
    let prev = density(x, y0 + 1, z) > 0;
    for (let y = y0; y > MUSPEL_LAVA; y--) { const s = density(x, y, z) > 0; if (s && !prev) return y; prev = s; }
    return -1;
  }
  function ashruin(gx, gz) {
    const id = 'a' + gx + ',' + gz;
    if (cache.has(id)) return cache.get(id);
    const r = cellRng(gx, gz, 9);
    let res = null;
    if (r() < 0.5) {
      const x = gx * RCELL + 12 + (r() * (RCELL - 24) | 0), z = gz * RCELL + 12 + (r() * (RCELL - 24) | 0);
      // inte inne i en borg
      const f = fortress(Math.floor(x / FCELL), Math.floor(z / FCELL));
      if (!f || Math.hypot(f.x - x, f.z - z) > 70) {
        const y = floorAt(x, z);
        if (y > MUSPEL_LAVA + 1) res = { id, kind: 'ashruin', x, y, z, box: [x - 6, y - 4, z - 6, x + 6, y + 6, z + 6], r: 6, seed: r() * 1e9 | 0 };
      }
    }
    cache.set(id, res); return res;
  }
  function structuresAt(cx, cz) {
    if (cache.size > 1500) cache.clear();
    const x0 = cx * 16, z0 = cz * 16, x1 = x0 + 15, z1 = z0 + 15, out = [];
    const add = s => { if (s && s.box[0] <= x1 && s.box[3] >= x0 && s.box[2] <= z1 && s.box[5] >= z0) out.push(s); };
    for (const [C, fn] of [[FCELL, fortress], [RCELL, ashruin]]) {
      const a0 = Math.floor((x0 - 60) / C), a1 = Math.floor((x1 + 60) / C), b0 = Math.floor((z0 - 60) / C), b1 = Math.floor((z1 + 60) / C);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) add(fn(a, b));
    }
    return out;
  }
  function structuresNear(x, z, rad, kinds) {
    const out = [];
    for (const [C, fn] of [[FCELL, fortress], [RCELL, ashruin]]) {
      const a0 = Math.floor((x - rad) / C), a1 = Math.floor((x + rad) / C), b0 = Math.floor((z - rad) / C), b1 = Math.floor((z + rad) / C);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const s = fn(a, b); if (!s || (kinds && !kinds.includes(s.kind))) continue; const d = Math.hypot(s.x - x, s.z - z); if (d <= rad) out.push({ s, d }); }
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  }
  const sctx = new Ctx();

  /* ---------- chunk ---------- */
  function generate(cx, cz, skip = null) {
    const data = new Uint16Array(CHUNK_VOL);
    const biomes = new Uint8Array(CX * CZ);
    fillGrid(cx, cz);
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = cx * CX + lx, wz = cz * CZ + lz;
      const roofY = 121 + (hash3(seed, wx, 3, wz) * 3 | 0);
      const sulf = N3.n2(wx / 22, wz / 22);
      for (let y = 0; y < CY; y++) {
        const i = (y << 8) | (lz << 4) | lx;
        if (y === 0 || y >= roofY || (y <= 3 && hash3(seed, wx, y, wz) < 0.7 - y * 0.18)) { data[i] = B.bedrock; continue; }
        const solid = y >= 118 || sample(lx, y, lz) > 0;
        if (!solid) { data[i] = y <= MUSPEL_LAVA ? LAVA : 0; continue; }
        const bas = N2.n3(wx / 17, y / 44, wz / 17);
        data[i] = bas > 0.38 ? B.basalt : B.askesten;
      }
      // ytor: svavelsand vid lavastränder och fläckar, glödsten under taket, växter
      for (let y = CY - 2; y > MUSPEL_LAVA; y--) {
        const i = (y << 8) | (lz << 4) | lx, b = data[i], up = data[i + 256], dn = data[i - 256];
        if ((b === B.askesten || b === B.basalt) && up === 0) {
          if (y <= MUSPEL_LAVA + 4 || sulf > 0.38) data[i] = B.svavelsand;
          const r = hash3(seed, wx, y * 7 + 1, wz);
          if (data[i] === B.svavelsand && r < 0.07) data[i + 256] = B.glodrot;
          else if (data[i] === B.askesten && r < 0.025) data[i + 256] = B.eldsvamp;
        }
        if ((b === B.askesten || b === B.basalt || b === B.bedrock) && dn === 0 && y > 46) {
          const r = hash3(seed, wx, y * 3 + 5, wz);
          if (r < 0.03) { const n = 1 + (hash3(seed, wx, y, wz + 9) * 4 | 0); for (let k = 1; k <= n && data[i - 256 * k] === 0; k++) data[i - 256 * k] = B.glodsten; data[i] = B.glodsten; }
        }
      }
    }
    // malmer (egen hash per chunk)
    const r = mulberry((seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0);
    const inside = (x, y, z) => x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CY;
    const vein = (id, tries, size, ymin, ymax, prob = 1) => {
      for (let t = 0; t < tries; t++) {
        if (r() > prob) { r(); r(); r(); continue; }
        let x = r() * 16 | 0, y = ymin + (r() * (ymax - ymin) | 0), z = r() * 16 | 0;
        const n = 1 + (r() * size | 0);
        for (let k = 0; k < n; k++) {
          if (inside(x, y, z)) { const i = (y << 8) | (z << 4) | x; if (data[i] === B.askesten || data[i] === B.basalt) data[i] = id; }
          const d = r() * 6 | 0; if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    vein(B.gold_ore, 6, 6, 10, 100);
    vein(B.spark_ore, 3, 5, 8, 60);
    vein(B.urmalm, 2, 2, 8, 30, 0.6);
    vein(B.obsidian, 1, 4, 30, 34, 0.5);
    // strukturer
    let slist = structuresAt(cx, cz);
    if (skip && skip.length) slist = slist.filter(st => !skip.includes(st.id));
    let extra = null;
    if (slist.length) {
      extra = newExtra(); sctx.begin(data, cx, cz, extra);
      for (const st of slist) { if (!st.plan) st.plan = (st.kind === 'fortress' ? planFortress : planAshruin)(st, mulberry(hash3(seed, st.x, 77, st.z) * 4294967296 >>> 0), density); st.plan(sctx); }
    }
    let maxY = 0;
    for (let i = CHUNK_VOL - 1; i >= 0; i--) if (data[i] !== 0) { maxY = i >> 8; break; }
    return { data, biomes, maxY, extra };
  }
  return { generate, structuresAt, structuresNear, density, floorAt };
}

/* ---------- Surts borg ---------- */
function planFortress(s, rng, density) {
  const X = s.x, Z = s.z, Y = s.y;
  const arms = [0, 1, 2, 3].map(d => ({ d, len: 24 + (rng() * 16 | 0), covered: rng() < 0.5, traps: [], seed: rng() * 1e9 | 0 }));
  if (!arms.some(a => a.covered)) arms[1].covered = true;
  if (arms.every(a => a.covered)) arms[0].covered = false;
  for (const a of arms) if (a.covered) for (let t = 6; t < a.len - 3; t += 7 + (rng() * 4 | 0)) a.traps.push(t);
  const BR = B.basalt_bricks;
  /** Pelare ned till fast mark eller lavan */
  const pillar = (ctx, x0, z0, x1, z1, yTop) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!ctx.inside(x, z)) continue;
      for (let y = yTop; y > 8; y--) { const c = ctx.get(x, y, z); if (c !== 0 && c !== LAVA && c !== B.glodsten && c !== B.eldsvamp && c !== B.glodrot && y < yTop - 1) break; ctx.set(x, y, z, BR); }
    }
  };
  return ctx => {
    // pelare under huvudborgen
    for (const [a, b] of [[-11, -11], [9, -11], [-11, 9], [9, 9], [-1, -11], [-1, 9], [-11, -1], [9, -1]]) pillar(ctx, X + a, Z + b, X + a + 2, Z + b + 2, Y - 8);
    // huvudborgen: 23×23, golv Y, väggar till Y+12
    ctx.fill(X - 11, Y - 8, Z - 11, X + 11, Y, Z + 11, BR);
    ctx.fill(X - 11, Y + 1, Z - 11, X + 11, Y + 12, Z + 11, BR);
    ctx.fill(X - 10, Y + 1, Z - 10, X + 10, Y + 11, Z + 10, 0);
    // tinnar
    for (let k = -11; k <= 11; k += 2) for (const [a, b] of [[k, -11], [k, 11], [-11, k], [11, k]]) ctx.set(X + a, Y + 13, Z + b, BR);
    // pelare, fönster och glödstensljuskronor i hallen
    for (const [a, b] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { ctx.fill(X + a, Y + 1, Z + b, X + a, Y + 11, Z + b, B.basalt); ctx.set(X + a, Y + 4, Z + b + 1, B.glodsten); }
    for (const [a, b] of [[0, 0], [-5, 0], [5, 0], [0, -5], [0, 5]]) { ctx.set(X + a, Y + 11, Z + b, B.glodsten); ctx.set(X + a, Y + 10, Z + b, B.glodsten); }
    for (let k = -8; k <= 8; k += 4) for (const [a, b] of [[k, -11], [k, 11], [-11, k], [11, k]]) if (k !== 0) { ctx.set(X + a, Y + 6, Z + b, 0); ctx.set(X + a, Y + 7, Z + b, 0); }
    // lavabassänger i hallen
    for (const [a, b] of [[-8, -8], [8, 8]]) { ctx.fill(X + a - 1, Y, Z + b - 1, X + a + 1, Y + 1, Z + b + 1, BR); ctx.set(X + a, Y + 1, Z + b, LAVA); }
    ctx.loot(X - 9, Y + 1, Z + 9, 'fortress'); ctx.loot(X + 9, Y + 1, Z - 9, 'fortress');
    // väktaren (eldjätten) vaktar hallen
    ctx.ent('eldjatte', X + 0.5, Y + 1, Z + 0.5, { key: s.id });
    // skattkammaren under hallen
    ctx.fill(X - 6, Y - 7, Z - 6, X + 6, Y - 1, Z + 6, BR);
    ctx.fill(X - 5, Y - 6, Z - 5, X + 5, Y - 2, Z + 5, 0);
    for (const [a, b] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) ctx.set(X + a, Y - 2, Z + b, B.glodsten);
    for (const [a, b] of [[-4, 0], [0, 4], [0, -4]]) ctx.loot(X + a, Y - 6, Z + b, 'treasure');
    ctx.set(X - 4, Y - 6, Z - 4, B.gold_block); ctx.set(X - 4, Y - 6, Z + 4, B.gold_block); ctx.set(X + 4, Y - 6, Z - 4, B.gold_block);
    ctx.set(X, Y - 6, Z, B.glodsten);
    // nedgång: stege i ett hål i hallgolvet
    for (let y = Y - 6; y <= Y; y++) { ctx.set(X + 5, y, Z + 2, B.ladder_0); ctx.set(X + 6, y, Z + 2, BR); }
    ctx.set(X + 5, Y + 1, Z + 1, B.glodsten); ctx.set(X + 5, Y + 1, Z + 3, B.glodsten);
    // broar och korridorer
    for (const a of arms) {
      const [ax, az] = D4[a.d], px = -az, pz = ax;
      const at = (t, o) => [X + ax * (12 + t) + px * o, Z + az * (12 + t) + pz * o];
      // port i borgväggen
      for (let o = -1; o <= 1; o++) { const x = X + ax * 11 + px * o, z = Z + az * 11 + pz * o; ctx.fill(x, Y + 1, z, x, Y + 4, z, 0); }
      const r = mulberry(a.seed);
      for (let t = 0; t <= a.len; t++) {
        for (let o = -2; o <= 2; o++) {
          const [x, z] = at(t, o);
          if (!ctx.inside(x, z)) continue;
          ctx.set(x, Y, z, BR); ctx.set(x, Y - 1, z, Math.abs(o) < 2 && t % 8 !== 4 ? 0 : BR);
          for (let y = Y + 1; y <= Y + 5; y++) ctx.set(x, y, z, 0);
          if (Math.abs(o) === 2) {
            if (a.covered) { for (let y = Y + 1; y <= Y + 4; y++) ctx.set(x, y, z, (t % 4 === 2 && y === Y + 2) ? 0 : BR); }
            else { ctx.set(x, Y + 1, z, BR); if (t % 8 === 0) { ctx.set(x, Y + 2, z, BR); ctx.set(x, Y + 3, z, B.glodsten); } }
          }
          if (a.covered) { ctx.set(x, Y + 5, z, Math.abs(o) < 2 && t % 6 === 3 && o === 0 ? B.glodsten : BR); }
        }
        // valvbågar under bron
        if (t % 8 === 4) { const [x0, z0] = at(t, -2), [x1, z1] = at(t, 2); pillar(ctx, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), Y - 1); }
      }
      // fällor: tryckplatta över en eldsprutare
      for (const t of a.traps) { const [x, z] = at(t, 0); ctx.set(x, Y, z, B.spout); ctx.set(x, Y + 1, z, B.plate_stone); ctx.circ(x, Y + 1, z); for (const o of [-1, 1]) { const [qx, qz] = at(t, o); ctx.set(qx, Y, qz, B.spout); } }
      // vakttorn vid brons ände
      const [tx, tz] = at(a.len + 4, 0);
      pillar(ctx, tx - 3, tz - 3, tx + 3, tz + 3, Y - 1);
      ctx.fill(tx - 3, Y, tz - 3, tx + 3, Y + 14, tz + 3, BR);
      ctx.fill(tx - 2, Y + 1, tz - 2, tx + 2, Y + 13, tz + 2, 0);
      ctx.fill(tx - 2, Y + 7, tz - 2, tx + 2, Y + 7, tz + 2, BR);
      for (let o = -1; o <= 1; o++) { const x = tx - ax * 3 + px * o, z = tz - az * 3 + pz * o; ctx.fill(x, Y + 1, z, x, Y + 3, z, 0); }
      const lad = px > 0 ? B.ladder_0 : px < 0 ? B.ladder_1 : pz > 0 ? B.ladder_2 : B.ladder_3;
      for (let y = Y + 1; y <= Y + 7; y++) ctx.set(tx + px * 2, y, tz + pz * 2, lad);
      for (const [qa, qb] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { ctx.set(tx + qa, Y + 15, tz + qb, BR); ctx.set(tx + qa, Y + 16, tz + qb, B.glodsten); }
      ctx.set(tx, Y + 14, tz, B.glodsten);
      ctx.set(tx - px, Y + 1, tz - pz, B.glodsten);
      if (r() < 0.7) ctx.loot(tx - px * 2 + ax, Y + 8, tz - pz * 2 + az, 'fortress');
      ctx.ent('askvandrare', tx + 0.5, Y + 1, tz + 0.5, { n: 3 });
    }
  };
}
function planAshruin(s, rng) {
  const holes = []; for (let k = 0; k < 120; k++) holes.push(rng());
  return ctx => {
    let hi = 0;
    const { x, y, z } = s;
    ctx.fill(x - 3, y - 3, z - 3, x + 3, y, z + 3, B.basalt);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const edge = Math.abs(a) === 3 || Math.abs(b) === 3;
      for (let h = 1; h <= 4; h++) {
        const r = holes[hi++ % holes.length];
        ctx.set(x + a, y + h, z + b, edge && r > 0.15 + h * 0.2 ? (r > 0.7 ? B.basalt : B.basalt_bricks) : 0);
      }
      ctx.set(x + a, y, z + b, (a + b) % 2 ? B.basalt_bricks : B.svavelsand);
    }
    ctx.set(x - 2, y + 1, z + 2, B.glodsten); ctx.set(x + 2, y + 1, z - 2, B.eldsvamp);
    ctx.loot(x, y + 1, z, 'ashruin');
  };
}
