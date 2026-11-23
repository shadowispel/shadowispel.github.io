// Nordheim – strid: soldater, fiender, räder, skepp, torn, projektiler, eld, hjortar, fiendeläger.
import { UNITS, ENEMIES, T, R, NAMES } from './data.js';
import { G, hooks, heightAt, groundY, tileOf, tileX, tileZ, rand, nextId, clamp, fmtTime } from './state.js';
import { PASS_P, PASS_E, DI, DJ } from './path.js';
import { followPath, moveRect } from './citizens.js';
import { removeBuilding, updatePass, placeBuilding, killPerson, bstat, population, recomputeCaps } from './sim.js';

/* =====================================================================
 * Rumslig hash (för snabba närhetsfrågor)
 * ===================================================================== */
const CELL = 4;
let hashW = 0, buckets = [];
function rebuildHash() {
  const n = G.map.n;
  const w = Math.ceil(n / CELL);
  if (w !== hashW) { hashW = w; buckets = []; for (let i = 0; i < w * w; i++) buckets.push([]); }
  for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;
  const put = e => { const bi = Math.floor(e.x / CELL), bj = Math.floor(e.z / CELL); if (bi < 0 || bj < 0 || bi >= w || bj >= w) return; buckets[bj * w + bi].push(e); };
  for (const c of G.citizens) if (!c.inside) put(c);
  for (const u of G.units) put(u);
  for (const e of G.enemies) put(e);
}
/** Närmaste levande entitet av lag `team` inom radie r. */
export function nearestEnemy(x, z, r, team, filter) {
  const w = hashW; if (!w) return null;
  const i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(w - 1, Math.floor((x + r) / CELL));
  const j0 = Math.max(0, Math.floor((z - r) / CELL)), j1 = Math.min(w - 1, Math.floor((z + r) / CELL));
  let best = null, bd = r * r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const L = buckets[j * w + i];
    for (let q = 0; q < L.length; q++) {
      const e = L[q];
      const et = e.kind === 'enemy' ? 1 : 0;
      if (et !== team || e.dead || e.inside) continue;
      if (filter && !filter(e)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}
export function entitiesNear(x, z, r, out) {
  out.length = 0;
  const w = hashW; if (!w) return out;
  const i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(w - 1, Math.floor((x + r) / CELL));
  const j0 = Math.max(0, Math.floor((z - r) / CELL)), j1 = Math.min(w - 1, Math.floor((z + r) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const L = buckets[j * w + i]; for (let q = 0; q < L.length; q++) out.push(L[q]); }
  return out;
}

/* =====================================================================
 * Skapa enheter
 * ===================================================================== */
const ENEMY_CLOTH = { plundrare: 0x9a2c22, fbagskytt: 0x7a4a2a, barsark: 0x5a3a26, stege: 0x8a4a22, murbracka: 0x4a2a1a, troll: 0x6a7a5a, hovding: 0x3a1414 };
export function makeUnit(type, x, z, team = 0, from) {
  const def = team ? ENEMIES[type] : UNITS[type];
  const u = {
    kind: team ? 'enemy' : 'unit', id: nextId(), type, team, def,
    name: from ? from.name : (team ? def.name : NAMES[Math.floor(rand() * NAMES.length)]),
    x, z, y: groundY(x, z), yaw: rand() * 6.28,
    hp: def.hp, maxHp: def.hp, atk: def.atk, range: def.range, cd: def.cd, cdT: rand() * def.cd, armor: def.armor, speed: def.speed,
    state: 'idle', order: null, target: null, path: null, pi: 0, phase: rand() * 10, anim: 'idle',
    ax: x, az: z, thinkT: rand() * 0.5, lastHit: -99, repathT: 0,
    hair: from ? from.hair : 0x5a3a1a, skin: from ? from.skin : 0xe8b890,
    cloth: team ? ENEMY_CLOTH[type] : (type === 'krigare' ? 0x2f5f9a : type === 'bagskytt' ? 0x3f6a3a : 0x7a2a5a)
  };
  if (team) {
    u.torch = type === 'plundrare' && rand() < 0.45;
    u.ladder = type === 'stege';
    G.enemies.push(u);
  } else G.units.push(u);
  return u;
}

/* =====================================================================
 * Skada
 * ===================================================================== */
export function damage(target, amount, src) {
  if (!target || target.dead) return;
  if (target.def && target.def.hp != null && target.kind == null) { damageBuilding(target, amount, src); return; }
  const dmg = Math.max(1, amount - (target.armor || 0)) * (0.85 + rand() * 0.3);
  target.hp -= dmg;
  target.lastHit = G.time;
  hooks.fx('blood', target.x, target.y + 0.3, target.z, 4);
  if (target.kind === 'cit') { target.fear = 8; }
  if (src && src.kind && (target.kind === 'unit' || target.kind === 'enemy') && !target.target && (!target.order || (target.order.type === 'attack' && !target.order.target.kind))) target.target = src;
  if (target.hp <= 0) kill(target, src);
}
function damageBuilding(b, amount, src) {
  if (!G.buildings.has(b.id)) return;
  b.hp -= amount;
  b.lastHit = G.time;
  if (b.team === 0 && (!G._hitNote || G.time - G._hitNote > 15) && !b.def.wall) { G._hitNote = G.time; hooks.notify(b.def.name + ' anfalls!', 'bad', { x: b.x, z: b.z }); }
  hooks.fx('debris', b.x + (rand() - 0.5) * b.w * 0.6, b.y + 0.5, b.z + (rand() - 0.5) * b.d * 0.6, 3);
  if (b.team === 1 && src && src.kind === 'unit') {
    for (const e of G.enemies) if (e.guard && !e.target && (e.x - b.x) ** 2 + (e.z - b.z) ** 2 < 400) { e.target = src; e.path = null; }
  }
  if (b.hp <= 0) {
    // de som skyddar sig inne flyr ut
    removeBuilding(b, { destroyed: true });
  }
}
function kill(e, src) {
  e.dead = true;
  e.hp = 0;
  hooks.sfx(e.kind === 'enemy' ? 'hit' : 'hurt', e.x, e.z, { vol: 0.6, pitch: e.type === 'troll' ? 0.5 : 1 });
  if (e.kind === 'enemy') {
    const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1);
    G.corpses.push({ x: e.x, z: e.z, y: e.y, t: 0, yaw: e.yaw, team: 1, type: e.type, cloth: e.cloth });
    if (e.loot) { G.stock[e.loot.r] = Math.min(G.cap[e.loot.r] || 1e9, G.stock[e.loot.r] + e.loot.n); hooks.float('↩ ' + e.loot.n, e.x, e.z, e.loot.r); }
    G.counters.kills = (G.counters.kills || 0) + 1;
    if (rand() < 0.3) { G.stock.gold += 1 + (e.type === 'troll' ? 15 : 0); }
    if (G.selEnemy === e) G.selEnemy = null;
  } else {
    killPerson(e);
    if (e.kind === 'unit') hooks.notify(e.name + ' (' + e.def.name.toLowerCase() + ') har stupat', 'bad', { x: e.x, z: e.z });
    else hooks.notify(e.name + ' dödades av fienden', 'bad', { x: e.x, z: e.z });
  }
}

/* =====================================================================
 * Projektiler
 * ===================================================================== */
export function shootArrow(x, y, z, target, team, onHit, dmg = 0, src = null) {
  const tx = target.x, tz = target.z, ty = (target.y || 0) + (target.kind ? 0.3 : 0.6);
  const d = Math.hypot(tx - x, tz - z);
  G.projectiles.push({ x0: x, y0: y, z0: z, x: x, y: y, z: z, tx, ty, tz, target, t: 0, dur: Math.max(0.25, d / 14), team, dmg, onHit, src, arc: Math.min(2, d * 0.12) });
  hooks.sfx('shoot', x, z, { vol: 0.25, pitch: 0.6, gap: 60 });
}
hooks.shootArrow = shootArrow;

function projectileTick(dt) {
  const P = G.projectiles;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.t += dt;
    const f = Math.min(1, p.t / p.dur);
    // följ målet lite
    if (p.target && !p.target.dead && p.target.x != null) { p.tx += (p.target.x - p.tx) * Math.min(1, dt * 4); p.tz += (p.target.z - p.tz) * Math.min(1, dt * 4); }
    const px = p.x, py = p.y, pz = p.z;
    p.x = p.x0 + (p.tx - p.x0) * f; p.z = p.z0 + (p.tz - p.z0) * f;
    p.y = p.y0 + (p.ty - p.y0) * f + Math.sin(f * Math.PI) * p.arc;
    p.dx = p.x - px; p.dy = p.y - py; p.dz = p.z - pz;
    if (f >= 1) {
      P.splice(i, 1);
      const t = p.target;
      if (t && !t.dead) {
        if (t.kind && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < 1.4) {
          if (p.dmg) damage(t, p.dmg, p.src);
        } else if (!t.kind && G.buildings.has(t.id) && p.dmg) damageBuilding(t, p.dmg, p.src);
      }
      if (p.onHit) p.onHit();
    }
  }
}

/* =====================================================================
 * Rörelse och strid
 * ===================================================================== */
function distToRect(x, z, b) {
  const dx = Math.max(b.i - x, 0, x - (b.i + b.w));
  const dz = Math.max(b.j - z, 0, z - (b.j + b.d));
  return Math.hypot(dx, dz);
}
function targetDist(e, t) {
  if (t.kind) return Math.hypot(t.x - e.x, t.z - e.z);
  return distToRect(e.x, e.z, t);
}
function alive(t) {
  if (!t) return false;
  if (t.kind) return !t.dead && !t.inside && (t.kind !== 'cit' || G.citizens.includes(t));
  return G.buildings.has(t.id);
}
function steer(e, tx, tz, dt, sp) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  const step = Math.min(d, sp * dt);
  const nx = e.x + dx / d * step, nz = e.z + dz / d * step;
  const k = tileOf(nx, nz);
  const mask = e.team ? PASS_E : PASS_P;
  if (k >= 0 && (G.pg.pass[k] & mask)) { e.x = nx; e.z = nz; }
  else {
    // glid längs hinder
    const kx = tileOf(nx, e.z), kz = tileOf(e.x, nz);
    if (kx >= 0 && (G.pg.pass[kx] & mask)) e.x = nx; else if (kz >= 0 && (G.pg.pass[kz] & mask)) e.z = nz;
  }
  e.yaw = lerpAngle(e.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
  e.y = groundY(e.x, e.z);
  e.phase += dt * sp * 5.5;
  e.anim = 'walk';
  return d <= step + 0.01;
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

function pathTo(e, t) {
  const mask = e.team ? PASS_E : PASS_P;
  if (G.combatBudget <= 0) return 'wait';
  if (t.kind) {
    const i = Math.floor(t.x), j = Math.floor(t.z);
    return moveRect(e, i - 1, j - 1, i + 1, j + 1, null, null, mask, 2500, 'combatBudget');
  }
  return moveRect(e, t.i - 1, t.j - 1, t.i + t.w, t.j + t.d, null, null, mask, 4000, 'combatBudget');
}

function attack(e, t, dt) {
  e.yaw = lerpAngle(e.yaw, Math.atan2(t.x - e.x, t.z - e.z), Math.min(1, dt * 10));
  e.anim = e.range > 2 ? 'bow' : 'attack';
  if (e.cdT > 0) return;
  e.cdT = e.cd * (0.9 + rand() * 0.2);
  e.swing = 0.35;
  if (e.range > 2) {
    shootArrow(e.x, e.y + 0.45, e.z, t, e.team, null, e.atk, e);
  } else {
    let dmg = e.atk;
    if (!t.kind) {
      // byggnader: murbräcka gör full skada, övriga mindre
      dmg = e.def.siege ? e.atk : e.type === 'troll' ? e.atk * 1.2 : e.atk * 0.6;
      if (e.torch && t.team === 0 && !t.def.wall && t.fire <= 0 && rand() < 0.35) ignite(t);
    } else if (e.type === 'troll') {
      // slag med räckvidd
      const near = entitiesNear(e.x, e.z, 1.6, _tmpArr);
      for (const o of near) if (o !== t && (o.kind === 'enemy' ? 1 : 0) !== e.team && Math.hypot(o.x - e.x, o.z - e.z) < 1.5) damage(o, e.atk * 0.5, e);
      hooks.shake && hooks.shake(0.15, e.x, e.z);
    }
    damage(t, dmg, e);
    hooks.sfx(t.kind ? 'hit' : 'break', e.x, e.z, { vol: 0.35, pitch: e.def.siege ? 0.5 : 1, gap: 50 });
  }
}
const _tmpArr = [];

/** Gå mot och anfall mål. */
function engage(e, t, dt) {
  const d = targetDist(e, t);
  const reach = e.range + (t.kind ? 0.15 : 0.55);
  if (d <= reach) { e.path = null; attack(e, t, dt); return; }
  // direkt styrning på kort avstånd mot rörliga mål
  if (t.kind && d < 4.5 && !e.unreachT) { steer(e, t.x, t.z, dt, e.speed); return; }
  if (e.unreachT > 0) e.unreachT -= dt;
  e.repathT -= dt;
  const moved = e.pathFor !== t || (t.kind && Math.hypot(t.x - (e.ptx || 0), t.z - (e.ptz || 0)) > 1.8);
  if (!e.path || (moved && e.repathT <= 0)) {
    e.repathT = 0.7 + rand() * 0.3;
    const r = pathTo(e, t);
    if (r === 'fail') { e.unreach = (e.unreach || 0) + 1; e.path = null; e.repathT = 2 + rand() * 2; if (t.kind) { steer(e, t.x, t.z, dt, e.speed); } return 'fail'; }
    e.pathFor = t; e.ptx = t.x; e.ptz = t.z;
    if (r !== 'ok') return;
    if (!e.path) { if (t.kind) steer(e, t.x, t.z, dt, e.speed); else { const cx = clamp(e.x, t.i, t.i + t.w), cz = clamp(e.z, t.j, t.j + t.d); steer(e, cx, cz, dt, e.speed); } return; }
  }
  e.anim = 'walk';
  const sp = e.speed;
  const saved = e.speed; e.speed = sp;
  if (followPath(e, dt)) { e.path = null; }
  e.speed = saved;
}

/* ---------- Spelarens soldater ---------- */
function unitTick(u, dt) {
  u.cdT -= dt; if (u.swing > 0) u.swing -= dt;
  u.anim = 'idle';
  const o = u.order;
  if (o && o.type === 'move') {
    if (!u.path && !o.pathed) {
      const r = moveRect(u, Math.floor(o.x), Math.floor(o.z), Math.floor(o.x), Math.floor(o.z), null, null, PASS_P);
      if (r === 'wait') return;
      o.pathed = true;
      if (r === 'fail') {
        // försök närmaste gångbara
        const r2 = moveRect(u, Math.floor(o.x) - 2, Math.floor(o.z) - 2, Math.floor(o.x) + 2, Math.floor(o.z) + 2, null, null, PASS_P);
        if (r2 !== 'ok') { u.order = null; u.ax = u.x; u.az = u.z; return; }
      }
      u.finalX = o.x; u.finalZ = o.z;
    }
    if (u.state === 'wait') { u.timer -= dt; if (u.timer <= 0) { u.state = 'idle'; o.pathed = false; } return; }
    u.anim = 'walk';
    if (!u.path || followPath(u, dt)) {
      // sista biten direkt
      if (steer(u, o.x, o.z, dt, u.speed)) { u.order = null; u.ax = u.x; u.az = u.z; u.finalX = null; u.path = null; u.anim = 'idle'; }
    }
    return;
  }
  if (o && o.type === 'attack') {
    if (!alive(o.target)) { u.order = null; u.ax = u.x; u.az = u.z; u.target = null; return; }
    // anfaller en byggnad: försvara dig mot fiender som går till angrepp i närheten, fortsätt sedan
    if (!o.target.kind) {
      if (u.target && (!alive(u.target) || !u.target.kind || targetDist(u, u.target) > 8)) u.target = null;
      u.thinkT -= dt;
      if (!u.target && u.thinkT <= 0) { u.thinkT = 0.4 + rand() * 0.2; const e = nearestEnemy(u.x, u.z, u.range > 2 ? u.range : 3.5, 1); if (e) u.target = e; }
      if (u.target) { engage(u, u.target, dt); return; }
    }
    engage(u, o.target, dt);
    return;
  }
  // inget order: försvara position
  u.thinkT -= dt;
  if (u.thinkT <= 0) {
    u.thinkT = 0.35 + rand() * 0.2;
    // under en räd försvarar sig soldater utan order ett större område runt sin post (inte lägrets vakter)
    const raiding = G.raid && G.raid.active;
    const leash = raiding ? 20 : 14;
    if (u.target && (!alive(u.target) || Math.hypot(u.target.x - u.ax, u.target.z - u.az) > leash)) u.target = null;
    if (!u.target) {
      const aggro = raiding ? (u.range > 2 ? u.range + 4 : 11) : (u.range > 2 ? u.range + 1.5 : 6.5);
      const e = nearestEnemy(u.x, u.z, aggro, 1, raiding ? (x => !x.guard) : null);
      if (e && Math.hypot(e.x - u.ax, e.z - u.az) < leash - 1) u.target = e;
      else if (!e && u.range < 2) {
        // anfall fientliga byggnader i närheten (lägret)
        for (const b of G.buildings.values()) if (b.team === 1 && distToRect(u.x, u.z, b) < 4) { u.target = b; break; }
      }
    }
  }
  if (u.target) { engage(u, u.target, dt); return; }
  // gå tillbaka till ankarpunkten
  const d = Math.hypot(u.ax - u.x, u.az - u.z);
  if (d > 0.6) {
    if (d > 3 && !u.path) { const r = moveRect(u, Math.floor(u.ax), Math.floor(u.az), Math.floor(u.ax), Math.floor(u.az), null, null, PASS_P); if (r === 'fail') { u.ax = u.x; u.az = u.z; } }
    if (u.path) { u.anim = 'walk'; if (followPath(u, dt)) u.path = null; }
    else steer(u, u.ax, u.az, dt, u.speed);
  }
}

/* ---------- Fiender ---------- */
function enemyTick(e, dt) {
  e.cdT -= dt; if (e.swing > 0) e.swing -= dt;
  e.anim = 'idle';
  // vakter i lägret
  if (e.guard && !e.target) {
    e.thinkT -= dt;
    if (e.thinkT <= 0) { e.thinkT = 0.5; const t = nearestEnemy(e.x, e.z, 7, 0, x => x.kind !== 'cit'); if (t) e.target = t; }
    if (!e.target) { const d = Math.hypot(e.ax - e.x, e.az - e.z); if (d > 0.5) steer(e, e.ax, e.az, dt, e.speed * 0.6); return; }
  }
  // flykt (med byte eller reträtt)
  if (e.flee) {
    const sp = e.spawn;
    if (!e.path && e.state !== 'wait') {
      const r = moveRect(e, Math.floor(sp.x) - 1, Math.floor(sp.z) - 1, Math.floor(sp.x) + 1, Math.floor(sp.z) + 1, null, null, PASS_E);
      if (r === 'fail') { steer(e, sp.x, sp.z, dt, e.speed); }
    }
    if (e.state === 'wait') { e.timer -= dt; if (e.timer <= 0) e.state = 'idle'; return; }
    if (e.path) { e.anim = 'walk'; if (followPath(e, dt)) e.path = null; }
    if (Math.hypot(sp.x - e.x, sp.z - e.z) < 2.2) escape(e);
    return;
  }
  e.thinkT -= dt;
  if (e.thinkT <= 0) {
    e.thinkT = 0.45 + rand() * 0.25;
    if (e.target && !alive(e.target)) { e.target = null; e.path = null; }
    if (e.target && e.target.kind && targetDist(e, e.target) > 9) { e.target = null; e.path = null; }
    if (e.ignoreT > 0) e.ignoreT -= 0.5;
    if (!e.target || !e.target.kind) {
      if (!e.def.siege && !(e.ignoreT > 0)) {
        const t = nearestEnemy(e.x, e.z, e.type === 'troll' ? 6 : e.range > 2 ? e.range + 1 : 4.5, 0);
        if (t) { e.target = t; e.path = null; }
      }
    }
    if (!e.target) {
      if (e.type === 'plundrare' && !e.loot) {
        let best = null, bd = 18 * 18;
        for (const b of G.buildings.values()) {
          if (b.team || !b.built) continue;
          const st = bstat(b, 'store'); if (!st) continue;
          const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2; if (d < bd) { bd = d; best = b; }
        }
        if (best) e.target = best;
      }
      if (!e.target && e.torch) {
        let best = null, bd = 9 * 9;
        for (const b of G.buildings.values()) {
          if (b.team || b.def.wall || b.def.gate || b.fire > 0 || b.type === 'field') continue;
          const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2; if (d < bd) { bd = d; best = b; }
        }
        if (best) e.target = best;
      }
      if (!e.target && (e.def.siege || e.type === 'troll')) {
        let best = null, bd = 10 * 10;
        for (const b of G.buildings.values()) {
          if (b.team || b.type === 'field') continue;
          const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2; if (d < bd) { bd = d; best = b; }
        }
        if (best) e.target = best;
      }
    }
  }
  if (e.target) {
    const t = e.target;
    // plundring
    if (!t.kind && e.type === 'plundrare' && !e.loot && bstat(t, 'store') && targetDist(e, t) <= 1.6) {
      const opts = ['wood', 'stone', 'food', 'gold', 'iron'].filter(r => G.stock[r] >= 5);
      if (opts.length) {
        const r = opts[Math.floor(rand() * opts.length)];
        const n = Math.min(G.stock[r], 12 + Math.floor(rand() * 10));
        G.stock[r] -= n; e.loot = { r, n };
        hooks.float('−' + n, t.x, t.z, r);
        if (!G._lootNote || G.time - G._lootNote > 10) { G._lootNote = G.time; hooks.notify('Plundrare stjäl ur förrådet: ' + t.def.name + '!', 'bad', { x: t.x, z: t.z }); }
      }
      if (e.torch && t.fire <= 0 && rand() < 0.5) ignite(t);
      e.flee = true; e.target = null; e.path = null;
      return;
    }
    const r = engage(e, t, dt);
    if (r === 'fail') { e.target = null; e.ignoreT = 3; }
    return;
  }
  // följ flödesfältet mot hallen
  flowStep(e, dt);
}

function flowStep(e, dt) {
  const f = G.flow; if (!f) return;
  const n = G.map.n;
  const k = tileOf(e.x, e.z); if (k < 0) return;
  const i = k % n, j = (k / n) | 0;
  // nära hallen → anfall den
  if (G.hall && G.buildings.has(G.hall.id) && distToRect(e.x, e.z, G.hall) < 1.5) { e.target = G.hall; return; }
  let best = -1, bd = f[k];
  for (let d = 0; d < 8; d++) {
    const ni = i + DI[d], nj = j + DJ[d];
    if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
    const nk = nj * n + ni;
    if (f[nk] < bd) { bd = f[nk]; best = nk; }
  }
  if (best < 0) {
    // ingen väg – gå rakt mot hallen
    if (G.hall) steer(e, G.hall.x, G.hall.z, dt, e.speed);
    return;
  }
  if (!(G.pg.pass[best] & PASS_E)) {
    const bid = G.occ[best];
    const b = bid && G.buildings.get(bid);
    if (b && b.team === 0) {
      if (e.ladder && b.def.wall) {
        G.ladder[best] = 45; updatePass(best); e.ladder = false;
        hooks.onBuildingChanged(b);
        hooks.notify('Fienden reser stormstegar mot muren!', 'bad', { x: b.x, z: b.z });
        return;
      }
      e.target = b; return;
    }
    steer(e, tileX(best), tileZ(best), dt, e.speed); return;
  }
  steer(e, tileX(best), tileZ(best), dt, e.speed);
}

function escape(e) {
  const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1);
  e.dead = true;
  if (e.loot) hooks.notify('Plundrare kom undan med ' + e.loot.n + ' ' + ({ wood: 'trä', stone: 'sten', food: 'mat', gold: 'guld', iron: 'järn' }[e.loot.r] || ''), 'bad');
}

/* ---------- Separation (undvik att alla står i samma punkt) ---------- */
const _near = [];
function separate(dt) {
  const all = G.units.concat(G.enemies);
  for (let q = 0; q < all.length; q++) {
    const a = all[q];
    entitiesNear(a.x, a.z, 0.8, _near);
    let px = 0, pz = 0;
    const ra = a.type === 'troll' ? 0.6 : a.type === 'murbracka' ? 0.7 : 0.32;
    for (const b of _near) {
      if (b === a || b.kind === 'cit') continue;
      const rb = b.type === 'troll' ? 0.6 : b.type === 'murbracka' ? 0.7 : 0.32;
      const dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz, rr = ra + rb;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); const push = (rr - d) / d * 0.5; px += dx * push; pz += dz * push; }
      else if (d2 <= 1e-6) { px += (rand() - 0.5) * 0.05; pz += (rand() - 0.5) * 0.05; }
    }
    if (px || pz) {
      const mask = a.team ? PASS_E : PASS_P;
      const nx = a.x + clamp(px, -0.5, 0.5) * Math.min(1, dt * 8), nz = a.z + clamp(pz, -0.5, 0.5) * Math.min(1, dt * 8);
      const k = tileOf(nx, nz);
      if (k >= 0 && (G.pg.pass[k] & mask)) { a.x = nx; a.z = nz; }
    }
  }
}

