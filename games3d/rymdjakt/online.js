/**
 * Rymdjakt – onlineläge (peer-to-peer via engine/net.js).
 *
 * Lägen:  Samarbete (2–4 piloter mot vågorna, värden simulerar fiender, delad poäng och reservskepp)
 *         Luftstrid (fritt för alla, först till 10 nedskjutningar eller flest efter 4 minuter)
 *
 * Modell: värden är auktoritativ. Varje spelare flyger sitt eget skepp lokalt och skickar sitt tillstånd (20 Hz).
 *   Hos värden är fjärrspelarna "proxyskepp" (utan AI, styrda av nätdata) som fienderna jagar och som skjuter riktiga
 *   skott när ägaren håller in avtryckaren. Skada på en proxy skickas till ägaren ('dmg'), som drar av den på sitt
 *   eget skepp. Hos klienterna är fienderna proxyskepp som interpoleras från värdens ögonblicksbilder (~12 Hz);
 *   klientens egna skott/missiler ritas lokalt men gör ingen skada där (World.netVisual).
 */
import * as THREE from 'three';
import { createNet, createLobby, V, emoteBar, backgroundTicker } from '../../engine/net.js';
import { toast, show } from '../../engine/kit.js';
import { NPC, NPC_MISSILE, NPC_TORPEDO, PLAYER_SHIPS, PRIMARY, SECONDARY, DIFF, writeSave } from './data.js';
import { MissionRun } from './mission.js';
import { Ship } from './ships.js';
import { World } from './world.js';
import { PlayerControl } from './player.js';
import { SURVIVAL } from './missions.js';

const $ = id => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const NPC_TYPES = Object.keys(NPC);
const ENVS = ['hemma', 'grus', 'rod', 'djup', 'kalla'];
const ENV_LABEL = { slump: 'Slumpad', hemma: 'Vegagränsen', grus: 'Grusbältet', rod: 'Röda nebulosan', djup: 'Djuprymden', kalla: 'Kalla stjärnan' };
const SLOT_COL = ['#5ad0ff', '#ffd24a', '#ff7ad0', '#8aff7a'];
const DELAY = 120;               // ms interpolationsfördröjning
const DUEL_KILLS = 10, DUEL_TIME = 240;
const fmt = n => Number(Math.floor(n)).toLocaleString('sv-SE');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = a => a[Math.floor(Math.random() * a.length)];
function around(c, dist, ySpread = 0.3) { const a = Math.random() * Math.PI * 2; return c.clone().add(V3(Math.cos(a) * dist, (Math.random() - 0.5) * dist * ySpread, Math.sin(a) * dist)); }

/* ---------------------------------------------------------------- scheman */
const isId = V.str(48, /^[A-Za-z0-9_-]+$/);
const META = V.obj({ ship: V.oneOf(Object.keys(PLAYER_SHIPS)), prim: V.oneOf(Object.keys(PRIMARY)), sec: V.oneOf(Object.keys(SECONDARY)), dm: V.num(0.5, 2.5) });
const ROOM = V.obj({ m: V.oneOf(['coop', 'duel']), diff: V.oneOf(Object.keys(DIFF)), env: V.oneOf(['slump', ...ENVS]) });
const START = V.obj({ m: V.oneOf(['coop', 'duel']), diff: V.oneOf(Object.keys(DIFF)), env: V.oneOf(ENVS), pl: V.arr(isId, 4, 2) });
const ST = V.nums(17, -60000, 60000);
const SNAP = V.arr(V.num(-1e6, 1e6), 12 * 80);
const EVS = V.arr(V.arr(V.num(-1e6, 1e6), 5, 2), 60);
const DMG = V.arr(V.nums(7, -1e5, 1e5), 40);
const INF = V.obj({ w: V.int(0, 999), n: V.int(0, 999), sc: V.int(0, 1e9), r: V.int(0, 99), k: V.arr(V.int(0, 9999), 4), dd: V.arr(V.int(0, 2), 4), tl: V.num(-1, 9999) });
const END = V.obj({ m: V.oneOf(['coop', 'duel']), sc: V.int(0, 1e9), w: V.int(0, 999), k: V.arr(V.int(0, 9999), 4), t: V.num(0, 1e6) });

/* ---------------------------------------------------------------- prototyp-krokar (verkar bara i onlineläget) */
const _fire = Ship.prototype.fireLaser;
Ship.prototype.fireLaser = function () { const r = _fire.call(this); if (r) this._netFired = true; return r; };
const _fm = World.prototype.fireMissile;
World.prototype.fireMissile = function (s, def, target, sub) { const m = _fm.call(this, s, def, target, sub); if (this.netHook) this.netHook.missile(s, def, target); return m; };
const _hit = World.prototype.onBoltHit;
World.prototype.onBoltHit = function (ship, sub, point, dir, dmg, sm, hm, owner) { if (this.netVisual) return this.netVisual.boltHit(ship, sub, point, dir, owner); return _hit.apply(this, arguments); };
const _blast = World.prototype.blast;
World.prototype.blast = function (pos, radius) { if (this.netVisual) return this.netVisual.blast(pos, radius); return _blast.apply(this, arguments); };
const _cand = PlayerControl.prototype.candidates;
PlayerControl.prototype.candidates = function () { const W = this.W; if (!W.netDuel || !W.player) return _cand.call(this); return W.ships.filter(s => !s.dead && s.targetable && s.team !== W.player.team); };
const _fs = PlayerControl.prototype.fireSecondary;
PlayerControl.prototype.fireSecondary = function () {
  const P = this.W.player; const before = P ? P.missiles : 0;
  _fs.call(this);
  const on = this.g.online;
  if (on && on.active && P && P.missiles < before) on.localMissile(this.W.playerTarget);
};

