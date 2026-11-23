/**
 * Rymdjakt – huvudmodul: renderare, spelloop, tillstånd (meny/flygning/paus/debriefing), bakgrundsscen i menyn,
 * hangarvisning, uppdragsstart/-slut, sparning och rekord.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Settings, createRenderer, Loop, Input, Audio, fpsMeter, loadingScreen, submitScore, isTouchDevice, show, hide } from '../../engine/kit.js';
import { GAME_ID, loadSave, writeSave, playerStats } from './data.js';
import { panelTexture, windowTexture, rockTexture, solarTexture, glowTexture, sunTexture, flameTexture, mat, glowSpriteMat } from './gfx.js';
import { MODEL_IDS, getTemplate, instantiate } from './models.js';
import { FX } from './fx.js';
import { World } from './world.js';
import { HUD } from './hud.js';
import { PlayerControl, CameraRig } from './player.js';
import { MissionRun } from './mission.js';
import { MISSIONS, SURVIVAL } from './missions.js';
import { Sfx, MUSIC } from './sfx.js';
import { UI } from './ui.js';
import { portrait } from './portraits.js';
import { Online } from './online.js';
import { FlightStick, StickScreen } from './flightstick.js';

window.Spelhallen && Spelhallen.init(GAME_ID);
const $ = id => document.getElementById(id);
/** Som kitets nextFrame, men fastnar inte om fliken ligger i bakgrunden (rAF strypt). */
const nextFrame = () => new Promise(res => { let done = false; const f = () => { if (!done) { done = true; setTimeout(res, 0); } }; requestAnimationFrame(f); setTimeout(f, 60); });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

