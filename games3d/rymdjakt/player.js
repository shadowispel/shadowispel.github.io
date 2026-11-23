/**
 * Rymdjakt – spelarens styrning (mus som virtuell spak, tangentbord, handkontroll, pek), målval, låsning,
 * missiler, motåtgärder, vingmansorder samt kamerariggen (jaktkamera / cockpit).
 */
import * as THREE from 'three';
import { steer, leadPoint } from './ai.js';
import { isTouchDevice } from '../../engine/kit.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const curve = (v, k = 1.6) => Math.sign(v) * Math.pow(Math.abs(v), k);

export class PlayerControl {
  constructor(game) {
    this.g = game;
    this.leadV = new THREE.Vector3(); // egen vektor: _v skrivs över av kameran innan HUD:en ritar
    this.reset();
  }
  reset() {
    this.stick = { x: 0, y: 0 };
    this.lock = 0; this.locked = false; this.lockBeep = 0; this.lockedSoundT = 0;
    this.view = 'chase';
    this.missileCd = 0; this.flareCd = 0;
    this.autopilot = false; this.outside = 0;
    this.lastInput = 'mouse';
    this.warnT = 0;
    this.throttleTarget = 0.6;
    this.boostWas = false;
    this.disabled = false;
    this.tCycle = 0;
    this._lastThr = null; // senaste absoluta gasläge från flygspaken
  }
  get W() { return this.g.world; }

