/**
 * Kubvärld – onlineläge (engine/net.js). Värden är auktoritativ: världen, varelser, föremål på marken, kistor/ugnar
 * och tiden simuleras hos värden. Gästen genererar terrängen själv från fröet och får värdens ändringar (komprimerade,
 * i bitar) + löpande deltan för närliggande chunkar. Gästens inventarie, hälsa och position ägs av gästen och sparas
 * lokalt per värdvärld.
 *
 * Meddelanden (värd → gäst): go, sn (ögonblicksbild), bk (blockdeltan), cm (omsynk av chunk), mb (varelser), dr/dx
 *   (föremål), give, hurt, cc (behållare), tm (tid), fx (effekter), kill, pt (portaler)
 * (gäst → värd): hello, ed (blockändringar/brytning), act (handlingar), hit, pvp, arw, drp, pk, co/cs/cx
 * (alla): st (spelarstatus, snabb), skin (figur, kv1-kod)
 */
import * as THREE from 'three';
import { createNet, createLobby, V, EMOTES, emoteBar } from '../../engine/net.js';
import { BLOCKS, ITEMS, B, isWater, isLava, isDoor, isTrap, isGate, isPortal, isButton, isRep, WATER, LAVA, CY, armorOf, isBlock, ARMOR_MATS, maxStack } from './blocks.js';
import { ckey } from './world.js';
import { MOBS, lightColor } from './entities.js';
import { PROFS, blockGeo, extrudedGeo, isCubeItem } from './models.js';
import { buildSkinModel, decodeSkin, defaultSkin, PX } from './skin.js';
import { kv } from '../../engine/kit.js';
import { newFurnace } from './inventory.js';

export const NET_VERSION = '1';
const DIMS = ['over', 'muspel'];
const dimIdx = d => d === 'muspel' ? 1 : 0;
const MOB_TYPES = Object.keys(MOBS);
const PROF_KEYS = Object.keys(PROFS);
const PART = 12000;              // tecken per bit av ögonblicksbilden
const REACH_OK = 8.5;            // längsta tillåtna avstånd för en gästs blockändring (räckvidd + fördröjning)
const MOB_RANGE = 64, MOB_CAP = 40;

/* ------------------------------------------------------------------ scheman */
const isId = V.str(48, /^[A-Za-z0-9_-]+$/);
const isK = V.str(28, /^-?\d{1,8},-?\d{1,4},-?\d{1,8}$/);
const ITEM = x => Number.isInteger(x) && x > 0 && x < 512 && !!(isBlock(x) ? BLOCKS[x] : ITEMS[x]);
const SLOT = x => x === null || (Array.isArray(x) && x.length === 3 && ITEM(x[0]) && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= 64 && Number.isInteger(x[2]) && x[2] >= 0 && x[2] <= 5000);
const SLOTS = V.arr(SLOT, 27, 1);
const FURN = V.obj({ i: SLOT, u: SLOT, o: SLOT, b: V.num(0, 1e5), bm: V.num(0, 1e5), p: V.num(0, 100) });
const MODE = V.oneOf(['survival', 'creative']);
export const ROOM = V.obj({ mode: MODE, pvp: V.bool, wn: V.str(40) });
export const START = V.obj({ wid: V.str(40, /^[A-Za-z0-9_-]+$/), name: V.str(40), seed: V.int(0, 4294967295), ver: V.int(1, 9), mode: MODE, diff: V.int(0, 2), pvp: V.bool });
const INTS = n => V.arr(V.int(-1e8, 1e8), n);
const PORT = V.arr(V.nums(4, -1e8, 1e8), 200);

export function makeNet() {
  const net = createNet({ game: 'kubvarld', version: NET_VERSION, maxPlayers: 8, minPlayers: 1, migrateHost: false, roomStateSchema: ROOM, startSchema: START });
  const d = (t, o) => net.define(t, o);
  // värd → gäst
  d('go', { schema: START, rate: 2, hostOnly: true });
  d('sn', { schema: V.obj({ i: V.int(0, 4000), n: V.int(1, 4000), d: V.str(PART + 8) }), rate: 140, maxBytes: PART + 200, hostOnly: true });
  d('bk', { schema: V.obj({ m: V.int(0, 1), b: INTS(1600) }), rate: 60, maxBytes: 16000, hostOnly: true });
  d('cm', { schema: V.obj({ m: V.int(0, 1), k: V.int(0, 4294967295), d: V.str(90000) }), rate: 40, maxBytes: 91000, hostOnly: true });
  d('mb', { schema: V.arr(V.nums(10, -1e8, 1e8), MOB_CAP), rate: 14, maxBytes: 9000, hostOnly: true });
  d('dr', { schema: V.arr(V.nums(10, -1e8, 1e8), 64), rate: 60, maxBytes: 9000, hostOnly: true });
  d('dx', { schema: V.arr(V.int(0, 1e9), 128), rate: 60, maxBytes: 2000, hostOnly: true });
  d('give', { schema: V.arr(V.nums(3, 0, 1e5), 48), rate: 40, maxBytes: 2000, hostOnly: true });
  d('hurt', { schema: V.obj({ a: V.num(0, 200), x: V.num(-1.01, 1.01), z: V.num(-1.01, 1.01), kb: V.num(0, 30), s: V.str(24), f: V.bool }), rate: 40, hostOnly: true });
  d('cc', { schema: V.obj({ m: V.int(0, 1), k: isK, c: V.opt(SLOTS), f: V.opt(FURN) }), rate: 40, maxBytes: 3000, hostOnly: true });
  d('tm', { schema: V.obj({ t: V.num(0, 1e7), sk: V.bool, n: V.int(0, 8), s: V.int(0, 8) }), rate: 6, hostOnly: true });
  d('fx', { schema: V.obj({ k: V.oneOf(['boom', 'arw', 'fire']), m: V.int(0, 1), p: V.nums(6, -1e8, 1e8), by: V.opt(isId) }), rate: 60, maxBytes: 400, hostOnly: true });
  d('kill', { schema: V.int(0, 64), rate: 20, hostOnly: true });
  d('pt', { schema: V.obj({ over: PORT, muspel: PORT }), rate: 2, maxBytes: 9000, hostOnly: true });
  // gäst → värd
  d('hello', { schema: V.obj({ sk: V.str(4200) }), rate: 1, maxBytes: 4400 });
  d('ed', { schema: V.obj({ m: V.int(0, 1), s: INTS(256), b: INTS(64) }), rate: 30, maxBytes: 3600 });
  d('act', { schema: V.obj({ a: V.oneOf(['btn', 'rep', 'note', 'tnt', 'ign', 'bm', 'shear', 'trd', 'pb']), m: V.int(0, 1), p: INTS(6) }), rate: 10 });
  d('hit', { schema: V.nums(4, -1e9, 1e9), rate: 12 });
  d('pvp', { schema: V.obj({ t: isId, d: V.num(0, 40), x: V.num(-1.01, 1.01), z: V.num(-1.01, 1.01) }), rate: 6 });
  d('arw', { schema: V.nums(7, -1e8, 1e8), rate: 6 });
  d('drp', { schema: V.arr(V.nums(9, -1e8, 1e8), 48, 1), rate: 8, maxBytes: 6000 });
  d('pk', { schema: V.int(0, 1e9), rate: 30 });
  d('co', { schema: V.obj({ m: V.int(0, 1), k: isK }), rate: 6 });
  d('cs', { schema: V.obj({ m: V.int(0, 1), k: isK, c: V.opt(SLOTS), f: V.opt(FURN) }), rate: 20, maxBytes: 3000 });
  d('cx', { schema: isK, rate: 6 });
  // alla
  d('st', { schema: V.nums(17, -1e8, 1e8), rate: 25, maxBytes: 420 });
  d('skin', { schema: V.str(4200), rate: 2, maxBytes: 4400 });
  return net;
}

