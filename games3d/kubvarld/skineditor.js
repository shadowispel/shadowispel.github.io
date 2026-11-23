/** "Min figur": pixelritare för figurens utseende med roterbar 3D-förhandsvisning. Fungerar med mus och pek. */
import * as THREE from 'three';
import {
  SKIN_W, SKIN_H, PARTS, PART_KEYS, FACES, FACE_NAMES, TEXEL_PART, TEXEL_FACE, MIRROR, USED, faceRect,
  PRESETS, presetSkin, randomSkin, cloneSkin, loadSkin, saveSkin, encodeSkin, decodeSkin, buildSkinModel, newSkin
} from './skin.js';
import { toast } from '../../engine/kit.js';

const BASE_COLORS = ['#ffffff', '#c8ccd2', '#7a8088', '#3a3c42', '#111111', '#f2d0b0', '#e0b090', '#c8906a', '#8a5a3a', '#5a3a26',
  '#e2c06a', '#f2c230', '#e0a030', '#e86a2a', '#b8302e', '#e86aa0', '#6a3a8a', '#2d4f8e', '#5aa8e8', '#2a8a8a', '#3a7a3a', '#8ac850'];
const TOOLS = [
  ['pen', 'Penna', '✏️', 'P'], ['brush', 'Pensel', '🖌️', 'B'], ['fill', 'Fyll', '🪣', 'G'], ['pick', 'Pipett', '💧', 'I'], ['erase', 'Sudd', '🧽', 'E']
];
const RECENT_KEY = 'kubvarld:skinColors';
const $ = id => document.getElementById(id);
const el = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); if (txt != null) e.textContent = txt; return e; };
const hex2 = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

export class SkinEditor {
  constructor(screenId) {
    this.scr = $(screenId);
    this.open = false;
  }
  show({ onClose, onSave }) {
    this.onClose = onClose; this.onSave = onSave;
    this.skin = cloneSkin(loadSkin());
    this.undo = []; this.redo = [];
    this.tool = 'pen'; this.size = 3; this.mirror = false; this.color = '#2d4f8e';
    this.recent = (window.Spelhallen && window.Spelhallen.store.get(RECENT_KEY, null)) || ['#2d4f8e', '#b8302e', '#e0b090', '#e2c06a', '#3a3c4c'];
    this.dirty = false;
    this._build();
    this.open = true;
    this.scr.classList.remove('hidden');
    this._resize();
    this._startPreview();
    this._draw();
  }
  close(save) {
    if (save) {
      const code = saveSkin(this.skin);
      toast('Figuren sparad! (' + code.length + ' tecken)');
      if (this.onSave) this.onSave(cloneSkin(this.skin));
    }
    this.open = false;
    this.scr.classList.add('hidden');
    this._stopPreview();
    removeEventListener('resize', this._onResize); removeEventListener('keydown', this._onKey); if (this._onKeyUp) removeEventListener('keyup', this._onKeyUp);
    if (this.onClose) this.onClose();
  }

