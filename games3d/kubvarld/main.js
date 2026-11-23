/** Kubvärld – uppstart, menyer, världslista, paus och spelloop. */
import * as THREE from 'three';
import { Settings, createRenderer, Loop, Input, Audio, buildSettings, fpsMeter, toast, show, hide, loadingScreen, nextFrame, kv, isTouchDevice, bestScore, fmt } from '../../engine/kit.js';
import { buildAtlas, buildIcons, crackCanvas, makeLogo } from './textures.js';
import { createTerrainMaterials, World } from './world.js';
import { Sky } from './sky.js';
import { Game } from './game.js';
import { hashStr } from './noise.js';
import { B } from './blocks.js';
import { SkinEditor } from './skineditor.js';
import { renderAchievements } from './achievements.js';

Spelhallen.init('kubvarld');
const $ = id => document.getElementById(id);
const root = $('root');
const settings = new Settings('kubvarld', { viewDist: 'auto', fancyLeaves: true, brightness: 0.35, viewBob: true, autoJump: isTouchDevice() });
const scene = new THREE.Scene();
const R = createRenderer(root, settings, { scene });
const renderer = R.renderer;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;
renderer.autoClear = true;
const camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 800);
R.setCamera(camera);
scene.add(new THREE.AmbientLight(0xffffff, 1.35));
const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(0.4, 1, 0.25); scene.add(dl);

const input = new Input(R.canvas, settings);
const audio = new Audio(settings);

// resurser
const atlas = buildAtlas();
const mats = createTerrainMaterials(atlas);
const icons = buildIcons(atlas);
const crack = crackCanvas();
const LOGO = { survival: makeLogo(224, 'survival'), creative: makeLogo(96, 'creative'), small: makeLogo(96, 'survival') };
$('logo').src = LOGO.survival;

const perf = { upd: 0, ren: 0 };
const app = {
  scene, camera, input, audio, settings, atlas, mats, icons, crack, renderer, perf, loop: null,
  showDeath, onUiClosed, updateWorldList
};

let game = null, menuBg = null, state = 'menu'; // menu | loading | play | pause | dead
let worlds = [];

/* ---------- menybakgrund: en levande värld ---------- */
function startMenuBg() {
  if (menuBg) return;
  const w = new World({ scene, mats, seed: hashStr('Kubvärld-meny'), fancy: true });
  w.radius = Math.max(3, Math.min(6, Math.round(6 * settings.q.view)));
  const sky = new Sky(scene, 7);
  const sp = w.findSpawn();
  menuBg = { w, sky, sp, t: 0.15 };
}
function stopMenuBg() { if (!menuBg) return; menuBg.w.dispose(); menuBg.sky.dispose(scene); menuBg = null; }
function updateMenuBg(dt) {
  const m = menuBg; if (!m) return;
  m.t += dt;
  const a = m.t * 0.035;
  const cx = m.sp.x + Math.cos(a) * 30, cz = m.sp.z + Math.sin(a) * 30;
  m.w.update(cx, cz, dt);
  camera.position.set(cx, m.sp.y + 18, cz);
  camera.lookAt(m.sp.x - Math.sin(a) * 12, m.sp.y + 6, m.sp.z + Math.cos(a) * 12);
  const tod = 0.12 + Math.sin(m.t * 0.02) * 0.05;
  m.sky.update(tod, camera, dt, m.w.radius * 16);
  const U = mats.uniforms;
  U.uTime.value = m.t; U.uSkyLight.value.copy(m.sky.skyLight); U.uFogColor.value.copy(m.sky.fog);
  U.uFogNear.value = m.w.radius * 16 * 0.62; U.uFogFar.value = m.w.radius * 16 * 1.05; U.uMinLight.value = 0.05;
  renderer.setClearColor(U.uFogColor.value);
}