/* ---------------------------------------------------------------- proxyskepp */
const _qa = new THREE.Quaternion();
function pushBuf(s, p, q, v) {
  const b = s.buf, t = performance.now();
  let vel = v;
  if (!vel) { const l = b[b.length - 1]; vel = l && t - l.t > 1 ? p.clone().sub(l.p).multiplyScalar(1000 / (t - l.t)) : V3(0, 0, 0); }
  b.push({ t, p, q, v: vel });
  if (b.length > 10) b.shift();
}
function sample(s) {
  const b = s.buf; if (!b.length) return;
  const t = performance.now() - DELAY;
  if (t <= b[0].t || b.length === 1) { const e = b[t <= b[0].t ? 0 : b.length - 1]; s.pos.copy(e.p); s.quat.copy(e.q); s.vel.copy(e.v); if (b.length === 1 && t > e.t) s.pos.addScaledVector(e.v, Math.min(0.25, (t - e.t) / 1000)); return; }
  const L = b[b.length - 1];
  if (t >= L.t) { s.pos.copy(L.p).addScaledVector(L.v, Math.min(0.25, (t - L.t) / 1000)); s.quat.copy(L.q); s.vel.copy(L.v); return; }
  let k = b.length - 2; while (k > 0 && b[k].t > t) k--;
  const A = b[k], B = b[k + 1], f = (t - A.t) / Math.max(1, B.t - A.t);
  s.pos.lerpVectors(A.p, B.p, f); s.quat.slerpQuaternions(A.q, B.q, f); s.vel.lerpVectors(A.v, B.v, f);
}
function proxyUpdate(dt) {
  if (this.dying > 0) { Ship.prototype.update.call(this, dt); return; }
  this.time += dt;
  sample(this);
  this.updateWorld();
  this.speed = this.vel.length();
  this.cd -= dt; this.heat = 0; this.overheated = false;
  this._updateFlames(dt);
  if (this.netFire && !this.dead && this.weapon) this.fireLaser();
}
/** Hos värden: skada på en fjärrspelares proxy skickas till ägaren. */
function hostProxyDamage(amount, opts = {}) {
  if (this.dead) return;
  const from = opts.from || null;
  if (from && from.team === this.team) return;
  const W = this.world;
  this.lastHit = W.time;
  if (from && from !== this) { this.lastAttacker = from; this.netLastAt = W.time; }
  if (opts.point) { if (this.shield > 0) W.fx.shieldHit(this, opts.point, [0.4, 1.2, 2.6]); else W.fx.spark(opts.point, null, 6, 55, [3, 1.8, 0.6], 0.7); }
  const d = _qd.set(0, 0, -1);
  if (from) d.copy(this.pos).sub(from.pos).normalize(); else if (opts.dir) d.copy(opts.dir).normalize();
  const kind = opts.kind === 'blast' ? 1 : opts.kind === 'ram' ? 2 : 0;
  this.netOwner.queueDmg(this.netPeer, [Math.min(9999, amount), opts.sm || 1, opts.hm || 1, d.x, d.y, d.z, kind]);
}
const _qd = new THREE.Vector3();

/* ---------------------------------------------------------------- samarbetsvågor (körs hos värden) */
function coopDef(env, start) {
  return Object.assign({}, SURVIVAL, {
    id: 'online-coop', title: 'Online: Samarbete', env, start, onKill: null,
    async run(m, g) {
      const on = g.online; m.wave = 0;
      await m.wait(2);
      m.radio('dator', 'Samarbetsläge. Håll ihop och täck varandra – vågorna blir större för varje runda.', 4);
      for (;;) {
        m.wave++;
        const w = m.wave, n = on.s.pl.length, k = 1 + 0.5 * (n - 1);
        on.hostEvent([3, w]);
        const list = [['hugg', Math.round((2 + Math.floor(w * 0.9)) * k)]];
        if (w >= 3) list.push(['tordon', Math.round(Math.floor((w - 1) / 2) * k)]);
        if (w >= 4) list.push(['spjut', Math.round(Math.floor((w - 2) / 2) * k)]);
        const groups = Math.min(4, 1 + Math.floor(w / 3) + (n > 2 ? 1 : 0));
        const spawned = [];
        const c = on.playersCenter();
        for (let j = 0; j < groups; j++) {
          const part = list.map(([t, cnt]) => [t, Math.max(0, Math.round(cnt / groups + (j === 0 ? cnt % groups : 0)))]).filter(x => x[1] > 0);
          spawned.push(...m.group(part, around(c, 1400 + Math.random() * 400, 0.4), { look: c, exact: true }));
        }
        if (w % 5 === 0) spawned.push(m.mark(m.spawn('bastion', { team: 1, pos: around(c, 1700, 0.2), look: c, warp: true, ai: { standoff: 700 } })));
        if (w % 8 === 0) spawned.push(m.mark(m.spawn('klyvare', { team: 1, pos: around(c, 2000, 0.2), look: c, warp: true, ai: { standoff: 900 } })));
        if (w % 4 === 0) for (let i = 0; i < 8; i++) m.spawn('mine', { team: 1, pos: around(V3(0, 0, 0), 300 + Math.random() * 900, 0.5), throttle: 0, warp: true });
        m.obj('wave', 'Våg ' + w + ': förstör alla fiender', { progress: '', silent: true });
        await m.until(() => { const left = spawned.filter(s => !s.dead).length; on.s.left = left; m.progress('wave', `– ${left} kvar`); return left === 0; });
        const bonus = w * 250 * n;
        m.extraScore += bonus;
        on.hostEvent([4, w, bonus]);
        await m.wait(6);
      }
    }
  });
}

/* ================================================================= Online */
export class Online {
  constructor(game) {
    this.g = game; this.net = null; this.lobby = null; this.active = false; this.s = null; this.emo = null;
  }
  get W() { return this.g.world; }

