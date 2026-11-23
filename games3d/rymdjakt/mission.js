/**
 * Rymdjakt – uppdragsmotor: skriptas med async-funktioner (wait/until/say), mål, radio, navpunkter,
 * tidsgränser, vingmän och poängräkning. All tid är speltid, så paus stoppar allt.
 */
import * as THREE from 'three';
import { CHARS, gradeFor } from './data.js';
import { MUSIC } from './sfx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
class Abort extends Error {}

export class MissionRun {
  /** opts: { diff, mode:'campaign'|'survival' } */
  constructor(game, def, opts) {
    this.g = game; this.def = def; this.W = game.world;
    this.opts = opts; this.mode = opts.mode || 'campaign';
    this.t = 0; this.waiters = []; this.objectives = []; this.radioQ = []; this.radioCur = null; this.radioT = 0;
    this.ended = false; this.result = null; this.endT = 0; this.reason = '';
    this.lostWing = []; this.bonus = 0; this.extraScore = 0;
    this.timer = null; this.timerCb = null;
    this.aborted = false;
    this.wing = [];
    this.flags = {};
    this.seen = {};
    this.cp = opts.cp || null;          // kontrollpunkt vi startar från
    this.cpReached = this.cp;           // senaste nådda kontrollpunkt
  }
  /** Sparar en kontrollpunkt (vid förlust kan spelaren fortsätta härifrån). */
  checkpoint(name) {
    if (this.cpReached === name) return;
    this.cpReached = name;
    this.g.hud.flashMsg('Kontrollpunkt nådd', 2);
    this.g.sfx.play('power');
  }
  /** Slår ut delsystem tyst (används när man fortsätter från en kontrollpunkt). */
  preDestroy(ship, type) {
    for (const s of ship.subs) if (s.alive && s.type === type) {
      s.alive = false; s.hp = 0; if (s.node) s.node.visible = false;
      ship.burns.push({ local: s.local.clone(), t: 0, size: Math.max(4, s.r * 0.6) });
    }
  }
  get P() { return this.W.player; }
  get diff() { return this.W.diff; }

  /* ---------------------------------------------------------------- livscykel */
  start() {
    const d = this.def, W = this.W, g = this.g;
    W.setup({ env: d.env, diff: this.opts.diff, asteroids: d.asteroids || null });
    if (d.bounds) W.bounds = { center: V(...d.bounds.center), radius: d.bounds.radius };
    W.radarRange = d.radar || 5000;
    const ps = d.start || { pos: [0, 0, 0], look: [0, 0, -100] };
    W.spawnPlayer(g.playerStats(), V(...ps.pos), V(...ps.look));
    // händelser
    W.on('kill', (s, from) => this._onKill(s, from));
    W.on('subDestroyed', (s, sub, from) => { if (from && from.isPlayer) { W.stats.killPoints += sub.type === 'turret' ? 75 : 250; W.stats.subs++; this.g.hud.hit(true); this.g.hud.floater(sub.w, '+' + (sub.type === 'turret' ? 75 : 250)); } if (sub.type !== 'turret' && s.team === 1) this.g.hud.flashMsg(sub.name + ' utslaget!', 2); });
    W.on('playerHit', (s, sub) => { this.g.hud.hit(false); this.g.sfx.play('hitConfirm'); });
    W.on('hit', (s, from) => { if (s.isPlayer && from) this.g.hud.damageFrom(from.pos.clone().sub(s.pos).normalize()); });
    W.on('overheat', () => { this.g.sfx.play('overheat'); if (!this.seen.heat) { this.seen.heat = 1; this.radio('ek', 'Akta värmen! Låt lasrarna svalna en stund innan du skjuter igen.', 3.5); } });
    W.on('shieldDown', s => { if (s.isPlayer) this.g.hud.flashMsg('Skölden nere!', 1.2); });
    W.on('playerDead', () => this.lose('Du blev nedskjuten.', 3.5));
    W.on('deflect', (s, sub, from) => { if (from && from.isPlayer && !this.seen['defl' + s.id] && s.hasShieldGen()) { this.seen['defl' + s.id] = 1; this.g.hud.flashMsg('Skyddas av sköldgenerator – slå ut den först (G väljer delsystem)', 3); } });
    if (d.wing) this.spawnWing(d.wing);
    this.music(d.music || 'patrull');
    if (this.cp) this.g.hud.flashMsg('Fortsätter från kontrollpunkten', 3);
    this._run();
  }
  async _run() {
    try { await this.def.run(this, this.g); }
    catch (e) { if (!(e instanceof Abort)) console.error(e); }
  }
  abort() { this.aborted = true; this.ended = true; this.waiters.length = 0; this.radioQ.length = 0; this.g.hud.radio(null); this.g.hud.setTimer(null); this.g.hud.tip(null); }

