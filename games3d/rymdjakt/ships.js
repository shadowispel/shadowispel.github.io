/**
 * Rymdjakt – Ship: arkadflygmodell, sköld/skrov/energi/värme, laservapen, delsystem och kanontorn.
 * Samma klass används för spelaren, vingmän, fiender, stora skepp, stationer, minor och drönare.
 */
import * as THREE from 'three';
import { NPC, NPC_WEAPON } from './data.js';
import { instantiate } from './models.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const FWD = new THREE.Vector3(0, 0, -1), UP = new THREE.Vector3(0, 1, 0);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let SHIP_ID = 1;

export class Ship {
  /**
   * @param world World
   * @param type  NPC-nyckel eller 'player'
   * @param opts  { team, name, stats (för spelaren), hpMult, tags, pos, quat }
   */
  constructor(world, type, opts = {}) {
    this.id = SHIP_ID++;
    this.world = world;
    this.type = type;
    const def = opts.stats || NPC[type];
    if (!def) throw new Error('okänd skeppstyp ' + type);
    this.def = def;
    this.isPlayer = !!opts.isPlayer;
    this.kind = def.kind || 'fighter';
    this.name = opts.name || def.name;
    this.callsign = opts.callsign || null;
    this.team = opts.team != null ? opts.team : 1;
    this.tags = new Set(opts.tags || []);
    const inst = instantiate(def.model);
    this.obj = inst.group; this.info = inst.info; this.flames = inst.flames; this.glows = inst.glows; this.subs = inst.subs;
    this.blinkers = []; this.obj.traverse(o => { if (o.userData.mineBlink) this.blinkers.push(o); });
    this.obj.userData.ship = this;
    this.pos = this.obj.position; this.quat = this.obj.quaternion;
    if (opts.pos) this.pos.copy(opts.pos);
    if (opts.quat) this.quat.copy(opts.quat);
    this.vel = new THREE.Vector3(); this.angVel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    this.radius = this.info.radius;
    this.hitR = this.radius * 0.9;
    const colls = this.info.colliders || [];
    this.isLarge = colls.length > 0 || this.subs.length > 0;
    this.boundR = this.radius;
    if (this.isLarge) {
      let b = 0; for (const c of colls) b = Math.max(b, Math.hypot(c[0], c[1], c[2]) + c[3]);
      for (const s of this.subs) b = Math.max(b, s.local.length() + s.r);
      this.boundR = Math.max(this.radius, b);
      this.hitR = this.radius * 0.5;
    }
    this.wColl = new Float32Array(colls.length * 4);
    for (const s of this.subs) s.w = new THREE.Vector3();
    this.shieldRadius = this.isLarge ? this.boundR * 0.9 : this.radius * 1.35;
    const hpm = opts.hpMult || 1;
    this.maxHull = this.hull = Math.round(def.hull * hpm);
    this.maxShield = this.shield = Math.round((def.shield || 0) * hpm);
    for (const s of this.subs) { s.hp = s.maxHp = Math.round(s.maxHp * hpm); }
    this.shieldRegen = def.shieldRegen || 0;
    this.energy = 100; this.energyLock = false;
    this.heat = 0; this.overheated = false; this.heatT = 0;
    this.ctrl = { pitch: 0, yaw: 0, roll: 0, throttle: opts.throttle != null ? opts.throttle : 0.7, boost: false, brake: false, fire: false };
    this.speed = 0; this.boosting = false;
    this.weapon = opts.weapon || (def.weapon ? NPC_WEAPON[def.weapon] : null);
    if (this.isPlayer && def.primary) this.weapon = def.primary;
    this.dmgMult = def.dmgMult || 1; this.heatMult = def.heatMult || 1;
    this.cd = 0; this.hpIdx = 0;
    this.aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    this.aimDist = 600;
    this.missiles = def.missiles || 0; this.torpedoes = def.torpedoes || 0;
    this.lastHit = -99; this.lastAttacker = null; this.lastHitDir = new THREE.Vector3();
    this.dead = false; this.dying = 0; this.removed = false;
    this.invulnerable = !!def.invulnerable || !!opts.invulnerable;
    this.ai = null;
    this.points = def.points || 0;
    this.burns = [];
    this.static = (def.speed || 0) === 0;
    this.spin = opts.spin || 0;
    this.time = Math.random() * 10;
    this.targetable = opts.targetable != null ? opts.targetable : true;
    this.noCollide = false;
    this.warping = 0;
    this.hullFloor = opts.hullFloor || 0; // stora skepp som inte får dö (uppdragsmål)
    this.updateWorld();
  }