/* ---------- loop ---------- */
const loop = new Loop({
  update(dt) {
    const t0 = performance.now();
    if (state === 'menu' || state === 'loading') updateMenuBg(dt);
    else if (game && (state === 'play' || state === 'dead')) {
      if (input.pressed('Escape', 'KeyP', 'Pad9', 'Pause')) { if (game.ui.open) game.closeInventory(); else pause(); }
      else if (input.pressed('Sneak')) { game.touchSneak = !game.touchSneak; const b = document.querySelector('[data-code="Sneak"]'); if (b) b.classList.toggle('on', game.touchSneak); }
      game.update(dt);
      // springande synfält
      const base = settings.get('fov') * (game.player.sprinting ? 1.1 : 1) * (game.player.flying && game.player.sprinting ? 1.05 : 1);
      if (Math.abs(camera.fov - base) > 0.05) { camera.fov += (base - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
    }
    audio.update();
    input.endFrame();
    perf.upd = perf.upd * 0.9 + (performance.now() - t0) * 0.1;
  },
  render() {
    const t0 = performance.now();
    if (game && state !== 'menu' && state !== 'loading') game.render(renderer);
    else renderer.render(scene, camera);
    perf.ren = perf.ren * 0.9 + (performance.now() - t0) * 0.1;
    lockHint();
  }
});
app.loop = loop;
fpsMeter(root, loop, settings);
loop.start();

/* ---------- pekkontroller ---------- */
input.setupTouch($('touch'), {
  sticks: [{ name: 'move', side: 'left' }], lookSide: 'right',
  buttons: [
    { code: 'Space', label: 'Hoppa', right: 18, bottom: 150, size: 76 },
    { code: 'Mine', label: 'Bryt', right: 104, bottom: 118, size: 72 },
    { code: 'Use', label: 'Använd', right: 104, bottom: 204, size: 62 },
    { code: 'Sneak', label: 'Smyg', right: 24, bottom: 240, size: 56 },
    { code: 'Inv', label: 'Väska', right: 16, top: 70, size: 54 },
    { code: 'KeyV', label: 'Vy', right: 80, top: 14, size: 46 },
    { code: 'Pause', label: 'Paus', right: 16, top: 14, size: 46 }
  ]
});
document.querySelectorAll('.g3-tbtn').forEach((b, i) => { b.dataset.code = ['Space', 'Mine', 'Use', 'Sneak', 'Inv', 'KeyV', 'Pause'][i]; });

/* ---------- pointer lock & paus ---------- */
const touch = isTouchDevice();
function lock() {
  if (touch || document.pointerLockElement === R.canvas) return;
  const quiet = p => { if (p && p.catch) p.catch(() => { }); };
  try { const p = R.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { quiet(R.canvas.requestPointerLock()); } catch (e) { } }); }
  catch (e) { try { quiet(R.canvas.requestPointerLock()); } catch (e2) { } }
}
R.canvas.addEventListener('click', () => { if (state === 'play' && game && !game.ui.open && !input.locked) lock(); });
input.onLockChange((locked, err) => {
  if (!locked && state === 'play' && game && !game.ui.open && !touch && !err && !game._suppressPause) pause();
});
function lockHint() {
  const tl = $('touch'), tv = state === 'play' && !!game && !game.ui.open;
  if (tl._v !== tv) { tl._v = tv; tl.style.visibility = tv ? '' : 'hidden'; }
  const h = $('lockhint');
  const on = state === 'play' && game && !game.ui.open && !input.locked && !touch;
  if (on && h.dataset.t !== (game.time < 3 ? 'a' : 'b')) { h.dataset.t = game.time < 3 ? 'a' : 'b'; h.textContent = game.time < 3 ? 'Klicka för att börja spela' : 'Klicka för att fortsätta spela'; }
  h.classList.toggle('hidden', !on);
}
document.addEventListener('visibilitychange', () => { if (window.__kvNoAutoPause) return; if (document.hidden && state === 'play') pause(); if (document.hidden && game) game.save(); });
addEventListener('blur', () => { if (state === 'play' && touch) pause(); });
addEventListener('beforeunload', () => { if (game) { game.save(); game.reportScore(); } });
R.onResize((w, h) => { if (game) game.hand.setAspect(w / h); });

function pause() {
  if (state !== 'play' || !game) return;
  if (game.ui.open) game.closeInventory();
  state = 'pause'; loop.setPaused(true);
  input.exitLock();
  const P = game.player;
  $('pauseInfo').textContent = `${game.meta.name} · Dag ${game.day} · ${game.creative ? 'Kreativt' : 'Överlevnad'}${game.creative ? '' : ' · Poäng ' + fmt(game.score)}`;
  show('pause');
  game.save();
  audio.play('click');
}
function resume() {
  if (!game) return;
  hide('pause'); state = 'play'; loop.setPaused(false);
  input.endFrame(); // släng tangenttryck som gjordes i pausen
  if (!touch) lock();
}
function onUiClosed() { if (state === 'play' && !touch) lock(); }