  update(dt) {
    if (this.aborted) return;
    this.t += dt;
    // väntare
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      let ok = false;
      try { ok = w.fn(); } catch (e) { ok = false; console.error(e); }
      if (ok || (w.timeout && this.t >= w.timeout)) { this.waiters.splice(i, 1); w.res(ok); }
    }
    // radio
    if (this.radioCur) {
      this.radioT -= dt;
      if (this.radioT <= 0) { const c = this.radioCur; this.radioCur = null; this.g.hud.radio(null); c.res && c.res(); }
    }
    if (!this.radioCur && this.radioQ.length) {
      const r = this.radioQ.shift();
      this.radioCur = r; this.radioT = r.dur;
      this.g.hud.radio(r.who, r.text);
      this.g.sfx.play('radio');
    }
    // vingman varnar för fiende bakom spelaren
    if (!this.ended && this.P && !this.P.dead && this.t - (this.tailT || -99) > 22 && this.wing.some(w => !w.dead && w.ai)) {
      const P = this.P;
      for (const e of this.W.teams[1]) {
        if (e.dead || e.isLarge || !e.ai || e.ai.target !== P) continue;
        const dx = e.pos.x - P.pos.x, dy = e.pos.y - P.pos.y, dz = e.pos.z - P.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 350 * 350 && dx * P.fwd.x + dy * P.fwd.y + dz * P.fwd.z < 0 && this.W.time - P.lastHit < 1) {
          const w = this.wing.find(x => !x.dead && x.ai);
          const lines = ['Stjärna Ett, du har en på svansen! Bryt av!', 'Bakom dig! Gör en sväng – jag kommer!', 'Han sitter bakom dig, Stjärna Ett! Boosta och sväng!'];
          this.radio(w.callsignChar, lines[Math.floor(Math.random() * lines.length)], 2.6);
          this.tailT = this.t;
          break;
        }
      }
    }
    // tidsgräns
    if (this.timer != null && !this.ended) {
      this.timer -= dt;
      this.g.hud.setTimer(this.timer);
      if (this.timer <= 0) { this.timer = null; this.g.hud.setTimer(null); const cb = this.timerCb; this.timerCb = null; if (cb) cb(); }
    }
    // slut
    if (this.ended && this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.g.missionEnded(this);
    }
  }

  /* ---------------------------------------------------------------- skript-API */
  _check() { if (this.aborted) throw new Abort(); }
  wait(sec) { this._check(); const until = this.t + sec; return new Promise(res => this.waiters.push({ fn: () => this.t >= until, res })).then(v => { this._check(); return v; }); }
  until(fn, timeout = 0) { this._check(); return new Promise(res => this.waiters.push({ fn, res, timeout: timeout ? this.t + timeout : 0 })).then(v => { this._check(); return v; }); }
  /** Kör en parallell skriptdel (avbryts tyst när uppdraget avslutas). */
  task(fn) { fn().catch(e => { if (!(e instanceof Abort)) console.error(e); }); }
  later(sec, fn) { this.task(async () => { await this.wait(sec); fn(); }); }
  /** Ackumulerad tid medan villkoret är sant. */
  hold(fn, secs, onProgress) {
    let acc = 0, last = this.t;
    return this.until(() => { const dt = this.t - last; last = this.t; if (fn()) acc += dt; if (onProgress) onProgress(acc / secs); return acc >= secs; });
  }
  /** Radiomeddelande som väntar tills det visats klart. */
  say(who, text, dur) { this._check(); return new Promise(res => this.radio(who, text, dur, res)).then(() => this._check()); }
  radio(who, text, dur, res) {
    if (this.ended && this.result) { if (res) res(); return; }
    dur = dur || Math.min(9, 2.2 + text.length * 0.052);
    this.radioQ.push({ who, text, dur, res });
    if (this.radioQ.length > 5) { const r = this.radioQ.shift(); r.res && r.res(); }
  }
  /** Rensar radiokön (vid viktiga händelser). */
  hush() { for (const r of this.radioQ) r.res && r.res(); this.radioQ.length = 0; }
  obj(id, text, o = {}) {
    let ob = this.objectives.find(x => x.id === id);
    if (!ob) { ob = { id, text, state: 'active', optional: !!o.optional, progress: o.progress || '', points: o.points || (o.optional ? 300 : 500) }; this.objectives.push(ob); }
    else { ob.text = text; ob.state = 'active'; }
    this.g.hud.setObjectives(this.objectives);
    if (!o.silent) { this.g.hud.flashMsg((o.optional ? 'Frivilligt mål: ' : 'Nytt mål: ') + text, 2.6); this.g.sfx.play('order'); }
    return ob;
  }
  progress(id, txt) { const ob = this.objectives.find(x => x.id === id); if (ob && ob.progress !== txt) { ob.progress = txt; this.g.hud.setObjectives(this.objectives); } }
  done(id) {
    const ob = this.objectives.find(x => x.id === id);
    if (!ob || ob.state !== 'active') return;
    ob.state = 'done'; this.g.hud.setObjectives(this.objectives);
    this.g.hud.flashMsg('Mål klart: ' + ob.text, 2.4); this.g.sfx.play('objective');
  }
  fail(id, critical = false) {
    const ob = this.objectives.find(x => x.id === id);
    if (!ob || ob.state !== 'active') return;
    ob.state = 'failed'; this.g.hud.setObjectives(this.objectives);
    this.g.hud.flashMsg('Mål misslyckades: ' + ob.text, 2.6); this.g.sfx.play('failObj');
    if (critical) this.lose('Ett avgörande uppdragsmål misslyckades.');
  }
  isDone(id) { const ob = this.objectives.find(x => x.id === id); return !!ob && ob.state === 'done'; }
  /** Uppdraget är i praktiken vunnet: spelaren kan inte längre skjutas ner under avslutande radioreplik. */
  secure() { this.secured = true; if (this.P && !this.P.dead) this.P.invulnerable = true; }
  win(delay = 4) {
    if (this.ended) return;
    this.ended = true; this.result = 'win'; this.endT = delay;
    for (const o of this.objectives) if (o.state === 'active' && o.optional) o.state = 'failed';
    this.g.hud.setObjectives(this.objectives);
    this.g.hud.flashMsg('Uppdraget slutfört!', delay);
    this.music('seger');
    this.timer = null; this.g.hud.setTimer(null);
  }
  lose(reason, delay = 3) {
    if (this.ended) return;
    this.ended = true; this.result = 'lose'; this.endT = delay; this.reason = reason;
    this.g.hud.flashMsg('Uppdraget misslyckades', delay);
    this.timer = null; this.g.hud.setTimer(null);
    this.g.sfx.play('lose');
  }
  setTimer(sec, cb) { this.timer = sec; this.timerCb = cb; }
  stopTimer() { this.timer = null; this.timerCb = null; this.g.hud.setTimer(null); }
  music(name) { if (this.curMusic === name) return; this.curMusic = name; const t = MUSIC[name] || name; this.g.audio.music(t); }
  tip(html) { this.g.hud.tip(html); }
  /** Välj tangenttext efter senaste styrsätt. */
  keys(kbd, pad, touch) { const pc = this.g.pc; if (this.g.touchOn && touch) return touch; if (pc.lastInput === 'pad' && pad) return pad; return kbd; }

  /* ---------------------------------------------------------------- skepp */
  spawn(type, o = {}) { return this.W.spawn(type, o); }
  /** Antal fiender skalat med svårighetsgrad. */
  n(base) { return Math.max(1, Math.round(base * this.diff.count)); }
  /** Skapa en grupp runt en punkt. list: [[typ, antal], …] */
  group(list, center, o = {}) {
    const c = center.isVector3 ? center : V(...center);
    const out = [];
    const look = o.look ? (o.look.isVector3 ? o.look : V(...o.look)) : (this.P ? this.P.pos : V(0, 0, 0));
    for (const [type, count] of list) {
      const n = o.exact ? count : this.n(count);
      for (let i = 0; i < n; i++) {
        const p = c.clone().add(V((Math.random() - 0.5) * (o.spread || 260), (Math.random() - 0.5) * (o.spread || 260) * 0.5, (Math.random() - 0.5) * (o.spread || 260)));
        const s = this.spawn(type, Object.assign({ team: o.team != null ? o.team : 1, pos: p, look, warp: o.warp !== false, ai: Object.assign({}, o.ai || {}) }, o.extra || {}));
        out.push(s);
      }
    }
    return out;
  }
  /** Punkt relativt spelaren (framåt/höger/upp). */
  rel(fwd, right = 0, up = 0) {
    const P = this.P;
    const r = V(1, 0, 0).applyQuaternion(P.quat), u = V(0, 1, 0).applyQuaternion(P.quat);
    return P.pos.clone().addScaledVector(P.fwd, fwd).addScaledVector(r, right).addScaledVector(u, up);
  }
  spawnWing(ids) {
    const P = this.P;
    const slots = [V(-18, 2, 16), V(18, -2, 18), V(0, 6, 28)];
    ids.forEach((id, i) => {
      const ch = CHARS[id];
      const pos = V(...slots[i].toArray()).applyQuaternion(P.quat).add(P.pos);
      const s = this.spawn('wing', { team: 0, pos, quat: P.quat, aiKind: 'wingman', ai: { order: 'free', slot: slots[i].clone() }, name: ch.name, callsign: id === 'varg' ? 'Varg' : id === 'gnista' ? 'Gnista' : ch.name, throttle: 0.6 });
      s.callsignChar = id;
      this.wing.push(s);
    });
  }
  /** Skyddade skepp: markera för HUD. */
  protect(s) { s.hudMark = 'protect'; return s; }
  mark(s) { s.hudMark = 'destroy'; return s; }
  alive(list) { return list.filter(s => !s.dead).length; }
  allDead(list) { return list.every(s => s.dead); }
  near(a, b, d) { const pa = a.pos || a, pb = b.pos || b; return pa.distanceTo(pb) < d; }
  nav(id, pos, label, o = {}) {
    const p = pos.isVector3 ? pos : V(...pos);
    let n = this.W.navs.find(x => x.id === id);
    if (!n) { n = { id, pos: p, label, active: true }; this.W.navs.push(n); } else { n.pos = p; n.label = label; n.active = true; }
    return n;
  }
  navOff(id) { const n = this.W.navs.find(x => x.id === id); if (n) n.active = false; }
  enemiesAlive(filter) { return this.W.teams[1].filter(s => !s.dead && s.kind !== 'object' && (!filter || filter(s))).length; }
  /** Vänta tills alla i listan är döda, med löpande räknare i målet. */
  async killAll(list, objId, label) {
    const total = list.length;
    await this.until(() => {
      const d = list.filter(s => s.dead).length;
      if (objId) this.progress(objId, `${d}/${total}`);
      return d >= total;
    });
  }
  /** Avfyrar en träningsmissil mot spelaren. */
  trainingMissile(from) {
    const P = this.P;
    const def = { dmg: 6, speed: 230, turn: 1.8, life: 9, blast: 10, capMult: 1 };
    this.W.missiles.fire({ pos: from, dir: P.pos.clone().sub(from).normalize(), baseVel: V(0, 0, 0), def, team: 1, owner: null, target: P });
  }

  /* ---------------------------------------------------------------- poäng */
  _onKill(s, from) {
    if (from && from.isPlayer && s.team === 1 && s.points) {
      this.g.hud.hit(true); this.g.sfx.play('kill');
      this.g.hud.floater(s.pos, '+' + s.points);
    }
    // stridsprat från vingmännen
    if (s.team === 1 && s.kind !== 'mine' && s.kind !== 'object' && this.t - (this.chatT || -99) > 14 && !this.radioCur && !this.ended) {
      const wing = this.wing.filter(w => !w.dead && w.ai);
      if (wing.length) {
        if (from && from.isPlayer && Math.random() < 0.35) {
          const w = wing[Math.floor(Math.random() * wing.length)];
          const lines = w.callsignChar === 'gnista' ? ['Snyggt skjutet, Stjärna Ett!', 'Wow, den small!', 'Ännu en skrothög!', 'Du börjar bli bra på det här!'] : ['Bra skott!', 'Nedskjuten. Fint jobbat.', 'Där gick den. Fortsätt så!', 'En mindre att oroa sig för.'];
          this.radio(w.callsignChar, lines[Math.floor(Math.random() * lines.length)], 2.2); this.chatT = this.t;
        } else if (from && wing.includes(from) && Math.random() < 0.4) {
          const lines = from.callsignChar === 'gnista' ? ['Jag fick en!', 'Ha! Den var min!', 'Gnista ett, Svärmen noll!'] : ['Nedskjuten!', 'Fientligt jaktplan nere.', 'Den är borta.'];
          this.radio(from.callsignChar, lines[Math.floor(Math.random() * lines.length)], 2.2); this.chatT = this.t;
        }
      }
    }
    if (s.ai && s.ai.kind === 'wingman') {
      const nm = s.callsign || s.name;
      this.lostWing.push(nm);
      this.radio(s.callsignChar || 'varg', 'Jag är träffad – skjuter ut mig! Räddningsfarkosten plockar upp mig.', 3);
    }
    if (this.def.onKill) this.def.onKill(this, s, from);
  }
  liveScore() { return Math.round((this.W.stats.killPoints + this.extraScore) * this.diff.scoreMult).toLocaleString('sv-SE'); }
  computeScore() {
    const st = this.W.stats, P = this.P;
    const win = this.result === 'win';
    const acc = st.shots > 0 ? Math.min(1, st.hits / st.shots) : 0;
    const hullF = P && !P.dead ? P.hull / P.maxHull : 0;
    const req = this.objectives.filter(o => !o.optional);
    const reqDone = req.filter(o => o.state === 'done').length;
    const optDone = this.objectives.filter(o => o.optional && o.state === 'done');
    const objPts = this.objectives.filter(o => o.state === 'done').reduce((a, o) => a + o.points, 0);
    const par = this.def.par || 300;
    const timeBonus = win ? Math.max(0, Math.round((par - this.t) * 4)) : 0;
    const accBonus = win ? Math.round(acc * 1000) : 0;
    const hullBonus = win ? Math.round(hullF * 600) : 0;
    const base = st.killPoints + this.extraScore;
    let raw = win ? base + objPts + timeBonus + accBonus + hullBonus + this.bonus : Math.round(base * 0.5);
    if (this.mode === 'survival') raw = base;
    const total = Math.round(raw * this.diff.scoreMult);
    const optAll = this.objectives.filter(o => o.optional).length;
    const perf = (req.length ? reqDone / req.length : 1) * 35 + (optAll ? optDone.length / optAll : 1) * 10
      + 20 * Math.min(1, acc / 0.42) + 20 * hullF + 15 * Math.min(1, par / Math.max(1, this.t));
    return {
      win, total, kills: st.kills, killPoints: base, objPts, timeBonus, accBonus, hullBonus, acc, hullF, time: this.t, mult: this.diff.scoreMult,
      grade: win ? gradeFor(perf) : '–', perf, missiles: st.missiles, subs: st.subs
    };
  }
}