  get engineFactor() {
    let total = 0, alive = 0;
    for (const s of this.subs) if (s.type === 'engine') { total++; if (s.alive) alive++; }
    return total === 0 ? 1 : alive / total;
  }
  hullLocked() {
    if (this.def.targetsKill) return true;
    for (const s of this.subs) if (s.alive && s.type === 'shield') return true;
    return false;
  }
  hasShieldGen() { for (const s of this.subs) if (s.alive && s.type === 'shield') return true; return false; }
  aliveSubs(type) { return this.subs.filter(s => s.alive && (!type || s.type === type)); }

  /** Uppdaterar kolliderare och delsystemens världspositioner. */
  updateWorld() {
    const c = this.info.colliders || [];
    for (let i = 0; i < c.length; i++) {
      _v.set(c[i][0], c[i][1], c[i][2]).applyQuaternion(this.quat).add(this.pos);
      this.wColl[i * 4] = _v.x; this.wColl[i * 4 + 1] = _v.y; this.wColl[i * 4 + 2] = _v.z; this.wColl[i * 4 + 3] = c[i][3];
    }
    for (const s of this.subs) s.w.copy(s.local).applyQuaternion(this.quat).add(this.pos);
    this.fwd.copy(FWD).applyQuaternion(this.quat);
  }

