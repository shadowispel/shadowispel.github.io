/**
 * Fjällracet – huvudmodul: menyer, lägen, loppets logik, kamera, ljud, HUD.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Settings, createRenderer, Loop, Input, Audio, buildSettings, fpsMeter, toast, show, hide, loadingScreen, nextFrame, submitScore, bestScore, kv, makeRng, isTouchDevice } from '../../engine/kit.js';
import { CARS, COLORS, AI_DRIVERS, DIFFICULTY, POINTS, TRACKS, CAR_TIER, CLASSES, perfIndex, piClass, trackById, trackName } from './data.js';
import { RARITIES, PERF, TIRES, LOOK, CRATES, SURFACE_NAME, partInfo, openCrate, applyParts, lookCat } from './parts.js';
import { ETYPES, CHAPTERS, EVENTS, eventById, chapterOf, totalStars, chapterUnlocked, eventUnlocked, starsFor, rewardText, dailyChallenges, todayKey } from './career.js';
import { FINISHES } from './carmodel.js';
import { Track } from './track.js';
import { THEMES as trackThemes } from './themes.js';
import { World } from './world.js';
import { Car, collideCars, buildCarModel, disposeCarModel } from './car.js';
import { AIDriver } from './ai.js';
import { Particles, Skids, SpeedFx } from './fx.js';
import { Hud, fmtTime } from './hud.js';
import * as TX from './textures.js';
import { engineVoice } from './sound.js';
import { makeNet, makeLobby, buildStart, packCar, pushSample, stepRemote, INTERP, lookFromNet } from './online.js';
import { backgroundTicker, emoteBar } from '../../engine/net.js';
import { createCrateStage } from './crate3d.js';

const ID = 'fjallracet';
Spelhallen.init(ID);
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const css = (hex) => '#' + new THREE.Color(hex).getHexString();
/** Som kit:s nextFrame men hänger inte om fliken är dold (rAF pausad). */
const tick = () => Promise.race([nextFrame(), new Promise(r => setTimeout(r, 120))]);

const root = $('root');
const settings = new Settings(ID, { autoGas: false, touchSteer: 'buttons', shake: true, speedFx: true });
const scene = new THREE.Scene();
const R = createRenderer(root, settings, { scene });
const renderer = R.renderer;
TX.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
const camera = new THREE.PerspectiveCamera(70, 1, 0.15, 3000);
R.setCamera(camera);
const input = new Input(R.canvas, settings);
const audio = new Audio(settings);
const hud = new Hud($('hud'));
const loader = loadingScreen($('loading'));
const isTouch = isTouchDevice();
const hudEl = $('hud');
hudEl.classList.add('hidden');
let race = null, paused = false;

/* ------------------------------------------------------------------ Sparfil */
const SAVE = 'fjallracet:save';
const save = Object.assign({ cups: {}, cars: [], tutorial: false, best: {}, car: 'viggen', color: 0, diff: 'easy', laps: 3, opp: 7, track: 'midsommar', cupRun: null, tt: 'midsommar' }, Spelhallen.store.get(SAVE, {}));
/* --- sparfil v2: garage, delar, lådor, karriär (gamla sparfiler migreras) --- */
if (!(save.v >= 2)) {
  const old = Array.isArray(save.cars) ? save.cars : [];
  save.owned = ['viggen', 'algen'].concat(old.filter(id => CARS.some(c => c.id === id) && id !== 'viggen' && id !== 'algen'));
  const col = (COLORS[save.color] || COLORS[0]).hex;
  save.looks = {}; save.looks[save.car] = { color: col };
  // tidigare cupframgångar ger startkapital
  const cups = save.cups || {};
  save.kr = 2000 + ['brons', 'silver', 'guld'].reduce((a, k) => a + (cups[k] && cups[k].best <= 3 ? 4000 : 0), 0);
  save.crates = old.length ? ['stal'] : ['tra'];
  save.parts = []; save.perf = {}; save.career = {}; save.daily = { day: '', done: [] }; save.found = [];
  save.cupRun = null; save.v = 2;
}
const persist = () => Spelhallen.store.set(SAVE, save);
const carSpec = (id) => CARS.find(c => c.id === id) || CARS[0];
const owns = (id) => save.owned.includes(id);
const carUnlocked = (c) => owns(c.id);
const DEF_COL = { viggen: 0xb0281f, algen: 0x1f4fbf, pixel: 0xf2c414, blixten: 0xe8ecef, falk: 0xb0281f, kaze: 0x1f4fbf, vraken: 0xf06b12, bison: 0x15171f, aska: 0x5b6169,
  lodjuret: 0x2e6b3a, tempesta: 0xe8ecef, vega: 0x8ab8c8, ankar: 0xd8c8a0, kupol: 0x12a9b0, fjallbjorn: 0x2e6b3a, timmer: 0x5b6169, spark: 0xe8ecef, aurora: 0x8a6fd1,
  ion: 0x15171f, norrsken: 0x12a9b0, valkyria: 0xb0281f, stormfagel: 0xf2c414 };
const PLATE_L = 'ABCDEFGHJKLMNOPRSTUWXYZ';
/** Bilens utseende (look-objekt till carmodel.js). */
function lookOf(id) {
  if (!save.looks[id]) {
    let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    save.looks[id] = { color: DEF_COL[id] ?? 0xb0281f, plate: PLATE_L[h % 23] + PLATE_L[(h >> 5) % 23] + PLATE_L[(h >> 10) % 23] + ' ' + String(100 + (h >> 15) % 900) };
  }
  return save.looks[id];
}
const perfOf = (id) => save.perf[id] || (save.perf[id] = {});
/** Effektiv spec för spelarens bil (med delar). */
function playerSpec(id, surface, equal) { const b = carSpec(id); return equal ? b : applyParts(b, perfOf(id), surface || 'asfalt'); }
function addKr(n) { save.kr = Math.max(0, (save.kr || 0) + Math.round(n)); }
function giveCar(id) { if (!owns(id)) { save.owned.push(id); return true; } return false; }
const fmtKr = (n) => Math.round(n).toLocaleString('sv-SE') + ' kr';
const reverseUnlocked = () => totalStars(save.career) >= 16;
/** Bana upplåst om den ingår i ett upplåst evenemang (eller man kört den). */
function trackUnlocked(key) {
  const t = trackById(key); if (!t) return false;
  if (t.reverse && !reverseUnlocked()) return false;
  return EVENTS.some(e => eventUnlocked(e, save.career) && e.tracks.some(k => k.split('@')[0] === t.def.id));
}
/** Medaljtider för tidskörning (sekunder per varv). */
function medalTimes(key) { const p = trackById(key).def.par; return [p * 0.86, p * 0.93, p * 1.0]; }
function medalFor(key, t) { if (!t) return ''; const m = medalTimes(key); return t <= m[0] ? '🥇' : t <= m[1] ? '🥈' : t <= m[2] ? '🥉' : ''; }
function allTrackKeys() { return TRACKS.map(t => t.id).concat(TRACKS.filter(t => !t.sprint).map(t => t.id + '@r')); }
if (!owns(save.car)) save.car = 'viggen';
persist();

/* ------------------------------------------------------------------ Efterbehandling */
let composer = null, bloomPass = null;
function setupComposer() {
  if (composer) { composer.dispose(); composer = null; bloomPass = null; }
  const q = settings.get('quality');
  if (q === 'high' || q === 'ultra') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(R.size.w, R.size.h), 0.4, 0.55, 0.86);
    // bloom i halv upplösning (mipkedjan börjar på 1/4) – ser likadant ut men sparar ~1 ms per bildruta
    const bloomSize = bloomPass.setSize.bind(bloomPass);
    bloomPass.setSize = (w, h) => bloomSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(R.size.w, R.size.h);
    if (race) { const th = race.track.theme; bloomPass.strength = th.bloom; bloomPass.threshold = th.night ? 0.82 : 0.9; }
  }
}
R.onResize((w, h) => { if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); } showroom.resize(w, h); if (race) buildTouch(); });
setupComposer();

/* ------------------------------------------------------------------ Utställningshall (menybakgrund + prispall) */
const showroom = (() => {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x070b18);
  sc.fog = new THREE.Fog(0x070b18, 18, 60);
  const pm = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const env = pm.fromScene(roomEnv, 0.04);
  roomEnv.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  pm.dispose();
  sc.environment = env.texture; sc.environmentIntensity = 0.7;
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x0c1224, roughness: 0.3, metalness: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.45, 0.14, 64), new THREE.MeshStandardMaterial({ color: 0x1a2444, metalness: 0.7, roughness: 0.25 }));
  disc.position.y = 0.07; disc.receiveShadow = true; sc.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcc33).multiplyScalar(1.5) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; sc.add(ring);
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(5, 9, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); key.shadow.bias = -0.0005;
  sc.add(key);
  const rim = new THREE.DirectionalLight(0x6aa8ff, 1.8); rim.position.set(-6, 3, -7); sc.add(rim);
  const warm = new THREE.DirectionalLight(0xffb070, 0.9); warm.position.set(7, 2, -3); sc.add(warm);
  sc.add(new THREE.HemisphereLight(0x8899cc, 0x111122, 0.4));
  const turn = new THREE.Group(); turn.position.y = 0.14; sc.add(turn);
  const podium = new THREE.Group(); podium.visible = false; sc.add(podium);
  const confetti = new Particles(sc, 900, false);
  let model = null, modelKey = '', angle = 0.7, mode = 'car', podCars = [], time = 0, confT = 0;
  const pmat = new THREE.MeshStandardMaterial({ color: 0x1f2b50, metalness: 0.4, roughness: 0.4 });
  const numMats = [];
  const drag = { on: false, x: 0, v: 0, t: 0 };
  root.addEventListener('pointerdown', e => { if (race || mode !== 'car' || e.target.closest('.g3-panel, button, input, select, a, .fj-carinfo, .fj-crateov')) return; drag.on = true; drag.x = e.clientX; drag.t = performance.now(); });
  addEventListener('pointermove', e => { if (!drag.on) return; drag.v += (e.clientX - drag.x) * 0.01; drag.x = e.clientX; drag.t = performance.now(); });
  addEventListener('pointerup', () => { drag.on = false; });
  function clearPodium() { podCars.forEach(m => { podium.remove(m.root); disposeCarModel(m); }); podCars = []; }
  return {
    scene: sc, cam,
    setCar(id, look) {
      const k = id + ':' + JSON.stringify(look || null);
      if (k === modelKey && model) return;
      if (model) { turn.remove(model.root); disposeCarModel(model); }
      const q = settings.get('quality');
      model = buildCarModel(carSpec(id), look || lookOf(id), { quality: q === 'low' ? 'medium' : q === 'medium' ? 'high' : q });
      model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      turn.add(model.root); modelKey = k;
    },
    showCar() { mode = 'car'; podium.visible = false; turn.visible = true; disc.visible = true; ring.visible = true; clearPodium(); confetti.clear(); },
    showPodium(entries) {
      mode = 'podium'; turn.visible = false; disc.visible = false; ring.visible = false; podium.visible = true; clearPodium();
      while (podium.children.length) { const c = podium.children[0]; podium.remove(c); if (c.geometry) c.geometry.dispose(); }
      const H = [1.25, 0.85, 0.55], X = [0, -4.6, 4.6];
      entries.slice(0, 3).forEach((e, k) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(4.3, H[k], 3.4), pmat); b.position.set(X[k], H[k] / 2, 0); b.receiveShadow = true; b.castShadow = true; podium.add(b);
        if (!numMats[k]) numMats[k] = new THREE.MeshBasicMaterial({ map: TX.numberTex(k + 1), transparent: true });
        const n = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), numMats[k]); n.position.set(X[k], H[k] / 2, 1.71); podium.add(n);
        const m = buildCarModel(carSpec(e.car), e.look || e.color, { quality: 'high' });
        m.root.position.set(X[k], H[k], 0); m.root.rotation.y = 0.35 * (k === 1 ? 1 : k === 2 ? -1 : 0) + Math.PI * 0.08;
        m.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
        podium.add(m.root); podCars.push(m);
      });
      time = 0; confT = 0;
    },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    render(dt) {
      time += dt;
      const wide = R.size.w > 760;
      if (mode === 'car') {
        if (!drag.on) angle += dt * (performance.now() - drag.t < 2500 ? 0 : 0.35);
        angle += drag.v; drag.v = 0;
        turn.rotation.y = angle;
        const d = 10.8 * Math.max(1, 1.45 / cam.aspect);
        cam.position.set(Math.sin(0.6) * d, 2.2 + (d - 10.8) * 0.12, Math.cos(0.6) * d);
        cam.lookAt(wide ? -1.9 : 0, 0.7, wide ? 1.1 : 0);
      } else {
        const a = 0.25 + Math.sin(time * 0.25) * 0.3;
        const d = wide ? 22 : 19;
        cam.position.set(Math.sin(a) * d, 4.8, Math.cos(a) * d);
        if (wide) { _v1.set(-Math.cos(a), 0, Math.sin(a)).multiplyScalar(5.2); cam.lookAt(_v1.x, 1.5, _v1.z); } else cam.lookAt(0, 1.5, 0);
        confT -= dt;
        if (confT <= 0 && time < 14) {
          confT = 0.03;
          const cols = [[1, 0.8, 0.2], [0.2, 0.8, 1], [1, 0.3, 0.4], [0.3, 1, 0.5], [1, 1, 1]];
          for (let k = 0; k < 4; k++) { const c = cols[(Math.random() * cols.length) | 0]; confetti.spawn((Math.random() - 0.5) * 14, 9 + Math.random() * 2, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, 4, 0.12, 0.12, c[0], c[1], c[2], 1, 0.6, 1.2); }
        }
      }
      confetti.setScale(R.size.h);
      confetti.update(dt);
      renderer.toneMappingExposure = 1.0;
      renderer.render(sc, cam);
    }
  };
})();
showroom.resize(R.size.w, R.size.h);
/* Lådöppning i 3D (egen scen, samma renderare) */
const crateFx = createCrateStage({ renderer, settings, audio, env: showroom.scene.environment, root, size: R.size,
  buildCar: (id, look) => buildCarModel(carSpec(id), look || lookOf(id), { quality: 'high' }), disposeCar: disposeCarModel });
R.onResize((w, h) => crateFx.resize(w, h));

/* ------------------------------------------------------------------ Pekkontroller */
const touch = { stick: { x: 0 } };
const touchOn = () => { const t = settings.get('touchControls'); return t === 'on' || (t === 'auto' && isTouch); };
function buildTouch() {
  const el = $('touch'); el.innerHTML = '';
  ['TLeft', 'TRight', 'TGas', 'TBrake', 'THand', 'TNitro', 'TCam', 'TReset'].forEach(c => { input.virtual[c] = false; });
  touch.stick.x = 0;
  const on = touchOn();
  document.body.classList.toggle('touch', on);
  el.classList.toggle('on', on && !!race);
  $('pauseBtn').classList.toggle('hidden', !race);
  if (!on) return;
  const btn = (code, label, st, cls = '') => {
    const b = document.createElement('div'); b.className = 'fj-t ' + cls; b.textContent = label; Object.assign(b.style, st); el.appendChild(b);
    const dn = (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (er) {} if (!input.virtual[code]) input._pressed.add(code); input.virtual[code] = true; b.classList.add('down'); };
    const up = () => { input.virtual[code] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    return b;
  };
  const narrow = R.size.w < 520;
  const B = narrow ? { w: 70, gap: 6, gas: 76, br: 64 } : { w: 84, gap: 10, gas: 88, br: 78 };
  if (settings.get('touchSteer') === 'stick') {
    const z = document.createElement('div'); z.className = 'fj-stickzone'; el.appendChild(z);
    let id = null, ox = 0, knob = null;
    z.addEventListener('pointerdown', e => {
      e.preventDefault(); id = e.pointerId; ox = e.clientX; try { z.setPointerCapture(id); } catch (er) {}
      knob = document.createElement('div'); knob.className = 'g3-stick'; knob.innerHTML = '<i></i>';
      const r = el.getBoundingClientRect(); knob.style.left = (e.clientX - r.left) + 'px'; knob.style.top = (e.clientY - r.top) + 'px'; el.appendChild(knob);
    });
    z.addEventListener('pointermove', e => { if (e.pointerId !== id) return; const dx = clamp(e.clientX - ox, -55, 55); touch.stick.x = dx / 55; if (knob) knob.firstChild.style.transform = `translate(${dx}px,0)`; });
    const end = (e) => { if (e.pointerId !== id) return; id = null; touch.stick.x = 0; if (knob) { knob.remove(); knob = null; } };
    z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end);
  } else {
    btn('TLeft', '◀', { left: '10px', bottom: '18px', width: B.w + 'px', height: B.w + 'px' }, 'big');
    btn('TRight', '▶', { left: (10 + B.w + B.gap) + 'px', bottom: '18px', width: B.w + 'px', height: B.w + 'px' }, 'big');
  }
  btn('TGas', 'GAS', { right: '10px', bottom: '18px', width: B.gas + 'px', height: '104px' }, 'big');
  btn('TBrake', 'BROMS', { right: (10 + B.gas + B.gap) + 'px', bottom: '18px', width: B.br + 'px', height: '64px' });
  btn('THand', 'DRIFT', { right: (10 + B.gas + B.gap) + 'px', bottom: '90px', width: B.br + 'px', height: '56px' });
  btn('TNitro', 'NITRO', { right: '10px', bottom: '130px', width: B.gas + 'px', height: '56px' });
  btn('TCam', '🎥', { left: '10px', top: '118px', width: '44px', height: '44px' });
  btn('TReset', '↺', { left: '10px', top: '170px', width: '44px', height: '44px' });
}
settings.onChange(k => { if (k === 'touchControls' || k === 'touchSteer') buildTouch(); if (k === 'quality') setupComposer(); });
$('pauseBtn').addEventListener('click', () => { if (race && !uiPaused()) pauseGame(true); });

