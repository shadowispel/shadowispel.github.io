/**
 * Spelhallen 3D – net.js: peer-to-peer-multiplayer för statiskt hostade spel (ingen egen server).
 *
 * TRANSPORT
 *   WebRTC DataChannels via Trystero 0.22 (vendor/trystero/, MIT). Signaleringen (att hitta varandra och byta
 *   SDP) sker krypterat via publika Nostr-reläer; själva speldatan går direkt mellan webbläsarna. Publika
 *   STUN-servrar (Google/Cloudflare) används för NAT-traversering. Ingen TURN → vissa strikta brandväggar/
 *   mobilnät kan inte ansluta; då visas ett vänligt fel med tips.
 *   Alternativ (URL-parameter ?net=…):  nostr (standard) · torrent (BitTorrent-trackers) · local (BroadcastChannel
 *   mellan flikar i samma webbläsare – för test och felsökning, kräver inget internet).
 *
 * SNABBSTART
 *   import { createNet, createLobby, V } from '../../engine/net.js';
 *   const net = createNet({
 *     game: 'kubvarld', version: '1', maxPlayers: 4,
 *     metaSchema: V.obj({ skin: V.int(0, 9) }),          // valfri spelardata (validerad hos alla)
 *     roomStateSchema: V.obj({ seed: V.int(0, 1e9) }),   // värdens rumsinställningar
 *     startSchema: V.obj({ seed: V.int(0, 1e9) })        // nyttolast i startGame()
 *   });
 *   net.define('pos', { schema: V.nums(6, -1e5, 1e5), rate: 30 });          // snabb positionsdata
 *   net.define('hit', { schema: V.obj({ id: V.str(24), dmg: V.num(0, 999) }), rate: 20, hostOnly: true });
 *   net.onMsg('pos', (data, fromId, player) => { … });
 *   net.on('start', payload => startOnlineGame(payload));
 *   const lobby = createLobby({ net, container: document.getElementById('netScreen'), title: 'Kubvärld',
 *                               modes: [{ id: 'coop', label: 'Samarbete' }], onBack: () => toMenu(),
 *                               onStart: () => net.startGame({ seed: 123 }) });
 *   lobby.open();
 *
 * NET-API (createNet → Net)
 *   Egenskaper: selfId, hostId, isHost, status ('idle'|'searching'|'connecting'|'lobby'|'ingame'|'error'),
 *     phase ('lobby'|'game' – värdens fas), kind ('quick'|'private'), mode, code (rumskod), name, me (egen spelare),
 *     players (array i rosterordning: { id, name, ready, meta, ping, isHost, isMe, connected }), roomState, maxPlayers.
 *   Anslutning: quickMatch(mode) · createRoom(mode) → kod · joinRoom(kod) · leave()
 *   Lobby: setName(n) · setReady(b) · setMeta(obj) · setRoomState(patch) (värd) · startGame(payload) (värd)
 *     · backToLobby(data) (värd) · emote(index)
 *   Meddelanden: define(typ, { schema, rate=20/s, maxBytes=1500, hostOnly=false }) · send(typ, data, till?) (pålitlig,
 *     ordnad) · sendFast(typ, data, till?) (för tillstånd som ersätts av nästa: strypt per typ, gammal data kastas)
 *     · onMsg(typ, fn(data, fromId, player)). Allt som går till alla vidarebefordras av värden till spelare som
 *     saknar direktlänk (partiellt nät). Okända typer, fel format, för stora eller för täta meddelanden kastas.
 *   Tid: now() → ms i värdens klocka (synkas med NTP-liknande ping), rtt(id) → ping i ms.
 *   Händelser (on/off): status, roster, peerjoin, peerleave, host ({hostId,isHost,migrated}), hostleft ({prev,newHost}),
 *     start (payload), lobby (data), emote ({ from, player, id, text }), error ({ code, message, tips }),
 *     roomstate (state)
 *   Hjälp: randomName(), sanitizeName(s), isBadName(s), EMOTES, backgroundTicker(fn, hz) (håller simuleringen vid liv
 *     i dolda flikar), V (validering).
 *
 * VÄRDMODELL
 *   En spelare är värd (auktoritativ). Den som skapar ett rum är värd; i snabbmatch blir den som först kommer in i
 *   ett tomt publikt rum värd. Lämnar värden tar nästa spelare i rosterordningen över (migrateHost: true, standard)
 *   och händelsen 'hostleft' skickas – spelet bestämmer själv om det kan fortsätta.
 *
 * SÄKERHET
 *   Ingen fri textchatt – bara fördefinierade snabbmeddelanden (EMOTES, skickas som index). Namn filtreras (längd,
 *   tecken, fula ord) både när man sätter sitt eget och när andras tas emot. All inkommande data storleks-,
 *   frekvens- och typvalideras; en klient som översvämmar ignoreras.
 */

/* ===================================================================== konstanter */
const PROTO = 2;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // inga 0/O, 1/I/L
const CODE_LEN = 5;
const NOSTR_RELAYS = ['nos.lol', 'nostr.data.haus', 'relay.fountain.fm', 'relay.mostro.network', 'yabu.me/v2'].map(u => 'wss://' + u);
const QM_WAIT = 6500;        // ms att leta efter en befintlig värd i ett publikt rum innan man blir värd själv
const JOIN_WAIT = 22000;     // ms att leta efter rummet vid "gå med med kod"
const RELAY_FAIL_MS = 12000; // inga reläer öppna efter så här lång tid → nätverksfel
const HB_MS = 2000;          // hjärtslag
const PEER_TIMEOUT = 13000;  // tyst peer → räknas som borta
const HOST_SLOW = 5000;      // tyst värd → "återansluter"
const MAX_SHARDS = 12;

export const EMOTES = ['Hej!', 'Lycka till!', 'Bra spelat!', 'GG', 'Oj!', 'Snyggt!', 'Tack!', 'Vänta lite!', 'Kom igen!', '👍', '😄', '😮', '🔥', '🏁'];

/* ===================================================================== validering */
/**
 * V – små valideringsfunktioner. Varje V.x(...) returnerar en funktion (värde) → true/false.
 *   V.num(min,max) V.int(min,max) V.bool V.str(maxLen, regex?) V.oneOf([...]) V.nums(n, min, max)
 *   V.arr(item, maxLen, minLen=0) V.tuple([a,b,…]) V.obj({ nyckel: v, … }) (okända nycklar underkänns)
 *   V.opt(v) (får saknas/null) V.any (godtar allt som är JSON – använd sparsamt)
 */
export const V = {
  num: (min = -1e9, max = 1e9) => x => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max,
  int: (min = -1e9, max = 1e9) => x => Number.isInteger(x) && x >= min && x <= max,
  bool: x => x === true || x === false,
  str: (max = 64, re = null) => x => typeof x === 'string' && x.length <= max && (!re || re.test(x)),
  oneOf: vals => x => vals.includes(x),
  nums: (n, min = -1e9, max = 1e9) => x => Array.isArray(x) && x.length === n && x.every(v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max),
  arr: (item, max = 64, min = 0) => x => Array.isArray(x) && x.length >= min && x.length <= max && x.every(item),
  tuple: items => x => Array.isArray(x) && x.length === items.length && items.every((f, i) => f(x[i])),
  obj: shape => {
    const keys = Object.keys(shape);
    return x => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
      for (const k in x) if (!Object.prototype.hasOwnProperty.call(shape, k)) return false;
      for (const k of keys) { const f = shape[k]; if (x[k] === undefined || x[k] === null) { if (!f._opt) return false; } else if (!f(x[k])) return false; }
      return true;
    };
  },
  opt: f => { const g = x => x === undefined || x === null || f(x); g._opt = true; return g; },
  any: () => true
};
const isId = V.str(48, /^[A-Za-z0-9_-]+$/);
const VAL_HI = V.obj({ n: V.str(40), v: V.str(24), p: V.int(0, 99), h: V.opt(isId), ph: V.opt(V.oneOf(['lobby', 'game'])), c: V.opt(V.int(0, 64)), r: V.bool, m: V.opt(V.any), l: V.opt(V.arr(isId, 16)), k: V.opt(V.oneOf(['quick', 'private'])) });

