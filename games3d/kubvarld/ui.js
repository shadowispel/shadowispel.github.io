/** HUD och inventarieskärmar (DOM). */
import { itemName, maxStack, toolOf, itemDef, BLOCKS, ITEMS, creativeList, fuelOf, M_CROSS, I, B, TOOL0, armorOf, ARMOR_SLOT_NAMES, isBlock, ARMOR0, SURT_TOOL0, SURT_ARMOR0 } from './blocks.js';
import { PROFS } from './models.js';
import { findRecipe, RECIPES, ingredients, wantName, TAGS, smeltResult, SMELT_TIME } from './inventory.js';
import { isTouchDevice } from '../../engine/kit.js';
import { renderAchievements } from './achievements.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

const NATURE = [1, 2, 5, 6, 8, 9, 10, 11, 12, 13, 24, 25, 26, 27, 65, 101, 103, 108, 119, 120, 122, 169, 173, 175, 176, 204, 400, 405, 406, 408, 409, 410, 411, 412];
const isCirc = id => isBlock(id) ? !!(BLOCKS[id] && (BLOCKS[id].wire || BLOCKS[id].circ || BLOCKS[id].rep || BLOCKS[id].plate || BLOCKS[id].piston || BLOCKS[id].disp !== undefined || BLOCKS[id].obs !== undefined || BLOCKS[id].interact === 'button' || BLOCKS[id].interact === 'lever' || BLOCKS[id].interact === 'note' || id === 221)) : id === 324;
const isNature = id => isBlock(id) && BLOCKS[id] && (BLOCKS[id].model === M_CROSS || (id >= 15 && id <= 20) || NATURE.includes(id));
const isGear = id => !isBlock(id) && ITEMS[id] && (ITEMS[id].tool || ITEMS[id].armor || [I.bucket, I.bucket_water, I.bucket_lava, I.compass, I.clock, I.arrow].includes(id));
const CREATIVE_TABS = [
  ['Byggblock', id => isBlock(id) && BLOCKS[id] && !isNature(id) && !isCirc(id)],
  ['Natur', isNature],
  ['Föremål', id => !isBlock(id) && !isGear(id)],
  ['Verktyg', isGear],
  ['Kretsar', isCirc],
  ['Alla', () => true]
];

/** Smidesbänk: diamantföremål + surtståltacka → motsvarande surtstålföremål (slitage behålls proportionellt) */
export function smithResult(a, b) {
  if (!a || !b || b.id !== I.surtstal) return null;
  let out = 0;
  if (a.id >= TOOL0 + 12 && a.id <= TOOL0 + 15) out = SURT_TOOL0 + (a.id - TOOL0 - 12);
  else if (a.id >= ARMOR0 + 12 && a.id <= ARMOR0 + 15) out = SURT_ARMOR0 + (a.id - ARMOR0 - 12);
  if (!out) return null;
  const t0 = toolOf(a.id), t1 = toolOf(out);
  return { id: out, n: 1, d: t0 && t1 && a.d ? Math.round(a.d / t0.dur * t1.dur) : 0 };
}