/* ------------------------------------------------------------------ lobby */
/** h: { container, worlds() → [{id,name,mode}], onBack(), onStartPressed() } */
export function makeLobby(net, h) {
  let hostWorld = 'new';
  const lobby = createLobby({
    net, container: h.container, title: '🌐 Kubvärld online',
    modes: [{ id: 'survival', label: 'Överlevnad', desc: 'Samla, bygg och klara nätterna tillsammans.' }, { id: 'creative', label: 'Kreativt', desc: 'Oändligt med block och flygning – bygg fritt ihop.' }],
    onBack: h.onBack, onStart: () => h.onStartPressed(hostWorld),
    autoStart: { fullMs: 4000, readyMs: 4000, fillMs: 25000 },
    canStart: pl => net.kind === 'quick' && pl.length < 2 ? 'Väntar på fler spelare …' : true,
    renderSettings(el, { isHost, state, set }) {
      const st = Object.assign({ mode: net.mode === 'creative' ? 'creative' : 'survival', pvp: false, wn: 'Ny värld' }, state);
      if (!isHost) {
        el.innerHTML = `<p class="nl-note">Värld: <b>${esc(st.wn)}</b> · ${st.mode === 'creative' ? 'Kreativt' : 'Överlevnad'} · Strid mellan spelare: ${st.pvp ? 'på' : 'av'}</p><p class="nl-note">Värden väljer värld och läge. Din väska och position sparas hos dig till nästa gång.</p>`;
        return;
      }
      const ws = h.worlds();
      const key = JSON.stringify(st) + ws.length + hostWorld;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      const quick = net.kind === 'quick';
      el.innerHTML = (quick ? '<p class="nl-note">Snabbmatch: en ny värld skapas när matchen startar.</p>' : `<label class="nl-h" for="kvNetWorld" style="font-size:.95rem">Värld</label>
        <select class="nl-in" id="kvNetWorld"><option value="new">➕ Ny värld</option>${ws.map(w => `<option value="${esc(w.id)}" ${w.id === hostWorld ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`) +
        `<div class="nl-h" style="font-size:.95rem">Läge</div><div class="g3-tabs" id="kvNetMode"><button data-v="survival" class="${st.mode === 'survival' ? 'on' : ''}">Överlevnad</button><button data-v="creative" class="${st.mode === 'creative' ? 'on' : ''}">Kreativt</button></div>
        <label class="nl-row" style="gap:10px;cursor:pointer"><input type="checkbox" id="kvNetPvp" ${st.pvp ? 'checked' : ''}> Strid mellan spelare (PvP)</label>`;
      const sel = el.querySelector('#kvNetWorld');
      if (sel) sel.onchange = () => { hostWorld = sel.value; const w = ws.find(x => x.id === hostWorld); set({ wn: w ? w.name : 'Ny värld' }); };
      el.querySelector('#kvNetMode').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) set({ mode: b.dataset.v }); };
      el.querySelector('#kvNetPvp').onchange = e => set({ pvp: !!e.target.checked });
      if (!state || state.mode == null) set(st);
    }
  });
  return lobby;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ------------------------------------------------------------------ binärhjälp */
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
async function pack(u8) {
  if (typeof CompressionStream !== 'undefined') { try { const z = await pipe(u8, new CompressionStream('deflate')); const o = new Uint8Array(z.length + 1); o[0] = 1; o.set(z, 1); return o; } catch (e) { /* okomprimerat */ } }
  const o = new Uint8Array(u8.length + 1); o[0] = 0; o.set(u8, 1); return o;
}
async function unpack(u8) { return u8[0] === 1 ? pipe(u8.subarray(1), new DecompressionStream('deflate')) : u8.slice(1); }
const modsToB64 = m => { const a = new Uint32Array(m.size); let i = 0; for (const [idx, id] of m) a[i++] = idx * 512 + id; return b64(new Uint8Array(a.buffer)); };
function b64ToMods(s) {
  const u = unb64(s); if (u.length % 4) return null;
  const a = new Uint32Array(u.buffer, u.byteOffset, u.length / 4), out = new Uint32Array(a.length + 1); out[0] = 0xFFFFFFFF;
  for (let i = 0; i < a.length; i++) { if (a[i] >= 32768 * 512) return null; out[i + 1] = a[i]; }
  return out;
}
const r2 = v => Math.round(v * 100) / 100;
const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const slotOut = s => s ? [s.id, Math.min(64, s.n), Math.min(5000, s.d || 0)] : null;
const slotIn = s => s ? { id: s[0], n: s[1], d: s[2] || 0 } : null;
const furnOut = f => ({ i: slotOut(f.in), u: slotOut(f.fuel), o: slotOut(f.out), b: r2(Math.min(1e5, f.burn || 0)), bm: r2(Math.min(1e5, f.burnMax || 0)), p: r2(Math.min(100, f.prog || 0)) });
const furnIn = (f, o) => { f.in = slotIn(o.i); f.fuel = slotIn(o.u); f.out = slotIn(o.o); f.burn = o.b; f.burnMax = o.bm; f.prog = o.p; return f; };
const parseK = k => k.split(',').map(Number);

/* ------------------------------------------------------------------ andra spelare */
const NAME_CANVAS_W = 256;
function textSprite(text, bg = 'rgba(10,14,28,.6)', color = '#fff', h = 0.32) {
  const c = document.createElement('canvas'); c.width = NAME_CANVAS_W; c.height = 64;
  const ctx = c.getContext('2d'); ctx.font = '600 30px Rubik, system-ui, sans-serif';
  const w = Math.min(NAME_CANVAS_W - 8, ctx.measureText(text).width + 24);
  ctx.fillStyle = bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect((NAME_CANVAS_W - w) / 2, 10, w, 44, 12); else ctx.rect((NAME_CANVAS_W - w) / 2, 10, w, 44); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, NAME_CANVAS_W / 2, 33, NAME_CANVAS_W - 20);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(h * 4, h, 1); s.renderOrder = 10;
  return s;
}
const F = { sneak: 1, sprint: 2, swim: 4, fly: 8, block: 16, alive: 32, sleep: 64, creative: 128, hurt: 256, burn: 512, eat: 1024 };

class Remote {
  constructor(sess, id, name) {
    this.s = sess; this.id = id; this.name = name || 'Spelare';
    this.isRemote = true; this.pos = new THREE.Vector3(); this.vis = new THREE.Vector3(); this.has = false;
    this.alive = true; this.creative = false; this.sneaking = false; this.burnT = 0; this.fireRes = 0;
    this.dim = 'over'; this.st = null; this.buf = []; this.yaw = 0; this.pitch = 0; this.walk = 0; this.amp = 0; this.swingT = 0; this.swingN = -1;
    this.radius = 6; this.heldId = -1; this.light = new THREE.Color(1, 1, 1);
    this.model = null; this.tag = null; this.bubble = null; this.skinCode = null;
  }
  ensureModel() {
    if (this.model) return;
    const g = this.s.game; if (!g) return;
    const skin = (this.skinCode && decodeSkin(this.skinCode)) || defaultSkin();
    this.model = buildSkinModel(skin);
    this.model.root.visible = false;
    g.scene.add(this.model.root);
    this.tag = textSprite(this.name); this.tag.position.y = 2.15; this.model.root.add(this.tag);
  }
  setSkin(code) { this.skinCode = code; if (this.model) { const sk = decodeSkin(code); if (sk) this.model.setSkin(sk); } }
  setName(n) { if (n === this.name) return; this.name = n; if (this.tag) { this.model.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); this.tag = textSprite(n); this.tag.position.y = 2.15; this.model.root.add(this.tag); } }
  say(text) {
    this.ensureModel(); if (!this.model) return;
    if (this.bubble) { this.model.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    this.bubble = textSprite(text, 'rgba(255,255,255,.92)', '#162033', 0.42); this.bubble.position.y = 2.65; this.model.root.add(this.bubble);
    this.bubbleT = 4.5;
  }
  push(a) {
    const t = performance.now();
    this.st = a; this.dim = a[0] ? 'muspel' : 'over';
    this.pos.set(a[1], a[2], a[3]); this.yaw = a[4];
    const f = a[6] | 0;
    this.alive = !!(f & F.alive); this.creative = !!(f & F.creative); this.sneaking = !!(f & F.sneak); this.burnT = f & F.burn ? 1 : 0;
    this.radius = Math.max(3, Math.min(16, a[15] | 0));
    if (!this.has) { this.vis.copy(this.pos); this.has = true; this.buf.length = 0; }
    const last = this.buf[this.buf.length - 1];
    if (last && this.pos.distanceTo(last.p) > 12) this.buf.length = 0; // teleport / portal
    this.buf.push({ t, p: this.pos.clone(), yaw: a[4], pitch: a[5] });
    if (this.buf.length > 20) this.buf.shift();
    this.seen = t;
  }
  update(dt, g) {
    if (!this.model) { if (this.st) this.ensureModel(); if (!this.model) return; }
    const m = this.model, P = m.parts, a = this.st;
    const show = !!a && this.alive && this.dim === g.dim && this.has;
    m.root.visible = show;
    if (this.bubbleT > 0 && (this.bubbleT -= dt) <= 0 && this.bubble) { m.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.bubble = null; }
    if (!show) return;
    // mjuk interpolering 110 ms bakåt i tiden
    const T = performance.now() - 110, B2 = this.buf;
    let yaw = this.yaw, pitch = a[5];
    if (B2.length) {
      let i = B2.length - 1; while (i > 0 && B2[i].t > T) i--;
      const s0 = B2[i], s1 = B2[i + 1];
      const prev = this._pv || (this._pv = new THREE.Vector3()); prev.copy(this.vis);
      if (s1 && T >= s0.t) { const k = Math.min(1, (T - s0.t) / Math.max(1, s1.t - s0.t)); this.vis.lerpVectors(s0.p, s1.p, k); yaw = angLerp(s0.yaw, s1.yaw, k); pitch = s0.pitch + (s1.pitch - s0.pitch) * k; }
      else { this.vis.copy(s0.p); yaw = s0.yaw; pitch = s0.pitch; }
      this.hs = Math.hypot(this.vis.x - prev.x, this.vis.z - prev.z) / Math.max(dt, 1e-3);
    }
    const f = a[6] | 0, hs = Math.min(12, this.hs || 0);
    m.root.position.copy(this.vis);
    m.root.rotation.y = yaw + Math.PI;
    const body = m.root.children[0];
    const swim = !!(f & F.swim) && !(f & F.fly) && hs > 0.6, sleep = !!(f & F.sleep);
    // gång/spring: större utslag när man springer
    this.amp += ((hs > 0.4 && !(f & F.fly) ? Math.min(1, hs / 4.3) * (f & F.sprint ? 1.25 : 1) : 0) - this.amp) * Math.min(1, dt * 10);
    this.walk += hs * dt * 1.9;
    const sw = Math.sin(this.walk) * 0.9 * this.amp;
    P.legL.rotation.x = swim ? Math.sin(this.walk * 1.6) * 0.4 : sw; P.legR.rotation.x = swim ? -Math.sin(this.walk * 1.6) * 0.4 : -sw;
    // slag
    if (a[14] !== this.swingN) { if (this.swingN >= 0) this.swingT = 1; this.swingN = a[14]; }
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt * 3.2);
    const hold = this.heldId > 0 ? 0.25 : 0;
    P.armL.rotation.x = swim ? -2.6 + Math.sin(this.walk * 1.6) * 0.5 : -sw * 0.7;
    P.armR.rotation.x = swim ? -2.6 - Math.sin(this.walk * 1.6) * 0.5 : sw * 0.7 - hold - (this.swingT > 0 ? Math.sin(this.swingT * Math.PI) * 1.6 : 0) - (f & F.eat ? 0.9 + Math.sin(performance.now() * 0.03) * 0.15 : 0);
    P.head.rotation.x = swim ? 0.9 : -pitch * 0.8;
    // smyg, sim, sömn
    body.position.y = sleep ? 0.25 : swim ? 0.35 : f & F.sneak ? -0.2 : 0;
    body.rotation.x = sleep ? -Math.PI / 2 : swim ? -1.25 : f & F.sneak ? 0.35 : 0;
    // rustning, sköld och föremål i handen
    for (let i = 0; i < 4; i++) {
      const ad = a[8 + i] > 0 && armorOf(a[8 + i]);
      for (const gm of P.armor[i]) gm.visible = !!ad;
      if (ad) m.armorMats[i].color.setHex(ARMOR_MATS[ad.mat][1]).convertSRGBToLinear().multiply(m.mat.color);
    }
    const isSh = id => id > 0 && ITEMS[id] && ITEMS[id].shield;
    const shOn = isSh(a[12]) || isSh(a[7]);
    P.shield.visible = !!shOn;
    if (shOn && f & F.block) { P.armL.rotation.x = -1.25; P.armL.rotation.z = -0.35; } else P.armL.rotation.z = 0;
    m.shieldMat.color.copy(m.mat.color);
    const held = isSh(a[7]) ? 0 : a[7] | 0;
    if (held !== this.heldId) { this.heldId = held; this.s.heldMesh(this, P.armR, held); }
    // ljus och skada
    lightColor(g.world, g.sky.skyLight, this.vis.x, this.vis.y + 1, this.vis.z, this.light, 0.05);
    m.mat.color.copy(this.light); if (f & F.hurt) m.mat.color.lerp(_red, 0.6);
    if (this.heldMesh && this.heldMesh.material && this.heldMesh.material.color && !this.heldMesh.userData.cube) this.heldMesh.material.color.copy(m.mat.color);
    // namnskylten: dämpad när spelaren smyger
    if (this.tag) this.tag.material.opacity = f & F.sneak ? 0.35 : 1;
  }
  dispose(scene) {
    if (!this.model) return;
    scene.remove(this.model.root);
    for (const sp of [this.tag, this.bubble]) if (sp) { sp.material.map.dispose(); sp.material.dispose(); }
    if (this.heldMesh && this.heldMesh.material && !this.heldMesh.userData.cube) this.heldMesh.material.dispose();
    this.model.dispose(); this.model = null;
  }
}
const _red = new THREE.Color(1, 0.3, 0.3);

/* ------------------------------------------------------------------ gemensam session */
class Session {
  constructor(net, app) {
    this.net = net; this.app = app; this.game = null;
    this.remotes = new Map();
    this.stT = 0; this.stLast = ''; this.stKeep = 0; this.swingN = 0;
    this.offs = [];
    this._geo = new Map();
    this.on('st', (a, from) => this._onState(a, from));
    this.on('skin', (code, from) => { if (code.startsWith('kv1:')) this.remote(from).setSkin(code); });
    this.offs.push(net.on('emote', e => this._onEmote(e)));
    this.offs.push(net.on('roster', () => { for (const p of net.players) if (!p.isMe && this.remotes.has(p.id)) this.remotes.get(p.id).setName(p.name); }));
    this.offs.push(net.on('peerjoin', p => { if (p && !p.isMe) { this.sendSkin(p.id); if (this.game) this.game.log((p.name || 'En spelare') + ' anslöt.', 'good'); } }));
    this.offs.push(net.on('peerleave', p => this._onLeave(p)));
  }
  on(type, fn) { this.net.onMsg(type, (d, from, pl) => { try { fn(d, from, pl); } catch (e) { console.warn('Nätverksmeddelande', type, e); } }); }
  get pvp() { return !!this.pvpOn; }
  remote(id) {
    let r = this.remotes.get(id);
    if (!r) { const p = this.net.player(id); r = new Remote(this, id, p ? p.name : 'Spelare'); this.remotes.set(id, r); }
    return r;
  }
  _onState(a, from) {
    if (!this.net.players.some(p => p.id === from)) return;
    const r = this.remote(from); r.push(a);
  }
  _onLeave(p) {
    const r = this.remotes.get(p.id);
    if (r) { if (this.game) r.dispose(this.game.scene); this.remotes.delete(p.id); }
    if (this.game && !p.wasHost) this.game.log((p.name || 'En spelare') + ' lämnade.', 'bad');
  }
  _onEmote(e) {
    if (!this.game) return;
    const name = e.player ? e.player.name : '?';
    this.game.log(name + ': ' + e.text);
    if (e.from !== this.net.selfId) { const r = this.remotes.get(e.from); if (r && r.st) r.say(e.text); }
  }
  sendSkin(to) { try { const code = window.Spelhallen && window.Spelhallen.store.get('kubvarld:skin', null); if (code) this.net.send('skin', code, to); } catch (e) { /* ignorera */ } }
  attach(game) {
    this.game = game;
    for (const r of this.remotes.values()) r.ensureModel();
    this.sendSkin();
  }
  /** Egen status till alla (snabb, ~15 Hz när något ändras, annars 2 Hz). */
  _sendState(g, dt) {
    const P = g.player, inv = g.inv;
    if (g.hand && g.hand.swing > 0.95 && !this._sw) { this.swingN = (this.swingN + 1) % 1000; this._sw = true; } else if (!g.hand || g.hand.swing < 0.9) this._sw = false;
    this.stT -= dt; this.stKeep -= dt;
    if (this.stT > 0) return;
    this.stT = 1 / 15;
    const f = (P.sneaking ? F.sneak : 0) | (P.sprinting ? F.sprint : 0) | (P.inWater ? F.swim : 0) | (P.flying ? F.fly : 0) | (P.blocking ? F.block : 0) | (P.alive ? F.alive : 0) |
      (g.sleeping > 0 ? F.sleep : 0) | (g.creative ? F.creative : 0) | (P.hurtT > 0.25 ? F.hurt : 0) | (P.burnT > 0 ? F.burn : 0) | (g.eatT > 0 ? F.eat : 0);
    const A = inv.armor.map(s => s ? s.id : 0);
    const a = [dimIdx(g.dim), r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r2(P.yaw), r2(P.pitch), f, inv.held ? inv.held.id : 0, A[0], A[1], A[2], A[3], inv.off ? inv.off.id : 0, Math.max(0, Math.round(P.health)), this.swingN, g.world.radius, 0];
    const k = a.join(',');
    if (k === this.stLast && this.stKeep > 0) return;
    this.stLast = k; this.stKeep = 0.5;
    this.net.sendFast('st', a);
  }
  heldMesh(r, arm, id) {
    if (r.heldMesh) { arm.remove(r.heldMesh); if (!r.heldMesh.userData.cube && r.heldMesh.material) r.heldMesh.material.dispose(); r.heldMesh = null; }
    if (!id || !this.game) return;
    const g = this.game, cube = isCubeItem(id);
    let geo = this._geo.get(id);
    if (!geo) { geo = cube ? blockGeo(id) : extrudedGeo(g.atlas, id); this._geo.set(id, geo); }
    const mesh = cube ? new THREE.Mesh(geo, g.mats.entity) : new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.userData.cube = cube;
    if (cube) mesh.onBeforeRender = (rr, s, c, gg, mat) => { const L = g.world.light(Math.floor(r.vis.x), Math.floor(r.vis.y + 1), Math.floor(r.vis.z)); mat.uniforms.uEntLight.value.set((L >> 4) / 15, (L & 15) / 15); mat.uniformsNeedUpdate = true; };
    // i handen, lite större än en marktapp
    const tool = !cube && ITEMS[id] && ITEMS[id].tool;
    mesh.scale.setScalar(cube ? 0.4 : tool ? 0.72 : 0.6);
    mesh.position.set(0, -9.5 * PX, tool ? 3 * PX : 2.5 * PX);
    mesh.rotation.set(tool ? -0.5 : 0, tool ? 0.85 : 0.6, 0);
    arm.add(mesh); r.heldMesh = mesh;
  }
  /** Spelare i samma dimension (för PvP-sikte) */
  raycastPlayers(o, d, maxD) {
    let best = null, bt = maxD;
    for (const r of this.remotes.values()) {
      if (!r.st || !r.alive || r.dim !== this.game.dim) continue;
      const p = r.vis, t = rayBox(o, d, p.x - 0.35, p.y, p.z - 0.35, p.x + 0.35, p.y + 1.85, p.z + 0.35);
      if (t !== null && t < bt) { bt = t; best = r; }
    }
    return best ? { r: best, dist: bt } : null;
  }
  updateRemotes(dt) { const g = this.game; for (const r of this.remotes.values()) r.update(dt, g); }
  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    if (this.game) for (const r of this.remotes.values()) r.dispose(this.game.scene);
    this.remotes.clear();
    this._geo.clear(); // geometrierna är delade (cachade i models.js)
    this.game = null;
  }
}
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  return tmin;
}

/* ================================================================== VÄRD */
export class HostSession extends Session {
  constructor(net, app, start) {
    super(net, app);
    this.host = true; this.guest = false; this.start = start; this.pvpOn = start.pvp;
    this.hellos = []; this.pend = [[], []]; this.waitQ = []; this.dropQ = new Map(); this.dropRm = [];
    this.viewers = new Map(); this.lastC = new Map();
    this.secT = 0; this.mobT = 0; this.contT = 0; this.portT = 0; this.portLast = '';
    this.on('hello', (d, from) => { if (d.sk.startsWith('kv1:')) this.remote(from).setSkin(d.sk); this.hellos.push(from); });
    this.on('ed', (d, from) => this._onEdit(d, from));
    this.on('act', (d, from) => this._onAct(d, from));
    this.on('hit', (d, from) => this._onHit(d, from));
    this.on('pvp', (d, from) => this._onPvp(d, from));
    this.on('arw', (d, from) => this._onArrow(d, from));
    this.on('drp', (d, from) => this._onDrops(d, from));
    this.on('pk', (d, from) => this._onPickup(d, from));
    this.on('co', (d, from) => this._onOpen(d, from));
    this.on('cs', (d, from) => this._onSet(d, from));
    this.on('cx', (k, from) => { const v = this.viewers.get(k); if (v) v.delete(from); });
    this.offs.push(net.on('peerjoin', p => { if (p && !p.isMe && this.game) net.send('go', this.start, p.id); }));
  }
  _onLeave(p) { super._onLeave(p); for (const v of this.viewers.values()) v.delete(p.id); }
  attach(game) {
    super.attach(game);
    for (const W of Object.values(game.worlds)) W.keepData = true;
  }
  /** Gästen i rätt tillstånd för en handling? */
  _g(from) { const r = this.remotes.get(from); return r && r.st && this.net.players.some(p => p.id === from) ? r : null; }
  _world(r, m) { if (DIMS[m] !== r.dim) return null; return this.game && this.game.worlds[r.dim] || null; }
  _near(r, x, y, z, d = REACH_OK) { return Math.hypot(r.pos.x - x - 0.5, r.pos.y + 1.5 - y - 0.5, r.pos.z - z - 0.5) <= d; }
  targets(g) {
    const T = this._targets || (this._targets = []); T.length = 0;
    T.push(g.player);
    for (const r of this.remotes.values()) if (r.st && r.dim === g.dim && this.net.players.some(p => p.id === r.id)) T.push(r);
    return T;
  }
  allAsleep(g) {
    let n = 0, s = 0;
    for (const r of this.remotes.values()) { if (!r.st || r.dim !== 'over' || !r.alive) continue; n++; if (r.st[6] & F.sleep) s++; }
    if (g.dim === 'over') { n++; if (g.sleeping > 0) s++; }
    this.sleepN = s; this.sleepAll = n;
    return n > 0 && s >= n;
  }

  /* ---------- ögonblicksbild till ny gäst ---------- */
  async _sendSnapshot(to) {
    const g = this.game;
    const head = { portals: g.portals, skip: g.meta.structSkip || [], spawn: g.spawn, t: g.worldTime, bosses: g.flags.bosses || {} };
    const hj = new TextEncoder().encode(JSON.stringify(head));
    let n = 0; for (const d of DIMS) { const W = g.worlds[d]; if (W) for (const m of W.mods.values()) n += 3 + m.size; }
    const u = new Uint32Array(2 + Math.ceil(hj.length / 4) + n);
    u[0] = 0x4B563130; u[1] = hj.length; new Uint8Array(u.buffer, 8, hj.length).set(hj);
    let p = 2 + Math.ceil(hj.length / 4);
    DIMS.forEach((d, di) => { const W = g.worlds[d]; if (!W) return; for (const [key, m] of W.mods) { u[p++] = di; u[p++] = key; u[p++] = m.size; for (const [idx, id] of m) u[p++] = idx * 512 + id; } });
    const z = b64(await pack(new Uint8Array(u.buffer)));
    const parts = Math.ceil(z.length / PART) || 1;
    const r = this.remotes.get(to); if (r) r.ready = false;
    for (let i = 0; i < parts; i++) {
      if (!this.game || !this.net.players.some(pp => pp.id === to)) return;
      this.net.send('sn', { i, n: parts, d: z.slice(i * PART, (i + 1) * PART) }, to);
      if (i % 12 === 11) await new Promise(res => setTimeout(res, 110));
    }
    if (r) r.ready = true;
    this.net.send('pt', { over: (g.portals.over || []).slice(0, 200), muspel: (g.portals.muspel || []).slice(0, 200) }, to);
    this._sendTime(to);
    this._sendAllDrops(to);
  }
  _sendAllDrops(to) {
    const g = this.game, list = g.ents.drops.filter(e => e.nid).map(e => this._dropRow(e));
    for (let i = 0; i < list.length; i += 64) this.net.send('dr', list.slice(i, i + 64), to);
  }
  _sendTime(to, sk = false) { const g = this.game; this.allAsleep(g); this.net.send('tm', { t: Math.max(0, g.worldTime), sk, n: this.sleepN || 0, s: this.sleepAll || 0 }, to); }
  nightSkipped() { this._sendTime(undefined, true); }

  /* ---------- blockändringar ---------- */
  onBlock(dim, x, y, z, id) { const P = this.pend[dimIdx(dim)]; if (P.length < 60000) P.push(x, y, z, id); }
  _flush() {
    const g = this.game;
    for (let di = 0; di < 2; di++) {
      const P = this.pend[di]; if (!P.length) continue;
      this.pend[di] = [];
      for (const r of this.remotes.values()) {
        if (!r.st) continue;
        const out = [];
        const rc = Math.floor(r.pos.x) >> 4, rz = Math.floor(r.pos.z) >> 4, D = r.radius + 2, same = r.ready !== false && dimIdx(r.dim) === di;
        r.dirty = r.dirty || new Set();
        for (let i = 0; i < P.length; i += 4) {
          const cx = P[i] >> 4, cz = P[i + 2] >> 4;
          if (same && Math.max(Math.abs(cx - rc), Math.abs(cz - rz)) <= D) out.push(P[i], P[i + 1], P[i + 2], P[i + 3]);
          else r.dirty.add(di * 0x100000000 + ckey(cx, cz));
        }
        for (let i = 0; i < out.length; i += 1600) this.net.send('bk', { m: di, b: out.slice(i, i + 1600) }, r.id);
      }
    }
    void g;
  }
  /** Chunkar som ändrats medan gästen var långt borta: skicka hela ändringslistan när gästen närmar sig. */
  _resync() {
    const g = this.game;
    for (const r of this.remotes.values()) {
      if (!r.st || !r.dirty || !r.dirty.size || r.ready === false) continue;
      const di = dimIdx(r.dim), W = g.worlds[r.dim]; if (!W) continue;
      const rc = Math.floor(r.pos.x) >> 4, rz = Math.floor(r.pos.z) >> 4, D = r.radius + 2;
      let sent = 0;
      for (const k of r.dirty) {
        if (Math.floor(k / 0x100000000) !== di) continue;
        const key = k % 0x100000000, cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
        if (Math.max(Math.abs(cx - rc), Math.abs(cz - rz)) > D) continue;
        r.dirty.delete(k);
        const m = W.mods.get(key); if (!m) continue;
        const d = modsToB64(m); if (d.length > 90000) continue;
        this.net.send('cm', { m: di, k: key, d }, r.id);
        if (++sent >= 10) break;
      }
    }
  }
  _correct(r, m, x, y, z, W) { const b = W.get(x, y, z); if (b >= 0) this.net.send('bk', { m, b: [x, y, z, b] }, r.id); }
  _onEdit(d, from) {
    if (!this.game) return;
    const r = this._g(from); if (!r) return;
    const W = this._world(r, d.m); if (!W) return;
    if (d.s.length % 4 || d.b.length % 4) return;
    for (let i = 0; i < d.b.length; i += 4) this._later(r, d.m, W, d.b[i], d.b[i + 1], d.b[i + 2], () => this._applyBreak(r, d.m, W, d.b[i], d.b[i + 1], d.b[i + 2], d.b[i + 3]));
    for (let i = 0; i < d.s.length; i += 4) this._later(r, d.m, W, d.s[i], d.s[i + 1], d.s[i + 2], () => this._applySet(r, d.m, W, d.s[i], d.s[i + 1], d.s[i + 2], d.s[i + 3]));
  }
  /** Kör nu, eller när chunken har laddats hos värden (max 8 s). */
  _later(r, m, W, x, y, z, fn) {
    if (y < 0 || y >= CY) return;
    if (W.get(x, y, z) >= 0) { fn(); return; }
    if (this.waitQ.length < 400) this.waitQ.push({ W, x, y, z, fn, t: performance.now() });
  }
  _applyBreak(r, m, W, x, y, z, held) {
    const g = this.game;
    if (!this._near(r, x, y, z)) { this._correct(r, m, x, y, z, W); return; }
    const id = W.get(x, y, z);
    if (id <= 0 || !BLOCKS[id] || BLOCKS[id].hardness < 0 || isPortal(id) || isWater(id) || isLava(id)) { this._correct(r, m, x, y, z, W); return; }
    const give = [];
    g.hostBreak(W, x, y, z, ITEM(held) ? held : 0, r.creative, give);
    if (give.length) this.net.send('give', give.slice(0, 48), r.id);
  }
  _applySet(r, m, W, x, y, z, id) {
    const g = this.game;
    const old = W.get(x, y, z);
    if (old === id) return;
    let ok = this._near(r, x, y, z) && Number.isInteger(id) && id >= 0 && id < 512 && (id === 0 || (isBlock(id) && BLOCKS[id]));
    if (ok) {
      const ob = BLOCKS[old], repl = old === 0 || (ob && ob.replace) || isWater(old) || isLava(old);
      if (id === 0) ok = old === WATER || old === LAVA;
      else if (repl) ok = id === WATER || id === LAVA || (BLOCKS[id].hardness >= 0 && !isPortal(id) && id !== B.bedrock && !(isWater(id) || isLava(id)));
      else ok = sameFamily(old, id);
    }
    if (!ok) { this._correct(r, m, x, y, z, W); return; }
    W.set(x, y, z, id);
    g.netPlaced(W, x, y, z, id);
  }
  _onAct(d, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r) return;
    const W = this._world(r, d.m); if (!W) return;
    const [x, y, z] = d.p;
    const circ = g.circs[r.dim];
    switch (d.a) {
      case 'btn': this._later(r, d.m, W, x, y, z, () => { if (this._near(r, x, y, z) && isButton(W.get(x, y, z)) && circ) circ.press(x, y, z, 10); }); break;
      case 'rep': this._later(r, d.m, W, x, y, z, () => { if (this._near(r, x, y, z) && isRep(W.get(x, y, z)) && circ) { circ.cycleDelay(x, y, z); circ.markAround(x, y, z); } }); break;
      case 'note': this._later(r, d.m, W, x, y, z, () => { if (this._near(r, x, y, z) && BLOCKS[W.get(x, y, z)] && BLOCKS[W.get(x, y, z)].interact === 'note' && circ) circ.cycleNote(x, y, z); }); break;
      case 'tnt': if (W === g.world && this._near(r, x, y, z) && W.get(x, y, z) === B.tnt) g._ignite(x, y, z, 3); break;
      case 'ign': this._later(r, d.m, W, x, y, z, () => { if (this._near(r, x, y, z) && W.get(x, y, z) === B.obsidian) g._ignitePortal({ x, y, z }, W, false); }); break;
      case 'bm': this._later(r, d.m, W, x, y, z, () => { if (this._near(r, x, y, z)) { const id = W.get(x, y, z); if (id > 0) g._boneMeal({ x, y, z, id }, W, false); } }); break;
      case 'pb': {
        const axis = d.p[3] ? 1 : 0;
        if (Math.hypot(r.pos.x - x, r.pos.z - z) > 24) return;
        this._later(r, d.m, W, x, y, z, () => { if (!isPortal(W.get(x + (axis ? 0 : 1), y + 1, z + (axis ? 1 : 0)))) g._buildPortal(W, x, y, z, axis); });
        break;
      }
      case 'shear': case 'trd': {
        if (W !== g.world) return;
        const mob = g.ents.mobs.find(m => m.nid === x && !m.dead);
        if (!mob || mob.pos.distanceTo(r.pos) > 7) return;
        if (d.a === 'trd') { mob.trading = !!y; break; }
        if (mob.type === 'sheep' && !mob.sheared) g.shearMob(mob);
        break;
      }
    }
  }
  _onHit(d, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r || r.dim !== g.dim || !r.alive) return;
    const m = g.ents.mobs.find(q => q.nid === d[0] && !q.dead); if (!m) return;
    if (m.pos.distanceTo(r.pos) > 8) return;
    const l = Math.hypot(d[2], d[3]) || 1;
    g.ents.hitMob(m, Math.max(0, Math.min(16, d[1])), { x: d[2] / l, z: d[3] / l }, from);
  }
  _onPvp(d, from) {
    const g = this.game; if (!g || !this.pvpOn) return;
    const a = this._g(from); if (!a || !a.alive) return;
    const name = (this.net.player(from) || {}).name || 'en spelare';
    this.pvpHit(a, d.t, d.d, d.x, d.z, name);
  }
  /** Spelare slår spelare (värden avgör). attacker = Remote eller värdens egen spelare. */
  pvpHit(att, tid, dmg, dx, dz, name) {
    const g = this.game; dmg = Math.max(0, Math.min(14, dmg));
    if (tid === this.net.selfId) {
      if (g.dim !== att.dim || g.player.pos.distanceTo(att.pos) > 6) return;
      g.damagePlayer(dmg, { x: dx, z: dz }, 6, '@' + name);
      return;
    }
    const t = this._g(tid); if (!t || t.dim !== att.dim || t.pos.distanceTo(att.pos) > 6) return;
    this.net.send('hurt', { a: dmg, x: dx, z: dz, kb: 6, s: ('@' + name).slice(0, 24), f: false }, tid);
  }
  hitPlayer(r, dmg, dir) { const g = this.game; this.pvpHit({ pos: g.player.pos, dim: g.dim }, r.id, dmg, dir.x, dir.z, this.net.name); }
  _onArrow(d, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r || r.dim !== g.dim || !r.alive) return;
    const fr = new THREE.Vector3(d[0], d[1], d[2]), v = new THREE.Vector3(d[3], d[4], d[5]);
    if (fr.distanceTo(r.pos) > 3.5 || v.length() > 40) return;
    g.ents.shootArrow(fr, v, 'player', Math.max(0, Math.min(10, d[6])), from);
  }
  arrowFx(from, vel, by, fire = false) {
    const g = this.game; if (!g) return;
    for (const r of this.remotes.values()) if (r.st && r.dim === g.dim && r.id !== by && r.pos.distanceTo(from) < 80) this.net.send('fx', { k: fire ? 'fire' : 'arw', m: dimIdx(g.dim), p: [r2(from.x), r2(from.y), r2(from.z), r2(vel.x), r2(vel.y), r2(vel.z)] }, r.id);
  }
  fx(kind, c) { const g = this.game; for (const r of this.remotes.values()) if (r.st && r.dim === g.dim && r.pos.distanceTo(c) < 90) this.net.send('fx', { k: kind, m: dimIdx(g.dim), p: [r2(c.x), r2(c.y), r2(c.z), 0, 0, 0] }, r.id); }
  hurt(t, amount, dir, kb, src, fire) {
    if (!t || !t.isRemote) return;
    const l = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
    this.net.send('hurt', { a: Math.max(0, Math.min(200, amount)), x: dir ? dir.x / l : 0, z: dir ? dir.z / l : 0, kb: Math.max(0, Math.min(30, kb || 0)), s: String(src || '').slice(0, 24), f: !!fire }, t.id);
  }
  creditKill(by, m) { const i = MOB_TYPES.indexOf(m.type); if (i >= 0 && this.remotes.has(by)) this.net.send('kill', i, by); }

  /* ---------- föremål ---------- */
  _dropRow(e) { return [e.nid, e.id, e.n, e.d || 0, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.vel.x), r2(e.vel.y), r2(e.vel.z)]; }
  dropAdded(e) { if (!e.nid) e.nid = (this._dn = (this._dn || 0) + 1); this.dropQ.set(e.nid, e); }
  dropRemoved(e) { this.dropQ.delete(e.nid); this.dropRm.push(e.nid); }
  _flushDrops() {
    const g = this.game;
    const to = [...this.remotes.values()].filter(r => r.st && r.dim === g.dim && r.ready !== false).map(r => r.id);
    if (this.dropQ.size) { const rows = [...this.dropQ.values()].map(e => this._dropRow(e)); this.dropQ.clear(); if (to.length) for (let i = 0; i < rows.length; i += 64) this.net.send('dr', rows.slice(i, i + 64), to); }
    if (this.dropRm.length) { const rm = this.dropRm; this.dropRm = []; if (to.length) for (let i = 0; i < rm.length; i += 128) this.net.send('dx', rm.slice(i, i + 128), to); }
  }
  _onDrops(list, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r || r.dim !== g.dim) return;
    for (const a of list) {
      const [id, n, d, x, y, z, vx, vy, vz] = a;
      if (!ITEM(id) || !Number.isInteger(n) || n < 1 || n > 64 || !Number.isInteger(d) || d < 0 || d > 5000) continue;
      if (Math.hypot(r.pos.x - x, r.pos.y - y, r.pos.z - z) > 8) continue;
      const vel = new THREE.Vector3(vx, vy, vz); if (vel.length() > 20) vel.setLength(20);
      const e = g.ents.drop(id, n, x, y, z, d, vel); if (e) e.age = -0.8;
    }
  }
  _onPickup(nid, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r || r.dim !== g.dim || !r.alive) return;
    const e = g.ents.drops.find(q => q.nid === nid); if (!e || e.age < 0.2) return;
    if (Math.hypot(r.pos.x - e.pos.x, r.pos.y + 0.8 - e.pos.y, r.pos.z - e.pos.z) > 3) return;
    g.ents.removeDropNid(nid);
    this.net.send('give', [[e.id, e.n, e.d || 0]], from);
  }

  /* ---------- behållare ---------- */
  _cont(W, k) { const [x, y, z] = parseK(k); const b = W.get(x, y, z), d = BLOCKS[b]; return d && (d.interact === 'chest' || d.interact === 'dispenser' ? 'c' : d.interact === 'furnace' ? 'f' : null); }
  _payload(W, k, m) { return W.furnaces.has(k) ? { m, k, f: furnOut(W.furnaces.get(k)) } : { m, k, c: (W.chests.get(k) || []).map(slotOut) }; }
  _onOpen(d, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r) return;
    const W = this._world(r, d.m); if (!W) return;
    const [x, y, z] = parseK(d.k);
    if (!this._near(r, x, y, z)) return;
    const kind = this._cont(W, d.k); if (!kind) return;
    if (kind === 'c') { g._openLoot(d.k, x, y, z, W); if (!W.chests.has(d.k)) W.chests.set(d.k, new Array(BLOCKS[W.get(x, y, z)].interact === 'dispenser' ? 9 : 27).fill(null)); }
    else if (!W.furnaces.has(d.k)) W.furnaces.set(d.k, newFurnace());
    const key = d.m + '|' + d.k;
    if (!this.viewers.has(key)) this.viewers.set(key, new Set());
    this.viewers.get(key).add(from);
    const p = this._payload(W, d.k, d.m); this.lastC.set(key, JSON.stringify(p));
    this.net.send('cc', p, from);
  }
  _onSet(d, from) {
    const g = this.game; if (!g) return;
    const r = this._g(from); if (!r) return;
    const W = this._world(r, d.m); if (!W) return;
    const key = d.m + '|' + d.k, v = this.viewers.get(key);
    if (!v || !v.has(from)) return;
    const [x, y, z] = parseK(d.k); if (!this._near(r, x, y, z, 10)) return;
    if (d.f && W.furnaces.has(d.k)) furnIn(W.furnaces.get(d.k), d.f);
    else if (d.c && W.chests.has(d.k)) { const c = W.chests.get(d.k); if (d.c.length !== c.length) return; for (let i = 0; i < c.length; i++) c[i] = slotIn(d.c[i]); }
    else return;
    const p = this._payload(W, d.k, d.m), js = JSON.stringify(p); this.lastC.set(key, js);
    const others = [...v].filter(id => id !== from); if (others.length) this.net.send('cc', p, others);
    if (g.ui.open && g.ui.ctx && g.ui.ctx.key === d.k && W === g.world) g.ui.refresh();
  }
  _pollContainers() {
    const g = this.game;
    for (const [key, v] of this.viewers) {
      if (!v.size) { this.viewers.delete(key); this.lastC.delete(key); continue; }
      const [m, k] = key.split('|'), W = g.worlds[DIMS[+m]]; if (!W) continue;
      if (!W.chests.has(k) && !W.furnaces.has(k)) { this.viewers.delete(key); continue; }
      const p = this._payload(W, k, +m), js = JSON.stringify(p);
      if (js !== this.lastC.get(key)) { this.lastC.set(key, js); this.net.send('cc', p, [...v]); }
    }
  }

  /* ---------- varelser ---------- */
  _sendMobs() {
    const g = this.game;
    for (const r of this.remotes.values()) {
      if (!r.st || r.dim !== g.dim || r.ready === false) continue;
      const list = [];
      for (const m of g.ents.mobs) { const d = m.pos.distanceTo(r.pos); if (d < MOB_RANGE) list.push([d, m]); }
      list.sort((a, b) => a[0] - b[0]);
      const rows = list.slice(0, MOB_CAP).map(([, m]) => [m.nid, MOB_TYPES.indexOf(m.type), r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw),
        (m.dead ? 1 : 0) | (m.hurtT > 0.25 ? 2 : 0) | (m.burn > 0 ? 4 : 0) | (m.sheared ? 8 : 0) | (m.swing > 0 ? 16 : 0) | (m.climbing ? 32 : 0) | (m.graze ? 64 : 0), Math.max(0, Math.round(m.hp)), r2(m.look || 0), Math.max(0, PROF_KEYS.indexOf(m.prof))]);
      this.net.sendFast('mb', rows, r.id);
    }
  }

  /* ---------- per bildruta ---------- */
  update(g, dt) {
    if (!this.game) return;
    this._sendState(g, dt);
    this.updateRemotes(dt);
    // gäster som väntar på världen
    if (this.hellos.length && g.ready) for (const id of this.hellos.splice(0)) this._sendSnapshot(id).catch(e => console.warn('Ögonblicksbild', e));
    // chunkar runt gästerna (i alla dimensioner)
    for (const d of DIMS) {
      const W = g.worlds[d]; if (!W) continue;
      W.centers = [...this.remotes.values()].filter(r => r.st && r.dim === d && this.net.players.some(p => p.id === r.id)).map(r => [r.pos.x, r.pos.z]);
      if (W !== g.world) W.update(null, null, dt);
    }
    // väntande ändringar (chunken laddas fortfarande hos värden)
    if (this.waitQ.length) {
      const t = performance.now(), q = this.waitQ; this.waitQ = [];
      for (const o of q) { if (o.W.get(o.x, o.y, o.z) >= 0) { try { o.fn(); } catch (e) { console.warn(e); } } else if (t - o.t < 8000) this.waitQ.push(o); }
    }
    this._flush();
    this._flushDrops();
    if ((this.mobT -= dt) <= 0) { this.mobT = 0.12; this._sendMobs(); }
    if ((this.contT -= dt) <= 0) { this.contT = 0.25; this._pollContainers(); }
    if ((this.secT -= dt) <= 0) {
      this.secT = 1; this._resync(); this._sendTime();
      if ((this.portT -= 1) <= 0) { this.portT = 2; const js = JSON.stringify(g.portals); if (js !== this.portLast) { this.portLast = js; this.net.send('pt', { over: (g.portals.over || []).slice(0, 200), muspel: (g.portals.muspel || []).slice(0, 200) }); } }
    }
  }
}

/** Samma "familj" av block: tillståndsbyten som får göras med Använd (dörrar, luckor, grindar, spakar, plattor, åker). */
function sameFamily(a, b) {
  if (isDoor(a) && isDoor(b)) return true;
  if (isTrap(a) && isTrap(b)) return true;
  if (isGate(a) && isGate(b)) return true;
  if ((a === B.lever || a === B.lever_on) && (b === B.lever || b === B.lever_on)) return true;
  if ((a === B.cobble_slab && b === B.cobble) || (a === B.plank_slab && b === B.spruce_planks) || (BLOCKS[a] && BLOCKS[a].full === b)) return true;
  if ((a === B.grass || a === B.dirt || a === B.snowgrass) && b === B.farmland) return true;
  return false;
}

/* ================================================================== GÄST */
export class GuestSession extends Session {
  constructor(net, app, start) {
    super(net, app);
    this.host = false; this.guest = true; this.start = start; this.pvpOn = start.pvp;
    this.parts = []; this.partsN = 0; this.snap = null; this.onProgress = null; this._snapRes = null;
    this.rec = false; this.recS = []; this.recB = []; this.dropOut = [];
    this.mobT = 0; this.cont = null; this.pendOpen = null; this.trade = null;
    this.hostDim = null; this.lastMb = 0;
    this.on('sn', (d, from) => this._onPart(d));
    this.on('bk', d => this._onBlocks(d));
    this.on('cm', d => this._onChunk(d));
    this.on('mb', d => this._onMobs(d));
    this.on('dr', d => this._onDrops(d));
    this.on('dx', d => { const g = this.game; if (g) for (const nid of d) g.ents.removeDropNid(nid); });
    this.on('give', d => this._onGive(d));
    this.on('hurt', d => { const g = this.game; if (!g || !g.ready) return; const res = g.damagePlayer(d.a, d.x || d.z ? { x: d.x, z: d.z } : null, d.kb, d.s || null, false); if (d.f && res !== 'blocked' && !(g.player.fireRes > 0)) g.player.burnT = Math.max(g.player.burnT || 0, 3); });
    this.on('cc', d => this._onCont(d));
    this.on('tm', d => this._onTime(d));
    this.on('fx', d => this._onFx(d));
    this.on('kill', i => { const g = this.game, t = MOB_TYPES[i]; if (!g || !t) return; const md = MOBS[t]; g.stats.kills++; g.onKill(t); if (md.hostile) g.log('Du besegrade ' + md.art + ' ' + md.name.toLowerCase() + '.'); });
    this.on('pt', d => { this.portals = d; if (this.game) { this.game.portals.over = d.over; this.game.portals.muspel = d.muspel; } });
  }
  /* ---------- ögonblicksbild ---------- */
  requestWorld(onProgress) {
    this.onProgress = onProgress;
    const sk = (window.Spelhallen && window.Spelhallen.store.get('kubvarld:skin', null)) || '';
    const ask = () => this.net.send('hello', { sk: typeof sk === 'string' && sk.length < 4200 ? sk : '' });
    ask();
    this._askT = setInterval(() => { if (!this.partsN) ask(); }, 6000);
    return new Promise((res, rej) => { this._snapRes = res; this._snapRej = rej; });
  }
  _onPart(d) {
    if (this.snap) return;
    if (!this.partsN || this.partsN !== d.n) { this.partsN = d.n; this.parts = new Array(d.n); this.got = 0; }
    if (this.parts[d.i] == null) { this.parts[d.i] = d.d; this.got++; }
    if (this.onProgress) this.onProgress(this.got / this.partsN);
    if (this.got >= this.partsN) this._decode().catch(e => { console.warn('Världen kunde inte läsas', e); if (this._snapRej) this._snapRej(e); });
  }
  async _decode() {
    clearInterval(this._askT);
    const raw = await unpack(unb64(this.parts.join('')));
    this.parts = [];
    const u = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
    if (u[0] !== 0x4B563130 || u[1] > raw.byteLength) throw new Error('fel format');
    const head = JSON.parse(new TextDecoder().decode(raw.subarray(8, 8 + u[1])));
    const mods = [new Map(), new Map()];
    let p = 2 + Math.ceil(u[1] / 4);
    while (p + 2 < u.length) {
      const di = u[p++], key = u[p++], n = u[p++];
      if (di > 1 || n > 32768 || p + n > u.length) throw new Error('fel format');
      const arr = new Uint32Array(n + 1); arr[0] = 0xFFFFFFFF;
      for (let i = 0; i < n; i++) { const v = u[p++]; if (v >= 32768 * 512) throw new Error('fel format'); arr[i + 1] = v; }
      mods[di].set(key, arr);
    }
    const okArr = (a, n) => Array.isArray(a) && a.length <= n;
    this.snap = {
      mods, t: +head.t || 0, spawn: okArr(head.spawn, 3) && head.spawn.every(Number.isFinite) ? head.spawn : null,
      skip: okArr(head.skip, 100000) ? head.skip.filter(Number.isFinite) : [],
      portals: { over: okArr(head.portals && head.portals.over, 200) ? head.portals.over : [], muspel: okArr(head.portals && head.portals.muspel, 200) ? head.portals.muspel : [] },
      bosses: head.bosses && typeof head.bosses === 'object' ? head.bosses : {}
    };
    if (this._snapRes) this._snapRes(this.snap);
  }
  loadMods(W) { const M = this.snap && this.snap.mods[dimIdx(W.dim)]; if (M) for (const [k, a] of M) W.loadMods(k, a); }
  attach(game) {
    super.attach(game);
    for (const W of Object.values(game.worlds)) this._hook(W);
    if (this.portals) { game.portals.over = this.portals.over; game.portals.muspel = this.portals.muspel; }
    if (this.snap) this.snap.mods = null; // frigör minne
  }
  _hook(W) { W.onNetChange = (x, y, z, id, old, remote) => { if (!remote && this.rec && !this.noRec && W === this.game.world && this.recS.length < 256) this.recS.push(x, y, z, id); }; }
  worldCreated(W) { W.noSim = true; if (this.game) this._hook(W); }
  /* ---------- värld ---------- */
  _onBlocks(d) {
    const g = this.game; if (!g) return;
    const W = g.worlds[DIMS[d.m]]; if (!W) return;
    const b = d.b; if (b.length % 4) return;
    for (let i = 0; i < b.length; i += 4) { const id = b[i + 3]; if (id >= 0 && id < 512 && (id === 0 || BLOCKS[id])) W.setRemote(b[i], b[i + 1], b[i + 2], id); }
  }
  _onChunk(d) {
    const g = this.game; if (!g) return;
    const W = g.worlds[DIMS[d.m]]; if (!W) return;
    const arr = b64ToMods(d.d); if (arr) W.replaceMods(d.k, arr);
  }
  beginRec() { this.rec = true; }
  endRec(g) {
    this.rec = false;
    if (this.recS.length || this.recB.length) { this.net.send('ed', { m: dimIdx(g.dim), s: this.recS.slice(0, 256), b: this.recB.slice(0, 64) }); this.recS.length = 0; this.recB.length = 0; }
  }
  brk(x, y, z, held) { if (this.recB.length < 64) this.recB.push(x, y, z, held || 0); }
  act(a, p) { const g = this.game; this.net.send('act', { a, m: dimIdx(g.dim), p: p.map(v => Math.round(v)) }); }
  /* ---------- varelser (speglade) ---------- */
  _onMobs(rows) {
    const g = this.game; if (!g || !g.ready || this.hostDim !== g.dim) return;
    this.lastMb = performance.now();
    const E = g.ents, seen = new Set();
    for (const a of rows) {
      const [nid, ti, x, y, z, yaw, f, hp, look, pi] = a;
      const type = MOB_TYPES[ti]; if (!type) continue;
      seen.add(nid);
      let m = E.mobs.find(q => q.nid === nid);
      if (!m) { m = E.spawnMob(type, x, y, z, { nid, prof: PROF_KEYS[pi] || 'bonde' }); if (!m) continue; m.remote = true; m.yaw = yaw; m.tp = new THREE.Vector3(x, y, z); }
      m.tp.set(x, y, z); m.tyaw = yaw; m.hp = hp; m.look = look;
      if (f & 1 && !m.dead) { m.dead = true; m.deathT = 0; }
      if (f & 2 && !m._hurtF) m.hurtT = 0.5; m._hurtF = !!(f & 2);
      m.burn = f & 4 ? 1 : 0;
      if (!!(f & 8) !== !!m.sheared) { m.sheared = !!(f & 8); const P = m.model.parts; if (P.wool) for (const w of P.wool) w.visible = !m.sheared; if (P.skin) P.skin.visible = m.sheared; }
      if (f & 16 && !(m.swing > 0)) m.swing = 0.4;
      m.graze = !!(f & 64);
    }
    for (let i = E.mobs.length - 1; i >= 0; i--) { const m = E.mobs[i]; if (m.remote && !seen.has(m.nid) && !(m.dead && m.deathT < 0.9)) E._removeMob(i); }
  }
  updateMirror(E, dt) {
    const g = this.game;
    if (E.mobs.length && (this.hostDim !== g.dim || performance.now() - this.lastMb > 2000)) for (let i = E.mobs.length - 1; i >= 0; i--) if (E.mobs[i].remote) E._removeMob(i);
    const tmp = this._tv || (this._tv = new THREE.Vector3());
    for (let i = E.mobs.length - 1; i >= 0; i--) {
      const m = E.mobs[i]; if (!m.remote) continue;
      if (m.dead) {
        m.deathT += dt; m.model.root.rotation.z = Math.min(Math.PI / 2, m.deathT * 4); m.model.mat.color.setRGB(1, 0.35, 0.35);
        if (m.deathT > 0.9) { E.puff(m.pos.x, m.pos.y + m.h * 0.4, m.pos.z, m.def.hostile ? '#4a4a4a' : '#dddddd', 14, m.hw * 2); E._removeMob(i); }
        continue;
      }
      m.hurtT = Math.max(0, m.hurtT - dt);
      tmp.copy(m.pos);
      if (m.pos.distanceTo(m.tp) > 8) m.pos.copy(m.tp); else m.pos.lerp(m.tp, 1 - Math.exp(-12 * dt));
      const hs = Math.hypot(m.pos.x - tmp.x, m.pos.z - tmp.z) / Math.max(dt, 1e-3);
      m.yaw = angLerp(m.yaw, m.tyaw, 1 - Math.exp(-10 * dt));
      m.walk += Math.min(8, hs) * dt * (m.type === 'spider' ? 3.2 : m.type === 'chicken' ? 3.5 : m.type === 'salamander' ? 4 : m.type === 'eldjatte' ? 1.2 : 2.2);
      E._animate(m, Math.min(8, hs), dt);
      if (m.def.flying) { m.light.setRGB(1, 0.85, 0.75); m.model.mat.color.copy(m.light); } else lightColor(g.world, g.sky.skyLight, m.pos.x, m.pos.y + m.h * 0.6, m.pos.z, m.light, 0.04);
      if (m.hurtT > 0.25) m.model.mat.color.setRGB(1, 0.3, 0.3);
      else if (m.burn > 0) m.model.mat.color.copy(m.light).lerp(_burn.setRGB(1, 0.55, 0.25), 0.35);
      else m.model.mat.color.copy(m.light);
    }
  }
  hitMob(m, dmg, dir) { this.net.send('hit', [m.nid, Math.max(0, Math.min(16, dmg)), r2(dir.x), r2(dir.z)]); }
  hitPlayer(r, dmg, dir) { this.net.send('pvp', { t: r.id, d: Math.max(0, Math.min(14, dmg)), x: r2(dir.x), z: r2(dir.z) }); }
  shootArrow(from, vel, dmg) { this.net.send('arw', [r2(from.x), r2(from.y), r2(from.z), r2(vel.x), r2(vel.y), r2(vel.z), r2(dmg)]); }
  /* ---------- föremål ---------- */
  forwardDrop(id, n, x, y, z, d, vel) {
    const g = this.game; if (!g || this.hostDim !== g.dim) return false;
    if (this.dropOut.length < 48) this.dropOut.push([id, n, d || 0, r2(x), r2(y), r2(z), vel ? r2(vel.x) : 0, vel ? r2(vel.y) : 3.5, vel ? r2(vel.z) : 0]);
    return true;
  }
  askPickup(e) {
    const inv = this.game.inv, ms = maxStack(e.id);
    if (!inv.slots.some(s => !s || (s.id === e.id && s.n < ms && !s.d && !e.d))) return;
    this.net.send('pk', e.nid);
  }
  _onDrops(rows) {
    const g = this.game; if (!g || this.hostDim !== g.dim) return;
    for (const [nid, id, n, d, x, y, z, vx, vy, vz] of rows) {
      if (!ITEM(id)) continue;
      const e = g.ents.drops.find(q => q.nid === nid);
      if (e) { e.n = n; if (e.pos.distanceTo(_v3.set(x, y, z)) > 1.2) e.pos.set(x, y, z); continue; }
      g.ents.drop(id, n, x, y, z, d, _v3.set(vx, vy, vz), nid);
    }
  }
  _onGive(list) {
    const g = this.game; if (!g) return;
    for (const [id, n, d] of list) {
      if (!ITEM(id) || n < 1) continue;
      const left = g.inv.add(id, Math.min(64, n | 0), d | 0);
      if (left < n) { g.audio.play('pickup', { vol: 0.5, pitch: 0.9 + Math.random() * 0.3, gap: 40 }); g.onPickup(id, n - left); }
      if (left > 0) g.throwItem({ id, n: left, d: d | 0 });
    }
  }
  /* ---------- behållare ---------- */
  openContainer(k, title) { this.pendOpen = { k, m: dimIdx(this.game.dim), title, t: performance.now() }; this.net.send('co', { m: this.pendOpen.m, k }); }
  _onCont(d) {
    const g = this.game; if (!g) return;
    const po = this.pendOpen;
    if (po && po.k === d.k && po.m === d.m) {
      this.pendOpen = null;
      if (g.ui.open || !g.player.alive) { this.net.send('cx', d.k); return; }
      if (d.f) { const f = furnIn(newFurnace(), d.f); g.openInventory('furnace', { f, key: d.k, net: true }); this.cont = { k: d.k, m: d.m, obj: f, last: JSON.stringify(furnOut(f)) }; }
      else { const c = d.c.map(slotIn); g.openInventory('chest', { c, key: d.k, net: true, title: po.title }); this.cont = { k: d.k, m: d.m, obj: c, last: JSON.stringify(c.map(slotOut)) }; }
      g.audio.play('select', { vol: 0.5, pitch: 0.7 });
      return;
    }
    const C = this.cont; if (!C || C.k !== d.k || C.m !== d.m) return;
    if (d.f && !Array.isArray(C.obj)) { furnIn(C.obj, d.f); C.last = JSON.stringify(furnOut(C.obj)); }
    else if (d.c && Array.isArray(C.obj) && d.c.length === C.obj.length) { for (let i = 0; i < C.obj.length; i++) C.obj[i] = slotIn(d.c[i]); C.last = JSON.stringify(C.obj.map(slotOut)); }
    g.ui.refresh();
  }
  _pollUi() {
    const g = this.game, ui = g.ui, C = this.cont;
    if (C) {
      if (!ui.open || !ui.ctx || ui.ctx.key !== C.k) { this.net.send('cx', C.k); this.cont = null; }
      else {
        const js = Array.isArray(C.obj) ? JSON.stringify(C.obj.map(slotOut)) : JSON.stringify(furnOut(C.obj));
        if (js !== C.last) { C.last = js; this.net.send('cs', Array.isArray(C.obj) ? { m: C.m, k: C.k, c: C.obj.map(slotOut) } : { m: C.m, k: C.k, f: JSON.parse(js) }); }
      }
    }
    const tm = ui.open && ui.mode === 'trade' && ui.ctx && ui.ctx.mob;
    if (tm && this.trade !== tm) { this.trade = tm; this.act('trd', [tm.nid, 1, 0]); }
    else if (!tm && this.trade) { this.act('trd', [this.trade.nid, 0, 0]); this.trade = null; }
    if (this.pendOpen && performance.now() - this.pendOpen.t > 5000) this.pendOpen = null;
  }
  /* ---------- tid, effekter ---------- */
  _onTime(d) {
    const g = this.game; if (!g) return;
    this.sleepN = d.n; this.sleepAll = d.s;
    if (d.sk) { g.worldTime = d.t; if (g.sleeping > 0) g.wakeUp(true); return; }
    const diff = d.t - g.worldTime;
    if (Math.abs(diff) > 0.002) g.worldTime = d.t; else g.worldTime += diff * 0.5;
  }
  _onFx(d) {
    const g = this.game; if (!g || DIMS[d.m] !== g.dim) return;
    const p = d.p, from = new THREE.Vector3(p[0], p[1], p[2]), vel = new THREE.Vector3(p[3], p[4], p[5]);
    if (d.k === 'boom') g.boomFx(from);
    else if (d.k === 'fire') g.ents.shootFire(from, vel, 0);
    else g.ents.shootArrow(from, vel, 'vis', 0);
  }
  targets(g) { return [g.player]; }
  allAsleep() { return false; }
  /* ---------- sparning hos gästen (per värdvärld) ---------- */
  static key(wid) { return 'kubvarld:guest:' + wid; }
  static async loadSave(wid) { try { return (await kv.get(GuestSession.key(wid))) || null; } catch (e) { return null; } }
  async saveGuest(g) {
    if (!g.ready) return;
    const P = g.player;
    const rec = { player: { pos: [P.pos.x, P.pos.y, P.pos.z], yaw: P.yaw, pitch: P.pitch, health: P.alive ? P.health : 20, food: P.alive ? P.food : 20, sat: P.sat, flying: P.flying, view: P.view }, inv: g.inv.serialize(), dim: g.dim, bed: g.bed, flags: g.flags, stats: g.stats, t: Date.now() };
    try { await kv.set(GuestSession.key(this.start.wid), rec); } catch (e) { console.warn('Gästsparning misslyckades', e); }
  }
  /* ---------- per bildruta ---------- */
  update(g, dt) {
    if (!this.game) return;
    const h = this.remotes.get(this.net.hostId);
    this.hostDim = h && h.st ? h.dim : null;
    this._sendState(g, dt);
    this.updateRemotes(dt);
    if (this.dropOut.length) { this.net.send('drp', this.dropOut.splice(0, 48)); }
    if ((this.mobT -= dt) <= 0) { this.mobT = 0.2; this._pollUi(); }
    // speglade föremål försvinner om värden inte är i vår dimension
    if (this.hostDim !== g.dim) for (let i = g.ents.drops.length - 1; i >= 0; i--) if (g.ents.drops[i].nid) g.ents._removeDrop(i);
  }
  dispose() { clearInterval(this._askT); super.dispose(); }
}
const _v3 = new THREE.Vector3(), _burn = new THREE.Color();

/* ------------------------------------------------------------------ emote-panel i spelet */
export function emotePanel(net, host, onClose) {
  const wrap = document.createElement('div'); wrap.className = 'kv-emotes hidden';
  const t = document.createElement('div'); t.className = 'kv-emotes-t'; t.textContent = 'Snabbmeddelanden (T eller Esc stänger)'; wrap.appendChild(t);
  const bar = emoteBar(net, null); wrap.appendChild(bar.el);
  bar.el.addEventListener('click', e => { if (e.target.closest('button[data-e]')) close(); });
  host.appendChild(wrap);
  const close = () => { if (wrap.classList.contains('hidden')) return; wrap.classList.add('hidden'); if (onClose) onClose(); };
  return { get open() { return !wrap.classList.contains('hidden'); }, show() { wrap.classList.remove('hidden'); }, close, destroy() { bar.destroy(); wrap.remove(); } };
}
export { EMOTES };
