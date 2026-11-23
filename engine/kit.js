/**
 * Spelhallen 3D-kit – gemensam grund för alla 3D-spel.
 *
 * Används som ES-modul:  import { … } from '../../engine/kit.js';
 * Kräver import map med "three" och "three/addons/" (se README i engine/).
 *
 * Innehåll:
 *   Settings       – sparade inställningar (grafik, mus, ljud …) + händelser vid ändring
 *   QUALITY        – grafikförinställningar (low/medium/high/ultra)
 *   createRenderer – WebGLRenderer med storlekshantering, skuggor och kvalitet
 *   Loop           – spelloop med fast tidssteg, paus, FPS-mätare
 *   Input          – tangentbord, mus (pointer lock), handkontroll, pekskärm
 *   Audio          – syntetiserade ljudeffekter, loopande ljud (motor, vind) och generativ musik
 *   UI             – laddskärm, toast-meddelanden, inställningspanel, skärmbyten
 *   kv             – IndexedDB-lagring för stora sparfiler (t.ex. världar)
 */
import * as THREE from 'three';

const SH = () => window.Spelhallen || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isTouchDevice = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* =====================================================================
 * Inställningar
 * ===================================================================== */
export const QUALITY = {
  low:    { label: 'Låg',   pixelRatio: 0.75, shadows: false, shadowSize: 512,  antialias: false, view: 0.6 },
  medium: { label: 'Medel', pixelRatio: 1,    shadows: true,  shadowSize: 1024, antialias: false, view: 0.8 },
  high:   { label: 'Hög',   pixelRatio: 1.5,  shadows: true,  shadowSize: 2048, antialias: true,  view: 1.0 },
  ultra:  { label: 'Ultra', pixelRatio: 2,    shadows: true,  shadowSize: 4096, antialias: true,  view: 1.35 }
};

function guessQuality() {
  if (isTouchDevice()) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}

const GLOBAL_DEFAULTS = {
  quality: null,        // fylls med guessQuality()
  sensitivity: 1.0,     // musens känslighet 0.2–3
  invertY: false,
  fov: 75,
  master: 0.8,
  sfx: 1.0,
  music: 0.5,
  showFps: false,
  touchControls: 'auto' // auto | on | off
};

export class Settings extends EventTarget {
  /**
   * @param {string} gameId
   * @param {object} gameDefaults – spelspecifika inställningar (sparas separat per spel)
   */
  constructor(gameId, gameDefaults = {}) {
    super();
    this.gameId = gameId;
    const store = SH() ? SH().store : { get: (k, d) => d, set() {} };
    this._store = store;
    const g = Object.assign({}, GLOBAL_DEFAULTS, store.get('settings3d', {}));
    if (!g.quality || !QUALITY[g.quality]) g.quality = guessQuality();
    this._global = g;
    this._game = Object.assign({}, gameDefaults, store.get('settings3d:' + gameId, {}));
    this._gameKeys = new Set(Object.keys(gameDefaults));
  }
  get(key) { return this._gameKeys.has(key) ? this._game[key] : this._global[key]; }
  set(key, value) {
    if (this._gameKeys.has(key)) { this._game[key] = value; this._store.set('settings3d:' + this.gameId, this._game); }
    else { this._global[key] = value; this._store.set('settings3d', this._global); }
    this.dispatchEvent(new CustomEvent('change', { detail: { key, value } }));
  }
  get q() { return QUALITY[this.get('quality')] || QUALITY.medium; }
  onChange(fn) { this.addEventListener('change', e => fn(e.detail.key, e.detail.value)); }
}

/* =====================================================================
 * Renderare
 * ===================================================================== */
/**
 * Skapar en WebGLRenderer i `root` och håller den rätt storlek.
 * Returnerar { renderer, canvas, setCamera(cam), onResize(fn), size:{w,h} }.
 */
export function createRenderer(root, settings, opts = {}) {
  const q = settings.q;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance', alpha: false, ...opts });
  } catch (e) {
    showFatal(root, 'Din webbläsare eller grafikkort stöder inte WebGL, som behövs för 3D-spelen. Prova en annan webbläsare eller uppdatera grafikdrivrutinerna.');
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Spelyta');
  root.prepend(canvas);

  const size = { w: 1, h: 1 };
  let camera = null;
  const listeners = [];
  function applyPixelRatio() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.q.pixelRatio));
  }
  function resize() {
    const r = root.getBoundingClientRect();
    size.w = Math.max(1, Math.floor(r.width)); size.h = Math.max(1, Math.floor(r.height));
    applyPixelRatio();
    renderer.setSize(size.w, size.h, false);
    if (camera && camera.isPerspectiveCamera) { camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); }
    listeners.forEach(fn => fn(size.w, size.h));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  settings.onChange(key => {
    if (key === 'quality') {
      applyPixelRatio(); resize();
      const nq = settings.q;
      if (renderer.shadowMap.enabled !== nq.shadows) {
        renderer.shadowMap.enabled = nq.shadows;
        // material måste kompileras om när skuggor slås av/på
        renderer.shadowMap.needsUpdate = true;
        if (opts.scene) opts.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
      }
    }
  });

  return {
    renderer, canvas, size,
    setCamera(cam) { camera = cam; resize(); },
    onResize(fn) { listeners.push(fn); },
    resize
  };
}

