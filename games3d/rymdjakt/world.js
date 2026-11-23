/**
 * Rymdjakt – World: håller alla skepp, projektiler, asteroider och miljön för ett uppdrag.
 * Sköter uppdateringsordning, kollisioner, skador, explosioner, händelser och positionsljud.
 */
import * as THREE from 'three';
import { NPC, DIFF } from './data.js';
import { Ship } from './ships.js';
import { makeAI, updateAI } from './ai.js';
import { Bolts, Missiles, Flares, segSphere } from './weapons.js';
import { AsteroidField } from './asteroids.js';
import { Environment } from './sky.js';
import { mat } from './gfx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.fx = game.fx;
    this.sfx = game.sfx;
    this.ships = []; this.large = []; this.teams = [[], []];
    this.bolts = new Bolts(this.scene, 900);
    this.missiles = new Missiles(this.scene, this.fx);
    this.flares = new Flares(this.fx);
    this.asteroids = null; this.env = null;
    this.player = null; this.playerTarget = null;
    this.time = 0;
    this.diff = DIFF.normal;
    this.listeners = {};
    this.stats = this.freshStats();
    this.navs = [];
    this.bounds = null;
    this.shakeAmt = 0;
    this.extra = []; // egna objekt (ringar m.m.) som tas bort vid rensning
    this.godMode = false;
    this.fireTokens = new Set();
  }
  freshStats() { return { shots: 0, hits: 0, kills: 0, killPoints: 0, missiles: 0, damageTaken: 0, subs: 0, deaths: 0 }; }

  /* -------------------------------------------------------------- händelser */
  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); }
  emit(name, ...a) { const l = this.listeners[name]; if (l) for (const fn of l) fn(...a); }

  /* -------------------------------------------------------------- uppbyggnad */
  setup({ env = 'hemma', diff = 'normal', asteroids = null }) {
    this.clear();
    this.diff = DIFF[diff] || DIFF.normal;
    this.env = new Environment(this.game.R.renderer, this.scene, env, this.game.settings);
    this.fx.setDust(this.env.dustColor);
    if (asteroids) {
      const q = this.game.settings.q;
      const k = q.view;
      // online (fixed): samma antal hos alla spelare så att uppspräckta asteroider kan synkas
      const count = asteroids.fixed ? asteroids.count : Math.round(asteroids.count * Math.min(1.25, Math.max(0.55, k)));
      this.asteroids = new AsteroidField(this.scene, Object.assign({}, asteroids, { count }));
    }
    this.time = 0;
    this.stats = this.freshStats();
  }
  clear() {
    for (const s of this.ships) s.detach();
    this.ships.length = 0; this.large.length = 0; this.teams[0].length = 0; this.teams[1].length = 0;
    this.bolts.clear(); this.missiles.clear(); this.flares.clear(); this.fx.clear();
    if (this.asteroids) { this.asteroids.dispose(); this.asteroids = null; }
    if (this.env) { this.env.dispose(); this.env = null; }
    for (const o of this.extra) { this.scene.remove(o); if (o.userData.ownGeo && o.geometry) o.geometry.dispose(); }
    this.extra.length = 0;
    this.player = null; this.playerTarget = null;
    this.teams.length = 2; this.netPlayers = null; this.netVisual = null; this.netHook = null; this.netDuel = false;
    this.listeners = {};
    this.navs.length = 0; this.bounds = null; this.shakeAmt = 0;
  }
  addExtra(o) { this.scene.add(o); this.extra.push(o); return o; }
  removeExtra(o) { this.scene.remove(o); const i = this.extra.indexOf(o); if (i >= 0) this.extra.splice(i, 1); }

  /* -------------------------------------------------------------- skapa skepp */
  /**
   * opts: { team, pos:[x,y,z]|Vector3, look:[x,y,z]|Vector3, dir, speed, throttle, ai:{...}, name, tags, warp, hpMult, invulnerable, spin, callsign, stats, isPlayer }
   */
  spawn(type, o = {}) {
    const def = o.stats || NPC[type];
    const team = o.team != null ? o.team : 1;
    const hpMult = o.hpMult != null ? o.hpMult : (team === 1 ? this.diff.enemyHp : 1);
    const pos = o.pos ? (o.pos.isVector3 ? o.pos.clone() : new THREE.Vector3(...o.pos)) : new THREE.Vector3();
    const s = new Ship(this, type, Object.assign({}, o, { team, hpMult, pos }));
    if (o.look) {
      const look = o.look.isVector3 ? o.look : new THREE.Vector3(...o.look);
      if (look.distanceToSquared(pos) > 1) { _m.lookAt(pos, look, UP); s.quat.setFromRotationMatrix(_m); }
    } else if (o.quat) s.quat.copy(o.quat);
    s.updateWorld();
    s.ctrl.throttle = o.throttle != null ? o.throttle : (s.static ? 0 : 0.8);
    s.speed = o.speed != null ? o.speed : def.speed * s.ctrl.throttle;
    s.vel.copy(s.fwd).multiplyScalar(s.speed);
    const aiKind = o.aiKind || (o.isPlayer ? null : def.ai);
    if (aiKind) s.ai = makeAI(aiKind, o.ai || {});
    if (s.ai && !s.ai.home) s.ai.home = pos.clone();
    this.scene.add(s.obj);
    this.ships.push(s);
    if (s.isLarge) this.large.push(s);
    // motorstrimmor för jaktplan
    if (!s.isLarge && !s.isPlayer && (s.kind === 'fighter' || s.kind === 'bomber') && s.info.engines) {
      const col = s.team === 0 ? [0.35, 0.8, 1.8] : [1.8, 0.6, 0.25];
      const e = s.info.engines[0];
      const loc = new THREE.Vector3(0, e[1], e[2] + 1.5);
      s.trail = this.fx.trails.add(out => { if (s.dead || s.removed) return false; out.copy(loc).applyQuaternion(s.quat).add(s.pos); return true; }, { width: s.isPlayer ? 0.9 : 0.7, life: s.isPlayer ? 0.35 : 0.55, color: col, alpha: s.isPlayer ? 0.25 : 0.4 });
    }
    if (o.warp) {
      s.speed = def.boost * 1.5; s.vel.copy(s.fwd).multiplyScalar(s.speed); s.warping = 0.5;
      this.fx.warpIn(s.pos, s.fwd, s.radius);
      this.sfxAt('warp', s.pos, s.isLarge ? 1.6 : 0.8);
    }
    this.teams[s.team].push(s);
    return s;
  }
  spawnPlayer(stats, pos, look) {
    const p = this.spawn('player', { stats, team: 0, isPlayer: true, pos, look, throttle: 0.6, name: 'Stjärna Ett', callsign: 'Stjärna Ett' });
    // missiler: oändliga, magasin om två som laddas om en i taget
    p.magMax = stats.magazine || 2; p.mag = p.magMax; p.reloadTime = stats.reload || 3.6; p.reloadT = 0;
    p.flares = stats.flares; p.maxFlares = stats.flares;
    p.secondary = stats.secondary;
    this.player = p;
    // vingspetsstrimmor
    p.wingEmit = 0;
    if (p.info.wingtips) for (const wt of p.info.wingtips) {
      const loc = new THREE.Vector3(...wt);
      const tr = this.fx.trails.add(out => { if (p.dead || p.removed) return false; out.copy(loc).applyQuaternion(p.quat).add(p.pos); return true; }, { width: 0.1, life: 0.45, color: [1.0, 1.15, 1.4], alpha: 0.22, interval: 0.02 });
      if (tr) (p.wingTrails || (p.wingTrails = [])).push(tr);
    }
    return p;
  }
  removeShip(s) {
    s.detach();
    let i = this.ships.indexOf(s); if (i >= 0) this.ships.splice(i, 1);
    i = this.large.indexOf(s); if (i >= 0) this.large.splice(i, 1);
    const t = this.teams[s.team]; i = t.indexOf(s); if (i >= 0) t.splice(i, 1);
  }
  /** Skjut ut ett jaktplan från ett hangardelsystem. */
  launchFrom(ship, sub, type, opts = {}) {
    _v.copy(sub.w);
    const out = _v2.copy(sub.w).sub(ship.pos).normalize();
    if (out.lengthSq() < 0.01) out.copy(ship.fwd);
    const pos = _v.clone().addScaledVector(out, sub.r + 8);
    const look = pos.clone().addScaledVector(out, 100).addScaledVector(ship.fwd, 60);
    const s = this.spawn(type, { team: ship.team, pos, look, throttle: 1, ai: Object.assign({}, opts.ai || {}) });
    s.launchedBy = ship;
    this.fx.glowAt(pos, [3, 1.5, 0.5], 20, 0.3);
    this.emit('launched', s, ship);
    return s;
  }

  /* -------------------------------------------------------------- uppdatering */
  update(dt) {
    this.time += dt;
    this.lockWarn = Math.max(0, (this.lockWarn || 0) - dt);
    // eldtillstånd: bara ett fåtal fiender får skjuta på spelaren samtidigt (rättvisare strider)
    this._tokT = (this._tokT || 0) - dt;
    if (this._tokT <= 0) {
      this._tokT = 0.5;
      this.fireTokens.clear();
      // en kvot per mänsklig spelare (online: även fjärrspelarnas skepp, netPlayers)
      for (const P of this.netPlayers ? [this.player, ...this.netPlayers] : [this.player]) {
        if (!P || P.dead) continue;
        const att = this.teams[1].filter(s => !s.dead && s.ai && s.ai.target === P && !s.isLarge);
        att.sort((a, b) => a.pos.distanceToSquared(P.pos) - b.pos.distanceToSquared(P.pos));
        for (let i = 0; i < Math.min(att.length, this.diff.tokens || 2); i++) this.fireTokens.add(att[i]);
      }
    }
    for (const s of this.ships) if (s.ai && !s.dead) updateAI(s, this, dt);
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      s.update(dt);
      if (s.ai && s.ctrl.fire && !s.dead) s.fireLaser();
    }
    this.bolts.update(dt, this);
    this.missiles.update(dt, this);
    this.flares.update(dt);
    this._collide();
    if (this.asteroids) this.asteroids.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    // rensa döda små skepp i lag-listorna
    for (const t of this.teams) for (let i = t.length - 1; i >= 0; i--) if (t[i].removed) t.splice(i, 1);
  }

  _collide() {
    for (const s of this.ships) {
      if (s.dead || s.isLarge || s.static || s.removed) continue;
      const sr = s.radius * 0.65;
      for (const L of this.large) {
        if (L === s || L.removed) continue;
        const dx = s.pos.x - L.pos.x, dy = s.pos.y - L.pos.y, dz = s.pos.z - L.pos.z, rb = L.boundR + sr;
        if (dx * dx + dy * dy + dz * dz > rb * rb) continue;
        const wc = L.wColl;
        for (let k = 0; k < wc.length; k += 4) {
          _v.set(s.pos.x - wc[k], s.pos.y - wc[k + 1], s.pos.z - wc[k + 2]);
          const d = _v.length(), rr = wc[k + 3] + sr;
          if (d < rr && d > 0.0001) { _v.multiplyScalar(1 / d); this._bump(s, _v, rr - d, L); }
        }
      }
      if (this.asteroids) {
        const A = this.asteroids;
        A.query(s.pos.x, s.pos.y, s.pos.z, sr, i => {
          _v.set(s.pos.x - A.px[i], s.pos.y - A.py[i], s.pos.z - A.pz[i]);
          const d = _v.length(), rr = A.cr[i] + sr;
          if (d < rr && d > 0.0001) { _v.multiplyScalar(1 / d); this._bump(s, _v, rr - d, null); }
        });
      }
    }
  }
  _bump(s, n, depth, other) {
    s.pos.addScaledVector(n, depth + 0.1);
    const vn = s.vel.dot(n);
    if (vn < 0) {
      s.vel.addScaledVector(n, -vn * 1.5);
      s.speed *= 0.55;
      const impact = -vn;
      if (impact > 12 && (!s.lastBump || this.time - s.lastBump > 0.25)) {
        s.lastBump = this.time;
        _v2.copy(s.pos).addScaledVector(n, -s.radius * 0.6);
        s.damage((impact - 8) * (s.isPlayer ? 0.45 : 0.6), { point: _v2, kind: 'ram', dir: n.clone().negate() });
        this.fx.spark(_v2, n, 14, 60, [3, 2.2, 1.2], 0.8);
        this.sfxAt('scrape', s.pos, Math.min(1.5, impact / 40));
        if (s.isPlayer) { this.shakeAmt = Math.min(1.5, this.shakeAmt + impact / 80); this.emit('bump', s, impact); }
      }
    }
    // vrid nosen bort från väggen
    if (s.isPlayer || !s.ai) return;
    s.angVel.multiplyScalar(0.5);
  }

  /* -------------------------------------------------------------- skada */
  onBoltHit(ship, sub, point, dir, dmg, sm, hm, owner, color) {
    const wasShield = ship.shield > 0;
    ship.damage(dmg, { sm, hm, from: owner, point, dir, sub, kind: 'laser' });
    if (owner && owner.isPlayer && ship.team !== 0) { this.stats.hits++; this.emit('playerHit', ship, sub, wasShield); }
    if (ship.isPlayer) {
      this.stats.damageTaken += dmg;
      this.shakeAmt = Math.min(1.2, this.shakeAmt + 0.18);
      this.sfx.play(wasShield ? 'shieldHit' : 'hullHit');
    } else if (!owner || !owner.isPlayer) {
      if (Math.random() < 0.3) this.sfxAt('impact', point, 0.5);
    }
  }
  onBoltRock(p, i, r, g, b, owner) {
    this.fx.spark(p, this.asteroids.normalAt(i, p.x, p.y, p.z, _v2), 5, 40, [r * 0.8 + 1, g * 0.6 + 0.6, b * 0.4 + 0.3], 0.7);
    this.fx.smokePuff(p, null, 1.5, 0.8, 0.3, 0.4);
  }
  /** Explosion med skada i radie. direct får full skada. */
  blast(pos, radius, dmg, team, owner, direct, sub, capMult = 1, def = null) {
    // direktträff på en asteroid eller en missil/torped
    const directRock = direct && direct.isAsteroid ? direct.idx : -1;
    if (direct && direct.isProxy) {
      if (dmg > 0 && direct.isAsteroid) this.damageAsteroid(direct.idx, dmg * capMult, owner, pos);
      else if (dmg > 0 && direct.isMissile && direct.alive && direct.team !== team) {
        this.missiles.shootDown(direct, this);
        this.emit('missileDown', direct);
        if (owner && owner.isPlayer) { this.game.hud.hit(true); this.sfx.play('hitConfirm'); this.game.hud.floater(pos, direct.kind === 'torpedo' ? 'Torped nedskjuten' : 'Missil nedskjuten', '#9ad8ff'); }
      }
      direct = null;
    }
    if (dmg > 0) {
      this.missiles.blastKill(pos, radius, team, this);
      if (this.asteroids) {
        const A = this.asteroids, hits = [];
        A.query(pos.x, pos.y, pos.z, radius, i => {
          if (i === directRock) return;
          const d = Math.hypot(A.px[i] - pos.x, A.py[i] - pos.y, A.pz[i] - pos.z) - A.cr[i];
          if (d < radius) hits.push(i, 1 - Math.max(0, d) / radius);
        });
        for (let k = 0; k < hits.length; k += 2) this.damageAsteroid(hits[k], dmg * 0.5 * hits[k + 1] * capMult, owner, null, true);
      }
    }
    if (dmg > 0 && direct && !direct.dead && direct.team !== team) {
      direct.damage(dmg, { from: owner, point: pos, sub, kind: 'blast', capMult });
      if (owner && owner.isPlayer) { this.stats.hits++; this.emit('playerHit', direct, sub, false); }
      if (direct.isPlayer) this.sfx.play('hullHit');
    }
    if (dmg > 0) for (const s of this.ships) {
      if (s === direct || s.dead || s.team === team) continue;
      const d = s.pos.distanceTo(pos) - (s.isLarge ? s.hitR : s.radius);
      if (d < radius) {
        const f = 1 - Math.max(0, d) / radius;
        s.damage(dmg * 0.5 * f, { from: owner, point: pos, kind: 'blast', capMult });
      }
    }
    if (this.player && !this.player.dead) {
      const d = this.player.pos.distanceTo(pos);
      if (d < radius * 4) this.shakeAmt = Math.min(1.6, this.shakeAmt + (1 - d / (radius * 4)) * 0.8);
    }
  }
  /** Skada på asteroid i (missiler/explosioner). Små och medelstora asteroider spricker. */
  damageAsteroid(i, amount, owner, point, splash = false) {
    const A = this.asteroids;
    if (!A || A.dead[i] || amount <= 0) return;
    const p = point || _v.set(A.px[i], A.py[i], A.pz[i]);
    if (A.hp[i] >= 1e9) {
      if (!splash && owner && owner.isPlayer && (this.time - (this._bigMsgT || -9)) > 4) { this._bigMsgT = this.time; this.game.hud.flashMsg('För stor för att spräckas – välj ett mindre block', 1.6); }
      return;
    }
    A.hp[i] -= amount;
    if (!splash) this.fx.spark(p, null, 10, 50, [2.4, 1.8, 1.2], 0.7);
    if (A.hp[i] <= 0) this.breakAsteroid(i, Math.floor(Math.random() * 900000), owner);
    else if (!splash && owner && owner.isPlayer) this.sfx.play('hitConfirm');
  }
  /** Spräcker asteroid i (deterministiskt via seed). Online: värden skickar händelsen till alla. */
  breakAsteroid(i, seed, owner = null) {
    const A = this.asteroids; if (!A) return;
    const res = A.fracture(i, seed);
    if (!res) return;
    const { pos, R } = res;
    const k = Math.min(1, R / 40);
    this.fx.explode(pos, 3 + R * 0.35, null, { debris: 0, color: [1.4, 1.0, 0.7] });
    this.fx.debrisBurst(pos, _v2.set(0, 0, 0), Math.round(5 + k * 12), Math.max(1.2, R * 0.12), 20 + R * 0.8);
    for (let n = 0; n < 4 + k * 6; n++) { _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(R).add(pos); this.fx.smokePuff(_v, null, R * 0.5, 2.5, 0.5, 0.45); }
    this.sfxAt(R > 25 ? 'boom' : 'explode', pos, 0.9 + k * 0.4);
    this.shake(pos, 0.4 + k * 0.6, 260 + R * 4);
    if (owner && owner.isPlayer) { this.game.hud.hit(true); this.game.hud.floater(pos, res.frags.length ? 'Asteroid spräckt' : 'Stenblock krossat', '#d8c8a8'); }
    if (this.playerTarget && this.playerTarget.isAsteroid && this.playerTarget.dead) this.playerTarget = null;
    this.emit('rockBreak', i, seed);
  }
  /** Segmenttest mot fientliga skepp (för missiler). */
  segmentHitShips(p0, p1, team, pad = 0) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, L2 = dx * dx + dy * dy + dz * dz;
    let best = null, bt = 2;
    for (const s of this.ships) {
      if (s.dead || s.team === team || s.noCollide) continue;
      if (s.pos.distanceTo(p0) > s.boundR + Math.sqrt(L2) + pad) continue;
      if (s.isLarge) {
        for (const sub of s.subs) {
          if (!sub.alive) continue;
          const t = segSphere(p0.x, p0.y, p0.z, dx, dy, dz, L2, sub.w.x, sub.w.y, sub.w.z, sub.r + pad);
          if (t >= 0 && t < bt) { bt = t; best = { ship: s, sub }; }
        }
        const wc = s.wColl;
        for (let k = 0; k < wc.length; k += 4) {
          const t = segSphere(p0.x, p0.y, p0.z, dx, dy, dz, L2, wc[k], wc[k + 1], wc[k + 2], wc[k + 3] + pad);
          if (t >= 0 && t < bt - 0.001) { bt = t; best = { ship: s, sub: null }; }
        }
      } else {
        const t = segSphere(p0.x, p0.y, p0.z, dx, dy, dz, L2, s.pos.x, s.pos.y, s.pos.z, s.hitR + pad);
        if (t >= 0 && t < bt) { bt = t; best = { ship: s, sub: null }; }
      }
    }
    if (best) best.point = new THREE.Vector3(p0.x + dx * bt, p0.y + dy * bt, p0.z + dz * bt);
    return best;
  }
  onShipDestroyed(s, from) {
    if (!s.isLarge) {
      const R = s.kind === 'mine' ? 5 : s.radius * 1.15;
      this.fx.explode(s.pos, R, s.vel, { debris: s.kind === 'mine' ? 3 : 10 });
      this.sfxAt(s.radius > 7 ? 'boom' : 'explode', s.pos, 1.2);
      if (s.kind === 'mine') { this.blast(s.pos, 100, 110, s.team, s, null, null, 1); this.shake(s.pos, 1.2, 400); }
      this.removeShip(s);
    } else {
      this.sfxAt('boom', s.pos, 1.5);
    }
    if (from && from.isPlayer && s.team !== 0) { this.stats.kills++; this.stats.killPoints += s.points; }
    if (this.playerTarget === s) this.playerTarget = null;
    this.emit('kill', s, from);
    if (s.isPlayer) this.emit('playerDead', s, from);
  }
  /** Mål för ett kanontorn. */
  turretTarget(ship, sub) {
    const heavy = sub.kind === 'heavy';
    const range = heavy ? 1700 : 1150;
    let best = null, bs = Infinity;
    // högst några torn per skepp får sikta på spelaren samtidigt
    let onPlayer = 0;
    if (ship.team === 1 && this.player) for (const t of ship.subs) if (t !== sub && t.alive && t.target === this.player) onPlayer++;
    const playerOk = onPlayer < (this.diff.tokens || 2) + 1;
    for (const e of this.teams[1 - ship.team]) {
      if (e.dead || !e.targetable || e.aiIgnore || e.kind === 'object' || e.kind === 'mine') continue;
      if (e.isPlayer && !playerOk) continue;
      const d = e.pos.distanceTo(sub.w);
      if (d > range + (e.isLarge ? e.boundR : 0)) continue;
      let sc = d;
      if (heavy) sc *= e.isLarge ? 0.4 : 1.3; else sc *= e.isLarge ? 2.2 : 1;
      if (e.isPlayer) sc *= 0.85 / this.diff.aggro;
      if (e.ai && e.ai.target === ship) sc *= 0.7;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }
  fireMissile(s, def, target, sub) {
    _v.copy(s.fwd).multiplyScalar(s.radius * 0.6).add(s.pos);
    _v.y -= 0;
    const m = this.missiles.fire({ pos: _v, dir: s.fwd, baseVel: s.vel, def, team: s.team, owner: s, target, sub, dmgMult: 1 });
    this.sfxAt('missile', s.pos, 0.9);
    if (target && target.isPlayer) this.emit('missileIncoming', m);
    return m;
  }
  launchFlares(s) {
    const fl = this.flares.launch(s, 3);
    this.missiles.decoy(s, fl[0], s.isPlayer ? 0.85 : 0.5);
    for (const f of fl.slice(1)) this.missiles.decoy(s, f, 0.3);
    this.sfxAt('flare', s.pos, 1);
  }

  /* -------------------------------------------------------------- hjälpare */
  enemiesOf(team) { return this.teams[1 - team].filter(s => !s.dead); }
  count(fn) { let n = 0; for (const s of this.ships) if (!s.dead && fn(s)) n++; return n; }
  shake(pos, amt, radius) {
    if (!this.player) return;
    const d = this.player.pos.distanceTo(pos);
    if (d < radius) this.shakeAmt = Math.min(2, this.shakeAmt + amt * (1 - d / radius));
  }
  /** Ljud med panorering och avståndsdämpning relativt kameran. */
  sfxAt(name, pos, vol = 1) {
    if (this.quiet) return;
    const cam = this.game.camera;
    const d = cam.position.distanceTo(pos);
    const v = vol * Math.max(0, 1 - d / 2600) * (d < 60 ? 1 : Math.min(1, 220 / d + 0.15));
    if (v < 0.03) return;
    _v.copy(pos).applyMatrix4(cam.matrixWorldInverse);
    const pan = Math.max(-1, Math.min(1, _v.x / (Math.abs(_v.z) + 40)));
    this.sfx.play(name, { vol: v, pan });
  }
  sfxShot(s, w, at) {
    if (this.quiet) return;
    if (s.isPlayer) { this.sfx.play('laser_' + (w.sound || 'pulse')); return; }
    this.sfxAt('laser_' + (w.sound || 'enemy'), at || s.pos, s.isLarge ? 0.5 : 0.45);
  }
  /** Ring/markör i världen (t.ex. hinderbana). */
  makeRing(pos, look, R = 18, gold = true) {
    const g = new THREE.TorusGeometry(R, 0.9, 8, 40);
    const m = new THREE.Mesh(g, mat(gold ? 'holoGold' : 'holo'));
    m.position.copy(pos); m.userData.ownGeo = true;
    if (look) { _m.lookAt(pos, look, UP); m.quaternion.setFromRotationMatrix(_m); }
    return this.addExtra(m);
  }
}