  update(dt) {
    const g = this.g, W = this.W, P = W.player, I = g.input, S = g.settings;
    if (!P || P.dead) return;
    this.missileCd -= dt; this.flareCd -= dt; this.warnT -= dt;
    // ------------------------------------------------ missilomladdning (oändliga missiler, en i taget)
    if (P.mag < P.magMax) {
      P.reloadT += dt;
      if (P.reloadT >= P.reloadTime) { P.mag++; P.reloadT = 0; g.sfx.play('reload'); }
    } else P.reloadT = 0;
    const touch = this.g.touchOn;
    const c = P.ctrl;
    const H = g.stick ? g.stick.frame : null; // flygspak / HOTAS (flightstick.js)
    if (this.disabled) { c.pitch = c.yaw = c.roll = 0; c.boost = false; c.brake = false; c.fire = false; return; }
    // ------------------------------------------------ styrning
    const sens = S.get('sensitivity');
    const inv = S.get('invertY') ? -1 : 1;
    if (I.locked) {
      const k = 0.0042 * sens;
      this.stick.x += I.look.dx * k; this.stick.y += I.look.dy * k * inv;
      const l = Math.hypot(this.stick.x, this.stick.y);
      if (l > 1) { this.stick.x /= l; this.stick.y /= l; }
      const ret = S.get('stickReturn');
      if (ret > 0) { const f = Math.exp(-ret * dt); this.stick.x *= f; this.stick.y *= f; }
      if (I.look.dx || I.look.dy) this.lastInput = 'mouse';
    } else { this.stick.x *= Math.exp(-6 * dt); this.stick.y *= Math.exp(-6 * dt); }
    const dz = 0.04;
    const sx = Math.abs(this.stick.x) < dz ? 0 : this.stick.x, sy = Math.abs(this.stick.y) < dz ? 0 : this.stick.y;
    let pitch = -curve(sy, 1.35), yaw = curve(sx, 1.35), roll = 0;
    const ad = S.get('adMode');
    const kA = I.down('KeyA') ? 1 : 0, kD = I.down('KeyD') ? 1 : 0, kQ = I.down('KeyQ') ? 1 : 0, kE = I.down('KeyE') ? 1 : 0;
    if (ad === 'roll') { roll += kD - kA; yaw += kE - kQ; } else { yaw += kD - kA; roll += kE - kQ; }
    pitch += ((I.down('ArrowUp') ? 1 : 0) - (I.down('ArrowDown') ? 1 : 0)) * inv;
    yaw += (I.down('ArrowRight') ? 1 : 0) - (I.down('ArrowLeft') ? 1 : 0);
    // handkontroll
    const gx = I.gpAxis(0), gy = I.gpAxis(1), rx = I.gpAxis(2), ry = I.gpAxis(3);
    if (gx || gy || rx || ry) this.lastInput = 'pad';
    yaw += curve(gx, 1.5); pitch += -curve(gy, 1.5) * inv;
    roll += curve(rx, 1.4);
    // pek
    if (touch && I.sticks.move) {
      const t = I.sticks.move;
      if (t.x || t.y) this.lastInput = 'touch';
      yaw += curve(t.x, 1.3); pitch += -curve(t.y, 1.3) * inv;
    }
    if (I.down('TRollL')) roll -= 1; if (I.down('TRollR')) roll += 1;
    // flygspak: absoluta axlar (tippning, rollning, girning)
    if (H && H.active) {
      if (H.moved) this.lastInput = 'stick';
      pitch += H.pitch; roll += H.roll; yaw += H.yaw;
    }
    c.pitch = clamp(pitch, -1, 1); c.yaw = clamp(yaw, -1, 1); c.roll = clamp(roll, -1, 1);
    // ------------------------------------------------ gas
    let thr = this.throttleTarget;
    // gasreglaget sätter målfarten direkt (absolut läge); tangenterna kan justera tills reglaget rörs igen
    if (H && H.thr != null && (this._lastThr == null || Math.abs(H.thr - this._lastThr) > 0.004)) { thr = H.thr; this._lastThr = H.thr; }
    if (I.down('KeyW')) thr += 0.7 * dt;
    if (I.down('KeyS')) thr -= 0.7 * dt;
    if (ry) thr += -ry * 0.8 * dt;
    if (I.wheel) thr -= I.wheel * 0.08;
    if (touch && !I.down('KeyW', 'KeyS')) thr = 0.75;
    this.throttleTarget = clamp(thr, 0, 1);
    c.throttle = this.throttleTarget;
    c.boost = I.down('ShiftLeft', 'ShiftRight', 'Pad0', 'TBoost') || !!(H && H.down.boost);
    c.brake = I.down('KeyX', 'Pad1') || !!(H && H.down.brake);
    if (c.boost && !this.boostWas && !P.energyLock && P.energy > 5) g.sfx.play('boostOn');
    this.boostWas = c.boost;
    // ------------------------------------------------ mål
    if (I.pressed('KeyR', 'Pad5') || (H && H.pressed.tnear)) this.targetNearest();
    if (I.pressed('KeyT', 'Pad3') || (H && H.pressed.tnext)) this.targetNext(1);
    if (I.pressed('KeyG', 'Pad4') || (H && H.pressed.tsub)) this.targetSub();
    if (I.pressed('KeyY')) this.targetAttacker();
    let T = W.playerTarget;
    if (T && (T.dead || T.removed)) { W.playerTarget = T = null; this.g.targetSub = null; }
    const sub = this.g.targetSub && this.g.targetSub.alive && T && T.subs.includes(this.g.targetSub) ? this.g.targetSub : null;
    if (this.g.targetSub && !sub) this.g.targetSub = null;
    // ------------------------------------------------ sikte
    const w = P.weapon;
    P.aimDir.copy(P.fwd); P.aimDist = 600;
    if (T) {
      const tp = sub ? sub.w : T.pos;
      const lead = sub ? this.leadV.copy(tp) : leadPoint(P, T, w.speed, this.leadV);
      _v2.copy(lead).sub(P.pos);
      const d = _v2.length(); _v2.multiplyScalar(1 / (d || 1));
      let assist = (this.lastInput === 'mouse' ? 0.035 : 0.075) * S.get('aimAssist');
      // mild närstridshjälp: på nära håll räcker det att ha små mål några grader från siktet
      if (!sub && !T.isLarge && d < 320) assist = Math.max(assist, Math.min(0.085, Math.atan(T.hitR * 2.5 / Math.max(1, d))) * S.get('aimAssist'));
      if (d < 1400 && P.fwd.angleTo(_v2) < assist) P.aimDir.copy(_v2);
      P.aimDist = d;
      this.leadPos = lead;
    } else this.leadPos = null;
    // ------------------------------------------------ eld
    c.fire = I.down('Space', 'Pad7', 'TFire') || (I.locked && I.mouseDown(0)) || !!(H && H.down.fire);
    if (c.fire) P.fireLaser();
    // ------------------------------------------------ låsning
    const sec = P.secondary;
    if (T && sec.lockTime > 0 && !T.isFlare && T.team !== P.team) {
      const tp = sub ? sub.w : T.pos;
      _v2.copy(tp).sub(P.pos);
      const d = _v2.length();
      const ang = P.fwd.angleTo(_v2);
      const cone = T.isLarge ? 0.35 : 0.22;
      if (d < sec.lockRange + (T.isLarge ? T.boundR : (T.isAsteroid ? T.radius : 0)) && ang < cone && T.targetable) {
        this.lock = Math.min(1, this.lock + dt / sec.lockTime);
      } else this.lock = Math.max(0, this.lock - dt * 1.5);
    } else this.lock = Math.max(0, this.lock - dt * 3);
    const wasLocked = this.locked;
    this.locked = this.lock >= 1;
    if (this.locked && !wasLocked) g.sfx.play('locked');
    if (!this.locked && this.lock > 0.02) { this.lockBeep -= dt; if (this.lockBeep <= 0) { this.lockBeep = 0.32 - this.lock * 0.22; g.sfx.play('lockBeep'); } }
    if (I.pressed('KeyC', 'Pad6', 'TMissile') || (I.locked && I.mousePressed(2)) || (H && H.pressed.missile)) this.fireSecondary();
    // ------------------------------------------------ motåtgärder
    if (I.pressed('KeyF', 'Pad2', 'TFlare') || (H && H.pressed.flares)) {
      if (P.flares > 0 && this.flareCd <= 0) { W.launchFlares(P); P.flares--; this.flareCd = 1.0; W.emit('flare', P); }
      else if (P.flares <= 0) g.sfx.play('empty');
    }
    // ------------------------------------------------ vingmän
    if (I.pressed('Digit1', 'Pad12')) this.order('attack');
    if (I.pressed('Digit2', 'Pad13')) this.order('protect');
    if (I.pressed('Digit3', 'Pad14')) this.order('free');
    if (I.pressed('TOrder')) {
      const w = W.ships.find(s => s.ai && s.ai.kind === 'wingman' && !s.dead);
      const cur = w ? w.ai.order : 'free';
      let next = { free: 'protect', protect: 'attack', attack: 'free' }[cur] || 'protect';
      if (next === 'attack' && !(W.playerTarget && W.playerTarget.team === 1)) next = 'free';
      this.order(next);
    }
    // ------------------------------------------------ vy
    if (I.pressed('KeyV', 'Pad8') || (H && H.pressed.cam)) { this.view = this.view === 'chase' ? 'cockpit' : 'chase'; }
    // ------------------------------------------------ missilvarning
    const inc = W.missiles.incomingTo(P);
    this.incoming = inc;
    if (inc.n > 0 && this.warnT <= 0) { this.warnT = Math.max(0.18, Math.min(0.7, inc.dist / 1500)); g.sfx.play('warn'); }
    else if (inc.n === 0 && W.lockWarn > 0 && this.warnT <= 0) { this.warnT = 0.45; g.sfx.play('lockBeep', { pitch: 0.55, vol: 0.8 }); }
    // ------------------------------------------------ operationsområdet
    if (W.bounds) {
      const d = P.pos.distanceTo(W.bounds.center);
      if (d > W.bounds.radius) {
        this.outside += dt;
        this.autopilot = true;
        _v2.copy(W.bounds.center).sub(P.pos).normalize();
        steer(P, _v2, true, 2.5);
        c.boost = false;
      } else if (this.autopilot && d < W.bounds.radius - 150) { this.autopilot = false; this.outside = 0; }
      else if (this.autopilot) { _v2.copy(W.bounds.center).sub(P.pos).normalize(); steer(P, _v2, true, 2.5); }
    }
    // vingspetsstrimmor vid hårda svängar / boost
    const turnAmt = Math.min(1, (Math.abs(P.angVel.x) + Math.abs(P.angVel.y)) / 2.2);
    const emit = Math.max(P.boosting ? 0.8 : 0, turnAmt > 0.5 ? (turnAmt - 0.5) * 2 : 0);
    if (P.wingTrails) for (const t of P.wingTrails) t.emit = emit;
  }

