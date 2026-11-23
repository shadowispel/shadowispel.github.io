// Nordheim – kärnsimulering: nytt spel, byggnader, ekonomi, befolkning, årstider, mål.
import { BUILDINGS, RES, RES_INFO, T, R, DAY, CAMPAIGN, DIFFS, START_STOCK, NAMES, UNITS, YEAR, DAYS_PER_SEASON } from './data.js';
import { generateMap } from './mapgen.js';
import { PathGrid, PASS_P, PASS_E } from './path.js';
import { G, hooks, calendar, clamp, heightAt, nextId, rand, seedRand, tileX, tileZ, sleepTime } from './state.js';
import { citizenTick, makeCitizen } from './citizens.js';
import { combatTick, scheduleFirstRaid, spawnCamp, makeUnit } from './combat.js';
import { hashStr } from './mapgen.js';

export const FIELD_GROW = 200;      // sekunder att mogna (ej vinter)
export const TREE_GROW = 320;       // sekunder från planta till fullvuxet träd
export const STUMP_TIME = 150;      // sekunder innan en stubbe skjuter skott
const FOOD_PER_DAY = 2.5;          // mat per invånare och dygn

export function footprint(type, rot) {
  const d = BUILDINGS[type];
  return (rot & 1) ? [d.size[1], d.size[0]] : [d.size[0], d.size[1]];
}

/* =====================================================================
 * Nytt spel
 * ===================================================================== */
export function newGame(opts) {
  // opts: { mode, scenario, diff, size, seed, raids }
  for (const k of Object.keys(G)) delete G[k];
  const sc = opts.mode === 'campaign' ? CAMPAIGN.find(c => c.id === opts.scenario) : null;
  const diff = DIFFS[opts.diff || 'normal'];
  const n = sc ? sc.size : opts.size || 128;
  const seed = sc ? sc.seed : (opts.seed || String(Math.floor(Math.random() * 1e9)));
  Object.assign(G, {
    on: true, mode: opts.mode, scenario: sc ? sc.id : null, sc, diffId: opts.diff || 'normal', diff, size: n, seed,
    raidsOn: sc ? sc.raids : (opts.mode === 'survival' ? true : (opts.raids !== false && diff.raid > 0)),
    raidMult: (sc ? (sc.raidMult || 1) : 1) * (diff.raid || 1) * (opts.mode === 'survival' ? 1.1 : 1),
    time: DAY * 0.1, nextId: 0, speed: 1,
    buildings: new Map(), citizens: [], units: [], enemies: [], deer: [], projectiles: [], ships: [], corpses: [],
    stock: {}, cap: {}, tax: 1, alarm: false, alarmAuto: true,
    happiness: 60, happyShown: 60, starve: 0, lossMood: 0, foodTypes: {}, foodTypeT: {},
    stats: { pop: [], food: [], wood: [], stone: [], gold: [], happy: [], soldiers: [], t: [] }, statT: 0,
    counters: { weapons: 0, trained: 0, raids: 0, born: 0, died: 0, built: 0, chopped: 0 },
    raid: null, score: 0, bestScore: 0, over: false, won: false, notes: [], goalsDone: [], elapsed: 0,
    tips: {}, fieldOf: null, prod: {}, rate: {}, rateT: 0
  });
  seedRand(hashStr(seed + ':sim'));
  const map = generateMap(seed, n, { camp: sc && sc.camp });
  G.map = map;
  const NN = n * n;
  G.occ = new Int32Array(NN);
  G.road = new Uint8Array(NN);
  G.fieldOf = new Int32Array(NN);
  G.ladder = new Float32Array(NN);
  G.reserved = new Int32Array(NN);  // ruta reserverad av invånare (träd/sten/buske)
  G.pg = new PathGrid(n);
  G.flowDirty = true;
  for (let k = 0; k < NN; k++) updatePass(k, false);
  G.pg.bump();
  G.cal = calendar(G.time);
  G.lastSeason = G.cal.season;

  if (opts.restore) { G.allowed = sc && sc.build !== 'all' ? new Set(sc.build) : null; G.deerT = 0; return G; }
  // Resurser
  const st = Object.assign({}, START_STOCK, sc ? sc.stock : {});
  const mult = sc ? 1 : diff.start;
  RES.forEach(r => G.stock[r] = Math.round((st[r] || 0) * (r === 'gold' || r === 'weapons' || r === 'iron' ? mult : mult)));
  // Hallen
  const hall = placeBuilding('hall', map.hall.i, map.hall.j, 0, { instant: true, free: true });
  G.hall = hall;
  // Startbefolkning
  const pop = sc ? sc.pop : Math.round(10 * (diff.start > 1.2 ? 1.2 : 1));
  // etablerad by i senare scenarier: hus så att alla får plats + grundläggande näringar
  const pre = [];
  let need = pop - 8;
  while (need > 0) { pre.push('house'); need -= 6; }
  const scIdx = sc ? CAMPAIGN.indexOf(sc) : -1;
  if (scIdx >= 2) pre.push('woodcutter', 'fisher', 'storehouse');
  if (scIdx >= 3) pre.push('barn', 'field', 'field', 'quarry', 'gatherer');
  if (scIdx >= 4) pre.push('well');
  const around = (cx, cz, r, test) => { let c = 0; for (let j = Math.floor(cz - r); j <= cz + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) { if (i < 0 || j < 0 || i >= n || j >= n) continue; if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cz) ** 2 <= r * r && test(j * n + i)) c++; } return c; };
  let barnB = null;
  for (const t of pre) {
    // välj den bästa platsen nära hallen (huggare vid skog, fiskare vid fiskevatten osv.)
    let best = null, bs = -1e9;
    for (let r = 4; r < 26; r++) for (let a = 0; a < r * 6; a++) {
      const ang = a / (r * 6) * Math.PI * 2;
      const i = Math.round(hall.x + Math.cos(ang) * r - 1), j = Math.round(hall.z + Math.sin(ang) * r - 1);
      const chk = canPlace(t, i, j, 0, { ignoreCost: true, ignoreAllowed: true });
      if (!chk.ok) continue;
      const cx = i + chk.w / 2, cz = j + chk.d / 2;
      let sc2 = -r * (t === 'woodcutter' ? 1.5 : 1);
      if (t === 'woodcutter') { const tr = around(cx, cz, 10, k => map.res[k] === R.TREE); if (tr < 18) continue; sc2 += tr * 0.6; }
      else if (t === 'fisher') sc2 += Math.min(30, chk.fish || 0);
      else if (t === 'quarry') sc2 += around(cx, cz, 10, k => map.res[k] === R.STONE) * 2;
      else if (t === 'gatherer') sc2 += around(cx, cz, 11, k => map.res[k] === R.BERRY) * 2;
      else if (t === 'barn') sc2 += around(cx, cz, 9, k => map.type[k] === T.MEADOW || map.type[k] === T.GRASS) * 0.15;
      else if (t === 'field') { if (!barnB || (cx - barnB.x) ** 2 + (cz - barnB.z) ** 2 > 81) continue; sc2 += chk.meadow * 2; }
      else if (r > 12) continue;
      if (sc2 > bs) { bs = sc2; best = { i, j }; }
    }
    if (best) { const b = placeBuilding(t, best.i, best.j, 0, { instant: true, free: true }); if (t === 'barn') barnB = b; }
  }
  for (let i = 0; i < pop; i++) {
    const c = makeCitizen(hall.x + (rand() - 0.5) * 3, hall.z + hall.d / 2 + 1 + rand() * 1.5);
    if (i < (BUILDINGS.hall.housing || 8)) c.home = hall.id;
  }
  // tillgängliga byggnader
  G.allowed = sc && sc.build !== 'all' ? new Set(sc.build) : null;
  // fiendeläger
  if (sc && sc.camp && map.camp) spawnCamp(map.camp);
  if (G.raidsOn) scheduleFirstRaid();
  recomputeCaps();
  // hjortar
  G.deerT = 0;
  return G;
}

