/* Rävens äventyr – fiender: svampis, taggsvin, bi, mås, spöklykta, fladdermus, snögubbe, krabba, stormkråka. */
import * as THREE from 'three';
import { buildEnemy } from './models.js';

const V3 = THREE.Vector3;
const _v = new V3(), _dn = new V3(0, -1, 0), _o = new V3();
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/** Fiendetyper: stomp = vad som händer när man hoppar på den. */
const KIND = {
  svampis:   { hp: 1, speed: 2.2, chase: 4.2, sight: 8, stomp: 'kill', fly: false },
  taggsvin:  { hp: 1, speed: 1.8, chase: 9.5, sight: 9, stomp: 'hurt', fly: false },
  bi:        { hp: 1, speed: 2, chase: 9, sight: 10, stomp: 'kill', fly: true },
  mas:       { hp: 1, speed: 3, chase: 10, sight: 11, stomp: 'kill', fly: true, model: 'mas' },
  spoklykta: { hp: 1, speed: 1.5, chase: 2.6, sight: 11, stomp: 'kill', fly: true, ghost: true },
  fladdermus:{ hp: 1, speed: 2.5, chase: 8, sight: 9, stomp: 'kill', fly: true },
  snogubbe:  { hp: 1, speed: 0, chase: 0, sight: 22, stomp: 'kill', fly: false },
  krabba:    { hp: 1, speed: 2.2, chase: 6, sight: 7, stomp: 'kill', fly: false },
  krak:      { hp: 1, speed: 3, chase: 12, sight: 14, stomp: 'kill', fly: true }
};