  /* ---------- gränssnitt ---------- */
  _build() {
    const S = this.scr; S.innerHTML = '';
    const panel = el('div', 'g3-panel wide kv-skpanel', S);
    const hd = el('div', 'kv-skhd', panel);
    el('h2', 'g3-h2', hd, 'Min figur');
    el('p', 'kv-hint', hd, 'Rita din figur pixel för pixel. Mallen visar varje del utvecklad: topp, sidor, fram och bak. Dra i förhandsvisningen för att vrida figuren.');
    const body = el('div', 'kv-sk', panel);
    // verktyg
    const tools = el('div', 'kv-sktools', body);
    this.toolBtns = {};
    for (const [id, name, ic, key] of TOOLS) {
      const b = el('button', 'kv-sktool', tools); b.innerHTML = `<span>${ic}</span><small>${name}</small>`; b.title = name + ' (' + key + ')';
      b.onclick = () => this._setTool(id); this.toolBtns[id] = b;
    }
    const sz = el('label', 'kv-sksize', tools); el('small', '', sz, 'Storlek');
    const range = el('input', '', sz); range.type = 'range'; range.min = 2; range.max = 6; range.value = this.size;
    const szv = el('b', '', sz, String(this.size));
    range.oninput = () => { this.size = +range.value; szv.textContent = range.value; if (this.tool === 'pen') this._setTool('brush'); };
    this.mirrorBtn = el('button', 'kv-sktool', tools); this.mirrorBtn.innerHTML = '<span>🪞</span><small>Spegel</small>'; this.mirrorBtn.title = 'Spegelritning: rita vänster och höger samtidigt (M)';
    this.mirrorBtn.onclick = () => { this.mirror = !this.mirror; this.mirrorBtn.classList.toggle('on', this.mirror); };
    const ub = el('button', 'kv-sktool', tools); ub.innerHTML = '<span>↶</span><small>Ångra</small>'; ub.title = 'Ångra (Ctrl+Z)'; ub.onclick = () => this._undo();
    const rb = el('button', 'kv-sktool', tools); rb.innerHTML = '<span>↷</span><small>Gör om</small>'; rb.title = 'Gör om (Ctrl+Y)'; rb.onclick = () => this._redo();
    const cb = el('button', 'kv-sktool', tools); cb.innerHTML = '<span>🗑️</span><small>Rensa</small>'; cb.title = 'Rensa hela mallen';
    cb.onclick = () => { this._push(); this.skin = newSkin(); this._changed(); };
    this.undoBtn = ub; this.redoBtn = rb;
    // mallen
    const mid = el('div', 'kv-skmid', body);
    this.wrap = el('div', 'kv-skwrap', mid);
    this.cv = el('canvas', 'kv-skcanvas', this.wrap);
    const zr = el('div', 'kv-skzoom', mid);
    const zb = (t, title, fn) => { const b = el('button', 'btn small', zr, t); b.title = title; b.onclick = fn; return b; };
    zb('−', 'Zooma ut (−)', () => this._zoomBy(1 / 1.5));
    this.zoomLbl = el('span', 'kv-skzl', zr, '100 %');
    zb('+', 'Zooma in (+)', () => this._zoomBy(1.5));
    zb('Anpassa', 'Visa hela mallen (0)', () => this._zoomReset());
    el('small', 'kv-skzhint', zr, 'Mushjul/nyp = zooma · mellanslag+dra, högerklick-dra (inzoomat) eller två fingrar = flytta');
    this.status = el('div', 'kv-skstatus', mid, 'Peka på mallen för att se vilken del det är.');
    // sidopanel
    const side = el('div', 'kv-skside', body);
    this.pv = el('canvas', 'kv-skpreview', side);
    const vr = el('div', 'kv-skrow', side);
    [['Fram', 0], ['Sida', Math.PI / 2], ['Bak', Math.PI]].forEach(([n, a]) => { const b = el('button', 'btn small', vr, n); b.onclick = () => { this.rotY = a; this.rotX = 0.15; this.auto = false; }; });
    const cr = el('div', 'kv-skcolor', side);
    this.colorIn = el('input', '', cr); this.colorIn.type = 'color'; this.colorIn.value = this.color; this.colorIn.title = 'Välj färg';
    this.colorIn.oninput = () => this._setColor(this.colorIn.value, false);
    this.colorIn.onchange = () => this._setColor(this.colorIn.value, true);
    this.swatch = el('div', 'kv-skcur', cr); el('small', '', cr, 'Färg');
    el('div', 'kv-sklabel', side, 'Senaste färger');
    this.recentEl = el('div', 'kv-skpal', side);
    el('div', 'kv-sklabel', side, 'Palett');
    const pal = el('div', 'kv-skpal', side);
    for (const c of BASE_COLORS) { const b = el('button', 'kv-sw', pal); b.style.background = c; b.title = c; b.onclick = () => this._setColor(c, true); }
    el('div', 'kv-sklabel', side, 'Färdiga figurer');
    const pr = el('div', 'kv-skpresets', side);
    for (const p of PRESETS) { const b = el('button', 'btn small', pr, p.name); b.onclick = () => { this._push(); this.skin = presetSkin(p.id); this._changed(); }; }
    const rnd = el('button', 'btn small primary', pr, '🎲 Slumpa'); rnd.onclick = () => { this._push(); this.skin = randomSkin(); this._changed(); };
    const io = el('div', 'kv-skpresets', side);
    const cp = el('button', 'btn small', io, 'Kopiera kod'); cp.title = 'Figuren som kompakt text – för att dela den';
    cp.onclick = async () => { const code = encodeSkin(this.skin); try { await navigator.clipboard.writeText(code); toast('Koden kopierades (' + code.length + ' tecken).'); } catch (e) { prompt('Figurens kod:', code); } };
    const im = el('button', 'btn small', io, 'Klistra in kod');
    im.onclick = () => { const t = prompt('Klistra in en figurkod (börjar med kv1:)'); if (!t) return; const s = decodeSkin(t.trim()); if (!s) { toast('Koden gick inte att läsa.'); return; } this._push(); this.skin = s; this._changed(); };
    // knappar
    const row = el('div', 'g3-row kv-skbtns', panel);
    const save = el('button', 'btn primary', row, 'Spara figuren'); save.onclick = () => this.close(true);
    const cancel = el('button', 'btn', row, 'Avbryt'); cancel.onclick = () => this.close(false);
    this._setTool(this.tool); this._setColor(this.color, false); this._renderRecent();
    // händelser
    this.z = 1; this.ox = 0; this.oy = 0; this.ptrs = new Map(); this.space = false;
    this.cv.addEventListener('pointerdown', e => this._down(e));
    this.cv.addEventListener('pointermove', e => this._move(e));
    this.cv.addEventListener('pointerup', e => this._up(e));
    this.cv.addEventListener('pointercancel', e => this._up(e));
    this.cv.addEventListener('wheel', e => { e.preventDefault(); const r = this.cv.getBoundingClientRect(); this._zoomAt(this.z * Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 30 : 1)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    this._onKeyUp = e => { if (e.code === 'Space') { this.space = false; this.cv.style.cursor = ''; } };
    addEventListener('keyup', this._onKeyUp);
    this.cv.addEventListener('pointerleave', () => { this.hover = null; this._draw(); });
    this.cv.addEventListener('contextmenu', e => e.preventDefault());
    this.pv.addEventListener('pointerdown', e => { this.pv.setPointerCapture(e.pointerId); this._rot = { x: e.clientX, y: e.clientY, ry: this.rotY, rx: this.rotX }; this.auto = false; });
    this.pv.addEventListener('pointermove', e => { if (!this._rot) return; this.rotY = this._rot.ry + (e.clientX - this._rot.x) * 0.012; this.rotX = Math.max(-0.9, Math.min(0.9, this._rot.rx + (e.clientY - this._rot.y) * 0.008)); });
    this.pv.addEventListener('pointerup', () => { this._rot = null; });
    this.pv.addEventListener('pointercancel', () => { this._rot = null; });
    this._onResize = () => this._resize();
    this._onKey = e => this._key(e);
    addEventListener('resize', this._onResize); addEventListener('keydown', this._onKey);
  }
  _key(e) {
    if (!this.open || e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) this._redo(); else this._undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this._redo(); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.close(false); return; }
    if (e.code === 'Space') { e.preventDefault(); this.space = true; this.cv.style.cursor = 'grab'; return; }
    if (e.key === '+' || e.key === '=') { this._zoomBy(1.5); return; }
    if (e.key === '-') { this._zoomBy(1 / 1.5); return; }
    if (e.key === '0') { this._zoomReset(); return; }
    const t = TOOLS.find(x => x[3].toLowerCase() === k); if (t) this._setTool(t[0]);
    if (k === 'm') this.mirrorBtn.click();
  }
  _setTool(t) { this.tool = t; for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', k === t); this._draw(); }
  _setColor(c, remember) {
    this.color = c; this.colorIn.value = c; this.swatch.style.background = c;
    if (remember) { this.recent = [c, ...this.recent.filter(x => x !== c)].slice(0, 12); this._renderRecent(); if (window.Spelhallen) window.Spelhallen.store.set(RECENT_KEY, this.recent); }
  }
  _renderRecent() {
    this.recentEl.innerHTML = '';
    for (const c of this.recent) { const b = el('button', 'kv-sw', this.recentEl); b.style.background = c; b.title = c; b.onclick = () => this._setColor(c, true); }
  }
  _resize() {
    const r = this.wrap.getBoundingClientRect();
    const availW = Math.max(200, r.width), availH = Math.max(150, Math.min(innerHeight * 0.62, 520));
    this.cell = Math.max(3, Math.floor(Math.min(availW / SKIN_W, availH / SKIN_H)));
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = SKIN_W * this.cell * dpr; this.cv.height = SKIN_H * this.cell * dpr;
    this.cv.style.width = SKIN_W * this.cell + 'px'; this.cv.style.height = SKIN_H * this.cell + 'px';
    this.dpr = dpr;
    const pw = Math.max(140, Math.min(260, this.pv.parentElement.getBoundingClientRect().width || 220));
    this.pv.style.width = pw + 'px'; this.pv.style.height = Math.round(pw * 1.15) + 'px';
    if (this.r3) { this.r3.setSize(pw, Math.round(pw * 1.15), false); this.cam.aspect = 1 / 1.15; this.cam.updateProjectionMatrix(); }
    this._draw();
  }

  /* ---------- ritning ---------- */
  /* ---------- zoom och panorering ---------- */
  _clampView() {
    this.z = Math.max(1, Math.min(12, this.z));
    this.ox = Math.max(0, Math.min(SKIN_W - SKIN_W / this.z, this.ox)); this.oy = Math.max(0, Math.min(SKIN_H - SKIN_H / this.z, this.oy));
    if (this.zoomLbl) this.zoomLbl.textContent = Math.round(this.z * 100) + ' %';
  }
  /** Zooma så att punkten (sx, sy) i canvasens css-pixlar ligger kvar under pekaren */
  _zoomAt(nz, sx, sy) {
    const r = this.cv.getBoundingClientRect(); if (!r.width) return;
    const tx = this.ox + sx / r.width * SKIN_W / this.z, ty = this.oy + sy / r.height * SKIN_H / this.z;
    this.z = Math.max(1, Math.min(12, nz));
    this.ox = tx - sx / r.width * SKIN_W / this.z; this.oy = ty - sy / r.height * SKIN_H / this.z;
    this._clampView(); this._draw();
  }
  _zoomBy(f) { const r = this.cv.getBoundingClientRect(); this._zoomAt(this.z * f, r.width / 2, r.height / 2); }
  _zoomReset() { this.z = 1; this.ox = 0; this.oy = 0; this._clampView(); this._draw(); }
  _panBy(dx, dy) { const r = this.cv.getBoundingClientRect(); this.ox -= dx / r.width * SKIN_W / this.z; this.oy -= dy / r.height * SKIN_H / this.z; this._clampView(); this._draw(); }
  _texel(e) {
    const r = this.cv.getBoundingClientRect();
    const x = Math.floor(this.ox + (e.clientX - r.left) / r.width * SKIN_W / this.z), y = Math.floor(this.oy + (e.clientY - r.top) / r.height * SKIN_H / this.z);
    if (x < 0 || y < 0 || x >= SKIN_W || y >= SKIN_H) return null;
    return [x, y];
  }
  _down(e) {
    e.preventDefault(); try { this.cv.setPointerCapture(e.pointerId); } catch (er) { /* syntetisk pekare */ }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) {
      // två fingrar: nyp för zoom och dra för att flytta (avbryt ett påbörjat penseldrag)
      if (this.stroke) { this.stroke = null; if (this.undo.length) { this.skin.px = this.undo.pop(); this._changed(true); } }
      const [a, b] = [...this.ptrs.values()], r = this.cv.getBoundingClientRect();
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.z, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
      return;
    }
    if (this.ptrs.size > 2) return;
    if (e.button === 1 || this.space || (e.button === 2 && this.z > 1.01)) { this.pan = { x: e.clientX, y: e.clientY }; this.cv.style.cursor = 'grabbing'; return; }
    const t = this._texel(e); if (!t) return;
    const erase = e.button === 2;
    if (this.tool === 'pick') { this._pick(t); return; }
    if (this.tool === 'fill' && TEXEL_PART[t[1] * SKIN_W + t[0]] < 0 && !(this.mirror && MIRROR[t[1] * SKIN_W + t[0]] >= 0)) return;
    this._push();
    if (this.tool === 'fill') { this._fill(t, erase); this._changed(); return; }
    this.stroke = { last: t, erase };
    this._paintAt(t, erase); this._changed(true);
  }
  _move(e) {
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()], r = this.cv.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      this._zoomAt(this.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d, this.pinch.mx, this.pinch.my);
      this._panBy(mx - this.pinch.mx, my - this.pinch.my); this.pinch.mx = mx; this.pinch.my = my;
      return;
    }
    if (this.pan) { this._panBy(e.clientX - this.pan.x, e.clientY - this.pan.y); this.pan.x = e.clientX; this.pan.y = e.clientY; return; }
    const t = this._texel(e);
    this.hover = t;
    if (t) {
      const i = t[1] * SKIN_W + t[0], pi = TEXEL_PART[i];
      if (pi >= 0) { const p = PARTS[PART_KEYS[pi]], f = FACES[TEXEL_FACE[i]], [fx, fy] = faceRect(p, f); this.status.textContent = `${p.name} · ${FACE_NAMES[f]} (${t[0] - fx + 1}, ${t[1] - fy + 1})`; }
      else this.status.textContent = 'Utanför figuren';
    }
    if (this.stroke && t) {
      // fyll i mellan punkterna så att snabba drag blir hela linjer
      const [x0, y0] = this.stroke.last, [x1, y1] = t, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 1; k <= n; k++) this._paintAt([Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n)], this.stroke.erase);
      this.stroke.last = t; this._changed(true);
    } else this._draw();
  }
  _up(e) {
    if (e && this.ptrs) this.ptrs.delete(e.pointerId);
    if (this.pinch) { if (this.ptrs.size < 2) this.pinch = null; return; }
    if (this.pan) { this.pan = null; this.cv.style.cursor = this.space ? 'grab' : ''; return; }
    if (this.stroke) { this.stroke = null; if (this.tool !== 'erase') this._setColor(this.color, true); this._changed(); } }
  _rgb() { const n = parseInt(this.color.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  _set(i, c) {
    if (TEXEL_PART[i] < 0) return;
    const o = i * 4, px = this.skin.px;
    if (!c) { px[o + 3] = 0; return; }
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  }
  _paintAt([x, y], erase) {
    const c = (erase || this.tool === 'erase') ? null : this._rgb();
    const n = this.tool === 'pen' ? 1 : this.size, h = Math.floor((n - 1) / 2);
    for (let dy = -h; dy < n - h; dy++) for (let dx = -h; dx < n - h; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= SKIN_W || yy >= SKIN_H) continue;
      const i = yy * SKIN_W + xx; this._set(i, c);
      if (this.mirror && MIRROR[i] >= 0) this._set(MIRROR[i], c);
    }
  }
  _fill([x, y], erase) {
    const start = y * SKIN_W + x; if (TEXEL_PART[start] < 0) return;
    const fillOne = (s0) => {
      const px = this.skin.px, part = TEXEL_PART[s0];
      // liten tolerans så att lätt skuggade ytor fylls som en helhet
      const o0 = s0 * 4, a0 = px[o0 + 3] >= 128, r0 = px[o0], g0 = px[o0 + 1], b0 = px[o0 + 2];
      const same = i => { const o = i * 4; if ((px[o + 3] >= 128) !== a0) return false; return !a0 || Math.abs(px[o] - r0) + Math.abs(px[o + 1] - g0) + Math.abs(px[o + 2] - b0) <= 36; };
      const c = erase ? null : this._rgb();
      if (c && a0 && c[0] === r0 && c[1] === g0 && c[2] === b0) return;
      if (!c && !a0) return;
      const seen = new Uint8Array(SKIN_W * SKIN_H), q = [s0]; seen[s0] = 1;
      const hits = [];
      while (q.length) {
        const i = q.pop(); hits.push(i);
        const ix = i % SKIN_W, iy = (i / SKIN_W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = ix + dx, ny = iy + dy; if (nx < 0 || ny < 0 || nx >= SKIN_W || ny >= SKIN_H) continue;
          const j = ny * SKIN_W + nx; if (seen[j] || TEXEL_PART[j] !== part || !same(j)) continue;
          seen[j] = 1; q.push(j);
        }
      }
      for (const i of hits) this._set(i, c);
    };
    fillOne(start);
    if (this.mirror && MIRROR[start] >= 0 && MIRROR[start] !== start) fillOne(MIRROR[start]);
  }
  _pick([x, y]) {
    const i = y * SKIN_W + x, o = i * 4, px = this.skin.px; if (TEXEL_PART[i] < 0 || px[o + 3] < 128) return;
    this._setColor(hex2([px[o], px[o + 1], px[o + 2]]), true);
    this._setTool(this._lastPaint || 'pen');
  }
  _push() { this.undo.push(new Uint8ClampedArray(this.skin.px)); if (this.undo.length > 60) this.undo.shift(); this.redo.length = 0; if (this.tool !== 'pick') this._lastPaint = this.tool === 'fill' || this.tool === 'erase' ? this._lastPaint : this.tool; }
  _undo() { if (!this.undo.length) return; this.redo.push(new Uint8ClampedArray(this.skin.px)); this.skin.px = this.undo.pop(); this._changed(); }
  _redo() { if (!this.redo.length) return; this.undo.push(new Uint8ClampedArray(this.skin.px)); this.skin.px = this.redo.pop(); this._changed(); }
  _changed(quick) {
    this.dirty = true;
    if (this.model) this.model.setSkin(this.skin);
    this.undoBtn.disabled = !this.undo.length; this.redoBtn.disabled = !this.redo.length;
    this._draw();
  }
  _draw() {
    if (!this.cv || !this.cell) return;
    const ctx = this.cv.getContext('2d'), c = this.cell * this.dpr * (this.z || 1), px = this.skin.px;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.fillStyle = 'rgba(8,12,24,.55)'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(1, 0, 0, 1, -Math.round((this.ox || 0) * c), -Math.round((this.oy || 0) * c));
    // delarnas ytor: rutigt underlag (genomskinligt) + pixlar
    for (const i of USED) {
      const x = i % SKIN_W, y = (i / SKIN_W) | 0, o = i * 4;
      if (px[o + 3] < 128) { ctx.fillStyle = (x + y) & 1 ? '#5a5e68' : '#474b54'; }
      else ctx.fillStyle = `rgb(${px[o]},${px[o + 1]},${px[o + 2]})`;
      ctx.fillRect(x * c, y * c, c, c);
    }
    // rutnät
    if (this.cell * (this.z || 1) >= 6) {
      ctx.strokeStyle = (this.z || 1) >= 2.5 ? 'rgba(0,0,0,.42)' : 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const k of PART_KEYS) for (const f of FACES) {
        const [x0, y0, w, h] = faceRect(PARTS[k], f);
        for (let u = 1; u < w; u++) { ctx.moveTo((x0 + u) * c + 0.5, y0 * c); ctx.lineTo((x0 + u) * c + 0.5, (y0 + h) * c); }
        for (let v = 1; v < h; v++) { ctx.moveTo(x0 * c, (y0 + v) * c + 0.5); ctx.lineTo((x0 + w) * c, (y0 + v) * c + 0.5); }
      }
      ctx.stroke();
    }
    // ytornas kanter och framsidornas etiketter
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, this.dpr);
    for (const k of PART_KEYS) for (const f of FACES) { const [x0, y0, w, h] = faceRect(PARTS[k], f); ctx.strokeRect(x0 * c + 0.5, y0 * c + 0.5, w * c - 1, h * c - 1); }
    ctx.font = `700 ${Math.max(9, Math.round(c * 1.1))}px Rubik, system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textBaseline = 'top';
    for (const k of PART_KEYS) { const p = PARTS[k]; ctx.fillText(p.name, p.ox * c + 3, p.oy * c + 2); }
    // pekarens fotavtryck
    if (this.hover) {
      const [x, y] = this.hover, n = (this.tool === 'brush' || this.tool === 'erase') ? this.size : 1, h = Math.floor((n - 1) / 2);
      ctx.strokeStyle = '#ffd85c'; ctx.lineWidth = 2 * this.dpr; ctx.strokeRect((x - h) * c, (y - h) * c, n * c, n * c);
      if (this.mirror) { const m = MIRROR[y * SKIN_W + x]; if (m >= 0) { ctx.strokeStyle = 'rgba(127,224,200,.9)'; ctx.strokeRect((m % SKIN_W - h) * c, (((m / SKIN_W) | 0) - h) * c, n * c, n * c); } }
    }
  }

  /* ---------- 3D-förhandsvisning ---------- */
  _startPreview() {
    const pw = parseInt(this.pv.style.width) || 220, ph = parseInt(this.pv.style.height) || 250;
    try { this.r3 = new THREE.WebGLRenderer({ canvas: this.pv, antialias: true, alpha: true }); }
    catch (e) { this.r3 = null; return; }
    this.r3.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.r3.setSize(pw, ph, false);
    this.r3.outputColorSpace = THREE.SRGBColorSpace;
    this.sc = new THREE.Scene();
    this.sc.add(new THREE.AmbientLight(0xffffff, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(0.6, 1, 1.2); this.sc.add(d);
    const d2 = new THREE.DirectionalLight(0xbfd8ff, 0.6); d2.position.set(-1, 0.4, -1); this.sc.add(d2);
    this.cam = new THREE.PerspectiveCamera(32, pw / ph, 0.1, 20); this.cam.position.set(0, 1.0, 4.2); this.cam.lookAt(0, 0.92, 0);
    this.model = buildSkinModel(this.skin); this.sc.add(this.model.root);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.06, 32), new THREE.MeshLambertMaterial({ color: 0x2a3a4a })); base.position.y = -0.03; this.sc.add(base); this.base = base;
    this.rotY = 0.5; this.rotX = 0.12; this.auto = true; this.t = 0;
    const loop = () => {
      if (!this.open) return;
      this._raf = requestAnimationFrame(loop);
      this.t += 1 / 60;
      if (this.auto) this.rotY += 0.006;
      const r = this.model.root; r.rotation.set(0, this.rotY, 0);
      this.sc.rotation.x = this.rotX;
      const P = this.model.parts, sw = Math.sin(this.t * 2.2) * 0.25;
      P.armR.rotation.x = sw; P.armL.rotation.x = -sw; P.legR.rotation.x = -sw * 0.6; P.legL.rotation.x = sw * 0.6; P.head.rotation.y = Math.sin(this.t * 0.9) * 0.25;
      this.r3.render(this.sc, this.cam);
    };
    loop();
  }
  _stopPreview() {
    cancelAnimationFrame(this._raf);
    if (this.model) { this.model.dispose(); this.model = null; }
    if (this.base) { this.base.geometry.dispose(); this.base.material.dispose(); this.base = null; }
    if (this.r3) { this.r3.dispose(); this.r3.forceContextLoss && this.r3.forceContextLoss(); this.r3 = null; }
  }
}
