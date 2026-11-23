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
import { CARS, COLORS, AI_DRIVERS, DIFFICULTY, POINTS, TRACKS, CUPS, UNLOCK_TEXT, CAR_TIER, trackById, trackName } from './data.js';
import { Track } from './track.js';
import { World } from './world.js';
import { Car, collideCars, buildCarModel, disposeCarModel } from './car.js';
import { AIDriver } from './ai.js';
import { Particles, Skids, SpeedFx } from './fx.js';
import { Hud, fmtTime } from './hud.js';
import * as TX from './textures.js';
import { engineVoice } from './sound.js';
import { makeNet, makeLobby, buildStart, packCar, pushSample, stepRemote, INTERP } from './online.js';
import { backgroundTicker, emoteBar } from '../../engine/net.js';

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
const save = Object.assign({ cups: {}, cars: [], tutorial: false, best: {}, car: 'viggen', color: 0, diff: 'easy', laps: 3, opp: 7, track: 'midsommar', cup: 'brons', cupRun: null, tt: 'midsommar' }, Spelhallen.store.get(SAVE, {}));
const persist = () => Spelhallen.store.set(SAVE, save);
const carSpec = (id) => CARS.find(c => c.id === id) || CARS[0];
const carUnlocked = (c) => !c.unlock || save.cars.includes(c.id);
const cupUnlocked = (cup) => !cup.unlock || !!(save.cups[cup.unlock] && save.cups[cup.unlock].best <= 3);
const reverseUnlocked = () => !!(save.cups.silver && save.cups.silver.best <= 3);
function trackUnlocked(key) {
  const t = trackById(key); if (!t) return false;
  if (t.reverse && !reverseUnlocked()) return false;
  return CUPS.some(c => cupUnlocked(c) && c.tracks.some(k => k.split('@')[0] === t.def.id));
}
/** Medaljtider för tidskörning (sekunder per varv). */
function medalTimes(key) { const p = trackById(key).def.par; return [p * 0.86, p * 0.93, p * 1.0]; }
function medalFor(key, t) { if (!t) return ''; const m = medalTimes(key); return t <= m[0] ? '🥇' : t <= m[1] ? '🥈' : t <= m[2] ? '🥉' : ''; }
function allTrackKeys() { return TRACKS.map(t => t.id).concat(TRACKS.map(t => t.id + '@r')); }
if (!carUnlocked(carSpec(save.car))) save.car = 'viggen';

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
  function clearPodium() { podCars.forEach(m => { podium.remove(m.root); disposeCarModel(m); }); podCars = []; }
  return {
    scene: sc, cam,
    setCar(id, colorIdx) {
      const k = id + ':' + colorIdx;
      if (k === modelKey && model) return;
      if (model) { turn.remove(model.root); disposeCarModel(model); }
      model = buildCarModel(carSpec(id), COLORS[colorIdx].hex, { physical: true });
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
        const m = buildCarModel(carSpec(e.car), e.color, { physical: true });
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
        angle += dt * 0.35;
        turn.rotation.y = angle;
        const d = 8.8 * Math.max(1, 1.2 / cam.aspect);
        cam.position.set(Math.sin(0.6) * d, 1.95 + (d - 8.8) * 0.12, Math.cos(0.6) * d);
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
const SCREENS = ['loading', 'menu', 'setup', 'settingsScr', 'help', 'pause', 'results', 'online'];
const isRace = (m) => m === 'quick' || m === 'cup' || m === 'online';
const isAiKey = (k) => /^ai\d$/.test(k || '');
function screen(id) { SCREENS.forEach(s => s === id ? show(s) : hide(s)); }
let backTo = 'menu';

function updateMenu() {
  const b = bestScore(ID);
  $('mBest').textContent = b > 0 ? `Ditt rekord: ${Spelhallen.fmt(b)} poäng` : 'Tips: börja med Bronsbucklan i Mästerskap.';
  let play = $('mPlay');
  if (!play) { play = document.createElement('button'); play.id = 'mPlay'; play.className = 'btn primary'; $('mCup').parentNode.insertBefore(play, $('mCup')); $('mCup').classList.remove('primary'); play.addEventListener('click', () => { audio.play('select'); quickPlay(); }); }
  const run = save.cupRun;
  if (run) { const cup = CUPS.find(c => c.id === run.id); play.innerHTML = `<span class="ic" aria-hidden="true">▶</span>Fortsätt ${cup.name} (lopp ${run.idx + 1}/${cup.tracks.length})`; }
  else play.innerHTML = '<span class="ic" aria-hidden="true">▶</span>Spela';
}
function quickPlay() {
  if (save.cupRun) return continueCup();
  if (!save.tutorial) return startCup('brons', save.diff || 'easy');
  openSetup('quick');
}
function toMenu() {
  if (net && net.status !== 'idle') net.leave();
  if (ol.emo) { ol.emo.destroy(); ol.emo = null; }
  ol.results = null;
  if (race) endSession(true);
  disposeRace();
  showroom.showCar(); showroom.setCar(save.car, save.color);
  screen('menu'); updateMenu();
  audio.music('adventure');
  hudEl.classList.add('hidden'); buildTouch();
}

/* ---------- Val-skärm ---------- */
let setup = null;
function openSetup(mode) {
  setup = { mode, track: save.track, car: save.car, color: save.color, laps: save.laps, diff: save.diff, opp: save.opp, cup: save.cup };
  if (mode === 'time') setup.track = save.tt || save.track;
  if (!trackUnlocked(setup.track)) setup.track = 'midsommar';
  if (!cupUnlocked(CUPS.find(c => c.id === setup.cup) || CUPS[0])) setup.cup = 'brons';
  $('setupTitle').textContent = { cup: 'Mästerskap', quick: 'Snabblopp', time: 'Tidskörning', free: 'Fri körning' }[mode];
  renderSetup();
  screen('setup');
  showroom.showCar();
}
function seg(label, items, cur, onPick) {
  return `<div class="fj-sec"><label>${label}</label><div class="fj-seg" data-seg="${onPick}">${items.map(([v, t]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
}
function renderSetup() {
  const s = setup; let h = '';
  if (s.mode === 'cup') {
    h += `<div class="fj-sec"><label>Cup</label><div class="fj-cards">` + CUPS.map(c => {
      const un = cupUnlocked(c); const res = save.cups[c.id];
      const medal = res ? (res.best === 1 ? '🥇' : res.best === 2 ? '🥈' : res.best === 3 ? '🥉' : `${res.best}:a`) : '';
      return `<button class="fj-card ${s.cup === c.id ? 'on' : ''} ${un ? '' : 'locked'}" data-cup="${c.id}"><span class="tag">${un ? medal : '🔒'}</span><b>${c.medal} ${c.name}</b><small>${un ? c.tracks.map(trackName).join(' · ') : 'Lås upp: kom topp 3 i ' + CUPS.find(x => x.id === c.unlock).name}</small></button>`;
    }).join('') + `</div></div>`;
  } else {
    const keys = allTrackKeys().filter(k => !trackById(k).reverse || reverseUnlocked());
    h += `<div class="fj-sec"><label>Bana</label><div class="fj-cards">` + keys.map(k => {
      const t = trackById(k), un = trackUnlocked(k);
      const best = save.best[k];
      return `<button class="fj-card ${s.track === k ? 'on' : ''} ${un ? '' : 'locked'}" data-track="${k}"><span class="tag">${un ? medalFor(k, best) : '🔒'}</span><b>${trackName(k)}</b><small>${best ? 'Bästa varv ' + fmtTime(best) : (t.def.grip < 0.8 ? 'Halt underlag' : t.def.theme === 'stad' ? 'Nattlopp i regn' : '&nbsp;')}</small><span class="sw" style="background:${themeSwatch(t.def.theme)}"></span></button>`;
    }).join('') + `</div><p class="fj-desc">${trackById(s.track).def.desc}${trackById(s.track).reverse ? ' Körs baklänges.' : ''}</p>` +
      (s.mode === 'time' ? `<p class="fj-desc">Medaljtider: ${medalTimes(s.track).map((t, k) => ['🥇', '🥈', '🥉'][k] + ' ' + fmtTime(t)).join(' · ')}</p>` : '') + `</div>`;
  }
  if (s.mode === 'cup' || s.mode === 'quick') h += seg('Svårighetsgrad', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.label]), s.diff, 'diff');
  if (s.mode === 'quick') {
    h += seg('Varv', [1, 2, 3, 4, 5, 6].map(n => [n, n]), s.laps, 'laps');
    h += seg('Motståndare', [1, 3, 5, 7].map(n => [n, n]), s.opp, 'opp');
  }
  h += `<div class="fj-sec"><label>Bil</label><div class="fj-cards">` + CARS.map(c => {
    const un = carUnlocked(c);
    return `<button class="fj-card ${s.car === c.id ? 'on' : ''} ${un ? '' : 'locked'}" data-car="${c.id}"><span class="tag">${un ? '' : '🔒'}</span><b>${c.name}</b><small>${un ? c.klass : UNLOCK_TEXT[c.unlock]}</small></button>`;
  }).join('') + `</div></div>`;
  h += `<div class="fj-sec"><label>Färg</label><div class="fj-swatches">` + COLORS.map((c, k) => `<button class="${s.color === k ? 'on' : ''}" data-color="${k}" title="${c.name}" aria-label="${c.name}" style="background:${css(c.hex)}"></button>`).join('') + `</div></div>`;
  $('setupBody').innerHTML = h;
  const go = $('setupGo');
  go.textContent = s.mode === 'cup' ? (save.cupRun && save.cupRun.id === s.cup ? 'Starta om cupen' : 'Starta cupen') : 'Starta';
  go.disabled = !carUnlocked(carSpec(s.car)) || (s.mode === 'cup' ? !cupUnlocked(CUPS.find(c => c.id === s.cup)) : !trackUnlocked(s.track));
  showroom.setCar(s.car, s.color);
  const spec = carSpec(s.car);
  const bar = (label, v) => `<div class="fj-stat"><span>${label}</span><i><em style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></em></i></div>`;
  $('carInfo').innerHTML = `<h3>${spec.name}</h3><div class="k">${spec.klass} · ${COLORS[s.color].name}</div>` +
    bar('Toppfart', (spec.top - 50) / 21) + bar('Acceleration', (spec.accel - 7) / 6.5) + bar('Väggrepp', (spec.grip - 13) / 4.5) + bar('Vikt', (spec.mass - 0.7) / 0.95) + bar('Driftvillighet', (spec.drift - 0.7) / 0.8) +
    `<p class="fj-desc">${spec.desc}</p>`;
}
function themeSwatch(th) { return { midsommar: 'linear-gradient(90deg,#f4d2a0,#4e7d2f)', skargard: 'linear-gradient(90deg,#2f72d2,#b59484)', odemark: 'linear-gradient(90deg,#ff9448,#d7a96a)', fjall: 'linear-gradient(90deg,#1a56b8,#f1f5fa)', stad: 'linear-gradient(90deg,#2b1d40,#ff4fb0)', is: 'linear-gradient(90deg,#15405c,#2cff9a)' }[th]; }
$('setupBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const s = setup;
  if (b.classList.contains('locked')) { audio.play('error'); toast('Låst – ' + (b.querySelector('small') ? b.querySelector('small').textContent : '')); return; }
  if (b.dataset.cup) s.cup = b.dataset.cup;
  else if (b.dataset.track) s.track = b.dataset.track;
  else if (b.dataset.car) s.car = b.dataset.car;
  else if (b.dataset.color != null) s.color = +b.dataset.color;
  else if (b.dataset.v != null) { const k = b.parentNode.dataset.seg; s[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; }
  audio.play('click');
  renderSetup();
});
$('setupGo').addEventListener('click', () => {
  const s = setup; audio.play('select');
  Object.assign(save, { car: s.car, color: s.color, diff: s.diff, laps: s.laps, opp: s.opp });
  if (s.mode === 'cup') { save.cup = s.cup; persist(); startCup(s.cup, s.diff); return; }
  if (s.mode === 'time') save.tt = s.track; else save.track = s.track;
  persist();
  startRace({ mode: s.mode, track: s.track, laps: s.mode === 'quick' ? s.laps : 0, diff: s.diff, car: s.car, color: s.color, opp: s.mode === 'quick' ? s.opp : 0 });
});
$('setupBack').addEventListener('click', () => { audio.play('click'); screen('menu'); updateMenu(); });
$('mCup').addEventListener('click', () => { audio.play('select'); openSetup('cup'); });
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
    $('pauseInfo').textContent = trackName(race.cfg.track) + (race.cfg.mode === 'cup' ? ' · ' + CUPS.find(c => c.id === race.cfg.cup).name : '');
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
function startCup(cupId, diff) {
  const cup = CUPS.find(c => c.id === cupId);
  const rng = makeRng(Date.now() & 0xffff);
  const pool = AI_DRIVERS.slice().sort(() => rng() - 0.5).slice(0, 7);
  const usedColors = new Set([save.color]);
  const drivers = [{ name: 'Du', player: true, car: save.car, color: COLORS[save.color].hex }];
  pool.forEach((d, k) => {
    let ci; do { ci = (rng() * COLORS.length) | 0; } while (usedColors.has(ci) && usedColors.size < COLORS.length);
    usedColors.add(ci);
    drivers.push({ name: d.name, skill: d.skill, aggr: d.aggr, car: cup.aiCars[k % cup.aiCars.length], color: COLORS[ci].hex });
  });
  save.cupRun = { id: cupId, diff, idx: 0, drivers, points: drivers.map(() => 0), scores: [] };
  persist();
  continueCup();
}
function continueCup() {
  const run = save.cupRun; const cup = CUPS.find(c => c.id === run.id);
  run.drivers[0].car = save.car; run.drivers[0].color = COLORS[save.color].hex;
  startRace({ mode: 'cup', cup: run.id, track: cup.tracks[run.idx], laps: 3, diff: run.diff, car: save.car, color: save.color, opp: 7 });
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
  if (cfg.online) {
    entries = cfg.grid.map((g, k) => ({ name: g.n, car: g.car, color: COLORS[g.col].hex, idx: k, key: g.id, player: g.id === net.selfId,
      remote: g.id !== net.selfId && !(net.isHost && isAiKey(g.id)), skill: g.sk, aggr: g.ag }));
  } else if (cfg.mode === 'cup') {
    const run = save.cupRun;
    // startordning: ledaren startar sist
    const order = run.drivers.map((d, k) => k).sort((a, b) => run.points[a] - run.points[b] || (a === 0 ? 1 : b === 0 ? -1 : a - b));
    if (run.idx === 0) { order.splice(order.indexOf(0), 1); order.splice(5, 0, 0); }
    entries = order.map(k => Object.assign({ idx: k }, run.drivers[k]));
  } else {
    entries.push({ name: 'Du', player: true, car: cfg.car, color: COLORS[cfg.color].hex, idx: 0 });
    if (cfg.opp > 0) {
      const pt = CAR_TIER[cfg.car] || 0;
      const aiCars = CARS.filter(c => { const t = CAR_TIER[c.id]; return t <= pt && t >= pt - 1; }).map(c => c.id);
      const pool = AI_DRIVERS.slice().sort(() => rng() - 0.5).slice(0, cfg.opp);
      const used = new Set([cfg.color]);
      pool.forEach((d, k) => {
        let ci; do { ci = (rng() * COLORS.length) | 0; } while (used.has(ci) && used.size < COLORS.length); used.add(ci);
        entries.push({ name: d.name, skill: d.skill, aggr: d.aggr, car: aiCars[(rng() * aiCars.length) | 0], color: COLORS[ci].hex, idx: k + 1 });
      });
      // spelaren i mitten/bak av fältet
      const me = entries.shift(); entries.splice(Math.min(entries.length, Math.ceil(entries.length * 0.7)), 0, me);
    }
  }
  const night = th.night;
  entries.forEach((e, slot) => {
    const car = new Car(carSpec(e.car), e.color, { physical: !!e.player && settings.get('quality') !== 'low' });
    car.name = e.name; car.isPlayer = !!e.player; car.entryIdx = e.idx; car.colorHex = e.color;
    car.key = e.key || null; car.remote = !!e.remote; car.isHuman = cfg.online ? !isAiKey(e.key) : !!e.player;
    // nattbanor: lite egenljus i lacken så att bilarna (och särskilt den egna) inte blir svarta siluetter
    if (th.night) car.model.paintMat.emissive.set(e.color).multiplyScalar(e.player ? 0.16 : 0.1);
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
    if (night && !e.player) {
      if (!r.coneGeo) { const g = new THREE.ConeGeometry(3.2, 15, 16, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 8); r.coneGeo = g; }
      const cone = new THREE.Mesh(r.coneGeo, buildConeMat()); cone.position.set(0, 0.7, 1.9); cone.rotation.x = 0.06; car.model.body.add(cone);
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
let coneMat = null;
function buildConeMat() { if (!coneMat) coneMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); return coneMat; }

function disposeRace() {
  if (ol.stopTick) { ol.stopTick(); ol.stopTick = null; }
  if (!race) return;
  const r = race;
  stopLoops();
  r.cars.forEach(c => { scene.remove(c.root); disposeCarModel(c.model); });
  if (r.ghost) { scene.remove(r.ghost.model.root); }
  scene.remove(r.trackGroup); r.track.dispose(); r.world.dispose();
  r.particles.dispose(scene); r.sparks.dispose(scene); r.skids.dispose(scene); r.speedFx.dispose(scene);
  if (r.coneGeo) r.coneGeo.dispose();
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
  const c = onRoad ? (th.road === 'ice' ? [0.92, 0.96, 1] : th.road === 'wet' ? [0.55, 0.58, 0.66] : [0.82, 0.82, 0.84])
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
  // ---------- handledning ----------
  if (r.tut) tutorial(dt);
  // ---------- effekter ----------
  emitFx(dt);
  updateAudio(dt);
  hudUpdate(dt);
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
      if (c.grounded && c.speed > 18 && near && (th.weather === 'rain' || th.road === 'ice' || th.shoulder === 'snow') && Math.random() < 0.25) {
        const col = th.weather === 'rain' ? [0.32, 0.34, 0.4] : [0.95, 0.97, 1];
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

function updateAudio(dt) {
  const r = race; if (!r || !snd.engine) return;
  const P = r.player;
  const thr = r.state === 'countdown' ? snd.rev : P.ctl.throttle;
  let es = engineState(P, thr);
  if (r.state === 'countdown') es = { rpm: 0.2 + snd.rev * 0.75, gear: 'N' };
  const base = { hatch: 1, wagon: 0.9, rally: 1.08, coupe: 1.12, gt: 0.78, super: 1.18 }[P.spec.shape] || 1;
  snd.engine.set({ freq: (40 + es.rpm * 104) * base, vol: 0.1 + thr * 0.06 + (P.nitroOn ? 0.03 : 0), filter: 380 + es.rpm * 1250 + thr * 450 + (P.nitroOn ? 300 : 0) });
  const slip = P.grounded ? P.wheelSlip : 0;
  const sq = P.speed > 4 && P.onRoad ? clamp(slip - 0.3, 0, 1) : 0;
  snd.screech.set({ freq: 1500 + Math.min(1, slip) * 900 + (r.track.grip < 0.8 ? -500 : 0), vol: sq * 0.2 });
  snd.squeal.set({ freq: (r.track.grip < 0.8 ? 520 : 760) + Math.min(1, slip) * 180 + Math.sin(r.time * 23) * 18, vol: sq * (r.track.grip < 0.8 ? 0.012 : 0.022) });
  snd.wind.set({ freq: 250 + P.speed * 9, vol: clamp((P.speed - 10) / 60, 0, 1) * 0.1 + (P.grounded ? 0 : 0.03) });
  // närmaste motståndare
  let best = null, bd = 60;
  for (const c of r.cars) { if (c === P) continue; const d = c.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = c; } }
  if (best) { const e2 = engineState(best, best.ctl.throttle); const b2 = { hatch: 1, wagon: 0.9, rally: 1.08, coupe: 1.12, gt: 0.78, super: 1.18 }[best.spec.shape] || 1; snd.engine2.set({ freq: (40 + e2.rpm * 104) * b2 * 1.01, vol: (1 - bd / 60) * 0.055, filter: 300 + e2.rpm * 900 }); }
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
  const rows = order.map((c, k) => ({ name: c.isPlayer ? 'Du' : c.name, car: c.spec.name, carId: c.spec.id, color: c.colorHex, time: c.finishTime, est: c.estimated, best: c.bestLap, me: c.isPlayer, idx: c.entryIdx, pts: POINTS[k] || 0 }));
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

function showResults(sm) {
  const cfg = sm.cfg;
  let h = '', title = '';
  const tbl = (rows, cols) => `<table class="fj-table"><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r.me ? 'me' : ''}">${cols.map(c => `<td class="${c[2] || ''}">${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const posTxt = (p) => p === 1 ? '🥇 1' : p === 2 ? '🥈 2' : p === 3 ? '🥉 3' : String(p);
  const cols = [['#', (r) => posTxt(sm.rows.indexOf(r) + 1)], ['Förare', r => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${css(r.color)};margin-right:6px"></i>${r.name}`], ['Bil', r => r.car, 'car'], ['Tid', r => (r.est ? '≈\u00a0' : '') + fmtTime(r.time), 'num'], ['Bästa varv', r => isFinite(r.best) ? fmtTime(r.best) : '–', 'num']];
  const btns = [];
  let unlockMsgs = [];
  if (cfg.mode === 'cup') {
    const run = save.cupRun; const cup = CUPS.find(c => c.id === run.id);
    sm.rows.forEach((row, k) => { run.points[row.idx] += POINTS[k] || 0; });
    run.scores.push(sm.score);
    run.idx++;
    cols.push(['Poäng', r => '+' + r.pts, 'num']);
    title = `${trackName(cfg.track)} – ${sm.pos}:a plats`;
    h += tbl(sm.rows, cols);
    const stand = run.drivers.map((d, k) => ({ name: d.name, pts: run.points[k], me: !!d.player, color: d.color, car: d.car })).sort((a, b) => b.pts - a.pts);
    const last = run.idx >= cup.tracks.length;
    h += `<h3>${last ? 'Slutställning' : 'Ställning efter ' + run.idx + ' av ' + cup.tracks.length + ' lopp'}</h3>`;
    h += tbl(stand, [['#', r => posTxt(stand.indexOf(r) + 1)], ['Förare', r => r.name], ['Poäng', r => r.pts, 'num']]);
    if (last) {
      const fpos = stand.findIndex(s => s.me) + 1;
      const bonus = [1500, 900, 500][fpos - 1] || 0;
      const total = Math.round(run.scores.reduce((a, b) => a + b, 0) + bonus * (DIFFICULTY[run.diff] || DIFFICULTY.easy).scoreMult);
      title = fpos === 1 ? `${cup.medal} Du vann ${cup.name}!` : `${cup.name}: ${fpos}:a plats`;
      const res = submitScore(ID, total);
      h = `<div class="fj-score"><div><small>Cuppoäng</small><b>${Spelhallen.fmt(total)}</b></div><div><small>Placering</small><b>${fpos}</b></div><div><small>Rekord</small><b>${Spelhallen.fmt(res.best)}</b></div></div>` + (res.isNew ? '<p class="new-record">Nytt rekord!</p>' : '') + h;
      // upplåsningar
      const prevBest = save.cups[cup.id] ? save.cups[cup.id].best : 99;
      save.cups[cup.id] = { best: Math.min(prevBest, fpos) };
      if (fpos <= 3) {
        CARS.filter(c => c.unlock === cup.id && !save.cars.includes(c.id)).forEach(c => { save.cars.push(c.id); unlockMsgs.push('Ny bil: ' + c.name); });
        const nextCup = CUPS.find(c => c.unlock === cup.id); if (nextCup && prevBest > 3) unlockMsgs.push('Ny cup: ' + nextCup.name + ' (nya banor!)');
        if (cup.id === 'silver' && prevBest > 3) unlockMsgs.push('Alla banor kan nu köras baklänges');
      }
      if (fpos === 1) CARS.filter(c => c.unlock === cup.id + 'Win' && !save.cars.includes(c.id)).forEach(c => { save.cars.push(c.id); unlockMsgs.push('Ny bil: ' + c.name); });
      save.cupRun = null;
      showroom.showPodium(stand.map(s => ({ car: s.car, color: s.color })));
      btns.push(['Huvudmeny', toMenu, true], ['Kör cupen igen', () => startCup(cup.id, run.diff)]);
      audio.music('victory');
    } else {
      h = `<div class="fj-score"><div><small>Loppoäng</small><b>${Spelhallen.fmt(sm.score)}</b></div><div><small>Driftpoäng</small><b>${Spelhallen.fmt(sm.drift)}</b></div></div>` + h;
      showroom.showPodium(sm.rows.map(r => ({ car: r.carId, color: r.color })));
      btns.push(['Nästa lopp: ' + trackName(cup.tracks[run.idx]), continueCup, true], ['Huvudmeny', toMenu]);
      audio.music(sm.pos <= 3 ? 'victory' : 'calm');
    }
    persist();
  } else {
    const res = submitScore(ID, sm.score);
    title = sm.pos === 1 ? '🏆 Seger på ' + trackName(cfg.track) + '!' : `${trackName(cfg.track)} – ${sm.pos}:a plats`;
    h += `<div class="fj-score"><div><small>Poäng</small><b>${Spelhallen.fmt(sm.score)}</b></div><div><small>Driftpoäng</small><b>${Spelhallen.fmt(sm.drift)}</b></div><div><small>Rekord</small><b>${Spelhallen.fmt(res.best)}</b></div></div>` + (res.isNew ? '<p class="new-record">Nytt rekord!</p>' : '');
    h += tbl(sm.rows, cols);
    showroom.showPodium(sm.rows.map(r => ({ car: r.carId, color: r.color })));
    btns.push(['Kör igen', () => startRace(cfg), true], ['Byt bana', () => { openSetup('quick'); }], ['Huvudmeny', toMenu]);
    audio.music(sm.pos <= 3 ? 'victory' : 'calm');
  }
  if (unlockMsgs.length) h = unlockMsgs.map(m => `<p class="fj-unlock">🔓 ${m}</p>`).join('') + h;
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
    container: $('online'), save, persist, css, carUnlocked,
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
  showroom.showCar(); showroom.setCar(save.car, save.color);
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
    const g = grid.find(x => x.id === key) || { n: '?', car: 'viggen', col: 0 };
    return { key, name: key === net.selfId ? g.n + ' (du)' : g.n, car: carSpec(g.car).name, carId: g.car, color: COLORS[g.col].hex, time, best: best >= 0 ? best : Infinity, est: !!est, me: key === net.selfId, human: !isAiKey(key) };
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
  showroom.showPodium(sm.rows.map(x => ({ car: x.carId, color: x.color })));
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
      for (const c of r.cars) c.syncVisual(r.state === 'countdown' ? 1 : alpha, r.time);
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
  showroom.setCar(save.car, save.color);
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
    window.__fj = { get race() { return race; }, get net() { return net; }, get lobby() { return lobby; }, bgStep, save, settings, loop, startRace, toMenu, scene, renderer, camera, AIDriver, input, hud, startCup, showResults, endRace,
      get composer() { return composer; },
      step(n) { for (let k = 0; k < n && race && !race.ended; k++) { raceUpdate(1 / 60); input.endFrame(); } },
      frames(n) { for (let k = 0; k < n; k++) loop.render(1, 1 / 30); } };
    window.__ok = true;
  }
})();
