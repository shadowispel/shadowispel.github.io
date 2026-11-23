/* Rävens äventyr – Ylva: rörelse, kollision, tillstånd och procedurell animation. */
import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { buildFox } from './models.js';

const V3 = THREE.Vector3;
const RAD = 0.36, CAP_LO = 0.36, CAP_HI = 1.02;
const GRAV = 38, TERMINAL = 32;
const RUN = 10.5, ACC_G = 62, DEC_G = 46, ACC_A = 24, ACC_ICE = 9, DEC_ICE = 2.4;
const JUMP_V = 13.2, DJUMP_V = 12.2, COYOTE = 0.12, BUFFER = 0.14;
const _v = new V3(), _v2 = new V3(), _down = new V3(0, -1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

export class Player {
  constructor(G) {
    this.G = G;
    this.rig = buildFox();
    this.obj = this.rig.root;
    this.pos = new V3(); this.vel = new V3(); this.face = 0; this._mv = new V3();
    this.cap = new Capsule(new V3(), new V3(), RAD);
    this.info = { groundNormal: new V3(0, 1, 0), wallNormal: new V3(), steepNormal: new V3() };
    this.maxHp = 5;
    this.reset(new V3(), 0);
    this.anim = { phase: 0, t: 0, sq: 1, sqV: 0, blink: 0, pose: {} };
  }
  reset(p, face) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.face = face || 0;
    this.state = 'air'; this.onGround = false; this.wasGround = false;
    this.groundDyn = null; this.groundTag = 'ground'; this.groundNormal = new V3(0, 1, 0);
    this.coyote = 0; this.jumpBuf = 0; this.canDouble = false; this.airSpin = false; this.airDash = false;
    this.spinT = 0; this.dashT = 0; this.dashCd = 0; this.flipT = 0; this.poundT = 0; this.poundPhase = 0; this.poundRecover = 0;
    this.hurtT = 0; this.invuln = 0; this.deadT = 0; this.hp = this.maxHp; this.crouch = false;
    this.wallN = new V3(); this.climbT = 0; this.wallPush = 0; this.jumpCut = false; this.fallStart = p.y;
    this.swimming = false; this.slideT = 0; this.externalV = new V3(); this.bounceLock = 0; this.platformV = new V3();
    this.waterLevel = -Infinity; this.locked = false; this.airTime = 0; this.lastSafe = p.clone(); this.lastSafeT = 0;
    this.victory = 0;
    this._syncCap();
  }
  _syncCap() { this.cap.start.set(this.pos.x, this.pos.y + CAP_LO, this.pos.z); this.cap.end.set(this.pos.x, this.pos.y + CAP_HI, this.pos.z); }
  _fromCap() { this.pos.set(this.cap.start.x, this.cap.start.y - CAP_LO, this.cap.start.z); }
  get center() { return _v2.set(this.pos.x, this.pos.y + 0.7, this.pos.z); }
  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }

  /** Aktiv attack? Returnerar 'spin' | 'slide' | 'pound' | 'dash' | null om punkt p (radie r) träffas. */
  attackHit(p, r = 0.5) {
    const dx = p.x - this.pos.x, dy = p.y - (this.pos.y + 0.6), dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (this.spinT > 0 && d < 1.55 + r && Math.abs(dy) < 1.4 + r) return 'spin';
    if (this.state === 'slide' && d < 1.0 + r && Math.abs(dy) < 1 + r) return 'slide';
    if (this.state === 'pound' && this.poundPhase === 2 && d < 0.9 + r && dy < 0.6 && dy > -1.6 - r) return 'pound';
    if (this.dashT > 0 && d < 1.0 + r && Math.abs(dy) < 1 + r) return 'dash';
    return null;
  }
  /** Fallande på något? (för att trampa på fiender) */
  stompCheck(p, r, top) {
    if (this.vel.y > 1 || this.state === 'climb' || this.state === 'dead') return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    if (dx * dx + dz * dz > (r + 0.35) ** 2) return false;
    return this.pos.y > top - 0.55 && this.pos.y < top + 0.6;
  }
  /** spring = studsfjäder: alltid full höjd (man ska inte behöva veta att man håller hopp). */
  bounce(v = 11, keepPound = false, spring = false) {
    this.vel.y = this.G.inp.jumpHeld || spring ? v * 1.25 : v;
    this.springRise = spring;
    this.state = 'air'; this.onGround = false; this.coyote = 0; this.canDouble = true; this.airSpin = false; this.airDash = false;
    this.jumpCut = false; this.flipT = 0; this.bounceLock = 0.12; this.groundDyn = null;
    if (!keepPound) { this.poundPhase = 0; }
    this.anim.sq = 1.3;
  }
  damage(src, amount = 1) {
    if (this.invuln > 0 || this.state === 'dead' || this.locked || this.victory > 0) return false;
    this.hp -= amount;
    this.G.audio.play('hurt');
    this.G.shake(0.35);
    this.G.fx.burst(this.pos.x, this.pos.y + 0.8, this.pos.z, 10, { speed: 4, color: [0xffffff, 0xffe066], size: 0.35, life: 0.5 });
    if (this.hp <= 0) { this.die(); return true; }
    this.invuln = 1.7; this.hurtT = 0.45;
    _v.set(this.pos.x - (src ? src.x : this.pos.x - Math.sin(this.face)), 0, this.pos.z - (src ? src.z : this.pos.z - Math.cos(this.face)));
    if (_v.lengthSq() < 1e-4) _v.set(-Math.sin(this.face), 0, -Math.cos(this.face));
    _v.normalize();
    this.vel.set(_v.x * 4.5, 7, _v.z * 4.5); // måttlig knuff – man ska inte slungas av smala avsatser
    this.state = this.swimming ? 'swim' : 'hurt'; this.onGround = false; this.spinT = 0; this.dashT = 0; this.poundPhase = 0;
    this.G.onHp && this.G.onHp();
    return true;
  }
  heal(n = 1) { this.hp = Math.min(this.maxHp, this.hp + n); this.G.onHp && this.G.onHp(); }
  die() {
    this.hp = 0; this.state = 'dead'; this.deadT = 0; this.vel.set(0, 9, 0);
    this.G.audio.play('lose');
    this.G.onHp && this.G.onHp();
    this.G.onDeath && this.G.onDeath();
  }

  update(dt, inp) {
    const G = this.G;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.state === 'dead') {
      this.deadT += dt; this.vel.y -= 25 * dt; this.pos.addScaledVector(this.vel, dt);
      return;
    }
    if (this.victory > 0) { this.victory -= dt; this.vel.set(0, 0, 0); this.spinT = 0; return; }
    // --- plattformar bär spelaren
    if (this.groundDyn && (this.onGround || this.state === 'climb')) {
      _v.copy(this.pos);
      this.groundDyn.carry(this.pos);
      this.platformV.copy(this.pos).sub(_v).divideScalar(dt);
      this.face += this.groundDyn.deltaYaw();
    } else if (this.state === 'climb' && this.wallDyn) {
      _v.copy(this.pos); this.wallDyn.carry(this.pos); this.platformV.copy(this.pos).sub(_v).divideScalar(dt);
    }

    this.coyote -= dt; this.jumpBuf -= dt; this.dashCd -= dt; this.bounceLock -= dt;
    if (inp.jump) this.jumpBuf = BUFFER;
    if (this.spinT > 0) this.spinT -= dt;
    if (this.flipT > 0) this.flipT -= dt;
    if (this.dashT > 0) this.dashT -= dt;
    if (this.poundRecover > 0) this.poundRecover -= dt;

    // --- vatten
    this.waterLevel = G.world ? G.world.waterAt(this.pos.x, this.pos.z) : -Infinity;
    const wasSwim = this.swimming;
    this.swimming = this.pos.y + 0.6 < this.waterLevel && this.state !== 'climb' && !(wasSwim === false && this.state === 'air' && this.vel.y > 1.5 && this.pos.y + 1.2 > this.waterLevel);
    if (this.swimming && !wasSwim) {
      G.audio.play('splash'); G.fx.burst(this.pos.x, this.waterLevel, this.pos.z, 16, { speed: 4, up: true, g: 12, color: 0xd8f4ff, size: 0.35, life: 0.7 });
      this.state = 'swim'; this.poundPhase = 0; this.spinT = 0; this.dashT = 0; this.vel.y *= 0.3;
    }
    if (!this.swimming && this.state === 'swim') this.state = 'air';

    const st = this.state;
    const mv = this._mv.set(inp.mx, 0, inp.mz); const mag = Math.min(1, mv.length());
    if (mag > 0.01) mv.divideScalar(Math.max(mag, 1e-4)); // enhetsvektor
    const ice = this.onGround && this.groundTag === 'ice';

    if (st === 'climb') this._climb(dt, inp, mv, mag);
    else if (st === 'swim') this._swim(dt, inp, mv, mag);
    else if (st === 'pound') this._pound(dt, inp);
    else if (st === 'hurt') {
      this.hurtT -= dt; this.vel.y -= GRAV * dt;
      if (this.hurtT <= 0) this.state = this.onGround ? 'ground' : 'air';
    } else this._move(dt, inp, mv, mag, ice);

    // vind och yttre krafter
    if (G.world && G.world.windAt && this.state !== 'climb') {
      const w = G.world.windAt(this.pos);
      if (w) {
        // uppvindar håller kvar Ylva i pelaren (annars flyger man rakt igenom den smala virveln)
        if (w.y > 20) { const k = Math.exp(-3 * dt); this.vel.x *= k; this.vel.z *= k; }
        this.vel.x += w.x * dt; this.vel.z += w.z * dt; this.vel.y += w.y * dt; if (w.y > 0 && this.vel.y > 14) this.vel.y = 14;
      }
    }
    if (this.vel.y < -TERMINAL) this.vel.y = -TERMINAL;

    // --- integrera med delsteg
    const wasGround = this.onGround;
    const prevVy = this.vel.y;
    const travel = this.vel.length() * dt;
    const n = Math.min(8, Math.max(1, Math.ceil(travel / 0.18)));
    const sdt = dt / n;
    let grounded = false, gNormal = null, gDyn = null, gTag = null, hitWall = false, hitCeil = false, hurt = false, climbWall = null;
    for (let i = 0; i < n; i++) {
      const ox = this.pos.x, oy = this.pos.y, oz = this.pos.z;
      this.pos.addScaledVector(this.vel, sdt);
      this._syncCap();
      let info = G.col.collide(this.cap, this.info);
      this._fromCap();
      // trappsteg: prova att kliva upp på låga kanter
      if (info.wall && info.wallNormal.y < 0.3 && (wasGround || grounded) && this.vel.y <= 0.5 && (this.state === 'ground' || this.state === 'slide') && info.wallTag !== 'climb') {
        const rx = this.pos.x, ry = this.pos.y, rz = this.pos.z;
        const wantX = this.vel.x * sdt, wantZ = this.vel.z * sdt;
        const wl = Math.hypot(wantX, wantZ) || 1;
        this.pos.set(ox + wantX + wantX / wl * 0.22, oy + 0.68, oz + wantZ + wantZ / wl * 0.22); this._syncCap();
        G.col.collide(this.cap, this.info); this._fromCap();
        const prog = ((this.pos.x - ox) * wantX + (this.pos.z - oz) * wantZ) / Math.max(1e-6, wantX * wantX + wantZ * wantZ);
        let ok = false;
        if (prog > 0.6) {
          // hitta stegets ovansida med en stråle (att trycka ned kapseln missar toppytor högre än kapselns radie)
          const sh = G.col.raycast(_v.set(this.pos.x + wantX / wl * 0.3, this.pos.y + 0.3, this.pos.z + wantZ / wl * 0.3), _down, 1.2);
          if (sh && sh.normal.y > 0.55 && sh.point.y > oy + 0.04 && sh.point.y < oy + 0.72) {
            this.pos.y = sh.point.y + 0.01; this._syncCap();
            info = G.col.collide(this.cap, this.info); this._fromCap();
            ok = this.pos.y > oy + 0.04 && this.pos.y < oy + 0.8 && !info.ceiling;
          }
          if (ok) info.ground = true;
        }
        if (!ok) { this.pos.set(rx, ry, rz); this._syncCap(); info = G.col.collide(this.cap, this.info); this._fromCap(); }
      }
      if (info.ground && this.vel.y <= 4 + (this.bounceLock > 0 ? -10 : 0)) {
        grounded = true; gNormal = info.groundNormal; gDyn = info.groundDyn; gTag = info.groundTag;
        if (this.vel.y < 0) this.vel.y = 0;
      } else if (info.ground && this.vel.y > 4) {
        // på väg upp genom kant – ingen landning
      }
      if (info.ceiling && this.vel.y > 0) { this.vel.y = 0; hitCeil = true; }
      if (info.wall) {
        hitWall = true;
        const wn = info.wallNormal;
        const into = this.vel.x * wn.x + this.vel.z * wn.z;
        if (into < 0) { this.vel.x -= wn.x * into; this.vel.z -= wn.z * into; }
        if (info.wallTag === 'climb') climbWall = { n: wn.clone(), dyn: info.wallDyn };
        if (info.steep && !info.ground && this.vel.y < 0) { /* glid nerför brant */ }
      }
      if (info.hurt) hurt = true;
    }
    void hitCeil;
    // markfästning nerför backar
    if (!grounded && wasGround && this.vel.y <= 0.01 && this.state !== 'climb' && this.state !== 'swim' && this.bounceLock <= 0) {
      // Stråle i stället för att trycka ned kapseln 0,45 m: en djupt nedtryckt kapsel får sidonormaler
      // från terrängens triangelkanter och fastnar (märktes som osynliga kanter i nedförsbackar).
      const saveX = this.pos.x, saveY = this.pos.y, saveZ = this.pos.z;
      const h = G.col.raycast(_v.set(this.pos.x, this.pos.y + 0.3, this.pos.z), _down, 0.78);
      let ok = false;
      if (h && h.normal.y > 0.55) {
        this.pos.y = h.point.y + 0.01; this._syncCap();
        const info = G.col.collide(this.cap, this.info);
        this._fromCap();
        if (info.ground && Math.hypot(this.pos.x - saveX, this.pos.z - saveZ) < 0.2) { ok = true; grounded = true; gNormal = info.groundNormal; gDyn = info.groundDyn; gTag = info.groundTag; }
      }
      if (!ok) { this.pos.set(saveX, saveY, saveZ); this._syncCap(); }
    }

    this.wasGround = wasGround;
    this.onGround = grounded;
    if (grounded) {
      this.groundNormal.copy(gNormal); this.groundDyn = gDyn; this.groundTag = gTag || 'ground';
      this.coyote = COYOTE; this.canDouble = true; this.airSpin = false; this.airDash = false; this.airTime = 0;
      if (!wasGround) this._land(prevVy);
      if (this.state === 'air' || this.state === 'longjump') this.state = this.crouch && this.speedH > 6.5 ? 'slide' : 'ground';
      if (!this.groundDyn && this.groundTag !== 'hurt' && this.groundNormal.y > 0.8) {
        this.lastSafeT += dt;
        if (this.lastSafeT > 0.3) { this.lastSafe.copy(this.pos); this.lastSafeT = 0; }
      }
    } else {
      this.airTime += dt;
      if (wasGround && this.groundDyn) { this.vel.x += this.platformV.x * 0.9; this.vel.z += this.platformV.z * 0.9; if (this.platformV.y > 0) this.vel.y += this.platformV.y * 0.6; }
      if (this.state === 'ground' || this.state === 'slide') { this.state = 'air'; this.fallStart = this.pos.y; }
      this.groundDyn = null;
    }
    // klätterväggar
    if (climbWall && this.state !== 'climb' && this.state !== 'swim' && this.state !== 'hurt' && this.state !== 'dead') {
      const into = -(mv.x * climbWall.n.x + mv.z * climbWall.n.z) * mag;
      if (!this.onGround && this.jumpBuf > 0 && this.airTime > 0.05) { this._wallJump(climbWall.n); }
      else if (into > 0.35 && (!this.onGround || (this.wallPush += dt) > 0.12)) this._startClimb(climbWall);
    } else this.wallPush = 0;
    if (hurt) this.damage(null, 1);

    // fall utanför
    if (G.world && this.pos.y < G.world.killY) G.onFallOut && G.onFallOut();
    if (!isFinite(this.pos.x) || !isFinite(this.pos.y) || !isFinite(this.pos.z)) { this.pos.copy(this.lastSafe); this.vel.set(0, 0, 0); }
  }

  _land(vy) {
    const G = this.G;
    if (vy < -5) {
      G.fx.dust(this.pos.x, this.pos.y, this.pos.z, Math.min(14, 4 + (-vy | 0) / 2));
      G.audio.play('land', { vol: Math.min(1, -vy / 20) });
      this.anim.sq = clamp(1 + vy * 0.012, 0.65, 0.95);
    }
    this.flipT = 0;
    if (this.state === 'pound') this._poundImpact();
  }
  _jump(v, kind = 'jump') {
    this.vel.y = v; this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.jumpCut = false; this.springRise = false;
    this.state = 'air'; this.fallStart = this.pos.y;
    if (this.groundDyn) { this.vel.x += this.platformV.x; this.vel.z += this.platformV.z; if (this.platformV.y > 0) this.vel.y += this.platformV.y; }
    this.groundDyn = null; this.bounceLock = 0.1;
    this.anim.sq = 1.22;
    this.G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 5);
    this.G.audio.play('jump', { pitch: kind === 'double' ? 1.3 : kind === 'long' ? 0.85 : kind === 'back' ? 1.15 : 1 });
  }

  _move(dt, inp, mv, mag, ice) {
    const G = this.G;
    const st = this.state;
    const ground = this.onGround;
    this.crouch = inp.crouchHeld && (st === 'ground' || st === 'slide');
    // --- horisontell
    let target = (this.crouch ? 3.2 : RUN) * mag;
    const vx = this.vel.x, vz = this.vel.z;
    const sp = Math.hypot(vx, vz);
    if (st === 'slide') {
      const k = Math.max(0, sp - (ice ? 2 : 9) * dt);
      if (sp > 0.01) { this.vel.x *= k / sp; this.vel.z *= k / sp; }
      // lätt styrning
      if (mag > 0.1) { const a = Math.atan2(this.vel.x, this.vel.z); const na = a + clamp(angDiff(a, Math.atan2(mv.x, mv.z)), -1.8 * dt, 1.8 * dt); this.vel.x = Math.sin(na) * k; this.vel.z = Math.cos(na) * k; }
      this.face = Math.atan2(this.vel.x, this.vel.z);
      this.slideT += dt;
      if (k < 3 || !ground) this.state = ground ? 'ground' : 'air';
      if (ground && Math.random() < 0.5) G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 1);
    } else if (this.dashT > 0) {
      // under dash: håll riktning
    } else {
      const accel = ground ? (ice ? ACC_ICE : ACC_G) : (st === 'longjump' ? 7 : ACC_A);
      const decel = ground ? (ice ? DEC_ICE : DEC_G) : (st === 'longjump' ? 1.5 : 6);
      const tx = mv.x * target, tz = mv.z * target;
      if (sp > RUN + 0.5 && mag > 0.1) {
        // överfart (efter dash/långhopp): bromsa mjukt mot max men låt styra
        const ns = Math.max(RUN, sp - (ground ? 14 : 3) * dt);
        const a = Math.atan2(vx, vz); const na = a + clamp(angDiff(a, Math.atan2(mv.x, mv.z)), -(ground ? 6 : 2.5) * dt, (ground ? 6 : 2.5) * dt);
        this.vel.x = Math.sin(na) * ns; this.vel.z = Math.cos(na) * ns;
      } else {
        const dx = tx - vx, dz = tz - vz; const dl = Math.hypot(dx, dz);
        const rate = (mag > 0.05 ? accel : decel) * dt * (ground && mag > 0.05 && (vx * tx + vz * tz) < 0 ? 1.6 : 1);
        if (dl <= rate) { this.vel.x = tx; this.vel.z = tz; } else { this.vel.x += dx / dl * rate; this.vel.z += dz / dl * rate; }
      }
      // ansikte
      if (mag > 0.08) {
        const want = Math.atan2(mv.x, mv.z);
        const turn = ground ? (ice ? 6 : 16) : (st === 'longjump' ? 1.5 : 8);
        this.face += clamp(angDiff(this.face, want), -turn * dt, turn * dt);
      }
      // skrens-damm vid tvär vändning
      if (ground && sp > 6 && mag > 0.5 && (vx * mv.x + vz * mv.z) / sp < -0.5 && Math.random() < 0.6) G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 1);
    }
    // --- hopp
    const canGroundJump = ground || this.coyote > 0;
    if (this.jumpBuf > 0 && canGroundJump && st !== 'longjump') {
      if ((this.crouch || st === 'slide' || inp.crouchHeld) && sp > 5) {
        // långhopp
        const s = Math.max(sp, 9) + 7;
        this.vel.x = Math.sin(this.face) * s; this.vel.z = Math.cos(this.face) * s;
        this._jump(10.5, 'long'); this.state = 'longjump';
        G.audio.play('whoosh', { pitch: 1.2 });
      } else if (inp.crouchHeld && sp <= 5) {
        // bakåtvolt
        this.vel.x = -Math.sin(this.face) * 3.5; this.vel.z = -Math.cos(this.face) * 3.5;
        this._jump(17.5, 'back'); this.flipT = -0.6; this.canDouble = false;
      } else if (this.poundRecover > 0) {
        this._jump(17, 'back'); this.flipT = 0.5; // markstöts-superhopp
      } else {
        this._jump(JUMP_V + Math.min(sp, RUN) * 0.08);
      }
      return;
    }
    if (this.jumpBuf > 0 && !ground && this.canDouble && st === 'air' && this.airTime > 0.06) {
      this.canDouble = false; this._jump(DJUMP_V, 'double'); this.flipT = 0.42;
      G.fx.burst(this.pos.x, this.pos.y + 0.2, this.pos.z, 8, { speed: 2.5, color: 0xffffff, size: 0.4, life: 0.4, flat: true });
      return;
    }
    // --- variabel hopphöjd + gravitation
    if (!ground) {
      let gm = 1;
      if (this.vel.y > 0) { if (this.springRise && !this.jumpCut) gm = 0.7; else if (inp.jumpHeld && !this.jumpCut) gm = 0.55; else if (!this.jumpCut) { this.jumpCut = true; if (st === 'air' && this.flipT >= 0) this.vel.y *= 0.6; } }
      else gm = 1.22;
      if (st === 'longjump') gm = this.vel.y > 0 ? 0.62 : 0.75; // långt och flackt – längre än ett vanligt hopp
      if (this.spinT > 0 && this.vel.y < 0) gm = 0.35;
      if (this.dashT > 0) gm = 0.15;
      this.vel.y -= GRAV * gm * dt;
    } else {
      this.vel.y = Math.min(this.vel.y, 0) - 4 * dt;
      // brant mark: glid
      if (this.groundNormal.y < 0.7) { this.vel.x += this.groundNormal.x * 20 * dt; this.vel.z += this.groundNormal.z * 20 * dt; }
    }
    // --- huka / markstöt / glid
    if (inp.crouch) {
      if (!ground && st !== 'longjump' && this.airTime > 0.05) { this._startPound(); return; }
      if (ground && sp > 6.5 && st !== 'slide') { this.state = 'slide'; this.slideT = 0; const k = sp + 2.5; this.vel.x = this.vel.x / sp * k; this.vel.z = this.vel.z / sp * k; G.audio.play('whoosh', { pitch: 0.8, vol: 0.6 }); }
    }
    // --- svanssnurr
    if (inp.attack && this.spinT <= 0 && st !== 'slide') {
      if (ground || !this.airSpin) {
        this.spinT = 0.42;
        if (!ground) { this.airSpin = true; if (this.vel.y < 5) this.vel.y = 5.5; }
        G.audio.play('whoosh', { pitch: 1.4, vol: 0.8 });
        G.fx.burst(this.pos.x, this.pos.y + 0.6, this.pos.z, 10, { speed: 5, flat: true, color: 0xfff1c8, size: 0.3, life: 0.3, drag: 6 });
        G.onSpin && G.onSpin();
      }
    }
    // --- rusning
    if (inp.dash && this.dashCd <= 0 && st !== 'slide' && (ground || !this.airDash)) {
      const a = mag > 0.1 ? Math.atan2(mv.x, mv.z) : this.face;
      this.face = a;
      const s = ground ? 17 : 15;
      this.vel.x = Math.sin(a) * s; this.vel.z = Math.cos(a) * s;
      if (!ground) { this.airDash = true; this.vel.y = Math.max(this.vel.y, 3); }
      this.dashT = 0.2; this.dashCd = 0.55;
      if (st === 'longjump') this.state = 'air';
      G.audio.play('whoosh', { pitch: 1.7 });
      G.fx.burst(this.pos.x, this.pos.y + 0.6, this.pos.z, 8, { speed: 2, color: 0xffffff, size: 0.45, life: 0.35 });
    }
  }

  _startPound() {
    this.state = 'pound'; this.poundPhase = 1; this.poundT = 0; this.vel.set(0, 0, 0); this.spinT = 0; this.dashT = 0;
    this.G.audio.play('whoosh', { pitch: 0.7 });
  }
  _pound(dt, inp) {
    this.poundT += dt;
    if (this.poundPhase === 1) {
      this.vel.set(0, 0.5, 0);
      if (this.poundT > 0.24) { this.poundPhase = 2; this.vel.y = -30; }
    } else {
      this.vel.x = 0; this.vel.z = 0; this.vel.y = -30;
      if (this.onGround) this._poundImpact();
    }
    void inp;
  }
  _poundImpact() {
    const G = this.G;
    this.poundPhase = 0; this.state = 'ground'; this.poundRecover = 0.28;
    G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 16);
    G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 1.2, 20, 0xfff3d0);
    G.audio.play('boom', { vol: 0.35, pitch: 1.6 });
    G.shake(0.25);
    this.anim.sq = 0.6;
    G.onPound && G.onPound(this.pos.clone(), this.groundDyn);
  }

  _startClimb(w) {
    this.state = 'climb'; this.wallN.set(w.n.x, 0, w.n.z).normalize(); this.wallDyn = w.dyn;
    this.vel.set(0, 0, 0); this.canDouble = true; this.airSpin = false; this.airDash = false; this.climbT = 0;
    this.face = Math.atan2(-this.wallN.x, -this.wallN.z);
    this.G.audio.play('place', { vol: 0.5 });
  }
  _wallJump(n) {
    const nn = _v2.set(n.x, 0, n.z).normalize();
    this.vel.set(nn.x * 8.5, 0, nn.z * 8.5);
    this._jump(13, 'double');
    this.face = Math.atan2(nn.x, nn.z);
    this.canDouble = true; this.flipT = 0;
    this.G.fx.burst(this.pos.x - nn.x * 0.4, this.pos.y + 0.6, this.pos.z - nn.z * 0.4, 8, { speed: 2.5, color: 0xd8c8a0, size: 0.35, life: 0.4 });
  }
  _climb(dt, inp, mv, mag) {
    const G = this.G;
    const n = this.wallN;
    const f = _v2.set(-n.x, 0, -n.z);
    const rx = -f.z, rz = f.x; // höger längs väggen
    const up = (mv.x * f.x + mv.z * f.z) * mag;
    const side = (mv.x * rx + mv.z * rz) * mag;
    this.vel.set(rx * side * 4.2 + f.x * 1.2, up * 4.6, rz * side * 4.2 + f.z * 1.2);
    this.climbT += dt * (Math.abs(up) + Math.abs(side)) * 6;
    this.face = Math.atan2(f.x, f.z);
    if (this.jumpBuf > 0) { this._wallJump(n); return; }
    if (inp.crouch) { this.state = 'air'; this.vel.set(n.x * 3, 0, n.z * 3); return; }
    // finns väggen kvar? prova lite framåt
    const sx = this.pos.x, sy = this.pos.y, sz = this.pos.z;
    this.pos.x += f.x * 0.22; this.pos.z += f.z * 0.22; this.pos.y += 0.25;
    this._syncCap();
    const info = G.col.collide(this.cap, this.info);
    const still = info.wall && info.wallTag === 'climb';
    if (still) { n.set(info.wallNormal.x, 0, info.wallNormal.z).normalize(); this.wallDyn = info.wallDyn; }
    this.pos.set(sx, sy, sz); this._syncCap();
    if (!still) {
      if (up > 0.2) {
        // klättra upp över kanten
        this.state = 'air'; this.vel.set(f.x * 3.0, 9.0, f.z * 3.0); this.canDouble = true; this.flipT = 0; this.jumpCut = true;
        G.audio.play('jump', { pitch: 1.1, vol: 0.6 });
      } else { this.state = 'air'; this.vel.set(n.x * 1.5, 0, n.z * 1.5); }
      return;
    }
    if (this.onGround && up < -0.2) this.state = 'ground';
    if (Math.random() < dt * 2 * (Math.abs(up) + Math.abs(side))) G.audio.play('step', { vol: 0.5 });
  }

  _swim(dt, inp, mv, mag) {
    const G = this.G;
    const surf = this.waterLevel - 0.78;
    const tx = mv.x * 6 * mag, tz = mv.z * 6 * mag;
    this.vel.x = damp(this.vel.x, tx, 4, dt); this.vel.z = damp(this.vel.z, tz, 4, dt);
    if (mag > 0.08) this.face += clamp(angDiff(this.face, Math.atan2(mv.x, mv.z)), -7 * dt, 7 * dt);
    const atSurface = this.pos.y > surf - 0.35;
    if (inp.crouchHeld) this.vel.y = damp(this.vel.y, -4.5, 5, dt);
    else if (inp.jumpHeld && !atSurface) this.vel.y = damp(this.vel.y, 5, 5, dt);
    else this.vel.y = damp(this.vel.y, (surf - this.pos.y) * 4, 4, dt);
    if (this.jumpBuf > 0 && atSurface) {
      this._jump(12.5); this.swimming = false; this.state = 'air';
      G.fx.burst(this.pos.x, this.waterLevel, this.pos.z, 10, { speed: 3, up: true, g: 12, color: 0xd8f4ff, size: 0.3, life: 0.6 });
    }
    if (inp.attack && this.spinT <= 0) { this.spinT = 0.42; G.audio.play('whoosh', { pitch: 1.4, vol: 0.6 }); }
    if (atSurface && mag > 0.3 && Math.random() < 0.3) G.fx.emit(this.pos.x + (Math.random() - 0.5), this.waterLevel + 0.05, this.pos.z + (Math.random() - 0.5), { vy: 0.5, life: 0.6, size: 0.5, size1: 0.9, color: 0xffffff, alpha: 0.6 });
    if (!atSurface && Math.random() < 0.08) G.fx.emit(this.pos.x, this.pos.y + 1, this.pos.z, { vy: 2, life: 1, size: 0.15, size1: 0.2, color: 0xcff6ff });
  }

  /* ------------------------------------------------------------ animation (per bildruta) */
  animate(dt, t) {
    const R = this.rig, A = this.anim, P = A.pose;
    const sp = this.speedH;
    const st = this.state;
    const ground = this.onGround;
    A.t += dt;
    if (ground && (st === 'ground')) A.phase += dt * (3 + sp * 1.25);
    else if (st === 'climb') A.phase = this.climbT;
    else if (st === 'swim') A.phase += dt * (3 + sp);
    else A.phase += dt * 6;
    const ph = A.phase;
    const runK = ground ? Math.min(1, sp / 9) : 0;
    // mål-pose
    let legL = Math.sin(ph) * 1.1 * runK, legR = -legL;
    let armL = -Math.sin(ph) * 0.9 * runK, armR = -armL, armZ = 0.15;
    let pitch = sp * 0.025 * (ground ? 1 : 0.5), roll = 0, bodyY = 0.62 + Math.abs(Math.sin(ph)) * 0.07 * runK;
    let headX = 0, tailUp = 0, earBack = Math.min(0.6, sp * 0.04);
    let spinY = 0, flipX = 0;
    if (ground && sp < 0.5 && st === 'ground') {
      const b = Math.sin(A.t * 2.2);
      bodyY = 0.62 + b * 0.012; armL = armR = b * 0.04; legL = legR = 0; headX = Math.sin(A.t * 0.7) * 0.06;
    }
    if (this.crouch && st === 'ground') { bodyY = 0.42; pitch = 0.35; legL = -0.9 + legL * 0.4; legR = -0.9 + legR * 0.4; armZ = 0.4; }
    if (!ground && (st === 'air' || st === 'hurt')) {
      const up = this.vel.y > 0;
      legL = up ? -0.7 : 0.35; legR = up ? 0.2 : -0.3; armL = armR = up ? -2.4 : -1.2; armZ = up ? 0.35 : 0.9;
      tailUp = up ? -0.4 : 0.5; earBack = up ? 0.4 : -0.3; pitch = up ? -0.1 : 0.15;
    }
    if (this.flipT > 0) flipX = (1 - this.flipT / 0.42) * Math.PI * 2;
    if (this.flipT < 0) flipX = -(1 + this.flipT / 0.6) * Math.PI * 2; // bakåtvolt
    if (st === 'longjump') { pitch = 1.25; armL = armR = -2.9; armZ = 0.2; legL = legR = 0.9; tailUp = 0.6; }
    if (st === 'slide') { pitch = 1.35; bodyY = 0.38; armL = armR = -2.9; legL = legR = 0.6; }
    if (st === 'pound') {
      if (this.poundPhase === 1) { flipX = (this.poundT / 0.24) * Math.PI * 2; legL = legR = -1.4; armL = armR = -1.4; }
      else { legL = legR = 0.2; armL = armR = -2.8; armZ = 0.5; pitch = 0; earBack = 0.8; }
    }
    if (st === 'climb') { pitch = -0.1; const c = Math.sin(ph); armL = -2.6 + c * 0.45; armR = -2.6 - c * 0.45; legL = -0.5 - c * 0.4; legR = -0.5 + c * 0.4; armZ = 0.25; tailUp = 0.6; }
    if (st === 'swim') { pitch = sp > 1 ? 1.1 : 0.3; bodyY = 0.62; armL = Math.sin(ph) * 1.4 - 1.4; armR = -Math.sin(ph) * 1.4 - 1.4; legL = Math.sin(ph * 2) * 0.6; legR = -legL; }
    if (st === 'hurt') { pitch = -0.5; armL = -2.5; armR = -0.5; armZ = 1.2; }
    if (this.spinT > 0) { spinY = (1 - this.spinT / 0.42) * Math.PI * 4; armZ = 1.45; armL = armR = 0; tailUp = 1.1; }
    if (this.dashT > 0) { pitch = 0.6; armL = armR = 0.9; armZ = 0.3; legL = 0.9; legR = -0.6; tailUp = 0.8; }
    if (st === 'dead') { spinY = this.deadT * 12; armL = armR = -2.8; armZ = 1; }
    if (this.victory > 0) { armL = -3; armR = -0.3; armZ = 0.5; headX = -0.3; bodyY = 0.62 + Math.abs(Math.sin(A.t * 6)) * 0.12; }

    const k = 1 - Math.exp(-18 * dt);
    const lp = (key, v) => { P[key] = P[key] == null ? v : P[key] + (v - P[key]) * k; return P[key]; };
    R.legs[0].rotation.x = lp('legL', legL); R.legs[1].rotation.x = lp('legR', legR);
    R.arms[0].rotation.x = lp('armL', armL); R.arms[1].rotation.x = lp('armR', armR);
    const az = lp('armZ', armZ); R.arms[0].rotation.z = -az; R.arms[1].rotation.z = az;
    R.pivot.position.y = lp('bodyY', bodyY);
    R.body.rotation.x = lp('pitch', pitch);
    R.body.rotation.z = lp('roll', roll);
    R.head.rotation.x = lp('headX', headX - pitch * 0.35);
    const eb = lp('ear', earBack);
    R.ears[0].rotation.x = -eb; R.ears[1].rotation.x = -eb;
    // öronryck
    if (Math.random() < dt * 0.4) A.twitch = 0.25;
    if (A.twitch > 0) { A.twitch -= dt; R.ears[1].rotation.z = 0.32 + Math.sin(A.twitch * 50) * 0.2; } else R.ears[1].rotation.z = 0.32;
    // svans
    const tu = lp('tail', tailUp);
    for (let i = 0; i < R.tail.length; i++) {
      R.tail[i].rotation.y = Math.sin(A.t * (4 + sp * 0.5) - i * 0.7) * (0.18 + sp * 0.02);
      R.tail[i].rotation.x = -0.22 + tu * 0.12 * (i + 1) * 0.3 + Math.sin(A.t * 3 - i) * 0.04;
    }
    R.scarfTail.rotation.x = -0.2 - Math.min(1, sp * 0.08 + Math.max(0, this.vel.y) * 0.03) + Math.sin(A.t * 14) * 0.18 * Math.min(1, sp * 0.15 + 0.2);
    R.scarfTail.rotation.y = Math.sin(A.t * 9) * 0.25;
    // squash & stretch (fjäder)
    A.sqV += ((1 - A.sq) * 220 - A.sqV * 18) * dt; A.sq += A.sqV * dt;
    const s = clamp(A.sq, 0.55, 1.5);
    R.pivot.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    R.pivot.rotation.set(flipX, spinY, 0);
    // position & riktning
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.face;
    if (st === 'dead') this.obj.scale.setScalar(Math.max(0.01, 1 - this.deadT * 0.5)); else this.obj.scale.setScalar(1);
    this.obj.visible = !(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0 && st !== 'dead');
    // fotsteg
    if (ground && st === 'ground' && sp > 2) {
      const stepIdx = Math.floor(ph / Math.PI);
      if (stepIdx !== A.lastStep) { A.lastStep = stepIdx; this.G.audio.play('step', { vol: 0.5 + sp * 0.03 }); if (sp > 8 && Math.random() < 0.5) this.G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 1); }
    }
    if (this.dashT > 0 || st === 'longjump') this.G.fx.emit(this.pos.x, this.pos.y + 0.6, this.pos.z, { life: 0.25, size: 0.6, size1: 0.1, color: 0xffd0a0, alpha: 0.5 });
  }
}
