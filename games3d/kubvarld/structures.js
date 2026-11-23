/**
 * Strukturer i den vanliga världen: byar, övergivna gruvgångar, fornlämningar (domarring), ökentempel, skeppsvrak,
 * vakttornsruiner, stugor och förfallna eldportar. Ren modul (ingen three) – körs i arbetarna och på huvudtråden.
 *
 * Deterministiskt: varje struktur bestäms av frö + rutnätscell (samma frö → samma strukturer på alla datorer).
 * Strukturer byggs per chunk med en klippande byggkontext: varje chunk som en struktur överlappar kör samma
 * byggplan och skriver bara sina egna block, så inget blir avskuret vid chunkgränser.
 */
import { mulberry, hash3 } from './noise.js';
import { B, I, CY, SEA, DOOR0, BED0, STAIR0, TRAP0, isWater, SURT_TOOL0, TOOL0, ARMOR0 } from './blocks.js';
import { BI } from './worldgen.js';

/* ---------- byggkontext (klipper till en chunk) ---------- */
export class Ctx {
  begin(data, cx, cz, extra) { this.data = data; this.ox = cx * 16; this.oz = cz * 16; this.extra = extra; return this; }
  inside(x, z) { const lx = x - this.ox, lz = z - this.oz; return lx >= 0 && lx < 16 && lz >= 0 && lz < 16; }
  set(x, y, z, id) {
    const lx = x - this.ox, lz = z - this.oz;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= CY) return;
    this.data[(y << 8) | (lz << 4) | lx] = id;
  }
  get(x, y, z) { const lx = x - this.ox, lz = z - this.oz; if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= CY) return -1; return this.data[(y << 8) | (lz << 4) | lx]; }
  /** Fyll låda (inklusive gränser). keep(cur) → true = rör inte blocket */
  fill(x0, y0, z0, x1, y1, z1, id, keep) {
    const ax = Math.max(Math.min(x0, x1), this.ox), bx = Math.min(Math.max(x0, x1), this.ox + 15);
    const az = Math.max(Math.min(z0, z1), this.oz), bz = Math.min(Math.max(z0, z1), this.oz + 15);
    const ay = Math.max(1, Math.min(y0, y1)), by = Math.min(CY - 1, Math.max(y0, y1));
    if (ax > bx || az > bz || ay > by) return;
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const i = (y << 8) | ((z - this.oz) << 4) | (x - this.ox);
      if (keep && keep(this.data[i])) continue;
      this.data[i] = id;
    }
  }
  /** Kista med seedat byte (innehållet slumpas när den öppnas första gången) */
  loot(x, y, z, table, o = 0) { if (!this.inside(x, z) || y < 1 || y >= CY) return; this.set(x, y, z, B.chest); this.extra.loot.push([x, y, z, table, o]); }
  ent(type, x, y, z, o) { if (this.inside(Math.floor(x), Math.floor(z))) this.extra.ents.push([type, x, y, z, o || null]); }
  circ(x, y, z) { if (this.inside(x, z)) this.extra.circ.push([x, y, z]); }
}
export const newExtra = () => ({ loot: [], ents: [], circ: [] });
const keepBedrock = c => c === B.bedrock;

/* ---------- riktningar ---------- */
// DIR4 i spelet: 0 −z, 1 +x, 2 +z, 3 −x (samma som dörrarnas/trappornas/sängarnas f)
const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const dirIdx = (dx, dz) => D4.findIndex(d => d[0] === dx && d[1] === dz);
/** Lokal ram: u längs (ax,az), v inåt (nx,nz). Returnerar hjälpare som översätter lokala koordinater. */
function frame(ox, oy, oz, ax, az, nx, nz) {
  const f = {
    X: (u, v) => ox + ax * u + nx * v, Z: (u, v) => oz + az * u + nz * v, y: oy,
    fIn: dirIdx(nx, nz), fOut: dirIdx(-nx, -nz), fU: dirIdx(ax, az), fUneg: dirIdx(-ax, -az),
    paneAlongU: az === 0 ? B.glass_pane : B.glass_pane_1
  };
  return f;
}
function put(ctx, F, u, y, v, id) { ctx.set(F.X(u, v), F.y + y, F.Z(u, v), id); }
function box(ctx, F, u0, y0, v0, u1, y1, v1, id, keep) {
  const xa = F.X(u0, v0), xb = F.X(u1, v1), za = F.Z(u0, v0), zb = F.Z(u1, v1);
  ctx.fill(xa, F.y + y0, za, xb, F.y + y1, zb, id, keep);
}

/* ---------- material per bystil ---------- */
const STYLES = {
  meadow: { wall: B.terracotta, corner: B.birch_log, floor: B.oak_planks, roof: STAIR0 + 8, roofFull: B.stone_bricks, path: B.gravel, found: B.cobble, trim: B.birch_planks, fence: B.fence },
  desert: { wall: B.sandstone, corner: B.smooth_stone, floor: B.sandstone, roof: STAIR0 + 12, roofFull: B.sandstone, path: B.sandstone, found: B.sandstone, trim: B.terracotta, flat: true, fence: B.fence },
  snow: { wall: B.spruce_planks, corner: B.spruce_log, floor: B.spruce_planks, roof: STAIR0 + 4, roofFull: B.spruce_planks, path: B.cobble, found: B.cobble, trim: B.packed_ice, ridge: B.snow, fence: B.fence }
};

/* ---------- placering ---------- */
const VCELL = 320, SCELL = 176, MCELL = 224;
const cellRng = (seed, gx, gz, salt) => mulberry((seed ^ Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663) ^ Math.imul(salt, 83492791)) >>> 0);