  /* ------------------------------------------------------------ nät + lobby */
  ensureNet() {
    if (this.net) return;
    const net = this.net = createNet({ game: 'rymdjakt', version: '1', maxPlayers: 4, metaSchema: META, roomStateSchema: ROOM, startSchema: START });
    net.define('st', { schema: ST, rate: 30, maxBytes: 600 });
    net.define('sn', { schema: SNAP, rate: 20, maxBytes: 16000, hostOnly: true });
    net.define('ev', { schema: EVS, rate: 30, maxBytes: 4000, hostOnly: true });
    net.define('dmg', { schema: DMG, rate: 40, maxBytes: 4000, hostOnly: true });
    net.define('inf', { schema: INF, rate: 6, maxBytes: 400, hostOnly: true });
    net.define('end', { schema: END, rate: 2, maxBytes: 400, hostOnly: true });
    net.define('fx', { schema: V.nums(2, -100, 1e7), rate: 10, maxBytes: 60 });
    net.onMsg('st', (d, from) => this.onState(d, from));
    net.onMsg('sn', d => this.onSnap(d));
    net.onMsg('ev', d => { for (const e of d) this.applyEvent(e); });
    net.onMsg('dmg', d => this.onDmg(d));
    net.onMsg('inf', d => this.onInfo(d));
    net.onMsg('end', d => this.showEnd(d));
    net.onMsg('fx', (d, from) => this.onFx(d, from));
    net.on('start', p => this.start(p));
    net.on('lobby', () => { if (this.active || this.g.ui.cur === 'debrief') this.toLobby(); });
    net.on('host', h => { if (h.isHost && !ROOM(net.roomState)) net.setRoomState({ m: net.mode === 'duel' ? 'duel' : 'coop', diff: this.g.save.diff || 'normal', env: 'slump' }); });
    net.on('peerleave', p => this.onPeerLeave(p));
    net.on('hostleft', h => this.onHostLeft(h));
    let setKey = '';
    this.lobby = createLobby({
      net, container: $('onlineBox'), title: 'Rymdjakt online',
      modes: [
        { id: 'coop', label: 'Samarbete', desc: '2–4 piloter mot Järnsvärmens vågor. Gemensam poäng och reservskepp – den som skjuts ner kommer tillbaka.' },
        { id: 'duel', label: 'Luftstrid', desc: 'Fritt för alla, 2–4 piloter. Först till 10 nedskjutningar – eller flest när 4 minuter har gått.' }
      ],
      onBack: () => this.g.ui.show('menu', false),
      onStart: () => this.hostStart(),
      dotColor: p => SLOT_COL[Math.max(0, net.players.indexOf(net.players.find(x => x.id === p.id)))] || '#9aa6cf',
      playerExtra: p => p.meta ? esc(PLAYER_SHIPS[p.meta.ship].name) : '',
      renderMine: el => { const s = this.g.save; el.innerHTML = `<p class="nl-note">Ditt skepp: <b>${esc(PLAYER_SHIPS[s.ship].name)}</b> med ${esc(PRIMARY[s.primary].name)} och ${esc(SECONDARY[s.secondary].name)} (byts i hangaren).</p>`; },
      renderSettings: (el, { isHost, state, set }) => {
        const st = ROOM(state) ? state : { m: 'coop', diff: 'normal', env: 'slump' };
        const key = JSON.stringify(st) + isHost;
        if (key === setKey && el.childElementCount) return;
        setKey = key;
        const sel = (k, opts) => isHost ? `<select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}"${st[k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>` : `<b>${esc((opts.find(o => o[0] === st[k]) || ['', ''])[1])}</b>`;
        el.innerHTML = `<div class="g3-settings" style="margin:0">
          <div class="g3-set"><label>Läge</label><div class="ctl">${sel('m', [['coop', 'Samarbete'], ['duel', 'Luftstrid']])}</div></div>
          <div class="g3-set"><label>Svårighetsgrad</label><div class="ctl">${sel('diff', Object.values(DIFF).map(d => [d.id, d.label]))}</div></div>
          <div class="g3-set"><label>Plats</label><div class="ctl">${sel('env', Object.entries(ENV_LABEL))}</div></div></div>`;
        el.querySelectorAll('select').forEach(x => x.addEventListener('change', () => set({ [x.dataset.k]: x.value })));
      }
    });
    this.emo = emoteBar(net, this.g.root);
    this.emo.el.style.cssText = 'justify-content:center;margin-top:12px';
    this.emo.el.classList.add('hidden');
    $('pause').querySelector('.g3-panel').appendChild(this.emo.el);
  }
  myMeta() {
    const s = this.g.save, st = this.g.playerStats();
    return { ship: s.ship, prim: s.primary, sec: s.secondary, dm: Math.max(0.5, Math.min(2.5, Math.round(st.dmgMult * 100) / 100)) };
  }
  openLobby() {
    this.ensureNet();
    this.net.setMeta(this.myMeta());
    this.g.ui.show('online');
    this.lobby.open();
  }
  hostStart() {
    const net = this.net;
    const rs = ROOM(net.roomState) ? net.roomState : { m: 'coop', diff: 'normal', env: 'slump' };
    const pl = net.players.filter(p => p.connected && p.meta).map(p => p.id).slice(0, 4);
    if (pl.length < 2) { toast('Minst två piloter behövs'); return; }
    net.startGame({ m: rs.m, diff: rs.diff, env: rs.env === 'slump' ? pick(ENVS) : rs.env, pl });
  }

