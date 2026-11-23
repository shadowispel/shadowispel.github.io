/* Rävens äventyr – bossar med faser och tydliga svaga punkter. */
import * as THREE from 'three';
import { buildEnemy, P, G as Grp, outline, UG } from './models.js';
import { toon, basic } from './core.js';
import { enemy } from './enemies.js';
import { glow } from './fx.js';

const V3 = THREE.Vector3;
const _v = new V3(), _o = new V3(), _dn = new V3(0, -1, 0);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

class Boss {
  constructor(W, center, o) {
    this.W = W; this.c = center.clone(); this.o = o;
    this.maxHp = o.hp || 3;
    this.arenaR = o.arenaR || 16;
    this.minions = [];
    W.add(this);
  }
  baseReset() {
    this.hp = this.maxHp; this.active = false; this.state = 'idle'; this.t = 0; this.stateT = 0; this.flash = 0; this.dead = false; this.done = false;
    this.minions.forEach(m => { m.dead = true; m.obj.visible = false; });
  }
  inArena(G) { const p = G.player.pos; return Math.hypot(p.x - this.c.x, p.z - this.c.z) < this.arenaR - 1.5 && Math.abs(p.y - this.c.y) < (this.o.arenaH || 6); }
  checkActivate(G) {
    if (this.done) return false;
    if (!this.active && this.inArena(G) && G.player.state !== 'dead') {
      this.active = true; this.W.bossActive = true; this.state = 'intro'; this.stateT = 0;
      G.music('boss'); G.bossBar(this.o.name, 1);
      G.toast(this.o.intro || this.o.name, { big: true, ms: 2600 });
      if (this.onActivate) this.onActivate(G);
    }
    if (this.active) {
      const p = G.player.pos;
      if (Math.hypot(p.x - this.c.x, p.z - this.c.z) > this.arenaR + 14 || p.y < this.c.y - 12) { this.reset(); G.bossBar(null); G.music(this.W.def.music); this.W.bossActive = false; }
    }
    return this.active;
  }
  damage(G) {
    this.hp--; this.flash = 0.5;
    // efter en lyckad träff: knuffa Ylva bort från bossen och ge kort skydd, så att man inte straffas direkt
    const pl = G.player, bp = this.headP || this.p;
    if (bp) {
      _v.set(pl.pos.x - bp.x, 0, pl.pos.z - bp.z);
      if (_v.lengthSq() < 0.01) _v.set(Math.sin(pl.face), 0, Math.cos(pl.face)).negate();
      _v.normalize(); pl.vel.x = _v.x * 7; pl.vel.z = _v.z * 7;
    }
    pl.invuln = Math.max(pl.invuln, 1.0);
    G.audio.play('hit'); G.audio.play('explode', { vol: 0.5 });
    G.shake(0.5);
    G.bossBar(this.o.name, this.hp / this.maxHp);
    if (this.hp <= 0) { this.defeat(G); return true; }
    G.toast(this.hp === 1 ? 'Ett slag till!' : 'Träff!', { ms: 1200 });
    return false;
  }
  defeat(G) {
    this.done = true; this.active = false; this.state = 'dying'; this.stateT = 0;
    this.W.bossActive = false;
    G.bossBar(null);
    G.audio.play('boom');
    this.minions.forEach(m => { if (!m.dead) m.kill(G); });
    setTimeout(() => { if (G.world === this.W) { G.music(this.W.def.music); this.W.revealStone(this.o.stone); if (this.onDefeated) this.onDefeated(G); } }, 1600);
  }
  resetVisit() { this.reset(); }
  spawnMinion(kind, x, y, z, o) {
    const m = enemy(this.W, kind, x, y, z, o || { radius: this.arenaR - 3 });
    m.resetVisit = () => { m.dead = true; m.obj.visible = false; };
    this.minions.push(m);
    this.W.G.fx.burst(x, y + 0.5, z, 14, { speed: 4, color: 0xffffff, size: 0.6, life: 0.5 });
    return m;
  }
  flashObj(obj, dt) {
    if (this.flash > 0) { this.flash -= dt; obj.visible = Math.floor(this.flash * 20) % 2 === 0; } else obj.visible = true;
  }
  dizzy(G, x, y, z) { if (Math.random() < 0.4) { const a = this.t * 6; G.fx.emit(x + Math.cos(a) * 1.2, y, z + Math.sin(a) * 1.2, { life: 0.4, size: 0.4, size1: 0.1, color: 0xffe066 }); } }
}

