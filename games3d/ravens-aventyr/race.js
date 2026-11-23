/* Rävens äventyr – kapplöpning mot en NPC längs en bana med portar. */
import * as THREE from 'three';
import { glow } from './fx.js';
import { TEX } from './core.js';

const V3 = THREE.Vector3;
const _v = new V3(), _dn = new V3(0, -1, 0), _o = new V3();

export class Race {
  /** npc: NPC-entitet. path: [[x,y,z],...]. o: { speed, gates:[index], stone, finishR, name, hop } */
  constructor(W, npc, path, o) {
    this.W = W; this.npc = npc; this.o = o;
    this.path = path.map(p => new V3(...p));
    this.segs = []; let tot = 0;
    for (let i = 0; i < this.path.length - 1; i++) { const l = this.path[i].distanceTo(this.path[i + 1]); this.segs.push({ a: this.path[i], b: this.path[i + 1], l, s: tot }); tot += l; }
    this.total = tot;
    this.state = 'idle'; this.won = false;
    this.home = npc.obj.position.clone(); this.homeFace = npc.face;
    // mållinje
    const f = this.path[this.path.length - 1];
    const g = this.finish = new THREE.Group(); g.position.copy(f);
    const pm = new THREE.MeshToonMaterial({ color: 0xdddddd });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), pm); p.position.set(sx * 2, 1.6, 0); g.add(p); }
    const bg = new THREE.PlaneGeometry(4, 0.8); const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 5);
    const banner = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: TEX.checker(), side: THREE.DoubleSide }));
    banner.position.set(0, 2.9, 0); g.add(banner);
    g.userData.disposeMat = [pm, banner.material];
    g.rotation.y = o.finishRy || 0;
    W.group.add(g);
    // portmarkörer
    this.gateObjs = (o.gates || []).map(i => { const s = glow(0x5ab8ff, 3, 0.9); s.position.copy(this.path[i]).add(_v.set(0, 1.5, 0)); s.visible = false; W.group.add(s); return { i, s, done: false }; });
    W.add(this);
  }
  start(G) {
    // mållinjen på marken (vägens punkter har ofta y = 0)
    if (this.finY == null) { const f = this.path[this.path.length - 1]; const h = this.W.col.raycast(_o.set(f.x, f.y + 2.5, f.z), _dn, 12); this.finY = h ? h.point.y : f.y; this.finish.position.y = this.finY; }
    this.state = 'count'; this.t = 3.4; this.u = 0; this.won = false; this.raceT = 0;
    this.gateObjs.forEach(g => { g.done = false; g.s.visible = true; });
    const p0 = this.path[0];
    this.npc.obj.position.copy(p0); this.npc.moving = true;
    G.music('race');
    G.toast(this.o.goal || 'Följ de blå ljusen till mållinjen!');
    this.lastCount = 4;
  }
  stop(G, keepMusic) {
    G.inpBlock = false;
    this.state = 'idle'; this.npc.moving = false;
    this.gateObjs.forEach(g => { g.s.visible = false; });
    G.raceText(null);
    if (!keepMusic) G.music(G.world.def.music);
  }
  posAt(u, out) {
    let k = u;
    for (const s of this.segs) { if (k <= s.l || s === this.segs[this.segs.length - 1]) { out.lerpVectors(s.a, s.b, Math.min(1, k / s.l)); return { s, f: Math.min(1, k / s.l) }; } k -= s.l; }
    return null;
  }
  update(dt, G) {
    if (this.state === 'idle') return;
    const pl = G.player;
    if (pl.state === 'dead') { this.stop(G, true); return; }
    if (this.state === 'count') {
      this.t -= dt;
      const c = Math.ceil(this.t - 0.4);
      if (c !== this.lastCount && c >= 1 && c <= 3) { this.lastCount = c; G.bigText(String(c), 0.8); G.audio.play('countdown'); }
      if (this.t <= 0.4 && this.lastCount !== 0) { this.lastCount = 0; G.bigText('KÖR!', 0.8); G.audio.play('go'); }
      G.inpBlock = this.t > 0.4;
      if (this.t <= 0) { this.state = 'run'; }
      // håll NPC still
      this.npc.obj.position.copy(this.path[0]);
      return;
    }
    this.raceT += dt;
    G.raceText('⏱ ' + this.raceT.toFixed(1) + ' s');
    // NPC rör sig
    this.u = Math.min(this.total, this.u + this.o.speed * dt);
    const info = this.posAt(this.u, _v);
    const tgt = _v.clone();
    const h = this.W.col.raycast(_o.set(tgt.x, tgt.y + 1.5, tgt.z), _dn, 3.5);
    if (h) tgt.y = h.point.y;
    if (this.o.water != null) tgt.y = Math.max(h ? h.point.y : -99, this.o.water - 0.55);
    const hop = this.o.hop ? Math.abs(Math.sin(this.raceT * 7)) * 0.35 : this.o.dig ? -0.95 : 0;
    if (this.o.dig && Math.random() < 0.7) G.fx.dust(tgt.x, tgt.y, tgt.z, 2, 0x8a7a6a);
    this.npc.obj.position.set(tgt.x, tgt.y + hop, tgt.z);
    if (info) { const d = _o.copy(info.s.b).sub(info.s.a); this.npc.obj.rotation.y = Math.atan2(d.x, d.z); }
    this.npc.walkAnim(dt, this.o.speed);
    this.npc.dyn.sync();
    // spelarens portar
    for (const g of this.gateObjs) {
      if (g.done) continue;
      if (pl.pos.distanceTo(this.path[g.i]) < (this.o.gateR || 5)) { g.done = true; g.s.visible = false; G.audio.play('pickup', { pitch: 1.5, vol: 0.6 }); }
      break; // i ordning
    }
    const allGates = this.gateObjs.every(g => g.done);
    const fin = this.path[this.path.length - 1];
    if (allGates && Math.hypot(pl.pos.x - fin.x, pl.pos.z - fin.z) < (this.o.finishR || 3) && Math.abs(pl.pos.y - (this.finY ?? fin.y)) < 3) {
      this.won = true; this.stop(G, true);
      G.bigText('Vinst!', 1.4); G.audio.play('win');
      G.toast(`Du vann på ${this.raceT.toFixed(1)} sekunder!`, { ms: 3000 });
      this.npc.obj.position.set(fin.x + 2.5, fin.y, fin.z + 1); this.npc.dyn.sync();
      if (this.o.onWin) this.o.onWin(G);
      G.music(G.world.def.music);
      return;
    }
    if (this.u >= this.total) {
      this.stop(G);
      G.bigText('För långsam!', 1.4); G.audio.play('lose');
      G.dialog(this.npc.name, [this.o.loseLine || 'Ha! Jag vann. Prata med mig om du vill försöka igen!'], this.npc);
    }
  }
  resetVisit() { this.W.G.inpBlock = false; if (this.state !== 'idle') { this.state = 'idle'; this.npc.moving = false; this.gateObjs.forEach(g => { g.s.visible = false; }); } this.npc.obj.position.copy(this.home); this.npc.dyn.sync(); }
}