/* =====================================================================
 * Torn
 * ===================================================================== */
function towerTick(dt) {
  for (const b of G.buildings.values()) {
    if (!b.built || b.team) continue;
    if (b.type !== 'archertower' && b.type !== 'watchtower' && b.type !== 'hall') continue;
    b.cd -= dt;
    if (b.cd > 0) continue;
    const range = b.type === 'hall' ? 7.5 : bstat(b, 'range');
    const t = nearestEnemy(b.x, b.z, range, 1);
    if (!t) { b.cd = 0.3; continue; }
    if (b.type === 'hall') { b.cd = b.lvl > 1 ? 1.3 : 1.8; shootArrow(b.x + (rand() - 0.5) * 2, b.y + 1.6, b.z + b.d / 2, t, 0, null, b.lvl > 1 ? 7 : 5, b); continue; }
    b.cd = bstat(b, 'cd');
    const h = b.type === 'archertower' ? (b.lvl > 1 ? 2.9 : 2.6) : 2.8;
    shootArrow(b.x, b.y + h, b.z, t, 0, null, bstat(b, 'dmg'), b);
  }
}

/* =====================================================================
 * Eld
 * ===================================================================== */
export function ignite(b) {
  if (!b || b.fire > 0 || b.def.wall && b.lvl > 1) return;
  b.fire = 0.25;
  if (!G._fireNote || G.time - G._fireNote > 8) { G._fireNote = G.time; hooks.notify('🔥 Det brinner: ' + b.def.name + '!', 'bad', { x: b.x, z: b.z }); }
  hooks.sfx('whoosh', b.x, b.z, { vol: 0.5 });
  hooks.onBuildingChanged(b);
}
let fireSpreadT = 0;
function fireTick(dt) {
  fireSpreadT += dt;
  const spread = fireSpreadT > 2; if (spread) fireSpreadT = 0;
  const winter = G.cal.season === 3;
  for (const b of [...G.buildings.values()]) {
    if (b.fire <= 0) continue;
    b.fire = Math.min(1, b.fire + dt * (winter ? 0.008 : 0.012));
    b.hp -= (0.8 + b.fire * 4.5) * dt * (b.type === 'hall' ? 0.5 : 1);
    if (b.type === 'hall' && b.hp < b.maxHp * 0.3) b.fire = Math.max(0, b.fire - dt * 0.05);
    b.lastHit = G.time;
    if (b.hp <= 0) { b.fire = 0; removeBuilding(b, { destroyed: true }); continue; }
    if (spread && rand() < b.fire * 0.07) {
      let cands = [];
      for (const o of G.buildings.values()) if (o !== b && o.fire <= 0 && !(o.def.wall && o.lvl > 1) && o.type !== 'field' && o.type !== 'well' && distToRect(b.x, b.z, o) < 1.6 + Math.max(b.w, b.d) / 2) cands.push(o);
      if (cands.length) ignite(cands[Math.floor(rand() * cands.length)]);
    }
  }
}

