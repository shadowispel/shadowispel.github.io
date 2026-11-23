/** Världsgenerering för Kubvärld. Ren modul – körs i arbetare (och på huvudtråden för spawnsökning). */
import { makeNoise, mulberry, hash3 } from './noise.js';
import { CX, CY, CZ, SEA, CHUNK_VOL, B } from './blocks.js';
import { createStructures, Ctx, newExtra } from './structures.js';

export const BIOMES = ['Äng', 'Granskog', 'Björkskog', 'Fjäll', 'Sanddyner', 'Myr', 'Strand', 'Sjö', 'Tallhed'];
export const BI = { ang: 0, gran: 1, bjork: 2, fjall: 3, oken: 4, myr: 5, strand: 6, sjo: 7, tall: 8 };

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function createGen(seed, ver = 1) {
  seed = seed >>> 0;
  const N = makeNoise(seed), N2 = makeNoise(seed ^ 0x9e3779b9), N3 = makeNoise((seed * 7 + 13) >>> 0);
  const { fbm2 } = N;
  const col = { h: 0, biome: 0, t: 0, hum: 0, mtn: 0, snow: 0, river: 0 };

  /** Beräkna kolumnens höjd och biom. Returnerar ett återanvänt objekt. */
  function column(wx, wz) {
    const c = fbm2(wx / 820, wz / 820, 4) * 1.7;           // kontinent
    const e = fbm2(wx / 190 + 31, wz / 190 - 17, 4) * 1.6;  // detalj
    const mraw = N2.fbm2(wx / 1000 + 100, wz / 1000 - 50, 3) * 1.8 + N.n2(wx / 300, wz / 300) * 0.15;
    const mtn = smooth(0.18, 0.62, mraw);
    const ridge = 1 - Math.abs(N2.fbm2(wx / 170, wz / 170, 4) * 1.6);
    const T = N3.fbm2(wx / 950 + 300, wz / 950, 3) * 1.7;
    const H = N3.fbm2(wx / 760 - 200, wz / 760 + 90, 3) * 1.7;
    let h = SEA + 7 + c * 17 + e * 6;
    h += mtn * (Math.max(0, ridge) * Math.max(0, ridge) * 58 + 10 + e * 6);
    // sanddyner (varmt & torrt)
    const dune = smooth(0.3, 0.52, T) * smooth(0.0, -0.25, H) * (1 - mtn) * smooth(-0.25, 0.05, c);
    if (dune > 0) {
      const d = Math.abs(Math.sin(wx * 0.07 + N.n2(wx / 60, wz / 60) * 3 + wz * 0.025)) * 6 + N.n2(wx / 30, wz / 30) * 2;
      h = lerp(h, SEA + 5 + d, dune);
    }
    // myr (fuktigt, platt)
    const bog = smooth(0.25, 0.5, H) * (1 - mtn) * smooth(-0.15, 0.1, c) * (1 - dune);
    if (bog > 0) h = lerp(h, SEA - 0.2 + e * 2.4, bog * 0.92);
    // floder
    const rv = Math.abs(N.fbm2(wx / 430 + 7, wz / 430 - 3, 3) * 1.6);
    const river = smooth(0.055, 0.015, rv) * (1 - mtn * 0.85) * smooth(SEA - 2, SEA + 3, h);
    if (river > 0) h = lerp(h, SEA - 4, river);
    col.h = Math.max(4, Math.min(CY - 8, Math.round(h)));
    col.t = T; col.hum = H; col.mtn = mtn; col.river = river;
    const hh = col.h;
    let b;
    if (hh < SEA - 1) b = BI.sjo;
    else if (hh >= SEA + 34 && mtn > 0.3) b = BI.fjall;
    else if (dune > 0.5) b = BI.oken;
    else if (hh <= SEA + 1 && bog < 0.4) b = BI.strand;
    else if (bog > 0.45) b = BI.myr;
    else if (T < -0.12 || hh > SEA + 22) b = BI.gran;
    else if (H > 0.06) b = BI.bjork;
    else if (H < -0.2 && T > 0) b = BI.tall;
    else b = BI.ang;
    col.biome = b;
    col.snow = SEA + 50 + N.n2(wx / 40, wz / 40) * 5 - (T < -0.3 ? 8 : 0);
    return col;
  }

  // ----- grottor: brus på grovt rutnät (var 4:e block) som interpoleras -----
  const GX = 5, GY = CY / 4 + 1;
  const caveA = new Float32Array(GX * GX * GY), caveB = new Float32Array(GX * GX * GY);
  function caveGrid(cx, cz) {
    let i = 0;
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++, i++) {
      const x = cx * CX + gx * 4, y = gy * 4, z = cz * CZ + gz * 4;
      const a = N.n3(x / 42, y / 26, z / 42), bb = N2.n3(x / 42, y / 26, z / 42);
      caveA[i] = a * a + bb * bb;                       // maskgångar
      caveB[i] = N3.n3(x / 75, y / 38, z / 75);         // grottsalar
    }
  }
  function sampleCave(arr, lx, y, lz) {
    const fx = lx / 4, fy = y / 4, fz = lz / 4;
    const x0 = fx | 0, y0 = Math.min(GY - 2, fy | 0), z0 = fz | 0;
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    const i000 = (y0 * GX + z0) * GX + x0;
    const S = GX * GX;
    const c00 = arr[i000] + (arr[i000 + 1] - arr[i000]) * tx;
    const c10 = arr[i000 + GX] + (arr[i000 + GX + 1] - arr[i000 + GX]) * tx;
    const c01 = arr[i000 + S] + (arr[i000 + S + 1] - arr[i000 + S]) * tx;
    const c11 = arr[i000 + S + GX] + (arr[i000 + S + GX + 1] - arr[i000 + S + GX]) * tx;
    const c0 = c00 + (c10 - c00) * tz, c1 = c01 + (c11 - c01) * tz;
    return c0 + (c1 - c0) * ty;
  }

  const structs = createStructures(seed, (x, z) => column(x, z));
  const sctx = new Ctx();
  /** Genererar en chunk. skip: strukturid:n som inte ska byggas (äldre världar). Returnerar { data, biomes, maxY, extra } */
  function generate(cx, cz, skip = null) {
    const data = new Uint16Array(CHUNK_VOL);
    let slist = structs.structuresAt(cx, cz);
    if (skip && skip.length) slist = slist.filter(st => !skip.includes(st.id));
    const biomes = new Uint8Array(CX * CZ);
    const heights = new Int16Array(CX * CZ);
    const rng = mulberry((seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0);
    caveGrid(cx, cz);
    let maxY = SEA + 1;
    const snowA = new Float32Array(CX * CZ), tA = new Float32Array(CX * CZ), humA = new Float32Array(CX * CZ);
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const c = column(cx * CX + lx, cz * CZ + lz), k = lz * CX + lx;
      heights[k] = c.h; biomes[k] = c.biome; snowA[k] = c.snow; tA[k] = c.t; humA[k] = c.hum;
    }
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = cx * CX + lx, wz = cz * CZ + lz;
      const k = lz * CX + lx;
      const c = { h: heights[k], biome: biomes[k], snow: snowA[k], t: tA[k], hum: humA[k] };
      const h = c.h, bio = c.biome;
      const hn = (dx, dz) => { const x = lx + dx, z = lz + dz; return (x >= 0 && x < CX && z >= 0 && z < CZ) ? heights[z * CX + x] : h; };
      const slope = Math.max(Math.abs(hn(1, 0) - h), Math.abs(hn(-1, 0) - h), Math.abs(hn(0, 1) - h), Math.abs(hn(0, -1) - h));
      const r = hash3(seed, wx, 7, wz);
      // berggrund
      data[(0 << 8) | (lz << 4) | lx] = B.bedrock;
      for (let y = 1; y <= 3; y++) data[(y << 8) | (lz << 4) | lx] = hash3(seed, wx, y, wz) < 0.6 - y * 0.15 ? B.bedrock : B.stone;
      for (let y = 4; y <= h; y++) data[(y << 8) | (lz << 4) | lx] = B.stone;
      // ytlager
      let top = B.grass, fill = B.dirt, depth = 3 + (r * 2 | 0);
      if (h < SEA) {
        const n = N.n2(wx / 24, wz / 24);
        top = n > 0.35 ? B.clay : n < -0.3 ? B.gravel : B.sand; fill = top === B.clay ? B.clay : B.sand; depth = 3;
        if (bio === BI.myr || c.hum > 0.4) { top = B.peat; fill = B.dirt; }
      } else if (bio === BI.fjall) {
        if (slope >= 3 && h < c.snow + 10) { top = B.stone; fill = B.stone; depth = 1; }
        else if (h >= c.snow) { top = B.snow; fill = B.snow; depth = 2; }
        else if (h > SEA + 48 || r < 0.15) { top = B.stone; fill = B.stone; depth = 1; if (r < 0.05) top = B.gravel; }
        else if (h > c.snow - 4) { top = B.snowgrass; }
      } else if (bio === BI.oken) { top = B.sand; fill = B.sand; depth = 5; }
      else if (bio === BI.strand) { top = B.sand; fill = B.sand; depth = 4; if (r < 0.012) top = B.gravel; }
      else if (bio === BI.myr) { if (N.n2(wx / 7, wz / 7) > 0.15 || r < 0.08) top = B.peat; fill = B.peat; depth = 2; }
      else if (bio === BI.gran && h > c.snow - 6) top = B.snowgrass;
      for (let d = 0; d < depth && h - d > 3; d++) data[((h - d) << 8) | (lz << 4) | lx] = d === 0 ? top : fill;
      if (top === B.sand && (bio === BI.oken || bio === BI.strand)) for (let d = depth; d < depth + 3 && h - d > 3; d++) data[((h - d) << 8) | (lz << 4) | lx] = B.sandstone;
      // vatten
      if (h < SEA) {
        for (let y = h + 1; y <= SEA; y++) data[(y << 8) | (lz << 4) | lx] = B.water;
        if ((c.t < -0.35 || (bio === BI.sjo && c.t < -0.28)) ) data[(SEA << 8) | (lz << 4) | lx] = B.ice;
      }
      if (h > maxY) maxY = h;
    }
    // grottor
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const h = heights[lz * CX + lx];
      const wet = h < SEA + 2;
      const top = wet ? h - 5 : h;
      for (let y = 5; y <= top; y++) {
        const i = (y << 8) | (lz << 4) | lx;
        const cur = data[i];
        if (cur === B.water || cur === B.bedrock) continue;
        const depthF = y > h - 6 ? 0.45 : 1; // färre öppningar nära ytan
        const a = sampleCave(caveA, lx, y, lz);
        let carve = a < 0.0075 * depthF * (y < 20 ? 1.4 : 1);
        if (!carve && y < 42 && y > 8) { const cb = sampleCave(caveB, lx, y, lz); carve = cb > 0.58 - (42 - y) * 0.002; }
        if (carve) {
          data[i] = 0;
          // gräs som blottas ovanifrån → jord under
        }
      }
      // om ytan grävts bort under gräs: inget att göra – gräset ligger kvar som tak
    }
    // malmer
    // yTop: valfri övre gräns för själva placeringen (slumpföljden är densamma, så gamla världar behåller sin övriga terräng)
    const ore = (id, tries, size, ymin, ymax, yTop = CY) => {
      for (let t = 0; t < tries; t++) {
        let x = rng() * CX | 0, y = ymin + (rng() * (ymax - ymin) | 0), z = rng() * CZ | 0;
        const n = 1 + (rng() * size | 0);
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < CX && z >= 0 && z < CZ && y > 0 && y < CY && y <= yTop) {
            const i = (y << 8) | (z << 4) | x;
            if (data[i] === B.stone) data[i] = id;
          }
          const d = rng() * 6 | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    ore(B.coal_ore, 18, 10, 6, 92);
    ore(B.iron_ore, 12, 7, 4, 62);
    ore(B.gold_ore, 3, 6, 3, 30);
    ore(B.diamond_ore, 2, 4, 3, 17, 10); // diamanter: sällsynta, bara allra djupast (nivå 3–10)
    ore(B.gravel, 5, 14, 5, 60);
    ore(B.clay, 2, 10, 20, SEA);
    // smaragder: sällsynta enstaka kristaller (egen hash, påverkar inte övrig slump)
    for (let k = 0; k < 2; k++) {
      if (hash3(seed, cx * 3 + k, 777, cz) > 0.45) continue;
      const x = hash3(seed, cx, 778 + k, cz) * CX | 0, z = hash3(seed, cx, 779 + k, cz) * CZ | 0, y = 5 + (hash3(seed, cx, 780 + k, cz) * 26 | 0);
      const i = (y << 8) | (z << 4) | x;
      if (data[i] === B.stone) data[i] = B.emerald_ore;
    }
    // gnistmalm: små ådror djupt ned (nivå 3–18), egen hash så att övrig slump inte påverkas
    for (let k = 0; k < 4; k++) {
      if (hash3(seed, cx * 5 + k, 1777, cz) > 0.7) continue;
      let x = hash3(seed, cx, 1778 + k, cz) * CX | 0, z = hash3(seed, cx, 1779 + k, cz) * CZ | 0, y = 3 + (hash3(seed, cx, 1780 + k, cz) * 16 | 0);
      for (let n = 0; n < 6; n++) {
        if (x >= 0 && x < CX && z >= 0 && z < CZ && y > 0) { const i = (y << 8) | (z << 4) | x; if (data[i] === B.stone) data[i] = B.spark_ore; }
        const d = hash3(seed, cx * 16 + n, 1781 + k, cz) * 6 | 0;
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
      }
    }
    // mossig sten i grottor
    for (let t = 0; t < 40; t++) {
      const x = rng() * CX | 0, z = rng() * CZ | 0, y = 6 + (rng() * 40 | 0);
      const i = (y << 8) | (z << 4) | x;
      if (data[i] === B.stone && y < CY - 1 && data[i + 256] === 0) data[i] = B.mossy_cobble;
    }
    // växter
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const h = heights[lz * CX + lx];
      if (h >= CY - 2) continue;
      const below = data[(h << 8) | (lz << 4) | lx], ai = ((h + 1) << 8) | (lz << 4) | lx;
      if (data[ai] !== 0) continue;
      const wx = cx * CX + lx, wz = cz * CZ + lz;
      const r = hash3(seed, wx, 99, wz), r2 = hash3(seed, wx, 123, wz);
      const bio = biomes[lz * CX + lx];
      let p = 0;
      // naturlig täthet: gräs i tuvor, blommor i glesa fläckar där en art dominerar
      const tuft = Math.max(0, N.n2(wx / 9 + 40, wz / 9 - 13));
      const patch = N2.n2(wx / 21 + 5, wz / 21 + 77);
      const flowerP = patch > 0.36 ? (patch - 0.36) * 0.3 : 0.006;
      const species = N3.n2(wx / 37 - 9, wz / 37 + 31);
      const pickFlower = list => list[r2 < 0.75 ? Math.min(list.length - 1, Math.floor((species * 0.5 + 0.5) * list.length)) : Math.floor(r2 * 4 * list.length) % list.length];
      if (below === B.grass) {
        if (bio === BI.ang) {
          if (r < 0.08 + tuft * 0.36) p = B.tallgrass;
          else if (r2 < flowerP) p = pickFlower([B.buttercup, B.bluebell, B.fireweed, B.daisy]);
        } else if (bio === BI.gran) {
          if (r < 0.03 + tuft * 0.16) p = B.fern; else if (r < 0.05 + tuft * 0.2) p = B.tallgrass; else if (r < 0.08 + tuft * 0.2) p = B.lingon_bush; else if (r < 0.09 + tuft * 0.2) p = B.chanterelle;
        } else if (bio === BI.bjork) {
          if (r < 0.04 + tuft * 0.2) p = B.tallgrass; else if (r < 0.07 + tuft * 0.22) p = B.fern; else if (r2 < flowerP * 0.7) p = pickFlower([B.bluebell, B.fireweed, B.daisy]); else if (r < 0.085 + tuft * 0.22) p = B.chanterelle;
        } else if (bio === BI.tall) {
          if (r < 0.08) p = B.lingon_bush; else if (r < 0.16) p = B.tallgrass;
        } else if (bio === BI.myr) {
          if (r < 0.03 + tuft * 0.1) p = B.cottongrass; else if (r < 0.06 + tuft * 0.12) p = B.cloudberry_plant; else if (r < 0.12 + tuft * 0.25) p = B.tallgrass;
        } else if (bio === BI.fjall) {
          if (r < 0.06) p = B.tallgrass; else if (r < 0.08) p = B.lingon_bush; else if (r < 0.09) p = B.bluebell;
        }
      } else if (below === B.peat && bio === BI.myr) {
        if (r < 0.03 + tuft * 0.12) p = B.cottongrass; else if (r < 0.06 + tuft * 0.1) p = B.cloudberry_plant;
      } else if (below === B.sand) {
        if (bio === BI.strand && r < 0.08) p = B.beachgrass;
        else if (bio === BI.oken && r < 0.015) p = B.dead_bush; else if (bio === BI.oken && r < 0.04) p = B.beachgrass;
      }
      // pumpor, meloner och vass (egna hashvärden – resten av världen påverkas inte)
      if (!p) {
        const r3 = hash3(seed, wx, 555, wz);
        if (below === B.grass && (bio === BI.ang || bio === BI.bjork) && r3 < 0.0022) p = B.pumpkin;
        else if (below === B.grass && bio === BI.ang && r3 > 0.9985) p = B.melon;
        else if ((below === B.grass || below === B.sand || below === B.dirt || below === B.peat) && h === SEA && r3 > 0.55 && r3 < 0.85) {
          const wet = (dx, dz) => { const x = lx + dx, z = lz + dz; return x >= 0 && x < CX && z >= 0 && z < CZ && data[(h << 8) | (z << 4) | x] === B.water; };
          if (wet(1, 0) || wet(-1, 0) || wet(0, 1) || wet(0, -1)) {
            p = B.reed;
            const tall = 1 + (hash3(seed, wx, 556, wz) * 3 | 0);
            for (let k = 1; k < tall && h + 1 + k < CY - 1; k++) data[((h + 1 + k) << 8) | (lz << 4) | lx] = B.reed;
          }
        }
      }
      if (p) data[ai] = p;
    }
    // träd (jitterat rutnät, kan sträcka sig över chunkgränser)
    const CELL = 6;
    const gx0 = Math.floor((cx * CX - 3) / CELL), gx1 = Math.floor((cx * CX + CX + 3) / CELL);
    const gz0 = Math.floor((cz * CZ - 3) / CELL), gz1 = Math.floor((cz * CZ + CZ + 3) / CELL);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const r = mulberry((seed ^ Math.imul(gx, 341873128) ^ Math.imul(gz, 132897987)) >>> 0);
      const wx = gx * CELL + (r() * (CELL - 1) | 0), wz = gz * CELL + (r() * (CELL - 1) | 0);
      const c = column(wx, wz);
      const bio = c.biome, h = c.h;
      if (h <= SEA || h > CY - 20) continue;
      const dens = [0.1, 0.85, 0.7, 0.04, 0, 0.12, 0, 0, 0.45][bio];
      const pick = r();
      if (pick > dens) continue;
      if (bio === BI.fjall && h >= c.snow - 2) continue;
      if (c.river > 0.2) continue;
      if (slist.length && structs.noTree(slist, wx, wz)) continue;
      const lx = wx - cx * CX, lz = wz - cz * CZ;
      // kontrollera underlaget om det ligger i den här chunken
      if (lx >= 0 && lx < CX && lz >= 0 && lz < CZ) {
        const g = data[(h << 8) | (lz << 4) | lx];
        if (g !== B.grass && g !== B.snowgrass && g !== B.dirt && g !== B.peat) continue;
      }
      let type;
      if (bio === BI.gran) type = r() < 0.82 ? 'spruce' : 'pine';
      else if (bio === BI.bjork) { type = r() < 0.8 ? 'birch' : 'spruce'; if (ver >= 2 && r() < 0.3) type = 'oak'; }
      else if (bio === BI.tall) type = r() < 0.85 ? 'pine' : 'birch';
      else if (bio === BI.myr) type = 'dwarf';
      else if (bio === BI.fjall) type = 'dwarf';
      else { type = r() < 0.5 ? 'birch' : (r() < 0.5 ? 'pine' : 'spruce'); if (ver >= 2 && bio === BI.ang && r() < 0.55) type = 'oak'; }
      if (ver >= 2 && bio === BI.gran && type === 'pine' && r() < 0.5) type = 'oak';
      placeTree((x, y, z, id, f) => setB(data, x, y, z, id, f), type, lx, h + 1, lz, r);
    }
    // strukturer (byggs sist så att de skriver över terräng och träd på samma sätt i alla chunkar)
    let extra = null;
    if (slist.length) { extra = newExtra(); structs.build(sctx.begin(data, cx, cz, extra), slist); }
    for (let i = CHUNK_VOL - 1; i >= 0; i--) if (data[i] !== 0) { maxY = Math.max(maxY, i >> 8); break; }
    return { data, biomes, maxY, extra };
  }
  /** Strukturer som överlappar chunken (för huvudtråden: äldre världar, kartor) */
  function structuresAt(cx, cz) { return structs.structuresAt(cx, cz); }
  function structuresNear(x, z, r, kinds) { return structs.near(x, z, r, kinds); }

  return { generate, column, structuresAt, structuresNear };
}