/* ====================================================================== Taggsvinet Torbjörn (Blåbärsskogen) */
export class Torbjorn extends Boss {
  constructor(W, c, o) {
    super(W, c, Object.assign({ name: 'Taggsvinet Torbjörn', intro: 'Taggsvinet Torbjörn!', hp: 3 }, o));
    this.rig = buildEnemy('taggsvin');
    this.obj = new THREE.Group(); this.obj.add(this.rig.root);
    this.rig.root.scale.setScalar(3);
    // krona
    const crown = Grp(this.rig.body, [0, 0.42, 0.25]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P(crown, 'cone', toon(0xffcc33, { emissive: 0x805000, emissiveIntensity: 0.5 }), [Math.cos(a) * 0.12, 0.08, Math.sin(a) * 0.12], [0.05, 0.16, 0.05]); }
    P(crown, 'cyl', toon(0xffcc33), [0, 0, 0], [0.15, 0.06, 0.15]);
    // mage (svag punkt) – syns när han ligger på rygg
    this.belly = P(this.rig.body, 'sph', toon(0xffb0a0, { emissive: 0x803020, emissiveIntensity: 0.4 }), [0, -0.3, 0], [0.38, 0.12, 0.4]);
    W.group.add(this.obj);
    this.reset();
  }
  reset() {
    this.baseReset();
    this.p = this.c.clone(); this.p.z -= 6; this.face = 0; this.v = new V3(); this.spikeT = 4;
    this.obj.visible = true; this.obj.scale.setScalar(1); this.rig.root.rotation.set(0, 0, 0);
  }
  update(dt, G) {
    if (this.state === 'dying') {
      this.stateT += dt;
      this.obj.scale.setScalar(Math.max(0.01, 1 - this.stateT));
      this.obj.rotation.y += dt * 12;
      if (this.stateT > 1) { this.obj.visible = false; this.state = 'gone'; G.fx.burst(this.p.x, this.p.y + 1, this.p.z, 40, { speed: 8, color: [0x6a4a30, 0xf2e2c0, 0xffcc33], size: 0.6, life: 1 }); }
      return;
    }
    if (this.state === 'gone') return;
    this.t += dt; this.stateT += dt;
    const pl = G.player;
    const active = this.checkActivate(G);
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z, dist = Math.hypot(dx, dz);
    const phase = this.maxHp - this.hp; // 0,1,2
    const R = this.rig;
    R.body.rotation.x = 0; R.body.rotation.z = 0;
    if (!active) { this.face += angDiff(this.face, Math.atan2(dx, dz)) * Math.min(1, dt * 2); }
    else switch (this.state) {
      case 'intro': if (this.stateT > 1.5) { this.state = 'aim'; this.stateT = 0; } break;
      case 'aim': {
        this.face += Math.max(-dt * 4, Math.min(dt * 4, angDiff(this.face, Math.atan2(dx, dz))));
        R.body.rotation.z = Math.sin(this.t * 40) * 0.08;
        if (Math.random() < 0.3) G.fx.dust(this.p.x - Math.sin(this.face) * 2, this.p.y, this.p.z - Math.cos(this.face) * 2, 1);
        if (phase >= 1) { this.spikeT -= dt; if (this.spikeT <= 0) { this.spikeT = 5 - phase; this.spikes(G); } }
        if (this.stateT > 1.3 - phase * 0.25) { this.state = 'charge'; this.stateT = 0; G.audio.play('whoosh', { pitch: 0.5 }); }
        break;
      }
      case 'charge': {
        const sp = [15, 19, 23][phase];
        if (phase >= 1) this.face += Math.max(-dt * 0.9, Math.min(dt * 0.9, angDiff(this.face, Math.atan2(dx, dz))));
        this.p.x += Math.sin(this.face) * sp * dt; this.p.z += Math.cos(this.face) * sp * dt;
        if (Math.random() < 0.6) G.fx.dust(this.p.x, this.p.y, this.p.z, 1);
        // pelare?
        for (const pi of this.o.pillars) {
          if (Math.hypot(pi.x - this.p.x, pi.z - this.p.z) < 3.3) {
            this.state = 'stunned'; this.stateT = 0;
            G.audio.play('boom'); G.shake(0.6);
            G.fx.burst(this.p.x, 2, this.p.z, 20, { speed: 6, color: 0x9a9088, size: 0.6, life: 0.7 });
            _v.set(this.p.x - pi.x, 0, this.p.z - pi.z).normalize(); this.p.x = pi.x + _v.x * 3.4; this.p.z = pi.z + _v.z * 3.4;
            G.toast('Han är yr – hoppa på magen!', { ms: 1600 });
            break;
          }
        }
        if (this.state !== 'charge') break;
        const dc = Math.hypot(this.p.x - this.c.x, this.p.z - this.c.z);
        if (dc > this.arenaR - 2.5) { _v.set(this.c.x - this.p.x, 0, this.c.z - this.p.z).normalize(); this.p.x += _v.x * 0.5; this.p.z += _v.z * 0.5; this.state = 'stagger'; this.stateT = 0; G.audio.play('land'); G.shake(0.3); }
        if (this.stateT > 3.5) { this.state = 'aim'; this.stateT = 0; }
        break;
      }
      case 'stagger': this.face += dt * 6; if (this.stateT > 0.8) { this.state = 'aim'; this.stateT = 0; } break;
      case 'stunned': {
        R.body.rotation.x = Math.PI; // på rygg
        this.dizzy(G, this.p.x, this.p.y + 3, this.p.z);
        // svag punkt: magen
        const top = this.p.y + 2.2;
        const atk = pl.attackHit(_v.set(this.p.x, this.p.y + 1.3, this.p.z), 1.6);
        if (pl.stompCheck(this.p, 1.9, top) || atk) {
          pl.bounce(13);
          if (!this.damage(G)) { this.state = 'recover'; this.stateT = 0; if (this.hp === 1) { this.spawnMinion('taggsvin', this.c.x - 5, this.c.y, this.c.z + 3); this.spawnMinion('taggsvin', this.c.x + 5, this.c.y, this.c.z + 3); } }
        }
        if (this.stateT > 3.4) { this.state = 'recover'; this.stateT = 0; }
        break;
      }
      case 'recover': {
        R.body.rotation.x = Math.PI * Math.max(0, 1 - this.stateT * 2);
        if (this.stateT > 0.5 && phase >= 1 && !this.spun) { this.spun = true; this.spikes(G); }
        if (this.stateT > 1) { this.state = 'aim'; this.stateT = 0; this.spun = false; }
        break;
      }
    }
    // kontaktskada
    if (active && this.state !== 'stunned' && this.state !== 'intro' && pl.state !== 'dead') {
      if (dist < 2.6 && pl.pos.y < this.p.y + 2.4) pl.damage(this.p);
    }
    this.obj.position.copy(this.p);
    this.obj.rotation.y = this.face;
    this.rig.root.position.y = this.state === 'charge' ? Math.abs(Math.sin(this.t * 20)) * 0.2 : 0;
    if (R.feet) R.feet.forEach((f, i) => { f.position.y = 0.06 + (this.state === 'charge' ? Math.max(0, Math.sin(this.t * 25 + i * 3)) * 0.15 : 0); });
    this.flashObj(this.obj, dt);
  }
  spikes(G) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + this.t;
      this.W.projectiles.spawn('spike', _o.set(this.p.x + Math.sin(a) * 2, this.p.y + 0.7, this.p.z + Math.cos(a) * 2), _v.set(Math.sin(a) * 9, 0.5, Math.cos(a) * 9), { g: 1, life: 2.4, r: 0.3 });
    }
    G.audio.play('zap', { pitch: 0.6 });
  }
}
export { Boss };