  update(dt) {
    const W = this.world;
    this.time += dt;
    if (this.dying > 0) { this._updateDying(dt); return; }
    // ---- flygning
    if (!this.static) this._fly(dt);
    else if (this.spin) { _q.setFromAxisAngle(UP, this.spin * dt); this.quat.premultiply(_q); }
    this.updateWorld();
    // ---- sköld, energi, värme
    if (this.maxShield > 0 && W.time - this.lastHit > (this.isPlayer ? 2.6 : 3.5) && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
    }
    if (!this.boosting) {
      this.energy = Math.min(100, this.energy + (this.def.energyRegen || 14) * dt);
      if (this.energyLock && this.energy > 25) this.energyLock = false;
    }
    this.cd -= dt;
    this.heatT -= dt;
    if (this.heatT <= 0) this.heat = Math.max(0, this.heat - (this.overheated ? 30 : 24) * dt);
    if (this.overheated && this.heat <= 30) this.overheated = false;
    // ---- motorlågor
    this._updateFlames(dt);
    // ---- kanontorn
    if (this.subs.length) this._updateTurrets(dt);
    // ---- brinnande skador
    for (const b of this.burns) {
      b.t -= dt;
      if (b.t <= 0) {
        b.t = 0.06 + Math.random() * 0.05;
        _v.copy(b.local).applyQuaternion(this.quat).add(this.pos);
        W.fx.add.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0.5, b.size, b.size * 0.4, 3, 1.3, 0.3, 0.9);
        W.fx.smoke.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6 + 4, (Math.random() - 0.5) * 6, 2.2, b.size * 0.8, b.size * 3, 0.1, 0.1, 0.1, 0.45, 0.3);
      }
    }
    // ---- låg skrov: rök och gnistor (små skepp)
    if (!this.isLarge && this.hull < this.maxHull * 0.35 && Math.random() < dt * 12) {
      _v.set((Math.random() - 0.5) * this.radius, (Math.random() - 0.5) * this.radius * 0.5, (Math.random() - 0.3) * this.radius).applyQuaternion(this.quat).add(this.pos);
      W.fx.smokePuff(_v, null, this.radius * 0.25, 1.0, 0.12, 0.45);
      if (Math.random() < 0.3) W.fx.spark(_v, null, 2, 25, [3, 1.6, 0.6], 0.5);
    }
    if (this.blinkers.length) {
      const armed = this.ai && this.ai.armed;
      const on = armed ? (Math.sin(this.time * 40) > 0) : (Math.sin(this.time * 4) > 0.3);
      for (const b of this.blinkers) b.visible = on;
    }
  }

  _fly(dt) {
    const d = this.def, c = this.ctrl, T = d.turn;
    const ef = this.isLarge ? this.engineFactor : 1;
    let turnK = this.boosting ? 0.82 : 1;
    // spelaren svänger lite snävare vid låg fart/broms – gör närstrid mindre av en karusell
    if (this.isPlayer && !this.boosting && d.speed > 0) { const sf = this.speed / d.speed; if (sf < 0.6) turnK *= 1 + (0.6 - Math.max(0, sf)) * 0.6; }
    const resp = this.isLarge ? 1.2 : 6.5;
    this.angVel.x = damp(this.angVel.x, clamp(c.pitch, -1, 1) * T.pitch * turnK * (ef > 0 ? 1 : 0.2), resp, dt);
    this.angVel.y = damp(this.angVel.y, -clamp(c.yaw, -1, 1) * T.yaw * turnK * (ef > 0 ? 1 : 0.2), resp, dt);
    this.angVel.z = damp(this.angVel.z, -clamp(c.roll, -1, 1) * T.roll * (ef > 0 ? 1 : 0.2), resp * 1.2, dt);
    _e.set(this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt);
    _q.setFromEuler(_e);
    this.quat.multiply(_q).normalize();
    // fart
    let target = clamp(c.throttle, 0, 1) * d.speed;
    this.boosting = false;
    if (c.boost && !this.energyLock && this.energy > 0 && d.boost > d.speed) {
      target = d.boost; this.boosting = true;
      this.energy -= 30 * dt;
      if (this.energy <= 0) { this.energy = 0; this.energyLock = true; }
    }
    if (c.brake) target = d.speed * 0.1;
    target *= ef;
    if (this.warping > 0) { this.warping -= dt; target = Math.max(target, this.speed); }
    const acc = (d.accel || 60) * (this.boosting ? 1.8 : 1) * (target < this.speed ? 1.6 : 1);
    if (this.speed < target) this.speed = Math.min(target, this.speed + acc * dt);
    else this.speed = Math.max(target, this.speed - acc * dt);
    this.fwd.copy(FWD).applyQuaternion(this.quat);
    const grip = this.isLarge ? 1.5 : 3.0;
    _v.copy(this.fwd).multiplyScalar(this.speed);
    this.vel.lerp(_v, 1 - Math.exp(-grip * dt));
    this.pos.addScaledVector(this.vel, dt);
  }

  _updateFlames(dt) {
    const sp = this.def.speed > 0 ? this.speed / this.def.speed : 0;
    const thr = this.boosting ? 1.7 : (this.static ? 0.6 : clamp(0.2 + 0.8 * sp, 0.15, 1.2));
    const fl = 0.9 + 0.12 * Math.sin(this.time * 47 + this.id);
    for (const f of this.flames) {
      const u = f.userData.flame;
      f.scale.set(u.r * (this.boosting ? 1.15 : 1), u.r * (this.boosting ? 1.15 : 1), u.len * thr * fl);
    }
    for (const g of this.glows) g.scale.setScalar(g.userData.glow * (0.55 + 0.5 * thr) * fl);
  }

  /** Världsposition för lokal punkt. */
  toWorld(local, out) { return out.set(local[0], local[1], local[2]).applyQuaternion(this.quat).add(this.pos); }

  /** Skjut laser i riktning this.aimDir (sätts av styrningen). Returnerar sant om skott avlossades. */
  fireLaser() {
    const w = this.weapon;
    if (!w || this.cd > 0 || this.overheated || this.dead) return false;
    const W = this.world;
    const hps = this.info.hardpoints.length ? this.info.hardpoints : [[0, 0, -this.radius]];
    const conv = clamp(this.aimDist, 120, 1200);
    const fire = (hp, spread = 0) => {
      this.toWorld(hp, _v);
      _v2.copy(this.pos).addScaledVector(this.aimDir, conv).sub(_v).normalize();
      if (spread) { _v3.copy(UP).applyQuaternion(this.quat); _v2.applyAxisAngle(_v3, spread); }
      W.bolts.fire(_v, _v2, w.speed, this.vel, w, this.team, this, this.dmgMult);
      W.fx.muzzle(_v, w.color, 2.2 * (w.size || 1));
    };
    if (w.mode === 'both') { for (const hp of hps) fire(hp); }
    else if (w.mode === 'spread') { const hp = hps[this.hpIdx++ % hps.length]; fire(hp, -0.045); fire(hp, 0); fire(hp, 0.045); }
    else { fire(hps[this.hpIdx++ % hps.length]); }
    this.cd = w.cd;
    this.heat += w.heat * this.heatMult;
    this.heatT = 0.35;
    if (this.heat >= 100) { this.heat = 100; this.overheated = true; if (this.isPlayer) W.emit('overheat', this); }
    W.sfxShot(this, w);
    if (this.isPlayer) W.stats.shots += (w.mode === 'both' ? hps.length : (w.mode === 'spread' ? 3 : 1));
    return true;
  }

  /* -------------------------------------------------------------- Skada */
  /** opts: { sm, hm, from, point, dir, sub, kind:'laser'|'blast'|'ram', capMult, color } */
  damage(amount, opts = {}) {
    if (this.dead) return;
    const W = this.world;
    const from = opts.from || null;
    if (from && from.team === this.team) return; // ingen vådaskada
    if (this.invulnerable) { if (opts.point) W.fx.spark(opts.point, opts.dir ? _v.copy(opts.dir).negate() : null, 3, 40, [2.4, 2, 1.4]); return; }
    let mult = 1;
    if (this.team === 0) mult = this.isPlayer ? W.diff.dmgTaken : (this.isLarge ? W.diff.allyDmg * 0.8 : W.diff.allyDmg);
    if (this.isPlayer && W.godMode) mult = 0;
    const sm = opts.sm || 1, hm = opts.hm || 1;
    const capMult = this.isLarge ? (opts.capMult || 1) : 1;
    let a = amount * mult * capMult;
    this.lastHit = W.time;
    if (from && from !== this) { this.lastAttacker = from; this.lastHitDir.copy(from.pos).sub(this.pos).normalize(); }
    else if (opts.dir) this.lastHitDir.copy(opts.dir).negate();
    // ---- delsystem
    const sub = opts.sub;
    if (sub && sub.alive) {
      if (sub.requires === 'shield' && this.hasShieldGen()) {
        if (opts.point) W.fx.shieldHit(this, opts.point, [2.6, 0.8, 0.5]);
        W.emit('deflect', this, sub, from);
        return;
      }
      sub.hp -= a * hm;
      sub.lastHit = W.time;
      if (opts.point) W.fx.spark(opts.point, opts.dir ? _v.copy(opts.dir).negate() : null, 5, 50, [3, 1.8, 0.6], 0.8);
      if (sub.hp <= 0) this.destroySub(sub, from);
      if (!this.hullLocked() && sub.type !== 'turret') this._hullDamage(a * hm * 0.2, from);
      W.emit('hit', this, from, a, sub);
      return;
    }
    // ---- sköld
    if (this.shield > 0) {
      const sd = a * sm;
      if (opts.point) W.fx.shieldHit(this, opts.point, this.team === 0 ? [0.4, 1.2, 2.6] : [2.6, 0.9, 0.5]);
      if (sd <= this.shield) { this.shield -= sd; W.emit('hit', this, from, a, null, true); return; }
      a = (sd - this.shield) / sm; this.shield = 0;
      W.emit('shieldDown', this, from);
    }
    if (this.hullLocked()) {
      if (opts.point) W.fx.shieldHit(this, opts.point, [2.6, 0.8, 0.5]);
      W.emit('deflect', this, null, from);
      return;
    }
    if (opts.point) W.fx.spark(opts.point, opts.dir ? _v.copy(opts.dir).negate() : null, 6, 55, [3, 1.8, 0.6], 0.7);
    this._hullDamage(a * hm, from);
    W.emit('hit', this, from, a, null, false);
  }
  _hullDamage(a, from) {
    this.hull -= a;
    if (this.hullFloor > 0 && this.hull < this.hullFloor) { this.hull = this.hullFloor; this.world.emit('floor', this, from); return; }
    if (this.hull <= 0) { this.hull = 0; this.die(from); }
  }
  destroySub(sub, from) {
    if (!sub.alive) return;
    sub.alive = false; sub.hp = 0;
    const W = this.world;
    if (sub.node) sub.node.visible = false;
    W.fx.explode(sub.w, Math.max(6, sub.r * 0.9), this.vel, { debris: 8 });
    W.sfxAt('boom', sub.w, 1.2);
    this.burns.push({ local: sub.local.clone(), t: 0, size: Math.max(4, sub.r * 0.6) });
    if (this.burns.length > 8) this.burns.shift();
    if (sub.type === 'bridge') this._hullDamage(this.maxHull * 0.25, from);
    W.emit('subDestroyed', this, sub, from);
    if (sub.type === 'reactor') this.die(from, true);
    if (this.def.targetsKill && !this.subs.some(s => s.alive && s.type === 'target')) this.die(from, true);
  }
  die(from, force = false) {
    if (this.dead) return;
    if (this.invulnerable && !force) return;
    this.dead = true;
    const W = this.world;
    if (this.isLarge) {
      this.dying = this.kind === 'station' || this.radius > 200 ? 4.2 : 2.6;
      this.dyingMax = this.dying; this.dyingT = 0;
      this.ctrl.throttle = 0;
    }
    W.onShipDestroyed(this, from);
  }
  _updateDying(dt) {
    const W = this.world;
    this.dying -= dt; this.dyingT -= dt;
    this.pos.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.exp(-0.3 * dt));
    _q.setFromAxisAngle(_v.set(0.3, 0, 1).normalize(), dt * 0.04); this.quat.multiply(_q);
    this.updateWorld();
    if (this.dyingT <= 0) {
      this.dyingT = 0.12 + Math.random() * 0.2;
      const c = this.info.colliders;
      if (c && c.length) {
        const k = Math.floor(Math.random() * c.length);
        _v.set(c[k][0], c[k][1], c[k][2]).applyQuaternion(this.quat).add(this.pos);
        _v2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(c[k][3]);
        _v.add(_v2);
        W.fx.explode(_v, c[k][3] * (0.5 + Math.random() * 0.5), null, { debris: 4 });
        W.sfxAt('explode', _v, 0.9);
      }
    }
    this._updateFlames(dt);
    if (this.dying <= 0) {
      W.fx.explode(this.pos, Math.min(140, this.radius * 0.45), this.vel, { debris: 30 });
      W.fx.ring(this.pos, this.radius * 5, [2.5, 1.6, 0.8], 2.5);
      W.sfxAt('bigboom', this.pos, 2);
      W.shake(this.pos, 3.5, this.radius * 6);
      W.removeShip(this);
    }
  }

  /* -------------------------------------------------------------- Kanontorn */
  _updateTurrets(dt) {
    const W = this.world;
    if (this.dead) return;
    for (const s of this.subs) {
      if (s.type !== 'turret' || !s.alive || !s.yaw) continue;
      s.cd -= dt; s.retarget -= dt;
      if (s.retarget <= 0 || !s.target || s.target.dead) { s.target = W.turretTarget(this, s); s.retarget = 0.7 + Math.random() * 0.7; }
      // tornets rot-orientering i världen
      _q.copy(this.quat).multiply(s.node.quaternion);
      const T = s.target;
      let wantYaw = s.yaw.rotation.y, wantPitch = 0.15, can = false;
      const heavy = s.kind === 'heavy';
      const w = NPC_WEAPON[heavy ? (this.team === 0 ? 'heavyAlly' : 'heavyTurret') : (this.team === 0 ? 'turretAlly' : 'turret')];
      let dist = 0;
      if (T) {
        dist = T.pos.distanceTo(s.w);
        const t = dist / w.speed;
        _v.copy(T.pos).addScaledVector(T.vel, t).sub(s.w);
        _v2.copy(_v).applyQuaternion(_q2.copy(_q).invert());
        wantYaw = Math.atan2(-_v2.x, -_v2.z);
        wantPitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
        can = wantPitch > -0.12 && dist < (heavy ? 1700 : 1150);
      }
      const rs = (heavy ? 0.9 : 1.8) * dt;
      let dy = wantYaw - s.yaw.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      s.yaw.rotation.y += clamp(dy, -rs, rs);
      const tp = clamp(wantPitch, -0.1, 1.45);
      s.pitch.rotation.x += clamp(tp - s.pitch.rotation.x, -rs, rs);
      if (can && Math.abs(dy) < 0.12 && Math.abs(tp - s.pitch.rotation.x) < 0.12 && s.cd <= 0) {
        s.cd = w.cd * (0.85 + Math.random() * 0.4) * (this.team === 1 ? 1 / Math.max(0.6, W.diff.react) : 1) * (T.isPlayer ? 1.6 : 1);
        // mynning
        _v3.set(0, 0, -s.muzzle).applyEuler(_e.set(s.pitch.rotation.x, 0, 0)).applyEuler(_e.set(0, s.yaw.rotation.y, 0));
        _v3.y += s.pitch.position.y;
        _v3.multiplyScalar(s.node.scale.x).applyQuaternion(_q).add(s.w);
        const acc = this.team === 1 ? W.diff.enemyAcc : 0.85;
        _v.normalize();
        let err = (1 - acc) * 0.06 + 0.006;
        if (!T.isLarge) err = (1 - acc) * 0.08 + 0.018 + (heavy ? 0.05 : 0) + (T.boosting ? 0.02 : 0);
        _v.x += (Math.random() - 0.5) * err * 2; _v.y += (Math.random() - 0.5) * err * 2; _v.z += (Math.random() - 0.5) * err * 2; _v.normalize();
        W.bolts.fire(_v3, _v, w.speed, this.vel, w, this.team, this, 1);
        W.fx.muzzle(_v3, w.color, heavy ? 6 : 3.5);
        W.sfxShot(this, w, _v3);
      }
    }
  }

  /** Ta bort från scenen. */
  detach() { if (this.obj.parent) this.obj.parent.remove(this.obj); this.removed = true; }
}