/* =====================================================================
 * Passerbarhet
 * ===================================================================== */
export function updatePass(k, bump = true) {
  const m = G.map, pg = G.pg;
  const t = m.type[k], r = m.res[k];
  let p = PASS_P | PASS_E, c = 1;
  if (t === T.WATER || t === T.ROCK) p = 0;
  else if (r === R.STONE || r === R.ORE) p = 0;
  else {
    const bid = G.occ[k];
    if (bid) {
      const b = G.buildings.get(bid);
      if (b) {
        if (b.def.walkable) p = PASS_P | PASS_E;
        else if (b.def.wall) p = G.ladder[k] > 0 ? PASS_E : 0;
        else if (b.def.gate) p = b.team ? PASS_E : PASS_P;
        else p = 0;
      }
    }
  }
  if (G.road[k]) c = 0.62;
  else if (r === R.TREE && m.grow[k] > 0.3) c = 1.35;
  else if (t === T.SAND) c = 1.1;
  if (pg.pass[k] !== p) {
    pg.pass[k] = p; pg.cost[k] = c;
    if (bump) { pg.bump(); G.flowDirty = true; }
  } else if (pg.cost[k] !== c) {
    pg.cost[k] = c;
    // endast kostnad ändrad (t.ex. träd fällt/väg byggd): vägcachen får vara kvar
    if (bump && G.road[k]) pg.bump();
  }
}

/* =====================================================================
 * Byggnader
 * ===================================================================== */
export function isAllowed(type) {
  if (type === 'hall') return false;
  if (type === 'demolish') return !G.allowed || G.allowed.has('road') || G.allowed.has('wall');
  return !G.allowed || G.allowed.has(type);
}