/* ------------------------------------------------------------------ Ljud */
const snd = { engine: null, engine2: null, screech: null, squeal: null, wind: null, rev: 0 };
const LOOPS = ['engine', 'engine2', 'screech', 'squeal', 'wind'];
function startLoops() { stopLoops(); snd.engine = engineVoice(audio); snd.engine2 = engineVoice(audio, { body: 280 }); snd.screech = audio.loop('wind'); snd.squeal = audio.loop('hum'); snd.wind = audio.loop('wind'); }
function stopLoops() { LOOPS.forEach(k => { if (snd[k]) { snd[k].stop(); snd[k] = null; } }); }
function muteLoops() { LOOPS.forEach(k => snd[k] && snd[k].set({ vol: 0 })); }
const GEARS = [0, 0.16, 0.31, 0.47, 0.63, 0.81, 1.25];
function engineState(car, throttle) {
  const v = car.drift ? Math.max(car.vf, car.speed * 1.04) : car.vf, top = car.spec.top; // i drift: hjulen spinner – varvet ska inte sjunka
  if (v < -0.5) return { rpm: 0.3 + Math.min(0.5, -v / 14), gear: 'B' };
  let g = 1; while (g < 6 && v > GEARS[g] * top) g++;
  const lo = GEARS[g - 1] * top * 0.75, hi = GEARS[g] * top;
  let r = 0.22 + 0.78 * clamp((v - lo) / (hi - lo), 0, 1);
  if (v < 1) r = 0.2 + throttle * 0.6;
  return { rpm: r, gear: v < 0.5 && throttle < 0.1 ? 'N' : String(g) };
}

/* ------------------------------------------------------------------ Skärmar */
const SCREENS = ['loading', 'menu', 'setup', 'settingsScr', 'help', 'pause', 'results', 'online', 'career', 'garage', 'dealer', 'crates'];
const isRace = (m) => m === 'quick' || m === 'cup' || m === 'online' || m === 'career';
const isAiKey = (k) => /^ai\d$/.test(k || '');
function screen(id) { SCREENS.forEach(s => s === id ? show(s) : hide(s)); }
let backTo = 'menu';
const esc = (t) => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const starTxt = (n, max = 3) => '<span class="fj-stars">' + '★'.repeat(n) + '<i>' + '★'.repeat(Math.max(0, max - n)) + '</i></span>';
const crateCount = () => (save.crates || []).length;

function updateMenu() {
  const b = bestScore(ID);
  const stars = totalStars(save.career), maxStars = EVENTS.length * 3;
  $('mWallet').innerHTML = `<span>💰 ${fmtKr(save.kr || 0)}</span><span>⭐ ${stars}/${maxStars}</span><span>🚗 ${save.owned.length}/${CARS.length}</span>`;
  $('mBest').textContent = b > 0 ? `Ditt rekord: ${Spelhallen.fmt(b)} poäng` : 'Tips: börja i Karriären – vinn kronor, lådor och nya bilar.';
  $('mCrates').innerHTML = `<span class="ic" aria-hidden="true">🎁</span>Lådor${crateCount() ? ` <b class="fj-badge">${crateCount()}</b>` : ''}`;
  const run = save.cupRun, ev = run && eventById(run.id);
  $('mPlay').innerHTML = ev ? `<span class="ic" aria-hidden="true">▶</span>Fortsätt ${esc(ev.name)} (lopp ${run.idx + 1}/${ev.tracks.length})` : '<span class="ic" aria-hidden="true">🏆</span>Karriär';
}
function quickPlay() {
  if (save.cupRun && eventById(save.cupRun.id)) return continueCup();
  openCareer();
}
function toMenu() {
  if (net && net.status !== 'idle') net.leave();
  if (ol.emo) { ol.emo.destroy(); ol.emo = null; }
  ol.results = null;
  if (race) endSession(true);
  disposeRace();
  showroom.showCar(); showroom.setCar(save.car, lookOf(save.car));
  screen('menu'); updateMenu();
  audio.music('adventure');
  hudEl.classList.add('hidden'); buildTouch();
}

/* ---------- statistikstaplar (före/efter) ---------- */
const STATS = [
  ['Toppfart', s => s.top, 44, 82, s => Math.round(s.top * 3.6) + ' km/h'],
  ['Acceleration', s => s.accel, 7, 17, s => s.accel.toFixed(1)],
  ['Grepp', s => s.grip, 13, 20, s => s.grip.toFixed(1)],
  ['Bromsar', s => s.brake, 18, 33, s => s.brake.toFixed(0)],
  ['Drift', s => s.drift, 0.8, 1.75, s => s.drift.toFixed(2)],
  ['Vikt', s => s.mass, 0.5, 1.8, s => Math.round(s.mass * 1250) + ' kg']
];
function statBars(base, eff) {
  eff = eff || base;
  const pb = perfIndex(base), pe = perfIndex(eff);
  let h = `<div class="fj-pi"><b class="pc pc-${piClass(pe)}">${piClass(pe)} ${pe}</b>${pe !== pb ? `<small>standard ${piClass(pb)} ${pb}</small>` : ''}</div>`;
  for (const [label, f, a, b, fmt] of STATS) {
    const v0 = clamp((f(base) - a) / (b - a), 0.03, 1), v1 = clamp((f(eff) - a) / (b - a), 0.03, 1);
    const up = v1 > v0 + 0.001, dn = v1 < v0 - 0.001;
    h += `<div class="fj-stat"><span>${label}</span><i><em style="width:${Math.round(Math.min(v0, v1) * 100)}%"></em>${up || dn ? `<u class="${up ? 'up' : 'dn'}" style="left:${Math.round(Math.min(v0, v1) * 100)}%;width:${Math.round(Math.abs(v1 - v0) * 100)}%"></u>` : ''}</i><small>${fmt(eff)}</small></div>`;
  }
  return h;
}
function carHead(spec) {
  const cl = CLASSES.find(c => c.id === spec.klass) || CLASSES[0];
  return `<h3>${esc(spec.name)}</h3><div class="k"><span class="fj-cls" style="--c:${cl.color}">${cl.icon} ${spec.klass}</span> · Årsmodell ${spec.year}</div>`;
}

/* ---------- Val-skärm (snabblopp, tidskörning, fri körning) ---------- */
let setup = null;
function openSetup(mode) {
  setup = { mode, track: save.track, car: save.car, laps: save.laps, diff: save.diff, opp: save.opp };
  if (mode === 'time') setup.track = save.tt || save.track;
  if (!trackUnlocked(setup.track)) setup.track = 'midsommar';
  if (!owns(setup.car)) setup.car = 'viggen';
  $('setupTitle').textContent = { quick: 'Snabblopp', time: 'Tidskörning', free: 'Fri körning' }[mode];
  renderSetup();
  screen('setup');
  showroom.showCar();
}
function seg(label, items, cur, onPick) {
  return `<div class="fj-sec"><label>${label}</label><div class="fj-seg" data-seg="${onPick}">${items.map(([v, t]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
}
function trackTag(def) {
  const bits = [];
  if (def.sprint) bits.push('Sprint');
  if (def.surface && def.surface !== 'asfalt') bits.push(SURFACE_NAME[def.surface] || def.surface);
  const th = THEMES_LABEL(def); if (th) bits.push(th);
  return bits.join(' · ');
}
function THEMES_LABEL(def) { const th = trackThemes[def.theme]; return th ? (th.night ? 'Natt' : '') + (th.weather === 'rain' ? (th.night ? ', regn' : 'Regn') : th.weather === 'snow' ? (th.night ? ', snö' : 'Snöfall') : '') : ''; }
function carCards(ids, cur) {
  return `<div class="fj-cards">` + ids.map(id => {
    const c = carSpec(id), pi = perfIndex(c);
    return `<button class="fj-card ${cur === id ? 'on' : ''}" data-car="${id}"><span class="tag pc pc-${piClass(pi)}">${piClass(pi)}</span><b>${esc(c.name)}</b><small>${c.klass} · ${c.year}</small><span class="sw" style="background:${css(lookOf(id).color)}"></span></button>`;
  }).join('') + `</div>`;
}
function renderSetup() {
  const s = setup; let h = '';
  const keys = allTrackKeys().filter(k => !trackById(k).reverse || reverseUnlocked());
  h += `<div class="fj-sec"><label>Bana</label><div class="fj-cards">` + keys.map(k => {
    const t = trackById(k), un = trackUnlocked(k);
    const best = save.best[k];
    return `<button class="fj-card ${s.track === k ? 'on' : ''} ${un ? '' : 'locked'}" data-track="${k}"><span class="tag">${un ? medalFor(k, best) : '🔒'}</span><b>${trackName(k)}</b><small>${best ? 'Bästa varv ' + fmtTime(best) : (trackTag(t.def) || '&nbsp;')}</small><span class="sw" style="background:${themeSwatch(t.def.theme)}"></span></button>`;
  }).join('') + `</div><p class="fj-desc">${trackById(s.track).def.desc}${trackById(s.track).reverse ? ' Körs baklänges.' : ''}${trackById(s.track).def.region ? ' <i>(' + trackById(s.track).def.region + ')</i>' : ''}</p>` +
    (s.mode === 'time' ? `<p class="fj-desc">Medaljtider: ${medalTimes(s.track).map((t, k) => ['🥇', '🥈', '🥉'][k] + ' ' + fmtTime(t)).join(' · ')}</p>` : '') +
    (s.mode === 'free' ? `<p class="fj-desc">🎁 Gömda lådor på banan: ${3 - crateSpotsFound(s.track)} kvar att hitta.</p>` : '') + `</div>`;
  if (s.mode === 'quick') {
    h += seg('Svårighetsgrad', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.label]), s.diff, 'diff');
    if (!trackById(s.track).def.sprint) h += seg('Varv', [1, 2, 3, 4, 5, 6].map(n => [n, n]), s.laps, 'laps');
    h += seg('Motståndare', [1, 3, 5, 7].map(n => [n, n]), s.opp, 'opp');
  }
  h += `<div class="fj-sec"><label>Bil (utseende och delar ändras i Garaget)</label>${carCards(save.owned, s.car)}</div>`;
  $('setupBody').innerHTML = h;
  const go = $('setupGo');
  go.textContent = 'Starta';
  go.disabled = !owns(s.car) || !trackUnlocked(s.track);
  showroom.setCar(s.car, lookOf(s.car));
  const def = trackById(s.track).def;
  $('carInfo').innerHTML = carHead(carSpec(s.car)) + statBars(carSpec(s.car), playerSpec(s.car, def.surface)) + `<p class="fj-desc">${esc(carSpec(s.car).desc)}</p>`;
}
const SW = { midsommar: 'linear-gradient(90deg,#f4d2a0,#4e7d2f)', skargard: 'linear-gradient(90deg,#2f72d2,#b59484)', odemark: 'linear-gradient(90deg,#ff9448,#d7a96a)', fjall: 'linear-gradient(90deg,#1a56b8,#f1f5fa)', stad: 'linear-gradient(90deg,#2b1d40,#ff4fb0)', is: 'linear-gradient(90deg,#15405c,#2cff9a)' };
function themeSwatch(th) {
  if (SW[th]) return SW[th];
  const t = trackThemes[th]; if (!t) return '#555';
  return `linear-gradient(90deg,${css(t.sky.top)},${css(t.sky.horizon)},${css(t.fog.color)})`;
}
$('setupBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const s = setup;
  if (b.classList.contains('locked')) { audio.play('error'); toast('Låst – lås upp banan i Karriären'); return; }
  if (b.dataset.track) s.track = b.dataset.track;
  else if (b.dataset.car) s.car = b.dataset.car;
  else if (b.dataset.v != null) { const k = b.parentNode.dataset.seg; s[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; }
  audio.play('click');
  renderSetup();
});
$('setupGo').addEventListener('click', () => {
  const s = setup; audio.play('select');
  Object.assign(save, { car: s.car, diff: s.diff, laps: s.laps, opp: s.opp });
  if (s.mode === 'time') save.tt = s.track; else save.track = s.track;
  persist();
  const sprint = trackById(s.track).def.sprint;
  startRace({ mode: s.mode, track: s.track, laps: s.mode === 'quick' ? (sprint ? 1 : s.laps) : 0, diff: s.diff, car: s.car, opp: s.mode === 'quick' ? s.opp : 0 });
});
$('setupBack').addEventListener('click', () => { audio.play('click'); screen('menu'); updateMenu(); });

/* ---------- Karriär ---------- */
let careerSel = null;
function unlockedTrackIds() { return TRACKS.map(t => t.id).filter(id => trackUnlocked(id)); }
function todaysDaily() {
  if (!save.daily || save.daily.day !== todayKey()) save.daily = { day: todayKey(), done: [] };
  return dailyChallenges(unlockedTrackIds());
}
function findEvent(id) { return eventById(id) || todaysDaily().find(e => e.id === id); }
function eventCars(e) {
  if (e.type !== 'klass') return save.owned.slice();
  const own = save.owned.filter(id => carSpec(id).klass === e.klass);
  return own.length ? own : [CARS.find(c => c.klass === e.klass).id];
}
function openCareer() {
  const ds = todaysDaily();
  if (!careerSel || !findEvent(careerSel.id)) {
    const first = EVENTS.find(e => eventUnlocked(e, save.career) && !(save.career[e.id] >= 3)) || EVENTS[0];
    careerSel = { id: first.id, car: null };
  }
  renderCareer(ds);
  screen('career'); showroom.showCar();
}
function evCard(e, extraCls = '') {
  const un = e.daily || eventUnlocked(e, save.career);
  const st = e.daily ? (save.daily.done.includes(e.id) ? 3 : 0) : (save.career[e.id] || 0);
  const t = ETYPES[e.type];
  return `<button class="fj-card fj-ev ${careerSel.id === e.id ? 'on' : ''} ${un ? '' : 'locked'} ${extraCls}" data-ev="${e.id}"><span class="tag">${un ? (e.daily ? (st ? '✅' : '') : starTxt(st)) : '🔒'}</span><b>${t.icon} ${esc(e.name)}</b><small>${t.name}${e.klass ? ' · ' + e.klass : ''} · ${e.tracks.map(trackName).join(', ')}</small></button>`;
}
function renderCareer(ds) {
  ds = ds || todaysDaily();
  const stars = totalStars(save.career);
  let h = `<div class="fj-wallet"><span>💰 ${fmtKr(save.kr)}</span><span>⭐ ${stars}/${EVENTS.length * 3}</span></div>`;
  h += `<div class="fj-sec"><label>Dagens utmaningar (${todayKey()})</label><div class="fj-cards">${ds.map(e => evCard(e, 'daily')).join('')}</div></div>`;
  for (const ch of CHAPTERS) {
    const un = chapterUnlocked(ch, save.career);
    const evs = EVENTS.filter(e => e.ch === ch.id);
    const got = evs.reduce((a, e) => a + (save.career[e.id] || 0), 0);
    h += `<div class="fj-sec"><label>${ch.name} ${un ? `· ${got}/${evs.length * 3} ★` : `· 🔒 kräver ${ch.req} ★`}</label><div class="fj-cards">${evs.map(e => evCard(e)).join('')}</div></div>`;
  }
  $('careerBody').innerHTML = h;
  const e = findEvent(careerSel.id);
  const cars = eventCars(e);
  if (!careerSel.car || !cars.includes(careerSel.car)) careerSel.car = cars.includes(save.car) ? save.car : cars[0];
  const loaner = !owns(careerSel.car);
  const t = ETYPES[e.type], un = e.daily || eventUnlocked(e, save.career);
  const def0 = trackById(e.tracks[0]).def;
  let info = `<h3>${t.icon} ${esc(e.name)}</h3><div class="k">${t.name}${e.daily ? ' · Daglig utmaning' : ' · ' + chapterOf(e).name.split(' – ')[0]}</div><p class="fj-desc">${t.desc}</p>`;
  info += `<p class="fj-desc"><b>Banor:</b> ${e.tracks.map(trackName).join(' → ')}<br>`;
  if (e.type === 'elim') info += `<b>Förare:</b> ${(e.opp || 5) + 1} · ${e.opp || 5} varv`;
  else info += `<b>Varv:</b> ${e.laps || 1}${e.opp ? ` · <b>Motståndare:</b> ${e.opp}` : e.type === 'duel' ? ` · <b>Motståndare:</b> ${esc(e.rival.name)} i ${esc(carSpec(e.rival.car).name)}` : ''}`;
  if (e.type === 'tid' || e.type === 'rally') info += `<br><b>Måltider:</b> ${e.tgt.map((m, k) => ['🥇', '🥈', '🥉'][k] + ' ' + fmtTime(m * def0.par * (e.laps || 1))).join(' · ')}`;
  if (e.type === 'drift') info += `<br><b>Driftpoäng:</b> ${e.tgt.map((m, k) => ['🥇', '🥈', '🥉'][k] + ' ' + m).join(' · ')}`;
  info += `</p><p class="fj-desc"><b>Belöning:</b> ${rewardText(e, id => carSpec(id).name).join(' · ')}</p>`;
  if (!e.daily) info += `<p class="fj-desc">Ditt bästa: ${starTxt(save.career[e.id] || 0)}</p>`;
  $('careerInfo').innerHTML = info;
  $('careerCars').innerHTML = `<label>${loaner ? 'Lånebil (du har ingen ' + e.klass + '-bil)' : 'Välj bil'}</label>` + carCards(cars, careerSel.car);
  $('careerGo').disabled = !un;
  $('careerGo').textContent = un ? 'Starta' : '🔒 Låst';
  showroom.setCar(careerSel.car, loaner ? { color: DEF_COL[careerSel.car] ?? 0xcccccc } : lookOf(careerSel.car));
}
$('careerBody').addEventListener('click', e => {
  const b = e.target.closest('button[data-ev]'); if (!b) return;
  careerSel = { id: b.dataset.ev, car: careerSel.car }; audio.play('click'); renderCareer();
  if (b.classList.contains('locked')) toast('Låst – samla fler stjärnor');
});
$('careerCars').addEventListener('click', e => { const b = e.target.closest('button[data-car]'); if (!b) return; careerSel.car = b.dataset.car; audio.play('click'); renderCareer(); });
$('careerGo').addEventListener('click', () => { audio.play('select'); startEvent(findEvent(careerSel.id), careerSel.car); });
$('careerBack').addEventListener('click', () => { audio.play('click'); toMenu(); });
function startEvent(e, carId) {
  if (owns(carId)) { save.car = carId; persist(); }
  const diff = e.daily ? (save.diff || 'medium') : chapterOf(e).diff;
  if (e.type === 'cup') return startCup(e, diff, carId);
  const solo = e.type === 'tid' || e.type === 'rally' || e.type === 'drift';
  const opp = e.type === 'duel' ? 1 : solo ? 0 : (e.opp || 5);
  const laps = e.type === 'elim' ? opp : (e.laps || 1);
  startRace({ mode: 'career', ev: e.id, evObj: e.daily ? e : null, etype: e.type, track: e.tracks[0], laps, diff, car: carId, loaner: !owns(carId), opp, klass: e.klass || null });
}

/* ---------- Garage ---------- */
const gar = { car: null, tab: 'perf' };
function openGarage() { gar.car = owns(save.car) ? save.car : save.owned[0]; renderGarage(); screen('garage'); showroom.showCar(); }
function ownedOf(cat) { return save.parts.filter(k => k.startsWith(cat)); }
function partBtn(key, on, locked) {
  const info = partInfo(key); const r = RARITIES[info.rar];
  return `<button class="fj-part ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-part="${key}" style="--r:${r.color}"><b>${esc(info.name)}</b><small>${r.name}</small></button>`;
}
function renderGarage() {
  const id = gar.car, spec = carSpec(id), lk = lookOf(id), pf = perfOf(id);
  let h = `<div class="fj-wallet"><span>💰 ${fmtKr(save.kr)}</span><span>🧩 ${save.parts.length} delar</span><span>🎁 ${crateCount()} lådor</span></div>`;
  h += `<div class="fj-sec"><label>Dina bilar</label>${carCards(save.owned, id)}</div>`;
  h += `<div class="fj-seg fj-tabs" data-tab="1"><button data-t="perf" class="${gar.tab === 'perf' ? 'on' : ''}">🔧 Prestanda</button><button data-t="look" class="${gar.tab === 'look' ? 'on' : ''}">🎨 Utseende</button></div>`;
  if (gar.tab === 'perf') {
    for (const c of PERF) {
      const keys = ownedOf('p:' + c.id + ':').sort((a, b) => partInfo(b).rar - partInfo(a).rar);
      h += `<div class="fj-sec"><label>${c.icon} ${c.name} – <span class="fj-muted">${c.desc}</span></label><div class="fj-parts"><button class="fj-part ${!pf[c.id] ? 'on' : ''}" data-part="none:${c.id}"><b>Standard</b><small>Original</small></button>${keys.map(k => partBtn(k, pf[c.id] === k)).join('') || '<span class="fj-muted">Inga hittade ännu – öppna lådor!</span>'}</div></div>`;
    }
  } else {
    h += `<div class="fj-sec"><label>Lackfärg</label><div class="fj-swatches">${COLORS.map(c => `<button class="${lk.color === c.hex ? 'on' : ''}" data-col="${c.hex}" title="${c.name}" aria-label="${c.name}" style="background:${css(c.hex)}"></button>`).join('')}<label class="fj-custom" title="Egen färg"><input type="color" id="gCol" value="${css(lk.color)}"><span>Egen</span></label></div></div>`;
    const lookRow = (cat, curId, stdName) => {
      const c = lookCat(cat);
      return `<div class="fj-sec"><label>${c.icon} ${c.name}</label><div class="fj-parts"><button class="fj-part ${!curId ? 'on' : ''}" data-look="${cat}:"><b>${stdName}</b><small>Standard</small></button>${c.items.map(it => { const key = `l:${cat}:${it.id}`; const own = save.parts.includes(key); return partBtn(key, String(curId) === String(it.id), !own).replace('data-part=', 'data-look-key="' + key + '" data-x='); }).join('')}</div></div>`;
    };
    h += lookRow('finish', lk.finish && lk.finish !== 'gloss' ? lk.finish : '', 'Blank');
    h += lookRow('rims', lk.rims && lk.rims !== 'std' ? lk.rims : '', 'Original');
    h += lookRow('spoiler', lk.spoiler && lk.spoiler !== 'default' ? lk.spoiler : '', 'Original');
    h += lookRow('kit', lk.kit && lk.kit !== 'none' ? lk.kit : '', 'Original');
    h += lookRow('decal', lk.decal && lk.decal !== 'none' ? lk.decal : '', 'Ingen');
    h += `<div class="fj-sec"><label>Dekalfärg</label><div class="fj-swatches">${[0xffffff, 0x111111, 0xffcc33, 0xff3b30, 0x39d5ff, 0x4ade80, 0xff7ad0, 0xf06b12].map(c => `<button class="${(lk.decalColor ?? 0xffffff) === c ? 'on' : ''}" data-dcol="${c}" style="background:${css(c)}"></button>`).join('')}</div></div>`;
    h += lookRow('neon', lk.neon != null ? '0x' + lk.neon.toString(16).padStart(6, '0') : '', 'Inget');
    h += lookRow('tint', lk.tint && lk.tint !== 'clear' ? lk.tint : '', 'Ljus');
    h += `<div class="fj-sec fj-row2"><label>Startnummer <input type="number" id="gNum" min="0" max="99" value="${lk.number || 0}"></label><label>Registreringsskylt <input type="text" id="gPlate" maxlength="7" value="${esc(lk.plate || '')}"></label></div>`;
  }
  $('garageBody').innerHTML = h;
  showroom.setCar(id, lk);
  $('garageInfo').innerHTML = carHead(spec) + statBars(spec, applyParts(spec, pf, 'asfalt')) + `<p class="fj-desc">${esc(spec.desc)}</p><p class="fj-note2">Dra i bilden för att vrida bilen. Staplarna visar standard (grå) och med dina delar (grönt = bättre, rött = sämre). Däckens effekt beror på underlaget.</p>`;
}
function setLook(patch) {
  const lk = lookOf(gar.car); Object.assign(lk, patch); persist(); renderGarage();
}
$('garageBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.car) { gar.car = b.dataset.car; save.car = gar.car; persist(); audio.play('click'); return renderGarage(); }
  if (b.dataset.t) { gar.tab = b.dataset.t; audio.play('click'); return renderGarage(); }
  if (b.dataset.part) {
    const pf = perfOf(gar.car);
    if (b.dataset.part.startsWith('none:')) delete pf[b.dataset.part.slice(5)];
    else { const info = partInfo(b.dataset.part); if (pf[info.cat] === info.key) delete pf[info.cat]; else pf[info.cat] = info.key; }
    audio.play('pickup', { vol: 0.5 }); persist(); return renderGarage();
  }
  if (b.dataset.lookKey) {
    if (b.classList.contains('locked')) { audio.play('error'); toast('Inte hittad än – finns i lådor'); return; }
    const info = partInfo(b.dataset.lookKey);
    const map = { finish: 'finish', rims: 'rims', spoiler: 'spoiler', kit: 'kit', decal: 'decal', tint: 'tint' };
    audio.play('pickup', { vol: 0.5 });
    if (info.cat === 'neon') return setLook({ neon: parseInt(info.id, 16) });
    return setLook({ [map[info.cat]]: info.id });
  }
  if (b.dataset.look != null) {
    const cat = b.dataset.look.split(':')[0];
    const reset = { finish: { finish: 'gloss' }, rims: { rims: 'std' }, spoiler: { spoiler: 'default' }, kit: { kit: 'none' }, decal: { decal: 'none' }, neon: { neon: null }, tint: { tint: 'clear' } }[cat];
    audio.play('click'); return setLook(reset);
  }
  if (b.dataset.col) { audio.play('click'); return setLook({ color: +b.dataset.col }); }
  if (b.dataset.dcol) { audio.play('click'); return setLook({ decalColor: +b.dataset.dcol }); }
});
$('garageBody').addEventListener('change', e => {
  if (e.target.id === 'gCol') setLook({ color: parseInt(e.target.value.slice(1), 16) });
  if (e.target.id === 'gNum') setLook({ number: clamp(Math.round(+e.target.value || 0), 0, 99) });
  if (e.target.id === 'gPlate') setLook({ plate: e.target.value.toUpperCase().replace(/[^A-ZÅÄÖ0-9 ]/g, '').slice(0, 7) || 'ABC 123' });
});
$('garageBack').addEventListener('click', () => { audio.play('click'); toMenu(); });

