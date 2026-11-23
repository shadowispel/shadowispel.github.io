/**
 * Fjällracet – AI-förare: följer racinglinjen, bromsar inför kurvor, kör om, använder nitro.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AIDriver {
  /** opts: { skill (0.9–1), aggr (0–1), pace (svårighetsfaktor), rng } */
  constructor(car, track, opts) {
    this.car = car; this.tr = track;
    this.skill = opts.skill; this.aggr = opts.aggr; this.pace = opts.pace; this.rng = opts.rng || Math.random;
    this.offset = 0; this.offTarget = 0; this.bias = (this.rng() - 0.5) * 1.6;
    this.stuck = 0; this.reverseT = 0; this.nitroT = 0; this.wobble = this.rng() * 10;
    this.mistakeT = 0;
  }

  think(dt, cars, time) {
    const car = this.car, tr = this.tr, tp = car.tp, ctl = car.ctl;
    const N = tr.N, v = car.vf;
    const i = tp.i;
    // mål-punkt längs linjen
    const look = 7 + Math.abs(v) * 0.4;
    const j = (i + Math.round(look / tr.ds)) % N;
    // undanmanöver/omkörning
    this.offTarget *= Math.exp(-dt * 0.6);
    let blockedSpeed = Infinity;
    for (const o of cars) {
      if (o === car || o.finished) continue;
      let gap = o.progress - car.progress;
      if (gap < -tr.L / 2) gap += tr.L; else if (gap > tr.L / 2) gap -= tr.L;
      if (gap <= 0 || gap > 22) continue;
      const lat = o.tp.d - (tp.d);
      if (Math.abs(lat) < 2.7) {
        // välj sida med mest plats
        const roomL = tr.half + o.tp.d, roomR = tr.half - o.tp.d;
        const dir = roomR > roomL ? 1 : -1;
        const want = o.tp.d + dir * 3.3 - tr.lineO[j] - this.bias;
        this.offTarget = clamp(want, -tr.half, tr.half);
        if (gap < 9 && o.vf < v) blockedSpeed = Math.min(blockedSpeed, o.vf + (this.aggr > 0.7 ? 4 : 1.2));
      }
    }
    this.offset += (this.offTarget - this.offset) * Math.min(1, dt * 1.8);
    const lim = tr.half - 1.3;
    const o = clamp(tr.lineO[j] * (0.75 + 0.25 * this.skill) + this.bias * 0.6 + this.offset + Math.sin(time * 0.3 + this.wobble) * 0.4, -lim, lim);
    const P = tr.P, R = tr.R;
    const tx = P[j * 3] + R[j * 3] * o - car.pos.x;
    const tz = P[j * 3 + 2] + R[j * 3 + 2] * o - car.pos.z;
    const lx = tx * car.Rt.x + tz * car.Rt.z, lz = tx * car.F.x + tz * car.F.z;
    const ang = Math.atan2(lx, Math.max(0.1, lz));
    let steer = clamp(ang * 2.3 - car.yawRate * 0.12, -1, 1);

    // målfart
    const gripR = Math.sqrt(car.spec.grip / 14.5) * (car.spec.iceBonus && tr.grip < 0.8 ? 1.06 : 1);
    let lv = tr.lineV[(i + 2) % N]; for (let k = 3; k <= 8; k++) lv = Math.min(lv, tr.lineV[(i + k) % N] + k * 0.25);
    // personlig fart: skill 0.92–1.0 ger ca 6 % skillnad, så fältet sprids ut i stället för att köra i ett tåg
    let vt = lv * this.pace * (tr.def.aiPace || 1) * (1 - (1 - this.skill) * 0.75) * gripR * (car.rubber || 1);
    vt = Math.min(vt, car.spec.top * 1.1, blockedSpeed);
    if (this.mistakeT > 0) { this.mistakeT -= dt; vt *= 0.8; }
    else if (this.rng() < dt * 0.006 * (1.2 - this.skill) * 10) this.mistakeT = 0.8 + this.rng();
    let thr = 0, brk = 0;
    if (v < vt - 0.6) thr = 1; else if (v < vt + 0.8) thr = 0.35;
    if (v > vt + 1.4) brk = clamp((v - vt) / 7, 0.25, 1);

    // nitro på raksträckor
    if (this.nitroT > 0) this.nitroT -= dt;
    else if (car.nitro > 0.35 && v > 22 && tr.lineV[(i + 45) % N] > v + 10 && tr.lineV[(i + 20) % N] > v + 6 && this.rng() < dt * (0.4 + this.aggr * 0.6)) this.nitroT = 1.2 + this.rng() * 1.2;

    // fast? backa loss
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      ctl.throttle = 0; ctl.brake = 1; ctl.steer = -steer; ctl.hand = false; ctl.nitro = false;
      return;
    }
    if (Math.abs(v) < 1.5 && thr > 0 && car.raceActive) { this.stuck += dt; if (this.stuck > 1.4) { this.stuck = 0; this.reverseT = 1.1; } }
    else this.stuck = Math.max(0, this.stuck - dt);

    ctl.throttle = thr; ctl.brake = brk; ctl.steer = steer; ctl.hand = false; ctl.nitro = this.nitroT > 0;
  }
}