function showFatal(root, text) {
  const d = document.createElement('div');
  d.className = 'g3-screen';
  d.innerHTML = `<div class="g3-panel"><h2 class="g3-h2">Det gick inte att starta spelet</h2><p class="g3-sub"></p><a class="btn primary" href="../../index.html">Till Spelhallen</a></div>`;
  d.querySelector('p').textContent = text;
  root.appendChild(d);
}

/* =====================================================================
 * Spelloop
 * ===================================================================== */
/**
 * new Loop({ update(dt), render(alpha, frameDt), step: 1/60 })
 * update körs med fast tidssteg; render en gång per bildruta.
 */
export class Loop {
  constructor({ update, render, step = 1 / 60, maxSteps = 6 }) {
    this.update = update; this.render = render; this.step = step; this.maxSteps = maxSteps;
    this.paused = false; this.running = false; this.timeScale = 1;
    this.acc = 0; this.last = 0; this.time = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsN = 0;
    this.fpsEl = null;
    this._tick = this._tick.bind(this);
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); requestAnimationFrame(this._tick); }
  stop() { this.running = false; }
  setPaused(p) { this.paused = !!p; this.last = performance.now(); }
  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (!(frameDt > 0)) frameDt = 0;
    frameDt = Math.min(frameDt, 0.1); // undvik jättehopp efter flikbyte
    this._fpsAcc += frameDt; this._fpsN++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0;
      if (this.fpsEl) this.fpsEl.textContent = this.fps + ' FPS';
    }
    if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      let n = 0;
      while (this.acc >= this.step && n < this.maxSteps) {
        this.update(this.step);
        this.time += this.step;
        this.acc -= this.step; n++;
      }
      if (n >= this.maxSteps) this.acc = 0;
    }
    this.render(this.paused ? 1 : this.acc / this.step, this.paused ? 0 : frameDt);
  }
}

/* =====================================================================
 * Indata
 * ===================================================================== */
const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

/**
 * Samlar all indata. Läs i update():
 *   input.down('KeyW')         – hålls nere
 *   input.pressed('Space')     – trycktes ned sedan förra endFrame()
 *   input.axis(['KeyA','ArrowLeft'], ['KeyD','ArrowRight']) → -1..1 (kombinerar handkontroll/pek-spak om bunden)
 *   input.look → { dx, dy } musrörelse/pekdrag sedan förra endFrame()
 *   input.mouseDown(0), input.mousePressed(0)
 * Anropa input.endFrame() sist i varje update-steg (eller efter render).
 */