/* =====================================================================
 * Räder
 * ===================================================================== */
function raidInterval(w) {
  const base = G.sc && G.sc.interval ? G.sc.interval : (G.mode === 'survival' ? 220 : 300);
  return Math.max(G.mode === 'survival' ? 130 : 160, base * Math.pow(0.96, w));
}
export function scheduleFirstRaid() {
  const first = G.sc && G.sc.firstRaid ? G.sc.firstRaid : (G.mode === 'survival' ? 300 : 420);
  G.raid = { wave: 0, next: G.time + first, warned: false, active: false, spawns: [], ids: [], startT: 0 };
}
export function warnTime() {
  let w = 60;
  for (const b of G.buildings.values()) if (b.type === 'watchtower' && b.built && !b.team) w += 20;
  return Math.min(120, w);
}

function findBeaches() {
  if (G._beaches) return G._beaches;
  const m = G.map, n = m.n;
  const out = [];
  const cx = n / 2, cz = n / 2;
  for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
    const k = j * n + i;
    if (!(G.pg.pass[k] & PASS_E) || m.type[k] === T.WATER) continue;
    let water = 0;
    for (let d = 0; d < 4; d++) { const kk = (j + DJ[d]) * n + i + DI[d]; if (m.type[kk] === T.WATER) water++; }
    if (!water) continue;
    if ((i + j) % 3) continue;
    // fri linje från havet
    const ang0 = Math.atan2(j - cz, i - cx);
    let ok = null;
    for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
      const a = ang0 + da;
      let clear = true;
      for (let s = 2.2; s < 30; s += 1) {
        const x = i + 0.5 + Math.cos(a) * s, z = j + 0.5 + Math.sin(a) * s;
        if (heightAt(x, z) > -0.4 && x > 0 && z > 0 && x < n && z < n) { clear = false; break; }
      }
      if (clear) { ok = a; break; }
    }
    if (ok == null) continue;
    out.push({ k, x: i + 0.5, z: j + 0.5, ox: i + 0.5 + Math.cos(ok) * 30, oz: j + 0.5 + Math.sin(ok) * 30, ang: ok });
  }
  G._beaches = out;
  return out;
}
function pickSpawns(count) {
  const hall = G.hall;
  const beaches = findBeaches().filter(b => Math.hypot(b.x - hall.x, b.z - hall.z) > Math.min(26, G.map.n * 0.2) && G.flow && G.flow[b.k] < 1e8);
  const spawns = [];
  if (!beaches.length) return spawns;
  const first = beaches[Math.floor(rand() * beaches.length)];
  spawns.push({ type: 'sea', ...first });
  for (let i = 1; i < count; i++) {
    // närliggande strand
    const near = beaches.filter(b => Math.hypot(b.x - first.x, b.z - first.z) < 10 && !spawns.some(s => s.k === b.k));
    const b = near.length ? near[Math.floor(rand() * near.length)] : first;
    spawns.push({ type: 'sea', ...b });
  }
  return spawns;
}
function pickForestSpawn() {
  const m = G.map, n = m.n, hall = G.hall;
  for (let t = 0; t < 400; t++) {
    const k = Math.floor(rand() * n * n);
    if (m.type[k] !== T.FOREST || !(G.pg.pass[k] & PASS_E)) continue;
    const x = tileX(k), z = tileZ(k);
    const d = Math.hypot(x - hall.x, z - hall.z);
    if (d < Math.min(28, n * 0.22) || !G.flow || G.flow[k] > 1e8) continue;
    // inte nära egna byggnader
    let near = false;
    for (const b of G.buildings.values()) if (!b.team && Math.hypot(b.x - x, b.z - z) < 12) { near = true; break; }
    if (near) continue;
    return { type: 'land', k, x, z };
  }
  return null;
}