export function createStructures(seed, column) {
  const cache = new Map();
  const H = (x, z) => column(x, z).h;
  const colInfo = (x, z) => { const c = column(x, z); return { h: c.h, biome: c.biome, snow: c.snow, t: c.t, river: c.river, mtn: c.mtn }; };

  function village(gx, gz) {
    const id = 'v' + gx + ',' + gz;
    if (cache.has(id)) return cache.get(id);
    const r = cellRng(seed, gx, gz, 11);
    let res = null;
    if (r() < 0.8) {
      const x = gx * VCELL + 48 + (r() * (VCELL - 96) | 0), z = gz * VCELL + 48 + (r() * (VCELL - 96) | 0);
      const c = colInfo(x, z);
      const okB = [BI.ang, BI.oken, BI.tall, BI.bjork, BI.fjall, BI.gran].includes(c.biome);
      if (okB && c.h > SEA + 1 && c.h < SEA + 34 && c.river < 0.05) {
        let ok = true;
        for (let k = 0; k < 12 && ok; k++) {
          const a = k / 12 * Math.PI * 2, rr = k % 2 ? 18 : 32;
          const h = H(x + Math.round(Math.cos(a) * rr), z + Math.round(Math.sin(a) * rr));
          if (Math.abs(h - c.h) > 6 || h <= SEA) ok = false;
        }
        if (ok) {
          const style = c.biome === BI.oken ? 'desert' : (c.biome === BI.fjall || c.h > c.snow - 8 || c.t < -0.3) ? 'snow' : 'meadow';
          res = { id, kind: 'village', x, y: c.h, z, style, box: [x - 46, c.h - 12, z - 46, x + 46, c.h + 16, z + 46], clear: [x - 44, z - 44, x + 44, z + 44], r: 40 };
        }
      }
    }
    cache.set(id, res);
    return res;
  }
  function small(gx, gz) {
    const id = 's' + gx + ',' + gz;
    if (cache.has(id)) return cache.get(id);
    const r = cellRng(seed, gx, gz, 23);
    let res = null;
    const x = gx * SCELL + 24 + (r() * (SCELL - 48) | 0), z = gz * SCELL + 24 + (r() * (SCELL - 48) | 0);
    // inga småstrukturer mitt i byar
    const vgx = Math.floor(x / VCELL), vgz = Math.floor(z / VCELL);
    let nearV = false;
    for (let a = -1; a <= 1 && !nearV; a++) for (let b = -1; b <= 1; b++) { const v = village(vgx + a, vgz + b); if (v && Math.hypot(v.x - x, v.z - z) < 90) { nearV = true; break; } }
    if (!nearV) {
      const c = colInfo(x, z), p = r();
      let kind = null;
      const bio = c.biome;
      if (bio === BI.oken) kind = p < 0.7 ? 'temple' : p < 0.85 ? 'portal' : null;
      else if (bio === BI.strand || bio === BI.sjo) kind = (c.h < SEA - 1 && c.h > SEA - 9) ? (p < 0.8 ? 'wreck' : null) : p < 0.15 ? 'portal' : null;
      else if (bio === BI.gran || bio === BI.bjork || bio === BI.tall) kind = p < 0.38 ? 'ruin' : p < 0.68 ? 'cabin' : p < 0.8 ? 'portal' : p < 0.93 ? 'tower' : null;
      else if (bio === BI.ang) kind = p < 0.32 ? 'tower' : p < 0.6 ? 'ruin' : p < 0.76 ? 'portal' : p < 0.86 ? 'cabin' : null;
      else if (bio === BI.fjall) kind = c.h < SEA + 60 ? (p < 0.4 ? 'tower' : p < 0.6 ? 'portal' : null) : null;
      else if (bio === BI.myr) kind = p < 0.35 ? 'ruin' : p < 0.5 ? 'portal' : null;
      if (kind && kind !== 'wreck' && (c.h <= SEA || c.river > 0.1)) kind = null;
      if (kind) {
        const R = { temple: 12, wreck: 10, ruin: 18, cabin: 8, tower: 6, portal: 7 }[kind];
        const y = kind === 'wreck' ? SEA : c.h;
        res = { id, kind, x, y, z, box: [x - R, y - 14, z - R, x + R, y + 18, z + R], clear: [x - R + 1, z - R + 1, x + R - 1, z + R - 1], r: R, rot: r() * 4 | 0 };
      }
    }
    cache.set(id, res);
    return res;
  }
  function mine(gx, gz) {
    const id = 'm' + gx + ',' + gz;
    if (cache.has(id)) return cache.get(id);
    const r = cellRng(seed, gx, gz, 37);
    let res = null;
    if (r() < 0.65) {
      const x = gx * MCELL + 50 + (r() * (MCELL - 100) | 0), z = gz * MCELL + 50 + (r() * (MCELL - 100) | 0);
      const y = 18 + (r() * 16 | 0);
      const h = H(x + 3, z + 3);
      if (h > y + 10 && h > SEA - 6) res = { id, kind: 'mine', x, y, z, surf: h, box: [x - 48, y - 2, z - 48, x + 48, Math.max(h + 6, y + 6), z + 48], clear: [x + 1, z + 1, x + 5, z + 5], r: 46 };
    }
    cache.set(id, res);
    return res;
  }
  function trim() { if (cache.size > 2000) cache.clear(); }

  /** Alla strukturer vars låda överlappar chunken (cx,cz) */
  function structuresAt(cx, cz) {
    trim();
    const x0 = cx * 16, z0 = cz * 16, x1 = x0 + 15, z1 = z0 + 15, out = [];
    const add = s => { if (s && s.box[0] <= x1 && s.box[3] >= x0 && s.box[2] <= z1 && s.box[5] >= z0) out.push(s); };
    for (const [C, fn] of [[VCELL, village], [SCELL, small], [MCELL, mine]]) {
      const a0 = Math.floor((x0 - 60) / C), a1 = Math.floor((x1 + 60) / C), b0 = Math.floor((z0 - 60) / C), b1 = Math.floor((z1 + 60) / C);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) add(fn(a, b));
    }
    return out;
  }
  /** Strukturer nära (x,z) inom radien rad, valfritt filtrerat på sorter */
  function near(x, z, rad, kinds) {
    const out = [];
    for (const [C, fn] of [[VCELL, village], [SCELL, small], [MCELL, mine]]) {
      const a0 = Math.floor((x - rad) / C), a1 = Math.floor((x + rad) / C), b0 = Math.floor((z - rad) / C), b1 = Math.floor((z + rad) / C);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
        const s = fn(a, b); if (!s || (kinds && !kinds.includes(s.kind))) continue;
        const d = Math.hypot(s.x - x, s.z - z); if (d <= rad) out.push({ s, d });
      }
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  }
  /** Bygg strukturerna i listan i chunkens data */
  function build(ctx, list) {
    for (const s of list) {
      if (!s.plan) s.plan = PLAN[s.kind](s, mulberry(hash3(seed, s.x, 991, s.z) * 4294967296 >>> 0), H, colInfo, seed);
      s.plan(ctx);
    }
  }
  /** Ska ett träd i (x,z) hoppas över? */
  function noTree(list, x, z) { for (const s of list) { const c = s.clear; if (c && x >= c[0] - 2 && x <= c[2] + 2 && z >= c[1] - 2 && z <= c[3] + 2) return true; } return false; }
  return { structuresAt, near, build, noTree };
}

/* =====================================================================
 * Byggplaner. Varje plan(s, rng, H, colInfo) returnerar en funktion (ctx) => void som bygger hela strukturen
 * (klippt till ctx:s chunk). All slump dras när planen skapas så att resultatet blir samma i varje chunk.
 * ===================================================================== */
const PLAN = {};

