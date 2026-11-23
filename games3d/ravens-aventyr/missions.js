/* Rävens äventyr – världsunika uppdrag: eskortera kycklingen Pip, pärlmusslor och klocktornets nedräkning. */
import * as THREE from 'three';
import { buildChick, P, outline, UG } from './models.js';
import { toon, basic } from './core.js';
import { glow } from './fx.js';

const V3 = THREE.Vector3;
const _v = new V3();
const HOSTILE = new Set(['svampis', 'taggsvin', 'bi', 'mas', 'spoklykta', 'fladdermus', 'krabba', 'krak']);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/* ====================================================================== Kycklingen Pip (eskort) */
export class Chick {
  /** home: var Pip står vilse. o: { hen: NPC, stone, name } */
  constructor(W, home, o) {
    this.W = W; this.home = home.clone(); this.o = o; this.name = o.name || 'Kycklingen Pip';
    this.rig = buildChick(); this.obj = this.rig.root;
    this.obj.traverse(m => { if (m.isMesh && !m.userData.isOutline) m.castShadow = true; });
    W.group.add(this.obj);
    this.marker = new THREE.Mesh(UG.cone, basic(0xffe14d)); this.marker.scale.set(0.13, -0.24, 0.13); this.marker.position.y = 1.05; this.marker.userData.sharedGeo = true;
    this.obj.add(this.marker);
    this.crumbs = [];
    this.done = !!o.done;
    this.reset();
    W.add(this);
  }
  reset() {
    this.state = this.done ? 'home' : 'lost';
    this.p = this.home.clone(); this.crumbs.length = 0; this.face = 0; this.t = Math.random() * 3; this.waitTold = false; this.moving = 0; this.scareT = 0; this.peepT = 2;
    if (this.done) this.p.copy(this.o.hen.obj.position).add(_v.set(0.9, 0, 0.7));
  }
  resetVisit() { if (this.state !== 'home') this.reset(); }
  interact(G) {
    if (this.state !== 'lost') return;
    G.dialog(this.name, ['Pip! Pip-pip! (Kycklingen tittar upp på dig med stora, blanka ögon.)', 'Hon har gått vilse. Led henne hem till Hönan Hulda på ängen vid starten – men gå inte för fort, och håll fienderna borta från henne!'], this, () => {
      this.state = 'follow'; this.crumbs.length = 0; this.waitTold = false;
      G.toast('Pip följer dig! Hon blir rädd för fiender.', { ms: 2600 });
      G.audio.play('select', { pitch: 1.8 });
    });
  }
  peep(G, vol = 0.5) { G.audio.tone({ freq: 2100 + Math.random() * 300, to: 2600, dur: 0.07, vol: 0.05 * vol, type: 'sine' }); G.audio.tone({ freq: 2300, to: 2900, dur: 0.06, vol: 0.04 * vol, type: 'sine', delay: 0.1 }); }
  update(dt, G) {
    const pl = G.player, hen = this.o.hen;
    this.t += dt;
    let speed = 0;
    if (this.state === 'home') {
      const hp = hen.obj.position;
      const a = this.t * 0.6;
      _v.set(hp.x + Math.cos(a) * 1.1, hp.y, hp.z + Math.sin(a) * 1.1);
      // springer fram till mamma och går sedan runt henne
      const dx = _v.x - this.p.x, dz = _v.z - this.p.z, dd = Math.hypot(dx, dz);
      if (dd > 0.4) { const st = Math.min(dd, 7 * dt); this.p.x += dx / dd * st; this.p.z += dz / dd * st; this.face = Math.atan2(dx, dz); speed = dd > 1 ? 7 : 1.2; }
      this.p.y += (hp.y - this.p.y) * Math.min(1, dt * 6);
    } else if (this.state === 'lost') {
      const a = this.t * 0.35;
      _v.set(this.home.x + Math.cos(a) * 0.8, this.home.y, this.home.z + Math.sin(a) * 0.8);
      this.p.lerp(_v, Math.min(1, dt * 2)); speed = 0.8; this.face = a + Math.PI;
      const d = Math.hypot(pl.pos.x - this.p.x, pl.pos.z - this.p.z);
      if (d < 18) { this.peepT -= dt; if (this.peepT <= 0) { this.peepT = 1.4 + Math.random(); this.peep(G, Math.max(0.2, 1 - d / 18)); } }
      if (d < 2.2 && Math.abs(pl.pos.y - this.p.y) < 2 && pl.onGround && !G.talkingTo) G.prompt(this, 'Hjälp kycklingen');
    } else if (this.state === 'scared') {
      this.scareT -= dt; speed = 8;
      this.p.x += Math.sin(this.face) * 8 * dt; this.p.z += Math.cos(this.face) * 8 * dt;
      if (Math.random() < 0.4) G.fx.emit(this.p.x, this.p.y + 0.3, this.p.z, { vy: 1, life: 0.5, size: 0.18, color: 0xffe14d });
      if (this.scareT <= 0) {
        G.fx.burst(this.p.x, this.p.y + 0.3, this.p.z, 12, { speed: 3, color: 0xffffff, size: 0.4, life: 0.4 });
        this.reset();
        G.toast('Pip sprang hela vägen tillbaka dit du hittade henne. Hämta henne igen!', { ms: 3200 });
      }
    } else {
      // följ Ylvas spår (brödsmulor) – Pip går dit Ylva har gått
      const last = this.crumbs.length ? this.crumbs[this.crumbs.length - 1] : this.p;
      if (pl.state !== 'dead' && pl.pos.distanceTo(last) > 0.5) { this.crumbs.push(pl.pos.clone()); if (this.crumbs.length > 600) this.crumbs.shift(); }
      const dP = this.p.distanceTo(pl.pos);
      if (this.state === 'follow' && dP > 16) { this.state = 'wait'; if (!this.waitTold) { this.waitTold = true; G.toast('Pip hinner inte med! Gå tillbaka till henne.', { ms: 2600 }); } this.peep(G, 1); }
      if (this.state === 'wait') { this.peepT -= dt; if (this.peepT <= 0) { this.peepT = 1.1; this.peep(G, 1); } if (dP < 7) this.state = 'follow'; }
      if (this.state === 'follow') {
        let budget = (dP > 4 ? 9.5 : dP > 2.2 ? 5.5 : 0) * dt;
        const ox = this.p.x, oz = this.p.z;
        while (budget > 0 && this.crumbs.length) {
          const c = this.crumbs[0], d = this.p.distanceTo(c);
          if (d <= budget) { this.p.copy(c); this.crumbs.shift(); budget -= d; } else { this.p.lerp(c, budget / d); budget = 0; }
        }
        const mx = this.p.x - ox, mz = this.p.z - oz;
        if (mx * mx + mz * mz > 1e-6) { this.face += angDiff(this.face, Math.atan2(mx, mz)) * Math.min(1, dt * 12); speed = Math.hypot(mx, mz) / dt; }
        // simma högst upp i vattnet
        const wl = this.W.waterAt(this.p.x, this.p.z);
        if (this.p.y < wl - 0.15) this.p.y = wl - 0.15;
      }
      // fara: en fiende för nära skrämmer Pip
      for (const e of this.W.ents) {
        if (!e.kind || !HOSTILE.has(e.kind) || e.dead || !e.p || !e.obj.visible) continue;
        if (Math.hypot(e.p.x - this.p.x, e.p.z - this.p.z) < 1.0 + (e.rig ? e.rig.r : 0.5) && Math.abs(e.p.y + (e.rig ? e.rig.h * 0.5 : 0.5) - this.p.y - 0.3) < 1.6) {
          this.state = 'scared'; this.scareT = 0.9; this.face = Math.atan2(this.p.x - e.p.x, this.p.z - e.p.z);
          G.audio.play('error', { pitch: 1.6, vol: 0.6 }); this.peep(G, 1.5);
          break;
        }
      }
      // hemma hos mamma?
      if (this.state !== 'scared' && Math.hypot(this.p.x - hen.obj.position.x, this.p.z - hen.obj.position.z) < 8.5) {
        this.state = 'home'; this.done = true; this.crumbs.length = 0;
        G.audio.play('levelup');
        G.fx.burst(this.p.x, this.p.y + 0.5, this.p.z, 24, { speed: 4, color: [0xffe14d, 0xffffff, 0xff9aa8], size: 0.4, life: 0.8 });
        if (this.o.onHome) this.o.onHome(G);
      }
    }
    // modell
    const hop = speed > 0.5 ? Math.abs(Math.sin(this.t * 14)) * 0.12 : 0;
    this.obj.position.set(this.p.x, this.p.y + hop, this.p.z);
    this.obj.rotation.y = this.face;
    const R = this.rig;
    R.legs[0].rotation.x = Math.sin(this.t * 14) * 0.7 * Math.min(1, speed / 3); R.legs[1].rotation.x = -R.legs[0].rotation.x;
    const flap = this.state === 'scared' || this.state === 'wait' || speed > 6 ? Math.sin(this.t * 30) * 0.7 : Math.sin(this.t * 3) * 0.08;
    R.wings[0].rotation.z = flap; R.wings[1].rotation.z = -flap;
    R.head.rotation.x = this.state === 'wait' ? -0.4 : Math.sin(this.t * 4) * 0.1;
    this.marker.visible = this.state === 'lost' || this.state === 'wait';
    if (this.marker.visible) { this.marker.rotation.y = this.t * 2; this.marker.position.y = 1.05 + Math.sin(this.t * 3) * 0.08; }
  }
}

