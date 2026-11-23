/* Rävens äventyr – tredjepersonskamera med orbit, auto-följ, kollision och höjdanpassning. */
import * as THREE from 'three';

const V3 = THREE.Vector3;
const _dir = new V3(), _des = new V3(), _tmp = new V3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class CameraRig {
  constructor(cam) {
    this.cam = cam;
    this.yaw = Math.PI; this.pitch = 0.32; this.dist = 8.5; this.zoom = 8.5;
    this.target = new V3(); this.focusY = 0; this.curDist = 8.5;
    this.idle = 10; this.recenterT = 0; this.recenterFrom = 0; this.recenterTo = 0;
    this.shakeAmt = 0; this.shakeT = 0;
    this.override = null; // { pos, look, k }
    this.fov = 70;
  }
  snap(player) {
    this.yaw = player.face + Math.PI; this.pitch = 0.32;
    this.target.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
    this.focusY = player.pos.y + 1.3; this.curDist = this.zoom;
    this.override = null;
    this._place(null, 1);
  }
  recenter(player) {
    this.recenterT = 0.28; this.recenterFrom = this.yaw;
    this.recenterTo = this.yaw + angDiff(this.yaw, player.face + Math.PI);
    this.idle = 0;
  }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  /** dx/dy: radianer från mus/spak. wheel: zoom. */
  update(dt, player, col, look, wheel) {
    if (look.dx || look.dy) { this.yaw -= look.dx; this.pitch = clamp(this.pitch + look.dy, -0.45, 1.25); this.idle = 0; this.recenterT = 0; }
    else this.idle += dt;
    if (wheel) this.zoom = clamp(this.zoom + wheel * 0.8, 4, 14);
    if (this.recenterT > 0) {
      this.recenterT -= dt;
      const k = 1 - Math.max(0, this.recenterT) / 0.28;
      const e = k * k * (3 - 2 * k);
      this.yaw = this.recenterFrom + (this.recenterTo - this.recenterFrom) * e;
      this.pitch += (0.32 - this.pitch) * Math.min(1, dt * 8);
    }
    // auto-följ: rotera mjukt bakom spelaren när hon rör sig och ingen styr kameran
    const sp = player.speedH;
    if (this.idle > 0.9 && sp > 2 && player.state !== 'climb') {
      const behind = player.face + Math.PI;
      const d = angDiff(this.yaw, behind);
      // starkare när hon springer åt sidan, aldrig när hon springer mot kameran
      const side = Math.abs(Math.sin(d));
      const towards = Math.cos(d) < -0.3;
      if (!towards) this.yaw += d * Math.min(1, dt * (0.35 + side * 0.9) * Math.min(1, sp / 8));
      this.pitch += (0.3 - this.pitch) * Math.min(1, dt * 0.6);
    }
    if (player.state === 'climb' && this.idle > 0.6) {
      const d = angDiff(this.yaw, player.face + Math.PI);
      this.yaw += d * Math.min(1, dt * 1.2);
    }
    // höjdföljning: följ inte varje hopp
    const py = player.pos.y + 1.3;
    if (player.onGround || player.state === 'climb' || player.state === 'swim') this.focusY += (py - this.focusY) * Math.min(1, dt * 7);
    else if (py < this.focusY - 1.2) this.focusY += (py + 1.2 - this.focusY) * Math.min(1, dt * 10);
    else if (py > this.focusY + 2.8) this.focusY += (py - 2.8 - this.focusY) * Math.min(1, dt * 6);
    this.target.x += (player.pos.x - this.target.x) * Math.min(1, dt * 14);
    this.target.z += (player.pos.z - this.target.z) * Math.min(1, dt * 14);
    this.target.y = this.focusY;
    this._place(col, dt);
  }
  _place(col, dt) {
    const cam = this.cam;
    if (this.override) {
      const o = this.override;
      cam.position.lerp(o.pos, o.snap ? 1 : Math.min(1, dt * (o.k || 3)));
      _tmp.copy(o.look);
      cam.lookAt(_tmp);
      o.snap = false;
      return;
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    let want = this.zoom;
    if (col) {
      const h = col.raycast(this.target, _dir, want + 0.4, 'nocam');
      if (h) want = Math.max(1.2, h.dist - 0.45);
    }
    // dra in direkt, släpp ut mjukt
    if (want < this.curDist) this.curDist = want;
    else this.curDist += (want - this.curDist) * Math.min(1, dt * 2.5);
    _des.copy(this.target).addScaledVector(_dir, this.curDist);
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 40;
      _des.x += Math.sin(this.shakeT * 1.3) * this.shakeAmt * 0.3;
      _des.y += Math.sin(this.shakeT * 1.7 + 1) * this.shakeAmt * 0.3;
      this.shakeAmt *= Math.exp(-dt * 7);
    }
    cam.position.copy(_des);
    cam.lookAt(this.target);
  }
  /** Kamerarelaterade riktningar för styrning. */
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
}