/* ---------- gemensamma byggdelar ---------- */
/** Grund under och fri luft över en rektangel (lokala koordinater i ramen F) */
function groundwork(ctx, F, H, u0, v0, u1, v1, found, clearH = 9, foundGrass = false) {
  for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
    const x = F.X(u, v), z = F.Z(u, v);
    if (!ctx.inside(x, z)) continue;
    const h = H(x, z);
    for (let y = Math.min(h, F.y - 1) - 2; y < F.y; y++) ctx.set(x, y, z, y === F.y - 1 && foundGrass ? B.dirt : found);
    for (let y = F.y + 1; y <= Math.max(h, F.y + clearH) + 3; y++) ctx.set(x, y, z, 0);
  }
}
/** Hus med sadeltak. w × d (yttermått), väggar höga wh. Dörr mitt på framsidan (v = 0). */
function house(ctx, F, H, S, w, d, wh, rng, opts = {}) {
  groundwork(ctx, F, H, -1, -1, w, d, S.found, wh + Math.ceil(d / 2) + 3);
  box(ctx, F, 0, 0, 0, w - 1, 0, d - 1, S.floor);
  // väggar och hörn
  for (let y = 1; y <= wh; y++) for (let v = 0; v < d; v++) for (let u = 0; u < w; u++) {
    const edgeU = u === 0 || u === w - 1, edgeV = v === 0 || v === d - 1;
    if (!edgeU && !edgeV) { put(ctx, F, u, y, v, 0); continue; }
    put(ctx, F, u, y, v, edgeU && edgeV ? S.corner : S.wall);
  }
  // fönster
  const winY = 2;
  for (let u = 2; u < w - 2; u += 2) if (u !== (w >> 1)) put(ctx, F, u, winY, 0, F.paneAlongU);
  for (let u = 2; u < w - 2; u += 3) put(ctx, F, u, winY, d - 1, F.paneAlongU);
  const paneV = F.paneAlongU === B.glass_pane ? B.glass_pane_1 : B.glass_pane;
  for (let v = 2; v < d - 2; v += 2) { put(ctx, F, 0, winY, v, paneV); put(ctx, F, w - 1, winY, v, paneV); }
  // dörr
  const du = w >> 1;
  put(ctx, F, du, 1, 0, DOOR0 + F.fIn); put(ctx, F, du, 2, 0, DOOR0 + 8 + F.fIn);
  put(ctx, F, du, 0, -1, S.trim === B.packed_ice ? S.found : S.trim);
  // tak
  if (S.flat) {
    box(ctx, F, -1, wh + 1, -1, w, wh + 1, d, B.sandstone_slab);
    box(ctx, F, 0, wh + 1, 0, w - 1, wh + 1, d - 1, S.roofFull);
    for (let u = 0; u < w; u += 2) { put(ctx, F, u, wh + 2, 0, B.sandstone_slab); put(ctx, F, u, wh + 2, d - 1, B.sandstone_slab); }
  } else {
    for (let k = 0; ; k++) {
      const vf = k - 1, vb = d - k, y = wh + 1 + k;
      if (vf > vb) break;
      for (let u = -1; u <= w; u++) {
        if (vf === vb) put(ctx, F, u, y, vf, S.ridge || S.roofFull);
        else { put(ctx, F, u, y, vf, S.roof + F.fIn); put(ctx, F, u, y, vb, S.roof + F.fOut); }
      }
      // gavlar
      for (let v = vf + 1; v < vb; v++) { put(ctx, F, 0, y, v, S.wall); put(ctx, F, w - 1, y, v, S.wall); for (let u = 1; u < w - 1; u++) put(ctx, F, u, y, v, 0); }
      if (vf + 1 === vb) break;
    }
  }
  // inredning: lykta i taket
  put(ctx, F, w >> 1, 1, d - 2, opts.noLamp ? 0 : B.lantern);
}