export function canPlace(type, i0, j0, rot = 0, opts = {}) {
  const def = BUILDINGS[type];
  const m = G.map, n = m.n, N1 = n + 1;
  if (type === 'demolish') {
    const k = j0 * n + i0;
    const r = { ok: false, reason: 'Inget att riva här', bad: [], w: 1, d: 1 };
    if (i0 < 0 || j0 < 0 || i0 >= n || j0 >= n) return r;
    const b = G.occ[k] && G.buildings.get(G.occ[k]);
    if (G.road[k] || (b && !b.team && (b.def.wall || b.def.gate))) { r.ok = true; r.reason = ''; }
    return r;
  }
  const [w, d] = footprint(type, rot);
  const res = { ok: true, reason: '', bad: [], w, d };
  const fail = (why) => { res.ok = false; if (!res.reason) res.reason = why; };
  if (i0 < 1 || j0 < 1 || i0 + w > n - 1 || j0 + d > n - 1) { fail('Utanför ön'); return res; }
  let mn = 1e9, mx = -1e9, fertile = 0, meadow = 0;
  for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) {
    const k = j * n + i;
    const t = m.type[k], r = m.res[k];
    let bad = false;
    if (t === T.WATER) { bad = true; fail('Kan inte bygga på vatten'); }
    else if (t === T.ROCK) { bad = true; fail('Berget är för brant'); }
    else if (r === R.STONE || r === R.ORE) { bad = true; fail('Sten eller malm i vägen'); }
    else if (G.occ[k]) {
      const ob = G.buildings.get(G.occ[k]);
      if (!(type === 'road' && ob && ob.type === 'road')) { bad = true; fail('Upptaget'); }
      if (type === 'road' && ob && ob.type === 'road') { bad = true; res.dupe = true; }
    } else if (type === 'road' && G.fieldOf[k]) { bad = true; fail('Upptaget'); }
    if (t === T.MEADOW) { meadow++; fertile++; } else if (t === T.GRASS) fertile++;
    if (bad) res.bad.push(k);
  }
  for (let j = j0; j <= j0 + d; j++) for (let i = i0; i <= i0 + w; i++) { const v = m.h[j * N1 + i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const maxSlope = w * d <= 1 ? 2.2 : (w * d <= 4 ? 1.5 : 1.8);
  if (mx - mn > maxSlope && type !== 'road') fail('För brant');
  // krav
  const ringHas = (dist, test) => {
    let c = 0;
    for (let j = j0 - dist; j < j0 + d + dist; j++) for (let i = i0 - dist; i < i0 + w + dist; i++) {
      if (i >= i0 && i < i0 + w && j >= j0 && j < j0 + d) continue;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (test(j * n + i)) c++;
    }
    return c;
  };
  if (def.req === 'coast' && !ringHas(3, k => m.type[k] === T.WATER)) fail('Måste ligga nära vatten');
  if (def.req === 'shore') { if (ringHas(1, k => m.type[k] === T.WATER) < 3) fail('Måste ligga vid strandkanten'); }
  if (def.req === 'ore' && !ringHas(2, k => m.res[k] === R.ORE && m.amt[k] > 0)) fail('Måste ligga intill malm');
  if (def.req === 'stone') {
    const cx = i0 + w / 2, cz = j0 + d / 2, rr = def.radius;
    let found = false;
    for (let j = Math.max(0, Math.floor(cz - rr)); j < Math.min(n, cz + rr) && !found; j++) for (let i = Math.max(0, Math.floor(cx - rr)); i < Math.min(n, cx + rr); i++) {
      const k = j * n + i; if (m.res[k] === R.STONE && m.amt[k] > 0 && Math.hypot(i + 0.5 - cx, j + 0.5 - cz) <= rr) { found = true; break; }
    }
    if (!found) fail('Inga stenblock i närheten');
  }
  if (def.req === 'fertile' && fertile < 5) fail('Behöver gräs- eller ängsmark');
  if (type === 'fisher' || type === 'harbor') {
    const cx = i0 + w / 2, cz = j0 + d / 2, rr = type === 'harbor' ? 16 : def.radius;
    let fish = 0;
    for (let j = Math.max(0, Math.floor(cz - rr)); j < Math.min(n, cz + rr); j++) for (let i = Math.max(0, Math.floor(cx - rr)); i < Math.min(n, cx + rr); i++) {
      const k = j * n + i; if (m.res[k] === R.FISH && Math.hypot(i + 0.5 - cx, j + 0.5 - cz) <= rr) fish++;
    }
    res.fish = fish;
    if (!fish) fail('Inget fiskevatten i närheten');
  }
  res.meadow = meadow;
  if (!opts.ignoreCost && !canAfford(buildCost(type))) fail('Inte råd – saknar ' + Object.entries(buildCost(type)).filter(([k, v]) => (G.stock[k] || 0) < v).map(([k, v]) => Math.ceil(v - (G.stock[k] || 0)) + ' ' + RES_INFO[k].name.toLowerCase()).join(' och '));
  if (!opts.ignoreAllowed && !isAllowed(type)) fail('Inte tillgänglig här');
  return res;
}

/** Verklig byggkostnad. En huggarstuga är gratis när träet tagit slut – annars kan man låsa sig utan trä. */
export function buildCost(type) {
  const def = BUILDINGS[type]; if (!def) return {};
  if (type === 'woodcutter' && G.stock && (G.stock.wood || 0) < (def.cost.wood || 0)) return {};
  return def.cost;
}
export function canAfford(cost, mult = 1) {
  for (const k in cost) if ((G.stock[k] || 0) < Math.ceil(cost[k] * mult)) return false;
  return true;
}
export function pay(cost, mult = 1) { for (const k in cost) G.stock[k] -= Math.ceil(cost[k] * mult); }
export function refund(cost, f) { for (const k in cost) G.stock[k] = Math.min(G.cap[k] || 1e9, G.stock[k] + Math.floor(cost[k] * f)); }

/** Placera byggnad. opts: instant, free, team, lvl */
export function placeBuilding(type, i0, j0, rot = 0, opts = {}) {
  const def = BUILDINGS[type] || opts.def;
  const m = G.map, n = m.n;
  if (type === 'demolish') {
    const k = j0 * n + i0;
    const b = G.occ[k] && G.buildings.get(G.occ[k]);
    if (b && !b.team && (b.def.wall || b.def.gate)) removeBuilding(b, { refund: true });
    else if (G.road[k]) { G.road[k] = 0; updatePass(k); G.pg.bump(); hooks.onTileChanged(k); }
    hooks.fx('dust', i0 + 0.5, heightAt(i0 + 0.5, j0 + 0.5) + 0.2, j0 + 0.5, 4);
    return null;
  }
  const [w, d] = opts.def ? opts.def.size : footprint(type, rot);
  if (!opts.free) pay(BUILDINGS[type] ? buildCost(type) : def.cost);
  const b = {
    id: opts.id || nextId(), type, def, i: i0, j: j0, w, d, rot, lvl: opts.lvl || 1,
    x: i0 + w / 2, z: j0 + d / 2, y: 0,
    built: !!opts.instant || !!def.instant, progress: opts.instant || def.instant ? 1 : 0,
    hp: 0, maxHp: def.hp, fire: 0, workers: [], want: def.workers || 0, paused: false,
    team: opts.team || 0, queue: [], cd: 0, builders: 0, lastHit: -99, inside: [], meadow: 0
  };
  b.hp = b.built ? b.maxHp : Math.max(1, b.maxHp * 0.1);
  if (type === 'field') b.field = { state: 'fallow', grow: 0, yield: 0 };
  // rensa och markera rutor
  for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) {
    const k = j * n + i;
    if (m.res[k] === R.TREE || m.res[k] === R.BERRY) { m.res[k] = 0; m.grow[k] = 0; m.amt[k] = 0; hooks.onTreeChanged(k); }
    if (type === 'road') { G.road[k] = 1; continue; }
    G.occ[k] = b.id;
    if (type === 'field') { G.fieldOf[k] = b.id; if (m.type[k] === T.MEADOW) b.meadow++; }
  }
  if (type !== 'road' && type !== 'field' && !def.wall && !def.gate && !opts.noFlatten) b.y = flattenData(i0, j0, w, d);
  else b.y = heightAt(b.x, b.z);
  if (opts.restore) b.y = heightAt(b.x, b.z);
  if (def.req === 'shore') b.face = shoreFacing(b);
  if (type === 'road') {
    // vägar är inga riktiga byggnader – endast rutmarkering
    for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) { updatePass(j * n + i); hooks.onTileChanged(j * n + i); }
    G.counters.built++;
    return null;
  }
  G.buildings.set(b.id, b);
  for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) { updatePass(j * n + i); hooks.onTileChanged(j * n + i); }
  G.pg.bump(); G.flowDirty = true;
  if (!def.walkable) evictFrom(b);
  hooks.onBuildingAdded(b);
  if (b.built) onBuilt(b, true);
  return b;
}