export class Input {
  constructor(target, settings) {
    this.target = target;
    this.settings = settings;
    this.keys = new Set(); this._pressed = new Set(); this._released = new Set();
    this.buttons = new Set(); this._bPressed = new Set(); this._bReleased = new Set();
    this.look = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0 }; // pixel + normaliserade (-1..1, y uppåt)
    this.locked = false;
    this.enabled = true;
    this.virtual = {};           // pekknappar → kod
    this.sticks = {};            // namn → { x, y }
    this.gamepad = null;
    this._gpPrev = [];
    this._lockListeners = [];

    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (this.enabled && BLOCK_KEYS.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this._pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => { this.keys.delete(e.code); this._released.add(e.code); });
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });

    target.addEventListener('mousedown', e => {
      if (!this.buttons.has(e.button)) this._bPressed.add(e.button);
      this.buttons.add(e.button);
    });
    addEventListener('mouseup', e => { this.buttons.delete(e.button); this._bReleased.add(e.button); });
    target.addEventListener('contextmenu', e => e.preventDefault());
    target.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    addEventListener('mousemove', e => {
      const r = target.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
      this.mouse.nx = (this.mouse.x / r.width) * 2 - 1; this.mouse.ny = -(this.mouse.y / r.height) * 2 + 1;
      if (this.locked) {
        // filtrera bort orimliga hopp som vissa webbläsare skickar vid låsning
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
        this.look.dx += e.movementX; this.look.dy += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      if (!this.locked) this.clear();
      this._lockListeners.forEach(fn => fn(this.locked));
    });
    document.addEventListener('pointerlockerror', () => this._lockListeners.forEach(fn => fn(false, true)));
    addEventListener('gamepadconnected', e => { this.gamepad = e.gamepad.index; toast('🎮 Handkontroll ansluten'); });
    addEventListener('gamepaddisconnected', () => { this.gamepad = null; });
  }

  requestLock() {
    if (isTouchDevice() || !this.target.requestPointerLock) return;
    // requestPointerLock kan både kasta och returnera ett avvisat löfte (t.ex. utan användarklick
    // eller när unadjustedMovement saknas). Fånga alla varianter så att inga ohanterade fel uppstår.
    const plain = () => {
      try { const p2 = this.target.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => this._lockListeners.forEach(fn => fn(false, true))); }
      catch (e) { this._lockListeners.forEach(fn => fn(false, true)); }
    };
    try {
      const p = this.target.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(err => { if (err && err.name === 'NotSupportedError') plain(); else this._lockListeners.forEach(fn => fn(false, true)); });
    } catch (e) { plain(); }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  onLockChange(fn) { this._lockListeners.push(fn); }

  clear() {
    this.keys.clear(); this.buttons.clear();
    this.look.dx = this.look.dy = 0;
    Object.values(this.sticks).forEach(s => { s.x = 0; s.y = 0; });
  }

  down(...codes) { return codes.some(c => this.keys.has(c) || this._virtDown(c) || this._gpDown(c)); }
  pressed(...codes) { return codes.some(c => this._pressed.has(c)); }
  released(...codes) { return codes.some(c => this._released.has(c)); }
  mouseDown(b = 0) { return this.buttons.has(b); }
  mousePressed(b = 0) { return this._bPressed.has(b); }
  mouseReleased(b = 0) { return this._bReleased.has(b); }

  /** -1..1 från tangenter, pek-spak (stickName, 'x'|'y') eller handkontrollens axel (gpAxis-index). */
  axis(neg, pos, { stick, comp, gpAxis } = {}) {
    let v = (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
    if (stick && this.sticks[stick]) { const s = this.sticks[stick][comp || 'x']; if (Math.abs(s) > Math.abs(v)) v = s; }
    if (gpAxis != null) { const g = this.gpAxis(gpAxis); if (Math.abs(g) > Math.abs(v)) v = g; }
    return clamp(v, -1, 1);
  }

  /** Musens/pekdragets rörelse multiplicerad med känslighet; y inverteras enligt inställning. */
  lookDelta() {
    const s = (this.settings ? this.settings.get('sensitivity') : 1) * 0.0022;
    const inv = this.settings && this.settings.get('invertY') ? -1 : 1;
    let dx = this.look.dx * s, dy = this.look.dy * s * inv;
    // höger spak på handkontroll
    const gx = this.gpAxis(2), gy = this.gpAxis(3);
    dx += gx * 0.045 * (this.settings ? this.settings.get('sensitivity') : 1);
    dy += gy * 0.045 * (this.settings ? this.settings.get('sensitivity') : 1) * inv;
    return { dx, dy };
  }

  endFrame() {
    this._pressed.clear(); this._released.clear();
    this._bPressed.clear(); this._bReleased.clear();
    this.look.dx = this.look.dy = 0; this.wheel = 0;
    this._pollGamepad();
  }

  /* ---- Handkontroll ----
   * Virtuella koder: 'Pad0'..'Pad15' (standardlayout: 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 8=Select, 9=Start, 12-15=D-pad)
   */
  _gp() { if (this.gamepad == null || !navigator.getGamepads) return null; return navigator.getGamepads()[this.gamepad] || null; }
  gpAxis(i) { const g = this._gp(); if (!g || g.axes[i] == null) return 0; const v = g.axes[i]; return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85; }
  _gpDown(code) {
    if (!code.startsWith('Pad')) return false;
    const g = this._gp(); if (!g) return false;
    const b = g.buttons[+code.slice(3)]; return !!(b && (b.pressed || b.value > 0.5));
  }
  _pollGamepad() {
    const g = this._gp(); if (!g) return;
    g.buttons.forEach((b, i) => {
      const d = b.pressed || b.value > 0.5;
      if (d && !this._gpPrev[i]) this._pressed.add('Pad' + i);
      if (!d && this._gpPrev[i]) this._released.add('Pad' + i);
      this._gpPrev[i] = d;
    });
  }

  /* ---- Pekskärm ---- */
  _virtDown(code) { return !!this.virtual[code]; }

  /**
   * Skapar pekkontroller i `layer` (ett .g3-touch-element).
   * config = {
   *   sticks: [{ name:'move', side:'left' }],          // flytande spak i vänstra/högra halvan
   *   lookSide: 'right',                               // drag i denna halva = titta (om ingen spak där)
   *   buttons: [{ code:'Space', label:'Hoppa', right: 24, bottom: 120, size: 72 }]
   * }
   */
  setupTouch(layer, config) {
    const want = this.settings ? this.settings.get('touchControls') : 'auto';
    const on = want === 'on' || (want === 'auto' && isTouchDevice());
    layer.classList.toggle('on', on);
    if (!on || layer._g3touch) return;
    layer._g3touch = true;
    const self = this;
    (config.buttons || []).forEach(b => {
      const el = document.createElement('div');
      el.className = 'g3-tbtn';
      el.textContent = b.label;
      const sz = b.size || 64;
      Object.assign(el.style, { width: sz + 'px', height: sz + 'px' });
      ['left', 'right', 'top', 'bottom'].forEach(k => { if (b[k] != null) el.style[k] = typeof b[k] === 'number' ? b[k] + 'px' : b[k]; });
      const downH = e => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture && el.setPointerCapture(e.pointerId); if (!self.virtual[b.code]) self._pressed.add(b.code); self.virtual[b.code] = true; el.classList.add('down'); };
      const upH = e => { e.preventDefault(); if (self.virtual[b.code]) self._released.add(b.code); self.virtual[b.code] = false; el.classList.remove('down'); };
      el.addEventListener('pointerdown', downH);
      el.addEventListener('pointerup', upH);
      el.addEventListener('pointercancel', upH);
      el.addEventListener('lostpointercapture', upH);
      layer.appendChild(el);
      b.el = el;
    });
    const stickDefs = config.sticks || [];
    stickDefs.forEach(s => { this.sticks[s.name] = { x: 0, y: 0 }; });
    const active = new Map(); // pointerId → { kind, stick, ox, oy, el, lx, ly }
    const R = 55;
    const surface = this.target;
    surface.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const r = surface.getBoundingClientRect();
      const side = (e.clientX - r.left) < r.width / 2 ? 'left' : 'right';
      const st = stickDefs.find(s => s.side === side);
      if (st) {
        const el = document.createElement('div'); el.className = 'g3-stick'; el.innerHTML = '<i></i>';
        el.style.left = (e.clientX - r.left) + 'px'; el.style.top = (e.clientY - r.top) + 'px';
        layer.appendChild(el);
        active.set(e.pointerId, { kind: 'stick', stick: st.name, ox: e.clientX, oy: e.clientY, el });
      } else if (config.lookSide === side || config.lookSide === 'any') {
        active.set(e.pointerId, { kind: 'look', lx: e.clientX, ly: e.clientY });
        if (config.onTap) active.get(e.pointerId).t0 = performance.now();
      }
      surface.setPointerCapture && surface.setPointerCapture(e.pointerId);
    });
    surface.addEventListener('pointermove', e => {
      const a = active.get(e.pointerId); if (!a) return;
      if (a.kind === 'stick') {
        let dx = e.clientX - a.ox, dy = e.clientY - a.oy;
        const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
        this.sticks[a.stick].x = dx / R; this.sticks[a.stick].y = dy / R;
        a.el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
      } else {
        this.look.dx += (e.clientX - a.lx) * 1.6; this.look.dy += (e.clientY - a.ly) * 1.6;
        a.moved = (a.moved || 0) + Math.abs(e.clientX - a.lx) + Math.abs(e.clientY - a.ly);
        a.lx = e.clientX; a.ly = e.clientY;
      }
    });
    const end = e => {
      const a = active.get(e.pointerId); if (!a) return;
      if (a.kind === 'stick') { this.sticks[a.stick].x = 0; this.sticks[a.stick].y = 0; a.el.remove(); }
      else if (config.onTap && (a.moved || 0) < 12 && performance.now() - a.t0 < 300) {
        const r = surface.getBoundingClientRect();
        config.onTap((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      }
      active.delete(e.pointerId);
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }
}

/* =====================================================================
 * Ljud – syntetiserat, med separata volymer för effekter och musik
 * ===================================================================== */
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null; this.master = null; this.sfxBus = null; this.musicBus = null;
    this._last = {};
    this._music = null;
    const unlock = () => { this._ensure(); if (this.ctx && this.ctx.state === 'running') { removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); } };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    if (settings) settings.onChange(() => this._applyVolumes());
  }
  _ensure() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
      this._applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  get muted() { return SH() ? SH().isMuted() : false; }
  _applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : (s ? s.get('master') : 0.8), t, 0.03);
    this.sfxBus.gain.setTargetAtTime(s ? s.get('sfx') : 1, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s ? s.get('music') * 0.55 : 0.3, t, 0.03);
  }
  /** Anropa en gång per bildruta (hanterar M-tangentens ljud av/på). */
  update() {
    if (!this.ctx) return;
    const m = this.muted;
    if (m !== this._wasMuted) { this._wasMuted = m; this._applyVolumes(); }
  }

  /** Enkel ton. opt: freq, to, type, dur, vol, delay, bus ('sfx'|'music'), pan (-1..1) */
  tone(opt) {
    const a = this._ensure(); if (!a) return;
    const o = Object.assign({ freq: 440, to: null, type: 'square', dur: 0.1, vol: 0.12, delay: 0, attack: 0.008, bus: 'sfx', pan: 0 }, opt);
    const t0 = a.currentTime + o.delay;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type; osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t0 + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = g;
    if (o.pan && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); node = p; }
    osc.connect(g); node.connect(o.bus === 'music' ? this.musicBus : this.sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  /** Brus. opt: dur, vol, freq (lågpass), type ('lowpass'|'highpass'|'bandpass'), delay, to (frekvens-svep) */
  noise(opt) {
    const a = this._ensure(); if (!a) return;
    const o = Object.assign({ dur: 0.2, vol: 0.2, freq: 1200, type: 'lowpass', delay: 0, to: null, pan: 0 }, opt);
    const t0 = a.currentTime + o.delay;
    const src = a.createBufferSource(); src.buffer = this._noiseBuf(o.dur);
    const f = a.createBiquadFilter(); f.type = o.type; f.frequency.setValueAtTime(o.freq, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const g = a.createGain();
    g.gain.setValueAtTime(o.vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = g;
    if (o.pan && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); node = p; }
    src.connect(f); f.connect(g); node.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
  }
  _noiseBuf(dur) {
    const a = this.ctx; const len = Math.max(1, Math.floor(a.sampleRate * Math.min(dur, 2)));
    if (!this._nb || this._nb.length < len) {
      const b = a.createBuffer(1, Math.floor(a.sampleRate * 2), a.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._nb = b;
    }
    return this._nb;
  }

  /**
   * Spela en namngiven effekt. Inbyggda: click, select, hover, shoot, laser, hit, hurt, explode, boom, coin, pickup, jump, land,
   * step, place, break, power, win, lose, zap, freeze, whoosh, splash, error, levelup, countdown, go.
   * opts: { vol=1, pan=0, pitch=1, gap=ms }
   */
  play(name, opts = {}) {
    if (this.muted) return;
    const now = performance.now();
    const gap = opts.gap == null ? 30 : opts.gap;
    if (this._last[name] && now - this._last[name] < gap) return;
    this._last[name] = now;
    const v = opts.vol == null ? 1 : opts.vol, p = opts.pitch || 1, pan = opts.pan || 0;
    const T = (o) => this.tone(Object.assign({ pan }, o, { freq: o.freq * p, to: o.to ? o.to * p : null, vol: (o.vol || 0.12) * v }));
    const N = (o) => this.noise(Object.assign({ pan }, o, { vol: (o.vol || 0.2) * v }));
    try {
      switch (name) {
        case 'click': T({ freq: 660, dur: 0.05, vol: 0.07, type: 'triangle' }); break;
        case 'hover': T({ freq: 880, dur: 0.03, vol: 0.03, type: 'sine' }); break;
        case 'select': T({ freq: 520, to: 780, dur: 0.08, vol: 0.08, type: 'triangle' }); break;
        case 'shoot': T({ freq: 900, to: 260, dur: 0.07, vol: 0.05 }); break;
        case 'laser': T({ freq: 1600, to: 300, dur: 0.12, vol: 0.06, type: 'sawtooth' }); break;
        case 'hit': T({ freq: 220, to: 90, dur: 0.09, vol: 0.11, type: 'sawtooth' }); N({ dur: 0.05, vol: 0.08, freq: 2500 }); break;
        case 'hurt': T({ freq: 300, to: 80, dur: 0.25, vol: 0.16, type: 'sawtooth' }); N({ dur: 0.15, vol: 0.12, freq: 900 }); break;
        case 'explode': N({ dur: 0.45, vol: 0.28, freq: 900, to: 120 }); T({ freq: 110, to: 40, dur: 0.35, vol: 0.14, type: 'sine' }); break;
        case 'boom': N({ dur: 0.8, vol: 0.35, freq: 500, to: 60 }); T({ freq: 80, to: 30, dur: 0.6, vol: 0.25, type: 'sine' }); break;
        case 'coin': T({ freq: 988, dur: 0.06, vol: 0.08 }); T({ freq: 1319, dur: 0.12, vol: 0.08, delay: 0.06 }); break;
        case 'pickup': T({ freq: 600, to: 1200, dur: 0.1, vol: 0.08, type: 'triangle' }); break;
        case 'jump': T({ freq: 300, to: 620, dur: 0.12, vol: 0.07 }); break;
        case 'land': N({ dur: 0.08, vol: 0.12, freq: 500 }); break;
        case 'step': N({ dur: 0.05, vol: 0.05, freq: 700 + Math.random() * 400 }); break;
        case 'place': T({ freq: 180, to: 120, dur: 0.06, vol: 0.1, type: 'triangle' }); N({ dur: 0.05, vol: 0.1, freq: 1500 }); break;
        case 'break': N({ dur: 0.18, vol: 0.18, freq: 2200, to: 400 }); break;
        case 'power': [523, 659, 784, 1047].forEach((f, i) => T({ freq: f, dur: 0.09, vol: 0.08, type: 'triangle', delay: i * 0.06 })); break;
        case 'levelup': [392, 523, 659, 784, 1047].forEach((f, i) => T({ freq: f, dur: 0.14, vol: 0.09, type: 'triangle', delay: i * 0.07 })); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => T({ freq: f, dur: 0.18, vol: 0.1, type: 'triangle', delay: i * 0.1 })); break;
        case 'lose': [392, 330, 262, 196].forEach((f, i) => T({ freq: f, dur: 0.24, vol: 0.11, type: 'sawtooth', delay: i * 0.16 })); break;
        case 'zap': T({ freq: 1400, to: 200, dur: 0.15, vol: 0.06, type: 'sawtooth' }); N({ dur: 0.08, vol: 0.06, freq: 4000, type: 'highpass' }); break;
        case 'freeze': T({ freq: 1800, to: 900, dur: 0.18, vol: 0.04, type: 'sine' }); break;
        case 'whoosh': N({ dur: 0.35, vol: 0.12, freq: 400, to: 2500, type: 'bandpass' }); break;
        case 'splash': N({ dur: 0.4, vol: 0.16, freq: 1800, to: 300 }); break;
        case 'error': T({ freq: 160, dur: 0.12, vol: 0.08, type: 'square' }); break;
        case 'countdown': T({ freq: 660, dur: 0.15, vol: 0.1, type: 'square' }); break;
        case 'go': T({ freq: 1320, dur: 0.35, vol: 0.12, type: 'square' }); break;
        default: break;
      }
    } catch (e) { /* ljud får aldrig krascha spelet */ }
  }

  /**
   * Kontinuerligt ljud (t.ex. motor, vind, regn). Returnerar { set({freq, vol, filter}), stop() }.
   * kind: 'engine' | 'wind' | 'hum'
   */
  loop(kind = 'engine') {
    const a = this._ensure(); if (!a) return { set() {}, stop() {} };
    const out = a.createGain(); out.gain.value = 0; out.connect(this.sfxBus);
    const nodes = [];
    let osc, osc2, filt;
    if (kind === 'wind') {
      const src = a.createBufferSource(); src.buffer = this._noiseBuf(2); src.loop = true;
      filt = a.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 500; filt.Q.value = 0.7;
      src.connect(filt); filt.connect(out); src.start(); nodes.push(src);
    } else {
      osc = a.createOscillator(); osc.type = kind === 'hum' ? 'sine' : 'sawtooth'; osc.frequency.value = 60;
      osc2 = a.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 30;
      filt = a.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600;
      const g2 = a.createGain(); g2.gain.value = 0.5;
      osc.connect(filt); osc2.connect(g2); g2.connect(filt); filt.connect(out);
      osc.start(); osc2.start(); nodes.push(osc, osc2);
    }
    return {
      set: ({ freq, vol, filter } = {}) => {
        const t = a.currentTime;
        if (freq != null && osc) { osc.frequency.setTargetAtTime(freq, t, 0.05); osc2.frequency.setTargetAtTime(freq / 2, t, 0.05); }
        if (freq != null && !osc) filt.frequency.setTargetAtTime(freq, t, 0.1);
        if (filter != null) filt.frequency.setTargetAtTime(filter, t, 0.05);
        if (vol != null) out.gain.setTargetAtTime(this.muted ? 0 : vol, t, 0.05);
      },
      stop: () => { const t = a.currentTime; out.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); out.disconnect(); }, 300); }
    };
  }

  /**
   * Generativ bakgrundsmusik. theme: { tempo, root (MIDI), scale:[steg], chords:[[grader]], pad:'sine'|'triangle', arp:true, bass:true, mood }
   * Färdiga teman: 'calm', 'adventure', 'action', 'space', 'night', 'tense', 'victory'
   */
  music(theme) {
    this.stopMusic();
    if (!theme) return;
    const a = this._ensure(); if (!a) return;
    const T = typeof theme === 'string' ? MUSIC_THEMES[theme] : theme;
    if (!T) return;
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    const beat = 60 / T.tempo;
    let step = 0, next = a.currentTime + 0.1;
    const state = { stopped: false };
    const sched = () => {
      if (state.stopped) return;
      while (next < a.currentTime + 0.4) {
        const bar = Math.floor(step / 8), chord = T.chords[bar % T.chords.length];
        const inBar = step % 8;
        const deg = d => T.root + T.scale[((d % T.scale.length) + T.scale.length) % T.scale.length] + 12 * Math.floor(d / T.scale.length);
        if (inBar === 0) chord.forEach(d => this.tone({ freq: midi(deg(d) + 12), dur: beat * 8 * 0.98, vol: 0.035, type: T.pad || 'sine', attack: beat * 1.5, delay: next - a.currentTime, bus: 'music' }));
        if (T.bass && (inBar === 0 || inBar === 4)) this.tone({ freq: midi(deg(chord[0]) - 12), dur: beat * 3.5, vol: 0.06, type: 'triangle', attack: 0.02, delay: next - a.currentTime, bus: 'music' });
        if (T.arp && (T.arpEvery ? inBar % T.arpEvery === 0 : true)) {
          const d = chord[(inBar + Math.floor(step / 16)) % chord.length] + (inBar >= 4 ? 7 : 0) - (inBar >= 4 ? 7 : 0);
          this.tone({ freq: midi(deg(d) + 24), dur: beat * 0.9, vol: T.arpVol || 0.025, type: T.arpType || 'triangle', attack: 0.01, delay: next - a.currentTime, bus: 'music' });
        }
        if (T.drums) {
          if (inBar % 4 === 0) this.noise({ dur: 0.12, vol: 0.05, freq: 150, delay: next - a.currentTime });
          if (inBar % 4 === 2) this.noise({ dur: 0.08, vol: 0.03, freq: 5000, type: 'highpass', delay: next - a.currentTime });
        }
        next += beat / 2; step++;
      }
      state.timer = setTimeout(sched, 120);
    };
    sched();
    this._music = state;
  }
  stopMusic() { if (this._music) { this._music.stopped = true; clearTimeout(this._music.timer); this._music = null; } }
}

