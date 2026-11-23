// Nordheim – invånarnas AI: jobb, bärande, byggande, sömn, skydd, brandbekämpning, träning.
import { R, T, NAMES, UNITS } from './data.js';
import { G, hooks, heightAt, groundY, tileOf, tileX, tileZ, rand, sleepTime, nextId, dist2 } from './state.js';
import { PASS_P } from './path.js';
import { storageFor, addStock, onBuilt, updatePass, bstat, removeCitizen, recomputeCaps } from './sim.js';
import { makeUnit, nearestEnemy } from './combat.js';

const HAIR = [0xe8d08a, 0xc8a050, 0x8a5a2a, 0x5a3a1a, 0xb04a20, 0xd8c8a8, 0x3a2a1a];
const CLOTH = [0x7a8a5a, 0x8a6a4a, 0x5a6a8a, 0x9a8a6a, 0x6a5a4a, 0x8a4a3a, 0x4a6a6a, 0xa89a7a];
const SKIN = [0xf0c8a0, 0xe8b890, 0xd8a880, 0xf4d0b0];

export function makeCitizen(x, z, opts = {}) {
  const c = {
    kind: 'cit', id: nextId(), name: opts.name || NAMES[Math.floor(rand() * NAMES.length)],
    x, z, y: groundY(x, z), yaw: rand() * 6.28, hp: 25, maxHp: 25,
    home: 0, job: 0, state: 'idle', task: null, path: null, pi: 0, timer: 0, carry: null,
    anim: 'idle', act: 'Ledig', speed: 1.6, inside: false, insideId: 0, phase: rand() * 10,
    hair: opts.hair != null ? opts.hair : HAIR[Math.floor(rand() * HAIR.length)],
    cloth: opts.cloth != null ? opts.cloth : CLOTH[Math.floor(rand() * CLOTH.length)],
    skin: opts.skin != null ? opts.skin : SKIN[Math.floor(rand() * SKIN.length)],
    waitT: rand() * 0.5, fear: 0, happy: 60
  };
  G.citizens.push(c);
  return c;
}

/* ---------- Rörelse ---------- */
function rectOf(b) { return [b.i - 1, b.j - 1, b.i + b.w, b.j + b.d]; }

/** Begär väg. Returnerar 'ok' | 'wait' | 'fail'. */
export function moveRect(e, i0, j0, i1, j1, onArrive, onFail, mask = PASS_P, maxExp = 7000, budget = 'pathBudget') {
  const n = G.map.n;
  i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(n - 1, i1); j1 = Math.min(n - 1, j1);
  const si = Math.floor(e.x), sj = Math.floor(e.z);
  if (si >= i0 && si <= i1 && sj >= j0 && sj <= j1) { e.path = null; e.state = 'idle'; onArrive && onArrive(); return 'ok'; }
  if (G[budget] <= 0) { e.state = 'wait'; e.timer = 0.05 + rand() * 0.1; e.retry = () => moveRect(e, i0, j0, i1, j1, onArrive, onFail, mask, maxExp, budget); return 'wait'; }
  G[budget]--;
  let p = G.pg.find(si, sj, i0, j0, i1, j1, mask, maxExp);
  // instängd i en liten ficka (t.ex. mellan byggnader)? kliv ut till det stora området och försök igen
  if (!p && e.team !== 1 && unstick(e, mask)) p = G.pg.find(Math.floor(e.x), Math.floor(e.z), i0, j0, i1, j1, mask, maxExp);
  if (!p) { e.path = null; e.state = 'idle'; onFail && onFail(); return 'fail'; }
  e.path = p; e.pi = 0; e.state = 'move'; e.onArrive = onArrive; e.goal = [i0, j0, i1, j1];
  return 'ok';
}
export const moveToBuilding = (e, b, onArrive, onFail) => moveRect(e, ...rectOf(b), onArrive, onFail);
export const moveToTile = (e, k, onArrive, onFail, adj = false) => {
  const n = G.map.n, i = k % n, j = (k / n) | 0;
  return adj ? moveRect(e, i - 1, j - 1, i + 1, j + 1, onArrive, onFail) : moveRect(e, i, j, i, j, onArrive, onFail);
};

/** Flyttar en figur som står i en liten instängd ficka till närmaste ruta i ett stort område. */
export function unstick(e, mask = PASS_P) {
  const pg = G.pg, n = G.map.n;
  const k0 = tileOf(e.x, e.z); if (k0 < 0) return false;
  const here = pg.regionSize(k0, mask);
  if (here >= 60) return false;
  const i0 = k0 % n, j0 = (k0 / n) | 0;
  let best = -1, bd = 1e9;
  for (let r = 1; r <= 8 && best < 0; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    const k = j * n + i;
    if (pg.regionSize(k, mask) < Math.max(60, here + 1)) continue;
    const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = k; }
  }
  if (best < 0) return false;
  e.x = tileX(best); e.z = tileZ(best); e.y = groundY(e.x, e.z);
  if (e.ax != null && e.kind === 'unit') { e.ax = e.x; e.az = e.z; }
  return true;
}

/** Följ väg. Returnerar true vid ankomst. */
export function followPath(e, dt) {
  const n = G.map.n;
  if (!e.path || e.pi >= e.path.length) return true;
  const k = e.path[e.pi];
  let tx = (k % n) + 0.5, tz = ((k / n) | 0) + 0.5;
  if (e.pi === e.path.length - 1 && e.finalX != null) { tx = e.finalX; tz = e.finalZ; }
  const dx = tx - e.x, dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  const ck = tileOf(e.x, e.z);
  let sp = e.speed * (ck >= 0 && G.road[ck] ? 1.6 : 1) * (e.carry ? 0.88 : 1);
  if (ck >= 0 && G.pg.cost[ck] > 1.2) sp *= 0.8;
  const step = sp * dt;
  if (d <= step || d < 0.02) {
    e.x = tx; e.z = tz; e.pi++;
    if (e.pi >= e.path.length) { e.path = null; return true; }
  } else {
    e.x += dx / d * step; e.z += dz / d * step;
    const ty = Math.atan2(dx, dz);
    let dy = ty - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += dy * Math.min(1, dt * 12);
  }
  e.y = groundY(e.x, e.z);
  e.phase += dt * sp * 5.5;
  return false;
}