/* ---------- världslista ---------- */
async function loadWorldList() { worlds = (await kv.get('kubvarld:list')) || []; worlds.sort((a, b) => (b.played || 0) - (a.played || 0)); return worlds; }
async function updateWorldList(meta) {
  await loadWorldList();
  const s = { id: meta.id, name: meta.name, seed: meta.seed, mode: meta.mode, diff: meta.diff, created: meta.created, played: Date.now(), day: meta.day || 1 };
  const i = worlds.findIndex(w => w.id === meta.id);
  if (i >= 0) worlds[i] = s; else worlds.push(s);
  await kv.set('kubvarld:list', worlds);
}
const DIFF = ['Fridfull', 'Normal', 'Svår'];
function fmtDate(t) { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }
async function renderWorlds() {
  await loadWorldList();
  const L = $('worldList'); L.innerHTML = '';
  if (!worlds.length) { const e = document.createElement('div'); e.className = 'kv-empty'; e.textContent = 'Du har inga världar än. Skapa din första!'; L.appendChild(e); }
  for (const w of worlds) {
    const row = document.createElement('div'); row.className = 'kv-world';
    const ico = document.createElement('img'); ico.className = 'ico'; ico.alt = ''; ico.src = w.mode === 'creative' ? LOGO.creative : LOGO.small;
    const info = document.createElement('div'); info.className = 'info';
    const n = document.createElement('div'); n.className = 'name'; n.textContent = w.name;
    const m = document.createElement('div'); m.className = 'meta'; m.textContent = `${w.mode === 'creative' ? 'Kreativt' : 'Överlevnad · ' + DIFF[w.diff ?? 1]} · Dag ${w.day || 1} · ${fmtDate(w.played)}`;
    info.append(n, m);
    const play = document.createElement('button'); play.className = 'btn primary small'; play.textContent = 'Spela'; play.onclick = () => startWorld(w.id);
    const del = document.createElement('button'); del.className = 'btn small'; del.textContent = 'Ta bort';
    del.onclick = () => confirmBox('Ta bort världen?', `”${w.name}” raderas för alltid. Det går inte att ångra.`, () => deleteWorld(w.id));
    row.append(ico, info, play, del);
    L.appendChild(row);
  }
}
async function deleteWorld(id) {
  const keys = await kv.keys('kubvarld:w:' + id);
  for (const k of keys) await kv.del(k);
  await loadWorldList();
  worlds = worlds.filter(w => w.id !== id);
  await kv.set('kubvarld:list', worlds);
  renderWorlds(); refreshMenu();
  toast('Världen togs bort.');
}
function confirmBox(title, text, yes) {
  $('confirmTitle').textContent = title; $('confirmText').textContent = text;
  show('confirm');
  $('confirmYes').onclick = () => { hide('confirm'); yes(); };
  $('confirmNo').onclick = () => hide('confirm');
}
async function refreshMenu() {
  await loadWorldList();
  const b = $('btnContinue');
  if (worlds.length) { b.hidden = false; b.textContent = `Fortsätt: ${worlds[0].name}`; $('btnWorlds').classList.remove('primary'); }
  else { b.hidden = true; $('btnWorlds').classList.add('primary'); $('btnWorlds').textContent = 'Spela'; }
  if (worlds.length) $('btnWorlds').textContent = 'Världar';
  const best = bestScore('kubvarld');
  $('bestLine').innerHTML = best ? `Ditt rekord: <b>${fmt(best)}</b> poäng` : 'Poäng: överlevda dagar × 100 + block ÷ 10';
}

