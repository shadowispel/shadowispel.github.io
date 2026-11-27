/**
 * Fjällracet – onlineläge: nätverk (engine/net.js), lobby, scheman och fjärrbilar (interpolering/extrapolering).
 * Själva loppets logik ligger i main.js (grenar på race.online).
 */
import * as THREE from 'three';
import { createNet, createLobby, V } from '../../engine/net.js';
import { CARS, COLORS, TRACKS, AI_DRIVERS, DIFFICULTY, trackName } from './data.js';
import { FINISHES, RIMS, SPOILERS, KITS, DECALS, TINTS } from './carmodel.js';

export const NET_VERSION = '2';
const CAR_IDS = CARS.map(c => c.id);
const TRACK_IDS = TRACKS.map(t => t.id);
const isKey = V.str(48, /^[A-Za-z0-9_-]+$/);

/** Bilens tillstånd i nätverket: 18 tal (se packCar). */
export const CS_N = 18;
const CS = V.nums(CS_N, -1e6, 1e6);

const ids = (a) => a.map(x => x.id);
/** Utseende i nätverket (kompakt): färg, lackyta, fälg, spoiler, kit, dekal, dekalfärg, nummer, neon, ruta. */
export const LOOKV = V.obj({ c: V.int(0, 0xffffff), f: V.oneOf(ids(FINISHES)), r: V.oneOf(ids(RIMS)), s: V.oneOf(['default'].concat(ids(SPOILERS))), k: V.oneOf(ids(KITS)),
  d: V.oneOf(ids(DECALS)), dc: V.int(0, 0xffffff), n: V.int(0, 99), ne: V.opt(V.int(0, 0xffffff)), t: V.oneOf(ids(TINTS)), p: V.opt(V.str(8, /^[A-ZÅÄÖ0-9 ]*$/)) });
export function packLook(lk) {
  return { c: lk.color | 0, f: lk.finish || 'gloss', r: lk.rims || 'std', s: lk.spoiler || 'default', k: lk.kit || 'none', d: lk.decal || 'none', dc: (lk.decalColor ?? 0xffffff) | 0, n: lk.number | 0, ne: lk.neon == null ? null : lk.neon | 0, t: lk.tint || 'clear', p: (lk.plate || '').slice(0, 8) };
}
export function lookFromNet(g) {
  const l = g.lk;
  if (!l) return { color: g.col };
  return { color: l.c, finish: l.f, rims: l.r, spoiler: l.s, kit: l.k, decal: l.d, decalColor: l.dc, number: l.n, neon: l.ne == null ? null : l.ne, tint: l.t, plate: l.p || undefined };
}
export const META = V.obj({ car: V.oneOf(CAR_IDS), col: V.int(0, 0xffffff), lk: V.opt(LOOKV) });
export const ROOM = V.obj({ track: V.oneOf(TRACK_IDS), laps: V.int(1, 5), fill: V.oneOf([0, 4, 6, 8]), diff: V.oneOf(Object.keys(DIFFICULTY)) });
const GRID = V.arr(V.obj({ id: isKey, n: V.str(40), car: V.oneOf(CAR_IDS), col: V.int(0, 0xffffff), lk: V.opt(LOOKV), sk: V.opt(V.num(0.5, 1.2)), ag: V.opt(V.num(0, 1.5)) }), 8, 1);
export const START = V.obj({ track: V.oneOf(TRACK_IDS), laps: V.int(1, 5), diff: V.oneOf(Object.keys(DIFFICULTY)), seed: V.int(0, 2 ** 31), grid: GRID });

export function makeNet() {
  const net = createNet({ game: 'fjallracet', version: NET_VERSION, maxPlayers: 8, minPlayers: 2, metaSchema: META, roomStateSchema: ROOM, startSchema: START });
  net.define('cs', { schema: CS, rate: 40, maxBytes: 400 });                                 // egen bil (snabb)
  net.define('ai', { schema: V.arr(V.nums(CS_N + 1, -1e6, 1e6), 7), rate: 30, maxBytes: 3200, hostOnly: true }); // datorbilar
  net.define('rk', { schema: V.arr(isKey, 8), rate: 10, maxBytes: 500, hostOnly: true });   // placeringar
  net.define('ld', { schema: V.int(0, 1), rate: 2 });                                         // klar med laddning
  net.define('go', { schema: V.num(0, 1e12), rate: 2, hostOnly: true });                     // värdtid för KÖR!
  net.define('res', { schema: V.arr(V.tuple([isKey, V.num(0, 1e5), V.num(-1, 1e5), V.int(0, 1)]), 8, 1), rate: 2, maxBytes: 1200, hostOnly: true });
  return net;
}