function composeRaid(wave) {
  const surv = G.mode === 'survival';
  let budget = (2.2 + wave * 2.4 + Math.pow(wave, 1.45) * 0.6) * G.raidMult * (surv ? 1 + wave * 0.05 : 1);
  const hasWalls = [...G.buildings.values()].some(b => b.def.wall && !b.team);
  const pool = [['plundrare', 4]];
  if (wave >= 2) pool.push(['fbagskytt', 2.5]);
  if (wave >= 3) pool.push(['barsark', 2]);
  if (wave >= 4 && hasWalls) pool.push(['stege', 1]);
  if (wave >= 5 && hasWalls) pool.push(['murbracka', 0.7]);
  if (wave >= (surv ? 6 : 7)) pool.push(['troll', 0.45]);
  const out = [];
  const counts = {};
  const maxOf = { stege: 3, murbracka: 2, troll: 1 + Math.floor(wave / 6) };
  let guard = 0;
  while (budget >= 1 && out.length < 42 && guard++ < 200) {
    const avail = pool.filter(([t]) => ENEMIES[t].cost <= budget && (counts[t] || 0) < (maxOf[t] || 99));
    if (!avail.length) break;
    let tot = avail.reduce((s, a) => s + a[1], 0), r = rand() * tot, pick = avail[0][0];
    for (const [t, w] of avail) { r -= w; if (r <= 0) { pick = t; break; } }
    out.push(pick); counts[pick] = (counts[pick] || 0) + 1; budget -= ENEMIES[pick].cost;
  }
  if (!out.length) out.push('plundrare');
  return out;
}