function face(e, x, z) { e.yaw = Math.atan2(x - e.x, z - e.z); }

function work(c, dur, anim, act, onDone) {
  c.state = 'work'; c.timer = dur; c.anim = anim; c.act = act; c.onDone = onDone;
}
function goInside(c, b, dur, act, onDone) {
  c.state = 'inside'; c.inside = true; c.insideId = b.id; c.timer = dur; c.act = act; c.onDone = onDone;
  if (!b.inside.includes(c.id)) b.inside.push(c.id);
  c.x = b.x; c.z = b.z + b.d / 2 + 0.3;
}
function exitBuilding(c) {
  const b = G.buildings.get(c.insideId);
  if (b) {
    b.inside = b.inside.filter(id => id !== c.id);
    // ställ ut vid närmaste gångbara ruta framför – helst i det största sammanhängande området (inte i en instängd ficka)
    const n = G.map.n;
    let best = null, bd = 1e9, bsz = 0;
    for (let j = b.j - 2; j <= b.j + b.d + 1; j++) for (let i = b.i - 2; i <= b.i + b.w + 1; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const k = j * n + i; if (!(G.pg.pass[k] & PASS_P)) continue;
      const ring = (i < b.i - 1 || i > b.i + b.w || j < b.j - 1 || j > b.j + b.d) ? 4 : 0;
      const sz = Math.min(G.pg.regionSize(k), 200);
      const d = (i + 0.5 - b.x) ** 2 + (j + 0.5 - (b.z + b.d)) ** 2 + ring;
      if (sz > bsz || (sz === bsz && d < bd)) { bd = d; best = k; bsz = sz; }
    }
    if (best != null) { c.x = tileX(best); c.z = tileZ(best); c.y = groundY(c.x, c.z); }
  }
  c.inside = false; c.insideId = 0;
}
function idle(c, t = 1.5, act) { c.state = 'wait'; c.timer = t; c.retry = null; if (act) c.act = act; c.anim = 'idle'; }

function abort(c) {
  if (c.task && c.task.k != null && G.reserved[c.task.k] === c.id) G.reserved[c.task.k] = 0;
  if (c.task && c.task.field) { const f = G.buildings.get(c.task.field); if (f && f.field && f.field.worker === c.id) f.field.worker = 0; }
  if (c.task && c.task.deer) c.task.deer.hunter = 0;
  if (c.task && c.task.site) { const s = G.buildings.get(c.task.site); if (s) s.builders = Math.max(0, s.builders - 1); }
  // brandmän och reparatörer som avbryts måste räknas av, annars får byggnaden aldrig ny hjälp
  if (c.task && c.task.type === 'fire') { const b = G.buildings.get(c.task.bid); if (b) b.fighters = Math.max(0, (b.fighters || 1) - 1); }
  if (c.task && c.task.type === 'repair') { const b = G.buildings.get(c.task.bid); if (b) b.repairers = Math.max(0, (b.repairers || 1) - 1); }
  c.task = null; c.path = null; c.onArrive = null; c.onDone = null;
  if (c.inside) exitBuilding(c);
  c.state = 'idle'; c.anim = 'idle';
}

/* ---------- Leverans ---------- */
function deposit(c) {
  if (!c.carry) return false;
  const st = storageFor(c.carry.r, c.x, c.z);
  if (!st) { idle(c, 3, 'Inget lager att lämna i'); return true; }
  c.act = 'Bär ' + RESNAME[c.carry.r] + ' till ' + st.def.name.toLowerCase();
  c.task = { type: 'deposit' };
  moveToBuilding(c, st, () => {
    if (!c.carry) { c.state = 'idle'; return; }
    const room = (G.cap[c.carry.r] || 0) - G.stock[c.carry.r];
    if (room <= 0) { idle(c, 4, 'Väntar – lagret är fullt'); addStock(c.carry.r, 0); return; }
    const added = addStock(c.carry.r, c.carry.n, c.x, c.z);

    if (c.carry.ft) { G.foodTypeT[c.carry.ft] = G.time; G.prod['ft_' + c.carry.ft] = (G.prod['ft_' + c.carry.ft] || 0) + added; }
    c.carry.n -= added;
    if (c.carry.n <= 0) c.carry = null;
    c.task = null;
    hooks.sfx('pickup', c.x, c.z, { vol: 0.25, gap: 120 });
    idle(c, 0.3);
  }, () => idle(c, 3, 'Hittar ingen väg till lagret'));
  return true;
}
const RESNAME = { wood: 'trä', stone: 'sten', food: 'mat', iron: 'järn', gold: 'guld', weapons: 'vapen' };

/* ---------- Sök ---------- */
function scanTiles(cx, cz, r, test) {
  const n = G.map.n;
  let best = -1, bd = 1e9;
  const i0 = Math.max(0, Math.floor(cx - r)), i1 = Math.min(n - 1, Math.floor(cx + r));
  const j0 = Math.max(0, Math.floor(cz - r)), j1 = Math.min(n - 1, Math.floor(cz + r));
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = i + 0.5 - cx, dz = j + 0.5 - cz, d = dx * dx + dz * dz;
    if (d > r2 || d >= bd) continue;
    const k = j * n + i;
    if (G.unreach && G.unreach.has(k)) { if (G.unreach.get(k) > G.time) continue; G.unreach.delete(k); }
    if (test(k)) { bd = d; best = k; }
  }
  return best;
}