/* ------------------------------------------------------------------ packning */
const r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 10000) / 10000;
/** Packar en bil till 18 tal: t, pos(3), quat(4), vel(3), styrning, flaggor, varv, progress, måltid, bästa varv, slip. */
export function packCar(c, t, out = new Array(CS_N)) {
  const f = (c.drift ? 1 : 0) | (c.nitroOn ? 2 : 0) | (c.ctl.brake > 0.1 ? 4 : 0) | (c.grounded ? 8 : 0) | (c.ghostT > 0 ? 16 : 0) | (c.finished ? 32 : 0) | (c.ctl.hand ? 64 : 0);
  out[0] = r4(t); out[1] = r2(c.pos.x); out[2] = r2(c.pos.y); out[3] = r2(c.pos.z);
  out[4] = r4(c.quat.x); out[5] = r4(c.quat.y); out[6] = r4(c.quat.z); out[7] = r4(c.quat.w);
  out[8] = r2(c.vel.x); out[9] = r2(c.vel.y); out[10] = r2(c.vel.z);
  out[11] = r2(c.steer); out[12] = f; out[13] = c.lapsDone; out[14] = r2(c.progress);
  out[15] = c.finished ? r4(c.finishTime) : -1; out[16] = isFinite(c.bestLap) ? r4(c.bestLap) : -1; out[17] = r2(c.slip || 0);
  return out;
}

/* ------------------------------------------------------------------ fjärrbilar */
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _v = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
export const INTERP = 0.11;   // s bakåt i tiden (jämnar ut jitter)
const EXTRA_MAX = 0.3;        // s längsta extrapolering

/** Tar emot ett tillstånd för en fjärrbil. */
export function pushSample(c, a, off = 0) {
  const buf = c.net.buf;
  const s = { t: a[off], p: [a[off + 1], a[off + 2], a[off + 3]], q: [a[off + 4], a[off + 5], a[off + 6], a[off + 7]], v: [a[off + 8], a[off + 9], a[off + 10]], st: a[off + 11], f: a[off + 12] | 0, lap: a[off + 13] | 0, pr: a[off + 14], fin: a[off + 15], best: a[off + 16], slip: a[off + 17] };
  const ql = Math.hypot(s.q[0], s.q[1], s.q[2], s.q[3]);
  if (!(ql > 0.5)) return;
  s.q = s.q.map(x => x / ql);
  if (buf.length && s.t < buf[buf.length - 1].t - 0.5) buf.length = 0; // ny omgång / klocksprång
  if (buf.length && s.t <= buf[buf.length - 1].t) buf[buf.length - 1] = s; else buf.push(s);
  if (buf.length > 16) buf.shift();
  c.net.last = performance.now();
}

/** Flyttar en fjärrbil till interpolerat läge vid tid T (sekunder i loppets klocka). */
export function stepRemote(c, T, dt, tr) {
  const buf = c.net.buf;
  c.prevPos.copy(c.pos); c.prevQuat.copy(c.quat);
  if (!buf.length) return;
  let i = buf.length - 1;
  while (i > 0 && buf[i].t > T) i--;
  const a = buf[i], b = buf[i + 1];
  if (b && b.t > a.t && T >= a.t) {
    const k = Math.min(1, (T - a.t) / (b.t - a.t));
    c.pos.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
    _qa.set(a.q[0], a.q[1], a.q[2], a.q[3]); _qb.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    c.quat.slerpQuaternions(_qa, _qb, k);
    c.vel.set(a.v[0] + (b.v[0] - a.v[0]) * k, a.v[1] + (b.v[1] - a.v[1]) * k, a.v[2] + (b.v[2] - a.v[2]) * k);
  } else {
    const e = Math.max(0, Math.min(EXTRA_MAX, T - a.t));
    c.vel.set(a.v[0], a.v[1], a.v[2]);
    c.pos.set(a.p[0] + a.v[0] * e, a.p[1] + a.v[1] * e, a.p[2] + a.v[2] * e);
    c.quat.set(a.q[0], a.q[1], a.q[2], a.q[3]);
  }
  // mjuk korrigering om en lokal krock knuffat bilen (undvik ryck)
  const s = buf[buf.length - 1];
  c.F.copy(Z).applyQuaternion(c.quat); c.up.copy(Y).applyQuaternion(c.quat); c.Rt.copy(X).applyQuaternion(c.quat).negate();
  c.yaw = Math.atan2(c.F.x, c.F.z);
  c.speed = c.vel.length(); c.vf = c.vel.dot(c.F);
  c.steer = s.st; c.drift = !!(s.f & 1); c.nitroOn = !!(s.f & 2); c.ctl.brake = s.f & 4 ? 1 : 0; c.ctl.hand = !!(s.f & 64);
  c.grounded = !!(s.f & 8); c.ghostT = s.f & 16 ? 0.2 : 0; c.slip = s.slip;
  c.wheelSlip = c.drift ? Math.min(1, Math.abs(s.slip) * 2) : 0;
  c.lapsDone = s.lap; c.progress = s.pr;
  if (s.fin >= 0 && !c.finished) { c.finished = true; c.finishTime = s.fin; }
  if (s.best >= 0) c.bestLap = s.best;
  c.wheelSpin += (c.vf / c.model.shape.r) * dt;
  c.pitch *= 0.9; c.roll *= 0.9; c.bounce *= 0.9;
  tr.project(c.pos, c.tp.i, c.tp);
  c.onRoad = Math.abs(c.tp.d) <= tr.half + 0.4;
}