const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
export const MUSIC_THEMES = {
  calm:      { tempo: 72,  root: 60, scale: MAJ, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], pad: 'sine', arp: true, arpEvery: 2, bass: true },
  adventure: { tempo: 96,  root: 62, scale: DOR, chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [4, 6, 8]], pad: 'triangle', arp: true, bass: true },
  action:    { tempo: 132, root: 57, scale: MIN, chords: [[0, 2, 4], [5, 7, 9], [6, 8, 10], [4, 6, 8]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.02 },
  space:     { tempo: 84,  root: 55, scale: MIN, chords: [[0, 2, 4, 6], [5, 7, 9], [3, 5, 7, 9], [6, 8, 10]], pad: 'sine', arp: true, arpEvery: 2, bass: true, arpType: 'sine' },
  night:     { tempo: 64,  root: 57, scale: MIN, chords: [[0, 2, 4], [3, 5, 7], [5, 7, 9], [4, 6, 8]], pad: 'sine', arp: true, arpEvery: 4, bass: false },
  tense:     { tempo: 110, root: 52, scale: MIN, chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.018 },
  victory:   { tempo: 120, root: 60, scale: MAJ, chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]], pad: 'triangle', arp: true, bass: true, drums: true }
};

/* =====================================================================
 * UI-hjälpare
 * ===================================================================== */