/** Markera en ruta som oåtkomlig en stund så att den inte väljs om och om igen. */
function unreachable(k) { if (!G.unreach) G.unreach = new Map(); G.unreach.set(k, G.time + 90); }

/* ---------- Jobb ---------- */
const JOBS = {
  woodcutter(c, b) {
    const m = G.map, r = bstat(b, 'radius');
    const k = scanTiles(b.x, b.z, r, k => m.res[k] === R.TREE && m.grow[k] >= 0.75 && !G.reserved[k]);
    if (k >= 0) {
      G.reserved[k] = c.id; c.task = { type: 'chop', k };
      c.act = 'Går till ett träd';
      moveToTile(c, k, () => {
        if (m.res[k] !== R.TREE || m.grow[k] < 0.5) { abort(c); return; }
        face(c, tileX(k), tileZ(k) - 0.01);
        work(c, 4, 'chop', 'Hugger ved', () => {
          G.reserved[k] = 0;
          if (m.res[k] === R.TREE && m.grow[k] >= 0.5) {
            m.grow[k] = -1; G.growing && G.growing.add(k);
            hooks.onTreeChanged(k); updatePass(k);
            hooks.fx('leaves', tileX(k), heightAt(tileX(k), tileZ(k)) + 1, tileZ(k), 12);
            hooks.sfx('break', c.x, c.z, { vol: 0.5 });
            G.counters.chopped++;
            c.carry = { r: 'wood', n: 6 };
          }
          c.task = null; c.state = 'idle';
        });
      }, () => { G.reserved[k] = 0; unreachable(k); idle(c, 1); });
      return true;
    }
    if (b.lvl > 1) {
      const pk = scanTiles(b.x + (rand() - 0.5) * 6, b.z + (rand() - 0.5) * 6, r * 0.8, k => {
        const t = m.type[k];
        return (t === T.FOREST || t === T.GRASS) && !m.res[k] && !G.occ[k] && !G.road[k] && !G.fieldOf[k] && !G.reserved[k] && (G.pg.pass[k] & PASS_P) && Math.abs(tileX(k) - b.x) + Math.abs(tileZ(k) - b.z) > 2.5;
      });
      if (pk >= 0) {
        G.reserved[pk] = c.id; c.task = { type: 'plant', k: pk }; c.act = 'Går för att plantera';
        moveToTile(c, pk, () => work(c, 3, 'dig', 'Planterar ett träd', () => {
          G.reserved[pk] = 0;
          if (!m.res[pk] && !G.occ[pk]) { m.res[pk] = R.TREE; m.grow[pk] = 0.001; m.amt[pk] = rand(); G.growing && G.growing.add(pk); hooks.onTreeChanged(pk); updatePass(pk); }
          c.task = null; c.state = 'idle';
        }), () => { G.reserved[pk] = 0; unreachable(pk); idle(c, 1); });
        return true;
      }
    }
    if (!b._noTreeWarn) { b._noTreeWarn = 1; hooks.notify('Huggarstugan hittar inga vuxna träd inom räckhåll', 'warn', { x: b.x, z: b.z }); }
    return waitAt(c, b, 'Inga vuxna träd inom räckhåll');
  },
  quarry(c, b) {
    const m = G.map, r = bstat(b, 'radius');
    const k = scanTiles(b.x, b.z, r, k => m.res[k] === R.STONE && m.amt[k] > 0 && !G.reserved[k]);
    if (k < 0) return waitAt(c, b, 'Inga stenblock kvar inom räckhåll');
    G.reserved[k] = c.id; c.task = { type: 'stone', k }; c.act = 'Går till stenbrottet';
    moveToTile(c, k, () => {
      face(c, tileX(k), tileZ(k));
      work(c, 4, 'pick', 'Hugger sten', () => {
        G.reserved[k] = 0;
        if (m.res[k] === R.STONE && m.amt[k] > 0) {
          const take = Math.min(5, m.amt[k]); m.amt[k] -= take;
          c.carry = { r: 'stone', n: take };
          hooks.fx('dust', tileX(k), heightAt(tileX(k), tileZ(k)) + 0.3, tileZ(k), 8);
          hooks.sfx('break', c.x, c.z, { vol: 0.4, pitch: 0.7 });
          if (m.amt[k] <= 0) { m.res[k] = 0; updatePass(k); }
          hooks.onTreeChanged(k);
        }
        c.task = null; c.state = 'idle';
      });
    }, () => { G.reserved[k] = 0; unreachable(k); idle(c, 1); }, true);
    return true;
  },
  mine(c, b) {
    const m = G.map;
    const k = scanTiles(b.x, b.z, Math.max(b.w, b.d) / 2 + 2.6, k => m.res[k] === R.ORE && m.amt[k] > 0);
    if (k < 0) { if (!b._oreWarn) { b._oreWarn = 1; hooks.notify('Malmen vid gruvan är slut', 'warn', { x: b.x, z: b.z }); } return waitAt(c, b, 'Malmen är slut'); }
    c.task = { type: 'mine' }; c.act = 'Går till gruvan';
    moveToBuilding(c, b, () => goInside(c, b, 8, 'Bryter malm i gruvan', () => {
      exitBuilding(c);
      if (m.amt[k] > 0) {
        m.amt[k] -= 2; if (m.amt[k] <= 0) { m.res[k] = 0; updatePass(k); }
        hooks.onTreeChanged(k);
        c.carry = { r: 'iron', n: 2 };
        if (rand() < (b.lvl > 1 ? 0.22 : 0.12)) addStock('gold', 2, b.x, b.z);
      }
      c.task = null; c.state = 'idle';
    }), () => idle(c, 2));
    return true;
  },
  smithy(c, b) {
    c.task = { type: 'smith' }; c.act = 'Går till smedjan';
    moveToBuilding(c, b, () => {
      if (G.stock.iron >= 2 && G.stock.wood >= 1) {
        G.stock.iron -= 2; G.stock.wood -= 1;
        goInside(c, b, b.lvl > 1 ? 9 : 12, 'Smider vapen', () => {
          // vapnen läggs i smedjans vapenställ (räknas direkt in i lagret) – smeden kan smida vidare
          exitBuilding(c);
          const got = addStock('weapons', 1, b.x, b.z);
          G.counters.weapons += got;
          if (!got) { c.carry = { r: 'weapons', n: 1 }; }
          hooks.sfx('hit', c.x, c.z, { vol: 0.35, pitch: 2 });
          c.task = null; c.state = 'idle';
        });
        b.forgeT = 12;
      } else { c.task = null; idle(c, 4, 'Väntar på järn och trä'); }
    }, () => idle(c, 2));
    return true;
  },
  barn(c, b) {
    const r = bstat(b, 'radius');
    const season = G.cal.season;
    let best = null, bd = 1e9, bestPri = 0;
    for (const f of G.buildings.values()) {
      if (!f.field || !f.built || f.team || f.field.worker) continue;
      const d = (f.x - b.x) ** 2 + (f.z - b.z) ** 2; if (d > r * r) continue;
      let pri = 0;
      if (f.field.state === 'ripe') pri = 2;
      else if (f.field.state === 'fallow' && (season === 0 || season === 1 || (season === 2 && G.cal.seasonPhase < 0.3))) pri = 1;
      if (pri > bestPri || (pri === bestPri && pri > 0 && d < bd)) { best = f; bd = d; bestPri = pri; }
    }
    if (!best) {
      const any = [...G.buildings.values()].some(f => f.field && !f.team && (f.x - b.x) ** 2 + (f.z - b.z) ** 2 <= r * r);
      return waitAt(c, b, any ? (season === 3 ? 'Vinter – åkrarna vilar' : 'Väntar på att grödorna ska mogna') : 'Inga åkrar inom räckhåll – anlägg åkrar');
    }
    const f = best; f.field.worker = c.id;
    c.task = { type: 'farm', field: f.id };
    const harvest = bestPri === 2;
    c.act = harvest ? 'Går för att skörda' : 'Går för att så';
    const n = G.map.n;
    const tk = (f.j + 1 + Math.floor(rand() * (f.d - 1))) * n + f.i + Math.floor(rand() * f.w);
    moveToTile(c, tk, () => {
      work(c, harvest ? 7 : 5, harvest ? 'scythe' : 'dig', harvest ? 'Skördar säd' : 'Sår säd', () => {
        f.field.worker = 0;
        if (G.buildings.has(f.id)) {
          if (harvest && f.field.state === 'ripe') { f.field.state = 'fallow'; f.field.grow = 0; c.carry = { r: 'food', n: 20 + f.meadow * 2, ft: 'bread' }; hooks.fx('chaff', c.x, c.y + 0.3, c.z, 10); }
          else if (!harvest && f.field.state === 'fallow') { f.field.state = 'growing'; f.field.grow = 0; }
          hooks.onBuildingChanged(f);
        }
        c.task = null; c.state = 'idle';
      });
    }, () => { f.field.worker = 0; idle(c, 2); });
    return true;
  },
  fisher(c, b) {
    const m = G.map, n = m.n, r = bstat(b, 'radius');
    const shore = scanTiles(b.x, b.z, r, k => {
      if (!(G.pg.pass[k] & PASS_P) || G.reserved[k] || G.occ[k]) return false;
      const i = k % n, j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const kk = jj * n + ii; if (m.res[kk] === R.FISH && m.amt[kk] >= 4) return true;
      }
      return false;
    });
    if (shore < 0) return waitAt(c, b, 'Ingen fisk nära stranden');
    G.reserved[shore] = c.id;
    c.task = { type: 'fish', k: shore }; c.act = 'Går till fiskeplatsen';
    moveToTile(c, shore, () => {
      // vänd mot vattnet
      const i = shore % n, j = (shore / n) | 0;
      let fk = -1;
      for (let dj = -1; dj <= 1 && fk < 0; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < n && jj < n && m.res[jj * n + ii] === R.FISH) { fk = jj * n + ii; break; } }
      if (fk >= 0) face(c, tileX(fk), tileZ(fk));
      const cast = () => work(c, G.cal.season === 3 ? 16 : 9, 'fish', G.cal.season === 3 ? 'Pimpelfiskar genom isen' : 'Fiskar', () => {
        if (fk >= 0 && m.amt[fk] >= 4) { m.amt[fk] -= 4; c.carry = { r: 'food', n: (c.carry && c.carry.r === 'food' ? c.carry.n : 0) + 4, ft: 'fish' }; hooks.fx('splash', tileX(fk), 0.05, tileZ(fk), 8); }
        // fyll korgen innan den långa vägen till förrådet
        if (c.carry && c.carry.n < 12 && fk >= 0 && m.amt[fk] >= 4 && !sleepTime(G.cal.phase) && !G.alarm && c.fear <= 0) { cast(); return; }
        G.reserved[shore] = 0;
        c.task = null; c.state = 'idle';
      });
      cast();
    }, () => { G.reserved[shore] = 0; unreachable(shore); idle(c, 1); });
    return true;
  },
  hunter(c, b) {
    const r = bstat(b, 'radius');
    let deer = null, bd = r * r;
    for (const d of G.deer) { if (d.dead || d.hunter) continue; const dd = (d.x - b.x) ** 2 + (d.z - b.z) ** 2; if (dd < bd) { bd = dd; deer = d; } }
    if (!deer) return waitAt(c, b, 'Inga djur inom räckhåll');
    deer.hunter = c.id;
    c.task = { type: 'hunt', deer }; c.act = 'Smyger efter en hjort';
    stalk(c, deer);
    return true;
  },
  gatherer(c, b) {
    const m = G.map, r = bstat(b, 'radius');
    const k = scanTiles(b.x, b.z, r, k => m.res[k] === R.BERRY && m.amt[k] >= 2 && !G.reserved[k]);
    if (k < 0) return waitAt(c, b, G.cal.season === 3 ? 'Vinter – buskarna är kala' : 'Inga mogna bär just nu');
    G.reserved[k] = c.id; c.task = { type: 'berry', k }; c.act = 'Går för att plocka bär';
    moveToTile(c, k, () => work(c, 4, 'gather', 'Plockar bär', () => {
      G.reserved[k] = 0;
      if (m.res[k] === R.BERRY && m.amt[k] >= 2) { const t = Math.min(3, m.amt[k]); m.amt[k] -= t; c.carry = { r: 'food', n: (c.carry && c.carry.r === 'food' ? c.carry.n : 0) + t + 1, ft: 'berries' }; hooks.onTreeChanged(k); }
      c.task = null; c.state = 'idle';
      // fler buskar alldeles intill? plocka dem också innan vi går till förrådet
      if (c.carry && c.carry.n < 10 && !sleepTime(G.cal.phase) && !G.alarm) {
        const k2 = scanTiles(c.x, c.z, 4.5, kk => m.res[kk] === R.BERRY && m.amt[kk] >= 2 && !G.reserved[kk]);
        if (k2 >= 0) { G.reserved[k2] = c.id; c.task = { type: 'berry', k: k2 }; c.act = 'Plockar fler bär';
          moveToTile(c, k2, () => work(c, 4, 'gather', 'Plockar bär', () => { G.reserved[k2] = 0; if (m.res[k2] === R.BERRY && m.amt[k2] >= 2) { const t = Math.min(3, m.amt[k2]); m.amt[k2] -= t; c.carry.n += t + 1; hooks.onTreeChanged(k2); } c.task = null; c.state = 'idle'; }), () => { G.reserved[k2] = 0; c.task = null; idle(c, 0.5); }, true); }
      }
    }), () => { G.reserved[k] = 0; unreachable(k); idle(c, 1); }, true);
    return true;
  },
  harbor(c, b) {
    c.task = { type: 'boat' }; c.act = 'Går till hamnen';
    moveToBuilding(c, b, () => goInside(c, b, 22, 'Fiskar med båt', () => {
      exitBuilding(c);
      const got = addStock('food', 10, b.x, b.z); G.foodTypeT.fish = G.time; G.prod.ft_fish = (G.prod.ft_fish || 0) + got;
      c.task = null; c.state = 'idle';
    }), () => idle(c, 2));
    return true;
  },
  market(c, b) { return staff(c, b, 'Säljer varor på marknaden'); },
  temple(c, b) { return staff(c, b, 'Offrar till gudarna'); }
};