export class UI {
  constructor(game) {
    this.g = game;
    this.icons = game.icons;
    this.hud = $('hud');
    this.mode = null; // null | inv | bench | furnace | chest | creative
    this.ctx = null;
    this.logEl = $('log');
    this.buildHotbar();
    this.buildStats();
    this.tip = $('tooltip');
    this.cursorEl = $('cursorItem');
    this.invEl = $('inv'); this.panel = $('invpanel');
    this.creativeTab = 0; this.search = '';
    this.showBook = false;
    this.mouse = { x: 0, y: 0 };
    this._h = {
      move: e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this._moveCursor(); },
      bg: e => { if (e.target === this.invEl) { this._dropCursor(e.button === 2 ? 1 : 0); } },
      ctx: e => e.preventDefault(),
      up: e => this._onUp(e)
    };
    addEventListener('pointermove', this._h.move);
    this.invEl.addEventListener('pointerdown', this._h.bg);
    this.invEl.addEventListener('contextmenu', this._h.ctx);
    addEventListener('pointerup', this._h.up);
    this.gpCursor = null;
    this._lastHotbar = '';
  }

  dispose() {
    removeEventListener('pointermove', this._h.move); removeEventListener('pointerup', this._h.up);
    this.invEl.removeEventListener('pointerdown', this._h.bg); this.invEl.removeEventListener('contextmenu', this._h.ctx);
    if (this.gpCursor) { this.gpCursor.remove(); this.gpCursor = null; }
  }
  /** Handkontroll i inventariet: spaken flyttar en markör, A = klick, X = höger, Y/B = stäng */
  gamepad(dx, dy, a, x) {
    if (!this.mode) return;
    if (!this.gpCursor) { this.gpCursor = el('div', 'kv-gpcur', document.getElementById('root')); this.mouse.x = innerWidth / 2; this.mouse.y = innerHeight / 2; }
    this.mouse.x = Math.max(0, Math.min(innerWidth - 1, this.mouse.x + dx));
    this.mouse.y = Math.max(0, Math.min(innerHeight - 1, this.mouse.y + dy));
    this.gpCursor.style.transform = `translate(${this.mouse.x}px, ${this.mouse.y}px)`;
    this._moveCursor();
    if (a || x) {
      const t = document.elementFromPoint(this.mouse.x, this.mouse.y);
      const slot = t && t.closest && t.closest('.kv-slot');
      const ref = slot && this.refs.find(r => r.el === slot);
      if (ref) this._click(ref, x ? 1 : 0, false);
      else if (t && t.closest && t.closest('button')) t.closest('button').click();
      else if (t === this.invEl) this._dropCursor(x ? 1 : 0);
    }
    const t = document.elementFromPoint(this.mouse.x, this.mouse.y);
    const slot = t && t.closest && t.closest('.kv-slot');
    const ref = slot && this.refs.find(r => r.el === slot);
    if (ref !== this._hover) { this._hover = ref || null; this._showTip(); }
  }

  /* ---------- HUD ---------- */
  buildHotbar() {
    const hb = $('hotbar'); hb.innerHTML = '';
    this.hbSlots = [];
    for (let i = 0; i < 9; i++) {
      const s = this._slotEl(hb);
      s.el.dataset.i = i;
      el('span', 'k', s.el).textContent = i + 1;
      s.el.addEventListener('pointerdown', e => { e.stopPropagation(); this.g.inv.sel = i; this.g.onSelChange(); this.updateHotbar(true); });
      this.hbSlots.push(s);
    }
  }
  buildStats() {
    const m = id => { const e = $(id); return { el: e, b: e.querySelector('b'), s: e.querySelector('s'), v: -1 }; };
    this.mHp = m('mHp'); this.mFood = m('mFood'); this.mAir = m('mAir');
    this._hk = ''; this._fk = ''; this._ak = ''; this._cr = null;
  }
  _bar(m, f) { if (m.v === f) return; m.v = f; const t = `scaleX(${Math.max(0, Math.min(1, f))})`; m.b.style.transform = t; m.s.style.transform = t; }
  updateStats(p, creative) {
    if (this._cr !== creative) { this._cr = creative; $('stats').style.display = creative ? 'none' : ''; }
    if (creative) return;
    const hp = Math.max(0, Math.ceil(p.health));
    const hk = hp + ':' + (p.hurtT > 0 ? 1 : 0) + ':' + (this.g.armorPoints ? this.g.armorPoints() : 0);
    if (hk !== this._hk) {
      this._hk = hk;
      this._bar(this.mHp, hp / 20);
      this.mHp.el.classList.toggle('low', hp <= 6 && p.alive);
      this.mHp.el.classList.toggle('hurt', p.hurtT > 0);
      const ap = this.g.armorPoints ? this.g.armorPoints() : 0;
      $('hpVal').textContent = hp + '/20' + (ap ? ' · 🛡' + ap : '');
    }
    const fd = Math.max(0, Math.ceil(p.food));
    if (String(fd) !== this._fk) { this._fk = String(fd); this._bar(this.mFood, fd / 20); this.mFood.el.classList.toggle('low', fd <= 6); $('foodVal').textContent = fd + '/20'; }
    const showAir = p.headInWater || p.air < 14.9;
    const ak = showAir ? String(Math.ceil(p.air * 2)) : '-';
    if (ak !== this._ak) { this._ak = ak; this.mAir.el.classList.toggle('off', !showAir); this._bar(this.mAir, p.air / 15); this.mAir.el.classList.toggle('low', showAir && p.air < 4); }
  }
  updateHotbar(force) {
    const inv = this.g.inv;
    const key = inv.sel + '|' + inv.slots.slice(0, 9).map(s => s ? s.id + ':' + s.n + ':' + (s.d || 0) : '').join(',');
    if (!force && key === this._lastHotbar) return;
    const prevSel = this._lastSel;
    this._lastHotbar = key; this._lastSel = inv.sel;
    for (let i = 0; i < 9; i++) { this._fill(this.hbSlots[i], inv.slots[i]); this.hbSlots[i].el.classList.toggle('sel', i === inv.sel); }
    if (prevSel !== inv.sel || force) {
      const s = inv.slots[inv.sel];
      const hn = $('heldName');
      hn.textContent = s ? itemName(s.id) : '';
      hn.classList.remove('show'); void hn.offsetWidth; if (s) hn.classList.add('show');
    }
  }
  log(text, cls) {
    const d = el('div', 'kv-msg' + (cls ? ' ' + cls : ''), this.logEl);
    d.textContent = text;
    while (this.logEl.children.length > 6) this.logEl.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, 6500);
  }
  /* ---------- slots ---------- */
  _slotEl(parent, cls = '') {
    const e = el('div', 'kv-slot ' + cls, parent);
    const img = el('img', '', e); img.alt = ''; img.draggable = false;
    const n = el('span', 'n', e);
    const dur = el('i', 'dur', e);
    return { el: e, img, n, dur, cur: null };
  }
  _fill(s, st) {
    const id = st ? st.id : 0;
    const k = st ? id + ':' + st.n + ':' + (st.d || 0) : '';
    if (s.cur === k) return; s.cur = k;
    if (!st) { s.img.style.visibility = 'hidden'; s.n.textContent = ''; s.dur.style.display = 'none'; return; }
    s.img.style.visibility = 'visible';
    if (s.img.dataset.id !== String(id)) { s.img.src = this.icons[id] || ''; s.img.dataset.id = id; }
    s.n.textContent = st.n > 1 ? st.n : '';
    const t = toolOf(id);
    if (t && st.d > 0) { const f = 1 - st.d / t.dur; s.dur.style.display = 'block'; s.dur.style.width = Math.round(f * 80) + '%'; s.dur.style.background = `hsl(${f * 120},80%,50%)`; }
    else s.dur.style.display = 'none';
  }

  /* ---------- inventarieskärm ---------- */
  get open() { return !!this.mode; }
  openScreen(mode, ctx = null) {
    this.mode = mode; this.ctx = ctx;
    this.invEl.classList.remove('hidden');
    this.build();
    this.refresh();
  }
  close() {
    if (!this.mode) return;
    const inv = this.g.inv;
    // lägg tillbaka hantverksrutnät och muspekare
    for (let i = 0; i < 9; i++) if (inv.craft[i]) { const s = inv.craft[i]; inv.craft[i] = null; this._giveBack(s); }
    if (inv.smith) for (let i = 0; i < 2; i++) if (inv.smith[i]) { const s = inv.smith[i]; inv.smith[i] = null; this._giveBack(s); }
    if (inv.cursor) { const s = inv.cursor; inv.cursor = null; this._giveBack(s); }
    if (this.ctx && this.ctx.mob) this.ctx.mob.trading = false;
    this.mode = null; this.ctx = null; this.tradeRows = null;
    this.invEl.classList.add('hidden');
    this.tip.style.display = 'none';
    if (this.gpCursor) { this.gpCursor.remove(); this.gpCursor = null; }
    this._moveCursor();
    this.g.onInventoryClosed();
  }
  _giveBack(s) { const left = this.g.inv.add(s.id, s.n, s.d); if (left > 0) this.g.throwItem({ id: s.id, n: left, d: s.d }); }

  build() {
    const P = this.panel; P.innerHTML = '';
    const bookOk = this.showBook && (this.mode === 'inv' || this.mode === 'bench');
    P.className = 'kv-invpanel' + (this.mode === 'creative' ? ' creative' : '') + (bookOk ? ' book' : '');
    this.refs = []; this.outRef = null; this.bookList = null;
    const main = el('div', 'kv-invmain', P);
    const top = el('div', 'kv-invtop', main);
    const mode = this.mode;
    const inv = this.g.inv;
    const title = el('div', 'kv-invtitle', top);
    if (mode === 'ach') {
      title.textContent = 'Prestationer';
      main.classList.add('kv-achmain');
      renderAchievements(el('div', 'kv-achbox', main), this.g.achievements, this.icons, this.g.creative);
      const close = el('button', 'btn small kv-close', main); close.textContent = isTouchDevice() ? 'Stäng' : 'Stäng (L)'; close.onclick = () => this.g.closeInventory();
      return;
    }
    if (mode === 'creative') {
      title.textContent = 'Kreativt läge – alla block';
      const tabs = el('div', 'kv-tabs', top);
      CREATIVE_TABS.forEach(([n], i) => { const b = el('button', i === this.creativeTab ? 'on' : '', tabs); b.textContent = n; b.onclick = () => { this.creativeTab = i; this.build(); this.refresh(); }; });
      const srch = el('input', 'kv-search', tabs); srch.placeholder = 'Sök…'; srch.value = this.search;
      srch.oninput = () => { this.search = srch.value.toLowerCase(); this._buildCreativeGrid(); this.refresh(); };
      this.cgrid = el('div', 'kv-grid kv-cgrid', main);
      this._buildCreativeGrid();
    } else if (mode === 'inv' || mode === 'bench') {
      title.textContent = mode === 'bench' ? 'Arbetsbänk' : 'Inventarie';
      const size = mode === 'bench' ? 3 : 2;
      const cr = el('div', 'kv-craft', top);
      const grid = el('div', 'kv-grid g' + size, cr);
      for (let i = 0; i < size * size; i++) this._ref(grid, { kind: 'craft', i, get: () => inv.craft[i], set: v => { inv.craft[i] = v; } });
      el('div', 'kv-arrow', cr).textContent = '➜';
      this.outRef = this._ref(cr, { kind: 'out', get: () => this._craftOut(), set: () => { } }, 'big');
      // rustning
      const ar = el('div', 'kv-armor', top);
      ar.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-right:6px';
      for (let i = 0; i < 4; i++) {
        const r = this._ref(ar, { kind: 'armor', i, get: () => inv.armor[i], set: v => { inv.armor[i] = v; }, accept: id => { const a = armorOf(id); return !!a && a.slot === i; } });
        r.el.title = ARMOR_SLOT_NAMES[i]; r.el.style.opacity = inv.armor[i] ? '' : '0.75';
      }
      const off = this._ref(ar, { kind: 'off', get: () => inv.off, set: v => { inv.off = v; } }, 'off');
      off.el.title = isTouchDevice() ? 'Andra handen (t.ex. sköld)' : 'Andra handen (F byter) – t.ex. sköld';
      const bb = el('button', 'btn small kv-bookbtn', top); bb.textContent = this.showBook ? 'Dölj receptbok' : (isTouchDevice() ? 'Receptbok' : 'Receptbok (R)');
      bb.onclick = () => { this.showBook = !this.showBook; this.build(); this.refresh(); };
      const ab = el('button', 'btn small kv-bookbtn', top); ab.textContent = isTouchDevice() ? 'Prestationer' : 'Prestationer (L)';
      ab.onclick = () => { this.close(); this.g.openInventory('ach'); };
    } else if (mode === 'furnace') {
      title.textContent = 'Ugn';
      const f = this.ctx.f;
      const fu = el('div', 'kv-furn', top);
      const col = el('div', 'kv-furncol', fu);
      this._ref(col, { kind: 'fin', get: () => f.in, set: v => { f.in = v; } });
      this.flame = el('div', 'kv-flame', col);
      this._ref(col, { kind: 'ffuel', get: () => f.fuel, set: v => { f.fuel = v; } });
      this.prog = el('div', 'kv-prog', fu); el('i', '', this.prog);
      this._ref(fu, { kind: 'fout', get: () => f.out, set: v => { f.out = v; } }, 'big');
      const hint = el('div', 'kv-hint', top); hint.textContent = 'Lägg malm, sand eller mat överst och bränsle (kol, ved, torv) underst.';
    } else if (mode === 'trade') {
      const pr = PROFS[this.ctx.prof] || PROFS.bonde;
      title.textContent = 'Handla med ' + pr.def;
      this.emeraldLine = el('div', 'kv-hint', top);
      const list = el('div', 'kv-trades', main);
      this.tradeRows = [];
      for (const o of this.ctx.offers) {
        const row = el('div', 'kv-trade', list);
        const give = el('div', 'kv-tside', row);
        for (const [id, n] of o.give) { const it = el('span', 'kv-titem', give); const im = el('img', '', it); im.src = this.icons[id] || ''; im.alt = ''; el('b', '', it).textContent = n > 1 ? n : ''; it.title = itemName(id); }
        el('div', 'kv-tarrow', row).textContent = '➜';
        const get = el('div', 'kv-tside', row);
        { const [id, n] = o.get; const it = el('span', 'kv-titem', get); const im = el('img', '', it); im.src = this.icons[id] || ''; im.alt = ''; el('b', '', it).textContent = n > 1 ? n : ''; }
        const nm = el('div', 'kv-tname', row); nm.textContent = itemName(o.get[0]) + (o.get[1] > 1 ? ' ×' + o.get[1] : '');
        const btn = el('button', 'btn small', row); btn.textContent = 'Byt';
        btn.onclick = () => { if (this.g.trade(o)) this.refresh(); };
        this.tradeRows.push({ row, btn, o });
      }
    } else if (mode === 'smith') {
      title.textContent = 'Smidesbänk';
      if (!inv.smith) inv.smith = [null, null];
      const fu = el('div', 'kv-furn', top);
      this._ref(fu, { kind: 'smith', i: 0, get: () => inv.smith[0], set: v => { inv.smith[0] = v; } });
      el('div', 'kv-arrow', fu).textContent = '+';
      this._ref(fu, { kind: 'smith', i: 1, get: () => inv.smith[1], set: v => { inv.smith[1] = v; } });
      el('div', 'kv-arrow', fu).textContent = '➜';
      this.outRef = this._ref(fu, { kind: 'sout', get: () => smithResult(inv.smith[0], inv.smith[1]), set: () => { } }, 'big');
      el('div', 'kv-hint', top).textContent = 'Lägg ett diamantverktyg eller en diamantrustningsdel och en surtståltacka här för att smida om det till surtstål.';
    } else if (mode === 'chest') {
      title.textContent = this.ctx.title || 'Kista';
      const c = this.ctx.c;
      const grid = el('div', 'kv-grid g9', main);
      for (let i = 0; i < c.length; i++) this._ref(grid, { kind: 'chest', i, get: () => c[i], set: v => { c[i] = v; } });
    }
    // spelarens inventarie
    if (mode !== 'creative') {
      el('div', 'kv-sub', main).textContent = 'Ryggsäck';
      const grid = el('div', 'kv-grid g9', main);
      for (let i = 9; i < 36; i++) this._ref(grid, { kind: 'inv', i, get: () => inv.slots[i], set: v => { inv.slots[i] = v; } });
    }
    const hb = el('div', 'kv-grid g9 kv-hbrow', main);
    for (let i = 0; i < 9; i++) this._ref(hb, { kind: 'inv', i, get: () => inv.slots[i], set: v => { inv.slots[i] = v; } });
    if (mode === 'creative') {
      const row = el('div', 'kv-crow', main);
      const tr = this._ref(row, { kind: 'trash', get: () => null, set: () => { } }, 'trash');
      tr.el.title = 'Släng';
      el('span', 'kv-hint', row).textContent = 'Klicka på ett block för att ta en stapel. Skift-klick lägger det direkt i snabbfältet. Släpp föremål i papperskorgen för att ta bort dem.';
    }
    if (isTouchDevice() && mode !== 'creative') el('div', 'kv-hint', main).textContent = 'Tryck för att ta eller lägga. Håll inne för att dela en stapel eller lägga en åt gången.';
    const close = el('button', 'btn small kv-close', main); close.textContent = isTouchDevice() ? 'Stäng' : 'Stäng (E)'; close.onclick = () => this.g.closeInventory();
    if (bookOk) this._buildBook(P);
  }
  _buildCreativeGrid() {
    const g = this.cgrid; g.innerHTML = '';
    this.refs = this.refs.filter(r => r.kind !== 'creative');
    const f = CREATIVE_TABS[this.creativeTab][1];
    for (const id of creativeList()) {
      if (!f(id)) continue;
      if (this.search && !itemName(id).toLowerCase().includes(this.search)) continue;
      const st = { id, n: maxStack(id), d: 0 };
      this._ref(g, { kind: 'creative', get: () => st, set: () => { } }, 'nocount');
    }
  }
  _ref(parent, ref, cls = '') {
    const s = this._slotEl(parent, cls);
    ref.el = s.el; ref.s = s;
    s.el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.pointerType === 'touch') {
        // pek: kort tryck = ta/lägg, håll inne = dela stapel / lägg en
        clearTimeout(this._lp);
        this._touch = { ref, fired: false };
        this._lp = setTimeout(() => { if (this._touch && this._touch.ref === ref) { this._touch.fired = true; this._click(ref, 1, false); if (navigator.vibrate) navigator.vibrate(15); } }, 380);
        return;
      }
      this._down = { ref, x: e.clientX, y: e.clientY }; this._click(ref, e.button === 2 ? 1 : 0, e.shiftKey);
    });
    s.el.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch' || !this._touch) return;
      clearTimeout(this._lp);
      const t = this._touch; this._touch = null;
      if (t.ref === ref && !t.fired) this._click(ref, 0, false);
    });
    s.el.addEventListener('pointercancel', () => { clearTimeout(this._lp); this._touch = null; });
    s.el.addEventListener('pointerenter', () => { this._hover = ref; this._showTip(); });
    s.el.addEventListener('pointerleave', () => { if (this._hover === ref) { this._hover = null; this._showTip(); } });
    s.el.addEventListener('contextmenu', e => e.preventDefault());
    this.refs.push(ref);
    return ref;
  }
  _onUp(e) {
    const d = this._down; this._down = null;
    if (!d || !this.mode) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    // dra och släpp: släpp på rutan under pekaren
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const slot = t && t.closest && t.closest('.kv-slot');
    const ref = slot && this.refs.find(r => r.el === slot);
    if (ref && ref !== d.ref && this.g.inv.cursor) this._click(ref, 0, false);
  }
  _showTip() {
    const r = this._hover;
    const st = r && r.get();
    if (!st || this.g.inv.cursor) { this.tip.style.display = 'none'; return; }
    let t = itemName(st.id);
    const tool = toolOf(st.id);
    if (tool) t += ` · ${tool.dur - (st.d || 0)}/${tool.dur}`;
    const fd = itemDef(st.id); if (fd && fd.food) t += ` · mat +${fd.food}`;
    const ad = armorOf(st.id); if (ad) t += ` · skydd +${ad.pts}`;
    if (fd && fd.desc) t += '\n' + fd.desc;
    this.tip.textContent = t; this.tip.style.display = 'block';
    this._moveCursor();
  }
  _moveCursor() {
    const c = this.cursorEl, st = this.g && this.g.inv && this.g.inv.cursor;
    if (!st || !this.mode) { c.style.display = 'none'; }
    else {
      c.style.display = 'block';
      c.style.transform = `translate(${this.mouse.x - 24}px, ${this.mouse.y - 24}px)`;
      if (c.dataset.k !== st.id + ':' + st.n) { c.dataset.k = st.id + ':' + st.n; c.innerHTML = `<img src="${this.icons[st.id]}" alt=""><span>${st.n > 1 ? st.n : ''}</span>`; }
    }
    if (this.tip.style.display === 'block') this.tip.style.transform = `translate(${this.mouse.x + 16}px, ${this.mouse.y + 14}px)`;
  }

  _craftOut() {
    if (this.mode !== 'inv' && this.mode !== 'bench') return null;
    const size = this.mode === 'bench' ? 3 : 2;
    const grid = this.g.inv.craft.slice(0, size * size);
    const r = findRecipe(grid, size);
    return r ? { id: r.out.id, n: r.out.n, d: 0 } : null;
  }
  _consumeCraft() {
    const size = this.mode === 'bench' ? 3 : 2;
    const c = this.g.inv.craft;
    for (let i = 0; i < size * size; i++) if (c[i]) { c[i].n--; if (c[i].n <= 0) c[i] = null; }
  }

  /** Klick på ruta. btn 0 = vänster, 1 = höger */
  _click(ref, btn, shift) {
    const inv = this.g.inv;
    const cur = inv.cursor;
    const st = ref.get();
    const g = this.g;
    if (ref.kind === 'trash') { if (cur) { inv.cursor = null; g.audio.play('click'); } this.refresh(); return; }
    if (ref.kind === 'creative') {
      if (shift) { const free = inv.slots.findIndex((s, i) => i < 9 && !s); inv.slots[free >= 0 ? free : inv.sel] = { id: st.id, n: st.n, d: 0 }; }
      else if (cur && cur.id === st.id) cur.n = Math.min(maxStack(cur.id), cur.n + (btn ? 1 : cur.n));
      else if (cur) inv.cursor = null;
      else inv.cursor = { id: st.id, n: btn ? 1 : st.n, d: 0 };
      g.audio.play('click', { vol: 0.5 }); inv.changed(); this.refresh(); return;
    }
    if (ref.kind === 'sout') {
      if (!st || cur) return;
      inv.cursor = { ...st }; inv.smith[0] = null;
      inv.smith[1].n--; if (inv.smith[1].n <= 0) inv.smith[1] = null;
      g.onSmith(st.id); inv.changed(); this.refresh(); return;
    }
    if (ref.kind === 'out' || ref.kind === 'fout') {
      if (!st) return;
      if (ref.kind === 'out') {
        if (shift) {
          // tillverka så många som möjligt
          let guard = 64;
          while (guard-- > 0) { const o = this._craftOut(); if (!o) break; const left = inv.add(o.id, o.n, 0); this._consumeCraft(); g.onCrafted(o.id, o.n); if (left > 0) { g.throwItem({ id: o.id, n: left, d: 0 }); break; } }
        } else {
          if (cur && (cur.id !== st.id || cur.n + st.n > maxStack(st.id))) return;
          if (cur) cur.n += st.n; else inv.cursor = { ...st };
          this._consumeCraft(); g.onCrafted(st.id, st.n);
        }
        g.audio.play('pickup', { vol: 0.5 });
      } else {
        if (shift) { const left = inv.add(st.id, st.n, 0); g.tally('s', st.id, st.n - left); if (left) st.n = left; else ref.set(null); }
        else {
          if (cur && (cur.id !== st.id || cur.n + st.n > maxStack(st.id))) return;
          if (cur) cur.n += st.n; else inv.cursor = { ...st };
          g.tally('s', st.id, st.n);
          ref.set(null);
        }
        g.audio.play('pickup', { vol: 0.5 });
      }
      inv.changed(); this.refresh(); return;
    }
    if (shift && st) {
      // snabbflytt
      let targets;
      if (ref.kind === 'inv') {
        if (this.mode === 'chest') targets = this.refs.filter(r => r.kind === 'chest');
        else if (this.mode === 'furnace') targets = smeltResult(st.id) ? this.refs.filter(r => r.kind === 'fin') : fuelOf(st.id) ? this.refs.filter(r => r.kind === 'ffuel') : null;
        if (!targets || !targets.length) targets = this.refs.filter(r => r.kind === 'inv' && (ref.i < 9 ? r.i >= 9 : r.i < 9));
      } else targets = this.refs.filter(r => r.kind === 'inv').sort((a, b) => b.i - a.i).reverse();
      let n = st.n;
      const ms = maxStack(st.id);
      for (const t of targets) { const ts = t.get(); if (ts && ts.id === st.id && ts.n < ms && !toolOf(st.id)) { const k = Math.min(ms - ts.n, n); ts.n += k; n -= k; } if (n <= 0) break; }
      for (const t of targets) { if (n <= 0) break; if (!t.get()) { const k = Math.min(ms, n); t.set({ id: st.id, n: k, d: st.d }); n -= k; } }
      if (n > 0) st.n = n; else ref.set(null);
      g.audio.play('click', { vol: 0.4 });
      inv.changed(); this.refresh(); return;
    }
    if (ref.accept && cur && !ref.accept(cur.id)) { g.audio.play('error', { vol: 0.4 }); return; }
    if (ref.accept && cur && cur.n > 1) return;
    if (btn === 0) {
      if (!cur) { if (st) { inv.cursor = st; ref.set(null); } }
      else if (!st) { ref.set(cur); inv.cursor = null; }
      else if (st.id === cur.id && !toolOf(st.id)) { const ms = maxStack(st.id); const k = Math.min(ms - st.n, cur.n); st.n += k; cur.n -= k; if (cur.n <= 0) inv.cursor = null; }
      else { ref.set(cur); inv.cursor = st; }
    } else {
      if (!cur) { if (st) { const h = Math.ceil(st.n / 2); inv.cursor = { id: st.id, n: h, d: st.d }; st.n -= h; if (st.n <= 0) ref.set(null); } }
      else if (!st) { ref.set({ id: cur.id, n: 1, d: cur.d }); cur.n--; if (cur.n <= 0) inv.cursor = null; }
      else if (st.id === cur.id && st.n < maxStack(st.id)) { st.n++; cur.n--; if (cur.n <= 0) inv.cursor = null; }
    }
    g.audio.play('click', { vol: 0.35 });
    inv.changed();
    this.refresh();
  }
  _dropCursor(one) {
    const inv = this.g.inv; const c = inv.cursor; if (!c) return;
    if (one) { this.g.throwItem({ id: c.id, n: 1, d: c.d }); c.n--; if (c.n <= 0) inv.cursor = null; }
    else { this.g.throwItem(c); inv.cursor = null; }
    this.refresh();
  }
  refresh() {
    if (!this.mode) return;
    for (const r of this.refs) this._fill(r.s, r.get());
    if (this.outRef) this.outRef.el.classList.toggle('ready', !!this.outRef.get());
    if (this.mode === 'furnace' && this.ctx) {
      const f = this.ctx.f;
      this.flame.style.setProperty('--f', f.burnMax ? Math.max(0, f.burn / f.burnMax) : 0);
      this.prog.firstChild.style.width = Math.round(f.prog / SMELT_TIME * 100) + '%';
    }
    if (this.bookList) this._refreshBook();
    if (this.tradeRows) {
      const inv = this.g.inv;
      this.emeraldLine.textContent = 'Du har ' + inv.count(I.emerald) + ' smaragder. Bybor betalar med smaragder och tar smaragder som betalning.';
      for (const t of this.tradeRows) { const ok = t.o.give.every(([id, n]) => inv.count(id) >= n); t.row.classList.toggle('can', ok); t.btn.disabled = !ok; }
    }
    this._moveCursor(); this._showTip();
    this.updateHotbar();
  }

  /* ---------- receptbok ---------- */
  _buildBook(P) {
    const b = el('div', 'kv-book', P);
    const hd = el('div', 'kv-bookhd', b);
    el('div', 'kv-invtitle', hd).textContent = 'Receptbok';
    const cb = el('button', 'btn small', hd); cb.textContent = 'Stäng'; cb.onclick = () => { this.showBook = false; this.build(); this.refresh(); };
    el('div', 'kv-hint', b).textContent = this.mode === 'bench' ? 'Klicka på ett recept för att lägga i ingredienserna.' : 'Gröna recept kan göras nu. 3×3-recept kräver en arbetsbänk.';
    const list = el('div', 'kv-booklist', b);
    this.bookList = [];
    const seen = new Set();
    let cat = null;
    const order = []; for (const r of RECIPES) if (!order.includes(r.cat)) order.push(r.cat);
    const sorted = RECIPES.slice().sort((x, y) => order.indexOf(x.cat) - order.indexOf(y.cat));
    for (const r of sorted) {
      const k = r.out + ':' + JSON.stringify(r.shape || r.shapeless);
      if (seen.has(k)) continue; seen.add(k);
      if (r.cat !== cat) { cat = r.cat; el('div', 'kv-bookcat', list).textContent = cat; }
      const row = el('div', 'kv-recipe', list);
      const im = el('img', '', row); im.src = this.icons[r.out]; im.alt = '';
      const tx = el('div', 'kv-rtext', row);
      el('b', '', tx).textContent = itemName(r.out) + (r.n > 1 ? ' ×' + r.n : '');
      const ing = ingredients(r);
      el('span', '', tx).textContent = ing.map(x => `${x.n}× ${wantName(x.want)}`).join(', ');
      const big = (r.shape && (r.shape.length > 2 || r.shape.some(s => s.length > 2))) || (r.shapeless && r.shapeless.length > 4);
      if (big) el('em', '', tx).textContent = 'Arbetsbänk';
      row.onclick = () => this._fillRecipe(r, big);
      this.bookList.push({ row, r, ing, big });
    }
  }
  _refreshBook() {
    const inv = this.g.inv;
    for (const b of this.bookList) {
      const has = b.ing.every(x => inv.count(x.want) + this._craftCount(x.want) >= x.n);
      b.row.classList.toggle('can', has && (!b.big || this.mode === 'bench'));
      b.row.classList.toggle('need', has && b.big && this.mode !== 'bench');
    }
  }
  _craftCount(want) { let c = 0; for (const s of this.g.inv.craft) if (s && (s.id === want || (TAGS[want] && TAGS[want].includes(s.id)))) c += s.n; return c; }
  _fillRecipe(r, big) {
    const g = this.g, inv = g.inv;
    if (big && this.mode !== 'bench') { g.toast('Det här receptet kräver en arbetsbänk.'); g.audio.play('error'); return; }
    const size = this.mode === 'bench' ? 3 : 2;
    // töm rutnätet
    for (let i = 0; i < 9; i++) if (inv.craft[i]) { const s = inv.craft[i]; inv.craft[i] = null; this._giveBack(s); }
    const ing = ingredients(r);
    if (!ing.every(x => inv.count(x.want) >= x.n)) { g.toast('Du saknar ingredienser.'); g.audio.play('error'); this.refresh(); return; }
    if (r.shapeless) { r.shapeless.forEach((w, i) => { const got = inv.take(w, 1); inv.craft[i] = { id: got[0], n: 1, d: 0 }; }); }
    else r.shape.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === ' ') continue; const got = inv.take(r.key[ch], 1); inv.craft[y * size + x] = { id: got[0], n: 1, d: 0 }; } });
    g.audio.play('click');
    if (innerWidth <= 760 || innerHeight <= 520) { this.showBook = false; this.build(); }
    inv.changed(); this.refresh();
  }
}