let toastHost = null;
/** Visa ett kort meddelande. opts: { big, ms } */
export function toast(text, opts = {}) {
  if (!toastHost) {
    toastHost = document.createElement('div'); toastHost.className = 'g3-toasts';
    (document.querySelector('.g3-root') || document.body).appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = 'g3-toast' + (opts.big ? ' big' : '');
  el.textContent = text;
  toastHost.appendChild(el);
  while (toastHost.children.length > 4) toastHost.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 380); }, opts.ms || 2200);
  return el;
}

/** Visa/dölj ett .g3-screen-element (via id eller element). */
export function show(elOrId, on = true) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.classList.toggle('hidden', !on);
  if (on) { const f = el.querySelector('[autofocus], .btn.primary'); if (f && !isTouchDevice()) setTimeout(() => f.focus({ preventScroll: true }), 30); }
}
export const hide = el => show(el, false);

/** Laddskärm: returnerar { set(fraction, text), done() } */
export function loadingScreen(el) {
  const bar = el.querySelector('.g3-loadbar > i'), txt = el.querySelector('.g3-loadtext');
  return {
    set(f, text) { if (bar) bar.style.width = Math.round(clamp(f, 0, 1) * 100) + '%'; if (txt && text != null) txt.textContent = text; },
    done() { hide(el); }
  };
}
/** Låter webbläsaren rita om (för att laddskärmen ska uppdateras mellan tunga steg). */
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