  fireSecondary() {
    const g = this.g, W = this.W, P = W.player;
    if (this.missileCd > 0) return false;
    if (P.mag <= 0) { g.sfx.play('empty'); this.g.hud.flashMsg('Missilerna laddas om …', 0.9); return false; }
    const sec = P.secondary;
    const T = W.playerTarget && !W.playerTarget.dead ? W.playerTarget : null;
    const sub = this.g.targetSub && this.g.targetSub.alive ? this.g.targetSub : null;
    const dmgMult = 1 + (P.dmgMult - 1) * 0.5;
    if (sec.salvo) {
      // svärmraketer: söker målet om det ligger framför, annars närmaste fiende framför
      let tg = T && T.team !== P.team && P.fwd.angleTo(_v.copy(T.pos).sub(P.pos)) < 0.7 ? T : null;
      if (!tg) {
        let bd = sec.lockRange;
        for (const e of this.candidates()) { if (e.kind === 'object') continue; const d = e.pos.distanceTo(P.pos); if (d < bd && P.fwd.angleTo(_v.copy(e.pos).sub(P.pos)) < 0.6) { bd = d; tg = e; } }
      }
      for (let i = 0; i < sec.salvo; i++) {
        const side = (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2));
        _v.set(side * 1.4, -0.8, -2).applyQuaternion(P.quat).add(P.pos);
        _v2.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0).applyQuaternion(P.quat).add(P.fwd).normalize();
        W.missiles.fire({ pos: _v, dir: _v2, baseVel: P.vel, def: sec, team: 0, owner: P, target: tg, sub: tg === T ? sub : null, dmgMult, wobble: Math.random() * 10 });
      }
      this.missileCd = 0.6;
    } else {
      const guided = this.locked && T;
      _v.set(0, -1.2, -2).applyQuaternion(P.quat).add(P.pos);
      W.missiles.fire({ pos: _v, dir: P.fwd, baseVel: P.vel, def: sec, team: 0, owner: P, target: guided ? T : null, sub: guided ? sub : null, dmgMult });
      this.missileCd = sec.id === 'torpedo' ? 1.2 : 0.45;
      if (!guided) this.g.hud.flashMsg('Ingen låsning – missilen flyger rakt fram', 1.4);
    }
    P.mag--;
    W.stats.missiles++;
    g.sfx.play('missile');
    return true;
  }

  /* ---------------------------------------------------------------- målval */
  /** Skepp som går att välja: allt som inte tillhör det egna laget (vänliga skepp kan aldrig låsas). */
  candidates() {
    const W = this.W, P = W.player;
    return W.ships.filter(s => !s.dead && s.targetable && s !== P && s.team !== P.team);
  }
  /** Alla valbara mål: skepp, fiendens missiler/torpeder och asteroider/skräp i närheten och framför. */
  allTargets(rockCone = 0.75) {
    const W = this.W, P = W.player, out = this.candidates();
    for (const m of W.missiles.list) if (m.alive && m.team !== P.team && m.pos.distanceToSquared(P.pos) < 2600 * 2600) out.push(m);
    const A = W.asteroids;
    if (A) {
      A.query(P.pos.x, P.pos.y, P.pos.z, 1900, i => {
        if (A.dead[i] || A.r[i] < 1) return;
        _v.set(A.px[i] - P.pos.x, A.py[i] - P.pos.y, A.pz[i] - P.pos.z);
        const d = _v.length();
        if (d - A.cr[i] > 1800 || P.fwd.angleTo(_v) - Math.atan(A.cr[i] / Math.max(1, d)) > rockCone) return;
        out.push(A.target(i));
      });
    }
    return out;
  }
  /** Vinkel mellan nosen och målets kant (0 om siktet ligger över målet). */
  _aimAng(t) {
    const P = this.W.player;
    _v.copy(t.pos).sub(P.pos);
    const d = _v.length();
    const r = t.isLarge ? t.radius * 0.8 : (t.radius || t.hitR || 3);
    return { a: Math.max(0, P.fwd.angleTo(_v) - Math.atan(r / Math.max(1, d))), d };
  }
  /** Närmast siktet: det mål nosen pekar mot (även asteroider, missiler och delsystem); annars närmaste fiende. */
  targetNearest() {
    const W = this.W, P = W.player;
    let best = null, bs = Infinity;
    for (const t of this.allTargets(0.32)) {
      const { a, d } = this._aimAng(t);
      if (a > 0.3) continue;
      const sc = a * (t.isAsteroid ? 2.2 : 1) + d / 30000 + (t.isAsteroid ? 0.01 : 0);
      if (sc < bs) { bs = sc; best = t; }
    }
    if (!best) {
      for (const s of this.candidates()) {
        _v.copy(s.pos).sub(P.pos);
        const d = _v.length();
        const ang = P.fwd.angleTo(_v);
        const sc = d * (1 + ang * 1.5) * (s.kind === 'mine' ? 1.6 : s.kind === 'object' ? 4 : 1);
        if (sc < bs) { bs = sc; best = s; }
      }
    }
    this.setTarget(best);
    // pekar siktet på ett delsystem (t.ex. ett kanontorn) väljs det direkt
    if (best && best.isLarge) {
      let bsub = null, ba = Infinity;
      for (const sub of best.subs) {
        if (!sub.alive) continue;
        _v.copy(sub.w).sub(P.pos);
        const a = P.fwd.angleTo(_v); // vinkel till delsystemets mitt – det siktet ligger närmast vinner
        if (a - Math.atan(sub.r / Math.max(1, _v.length())) < 0.06 && a < ba) { ba = a; bsub = sub; }
      }
      if (bsub) { this.g.targetSub = bsub; this.lock = 0; }
    }
  }
  /** Växlar mellan alla synliga mål, sorterade efter hur nära siktet de ligger. */
  targetNext(dir) {
    const W = this.W;
    const list = this.allTargets(0.5).map(t => { const { a, d } = this._aimAng(t); return { t, k: a < 0.9 ? a : 10 + d / 1000 }; })
      .sort((x, y) => x.k - y.k).map(x => x.t);
    if (!list.length) { this.setTarget(null); return; }
    let i = list.indexOf(W.playerTarget);
    i = (i + dir + list.length) % list.length;
    this.setTarget(list[i]);
  }
  targetAttacker() {
    const W = this.W, P = W.player;
    let best = null, bd = Infinity;
    for (const s of this.candidates()) if (s.ai && s.ai.target === P) { const d = s.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = s; } }
    if (best) this.setTarget(best); else this.targetNearest();
  }
  targetSub() {
    const W = this.W, T = W.playerTarget;
    if (!T || !T.isLarge) { this.g.hud.flashMsg('Välj ett stort skepp för att sikta på delsystem', 1.6); return; }
    const subs = T.subs.filter(s => s.alive);
    if (!subs.length) { this.g.targetSub = null; return; }
    // prioritera intressanta delsystem före kanontorn
    subs.sort((a, b) => (a.type === 'turret') - (b.type === 'turret'));
    const i = subs.indexOf(this.g.targetSub);
    this.g.targetSub = i + 1 >= subs.length ? null : subs[i + 1];
    this.lock = 0;
    this.g.sfx.play('target');
  }
  setTarget(t) {
    const W = this.W;
    if (t && t.isAsteroid && t.dead) t = null;
    if (W.playerTarget !== t) { this.lock = 0; this.g.targetSub = null; }
    W.playerTarget = t;
    if (t) this.g.sfx.play('target');
  }
  order(o) {
    const W = this.W;
    const wing = W.ships.filter(s => s.ai && s.ai.kind === 'wingman' && !s.dead);
    if (!wing.length) { this.g.hud.flashMsg('Du har inga vingmän i det här uppdraget', 1.5); return; }
    if (o === 'attack' && !(W.playerTarget && W.playerTarget.team === 1)) { this.g.hud.flashMsg('Välj ett fientligt mål först (R/T)', 1.5); return; }
    for (const s of wing) { s.ai.order = o; s.ai.think = 0; }
    this.g.sfx.play('order');
    const txt = { attack: 'Anfall mitt mål!', protect: 'Skydda mig!', free: 'Fri jakt!' }[o];
    this.g.hud.flashMsg('Order: ' + txt, 1.4);
    const w = wing[0];
    const reply = { attack: ['Uppfattat, går in!', 'Jag tar honom!', 'Siktar på ditt mål.'], protect: ['Jag har din rygg.', 'Formerar på dig.', 'Ingen kommer åt dig nu.'], free: ['Fri jakt, uppfattat!', 'Väljer egna mål.', 'Då jagar vi!'] }[o];
    this.g.mission && this.g.mission.radio(w.callsignChar || 'varg', reply[Math.floor(Math.random() * reply.length)], 2.2);
  }
}