/* ====================================================================== Pärlmussla */
const SHELL = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const PEARL = new THREE.SphereGeometry(0.22, 14, 10);
export class Clam {
  /** o: { phase, onGet(G) } */
  constructor(W, p, o = {}) {
    this.W = W; this.p = p.clone(); this.o = o; this.got = false; this.t = (o.phase || 0) * 4.6; this.nipCd = 0; this.open = 0;
    const g = this.obj = new THREE.Group(); g.position.copy(p); g.rotation.y = o.ry || 0;
    const shellMat = toon(o.color || 0xc89ad8);
    const bot = new THREE.Mesh(SHELL, shellMat); bot.scale.set(0.95, 0.35, 0.8); bot.rotation.x = Math.PI; bot.position.y = 0.32; bot.userData.sharedGeo = true; g.add(bot);
    this.lid = new THREE.Group(); this.lid.position.set(0, 0.32, -0.75); g.add(this.lid);
    const top = new THREE.Mesh(SHELL, shellMat); top.scale.set(0.95, 0.4, 0.8); top.position.set(0, 0, 0.75); top.userData.sharedGeo = true; this.lid.add(top);
    for (let i = -2; i <= 2; i++) P(top, 'box', 0xa878c0, [i * 0.18, 0.5, 0], [0.04, 0.5, 1.5], [0, 0, 0]).userData.noOutline = true;
    this.pearl = new THREE.Mesh(PEARL, basic(0xfaf6ff)); this.pearl.position.set(0, 0.42, 0); this.pearl.userData.sharedGeo = true; g.add(this.pearl);
    this.pglow = glow(0xffffff, 1.6, 0.6); this.pglow.position.copy(this.pearl.position); g.add(this.pglow);
    outline(g, 0.03);
    W.group.add(g);
    W.add(this);
  }
  get world() { return _v.copy(this.pearl.position).applyMatrix4(this.obj.matrixWorld); }
  update(dt, G) {
    this.t += dt; this.nipCd -= dt;
    const cyc = this.t % 4.6, wantOpen = cyc < 2.5 ? 1 : 0;
    // snäpper igen snabbt, öppnar långsamt
    this.open += (wantOpen - this.open) * Math.min(1, dt * (wantOpen ? 3 : 14));
    this.lid.rotation.x = -this.open * 0.9;
    this.pearl.visible = !this.got; this.pglow.visible = !this.got && this.open > 0.3;
    if (this.got) return;
    const pl = G.player;
    const wp = this.obj.localToWorld(_v.copy(this.pearl.position));
    const d = Math.hypot(pl.pos.x - wp.x, pl.pos.y + 0.6 - wp.y, pl.pos.z - wp.z);
    if (d < 1.35) {
      if (this.open > 0.55) {
        this.got = true;
        G.audio.play('pickup', { pitch: 1.4 }); G.audio.play('coin', { pitch: 0.8 });
        G.fx.sparkle(wp.x, wp.y, wp.z, 16, 0xffffff);
        this.o.onGet && this.o.onGet(G, this);
      } else if (this.nipCd <= 0) {
        this.nipCd = 1.2;
        G.audio.play('hit', { pitch: 1.4 });
        if (pl.damage(this.p)) G.toast('Aj! Musslan nöp dig. Vänta tills den öppnar sig.', { ms: 2000 });
      }
    }
  }
  resetVisit() { }
}