/* ---------- ny värld ---------- */
let nwMode = 'survival', nwDiff = 1;
function segs(id, cb) { $(id).querySelectorAll('button').forEach(b => b.onclick = () => { $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset.v); audio.play('click'); }); }
segs('nwMode', v => { nwMode = v; $('nwNote').textContent = v === 'creative' ? 'Kreativt: oändligt med block, flyg med dubbeltryck på mellanslag, bryt direkt. Inga faror och inga poäng.' : 'Överlevnad: samla resurser, tillverka verktyg och klara nätterna. Poäng till rekordlistan: överlevda dagar × 100 + brutna/placerade block ÷ 10.'; $('nwDiff').parentElement && ($('nwDiff').style.opacity = v === 'creative' ? 0.4 : 1); });
segs('nwDiff', v => { nwDiff = +v; });
const NAMES = ['Fjällvidden', 'Björkdalen', 'Granåsen', 'Myrlandet', 'Lingonbacken', 'Kohagen', 'Diamantgrottan', 'Sjöudden', 'Norrskenet', 'Tallheden'];
function openNew() {
  $('nwName').value = NAMES[(Math.random() * NAMES.length) | 0] + (worlds.length ? ' ' + (worlds.length + 1) : '');
  $('nwSeed').value = '';
  hide('worlds'); show('newworld');
  setTimeout(() => $('nwName').focus(), 50);
}
async function createWorld() {
  const name = $('nwName').value.trim() || 'Min värld';
  const st = $('nwSeed').value.trim();
  const seed = st ? (/^-?\d+$/.test(st) ? (parseInt(st, 10) >>> 0) : hashStr(st)) : ((Math.random() * 4294967296) >>> 0);
  const id = 'w' + Date.now().toString(36) + ((Math.random() * 1296) | 0).toString(36);
  const meta = { id, name, seed, mode: nwMode, diff: nwMode === 'creative' ? 0 : nwDiff, created: Date.now(), worldTime: 0.02, version: 2 };
  await kv.set('kubvarld:w:' + id, meta);
  await updateWorldList(meta);
  hide('newworld');
  startWorld(id);
}

/* ---------- starta / avsluta ---------- */
async function startWorld(id) {
  const meta = await kv.get('kubvarld:w:' + id);
  if (!meta) { toast('Världen kunde inte läsas.'); return; }
  audio.play('select');
  ['menu', 'worlds', 'newworld', 'pause', 'dead'].forEach(hide);
  state = 'loading';
  const ls = loadingScreen($('loading'));
  $('loadTitle').textContent = meta.name;
  show('loading'); ls.set(0, 'Förbereder…');
  await new Promise(r => setTimeout(r, 40));
  stopMenuBg();
  if (game) { game.dispose(); game = null; }
  game = new Game(app, meta);
  await game.load((f, t) => ls.set(f, t));
  ls.done();
  $('hud').classList.remove('hidden');
  state = 'play'; loop.setPaused(false);
  if (!settings.get('music')) audio.stopMusic();
}
async function quitToMenu() {
  if (!game) return;
  hide('pause'); hide('dead');
  const ls = loadingScreen($('loading')); $('loadTitle').textContent = 'Sparar…'; show('loading'); ls.set(0.5, 'Sparar världen…');
  game.reportScore();
  await game.save();
  game.dispose(); game = null;
  ls.done();
  $('hud').classList.add('hidden');
  state = 'menu'; loop.setPaused(false);
  input.exitLock();
  startMenuBg();
  await refreshMenu();
  show('menu');
  audio.music('calm');
}
function showDeath(o) {
  state = 'dead';
  input.exitLock();
  $('deadReason').textContent = o.reason;
  $('deadScore').innerHTML = game.creative ? '' : `Du överlevde ${o.days} ${o.days === 1 ? 'dag' : 'dagar'} · Poäng: <b>${fmt(o.score)}</b>` + (o.isNew && o.score > 0 ? '<span class="new-record">Nytt rekord!</span>' : `<br><small>Rekord: ${fmt(o.best)}</small>`);
  setTimeout(() => show('dead'), 900);
}