/** Planar ut höjddatan under en byggnad och meddelar renderingen. */
export function flattenData(i0, j0, w, d) {
  const m = G.map, n = m.n, N1 = n + 1, h = m.h;
  let s = 0, c = 0;
  for (let j = j0; j <= j0 + d; j++) for (let i = i0; i <= i0 + w; i++) { s += h[j * N1 + i]; c++; }
  const avg = Math.max(0.12, s / c);
  for (let j = j0; j <= j0 + d; j++) for (let i = i0; i <= i0 + w; i++) h[j * N1 + i] = avg;
  hooks.onTerrain && hooks.onTerrain(i0 - 1, j0 - 1, w + 2, d + 2);
  return avg;
}

/** Flyttar figurer som står inuti en ny byggnad till närmaste fria ruta. */
function evictFrom(b) {
  const n = G.map.n;
  const inside = e => e.x >= b.i && e.x < b.i + b.w && e.z >= b.j && e.z < b.j + b.d;
  const list = G.citizens.filter(c => !c.inside).concat(G.units, G.enemies);
  for (const e of list) {
    if (!inside(e)) continue;
    let best = null, bd = 1e9;
    const mask = e.team ? 2 : 1;
    for (let j = b.j - 2; j <= b.j + b.d + 1; j++) for (let i = b.i - 2; i <= b.i + b.w + 1; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const k = j * n + i; if (!(G.pg.pass[k] & mask)) continue;
      const d = (i + 0.5 - e.x) ** 2 + (j + 0.5 - e.z) ** 2 - Math.min(G.pg.regionSize(k, mask), 200) * 0.05; if (d < bd) { bd = d; best = k; }
    }
    if (best != null) { e.x = (best % n) + 0.5; e.z = Math.floor(best / n) + 0.5; e.y = heightAt(e.x, e.z); if (e.ax != null) { e.ax = e.x; e.az = e.z; } e.path = null; }
  }
}

function shoreFacing(b) { return shoreFace(b.i, b.j, b.w, b.d); }
/** Vilken sida av en hamn vetter mot vattnet? 0:+z 1:+x 2:-z 3:-x. Närmare vatten väger tyngre. */
export function shoreFace(i0, j0, w, d) {
  const m = G.map, n = m.n;
  const water = (i, j) => i >= 0 && j >= 0 && i < n && j < n && m.type[j * n + i] === T.WATER;
  const sides = [0, 0, 0, 0];
  for (let t = 1; t <= 4; t++) {
    const wt = 5 - t;
    for (let a = 0; a < w; a++) { if (water(i0 + a, j0 + d - 1 + t)) sides[0] += wt; if (water(i0 + a, j0 - t)) sides[2] += wt; }
    for (let a = 0; a < d; a++) { if (water(i0 + w - 1 + t, j0 + a)) sides[1] += wt; if (water(i0 - t, j0 + a)) sides[3] += wt; }
  }
  let best = 0; for (let s2 = 1; s2 < 4; s2++) if (sides[s2] > sides[best]) best = s2;
  return best;
}

export function onBuilt(b, silent) {
  b.built = true; b.progress = 1; b.hp = b.maxHp;
  recomputeCaps();
  if (!silent) {
    G.counters.built++;
    hooks.notify((b.lvl > 1 ? 'Utbyggt: ' : 'Färdigbyggt: ') + bname(b), 'good', { x: b.x, z: b.z });
    hooks.sfx('levelup', b.x, b.z, { vol: 0.6 });
    hooks.fx('dust', b.x, b.y + 0.3, b.z, 14);
  }
  hooks.onBuildingChanged(b);
}

export function removeBuilding(b, opts = {}) {
  if (!G.buildings.has(b.id)) return;
  const m = G.map, n = m.n;
  G.buildings.delete(b.id);
  for (let j = b.j; j < b.j + b.d; j++) for (let i = b.i; i < b.i + b.w; i++) {
    const k = j * n + i;
    if (G.occ[k] === b.id) G.occ[k] = 0;
    if (G.fieldOf[k] === b.id) G.fieldOf[k] = 0;
    G.ladder[k] = 0;
    updatePass(k, false); hooks.onTileChanged(k);
  }
  G.pg.bump(); G.flowDirty = true;
  // frigör invånare
  for (const c of G.citizens) {
    if (c.job === b.id) { c.job = 0; c.state = 'idle'; c.task = null; }
    if (c.home === b.id) c.home = 0;
    if (c.insideId === b.id) { c.inside = false; c.insideId = 0; c.state = 'idle'; c.task = null; }
    if (c.task && c.task.bid === b.id) { c.task = null; c.state = 'idle'; c.path = null; }
  }
  for (const u of G.units) if (u.home === b.id) u.home = 0;
  if (opts.refund) refund(b.def.cost, b.built ? 0.4 : 0.8);
  if (opts.destroyed) {
    hooks.fx('debris', b.x, b.y + 0.4, b.z, 30);
    hooks.sfx('boom', b.x, b.z, { vol: 0.7 });
    if (b.team === 0 && !b.def.wall) hooks.notify(b.def.name + ' förstördes!', 'bad', { x: b.x, z: b.z });
  }
  if (G.sel && G.sel.kind === 'building' && G.sel.b === b) G.sel = null;
  hooks.onBuildingRemoved(b);
  recomputeCaps();
  if (b === G.hall && opts.destroyed && !G.over) hooks.onGameOver('Hövdingahallen har fallit. Nordheim är förlorat.');
  if (b.type === 'jarlhall' && opts.destroyed) { G.campDestroyed = true; }
}

