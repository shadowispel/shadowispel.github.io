/**
 * Rymdjakt – AI: jaktplan (anfall/avbryt/undanmanöver), interceptorer med missiler, bombplan med torpeder och
 * akterskytt, vingmän med order, stora skepp, fraktare, minor och övningsdrönare.
 */
import * as THREE from 'three';
import { NPC_WEAPON, NPC_MISSILE, NPC_TORPEDO } from './data.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _l = new THREE.Vector3(), _q = new THREE.Quaternion(), _push = new THREE.Vector3(), _av = new THREE.Vector3(), _aw = new THREE.Vector3(), _ax = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

/** Skapar AI-tillstånd. kind: fighter|interceptor|bomber|wingman|capital|station|freighter|mine|drone|none */
export function makeAI(kind, o = {}) {
  return Object.assign({
    kind, state: 'attack', target: null, think: Math.random() * 0.5, timer: 0, jink: 0, err: new THREE.Vector3(), errT: 0,
    breakDir: new THREE.Vector3(), prefer: null, order: 'free', slot: new THREE.Vector3(18, 2, 16),
    goal: null, path: null, pathIdx: 0, standoff: 0, launch: null, launchT: 10, mlock: 0, mcd: rnd(5, 9), tcd: rnd(2, 5), tailCd: 0,
    armed: false, armT: 0, home: null, wander: null, arrived: false, speedMult: 1, leash: 0, passive: false, flareCd: 0
  }, o);
}

/** Styr skeppet mot en världsriktning. bank: rolla in i svängen. */
export function steer(s, dir, bank = true, gain = 2.6) {
  _q.copy(s.quat).invert();
  _l.copy(dir).applyQuaternion(_q);
  const c = s.ctrl;
  const fz = -_l.z;
  const ang = Math.acos(clamp(fz / (_l.length() || 1), -1, 1));
  const yawErr = Math.atan2(_l.x, -_l.z), pitchErr = Math.atan2(_l.y, -_l.z);
  c.pitch = clamp(pitchErr * gain, -1, 1);
  c.yaw = clamp(yawErr * gain, -1, 1);
  if (bank && ang > 0.2) {
    const rollErr = Math.atan2(_l.x, _l.y);
    c.roll = Math.abs(rollErr) > 2.5 ? 0 : clamp(rollErr * 1.6, -1, 1) * Math.min(1, ang * 1.2);
    // vid stora vinklar: dra främst med tippning
    if (ang > 0.6 && Math.abs(rollErr) < 0.8) c.yaw *= 0.4;
  } else if (!bank) {
    // håll skeppet ungefär upprätt
    _v3.copy(UP).applyQuaternion(_q);
    c.roll = clamp(Math.atan2(_v3.x, _v3.y) * 1.2, -1, 1);
  } else c.roll = 0;
  return ang;
}

function validTarget(t) { return t && !t.dead && t.targetable; }