function staff(c, b, act) {
  c.task = { type: 'staff' }; c.act = 'Går till arbetet';
  moveToBuilding(c, b, () => goInside(c, b, 40, act, () => { exitBuilding(c); c.task = null; c.state = 'idle'; }), () => idle(c, 2));
  return true;
}
function waitAt(c, b, act) {
  // inget att göra på arbetsplatsen – hjälp till med ett bygge i stället
  if (!sleepTime(G.cal.phase) && !G.alarm) {
    const site = findSite(c);
    if (site && (site.x - c.x) ** 2 + (site.z - c.z) ** 2 < 45 * 45) { build(c, site); return true; }
  }
  const d2 = (c.x - b.x) ** 2 + (c.z - b.z) ** 2;
  if (d2 > (Math.max(b.w, b.d) + 2) ** 2) { c.act = act; moveToBuilding(c, b, () => idle(c, 4, act), () => idle(c, 4, act)); }
  else idle(c, 4 + rand() * 2, act);
  return true;
}

function stalk(c, deer) {
  if (deer.dead && !deer.corpse) { abort(c); return; }
  const d = Math.hypot(deer.x - c.x, deer.z - c.z);
  if (!deer.dead && d < 7) {
    face(c, deer.x, deer.z);
    work(c, 1.2, 'bow', 'Skjuter mot hjorten', () => {
      hooks.shootArrow && hooks.shootArrow(c.x, c.y + 0.35, c.z, deer, 0, () => { if (!deer.dead) { deer.dead = true; deer.corpse = true; deer.deadT = 0; } });
      c.state = 'wait'; c.timer = 1.0; c.retry = () => stalk(c, deer);
    });
    return;
  }
  if (deer.dead) {
    moveToTile(c, tileOf(deer.x, deer.z), () => work(c, 3, 'gather', 'Tar hand om bytet', () => {
      deer.corpse = false; deer.gone = true; deer.hunter = 0;
      c.carry = { r: 'food', n: 15, ft: 'meat' };
      c.task = null; c.state = 'idle';
    }), () => abort(c), true);
    return;
  }
  // gå närmare
  const k = tileOf(deer.x, deer.z);
  c.act = 'Smyger efter en hjort';
  moveToTile(c, k, () => stalk(c, deer), () => { deer.hunter = 0; abort(c); idle(c, 2); }, true);
  c.restalk = 2.5;
}