export function upgradeBuilding(b) {
  const lv = b.def.lvl;
  if (!lv || b.lvl > 1 || !b.built) return false;
  if (!canAfford(lv.cost)) return false;
  pay(lv.cost);
  b.lvl = 2;
  b.maxHp = lv.hp || b.maxHp;
  b.built = false; b.progress = 0.35; b.upgrading = true;
  if (lv.workers) b.want = lv.workers;
  hooks.onBuildingChanged(b);
  hooks.sfx('place', b.x, b.z);
  return true;
}

export function bstat(b, key) {
  if (b.lvl > 1 && b.def.lvl && b.def.lvl[key] != null) return b.def.lvl[key];
  return b.def[key];
}
export function bname(b) { return b.lvl > 1 && b.def.lvl ? b.def.lvl.name : b.def.name; }

export function recomputeCaps() {
  const cap = {};
  RES.forEach(r => cap[r] = 0);
  let housing = 0, soldierCap = 0;
  for (const b of G.buildings.values()) {
    if (!b.built && !b.upgrading || b.team) continue;
    const st = bstat(b, 'store');
    if (st && (b.built || b.upgrading)) {
      if (st.all) RES.forEach(r => cap[r] += st.all);
      if (st.food) cap.food += st.food;
    }
    if (b.type === 'harbor' && b.built) cap.food += 150;
    if (b.built) { housing += bstat(b, 'housing') || 0; soldierCap += bstat(b, 'soldiers') || 0; }
    else if (b.upgrading) { housing += b.def.housing || 0; soldierCap += b.def.soldiers || 0; }
  }
  cap.gold = 99999;
  G.cap = cap;
  G.housing = housing;
  G.soldierCap = soldierCap;
  for (const r of RES) if (G.stock[r] > cap[r]) G.stock[r] = cap[r];
}