/* ====================================================================== Grottmasken Gnistra (Kristallgrottan) */
export class Gnistra extends Boss {
  constructor(W, c, o) {
    super(W, c, Object.assign({ name: 'Grottmasken Gnistra', intro: 'Grottmasken Gnistra!', hp: 3 }, o));
    this.holes = o.holes.map(h => new V3(h[0], c.y, h[1]));
    this.obj = new THREE.Group(); W.group.add(this.obj);
    this.segs = [];
    const bm = toon(0x7a4aa0), cm = toon(0xff80e0, { emissive: 0xa03080, emissiveIntensity: 0.8 });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Group();
      P(s, 'sph', bm, [0, 0, 0], 0.95 - i * 0.04);
      if (i % 2 === 0) P(s, 'oct', cm, [0, 0.8, 0], [0.25, 0.45, 0.25]);
      this.obj.add(s); this.segs.push(s);
    }
    const head = this.head = new THREE.Group();
    P(head, 'sph', bm, [0, 0, 0], [1.25, 1.1, 1.3]);
    P(head, 'sph', toon(0x2a1030), [0, -0.2, 0.9], [0.7, 0.35, 0.4]);
    for (const sx of [-1, 1]) { P(head, 'sph', basic(0xffffff), [sx * 0.45, 0.35, 1.0], 0.22); P(head, 'sph', basic(0x200020), [sx * 0.45, 0.35, 1.18], 0.1); }
    this.crystal = P(head, 'oct', cm, [0, 1.35, 0], [0.5, 0.9, 0.5]);
    this.crystalGlow = glow(0xff80e0, 3, 0.7); this.crystalGlow.position.set(0, 1.4, 0); head.add(this.crystalGlow);
    this.obj.add(head);
    outline(this.obj, 0.04);
    this.reset();
  }
  reset() {
    this.baseReset();
    this.hole = this.holes[0]; this.headP = this.hole.clone(); this.headP.y -= 3; this.obj.visible = true; this.shardT = 0;
    this.state = 'under'; this.stateT = 0;
  }
  update(dt, G) {
    const pl = G.player;
    if (this.state === 'gone') return;
    this.t += dt; this.stateT += dt;
    if (this.state === 'dying') { this.headP.y -= dt * 4; this._pose(1); if (this.stateT > 1.5) { this.state = 'gone'; this.obj.visible = false; } return; }
    const active = this.checkActivate(G);
    const phase = this.maxHp - this.hp;
    const h = this.hole, up = h.clone(); up.y += 6;
    let k = 0;
    if (!active) { this.headP.copy(h); this.headP.y -= 3; this._pose(0); return; }
    switch (this.state) {
      case 'intro': case 'under': {
        if (this.stateT > (this.state === 'intro' ? 1.2 : 1.0 - phase * 0.2)) {
          const sorted = this.holes.slice().sort((a, b) => a.distanceTo(pl.pos) - b.distanceTo(pl.pos));
          this.hole = sorted[Math.min(sorted.length - 1, 1 + Math.floor(Math.random() * 2))];
          this.state = 'rumble'; this.stateT = 0;
        }
        this.headP.copy(this.hole); this.headP.y -= 3; break;
      }
      case 'rumble':
        if (Math.random() < 0.6) G.fx.dust(h.x + (Math.random() - 0.5) * 2, h.y, h.z + (Math.random() - 0.5) * 2, 1, 0xc0a0ff);
        G.shake(0.05);
        if (this.stateT > 0.9) { this.state = 'rise'; this.stateT = 0; G.audio.play('boom', { vol: 0.4, pitch: 1.3 }); }
        this.headP.copy(h); this.headP.y -= 3; break;
      case 'rise': k = Math.min(1, this.stateT / 0.5); this.headP.lerpVectors(_v.copy(h).setY(h.y - 3), up, k); if (k >= 1) { this.state = 'sway'; this.stateT = 0; this.shot = false; } break;
      case 'sway': {
        _v.set(pl.pos.x - h.x, 0, pl.pos.z - h.z); const d = Math.min(_v.length(), 8); _v.normalize();
        this.headP.set(h.x + _v.x * 1.5 + Math.sin(this.t * 3) * 0.6, up.y + Math.sin(this.t * 2) * 0.4, h.z + _v.z * 1.5);
        this.target = new V3(h.x + _v.x * Math.max(3, d), h.y + 0.9, h.z + _v.z * Math.max(3, d));
        if (phase >= 1 && !this.shot && this.stateT > 0.6) { this.shot = true; for (let i = -2; i <= 2; i++) { const a = Math.atan2(_v.x, _v.z) + i * 0.3; this.W.projectiles.spawn('crystal', this.headP, new V3(Math.sin(a) * 10, 4, Math.cos(a) * 10), { g: 14, life: 3 }); } G.audio.play('zap', { pitch: 1.2 }); }
        if (this.stateT > 1.6 - phase * 0.3) { this.state = 'slam'; this.stateT = 0; this.from = this.headP.clone(); }
        break;
      }
      case 'slam': k = Math.min(1, this.stateT / 0.32); this.headP.lerpVectors(this.from, this.target, k * k); this.headP.y += Math.sin(k * Math.PI) * 1.5;
        if (k >= 1) { this.state = 'stuck'; this.stateT = 0; G.audio.play('boom'); G.shake(0.6); G.shock.spawn(this.target.x, h.y, this.target.z, 9, 0xff80e0, 0.9, { hurt: true }); G.fx.burst(this.target.x, h.y + 0.5, this.target.z, 20, { speed: 6, color: [0xc0a0ff, 0x8a7a8a], size: 0.5, life: 0.7 }); if (phase >= 2) this.rockRain(G); }
        break;
      case 'stuck': {
        this.headP.copy(this.target); this.headP.y = h.y + 0.9 + Math.sin(this.t * 10) * 0.05;
        this.dizzy(G, this.headP.x, this.headP.y + 2.2, this.headP.z);
        const top = this.headP.y + 1.9;
        const atk = pl.attackHit(_v.copy(this.headP).setY(this.headP.y + 1.2), 1.2);
        if ((pl.stompCheck(this.headP, 1.4, top) || atk) && this.stateT > 0.25) {
          pl.bounce(13);
          if (!this.damage(G)) { this.state = 'retract'; this.stateT = 0; this.from = this.headP.clone(); }
          else { this.state = 'dying'; this.stateT = 0; }
        }
        if (this.stateT > 2.8) { this.state = 'retract'; this.stateT = 0; this.from = this.headP.clone(); }
        break;
      }
      case 'retract': k = Math.min(1, this.stateT / 0.6); this.headP.lerpVectors(this.from, _v.copy(h).setY(h.y - 3), k); if (k >= 1) { this.state = 'under'; this.stateT = 0; } break;
    }
    this._pose(this.state === 'stuck' ? 1 : 0);
    // kontaktskada (kroppen)
    if (this.state !== 'under' && this.state !== 'rumble' && this.state !== 'intro' && this.state !== 'stuck' && this.state !== 'dying') {
      for (let i = 0; i < this.segs.length + 1; i++) {
        const sp = i < this.segs.length ? this.segs[i].position : this.headP;
        if (sp.y < h.y - 0.5) continue;
        if (_o.set(pl.pos.x, pl.pos.y + 0.7, pl.pos.z).distanceTo(sp) < 1.5) { pl.damage(sp); break; }
      }
    }
    this.flashObj(this.obj, dt);
  }
  _pose() {
    const h = this.hole, base = _o.copy(h).setY(h.y - 2.5);
    const ctrl = new V3(h.x, Math.max(h.y + 3, this.headP.y + 1.5), h.z);
    for (let i = 0; i < this.segs.length; i++) {
      const t = (i + 1) / (this.segs.length + 1);
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      this.segs[i].position.set(base.x * a + ctrl.x * b + this.headP.x * c, base.y * a + ctrl.y * b + this.headP.y * c, base.z * a + ctrl.z * b + this.headP.z * c);
      this.segs[i].visible = this.segs[i].position.y > h.y - 1.2;
    }
    this.head.position.copy(this.headP);
    this.head.visible = this.headP.y > h.y - 1.5;
    const pl = this.W.G.player.pos;
    this.head.rotation.y = Math.atan2(pl.x - this.headP.x, pl.z - this.headP.z);
    this.head.rotation.x = this.state === 'stuck' ? 0.5 : 0;
  }
  rockRain(G) {
    const pl = G.player.pos;
    for (let i = 0; i < 4; i++) {
      const x = pl.x + (Math.random() - 0.5) * 8, z = pl.z + (Math.random() - 0.5) * 8;
      this.W.projectiles.spawn('rock', new V3(x, this.c.y + 16 + i * 3, z), new V3(0, -2, 0), { g: 20, life: 4 });
    }
  }
}