/* ---------- Bilhandel ---------- */
let dealSel = 'pixel';
function openDealer() { renderDealer(); screen('dealer'); showroom.showCar(); }
function renderDealer() {
  let h = `<div class="fj-wallet"><span>💰 ${fmtKr(save.kr)}</span><span>🚗 ${save.owned.length}/${CARS.length}</span></div>`;
  for (const cl of CLASSES) {
    const cars = CARS.filter(c => c.klass === cl.id); if (!cars.length) continue;
    h += `<div class="fj-sec"><label>${cl.icon} ${cl.id}</label><div class="fj-cards">${cars.map(c => {
      const own = owns(c.id), pi = perfIndex(c);
      return `<button class="fj-card ${dealSel === c.id ? 'on' : ''}" data-deal="${c.id}"><span class="tag pc pc-${piClass(pi)}">${piClass(pi)}</span><b>${esc(c.name)}</b><small>${own ? '✅ I garaget' : c.price == null ? '🏆 Kan bara vinnas' : fmtKr(c.price)}</small></button>`;
    }).join('')}</div></div>`;
  }
  $('dealerBody').innerHTML = h;
  const c = carSpec(dealSel), own = owns(c.id);
  showroom.setCar(c.id, own ? lookOf(c.id) : { color: DEF_COL[c.id] ?? 0xcccccc });
  $('dealerInfo').innerHTML = carHead(c) + statBars(c) + `<p class="fj-desc">${esc(c.desc)}</p>`;
  const buy = $('dealerBuy');
  buy.disabled = own || c.price == null || save.kr < c.price;
  buy.textContent = own ? 'Redan din' : c.price == null ? 'Vinns i karriären' : save.kr < c.price ? `Köp (${fmtKr(c.price)}) – för lite pengar` : `Köp för ${fmtKr(c.price)}`;
}
$('dealerBody').addEventListener('click', e => { const b = e.target.closest('button[data-deal]'); if (!b) return; dealSel = b.dataset.deal; audio.play('click'); renderDealer(); });
$('dealerBuy').addEventListener('click', () => {
  const c = carSpec(dealSel); if (owns(c.id) || c.price == null || save.kr < c.price) return;
  addKr(-c.price); giveCar(c.id); save.car = c.id; persist();
  audio.play('levelup'); toast('Ny bil i garaget: ' + c.name);
  renderDealer();
});
$('dealerBack').addEventListener('click', () => { audio.play('click'); toMenu(); });

/* ---------- Lådor ---------- */
function openCrates() { renderCrates(); screen('crates'); showroom.showCar(); }
function renderCrates() {
  const n = (t) => save.crates.filter(x => x === t).length;
  let h = `<div class="fj-wallet"><span>💰 ${fmtKr(save.kr)}</span><span>🧩 ${save.parts.length} delar</span></div>`;
  h += `<p class="fj-desc">Lådor vinner du i karriären och dagliga utmaningar – och några ligger gömda på banorna i Fri körning (kör in i dem!). Dubbletter växlas automatiskt mot kronor.</p><div class="fj-cratelist">`;
  for (const [id, c] of Object.entries(CRATES)) {
    h += `<div class="fj-crate" style="--c:${c.color}"><div class="fj-cratebox"></div><b>${c.name}</b><small>${n(id)} st</small><button class="btn ${n(id) ? 'primary' : ''}" data-open="${id}" ${n(id) ? '' : 'disabled'}>Öppna</button></div>`;
  }
  h += `</div><div class="fj-sec"><label>Sällsynthet</label><div class="fj-rar">${RARITIES.map(r => `<span style="--r:${r.color}">${r.name}</span>`).join('')}</div></div>`;
  $('cratesBody').innerHTML = h;
}
$('cratesBody').addEventListener('click', e => { const b = e.target.closest('button[data-open]'); if (b) openCrateAnim(b.dataset.open); });
$('cratesBack').addEventListener('click', () => { audio.play('click'); toMenu(); });
const LOOK_FIELD = { finish: 'finish', rims: 'rims', spoiler: 'spoiler', kit: 'kit', decal: 'decal', tint: 'tint' };
/** Stats-förändring om delen monteras på nuvarande bil. */
function partStatHtml(info) {
  const id = save.car, spec = carSpec(id), pf = perfOf(id);
  if (info.kind !== 'perf') return `<p class="fj-c3note">Utseende – fungerar på alla dina bilar. Bil: <b>${esc(spec.name)}</b></p>`;
  const cur = pf[info.cat], with_ = Object.assign({}, pf, { [info.cat]: info.key });
  const row = (label, a, b, fmt) => { const d = b - a; return Math.abs(d) < 0.005 ? '' : `<div class="fj-c3d"><span>${label}</span><small>${fmt(a)} → <b class="${d > 0 ? 'up' : 'dn'}">${fmt(b)}</b></small></div>`; };
  let h = '';
  const pb = perfIndex(applyParts(spec, pf, 'asfalt')), pa = perfIndex(applyParts(spec, with_, 'asfalt'));
  h += `<div class="fj-c3pi">${esc(spec.name)}: <b class="pc pc-${piClass(pb)}">${piClass(pb)} ${pb}</b> → <b class="pc pc-${piClass(pa)}">${piClass(pa)} ${pa}</b>${cur === info.key ? ' <em>(monterad)</em>' : ''}</div>`;
  if (info.cat === 'dack') {
    for (const sf of ['asfalt', 'grus', 'snö', 'is']) h += row('Grepp på ' + SURFACE_NAME[sf].toLowerCase(), applyParts(spec, pf, sf).grip, applyParts(spec, with_, sf).grip, v => v.toFixed(1));
  } else {
    const a = applyParts(spec, pf, 'asfalt'), b = applyParts(spec, with_, 'asfalt');
    for (const [label, f, , , fmt] of STATS) {
      const va = f(a), vb = f(b); if (Math.abs(vb - va) < 0.005) continue;
      const better = label === 'Vikt' ? vb < va : vb > va;
      h += `<div class="fj-c3d"><span>${label}</span><small>${fmt(a)} → <b class="${better ? 'up' : 'dn'}">${fmt(b)}</b></small></div>`;
    }
    if (a.nitroMul !== b.nitroMul) h += row('Nitro', a.nitroMul * 100, b.nitroMul * 100, v => Math.round(v) + ' %');
  }
  return h;
}
function partMounted(info) {
  if (info.kind === 'perf') return perfOf(save.car)[info.cat] === info.key;
  const lk = lookOf(save.car);
  if (info.cat === 'neon') return lk.neon === parseInt(info.id, 16);
  return String(lk[LOOK_FIELD[info.cat]]) === String(info.id);
}
function mountPart(info) {
  if (info.kind === 'perf') perfOf(save.car)[info.cat] = info.key;
  else if (info.cat === 'neon') lookOf(save.car).neon = parseInt(info.id, 16);
  else lookOf(save.car)[LOOK_FIELD[info.cat]] = info.id;
  persist(); showroom.setCar(save.car, lookOf(save.car));
  return true;
}
/** Bygger data för 3D-öppningen av en låda (res från openCrate). */
function crateData(type, res, dupKr) {
  const c = CRATES[type];
  const best = Math.max(...res.items.map(x => x.info.rar));
  const items = res.items.map(it => {
    const info = it.info, r = RARITIES[info.rar];
    return { kind: info.kind, cat: info.cat, id: info.id, tire: info.tire, rar: info.rar, color: r.color, rarName: r.name, name: info.name,
      sub: info.kind === 'perf' ? 'Prestanda' : 'Utseende · ' + info.catName, isNew: !it.dup, dupText: it.dup ? `Dubblett → +${fmtKr(r.sell)}` : '',
      statHtml: partStatHtml(info), canMount: true, mountLabel: `Montera nu`,
      isMounted: () => partMounted(info), mount: () => mountPart(info) };
  });
  if (res.car) items.push({ kind: 'car', carId: res.car, look: lookOf(res.car), rar: 4, color: RARITIES[4].color, rarName: RARITIES[4].name, name: carSpec(res.car).name, sub: 'Ny bil', isNew: true,
    statHtml: statBars(carSpec(res.car)), canMount: true, mountLabel: 'Kör den nu', isMounted: () => save.car === res.car, mount: () => { save.car = res.car; persist(); return true; } });
  items.push({ kind: 'coins', rar: 0, color: '#ffcc33', rarName: 'Kronor', name: `+${fmtKr(res.coins + dupKr)}`, sub: '',
    statHtml: `<p class="fj-c3note">${fmtKr(res.coins)} i lådan${dupKr ? ` · ${fmtKr(dupKr)} för dubbletter` : ''}. Saldo: <b>${fmtKr(save.kr)}</b></p>` });
  return {
    type, name: c.name, color: c.color, best, bestColor: RARITIES[best].color, items, carColor: lookOf(save.car).color ?? 0xb0281f,
    krText: `+${fmtKr(res.coins)} i lådan${dupKr ? ` · +${fmtKr(dupKr)} för dubbletter` : ''} · saldo ${fmtKr(save.kr)}`,
    nextLabel: () => { const t = nextCrateType(type); if (!t) return ''; const n = save.crates.filter(x => x === t).length; return `Öppna nästa (${CRATES[t].name}, ${n} kvar)`; },
    next: () => { const t = nextCrateType(type); return t ? rollCrate(t) : null; },
    onClose: () => { screen('crates'); renderCrates(); }
  };
}
function nextCrateType(type) { return save.crates.includes(type) ? type : save.crates[0] || null; }
/** Tar en låda ur förrådet, slumpar innehållet och sparar. */
function rollCrate(type) {
  const i = save.crates.indexOf(type); if (i < 0) return null;
  save.crates.splice(i, 1);
  const res = openCrate(type, save.parts);
  let dupKr = 0;
  for (const it of res.items) { if (it.dup) dupKr += RARITIES[it.info.rar].sell; else save.parts.push(it.key); }
  addKr(res.coins + dupKr); persist();
  return crateData(type, res, dupKr);
}
function openCrateAnim(type) {
  const d = rollCrate(type); if (!d) return;
  screen(null);
  audio.play('select');
  crateFx.open(d);
}