  /* ------------------------------------------------------------ start */
  start(p) {
    const net = this.net, g = this.g;
    const slot = p.pl.indexOf(net.selfId);
    if (slot < 0) { toast('En omgång pågår – du är med i nästa'); return; }
    this.lobby.close();
    const host = net.isHost;
    const players = p.pl.map(id => net.player(id));
    this.s = {
      mode: p.m, host, slot, pl: p.pl, diff: p.diff, env: p.env,
      names: players.map(x => (x && x.name) || 'Pilot'), metas: players.map(x => x && x.meta),
      proxies: new Map(), enemies: new Map(), killed: new Set(), kills: [0, 0, 0, 0], dd: [0, 0, 0, 0],
      score: 0, wave: 0, left: 0, reserves: 2 + p.pl.length, tl: -1, t: 0,
      dmgQ: new Map(), evQ: [], stT: 0, snT: 0, infT: 0, dmgT: 0, respawn: [], ended: false, spawnProt: 0, lastInfo: ''
    };
    const s = this.s;
    g.ui.hideAll();
    show('loading');
    $('loading').querySelector('.g3-loadtext').textContent = 'Hoppar in: ' + (p.m === 'duel' ? 'Luftstrid' : 'Samarbete') + ' …';
    $('loading').querySelector('.g3-loadbar > i').style.width = '60%';
    g.state = 'loading';
    setTimeout(() => {
      if (!this.s || this.s !== s) return;
      if (g.mission) g.mission.abort();
      if (g.showcaseObj) g.showcaseObj.visible = false;
      g.pc.reset(); g.targetSub = null; g.world.quiet = false;
      const sp = this.spawnPoint(slot, true);
      let def;
      if (p.m === 'coop' && host) def = coopDef(p.env, sp);
      else def = {
        id: 'online-' + p.m, title: p.m === 'duel' ? 'Online: Luftstrid' : 'Online: Samarbete', env: p.env, music: 'strid', par: 0, reward: 0, start: sp,
        bounds: p.m === 'duel' ? { center: [0, 0, 0], radius: 2800 } : SURVIVAL.bounds,
        asteroids: p.m === 'duel' ? { count: 90, shape: 'sphere', center: [0, 0, 0], radius: 2300, minR: 14, maxR: 110, seed: 91, avoid: [{ p: V3(0, 0, 0), r: 500 }] } : SURVIVAL.asteroids,
        async run() { /* styrs av värden / Online */ }
      };
      g.cur = { def, opts: { mode: 'online' } };
      const m = g.mission = new MissionRun(g, def, { diff: p.diff, mode: 'survival' });
      m.start();
      const W = g.world;
      W.listeners.playerDead = [(sh, from) => this.onLocalDead(from)];
      W.on('flare', () => { if (!s.host) net.send('fx', [2, 0]); });
      if (!host) { W.netVisual = { boltHit: (ship, sub, pt, dir, owner) => this.visualHit(ship, sub, pt, dir, owner), blast: (pos, r) => this.visualBlast(pos, r) }; m.liveScore = () => fmt(s.score); }
      else {
        W.netHook = { missile: (sh, d, tg) => { const o = this.ref(sh), t = this.ref(tg); if (o !== 0) this.hostEvent([2, o, t, d.torpedo ? 1 : 0]); } };
        W.on('kill', (sh, from) => this.hostKill(sh, from));
        if (p.m === 'coop') m.liveScore = () => fmt(this.coopScore());
        else m.liveScore = () => fmt(s.kills[slot]) + ' nedskjutna';
      }
      if (p.m === 'duel') {
        W.netDuel = true;
        if (host) { W.teams[2] = []; W.teams[3] = []; }
      }
      W.netPlayers = [];
      p.pl.forEach((id, k) => { if (k !== slot) this.makePlayerProxy(id, k); });
      if (p.m === 'duel') m.music('strid');
      this.active = true;
      if (!this.stopTick) this.stopTick = backgroundTicker(dt => this.bgTick(dt), 30);
      g.hud.setObjectives([]); g.hud.radio(null); g.hud.tip(null); g.hud.setTimer(null);
      if (p.m === 'duel') this.duelObjectives();
      else if (!host) g.hud.setObjectives([{ id: 'wave', text: 'Väntar på första vågen', state: 'active', progress: '' }]);
      g.rig.snap(W.player);
      g.rig.update(0.016, W.player, 'chase', g.settings, 0);
      try { g.R.renderer.compile(g.scene, g.camera); } catch (e) { /* ignorera */ }
      $('loading').classList.add('hidden');
      g.state = 'flight'; g.overlay = false;
      g.hud.show(true);
      g.root.classList.add('flying');
      g.sfx.startEngine();
      g.tryLock(); g._lockHint();
      g.input.clear();
      $('pRestart').style.display = 'none';
      this.emo.el.classList.remove('hidden');
      g.hud.flashMsg(p.m === 'duel' ? `Luftstrid! Först till ${DUEL_KILLS} vinner` : 'Samarbete – ' + p.pl.length + ' piloter', 3);
    }, 30);
  }
  spawnPoint(slot, initial) {
    if (this.s.mode === 'duel') {
      const a = slot * Math.PI / 2 + (initial ? 0 : Math.random() * Math.PI * 2), r = initial ? 1100 : 900 + Math.random() * 500;
      const pos = [Math.cos(a) * r, (initial ? 0 : (Math.random() - 0.5) * 400), Math.sin(a) * r];
      return { pos, look: [0, 0, 0] };
    }
    const off = [[0, 0], [-70, 20], [70, -20], [0, 45]][slot] || [0, 0];
    if (initial) return { pos: [off[0], off[1], 600], look: [off[0], off[1], 0] };
    const c = this.playersCenter(slot);
    const pos = around(c, 250 + Math.random() * 150, 0.3);
    return { pos: pos.toArray(), look: c.toArray() };
  }
  playersCenter(excl = -1) {
    const W = this.W, c = V3(0, 0, 0); let n = 0;
    if (W.player && !W.player.dead && excl !== this.s.slot) { c.add(W.player.pos); n++; }
    for (const pr of this.s.proxies.values()) if (!pr.dead && pr.netSlot !== excl) { c.add(pr.pos); n++; }
    return n ? c.multiplyScalar(1 / n) : V3(0, 0, 600);
  }
  makePlayerProxy(id, slot) {
    const W = this.W, s = this.s, meta = s.metas[slot] || { ship: 'svala', prim: 'pulse', sec: 'homing', dm: 1 };
    const base = PLAYER_SHIPS[meta.ship];
    const stats = Object.assign({}, base, { primary: PRIMARY[meta.prim], secondary: SECONDARY[meta.sec], dmgMult: meta.dm, ammo: 99, flares: 99, ai: undefined });
    // luftstrid: hos värden får varje fjärrspelare ett eget lag (1–3), hos klienten är alla andra lag 1
    const team = s.mode === 'duel' ? (s.host ? (slot < s.slot ? slot + 1 : slot) : 1) : 0;
    const sp = this.spawnPoint(slot, true);
    const pr = W.spawn('player', { stats, team, pos: sp.pos, look: sp.look, throttle: 0.6, weapon: stats.primary, name: s.names[slot], callsign: s.names[slot] });
    pr.ai = null; pr.static = true; pr.netPlayer = true; pr.netName = s.names[slot]; pr.netColor = SLOT_COL[slot]; pr.netSlot = slot; pr.netPeer = id; pr.netOwner = this;
    pr.missiles = 99; pr.flares = 99; pr.secondary = stats.secondary;
    pr.buf = []; pr.update = proxyUpdate;
    pr.damage = s.host ? hostProxyDamage : function () {};
    s.proxies.set(id, pr);
    W.netPlayers.push(pr);
    return pr;
  }
  /** Referens till ett skepp i nätmeddelanden: >0 fiende-id (värdens), <0 spelare −(slot+1), 0 inget. */
  ref(sh) {
    if (!sh || sh.isFlare) return 0;
    const s = this.s;
    if (sh === this.W.player) return -(s.slot + 1);
    if (sh.netPlayer) return -(sh.netSlot + 1);
    if (s.host) return sh.id;
    return sh.netId || 0;
  }
  resolve(r) {
    const s = this.s, W = this.W;
    if (r < 0) { const slot = -r - 1; if (slot === s.slot) return W.player; for (const p of s.proxies.values()) if (p.netSlot === slot) return p; return null; }
    if (r > 0) { if (s.host) return W.ships.find(x => x.id === r) || null; return s.enemies.get(r) || null; }
    return null;
  }