/* ---------- by ---------- */
const BUILD_QUEUE = ['smithy', 'farm', 'house:bonde', 'library', 'house:kartograf', 'house:fiskare', 'farm', 'house:bonde', 'house:smed', 'house:fiskare', 'farm', 'house:bibliotekarie', 'house:bonde', 'house:kartograf'];
PLAN.village = (s, rng, H) => {
  const S = STYLES[s.style];
  const cx = s.x, cz = s.z, y0 = H(cx, cz);
  const roads = [];
  const dirs = [0, 1, 2, 3].filter(() => rng() < 0.85);
  if (dirs.length < 2) dirs.splice(0, dirs.length, 0, 2);
  for (const d of dirs) roads.push({ d, len: 18 + (rng() * 18 | 0) });
  // tomter längs vägarna
  const plots = [];
  let q = 0;
  // upptagna rektanglar [x0,z0,x1,z1]: torget och vägarna
  const used = [[cx - 4, cz - 4, cx + 4, cz + 4]];
  for (const rd of roads) { const [ax, az] = D4[rd.d]; const ex = cx + ax * rd.len, ez = cz + az * rd.len; used.push([Math.min(cx, ex) - 1, Math.min(cz, ez) - 1, Math.max(cx, ex) + 1, Math.max(cz, ez) + 1]); }
  const hits = (a) => used.some(b => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]);
  for (const rd of roads) {
    const [ax, az] = D4[rd.d];
    for (let t = 7; t < rd.len - 3; t += 10 + (rng() * 3 | 0)) for (const side of [1, -1]) {
      if (rng() < 0.12) continue;
      const kind = BUILD_QUEUE[q % BUILD_QUEUE.length];
      const nx = -az * side, nz = ax * side;
      const W = kind === 'farm' ? 9 : kind === 'smithy' || kind === 'library' ? 9 : 7;
      const Dd = kind === 'farm' ? 9 : kind === 'library' ? 8 : 7;
      // framkant: 3 block från vägens mitt
      const fx = cx + ax * t + nx * 3, fz = cz + az * t + nz * 3;
      const ox = fx - ax * (W >> 1), oz = fz - az * (W >> 1);
      const ex = ox + ax * (W - 1) + nx * (Dd - 1), ez = oz + az * (W - 1) + nz * (Dd - 1);
      const rect = [Math.min(ox, ex) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oz, ez) + 1];
      if (hits(rect)) continue;
      used.push(rect); q++;
      const hy = H(fx + nx * (Dd >> 1), fz + nz * (Dd >> 1));
      plots.push({ kind, F: frame(ox, Math.max(SEA + 1, Math.round((hy + H(fx, fz)) / 2)), oz, ax, az, nx, nz), W, D: Dd, seed: rng() * 1e9 | 0 });
    }
  }
  // lyktstolpar vid vägarna
  const lamps = [];
  for (const rd of roads) { const [ax, az] = D4[rd.d]; for (let t = 5; t < rd.len; t += 12) lamps.push([cx + ax * t - az * 2, cz + az * t + ax * 2]); }
  const box0 = [cx - 46, cz - 46, cx + 46, cz + 46];
  return ctx => {
    // vägar
    for (const rd of roads) {
      const [ax, az] = D4[rd.d];
      for (let t = 0; t <= rd.len; t++) for (let o = -1; o <= 1; o++) {
        const x = cx + ax * t - az * o, z = cz + az * t + ax * o;
        if (!ctx.inside(x, z)) continue;
        let h = H(x, z);
        if (h < SEA) { ctx.set(x, SEA, z, B.oak_planks); for (let y = SEA + 1; y < SEA + 4; y++) ctx.set(x, y, z, 0); continue; }
        ctx.set(x, h, z, S.path); ctx.set(x, h - 1, z, S.found);
        for (let y = h + 1; y < h + 4; y++) ctx.set(x, y, z, 0);
      }
    }
    // brunn (torg)
    {
      groundwork(ctx, frame(cx - 3, y0, cz - 3, 1, 0, 0, 1), H, -1, -1, 7, 7, S.found, 6);
      ctx.fill(cx - 3, y0, cz - 3, cx + 3, y0, cz + 3, S.path);
      ctx.fill(cx - 2, y0 - 4, cz - 2, cx + 2, y0 + 1, cz + 2, S.found);
      ctx.fill(cx - 1, y0 - 3, cz - 1, cx + 1, y0, cz + 1, B.water);
      ctx.fill(cx - 1, y0 + 1, cz - 1, cx + 1, y0 + 3, cz + 1, 0);
      for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) ctx.fill(cx + a, y0 + 2, cz + b, cx + a, y0 + 3, cz + b, S.fence);
      ctx.fill(cx - 2, y0 + 4, cz - 2, cx + 2, y0 + 4, cz + 2, s.style === 'desert' ? B.sandstone_slab : B.cobble_slab);
      ctx.set(cx, y0 + 3, cz, B.lantern);
    }
    for (const [x, z] of lamps) {
      if (!ctx.inside(x, z)) continue;
      const h = H(x, z); if (h < SEA) continue;
      ctx.fill(x, h + 1, z, x, h + 3, z, S.fence); ctx.set(x, h + 4, z, B.lantern);
    }
    for (const p of plots) {
      const F = p.F;
      // hoppa över tomter som inte rör chunken
      const xs = [F.X(-2, -2), F.X(p.W + 1, p.D + 1)], zs = [F.Z(-2, -2), F.Z(p.W + 1, p.D + 1)];
      if (Math.max(...xs) < ctx.ox || Math.min(...xs) > ctx.ox + 15 || Math.max(...zs) < ctx.oz || Math.min(...zs) > ctx.oz + 15) continue;
      const r = mulberry(p.seed);
      const [kind, prof] = p.kind.split(':');
      if (kind === 'farm') buildFarm(ctx, F, H, S, p.W, p.D, r, cx, cz);
      else if (kind === 'smithy') buildSmithy(ctx, F, H, S, p.W, p.D, r, cx, cz);
      else if (kind === 'library') buildLibrary(ctx, F, H, S, p.W, p.D, r, cx, cz);
      else buildHome(ctx, F, H, S, p.W, p.D, r, prof, cx, cz);
    }
  };
};
function villager(ctx, F, prof, hu, hv, cx, cz) {
  // föds utanför dörren, hemmet är inne i huset
  const du = F.X(hu, -2), dz = F.Z(hu, -2);
  ctx.ent('villager', du + 0.5, F.y + 1, dz + 0.5, { prof, home: [F.X(hu, hv) + 0.5, F.y + 1, F.Z(hu, hv) + 0.5], c: [cx, cz] });
}
function buildHome(ctx, F, H, S, W, D, r, prof, cx, cz) {
  house(ctx, F, H, S, W, D, 3, r);
  // inredning
  put(ctx, F, 1, 1, D - 2, BED0 + F.fOut); put(ctx, F, 1, 1, D - 3, BED0 + 4 + F.fOut);
  put(ctx, F, W - 2, 1, D - 2, r() < 0.5 ? B.workbench : B.barrel);
  put(ctx, F, W - 2, 1, 1, B.flowerpot);
  if (r() < 0.45) ctx.loot(F.X(W - 2, D - 3), F.y + 1, F.Z(W - 2, D - 3), 'house');
  put(ctx, F, 2, 1, 2, [B.carpet_red, B.carpet_blue, B.carpet_yellow][r() * 3 | 0]);
  if (prof === 'kartograf') put(ctx, F, W - 2, 1, 2, B.bookshelf);
  if (prof === 'fiskare') put(ctx, F, 1, 1, 1, B.barrel);
  villager(ctx, F, prof, W >> 1, D >> 1, cx, cz);
}
function buildLibrary(ctx, F, H, S, W, D, r, cx, cz) {
  house(ctx, F, H, S, W, D, 4, r);
  for (let v = 1; v < D - 1; v++) for (const u of [1, W - 2]) for (let y = 1; y <= 2; y++) if (v !== (D >> 1)) put(ctx, F, u, y, v, B.bookshelf);
  for (let u = 2; u < W - 2; u++) put(ctx, F, u, 1, D - 2, B.bookshelf);
  put(ctx, F, W >> 1, 1, D - 3, B.fence); put(ctx, F, W >> 1, 2, D - 3, B.candle);
  for (let u = 2; u < W - 2; u++) for (let v = 1; v < D - 3; v++) put(ctx, F, u, 1, v, (u + v) % 2 ? B.carpet_red : B.carpet_yellow);
  ctx.loot(F.X(W - 3, D - 3), F.y + 1, F.Z(W - 3, D - 3), 'library');
  villager(ctx, F, 'bibliotekarie', W >> 1, D >> 1, cx, cz);
}
function buildSmithy(ctx, F, H, S, W, D, r, cx, cz) {
  house(ctx, F, H, S, W, D, 4, r, { noLamp: true });
  // öppen sida mot vägen: ta bort halva framväggen och gör en ässja
  for (let u = 1; u <= 3; u++) for (let y = 1; y <= 3; y++) put(ctx, F, u, y, 0, 0);
  put(ctx, F, 0, 1, 0, S.corner); put(ctx, F, 0, 2, 0, S.corner); put(ctx, F, 0, 3, 0, S.corner);
  // ässja med lava i ett stenkar
  box(ctx, F, 1, 1, D - 3, 3, 1, D - 2, B.cobble);
  put(ctx, F, 2, 1, D - 2, B.lava);
  box(ctx, F, 1, 2, D - 2, 3, 4, D - 2, B.cobble); put(ctx, F, 2, 2, D - 2, 0);
  put(ctx, F, 1, 1, 2, B.anvil);
  put(ctx, F, 4, 1, D - 2, B.furnace); put(ctx, F, 5, 1, D - 2, B.furnace);
  put(ctx, F, W - 2, 1, D - 2, B.smithing);
  put(ctx, F, W - 2, 1, 1, B.lantern);
  ctx.loot(F.X(W - 2, D - 3), F.y + 1, F.Z(W - 2, D - 3), 'smithy');
  villager(ctx, F, 'smed', W - 3, D >> 1, cx, cz);
}
function buildFarm(ctx, F, H, S, W, D, r, cx, cz) {
  groundwork(ctx, F, H, -1, -1, W, D, B.dirt, 4, true);
  const crop = [[B.wheat_3, B.wheat_2], [B.carrot_2, B.carrot_1], [B.potato_2, B.potato_1]];
  const mid = W >> 1;
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    const edge = u === 0 || u === W - 1 || v === 0 || v === D - 1;
    if (edge) { put(ctx, F, u, 0, v, B.oak_log); put(ctx, F, u, 1, v, 0); continue; }
    if (u === mid) { put(ctx, F, u, 0, v, B.water); put(ctx, F, u, 1, v, 0); continue; }
    put(ctx, F, u, 0, v, B.farmland);
    const c = crop[(u < mid ? 0 : 1) + (v > D / 2 ? 1 : 0)] || crop[0];
    put(ctx, F, u, 1, v, c[r() < 0.7 ? 0 : 1]);
  }
  put(ctx, F, -1, 1, 1, B.hay); put(ctx, F, -1, 1, 2, B.hay); put(ctx, F, -1, 2, 1, B.hay);
  put(ctx, F, W, 1, D - 2, B.workbench);
}