class Game {
  constructor() {
    this.root = $('root');
    this.settings = new Settings(GAME_ID, { adMode: 'roll', stickReturn: 1.2, aimAssist: 1, shake: 1, hudScale: 1 });
    this.scene = new THREE.Scene();
    this.R = createRenderer(this.root, this.settings, { scene: this.scene });
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), 1, 0.5, 24000);
    this.R.setCamera(this.camera);
    this.input = new Input(this.R.canvas, this.settings);
    this.stick = new FlightStick(this); // flygspakar/HOTAS (egen avläsning av navigator.getGamepads)
    this.audio = new Audio(this.settings);
    this.sfx = new Sfx(this.audio);
    this.save = loadSave();
    this.fx = new FX(this.scene, this.settings);
    this.world = new World(this);
    this.hud = new HUD(this);
    this.pc = new PlayerControl(this);
    this.rig = new CameraRig(this.camera);
    this.ui = new UI(this);
    this.online = new Online(this);
    this.stickScreen = new StickScreen(this, this.stick);
    this.overlay = false; // onlineläge: pausmenyn visas men simuleringen fortsätter
    this.state = 'loading';
    this.mission = null; this.targetSub = null;
    this.touchOn = false;
    this.menuT = 0;
    this.composer = null;
    this._setupComposer();
    this.R.onResize((w, h) => this._resize(w, h));
    this._resize(this.R.size.w, this.R.size.h);
    this.settings.onChange(k => {
      if (k === 'quality') { this._setupComposer(); this._resize(this.R.size.w, this.R.size.h); }
      if (k === 'touchControls') this._setupTouch();
      if (k === 'hudScale') this._resize(this.R.size.w, this.R.size.h);
    });
    this.loop = new Loop({ update: dt => this.update(dt), render: (a, fdt) => this.render(fdt) });
    fpsMeter(this.root, this.loop, this.settings);
    this._bindEvents();
    this._setupTouch();
    this.stepT = 0;
  }

  /* ---------------------------------------------------------------- uppstart */
  async boot() {
    const L = loadingScreen($('loading'));
    this.loop.start();
    const steps = [];
    steps.push(['Ritar skrovplåtar', () => { panelTexture(); windowTexture(); solarTexture(); }]);
    steps.push(['Hugger asteroider', () => { rockTexture(); glowTexture(); sunTexture(); flameTexture(); }]);
    for (const id of MODEL_IDS) steps.push(['Bygger skepp: ' + id, () => getTemplate(id)]);
    steps.push(['Målar porträtt', () => { for (const c of ['lind', 'varg', 'gnista', 'ek', 'kontroll', 'sund', 'rask', 'vahl', 'svarm', 'dator']) portrait(c, 96); }]);
    steps.push(['Tänder stjärnorna', () => this.toMenuWorld()]);
    steps.push(['Kompilerar ljus och skuggor', () => { try { this.R.renderer.compile(this.scene, this.camera); } catch (e) { /* ignorera */ } }]);
    for (let i = 0; i < steps.length; i++) {
      L.set(i / steps.length, steps[i][0] + ' …');
      await nextFrame();
      steps[i][1]();
    }
    L.set(1, 'Klart!');
    await nextFrame();
    L.done();
    this.ui.show('menu', false);
    // musik när användaren interagerat första gången
    const startMusic = () => { if (this.state === 'menu' && !this._menuMusic) { this._menuMusic = true; this.audio.music(MUSIC.meny); } removeEventListener('pointerdown', startMusic); removeEventListener('keydown', startMusic); };
    addEventListener('pointerdown', startMusic); addEventListener('keydown', startMusic);
    window.__rymdjakt = this;
    window.__ok = true;
  }

  _setupComposer() {
    const want = ['high', 'ultra'].includes(this.settings.get('quality'));
    if (want && !this.composer) {
      const r = this.R.renderer;
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.38, 1.1);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else if (!want && this.composer) {
      this.composer.dispose(); this.composer = null; this.bloom = null;
    }
  }
  _resize(w, h) {
    this.hud.resize(w, h);
    this.hud.s *= this.settings.get('hudScale') || 1;
    this.hud.root.style.setProperty('--hs', this.hud.s.toFixed(3));
    if (this.composer) {
      this.composer.setPixelRatio(this.R.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }
  _setupTouch() {
    const want = this.settings.get('touchControls');
    this.touchOn = want === 'on' || (want === 'auto' && isTouchDevice());
    this.root.classList.toggle('touchmode', this.touchOn);
    this.input.setupTouch($('touch'), {
      sticks: [{ name: 'move', side: 'left' }],
      buttons: [
        { code: 'TFire', label: 'Skjut', right: 24, bottom: 34, size: 84 },
        { code: 'TMissile', label: 'Missil', right: 120, bottom: 22, size: 62 },
        { code: 'TBoost', label: 'Boost', right: 30, bottom: 132, size: 62 },
        { code: 'TFlare', label: 'Fackla', right: 112, bottom: 102, size: 54 },
        { code: 'KeyR', label: 'Mål', right: 186, bottom: 40, size: 54 },
        { code: 'TRollL', label: '⟲', right: 104, bottom: 172, size: 46 },
        { code: 'TRollR', label: '⟳', right: 24, bottom: 210, size: 46 },
        { code: 'TOrder', label: 'Order', right: 186, bottom: 110, size: 48 }
      ]
    });
  }
  _bindEvents() {
    const I = this.input;
    I.onLockChange((locked, err) => {
      this._lockHint();
      if (err) return;
      if (!locked && this.state === 'flight' && !this.touchOn && !this._ignoreUnlock) this.pause();
    });
    this.R.canvas.addEventListener('mousedown', () => {
      if (this.state === 'flight' && !I.locked && !this.touchOn) this.tryLock();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    addEventListener('blur', () => this.pause());
    $('pauseBtn').addEventListener('click', () => this.pause());
    addEventListener('keydown', e => {
      if (e.code !== 'Escape') return;
      if (this.state === 'paused' && this.ui.cur === 'pause' && performance.now() - this.pausedAt > 400) { e.preventDefault(); this.resume(); }
      else if (this.state === 'flight' && this.overlay && this.ui.cur === 'pause' && performance.now() - this.pausedAt > 400) { e.preventDefault(); this.resume(); }
      else if ((this.state === 'menu' || this.state === 'paused' || (this.state === 'flight' && this.overlay)) && this.ui.cur && !['menu', 'pause', 'debrief', 'loading', 'online'].includes(this.ui.cur)) { e.preventDefault(); this.sfx.play('click'); this.ui.back(); }
    });
  }
  /** Pekarlåsning utan ohanterade promise-fel (kräver användargest). */
  tryLock() {
    if (this.touchOn || isTouchDevice()) return;
    const c = this.R.canvas;
    if (!c.requestPointerLock || document.pointerLockElement === c) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = c.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => {}); } catch (e) { /* ignorera */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* ignorera */ } }
  }
  _lockHint() {
    const show = this.state === 'flight' && !this.input.locked && !this.touchOn && !this.overlay && !this.stick.hasStick;
    $('lockhint').classList.toggle('hidden', !show);
  }

  /* ---------------------------------------------------------------- menyvärld */
  toMenuWorld() {
    if (this.mission) { this.mission.abort(); this.mission = null; }
    this.sfx.stopEngine();
    this.state = 'menu';
    this.hud.show(false);
    this.root.classList.remove('flying');
    this._lockHint();
    const W = this.world;
    W.setup({ env: 'hemma', diff: 'normal' });
    W.quiet = true;
    this.menuStation = W.spawn('polstjarnan', { team: 0, pos: [0, 0, 0], spin: 0.02, throttle: 0, invulnerable: true });
    this.menuStation.subs.forEach(s => { if (s.type === 'turret') s.alive = false; });
    this.dog = V3(1700, 250, -900);
    W.spawn('frakt', { team: 0, pos: [-1400, -200, 1800], look: [1600, -100, -2400], throttle: 1, ai: { path: [V3(1600, -100, -2400), V3(5000, 0, -6000)] } });
    this._menuSpawn(true);
    this.menuT = 0;
    if (this.showcaseObj) this.scene.add(this.showcaseObj);
    if (this._menuMusic) this.audio.music(MUSIC.meny);
  }
  _menuSpawn(initial) {
    const W = this.world;
    const allies = W.teams[0].filter(s => !s.dead && s.kind === 'fighter').length;
    const enemies = W.teams[1].filter(s => !s.dead && s.kind === 'fighter').length;
    for (let i = allies; i < 4; i++) W.spawn('ally', { team: 0, pos: this.dog.clone().add(V3(-400 + Math.random() * 200, Math.random() * 200 - 100, 300 + Math.random() * 200)), look: this.dog, warp: !initial, hpMult: 2, ai: { home: this.dog.clone(), leash: 1400 } });
    for (let i = enemies; i < 4; i++) W.spawn('hugg', { team: 1, pos: this.dog.clone().add(V3(400 - Math.random() * 200, Math.random() * 200 - 100, -300 - Math.random() * 200)), look: this.dog, warp: !initial, hpMult: 2, ai: { home: this.dog.clone(), leash: 1400 } });
  }
  /** Visar valt skepp i hangaren (modellen svävar framför kameran). */
  showcase(on, shipId) {
    if (!on) { if (this.showcaseObj) this.showcaseObj.visible = false; this.showcaseOn = false; return; }
    const id = PLAYER_MODEL(shipId || this.save.ship);
    if (!this.showcaseObj || this.showcaseId !== id) {
      if (this.showcaseObj) this.scene.remove(this.showcaseObj);
      const inst = instantiate(id);
      this.showcaseObj = inst.group; this.showcaseId = id;
      this.showcaseFlames = inst.flames; this.showcaseGlows = inst.glows;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.15, 6, 64), mat('holo'));
      ring.rotation.x = Math.PI / 2; ring.position.y = -3.5; this.showcaseObj.add(ring);
      this.scene.add(this.showcaseObj);
    }
    this.showcaseObj.visible = true; this.showcaseOn = true;
  }

  /* ---------------------------------------------------------------- uppdrag */
  playerStats() { return playerStats(this.save); }
  startCampaignMission(idx, cp = null) { this._startMission(MISSIONS[idx], { mode: 'campaign', idx, cp }); }
  startSurvival() { this._startMission(SURVIVAL, { mode: 'survival' }); }
  restartMission() { if (this.cur) this._startMission(this.cur.def, Object.assign({}, this.cur.opts, { cp: null })); }
  _startMission(def, opts) {
    this.ui.hideAll();
    show('loading');
    $('loading').querySelector('.g3-loadtext').textContent = 'Hoppar in: ' + def.title + ' …';
    $('loading').querySelector('.g3-loadbar > i').style.width = '60%';
    this.state = 'loading';
    nextFrame().then(() => setTimeout(() => {
      if (this.mission) this.mission.abort();
      if (this.showcaseObj) this.showcaseObj.visible = false;
      this.pc.reset(); this.targetSub = null;
      this.world.quiet = false;
      this.cur = { def, opts };
      this.mission = new MissionRun(this, def, { diff: this.save.diff, mode: opts.mode, cp: opts.cp || null });
      this.mission.start();
      this.hud.setObjectives([]); this.hud.radio(null); this.hud.tip(null); this.hud.setTimer(null);
      this.rig.snap(this.world.player);
      this.rig.update(0.016, this.world.player, 'chase', this.settings, 0);
      try { this.R.renderer.compile(this.scene, this.camera); } catch (e) { /* ignorera */ }
      hide('loading');
      this.state = 'flight';
      this.hud.show(true);
      this.root.classList.add('flying');
      this.sfx.startEngine();
      this.tryLock();
      this._lockHint();
      this.input.clear();
    }, 30));
  }
  pause() {
    if (this.state !== 'flight') return;
    if (this.online.active) {
      // online: visa menyn men låt världen fortsätta (andra spelare väntar inte)
      if (this.overlay) return;
      this.overlay = true; this.pausedAt = performance.now();
      $('pauseSub').textContent = 'Spelet fortsätter medan menyn är öppen.';
      this.ui.show('pause', false);
      this._ignoreUnlock = true; this.input.exitLock(); this._ignoreUnlock = false;
      this._lockHint();
      return;
    }
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.sfx.setEngine(0, false, false);
    $('pauseSub').textContent = this.cur ? this.cur.def.title : '';
    this.ui.show('pause', false);
    this._ignoreUnlock = true; this.input.exitLock(); this._ignoreUnlock = false;
    this._lockHint();
  }
  resume() {
    if (this.overlay) { this.overlay = false; this.ui.hideAll(); this.tryLock(); this._lockHint(); this.input.clear(); this.input.endFrame(); return; }
    if (this.state !== 'paused') return;
    this.ui.hideAll();
    this.state = 'flight';
    this.tryLock();
    this._lockHint();
    this.input.clear(); this.input.endFrame();
  }
  quitToMenu() { if (this.online.active) { this.online.quit(); return; } this.toMenuWorld(); this.ui.show('menu', false); }
  campaignTotal() { return Object.values(this.save.missions).reduce((a, m) => a + (m.best || 0), 0); }

  /** Anropas av MissionRun när uppdraget är över. */
  missionEnded(m) {
    if (this.mission !== m || this.online.active) return;
    const r = m.computeScore();
    const s = this.save, opts = this.cur.opts;
    let credits = 0, firstClear = false, newBest = false, campaignDone = false;
    if (opts.mode === 'campaign') {
      const def = this.cur.def;
      const rec = s.missions[def.id] || { best: 0, grade: '', done: false };
      if (r.win) {
        firstClear = !rec.done;
        credits = (firstClear ? def.reward : Math.round(def.reward * 0.35)) + Math.round(r.total / 10);
        if (r.total > rec.best) { newBest = rec.best > 0; rec.best = r.total; }
        if (!rec.grade || 'SABCD'.indexOf(r.grade) < 'SABCD'.indexOf(rec.grade)) rec.grade = r.grade;
        rec.done = true;
        s.unlocked = Math.max(s.unlocked, opts.idx + 1);
        if (m.flags.campaignDone && !s.campaignDone) { s.campaignDone = true; campaignDone = true; }
      } else credits = Math.round(r.killPoints * r.mult / 20);
      s.missions[def.id] = rec;
      s.credits += credits;
      writeSave(s);
      submitScore(GAME_ID, this.campaignTotal());
    } else {
      const entry = { score: r.total, wave: m.wave || 0, ship: s.ship, diff: s.diff, date: Date.now() };
      const prevBest = s.survival.length ? s.survival[0].score : 0;
      s.survival.push(entry); s.survival.sort((a, b) => b.score - a.score); s.survival = s.survival.slice(0, 10);
      newBest = r.total > prevBest && prevBest > 0;
      credits = Math.round(r.total / 25);
      s.credits += credits;
      writeSave(s);
      submitScore(GAME_ID, r.total);
    }
    this.state = 'debrief';
    this.sfx.stopEngine();
    this._ignoreUnlock = true; this.input.exitLock(); this._ignoreUnlock = false;
    this.hud.show(false);
    this.root.classList.remove('flying');
    this._lockHint();
    this.audio.music(r.win || opts.mode === 'survival' ? MUSIC.seger : MUSIC.meny);
    this.mission.abort();
    this.ui.showDebrief({ r, mode: opts.mode, idx: opts.idx, title: this.cur.def.title, reason: m.reason, diff: s.diff, credits, firstClear, newBest, campaignDone, wave: m.wave, cp: r.win ? null : m.cpReached });
  }

  /* ---------------------------------------------------------------- loop */
  update(dt) {
    // anpassa fysikens tidssteg efter skärmens uppdateringsfrekvens (60/120 Hz)
    this.stepT += dt;
    if (this.stepT > 2) { this.stepT = 0; const f = this.loop.fps; const want = f > 100 ? 1 / 120 : 1 / 60; if (Math.abs(want - this.loop.step) > 1e-6) this.loop.step = want; }
    this.audio.update();
    const I = this.input, W = this.world;
    this.stick.poll(I);
    if (this.state === 'flight') {
      if (I.pressed('Escape', 'KeyP', 'Pad9') || this.stick.pressed('pause')) { if (this.overlay) this.resume(); else this.pause(); I.endFrame(); return; }
      if (this.overlay) { const c = W.player && W.player.ctrl; if (c) { c.fire = false; c.pitch = c.yaw = c.roll = 0; c.boost = false; c.brake = false; } }
      else this.pc.update(dt);
      W.update(dt);
      if (this.mission) this.mission.update(dt);
      if (this.online.active) this.online.update(dt);
      const P = W.player;
      this.fx.update(dt, this.camera, P ? P.vel : null);
      this.hud.update(dt);
      if (P) this.sfx.setEngine(Math.min(1.4, P.speed / P.def.speed), P.boosting, !P.dead);
    } else if (this.state === 'paused') {
      if (I.pressed('KeyP', 'Pad9') || (this.stick.pressed('pause') && this.ui.cur === 'pause')) this.resume();
      this.ui.padNav(I, dt);
    } else if (this.state === 'menu') {
      W.update(dt);
      this.fx.update(dt, this.camera, null);
      this.menuT += dt;
      if (Math.floor(this.menuT) % 6 === 0 && this.menuT % 1 < dt) this._menuSpawn(false);
      this.ui.padNav(I, dt);
    } else if (this.state === 'debrief') {
      this.ui.padNav(I, dt);
    }
    I.endFrame();
  }
  render(fdt) {
    const W = this.world, cam = this.camera;
    if (this.state === 'flight' || this.state === 'paused' || this.state === 'debrief') {
      const P = W.player;
      const dt = this.state === 'flight' ? fdt : 0;
      if (P && !this.debugCam) {
        this.rig.update(dt, P, this.pc.view, this.settings, W.shakeAmt);
        P.obj.visible = !(this.pc.view === 'cockpit' && !P.dead);
      }
    } else if (this.state === 'menu') {
      if (this.showcaseOn && this.showcaseObj) {
        // hangarvy
        const base = V3(-520, 260, 900);
        this.showcaseObj.position.copy(base);
        this.showcaseObj.rotation.set(0.12, this.menuT * 0.35, 0);
        for (const f of this.showcaseFlames) f.scale.set(f.userData.flame.r, f.userData.flame.r, f.userData.flame.len * 0.6);
        const wide = cam.aspect > 1.15;
        const k = this.showcaseId === 'orn' ? 1.2 : 1;
        cam.position.set(base.x + (wide ? 7 : 0) * k, base.y + 4.5 * k, base.z + (wide ? 21 : 30) * k);
        cam.lookAt(base.x + (wide ? 10.5 : 0) * k, base.y - (wide ? 1 : 5) * k, base.z);
      } else {
        const a = this.menuT * 0.035;
        const c = V3(700, 80, -300);
        cam.position.set(c.x + Math.cos(a) * 1500, c.y + 260 + Math.sin(a * 0.7) * 120, c.z + Math.sin(a) * 1500);
        cam.lookAt(c.x + 300, c.y, c.z);
      }
      if (cam.fov !== this.settings.get('fov')) { cam.fov = this.settings.get('fov'); cam.updateProjectionMatrix(); }
    }
    cam.updateMatrixWorld();
    if (W.env) W.env.update(cam, fdt);
    W.bolts.sync();
    const h = this.R.renderer.getDrawingBufferSize(_v2).y;
    this.fx.setScale(h, cam.fov);
    // navljus blinkar
    navBlink(Math.sin(performance.now() * 0.004) > 0.2);
    if (this.composer && this.bloom) this.composer.render(fdt);
    else this.R.renderer.render(this.scene, cam);
    if (this.state === 'flight' || this.state === 'paused') this.hud.draw();
  }
}

/* ---------------------------------------------------------------- hjälpare */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PLAYER_MODEL = id => ({ svala: 'svala', falk: 'falk', orn: 'orn' })[id] || 'svala';
function navBlink(on) {
  for (const c of ['#ff3030', '#30ff60', '#ffffff', '#60d0ff']) {
    const m = glowSpriteMat(c, 2.5, 'nav_' + c + 'b');
    m.opacity = on ? 1 : 0.15;
  }
}

const game = new Game();
game.boot().catch(e => { console.error(e); const t = $('loading').querySelector('.g3-loadtext'); if (t) t.textContent = 'Något gick fel vid start: ' + e.message; });
