/**
 * Fjällracet – arkadfysik för bilarna (modellerna byggs i carmodel.js).
 */
import * as THREE from 'three';
import { Track } from './track.js';
import { buildCarModel, disposeCarModel } from './carmodel.js';
export { buildCarModel, disposeCarModel }; // modellerna finns i carmodel.js

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const UP = new THREE.Vector3(0, 1, 0);
export const G = 15;

/* ------------------------------------------------------------------ Fysik */
const _F = new THREE.Vector3(), _R = new THREE.Vector3(), _U = new THREE.Vector3(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();

export class Car {
  /** look: lackfärg (tal) eller look-objekt, se carmodel.js. */
  constructor(spec, color, opts = {}) {
    this.spec = spec; this.color = color;
    this.model = buildCarModel(spec, color, opts);
    this.camDist = undefined; // sätts av main.js varje bildruta (detaljnivå)
    this.root = this.model.root;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.prevPos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.prevQuat = new THREE.Quaternion();
    this.F = new THREE.Vector3(0, 0, 1); this.Rt = new THREE.Vector3(-1, 0, 0); this.up = new THREE.Vector3(0, 1, 0);
    this.yaw = 0; this.yawRate = 0; this.steer = 0;
    this.grounded = true; this.air = 0;
    this.tp = Track.makeFrame(); this.tp.i = -1;
    this.ctl = { throttle: 0, brake: 0, steer: 0, hand: false, nitro: false };
    this.drift = false; this.driftDir = 0; this.slip = 0;
    this.nitro = 0.3; this.nitroOn = false; this.freeBoost = 0;
    this.vf = 0; this.vl = 0; this.speed = 0; this.lonAcc = 0; this.latAcc = 0; this.accS = 0;
    this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0; this.bounce = 0; this.bounceV = 0;
    this.wheelSpin = 0; this.events = []; this.scrape = 0; this.onRoad = true;
    this.driftScore = 0; this.driftCombo = 0;
    this.ghostT = 0; this.needReset = null; this.wheelSlip = 0; this.stunT = 0;
  }

  placeAt(track, s, d, speed = 0) {
    const f = track.frameAt(s, Track.makeFrame());
    this.pos.copy(f.c).addScaledVector(f.R, d);
    this.yaw = Math.atan2(f.T.x, f.T.z);
    this.vel.copy(f.T).multiplyScalar(speed);
    this.yawRate = 0; this.steer = 0; this.drift = false; this.grounded = true; this.air = 0; this.nitroOn = false;
    this.pitch = this.roll = this.bounce = this.pitchV = this.rollV = this.bounceV = 0;
    this.tp.i = -1;
    track.project(this.pos, -1, this.tp);
    // ta närmaste index nära s (undvik korsningar)
    const want = Math.floor(((s % track.L) + track.L) % track.L / track.ds) % track.N;
    track.project(this.pos, want, this.tp);
    this.pos.addScaledVector(this.tp.N, -this.tp.h);
    this.prevPos.copy(this.pos);
    this._orient(); this.prevQuat.copy(this.quat);
    this.events.length = 0; this.needReset = null; this.stunT = 0;
  }

  update(dt, tr) {
    const c = this.ctl, sp = this.spec, tp = this.tp;
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    tr.project(this.pos, tp.i, tp);
    const N = tp.N;
    const ad = Math.abs(tp.d), side = tp.d < 0 ? -1 : 1;
    const wall = tr.wallAt(tp.i, side);
    const hasGround = wall || ad < tr.limit + 4;
    this.onRoad = ad <= tr.half + 0.4;
    let sg = tr.grip;
    if (sp.iceBonus && sg < 0.8) sg += (1 - sg) * sp.iceBonus;
    if (!this.onRoad) sg *= tr.grip < 0.8 ? 0.9 : 0.8;
    this.ghostT = Math.max(0, this.ghostT - dt);
    this.stunT = Math.max(0, this.stunT - dt);

    // riktning
    const F = _F.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const up = this.grounded ? N : UP;
    F.addScaledVector(up, -F.dot(up)).normalize();
    const Rt = _R.crossVectors(F, up).normalize();
    let vf = this.vel.dot(F), vl = this.vel.dot(Rt);
    const sAbs = Math.abs(vf);
    // styrning (mjukad)
    const tgt = clamp(c.steer, -1, 1);
    const rate = (Math.abs(tgt) > Math.abs(this.steer) && Math.sign(tgt) === Math.sign(this.steer)) ? 3.6 : 7.5;
    this.steer += clamp(tgt - this.steer, -rate * dt, rate * dt);

    if (this.grounded) {
      // ---------- längsled ----------
      let a = 0;
      const wantNitro = (c.nitro && this.nitro > 0.005) || this.freeBoost > 0;
      this.nitroOn = wantNitro && vf > 1;
      const pm = (this.rubber || 1) * (this.powerMul || 1) * (this.stunT > 0 ? 0.5 : 1); // efter hård smäll: motorn hackar en kort stund
      const top = sp.top * (this.nitroOn ? 1.2 : 1) * (this.onRoad ? 1 : 0.86) * pm;
      if (c.throttle > 0) {
        if (vf >= -0.5) a += sp.accel * pm * c.throttle * Math.pow(Math.max(0, 1 - vf / top), 0.55);
        else a += sp.brake * c.throttle;
      }
      if (this.nitroOn) {
        if (vf < top) a += 8;
        if (this.freeBoost > 0) this.freeBoost -= dt; else this.nitro = Math.max(0, this.nitro - dt * 0.28 / (sp.nitroMul || 1));
      }
      if (c.brake > 0) {
        if (vf > 0.5) a -= sp.brake * c.brake;
        else if (vf > -13) a -= sp.accel * 0.55 * c.brake;
      }
      a -= Math.sign(vf) * (0.3 + vf * vf * 0.00045);
      if (!this.onRoad) a -= Math.sign(vf) * Math.min(sAbs * 2, 0.05 * sAbs + 1.2);
      if (c.hand && sAbs > 0.5) a -= Math.sign(vf) * 4.0;
      const trac = sp.grip * sg;
      a = clamp(a, -trac * 1.7, trac * 1.1 + (this.nitroOn ? 6 : 0));
      a -= G * F.y * 0.9; // backar
      const vf0 = vf;
      vf += a * dt;
      if (vf0 > 0.5 && vf < 0 && c.brake > 0) vf = 0;
      if (vf0 < -0.5 && vf > 0 && c.throttle > 0) vf = 0;
      if (c.throttle === 0 && c.brake === 0 && Math.abs(vf) < 0.25 && Math.abs(F.y) < 0.05) vf = 0;
      this.lonAcc = (vf - vf0) / dt;
      this.accS += (this.lonAcc - this.accS) * Math.min(1, dt * 6);
      const wt = clamp(-this.accS / 24, -0.25, 0.3); // + = viktöverföring framåt (bromsning)

      // ---------- sidled + gir ----------
      const gripLat = sp.grip * sg;
      const maxAng = lerp(0.62, 0.15, clamp(sAbs / 46, 0, 1));
      let slip = Math.atan2(-vl, Math.max(0.5, Math.abs(vf)));
      if (!this.drift) {
        const kin = vf / 2.6 * Math.tan(this.steer * maxAng);
        const lim = gripLat * (1.06 + 0.35 * wt) / Math.max(sAbs, 3);
        // progressiv styrning: i hög fart motsvarar fullt utslag greppgränsen
        const kinFull = sAbs / 2.6 * Math.tan(maxAng);
        const target = this.progressive && kinFull > lim ? this.steer * lim * Math.sign(vf) : clamp(kin, -lim, lim);
        this.yawRate += (target - this.yawRate) * Math.min(1, (6 + 12 * sg) * dt);
        const latMax = gripLat * (1 - 0.2 * Math.max(0, wt));
        const al = clamp(-vl * 14, -latMax, latMax);
        vl += al * dt;
        this.latAcc = this.yawRate * vf;
        // in i drift
        if (c.hand && sAbs > 11 && Math.abs(this.steer) > 0.2) {
          this.drift = true; this.driftDir = Math.sign(this.steer);
          this.yawRate += this.driftDir * 0.5 * sp.drift;
        } else if (!this.noDrift && Math.abs(slip) > 0.3 && sAbs > 12 && (c.hand || this.steer * Math.sign(slip) > 0.3)) {
          this.drift = true; this.driftDir = Math.sign(slip);
        }
      } else {
        const into = clamp(this.steer * this.driftDir, -1, 1);
        const base = into >= 0 ? 0.12 + 0.5 * into : 0.12 + 0.12 * into;
        const targetSlip = this.driftDir * clamp(base + (c.hand ? 0.12 : 0), 0, 0.7) * (0.85 + 0.15 * sp.drift);
        const latMax = gripLat * (0.84 + 0.24 * Math.max(0, into));
        const al = clamp(-vl * 9, -latMax, latMax);
        const velTurn = al / Math.max(Math.hypot(vf, vl), 3);
        const desired = velTurn + (targetSlip - slip) * 5.0;
        this.yawRate += (desired - this.yawRate) * Math.min(1, 9 * dt);
        vl += al * dt;
        vf += Math.abs(al * dt) * 0.15 * Math.sign(vf);
        vf -= Math.abs(Math.sin(slip)) * 2.0 * dt * Math.sign(vf);
        this.latAcc = al;
        const ex = (!c.hand && Math.abs(slip) < 0.15 && into < 0.35) || sAbs < 6.5 || (into < -0.35 && Math.abs(slip) < 0.22);
        if (ex) this.drift = false;
        if (Math.abs(slip) > 1.3) { this.drift = false; vf *= 0.55; vl *= 0.5; }
        if (sAbs > 13 && this.drift) {
          const k = clamp(Math.abs(slip) / 0.35, 0.3, 1.4);
          this.nitro = Math.min(1, this.nitro + dt * 0.085 * k * (sp.nitroMul || 1));
          this.driftCombo += sAbs * Math.abs(slip) * dt * 6;
        }
      }
      this.slip = slip;
      this.wheelSlip = this.drift ? Math.min(1, Math.abs(slip) * 2) : clamp((Math.abs(slip) - 0.06) * 6, 0, 1) + (c.hand && sAbs > 3 ? 0.5 : 0) + (c.brake > 0.5 && sAbs > 16 ? 0.4 : 0);
      this.yaw -= this.yawRate * dt;
      this.vel.copy(F).multiplyScalar(vf).addScaledVector(Rt, vl);
      // avfärd från krön
      if (-tp.kv * vf * vf > G * 1.02 && vf > 9) { this.grounded = false; this.air = 0; this.vel.addScaledVector(N, 0.4); }
      if (!hasGround) { this.grounded = false; this.air = 0; }
      this.pos.addScaledVector(this.vel, dt);
      tr.project(this.pos, tp.i, tp);
      if (this.grounded) {
        const ad2 = Math.abs(tp.d), w2 = tr.wallAt(tp.i, tp.d < 0 ? -1 : 1);
        if (w2 || ad2 < tr.limit + 4) {
          this.pos.addScaledVector(tp.N, -tp.h);
          const vn = this.vel.dot(tp.N); this.vel.addScaledVector(tp.N, -vn);
        } else this.grounded = false;
      }
    } else {
      // ---------- luften ----------
      this.air += dt;
      this.nitroOn = false;
      this.vel.y -= G * dt;
      this.yawRate += (this.steer * 0.45 - this.yawRate) * Math.min(1, 2.0 * dt);
      this.yaw -= this.yawRate * dt;
      this.pos.addScaledVector(this.vel, dt);
      tr.project(this.pos, tp.i, tp);
      const ad2 = Math.abs(tp.d), w2 = tr.wallAt(tp.i, tp.d < 0 ? -1 : 1);
      const ground2 = w2 || ad2 < tr.limit + 4;
      if (ground2 && tp.h <= 0 && tp.h < -1.5) this.needReset = 'fall';
      else if (ground2 && tp.h <= 0) {
        const vn = this.vel.dot(tp.N);
        this.pos.addScaledVector(tp.N, -tp.h);
        this.vel.addScaledVector(tp.N, -vn);
        this.grounded = true;
        // landning: rikta upp farten mot nosen (arkadkänsla)
        _U.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); _U.addScaledVector(tp.N, -_U.dot(tp.N)).normalize();
        _v.crossVectors(_U, tp.N).normalize();
        const lf = this.vel.dot(_U), ll = this.vel.dot(_v);
        this.vel.copy(_U).multiplyScalar(lf).addScaledVector(_v, ll * 0.35);
        this.yawRate *= 0.3;
        const imp = -vn;
        if (imp > 2) this.events.push({ type: 'land', strength: imp });
        if (imp > 7) this.vel.multiplyScalar(0.97);
        this.bounceV -= Math.min(imp, 14) * 0.25;
        this.pitchV += Math.min(imp, 12) * 0.05;
        if (this.air > 0.35) this.events.push({ type: 'air', time: this.air });
      }
      if (!ground2 && (tp.h < -6 || this.air > 3)) this.needReset = 'fall';
      vf = this.vel.dot(F);
    }

    // ---------- räcken ----------
    this.scrape = 0;
    const lim2 = tr.limit - 0.95;
    const wallPen = Math.abs(tp.d) - lim2;
    if (wallPen > 1.6 && tr.wallAt(tp.i, tp.d < 0 ? -1 : 1) && tp.h < 3) {
      // bilen är redan UTANFÖR räcket (kom från en öppen kant och körde förbi där räcket börjar) –
      // knuffa inte igenom räcket utan räkna det som avåkning
      this.needReset = 'fall';
    } else if (wallPen > 0 && tr.wallAt(tp.i, tp.d < 0 ? -1 : 1) && tp.h < 3) {
      const sd = tp.d < 0 ? -1 : 1;
      const pen = wallPen;
      this.pos.addScaledVector(tp.R, -sd * pen);
      const out = this.vel.dot(tp.R) * sd;
      if (out > 0) {
        // studs bara vid hårda smällar – vid skrapning glider bilen längs räcket
        const rest = out > 5 ? 0.3 : out > 2 ? 0.12 : 0.02;
        this.vel.addScaledVector(tp.R, -sd * out * (1 + rest));
        // fartförlust växer kraftigt med smällens hårdhet – att "rida på räcket" ska aldrig löna sig
        const hard = Math.max(0, out - 6);
        this.vel.multiplyScalar(1 - Math.min(0.42, out * 0.016 + hard * 0.014));
        if (out > 7) this.stunT = Math.max(this.stunT, Math.min(0.8, 0.3 + (out - 7) * 0.12));
        // nosen in mot räcket → vrid den längs räcket (mer ju hårdare smäll). Styr man redan ut från
        // räcket lämnas giren ifred, annars "klistras" bilen fast mot ytterräcket i kurvor.
        const noseIn = (this.F.x * tp.R.x + this.F.z * tp.R.z) * sd;
        if (noseIn > 0) {
          const tYaw = Math.atan2(tp.T.x, tp.T.z);
          const fwd = Math.cos(wrap(this.yaw - tYaw)) > 0 ? tYaw : tYaw + Math.PI;
          this.yaw += wrap(fwd - this.yaw) * Math.min(0.4, 0.025 + out * 0.035);
        }
        if (this.yawRate * sd > 0) this.yawRate *= out > 3 ? 0.4 : 0.85;
        if (out > 3) { this.drift = false; this.driftCombo = 0; }
        if (out > 1) this.events.push({ type: 'wall', strength: out, side: sd });
      }
      const spd = this.vel.length();
      if (spd > 4) this.scrape = spd;
      this.scrapeSide = sd;
    }
    this.vf = this.vel.dot(_F.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
    this.speed = this.vel.length();

    // ---------- visuell fjädring ----------
    const kp = 60, kd = 9;
    const pitchT = clamp(this.lonAcc * -0.0045, -0.06, 0.07) * (this.grounded ? 1 : 0);
    const rollT = clamp(this.latAcc * 0.0065, -0.075, 0.075) * (this.grounded ? 1 : 0);
    this.pitchV += ((pitchT - this.pitch) * kp - this.pitchV * kd) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((rollT - this.roll) * kp - this.rollV * kd) * dt; this.roll += this.rollV * dt;
    this.bounceV += ((0 - this.bounce) * 120 - this.bounceV * 12) * dt; this.bounce += this.bounceV * dt;
    this.bounce = clamp(this.bounce, -0.18, 0.15);
    this.wheelSpin += (this.vf / this.model.shape.r) * dt * (c.hand && this.grounded ? 0.15 : 1);
    this._orient();
  }

  _orient() {
    const tp = this.tp;
    const F = _F.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (this.grounded) this.up.lerp(tp.N, 0.5).normalize();
    else {
      // lätt nosning efter hastighetsvektorn i luften
      _U.copy(UP);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const pa = clamp(Math.atan2(this.vel.y, Math.max(hs, 1)) * 0.45, -0.35, 0.3);
      _U.addScaledVector(F, -Math.sin(pa)).normalize();
      this.up.lerp(_U, 0.06).normalize();
    }
    F.addScaledVector(this.up, -F.dot(this.up)).normalize();
    const R = _R.crossVectors(F, this.up).normalize();
    this.F.copy(F); this.Rt.copy(R);
    _m.makeBasis(_v.copy(R).negate(), this.up, F);
    this.quat.setFromRotationMatrix(_m);
  }

  /** Uppdaterar 3D-modellen (interpolerad). */
  syncVisual(alpha, time) {
    const m = this.model;
    this.root.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
    m.body.rotation.set(this.pitch, 0, this.roll);
    m.body.position.y = this.bounce;
    const steerVis = this.drift ? clamp(-this.slip * 0.9, -0.5, 0.5) : this.steer * lerp(0.55, 0.2, clamp(Math.abs(this.vf) / 45, 0, 1));
    for (const w of m.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = steerVis;
      w.pivot.position.y = w.baseY + (this.grounded ? 0 : -0.08);
    }
    if (!m.isGhost) m.tailMat.emissiveIntensity = (this.ctl.brake > 0.1 && this.vf > 0.5) || this.ctl.hand ? 2.6 : 0.35;
    const fl = this.nitroOn;
    for (const f of m.flames) {
      f.visible = fl;
      if (fl) { const s = 0.8 + Math.random() * 0.6; f.scale.set(s, s, 0.8 + Math.random() * 0.9); }
    }
    if (m.label) m.label.visible = this.showLabel;
    if (m.updateLod) m.updateLod(this.camDist);
    const ghostBlink = this.ghostT > 0 ? (Math.floor(time * 12) % 2 === 0) : true;
    this.root.visible = ghostBlink;
  }
}

/* ------------------------------------------------------------------ Bil mot bil */
const _n = new THREE.Vector3(), _ca = new THREE.Vector3(), _cb = new THREE.Vector3();
export function collideCars(cars, onHit) {
  const n = cars.length;
  for (let a = 0; a < n; a++) {
    const A = cars[a];
    if (A.ghostT > 0 || A.noCollide) continue;
    for (let b = a + 1; b < n; b++) {
      const B = cars[b];
      if (B.ghostT > 0 || B.noCollide) continue;
      const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, dy = B.pos.y - A.pos.y;
      if (dx * dx + dz * dz > 36 || Math.abs(dy) > 2.2) continue;
      let best = 0, bnx = 0, bnz = 0, bax = 0, baz = 0;
      for (const sa of [-1.15, 1.15]) for (const sb of [-1.15, 1.15]) {
        const ax = A.pos.x + A.F.x * sa, az = A.pos.z + A.F.z * sa;
        const bx = B.pos.x + B.F.x * sb, bz = B.pos.z + B.F.z * sb;
        const ex = bx - ax, ez = bz - az; const d = Math.hypot(ex, ez);
        const pen = 2.0 - d;
        if (pen > best && d > 1e-4) { best = pen; bnx = ex / d; bnz = ez / d; bax = (ax + bx) / 2; baz = (az + bz) / 2; }
      }
      if (best <= 0) continue;
      const ma = A.spec.mass, mb = B.spec.mass;
      A.pos.x -= bnx * best * mb / (ma + mb); A.pos.z -= bnz * best * mb / (ma + mb);
      B.pos.x += bnx * best * ma / (ma + mb); B.pos.z += bnz * best * ma / (ma + mb);
      const vr = (B.vel.x - A.vel.x) * bnx + (B.vel.z - A.vel.z) * bnz;
      if (vr < 0) {
        const j = -(1 + 0.25) * vr / (1 / ma + 1 / mb);
        A.vel.x -= bnx * j / ma; A.vel.z -= bnz * j / ma;
        B.vel.x += bnx * j / mb; B.vel.z += bnz * j / mb;
        // girmoment beroende på var stöten träffar
        const armA = (bax - A.pos.x) * A.F.x + (baz - A.pos.z) * A.F.z;
        const armB = (bax - B.pos.x) * B.F.x + (baz - B.pos.z) * B.F.z;
        const crA = bnx * A.F.z - bnz * A.F.x, crB = bnx * B.F.z - bnz * B.F.x;
        A.yawRate += clamp(armA * crA * j * 0.03 / ma, -1.2, 1.2);
        B.yawRate -= clamp(armB * crB * j * 0.03 / mb, -1.2, 1.2);
        if (j > 1.5 && onHit) onHit(A, B, j, bax, (A.pos.y + B.pos.y) / 2 + 0.6, baz);
      }
    }
  }
}