  /* ------------------------------------------------------------ loop */
  bgTick(dt) {
    const g = this.g;
    if (!this.active || g.state !== 'flight') return;
    const n = Math.min(8, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < n; i++) g.update(dt / n);
  }
  update(dt) {
    const s = this.s, W = this.W, net = this.net, g = this.g;
    if (!s || !this.active) return;
    s.t += dt;
    const P = W.player;
    if (s.spawnProt > 0) { s.spawnProt -= dt; if (s.spawnProt <= 0 && P) P.invulnerable = false; }
    // eget tillstånd
    s.stT -= dt;
    if (s.stT <= 0 && P) {
      s.stT = 0.05;
      const q = P.quat, dead = P.dead || P.removed;
      const fire = !dead && !g.overlay && P.ctrl.fire ? 1 : 0;
      const r = x => Math.round(x * 100) / 100, r4 = x => Math.round(x * 10000) / 10000;
      net.sendFast('st', [r(P.pos.x), r(P.pos.y), r(P.pos.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w), r(P.vel.x), r(P.vel.y), r(P.vel.z), r4(P.aimDir.x), r4(P.aimDir.y), r4(P.aimDir.z), Math.round(Math.min(5000, P.aimDist || 600)), P.maxShield ? r(P.shield / P.maxShield) : 0, r(Math.max(0, P.hull) / P.maxHull), fire | (P.boosting ? 2 : 0) | (dead ? 4 : 0)]);
    }
    if (!s.host) return;
    // ---- värd: ögonblicksbild av fienderna
    if (s.mode === 'coop') {
      s.snT -= dt;
      if (s.snT <= 0) {
        s.snT = 0.08;
        const out = [];
        for (const e of W.ships) {
          if (e.netPlayer || e.team !== 1 || e.dead || e.removed) continue;
          if (out.length >= 12 * 80) break;
          const q = e.quat, ti = NPC_TYPES.indexOf(e.type);
          if (ti < 0) continue;
          out.push(e.id, ti, Math.round(e.pos.x * 10) / 10, Math.round(e.pos.y * 10) / 10, Math.round(e.pos.z * 10) / 10, Math.round(q.x * 1e4) / 1e4, Math.round(q.y * 1e4) / 1e4, Math.round(q.z * 1e4) / 1e4, Math.round(q.w * 1e4) / 1e4,
            Math.round(Math.max(0, e.hull) / e.maxHull * 100), e.maxShield ? Math.round(e.shield / e.maxShield * 100) : 0, (e._netFired ? 1 : 0) | (e.hudMark === 'destroy' ? 2 : 0));
          e._netFired = false;
        }
        net.sendFast('sn', out);
      }
    }
    // ---- värd: skada till ägarna
    s.dmgT -= dt;
    if (s.dmgT <= 0 && s.dmgQ.size) { s.dmgT = 0.05; for (const [id, list] of s.dmgQ) net.send('dmg', list.splice(0, 40), id); s.dmgQ.clear(); }
    // ---- värd: händelser
    if (s.evQ.length) { const evs = s.evQ.splice(0, 60); net.send('ev', evs); }
    // ---- värd: återuppståndelser
    for (let i = s.respawn.length - 1; i >= 0; i--) {
      const r = s.respawn[i];
      r.t -= dt;
      if (r.t <= 0) { s.respawn.splice(i, 1); const sp = this.spawnPoint(r.slot, false); this.hostEvent([6, r.slot, ...sp.pos.map(v => Math.round(v))]); }
    }
    // ---- värd: läge + slutvillkor
    if (s.mode === 'duel') {
      s.tl = Math.max(0, DUEL_TIME - s.t);
      if (!s.ended && (s.tl <= 0 || s.kills.some(k => k >= DUEL_KILLS))) this.hostEnd();
    } else if (!s.ended) {
      const allDown = s.dd.slice(0, s.pl.length).every(x => x > 0) && !s.respawn.length;
      if (allDown) { s.allDownT = (s.allDownT || 0) + dt; if (s.allDownT > 3) this.hostEnd(); } else s.allDownT = 0;
    }
    s.infT -= dt;
    if (s.infT <= 0) {
      s.infT = 0.5;
      const m = g.mission;
      s.wave = m ? (m.wave || 0) : 0;
      if (s.mode === 'coop') s.score = this.coopScore();
      const inf = { w: s.wave, n: Math.min(999, s.left || 0), sc: Math.min(1e9, s.score), r: s.reserves, k: s.kills.slice(), dd: s.dd.slice(), tl: s.mode === 'duel' ? Math.round(s.tl) : -1 };
      net.sendFast('inf', inf);
      if (s.mode === 'duel') this.duelObjectives();
    }
  }
  coopScore() { const m = this.g.mission, W = this.W; return m ? Math.round((W.stats.killPoints + m.extraScore) * W.diff.scoreMult) : 0; }
  hostEvent(e) { if (!this.s || !this.s.host) return; this.s.evQ.push(e); this.applyEvent(e); }
  queueDmg(peer, d) { const q = this.s.dmgQ; let l = q.get(peer); if (!l) { l = []; q.set(peer, l); } if (l.length < 40) l.push(d.map(v => Math.round(v * 1000) / 1000)); }