$('mPlay').addEventListener('click', () => { audio.play('select'); quickPlay(); });
$('mCareer').addEventListener('click', () => { audio.play('select'); openCareer(); });
$('mGarage').addEventListener('click', () => { audio.play('select'); openGarage(); });
$('mDealer').addEventListener('click', () => { audio.play('select'); openDealer(); });
$('mCrates').addEventListener('click', () => { audio.play('select'); openCrates(); });
$('mQuick').addEventListener('click', () => { audio.play('select'); openSetup('quick'); });
$('mTime').addEventListener('click', () => { audio.play('select'); openSetup('time'); });
$('mFree').addEventListener('click', () => { audio.play('select'); openSetup('free'); });
$('mOnline').addEventListener('click', () => { audio.play('select'); openOnline(); });
$('mHelp').addEventListener('click', () => { audio.play('click'); backTo = 'menu'; screen('help'); });
$('mSettings').addEventListener('click', () => { audio.play('click'); openSettings('menu'); });
$('helpBack').addEventListener('click', () => { audio.play('click'); screen(backTo); });
function openSettings(from) {
  backTo = from;
  buildSettings($('settingsBody'), settings, [
    { key: 'autoGas', label: 'Automatisk gas (pekskärm)', type: 'check' },
    { key: 'touchSteer', label: 'Pekstyrning', type: 'select', options: [['buttons', 'Pilknappar'], ['stick', 'Styrspak']] },
    { key: 'shake', label: 'Skärmskakning', type: 'check' },
    { key: 'speedFx', label: 'Fartlinjer', type: 'check' }
  ], { hide: ['sensitivity', 'invertY'] });
  screen('settingsScr');
}
$('settingsBack').addEventListener('click', () => { audio.play('click'); screen(backTo); if (backTo === 'menu') updateMenu(); });

/* ---------- Paus ---------- */
function uiPaused() { return race && race.online ? !!race.menu : paused; }
function pauseGame(on) {
  if (!race) return;
  if (race.online) {
    // online: simuleringen fortsätter – bara ett överlägg (och ingen styrning)
    race.menu = on; input.clear();
    if (on) {
      $('pauseInfo').textContent = trackName(race.cfg.track) + ' · Online – loppet fortsätter medan menyn är öppen';
      $('pRestart').classList.add('hidden'); $('pMenu').textContent = 'Lämna loppet';
      screen('pause');
    } else { screen(null); if (document.activeElement) document.activeElement.blur(); }
    return;
  }
  $('pRestart').classList.remove('hidden'); $('pMenu').textContent = 'Huvudmeny';
  paused = on;
  loop.setPaused(on);
  if (on) {
    muteLoops(); input.clear();
    $('pauseInfo').textContent = trackName(race.cfg.track) + (race.cfg.mode === 'cup' ? ' · ' + eventById(race.cfg.cup).name : race.cfg.ev ? ' · ' + findEvent(race.cfg.ev).name : '');
    $('pRestart').textContent = race.cfg.mode === 'time' || race.cfg.mode === 'free' ? 'Börja om' : 'Starta om loppet';
    screen('pause');
  } else { screen(null); loop.timeScale = race.slowmo > 0 ? 0.35 : 1; if (document.activeElement) document.activeElement.blur(); }
}
$('pResume').addEventListener('click', () => { audio.play('click'); pauseGame(false); });
$('pRestart').addEventListener('click', () => { audio.play('click'); const cfg = race.cfg; endSession(true); startRace(cfg); });
$('pSettings').addEventListener('click', () => { audio.play('click'); openSettings('pause'); });
$('pMenu').addEventListener('click', () => { audio.play('click'); paused = false; loop.setPaused(false); toMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);
function autoPause() { if (race && !race.online && !paused && (race.state === 'countdown' || race.state === 'running' || race.state === 'finished')) pauseGame(true); }
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    const vis = (id) => !$(id).classList.contains('hidden');
    if (vis('settingsScr')) { $('settingsBack').click(); return; }
    if (vis('help')) { $('helpBack').click(); return; }
    if (race && !vis('results') && !vis('loading')) { pauseGame(!uiPaused()); if (!uiPaused()) audio.play('click'); }
    else if (vis('setup') && e.code === 'Escape') $('setupBack').click();
  }
});

/* ------------------------------------------------------------------ Mästerskap */
const AI_DECALS = ['none', 'none', 'none', 'race', 'side', 'checker', 'fade', 'geo'];
function aiLook(rng, hex, carId) {
  const lk = { color: hex };
  if (rng() < 0.4) lk.decal = AI_DECALS[(rng() * AI_DECALS.length) | 0];
  if (rng() < 0.35) lk.number = 1 + ((rng() * 98) | 0);
  if (rng() < 0.2) lk.rims = ['fem', 'mesh', 'racing', 'turbin'][(rng() * 4) | 0];
  return lk;
}
/** Datorbilar med prestanda nära spelarens (klass: bara den klassen). */
function pickAiCars(playerId, klass, n, rng, pi) {
  let pool = klass ? CARS.filter(c => c.klass === klass) : CARS.slice();
  pi = pi || perfIndex(carSpec(playerId));
  pool = pool.slice().sort((a, b) => Math.abs(perfIndex(a) - pi) - Math.abs(perfIndex(b) - pi)).slice(0, Math.max(3, Math.min(6, pool.length)));
  const out = []; for (let k = 0; k < n; k++) out.push(pool[(rng() * pool.length) | 0].id);
  return out;
}
function startCup(ev, diff, carId) {
  const rng = makeRng(Date.now() & 0xffff);
  const pool = AI_DRIVERS.slice().sort(() => rng() - 0.5).slice(0, ev.opp || 7);
  const cars = pickAiCars(carId, ev.klass, pool.length, rng, perfIndex(playerSpec(carId)));
  const drivers = [{ name: 'Du', player: true, car: carId }];
  pool.forEach((d, k) => drivers.push({ name: d.name, skill: d.skill, aggr: d.aggr, car: cars[k], look: aiLook(rng, COLORS[(rng() * COLORS.length) | 0].hex) }));
  save.cupRun = { id: ev.id, diff, idx: 0, drivers, points: drivers.map(() => 0), scores: [], car: carId };
  persist();
  continueCup();
}
function continueCup() {
  const run = save.cupRun; const ev = eventById(run.id);
  if (!ev) { save.cupRun = null; persist(); return toMenu(); }
  run.drivers[0].car = run.car || save.car;
  startRace({ mode: 'cup', cup: run.id, track: ev.tracks[run.idx], laps: ev.laps || 2, diff: run.diff, car: run.drivers[0].car, opp: ev.opp || 7 });
}

/* ------------------------------------------------------------------ Loppet */
function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '800 28px Rubik, system-ui, sans-serif'; const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(8,12,26,0.6)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 14); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2.8, 0.7, 1); s.position.y = 2.4; s.renderOrder = 6;
  return s;
}

async function startRace(cfg) {
  paused = false; loop.setPaused(false); loop.timeScale = 1;
  disposeRace();
  screen('loading'); loader.set(0.05, 'Mäter upp banan …');
  hudEl.classList.add('hidden');
  await tick();
  const t = trackById(cfg.track);
  const track = new Track(t.def, t.reverse);
  loader.set(0.15, 'Lägger asfalt …'); await tick();
  const trackGroup = track.buildMeshes(settings.q);
  scene.add(trackGroup);
  const world = new World(track, scene, renderer, settings.q);
  world.buildSkyAndLights(); loader.set(0.3, 'Formar terrängen …'); await tick();
  world.buildTerrain(); loader.set(0.55, 'Planterar skog och bjuder in publiken …'); await tick();
  world.buildWater(); world.buildScenery(); loader.set(0.8, 'Målar himlen …'); await tick();
  world.buildHorizon(); world.buildWeather(); scene.add(world.group);
  const th = track.theme;
  // bilar
  const r = race = {
    cfg, track, world, trackGroup, cars: [], ais: [], time: 0, state: 'countdown', cd: 4.2, slowmo: 0, finishT: 0,
    camMode: race0CamMode === 3 ? 0 : race0CamMode, camOff: new THREE.Vector3(), camLook: new THREE.Vector3(), fov: 70, shake: 0, hurt: 0,
    tp: Track.makeFrame(), introT: 0, hudT: 0, rubT: 0, lastPos: 0, perfect: null, tut: null, ghost: null, rec: [], recT: 0,
    particles: new Particles(scene, 1600, false), sparks: new Particles(scene, 900, true),
    skids: new Skids(scene, 1500, th.road === 'ice' ? 0xe8f4ff : 0x000000, th.road === 'ice' ? 0.35 : 0.42),
    speedFx: new SpeedFx(scene), finishOrder: [], msgCool: 0, draftT: 0
  };
  r.tp.i = -1;
  r.online = !!cfg.online; r.byKey = {};
  if (r.online) { r.menu = false; r.waitT = 0; r.sendT = 0; r.aiT = 0; r.rkT = 0; r.goT = 0; r.rank = null; r.firstHumanFin = null; r.lastFin = 0; }
  const diff = DIFFICULTY[cfg.diff] || DIFFICULTY.easy;
  const rng = makeRng(Date.now() & 0xfffff);
  let entries = [];
  const surface = t.def.surface || 'asfalt';
  const equal = !!cfg.online; // online: lika villkor – prestandadelar avstängda
  if (cfg.online) {
    entries = cfg.grid.map((g, k) => ({ name: g.n, car: g.car, look: lookFromNet(g), idx: k, key: g.id, player: g.id === net.selfId,
      remote: g.id !== net.selfId && !(net.isHost && isAiKey(g.id)), skill: g.sk, aggr: g.ag }));
  } else if (cfg.mode === 'cup') {
    const run = save.cupRun;
    // startordning: ledaren startar sist
    const order = run.drivers.map((d, k) => k).sort((a, b) => run.points[a] - run.points[b] || (a === 0 ? 1 : b === 0 ? -1 : a - b));
    if (run.idx === 0) { order.splice(order.indexOf(0), 1); order.splice(Math.min(order.length, 5), 0, 0); }
    entries = order.map(k => Object.assign({ idx: k }, run.drivers[k]));
  } else {
    entries.push({ name: 'Du', player: true, car: cfg.car, idx: 0 });
    if (cfg.opp > 0) {
      const ev = cfg.ev ? findEvent(cfg.ev) : null;
      let pool = AI_DRIVERS.slice().sort(() => rng() - 0.5).slice(0, cfg.opp);
      let cars = pickAiCars(cfg.car, cfg.klass, pool.length, rng, perfIndex(playerSpec(cfg.car, surface, cfg.loaner)));
      if (ev && ev.type === 'duel') { pool = [{ name: ev.rival.name, skill: ev.rival.skill, aggr: 0.7 }]; cars = [ev.rival.car]; }
      pool.forEach((d, k) => {
        entries.push({ name: d.name, skill: d.skill, aggr: d.aggr, car: cars[k], look: aiLook(rng, ev && ev.type === 'duel' ? (DEF_COL[ev.rival.car] ?? 0x15171f) : COLORS[(rng() * COLORS.length) | 0].hex), idx: k + 1 });
      });
      // spelaren i mitten/bak av fältet (duell: bredvid varandra)
      const me = entries.shift(); entries.splice(Math.min(entries.length, Math.ceil(entries.length * 0.7)), 0, me);
    }
  }
  const night = th.night;
  const q = settings.get('quality');
  entries.forEach((e, slot) => {
    const look = e.player && !cfg.online ? (cfg.loaner ? { color: DEF_COL[e.car] ?? 0xcccccc } : lookOf(e.car)) : (e.look || { color: 0xcccccc });
    const spec = e.player && !cfg.online ? playerSpec(e.car, surface, cfg.loaner) : carSpec(e.car);
    const car = new Car(spec, look, { quality: e.player ? (q === 'low' ? 'low' : q === 'medium' ? 'high' : q) : (q === 'low' ? 'low' : 'medium') });
    car.name = e.name; car.isPlayer = !!e.player; car.entryIdx = e.idx; car.colorHex = look.color; car.look = look;
    car.key = e.key || null; car.remote = !!e.remote; car.isHuman = cfg.online ? !isAiKey(e.key) : !!e.player;
    // nattbanor: lite egenljus i lacken så att bilarna (och särskilt den egna) inte blir svarta siluetter
    if (th.night && car.model.paintMat.emissive) car.model.paintMat.emissive.set(look.color).multiplyScalar(e.player ? 0.16 : 0.1);
    const gs = track.gridSlot(slot);
    car.placeAt(track, gs.s, gs.d);
    Object.assign(car, { progress: gs.s, lastS: car.tp.s, lapsDone: 0, cpNext: 1, lapStart: 0, lapTimes: [], bestLap: Infinity, finished: false, finishTime: 0, wrong: 0, stuck: 0, raceActive: false, position: slot + 1 });
    scene.add(car.root);
    if (!car.isPlayer) {
      const lbl = makeLabel(car.isHuman ? '👤 ' + e.name : e.name); car.root.add(lbl); car.model.label = lbl;
      if (car.remote) { car.net = { buf: [], last: 0 }; car.noDrift = true; }
      else {
        const ai = new AIDriver(car, track, { skill: e.skill || 0.95, aggr: e.aggr || 0.5, pace: diff.pace, rng });
        car.ai = ai; r.ais.push(ai); car.noDrift = true; car.powerMul = diff.power;
      }
    }
    r.cars.push(car);
    if (car.key) r.byKey[car.key] = car;
    if (car.isPlayer) { r.player = car; car.progressive = true; }
  });
  if (night) {
    const sl = new THREE.SpotLight(0xfff2d8, 80, 90, 0.55, 0.6, 1.2);
    sl.position.set(0, 0.9, 1.6); sl.target.position.set(0, -0.6, 22);
    r.player.model.body.add(sl, sl.target); r.spot = sl;
  }
  if (cfg.mode === 'free') buildCrates(r);
  // spöke
  if (cfg.mode === 'time') {
    const gm = buildCarModel(carSpec(cfg.car), 0xffffff, { ghost: true });
    gm.root.visible = false; scene.add(gm.root);
    r.ghost = { model: gm, frames: null };
    try { const f = await kv.get('fjallracet:ghost:' + cfg.track + ':' + cfg.car); if (f && f.length > 14) r.ghost.frames = f; } catch (e) {}
    if (!r.ghost.frames) { try { const f = await kv.get('fjallracet:ghost:' + cfg.track); if (f && f.length > 14) r.ghost.frames = f; } catch (e) {} }
  }
  if (!save.tutorial && cfg.mode !== 'free' && !cfg.online) r.tut = { step: 0, t: 0 };
  hud.setTrack(track); hud.setMode(cfg.online ? 'quick' : cfg.mode);
  hud.e.posOf.textContent = '/' + r.cars.length;
  hud.cache = {};
  ['tip', 'wrong', 'drift'].forEach(k => hud.e[k].classList.add('hidden')); hud.e.msg.innerHTML = ''; hud.center('');
  track.setStartLights(0, false);
  if (cfg.mode === 'free') { r.cd = 1.2; }
  renderer.toneMappingExposure = th.exposure;
  if (bloomPass) { bloomPass.strength = th.bloom; bloomPass.threshold = th.night ? 0.82 : 0.9; }
  loader.set(0.92, 'Förbereder grafiken …');
  await tick();
  warmShaders();
  loader.set(1, 'Klart!');
  await tick();
  r.camOff.set(0, 3, -8); r.fov = settings.get('fov') - 6;
  screen(null);
  // en dold menyknapp får inte behålla fokus – mellanslag (nitro) skulle annars kunna "klicka" på den
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  try { R.canvas.focus({ preventScroll: true }); } catch (e) {}
  hudEl.classList.remove('hidden');
  buildTouch();
  startLoops();
  audio.music(th.music);
  hud.center('');
  if (cfg.mode === 'free') hud.msg('Fri körning – utforska i lugn och ro', 2500, 'cyan');
  else hud.msg(trackName(cfg.track) + ' · ' + th.label, 2500, 'gold');
  if (r.online) {
    if (race !== r) return;
    if (net.isHost) ol.loaded.add(net.selfId); else net.send('ld', 1);
    hud.msg('Väntar på att alla ska bli klara …', 2500, 'cyan');
    if (!ol.stopTick) ol.stopTick = backgroundTicker(bgStep, 30);
  }
}
/**
 * Förkompilerar alla shaders i loppscenen (undviker hack första gången t.ex. nitroflammor syns) och
 * "använder" varje program direkt. Chrome (KHR_parallel_shader_compile) varnar annars med
 * "GL_INVALID_VALUE: glGetProgramiv: Program object expected" när ett program som kompilerats men
 * aldrig använts raderas – vilket hände för alla sådana program när loppet städades bort.
 */