export function storageFor(res, x, z) {
  let best = null, bd = 1e9;
  for (const b of G.buildings.values()) {
    if (!b.built || b.team) continue;
    const st = bstat(b, 'store');
    const ok = (st && (st.all || (res === 'food' && st.food))) || (res === 'food' && b.type === 'harbor');
    if (!ok) continue;
    const d = (b.x - x) ** 2 + (b.z - z) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function addStock(r, n, x, z) {
  const room = (G.cap[r] || 0) - G.stock[r];
  const add = Math.max(0, Math.min(room, n));
  G.stock[r] += add;
  G.prod = G.prod || {}; G.prod[r] = (G.prod[r] || 0) + add;
  if (add > 0 && x != null) hooks.float('+' + add + ' ' + RES_INFO[r].icon, x, z, r);
  if (add < n && !G._fullWarn) { G._fullWarn = 20; hooks.notify('Lagret för ' + RES_INFO[r].name.toLowerCase() + ' är fullt – bygg en lagerbod', 'warn'); }
  return add;
}

export function population() { return G.citizens.length + G.units.length; }
/** Matförbrukning per dygn just nu. */
export function foodUse() { return population() * FOOD_PER_DAY * (G.cal && G.cal.season === 3 ? 1.35 : 1); }

/* =====================================================================
 * Huvudtick
 * ===================================================================== */
let slowT = 0, natT = 0, popT = 0, happyT = 0, goalT = 0;
export function resetTimers() { slowT = natT = popT = happyT = goalT = 0; }

export function tick(dt) {
  if (!G.on || G.over) return;
  G.time += dt; G.elapsed += dt;
  const cal = calendar(G.time);
  const prev = G.cal;
  G.cal = cal;
  if (cal.season !== G.lastSeason) onSeasonChange(cal.season);
  if (prev && prev.dayN !== cal.dayN && cal.phase < 0.1) { /* ny dag */ }
  if (G._fullWarn > 0) G._fullWarn -= dt;

  // Ekonomi kontinuerligt
  const pop = population();
  const winter = cal.season === 3;
  const eat = pop * FOOD_PER_DAY / DAY * (winter ? 1.35 : 1) * dt;
  G.foodAcc = (G.foodAcc || 0) + eat;
  if (G.foodAcc >= 1) {
    const take = Math.floor(G.foodAcc);
    G.foodAcc -= take;
    if (G.stock.food >= take) { G.stock.food -= take; G.starve = Math.max(0, G.starve - dt * 2); }
    else { G.stock.food = 0; }
  }
  if (G.stock.food <= 0 && pop > 0) G.starve += dt; else G.starve = Math.max(0, G.starve - dt);
  // skatt
  const taxRate = [0.35, 0.8, 1.6][G.tax];
  const market = hasStaffed('market');
  G.goldAcc = (G.goldAcc || 0) + G.citizens.length * taxRate / DAY * dt * (market ? 1.3 : 1);
  if (G.goldAcc >= 1) { const g = Math.floor(G.goldAcc); G.goldAcc -= g; G.stock.gold += g; }

  citizenTick(dt);
  combatTick(dt);
  natT += dt; if (natT >= 1) { natureTick(natT); natT = 0; }
  happyT += dt; if (happyT >= 2) { happinessTick(); happyT = 0; }
  popT += dt; if (popT >= 1) { populationTick(popT); popT = 0; }
  goalT += dt; if (goalT >= 1) { goalsTick(); goalT = 0; }
  G.statT += dt; if (G.statT >= 15) { G.statT = 0; recordStats(); }
  // produktionstakt per dygn (glidande medel) – visas i resurs-popupen
  G.rateT = (G.rateT || 0) + dt;
  if (G.rateT >= 10) {
    const f = DAY / G.rateT; G.rate = G.rate || {}; G.prod = G.prod || {};
    const keys = new Set(Object.keys(G.prod).concat(Object.keys(G.rate)));
    for (const k of keys) { const v = (G.prod[k] || 0) * f; G.rate[k] = G.rate[k] == null ? v : G.rate[k] * 0.75 + v * 0.25; G.prod[k] = 0; }
    G.rateT = 0;
  }
  G.happyShown += (G.happiness - G.happyShown) * Math.min(1, dt * 0.5);
}

function onSeasonChange(s) {
  G.lastSeason = s;
  const names = ['Våren har kommit 🌱', 'Det är sommar ☀️', 'Hösten är här 🍂', 'Vintern har kommit ❄️ – maten går åt fortare'];
  hooks.notify(names[s], s === 3 ? 'warn' : 'info');
  if (s === 0) {
    // ny vår: bärbuskar börjar om
    const m = G.map; for (let k = 0; k < m.n * m.n; k++) if (m.res[k] === R.BERRY && m.amt[k] < 2) { m.amt[k] = 2; hooks.onTreeChanged(k); }
  }
  if (s === 3) {
    // vinter: omogna åkrar fryser bort
    for (const b of G.buildings.values()) if (b.field && b.field.state === 'growing' && b.field.grow < 0.6) { b.field.state = 'fallow'; b.field.grow = 0; hooks.onBuildingChanged(b); }
  }
  hooks.onSeason && hooks.onSeason(s);
}

export function hasStaffed(type) {
  for (const b of G.buildings.values()) if (b.type === type && b.built && !b.team && b.workers.length > 0) return true;
  return false;
}

function natureTick(dt) {
  const m = G.map, n = m.n;
  const season = G.cal.season;
  const winter = season === 3;
  // träd, stubbar – gå igenom bara aktiva rutor
  if (!G.growing) { G.growing = new Set(); for (let k = 0; k < n * n; k++) if (m.res[k] === R.TREE && m.grow[k] < 1) G.growing.add(k); }
  for (const k of G.growing) {
    if (m.res[k] !== R.TREE) { G.growing.delete(k); continue; }
    const g0 = m.grow[k];
    if (g0 < 0) { m.grow[k] = Math.min(0, g0 + dt / STUMP_TIME * (winter ? 0.3 : 1)); if (m.grow[k] >= 0) { m.grow[k] = 0.001; hooks.onTreeChanged(k); updatePass(k); } }
    else if (!winter) {
      m.grow[k] = Math.min(1, g0 + dt / TREE_GROW);
      if (Math.floor(g0 * 8) !== Math.floor(m.grow[k] * 8)) hooks.onTreeChanged(k);
      if (m.grow[k] >= 1) G.growing.delete(k);
    }
  }
  // åkrar
  for (const b of G.buildings.values()) {
    if (!b.field || !b.built) continue;
    const f = b.field;
    if (f.state === 'growing' && !winter) {
      const old = f.grow;
      f.grow = Math.min(1, f.grow + dt / FIELD_GROW * (1 + b.meadow * 0.04));
      if (f.grow >= 1) { f.state = 'ripe'; hooks.onBuildingChanged(b); }
      else if (Math.floor(old * 10) !== Math.floor(f.grow * 10)) hooks.onBuildingChanged(b);
    }
  }
  // bär återväxer sommar/höst
  if (season !== 3) {
    G.berryT = (G.berryT || 0) + dt;
    if (G.berryT > (season === 0 ? 20 : 9)) {
      G.berryT = 0;
      for (let k = 0; k < n * n; k++) if (m.res[k] === R.BERRY && m.amt[k] < 6) { m.amt[k] = Math.min(6, m.amt[k] + 1); hooks.onTreeChanged(k); }
    }
  }
  // fisk förnyas
  G.fishT = (G.fishT || 0) + dt;
  if (G.fishT > 8) {
    G.fishT = 0;
    for (let k = 0; k < n * n; k++) if (m.res[k] === R.FISH && m.amt[k] < 30) m.amt[k] = Math.min(30, m.amt[k] + (winter ? 0.5 : 1.5));
  }
  // stegar försvinner
  for (let k = 0; k < n * n; k++) if (G.ladder[k] > 0) { G.ladder[k] -= dt; if (G.ladder[k] <= 0) { G.ladder[k] = 0; updatePass(k); hooks.onBuildingChanged(G.buildings.get(G.occ[k])); } }
}

function happinessTick() {
  const cit = G.citizens;
  let sum = 0;
  const temples = [], markets = [], wells = [];
  for (const b of G.buildings.values()) {
    if (!b.built || b.team) continue;
    if (b.type === 'temple' && b.workers.length) temples.push(b);
    else if (b.type === 'market' && b.workers.length) markets.push(b);
    else if (b.type === 'well') wells.push(b);
  }
  const now = G.time;
  let variety = 0; for (const t in G.foodTypeT) if (now - G.foodTypeT[t] < DAY * 1.5) variety++;
  G.variety = variety;
  // arbetslöshet: lediga som inte bygger eller tränar gör byn rastlös
  let idle = 0;
  for (const c of cit) if (!c.job && !c.trainee && !(c.task && (c.task.type === 'build' || c.task.type === 'repair'))) idle++;
  // de första minuterna och ett par lediga (byggare) räknas inte
  const idleEff = Math.max(0, idle - 4);
  const idlePen = cit.length >= 10 && G.time > 300 ? -Math.max(0, Math.min(8, Math.round((idleEff / cit.length - 0.35) * 25))) : 0;
  const raidPen = G.enemies.some(e => !e.guard) ? -8 : 0;
  const base = 45 + Math.min(12, Math.max(0, variety - 1) * 4) + [8, 0, -15][G.tax]
    - (G.stock.food <= 0 ? 35 : (G.stock.food < population() ? 10 : 0))
    - Math.min(15, G.lossMood) + raidPen - (G.cal.season === 3 ? 4 : 0) + idlePen;
  G.happyParts = { base: 45, variety: Math.min(12, Math.max(0, variety - 1) * 4), tax: [8, 0, -15][G.tax], hunger: G.stock.food <= 0 ? -35 : (G.stock.food < population() ? -10 : 0), loss: -Math.min(15, Math.round(G.lossMood)), raid: raidPen, winter: G.cal.season === 3 ? -4 : 0, idle: idlePen };
  G.idleCount = idle;
  let tSum = 0, mSum = 0, hSum = 0, wSum = 0;
  for (const c of cit) {
    let h = base;
    const home = c.home ? G.buildings.get(c.home) : null;
    if (!home) { h -= 25; hSum -= 25; }
    else {
      let tb = 0;
      for (const t of temples) { const r = bstat(t, 'radius') + (t.lvl > 1 ? 6 : 0); if ((t.x - home.x) ** 2 + (t.z - home.z) ** 2 < r * r) tb = Math.max(tb, t.lvl > 1 ? 24 : 16); }
      h += tb; tSum += tb;
      for (const mk of markets) { if ((mk.x - home.x) ** 2 + (mk.z - home.z) ** 2 < 256) { h += 8; mSum += 8; break; } }
      for (const w of wells) { if ((w.x - home.x) ** 2 + (w.z - home.z) ** 2 < 121) { h += 3; wSum += 3; break; } }
    }
    c.happy = clamp(h, 0, 100);
    sum += c.happy;
  }
  const nC = Math.max(1, cit.length);
  G.happyParts.temple = Math.round(tSum / nC); G.happyParts.market = Math.round(mSum / nC); G.happyParts.well = Math.round(wSum / nC); G.happyParts.homeless = Math.round(hSum / nC);
  G.happiness = cit.length ? sum / cit.length : 50;
  G.lossMood = Math.max(0, G.lossMood - 0.25);
}

function populationTick(dt) {
  const pop = population();
  G.growT = (G.growT || 0) + dt;
  G.leaveT = (G.leaveT || 0) + dt;
  // förvarning om matbrist
  // förvarning: räkna på nettot (produktion − förbrukning), inte bara lagret
  const use = foodUse(), net = ((G.rate && G.rate.food) || 0) - use;
  const daysLeft = net < 0 ? G.stock.food / -net : 99;
  if (pop > 0 && G.stock.food > 0 && G.time > 150 && (daysLeft < 2 || G.stock.food < pop * 2.5) && (!G._foodWarn || G.time - G._foodWarn > 75)) {
    G._foodWarn = G.time;
    hooks.notify('Maten räcker bara ' + (daysLeft < 1 ? 'mindre än ett dygn' : 'ungefär ' + Math.round(daysLeft) + ' dygn') + '! Bygg fler fiskarhyddor, jägarstugor eller åkrar.', 'warn');
  }
  if (G.citizens.length === 0 && !G.over && G.time > 5) { hooks.onGameOver('Alla invånare har lämnat Nordheim.'); return; }
  // svält
  if (G.starve > 25 && pop > 0) {
    G.starve = 5;
    const victim = G.citizens.length ? G.citizens[Math.floor(rand() * G.citizens.length)] : G.units[0];
    if (victim) {
      killPerson(victim, 'svalt ihjäl');
      hooks.notify('Svält! ' + victim.name + ' har svultit ihjäl. Skaffa mer mat!', 'bad', { x: victim.x, z: victim.z });
    }
  }
  const free = G.housing - G.citizens.length;
  const interval = G.happiness > 75 ? 9 : G.happiness > 55 ? 14 : 22;
  if (G.growT > interval) {
    G.growT = 0;
    const fnet = ((G.rate && G.rate.food) || 0) - foodUse();
    const foodOk = G.stock.food > pop * 1.4 + 8 && (fnet >= 0 || G.stock.food > foodUse() * 2.5 || G.time < 240);
    if (free > 0 && foodOk && G.happiness >= 35 && G.starve <= 0) {
      const hall = G.hall;
      if (hall && G.buildings.has(hall.id)) {
        const c = makeCitizen(hall.x + (rand() - 0.5) * 2, hall.z + hall.d / 2 + 0.8);
        G.counters.born++;
        hooks.fx('sparkle', c.x, heightAt(c.x, c.z) + 0.5, c.z, 8);
        if (G.citizens.length % 5 === 0) hooks.notify('Nya nybyggare har anlänt – ni är nu ' + population(), 'good');
      }
    } else if (free <= 0 && G.happiness >= 35 && G.stock.food > pop * 1.4 + 8) {
      if (!G._houseHint || G.time - G._houseHint > 120) { G._houseHint = G.time; hooks.notify('Folk vill flytta hit men det saknas bostäder – bygg fler långhus', 'info'); }
    } else if (free > 0 && G.happiness < 35 && G.time > 60) {
      if (!G._moodHint || G.time - G._moodHint > 150) { G._moodHint = G.time; hooks.notify('Ingen flyttar in – folket är för missnöjt (glädje under 35 %). Håll pekaren över 🙂 för att se varför.', 'info'); }
    } else if (free > 0 && !foodOk && G.time > 60) {
      if (!G._foodHint || G.time - G._foodHint > 150) { G._foodHint = G.time; hooks.notify('Ingen flyttar in – byn producerar för lite mat för fler munnar. Bygg fler matkällor.', 'info'); }
    }
  }
  // många utan arbete – tipsa om fler arbetsplatser
  if ((G.idleCount || 0) >= 8 && G.idleCount > G.citizens.length * 0.4 && G.time > 240 && (!G._idleHint || G.time - G._idleHint > 180)) {
    let sites = 0; for (const b of G.buildings.values()) if (!b.built && !b.team) sites++;
    if (!sites) { G._idleHint = G.time; hooks.notify(G.idleCount + ' invånare saknar arbete – bygg fler arbetsplatser (arbetslöshet sänker glädjen)', 'info'); }
  }
  if (G.happiness < 22 && G.leaveT > 30 && G.citizens.length > 2) {
    G.leaveT = 0;
    const c = G.citizens[Math.floor(rand() * G.citizens.length)];
    hooks.notify(c.name + ' var missnöjd och lämnade byn', 'bad');
    removeCitizen(c);
  } else if (G.happiness >= 22) G.leaveT = 0;
}

export function removeCitizen(c) {
  const i = G.citizens.indexOf(c); if (i >= 0) G.citizens.splice(i, 1);
  if (c.job) { const b = G.buildings.get(c.job); if (b) b.workers = b.workers.filter(id => id !== c.id); }
  if (c.task && c.task.k != null && G.reserved[c.task.k] === c.id) G.reserved[c.task.k] = 0;
  if (G.sel && G.sel.kind === 'citizen' && G.sel.c === c) G.sel = null;
}
export function killPerson(p, why) {
  G.counters.died++;
  G.lossMood = Math.min(15, G.lossMood + 3);
  if (p.kind === 'cit') removeCitizen(p);
  else { const i = G.units.indexOf(p); if (i >= 0) G.units.splice(i, 1); p.dead = true; if (G.selUnits) G.selUnits.delete(p); }
  G.corpses.push({ x: p.x, z: p.z, y: p.y || heightAt(p.x, p.z), t: 0, yaw: p.yaw || 0, team: 0 });
}

function recordStats() {
  const s = G.stats;
  s.t.push(G.time); s.pop.push(population()); s.food.push(G.stock.food); s.wood.push(G.stock.wood); s.stone.push(G.stock.stone);
  s.gold.push(G.stock.gold); s.happy.push(Math.round(G.happiness)); s.soldiers.push(G.units.length);
  const max = 400;
  if (s.t.length > max) for (const k in s) s[k].splice(0, s[k].length - max);
}

/* ---------- Mål ---------- */
export function goalProgress(g) {
  switch (g.type) {
    case 'pop': return [population(), g.n];
    case 'stock': return [Math.floor(G.stock[g.res]), g.n];
    case 'build': { let c = 0; for (const b of G.buildings.values()) if (b.type === g.b && b.built && !b.team) c++; return [c, g.n]; }
    case 'raids': return [G.counters.raids, g.n];
    case 'happy': return [Math.round(G.happiness), g.n];
    case 'units': return [G.counters.trained, g.n];
    case 'weapons': return [G.counters.weapons, g.n];
    case 'destroyCamp': return [G.campDestroyed ? 1 : 0, 1];
    case 'survive': {
      // räknas i dygn kvar till målet (visas som dygn klara / totalt)
      const target = ((g.year - 1) * 4 + g.season) * DAYS_PER_SEASON;
      return [Math.min(target, Math.floor(G.time / DAY)), target];
    }
  }
  return [0, 1];
}
function goalsTick() {
  const sc = G.sc;
  // överlevnadspoäng
  if (G.mode === 'survival') G.score = G.counters.raids * population();
  if (!sc || G.won) return;
  let all = true;
  sc.goals.forEach((g, i) => {
    const [a, b] = goalProgress(g);
    const done = a >= b;
    // poäng-/byggmål räknas som klara när de nåtts en gång (utom pop/happy/stock som måste gälla samtidigt)
    const sticky = g.type === 'build' || g.type === 'raids' || g.type === 'units' || g.type === 'weapons' || g.type === 'destroyCamp' || g.type === 'survive';
    if (done && sticky && !G.goalsDone[i]) { G.goalsDone[i] = true; hooks.onObjective(g); }
    if (!(done || (sticky && G.goalsDone[i]))) all = false;
  });
  if (all) { G.won = true; hooks.onVictory(); return; }
  if (sc.deadline) {
    const c = G.cal;
    if (c.year > sc.deadline.year || (c.year === sc.deadline.year && c.season >= sc.deadline.season)) {
      hooks.onGameOver('Tiden tog slut – målen nåddes inte ' + sc.deadline.label + '.');
    }
  }
}

export function deadlineLeft() {
  const sc = G.sc; if (!sc || !sc.deadline) return null;
  const t = ((sc.deadline.year - 1) * 4 + sc.deadline.season) * DAYS_PER_SEASON * DAY;
  return t - G.time;
}

/* ---------- Handel ---------- */
export const TRADE = { wood: 1.0, stone: 1.4, food: 0.9, iron: 3.0, weapons: 7.0 };
export function tradeRates() {
  const merchant = G.merchantT > 0;
  return { buy: merchant ? 0.85 : 1.15, sell: merchant ? 0.75 : 0.5 };
}
export function trade(res, amount, buy) {
  const r = tradeRates();
  const base = TRADE[res];
  if (buy) {
    const price = Math.ceil(base * amount * r.buy);
    if (G.stock.gold < price) return false;
    if (G.stock[res] + amount > G.cap[res]) return false;
    G.stock.gold -= price; G.stock[res] += amount;
  } else {
    if (G.stock[res] < amount) return false;
    const price = Math.floor(base * amount * r.sell);
    G.stock[res] -= amount; G.stock.gold += price;
  }
  return true;
}

/* ---------- Kasern ---------- */
export function queueUnit(b, type) {
  const def = UNITS[type];
  if (!canAfford(def.cost)) return 'Inte råd – ' + def.name.toLowerCase() + ' kostar ' + Object.entries(def.cost).map(([k, v]) => v + ' ' + RES_INFO[k].name.toLowerCase()).join(', ');
  const queued = [...G.buildings.values()].reduce((s, x) => s + (x.queue ? x.queue.length : 0), 0);
  if (G.units.length + queued >= G.soldierCap) return 'Kasernerna är fulla – bygg ut kasernen (U) eller bygg en till';
  const idle = G.citizens.filter(c => !c.job && !c.trainee).length;
  if (idle <= queued) return 'Ingen ledig invånare att träna – minska antalet arbetare någonstans';
  pay(def.cost);
  b.queue.push({ type, t: 0 });
  return null;
}
export { makeUnit };