function raidTick(dt) {
  const R = G.raid; if (!R) return;
  if (!R.active) {
    const wt = warnTime();
    if (!R.warned && G.time >= R.next - wt) {
      R.warned = true;
      R.wave++;
      if (G.flowDirty || !G.flow) flowTick(0, true);
      R.units = composeRaid(R.wave);
      const land = (R.wave >= 2 && rand() < 0.3) || (G.sc && G.sc.camp && G.campAlive && rand() < 0.6);
      R.spawns = [];
      if (land) {
        const s = G.sc && G.sc.camp && G.campAlive && G.campPos ? { type: 'land', x: G.campPos.x, z: G.campPos.z, k: tileOf(G.campPos.x, G.campPos.z) } : pickForestSpawn();
        if (s) R.spawns.push(s);
      }
      if (!R.spawns.length) R.spawns = pickSpawns(Math.max(1, Math.ceil(R.units.reduce((s, t) => s + (t === 'troll' ? 3 : t === 'murbracka' ? 3 : 1), 0) / 9)));
      if (!R.spawns.length) { const s = pickForestSpawn(); if (s) R.spawns.push(s); }
      const where = R.spawns[0] ? (R.spawns[0].type === 'sea' ? 'från havet' : 'från skogen') : '';
      const big = R.units.includes('troll') ? ' – troll har siktats!' : R.units.includes('murbracka') ? ' – de har murbräckor!' : '';
      hooks.notify('Räd ' + where + ' om ' + fmtTime(R.next - G.time) + '! ' + R.units.length + ' fiender' + big, 'raid', R.spawns[0] ? { x: R.spawns[0].x, z: R.spawns[0].z } : null);
      hooks.sfx('countdown', 0, 0, { ui: true });
      hooks.onRaidWarn && hooks.onRaidWarn(R);
    }
    if (R.warned && G.time >= R.next) startRaid(R);
    return;
  }
  // aktiv räd – automatiskt larm när fienden närmar sig byn
  R.alarmT = (R.alarmT || 0) - dt;
  if (G.alarmAuto && !G.alarm && R.alarmT <= 0) {
    R.alarmT = 1;
    let near = false;
    for (const e of G.enemies) { if (e.raid !== R.wave) continue; for (const b of G.buildings.values()) { if (b.team || b.def.wall || b.type === 'field') continue; if ((b.x - e.x) ** 2 + (b.z - e.z) ** 2 < 196) { near = true; break; } } if (near) break; }
    // även arbetare ute i skogen eller vid stranden ska hinna undan
    if (!near) for (const c of G.citizens) { if (!c.inside && nearestEnemy(c.x, c.z, 10, 1, e => e.raid === R.wave)) { near = true; break; } }
    if (near) { G.alarm = true; hooks.notify('🔔 Fienden är vid byn – invånarna söker skydd!', 'raid'); hooks.sfx('countdown', 0, 0, { ui: true }); }
  }
  const alive = G.enemies.filter(e => e.raid === R.wave).length;
  const shipsIn = G.ships.some(s => s.raid === R.wave && s.kind === 'long' && (s.phase === 'in'));
  if (G.time - R.startT > 240) {
    for (const e of G.enemies) if (e.raid === R.wave && !e.flee) { e.flee = true; e.target = null; e.path = null; }
  }
  if (alive === 0 && !shipsIn && G.time - R.startT > 3) endRaid(R);
}