/* ====================================================================== Snökungen Frost (Isfjället) */
export class Frost extends Boss {
  constructor(W, c, o) {
    super(W, c, Object.assign({ name: 'Snökungen Frost', intro: 'Snökungen Frost!', hp: 3 }, o));
    this.rig = buildEnemy('snogubbe');
    this.obj = new THREE.Group(); this.obj.add(this.rig.root); this.rig.root.scale.setScalar(3.2);
    const head = this.rig.parts.head;
    const crown = this.crown = Grp(head, [0, 0.62, 0]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P(crown, 'oct', toon(0x9ae8ff, { emissive: 0x2080c0, emissiveIntensity: 0.7 }), [Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15], [0.05, 0.14, 0.05]); }
    W.group.add(this.obj);
    this.reset();
  }
  reset() { this.baseReset(); this.p = this.c.clone(); this.p.z -= 8; this.face = 0; this.throwT = 2; this.stompT = 5; this.kneel = 0; this.obj.visible = true; this.obj.scale.setScalar(1); }
  update(dt, G) {
    const pl = G.player;
    if (this.state === 'gone') return;
    this.t += dt; this.stateT += dt;
    if (this.state === 'dying') { this.obj.scale.y = Math.max(0.01, 1 - this.stateT); if (this.stateT > 1) { this.state = 'gone'; this.obj.visible = false; G.fx.burst(this.p.x, this.p.y + 2, this.p.z, 50, { speed: 9, color: 0xffffff, size: 0.8, life: 1.2 }); } return; }
    const active = this.checkActivate(G);
    const phase = this.maxHp - this.hp;
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z;
    if (this.state !== 'stunned') this.face += Math.max(-dt * 2, Math.min(dt * 2, angDiff(this.face, Math.atan2(dx, dz))));
    if (active) {
      if (this.state === 'intro' && this.stateT > 1.5) { this.state = 'fight'; this.stateT = 0; }
      if (this.state === 'fight') {
        // glid runt långsamt
        const a = this.t * 0.25; const tx = this.c.x + Math.sin(a) * 6, tz = this.c.z + Math.cos(a) * 6;
        this.p.x += (tx - this.p.x) * dt * 0.5; this.p.z += (tz - this.p.z) * dt * 0.5;
        this.throwT -= dt;
        if (this.throwT <= 0.5 && !this.windup) { this.windup = true; G.audio.play('whoosh', { pitch: 0.5 }); }
        if (this.throwT <= 0) {
          this.windup = false; this.throwT = 3.6 - phase * 0.7;
          _v.set(dx, 0, dz).normalize();
          const from = new V3(this.p.x + _v.x * 3, this.p.y + 1.3, this.p.z + _v.z * 3);
          const self = this;
          this.W.projectiles.spawn('bigsnow', from, new V3(_v.x * (8 + phase * 1.5), 0, _v.z * (8 + phase * 1.5)), { roll: true, floor: this.c.y, g: 0, life: 6, r: 1.3, owner: this,
            onHit: m => { if (m.p.distanceTo(_o.set(self.p.x, self.p.y + 2, self.p.z)) < 3.2) { self.stun(G); return true; } return false; } });
          if (phase >= 2) for (let i = -1; i <= 1; i += 2) { const a2 = Math.atan2(_v.x, _v.z) + i * 0.35; const T = 1; this.W.projectiles.spawn('snowball', new V3(this.p.x, this.p.y + 5, this.p.z), new V3(Math.sin(a2) * 12, 8, Math.cos(a2) * 12), { life: 3 }); void T; }
        }
        if (phase >= 1) {
          this.stompT -= dt;
          if (this.stompT <= 0) { this.stompT = 6 - phase; this.state = 'stomp'; this.stateT = 0; }
        }
      }
      if (this.state === 'stomp') {
        this.rig.root.position.y = Math.sin(Math.min(1, this.stateT / 0.6) * Math.PI) * 2;
        if (this.stateT > 0.6 && !this.stomped) { this.stomped = true; G.audio.play('boom'); G.shake(0.7); G.shock.spawn(this.p.x, this.c.y, this.p.z, 16, 0xbfefff, 1.6, { hurt: true }); }
        if (this.stateT > 1.2) { this.state = 'fight'; this.stomped = false; this.rig.root.position.y = 0; }
      }
      if (this.state === 'stunned') {
        this.kneel = Math.min(1, this.kneel + dt * 3);
        this.dizzy(G, this.p.x, this.p.y + 6.2 - this.kneel * 2.8, this.p.z);
        const top = this.p.y + 6.6 - this.kneel * 3.1;
        const hp = _v.set(this.p.x, top - 0.8, this.p.z);
        const atk = pl.attackHit(hp, 1.2);
        if ((pl.stompCheck(this.p, 1.6, top) || (atk && pl.pos.y > top - 2.5)) && this.stateT > 0.3) {
          pl.bounce(14);
          if (!this.damage(G)) { this.state = 'fight'; this.stateT = 0; this.throwT = 2.5; }
          else { this.state = 'dying'; this.stateT = 0; }
        }
        if (this.stateT > 4) { this.state = 'fight'; this.stateT = 0; }
      } else this.kneel = Math.max(0, this.kneel - dt * 2);
      // kontakt
      if (this.state !== 'stunned' && this.state !== 'intro' && Math.hypot(dx, dz) < 2.6 && pl.pos.y < this.p.y + 5) pl.damage(this.p);
    }
    this.rig.body.position.y = -this.kneel * 2.8 / 3.2;
    this.rig.body.rotation.x = this.kneel * 0.25;
    this.rig.arms[0].rotation.z = 0.9 + (this.windup ? -1.8 : 0);
    this.crown.rotation.y = this.t;
    this.obj.position.copy(this.p); this.obj.rotation.y = this.face;
    this.flashObj(this.obj, dt);
  }
  stun(G) { if (this.state === 'stunned' || !this.active) return; this.state = 'stunned'; this.stateT = 0; G.audio.play('boom'); G.toast('Han är omtöcknad – hoppa på kronan!', { ms: 1800 }); }
}