/** Välj mål för ett jaktplan. */
export function pickTarget(s, W, opts = {}) {
  const enemies = W.teams[1 - s.team];
  let best = null, bs = Infinity;
  const ai = s.ai;
  for (const e of enemies) {
    if (e.dead || !e.targetable || e.aiIgnore || e.kind === 'object' || e.kind === 'mine' || (e.kind === 'drone' && s.team === 0 && !s.isPlayer)) continue;
    const d = e.pos.distanceTo(s.pos);
    if (opts.maxDist && d > opts.maxDist) continue;
    let sc = d;
    if (e.ai && e.ai.target === s) sc -= 500;
    if (e.isLarge && !opts.large) sc += 1600; else if (e.isLarge && opts.large) sc -= 1000;
    if (e.isPlayer && s.team === 1) sc -= 350 * W.diff.aggro;
    if (ai && ai.prefer) {
      if (ai.prefer === 'player' && e.isPlayer) sc -= 1500;
      else if (ai.prefer === 'large' && e.isLarge) sc -= 1500;
      else if (ai.prefer instanceof Object && ai.prefer === e) sc -= 3000;
      else if (typeof ai.prefer === 'string' && e.tags.has(ai.prefer)) sc -= 2000;
    }
    if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}

/** Siktpunkt med förhandshåll för laser. */
export function leadPoint(s, T, speed, out) {
  const d = T.pos.distanceTo(s.pos);
  const t = d / speed;
  return out.copy(T.pos).addScaledVector(_v3.copy(T.vel).sub(s.vel), t);
}

export function updateAI(s, W, dt) {
  const ai = s.ai;
  if (!ai || s.dead) return;
  switch (ai.kind) {
    case 'fighter': case 'interceptor': fighter(s, W, dt); break;
    case 'wingman': wingman(s, W, dt); break;
    case 'bomber': bomber(s, W, dt); break;
    case 'capital': capital(s, W, dt); break;
    case 'station': break;
    case 'freighter': freighter(s, W, dt); break;
    case 'mine': mine(s, W, dt); break;
    case 'drone': drone(s, W, dt); break;
    case 'goto': gotoAI(s, W, dt); break;
    default: s.ctrl.pitch = s.ctrl.yaw = s.ctrl.roll = 0;
  }
}

/* ---------------------------------------------------------------- undvik kollision */
function avoid(s, W, dir) {
  const look = s.speed * 1.6 + s.radius * 4;
  const ahead = _av.copy(s.pos).addScaledVector(s.fwd, look * 0.6);
  let push = false;
  _push.set(0, 0, 0);
  for (const L of W.large) {
    if (L === s || L.removed) continue;
    if (L.pos.distanceTo(ahead) > L.boundR + look) continue;
    const wc = L.wColl;
    for (let k = 0; k < wc.length; k += 4) {
      _aw.set(wc[k], wc[k + 1], wc[k + 2]);
      const d = _aw.distanceTo(ahead);
      if (d < wc[k + 3] + s.radius * 2 + look * 0.45) { push = true; _push.add(_ax.copy(ahead).sub(_aw).normalize().multiplyScalar(1.5)); }
    }
  }
  if (W.asteroids) {
    const A = W.asteroids;
    A.query(ahead.x, ahead.y, ahead.z, look * 0.6 + 60, i => {
      _aw.set(A.px[i], A.py[i], A.pz[i]);
      const d = _aw.distanceTo(ahead);
      if (d < A.cr[i] + s.radius * 3 + look * 0.4) { push = true; _push.add(_ax.copy(ahead).sub(_aw).normalize().multiplyScalar(2)); }
    });
  }
  if (push) { dir.add(_push).normalize(); return true; }
  return false;
}

/* ---------------------------------------------------------------- jaktplan */
function fighter(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  const enemy = s.team === 1;
  const acc = enemy ? W.diff.enemyAcc : 0.82;
  const react = enemy ? W.diff.react : 1;
  ai.think -= dt; ai.timer -= dt; ai.errT -= dt; ai.mcd -= dt; ai.flareCd -= dt;
  if (ai.passive) { passiveFly(s, W, dt); return; }
  if (!validTarget(ai.target) || ai.think <= 0) {
    ai.think = rnd(1.5, 3) / react;
    const nt = pickTarget(s, W);
    if (nt !== ai.target) { ai.target = nt; if (ai.state !== 'evade') ai.state = 'attack'; }
  }
  // missilhot → undanmanöver
  const inc = W.missiles.incomingTo(s);
  if (inc.n > 0 && inc.dist < 700 && ai.state !== 'evade') {
    ai.state = 'evade'; ai.timer = rnd(1.4, 2.4); ai.jink = 0;
    if (ai.kind === 'interceptor' && ai.flareCd <= 0 && Math.random() < 0.6 * react) { W.launchFlares(s); ai.flareCd = 6; }
  }
  // träffad bakifrån → undanmanöver ibland
  if (ai.state === 'attack' && W.time - s.lastHit < 0.05 && s.lastAttacker && Math.random() < 0.18 * react) {
    _v.copy(s.lastAttacker.pos).sub(s.pos);
    if (_v.dot(s.fwd) < 0) { ai.state = 'evade'; ai.timer = rnd(1.2, 2.2); ai.jink = 0; }
  }
  const T = ai.target;
  const dir = _v2;
  c.fire = false; c.boost = false; c.brake = false;
  if (!T) { passiveFly(s, W, dt); return; }
  const dist = T.pos.distanceTo(s.pos);
  if (ai.state === 'attack') {
    const w = s.weapon || NPC_WEAPON.enemy;
    let aimP = leadPoint(s, T, w.speed, _v);
    if (T.isLarge) {
      // sikta på ett levande delsystem eller skrovet
      if (!ai.subAim || !ai.subAim.alive || Math.random() < dt * 0.2) { const subs = T.subs.filter(x => x.alive && x.type === 'turret'); ai.subAim = subs.length ? subs[Math.floor(Math.random() * subs.length)] : null; }
      if (ai.subAim) aimP = _v.copy(ai.subAim.w);
    }
    if (ai.errT <= 0) { ai.errT = rnd(0.5, 0.9); ai.err.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar((1 - acc) * 0.07 + 0.008); }
    dir.copy(aimP).sub(s.pos);
    const dl = dir.length() || 1;
    dir.multiplyScalar(1 / dl).add(ai.err).normalize();
    s.aimDir.copy(dir); s.aimDist = dl;
    const tooClose = T.isLarge ? dist < T.boundR * 0.6 + 120 : dist < 90 + T.radius * 3;
    if (tooClose && s.fwd.dot(_v3.copy(T.pos).sub(s.pos).normalize()) > 0.3) {
      ai.state = 'break'; ai.timer = rnd(1.6, 3.2) * (T.isLarge ? 1.4 : 1);
      ai.breakDir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().addScaledVector(s.fwd, 0.8).normalize();
    }
    avoid(s, W, dir);
    const ang = steer(s, dir, true, 2.8);
    // gas
    c.throttle = dist > 600 ? 1 : (dist < 220 && ang < 0.5 ? 0.55 : 0.85);
    if (dist > 1100 && s.energy > 45) c.boost = true;
    // skjut
    const cone = 0.035 + (1 - acc) * 0.05 + (T.isLarge ? 0.06 : 0);
    // salvor: skjut en stund, vila en stund
    ai.burst = (ai.burst == null ? Math.random() : ai.burst) - dt;
    if (ai.burst < -rnd(0.7, 1.5) / Math.max(0.5, W.diff.aggro)) ai.burst = rnd(0.6, 1.2);
    const mayFire = !T.isPlayer || W.fireTokens.has(s) || s.team === 0;
    if (ai.burst > 0 && mayFire && ang < cone * 2.2 && dl < (T.isLarge ? 1300 : 950) && s.heat < 82) c.fire = true;
    // missiler (interceptor)
    if (s.missiles > 0 && !T.isLarge && dist < 1300 && dist > 220 && ang < 0.25 && ai.mcd <= 1) {
      ai.mlock += dt;
      if (T.isPlayer && ai.mlock > 0.25) W.lockWarn = 0.3;
      if (ai.mlock > 1.6 / react && ai.mcd <= 0) {
        ai.mlock = 0; ai.mcd = rnd(9, 15) / react; s.missiles--;
        W.fireMissile(s, NPC_MISSILE, T, null);
      }
    } else ai.mlock = Math.max(0, ai.mlock - dt);
  } else if (ai.state === 'break') {
    dir.copy(ai.breakDir);
    avoid(s, W, dir);
    steer(s, dir, true, 2.5);
    c.throttle = 1; c.boost = s.energy > 30;
    if (ai.timer <= 0) ai.state = 'attack';
  } else if (ai.state === 'evade') {
    ai.jink -= dt;
    if (ai.jink <= 0) { ai.jink = rnd(0.35, 0.7); ai.breakDir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().addScaledVector(s.fwd, 0.5).normalize(); }
    dir.copy(ai.breakDir);
    avoid(s, W, dir);
    steer(s, dir, true, 3);
    c.roll = clamp(c.roll + Math.sin(W.time * 3 + s.id) * 0.6, -1, 1);
    c.throttle = 1; c.boost = s.energy > 20;
    if (ai.timer <= 0) ai.state = 'attack';
  }
  leash(s, W);
}

/** Flyg mot ett mål/punkt utan att strida. */
function passiveFly(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  c.fire = false; c.boost = false;
  let goal = ai.goal;
  if (!goal) {
    if (!ai.wander || ai.wander.distanceTo(s.pos) < 80) ai.wander = (ai.home ? ai.home.clone() : s.pos.clone()).add(_v.set(rnd(-400, 400), rnd(-150, 150), rnd(-400, 400)));
    goal = ai.wander;
  }
  _v2.copy(goal).sub(s.pos);
  const d = _v2.length();
  _v2.normalize();
  avoid(s, W, _v2);
  steer(s, _v2, true, 2);
  c.throttle = d < 60 ? 0.3 : 0.7;
}
function leash(s, W) {
  const ai = s.ai;
  if (!ai.leash || !ai.home) return;
  if (s.pos.distanceTo(ai.home) > ai.leash) {
    _v2.copy(ai.home).sub(s.pos).normalize();
    steer(s, _v2, true, 2.5); s.ctrl.fire = false;
  }
}

/* ---------------------------------------------------------------- vingman */
function wingman(s, W, dt) {
  const ai = s.ai, c = s.ctrl, P = W.player;
  ai.think -= dt;
  if (!P || P.dead) { ai.kind = 'fighter'; return; }
  if (ai.order === 'attack') {
    const t = W.playerTarget && !W.playerTarget.dead && W.playerTarget.team !== s.team && !W.playerTarget.aiIgnore ? W.playerTarget : null;
    if (t) { ai.target = t; ai.think = 1; fighterCore(s, W, dt, t); return; }
    ai.order = 'free';
  }
  if (ai.order === 'protect') {
    if (ai.think <= 0 || !validTarget(ai.target)) {
      ai.think = 1.2;
      ai.target = null;
      let bd = 1700;
      for (const e of W.teams[1 - s.team]) {
        if (e.dead || e.isLarge || e.kind === 'mine' || e.kind === 'object') continue;
        const threat = (e.ai && e.ai.target === P) || e.pos.distanceTo(P.pos) < 500;
        if (!threat) continue;
        const d = e.pos.distanceTo(P.pos);
        if (d < bd) { bd = d; ai.target = e; }
      }
    }
    if (ai.target) { fighterCore(s, W, dt, ai.target); return; }
    formation(s, W, dt);
    return;
  }
  // fri jakt
  if (!validTarget(ai.target) || ai.think <= 0) { ai.think = rnd(1.5, 2.5); ai.target = pickTarget(s, W); }
  if (ai.target && ai.target.pos.distanceTo(s.pos) < 3500) { fighterCore(s, W, dt, ai.target); return; }
  formation(s, W, dt);
}
function fighterCore(s, W, dt, T) {
  // återanvänd jaktplanslogiken med fast mål
  const ai = s.ai;
  const keep = ai.kind; ai.kind = 'fighter';
  ai.target = T; ai.think = Math.max(ai.think, 0.5);
  fighter(s, W, dt);
  ai.kind = keep;
}
function formation(s, W, dt) {
  const ai = s.ai, c = s.ctrl, P = W.player;
  c.fire = false; c.brake = false;
  _v.copy(ai.slot).applyQuaternion(P.quat).add(P.pos);
  _v2.copy(_v).addScaledVector(P.fwd, 60).sub(s.pos);
  const d = _v.distanceTo(s.pos);
  _v2.normalize();
  avoid(s, W, _v2);
  steer(s, _v2, true, 2.2);
  const ps = P.speed / s.def.speed;
  c.throttle = clamp(ps + (d - 10) * 0.006, 0.2, 1);
  c.boost = d > 160 && s.energy > 30 || (P.boosting && d > 40);
  if (d < 50) {
    // matcha spelarens rollning
    _q.copy(s.quat).invert();
    _l.set(0, 1, 0).applyQuaternion(P.quat).applyQuaternion(_q);
    c.roll = clamp(Math.atan2(_l.x, _l.y) * 1.5, -1, 1);
  }
}

/* ---------------------------------------------------------------- bombplan */
function bomber(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  ai.think -= dt; ai.timer -= dt; ai.tcd -= dt; ai.tailCd -= dt;
  const react = W.diff.react;
  if (!validTarget(ai.target) || ai.think <= 0) {
    ai.think = rnd(3, 5);
    const nt = pickTarget(s, W, { large: true });
    ai.target = nt;
  }
  tailGun(s, W);
  const T = ai.target;
  c.fire = false; c.boost = false;
  if (!T) { passiveFly(s, W, dt); return; }
  const dist = T.pos.distanceTo(s.pos);
  const dir = _v2;
  if (ai.state === 'break') {
    dir.copy(ai.breakDir); avoid(s, W, dir); steer(s, dir, true, 2);
    c.throttle = 1; c.boost = s.energy > 30;
    if (ai.timer <= 0) ai.state = 'attack';
    return;
  }
  ai.state = 'attack';
  let aimP = T.pos;
  if (T.isLarge) {
    if (!ai.subAim || !ai.subAim.alive) { const subs = T.subs.filter(x => x.alive); ai.subAim = subs.length ? subs[Math.floor(Math.random() * subs.length)] : null; }
    if (ai.subAim) aimP = ai.subAim.w;
  }
  dir.copy(aimP).sub(s.pos).normalize();
  s.aimDir.copy(dir); s.aimDist = dist;
  avoid(s, W, dir);
  const ang = steer(s, dir, true, 2.2);
  c.throttle = 1;
  if (dist > 1600 && s.energy > 50) c.boost = true;
  if (s.torpedoes > 0 && T.isLarge && dist < 1500 && ang < 0.25 && ai.tcd <= 0) {
    s.torpedoes--; ai.tcd = rnd(8, 13) / react;
    W.fireMissile(s, NPC_TORPEDO, T, ai.subAim && ai.subAim.alive ? ai.subAim : null);
    W.emit('torpedo', s, T);
    ai.state = 'break'; ai.timer = rnd(3, 5);
    ai.breakDir.copy(s.fwd).negate().add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))).normalize();
  }
  if (ang < 0.08 && dist < (T.isLarge ? 1100 : 800)) c.fire = true;
  if (dist < (T.isLarge ? T.boundR * 0.5 + 200 : 120)) { ai.state = 'break'; ai.timer = rnd(2.5, 4); ai.breakDir.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(); }
}
function tailGun(s, W) {
  const ai = s.ai;
  if (!s.info.tail || ai.tailCd > 0) return;
  const tw = NPC_WEAPON.tail;
  let best = null, bd = 520;
  for (const e of W.teams[1 - s.team]) {
    if (e.dead || e.isLarge || e.kind === 'mine' || e.kind === 'object') continue;
    const d = e.pos.distanceTo(s.pos);
    if (d < bd && _v.copy(e.pos).sub(s.pos).dot(s.fwd) < 0) { bd = d; best = e; }
  }
  if (!best) return;
  ai.tailCd = tw.cd * rnd(0.9, 1.4) / W.diff.react;
  s.toWorld(s.info.tail, _v);
  leadPoint(s, best, tw.speed, _v2).sub(_v).normalize();
  const err = (1 - W.diff.enemyAcc) * 0.08 + 0.02;
  _v2.x += rnd(-err, err); _v2.y += rnd(-err, err); _v2.z += rnd(-err, err); _v2.normalize();
  W.bolts.fire(_v, _v2, tw.speed, s.vel, tw, s.team, s, 1);
  W.sfxShot(s, tw, _v);
}