function startRaid(R) {
  R.active = true; R.startT = G.time;
  let idx = 0;
  const groups = R.spawns.map(() => []);
  R.units.forEach((t, i) => groups[i % groups.length].push(t));
  R.spawns.forEach((s, si) => {
    if (s.type === 'sea') {
      G.ships.push({ kind: 'long', raid: R.wave, x: s.ox, z: s.oz, tx: s.x, tz: s.z, ox: s.ox, oz: s.oz, yaw: Math.atan2(s.x - s.ox, s.z - s.oz), phase: 'in', cargo: groups[si], spawn: s, t: 0 });
    } else {
      for (const t of groups[si]) spawnEnemy(t, s, R.wave);
    }
  });
  hooks.notify('Räden har börjat! Försvara Nordheim!', 'raid', R.spawns[0] ? { x: R.spawns[0].x, z: R.spawns[0].z } : null);
  hooks.sfx('boom', 0, 0, { ui: true, vol: 0.5 });
  hooks.onRaidStart && hooks.onRaidStart(R);
}
function spawnEnemy(type, s, wave) {
  const k = s.k != null ? s.k : tileOf(s.x, s.z);
  const x = tileX(k) + (rand() - 0.5) * 0.8, z = tileZ(k) + (rand() - 0.5) * 0.8;
  const e = makeUnit(type, x, z, 1);
  e.raid = wave; e.spawn = { x: s.x, z: s.z };
  e.thinkT = rand();
  return e;
}
function endRaid(R) {
  R.active = false; R.warned = false;
  G.counters.raids++;
  const reward = 10 + R.wave * 4;
  G.stock.gold += reward;
  hooks.notify('Räd ' + R.wave + ' avvärjd! +' + reward + ' guld', 'good');
  hooks.sfx('win', 0, 0, { ui: true, vol: 0.6 });
  if (G.mode === 'survival') { G.score = G.counters.raids * population(); G.bestScore = Math.max(G.bestScore, G.score); }
  R.next = G.time + raidInterval(R.wave);
  for (const s of G.ships) if (s.kind === 'long' && s.raid === R.wave) s.phase = 'out';
  if (G.alarm && G.alarmAuto) { G.alarm = false; hooks.notify('Larmet är avblåst – tillbaka till arbetet', 'info'); }
  G.alarmAuto = true;
  hooks.onRaidEnd && hooks.onRaidEnd(R);
}