function warmShaders() {
  try {
    renderer.compile(scene, camera);
    for (const p of renderer.info.programs) p.getUniforms();
  } catch (e) { /* bara en optimering */ }
}
let race0CamMode = [0, 1, 2].includes(save.cam) ? save.cam : 0; // kameraval sparas mellan sessioner

/* ---------- gömda lådor (fri körning) ---------- */
let crateGeo = null, crateMat = null, beamMat = null;
function crateSpotsFound(key) { const b = String(key).split('@')[0] + ':'; return (save.found || []).filter(f => f.startsWith(b)).length; }
function buildCrates(r) {
  const tr = r.track, base = r.cfg.track.split('@')[0];
  if (!crateGeo) {
    crateGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#9a6a3a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#5a3a1a'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
    g.beginPath(); g.moveTo(5, 5); g.lineTo(123, 123); g.stroke(); g.fillStyle = '#ffcc33'; g.font = '900 54px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    crateMat = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffaa33, emissiveIntensity: 0.25, roughness: 0.7 });
    beamMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  r.crates = [];
  for (let k = 0; k < 3; k++) {
    const id = base + ':' + k;
    if ((save.found || []).includes(id)) continue;
    const s = tr.L * (0.18 + 0.31 * k), side = k % 2 ? 1 : -1;
    const p = tr.pointAt(s, side * (tr.half + Math.min(tr.shoulder, 2.5) * 0.55), 0.75, new THREE.Vector3());
    const m = new THREE.Mesh(crateGeo, crateMat); m.position.copy(p); m.castShadow = true;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 8, 1, true), beamMat); beam.position.y = 7; m.add(beam);
    scene.add(m); r.crates.push({ id, m, y: p.y, type: k === 2 ? 'stal' : 'tra' });
  }
  if (r.crates.length) hud.msg(`🎁 ${r.crates.length} gömda lådor på banan – hitta dem!`, 3200, 'gold');
}
function updateCrates(r, dt) {
  if (!r.crates) return;
  for (let k = r.crates.length - 1; k >= 0; k--) {
    const c = r.crates[k];
    c.m.rotation.y += dt * 1.2; c.m.position.y = c.y + Math.sin(r.time * 2 + k) * 0.15;
    if (c.m.position.distanceTo(r.player.pos) < 2.8) {
      save.found.push(c.id); save.crates.push(c.type); persist();
      hud.msg(`🎁 Du hittade en ${CRATES[c.type].name.toLowerCase()}! Öppna den under Lådor.`, 3000, 'gold'); audio.play('levelup');
      scene.remove(c.m); c.m.children[0].geometry.dispose(); r.crates.splice(k, 1);
    }
  }
}
function disposeCrates(r) { if (r.crates) for (const c of r.crates) { scene.remove(c.m); c.m.children[0].geometry.dispose(); } r.crates = null; }

function disposeRace() {
  if (ol.stopTick) { ol.stopTick(); ol.stopTick = null; }
  if (!race) return;
  const r = race;
  stopLoops();
  r.cars.forEach(c => { scene.remove(c.root); disposeCarModel(c.model); });
  if (r.ghost) { scene.remove(r.ghost.model.root); }
  disposeCrates(r);
  scene.remove(r.trackGroup); r.track.dispose(); r.world.dispose();
  r.particles.dispose(scene); r.sparks.dispose(scene); r.skids.dispose(scene); r.speedFx.dispose(scene);
  if (r.spot) { try { r.spot.dispose(); } catch (e) {} }
  TX.disposeTrackTextures();
  race = null;
  scene.fog = null; scene.environment = null;
  loop.timeScale = 1;
}

function resetCar(car, why) {
  const tr = race.track;
  const s = ((car.progress % tr.L) + tr.L) % tr.L;
  const d = clamp(car.tp.d, -tr.half * 0.45, tr.half * 0.45);
  car.placeAt(tr, s - 2, d, Math.min(14, Math.max(0, car.vf) * 0.4));
  car.lastS = car.tp.s;
  car.ghostT = 2.2; car.wrong = 0; car.stuck = 0; car.driftCombo = 0;
  car.resets = (car.resets || 0) + 1; car.lastReset = why;
  if (car.isPlayer) {
    hud.msg(why === 'fall' ? 'Avåkning! Bilen återställd' : why === 'wrong' ? 'Bilen vänd rätt' : 'Återställd', 1500);
    audio.play('whoosh', { vol: 0.6 });
    race.camOff.set(0, 3, 0).addScaledVector(car.F, -7);
  }
}

function readControls(c) {
  if (race && race.menu) { c.throttle = 0; c.brake = 0; c.steer = 0; c.hand = false; c.nitro = false; return; }
  const gp = input._gp ? input._gp() : null;
  let thr = input.down('KeyW', 'ArrowUp', 'TGas') ? 1 : 0;
  let brk = input.down('KeyS', 'ArrowDown', 'TBrake') ? 1 : 0;
  let st = input.axis(['KeyA', 'ArrowLeft', 'TLeft'], ['KeyD', 'ArrowRight', 'TRight'], { gpAxis: 0 });
  if (Math.abs(touch.stick.x) > Math.abs(st)) st = touch.stick.x;
  if (gp) {
    const rt = gp.buttons[7], lt = gp.buttons[6];
    if (rt) thr = Math.max(thr, rt.value || (rt.pressed ? 1 : 0));
    if (lt) brk = Math.max(brk, lt.value || (lt.pressed ? 1 : 0));
    if (Math.abs(st) < 1) st = Math.sign(st) * Math.pow(Math.abs(st), 1.35);
  }
  if (touchOn() && settings.get('autoGas')) thr = brk > 0.1 ? 0 : 1;
  c.throttle = thr; c.brake = brk; c.steer = st;
  c.hand = input.down('ShiftLeft', 'ShiftRight', 'Pad1', 'THand');
  c.nitro = input.down('Space', 'Pad0', 'TNitro');
}

const KCP = 8;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _sc = [0, 0, 0];
function surfaceColor(tr, onRoad) {
  const th = tr.theme;
  const c = onRoad ? (th.dust ? th.dust : th.road === 'ice' ? [0.92, 0.96, 1] : th.road === 'wet' || th.road === 'neo' ? [0.55, 0.58, 0.66] : [0.82, 0.82, 0.84])
    : ({ grass: [0.45, 0.5, 0.3], gravel: [0.6, 0.55, 0.48], sand: [0.86, 0.72, 0.5], snow: [0.95, 0.97, 1], pave: [0.5, 0.5, 0.55] }[th.shoulder] || [0.7, 0.7, 0.7]);
  const k = th.night ? 0.45 : 1;
  _sc[0] = c[0] * k; _sc[1] = c[1] * k; _sc[2] = c[2] * k;
  return _sc;
}

function raceUpdate(dt) {
  const r = race, tr = r.track, P = r.player;
  // ---------- nedräkning ----------
  if (r.state === 'countdown') {
    const before = r.cd; r.introT += dt;
    if (r.online) r.cd = onlineCountdown(r, dt); else r.cd -= dt;
    const cross = (x) => before > x && r.cd <= x;
    if (r.cfg.mode !== 'free') {
      if (cross(3)) { hud.center('3'); audio.play('countdown'); tr.setStartLights(2, false); }
      if (cross(2)) { hud.center('2'); audio.play('countdown'); tr.setStartLights(4, false); }
      if (cross(1)) { hud.center('1'); audio.play('countdown'); tr.setStartLights(5, false); }
    }
    readControls(P.ctl);
    if (P.ctl.throttle > 0.5 && r.perfect == null && r.cd < 1.0) r.perfect = r.cd;
    if (P.ctl.throttle < 0.2 && r.cd < 1.0) r.perfect = null;
    snd.rev = damp(snd.rev, P.ctl.throttle, P.ctl.throttle > snd.rev ? 8 : 3, dt);
    if (r.cd <= 0) {
      r.state = 'running';
      if (r.online) r.time = clamp((net.now() - ol.goAt) / 1000, 0, 30);
      hud.center('KÖR!', 'go'); audio.play('go'); tr.setStartLights(0, true);
      audio.noise({ dur: 2.2, vol: 0.1, freq: 1100, type: 'bandpass', delay: 0.15 });
      r.cars.forEach(c => { c.raceActive = true; c.lapStart = 0; });
      if (r.perfect != null && r.perfect <= 0.45 && P.ctl.throttle > 0.5) { P.freeBoost = 1.1; hud.msg('PERFEKT START!', 1600, 'gold'); audio.play('power'); }
      r.ais.forEach(ai => { if (Math.random() < 0.35 * ai.skill) ai.car.freeBoost = 0.5 + Math.random() * 0.5; });
    }
    if (r.online) onlineSend(r, dt);
    updateAudio(dt); hudUpdate(dt);
    return;
  }
  r.time += dt;
  // ---------- styrning ----------
  if (!P.finished) { if (r.autopilot) { P.progressive = false; r.autopilot.think(dt, r.cars, r.time); } else readControls(P.ctl); }
  else if (P.ai) P.ai.think(dt, r.cars, r.time);
  if (input.pressed('KeyC', 'Pad3', 'TCam')) { r.camMode = race0CamMode = (r.camMode + 1) % 4; if (r.camMode !== 3) { save.cam = r.camMode; persist(); } hud.msg(['Kamera: bakom', 'Kamera: nära', 'Kamera: huv', 'Kamera: bakåtblick'][r.camMode], 900); }
  if (input.pressed('KeyR', 'Pad8', 'TReset') && !P.finished && P.ghostT <= 0) resetCar(P, 'manual');
  r.lookBack = input.down('KeyV', 'Pad2');
  for (const ai of r.ais) if (!ai.car.finished || true) ai.think(dt, r.cars, r.time);
  // ---------- fysik ----------
  for (const c of r.cars) { if (c.remote) stepRemote(c, r.time - INTERP, dt, tr); else c.update(dt, tr); }
  collideCars(r.cars, onCarHit);
  // ---------- loppslogik ----------
  const L = tr.L;
  for (const c of r.cars) {
    if (c.remote) continue;
    let ds = c.tp.s - c.lastS;
    if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;
    c.progress += ds; c.lastS = c.tp.s;
    // kontrollpunkter + varv
    let guard = 0;
    while (!c.finished && c.progress >= c.lapsDone * L + c.cpNext * L / KCP && guard++ < 10) {
      if (c.cpNext >= KCP) { c.lapsDone++; c.cpNext = 1; onLap(c); }
      else c.cpNext++;
    }
    // fel håll / fast / avåkning
    const dot = c.F.x * c.tp.T.x + c.F.z * c.tp.T.z;
    const movingBack = (c.vel.x * c.tp.T.x + c.vel.z * c.tp.T.z) < -2;
    if (dot < -0.35 && (c.speed > 3 || movingBack) || movingBack && c.speed > 6) c.wrong += dt; else c.wrong = Math.max(0, c.wrong - dt * 2);
    if (c.raceActive && Math.abs(c.vf) < 1.2 && (c.ctl.throttle > 0.5 || c.ctl.brake > 0.5)) c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt * 2);
    if (c.needReset) resetCar(c, 'fall');
    else if (c.wrong > (c.isPlayer ? 4.5 : 1.5)) resetCar(c, 'wrong');
    else if (c.stuck > (c.isPlayer ? 6 : 4)) resetCar(c, 'stuck');
    // drift-poäng
    if (!c.drift && c.driftCombo > 0) {
      const pts = Math.round(c.driftCombo);
      c.driftScore += pts;
      if (c.isPlayer && pts > 60) { hud.msg('Drift +' + pts, 1300, 'gold'); if (pts > 250) audio.play('coin', { vol: 0.6 }); }
      c.driftCombo = 0;
    }
    // händelser
    for (const ev of c.events) handleEvent(c, ev);
    c.events.length = 0;
  }
  // ---------- placeringar ----------
  let sorted = r.cars.slice().sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.progress - a.progress);
  if (r.online && !net.isHost && r.rank) {
    // placeringar från värden (bilar som saknas i listan sist)
    const ranked = r.rank.map(k => r.byKey[k]).filter(Boolean);
    sorted = ranked.concat(sorted.filter(c => !ranked.includes(c)));
  }
  sorted.forEach((c, k) => c.position = k + 1);
  r.sorted = sorted;
  if (isRace(r.cfg.mode)) {
    if (P.position < r.lastPos && r.lastPos && r.state === 'running' && r.time > 3 && r.msgCool <= 0) { audio.play('pickup', { vol: 0.5 }); r.msgCool = 1.2; }
    r.lastPos = P.position;
  }
  r.msgCool -= dt;
  // gummiband + suget
  r.rubT -= dt;
  if (r.rubT <= 0) {
    r.rubT = 0.5;
    const d = DIFFICULTY[r.cfg.diff] || DIFFICULTY.easy;
    for (const ai of r.ais) {
      const c = ai.car; let rub = 1;
      if (!P.finished && !c.finished) {
        const gap = P.progress - c.progress;
        if (gap > 35) rub = 1 + Math.min(d.rubberBehind, (gap - 35) / 900 * d.rubberBehind * 3);
        else if (gap < -50) rub = 1 - Math.min(d.rubberAhead, (-gap - 50) / 700 * d.rubberAhead * 3);
      }
      c.rubber = rub;
    }
  }
  for (const c of r.cars) {
    if (c.speed < 22 || !c.grounded) continue;
    for (const o of r.cars) {
      if (o === c) continue;
      const gap = o.progress - c.progress;
      if (gap > 4 && gap < 22 && Math.abs(o.tp.d - c.tp.d) < 1.8) { c.nitro = Math.min(1, c.nitro + dt * 0.045); if (c.isPlayer) r.draftT = 0.3; break; }
    }
  }
  r.draftT -= dt;
  // ---------- spöke (tidskörning) ----------
  if (r.cfg.mode === 'time') {
    r.recT++;
    if (r.recT % 2 === 0) { const q = P.quat; r.rec.push(+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2), +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)); }
  }
  // ---------- online ----------
  if (r.online) { onlineSend(r, dt); if (net.isHost && onlineHostEnd(r, dt)) return; }
  // ---------- mål ----------
  if (r.state === 'finished' && !r.online) {
    r.finishT += dt;
    const allDone = r.cars.every(c => c.finished);
    if (r.finishT > 6.5 || (allDone && r.finishT > 3.5)) { endRace(); return; }
  }
  if (r.cfg.etype === 'elim') elimCheck(r);
  if (r.crates) updateCrates(r, dt);
  // ---------- handledning ----------
  if (r.tut) tutorial(dt);
  // ---------- effekter ----------
  emitFx(dt);
  updateAudio(dt);
  hudUpdate(dt);
}

