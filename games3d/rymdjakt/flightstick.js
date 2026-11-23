/**
 * Rymdjakt – flygspakar (HOTAS), pedaler och andra styrenheter.
 *
 * Läser ALLA axlar och knappar direkt från navigator.getGamepads() (även enheter med mapping !== 'standard')
 * och hanterar flera enheter samtidigt (t.ex. spak + gasreglage + pedaler). Tilldelningar sparas per enhets-id
 * i Spelhallen.store. Thrustmaster T.Flight HOTAS X känns igen och får ett förval:
 *   spak X → rollning, spak Y → tippning, vridning → girning, gasreglage → fart (absolut läge), avtryckare → laser …
 * Vanliga handkontroller (standardlayout) sköts av kitets Input; enheter som hanteras här kopplas bort därifrån
 * så att samma axel aldrig styr två saker.
 */
import { toast } from '../../engine/kit.js';

export const FUNCS = [
  { id: 'pitch', label: 'Tippning (nos upp/ner)', axis: true },
  { id: 'roll', label: 'Rollning', axis: true },
  { id: 'yaw', label: 'Girning', axis: true },
  { id: 'throttle', label: 'Gas (reglagets läge = fart)', axis: true, thr: true },
  { id: 'fire', label: 'Laser' },
  { id: 'missile', label: 'Missil' },
  { id: 'boost', label: 'Boost' },
  { id: 'brake', label: 'Broms' },
  { id: 'flares', label: 'Motåtgärder' },
  { id: 'tnear', label: 'Mål närmast siktet' },
  { id: 'tnext', label: 'Nästa mål' },
  { id: 'tsub', label: 'Delsystem' },
  { id: 'cam', label: 'Kameravy' },
  { id: 'pause', label: 'Paus' }
];
const BTN_FUNCS = FUNCS.filter(f => !f.axis).map(f => f.id);
const KEY = 'rymdjakt:hotas';
const STICK_RE = /thrustmaster|t\.?\s?flight|t16000|hotas|joystick|flight ?stick|throttle|rudder|pedal|saitek|x52|x56|extreme 3d|vkb|virpil|winwing|vendor: ?044f|^044f-/i;
const PAD_RE = /xbox|xinput|playstation|dualshock|dualsense|wireless controller|gamepad|054c|045e|switch pro|8bitdo|stadia/i;
const TM_RE = /thrustmaster|t\.?\s?flight|hotas ?x|vendor: ?044f|^044f-/i;
const PEDAL_RE = /rudder|pedal|tfrp/i;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Kort, läsbart namn: "T.Flight Hotas X (Vendor: 044f Product: b108)" → "T.Flight Hotas X". */
export function shortName(id) {
  let n = String(id || '').replace(/\(.*?\)/g, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').replace(/\s+/g, ' ').trim();
  if (!n) n = 'Styrenhet';
  return n.length > 38 ? n.slice(0, 36) + '…' : n;
}
const axisB = (i, o = {}) => Object.assign({ i, inv: false, dz: 0.06, sens: 1 }, o);

/** Förval för en enhet utifrån dess id och nuvarande axelvärden (gasreglaget vilar ofta i ett ändläge). */
export function defaultProfile(g) {
  const n = g.axes.length, nb = g.buttons.length, id = g.id || '';
  const usable = i => i < n && Math.abs(g.axes[i]) <= 1.01; // hattar rapporteras ibland som axel med värde > 1
  const p = { axes: {}, buttons: {}, auto: true };
  if (PEDAL_RE.test(id) && !/hotas|stick/i.test(id)) {
    // pedaler: rodret är oftast sista axeln som vilar i mitten
    let yaw = -1; for (let i = n - 1; i >= 0; i--) if (usable(i) && Math.abs(g.axes[i]) < 0.3) { yaw = i; break; }
    if (yaw >= 0) p.axes.yaw = axisB(yaw, { dz: 0.08 });
    return p;
  }
  if (usable(0)) p.axes.roll = axisB(0);
  if (usable(1)) p.axes.pitch = axisB(1);
  // gas: kända index i tur och ordning, men föredra en axel som vilar i ett ändläge
  const thrCand = [2, 6, 3, 4, 5, 7, 8].filter(usable);
  let thr = thrCand.find(i => Math.abs(g.axes[i]) > 0.85);
  if (thr == null) thr = thrCand[0];
  if (thr != null) p.axes.throttle = axisB(thr, { dz: 0.03 });
  // girning: vridning (twist) eller vippa på gasreglaget – en axel som vilar nära mitten
  const yawCand = [5, 6, 3, 4, 7, 2].filter(i => usable(i) && i !== thr);
  let yaw = yawCand.find(i => Math.abs(g.axes[i]) < 0.35);
  if (yaw == null) yaw = yawCand[0];
  if (yaw != null) p.axes.yaw = axisB(yaw, { dz: 0.1 });
  const order = ['fire', 'missile', 'tnext', 'tnear', 'boost', 'flares', 'brake', 'tsub', 'cam', 'pause'];
  order.forEach((f, k) => { if (k < nb) p.buttons[f] = k; });
  return p;
}

export class FlightStick {
  constructor(game) {
    this.g = game;
    this.data = this._load();
    this.seen = new Map();          // id → index (anslutna enheter som redan hälsats)
    this.prevBtn = new Map();       // id → bool[]
    this.devs = [];                 // anslutna enheter denna bildruta
    this.hasStick = false;
    this.frame = { active: false, moved: false, pitch: 0, roll: 0, yaw: 0, thr: null, down: {}, pressed: {} };
    this.capture = null;            // { fn, t0, base: Map(id → axes[]), btn: Map(id → bool[]), hit }
    this._last = { pitch: 0, roll: 0, yaw: 0 };
    // låt inte kitets Input ta över en flygspak som handkontroll (ingen dubbelstyrning, ingen "Handkontroll ansluten").
    // Nya webbläsare kör fångstlyssnaren först och stoppar kitets; äldre kör kitets först – då tas dess toast bort.
    addEventListener('gamepadconnected', e => {
      const gp = e.gamepad;
      if (!gp || !this.isStick(gp)) return;
      e.stopImmediatePropagation();
      document.querySelectorAll('.g3-toast').forEach(el => { if (el.textContent.startsWith('🎮 Handkontroll ansluten')) el.remove(); });
    }, true);
    this.screen = null;
  }

  /* ---------------------------------------------------------------- sparning */
  _load() {
    const S = window.Spelhallen;
    const d = S ? S.store.get(KEY, null) : null;
    return d && typeof d === 'object' && d.devices ? d : { v: 1, devices: {} };
  }
  save() { const S = window.Spelhallen; if (S) S.store.set(KEY, this.data); }
  profile(id) { return this.data.devices[id] || null; }

  /** Är enheten en flygspak/pedal/annan enhet som ska skötas här (i stället för som handkontroll)? */
  isStick(g) {
    if (!g) return false;
    if (this.data.devices[g.id]) return true;
    if (STICK_RE.test(g.id)) return true;
    return g.mapping !== 'standard' && g.axes.length >= 3 && !PAD_RE.test(g.id);
  }

  /* ---------------------------------------------------------------- avläsning (en gång per uppdatering) */
  poll(input) {
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch (e) { pads = []; }
    const devs = [];
    for (const g of pads) if (g && g.connected !== false && g.axes && g.buttons) devs.push(g);
    this.devs = devs;
    const F = this.frame;
    F.pitch = F.roll = F.yaw = 0; F.thr = null; F.moved = false; F.active = false;
    for (const k of BTN_FUNCS) { F.down[k] = false; F.pressed[k] = false; }
    const present = new Set();
    let stick = false;
    for (const g of devs) {
      present.add(g.id);
      const isS = this.isStick(g);
      if (!this.seen.has(g.id)) this._greet(g, isS);
      this.seen.set(g.id, g.index);
      const p = this.data.devices[g.id];
      const btns = g.buttons.map(b => !!(b && (b.pressed || b.value > 0.5)));
      const prev = this.prevBtn.get(g.id) || [];
      this.prevBtn.set(g.id, btns);
      if (!p) continue;
      if (isS) stick = true;
      F.active = true;
      const A = p.axes || {};
      if (A.pitch) F.pitch += this.axis(g, A.pitch);
      if (A.roll) F.roll += this.axis(g, A.roll);
      if (A.yaw) F.yaw += this.axis(g, A.yaw);
      if (A.throttle) F.thr = this.thrAxis(g, A.throttle);
      if (!this.capture) for (const [f, bi] of Object.entries(p.buttons || {})) {
        if (bi == null || bi < 0) continue;
        if (btns[bi]) { F.down[f] = true; if (!prev[bi]) F.pressed[f] = true; }
      }
    }
    for (const id of [...this.seen.keys()]) if (!present.has(id)) { this.seen.delete(id); this.prevBtn.delete(id); }
    this.hasStick = stick;
    F.pitch = clamp(F.pitch, -1, 1); F.roll = clamp(F.roll, -1, 1); F.yaw = clamp(F.yaw, -1, 1);
    const L = this._last;
    if (Math.abs(F.pitch - L.pitch) + Math.abs(F.roll - L.roll) + Math.abs(F.yaw - L.yaw) > 0.15) { F.moved = true; L.pitch = F.pitch; L.roll = F.roll; L.yaw = F.yaw; }
    if (this.capture) { this._captureStep(); F.active = false; F.thr = null; F.pitch = F.roll = F.yaw = 0; }
    // kitets Input: följ bara en vanlig handkontroll, aldrig en enhet som sköts här
    if (input && input.gamepad != null) {
      const cur = devs.find(g => g.index === input.gamepad);
      if (!cur || this.data.devices[cur.id] || this.isStick(cur)) {
        const pad = devs.find(g => !this.data.devices[g.id] && !this.isStick(g));
        input.gamepad = pad ? pad.index : null;
      }
    }
  }
  pressed(f) { return !!this.frame.pressed[f]; }

  axis(g, b) {
    let v = g.axes[b.i];
    if (v == null || !isFinite(v) || Math.abs(v) > 1.05) return 0;
    if (b.inv) v = -v;
    const a = Math.abs(v), dz = clamp(b.dz != null ? b.dz : 0.06, 0, 0.6);
    if (a <= dz) return 0;
    return clamp(Math.sign(v) * Math.pow((a - dz) / (1 - dz), 1.25) * (b.sens || 1), -1, 1);
  }
  /** Gasreglage: absolut läge 0..1. Framåt (−1 på de flesta spakar) = full fart. */
  thrAxis(g, b) {
    let v = g.axes[b.i];
    if (v == null || !isFinite(v) || Math.abs(v) > 1.05) return null;
    if (b.inv) v = -v;
    let t = (1 - v) / 2;
    const dz = clamp(b.dz != null ? b.dz : 0.03, 0, 0.3);
    t = clamp((t - dz) / (1 - 2 * dz), 0, 1);
    return t;
  }

  _greet(g, isS) {
    let p = this.data.devices[g.id];
    if (!isS && !p) return; // vanlig handkontroll – kitet hälsar själv
    const name = shortName(g.id);
    if (!p) {
      p = this.data.devices[g.id] = defaultProfile(g);
      this.save();
      toast(TM_RE.test(g.id) ? '🕹️ Thrustmaster HOTAS ansluten – förval laddat' : `🕹️ ${name} ansluten – förval laddat`, { ms: 3200 });
    } else toast(`🕹️ ${name} ansluten – dina inställningar laddade`, { ms: 2800 });
    if (this.screen && this.screen.open) this.screen.render();
  }

  /** Text för hjälp och handledning, t.ex. "knapp 2". */
  label(f) {
    for (const g of this.devs) {
      const p = this.data.devices[g.id]; if (!p) continue;
      if (p.buttons && p.buttons[f] != null) return f === 'fire' && p.buttons[f] === 0 ? 'avtryckaren' : 'knapp ' + (p.buttons[f] + 1);
      if (p.axes && p.axes[f]) return 'axel ' + (p.axes[f].i + 1);
    }
    return 'ej tilldelad – se Ställ in kontroller';
  }
  /** Var är funktionen f tilldelad? → { id, axis|button } */
  find(f) {
    for (const [id, p] of Object.entries(this.data.devices)) {
      if (p.axes && p.axes[f]) return { id, b: p.axes[f], axis: true };
      if (p.buttons && p.buttons[f] != null) return { id, b: p.buttons[f], axis: false };
    }
    return null;
  }
  unbind(f) {
    for (const p of Object.values(this.data.devices)) { if (p.axes) delete p.axes[f]; if (p.buttons) delete p.buttons[f]; }
  }
  bind(f, id, idx, isAxis) {
    const old = this.find(f);
    const keep = old && old.axis && isAxis ? { inv: old.b.inv, dz: old.b.dz, sens: old.b.sens } : {};
    this.unbind(f);
    const p = this.data.devices[id] || (this.data.devices[id] = { axes: {}, buttons: {} });
    p.auto = false;
    if (isAxis) p.axes[f] = axisB(idx, Object.assign({ dz: f === 'throttle' ? 0.03 : 0.06 }, keep));
    else p.buttons[f] = idx;
    this.save();
  }
  resetDefaults() {
    for (const g of this.devs) {
      if (this.isStickBase(g)) this.data.devices[g.id] = defaultProfile(g);
      else delete this.data.devices[g.id];
    }
    this.save();
  }
  /** Som isStick men utan att räkna sparade profiler (för "Återställ förval"). */
  isStickBase(g) { return STICK_RE.test(g.id) || (g.mapping !== 'standard' && g.axes.length >= 3 && !PAD_RE.test(g.id)); }

  /* ---------------------------------------------------------------- tilldelning: rör axeln / tryck knappen */
  startCapture(f, done) {
    const fd = FUNCS.find(x => x.id === f); if (!fd) return;
    const base = new Map(), btn = new Map();
    for (const g of this.devs) { base.set(g.id, g.axes.slice()); btn.set(g.id, g.buttons.map(b => !!(b && (b.pressed || b.value > 0.5)))); }
    this.capture = { f, axis: !!fd.axis, t0: performance.now(), base, btn, hitT: 0, done };
  }
  cancelCapture() { const c = this.capture; this.capture = null; if (c && c.done) c.done(false); }
  _captureStep() {
    const c = this.capture, now = performance.now();
    if (now - c.t0 > 10000) { this.cancelCapture(); return; }
    if (c.axis) {
      // största förändringen sedan starten vinner (vänta en kort stund så att diagonala rörelser hinner avgöras)
      // (toppvärdet per axel sparas, så en snabb knyck räcker också)
      if (!c.peak) c.peak = new Map();
      let best = null, bd = 0;
      for (const g of this.devs) {
        const b0 = c.base.get(g.id); if (!b0) { c.base.set(g.id, g.axes.slice()); continue; }
        g.axes.forEach((v, i) => {
          if (Math.abs(v) > 1.05 || Math.abs(b0[i]) > 1.05) return;
          const k = g.id + '\u0000' + i, d = Math.max(c.peak.get(k) || 0, Math.abs(v - b0[i]));
          c.peak.set(k, d);
          if (d > bd) { bd = d; best = { id: g.id, i }; }
        });
      }
      if (bd > 0.5 && !c.hitT) c.hitT = now;
      if (c.hitT && now - c.hitT > 280 && best) { this.capture = null; this.bind(c.f, best.id, best.i, true); if (c.done) c.done(true); }
    } else {
      for (const g of this.devs) {
        const b0 = c.btn.get(g.id) || [];
        const i = g.buttons.findIndex((b, k) => !!(b && (b.pressed || b.value > 0.5)) && !b0[k]);
        if (i >= 0) {
          this.capture = null;
          // samma knapp får inte styra två funktioner
          const p = this.data.devices[g.id];
          if (p && p.buttons) for (const [k, v] of Object.entries(p.buttons)) if (v === i && k !== c.f) delete p.buttons[k];
          this.bind(c.f, g.id, i, false);
          // knappen hålls nere just nu – räkna inte det som ett tryck i spelet
          this.prevBtn.set(g.id, g.buttons.map(b => !!(b && (b.pressed || b.value > 0.5))));
          if (c.done) c.done(true);
          return;
        }
      }
    }
  }
}

/* ======================================================================== Inställningsskärmen */
export class StickScreen {
  constructor(game, stick) {
    this.g = game; this.st = stick; this.open = false; this.raf = 0;
    stick.screen = this;
    this.devBox = $('ctrlDevs'); this.mapBox = $('ctrlMap');
    $('ctrlReset').addEventListener('click', () => { this.g.sfx.play('click'); this.st.resetDefaults(); this.render(); toast('Förval återställt'); });
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.st.capture) { e.preventDefault(); e.stopImmediatePropagation(); this.st.cancelCapture(); }
    }, true);
  }
  show() {
    this.open = true;
    this.render();
    const tick = () => {
      if (!this.open || this.g.ui.cur !== 'ctrlScr') { this.open = false; if (this.st.capture) this.st.cancelCapture(); return; }
      // i menyerna pollar spelloopen redan; pollar vi här också blir det ändå samma läge
      if (this.g.state !== 'menu' && this.g.state !== 'paused' && this.g.state !== 'flight') this.st.poll(null);
      this.live();
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }
  render() {
    const st = this.st, devs = st.devs;
    // ---- enheter + liveläge
    if (!devs.length) this.devBox.innerHTML = '<p class="rj-ctrl-none">Ingen styrenhet hittades. Anslut flygspaken och <b>tryck på någon knapp</b> på den – webbläsaren visar den först då.</p>';
    else this.devBox.innerHTML = devs.map(g => {
      const p = st.profile(g.id);
      const tag = p ? (st.isStick(g) ? 'Flygspak' : 'Egen tilldelning') : 'Handkontroll (standardlayout)';
      return `<div class="rj-dev" data-id="${esc(g.id)}"><div class="rj-dev-h"><b>${esc(shortName(g.id))}</b><span>${tag} · ${g.axes.length} axlar · ${g.buttons.length} knappar${g.mapping === 'standard' ? '' : ' · egen layout'}</span></div>
        <div class="rj-axes">${g.axes.map((v, i) => `<div class="rj-ax"><span>Axel ${i + 1}</span><div class="rj-axbar"><i></i></div><em></em></div>`).join('')}</div>
        <div class="rj-btns">${g.buttons.map((b, i) => `<i title="Knapp ${i + 1}">${i + 1}</i>`).join('')}</div></div>`;
    }).join('');
    // ---- funktioner
    const devName = id => { const g = devs.find(x => x.id === id); return shortName(g ? g.id : id) + (g ? '' : ' (ej ansluten)'); };
    this.mapBox.innerHTML = FUNCS.map(f => {
      const b = st.find(f.id);
      const cap = st.capture && st.capture.f === f.id;
      let txt = '<span class="rj-unb">Ej tilldelad</span>';
      if (b) txt = `${esc(devName(b.id))} · ${b.axis ? 'axel ' + (b.b.i + 1) : 'knapp ' + (b.b + 1)}`;
      if (cap) txt = `<span class="rj-cap">${f.axis ? 'Rör axeln nu …' : 'Tryck på knappen nu …'} (Esc avbryter)</span>`;
      let opts = '';
      if (f.axis && b && b.axis) {
        const B = b.b;
        opts = `<label class="rj-inv"><input type="checkbox" data-inv="${f.id}"${B.inv ? ' checked' : ''}> Invertera</label>
          <label class="rj-rng">Dödzon <input type="range" min="0" max="${f.thr ? 0.2 : 0.4}" step="0.01" value="${B.dz}" data-dz="${f.id}"><em>${Math.round(B.dz * 100)} %</em></label>
          ${f.thr ? '' : `<label class="rj-rng">Känslighet <input type="range" min="0.3" max="2" step="0.05" value="${B.sens}" data-sens="${f.id}"><em>${Math.round(B.sens * 100)} %</em></label>`}
          <span class="rj-val" data-val="${f.id}"></span>`;
      }
      return `<div class="rj-map${cap ? ' cap' : ''}"><div class="rj-map-l"><b>${f.label}</b><span>${txt}</span></div><div class="rj-map-o">${opts}</div>
        <div class="rj-map-b"><button class="btn small" data-chg="${f.id}">${cap ? 'Avbryt' : 'Ändra'}</button>${b ? `<button class="btn small ghost" data-clr="${f.id}" title="Ta bort tilldelningen">✕</button>` : ''}</div></div>`;
    }).join('');
    this.mapBox.querySelectorAll('[data-chg]').forEach(el => el.addEventListener('click', () => {
      const f = el.dataset.chg;
      this.g.sfx.play('click');
      if (st.capture) { const same = st.capture.f === f; st.cancelCapture(); if (same) { this.render(); return; } }
      st.startCapture(f, ok => { if (ok) { this.g.sfx.play('select'); } this.render(); });
      this.render();
    }));
    this.mapBox.querySelectorAll('[data-clr]').forEach(el => el.addEventListener('click', () => { st.unbind(el.dataset.clr); st.save(); this.g.sfx.play('click'); this.render(); }));
    this.mapBox.querySelectorAll('[data-inv]').forEach(el => el.addEventListener('change', () => { const b = st.find(el.dataset.inv); if (b && b.axis) { b.b.inv = el.checked; st.save(); } }));
    const rng = (attr, key) => this.mapBox.querySelectorAll(`[data-${attr}]`).forEach(el => el.addEventListener('input', () => {
      const b = st.find(el.dataset[attr]); if (!b || !b.axis) return;
      b.b[key] = +el.value; st.save();
      el.nextElementSibling.textContent = Math.round(+el.value * 100) + ' %';
    }));
    rng('dz', 'dz'); rng('sens', 'sens');
    this._sig = devs.map(g => g.id + g.axes.length + ':' + g.buttons.length).join('|');
  }
  /** Uppdaterar liveläget (axelstaplar, knappar och funktionernas utslag) varje bildruta. */
  live() {
    const st = this.st, devs = st.devs;
    const sig = devs.map(g => g.id + g.axes.length + ':' + g.buttons.length).join('|');
    if (sig !== this._sig) { this.render(); return; }
    const used = new Map(); // "id:a3" → funktionsnamn
    for (const f of FUNCS) { const b = st.find(f.id); if (b) used.set(b.id + (b.axis ? ':a' + b.b.i : ':b' + b.b), f.label); }
    this.devBox.querySelectorAll('.rj-dev').forEach(el => {
      const g = devs.find(x => x.id === el.dataset.id); if (!g) return;
      el.querySelectorAll('.rj-ax').forEach((ax, i) => {
        const v = g.axes[i] || 0, bar = ax.querySelector('i');
        const hat = Math.abs(v) > 1.05;
        const c = Math.max(-1, Math.min(1, v));
        bar.style.left = (c < 0 ? 50 + c * 50 : 50) + '%'; bar.style.width = Math.abs(c) * 50 + '%';
        const u = used.get(g.id + ':a' + i);
        ax.querySelector('em').textContent = (hat ? 'hatt ' : '') + v.toFixed(2).replace('.', ',') + (u ? ' · ' + u : '');
        ax.classList.toggle('used', !!u);
      });
      el.querySelectorAll('.rj-btns i').forEach((bi, i) => {
        const b = g.buttons[i];
        bi.classList.toggle('on', !!(b && (b.pressed || b.value > 0.5)));
        const u = used.get(g.id + ':b' + i); bi.classList.toggle('used', !!u); bi.title = 'Knapp ' + (i + 1) + (u ? ' – ' + u : '');
      });
    });
    // funktionernas utslag
    this.mapBox.querySelectorAll('[data-val]').forEach(el => {
      const f = el.dataset.val, b = st.find(f); if (!b) return;
      const g = devs.find(x => x.id === b.id); if (!g) { el.textContent = ''; return; }
      const v = f === 'throttle' ? st.thrAxis(g, b.b) : st.axis(g, b.b);
      el.textContent = v == null ? '' : (f === 'throttle' ? 'Fart ' + Math.round(v * 100) + ' %' : (v >= 0 ? '+' : '') + Math.round(v * 100) + ' %');
    });
  }
}