/* ======================================================================== Kamera */
export class CameraRig {
  constructor(cam) { this.cam = cam; this.q = new THREE.Quaternion(); this.fov = 75; this.t = 0; this.deathT = 0; this.offset = new THREE.Vector3(); }
  snap(ship) { this.q.copy(ship.quat); this.deathT = 0; }
  update(dt, ship, view, settings, shake, menuMode) {
    const cam = this.cam;
    this.t += dt;
    const baseFov = settings.get('fov');
    if (!ship) return;
    if (ship.dead) {
      // dödskamera: kretsa runt vraket
      this.deathT += dt;
      const a = this.deathT * 0.4;
      cam.position.set(ship.pos.x + Math.cos(a) * 40, ship.pos.y + 14, ship.pos.z + Math.sin(a) * 40);
      cam.lookAt(ship.pos);
      this._fov(baseFov, dt);
      return;
    }
    const sp = ship.def.speed > 0 ? ship.speed / ship.def.speed : 0;
    if (view === 'cockpit') {
      ship.toWorld(ship.info.cockpit, cam.position);
      this.q.copy(ship.quat);
      cam.quaternion.copy(ship.quat);
    } else {
      this.q.slerp(ship.quat, 1 - Math.exp(-10 * dt));
      const asp = cam.aspect, ka = asp < 1 ? 1 + (1 - asp) * 0.6 : 1;
      const dist = (ship.info.camDist * (0.88 + 0.16 * Math.min(1.6, sp)) + (ship.boosting ? 3.5 : 0)) * ka;
      _v.set(0, ship.info.camUp, dist).applyQuaternion(this.q);
      cam.position.copy(ship.pos).add(_v);
      cam.quaternion.copy(this.q);
      // titta lite framför skeppet
      _e.set(-0.035, 0, 0); _q.setFromEuler(_e); cam.quaternion.multiply(_q);
    }
    if (shake > 0.001) {
      const k = Math.min(1.5, shake) * settings.get('shake');
      const s1 = Math.sin(this.t * 61) * 0.6 + Math.sin(this.t * 37) * 0.4, s2 = Math.sin(this.t * 53 + 1) * 0.6 + Math.sin(this.t * 29) * 0.4;
      _e.set(s1 * 0.012 * k, s2 * 0.012 * k, s1 * 0.008 * k); _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
    }
    this._fov(baseFov + (ship.boosting ? 9 : 0) + Math.min(1.5, sp) * 2, dt);
  }
  _fov(target, dt) {
    this.fov += (target - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
export { isTouchDevice };