function shipTick(dt) {
  for (let i = G.ships.length - 1; i >= 0; i--) {
    const s = G.ships[i];
    s.t += dt;
    s.bob = Math.sin(s.t * 1.3) * 0.06;
    if (s.kind === 'long') {
      if (s.phase === 'in') {
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
        const sp = Math.min(3.2, 0.6 + d * 0.25);
        if (d < 2.6) {
          s.phase = 'wait';
          for (const t of s.cargo) spawnEnemy(t, s.spawn, s.raid);
          hooks.sfx('splash', s.x, s.z, { vol: 0.6 });
          hooks.notify('Fienden landstiger!', 'raid', { x: s.tx, z: s.tz });
        } else { s.x += dx / d * sp * dt; s.z += dz / d * sp * dt; s.yaw = Math.atan2(dx, dz); }
      } else if (s.phase === 'out') {
        const dx = s.ox - s.x, dz = s.oz - s.z, d = Math.hypot(dx, dz);
        s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 0.8));
        if (d < 1) { G.ships.splice(i, 1); continue; }
        s.x += Math.sin(s.yaw) * 2.6 * dt; s.z += Math.cos(s.yaw) * 2.6 * dt;
        s.fade = Math.max(0, 1 - s.t * 0);
      }
    } else if (s.kind === 'merchant') {
      if (s.phase === 'in') {
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
        if (d < 1.2) { s.phase = 'wait'; s.t = 0; G.merchantT = 60; hooks.notify('Ett handelsskepp har lagt till – bättre priser i 60 sekunder!', 'good', { x: s.x, z: s.z }); hooks.sfx('coin', s.x, s.z); }
        else { const sp = Math.min(2.5, 0.5 + d * 0.3); s.x += dx / d * sp * dt; s.z += dz / d * sp * dt; s.yaw = Math.atan2(dx, dz); }
      } else if (s.phase === 'wait') { if (s.t > 60) s.phase = 'out'; }
      else {
        const dx = s.ox - s.x, dz = s.oz - s.z, d = Math.hypot(dx, dz);
        if (d < 1) { G.ships.splice(i, 1); continue; }
        s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt));
        s.x += Math.sin(s.yaw) * 2 * dt; s.z += Math.cos(s.yaw) * 2 * dt;
      }
    }
  }
  if (G.merchantT > 0) G.merchantT -= dt;
}
/** Fri segelled från hamnen ut till havet (inte över land)? Returnerar utgångspunkt eller null. */
export function seaRoute(harbor) {
  const f = harbor.face || 0;
  const dir = [[0, 1], [1, 0], [0, -1], [-1, 0]][f];
  const tx = harbor.x + dir[0] * 4, tz = harbor.z + dir[1] * 4;
  const n = G.map.n, a0 = Math.atan2(dir[1], dir[0]);
  for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
    const a = a0 + da; let clear = true;
    for (let st = 1.5; st < 36; st += 1) {
      const x = tx + Math.cos(a) * st, z = tz + Math.sin(a) * st;
      if (x < 0 || z < 0 || x >= n || z >= n) break;
      if (heightAt(x, z) > -0.35) { clear = false; break; }
    }
    if (clear) return { tx, tz, ox: tx + Math.cos(a) * 34, oz: tz + Math.sin(a) * 34 };
  }
  return null;
}
export function sendMerchant() {
  const harbor = [...G.buildings.values()].find(b => b.type === 'harbor' && b.built && !b.team && seaRoute(b));
  if (!harbor) return;
  const r = seaRoute(harbor);
  G.ships.push({ kind: 'merchant', x: r.ox, z: r.oz, tx: r.tx, tz: r.tz, ox: r.ox, oz: r.oz, yaw: 0, phase: 'in', t: 0 });
}

/* =====================================================================
 * Flödesfält
 * ===================================================================== */
let flowT = 0;
function flowTick(dt, force) {
  flowT -= dt;
  if (!force) {
    if (!G.flowDirty || flowT > 0) return;
    if (!G.enemies.length && !(G.raid && G.raid.warned) && G.flow) return;
  }
  flowT = 0.8;
  G.flowDirty = false;
  const hall = G.hall;
  if (!hall || !G.buildings.has(hall.id)) return;
  const n = G.map.n;
  const goals = [];
  for (let j = hall.j - 1; j <= hall.j + hall.d; j++) for (let i = hall.i - 1; i <= hall.i + hall.w; i++) {
    if (i >= hall.i && i < hall.i + hall.w && j >= hall.j && j < hall.j + hall.d) continue;
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    goals.push(j * n + i);
  }
  const pg = G.pg, m = G.map;
  G.flow = pg.flow(goals, k => {
    if (pg.pass[k] & PASS_E) return pg.cost[k];
    const t = m.type[k];
    if (t === T.WATER || t === T.ROCK || m.res[k] === R.STONE || m.res[k] === R.ORE) return Infinity;
    const bid = G.occ[k];
    if (bid) { const b = G.buildings.get(bid); if (b && b.team === 0) return 5 + b.hp / 110; }
    return Infinity;
  });
}

/* =====================================================================
 * Hjortar
 * ===================================================================== */
let deerSpawnT = 0;
function deerTick(dt) {
  const m = G.map, n = m.n;
  if (!G.deerMax) { let f = 0; for (let k = 0; k < n * n; k++) if (m.type[k] === T.FOREST) f++; G.deerMax = Math.min(36, Math.max(6, Math.round(f / 55))); }
  deerSpawnT -= dt;
  const living = G.deer.filter(d => !d.gone);
  if (deerSpawnT <= 0 && living.length < G.deerMax) {
    deerSpawnT = G.deer.length < G.deerMax * 0.5 ? 2 : 25;
    for (let t = 0; t < 60; t++) {
      const k = Math.floor(rand() * n * n);
      if (m.type[k] !== T.FOREST || !(G.pg.pass[k] & PASS_P)) continue;
      let near = false;
      for (const b of G.buildings.values()) if (Math.abs(b.x - tileX(k)) + Math.abs(b.z - tileZ(k)) < 7) { near = true; break; }
      if (near) continue;
      G.deer.push({ x: tileX(k), z: tileZ(k), y: groundY(tileX(k), tileZ(k)), yaw: rand() * 6.28, tx: tileX(k), tz: tileZ(k), phase: 0, wait: rand() * 3, dead: false, hunter: 0, id: nextId() });
      break;
    }
  }
  for (let i = G.deer.length - 1; i >= 0; i--) {
    const d = G.deer[i];
    if (d.gone) { G.deer.splice(i, 1); continue; }
    if (d.dead) { d.deadT += dt; if (d.deadT > 90) G.deer.splice(i, 1); continue; }
    // fly från människor
    const th = nearestEnemy(d.x, d.z, 2.6, 0);
    if (th && !d.flee) { const a = Math.atan2(d.x - th.x, d.z - th.z); d.tx = d.x + Math.sin(a) * 5; d.tz = d.z + Math.cos(a) * 5; d.flee = 1.5; d.wait = 0; }
    if (d.flee > 0) d.flee -= dt; else d.flee = 0;
    if (d.wait > 0) { d.wait -= dt; d.anim = 'graze'; continue; }
    const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz);
    if (dist < 0.1) {
      d.wait = 2 + rand() * 5;
      for (let t = 0; t < 8; t++) {
        const nx = d.x + (rand() - 0.5) * 8, nz = d.z + (rand() - 0.5) * 8;
        const k = tileOf(nx, nz);
        if (k >= 0 && (G.pg.pass[k] & PASS_P) && (m.type[k] === T.FOREST || m.type[k] === T.GRASS || m.type[k] === T.MEADOW) && !G.occ[k]) { d.tx = nx; d.tz = nz; break; }
      }
      continue;
    }
    const sp = (d.flee > 0 ? 3.2 : 0.9) * dt;
    const nx = d.x + dx / dist * Math.min(sp, dist), nz = d.z + dz / dist * Math.min(sp, dist);
    const k = tileOf(nx, nz);
    if (k < 0 || !(G.pg.pass[k] & PASS_P)) { d.tx = d.x; d.tz = d.z; continue; }
    d.x = nx; d.z = nz; d.y = groundY(nx, nz);
    d.yaw = Math.atan2(dx, dz); d.phase += sp * 6; d.anim = 'walk';
  }
}