/**
 * Bygger en inställningspanel i `container`.
 * extra = [{ key, label, type:'range'|'select'|'check', min, max, step, options:[[värde, text]], format:v=>text }]
 * Standardinställningar visas alltid: grafik, synfält, känslighet, invertera Y, volymer, FPS, pekkontroller.
 */
export function buildSettings(container, settings, extra = [], { hide: hideKeys = [] } = {}) {
  const defs = [
    { key: 'quality', label: 'Grafikkvalitet', type: 'select', options: Object.entries(QUALITY).map(([k, v]) => [k, v.label]) },
    { key: 'fov', label: 'Synfält', type: 'range', min: 55, max: 100, step: 1, format: v => v + '°' },
    { key: 'sensitivity', label: 'Muskänslighet', type: 'range', min: 0.2, max: 3, step: 0.05, format: v => (+v).toFixed(2) },
    { key: 'invertY', label: 'Invertera Y-led', type: 'check' },
    { key: 'master', label: 'Huvudvolym', type: 'range', min: 0, max: 1, step: 0.05, format: v => Math.round(v * 100) + '%' },
    { key: 'sfx', label: 'Ljudeffekter', type: 'range', min: 0, max: 1, step: 0.05, format: v => Math.round(v * 100) + '%' },
    { key: 'music', label: 'Musik', type: 'range', min: 0, max: 1, step: 0.05, format: v => Math.round(v * 100) + '%' },
    ...extra,
    { key: 'touchControls', label: 'Pekkontroller', type: 'select', options: [['auto', 'Automatiskt'], ['on', 'På'], ['off', 'Av']] },
    { key: 'showFps', label: 'Visa FPS', type: 'check' }
  ].filter(d => !hideKeys.includes(d.key));
  container.classList.add('g3-settings');
  container.innerHTML = '';
  defs.forEach(d => {
    const row = document.createElement('div'); row.className = 'g3-set';
    const id = 'set-' + d.key;
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = d.label;
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    const cur = settings.get(d.key);
    let input;
    if (d.type === 'select') {
      input = document.createElement('select');
      d.options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(v) === String(cur)) o.selected = true; input.appendChild(o); });
      input.addEventListener('change', () => { const raw = input.value; const num = d.options.every(o => typeof o[0] === 'number'); settings.set(d.key, num ? +raw : raw); });
      ctl.appendChild(input);
    } else if (d.type === 'check') {
      input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!cur;
      input.addEventListener('change', () => settings.set(d.key, input.checked));
      ctl.appendChild(input);
    } else {
      input = document.createElement('input'); input.type = 'range';
      input.min = d.min; input.max = d.max; input.step = d.step; input.value = cur;
      const val = document.createElement('span'); val.className = 'val';
      const fmt = d.format || (v => v);
      val.textContent = fmt(cur);
      input.addEventListener('input', () => { val.textContent = fmt(+input.value); settings.set(d.key, +input.value); });
      ctl.append(input, val);
    }
    input.id = id;
    row.append(lab, ctl);
    container.appendChild(row);
  });
}