/* ---------- övergiven gruvgång ---------- */
PLAN.mine = (s, rng, H) => {
  const segs = [];
  const room = { x: s.x, y: s.y, z: s.z };
  const grow = (x, z, d, depth) => {
    if (depth > 3 || segs.length > 16) return;
    let len = 12 + (rng() * 20 | 0);
    const [ax, az] = D4[d];
    // håll gångarna inom strukturens låda
    while (len > 4 && (Math.abs(x + ax * len - s.x) > 44 || Math.abs(z + az * len - s.z) > 44)) len--;
    if (len <= 4) return;
    const seg = { x, z, d, len, y: s.y, sup: rng() * 4 | 0, chest: rng() < 0.4 ? 3 + (rng() * (len - 6) | 0) : -1, side: rng() < 0.5 ? 1 : -1, seed: rng() * 1e9 | 0 };
    segs.push(seg);
    const ex = x + ax * len, ez = z + az * len;
    const turn = rng();
    if (turn < 0.75) grow(ex, ez, (d + (rng() < 0.5 ? 1 : 3)) & 3, depth + 1);
    if (turn > 0.45) grow(ex, ez, d, depth + 1);
    if (rng() < 0.4) { const t = 4 + (rng() * (len - 6) | 0); grow(x + ax * t, z + az * t, (d + (rng() < 0.5 ? 1 : 3)) & 3, depth + 2); }
  };
  for (let d = 0; d < 4; d++) if (rng() < 0.85) grow(s.x + D4[d][0] * 5, s.z + D4[d][1] * 5, d, 0);
  const sx = s.x + 3, sz = s.z + 3, top = H(sx, sz);
  return ctx => {
    const y = room.y;
    // salen
    ctx.fill(room.x - 4, y + 1, room.z - 4, room.x + 4, y + 4, room.z + 4, 0, keepBedrock);
    ctx.fill(room.x - 4, y, room.z - 4, room.x + 4, y, room.z + 4, B.dirt, keepBedrock);
    for (const [a, b] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) ctx.fill(room.x + a, y + 1, room.z + b, room.x + a, y + 4, room.z + b, B.oak_log);
    ctx.set(room.x - 3, y + 1, room.z, B.torch); ctx.set(room.x + 3, y + 1, room.z - 3, B.torch);
    ctx.loot(room.x - 3, y + 1, room.z + 3, 'mine');
    // schakt med stege upp till ytan och en liten gruvlave
    for (let yy = y + 1; yy <= top + 1; yy++) { ctx.set(sx, yy, sz, B.ladder_0); ctx.set(sx + 1, yy, sz, yy > top - 1 ? B.oak_planks : B.spruce_planks); }
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fill(sx + a, top + 1, sz + b, sx + a, top + 3, sz + b, B.fence);
    ctx.fill(sx - 1, top + 4, sz - 1, sx + 1, top + 4, sz + 1, B.plank_slab);
    ctx.fill(sx, top + 1, sz - 1, sx, top + 3, sz - 1, 0); ctx.fill(sx, top + 1, sz + 1, sx, top + 3, sz + 1, 0); ctx.fill(sx - 1, top + 1, sz, sx - 1, top + 3, sz, 0);
    ctx.set(sx, top + 2, sz - 1, 0);
    ctx.set(sx - 1, top + 3, sz - 1, B.lantern);
    // gångar
    for (const g of segs) {
      const [ax, az] = D4[g.d], px = -az, pz = ax;
      const xa = Math.min(g.x, g.x + ax * g.len) - Math.abs(px), xb = Math.max(g.x, g.x + ax * g.len) + Math.abs(px);
      const za = Math.min(g.z, g.z + az * g.len) - Math.abs(pz), zb = Math.max(g.z, g.z + az * g.len) + Math.abs(pz);
      if (xb < ctx.ox || xa > ctx.ox + 15 || zb < ctx.oz || za > ctx.oz + 15) continue;
      const r = mulberry(g.seed);
      for (let t = 0; t <= g.len; t++) {
        const support = (t + g.sup) % 4 === 0;
        for (let o = -1; o <= 1; o++) {
          const x = g.x + ax * t + px * o, z = g.z + az * t + pz * o;
          const rw = r(), rc = r();
          if (!ctx.inside(x, z)) continue;
          const fl = ctx.get(x, y, z);
          if (fl === 0 || isWater(fl) || fl === B.lava) ctx.set(x, y, z, B.oak_planks);
          for (let yy = y + 1; yy <= y + 3; yy++) if (ctx.get(x, yy, z) !== B.bedrock) ctx.set(x, yy, z, 0);
          if (support) { if (o !== 0) { ctx.set(x, y + 1, z, B.fence); ctx.set(x, y + 2, z, B.fence); } ctx.set(x, y + 3, z, B.oak_planks); }
          else {
            if (o === 0 && rw < 0.8) ctx.set(x, y + 1, z, B.rail);
            if (o !== 0 && rc < 0.1) ctx.set(x, y + 3, z, B.cobweb);
            else if (o !== 0 && rc > 0.985) ctx.set(x, y + 1, z, B.torch);
            if (o === g.side && t === g.chest) ctx.loot(x, y + 1, z, 'mine');
          }
        }
      }
    }
  };
};

/* ---------- fornlämning: domarring, runsten och en rasad stenstuga ---------- */
PLAN.ruin = (s, rng, H) => {
  const stones = [];
  const n = 9;
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + rng() * 0.2; stones.push([s.x + Math.round(Math.cos(a) * 6.5), s.z + Math.round(Math.sin(a) * 6.5), 2 + (rng() * 2 | 0), rng() < 0.5 ? B.mossy_cobble : B.stone]); }
  const hd = rng() * 4 | 0, [hx, hz] = D4[hd];
  const ox = s.x + hx * 11 - 2, oz = s.z + hz * 11 - 2;
  const holes = []; for (let k = 0; k < 40; k++) holes.push(rng());
  return ctx => {
    for (const [x, z, h, id] of stones) { const g = H(x, z); ctx.fill(x, g - 1, z, x, g + h, z, id); }
    const g0 = H(s.x, s.z);
    ctx.fill(s.x, g0 - 1, s.z, s.x, g0 + 3, s.z, B.smooth_stone);
    ctx.set(s.x, g0 + 4, s.z, B.mossy_cobble);
    // nedgrävd kista under ett gruskors framför runstenen
    ctx.loot(s.x, g0 - 1, s.z + 2, 'ruin');
    ctx.set(s.x, g0, s.z + 2, B.gravel); ctx.set(s.x + 1, g0, s.z + 2, B.gravel); ctx.set(s.x - 1, g0, s.z + 2, B.gravel); ctx.set(s.x, g0, s.z + 3, B.gravel);
    for (let yy = g0 + 1; yy < g0 + 3; yy++) for (const [a, b] of [[0, 2], [1, 2], [-1, 2], [0, 3]]) ctx.set(s.x + a, yy, s.z + b, 0);
    // rasad stuga
    const gy = H(ox + 2, oz + 2);
    let hi = 0;
    for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) {
      const x = ox + u, z = oz + v;
      const edge = u === 0 || u === 4 || v === 0 || v === 4;
      ctx.fill(x, gy - 2, z, x, gy, z, B.cobble);
      ctx.set(x, gy, z, edge ? B.mossy_cobble : B.cobble);
      for (let y = 1; y <= 3; y++) {
        const r = holes[hi++ % holes.length];
        ctx.set(x, gy + y, z, edge && r > 0.25 + y * 0.18 ? (r > 0.6 ? B.mossy_cobble : B.cobble) : 0);
      }
      for (let y = 4; y < 8; y++) ctx.set(x, gy + y, z, 0);
    }
    ctx.set(ox + 1, gy + 3, oz + 1, B.cobweb); ctx.set(ox + 3, gy + 1, oz + 3, B.cobweb);
    ctx.loot(ox + 1, gy + 1, oz + 3, 'ruin');
  };
};