function elimCheck(r) {
  if (r.state === 'countdown' || !r.sorted) return;
  const alive = r.sorted.filter(c => !c.elim);
  const leader = alive[0]; if (!leader) return;
  if (leader.lapsDone > (r.elimDone || 0)) {
    r.elimDone = leader.lapsDone;
    const out = alive.filter(c => !c.finished).pop();
    if (out && alive.length > 1) {
      out.elim = true; out.finished = true; out.finishTime = 10000 - r.time; out.noCollide = true;
      if (out.ai) { r.ais.splice(r.ais.indexOf(out.ai), 1); out.ai = null; }
      Object.assign(out.ctl, { throttle: 0, brake: 0.3, steer: 0, hand: false, nitro: false });
      r.finishOrder.push(out);
      if (out.isPlayer) {
        r.state = 'finished'; r.finishT = 0; hud.center('UTSLAGEN!', 'fin stay'); audio.play('lose');
        out.ai = new AIDriver(out, r.track, { skill: 0.9, aggr: 0.2, pace: 0.6 }); out.progressive = false;
      } else { hud.msg('❌ ' + out.name + ' är utslagen!', 2000, 'cyan'); audio.play('whoosh', { vol: 0.5 }); }
      const left = alive.filter(c => !c.elim);
      if (left.length === 1 && !left[0].finished) finishCar(left[0]);
    }
  }
}
function onLap(c) {
  const r = race, tr = r.track;
  const lt = r.time - c.lapStart; c.lapStart = r.time;
  c.lapTimes.push(lt);
  const isBest = lt < c.bestLap; if (isBest) c.bestLap = lt;
  const laps = r.cfg.laps;
  if (c.isPlayer) {
    if (r.cfg.mode === 'time' || r.cfg.mode === 'free') {
      const key = r.cfg.track; const prev = save.best[key];
      if (!prev || lt < prev) {
        save.best[key] = lt; persist();
        const md = medalFor(key, lt), pmd = medalFor(key, prev);
        hud.msg((prev ? 'Nytt banrekord! ' : 'Varvtid ') + fmtTime(lt) + (md ? ' ' + md : ''), 2600, 'gold'); audio.play('levelup');
        if (md && md !== pmd) hud.msg('Ny medalj: ' + { '🥇': 'guld', '🥈': 'silver', '🥉': 'brons' }[md] + '!', 2600, 'cyan');
        if (r.cfg.mode === 'time') {
          const frames = r.rec.slice();
          r.ghost.frames = frames;
          kv.set('fjallracet:ghost:' + key + ':' + r.cfg.car, frames);
          kv.set('fjallracet:ghost:' + key, frames);
        }
      } else { hud.msg('Varv ' + fmtTime(lt) + '  (+' + (lt - prev).toFixed(2) + ')', 2200); audio.play('select'); }
      r.rec.length = 0; r.recT = 0;
      if (r.cfg.mode === 'time') r.ttBest = Math.min(r.ttBest || Infinity, lt);
      return;
    }
    if (c.lapsDone >= laps) { finishCar(c); return; }
    if (c.lapsDone === laps - 1) { hud.msg('SISTA VARVET!', 2200, 'gold'); audio.play('power'); }
    else hud.msg('Varv ' + (c.lapsDone + 1) + '/' + laps + (isBest ? ' · Bästa ' + fmtTime(lt) : ''), 1800, 'cyan');
  } else if (isRace(r.cfg.mode) && c.lapsDone >= laps) finishCar(c);
}
function finishCar(c) {
  const r = race;
  c.finished = true; c.finishTime = r.time;
  r.finishOrder.push(c);
  if (c.isPlayer) {
    const pos = r.online ? r.cars.filter(o => o.finished && o.finishTime <= c.finishTime).length : r.finishOrder.length;
    r.state = 'finished'; r.finishT = 0;
    if (!r.online) { r.slowmo = 1.6; loop.timeScale = 0.35; }
    hud.center(pos === 1 ? 'SEGER!' : pos + ':a plats', 'fin stay');
    audio.play(pos === 1 ? 'win' : pos <= 3 ? 'levelup' : 'lose');
    audio.noise({ dur: 3, vol: 0.12, freq: 1000, type: 'bandpass' });
    c.ai = new AIDriver(c, r.track, { skill: 0.9, aggr: 0.2, pace: 0.8 }); c.progressive = false;
    if (r.tut) { r.tut = null; save.tutorial = true; persist(); hud.tip(null); }
  }
}

function onCarHit(A, B, j, x, y, z) {
  const r = race;
  const s = Math.min(1, j / 14);
  for (let k = 0; k < 6 + s * 14; k++) r.sparks.spawn(x, y, z, (Math.random() - 0.5) * 10, Math.random() * 5, (Math.random() - 0.5) * 10, 0.3 + Math.random() * 0.4, 0.12, 0.05, 1, 0.75, 0.3, 1, 1.5, 9);
  if (A.isPlayer || B.isPlayer) { audio.play('hit', { vol: 0.5 + s, pitch: 0.8 + Math.random() * 0.3 }); r.shake = Math.min(1, r.shake + s * 0.6); r.hurt = Math.max(r.hurt, s * 0.6); }
  else { const d = r.player.pos.distanceTo(A.pos); if (d < 50) audio.play('hit', { vol: (1 - d / 50) * 0.5 }); }
}
function handleEvent(c, ev) {
  const r = race;
  if (ev.type === 'wall') {
    const s = Math.min(1, ev.strength / 14);
    const p = _v1.copy(c.pos).addScaledVector(c.tp.R, ev.side * 0.9); p.y += 0.5;
    for (let k = 0; k < 4 + s * 18; k++) r.sparks.spawn(p.x, p.y, p.z, -c.tp.R.x * ev.side * 3 + (Math.random() - 0.5) * 6 + c.vel.x * 0.4, Math.random() * 5, -c.tp.R.z * ev.side * 3 + (Math.random() - 0.5) * 6 + c.vel.z * 0.4, 0.3 + Math.random() * 0.5, 0.13, 0.05, 1, 0.7, 0.25, 1, 1.2, 9);
    if (c.isPlayer) {
      audio.play(ev.strength > 12 ? 'explode' : 'hit', { vol: 0.4 + s * 0.8, pitch: 0.7 + Math.random() * 0.2, gap: 120 });
      r.shake = Math.min(1, r.shake + s * 0.8); r.hurt = Math.max(r.hurt, s * 0.7);
    }
  } else if (ev.type === 'land') {
    const s = Math.min(1, ev.strength / 12);
    const col = surfaceColor(r.track, c.onRoad);
    for (let k = 0; k < 10 * s + 2; k++) r.particles.spawn(c.pos.x + (Math.random() - 0.5) * 2.5, c.pos.y + 0.2, c.pos.z + (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 6, 0.9, 0.8, 3, col[0], col[1], col[2], 0.45, 1.5, 0);
    if (c.isPlayer) { audio.play('land', { vol: 0.5 + s }); if (s > 0.4) audio.play('hit', { vol: s * 0.4, pitch: 0.6 }); r.shake = Math.min(1, r.shake + s * 0.5); }
  } else if (ev.type === 'air') {
    if (ev.time > 0.55) {
      c.nitro = Math.min(1, c.nitro + Math.min(0.2, ev.time * 0.12));
      if (c.isPlayer) hud.msg('Luftfärd ' + ev.time.toFixed(1) + ' s · +nitro', 1400, 'cyan');
    }
  }
}

function emitFx(dt) {
  const r = race, tr = r.track, camPos = camera.position;
  const th = tr.theme;
  for (const c of r.cars) {
    const dist = c.pos.distanceTo(camPos);
    if (dist > 140) continue;
    const near = dist < 60;
    const up = c.up;
    // sladd: rök + sladdmärken
    const slipping = c.grounded && c.wheelSlip > 0.35 && c.speed > 4;
    for (const side of [-1, 1]) {
      const p = _v2.copy(c.pos).addScaledVector(c.Rt, side * 0.78).addScaledVector(c.F, -1.25).addScaledVector(up, 0.02);
      r.skids.mark(c, side, p, c.Rt, slipping, c.wheelSlip);
      if (slipping && Math.random() < (near ? 0.7 : 0.3)) {
        const col = surfaceColor(tr, c.onRoad);
        r.particles.spawn(p.x, p.y + 0.25, p.z, -c.vel.x * 0.12 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, -c.vel.z * 0.12 + (Math.random() - 0.5) * 1.5, 1.0 + Math.random() * 0.7, 0.8, 3.6, col[0], col[1], col[2], th.road === 'ice' ? 0.5 : 0.38, 1.2, -0.3);
      }
      // terräng/snö-sprut utanför vägen
      if (c.grounded && !c.onRoad && c.speed > 6 && Math.random() < 0.6) {
        const col = surfaceColor(tr, false);
        r.particles.spawn(p.x, p.y + 0.2, p.z, -c.vel.x * 0.2 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, -c.vel.z * 0.2 + (Math.random() - 0.5) * 3, 0.8, 0.5, 2.2, col[0], col[1], col[2], 0.6, 1.5, 6);
      }
      // regn-dimma / snörök bakom bilarna
      if (c.grounded && c.speed > 18 && near && (th.weather === 'rain' || th.road === 'ice' || th.road === 'snow' || th.road === 'gravel' || th.shoulder === 'snow') && Math.random() < 0.25) {
        const col = th.weather === 'rain' ? [0.32, 0.34, 0.4] : th.road === 'gravel' && th.dust ? th.dust : [0.95, 0.97, 1];
        r.particles.spawn(p.x, p.y + 0.3, p.z, -c.vel.x * 0.25, 0.4, -c.vel.z * 0.25, 0.7, 0.6, 2.4, col[0], col[1], col[2], th.weather === 'rain' ? 0.12 : 0.2, 2, 0);
      }
    }
    // nitro
    if (c.nitroOn && near) {
      for (const side of [-0.45, 0.45]) {
        const p = _v3.copy(c.pos).addScaledVector(c.Rt, side).addScaledVector(c.F, -c.model.shape.L / 2 - 0.5).addScaledVector(up, 0.3);
        r.sparks.spawn(p.x, p.y, p.z, -c.F.x * 6 + c.vel.x * 0.8, 0.3, -c.F.z * 6 + c.vel.z * 0.8, 0.2 + Math.random() * 0.15, 0.35, 0.1, 0.4, 0.7, 1, 0.9, 2, 0);
      }
    }
    // gnistor vid skrapning
    if (c.scrape > 6 && Math.random() < 0.6) {
      const p = _v3.copy(c.pos).addScaledVector(c.tp.R, c.scrapeSide * 0.95); p.y += 0.35;
      r.sparks.spawn(p.x, p.y, p.z, -c.vel.x * 0.1 + (Math.random() - 0.5) * 3, Math.random() * 3, -c.vel.z * 0.1 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.3, 0.12, 0.04, 1, 0.75, 0.3, 1, 1, 9);
      if (c.isPlayer) audio.noise({ dur: 0.08, vol: 0.05, freq: 3000, type: 'highpass' });
    }
  }
  r.particles.update(dt); r.sparks.update(dt); r.skids.update();
}
// Skids.mark med nyckel per bil+sida
const _skidKeys = new WeakMap();
const origMark = Skids.prototype.mark;
Skids.prototype.mark = function (car, side, p, Rt, on, strength) {
  let keys = _skidKeys.get(car); if (!keys) { keys = { '-1': {}, '1': {} }; _skidKeys.set(car, keys); }
  return origMark.call(this, keys[side], p, Rt, on, strength);
};

const ENGINE_BASE = { Kompakt: 1, Sport: 1.12, Muskel: 0.78, Rally: 1.08, Klassiker: 0.92, 'Terräng': 0.85, El: 1.45, Super: 1.18 };
function updateAudio(dt) {
  const r = race; if (!r || !snd.engine) return;
  const P = r.player;
  const thr = r.state === 'countdown' ? snd.rev : P.ctl.throttle;
  let es = engineState(P, thr);
  if (r.state === 'countdown') es = { rpm: 0.2 + snd.rev * 0.75, gear: 'N' };
  const base = ENGINE_BASE[P.spec.klass] || 1;
  snd.engine.set({ freq: (40 + es.rpm * 104) * base, vol: 0.1 + thr * 0.06 + (P.nitroOn ? 0.03 : 0), filter: 380 + es.rpm * 1250 + thr * 450 + (P.nitroOn ? 300 : 0) });
  const slip = P.grounded ? P.wheelSlip : 0;
  const sq = P.speed > 4 && P.onRoad ? clamp(slip - 0.3, 0, 1) : 0;
  snd.screech.set({ freq: 1500 + Math.min(1, slip) * 900 + (r.track.grip < 0.8 ? -500 : 0), vol: sq * 0.2 });
  snd.squeal.set({ freq: (r.track.grip < 0.8 ? 520 : 760) + Math.min(1, slip) * 180 + Math.sin(r.time * 23) * 18, vol: sq * (r.track.grip < 0.8 ? 0.012 : 0.022) });
  snd.wind.set({ freq: 250 + P.speed * 9, vol: clamp((P.speed - 10) / 60, 0, 1) * 0.1 + (P.grounded ? 0 : 0.03) });
  // närmaste motståndare
  let best = null, bd = 60;
  for (const c of r.cars) { if (c === P) continue; const d = c.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = c; } }
  if (best) { const e2 = engineState(best, best.ctl.throttle); const b2 = ENGINE_BASE[best.spec.klass] || 1; snd.engine2.set({ freq: (40 + e2.rpm * 104) * b2 * 1.01, vol: (1 - bd / 60) * 0.055, filter: 300 + e2.rpm * 900 }); }
  else snd.engine2.set({ vol: 0 });
  r.gear = es.gear; r.rpm = es.rpm;
}

/* ---------- handledning ---------- */
function tutorial(dt) {
  const r = race, t = r.tut, P = r.player; t.t += dt;
  const T = touchOn();
  const steps = [
    { text: T ? 'Håll <b>GAS</b> för att köra' : 'Håll <kbd>W</kbd> eller <kbd>↑</kbd> för att gasa', done: () => P.speed * 3.6 > 50 },
    { text: T ? 'Styr med <b>◀ ▶</b>. Bromsa med <b>BROMS</b> före kurvorna' : 'Styr med <kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> · bromsa med <kbd>S</kbd> före kurvorna', done: () => t.t > 5 },
    { text: T ? 'Håll <b>DRIFT</b> medan du svänger in i en kurva – det fyller nitromätaren!' : 'Håll <kbd>Shift</kbd> medan du svänger in i en kurva för att <b>drifta</b> – det fyller nitron!', done: () => P.driftScore > 80 || t.t > 25 },
    { text: T ? 'Tryck <b>NITRO</b> på en raksträcka!' : 'Håll <kbd>Mellanslag</kbd> för <b>nitro</b> på en raksträcka!', done: () => P.nitroOn && t.used > 0.6 || t.t > 18 },
    { text: T ? '🎥 byter kamera · ↺ återställer bilen' : '<kbd>C</kbd> byter kamera · <kbd>V</kbd> tittar bakåt · <kbd>R</kbd> återställer bilen', done: () => t.t > 6 }
  ];
  if (P.nitroOn) t.used = (t.used || 0) + dt;
  const st = steps[t.step];
  if (!st) { hud.tip(null); r.tut = null; save.tutorial = true; persist(); return; }
  hud.tip(st.text);
  if (st.done()) { t.step++; t.t = 0; audio.play('pickup', { vol: 0.5 }); }
}

/* ---------- HUD ---------- */
function hudUpdate(dt) {
  const r = race, P = r.player;
  r.hudT -= dt; if (r.hudT > 0) return; r.hudT = 1 / 20;
  const mode = r.cfg.mode;
  hud.set('pos', hud.e.pos, String(P.position));
  if (isRace(mode)) hud.set('lap', hud.e.lap, Math.min(r.cfg.laps, P.lapsDone + 1) + '/' + r.cfg.laps);
  else hud.set('lap', hud.e.lap, String(P.lapsDone + 1));
  hud.set('total', hud.e.total, fmtTime(r.time));
  hud.set('lapT', hud.e.lapT, fmtTime(r.state === 'countdown' ? 0 : r.time - P.lapStart));
  const best = mode === 'time' || mode === 'free' ? Math.min(P.bestLap, save.best[r.cfg.track] || Infinity) : P.bestLap;
  hud.set('best', hud.e.best, isFinite(best) ? fmtTime(best) : '–:––.–');
  if (isRace(mode) && r.sorted) hud.standings(r.sorted.map(c => ({ name: c.isPlayer ? 'Du' : c.isHuman ? c.name : c.name.split(' ')[0], me: c.isPlayer, color: css(c.colorHex) })));
  hud.wrong(P.wrong > 0.8 && !P.finished);
  if (P.drift && P.driftCombo > 20) hud.drift('DRIFT ' + Math.round(P.driftCombo)); else hud.drift(r.draftT > 0 ? 'SUG · nitro laddas' : null);
  if (P.stuck > 2.5 && !P.finished) hud.tip(touchOn() ? 'Kört fast? Tryck <b>↺</b>' : 'Kört fast? Tryck <kbd>R</kbd> för att återställa'); else if (!r.tut && hud.cache.tip) hud.tip(null);
}
function drawHudCanvases() {
  const r = race, P = r.player;
  // verklig fart (inte bara längs nosen) – annars ser det ut som att driften äter farten
  hud.drawSpeed(Math.hypot(P.vel.x, P.vel.z) * 3.6, r.rpm || 0.2, r.gear || 'N', P.nitro, P.nitroOn, P.drift);
  hud.drawMap(r.cars, P, r.ghost && r.ghost.model.root.visible ? r.ghost.model.root.position : null);
}

/* ---------- slut på loppet ---------- */
function raceScore(pos, n, time, laps, par, drift, diff) {
  const table = [1000, 800, 650, 520, 420, 340, 270, 210];
  const idx = n <= 1 ? 0 : Math.round((pos - 1) * 7 / (n - 1));
  const base = table[clamp(idx, 0, 7)];
  const timeB = Math.max(0, par * laps - time) * 12;
  const driftB = Math.min(600, drift / 10);
  return Math.round((base + timeB + driftB) * (DIFFICULTY[diff] || DIFFICULTY.easy).scoreMult * (0.5 + laps / 6));
}
function endRace() {
  const r = race; if (!r || r.ended) return; r.ended = true;
  const L = r.track.L, laps = r.cfg.laps;
  // uppskatta sluttid för de som inte gått i mål
  for (const c of r.cars) if (!c.finished) {
    const avg = Math.max(12, c.progress / Math.max(1, r.time));
    c.finishTime = r.time + Math.max(0, laps * L - c.progress) / avg; c.finished = true; c.estimated = true;
    if (!isFinite(c.bestLap) && c.lapTimes.length === 0) c.bestLap = Infinity;
  }
  const order = r.cars.slice().sort((a, b) => a.finishTime - b.finishTime);
  const P = r.player, pos = order.indexOf(P) + 1;
  const score = raceScore(pos, order.length, P.finishTime, laps, r.track.def.par, P.driftScore, r.cfg.diff);
  const rows = order.map((c, k) => ({ name: c.isPlayer ? 'Du' : c.name, car: c.spec.name, carId: c.spec.id, color: c.colorHex, look: c.look, elim: !!c.elim, time: c.finishTime, est: c.estimated, best: c.bestLap, me: c.isPlayer, idx: c.entryIdx, pts: POINTS[k] || 0 }));
  const summary = { cfg: r.cfg, rows, pos, score, drift: P.driftScore, trackKey: r.cfg.track };
  endSession(false);
  disposeRace();
  hudEl.classList.add('hidden'); buildTouch();
  showResults(summary);
}
/** Avslutar tidskörning/fri körning (rapporterar poäng) när man lämnar. */
function endSession(abort) {
  const r = race; if (!r) return;
  if (r.cfg.mode === 'time' && isFinite(r.ttBest || Infinity) && !r.submitted) {
    r.submitted = true;
    const sc = Math.round(Math.max(0, r.track.def.par * 1.35 - r.ttBest) * 50);
    if (sc > 0) { const res = submitScore(ID, sc); if (res.isNew) toast('Nytt rekord: ' + Spelhallen.fmt(sc) + ' poäng!'); }
  }
}