/* ---------- Bygga / reparera / släcka ---------- */
function findSite(c) {
  let best = null, bd = 1e9;
  for (const b of G.buildings.values()) {
    if (b.team || b.built) continue;
    if (b.builders >= 4) continue;
    const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2 + b.builders * 30;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function build(c, b) {
  b.builders++;
  c.task = { type: 'build', site: b.id };
  c.act = 'Går till bygget: ' + b.def.name.toLowerCase();
  moveToBuilding(c, b, () => {
    if (!G.buildings.has(b.id) || b.built) { abort(c); return; }
    face(c, b.x, b.z);
    c.state = 'build'; c.anim = 'hammer'; c.act = (b.upgrading ? 'Bygger ut: ' : 'Bygger: ') + b.def.name.toLowerCase();
  }, () => { abort(c); idle(c, 3, 'Kommer inte fram till bygget'); });
}
function findRepair(c) {
  let best = null, bd = 30 * 30;
  for (const b of G.buildings.values()) {
    if (b.team || !b.built || b.fire > 0 || b.hp >= b.maxHp * 0.92 || G.time - b.lastHit < 8) continue;
    if ((b.repairers || 0) >= 2) continue;
    const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function repair(c, b) {
  b.repairers = (b.repairers || 0) + 1;
  c.task = { type: 'repair', bid: b.id };
  c.act = 'Går för att reparera';
  moveToBuilding(c, b, () => { face(c, b.x, b.z); c.state = 'repair'; c.anim = 'hammer'; c.act = 'Reparerar ' + b.def.name.toLowerCase(); }, () => { b.repairers--; abort(c); });
}
function findFire(c) {
  let best = null, bd = 26 * 26;
  for (const b of G.buildings.values()) {
    if (b.team || b.fire <= 0) continue;
    if ((b.fighters || 0) >= 5) continue;
    const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function fightFire(c, b) {
  b.fighters = (b.fighters || 0) + 1;
  c.task = { type: 'fire', bid: b.id };
  let well = null, wd = 1e9;
  for (const w of G.buildings.values()) {
    if (w.type !== 'well' || !w.built || w.team) continue;
    const d = (w.x - b.x) ** 2 + (w.z - b.z) ** 2;
    if (d < 13 * 13 && d < wd) { wd = d; well = w; }
  }
  const done = () => { b.fighters = Math.max(0, (b.fighters || 1) - 1); c.task = null; c.state = 'idle'; };
  const toFire = () => {
    c.act = 'Springer till branden';
    moveToBuilding(c, b, () => {
      face(c, b.x, b.z);
      work(c, 1.4, 'throw', 'Släcker branden', () => {
        if (G.buildings.has(b.id)) { b.fire = Math.max(0, b.fire - (well ? 0.34 : 0.15)); hooks.fx('steam', b.x, b.y + 0.8, b.z, 8); hooks.sfx('splash', b.x, b.z, { vol: 0.4 }); }
        done();
      });
    }, done);
  };
  c.speed = 2.0;
  if (well) { c.act = 'Hämtar vatten vid brunnen'; moveToBuilding(c, well, () => work(c, 1.2, 'gather', 'Fyller hinken', toFire), done); }
  else toFire();
}

/* ---------- Skydd ---------- */
function shelterFor(c) {
  const home = c.home && G.buildings.get(c.home);
  // spring inte rakt in i fienden: undvik skydd med fiender alldeles intill
  const safe = b => !nearestEnemy(b.x, b.z, 6 + Math.max(b.w, b.d) / 2, 1, e => !e.guard);
  const ok = b => b && b.built && b.fire <= 0 && !b.team;
  if (ok(home) && safe(home) && (home.x - c.x) ** 2 + (home.z - c.z) ** 2 < 30 * 30) return home;
  let best = null, bd = 1e9;
  for (const b of G.buildings.values()) {
    if (!ok(b) || !(b.type === 'hall' || b.type === 'house' || b.type === 'barracks' || b.type === 'storehouse')) continue;
    const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2 + (safe(b) ? 0 : 4000);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function takeShelter(c) {
  const s = shelterFor(c);
  if (!s) { idle(c, 2, 'Gömmer sig'); return; }
  c.task = { type: 'shelter' }; c.act = 'Flyr i skydd'; c.speed = 2.1;
  moveToBuilding(c, s, () => goInside(c, s, 9999, 'Skyddar sig inomhus', () => { exitBuilding(c); c.state = 'idle'; }), () => idle(c, 2, 'Gömmer sig'));
}

/* ---------- Beslut ---------- */
function decide(c) {
  c.speed = 1.6;
  c.anim = 'idle';
  const night = sleepTime(G.cal.phase);
  // brand (även under larm, om inga fiender är nära branden)
  if (!c.trainee && c.fear <= 0) { const f = findFire(c); if (f && !nearestEnemy(f.x, f.z, 10, 1, e => !e.guard) && !nearestEnemy(c.x, c.z, 9, 1, e => !e.guard)) { fightFire(c, f); return; } }
  // fara
  if (G.alarm || c.fear > 0) { takeShelter(c); return; }
  // träning
  if (c.trainee) {
    const b = G.buildings.get(c.trainee);
    if (!b || !b.queue.length) { c.trainee = 0; }
    else { c.task = { type: 'train' }; c.act = 'Går till kasernen för att tränas'; moveToBuilding(c, b, () => goInside(c, b, 9999, 'Tränar vapenkonst', () => { exitBuilding(c); c.state = 'idle'; }), () => { c.trainFail = (c.trainFail || 0) + 1; if (c.trainFail > 4) c.trainee = 0; idle(c, 2, 'Hittar ingen väg till kasernen'); }); return; }
  }
  // bär något – lämna först
  if (c.carry) { deposit(c); return; }
  // natt – gå hem
  if (night) {
    const home = c.home && G.buildings.get(c.home);
    if (home && home.built) {
      c.task = { type: 'sleep' }; c.act = 'Går hem för att sova';
      moveToBuilding(c, home, () => goInside(c, home, 9999, 'Sover', () => { exitBuilding(c); c.state = 'idle'; }), () => idle(c, 4, 'Vill sova'));
      return;
    }
    if (!c.job) { idle(c, 5, 'Hemlös – fryser ute i natten'); return; }
  }
  // jobb
  if (c.job) {
    const b = G.buildings.get(c.job);
    if (b && b.built && !b.paused && JOBS[b.type]) { JOBS[b.type](c, b); return; }
    if (b && !b.built) { /* jobbet byggs om – hjälp till */ }
    else if (!b) c.job = 0;
  }
  // ledig: bygga, reparera
  const site = findSite(c);
  if (site) { build(c, site); return; }
  const rep = !night && findRepair(c);
  if (rep && G.stock.wood > 0) { repair(c, rep); return; }
  // vandra
  const center = (c.home && G.buildings.get(c.home)) || G.hall;
  if (center) {
    const tx = center.x + (rand() - 0.5) * 8, tz = center.z + center.d / 2 + 1 + rand() * 4;
    const k = tileOf(tx, tz);
    if (k >= 0 && (G.pg.pass[k] & PASS_P)) {
      c.act = c.job ? 'Väntar' : 'Ledig – inget arbete';
      moveToTile(c, k, () => idle(c, 3 + rand() * 4, c.job ? undefined : 'Ledig – inget arbete'), () => idle(c, 3));
      return;
    }
  }
  idle(c, 3, 'Ledig – inget arbete');
}

/* ---------- Tilldelning ---------- */
function assignJobs() {
  const unemployed = G.citizens.filter(c => !c.job && !c.trainee);
  // håll några lediga som byggare så länge det finns byggen (annars står byggena still)
  let sites = 0;
  for (const b of G.buildings.values()) if (!b.built && !b.team) sites++;
  const reserve = sites ? Math.min(sites + 1, 3, Math.floor(G.citizens.length * 0.3)) : 0;
  G.builderReserve = reserve;
  for (const b of G.buildings.values()) {
    if (b.team || !b.built) continue;
    const want = b.paused ? 0 : Math.min(b.want, bstat(b, 'workers') || 0);
    // ta bort ogiltiga
    b.workers = b.workers.filter(id => G.citizens.some(c => c.id === id && c.job === b.id));
    while (b.workers.length > want) {
      const id = b.workers.pop();
      const c = G.citizens.find(x => x.id === id);
      if (c) { c.job = 0; if (c.state !== 'move' || c.task?.type !== 'deposit') { if (c.state === 'inside' && c.task?.type !== 'sleep' && c.task?.type !== 'shelter') abort(c); } }
    }
    while (b.workers.length < want && unemployed.length > reserve) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < unemployed.length; i++) { const u = unemployed[i]; const d = (u.x - b.x) ** 2 + (u.z - b.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      const c = unemployed.splice(bi, 1)[0];
      c.job = b.id; b.workers.push(c.id);
      if (c.task && (c.task.type === 'build' || c.task.type === 'repair')) { abort(c); }
    }
  }
  // bostäder
  const homeless = G.citizens.filter(c => !c.home || !G.buildings.has(c.home));
  // överbefolkade hus (t.ex. under ombyggnad) – flytta ut de som inte får plats
  if (G.time - (G._crowdT || 0) > 5) {
    G._crowdT = G.time;
    const cnt = new Map();
    for (const c of G.citizens) if (c.home) {
      const b = G.buildings.get(c.home); if (!b) continue;
      const cap = (b.upgrading ? b.def.housing : bstat(b, 'housing')) || 0;
      const n2 = (cnt.get(b.id) || 0) + 1; cnt.set(b.id, n2);
      if (n2 > cap) { c.home = 0; homeless.push(c); }
    }
  }
  if (homeless.length) {
    const occ = new Map();
    for (const c of G.citizens) if (c.home) occ.set(c.home, (occ.get(c.home) || 0) + 1);
    for (const c of homeless) {
      c.home = 0;
      let best = null, bd = 1e9;
      for (const b of G.buildings.values()) {
        if ((!b.built && !b.upgrading) || b.team) continue;
        const cap = (b.upgrading ? b.def.housing : bstat(b, 'housing')) || 0; if (!cap) continue;
        if ((occ.get(b.id) || 0) >= cap) continue;
        const job = c.job && G.buildings.get(c.job);
        const ref = job || c;
        const d = (b.x - ref.x) ** 2 + (b.z - ref.z) ** 2;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) { c.home = best.id; occ.set(best.id, (occ.get(best.id) || 0) + 1); }
    }
  }
}

function trainingTick(dt) {
  for (const b of G.buildings.values()) {
    if (b.type !== 'barracks' || !b.built || !b.queue.length) continue;
    const q = b.queue[0];
    let trainee = q.trainee && G.citizens.find(c => c.id === q.trainee && c.trainee === b.id);
    if (!trainee) {
      q.trainee = 0;
      let best = null, bd = 1e9;
      for (const c of G.citizens) { if (c.job || c.trainee) continue; const d = (c.x - b.x) ** 2 + (c.z - b.z) ** 2; if (d < bd) { bd = d; best = c; } }
      if (!best) { b.waiting = true; continue; }
      b.waiting = false;
      best.trainee = b.id; q.trainee = best.id;
      abort(best);
      trainee = best;
    }
    if (trainee.inside && trainee.insideId === b.id) {
      q.t += dt * (b.lvl > 1 ? 1.35 : 1);
      const def = UNITS[q.type];
      if (q.t >= def.time) {
        b.queue.shift();
        exitBuilding(trainee);
        const u = makeUnit(q.type, trainee.x, trainee.z, 0, trainee);
        u.home = b.id;
        removeCitizen(trainee);
        G.counters.trained++;
        hooks.notify(u.name + ' är nu ' + def.name.toLowerCase(), 'good', { x: u.x, z: u.z });
        hooks.sfx('power', u.x, u.z, { vol: 0.6 });
        // samlingsplats
        if (b.rally) { u.order = { type: 'move', x: b.rally.x, z: b.rally.z }; u.state = 'order'; }
      }
    }
  }
}

/* ---------- Tick ---------- */
let assignT = 0, recountT = 0;
/** Räkna om brandmän/reparatörer/byggare från invånarnas faktiska uppgifter (skydd mot läckande räknare). */
function recountHelpers() {
  for (const b of G.buildings.values()) { b.fighters = 0; b.repairers = 0; if (!b.built) b.builders = 0; }
  for (const c of G.citizens) {
    const t = c.task; if (!t) continue;
    if (t.type === 'fire' || t.type === 'repair') { const b = G.buildings.get(t.bid); if (b) { if (t.type === 'fire') b.fighters++; else b.repairers++; } }
    else if (t.type === 'build') { const b = G.buildings.get(t.site); if (b && !b.built) b.builders++; }
  }
}
export function citizenTick(dt) {
  G.pathBudget = 14;
  G.combatBudget = 5;
  let decideBudget = 30;
  assignT += dt;
  if (assignT > 1) { assignT = 0; assignJobs(); }
  recountT += dt; if (recountT > 3) { recountT = 0; recountHelpers(); }
  trainingTick(dt);
  const night = sleepTime(G.cal.phase);
  const list = G.citizens;
  for (let idx = 0; idx < list.length; idx++) {
    const c = list[idx];
    // rädsla: fiender nära
    if (G.enemies.length && !c.inside && ((idx + G.frame) & 7) === 0) {
      const e = nearestEnemy(c.x, c.z, 7, 1, x => !x.guard || (x.x - c.x) ** 2 + (x.z - c.z) ** 2 < 30);
      if (e) {
        if (c.fear <= 0 && c.task?.type !== 'shelter') { c.fear = 8; abort(c); }
        c.fear = 8;
      }
    }
    if (c.fear > 0 && !c.inside) c.fear -= dt;
    // väck vid morgon / larm av
    if (c.state === 'inside') {
      const tt = c.task && c.task.type;
      if (c.fear > 0) c.fear -= dt; // rädslan klingar av även inomhus (annars gömmer de sig för alltid)
      if ((tt === 'sleep' && !night) || (tt === 'shelter' && !G.alarm && c.fear <= 0 && !shelterDanger(c))) { c.timer = 0; }
      if (G.alarm && tt !== 'shelter' && tt !== 'sleep' && tt !== 'train') { abort(c); }
      if ((tt === 'shelter' || tt === 'sleep') && ((idx + G.frame) % 45) === 0 && c.fear <= 0) { const f = findFire(c); if (f && !nearestEnemy(f.x, f.z, 10, 1, e => !e.guard) && !nearestEnemy(c.x, c.z, 9, 1, e => !e.guard)) { abort(c); fightFire(c, f); continue; } }
      c.timer -= dt;
      if (c.timer <= 0) { const f = c.onDone; c.onDone = null; if (f) f(); else { exitBuilding(c); c.state = 'idle'; } }
      continue;
    }
    if (G.alarm && c.task?.type !== 'shelter' && c.task?.type !== 'fire' && c.state !== 'idle' && !c.trainee) { abort(c); }
    switch (c.state) {
      case 'move':
        if (followPath(c, dt)) { c.state = 'idle'; const f = c.onArrive; c.onArrive = null; if (f) f(); }
        else if (c.task?.type === 'hunt' && (c.restalk -= dt) <= 0) { c.path = null; c.state = 'idle'; stalk(c, c.task.deer); }
        c.anim = 'walk';
        break;
      case 'work':
        c.timer -= dt;
        c.phase += dt * 6;
        if (c.anim === 'chop' && Math.floor(c.timer * 1.6) !== Math.floor((c.timer + dt) * 1.6)) hooks.sfx('hit', c.x, c.z, { vol: 0.18, pitch: 1.6, gap: 90 });
        if (c.timer <= 0) { const f = c.onDone; c.onDone = null; c.anim = 'idle'; c.state = 'idle'; if (f) f(); }
        break;
      case 'build': {
        const b = c.task && G.buildings.get(c.task.site);
        if (!b || b.built) { if (b) b.builders = Math.max(0, b.builders - 1); c.task = null; c.state = 'idle'; break; }
        if (night || G.alarm) { abort(c); break; }
        const tm = Math.max(1, b.def.time * (b.upgrading ? 0.8 : 1));
        b.progress += dt / tm;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * dt / tm);
        c.phase += dt * 7;
        if (Math.floor(c.phase / 3.14) !== Math.floor((c.phase - dt * 7) / 3.14)) hooks.sfx('place', c.x, c.z, { vol: 0.15, pitch: 1.4 + rand() * 0.4, gap: 70 });
        if (rand() < dt * 1.5) hooks.fx('dust', b.x + (rand() - 0.5) * b.w, b.y + 0.2, b.z + (rand() - 0.5) * b.d, 2);
        if (b.progress >= 1) {
          b.builders = Math.max(0, b.builders - 1);
          b.upgrading = false;
          onBuilt(b);
          c.task = null; c.state = 'idle';
        } else hooks.onBuildingProgress && hooks.onBuildingProgress(b);
        break;
      }
      case 'repair': {
        const b = c.task && G.buildings.get(c.task.bid);
        if (!b || b.hp >= b.maxHp || b.fire > 0 || night || G.alarm) { if (b) b.repairers = Math.max(0, (b.repairers || 1) - 1); c.task = null; c.state = 'idle'; break; }
        const add = 14 * dt;
        b.repAcc = (b.repAcc || 0) + add;
        if (b.repAcc >= 30) { b.repAcc -= 30; if (G.stock.wood <= 0) { b.repairers--; c.task = null; c.state = 'idle'; idle(c, 3, 'Inget trä att reparera med'); break; } G.stock.wood--; }
        b.hp = Math.min(b.maxHp, b.hp + add);
        c.phase += dt * 7;
        if (Math.floor(c.phase / 3.14) !== Math.floor((c.phase - dt * 7) / 3.14)) hooks.sfx('place', c.x, c.z, { vol: 0.12, pitch: 1.6, gap: 90 });
        break;
      }
      case 'wait':
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'idle'; const f = c.retry; c.retry = null; if (f) f(); }
        break;
      case 'idle':
      default:
        if (decideBudget > 0) { decideBudget--; decide(c); }
        break;
    }
  }
}

function shelterDanger(c) {
  return G.enemies.length > 0 && !!nearestEnemy(c.x, c.z, 9, 1);
}

export { abort as abortCitizen, exitBuilding };