/* ---------- ökentempel med fälla och skattkammare ---------- */
PLAN.temple = (s, rng, H) => {
  const y = s.y, R = 9;
  const ent = s.rot; const [ex, ez] = D4[ent];
  return ctx => {
    const x0 = s.x, z0 = s.z;
    // grund
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) { const x = x0 + dx, z = z0 + dz; if (!ctx.inside(x, z)) continue; const h = H(x, z); for (let yy = Math.min(h, y) - 3; yy < y; yy++) ctx.set(x, yy, z, B.sandstone); for (let yy = y + 1; yy <= h + 2; yy++) ctx.set(x, yy, z, 0); }
    // trappstegspyramid
    for (let k = 0; k <= R; k++) {
      const r = R - k;
      ctx.fill(x0 - r, y + k, z0 - r, x0 + r, y + k, z0 + r, k === 3 || k === 6 ? B.terracotta : B.sandstone);
    }
    // inre sal
    ctx.fill(x0 - 3, y + 1, z0 - 3, x0 + 3, y + 4, z0 + 3, 0);
    ctx.fill(x0 - 3, y, z0 - 3, x0 + 3, y, z0 + 3, B.sandstone);
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) ctx.fill(x0 + a, y + 1, z0 + b, x0 + a, y + 4, z0 + b, B.smooth_stone);
    // solmönster i golvet
    for (let k = -2; k <= 2; k++) { ctx.set(x0 + k, y, z0, B.terracotta); ctx.set(x0, y, z0 + k, B.terracotta); }
    ctx.set(x0, y, z0, B.wool_blue); ctx.set(x0 + 1, y, z0 + 1, B.wool_orange); ctx.set(x0 - 1, y, z0 - 1, B.wool_orange); ctx.set(x0 + 1, y, z0 - 1, B.wool_orange); ctx.set(x0 - 1, y, z0 + 1, B.wool_orange);
    ctx.set(x0 - 2, y + 1, z0 - 2, B.candle); ctx.set(x0 + 2, y + 1, z0 + 2, B.candle);
    // ingång
    for (let t = 3; t <= R + 1; t++) for (let o = -1; o <= 1; o++) ctx.fill(x0 + ex * t - ez * o, y + 1, z0 + ez * t + ex * o, x0 + ex * t - ez * o, y + 3, z0 + ez * t + ex * o, 0);
    // skattkammaren under golvet
    const F = y - 8;
    ctx.fill(x0 - 3, F - 2, z0 - 3, x0 + 3, F + 5, z0 + 3, B.sandstone);
    ctx.fill(x0 - 2, F + 1, z0 - 2, x0 + 2, F + 4, z0 + 2, 0);
    // fällan: tryckplatta mitt i kammaren över TNT
    ctx.fill(x0 - 1, F - 1, z0 - 1, x0 + 1, F - 1, z0 + 1, B.tnt);
    ctx.set(x0, F, z0, B.tnt);
    ctx.set(x0, F + 1, z0, B.plate_stone); ctx.circ(x0, F + 1, z0);
    // schakt från salen (under ett lösbrutet golvblock) med stege – landar bredvid plattan
    for (let yy = F + 1; yy < y; yy++) { ctx.set(x0 + 1, yy, z0, B.ladder_0); ctx.set(x0 + 2, yy, z0, B.sandstone); }
    ctx.set(x0 + 1, y, z0, B.sandstone_slab);
    for (const [a, b] of [[-2, 0], [2, 2], [0, -2], [0, 2]]) ctx.loot(x0 + a, F + 1, z0 + b, 'temple');
    ctx.set(x0 - 2, F + 3, z0 - 2, B.torch); ctx.set(x0 + 2, F + 1, z0 - 2, B.cobweb);
  };
};

/* ---------- skeppsvrak ---------- */
PLAN.wreck = (s, rng, H) => {
  const ax = s.rot & 1 ? 1 : 0, az = 1 - ax, px = -az, pz = ax;
  const yb = Math.max(H(s.x, s.z) + 1, SEA - 4);
  const broken = []; for (let k = 0; k < 80; k++) broken.push(rng());
  const mastH = 4 + (rng() * 4 | 0);
  return ctx => {
    let bi = 0;
    for (let u = -6; u <= 6; u++) {
      const hw = u >= 4 ? (u >= 6 ? 0 : 1) : u <= -5 ? 1 : 2;
      for (let v = -hw; v <= hw; v++) {
        const x = s.x + ax * u + px * v, z = s.z + az * u + pz * v;
        const side = Math.abs(v) === hw;
        ctx.set(x, yb, z, B.spruce_planks);
        for (let y = yb + 1; y <= yb + 3; y++) {
          const r = broken[bi++ % broken.length];
          if (side) ctx.set(x, y, z, r < 0.22 && y > SEA ? (y <= SEA ? B.water : 0) : B.spruce_planks);
          else ctx.set(x, y, z, y <= SEA ? B.water : 0);
        }
        if (!side && u > -4 && u < 3) ctx.set(x, yb + 3, z, broken[bi++ % broken.length] < 0.3 ? (yb + 3 <= SEA ? B.water : 0) : B.plank_slab);
        for (let y = yb + 4; y < yb + 7; y++) if (ctx.get(x, y, z) !== -1 && y > SEA) ctx.set(x, y, z, 0);
      }
    }
    // mast
    ctx.fill(s.x - ax, yb + 1, s.z - az, s.x - ax, yb + mastH, s.z - az, B.spruce_log);
    ctx.set(s.x - ax + px, yb + mastH - 1, s.z - az + pz, B.spruce_log);
    ctx.loot(s.x - ax * 4, yb + 1, s.z - az * 4, 'wreck');
    ctx.loot(s.x + ax * 3, yb + 1, s.z + az * 3 + 0, 'wreck');
  };
};