export class Enemy {
  /** o: { radius (patrullzon), height (flyghöjd), drop:'heart' } */
  constructor(W, kind, x, y, z, o = {}) {
    this.W = W; this.kind = kind; this.K = KIND[kind]; this.o = o;
    this.home = new V3(x, y, z);
    this.rig = buildEnemy(kind === 'mas' ? 'mas' : kind);
    this.obj = this.rig.root;
    W.group.add(this.obj);
    if (this.rig.disposeMats) this.obj.userData.disposeMat = this.rig.disposeMats;
    this.zone = o.radius || 6;
    this.reset();
  }
  reset() {
    this.p = this.home.clone(); this.v = new V3();
    this.face = Math.random() * 6.28; this.state = 'patrol'; this.t = Math.random() * 10;
    this.hp = this.K.hp; this.dead = false; this.obj.visible = true; this.obj.scale.setScalar(1); this.obj.rotation.set(0, 0, 0);
    this.target = null; this.wanderT = 0; this.stateT = 0; this.gy = this.home.y; this.gyT = 0; this.cool = 1 + Math.random() * 2;
    this.flipped = 0; this.hitCd = 0;
    if (this.K.fly) this.p.y = this.home.y + (this.o.height == null ? 2 : this.o.height);
  }
  resetVisit() { this.reset(); }
  _ground(G) {
    this.gyT -= 1;
    if (this.gyT <= 0) {
      this.gyT = 6;
      const h = this.W.col.raycast(_o.set(this.p.x, this.p.y + 2, this.p.z), _dn, 8);
      this.gy = h ? h.point.y : this.gy;
    }
    return this.gy;
  }
  kill(G, how) {
    this.dead = true; this.state = 'dead';
    G.audio.play('hit'); G.audio.play('pickup', { pitch: 0.7, vol: 0.6 });
    const c = { svampis: [0xd83a2e, 0xffffff], taggsvin: [0x6a4a30, 0xf2e2c0], bi: [0xffc928, 0x2a2218], mas: [0xffffff], spoklykta: [0xb9c8ff, 0x8affc8], fladdermus: [0x6a4a7a], snogubbe: [0xffffff], krabba: [0xe2462e], krak: [0x3a2f55, 0xff4a6a] }[this.kind];
    G.fx.burst(this.p.x, this.p.y + 0.5, this.p.z, 18, { speed: 5, g: 8, color: c, size: 0.4, life: 0.6 });
    G.fx.burst(this.p.x, this.p.y + 0.5, this.p.z, 6, { speed: 2, color: 0xffffff, size: 1, size1: 1.6, life: 0.4, alpha: 0.6 });
    this.deadT = 0.35;
    if (Math.random() < 0.3 && G.player.hp < G.player.maxHp) this.W.heart(this.p.x, this.p.y + 0.8, this.p.z);
    G.onEnemyKilled && G.onEnemyKilled(this, how);
  }
  update(dt, G) {
    if (this.dead) {
      if (this.deadT > 0) { this.deadT -= dt; this.obj.scale.set(1 + (0.35 - this.deadT) * 3, Math.max(0.05, this.deadT * 2.5), 1 + (0.35 - this.deadT) * 3); if (this.deadT <= 0) this.obj.visible = false; }
      return;
    }
    const pl = G.player, K = this.K;
    this.t += dt; this.stateT += dt; this.hitCd -= dt;
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z, dy = pl.pos.y - this.p.y;
    const dist = Math.hypot(dx, dz);
    const awake = dist < 45;
    if (!awake) { this.obj.visible = false; return; }
    this.obj.visible = true;
    const playerHome = Math.hypot(pl.pos.x - this.home.x, pl.pos.z - this.home.z) < this.zone + 5 && Math.abs(pl.pos.y - this.home.y) < 6;
    const sees = dist < K.sight && playerHome && pl.state !== 'dead';
    this['_' + (AI[this.kind] || 'walker')](dt, G, dist, dx, dz, dy, sees);
    // modell
    this.obj.position.copy(this.p);
    this.obj.rotation.y = this.face;
    this._anim(dt);
    // interaktion med spelaren
    if (this.hitCd > 0 || pl.state === 'dead') return;
    const top = this.p.y + this.rig.h;
    const cy = this.p.y + this.rig.h * 0.5;
    const atk = pl.attackHit(_v.set(this.p.x, cy, this.p.z), this.rig.r);
    if (atk) {
      if (this.kind === 'taggsvin' && atk === 'spin' && !this.flipped) { this.flipped = 2.5; this.hitCd = 0.3; G.audio.play('hit'); this.v.set(Math.sin(pl.face) * 6, 0, Math.cos(pl.face) * 6); return; }
      if (this.kind === 'krabba' && atk === 'spin' && !this.flipped) { this.flipped = 2.5; this.hitCd = 0.3; G.audio.play('hit'); return; }
      this.kill(G, atk); return;
    }
    if (pl.stompCheck(this.p, this.rig.r, top)) {
      if (K.stomp === 'hurt' && !this.flipped && pl.state !== 'pound') { pl.damage(this.p); pl.bounce(8); this.hitCd = 0.5; return; }
      pl.bounce(pl.state === 'pound' ? 9 : 11); this.kill(G, 'stomp'); return;
    }
    const r = this.rig.r + 0.38;
    if (dist < r && dy > -this.rig.h - 0.2 && dy < this.rig.h * 0.8 && !this.flipped) { pl.damage(this.p); this.hitCd = 0.6; }
  }
  /* --- AI-varianter --- */
  _walker(dt, G, dist, dx, dz, dy, sees) {
    const K = this.K;
    let sp = K.speed;
    if (this.flipped > 0) { this.flipped -= dt; this.v.multiplyScalar(Math.exp(-4 * dt)); if (this.flipped <= 0) this.flipped = 0; }
    else if (this.kind === 'taggsvin') {
      // laddar upp och rusar
      if (this.state === 'patrol' && sees && this.cool <= 0) { this.state = 'windup'; this.stateT = 0; this.face = Math.atan2(dx, dz); G.audio.play('error', { vol: 0.4, pitch: 0.8 }); }
      if (this.state === 'windup') { sp = 0; if (this.stateT > 0.6) { this.state = 'charge'; this.stateT = 0; } }
      else if (this.state === 'charge') { sp = K.chase; if (this.stateT > 1.3) { this.state = 'patrol'; this.cool = 1.5; } }
      else { this.cool -= dt; this._wander(dt); }
    } else if (sees && K.chase) { this.face += Math.max(-dt * 5, Math.min(dt * 5, angDiff(this.face, Math.atan2(dx, dz)))); sp = K.chase; this.state = 'chase'; }
    else { this.state = 'patrol'; this._wander(dt); }
    if (this.flipped <= 0) { this.v.x = Math.sin(this.face) * sp; this.v.z = Math.cos(this.face) * sp; }
    const nx = this.p.x + this.v.x * dt, nz = this.p.z + this.v.z * dt;
    // stanna inom zonen och vid kanter
    const hd = Math.hypot(nx - this.home.x, nz - this.home.z);
    if (hd > this.zone) { this.face = Math.atan2(this.home.x - this.p.x, this.home.z - this.p.z); if (this.state === 'charge') this.state = 'patrol'; return; }
    const h = this.W.col.raycast(_o.set(nx + Math.sin(this.face) * 0.5, this.p.y + 1.5, nz + Math.cos(this.face) * 0.5), _dn, 4);
    if (!h || h.point.y < this.p.y - 1.2 || h.point.y > this.p.y + 0.8) { this.face += Math.PI * (0.6 + Math.random() * 0.4); if (this.state === 'charge') { this.state = 'patrol'; this.cool = 1; } return; }
    this.p.x = nx; this.p.z = nz;
    this.p.y += (h.point.y - this.p.y) * Math.min(1, dt * 12);
  }
  _wander(dt) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 1.5 + Math.random() * 2.5; this.wanderFace = Math.random() < 0.3 ? null : Math.atan2(this.home.x - this.p.x + (Math.random() - 0.5) * this.zone * 2, this.home.z - this.p.z + (Math.random() - 0.5) * this.zone * 2); }
    if (this.wanderFace == null) { this.v.set(0, 0, 0); return 0; }
    this.face += Math.max(-dt * 3, Math.min(dt * 3, angDiff(this.face, this.wanderFace)));
    return 1;
  }
  _flyer(dt, G, dist, dx, dz, dy, sees) {
    const K = this.K, pl = G.player;
    const baseY = this.home.y + (this.o.height == null ? 2 : this.o.height);
    if (this.state === 'dive') {
      this.p.addScaledVector(this.v, dt);
      if (this.stateT > 1.1) { this.state = 'return'; this.stateT = 0; }
    } else if (this.state === 'return') {
      _v.set(this.home.x - this.p.x, baseY - this.p.y, this.home.z - this.p.z);
      const l = _v.length();
      if (l < 0.5 || this.stateT > 4) { this.state = 'patrol'; this.cool = 1.5; }
      else this.p.addScaledVector(_v.divideScalar(l), Math.min(l, K.speed * 2 * dt));
      this.face = Math.atan2(_v.x, _v.z);
    } else {
      // svävande cirkel
      const a = this.t * K.speed * 0.25;
      const tx = this.home.x + Math.cos(a) * Math.min(this.zone, 3), tz = this.home.z + Math.sin(a) * Math.min(this.zone, 3);
      this.p.x += (tx - this.p.x) * Math.min(1, dt * 2); this.p.z += (tz - this.p.z) * Math.min(1, dt * 2);
      this.p.y += (baseY + Math.sin(this.t * 2) * 0.4 - this.p.y) * Math.min(1, dt * 3);
      this.face = a + Math.PI / 2;
      this.cool -= dt;
      if (sees) {
        this.face = Math.atan2(dx, dz);
        if (this.cool <= 0 && dist < K.sight) {
          this.state = 'dive'; this.stateT = 0;
          _v.set(pl.pos.x - this.p.x, pl.pos.y + 0.6 - this.p.y, pl.pos.z - this.p.z).normalize();
          this.v.copy(_v).multiplyScalar(K.chase);
          G.audio.play('zap', { vol: 0.25, pitch: 0.5 });
        }
      }
    }
  }
  _ghost(dt, G, dist, dx, dz, dy, sees) {
    const K = this.K, pl = G.player;
    if (sees) {
      _v.set(pl.pos.x - this.p.x, pl.pos.y + 0.4 - this.p.y, pl.pos.z - this.p.z);
      const l = _v.length();
      if (l > 0.3) this.p.addScaledVector(_v.divideScalar(l), K.chase * dt);
      this.face = Math.atan2(dx, dz);
    } else {
      this.p.y += (this.home.y + 0.5 + Math.sin(this.t * 1.5) * 0.3 - this.p.y) * Math.min(1, dt * 2);
      this.p.x += (this.home.x + Math.sin(this.t * 0.4) * 2 - this.p.x) * Math.min(1, dt);
      this.p.z += (this.home.z + Math.cos(this.t * 0.3) * 2 - this.p.z) * Math.min(1, dt);
      this.face += dt * 0.5;
    }
  }
  _thrower(dt, G, dist, dx, dz, dy, sees) {
    this._ground(G);
    this.p.y = this.gy;
    if (sees) {
      this.face += Math.max(-dt * 3, Math.min(dt * 3, angDiff(this.face, Math.atan2(dx, dz))));
      this.cool -= dt;
      if (this.cool <= 0.4 && !this.windup) { this.windup = true; }
      if (this.cool <= 0) {
        this.cool = 2.2 + Math.random(); this.windup = false;
        const pl = G.player;
        const from = _o.set(this.p.x + Math.sin(this.face) * 0.6, this.p.y + 1.6, this.p.z + Math.cos(this.face) * 0.6).clone();
        // sikta med lite förutseende
        const T = Math.max(0.6, dist / 13);
        const tx = pl.pos.x + pl.vel.x * T * 0.5, tz = pl.pos.z + pl.vel.z * T * 0.5, ty = pl.pos.y + 0.7;
        const vel = new V3((tx - from.x) / T, (ty - from.y) / T + 0.5 * 18 * T, (tz - from.z) / T);
        this.W.projectiles.spawn('snowball', from, vel, { r: 0.32, owner: this });
        G.audio.play('whoosh', { pitch: 1.3, vol: 0.5 });
      }
    }
  }
  _anim(dt) {
    const R = this.rig, t = this.t;
    switch (this.kind) {
      case 'svampis': case 'krabba': case 'taggsvin': {
        const moving = this.v.lengthSq() > 0.1;
        const f = this.state === 'charge' ? 20 : 9;
        if (R.feet) R.feet.forEach((ft, i) => { ft.position.y = 0.06 + (moving ? Math.max(0, Math.sin(t * f + i * Math.PI)) * 0.12 : 0); });
        if (R.body) {
          R.body.position.y = (this.kind === 'taggsvin' ? 0.45 : this.kind === 'krabba' ? 0.35 : 0) + (moving ? Math.abs(Math.sin(t * f)) * 0.05 : 0);
          R.body.rotation.z = this.state === 'windup' ? Math.sin(t * 40) * 0.12 : 0;
          R.body.rotation.x = this.flipped > 0 ? Math.PI : 0;
        }
        if (R.claws) R.claws.forEach((c, i) => { c.rotation.x = Math.sin(t * 6 + i) * 0.4; });
        if (this.kind === 'krabba') this.obj.rotation.y = this.face + Math.PI / 2 * (this.v.lengthSq() > 0.1 ? 1 : 0);
        break;
      }
      case 'bi': case 'mas': case 'fladdermus': case 'krak':
        R.wings.forEach((w, i) => { w.rotation.z = Math.sin(t * (this.kind === 'bi' ? 40 : 12)) * (i ? 1 : -1) * 0.6; });
        R.body.rotation.x = this.state === 'dive' ? 0.6 : 0;
        break;
      case 'spoklykta':
        R.body.position.y = 0.9 + Math.sin(t * 2) * 0.12; R.parts.lamp.rotation.z = Math.sin(t * 3) * 0.3; break;
      case 'snogubbe':
        R.arms[0].rotation.z = 0.9 + (this.windup ? -1.8 : Math.sin(t * 2) * 0.1);
        R.parts.head.rotation.z = Math.sin(t * 1.5) * 0.08; break;
    }
  }
}
const AI = { svampis: 'walker', taggsvin: 'walker', krabba: 'walker', bi: 'flyer', mas: 'flyer', fladdermus: 'flyer', krak: 'flyer', spoklykta: 'ghost', snogubbe: 'thrower' };

export function enemy(W, kind, x, y, z, o) { const e = new Enemy(W, kind, x, y, z, o); W.add(e); return e; }