/* ------------------------------------------------------------------ lobby */
/**
 * Bygger lobbyn. h: { container, save, carUnlocked(c), onBack(), onStartPressed() , css(hex) }
 */
export function makeLobby(net, h) {
  const fills = [[0, 'Inga'], [4, 'Upp till 4'], [6, 'Upp till 6'], [8, 'Upp till 8']];
  const lobby = createLobby({
    net, container: h.container, title: '🌐 Fjällracet online',
    onBack: h.onBack,
    onStart: h.onStartPressed,
    autoStart: { fullMs: 4000, readyMs: 4000, fillMs: 25000 },
    dotColor: p => p.meta ? h.css(p.meta.col) : '#888',
    playerExtra: p => p.meta ? (CARS.find(c => c.id === p.meta.car) || {}).name || '' : '',
    renderMine(el) {
      const s = h.save;
      const meta = (id) => { const lk = h.lookOf(id); return { car: id, col: lk.color | 0, lk: packLook(lk) }; };
      const draw = () => {
        const m = net.me.meta || meta(s.car);
        el.innerHTML = `<div class="nl-h">Din bil (med ditt utseende från Garaget)</div>
          <div class="fj-seg" data-k="car">${s.owned.map(id => { const c = CARS.find(x => x.id === id); return `<button data-v="${id}" class="${m.car === id ? 'on' : ''}">${c.name}</button>`; }).join('')}</div>
          <p class="nl-note">Lika villkor: prestandadelar är avstängda online – alla kör med standardbilar. Utseendet syns för de andra.</p>`;
      };
      el.onclick = e => {
        const b = e.target.closest('button[data-v]'); if (!b || b.disabled) return;
        s.car = b.dataset.v; h.persist(); h.onCar && h.onCar(s.car);
        net.setMeta(meta(s.car)); draw();
      };
      if (!s.owned.includes(s.car)) s.car = 'viggen';
      net.setMeta(meta(s.car));
      draw();
    },
    renderSettings(el, { isHost, state, set }) {
      const st = Object.assign({ track: 'midsommar', laps: 3, fill: 0, diff: 'medium' }, state);
      if (!isHost) {
        el.innerHTML = `<p class="nl-note">Bana: <b>${trackName(st.track)}</b> · ${st.laps} varv · Datorförare: ${(fills.find(f => f[0] === st.fill) || fills[0])[1].toLowerCase()}${st.fill ? ' (' + DIFFICULTY[st.diff].label.toLowerCase() + ')' : ''}</p><p class="nl-note">Värden väljer bana och varv.</p>`;
        return;
      }
      const key = JSON.stringify(st);
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      const seg = (label, k, items) => `<div class="fj-sec"><label>${label}</label><div class="fj-seg" data-k="${k}">${items.map(([v, t]) => `<button data-v="${v}" class="${String(st[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
      el.innerHTML = seg('Bana', 'track', TRACKS.map(t => [t.id, t.name])) + seg('Varv', 'laps', [1, 2, 3, 4, 5].map(n => [n, n])) +
        seg('Fyll ut med datorförare', 'fill', fills) + (st.fill ? seg('Datorförarnas nivå', 'diff', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.label])) : '');
      el.onclick = e => {
        const b = e.target.closest('button[data-v]'); if (!b) return;
        const k = b.parentNode.dataset.k; const v = b.dataset.v;
        set({ [k]: k === 'track' || k === 'diff' ? v : +v });
      };
      if (!state || state.track == null) set(st);
    }
  });
  return lobby;
}

/** Värden: bygger startdata från rostern och rumsinställningarna. */
export function buildStart(net) {
  const st = Object.assign({ track: 'midsommar', laps: 3, fill: 0, diff: 'medium' }, net.roomState);
  const humans = net.players.filter(p => p.connected).slice(0, 8);
  const seed = (Math.random() * 2 ** 31) | 0;
  // människor i slumpad ordning längst bak, datorförare framför
  const hs = humans.map(p => { const o = { id: p.id, n: p.name, car: p.meta ? p.meta.car : 'viggen', col: p.meta ? p.meta.col : 0xb0281f }; if (p.meta && p.meta.lk) o.lk = p.meta.lk; return o; }).sort(() => Math.random() - 0.5);
  const nAi = Math.max(0, Math.min(8 - hs.length, st.fill - hs.length));
  const used = new Set(hs.map(x => x.col));
  const pool = AI_DRIVERS.slice().sort(() => Math.random() - 0.5).slice(0, nAi);
  const aiCars = ['viggen', 'algen', 'pixel', 'lodjuret', 'spark', 'vega', 'fjallbjorn'];
  const ais = pool.map((d, k) => {
    let col = 0; for (let n = 0; n < 40; n++) { col = COLORS[(Math.random() * COLORS.length) | 0].hex; if (!used.has(col)) break; }
    used.add(col);
    return { id: 'ai' + k, n: d.name, car: aiCars[(Math.random() * aiCars.length) | 0], col, sk: d.skill, ag: d.aggr };
  });
  return { track: st.track, laps: st.laps, diff: st.diff, seed, grid: ais.concat(hs) };
}