/* =====================================================================
 * Fiendeläger
 * ===================================================================== */
export const CAMP_DEFS = {
  jarlhall: { name: 'Jarlens hall', icon: '🏴', size: [4, 3], hp: 3600, cost: {}, time: 1, desc: 'Fiendejarlens säte. Förstör den!' },
  tent: { name: 'Fiendetält', icon: '⛺', size: [2, 2], hp: 360, cost: {}, time: 1, desc: 'Fiendens tält.' }
};
export function spawnCamp(cp) {
  const hall = placeBuilding('jarlhall', cp.i, cp.j, 0, { def: CAMP_DEFS.jarlhall, instant: true, free: true, team: 1, noFlatten: false });
  G.campHall = hall; G.campAlive = true;
  G.campPos = { x: hall.x, z: hall.z + 3 };
  const spots = [[-4, -3], [5, -3], [-4, 4], [5, 4], [0, 5]];
  for (const [di, dj] of spots) {
    const i = cp.i + di, j = cp.j + dj;
    const n = G.map.n;
    let ok = i > 1 && j > 1 && i + 2 < n - 1 && j + 2 < n - 1;
    for (let jj = j; ok && jj < j + 2; jj++) for (let ii = i; ii < i + 2; ii++) { const k = jj * n + ii; if (G.occ[k] || G.map.type[k] === T.WATER || G.map.type[k] === T.ROCK || G.map.res[k] === R.STONE || G.map.res[k] === R.ORE) ok = false; }
    if (ok) placeBuilding('tent', i, j, 0, { def: CAMP_DEFS.tent, instant: true, free: true, team: 1 });
  }
  const guards = ['hovding', 'barsark', 'barsark', 'plundrare', 'plundrare', 'fbagskytt', 'fbagskytt', 'plundrare'];
  guards.forEach((t, i) => {
    const a = i / guards.length * Math.PI * 2;
    const x = hall.x + Math.cos(a) * 3.2, z = hall.z + Math.sin(a) * 3.2 + 0.5;
    const k = tileOf(x, z);
    if (k < 0 || !(G.pg.pass[k] & PASS_E)) return;
    const e = makeUnit(t, x, z, 1);
    e.guard = true; e.ax = x; e.az = z; e.spawn = { x, z }; e.raid = -1;
  });
}

/* =====================================================================
 * Huvudtick
 * ===================================================================== */
export function combatTick(dt) {
  G.frame = (G.frame || 0) + 1;
  rebuildHash();
  flowTick(dt);
  raidTick(dt);
  shipTick(dt);
  for (let i = G.units.length - 1; i >= 0; i--) { const u = G.units[i]; if (!u.dead) unitTick(u, dt); }
  // läkning utanför strid: soldater läker snabbare nära kasern eller hall, bybor långsamt
  G._healT = (G._healT || 0) + dt;
  if (G._healT >= 0.5) {
    const ht = G._healT; G._healT = 0;
    for (const u of G.units) {
      if (u.hp >= u.maxHp || G.time - u.lastHit < 8) continue;
      let rate = 1.2;
      for (const b of G.buildings.values()) if ((b.type === 'barracks' || b.type === 'hall') && b.built && !b.team && (b.x - u.x) ** 2 + (b.z - u.z) ** 2 < 64) { rate = 4; break; }
      u.hp = Math.min(u.maxHp, u.hp + rate * ht);
    }
    for (const c of G.citizens) if (c.hp < c.maxHp && G.time - (c.lastHit || -99) > 8) c.hp = Math.min(c.maxHp, c.hp + 0.4 * ht);
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) { const e = G.enemies[i]; if (!e.dead) enemyTick(e, dt); }
  separate(dt);
  towerTick(dt);
  projectileTick(dt);
  fireTick(dt);
  deerTick(dt);
  for (let i = G.corpses.length - 1; i >= 0; i--) { G.corpses[i].t += dt; if (G.corpses[i].t > 25) G.corpses.splice(i, 1); }
  // lägret förstärker sina vakter
  if (G.campAlive && G.campHall && G.buildings.has(G.campHall.id)) {
    G.campT = (G.campT || 0) + dt;
    if (G.campT > 40) {
      G.campT = 0;
      const guards = G.enemies.filter(e => e.guard).length;
      if (guards < 12) {
        const h = G.campHall, types = ['plundrare', 'barsark', 'fbagskytt', 'barsark', 'plundrare'];
        for (let t = 0; t < 8; t++) {
          const a = rand() * Math.PI * 2, x = h.x + Math.cos(a) * 3.5, z = h.z + Math.sin(a) * 3.5;
          const k = tileOf(x, z); if (k < 0 || !(G.pg.pass[k] & PASS_E)) continue;
          const e = makeUnit(types[Math.floor(rand() * types.length)], x, z, 1);
          e.guard = true; e.ax = x; e.az = z; e.spawn = { x, z }; e.raid = -1;
          break;
        }
      }
    }
  }
  if (G.campAlive && G.campHall && !G.buildings.has(G.campHall.id)) {
    G.campAlive = false; G.campDestroyed = true;
    hooks.notify('Jarlens hall har fallit!', 'good');
    for (const e of G.enemies) if (e.guard) { e.guard = false; e.flee = true; }
  }
  // handelsskepp varje årstid
  if (G.cal && G.lastMerchantSeason !== G.cal.dayN && G.cal.dayInSeason === 1 && G.cal.phase > 0.2 && G.cal.phase < 0.3) {
    G.lastMerchantSeason = G.cal.dayN;
    if ([...G.buildings.values()].some(b => b.type === 'harbor' && b.built && !b.team)) sendMerchant();
  }
}
