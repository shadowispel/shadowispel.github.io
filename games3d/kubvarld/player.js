/** Spelaren: rörelse, kollision, simning, flygning, kamera (första/tredje person). */
import * as THREE from 'three';
import { moveBody, overlaps } from './physics.js';
import { isWater, BLOCKS, ARMOR_MATS, armorOf, ITEMS } from './blocks.js';
import { buildSkinModel, loadSkin } from './skin.js';

const HW = 0.3, H = 1.8, H_SNEAK = 1.5;
const HURT = new THREE.Color(1, 0.4, 0.4);

export class Player {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.ground = false; this.inWater = false; this.eyeInWater = false; this.headInWater = false;
    this.sneaking = false; this.sprinting = false; this.flying = false; this.creative = false;
    this.alive = true;
    this.health = 20; this.food = 20; this.sat = 5; this.exh = 0; this.air = 15;
    this.fallY = null; this.walkDist = 0; this.bob = 0; this.bobAmt = 0;
    this.view = 0; // 0 = första, 1 = bakom, 2 = framifrån
    this.eyeH = 1.62; this.camY = 1.62;
    this.model = buildSkinModel(loadSkin());
    this.blocking = false;
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    this.swing = 0; this.hurtT = 0; this.light = new THREE.Color(1, 1, 1);
    this.onLand = null; this.onStep = null;
    this._camTmp = new THREE.Vector3(); this._dir = new THREE.Vector3();
  }
  dispose() { this.g.scene.remove(this.model.root); this.model.dispose(); }
  /** Byt figurens utseende (skin-objekt från skin.js) */
  setSkin(skin) { this.model.setSkin(skin); }
  get height() { return this.sneaking && !this.flying ? H_SNEAK : H; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.camY, this.pos.z); }
  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** ctl: { mx, mz, jump, jumpPressed, sneak, sprint, down } */
  update(dt, ctl) {
    const w = this.g.world;
    if (!this.alive) { this.vel.set(0, 0, 0); return; }
    // tillstånd
    const fx = Math.floor(this.pos.x), fz = Math.floor(this.pos.z);
    const feet = w.get(fx, Math.floor(this.pos.y + 0.1), fz), waist = w.get(fx, Math.floor(this.pos.y + 0.8), fz);
    const wasIn = this.inWater;
    this.inWater = isWater(feet) || isWater(waist);
    // plask när man går eller faller i vattnet
    if (this.inWater && !wasIn && this.onSplash) this.onSplash(Math.max(0, -this.vel.y));
    this.headInWater = isWater(w.get(fx, Math.floor(this.pos.y + this.camY + 0.08), fz));
    const climbAt = id => id > 0 && BLOCKS[id] && BLOCKS[id].climb;
    this.onLadder = climbAt(feet) || climbAt(waist);
    if (!this.flying && !this.inWater) {
      const wantSneak = !!ctl.sneak;
      if (!wantSneak && this.sneaking) { if (!overlaps(w, this.pos.x, this.pos.y, this.pos.z, HW, H)) this.sneaking = false; }
      else this.sneaking = wantSneak;
    } else if (!overlaps(w, this.pos.x, this.pos.y, this.pos.z, HW, H)) this.sneaking = false;
    if (ctl.sprint && ctl.mz > 0.5 && !this.sneaking && (this.food > 6 || this.creative)) this.sprinting = true;
    if (this.sprinting && (ctl.mz < 0.3 || this.sneaking || (!this.creative && this.food <= 6))) this.sprinting = false;

    // önskad hastighet
    let speed = this.flying ? (this.sprinting ? 21 : 10.9) : this.sneaking ? 1.35 : this.sprinting ? 5.6 : 4.3;
    if (this.inWater && !this.flying) speed *= 0.55;
    if (this.blocking && !this.flying) speed = Math.min(speed, 1.6);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let mx = ctl.mx, mz = ctl.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const wx = (-sy * mz + cy * mx) * speed, wz = (-cy * mz - sy * mx) * speed;
    const acc = this.flying ? 6 : this.ground ? 14 : this.inWater ? 5 : 2.6;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (wx - this.vel.x) * k; this.vel.z += (wz - this.vel.z) * k;

    if (this.flying) {
      const vy = (ctl.jump ? 1 : 0) - (ctl.down ? 1 : 0);
      this.vel.y += (vy * 8 - this.vel.y) * (1 - Math.exp(-8 * dt));
    } else if (this.inWater) {
      // simning: sjunk långsamt, håll hopp för att simma upp, smyg (Skift) för att dyka
      this.vel.y -= 6 * dt;
      this.vel.y *= Math.pow(0.2, dt);
      if (ctl.jump) this.vel.y = Math.min(this.vel.y + 24 * dt, 3.4);
      else if (ctl.down) this.vel.y = Math.max(this.vel.y - 18 * dt, -3.4);
      this.vel.y = Math.max(this.vel.y, -3.4);
      this.swimT = (this.swimT || 0) + dt * Math.hypot(this.vel.x, this.vel.z);
    } else if (this.onLadder) {
      // stege: gå mot den eller håll hopp för att klättra, smyg för att stå still
      if (ml > 0.2 || ctl.jump) this.vel.y = 3.2;
      else if (this.sneaking) this.vel.y = 0;
      else this.vel.y = Math.max(this.vel.y - 28 * dt, -2.6);
    } else {
      this.vel.y = Math.max(this.vel.y - 28 * dt, -48);
      if (ctl.jump && this.ground) { this.vel.y = 8.6; this.g.onJump(); if (this.sprinting) { this.vel.x += -sy * 1.2; this.vel.z += -cy * 1.2; } }
    }
    const wasGround = this.ground;
    const oldY = this.pos.y;
    const wantClimb = this.inWater && !this.flying && (ctl.jump || ml > 0.3);
    const r = moveBody(w, this.pos, this.vel, dt, { hw: HW, h: this.height, stepUp: this.flying ? 0 : 0.55, sneak: this.sneaking && !this.flying, grounded: this.ground });
    this.ground = r.ground;
    // simma upp på en kant: mot en vägg i vattenytan med hopp (eller framåt) → lyft upp
    if (wantClimb && (r.hitX || r.hitZ) && !this.headInWater) {
      const fx2 = Math.floor(this.pos.x + (-sy * mz + cy * mx) * 0.7), fz2 = Math.floor(this.pos.z + (-cy * mz - sy * mx) * 0.7), by = Math.floor(this.pos.y + 0.6);
      const wall = w.get(fx2, by, fz2), above = w.get(fx2, by + 1, fz2), above2 = w.get(fx2, by + 2, fz2);
      const solid = b => b > 0 && BLOCKS[b] && BLOCKS[b].solid;
      if (solid(wall) && !solid(above) && !solid(above2)) this.vel.y = Math.max(this.vel.y, 6.2);
    } else if (wantClimb && ctl.jump && (r.hitX || r.hitZ)) this.vel.y = Math.max(this.vel.y, 3.4);
    if (this.flying && this.ground && !this.creative) this.flying = false;
    if (this.flying && r.ground && ctl.down) { this.flying = false; }
    // autohopp
    if (this.g.autoJump && (r.hitX || r.hitZ) && this.ground && !this.sneaking && ml > 0.3 && !this.flying) {
      const ax = Math.floor(this.pos.x + (-sy * mz + cy * mx) * 0.6), az = Math.floor(this.pos.z + (-cy * mz - sy * mx) * 0.6);
      const by = Math.floor(this.pos.y + 0.01);
      const b1 = w.get(ax, by, az), b2 = w.get(ax, by + 1, az), b3 = w.get(ax, by + 2, az);
      if (b1 > 0 && BLOCKS[b1].solid && !(b2 > 0 && BLOCKS[b2].solid) && !(b3 > 0 && BLOCKS[b3].solid)) { this.vel.y = 8.6; }
    }
    // fallskada
    if (!this.ground && !this.inWater && !this.flying) { if (this.fallY === null || this.pos.y > this.fallY) this.fallY = Math.max(this.fallY ?? this.pos.y, this.pos.y); }
    if (this.inWater || this.flying || this.onLadder) this.fallY = null;
    if (this.ground && !wasGround) {
      const dist = this.fallY !== null ? this.fallY - this.pos.y : 0;
      this.fallY = null;
      if (this.onLand) this.onLand(dist);
    }
    if (this.ground) this.fallY = null;
    // steg
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.ground && hs > 0.5) {
      const before = Math.floor(this.walkDist / 2.2);
      this.walkDist += hs * dt;
      if (Math.floor(this.walkDist / 2.2) !== before && this.onStep) this.onStep();
    }
    this.bobAmt += ((this.ground && hs > 0.5 ? Math.min(1, hs / 4.3) : 0) - this.bobAmt) * (1 - Math.exp(-10 * dt));
    this.bob += hs * dt * 1.9;
    // ögonhöjd (smyg)
    const targetEye = this.sneaking ? 1.32 : 1.62;
    this.camY += (targetEye - this.camY) * (1 - Math.exp(-14 * dt));
    if (this.pos.y < -30) this.pos.y = -30;
    return r;
  }

  updateCamera(cam, dt, bobOn) {
    const w = this.g.world;
    const eye = this.eye(this._camTmp);
    let bx = 0, by = 0;
    if (bobOn && this.view === 0) { bx = Math.sin(this.bob) * 0.045 * this.bobAmt; by = Math.abs(Math.cos(this.bob)) * 0.06 * this.bobAmt; }
    const dir = this.lookDir(this._dir);
    if (this.view === 0) {
      cam.position.set(eye.x + Math.cos(this.yaw) * bx, eye.y + by, eye.z - Math.sin(this.yaw) * bx);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      const back = this.view === 1 ? -1 : 1;
      let d = 4;
      const hit = w.raycast(eye.x, eye.y, eye.z, dir.x * back, dir.y * back, dir.z * back, d + 0.3, {});
      if (hit) d = Math.max(0.6, hit.dist - 0.3);
      cam.position.set(eye.x + dir.x * back * d, eye.y + dir.y * back * d, eye.z + dir.z * back * d);
      if (this.view === 1) cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      else cam.lookAt(eye);
    }
    // modell
    const m = this.model;
    m.root.visible = this.view !== 0 && this.alive;
    if (m.root.visible) {
      m.root.position.copy(this.pos);
      m.root.rotation.y = this.yaw + Math.PI;
      const P = m.parts;
      const sw = Math.sin(this.bob * 1.0) * 0.9 * this.bobAmt;
      P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
      P.armL.rotation.x = -sw * 0.7;
      P.armR.rotation.x = sw * 0.7 - (this.swing > 0 ? Math.sin(this.swing * Math.PI) * 1.6 : 0);
      P.head.rotation.x = -this.pitch * 0.8;
      // sköld: syns på vänster arm när den hålls, lyfts när man parerar
      const inv = this.g.inv, isSh = s => !!(s && ITEMS[s.id] && ITEMS[s.id].shield);
      const shOn = inv && (isSh(inv.off) || isSh(inv.held));
      P.shield.visible = !!shOn;
      if (shOn && this.blocking) { P.armL.rotation.x = -1.25; P.armL.rotation.z = -0.35; } else P.armL.rotation.z = 0;
      m.shieldMat.color.copy(m.mat.color);
      m.root.children[0].position.y = this.sneaking ? -0.2 : 0;
      m.root.children[0].rotation.x = this.sneaking ? 0.35 : 0;
      m.mat.color.copy(this.hurtT > 0 ? HURT : this.light);
      const arm = this.g.inv && this.g.inv.armor;
      if (arm && P.armor) for (let i = 0; i < 4; i++) {
        const a = arm[i] && armorOf(arm[i].id);
        for (const g of P.armor[i]) g.visible = !!a;
        if (a) m.armorMats[i].color.setHex(ARMOR_MATS[a.mat][1]).convertSRGBToLinear().multiply(m.mat.color);
      }
    }
  }
}