/* ---------- träd ---------- */
function setB(data, x, y, z, id, force) {
  if (x < 0 || x >= CX || z < 0 || z >= CZ || y <= 0 || y >= CY) return;
  const i = (y << 8) | (z << 4) | x;
  const cur = data[i];
  if (force) { if (cur === 0 || cur === B.tallgrass || cur === B.fern || cur >= B.spruce_leaves && cur <= B.pine_leaves || cur === B.oak_leaves || (cur >= 50 && cur <= 64)) data[i] = id; return; }
  if (cur === 0 || cur === B.tallgrass || cur === B.fern || (cur >= 50 && cur <= 64)) data[i] = id;
}
export function placeTree(S, type, x, y, z, r) {
  if (type === 'spruce') {
    const H = 7 + (r() * 5 | 0);
    const top = y + H;
    for (let yy = y + 2; yy <= top; yy++) {
      const fromTop = top - yy;
      let rad = Math.min(3, Math.floor(fromTop * 0.42 + 0.6));
      if ((fromTop & 1) === 1 && rad > 1) rad--;
      if (fromTop === 0) rad = 0;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (d > rad + (rad > 1 ? 1 : 0)) continue;
        if (d === rad + 1 && r() < 0.5) continue;
        S(x + dx, yy, z + dz, B.spruce_leaves);
      }
    }
    S(x, top + 1, z, B.spruce_leaves);
    for (let i = 0; i < H; i++) S(x, y + i, z, B.spruce_log, true);
  } else if (type === 'birch') {
    const H = 5 + (r() * 3 | 0);
    for (let yy = y + H - 3; yy <= y + H; yy++) {
      const rad = yy >= y + H - 1 ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (r() < 0.6 || yy === y + H)) continue;
        S(x + dx, yy, z + dz, B.birch_leaves);
      }
    }
    for (let i = 0; i < H; i++) S(x, y + i, z, B.birch_log, true);
  } else if (type === 'pine') {
    const H = 8 + (r() * 5 | 0);
    const layers = [[H - 3, 1], [H - 2, 2], [H - 1, 2], [H, 1]];
    for (const [dy, rad] of layers) {
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (rad > 1 || r() < 0.5)) continue;
        S(x + dx, y + dy, z + dz, B.pine_leaves);
      }
    }
    S(x, y + H + 1, z, B.pine_leaves);
    if (r() < 0.6) { const by = y + H - 6, s = r() < 0.5 ? 1 : -1; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx === 0 || dz === 0) S(x + dx + s, by, z + dz, B.pine_leaves); }
    for (let i = 0; i < H; i++) S(x, y + i, z, B.pine_log, true);
  } else if (type === 'oak') {
    // ek: kraftig stam, bred rundad krona och ibland en sidogren
    const H = 5 + (r() * 3 | 0);
    for (let dy = H - 3; dy <= H + 1; dy++) {
      const rad = dy >= H ? (dy === H + 1 ? 1 : 2) : dy === H - 3 ? 2 : 3;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > rad * rad + 1 || (d2 >= rad * rad && r() < 0.45)) continue;
        S(x + dx, y + dy, z + dz, B.oak_leaves);
      }
    }
    if (r() < 0.5) { const s = r() < 0.5 ? 1 : -1, ax = r() < 0.5; const bx = ax ? s * 2 : 0, bz = ax ? 0 : s * 2; S(x + (ax ? s : 0), y + H - 3, z + (ax ? 0 : s), B.oak_log, true); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) S(x + bx + dx, y + H - 2, z + bz + dz, B.oak_leaves); }
    for (let i = 0; i < H; i++) S(x, y + i, z, B.oak_log, true);
  } else if (type === 'dwarf') {
    const H = 2 + (r() * 2 | 0);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let dy = H - 1; dy <= H; dy++) {
      if (Math.abs(dx) + Math.abs(dz) === 2 && (dy === H || r() < 0.5)) continue;
      S(x + dx, y + dy, z + dz, B.birch_leaves);
    }
    S(x, y + H + 1, z, B.birch_leaves);
    for (let i = 0; i < H; i++) S(x, y + i, z, B.birch_log, true);
  }
}
