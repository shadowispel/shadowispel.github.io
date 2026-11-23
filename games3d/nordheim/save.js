// Nordheim – sparning och laddning (IndexedDB via kit.kv).
import { kv } from '../../engine/kit.js';
import { BUILDINGS, ENEMIES } from './data.js';
import { G, calendar, heightAt } from './state.js';
import { newGame, placeBuilding, updatePass, recomputeCaps, population } from './sim.js';
import { makeCitizen } from './citizens.js';
import { makeUnit, CAMP_DEFS } from './combat.js';

export const SLOTS = ['auto', '1', '2', '3'];
const KEY = s => 'nordheim:save:' + s;

const toF32 = a => a instanceof Float32Array ? a : Float32Array.from(Array.isArray(a) ? a : Object.values(a || {}));
const toU8 = a => a instanceof Uint8Array ? a : Uint8Array.from(Array.isArray(a) ? a : Object.values(a || {}));

export function serialize() {
  const m = G.map;
  const cal = G.cal;
  const data = {
    v: 1,
    meta: {
      mode: G.mode, scenario: G.scenario, scName: G.sc ? G.sc.name : null, pop: population(), year: cal.year, season: cal.season,
      date: Date.now(), raids: G.counters.raids, diff: G.diffId, size: G.size
    },
    opts: { mode: G.mode, scenario: G.scenario, diff: G.diffId, size: G.size, seed: G.seed, raids: G.raidsOn },
    time: G.time, elapsed: G.elapsed, nextId: G.nextId, stock: { ...G.stock }, tax: G.tax, alarmAuto: G.alarmAuto,
    counters: { ...G.counters }, stats: JSON.parse(JSON.stringify(G.stats)), goalsDone: G.goalsDone.slice(),
    raid: G.raid ? { wave: G.raid.wave, next: G.raid.next, warned: G.raid.warned, active: G.raid.active, startT: G.raid.startT, units: G.raid.units ? G.raid.units.slice() : null, spawns: G.raid.spawns ? G.raid.spawns.map(s => ({ ...s })) : [] } : null,
    score: G.score, bestScore: G.bestScore, happiness: G.happiness, lossMood: G.lossMood, foodTypeT: { ...G.foodTypeT },
    merchantT: G.merchantT || 0, lastMerchantSeason: G.lastMerchantSeason, campAlive: !!G.campAlive, campDestroyed: !!G.campDestroyed,
    won: G.won, tutorial: G.tutStep || 0,
    map: { h: new Float32Array(m.h), res: new Uint8Array(m.res), amt: new Float32Array(m.amt), grow: new Float32Array(m.grow) },
    road: new Uint8Array(G.road), ladder: new Float32Array(G.ladder),
    buildings: [...G.buildings.values()].map(b => ({
      id: b.id, type: b.type, i: b.i, j: b.j, rot: b.rot, lvl: b.lvl, built: b.built, progress: b.progress, hp: b.hp, maxHp: b.maxHp,
      fire: b.fire, want: b.want, paused: b.paused, team: b.team, queue: b.queue.map(q => ({ type: q.type, t: 0 })), field: b.field ? { state: b.field.state, grow: b.field.grow } : null,
      rally: b.rally || null, upgrading: !!b.upgrading
    })),
    citizens: G.citizens.map(c => ({ id: c.id, name: c.name, x: c.x, z: c.z, hp: c.hp, home: c.home, job: c.job, carry: c.carry ? { ...c.carry } : null, hair: c.hair, cloth: c.cloth, skin: c.skin })),
    units: G.units.map(u => ({ id: u.id, type: u.type, name: u.name, x: u.x, z: u.z, hp: u.hp, home: u.home, ax: u.ax, az: u.az, hair: u.hair, skin: u.skin })),
    enemies: G.enemies.map(e => ({ id: e.id, type: e.type, x: e.x, z: e.z, hp: e.hp, raid: e.raid, spawn: e.spawn, guard: !!e.guard, ax: e.ax, az: e.az, loot: e.loot || null, torch: !!e.torch, ladder: !!e.ladder, flee: !!e.flee })),
    deer: G.deer.filter(d => !d.dead && !d.gone).map(d => ({ x: d.x, z: d.z, id: d.id })),
    ships: G.ships.map(s => ({ ...s, spawn: s.spawn ? { ...s.spawn } : null, cargo: s.cargo ? s.cargo.slice() : null }))
  };
  return data;
}