/** Delar ut karriärbelöningar. Returnerar lista med rader att visa. */
function grantRewards(e, stars) {
  const out = [];
  if (e.daily) {
    if (stars >= 1 && !save.daily.done.includes(e.id)) {
      save.daily.done.push(e.id); addKr(e.kr); save.crates.push(e.crate);
      out.push(`💰 +${fmtKr(e.kr)}`, `🎁 ${CRATES[e.crate].name}`);
    } else if (stars < 1) out.push('Klarade inte utmaningen – försök igen!');
    return out;
  }
  const prev = save.career[e.id] || 0;
  const chBefore = CHAPTERS.filter(ch => chapterUnlocked(ch, save.career)).length;
  if (stars > prev) {
    save.career[e.id] = stars;
    const kr = Math.round(e.kr * (stars - prev) / 3 / 10) * 10 + (prev === 0 ? Math.round(e.kr / 3 / 10) * 10 : 0);
    addKr(kr); out.push(`💰 +${fmtKr(kr)}`);
    if (prev === 0 && e.crate) { save.crates.push(e.crate); out.push(`🎁 ${CRATES[e.crate].name}`); }
    if (stars === 3 && e.car && giveCar(e.car)) out.push(`🚗 Ny bil: ${carSpec(e.car).name}!`);
  } else if (stars > 0) { const kr = Math.round(e.kr * 0.1 / 10) * 10; addKr(kr); out.push(`💰 +${fmtKr(kr)} (inga nya stjärnor)`); }
  if (e.type === 'duel' && stars === 3 && giveCar(e.rival.car)) out.push(`🚗 Du vann ${esc(e.rival.name)}s ${carSpec(e.rival.car).name}!`);
  const chAfter = CHAPTERS.filter(ch => chapterUnlocked(ch, save.career));
  if (chAfter.length > chBefore) out.push(`🔓 Nytt kapitel: ${chAfter[chAfter.length - 1].name}`);
  return out;
}
function showResults(sm) {
  const cfg = sm.cfg;
  let h = '', title = '';
  const tbl = (rows, cols) => `<table class="fj-table"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r.me ? 'me' : ''}">${cols.map(c => `<td class="${c[2] || ''}">${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const posTxt = (p) => p === 1 ? '🥇 1' : p === 2 ? '🥈 2' : p === 3 ? '🥉 3' : String(p);
  const cols = [['#', (r) => posTxt(sm.rows.indexOf(r) + 1)], ['Förare', r => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${css(r.color)};margin-right:6px"></i>${esc(r.name)}`], ['Bil', r => esc(r.car), 'car'], ['Tid', r => r.elim ? 'Utslagen' : (r.est ? '≈ ' : '') + fmtTime(r.time), 'num'], ['Bästa varv', r => isFinite(r.best) ? fmtTime(r.best) : '–', 'num']];
  const btns = [];
  let msgs = [];
  const podium = (rows) => showroom.showPodium(rows.map(r => ({ car: r.carId, look: r.look, color: r.color })));
  if (cfg.mode === 'cup') {
    const run = save.cupRun; const ev = eventById(run.id);
    sm.rows.forEach((row, k) => { run.points[row.idx] += POINTS[k] || 0; });
    run.scores.push(sm.score);
    run.idx++;
    cols.push(['Poäng', r => '+' + r.pts, 'num']);
    title = `${trackName(cfg.track)} – ${sm.pos}:a plats`;
    h += tbl(sm.rows, cols);
    const stand = run.drivers.map((d, k) => ({ name: d.name, pts: run.points[k], me: !!d.player, color: d.player ? lookOf(d.car).color : d.look.color, look: d.player ? lookOf(d.car) : d.look, car: d.car })).sort((a, b) => b.pts - a.pts);
    const last = run.idx >= ev.tracks.length;
    h += `<h3>${last ? 'Slutställning' : 'Ställning efter ' + run.idx + ' av ' + ev.tracks.length + ' lopp'}</h3>`;
    h += tbl(stand, [['#', r => posTxt(stand.indexOf(r) + 1)], ['Förare', r => esc(r.name)], ['Poäng', r => r.pts, 'num']]);
    if (last) {
      const fpos = stand.findIndex(s => s.me) + 1;
      const bonus = [1500, 900, 500][fpos - 1] || 0;
      const total = Math.round(run.scores.reduce((a, b) => a + b, 0) + bonus * (DIFFICULTY[run.diff] || DIFFICULTY.easy).scoreMult);
      const stars = starsFor(ev, { pos: fpos });
      title = fpos === 1 ? `🏆 Du vann ${ev.name}!` : `${ev.name}: ${fpos}:a plats`;
      const res = submitScore(ID, total);
      msgs = grantRewards(ev, stars);
      h = `<div class="fj-score"><div><small>Stjärnor</small><b>${starTxt(stars)}</b></div><div><small>Cuppoäng</small><b>${Spelhallen.fmt(total)}</b></div><div><small>Rekord</small><b>${Spelhallen.fmt(res.best)}</b></div></div>` + (res.isNew ? '<p class="new-record">Nytt rekord!</p>' : '') + h;
      save.cupRun = null;
      showroom.showPodium(stand.map(s => ({ car: s.car, look: s.look })));
      btns.push(['Karriären', openCareer, true], ['Kör cupen igen', () => startCup(ev, run.diff, run.car)], ['Huvudmeny', toMenu]);
      audio.music(fpos <= 3 ? 'victory' : 'calm');
    } else {
      h = `<div class="fj-score"><div><small>Loppoäng</small><b>${Spelhallen.fmt(sm.score)}</b></div><div><small>Driftpoäng</small><b>${Spelhallen.fmt(sm.drift)}</b></div></div>` + h;
      podium(sm.rows);
      btns.push(['Nästa lopp: ' + trackName(ev.tracks[run.idx]), continueCup, true], ['Huvudmeny', toMenu]);
      audio.music(sm.pos <= 3 ? 'victory' : 'calm');
    }
    persist();
  } else if (cfg.mode === 'career') {
    const e = findEvent(cfg.ev);
    const me = sm.rows.find(r => r.me);
    const stars = starsFor(e, { pos: sm.pos, time: me.time, drift: sm.drift, par: trackById(cfg.track).def.par });
    msgs = grantRewards(e, stars);
    const res = submitScore(ID, sm.score);
    const t = ETYPES[e.type];
    title = `${t.icon} ${e.name} – ` + (stars ? ['', 'Brons', 'Silver', 'Guld'][stars] + (e.type === 'duel' ? '' : '') : 'Ingen medalj');
    if (e.type === 'duel') title = stars ? `⚔️ Du vann duellen!` : `⚔️ Duellen förlorad`;
    let sc = `<div><small>Stjärnor</small><b>${starTxt(stars)}</b></div>`;
    if (e.type === 'tid' || e.type === 'rally') sc += `<div><small>Din tid</small><b>${fmtTime(me.time)}</b></div><div><small>Guldtid</small><b>${fmtTime(e.tgt[0] * trackById(cfg.track).def.par * (e.laps || 1))}</b></div>`;
    else if (e.type === 'drift') sc += `<div><small>Driftpoäng</small><b>${Spelhallen.fmt(sm.drift)}</b></div><div><small>Guld</small><b>${e.tgt[0]}</b></div>`;
    else sc += `<div><small>Placering</small><b>${sm.pos}</b></div><div><small>Poäng</small><b>${Spelhallen.fmt(sm.score)}</b></div>`;
    h += `<div class="fj-score">${sc}</div>` + (res.isNew ? '<p class="new-record">Nytt rekord!</p>' : '');
    if (sm.rows.length > 1) h += tbl(sm.rows, cols);
    persist();
    podium(sm.rows);
    btns.push(['Karriären', openCareer, true], ['Försök igen', () => startEvent(e, cfg.car)], ['Huvudmeny', toMenu]);
    audio.music(stars ? 'victory' : 'calm');
  } else {
    const res = submitScore(ID, sm.score);
    const kr = Math.round(([600, 400, 300, 200][sm.pos - 1] || 100) * (DIFFICULTY[cfg.diff] || DIFFICULTY.easy).scoreMult * Math.min(1, (sm.rows.length - 1) / 5) / 10) * 10;
    if (kr > 0) { addKr(kr); msgs.push(`💰 +${fmtKr(kr)}`); persist(); }
    title = sm.pos === 1 ? '🏆 Seger på ' + trackName(cfg.track) + '!' : `${trackName(cfg.track)} – ${sm.pos}:a plats`;
    h += `<div class="fj-score"><div><small>Poäng</small><b>${Spelhallen.fmt(sm.score)}</b></div><div><small>Driftpoäng</small><b>${Spelhallen.fmt(sm.drift)}</b></div><div><small>Rekord</small><b>${Spelhallen.fmt(res.best)}</b></div></div>` + (res.isNew ? '<p class="new-record">Nytt rekord!</p>' : '');
    h += tbl(sm.rows, cols);
    podium(sm.rows);
    btns.push(['Kör igen', () => startRace(cfg), true], ['Byt bana', () => { openSetup('quick'); }], ['Huvudmeny', toMenu]);
    audio.music(sm.pos <= 3 ? 'victory' : 'calm');
  }
  if (msgs.length) h = `<div class="fj-rewards">${msgs.map(m => `<p class="fj-unlock">${m}</p>`).join('')}</div>` + h;
  $('resTitle').textContent = title;
  $('resBody').innerHTML = h;
  const bb = $('resBtns'); bb.innerHTML = '';
  btns.forEach(([t, fn, prim]) => { const b = document.createElement('button'); b.className = 'btn' + (prim ? ' primary' : ''); b.textContent = t; b.addEventListener('click', () => { audio.play('select'); fn(); }); bb.appendChild(b); });
  screen('results');
}

/* ------------------------------------------------------------------ Online */
let net = null, lobby = null;
const ol = { stopTick: null, loaded: new Set(), goAt: null, bgAcc: 0, results: null, emo: null, startCfg: null };
function ensureNet() {
  if (net) return;
  net = makeNet();
  lobby = makeLobby(net, {
    container: $('online'), save, persist, css, carUnlocked, lookOf, onCar: (id) => showroom.setCar(id, lookOf(id)),
    onBack: () => { lobby.close(); screen('menu'); updateMenu(); },
    onStartPressed: () => net.startGame(buildStart(net))
  });
  lobby.el.classList.add('fj-side', 'wide-side');
  net.on('start', p => onlineStart(p));
  net.on('lobby', () => { if (race && race.online) { disposeRace(); hudEl.classList.add('hidden'); buildTouch(); } openOnline(); });
  net.onMsg('cs', (a, from) => { const c = race && race.online && race.byKey[from]; if (c && c.remote) pushSample(c, a); });
  net.onMsg('ai', list => { if (!race || !race.online || net.isHost) return; for (const a of list) { const c = race.byKey['ai' + (a[0] | 0)]; if (c && c.remote) pushSample(c, a, 1); } });
  net.onMsg('rk', keys => { if (race && race.online && !net.isHost) race.rank = keys; });
  net.onMsg('ld', (v, from) => { if (net.isHost) ol.loaded.add(from); });
  net.onMsg('go', at => { if (!net.isHost && ol.goAt == null) ol.goAt = at; });
  net.onMsg('res', rows => { if (race && race.online && !net.isHost && !race.ended) onlineFinish(rows); });
  net.on('peerleave', p => { if (race && race.online && !race.ended) removeRemote(p.id, p.name + (p.wasHost ? ' (värden)' : '') + ' lämnade loppet'); });
  net.on('hostleft', h => {
    if (!race || !race.online || race.ended) { if (ol.results && h.newHost) showOnlineResults(ol.results); return; }
    if (h.newHost === net.selfId) {
      // ta över datorförarna där de är just nu
      const r = race, d = DIFFICULTY[r.cfg.diff] || DIFFICULTY.easy, L = r.track.L;
      for (const c of r.cars) if (c.remote && isAiKey(c.key)) {
        c.remote = false; c.lastS = c.tp.s;
        c.cpNext = clamp(Math.floor((c.progress - c.lapsDone * L) / (L / KCP)) + 1, 1, KCP);
        c.ai = new AIDriver(c, r.track, { skill: 0.95, aggr: 0.5, pace: d.pace }); r.ais.push(c.ai); c.powerMul = d.power;
        c.raceActive = r.state !== 'countdown';
      }
      if (ol.goAt == null) { ol.goAt = net.now() + 3500; }
      hud.msg('Värden lämnade – du är ny värd', 2600, 'gold');
    } else hud.msg('Värden lämnade – ' + (h.newName || 'en annan spelare') + ' tar över', 2600, 'gold');
  });
  net.on('emote', e => { if (race && race.online && !race.ended) hud.msg((e.player && !e.player.isMe ? e.player.name : 'Du') + ': ' + e.text, 2000, 'cyan'); });
  net.on('error', err => {
    if (err.soft) return;
    if (race && race.online) { toast('Anslutningen bröts: ' + err.message, { ms: 3500 }); disposeRace(); hudEl.classList.add('hidden'); buildTouch(); openOnline(); }
    else if (!$('results').classList.contains('hidden') && ol.results) { toast('Anslutningen bröts', { ms: 3000 }); openOnline(); }
  });
}
function openOnline() {
  ensureNet();
  ol.results = null;
  if (ol.emo) { ol.emo.destroy(); ol.emo = null; }
  if (race) { endSession(true); disposeRace(); }
  hudEl.classList.add('hidden');
  showroom.showCar(); showroom.setCar(save.car, lookOf(save.car));
  screen('online'); lobby.open();
  audio.music('adventure');
}
function onlineStart(p) {
  if (!p.grid.some(g => g.id === net.selfId)) return; // anslöt under pågående lopp – med i nästa
  lobby.close();
  if (ol.emo) { ol.emo.destroy(); ol.emo = null; }
  ol.loaded = new Set(); ol.goAt = null; ol.results = null; ol.startCfg = p;
  const me = p.grid.find(g => g.id === net.selfId);
  startRace({ mode: 'online', online: true, track: p.track, laps: p.laps, diff: p.diff, grid: p.grid, car: me.car, color: me.col, opp: 0 });
}
/** Synkad nedräkning: värden väntar tills alla laddat klart (högst 15 s) och skickar sedan KÖR-tiden. */
function onlineCountdown(r, dt) {
  r.waitT += dt;
  if (net.isHost) {
    if (ol.goAt == null) {
      const need = r.cars.filter(c => c.isHuman && !ol.loaded.has(c.key));
      if (!need.length || r.waitT > 15) ol.goAt = net.now() + 3800;
    }
    r.goT -= dt;
    if (ol.goAt != null && r.goT <= 0) { r.goT = 1; net.send('go', ol.goAt); } // skickas om – sena laddare
  }
  if (ol.goAt == null) {
    if (r.waitT > 1.5 && !r.waitMsg) { r.waitMsg = true; hud.center('Väntar på andra spelare …'); }
    if (r.waitT > 25 && !net.isHost && !r.waitWarn) { r.waitWarn = true; hud.msg('Värden svarar inte – lämna via menyn om det dröjer', 3000); }
    return 4.2;
  }
  if (r.waitMsg) { r.waitMsg = false; hud.center(''); }
  return Math.min(4.2, (ol.goAt - net.now()) / 1000);
}
const _pk = [];
function onlineSend(r, dt) {
  r.sendT -= dt; r.aiT -= dt; r.rkT -= dt;
  const running = r.state !== 'countdown';
  if (r.sendT <= 0) { r.sendT = running ? 1 / 20 : 0.5; net.sendFast('cs', packCar(r.player, r.time, _pk)); }
  if (!net.isHost) return;
  if (r.aiT <= 0 && r.ais.length) {
    r.aiT = running ? 1 / 15 : 0.5;
    const list = [];
    for (const c of r.cars) if (!c.remote && !c.isPlayer && isAiKey(c.key)) list.push([+c.key.slice(2), ...packCar(c, r.time)]);
    if (list.length) net.sendFast('ai', list);
  }
  if (r.rkT <= 0 && running && r.sorted) { r.rkT = 0.2; net.sendFast('rk', r.sorted.map(c => c.key)); }
}
/** Värden: avgör när loppet är slut. true = slut (resultat skickat). */
function onlineHostEnd(r, dt) {
  if (r.state === 'countdown') return false;
  const humans = r.cars.filter(c => c.isHuman);
  const fins = humans.filter(c => c.finished);
  if (fins.length && r.firstHumanFin == null) { r.firstHumanFin = r.time; hud.msg('Första i mål! 60 sekunder kvar för övriga', 2600, 'gold'); }
  if (fins.length !== r.lastFinN) { r.lastFinN = fins.length; r.lastFin = r.time; }
  const allHumans = humans.length > 0 && fins.length === humans.length;
  const allCars = r.cars.every(c => c.finished);
  const over = (allHumans && r.time - r.lastFin > 3.5) || (allCars && r.time - r.lastFin > 2) || (r.firstHumanFin != null && r.time - r.firstHumanFin > 60);
  if (!over) return false;
  const L = r.track.L, laps = r.cfg.laps;
  const rows = r.cars.map(c => {
    if (c.finished) return [c.key, c.finishTime, isFinite(c.bestLap) ? c.bestLap : -1, 0];
    const avg = Math.max(12, c.progress / Math.max(1, r.time));
    return [c.key, r.time + Math.max(0, laps * L - c.progress) / avg, isFinite(c.bestLap) ? c.bestLap : -1, 1];
  }).sort((a, b) => a[1] - b[1]).map(x => [x[0], Math.round(x[1] * 1000) / 1000, Math.round(x[2] * 1000) / 1000, x[3]]);
  net.send('res', rows);
  onlineFinish(rows);
  return true;
}
function onlineFinish(rows) {
  const r = race; if (!r || r.ended) return; r.ended = true;
  const grid = r.cfg.grid;
  const res = rows.map(([key, time, best, est]) => {
    const g = grid.find(x => x.id === key) || { n: '?', car: 'viggen', col: 0xcccccc };
    return { key, name: key === net.selfId ? g.n + ' (du)' : g.n, car: carSpec(g.car).name, carId: g.car, color: g.col, look: lookFromNet(g), time, best: best >= 0 ? best : Infinity, est: !!est, me: key === net.selfId, human: !isAiKey(key) };
  });
  ol.results = { rows: res, track: r.cfg.track, laps: r.cfg.laps };
  disposeRace();
  hudEl.classList.add('hidden'); buildTouch();
  showOnlineResults(ol.results);
}
function showOnlineResults(sm) {
  const posTxt = (p) => p === 1 ? '🥇 1' : p === 2 ? '🥈 2' : p === 3 ? '🥉 3' : String(p);
  const pos = sm.rows.findIndex(x => x.me) + 1;
  const esc = (t) => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  $('resTitle').textContent = pos === 1 ? '🏆 Du vann på ' + trackName(sm.track) + '!' : `${trackName(sm.track)} – ${pos}:a plats`;
  let h = `<table class="fj-table"><thead><tr><th>#</th><th>Förare</th><th class="car">Bil</th><th class="num">Tid</th><th class="num">Bästa varv</th></tr></thead><tbody>` +
    sm.rows.map((x, k) => `<tr class="${x.me ? 'me' : ''}"><td>${posTxt(k + 1)}</td><td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${css(x.color)};margin-right:6px"></i>${x.human ? '👤 ' : ''}${esc(x.name)}</td><td class="car">${esc(x.car)}</td><td class="num">${(x.est ? '≈ ' : '') + fmtTime(x.time)}</td><td class="num">${isFinite(x.best) ? fmtTime(x.best) : '–'}</td></tr>`).join('') + `</tbody></table>`;
  h += `<p class="fj-note" id="olResNote">${net.isHost ? 'Du är värd – starta nästa lopp eller gå tillbaka till lobbyn.' : 'Väntar på att värden startar nästa lopp …'}</p><div id="olEmo"></div>`;
  $('resBody').innerHTML = h;
  if (ol.emo) ol.emo.destroy();
  ol.emo = emoteBar(net, root); $('olEmo').appendChild(ol.emo.el);
  const bb = $('resBtns'); bb.innerHTML = '';
  const btns = net.isHost
    ? [['Spela igen', () => net.startGame(buildStart(net)), true], ['Till lobbyn', () => net.backToLobby()], ['Lämna', toMenu]]
    : [['Till lobbyn', () => openOnline()], ['Lämna', toMenu]];
  btns.forEach(([t, fn, prim]) => { const b = document.createElement('button'); b.className = 'btn' + (prim ? ' primary' : ''); b.textContent = t; b.addEventListener('click', () => { audio.play('select'); fn(); }); bb.appendChild(b); });
  showroom.showPodium(sm.rows.map(x => ({ car: x.carId, look: x.look, color: x.color })));
  audio.music(pos <= 3 ? 'victory' : 'calm');
  screen('results');
}
function removeRemote(id, msg) {
  const r = race; const c = r && r.byKey[id];
  if (!c || c.isPlayer) return;
  scene.remove(c.root); disposeCarModel(c.model);
  r.cars.splice(r.cars.indexOf(c), 1); delete r.byKey[id];
  if (r.sorted) r.sorted = r.sorted.filter(x => x !== c);
  hud.e.posOf.textContent = '/' + r.cars.length;
  hud.msg(msg, 2400);
}
/** Håller loppet igång när fliken är dold/inte ritas (andra spelare väntar inte på oss). */
function bgStep(dt) {
  if (!race || !race.online || race.ended) return;
  ol.bgAcc += dt;
  let n = 0;
  while (ol.bgAcc >= 1 / 60 && n++ < 15) { ol.bgAcc -= 1 / 60; raceUpdate(1 / 60); input.endFrame(); if (!race || race.ended) break; }
  loop.last = performance.now();
}

/* ------------------------------------------------------------------ Kamera */
const _cf = new THREE.Vector3(), _cu = new THREE.Vector3(), _cd = new THREE.Vector3(), _ct = new THREE.Vector3(), _cl = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function updateCamera(frameDt) {
  const r = race, P = r.player, tr = r.track;
  const dt = Math.min(0.05, frameDt);
  const p = P.root.position;
  const F = _cf.set(0, 0, 1).applyQuaternion(P.root.quaternion);
  const U = _cu.set(0, 1, 0).applyQuaternion(P.root.quaternion);
  const kmh = P.speed * 3.6;
  const asp = R.size.w / R.size.h;
  let fovT = settings.get('fov') - 6 + clamp((kmh - 50) / 170, 0, 1) * 15 + (P.nitroOn ? 7 : 0) + (asp < 1 ? (1 - asp) * 26 : 0);
  // riktning: blanda nos och färdriktning (syns vid drift)
  const hv = Math.hypot(P.vel.x, P.vel.z);
  const dir = _cd.set(F.x, 0, F.z).normalize();
  if (hv > 6 && P.vf > 0) { _ct.set(P.vel.x / hv, 0, P.vel.z / hv); dir.lerp(_ct, 0.45).normalize(); }
  let mode = r.camMode;
  if (r.state === 'countdown' && r.introT < 3.2 && r.cfg.mode !== 'free') mode = 'intro';
  if (r.state === 'finished') mode = 'orbit';
  if ((r.lookBack || mode === 3) && mode !== 'orbit' && mode !== 'intro') mode = 'back';
  let pos = _ct, look = _cl;
  if (mode === 0 || mode === 1 || mode === 'intro') {
    const dist = mode === 1 ? 4.6 : 6.6, h = mode === 1 ? 1.65 : 2.35;
    const want = _v3.copy(dir).multiplyScalar(-dist); want.y += h;
    if (!P.grounded) want.y += 0.6;
    const k = P.grounded ? 7 : 4;
    r.camOff.x = damp(r.camOff.x, want.x, k, dt); r.camOff.z = damp(r.camOff.z, want.z, k, dt); r.camOff.y = damp(r.camOff.y, want.y, 5, dt);
    pos.copy(p).add(r.camOff);
    look.copy(p).addScaledVector(dir, 3.5); look.y += mode === 1 ? 0.95 : 1.15;
    if (mode === 'intro') {
      const t = clamp(r.introT / 3.2, 0, 1), e = t * t * (3 - 2 * t);
      const a = (1 - e) * 2.6 + 0.2;
      const ip = _v2.copy(p).addScaledVector(dir, Math.cos(a) * 10).add(_v1.set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(a) * 10)); ip.y += 2.2 + (1 - e) * 3;
      pos.lerpVectors(ip, pos, e);
      _v1.copy(p); _v1.y += 0.8; look.lerpVectors(_v1, look, e);
    }
  } else if (mode === 2) {
    pos.copy(p).addScaledVector(U, 1.22).addScaledVector(F, 0.15);
    look.copy(pos).addScaledVector(F, 20).addScaledVector(U, -0.6);
    r.camOff.copy(pos).sub(p);
    fovT += 4;
  } else if (mode === 'back') {
    pos.copy(p).addScaledVector(U, 1.85).addScaledVector(F, -0.4);
    look.copy(p).addScaledVector(F, -20); look.y += 1.0;
  } else { // orbit vid målgång
    r.orbitA = (r.orbitA == null ? Math.atan2(r.camOff.x, r.camOff.z) : r.orbitA) + dt * 0.35;
    pos.set(p.x + Math.sin(r.orbitA) * 8, p.y + 2.6, p.z + Math.cos(r.orbitA) * 8);
    look.copy(p); look.y += 0.8;
    r.camOff.copy(pos).sub(p);
  }
  // håll kameran innanför räcken/tunnelväggar och ovanför marken
  if (mode !== 2 && mode !== 'back') {
    tr.project(pos, r.tp.i >= 0 ? r.tp.i : P.tp.i, r.tp);
    const lim = tr.limit - 0.4;
    const side = r.tp.d < 0 ? -1 : 1;
    if (Math.abs(r.tp.d) > lim && tr.wallAt(r.tp.i, side) && Math.abs(r.tp.i - P.tp.i) < 40) {
      pos.addScaledVector(r.tp.R, -side * (Math.abs(r.tp.d) - lim));
    }
    if (tr.tunnel[r.tp.i]) { const maxH = tr.theme.tunnel === 'city' ? 5.4 : 6.2; if (r.tp.h > maxH) pos.addScaledVector(r.tp.N, maxH - r.tp.h); }
    if (r.tp.h < 0.5 && Math.abs(r.tp.d) < tr.limit + 3) pos.addScaledVector(r.tp.N, 0.5 - r.tp.h);
    const gy = r.world.heightAt(pos.x, pos.z) + 0.6;
    if (pos.y < gy && !tr.tunnel[r.tp.i]) pos.y = gy;
  }
  // skak
  r.shake = Math.max(0, r.shake - dt * 1.8);
  if (settings.get('shake') && r.shake > 0) {
    const s = r.shake * r.shake * 0.35;
    pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s;
  }
  // lätt vibration vid hög fart
  if (settings.get('shake') && kmh > 150 && mode !== 2) pos.y += (Math.random() - 0.5) * 0.02 * (kmh - 150) / 80;
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(look);
  if (mode === 2) { camera.up.copy(U); camera.lookAt(look); }
  r.fov = damp(r.fov, fovT, 3, dt);
  if (Math.abs(camera.fov - r.fov) > 0.01) { camera.fov = r.fov; camera.updateProjectionMatrix(); }
  camera.far = r.world.fogFar * 1.25; camera.near = mode === 2 ? 0.1 : 0.2;
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ Loop */
let lastMenuPad = [];
const _lbl = [];
function menuPad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const g of gps) if (g) { gp = g; break; }
  if (!gp) return;
  const pr = (i) => { const d = !!(gp.buttons[i] && gp.buttons[i].pressed); const p = d && !lastMenuPad[i]; return p; };
  const ay = gp.axes[1] || 0;
  const axisUp = ay < -0.6 && !(lastMenuPad.ay < -0.6), axisDn = ay > 0.6 && !(lastMenuPad.ay > 0.6);
  const vis = SCREENS.map(id => $(id)).find(el => !el.classList.contains('hidden') && el.id !== 'loading');
  if (race && pr(9)) { if (!vis || vis.id === 'pause') pauseGame(!uiPaused()); }
  else if (vis) {
    const items = [...vis.querySelectorAll('button:not([disabled]), a.btn, select, input')].filter(el => el.offsetParent !== null);
    let i = items.indexOf(document.activeElement);
    if (pr(12) || pr(14) || axisUp) { i = i <= 0 ? items.length - 1 : i - 1; items[i] && items[i].focus(); }
    if (pr(13) || pr(15) || axisDn) { i = (i + 1) % items.length; items[i] && items[i].focus(); }
    if (pr(0) && document.activeElement && items.includes(document.activeElement)) document.activeElement.click();
    if (pr(1)) { const b = vis.querySelector('[data-back]'); if (b) b.click(); else if (vis.id === 'pause') pauseGame(false); }
  }
  lastMenuPad = gp.buttons.map(b => b.pressed); lastMenuPad.ay = ay;
}

const loop = new Loop({
  update(dt) {
    if (race && !paused && !race.ended) raceUpdate(dt);
    audio.update();
    input.endFrame();
  },
  render(alpha, frameDt) {
    menuPad();
    if (race && !race.ended) {
      const r = race;
      if (r.slowmo > 0 && !paused) { r.slowmo -= frameDt; if (r.slowmo <= 0) loop.timeScale = 1; }
      // namnskyltar bara på de tre närmaste bilarna framför kameran (annars blir det en textvägg i klungan)
      let shown = 0;
      _lbl.length = 0;
      camera.getWorldDirection(_v1);
      for (const c of r.cars) {
        c.showLabel = false;
        if (c.isPlayer) continue;
        _v2.subVectors(c.pos, camera.position);
        if (_v2.dot(_v1) > 0) { c._ld = _v2.length(); _lbl.push(c); }
      }
      if (r.state === 'running') {
        _lbl.sort((a, b) => a._ld - b._ld);
        for (const c of _lbl) { if (shown >= 3 || c._ld > 70) break; if (c._ld > 10) { c.showLabel = true; shown++; } }
      }
      for (const c of r.cars) { c.camDist = c.pos.distanceTo(camera.position); c.syncVisual(r.state === 'countdown' ? 1 : alpha, r.time); if (c.elim && !c.isPlayer) c.root.visible = false; }
      if (r.ghost && r.ghost.frames && r.cfg.mode === 'time' && r.state === 'running') {
        const f = r.ghost.frames, n = f.length / 7;
        const t = (r.time - r.player.lapStart) * 30;
        const i = Math.floor(t);
        if (i < n - 1) {
          const a = t - i, o = i * 7, o2 = o + 7;
          r.ghost.model.root.position.set(lerp(f[o], f[o2], a), lerp(f[o + 1], f[o2 + 1], a), lerp(f[o + 2], f[o2 + 2], a));
          _q.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]); _q2.set(f[o2 + 3], f[o2 + 4], f[o2 + 5], f[o2 + 6]);
          r.ghost.model.root.quaternion.slerpQuaternions(_q, _q2, a);
          r.ghost.model.root.visible = true;
        } else r.ghost.model.root.visible = false;
      }
      updateCamera(frameDt);
      r.world.update(paused ? 0 : frameDt, camera, r.player.root.position, r.player.vel);
      r.world.cheer.uCheer.value = r.state === 'countdown' ? 0.6 : 0.25 + (r.state === 'finished' ? 0.75 : 0);
      r.particles.setScale(R.size.h); r.sparks.setScale(R.size.h);
      const sp = settings.get('speedFx') ? clamp((r.player.speed * 3.6 - 120) / 110, 0, 1) : 0;
      r.hurt = Math.max(0, r.hurt - frameDt * 1.5);
      r.speedFx.set(r.world.time, sp, r.player.nitroOn ? 1 : 0, R.size.w / R.size.h, r.hurt);
      drawHudCanvases();
      if (composer) composer.render(); else renderer.render(scene, camera);
    } else if (crateFx.active) {
      crateFx.render(Math.min(0.05, frameDt));
    } else {
      showroom.render(Math.min(0.05, frameDt));
    }
  }
});
fpsMeter(root, loop, settings);