/* ====================================================================== Krabbkungen Klabbe (Skärgårdsöarna) */
export class Klabbe extends Boss {
  constructor(W, c, o) {
    super(W, c, Object.assign({ name: 'Krabbkungen Klabbe', intro: 'Krabbkungen Klabbe!', hp: 3 }, o));
    this.rig = buildEnemy('krabba');
    this.obj = new THREE.Group(); this.obj.add(this.rig.root); this.rig.root.scale.setScalar(3.4);
    const crown = Grp(this.rig.body, [0, 0.3, 0]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P(crown, 'cone', toon(0xffcc33), [Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14], [0.04, 0.12, 0.04]); }
    this.weak = this.rig.claws.map(c => { const g = glow(0xffe066, 1.2, 0); g.position.set(0, 0.2, 0.15); c.add(g); return g; });
    W.group.add(this.obj);
    this.reset();
  }
  reset() { this.baseReset(); this.p = this.c.clone(); this.p.z -= 6; this.face = 0; this.atkT = 2; this.bubT = 4; this.slamClaw = 0; this.obj.visible = true; this.obj.scale.setScalar(1); this.rig.claws.forEach(c => c.rotation.set(0, 0, 0)); }
  clawWorld(i, out) { this.rig.claws[i].updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.rig.claws[i].matrixWorld); }
  update(dt, G) {
    const pl = G.player;
    if (this.state === 'gone') return;
    this.t += dt; this.stateT += dt;
    if (this.state === 'dying') { this.obj.rotation.z += dt * 3; this.obj.position.y -= dt * 2; if (this.stateT > 1.4) { this.state = 'gone'; this.obj.visible = false; } return; }
    const active = this.checkActivate(G);
    const phase = this.maxHp - this.hp;
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z, dist = Math.hypot(dx, dz);
    const R = this.rig;
    this.weak.forEach(w => { w.material.opacity = 0; });
    if (active) {
      if (this.state === 'intro' && this.stateT > 1.5) { this.state = 'walk'; this.stateT = 0; }
      if (this.state === 'walk') {
        this.face += Math.max(-dt * 1.5, Math.min(dt * 1.5, angDiff(this.face, Math.atan2(dx, dz))));
        // går i sidled mot spelaren
        const sp = (3 + phase * 1.2) * (dist > 5 ? 1 : 0);
        this.p.x += dx / Math.max(dist, 0.1) * sp * dt; this.p.z += dz / Math.max(dist, 0.1) * sp * dt;
        const dc = Math.hypot(this.p.x - this.c.x, this.p.z - this.c.z); if (dc > this.arenaR - 4) { this.p.x = this.c.x + (this.p.x - this.c.x) / dc * (this.arenaR - 4); this.p.z = this.c.z + (this.p.z - this.c.z) / dc * (this.arenaR - 4); }
        R.root.rotation.z = Math.sin(this.t * 10) * 0.04;
        this.atkT -= dt;
        if (this.atkT <= 0 && dist < 11) { this.state = 'raise'; this.stateT = 0; this.slamClaw = (Math.random() < 0.5) ? 0 : 1; this.target = new V3(pl.pos.x, this.c.y, pl.pos.z); G.audio.play('error', { pitch: 0.6 }); }
        if (phase >= 1) { this.bubT -= dt; if (this.bubT <= 0) { this.bubT = 4.5 - phase; for (let i = -2; i <= 2; i++) { const a = Math.atan2(dx, dz) + i * 0.28; this.W.projectiles.spawn('bubble', new V3(this.p.x, this.p.y + 2.5, this.p.z), new V3(Math.sin(a) * 6, 1, Math.cos(a) * 6), { g: 0.5, life: 4, r: 0.45 }); } G.audio.play('splash', { vol: 0.5 }); } }
      }
      if (this.state === 'raise') {
        this.face += angDiff(this.face, Math.atan2(this.target.x - this.p.x, this.target.z - this.p.z)) * Math.min(1, dt * 5);
        R.claws[this.slamClaw].rotation.x = -Math.min(1, this.stateT / 0.8) * 1.4;
        if (this.stateT > 0.9 - phase * 0.15) { this.state = 'slam'; this.stateT = 0; }
      }
      if (this.state === 'slam') {
        R.claws[this.slamClaw].rotation.x = -1.4 + Math.min(1, this.stateT / 0.15) * 2.1;
        if (this.stateT > 0.15) { this.state = 'stuck'; this.stateT = 0; G.audio.play('boom'); G.shake(0.5); const cw = this.clawWorld(this.slamClaw, new V3()); G.shock.spawn(cw.x, this.c.y, cw.z, 5, 0xffe0a0, 0.6, { hurt: true }); G.fx.burst(cw.x, this.c.y + 0.3, cw.z, 20, { speed: 5, color: 0xf0e0b0, size: 0.6, life: 0.7 }); }
      }
      if (this.state === 'stuck') {
        R.claws[this.slamClaw].rotation.x = 0.7 + Math.sin(this.t * 30) * 0.04;
        this.weak[this.slamClaw].material.opacity = 0.6 + Math.sin(this.t * 10) * 0.3;
        const cw = this.clawWorld(this.slamClaw, new V3());
        const atk = pl.attackHit(cw, 1.0);
        if ((atk || pl.stompCheck(cw, 1.2, cw.y + 0.8)) && this.stateT > 0.2) {
          if (pl.vel.y < 0) pl.bounce(12);
          if (!this.damage(G)) { this.state = 'recoil'; this.stateT = 0; if (this.hp === 1) { this.spawnMinion('krabba', this.c.x - 6, this.c.y, this.c.z); this.spawnMinion('krabba', this.c.x + 6, this.c.y, this.c.z); } }
          else { this.state = 'dying'; this.stateT = 0; }
        }
        if (this.stateT > 2.6 - phase * 0.4) { this.state = 'recoil'; this.stateT = 0; }
      }
      if (this.state === 'recoil') { R.claws[this.slamClaw].rotation.x *= Math.exp(-dt * 6); if (this.stateT > 0.6) { this.state = 'walk'; this.atkT = 2 - phase * 0.4; } }
      if (this.state !== 'stuck' && this.state !== 'intro' && dist < 3.2 && pl.pos.y < this.p.y + 2.6) pl.damage(this.p);
    }
    R.claws.forEach((c, i) => { if (i !== this.slamClaw || this.state === 'walk') c.rotation.z = Math.sin(this.t * 4 + i) * 0.2; });
    this.obj.position.copy(this.p); this.obj.rotation.y = this.face;
    this.flashObj(this.obj, dt);
  }
}