/* ===================================================================== namn */
const ADJ = ['Snabb', 'Modig', 'Glad', 'Listig', 'Pigg', 'Klok', 'Vild', 'Lugn', 'Stark', 'Kvick', 'Tapper', 'Busig', 'Rask', 'Sprallig', 'Frostig', 'Solig', 'Lurig', 'Flink', 'Djärv', 'Mysig', 'Blixtsnabb', 'Smidig', 'Envis', 'Nyfiken'];
const NOUN = ['Älg', 'Räv', 'Lo', 'Varg', 'Uggla', 'Björn', 'Hare', 'Mård', 'Örn', 'Järv', 'Lämmel', 'Ekorre', 'Bäver', 'Tjäder', 'Gädda', 'Lax', 'Mås', 'Kråka', 'Igelkott', 'Säl', 'Utter', 'Hjort', 'Grävling', 'Trana'];
/** Slumpat svenskt namn, t.ex. "Kvick Utter". */
export function randomName() { const r = a => a[Math.floor(Math.random() * a.length)]; return r(ADJ) + ' ' + r(NOUN); }

// Fula ord. Ord (efter normalisering) med ≥5 tecken matchas som delsträng, 4 tecken som ordbörjan, kortare som helt ord.
const BAD = ['fitta', 'fittan', 'hora', 'horunge', 'javla', 'jävla', 'helvete', 'knulla', 'knull', 'runka', 'neger', 'negro', 'nigger', 'nigga', 'hitler', 'nazi', 'porr', 'porno', 'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'retard', 'rövhål', 'arsle', 'kuken', 'bajskorv', 'pedofil', 'pedo', 'rape', 'våldtäkt', 'mongo', 'cancer', 'blatte', 'svartskalle', 'zigenare', 'bögjävel', 'faggot', 'penis', 'vagina', 'snopp', 'idiot', 'sieg', 'heil', 'isis', 'kuk', 'fan', 'sex', 'fag', 'ass', 'bög', 'kåt', 'pung', 'balle', 'tits', 'nig', 'hor', 'kys', 'wtf', 'stfu', 'sug', 'jävel', 'satan', 'skit', 'piss', 'kkk'];
const SUBSTR4 = new Set(['fuck', 'shit', 'cunt', 'nazi', 'knul', 'porn']);
function normName(s) {
  return s.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[éè]/g, 'e').replace(/ü/g, 'u')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b').replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/(.)\1+/g, '$1');
}
const BAD_N = [...new Set(BAD.map(normName))];
/** true om namnet innehåller fula ord. */
export function isBadName(s) {
  const n = normName(String(s || ''));
  const joined = n.replace(/[^a-z]/g, '');
  const toks = n.split(/[^a-z]+/).filter(Boolean);
  for (const w of BAD_N) {
    if (w.length >= 5 || SUBSTR4.has(w)) { if (joined.includes(w)) return true; }
    else if (w.length === 4) { if (toks.some(t => t.startsWith(w)) || joined === w) return true; }
    else if (toks.includes(w) || joined === w) return true;
  }
  return false;
}
/** Städar ett namn: tillåtna tecken, max 16 tecken; tomt eller fult → slumpat namn. */
export function sanitizeName(s, fallback = null) {
  let n = String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} _\-.!]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (n.length < 2 || isBadName(n)) n = fallback || randomName();
  return n;
}
const NAME_KEY = 'spelhallen:net:name';
function loadName() { try { const n = localStorage.getItem(NAME_KEY); if (n) return sanitizeName(n); } catch (e) { /* privat läge */ } const n = randomName(); try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignorera */ } return n; }
function storeName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignorera */ } }

/* ===================================================================== hjälpare */
const now = () => performance.now();
const genCode = () => { const a = new Uint32Array(CODE_LEN); crypto.getRandomValues(a); return Array.from(a, v => CODE_ALPHABET[v % CODE_ALPHABET.length]).join(''); };
/** Normaliserar en inskriven rumskod (versaler, förväxlingsbara tecken rättas). null om ogiltig. */
export function normalizeCode(s) {
  const raw = String(s || '').toUpperCase().replace(/[\s-]/g, '');
  return raw.length === CODE_LEN && [...raw].every(ch => CODE_ALPHABET.includes(ch)) ? raw : null;
}
function jsonSize(d) { try { const s = JSON.stringify(d); return s === undefined ? 0 : s.length; } catch (e) { return Infinity; } }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * Kör fn(dt) med jämn takt när sidans requestAnimationFrame står still – fliken är dold, eller webbläsaren har
 * slutat rita den (t.ex. en bakgrundsflik som ändå rapporteras som "visible"). Använder en Worker-timer (stryps inte
 * som vanliga timers i bakgrunden). fn anropas BARA när rAF har stått still > stallMs. Returnerar stop().
 */