  /* ------------------------------------------------------------ mottagning */
  onState(d, from) {
    const s = this.s; if (!s || !this.active) return;
    const pr = s.proxies.get(from); if (!pr) return;
    const flags = d[16] | 0, dead = !!(flags & 4);
    const q = _qa.set(d[3], d[4], d[5], d[6]);
    if (q.lengthSq() < 0.5) return;
    q.normalize();
    const p = V3(d[0], d[1], d[2]);
    if (!dead && pr.dead) {
      // återuppstånden – börja om bufferten (ingen interpolering genom teleporten)
      pr.dead = false; pr.obj.visible = true; pr.buf.length = 0;
      pr.pos.copy(p);
    }
    pushBuf(pr, p, q.clone(), V3(d[7], d[8], d[9]));
    pr.aimDir.set(d[10], d[11], d[12]); if (pr.aimDir.lengthSq() < 0.5) pr.aimDir.copy(pr.fwd); else pr.aimDir.normalize();
    pr.aimDist = d[13];
    pr.shield = Math.max(0, Math.min(1, d[14])) * pr.maxShield; pr.hull = Math.max(0, Math.min(1, d[15])) * pr.maxHull;
    pr.netFire = !!(flags & 1) && !dead;
    pr.boosting = !!(flags & 2);
    if (dead && !pr.dead) {
      pr.dead = true; pr.netFire = false;
      this.W.fx.explode(pr.pos, pr.radius * 1.15, pr.vel, { debris: 10 });
      this.W.sfxAt('explode', pr.pos, 1.2);
      pr.obj.visible = false;
      if (this.W.playerTarget === pr) this.W.playerTarget = null;
      if (s.host) {
        const k = pr.lastAttacker && this.W.time - (pr.netLastAt || -99) < 6 ? this.slotOf(pr.lastAttacker) : -1;
        this.playerDown(pr.netSlot, k);
      }
    }
  }
  slotOf(sh) { if (!sh) return -1; if (sh === this.W.player) return this.s.slot; if (sh.netPlayer) return sh.netSlot; return -1; }
  onSnap(d) {
    const s = this.s; if (!s || !this.active || s.host) return;
    const W = this.W, now = performance.now();
    for (let i = 0; i + 11 < d.length; i += 12) {
      const id = d[i] | 0, ti = d[i + 1] | 0;
      if (id <= 0 || s.killed.has(id) || ti < 0 || ti >= NPC_TYPES.length) continue;
      const q = new THREE.Quaternion(d[i + 5], d[i + 6], d[i + 7], d[i + 8]);
      if (q.lengthSq() < 0.5) continue;
      q.normalize();
      const p = V3(d[i + 2], d[i + 3], d[i + 4]);
      let e = s.enemies.get(id);
      if (!e) {
        if (s.enemies.size >= 120) continue;
        e = W.spawn(NPC_TYPES[ti], { team: 1, pos: p, quat: q, throttle: 0 });
        e.ai = null; e.static = true; e.netId = id; e.buf = []; e.update = proxyUpdate;
        if (!e.isLarge) W.fx.warpIn(e.pos, e.fwd, e.radius);
        s.enemies.set(id, e);
      }
      e.seen = now;
      pushBuf(e, p, q, null);
      e.hull = Math.max(1, d[i + 9] / 100 * e.maxHull); e.shield = d[i + 10] / 100 * e.maxShield;
      const fl = d[i + 11] | 0;
      if (fl & 2) e.hudMark = 'destroy';
      if (fl & 1 && e.weapon) { e.cd = 0; e.aimDir.copy(e.fwd); e.fireLaser(); }
    }
    // fiender som inte längre finns hos värden (t.ex. missad händelse)
    for (const [id, e] of s.enemies) if (now - e.seen > 1600 && !e.dead) { W.removeShip(e); s.enemies.delete(id); }
  }
  applyEvent(e) {
    const s = this.s; if (!s || !this.active) return;
    const g = this.g, W = this.W, k = e[0] | 0;
    if (k === 1) {                       // fiende nedskjuten [1, id, slot, poäng]
      if (s.host) return; // värden har redan sett det hända
      const id = e[1] | 0, by = e[2] | 0;
      s.killed.add(id);
      const en = s.enemies.get(id);
      let pos = null;
      if (en) { pos = en.pos.clone(); if (!en.dead) en.die(null, true); s.enemies.delete(id); if (W.playerTarget === en) W.playerTarget = null; }
      if (by === s.slot) { g.hud.hit(true); g.sfx.play('kill'); if (pos && e[3] > 0) g.hud.floater(pos, '+' + (e[3] | 0)); }
    } else if (k === 2) {                // missil [2, ägare, mål, typ]
      if (s.host) return;
      const o = e[1] | 0; if (o === -(s.slot + 1)) return;
      const owner = this.resolve(o), target = this.resolve(e[2] | 0);
      if (!owner) return;
      const def = (e[3] | 0) === 1 ? NPC_TORPEDO : (e[3] | 0) === 2 && owner.secondary ? owner.secondary : NPC_MISSILE;
      const pos = owner.pos.clone().addScaledVector(owner.fwd, owner.radius * 0.6);
      W.missiles.fire({ pos, dir: owner.fwd, baseVel: owner.vel, def, team: owner.team, owner, target, dmgMult: 1 });
      W.sfxAt('missile', owner.pos, 0.9);
    } else if (k === 3) {                // ny våg
      s.wave = e[1] | 0;
      g.hud.flashMsg('Våg ' + s.wave, 2.5); g.sfx.play('levelup');
      if (!s.host) g.hud.setObjectives([{ id: 'wave', text: 'Våg ' + s.wave + ': förstör alla fiender', state: 'active', progress: '' }]);
    } else if (k === 4) {                // våg avklarad: återställ alla
      const bonus = e[2] | 0;
      g.hud.flashMsg(`Våg ${e[1] | 0} avklarad! +${fmt(bonus)} i bonus`, 3); g.sfx.play('objective');
      const P = W.player;
      if (P && !P.dead) { P.shield = P.maxShield; P.hull = Math.min(P.maxHull, P.hull + P.maxHull * 0.3); P.missiles = Math.min(g.playerStats().ammo, P.missiles + 2); P.flares = Math.min(P.maxFlares, P.flares + 2); }
      if (s.host) {
        s.reserves = Math.min(9, s.reserves + 1);
        // utslagna piloter utan reservskepp kommer tillbaka
        for (let i = 0; i < s.pl.length; i++) if (s.dd[i] === 2) { s.dd[i] = 1; s.respawn.push({ slot: i, t: 1.5 }); }
        if (g.mission) g.mission.radio('dator', 'Sköldar återställda, skrov delvis lagade. Ett extra reservskepp har anlänt.', 3);
      }
    } else if (k === 5) {                // spelare nedskjuten [5, offer, skytt]
      const v = e[1] | 0, by = e[2] | 0;
      const vn = v === s.slot ? 'Du' : s.names[v] || 'En pilot';
      let txt = by >= 0 && by !== v ? `${by === s.slot ? 'Du' : s.names[by]} sköt ner ${v === s.slot ? 'dig' : s.names[v]}!` : `${vn} blev nedskjuten!`;
      if (by === s.slot && v !== s.slot) { g.hud.hit(true); g.sfx.play('kill'); }
      toast(txt, { ms: 2200 });
    } else if (k === 6) {                // återuppstå [6, slot, x, y, z]
      const slot = e[1] | 0;
      if (s.host) s.dd[slot] = 0;
      if (slot === s.slot) this.respawnLocal(V3(e[2], e[3], e[4]));
    }
  }
  onDmg(list) {
    const s = this.s, W = this.W, g = this.g; if (!s || !this.active) return;
    const P = W.player; if (!P || P.dead || P.invulnerable) return;
    for (const d of list) {
      const dir = V3(d[3], d[4], d[5]); if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); dir.normalize();
      const wasShield = P.shield > 0;
      const point = P.pos.clone().addScaledVector(dir, -P.radius * 0.8);
      P.damage(Math.max(0, d[0]), { sm: d[1] || 1, hm: d[2] || 1, point, dir, kind: ['laser', 'blast', 'ram'][d[6] | 0] || 'laser' });
      g.hud.damageFrom(dir.clone().negate());
      W.shakeAmt = Math.min(1.2, W.shakeAmt + 0.18);
      g.sfx.play(wasShield ? 'shieldHit' : 'hullHit');
      if (P.dead) break;
    }
  }
  onInfo(d) {
    const s = this.s; if (!s || !this.active || s.host) return;
    s.wave = d.w; s.score = d.sc; s.reserves = d.r; s.kills = d.k.slice(0, 4).concat([0, 0, 0, 0]).slice(0, 4); s.dd = d.dd; s.tl = d.tl; s.left = d.n;
    if (s.mode === 'duel') this.duelObjectives();
    else if (s.wave > 0) {
      const key = s.wave + ':' + d.n + ':' + d.r;
      if (key !== s.lastInfo) { s.lastInfo = key; this.g.hud.setObjectives([{ id: 'wave', text: 'Våg ' + s.wave + ': förstör alla fiender', state: 'active', progress: `– ${d.n} kvar` }, { id: 'res', text: 'Reservskepp: ' + d.r, state: 'active', optional: false }]); }
    }
  }
  duelObjectives() {
    const s = this.s; if (!s) return;
    const rows = s.pl.map((id, i) => ({ i, k: s.kills[i] || 0 })).sort((a, b) => b.k - a.k);
    const tl = s.tl >= 0 ? Math.max(0, Math.round(s.tl)) : DUEL_TIME;
    const list = [{ id: 't', text: `Först till ${DUEL_KILLS} · ${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')} kvar`, state: 'active', progress: '' }]
      .concat(rows.map(r => ({ id: 'p' + r.i, text: (r.i === s.slot ? 'Du' : s.names[r.i]) + ': ' + r.k, state: r.i === s.slot ? 'done' : 'active', progress: '' })));
    const key = JSON.stringify(list);
    if (key !== s.lastInfo) { s.lastInfo = key; this.g.hud.setObjectives(list); }
  }
  onFx(d, from) {
    const s = this.s; if (!s || !this.active || !s.host) return;
    const pr = s.proxies.get(from); if (!pr || pr.dead) return;
    const W = this.W, k = d[0] | 0;
    if (k === 2) { W.launchFlares(pr); return; }
    if (k === 1) {
      const t = this.resolve(d[1] | 0);
      const target = t && t !== pr && t.team !== pr.team && !t.dead ? t : null;
      const def = pr.secondary || SECONDARY.homing;
      const n = def.salvo || 1;
      for (let i = 0; i < n; i++) {
        const pos = V3((i % 2 ? 1 : -1) * (1 + Math.floor(i / 2)) * (n > 1 ? 1.4 : 0), -1, -2).applyQuaternion(pr.quat).add(pr.pos);
        W.missiles.fire({ pos, dir: pr.fwd, baseVel: pr.vel, def, team: pr.team, owner: pr, target, dmgMult: 1 + (pr.dmgMult - 1) * 0.5, wobble: n > 1 ? Math.random() * 10 : 0 });
      }
      this.hostEvent([2, -(pr.netSlot + 1), this.ref(target), 2]);
    }
  }
  /** Egen missil avfyrad (lokalt, PlayerControl). Klient: be värden skjuta den på riktigt. Värd: visa för andra. */
  localMissile(T) {
    const s = this.s; if (!s) return;
    if (s.host) this.hostEvent([2, -(s.slot + 1), this.ref(T), 2]);
    else this.net.send('fx', [1, this.ref(T)]);
  }

  /* ------------------------------------------------------------ visuellt hos klienten */
  visualHit(ship, sub, point, dir, owner) {
    const W = this.W, g = this.g;
    if (ship.shield > 0 && !ship.isLarge) W.fx.shieldHit(ship, point, ship.team === 0 ? [0.4, 1.2, 2.6] : [2.6, 0.9, 0.5]);
    else W.fx.spark(point, _qd.copy(dir).negate(), 5, 50, [3, 1.8, 0.6], 0.7);
    if (owner && owner.isPlayer && ship !== owner) { g.hud.hit(false); g.sfx.play('hitConfirm'); W.stats.hits++; }
  }
  visualBlast(pos, radius) {
    const P = this.W.player;
    if (P && !P.dead) { const d = P.pos.distanceTo(pos); if (d < radius * 4) this.W.shakeAmt = Math.min(1.6, this.W.shakeAmt + (1 - d / (radius * 4)) * 0.8); }
  }

  /* ------------------------------------------------------------ död / återuppståndelse */
  onLocalDead(from) {
    const s = this.s; if (!s) return;
    this.g.hud.flashMsg(s.mode === 'duel' ? 'Nedskjuten! Tillbaka om några sekunder …' : 'Nedskjuten! Väntar på reservskepp …', 3.5);
    this.g.sfx.play('lose');
    if (s.host) this.playerDown(s.slot, this.slotOf(from));
  }
  hostKill(sh, from) {
    const s = this.s; if (!s || sh.netPlayer || sh.team !== 1) return;
    const by = this.slotOf(from);
    if (from && from.netPlayer) { this.W.stats.kills++; this.W.stats.killPoints += sh.points; }
    if (by >= 0) s.kills[by]++;
    this.hostEvent([1, sh.id, by, sh.points || 0]);
  }
  playerDown(slot, by) {
    const s = this.s; if (!s || s.ended || slot < 0 || slot >= 4) return;
    if (s.dd[slot]) return;
    s.dd[slot] = 1;
    if (s.mode === 'duel') { if (by >= 0 && by !== slot) s.kills[by]++; s.respawn.push({ slot, t: 4 }); }
    else if (s.reserves > 0) { s.reserves--; s.respawn.push({ slot, t: 5 }); }
    else s.dd[slot] = 2;
    this.hostEvent([5, slot, by]);
    if (s.mode === 'coop' && s.dd[slot] === 2 && slot === s.slot) this.g.hud.flashMsg('Inga reservskepp kvar – du är tillbaka efter vågen', 3.5);
  }
  respawnLocal(pos) {
    const g = this.g, W = this.W, s = this.s;
    const old = W.player;
    if (old && !old.removed) W.removeShip(old);
    const look = s.mode === 'duel' ? V3(0, 0, 0) : this.playersCenter(s.slot);
    if (look.distanceToSquared(pos) < 100) look.add(V3(0, 0, -200));
    const P = W.spawnPlayer(g.playerStats(), pos, look);
    P.invulnerable = true; s.spawnProt = 2.5;
    g.pc.reset(); g.targetSub = null; W.playerTarget = null;
    g.rig.snap(P);
    g.hud.flashMsg('Tillbaka i striden!', 2);
    g.sfx.play('power');
  }

  /* ------------------------------------------------------------ slut */
  hostEnd() {
    const s = this.s; if (!s || s.ended) return;
    s.ended = true;
    const m = this.g.mission;
    const d = { m: s.mode, sc: Math.min(1e9, s.mode === 'coop' ? this.coopScore() : 0), w: m ? (m.wave || 0) : 0, k: s.kills.slice(), t: Math.round(s.t) };
    this.net.send('end', d);
    this.showEnd(d);
  }
  showEnd(d) {
    const s = this.s; if (!s || !this.active) return;
    const g = this.g, save = g.save;
    this.teardown(false);
    // krediter till hangaren
    const credits = d.m === 'coop' ? Math.round(d.sc / 40) : (d.k[s.slot] || 0) * 60;
    save.credits += credits; writeSave(save);
    $('dbTitle').textContent = d.m === 'coop' ? 'Omgången är slut' : 'Luftstriden är över';
    const order = s.pl.map((id, i) => ({ i, k: d.k[i] || 0 })).sort((a, b) => b.k - a.k);
    const win = order[0];
    $('dbSub').textContent = d.m === 'coop' ? `Ni klarade er till våg ${d.w} tillsammans.` : (order.length > 1 && order[1].k === win.k ? 'Oavgjort i toppen!' : (win.i === s.slot ? 'Du vann luftstriden!' : s.names[win.i] + ' vann luftstriden!'));
    const gEl = $('dbGrade');
    gEl.className = 'rj-grade';
    if (d.m === 'coop') { gEl.textContent = d.w; gEl.title = 'Våg'; } else { gEl.textContent = (order.findIndex(o => o.i === s.slot) + 1) + ':a'; gEl.title = 'Placering'; }
    const t = $('dbStats'); t.innerHTML = '';
    const row = (a, b, cls) => { const tr = document.createElement('tr'); if (cls) tr.className = cls; tr.innerHTML = `<td>${esc(a)}</td><td>${esc(b)}</td>`; t.appendChild(tr); };
    row('Tid', Math.floor(d.t / 60) + ':' + String(Math.floor(d.t % 60)).padStart(2, '0'));
    for (const o of order) row((o.i === s.slot ? s.names[o.i] + ' (du)' : s.names[o.i]) + ' – nedskjutningar', o.k);
    if (d.m === 'coop') row('Gemensam poäng', fmt(d.sc), 'tot');
    $('dbCred').textContent = credits > 0 ? `+${fmt(credits)} kr till hangaren` : '';
    $('dbRecord').textContent = '';
    const bx = $('dbBtns'); bx.innerHTML = '';
    const B = (txt, fn, primary, dis) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = txt; b.disabled = !!dis; b.addEventListener('click', () => { g.audio.play('select'); fn(); }); bx.appendChild(b); return b; };
    if (this.net.isHost) B('Spela igen (till lobbyn)', () => this.net.backToLobby(), true);
    else B('Väntar på värden …', () => {}, true, true);
    B('Lämna', () => this.quit());
    g.ui.show('debrief', false);
  }
  /** Avslutar omgången lokalt (scen, krokar, timer). toMenu: bygg om menyvärlden direkt. */
  teardown(toMenu = true) {
    const g = this.g;
    this.active = false;
    if (this.stopTick) { this.stopTick(); this.stopTick = null; }
    $('pRestart').style.display = '';
    if (this.emo) this.emo.el.classList.add('hidden');
    g.overlay = false;
    if (g.state === 'flight' || g.state === 'paused' || g.state === 'loading') {
      g.state = 'debrief';
      g.sfx.stopEngine();
      g._ignoreUnlock = true; g.input.exitLock(); g._ignoreUnlock = false;
      g.hud.show(false);
      g.root.classList.remove('flying');
      g._lockHint();
      if (g.mission) g.mission.abort();
    }
    if (toMenu) g.toMenuWorld();
  }
  toLobby() {
    this.teardown(true);
    this.s = null;
    this.net.setMeta(this.myMeta());
    this.g.ui.show('online', false);
    this.lobby.open();
  }
  quit() {
    if (this.active) this.teardown(true); else if (this.g.state !== 'menu') this.g.toMenuWorld();
    this.s = null;
    if (this.net) this.net.leave();
    this.g.ui.show('menu', false);
  }
  onPeerLeave(p) {
    const s = this.s; if (!s || !this.active) return;
    const pr = s.proxies.get(p.id);
    if (!pr) return;
    s.proxies.delete(p.id);
    const W = this.W;
    W.removeShip(pr);
    if (W.netPlayers) { const i = W.netPlayers.indexOf(pr); if (i >= 0) W.netPlayers.splice(i, 1); }
    if (W.playerTarget === pr) W.playerTarget = null;
    if (s.host) { s.dd[pr.netSlot] = 2; s.respawn = s.respawn.filter(r => r.slot !== pr.netSlot); }
    toast((p.name || 'En pilot') + ' lämnade', { ms: 2600 });
    if (s.proxies.size === 0 && !s.ended) {
      toast('Alla andra har lämnat – omgången avslutas', { ms: 3000 });
      if (s.host) this.hostEnd();
    }
  }
  onHostLeft(h) {
    if (!this.active && this.g.ui.cur !== 'debrief') return;
    toast('Värden lämnade – omgången avbröts', { big: true, ms: 3200 });
    this.toLobby();
    if (this.net.isHost && this.net.phase === 'game') this.net.backToLobby();
  }
}