/* ====================================================================== Korpen Kaos (Stormtornet) */
export class Kaos extends Boss {
  constructor(W, c, o) {
    super(W, c, Object.assign({ name: 'Korpen Kaos', intro: 'Korpen Kaos!', hp: 3, arenaH: 12 }, o));
    this.obj = new THREE.Group();
    const b = this.body = Grp(this.obj, [0, 0, 0]);
    const k = toon(0x2a2040), k2 = toon(0x3a2f5a);
    P(b, 'sph', k, [0, 0, 0], [1.1, 1.0, 1.6]);
    P(b, 'sph', k2, [0, -0.2, 0.6], [0.8, 0.7, 0.8]);
    const head = this.headG = Grp(b, [0, 0.9, 1.3]);
    P(head, 'sph', k, [0, 0, 0], 0.75);
    P(head, 'cone', toon(0xe0b030), [0, -0.05, 0.9], [0.22, 0.8, 0.22], [Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) { P(head, 'sph', basic(0xff3a5a), [sx * 0.35, 0.2, 0.55], 0.13); P(head, 'box', toon(0x111111), [sx * 0.35, 0.42, 0.55], [0.35, 0.08, 0.08], [0, 0, sx * 0.4]); }
    for (let i = 0; i < 3; i++) P(head, 'cone', k2, [0, 0.6, -0.2 - i * 0.2], [0.12, 0.6, 0.12], [-0.6 - i * 0.2, 0, 0]);
    const neck = P(b, 'torus', toon(0xffcc33, { emissive: 0x805000, emissiveIntensity: 0.4 }), [0, 0.55, 1.0], [0.55, 0.55, 0.55], [1.2, 0, 0]);
    void neck;
    this.gem = P(b, 'oct', basic(0x8affc8), [0, 0.1, 1.55], [0.25, 0.4, 0.25]);
    this.wings = [];
    for (const sx of [-1, 1]) { const w = Grp(b, [sx * 0.9, 0.4, 0]); P(w, 'box', k, [sx * 1.6, 0, 0], [3.2, 0.12, 1.4]); P(w, 'box', k2, [sx * 2.8, 0, -0.4], [1.4, 0.1, 1.0]); this.wings.push(w); }
    P(b, 'cone', k, [0, 0.1, -1.8], [0.6, 1.4, 0.15], [-Math.PI / 2, 0, 0]);
    outline(this.obj, 0.04);
    W.group.add(this.obj);
    this.rods = o.rods || [];
    this.reset();
  }
  reset() { this.baseReset(); this.a = 0; this.p = new V3(this.c.x, this.c.y + 8, this.c.z - 10); this.featherT = 3; this.diveT = 6; this.obj.visible = true; this.obj.scale.setScalar(1); this.rods.forEach(r => r.discharge && r.discharge()); }
  update(dt, G) {
    const pl = G.player;
    if (this.state === 'gone') return;
    this.t += dt; this.stateT += dt;
    if (this.state === 'dying') { this.obj.rotation.z += dt * 4; this.p.y += dt * 6; this.obj.scale.setScalar(Math.max(0.01, 1 - this.stateT * 0.5)); this.obj.position.copy(this.p); if (this.stateT > 2) { this.state = 'gone'; this.obj.visible = false; } return; }
    const active = this.checkActivate(G);
    const phase = this.maxHp - this.hp;
    const flyR = 10, flyY = this.c.y + 7 + Math.sin(this.t * 1.3) * 1.2;
    let face = 0;
    if (!active || this.state === 'intro' || this.state === 'fly') {
      this.a += dt * (0.45 + phase * 0.12);
      const tx = this.c.x + Math.cos(this.a) * flyR, tz = this.c.z + Math.sin(this.a) * flyR;
      this.p.x += (tx - this.p.x) * Math.min(1, dt * 3); this.p.z += (tz - this.p.z) * Math.min(1, dt * 3); this.p.y += (flyY - this.p.y) * Math.min(1, dt * 3);
      face = Math.atan2(-Math.sin(this.a), Math.cos(this.a));
      if (active && this.state === 'intro' && this.stateT > 1.5) { this.state = 'fly'; this.stateT = 0; }
      if (active && this.state === 'fly') {
        this.featherT -= dt;
        if (this.featherT <= 0) {
          this.featherT = 2.6 - phase * 0.5;
          const n = 3 + phase * 2;
          _v.set(pl.pos.x - this.p.x, pl.pos.y + 0.6 - this.p.y, pl.pos.z - this.p.z).normalize();
          for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.16; const c = Math.cos(a), s = Math.sin(a); this.W.projectiles.spawn('feather', this.p, new V3((_v.x * c - _v.z * s) * 14, _v.y * 14, (_v.x * s + _v.z * c) * 14), { g: 2, life: 3 }); }
          G.audio.play('laser', { pitch: 0.5, vol: 0.5 });
        }
        this.diveT -= dt;
        if (this.diveT <= 0) { this.diveT = 7 - phase * 1.5; this.state = 'aim'; this.stateT = 0; G.audio.play('zap', { pitch: 0.4 }); G.toast('KRAAA!', { ms: 900 }); }
        if (phase >= 2 && Math.random() < dt * 0.8) { const x = pl.pos.x + (Math.random() - 0.5) * 10, z = pl.pos.z + (Math.random() - 0.5) * 10; this.W.projectiles.spawn('feather', new V3(x, this.c.y + 18, z), new V3(0, -10, 0), { g: 6, life: 4 }); }
        // blixtstänger
        for (const r of this.rods) if (r.charged && Math.hypot(r.p.x - this.p.x, r.p.z - this.p.z) < 7) { r.zap(G, this.p); this.state = 'fall'; this.stateT = 0; G.toast('Träffad av blixten! Hoppa på honom!', { ms: 1800 }); break; }
      }
    } else if (this.state === 'aim') {
      this.p.y += (this.c.y + 10 - this.p.y) * dt * 3;
      face = Math.atan2(pl.pos.x - this.p.x, pl.pos.z - this.p.z);
      if (this.stateT > 0.8) { this.state = 'dive'; this.stateT = 0; this.from = this.p.clone(); this.to = new V3(pl.pos.x, this.c.y + 0.8, pl.pos.z); this.dir = this.to.clone().sub(this.from).setY(0).normalize(); }
    } else if (this.state === 'dive') {
      const k = Math.min(1, this.stateT / 0.7);
      this.p.lerpVectors(this.from, this.to, k);
      face = Math.atan2(this.dir.x, this.dir.z);
      if (k >= 1) { this.state = 'swoop'; this.stateT = 0; }
    } else if (this.state === 'swoop') {
      this.p.x += this.dir.x * 16 * dt; this.p.z += this.dir.z * 16 * dt; this.p.y += 9 * dt;
      face = Math.atan2(this.dir.x, this.dir.z);
      if (this.stateT > 0.9) { this.state = 'fly'; this.stateT = 0; this.a = Math.atan2(this.p.z - this.c.z, this.p.x - this.c.x); }
    } else if (this.state === 'fall') {
      const dc = Math.hypot(this.p.x - this.c.x, this.p.z - this.c.z);
      if (dc > this.arenaR - 3) { this.p.x = this.c.x + (this.p.x - this.c.x) / dc * (this.arenaR - 3); this.p.z = this.c.z + (this.p.z - this.c.z) / dc * (this.arenaR - 3); }
      this.p.y = Math.max(this.c.y + 1, this.p.y - dt * 14);
      face = this.t * 2;
      if (this.p.y <= this.c.y + 1.01) { this.state = 'stunned'; this.stateT = 0; G.audio.play('boom'); G.shake(0.5); if (phase >= 1) G.shock.spawn(this.p.x, this.c.y, this.p.z, 10, 0xb08aff, 1.2, { hurt: true }); }
    } else if (this.state === 'stunned') {
      face = this.obj.rotation.y;
      this.dizzy(G, this.p.x, this.p.y + 2.2, this.p.z);
      const atk = pl.attackHit(_v.set(this.p.x, this.p.y + 0.5, this.p.z), 1.4);
      if ((pl.stompCheck(this.p, 1.8, this.p.y + 1.3) || atk) && this.stateT > 0.3) {
        pl.bounce(13);
        if (!this.damage(G)) { this.state = 'fly'; this.stateT = 0; this.rods.forEach(r => r.discharge(G)); }
        else { this.state = 'dying'; this.stateT = 0; }
      }
      if (this.stateT > 4) { this.state = 'fly'; this.stateT = 0; this.rods.forEach(r => r.discharge(G)); }
    }
    // kontakt
    if (active && this.state !== 'stunned' && this.state !== 'intro' && this.state !== 'fall' && pl.pos.distanceTo(_o.set(this.p.x, this.p.y - 0.7, this.p.z)) < 2.2) pl.damage(this.p);
    const flap = this.state === 'stunned' ? 0.1 : this.state === 'dive' ? 0.2 : 0.7;
    this.wings.forEach((w, i) => { w.rotation.z = Math.sin(this.t * (this.state === 'stunned' ? 3 : 8)) * flap * (i ? 1 : -1); });
    this.body.rotation.x = this.state === 'dive' ? 0.6 : this.state === 'stunned' ? -0.3 : 0;
    this.obj.position.copy(this.p);
    if (this.state !== 'stunned') this.obj.rotation.y = face;
    this.flashObj(this.obj, dt);
  }
}