/* ====================================================================== Klocka (urtavla med visare) */
export function clockFace(parent, pos, ry, r = 3.6) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = ry;
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 48), toon(0xf4ead2)); face.userData.disposeAll = true; g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.28, 8, 48), toon(0xc8a040, { emissive: 0x403010, emissiveIntensity: 0.4 })); g.add(rim);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P(g, 'box', 0x3a2a3a, [Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.82, 0.05], i % 3 ? [0.12, 0.4, 0.05] : [0.22, 0.7, 0.06], [0, 0, -a]).userData.noOutline = true; }
  const mkHand = (len, w, col) => { const h = new THREE.Group(); h.position.z = 0.12; P(h, 'box', col, [0, len / 2, 0], [w, len, 0.08]).userData.noOutline = true; g.add(h); return h; };
  const hour = mkHand(r * 0.5, 0.3, 0x2a1a2a), minute = mkHand(r * 0.78, 0.2, 0x2a1a2a);
  P(g, 'cyl', 0xc8a040, [0, 0, 0.2], [0.25, 0.1, 0.25], [Math.PI / 2, 0, 0]);
  const gl = glow(0xffe0a0, r * 2.4, 0); gl.position.z = 0.3; g.add(gl);
  parent.add(g);
  return { g, hour, minute, glow: gl };
}