/* ---------- vakttornsruin ---------- */
PLAN.tower = (s, rng, H) => {
  const y = s.y, x0 = s.x - 2, z0 = s.z - 2, top = 12;
  const holes = []; for (let k = 0; k < 400; k++) holes.push(rng());
  const door = s.rot;
  return ctx => {
    let hi = 0;
    for (let u = -1; u <= 5; u++) for (let v = -1; v <= 5; v++) { const x = x0 + u, z = z0 + v; if (!ctx.inside(x, z)) continue; const h = H(x, z); for (let yy = Math.min(h, y) - 3; yy <= y; yy++) ctx.set(x, yy, z, B.cobble); for (let yy = y + 1; yy <= Math.max(h, y + top + 2); yy++) ctx.set(x, yy, z, 0); }
    for (let yy = 1; yy <= top + 1; yy++) for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) {
      const edge = u === 0 || u === 4 || v === 0 || v === 4;
      const r = holes[hi++ % holes.length];
      const x = x0 + u, z = z0 + v;
      if (!edge) { ctx.set(x, y + yy, z, (yy === 4 || yy === 8) && !(u === 1 && v === 3) ? B.oak_planks : 0); continue; }
      if (yy === top + 1) { ctx.set(x, y + yy, z, (u + v) % 2 === 0 && r > 0.35 ? B.stone_bricks : 0); continue; }
      const gone = yy > 6 && r < (yy - 6) * 0.07;
      ctx.set(x, y + yy, z, gone ? 0 : r < 0.3 ? B.mossy_cobble : r < 0.55 ? B.cobble : B.stone_bricks);
    }
    // stege längs innerväggen
    for (let yy = 1; yy <= top; yy++) ctx.set(x0 + 1, y + yy, z0 + 3, B.ladder_1);
    // dörröppning och skottgluggar
    const [dx, dz] = D4[door];
    const cxw = s.x + dx * 2, czw = s.z + dz * 2;
    ctx.set(cxw, y + 1, czw, 0); ctx.set(cxw, y + 2, czw, 0);
    ctx.set(s.x - dx * 2, y + 6, s.z - dz * 2, 0); ctx.set(s.x + dz * 2, y + 10, s.z - dx * 2, 0);
    ctx.loot(x0 + 3, y + 9, z0 + 1, 'tower');
    ctx.set(x0 + 3, y + 9, z0 + 3, B.torch);
    ctx.set(x0 + 2, y + 5, z0 + 2, B.cobweb);
  };
};

/* ---------- stuga i skogen ---------- */
PLAN.cabin = (s, rng, H) => {
  const [ax, az] = D4[s.rot], nx = -az, nz = ax;
  const W = 7, D = 6;
  const F = frame(s.x - ax * 3 - nx * 3, s.y, s.z - az * 3 - nz * 3, ax, az, nx, nz);
  const S = { wall: B.spruce_log, corner: B.spruce_log, floor: B.spruce_planks, roof: STAIR0 + 4, roofFull: B.spruce_planks, found: B.cobble, trim: B.spruce_planks };
  return ctx => {
    house(ctx, F, H, S, W, D, 3, rng, {});
    put(ctx, F, 1, 1, D - 2, BED0 + F.fOut); put(ctx, F, 1, 1, D - 3, BED0 + 4 + F.fOut);
    put(ctx, F, W - 2, 1, D - 2, B.furnace); put(ctx, F, W - 2, 1, 1, B.workbench);
    ctx.loot(F.X(W - 2, D - 3), F.y + 1, F.Z(W - 2, D - 3), 'cabin');
    put(ctx, F, 3, 1, 2, B.carpet_red);
    // skorsten
    for (let y = 1; y <= 7; y++) put(ctx, F, W, y, D - 2, B.cobble);
    put(ctx, F, W, 0, D - 2, B.cobble);
    // vedtrave
    put(ctx, F, -1, 1, 1, B.spruce_log); put(ctx, F, -1, 1, 2, B.spruce_log); put(ctx, F, -1, 2, 1, B.spruce_log);
  };
};

/* ---------- förfallen eldport ---------- */
/** Eldportens båge: [du, dy] för ramblocken (öppningen är 3 bred: du 0..2, dy 1..3 plus mitten dy 4) */
export const PORTAL_FRAME = [[0, 0], [1, 0], [2, 0], [-1, 1], [-1, 2], [-1, 3], [3, 1], [3, 2], [3, 3], [0, 4], [2, 4], [1, 5]];
export const PORTAL_INNER = [[0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3], [1, 4]];
PLAN.portal = (s, rng, H) => {
  const axis = s.rot & 1; // 0: bågen längs x, 1: längs z
  const ax = axis ? 0 : 1, az = axis ? 1 : 0;
  const missing = new Set();
  const nMiss = 2 + (rng() * 3 | 0);
  while (missing.size < nMiss) missing.add(rng() * PORTAL_FRAME.length | 0);
  const patch = []; for (let k = 0; k < 120; k++) patch.push(rng());
  const y = s.y;
  const ox = s.x - ax, oz = s.z - az;
  return ctx => {
    let pi = 0;
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
      const x = s.x + dx, z = s.z + dz, d = Math.hypot(dx, dz), r = patch[pi++ % patch.length];
      if (!ctx.inside(x, z) || d > 5 - r * 1.5) continue;
      const h = H(x, z); if (Math.abs(h - y) > 3) continue;
      ctx.set(x, h, z, r < 0.5 ? B.askesten : r < 0.75 ? B.basalt : B.svavelsand);
      if (r > 0.9) ctx.set(x, h + 1, z, B.eldsvamp); else ctx.set(x, h + 1, z, 0);
    }
    // fri plats för bågen
    for (let du = -2; du <= 4; du++) for (let dy = 1; dy <= 7; dy++) ctx.set(ox + ax * du, y + dy, oz + az * du, 0);
    PORTAL_FRAME.forEach(([du, dy], i) => ctx.set(ox + ax * du, y + dy, oz + az * du, missing.has(i) ? (dy === 0 ? B.askesten : 0) : B.obsidian));
    ctx.fill(ox - ax * 2, y - 1, oz - az * 2, ox + ax * 4, y - 1, oz + az * 4, B.askesten);
    // kistan står bredvid
    ctx.loot(s.x + az * 3, H(s.x + az * 3, s.z + ax * 3) + 1, s.z + ax * 3, 'portal', nMiss);
  };
};

/* =====================================================================
 * Byte: seedat (samma frö och plats → samma innehåll)
 * ===================================================================== */