export function backgroundTicker(fn, hz = 30, stallMs = 200) {
  let alive = true, lastRaf = now(), last = now(), worker = null, url = null;
  const raf = () => { lastRaf = now(); if (alive) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  try {
    url = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${Math.round(1000 / hz)})`], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = () => {
      const t = now(), dt = Math.min(0.25, (t - last) / 1000); last = t;
      if (alive && (document.hidden || t - lastRaf > stallMs)) { try { fn(dt); } catch (e) { console.error(e); } }
    };
  } catch (e) { worker = null; }
  return () => { alive = false; if (worker) { try { worker.terminate(); } catch (e) { /* ignorera */ } worker = null; } if (url) { URL.revokeObjectURL(url); url = null; } };
}

/* ===================================================================== transporter */
async function trysteroTransport(kind) {
  const mod = kind === 'torrent' ? await import('../vendor/trystero/torrent.js') : await import('../vendor/trystero/nostr.js');
  return {
    kind, selfId: mod.selfId,
    relayStatus() {
      try { const arr = Object.values(mod.getRelaySockets()); return { total: arr.length, open: arr.filter(w => w && w.readyState === 1).length }; } catch (e) { return { total: 0, open: 0 }; }
    },
    join(appId, roomId, password, onErr) {
      const cfg = { appId };
      if (password) cfg.password = password;
      if (kind !== 'torrent') { cfg.relayUrls = NOSTR_RELAYS; }
      const room = mod.joinRoom(cfg, roomId, onErr);
      const [send, get] = room.makeAction('m');
      const peers = new Set();
      let joinFn = () => {}, leaveFn = () => {};
      room.onPeerJoin(id => { peers.add(id); joinFn(id); });
      room.onPeerLeave(id => { peers.delete(id); leaveFn(id); });
      return {
        peers,
        send(data, to) {
          let tgt = null;
          if (to) { const arr = (Array.isArray(to) ? to : [to]).filter(id => peers.has(id)); if (!arr.length) return; tgt = arr; }
          else if (!peers.size) return;
          try { const p = send(data, tgt); if (p && p.catch) p.catch(() => {}); } catch (e) { /* kanalen stängd */ }
        },
        onData: fn => get((d, id) => fn(d, id)),
        onJoin: fn => { joinFn = fn; },
        onLeave: fn => { leaveFn = fn; },
        ping: id => peers.has(id) ? withTimeout(room.ping(id), 4000) : Promise.reject(new Error('no peer')),
        leave: () => { try { const p = room.leave(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignorera */ } }
      };
    }
  };
}

/** Lokal transport via BroadcastChannel (flikar i samma webbläsare). Samma gränssnitt som Trystero-omslaget. */
function localTransport() {
  const selfId = 'L' + Math.random().toString(36).slice(2, 12);
  return {
    kind: 'local', selfId,
    relayStatus: () => ({ total: 1, open: 1 }),
    join(appId, roomId, password) {
      const ch = new BroadcastChannel('spelhallen-net|' + appId + '|' + roomId + '|' + (password || ''));
      const peers = new Set(), seen = new Map(), pongs = new Map();
      let dataFn = () => {}, joinFn = () => {}, leaveFn = () => {}, closed = false;
      const post = m => { if (!closed) try { ch.postMessage(Object.assign({ f: selfId }, m)); } catch (e) { /* ignorera */ } };
      const add = id => { seen.set(id, now()); if (!peers.has(id)) { peers.add(id); setTimeout(() => joinFn(id), 30 + Math.random() * 60); } };
      const drop = id => { if (peers.delete(id)) leaveFn(id); seen.delete(id); };
      ch.onmessage = e => {
        const m = e.data; if (!m || typeof m !== 'object' || typeof m.f !== 'string' || m.f === selfId) return;
        if (m.t && m.t !== selfId) return;
        if (m.k === 'hi') { add(m.f); post({ k: 'hey', t: m.f }); }
        else if (m.k === 'hey' || m.k === 'hb') add(m.f);
        else if (m.k === 'bye') drop(m.f);
        else if (m.k === 'pi') post({ k: 'po', t: m.f, n: m.n });
        else if (m.k === 'po') { const r = pongs.get(m.n); if (r) { pongs.delete(m.n); r(); } }
        else if (m.k === 'd' && peers.has(m.f)) { seen.set(m.f, now()); dataFn(m.d, m.f); }
      };
      post({ k: 'hi' });
      const hb = setInterval(() => { post({ k: 'hb' }); const t = now(); for (const [id, s] of seen) if (t - s > 6000) drop(id); }, 1500);
      const bye = () => post({ k: 'bye' });
      addEventListener('pagehide', bye);
      return {
        peers,
        send(data, to) {
          if (to) { for (const id of (Array.isArray(to) ? to : [to])) if (peers.has(id)) post({ k: 'd', t: id, d: data }); }
          else post({ k: 'd', d: data });
        },
        onData: fn => { dataFn = fn; },
        onJoin: fn => { joinFn = fn; },
        onLeave: fn => { leaveFn = fn; },
        ping(id) { const n = Math.random(); const t0 = now(); post({ k: 'pi', t: id, n }); return withTimeout(new Promise(r => pongs.set(n, r)), 4000).then(() => now() - t0, e => { pongs.delete(n); throw e; }); },
        leave() { bye(); closed = true; clearInterval(hb); removeEventListener('pagehide', bye); try { ch.close(); } catch (e) { /* ignorera */ } }
      };
    }
  };
}

/* ===================================================================== Net */
class Emitter {
  constructor() { this._l = {}; }
  on(ev, fn) { (this._l[ev] || (this._l[ev] = [])).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const l = this._l[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(ev, ...a) { const l = this._l[ev]; if (l) for (const fn of l.slice()) { try { fn(...a); } catch (e) { console.error(e); } } }
}

/**
 * Skapar en nätverksinstans för ett spel. opts:
 *   game (id), version (sträng – olika versioner möts aldrig), maxPlayers=8, minPlayers=2, migrateHost=true,
 *   metaSchema, roomStateSchema, startSchema, lobbySchema (validering av spelets egna data), transport ('auto'|'nostr'|'torrent'|'local')
 */
export function createNet(opts) { return new Net(opts); }

class Net extends Emitter {
  constructor(o = {}) {
    super();
    this.game = String(o.game || 'spel');
    this.version = String(o.version || '1');
    this.maxPlayers = Math.max(2, Math.min(16, o.maxPlayers || 8));
    this.minPlayers = Math.max(1, o.minPlayers || 2);
    this.migrateHost = o.migrateHost !== false;
    this.metaSchema = o.metaSchema || V.any;
    this.roomStateSchema = o.roomStateSchema || V.any;
    this.startSchema = o.startSchema || V.any;
    this.lobbySchema = o.lobbySchema || V.any;
    const q = /[?&]net=(local|nostr|torrent)\b/.exec(location.search);
    this.transportKind = (q && q[1]) || (o.transport && o.transport !== 'auto' ? o.transport : 'nostr');
    this.appId = 'spelhallen.' + this.game + '.v' + this.version + '.p' + PROTO;
    this.transport = null; this.room = null;
    this.selfId = null;
    this.name = loadName();
    this.status = 'idle'; this.statusText = '';
    this.kind = null; this.mode = null; this.code = null; this.shard = 1;
    this.hostId = null; this.phase = 'lobby';
    this.order = [];                 // rosterordning (ids) enligt värden
    this.peers = new Map();          // id → { id, name, ready, meta, ping, lastSeen, links, bucket, ok }
    this.me = { ready: false, meta: null };
    this.roomState = {};
    this.defs = new Map();
    this.handlers = new Map();
    this.clock = { offset: 0, samples: [] };
    this.fastSeq = new Map();
    this.ignored = new Set();
    this._timers = [];
    this.reconnecting = false;
    this._gen = 0;
  }

  /* ------------------------------------------------------------ publikt: egenskaper */
  get isHost() { return !!this.selfId && this.hostId === this.selfId; }
  get connected() { return this.status === 'lobby' || this.status === 'ingame'; }
  /** Spelare i rosterordning (inklusive dig själv). */
  get players() {
    const ids = this.order.length ? this.order : (this.selfId ? [this.selfId] : []);
    return ids.map(id => this.player(id)).filter(Boolean);
  }
  player(id) {
    if (id === this.selfId) return { id, name: this.name, ready: this.me.ready, meta: this.me.meta, ping: 0, isHost: this.isHost, isMe: true, connected: true };
    const p = this.peers.get(id);
    if (!p) return this.order.includes(id) ? { id, name: 'Ansluter …', ready: false, meta: null, ping: null, isHost: id === this.hostId, isMe: false, connected: false } : null;
    return { id, name: p.name || 'Ansluter …', ready: !!p.ready, meta: p.meta, ping: p.ping, isHost: id === this.hostId, isMe: false, connected: !!p.name && (p.direct || now() - p.lastSeen < 6000) };
  }
  /** Värdens klocka i ms (performance.now-bas). */
  now() { return now() + (this.isHost ? 0 : this.clock.offset); }
  rtt(id) { const p = this.peers.get(id); return p ? p.ping : null; }

  /* ------------------------------------------------------------ publikt: definitioner */
  define(type, d = {}) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,11}$/.test(type)) throw new Error('net.define: ogiltig typ ' + type);
    this.defs.set(type, { schema: d.schema || V.any, rate: d.rate || 20, maxBytes: d.maxBytes || 1500, hostOnly: !!d.hostOnly });
    return this;
  }
  onMsg(type, fn) { this.handlers.set(type, fn); return this; }

  /* ------------------------------------------------------------ publikt: anslutning */
  async quickMatch(mode = 'std') {
    await this._reset();
    this.kind = 'quick'; this.mode = String(mode); this.shard = 1;
    this._setStatus('searching', 'Söker efter spelare …');
    if (!(await this._initTransport())) return;
    this._enterQuickShard();
  }
  async createRoom(mode = 'std') {
    await this._reset();
    this.kind = 'private'; this.mode = String(mode); this.code = genCode();
    this._setStatus('connecting', 'Skapar rum …');
    if (!(await this._initTransport())) return null;
    this._enter('rum.' + this.code, this.code);
    this._becomeHost(false);
    this._setStatus('lobby', 'Väntar på spelare …');
    return this.code;
  }
  async joinRoom(codeIn) {
    const code = normalizeCode(codeIn);
    if (!code) { this._error('code', 'Ogiltig rumskod. Koden har fem tecken, t.ex. K7M2Q.'); return false; }
    await this._reset();
    this.kind = 'private'; this.code = code;
    this._setStatus('connecting', 'Söker efter rum ' + code + ' …');
    if (!(await this._initTransport())) return false;
    this._enter('rum.' + code, code);
    const gen = this._gen;
    this._later(() => {
      if (gen !== this._gen || this.hostId) return;
      this._error('notfound', 'Hittade inget rum med koden ' + code + '.', ['Kontrollera att koden stämmer och att värden fortfarande är kvar i lobbyn.', 'Ni måste ha samma version av spelet – ladda om sidan båda två.', 'Vissa skol- och företagsnätverk blockerar direktanslutningar. Prova ett annat nätverk, t.ex. mobilens.']);
    }, JOIN_WAIT);
    return true;
  }
  /** Lämnar rummet (tyst). */
  async leave() { await this._reset(); this._setStatus('idle', ''); }

  /* ------------------------------------------------------------ publikt: lobby */
  setName(n) { this.name = sanitizeName(n, this.name); storeName(this.name); this._sendHi(); this.emit('roster', this.players); return this.name; }
  setReady(b) { this.me.ready = !!b; this._sendHi(); this.emit('roster', this.players); }
  setMeta(m) { if (!this.metaSchema(m)) { console.warn('net.setMeta: ogiltig meta', m); return; } this.me.meta = m; this._sendHi(); this.emit('roster', this.players); }
  setRoomState(patch) {
    if (!this.isHost) return;
    const st = Object.assign({}, this.roomState, patch);
    if (!this.roomStateSchema(st)) { console.warn('net.setRoomState: ogiltigt tillstånd', st); return; }
    this.roomState = st; this._sendRoster(); this.emit('roomstate', st);
  }
  startGame(payload) {
    if (!this.isHost) return false;
    if (!this.startSchema(payload)) { console.warn('net.startGame: ogiltig nyttolast'); return false; }
    this.phase = 'game';
    this._sendRoster();
    this._raw(['$start', payload]);
    this._setStatus('ingame', '');
    this.emit('start', payload, this.selfId);
    return true;
  }
  backToLobby(data = null) {
    if (!this.isHost) return;
    this.phase = 'lobby';
    this.me.ready = false;
    this._sendRoster();
    this._raw(['$lobby', data]);
    this._setStatus('lobby', '');
    this.emit('lobby', data);
  }
  emote(i) {
    i = i | 0; if (i < 0 || i >= EMOTES.length) return;
    const t = now(); if (this._emoT && t - this._emoT < 900) return; this._emoT = t;
    this._raw(['$emo', i]);
    this.emit('emote', { from: this.selfId, player: this.player(this.selfId), id: i, text: EMOTES[i] });
  }

  /* ------------------------------------------------------------ publikt: meddelanden */
  /** Pålitligt, ordnat. to = id, [ids] eller utelämnat (alla). */
  send(type, data, to) {
    if (!this.room) return;
    const d = this.defs.get(type);
    if (!d) { console.warn('net.send: odefinierad typ ' + type); return; }
    this._raw([type, data], to);
  }
  /** För tillstånd som snabbt blir inaktuellt (positioner). Sekvensnummer – äldre än senast mottagna kastas. */
  sendFast(type, data, to) {
    if (!this.room) return;
    const s = ((this.fastSeq.get(type) || 0) + 1) % 1e9; this.fastSeq.set(type, s);
    this._raw(['$f', [type, s, data]], to);
  }

  /* ------------------------------------------------------------ internt: tillstånd */
  _setStatus(s, text) { this.status = s; this.statusText = text || ''; this.emit('status', s, this.statusText); }
  _error(code, message, tips = []) {
    const tipsDef = code === 'network' ? ['Kontrollera att du är ansluten till internet.', 'Vissa brandväggar (skola/jobb) blockerar onlinespel – prova ett annat nätverk, t.ex. mobilens.', 'Prova att ladda om sidan.'] : [];
    this._reset(true);
    this.status = 'error'; this.statusText = message;
    this.lastError = { code, message, tips: tips.length ? tips : tipsDef };
    this.emit('error', this.lastError);
    this.emit('status', 'error', message);
  }
  _later(fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; }
  _every(fn, ms) { const t = setInterval(fn, ms); this._timers.push(t); return t; }
  async _reset(keepError) {
    this._gen++;
    for (const t of this._timers) { clearTimeout(t); clearInterval(t); }
    this._timers.length = 0;
    if (this.room) { this.room.leave(); this.room = null; }
    this.peers.clear(); this.order = []; this.hostId = null; this.phase = 'lobby';
    this.me.ready = false; this.roomState = {}; this.clock = { offset: 0, samples: [] };
    this.fastSeq.clear(); this.reconnecting = false; this.code = keepError ? this.code : null;
    this.ignored.clear(); this._relayBad = 0;
  }
  async _initTransport() {
    if (!this.transport || this.transport.kind !== this.transportKind) {
      try {
        if (typeof RTCPeerConnection === 'undefined' && this.transportKind !== 'local') throw new Error('WebRTC saknas');
        this.transport = this.transportKind === 'local' ? localTransport() : await trysteroTransport(this.transportKind);
      } catch (e) {
        this._error('network', 'Din webbläsare stöder inte onlinespel (WebRTC saknas eller blockeras).');
        return false;
      }
    }
    this.selfId = this.transport.selfId;
    return true;
  }
  _enter(roomId, password) {
    const gen = this._gen;
    const room = this.room = this.transport.join(this.appId, roomId, password, () => { if (gen === this._gen) this._error('join', 'Kunde inte gå med i rummet.'); });
    room.onJoin(id => { if (gen === this._gen) this._onPeerJoin(id); });
    room.onLeave(id => { if (gen === this._gen) this._onPeerLeave(id, 'left'); });
    room.onData((d, id) => { if (gen === this._gen) this._onData(d, id); });
    const t0 = now();
    this._every(() => this._heartbeat(t0), HB_MS);
    this._every(() => this._pingAll(), 3000);
    this._every(() => this._clockSync(), 2500);
    this._later(() => this._clockSync(), 600);
    this._later(() => this._clockSync(), 1200);
  }
  _enterQuickShard() {
    const gen = this._gen;
    this._enter('qm.' + this.mode + '.' + this.shard, null);
    this._setStatus('searching', this.shard > 1 ? 'Söker efter en ledig match …' : 'Söker efter spelare …');
    this._later(() => {
      if (gen !== this._gen || this.hostId) return;
      // ingen värd hittades – bli värd och vänta här
      this._becomeHost(false);
      this._setStatus('lobby', 'Väntar på fler spelare …');
    }, QM_WAIT + Math.random() * 1200);
  }
  _nextShard() {
    if (this.shard >= MAX_SHARDS) { this._error('full', 'Alla snabbmatcher är fulla just nu.', ['Försök igen om en stund, eller skapa ett eget rum och dela koden.']); return; }
    const shard = this.shard + 1, mode = this.mode;
    this._reset().then(() => { this.kind = 'quick'; this.mode = mode; this.shard = shard; this._enterQuickShard(); });
  }
  _becomeHost(migrated) {
    const prev = this.hostId;
    this.hostId = this.selfId;
    if (!this.order.includes(this.selfId)) this.order.unshift(this.selfId);
    else { this.order.splice(this.order.indexOf(this.selfId), 1); this.order.unshift(this.selfId); }
    // rensa bort de vi inte har kontakt med
    this.order = this.order.filter(id => id === this.selfId || this.peers.has(id));
    this.clock = { offset: 0, samples: [] };
    this._sendHi(); this._sendRoster();
    this.emit('host', { hostId: this.selfId, isHost: true, migrated, prev });
    this.emit('roster', this.players);
  }
  _adoptHost(id) {
    if (this.hostId === id) return;
    const prev = this.hostId;
    this.hostId = id;
    this.clock = { offset: 0, samples: [] };
    this._sendHi(id);
    this._clockSync();
    if (this.status === 'searching' || this.status === 'connecting') this._setStatus('lobby', '');
    this.emit('host', { hostId: id, isHost: false, migrated: !!prev, prev });
    this.emit('roster', this.players);
  }

  /* ------------------------------------------------------------ internt: peers */
  _peer(id) {
    let p = this.peers.get(id);
    if (!p) { p = { id, name: null, ready: false, meta: null, ping: null, lastSeen: now(), links: [], buckets: new Map(), total: { t: now(), n: 0 }, strikes: 0, direct: false, fastSeq: new Map() }; this.peers.set(id, p); }
    return p;
  }
  _onPeerJoin(id) {
    const p = this._peer(id); p.direct = true; p.lastSeen = now();
    this._sendHi(id);
    if (this.isHost) this._sendRoster(id);
  }
  _onPeerLeave(id, why) {
    const p = this.peers.get(id);
    if (p && why === 'left' && !p.direct) return;
    if (p) p.direct = false;
    const wasMember = this.order.includes(id);
    const known = p && p.name;
    // indirekt kontakt via värden? låt värdens roster avgöra
    if (!this.isHost && id !== this.hostId && wasMember && why === 'left') { this.emit('roster', this.players); return; }
    this.peers.delete(id);
    if (wasMember) this.order = this.order.filter(x => x !== id);
    if (id === this.hostId) { this._hostGone(id); return; }
    if (this.isHost && wasMember) this._sendRoster();
    if (wasMember || known) { this.emit('peerleave', { id, name: (p && p.name) || 'En spelare' }); this.emit('roster', this.players); }
  }
  _hostGone(prev) {
    const pname = (this.peers.get(prev) || {}).name || 'Värden';
    this.peers.delete(prev);
    this.order = this.order.filter(x => x !== prev);
    if (this.status === 'searching' || this.status === 'connecting') { this.hostId = null; return; }
    if (!this.migrateHost) { this.emit('hostleft', { prev, prevName: pname, newHost: null }); this._error('hostleft', pname + ' (värden) lämnade.'); return; }
    // nästa i rosterordningen som fortfarande är kvar
    const cand = this.order.find(id => id === this.selfId || this.peers.has(id)) || this.selfId;
    this.hostId = null;
    if (cand === this.selfId) this._becomeHost(true); else this._adoptHost(cand);
    this.emit('hostleft', { prev, prevName: pname, newHost: cand, newName: (this.player(cand) || {}).name });
    this.emit('peerleave', { id: prev, name: pname, wasHost: true });
  }
  _heartbeat() {
    const t = now();
    this._raw(['$hb', [...this.peers.values()].filter(p => p.direct).map(p => p.id).slice(0, 16)]);
    for (const p of [...this.peers.values()]) if (t - p.lastSeen > PEER_TIMEOUT) this._onPeerLeave(p.id, 'timeout');
    if (this.hostId && !this.isHost) {
      const h = this.peers.get(this.hostId);
      const slow = !h || t - h.lastSeen > HOST_SLOW;
      if (slow !== this.reconnecting) { this.reconnecting = slow; this.emit('status', this.status, slow ? 'Tappade kontakten med värden – återansluter …' : ''); }
    }
    if (this.isHost) this._sendRoster();
    // reläkontroll: inget relä öppet alls → nätverksfel (i stället för att hänga)
    if (this.status === 'searching' || this.status === 'connecting' || (this.status === 'lobby' && this.peers.size === 0)) {
      const rs = this.transport.relayStatus();
      if (rs.open > 0) this._relayBad = 0;
      else if (!this._relayBad) this._relayBad = t;
      else if (t - this._relayBad > RELAY_FAIL_MS) { this._relayBad = 0; this._error('network', 'Kunde inte nå tjänsten som hittar andra spelare.'); }
    } else this._relayBad = 0;
  }
  _pingAll() {
    for (const p of this.peers.values()) if (p.direct) {
      const id = p.id;
      this.room.ping(id).then(ms => { const q = this.peers.get(id); if (q) { q.ping = Math.round(ms); } }, () => {});
    }
    this.emit('roster', this.players);
  }
  _clockSync() { if (this.room && this.hostId && !this.isHost) this._raw(['$tq', now()], this.hostId); }

  _sendHi(to) {
    if (!this.room) return;
    const hi = { n: this.name, v: this.version, p: PROTO, h: this.hostId, ph: this.isHost ? this.phase : null, c: this.isHost ? this.order.length : null, r: this.me.ready, m: this.me.meta, k: this.kind };
    this._raw(['$hi', hi], to);
  }
  _sendRoster(to) {
    if (!this.isHost || !this.room) return;
    this._raw(['$ro', { o: this.order.slice(0, 16), ph: this.phase, s: this.roomState, mx: this.maxPlayers }], to);
  }
  /** Skickar ett ramat meddelande. Broadcast från icke-värd vidarebefordras av värden vid behov. */
  _raw(msg, to) {
    if (!this.room) return;
    this.room.send(msg, to);
  }

  /* ------------------------------------------------------------ internt: mottagning */
  _rate(p, key, perSec) {
    const t = now();
    // totalt tak per peer
    if (t - p.total.t > 1000) { p.total.t = t; p.total.n = 0; }
    if (++p.total.n > 260) return false;
    let b = p.buckets.get(key);
    if (!b) { b = { tok: perSec * 2, t }; p.buckets.set(key, b); }
    b.tok = Math.min(perSec * 2, b.tok + (t - b.t) / 1000 * perSec); b.t = t;
    if (b.tok < 1) return false;
    b.tok -= 1; return true;
  }
  _strike(p) {
    if (++p.strikes > 120) { this.ignored.add(p.id); if (this.isHost && this.order.includes(p.id)) { this.order = this.order.filter(x => x !== p.id); this._sendRoster(); this.emit('roster', this.players); } }
  }
  _onData(msg, from, via) {
    if (this.ignored.has(from)) return;
    if (!Array.isArray(msg) || msg.length !== 2 || typeof msg[0] !== 'string' || msg[0].length > 12) return;
    const p = this._peer(from);
    p.lastSeen = now();
    if (!via) p.direct = true;
    const [type, data] = msg;
    if (type === '$fw') {
      // vidarebefordrat av värden: [ursprung, meddelande]
      if (via || from !== this.hostId || !Array.isArray(data) || data.length !== 2 || !isId(data[0]) || data[0] === this.selfId) return;
      if (!this._rate(p, '$fw', 400)) return;
      const o = this.peers.get(data[0]);
      if (o && o.direct) return; // har direktlänk – dubblett
      this._onData(data[1], data[0], from);
      return;
    }
    const size = jsonSize(data);
    if (type === '$f') {
      if (!Array.isArray(data) || data.length !== 3 || typeof data[0] !== 'string' || !Number.isInteger(data[1])) { this._strike(p); return; }
      const d = this.defs.get(data[0]);
      if (!d || size > d.maxBytes + 40) { this._strike(p); return; }
      if (!this._rate(p, data[0], d.rate * 1.5)) { this._strike(p); return; }
      const last = p.fastSeq.get(data[0]);
      if (last != null && data[1] <= last && last - data[1] < 1e6) return; // gammal
      p.fastSeq.set(data[0], data[1]);
      this._deliver(d, data[0], data[2], from, p, via);
      return;
    }
    if (type[0] === '$') { this._internal(type, data, from, p, size, via); return; }
    const d = this.defs.get(type);
    if (!d || size > d.maxBytes) { this._strike(p); return; }
    if (!this._rate(p, type, d.rate)) { this._strike(p); return; }
    this._deliver(d, type, data, from, p, via);
  }
  _deliver(d, type, data, from, p, via) {
    if (!this.order.includes(from) && from !== this.hostId) return; // inte med i vår session
    if (d.hostOnly && from !== this.hostId) return;
    if (!d.schema(data)) { this._strike(p); return; }
    // värden vidarebefordrar broadcasts till de som saknar direktlänk till avsändaren
    if (this.isHost && !via) this._forward(from, [type === '$f' ? '$f' : type, data], p);
    const fn = this.handlers.get(type);
    if (fn) { try { fn(data, from, this.player(from)); } catch (e) { console.error(e); } }
  }
  _forward(from, msg, p) {
    const links = p.links || [];
    for (const id of this.order) {
      if (id === this.selfId || id === from) continue;
      const q = this.peers.get(id);
      if (!q || !q.direct) continue;
      if (links.includes(id)) continue;
      this.room.send(['$fw', [from, msg]], id);
    }
  }
  _internal(type, data, from, p, size, via) {
    if (size > 2400) { this._strike(p); return; }
    if (!this._rate(p, type, type === '$tq' || type === '$tr' ? 6 : 12)) { this._strike(p); return; }
    switch (type) {
      case '$hi': {
        if (!VAL_HI(data) || jsonSize(data.m) > 600) { this._strike(p); return; }
        if (data.v !== this.version || data.p !== PROTO) { if (!this._verWarned) { this._verWarned = true; this.emit('error', { code: 'version', message: 'En spelare har en annan version av spelet och kan inte vara med.', tips: ['Ladda om sidan (Ctrl/Cmd + Shift + R) för att få senaste versionen.'], soft: true }); } this.ignored.add(from); return; }
        p.name = sanitizeName(data.n, 'Spelare ' + from.slice(0, 3).toUpperCase());
        p.ready = data.r; p.meta = this.metaSchema(data.m) ? data.m : null;
        p.links = data.l || p.links;
        p.claimsHost = data.h === from;
        if (p.claimsHost) { p.hostPhase = data.ph || 'lobby'; p.hostCount = data.c || 1; }
        this._considerHost(from, p);
        if (this.isHost && !via && !this.order.includes(from) && (data.h === this.selfId || data.h == null)) {
          if (this.order.length >= this.maxPlayers) this._raw(['$full', 0], from);
          else if (!(this.kind === 'quick' && this.phase === 'game' && data.h == null)) { this.order.push(from); this._sendRoster(); this.emit('peerjoin', this.player(from)); }
        }
        if (this.isHost && !via) this._forward(from, ['$hi', data], p);
        this.emit('roster', this.players);
        break;
      }
      case '$hb': {
        if (!V.arr(isId, 16)(data)) { this._strike(p); return; }
        p.links = data;
        break;
      }
      case '$ro': {
        const ok = V.obj({ o: V.arr(isId, 16, 1), ph: V.oneOf(["lobby", "game"]), s: V.opt(V.any), mx: V.int(2, 16) })(data);
        if (!ok || data.o[0] !== from) { this._strike(p); return; }
        p.claimsHost = true; p.hostPhase = data.ph; p.hostCount = data.o.length;
        if (from !== this.hostId) { this._considerHost(from, p); if (from !== this.hostId) return; }
        // vi är med? annars (t.ex. fullt) – vänta på $full
        const wasPhase = this.phase;
        const before = new Set(this.order);
        this.order = data.o.slice();
        this.phase = data.ph;
        if (this.roomStateSchema(data.s) && JSON.stringify(data.s) !== JSON.stringify(this.roomState)) { this.roomState = data.s; this.emit('roomstate', this.roomState); }
        for (const id of this.order) if (!before.has(id) && id !== this.selfId && before.size) this.emit('peerjoin', this.player(id));
        for (const id of before) if (!this.order.includes(id) && id !== this.selfId && id !== from) { const q = this.peers.get(id); this.emit('peerleave', { id, name: (q && q.name) || 'En spelare' }); if (q && !q.direct) this.peers.delete(id); }
        if (this.order.includes(this.selfId) && (this.status === 'searching' || this.status === 'connecting')) this._setStatus('lobby', '');
        if (!this.order.includes(this.selfId) && this.connected && this._rate(p, '$rehi', 0.5)) this._sendHi(from); // värden tappade oss – säg hej igen
        void wasPhase;
        this.emit('roster', this.players);
        break;
      }
      case '$full': {
        if (from !== this.hostId && !p.claimsHost) return;
        if (this.order.includes(this.selfId)) return;
        if (this.kind === 'quick') this._nextShard();
        else this._error('full', 'Rummet är fullt.', ['Be värden skapa ett nytt rum, eller prova Snabbmatch.']);
        break;
      }
      case '$start': {
        if (from !== this.hostId || !this.order.includes(this.selfId)) return;
        if (!this.startSchema(data)) { console.warn('net: ogiltig startdata'); return; }
        this.phase = 'game';
        this._setStatus('ingame', '');
        this.emit('start', data, from);
        break;
      }
      case '$lobby': {
        if (from !== this.hostId) return;
        if (data != null && !this.lobbySchema(data)) return;
        this.phase = 'lobby'; this.me.ready = false; this._sendHi();
        if (this.status === 'ingame') this._setStatus('lobby', '');
        this.emit('lobby', data);
        break;
      }
      case '$emo': {
        if (!V.int(0, EMOTES.length - 1)(data)) return;
        if (!this.order.includes(from)) return;
        if (this.isHost && !via) this._forward(from, ['$emo', data], p);
        this.emit('emote', { from, player: this.player(from), id: data, text: EMOTES[data] });
        break;
      }
      case '$tq': {
        if (!this.isHost || !V.num(0, 1e12)(data)) return;
        this._raw(['$tr', [data, now()]], from);
        break;
      }
      case '$tr': {
        if (from !== this.hostId || !V.nums(2, 0, 1e12)(data)) return;
        const t1 = now(), rtt = t1 - data[0];
        if (rtt < 0 || rtt > 5000) return;
        const off = data[1] - (data[0] + rtt / 2);
        const S = this.clock.samples; S.push({ rtt, off }); if (S.length > 10) S.shift();
        let best = S[0]; for (const s of S) if (s.rtt < best.rtt) best = s;
        this.clock.offset = best.off;
        break;
      }
      case '$who': {
        if (!this._rate(p, '$whoR', 1)) return;
        this._sendHi(from);
        break;
      }
      default: this._strike(p);
    }
  }
  /** Bestämmer vem som är värd när flera gör anspråk (snabbmatch-race, dubbla värdar). */
  _considerHost(id, p) {
    if (!p.claimsHost) return;
    if (this.hostId === id) return;
    const theirs = { phase: p.hostPhase || 'lobby', count: p.hostCount || 1 };
    if (this.status === 'searching' || this.status === 'connecting') {
      if (this.kind === 'quick' && (theirs.phase === 'game' || theirs.count >= this.maxPlayers)) {
        // matchen pågår eller är full → nästa publika rum
        if (!this._shardSkip) { this._shardSkip = true; const g = this._gen; setTimeout(() => { this._shardSkip = false; if (g === this._gen && !this.hostId) this._nextShard(); }, 50); }
        return;
      }
      this._adoptHost(id);
      return;
    }
    if (this.isHost) {
      // två värdar i samma rum: den med flest spelare vinner, annars lägst id
      if (this.phase === 'game' && theirs.phase !== 'game') return;
      const mine = this.order.length;
      const theyWin = (theirs.phase === 'game' && this.phase !== 'game') || theirs.count > mine || (theirs.count === mine && id < this.selfId);
      if (theyWin && this.kind === 'quick' && theirs.count + mine <= this.maxPlayers) { this.order = [this.selfId]; this.hostId = null; this._adoptHost(id); }
    } else if (this.hostId && this.peers.get(this.hostId)) {
      const h = this.peers.get(this.hostId);
      const hc = h.hostCount || 1;
      if (this.kind === 'quick' && this.phase !== 'game' && (theirs.count > hc || (theirs.count === hc && id < this.hostId)) && theirs.phase !== 'game') this._adoptHost(id);
    }
  }
}

/* ===================================================================== Lobby-UI */
const CSS = `
.nl-wrap{display:flex;flex-direction:column;gap:12px;text-align:left}
.nl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.nl-row>input{flex:1;min-width:0}
.nl-in{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;font-weight:700}
.nl-code-in{text-transform:uppercase;letter-spacing:.25em;font-family:ui-monospace,Menlo,monospace;max-width:9.5em}
.nl-note{color:var(--muted);font-size:.86rem;line-height:1.45;margin:0}
.nl-note.warn{color:#ffd27a}
.nl-h{font-weight:900;font-size:1.05rem;margin:4px 0 0}
.nl-code{font:900 2rem ui-monospace,Menlo,monospace;letter-spacing:.3em;color:var(--accent);text-align:center;margin:2px 0}
.nl-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.nl-list li{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;padding:8px 12px}
.nl-list li.me{border-color:var(--accent-2)}
.nl-list .nm{flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nl-list .dot{width:12px;height:12px;border-radius:50%;flex:none;background:var(--muted)}
.nl-list .tag{font-size:.78rem;color:var(--muted);white-space:nowrap}
.nl-list .rdy{font-size:.8rem;font-weight:800;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.07);color:var(--muted)}
.nl-list .rdy.on{background:rgba(60,220,120,.2);color:#7dffae}
.nl-emotes{display:flex;flex-wrap:wrap;gap:6px}
.nl-emotes button{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:99px;padding:5px 11px;font:inherit;font-size:.88rem;cursor:pointer}
.nl-emotes button:hover{background:var(--panel-2)}
.nl-feed{min-height:1.4em;font-size:.9rem;color:var(--accent-2);font-weight:700}
.nl-spin{display:inline-block;width:18px;height:18px;border:3px solid rgba(255,255,255,.2);border-top-color:var(--accent-2);border-radius:50%;animation:nlspin .8s linear infinite;vertical-align:-3px;margin-right:8px}
@keyframes nlspin{to{transform:rotate(360deg)}}
.nl-err{background:rgba(255,80,80,.1);border:1px solid rgba(255,120,120,.35);border-radius:12px;padding:12px 14px}
.nl-err ul{margin:8px 0 0 18px;padding:0;color:var(--muted);font-size:.9rem;line-height:1.5}
.nl-opts{display:flex;flex-direction:column;gap:8px}
.nl-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.nl-btns .btn{flex:1 1 140px}
.nl-emo-pop{position:absolute;left:50%;top:22%;transform:translateX(-50%);z-index:26;pointer-events:none;display:flex;flex-direction:column;gap:6px;align-items:center}
.nl-emo-pop div{background:rgba(10,15,30,.82);border:1px solid var(--line);border-radius:12px;padding:6px 14px;font-weight:800;animation:g3-in .2s ease both}
`;
function injectCss() { if (document.getElementById('g3-net-css')) return; const s = document.createElement('style'); s.id = 'g3-net-css'; s.textContent = CSS; document.head.appendChild(s); }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Återanvändbar lobby (kit-stil). opts:
 *   net, container (element – lobbyn ritar en .g3-panel i det), title, modes: [{ id, label, desc? }] (valfritt),
 *   onBack(), onStart() (värden trycker Starta / autostart i snabbmatch – anropa net.startGame(payload) här),
 *   renderSettings(el, { isHost, state, set(patch) }) – spelets rumsinställningar (värden redigerar, andra ser),
 *   renderMine(el, net) – egna val (bil/skepp …), playerExtra(player) → html (t.ex. färgprick), dotColor(player) → css,
 *   canStart(players) → true/sträng (sträng = anledning), autoStart: { fullMs: 4000, readyMs: 4000, fillMs: 25000 }
 * Returnerar { open(), close(), showLobby(), refresh(), el, destroy() }.
 */
export function createLobby(o) {
  injectCss();
  const net = o.net;
  const root = o.container;
  root.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'g3-panel nl-panel';
  root.appendChild(panel);
  let view = 'home', mode = (o.modes && o.modes[0] && o.modes[0].id) || 'std', tSearch = 0, autoT = null, autoReason = '', visible = false, feed = [], uiTimer = null;
  const modeLabel = id => { const m = (o.modes || []).find(x => x.id === id); return m ? m.label : ''; };

  function home() {
    view = 'home';
    panel.innerHTML = `
      <h2 class="g3-h2">${esc(o.title || 'Spela online')}</h2>
      <div class="nl-wrap">
        <label class="nl-h" for="nlName">Ditt namn</label>
        <div class="nl-row"><input class="nl-in" id="nlName" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(net.name)}"><button class="btn small" id="nlDice" title="Slumpa namn" aria-label="Slumpa namn">🎲</button></div>
        ${o.modes && o.modes.length > 1 ? `<div class="nl-h">Läge</div><div class="g3-tabs" id="nlModes">${o.modes.map(m => `<button data-m="${esc(m.id)}" class="${m.id === mode ? 'on' : ''}">${esc(m.label)}</button>`).join('')}</div><p class="nl-note" id="nlModeDesc"></p>` : ''}
        <div class="nl-btns"><button class="btn primary" id="nlQuick">⚡ Snabbmatch</button><button class="btn" id="nlCreate">➕ Skapa rum</button></div>
        <div class="nl-h">Gå med i ett rum</div>
        <div class="nl-row"><input class="nl-in nl-code-in" id="nlCode" maxlength="7" placeholder="KOD" autocomplete="off" spellcheck="false" aria-label="Rumskod"><button class="btn" id="nlJoin">Gå med</button></div>
        <p class="nl-note">🌐 Du spelar med andra via internet. Andra spelare kan se ditt valda namn.</p>
        <p class="nl-note">Ingen chatt – bara färdiga snabbmeddelanden.</p>
        <div class="nl-btns"><button class="btn" data-back id="nlBack">← Tillbaka</button></div>
      </div>`;
    const $ = s => panel.querySelector(s);
    const nameIn = $('#nlName');
    const commitName = () => { nameIn.value = net.setName(nameIn.value); };
    nameIn.addEventListener('change', commitName);
    nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { commitName(); nameIn.blur(); } });
    $('#nlDice').addEventListener('click', () => { nameIn.value = net.setName(randomName()); });
    const descEl = $('#nlModeDesc');
    const setDesc = () => { if (descEl) { const m = o.modes.find(x => x.id === mode); descEl.textContent = (m && m.desc) || ''; } };
    setDesc();
    if ($('#nlModes')) $('#nlModes').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (!b) return; mode = b.dataset.m; panel.querySelectorAll('#nlModes button').forEach(x => x.classList.toggle('on', x === b)); setDesc(); });
    $('#nlQuick').addEventListener('click', () => { commitName(); searching('Söker efter spelare …'); net.quickMatch(mode); });
    $('#nlCreate').addEventListener('click', () => { commitName(); searching('Skapar rum …'); net.createRoom(mode); });
    const codeIn = $('#nlCode');
    codeIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#nlJoin').click(); });
    codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    $('#nlJoin').addEventListener('click', () => {
      commitName();
      const c = normalizeCode(codeIn.value);
      if (!c) { codeIn.focus(); codeIn.style.borderColor = '#ff7a7a'; setTimeout(() => { codeIn.style.borderColor = ''; }, 900); return; }
      searching('Söker efter rum ' + c + ' …'); net.joinRoom(c);
    });
    $('#nlBack').addEventListener('click', () => { net.leave(); if (o.onBack) o.onBack(); });
  }
  function searching(text) {
    view = 'search'; tSearch = performance.now();
    panel.innerHTML = `<h2 class="g3-h2">${esc(o.title || 'Spela online')}</h2>
      <div class="nl-wrap"><p style="text-align:center;font-weight:700;margin:10px 0"><span class="nl-spin"></span><span id="nlSearchTxt">${esc(text)}</span></p>
      <p class="nl-note" id="nlSearchSub" style="text-align:center">Det kan ta upp till 20 sekunder att hitta varandra.</p>
      <div class="nl-btns"><button class="btn" data-back id="nlCancel">Avbryt</button></div></div>`;
    panel.querySelector('#nlCancel').addEventListener('click', () => { net.leave(); home(); });
  }
  function errorView(err) {
    view = 'error';
    panel.innerHTML = `<h2 class="g3-h2">Det gick inte att ansluta</h2>
      <div class="nl-wrap"><div class="nl-err"><b>${esc(err.message)}</b>${err.tips && err.tips.length ? `<ul>${err.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>
      <div class="nl-btns"><button class="btn primary" id="nlRetry">Försök igen</button><button class="btn" data-back id="nlBack2">Tillbaka</button></div></div>`;
    panel.querySelector('#nlRetry').addEventListener('click', () => home());
    panel.querySelector('#nlBack2').addEventListener('click', () => { home(); if (o.onBack) o.onBack(); });
  }
  function lobby() {
    if (view !== 'lobby') {
      view = 'lobby';
      panel.innerHTML = `<h2 class="g3-h2" id="nlTitle"></h2>
        <div class="nl-wrap">
          <div id="nlCodeBox"></div>
          <div class="nl-h">Spelare <span class="tag" id="nlCount"></span></div>
          <ul class="nl-list" id="nlList"></ul>
          <div id="nlMine" class="nl-opts"></div>
          <div class="nl-h" id="nlSetH">Inställningar</div>
          <div id="nlSettings" class="nl-opts"></div>
          <p class="nl-note" id="nlStatus"></p>
          <div class="nl-emotes" id="nlEmotes">${EMOTES.map((t, i) => `<button data-e="${i}">${esc(t)}</button>`).join('')}</div>
          <div class="nl-feed" id="nlFeed"></div>
          <div class="nl-btns"><button class="btn" id="nlReady">Redo</button><button class="btn primary" id="nlStart">Starta</button></div>
          <div class="nl-btns"><button class="btn small" data-back id="nlLeave">Lämna</button></div>
        </div>`;
      const $ = s => panel.querySelector(s);
      $('#nlEmotes').addEventListener('click', e => { const b = e.target.closest('button[data-e]'); if (b) net.emote(+b.dataset.e); });
      $('#nlReady').addEventListener('click', () => net.setReady(!net.me.ready));
      $('#nlStart').addEventListener('click', () => doStart());
      $('#nlLeave').addEventListener('click', () => { net.leave(); home(); });
      if (o.renderMine) o.renderMine($('#nlMine'), net);
    }
    refresh();
  }
  function doStart() {
    if (!net.isHost) return;
    const ok = canStart();
    if (ok !== true) return;
    clearAuto();
    if (o.onStart) o.onStart();
  }
  function canStart() {
    const pl = net.players.filter(p => p.connected);
    if (o.canStart) { const r = o.canStart(pl); if (r !== true) return r; }
    if (pl.length < net.minPlayers) return 'Väntar på fler spelare …';
    return true;
  }
  function clearAuto() { if (autoT) { clearTimeout(autoT.t); autoT = null; } }
  function planAuto() {
    if (!net.isHost || net.kind !== 'quick' || net.phase !== 'lobby' || view !== 'lobby') { clearAuto(); return; }
    const A = Object.assign({ fullMs: 4000, readyMs: 4000, fillMs: 25000 }, o.autoStart || {});
    const pl = net.players.filter(p => p.connected);
    let ms = null, why = '';
    if (canStart() === true) {
      if (pl.length >= net.maxPlayers) { ms = A.fullMs; why = 'Fullt!'; }
      else if (pl.every(p => p.ready)) { ms = A.readyMs; why = 'Alla är redo!'; }
      else { ms = A.fillMs; why = 'Väntar på fler spelare'; }
    }
    if (ms == null) { clearAuto(); return; }
    if (autoT && autoT.why === why) return;
    clearAuto();
    const at = performance.now() + ms;
    autoT = { why, at, t: setTimeout(() => { autoT = null; doStart(); }, ms) };
  }
  function refresh() {
    if (view !== 'lobby') return;
    const $ = s => panel.querySelector(s);
    $('#nlTitle').textContent = net.kind === 'quick' ? 'Snabbmatch' + (modeLabel(net.mode) ? ' – ' + modeLabel(net.mode) : '') : 'Privat rum' + (modeLabel(net.mode) ? ' – ' + modeLabel(net.mode) : '');
    $('#nlCodeBox').innerHTML = net.kind === 'private' && net.code ? `<div class="nl-note" style="text-align:center">Rumskod – läs upp den för dina vänner:</div><div class="nl-code">${esc(net.code)}</div>` : '';
    const pl = net.players;
    $('#nlCount').textContent = `(${pl.length}/${net.maxPlayers})`;
    $('#nlList').innerHTML = pl.map(p => `<li class="${p.isMe ? 'me' : ''}"><span class="dot" style="${o.dotColor ? 'background:' + esc(o.dotColor(p)) : ''}"></span><span class="nm">${p.isHost ? '👑 ' : ''}${esc(p.name)}${p.isMe ? ' (du)' : ''}</span>${o.playerExtra ? `<span class="tag">${o.playerExtra(p)}</span>` : ''}<span class="tag">${p.isMe ? '' : p.ping != null ? p.ping + ' ms' : p.connected ? '' : 'ansluter …'}</span><span class="rdy ${p.ready ? 'on' : ''}">${p.ready ? 'Redo' : 'Inte redo'}</span></li>`).join('');
    const sEl = $('#nlSettings');
    if (o.renderSettings) { $('#nlSetH').style.display = ''; o.renderSettings(sEl, { isHost: net.isHost, state: net.roomState, set: patch => net.setRoomState(patch) }); } else $('#nlSetH').style.display = 'none';
    $('#nlReady').textContent = net.me.ready ? 'Inte redo' : 'Redo';
    $('#nlReady').classList.toggle('primary', !net.isHost && !net.me.ready);
    const st = $('#nlStart');
    st.style.display = net.isHost ? '' : 'none';
    const cs = canStart();
    st.disabled = cs !== true;
    planAuto();
    let status = '';
    if (net.reconnecting) status = '⚠️ ' + net.statusText;
    else if (net.phase === 'game' && !net.isHost) status = 'En omgång pågår – du är med i nästa.';
    else if (net.isHost) status = cs === true ? (autoT ? `${autoT.why} Startar om ${Math.max(0, Math.ceil((autoT.at - performance.now()) / 1000))} s …` : 'Tryck Starta när alla är med.') : (typeof cs === 'string' ? cs : '');
    else status = 'Väntar på att värden startar …';
    if (pl.length <= 1 && performance.now() - tSearch > 30000) status += ' Ingen har dykt upp än – dela rumskoden med en kompis, eller prova ett annat nätverk om ni inte hittar varandra.';
    $('#nlStatus').textContent = status;
    $('#nlStatus').classList.toggle('warn', !!net.reconnecting);
    $('#nlFeed').textContent = feed.filter(f => performance.now() - f.t < 5000).map(f => f.text).join('  ·  ');
  }
  function onStatus(s) {
    if (!visible) return;
    if (s === 'error') return; // hanteras av 'error'
    if (s === 'searching' || s === 'connecting') { if (view !== 'search') searching(net.statusText || 'Ansluter …'); else { const t = panel.querySelector('#nlSearchTxt'); if (t) t.textContent = net.statusText; } }
    else if (s === 'lobby') lobby();
    else if (s === 'idle' && view === 'lobby') home();
    else if (view === 'lobby') refresh();
  }
  const offs = [
    net.on('status', onStatus),
    net.on('roster', () => { if (visible) refresh(); }),
    net.on('roomstate', () => { if (visible) refresh(); }),
    net.on('error', err => { if (!visible) return; if (err.soft) { feed.push({ t: performance.now(), text: err.message }); refresh(); return; } errorView(err); }),
    net.on('emote', e => { feed.push({ t: performance.now(), text: (e.player ? e.player.name : '?') + ': ' + e.text }); if (feed.length > 4) feed.shift(); if (visible) refresh(); }),
    net.on('peerleave', p => { feed.push({ t: performance.now(), text: p.name + (p.wasHost ? ' (värden) lämnade' : ' lämnade') }); if (visible) refresh(); }),
    net.on('hostleft', h => { feed.push({ t: performance.now(), text: h.newHost ? (h.newHost === net.selfId ? 'Du är ny värd' : (h.newName || 'Någon') + ' är ny värd') : 'Värden lämnade' }); })
  ];
  return {
    el: panel,
    open() { visible = true; if (net.connected) lobby(); else if (net.status === 'searching' || net.status === 'connecting') searching(net.statusText); else home(); clearInterval(uiTimer); uiTimer = setInterval(() => { if (visible && view === 'lobby') refresh(); if (visible && view === 'search') { const s = panel.querySelector('#nlSearchSub'); if (s) s.textContent = 'Letat i ' + Math.round((performance.now() - tSearch) / 1000) + ' s – det kan ta upp till 20 sekunder.'; } }, 1000); },
    close() { visible = false; clearAuto(); clearInterval(uiTimer); },
    showLobby() { visible = true; this.open(); },
    refresh,
    destroy() { offs.forEach(f => f()); clearInterval(uiTimer); clearAuto(); root.innerHTML = ''; }
  };
}

/**
 * Liten emote-rad för bruk i spelet (t.ex. resultatskärm/paus). Visar inkommande emotes som bubblor i `popHost`.
 * Returnerar { el, destroy() }.
 */
export function emoteBar(net, popHost) {
  injectCss();
  const el = document.createElement('div'); el.className = 'nl-emotes';
  el.innerHTML = EMOTES.map((t, i) => `<button data-e="${i}">${esc(t)}</button>`).join('');
  el.addEventListener('click', e => { const b = e.target.closest('button[data-e]'); if (b) net.emote(+b.dataset.e); });
  let pop = null;
  const off = net.on('emote', ev => {
    if (!popHost) return;
    if (!pop) { pop = document.createElement('div'); pop.className = 'nl-emo-pop'; popHost.appendChild(pop); }
    const d = document.createElement('div'); d.textContent = (ev.player ? ev.player.name : '?') + ': ' + ev.text; pop.appendChild(d);
    while (pop.children.length > 3) pop.firstChild.remove();
    setTimeout(() => d.remove(), 3200);
  });
  return { el, destroy() { off(); el.remove(); if (pop) pop.remove(); } };
}