/* ------------------------------------------------------------------ Start */
(async function boot() {
  loader.set(0.3, 'Polerar lacken …');
  await tick();
  showroom.setCar(save.car, lookOf(save.car));
  loader.set(0.9, 'Klart!');
  await tick();
  loop.start();
  screen('menu'); updateMenu();
  buildTouch();
  // musik startar vid första interaktion
  const startMusic = () => { audio.music('adventure'); removeEventListener('pointerdown', startMusic); removeEventListener('keydown', startMusic); };
  addEventListener('pointerdown', startMusic); addEventListener('keydown', startMusic);
  // felsökningskrok – bara med ?debug i adressen (annars går det att fuska via konsolen)
  if (/[?&]debug\b/.test(location.search)) {
    window.__fj = { get race() { return race; }, startEvent, findEvent, openCareer, grantRewards, get net() { return net; }, get lobby() { return lobby; }, bgStep, save, settings, loop, startRace, toMenu, scene, renderer, camera, AIDriver, input, hud, startCup, showResults, endRace,
      get composer() { return composer; }, crateFx, openCrateAnim, crateData,
      /** Testlåda med valda delnycklar (sparar inget utom ev. montering). */
      crateDemo(type, keys, coins = 500, car = null) { const res = { items: keys.map(k => ({ key: k, info: partInfo(k), dup: save.parts.includes(k) })), coins, car }; screen(null); crateFx.open(crateData(type, res, 0)); },
      step(n) { for (let k = 0; k < n && race && !race.ended; k++) { raceUpdate(1 / 60); input.endFrame(); } },
      frames(n) { for (let k = 0; k < n; k++) loop.render(1, 1 / 30); } };
    window.__ok = true;
  }
})();