export async function saveGame(slot = 'auto') {
  if (!G.on || G.over) return false;
  try { await kv.set(KEY(slot), serialize()); return true; } catch (e) { return false; }
}
export async function listSaves() {
  const out = [];
  for (const s of SLOTS) {
    try { const d = await kv.get(KEY(s)); out.push({ slot: s, meta: d && d.meta ? d.meta : null }); } catch (e) { out.push({ slot: s, meta: null }); }
  }
  return out;
}
export async function deleteSave(slot) { try { await kv.del(KEY(slot)); } catch (e) {} }
export async function loadData(slot) { try { return await kv.get(KEY(slot)); } catch (e) { return null; } }

/** Återskapar G från sparad data. */
export function restore(d) {
  newGame(Object.assign({}, d.opts, { restore: true }));
  const m = G.map, n = m.n;
  m.h.set(toF32(d.map.h)); m.res.set(toU8(d.map.res)); m.amt.set(toF32(d.map.amt)); m.grow.set(toF32(d.map.grow));
  G.road.set(toU8(d.road)); G.ladder.set(toF32(d.ladder));
  Object.assign(G, {
    time: d.time, elapsed: d.elapsed || 0, tax: d.tax, alarmAuto: d.alarmAuto !== false, counters: Object.assign(G.counters, d.counters),
    stats: d.stats || G.stats, goalsDone: d.goalsDone || [], score: d.score || 0, bestScore: d.bestScore || 0,
    happiness: d.happiness || 50, happyShown: d.happiness || 50, lossMood: d.lossMood || 0, foodTypeT: d.foodTypeT || {},
    merchantT: d.merchantT || 0, lastMerchantSeason: d.lastMerchantSeason, won: !!d.won, tutStep: d.tutorial || 0
  });
  G.stock = Object.assign({}, G.stock, d.stock);
  G.cal = calendar(G.time); G.lastSeason = G.cal.season;
  for (let k = 0; k < n * n; k++) updatePass(k, false);
  // byggnader
  for (const r of d.buildings) {
    const def = BUILDINGS[r.type] || CAMP_DEFS[r.type];
    if (!def) continue;
    const b = placeBuilding(r.type, r.i, r.j, r.rot || 0, { id: r.id, free: true, instant: r.built, noFlatten: true, restore: true, lvl: r.lvl, team: r.team, def: CAMP_DEFS[r.type] });
    if (!b) continue;
    b.built = r.built; b.progress = r.progress; b.hp = r.hp; b.maxHp = r.maxHp; b.fire = r.fire || 0; b.want = r.want; b.paused = !!r.paused;
    b.queue = r.queue || []; b.rally = r.rally; b.upgrading = !!r.upgrading;
    if (r.field && b.field) { b.field.state = r.field.state; b.field.grow = r.field.grow; }
    if (b.type === 'hall' && !b.team) G.hall = b;
    if (b.type === 'jarlhall') G.campHall = b;
  }
  G.campAlive = !!d.campAlive; G.campDestroyed = !!d.campDestroyed;
  if (G.campHall) G.campPos = { x: G.campHall.x, z: G.campHall.z + 3 };
  // vägar (rutmarkering redan satt) – uppdatera passerbarhet
  for (let k = 0; k < n * n; k++) updatePass(k, false);
  G.pg.bump(); G.flowDirty = true;
  // invånare
  for (const r of d.citizens) {
    const c = makeCitizen(r.x, r.z, { name: r.name, hair: r.hair, cloth: r.cloth, skin: r.skin });
    c.id = r.id; c.hp = r.hp; c.home = r.home; c.job = r.job; c.carry = r.carry;
    const jb = c.job && G.buildings.get(c.job);
    if (jb) jb.workers.push(c.id); else c.job = 0;
    if (c.home && !G.buildings.has(c.home)) c.home = 0;
  }
  for (const r of d.units) {
    const u = makeUnit(r.type, r.x, r.z, 0, { name: r.name, hair: r.hair, skin: r.skin });
    u.id = r.id; u.hp = r.hp; u.home = r.home; u.ax = r.ax; u.az = r.az;
  }
  for (const r of d.enemies) {
    if (!ENEMIES[r.type]) continue;
    const e = makeUnit(r.type, r.x, r.z, 1);
    Object.assign(e, { id: r.id, hp: r.hp, raid: r.raid, spawn: r.spawn, guard: r.guard, ax: r.ax, az: r.az, loot: r.loot, torch: r.torch, ladder: r.ladder, flee: r.flee });
  }
  for (const r of d.deer || []) G.deer.push({ x: r.x, z: r.z, y: heightAt(r.x, r.z), yaw: 0, tx: r.x, tz: r.z, phase: 0, wait: 1, dead: false, hunter: 0, id: r.id });
  G.ships = (d.ships || []).map(s => Object.assign({}, s));
  if (d.raid) G.raid = Object.assign({ ids: [] }, d.raid);
  G.nextId = Math.max(d.nextId || 0, G.nextId);
  recomputeCaps();
  return G;
}