/* ---------------------------------------------------------------- stora skepp */
function capital(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  c.fire = false; c.boost = false;
  let goal = null;
  if (ai.path && ai.pathIdx < ai.path.length) {
    goal = ai.path[ai.pathIdx];
    if (goal.distanceTo(s.pos) < 120) ai.pathIdx++;
  } else if (ai.goal) goal = ai.goal;
  else if (validTarget(ai.target) && ai.standoff) {
    const d = ai.target.pos.distanceTo(s.pos);
    goal = d > ai.standoff ? ai.target.pos : null;
  }
  if (goal) {
    _v2.copy(goal).sub(s.pos);
    const d = _v2.length(); _v2.normalize();
    steer(s, _v2, false, 1.5);
    c.throttle = d > 300 ? (ai.speedMult != null ? ai.speedMult : 1) : clamp(d / 300, 0, 1) * (ai.speedMult != null ? ai.speedMult : 1);
    if (!ai.path && ai.goal && d < 60) { c.throttle = 0; ai.arrived = true; }
  } else {
    c.throttle = 0; c.pitch = c.yaw = 0;
    if (ai.target && !ai.target.dead) { _v2.copy(ai.target.pos).sub(s.pos).normalize(); steer(s, _v2, false, 1.0); }
    else { c.pitch = 0; c.yaw = 0; c.roll = 0; }
  }
  if (ai.path && ai.pathIdx >= ai.path.length) ai.arrived = true;
  // hangarer
  if (ai.launch) {
    ai.launchT -= dt;
    if (ai.launchT <= 0) {
      ai.launchT = ai.launch.every * (0.8 + Math.random() * 0.4);
      const hangars = s.subs.filter(x => x.type === 'hangar' && x.alive);
      if (hangars.length) {
        const alive = W.ships.filter(x => x.launchedBy === s && !x.dead).length;
        if (alive < ai.launch.max) {
          const h = hangars[Math.floor(Math.random() * hangars.length)];
          W.launchFrom(s, h, ai.launch.type || 'hugg', ai.launch);
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- fraktare / färjor */
function freighter(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  if (ai.path && ai.pathIdx < ai.path.length) {
    const g = ai.path[ai.pathIdx];
    _v2.copy(g).sub(s.pos);
    const d = _v2.length(); _v2.normalize();
    steer(s, _v2, false, 1.4);
    c.throttle = (ai.speedMult != null ? ai.speedMult : 1) * (ai.hold ? 0 : 1);
    if (d < 90) ai.pathIdx++;
  } else {
    c.throttle = 0; ai.arrived = !!ai.path;
    if (!ai.path) { c.pitch = c.yaw = 0; }
  }
}

/* ---------------------------------------------------------------- minor */
function mine(s, W, dt) {
  const ai = s.ai;
  s.ctrl.throttle = 0;
  if (!ai.armed) {
    for (const e of W.teams[1 - s.team]) {
      if (e.dead || e.isLarge || e.kind === 'mine' || e.kind === 'object') continue;
      if (e.pos.distanceTo(s.pos) < 85) { ai.armed = true; ai.armT = 0.8; W.sfxAt('mineArm', s.pos, 1); break; }
    }
  } else {
    ai.armT -= dt;
    if (ai.armT <= 0) { s.hull = 0; s.die(null); }
  }
}

/* ---------------------------------------------------------------- övningsdrönare */
function drone(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  c.fire = false;
  if (ai.mode === 'static') { c.throttle = 0; c.yaw = 0.3; c.pitch = 0; return; }
  if (!ai.home) ai.home = s.pos.clone();
  if (!ai.wander || ai.wander.distanceTo(s.pos) < 40) ai.wander = ai.home.clone().add(_v.set(rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)).multiplyScalar(ai.range || 220));
  _v2.copy(ai.wander).sub(s.pos).normalize();
  steer(s, _v2, true, 2);
  c.throttle = ai.speedMult || 1;
}

/* ---------------------------------------------------------------- generisk förflyttning */
function gotoAI(s, W, dt) {
  const ai = s.ai, c = s.ctrl;
  c.fire = false;
  if (!ai.goal) { c.throttle = 0; return; }
  _v2.copy(ai.goal).sub(s.pos);
  const d = _v2.length(); _v2.normalize();
  avoid(s, W, _v2);
  steer(s, _v2, true, 2.2);
  c.throttle = d < 80 ? 0.4 : 1;
  c.boost = d > 800 && s.energy > 40;
  if (d < 60) ai.arrived = true;
}