/* ---------- knappar ---------- */
$('btnContinue').onclick = () => { if (worlds[0]) startWorld(worlds[0].id); };
$('btnWorlds').onclick = async () => { audio.play('click'); if (!worlds.length) { hide('menu'); openNew(); return; } await renderWorlds(); hide('menu'); show('worlds'); };
$('btnWorldsBack').onclick = () => { hide('worlds'); show('menu'); };
$('btnNew').onclick = () => openNew();
$('btnNewBack').onclick = () => { hide('newworld'); if (worlds.length) { renderWorlds(); show('worlds'); } else show('menu'); };
$('btnCreate').onclick = () => createWorld();
$('nwName').addEventListener('keydown', e => { if (e.key === 'Enter') createWorld(); });
let setReturn = 'menu';
function openSettings(from) {
  setReturn = from; hide(from);
  buildSettings($('setBox'), settings, [
    { key: 'viewDist', label: 'Siktavstånd', type: 'select', options: [['auto', 'Efter grafikkvalitet'], ['3', '3 chunkar'], ['4', '4 chunkar'], ['5', '5 chunkar'], ['6', '6 chunkar'], ['8', '8 chunkar'], ['10', '10 chunkar'], ['12', '12 chunkar'], ['16', '16 chunkar']] },
    { key: 'fancyLeaves', label: 'Detaljerade löv', type: 'check' },
    { key: 'brightness', label: 'Ljusstyrka i mörker', type: 'range', min: 0, max: 1, step: 0.05, format: v => Math.round(v * 100) + '%' },
    { key: 'viewBob', label: 'Gungande kamera', type: 'check' },
    { key: 'autoJump', label: 'Autohopp', type: 'check' }
  ]);
  show('settingsScr');
}
$('btnSettings').onclick = () => openSettings('menu');
$('btnPauseSet').onclick = () => openSettings('pause');
$('btnSetBack').onclick = () => { hide('settingsScr'); show(setReturn); };
let helpReturn = 'menu';
$('btnHelp').onclick = () => { helpReturn = 'menu'; hide('menu'); show('help'); };
$('btnPauseHelp').onclick = () => { helpReturn = 'pause'; hide('pause'); show('help'); };
$('btnHelpBack').onclick = () => { hide('help'); show(helpReturn); };
$('helpTabs').querySelectorAll('button').forEach(b => b.onclick = () => {
  $('helpTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('helpKeys').hidden = b.dataset.t !== 'keys'; $('helpTouch').hidden = b.dataset.t !== 'touch'; $('helpTips').hidden = b.dataset.t !== 'tips';
});
$('btnResume').onclick = () => resume();
// prestationer och figur
const skinEd = new SkinEditor('skinScr');
$('btnSkin').onclick = () => { audio.play('click'); hide('menu'); skinEd.show({ onClose: () => show('menu') }); };
$('btnPauseSkin').onclick = () => { audio.play('click'); hide('pause'); skinEd.show({ onClose: () => show('pause'), onSave: s => { if (game) game.setSkin(s); } }); };
$('btnPauseAch').onclick = () => { audio.play('click'); hide('pause'); renderAchievements($('achBox'), game && game.achievements, icons, game && game.creative); show('achScr'); };
$('btnAchBack').onclick = () => { hide('achScr'); show('pause'); };
$('btnQuit').onclick = () => quitToMenu();
$('btnRespawn').onclick = () => { hide('dead'); game.respawn(); state = 'play'; if (!touch) lock(); };
$('btnDeadQuit').onclick = () => { game.respawn(); quitToMenu(); };
settings.onChange((k, v) => {
  if (k === 'fov') { camera.fov = v; camera.updateProjectionMatrix(); }
  if (game && (k === 'viewDist' || k === 'quality')) game.applyView();
  if (game && k === 'fancyLeaves') game.world.setFancy(v);
  if (game && k === 'autoJump') game.autoJump = v;
  if (k === 'music' && game) game.musicT = 0;
});
// handkontroll: Start i menyer
addEventListener('keydown', e => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'pause' && !$('pause').classList.contains('hidden') && !e.repeat) { e.preventDefault(); resume(); }
  else if (e.code === 'Escape' && state === 'pause' && !$('achScr').classList.contains('hidden')) { e.preventDefault(); hide('achScr'); show('pause'); }
});
// handkontroll: Start återupptar från paus (loopen står still i paus)
let padStart = false;
setInterval(() => {
  if (state !== 'pause' || !navigator.getGamepads) { padStart = false; return; }
  const pads = navigator.getGamepads(); let down = false;
  for (const p of pads) if (p && p.buttons[9] && p.buttons[9].pressed) down = true;
  if (down && !padStart && !$('pause').classList.contains('hidden')) resume();
  padStart = down;
}, 100);

/* ---------- start ---------- */
startMenuBg();
refreshMenu();
show('menu');
window.__kv = { get game() { return game; }, get state() { return state; }, app, settings, startWorld, quitToMenu, skinEd };
window.__ok = true;