/** Skapar FPS-mätaren och kopplar den till inställningen. */
export function fpsMeter(root, loop, settings) {
  const el = document.createElement('div'); el.className = 'g3-fps';
  root.appendChild(el);
  const apply = () => { el.classList.toggle('hidden', !settings.get('showFps')); loop.fpsEl = settings.get('showFps') ? el : null; };
  settings.onChange(k => { if (k === 'showFps') apply(); });
  apply();
  return el;
}

/* =====================================================================
 * IndexedDB-lagring (stora sparfiler), faller tillbaka på localStorage
 * ===================================================================== */
const DB_NAME = 'spelhallen3d', STORE = 'kv';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
export const kv = {
  async get(key) {
    const d = await db();
    if (!d) { try { const v = localStorage.getItem('spelhallen3d:' + key); return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; } }
    return new Promise(res => { const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => res(undefined); });
  },
  async set(key, value) {
    const d = await db();
    if (!d) { try { localStorage.setItem('spelhallen3d:' + key, JSON.stringify(value)); } catch (e) {} return; }
    return new Promise(res => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
  },
  async del(key) {
    const d = await db();
    if (!d) { try { localStorage.removeItem('spelhallen3d:' + key); } catch (e) {} return; }
    return new Promise(res => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
  },
  async keys(prefix = '') {
    const d = await db();
    if (!d) { try { return Object.keys(localStorage).filter(k => k.startsWith('spelhallen3d:' + prefix)).map(k => k.slice(13)); } catch (e) { return []; } }
    return new Promise(res => { const t = d.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys(); t.onsuccess = () => res(t.result.filter(k => String(k).startsWith(prefix))); t.onerror = () => res([]); });
  }
};

/* =====================================================================
 * Små matte-/slumphjälpare
 * ===================================================================== */
/** Seedbar slumpgenerator (mulberry32). rng() → 0..1 */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export { clamp };

/** Rapportera poäng till Spelhallens rekordsystem. Returnerar { best, isNew }. */
export function submitScore(gameId, score) { return SH() ? SH().submit(gameId, score) : { best: score, isNew: false }; }
export function bestScore(gameId) { return SH() ? SH().best(gameId) : 0; }
export const fmt = n => (SH() ? SH().fmt(n) : String(Math.floor(n)));