// [id, min, max, sannolikhet]
const LOOT = {
  house: { rolls: [3, 6], items: [[I.bread, 1, 3, 0.6], [I.wheat, 2, 6, 0.5], [I.seeds, 2, 5, 0.5], [I.apple, 1, 3, 0.5], [I.carrot, 1, 4, 0.4], [I.potato, 1, 4, 0.4], [I.emerald, 1, 2, 0.25], [B.torch, 2, 6, 0.4], [I.paper, 1, 4, 0.3]] },
  library: { rolls: [3, 6], items: [[I.paper, 3, 9, 0.8], [B.bookshelf, 1, 2, 0.4], [I.emerald, 1, 3, 0.45], [I.compass, 1, 1, 0.2], [I.clock, 1, 1, 0.15], [I.glodfragment, 1, 1, 0.12], [B.candle, 1, 3, 0.5]] },
  smithy: { rolls: [4, 7], items: [[I.iron_ingot, 1, 5, 0.8], [I.bread, 1, 3, 0.5], [TOOL0 + 8, 1, 1, 0.2], [TOOL0 + 11, 1, 1, 0.2], [ARMOR0 + 5, 1, 1, 0.12], [I.emerald, 1, 3, 0.4], [B.obsidian, 1, 3, 0.25], [I.diamond, 1, 1, 0.1], [I.gold_ingot, 1, 3, 0.3], [I.glodfragment, 1, 1, 0.06], [I.coal, 2, 8, 0.6]] },
  mine: { rolls: [3, 6], items: [[I.coal, 3, 9, 0.7], [I.iron_ingot, 1, 4, 0.5], [I.gold_ingot, 1, 3, 0.35], [B.rail, 4, 12, 0.5], [B.torch, 3, 8, 0.5], [I.bread, 1, 3, 0.4], [I.spark_dust, 2, 7, 0.35], [I.diamond, 1, 2, 0.15], [I.emerald, 1, 2, 0.2], [TOOL0 + 8, 1, 1, 0.1]] },
  ruin: { rolls: [3, 6], items: [[I.bone, 1, 4, 0.6], [I.string, 1, 3, 0.4], [I.gold_ingot, 1, 3, 0.45], [I.emerald, 1, 3, 0.45], [I.spark_dust, 2, 5, 0.3], [B.obsidian, 1, 2, 0.3], [I.glodfragment, 1, 1, 0.25], [ARMOR0 + 4, 1, 1, 0.12], [I.diamond, 1, 1, 0.1], [I.apple, 1, 2, 0.3]] },
  temple: { rolls: [4, 7], items: [[I.gold_ingot, 2, 6, 0.7], [I.diamond, 1, 3, 0.4], [I.emerald, 2, 5, 0.5], [I.bone, 1, 5, 0.6], [I.rotten_flesh, 1, 5, 0.5], [I.glodfragment, 1, 2, 0.3], [B.tnt, 1, 2, 0.2], [ARMOR0 + 8, 1, 1, 0.15], [I.glodapple, 1, 1, 0.06]] },
  wreck: { rolls: [3, 6], items: [[I.fish, 2, 6, 0.6], [I.paper, 2, 6, 0.5], [I.emerald, 1, 4, 0.5], [I.iron_ingot, 1, 3, 0.4], [I.gold_ingot, 1, 3, 0.35], [I.compass, 1, 1, 0.25], [I.clock, 1, 1, 0.2], [I.glodfragment, 1, 1, 0.15], [I.map_explore, 1, 1, 0.2], [I.diamond, 1, 1, 0.08]] },
  tower: { rolls: [3, 6], items: [[I.arrow, 4, 12, 0.6], [I.bow, 1, 1, 0.3], [ARMOR0 + 4, 1, 1, 0.15], [ARMOR0 + 7, 1, 1, 0.15], [I.emerald, 1, 3, 0.4], [I.coal, 2, 6, 0.4], [I.bread, 1, 3, 0.4], [I.iron_ingot, 1, 3, 0.3], [I.glodfragment, 1, 1, 0.12]] },
  cabin: { rolls: [3, 5], items: [[I.bread, 1, 3, 0.6], [I.meat_cooked, 1, 3, 0.5], [B.torch, 2, 6, 0.5], [TOOL0 + 9, 1, 1, 0.25], [I.emerald, 1, 2, 0.35], [I.lingon, 2, 6, 0.4], [I.string, 1, 3, 0.3], [I.leather, 1, 3, 0.3]] },
  portal: { rolls: [3, 6], items: [[I.gold_ingot, 1, 4, 0.6], [I.glodfragment, 1, 2, 0.5], [I.spark_dust, 2, 6, 0.4], [I.emerald, 1, 3, 0.35], [I.diamond, 1, 1, 0.15], [I.glodapple, 1, 1, 0.08], [B.glodsten, 1, 3, 0.3]] },
  ashruin: { rolls: [3, 6], items: [[I.gold_ingot, 2, 6, 0.7], [I.urskarva, 1, 1, 0.2], [B.obsidian, 1, 3, 0.4], [B.glodsten, 2, 5, 0.4], [I.spark_dust, 2, 6, 0.4], [I.glodfragment, 1, 2, 0.3], [I.emerald, 1, 3, 0.35], [I.diamond, 1, 2, 0.15], [I.glodapple, 1, 1, 0.1]] },
  fortress: { rolls: [4, 7], items: [[I.gold_ingot, 3, 8, 0.7], [I.iron_ingot, 2, 6, 0.6], [B.obsidian, 1, 4, 0.4], [I.diamond, 1, 3, 0.35], [I.urskarva, 1, 2, 0.25], [I.emerald, 2, 5, 0.4], [I.glodapple, 1, 1, 0.15], [I.map_fort, 1, 1, 0.1], [I.glodkarna, 1, 1, 0.15], [ARMOR0 + 13, 1, 1, 0.1], [TOOL0 + 15, 1, 1, 0.08]] },
  treasure: { rolls: [5, 8], items: [[I.urskarva, 2, 4, 0.9], [B.gold_block, 1, 3, 0.6], [I.diamond, 2, 5, 0.7], [I.emerald, 3, 8, 0.6], [I.glodkarna, 1, 1, 0.6], [I.glodapple, 1, 2, 0.5], [I.surtstal, 1, 1, 0.25], [SURT_TOOL0 + 3, 1, 1, 0.08], [B.glodsten, 3, 8, 0.4]] }
};
export const LOOT_NAMES = { house: 'Kista', library: 'Bibliotekets kista', smithy: 'Smedjans kista', mine: 'Gruvkista', ruin: 'Fornkista', temple: 'Tempelskatt', wreck: 'Sjökista', tower: 'Tornkista', cabin: 'Stugkista', portal: 'Portalkista', ashruin: 'Askkista', fortress: 'Borgkista', treasure: 'Skattkista' };
export function rollLoot(seed, table, x, y, z, extra = 0) {
  const T = LOOT[table] || LOOT.house;
  const r = mulberry((hash3(seed, x, y * 31 + 7, z) * 4294967296) >>> 0);
  const slots = new Array(27).fill(null);
  const n = T.rolls[0] + (r() * (T.rolls[1] - T.rolls[0] + 1) | 0);
  const put = (id, k) => { for (let t = 0; t < 30; t++) { const i = r() * 27 | 0; if (!slots[i]) { slots[i] = { id, n: k, d: 0 }; return; } } };
  let got = 0;
  for (let t = 0; t < n * 4 && got < n; t++) {
    const [id, a, b, p] = T.items[r() * T.items.length | 0];
    if (r() > p) continue;
    put(id, a + (r() * (b - a + 1) | 0)); got++;
  }
  if (!got) { const [id, a] = T.items[0]; put(id, a); }
  // förfallna portaler: alltid tillräckligt med obsidian för att laga bågen
  if (table === 'portal') put(B.obsidian, extra + 1 + (r() * 2 | 0));
  return slots;
}
