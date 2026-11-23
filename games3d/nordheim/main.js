// Nordheim – huvudmodul: start, kamera, styrning, spelloop, menyer, sparning, handledning.
import * as THREE from 'three';
import { Settings, createRenderer, Loop, Input, Audio, buildSettings, fpsMeter, toast, show, hide, loadingScreen, nextFrame, submitScore, bestScore, isTouchDevice } from '../../engine/kit.js';
import { GAME_ID, BUILDINGS, CAMPAIGN, DIFFS, SIZES, UNITS, RES_INFO, costText } from './data.js';
import { G, hooks, heightAt, groundY, clamp, tileOf, fmtTime, isNight } from './state.js';
import { newGame, tick, canPlace, placeBuilding, removeBuilding, upgradeBuilding, footprint, population, resetTimers, bstat, canAfford, isAllowed } from './sim.js';
import { World } from './world.js';
import { Render } from './render.js';
import { Env } from './fx.js';
import { UI } from './ui.js';
import { saveGame, listSaves, loadData, restore, deleteSave } from './save.js';
import { makeCitizen } from './citizens.js';
import * as SIM from './sim.js';

const $ = id => document.getElementById(id);
Spelhallen.init(GAME_ID);

/* =====================================================================
 * Grund
 * ===================================================================== */
const settings = new Settings(GAME_ID, { edgePan: true, leftDrag: 'box', camSpeed: 1, autosave: 3, formation: 'block', hints: true });
const root = $('root');
const scene = new THREE.Scene();
const R = createRenderer(root, settings, { scene });
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1200);
R.setCamera(camera);
const input = new Input(R.canvas, settings);
const audio = new Audio(settings);
const env = new Env(scene, R.renderer, settings);
let world = null, render = null;
const overlay = $('overlay'), octx = overlay.getContext('2d');

const app = {
  audio, settings, speed: 1, prevSpeed: 1, formation: settings.get('formation') || 'block', follow: null,
  paused: false, inGame: false
};
const ui = new UI(app);
app.ui = ui;

/* =====================================================================
 * Kamera
 * ===================================================================== */
const cam = { tx: 64, tz: 64, ty: 1, yaw: 0.7, dist: 24, tyaw: 0.7, tdist: 24, ttx: 64, ttz: 64, min: 6.5, max: 62, shake: 0 };
function camPitch(d) { const f = clamp((d - cam.min) / (cam.max - cam.min), 0, 1); return 0.58 + f * 0.5; }
function updateCamera(dt) {
  const n = G.map ? G.map.n : 128;
  if (app.follow) {
    const f = app.follow;
    if (f.dead || (f.kind === 'cit' && !G.citizens.includes(f))) app.follow = null;
    else { cam.ttx = f.x; cam.ttz = f.z; }
  }
  cam.ttx = clamp(cam.ttx, 4, n - 4); cam.ttz = clamp(cam.ttz, 4, n - 4);
  cam.tdist = clamp(cam.tdist, cam.min, cam.max);
  const k = 1 - Math.exp(-dt * 10);
  cam.tx += (cam.ttx - cam.tx) * k; cam.tz += (cam.ttz - cam.tz) * k;
  cam.dist += (cam.tdist - cam.dist) * (1 - Math.exp(-dt * 8));
  let dy = cam.tyaw - cam.yaw; cam.yaw += dy * (1 - Math.exp(-dt * 10));
  const gy = G.map ? Math.max(0, heightAt(cam.tx, cam.tz)) : 0;
  cam.ty += (gy - cam.ty) * (1 - Math.exp(-dt * 4));
  const p = camPitch(cam.dist);
  let px = cam.tx + Math.sin(cam.yaw) * Math.cos(p) * cam.dist;
  let pz = cam.tz + Math.cos(cam.yaw) * Math.cos(p) * cam.dist;
  let py = cam.ty + Math.sin(p) * cam.dist;
  if (G.map) { const gh = Math.max(0, heightAt(px, pz)) + 1.2; if (py < gh) py = gh; }
  if (cam.shake > 0) { cam.shake -= dt; px += (Math.random() - 0.5) * cam.shake * 0.6; py += (Math.random() - 0.5) * cam.shake * 0.6; }
  if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) { cam.tx = cam.ttx = n / 2; cam.tz = cam.ttz = n / 2; return; }
  camera.position.set(px, py, pz);
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  camera.userData.tx = cam.tx; camera.userData.tz = cam.tz;
}
function panBy(dx, dz) { // i skärmrelativa enheter
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  // framåt = (-sin, -cos), höger = (cos, -sin)
  cam.ttx += c * dx - s * dz;
  cam.ttz += -s * dx - c * dz;
  app.follow = null;
}
app.jumpTo = (x, z, instant) => { cam.ttx = x; cam.ttz = z; if (instant) { cam.tx = x; cam.tz = z; } app.follow = null; };
app.focusHall = () => { if (G.hall) app.jumpTo(G.hall.x, G.hall.z + 2); };
hooks.shake = (a, x, z) => { if (Math.hypot(x - cam.tx, z - cam.tz) < cam.dist * 1.2) cam.shake = Math.max(cam.shake, a); };

const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
function groundAt(sx, sy) {
  if (!world) return null;
  const r = R.canvas.getBoundingClientRect();
  _ndc.set((sx - r.left) / r.width * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  return world.raycast(raycaster.ray);
}
app.frustumOnGround = () => {
  const pts = [];
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    _ndc.set(x, y); raycaster.setFromCamera(_ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    let t = d.y < -0.02 ? (o.y - 0.5) / -d.y : 200;
    t = Math.min(t, cam.dist * 4);
    pts.push({ x: o.x + d.x * t, z: o.z + d.z * t });
  }
  return pts;
};
const _pv = new THREE.Vector3();
function toScreen(x, y, z, out) {
  _pv.set(x, y, z).project(camera);
  out.x = (_pv.x + 1) / 2 * R.size.w; out.y = (1 - _pv.y) / 2 * R.size.h; out.z = _pv.z;
  return out;
}

/* =====================================================================
 * Ljud med position
 * ===================================================================== */
hooks.sfx = (name, x, z, opts = {}) => {
  if (opts.ui) { audio.play(name, opts); return; }
  const d = Math.hypot(x - cam.tx, z - cam.tz);
  const fall = clamp(1 - d / (cam.dist * 1.4 + 10), 0, 1) * clamp(1.4 - cam.dist / 60, 0.35, 1);
  const vol = (opts.vol == null ? 1 : opts.vol) * fall;
  if (vol < 0.04) return;
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  const rx = (x - cam.tx) * c - (z - cam.tz) * s;
  audio.play(name, { vol, pan: clamp(rx / (cam.dist + 4), -0.8, 0.8), pitch: opts.pitch, gap: opts.gap });
};
hooks.fx = (type, x, y, z, n) => { if (Math.hypot(x - cam.tx, z - cam.tz) < cam.dist * 2.5 + 20) env.burst(type, x, y, z, n); };
const floats = [];
hooks.float = (text, x, z, res) => { if (floats.length < 40 && Math.hypot(x - cam.tx, z - cam.tz) < cam.dist * 2) floats.push({ text, x, z, y: groundY(x, z) + 1, t: 0, color: res && RES_INFO[res] ? '#' + new THREE.Color(RES_INFO[res].color).getHexString() : '#fff' }); };
hooks.notify = (t, type, pos) => ui.notify(t, type, pos);
hooks.onBuildingAdded = b => { if (render) render.addBuilding(b); ui.mmDirty = true; };
hooks.onBuildingRemoved = b => { if (render) render.removeBuilding(b); ui.mmDirty = true; };
hooks.onBuildingChanged = b => { if (render && b) render.refreshBuilding(b); };
hooks.onBuildingProgress = b => { if (render) { if (b.def.wall) render.wallsDirty = true; else render.progressBuilding(b); } };
hooks.onTileChanged = k => { if (world) world.paintTile(k); ui.mmDirty = true; };
hooks.onTreeChanged = k => { if (world) world.refreshTile(k); app.mmTree = true; };
hooks.onTerrain = (i0, j0, w, d) => { if (world) world.rewriteArea(i0, j0, w, d); };
hooks.onSeason = s => { app.tintF = 0; if (world) world.refreshAllTrees(); musicForState(); seasonTip(s); };
hooks.onRaidWarn = () => { musicForState(); tipOnce('raid', 'En räd närmar sig! Träna soldater i kasernen, bygg torn och murar. Larmklockan 🔔 skickar invånarna i skydd.'); };
hooks.onRaidStart = () => { musicForState(); };
hooks.onRaidEnd = () => { musicForState(); };
hooks.onObjective = g => { ui.notify('Mål klart: ' + g.label, 'good'); audio.play('levelup'); };
hooks.onGameOver = reason => endGame(false, reason);
hooks.onVictory = () => endGame(true);

/* =====================================================================
 * Musik
 * ===================================================================== */
let curMusic = null;
function musicForState() {
  if (!app.inGame) return;
  let m = 'calm';
  if (G.raid && G.raid.active) m = 'action';
  else if (G.raid && G.raid.warned) m = 'tense';
  else if (G.cal && isNight(G.cal.phase)) m = 'night';
  else if (G.cal && G.cal.season === 3) m = 'night';
  if (m !== curMusic) { curMusic = m; audio.music(m); }
}

/* =====================================================================
 * Spelstart / avslut
 * ===================================================================== */
const loader = loadingScreen($('loading'));
// som kit.nextFrame men fastnar inte om fliken ligger i bakgrunden
const yieldFrame = () => new Promise(r => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(fin, 0)); setTimeout(fin, 150); });
async function setupScene() {
  if (world) { world.dispose(); world = null; }
  if (render) { render.dispose(); render = null; }
  env.soft.clear(); env.glow.clear();
  world = new World(scene, settings);
  env.water = world.waterU;
  render = new Render(scene, env, settings);
  render.rebuildAll();
}
async function startGame(opts, saved) {
  show('loading'); hide('menu'); ['campaign', 'setup', 'loadgame', 'end', 'pause', 'story'].forEach(id => hide(id));
  loader.set(0.05, 'Skapar ön…');
  app.loading = true;
  await yieldFrame();
  app.inGame = false;
  try {
    if (saved) restore(saved); else newGame(opts);
  } catch (e) { console.error(e); app.loading = false; hide('loading'); show('menu'); toast('Kunde inte starta spelet'); return; }
  loader.set(0.45, 'Planterar skogar…');
  await yieldFrame();
  await setupScene();
  loader.set(0.8, 'Väcker vikingarna…');
  await yieldFrame();
  resetTimers();
  G.sel = null; G.selUnits = new Set(); G.placing = null;
  app.follow = null;
  app.setSpeed(1);
  app.tintF = 1;
  world.setSeasonTint(G.cal.season, 1); world.repaintAll(); world.refreshAllTrees();
  env.snow = G.cal.season === 3 ? 1 : 0;
  const h = G.hall || { x: G.map.n / 2, z: G.map.n / 2 };
  cam.tx = cam.ttx = h.x; cam.tz = cam.ttz = h.z + 2; cam.tdist = cam.dist = 24; cam.tyaw = cam.yaw = 0.6;
  ui.mmDirty = true;
  document.getElementById('notes').innerHTML = '';
  loader.set(1, '');
  hide('loading');
  $('hud').classList.remove('hidden');
  app.inGame = true; app.loading = false; app.paused = false; loop.setPaused(false);
  curMusic = null; musicForState();
  autosaveT = 0;
  ui.setCat('base');
  tut.hide();
  if (!saved) {
    if (G.sc) showStory(); else startTutorialIfNeeded();
  } else { tut.step = G.tutStep || 0; if (G.sc && G.sc.tutorial && tut.step < TUT.length) tut.start(tut.step); }
  audio.play('select');
}

function endGame(win, reason) {
  if (G.over && !win) return;
  if (!win) G.over = true;
  const el = $('endBody');
  let html = '';
  let title = win ? 'Seger!' : 'Nederlag';
  if (win && G.sc) {
    const idx = CAMPAIGN.findIndex(c => c.id === G.sc.id);
    const par = [8, 18, 18, 25, 32, 30, 52][idx] * 60;
    const score = Math.round(1000 + population() * 15 + G.counters.raids * 150 + Math.max(0, 1500 - G.elapsed / 60 * 40) + idx * 300);
    const stars = G.elapsed < par ? 3 : G.elapsed < par * 1.6 ? 2 : 1;
    const prog = Spelhallen.store.get('nordheim:campaign', { unlocked: 0, best: {} });
    prog.unlocked = Math.max(prog.unlocked, idx + 1);
    const prev = prog.best[G.sc.id] || { score: 0, stars: 0 };
    prog.best[G.sc.id] = { score: Math.max(prev.score, score), stars: Math.max(prev.stars, stars) };
    Spelhallen.store.set('nordheim:campaign', prog);
    const total = Object.values(prog.best).reduce((s, b) => s + b.score, 0);
    const res = submitScore(GAME_ID, total);
    html += `<p class="big">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</p><p>Scenariot <b>${G.sc.name}</b> är klart på ${fmtTime(G.elapsed)} speltid.</p>`;
    html += `<p>Poäng: <b>${score}</b> · Kampanjpoäng totalt: <b>${total}</b>${res.isNew ? ' <span class="new-record">Nytt rekord!</span>' : ''}</p>`;
    const next = CAMPAIGN[idx + 1];
    $('endNext').classList.toggle('hidden', !next);
    $('endNext').onclick = () => { hide('end'); startGame({ mode: 'campaign', scenario: next.id }); };
    $('endContinue').classList.remove('hidden');
    audio.stopMusic(); audio.play('win'); curMusic = 'victory'; audio.music('victory');
    saveDel('auto');
  } else if (!win) {
    $('endNext').classList.add('hidden'); $('endContinue').classList.add('hidden');
    html += `<p>${reason || 'Byn har gått under.'}</p>`;
    if (G.mode === 'survival') {
      const sc = Math.max(G.score, G.bestScore);
      const res = submitScore(GAME_ID, sc);
      html += `<p>Överlevda räder: <b>${G.counters.raids}</b> · Poäng: <b>${sc}</b>${res.isNew ? ' <span class="new-record">Nytt rekord!</span>' : ''}</p>`;
    }
    audio.stopMusic(); audio.play('lose');
    saveDel('auto');
  }
  html += `<div class="endstats"><span>👥 ${population()} invånare</span><span>🏴 ${G.counters.raids} räder</span><span>🏗️ ${G.counters.built} byggen</span><span>☠️ ${G.counters.kills || 0} fiender</span></div>`;
  $('endTitle').textContent = title;
  el.innerHTML = html;
  app.paused = true; loop.setPaused(true);
  show('end');
}
async function saveDel(s) { await deleteSave(s); refreshContinue(); }

function quitToMenu(save = true) {
  const p = (save && G.on && !G.over) ? saveGame('auto') : Promise.resolve();
  app.inGame = false;
  G.on = false;
  hide('pause'); hide('end'); hide('story');
  $('hud').classList.add('hidden');
  if (world) { world.dispose(); world = null; }
  if (render) { render.dispose(); render = null; }
  env.soft.clear(); env.glow.clear();
  audio.music('adventure'); curMusic = null;
  tut.hide();
  p.then(() => { refreshContinue(); menuBackdrop(); });
  showMenu();
}
async function menuBackdrop() {
  if (app.inGame || app.loading) return;
  try {
    newGame({ mode: 'free', size: 128, seed: 'nordheim-meny', diff: 'fredlig', raids: false });
    G.on = false;
    await setupScene();
    world.setSeasonTint(1, 1); world.repaintAll();
  } catch (e) { console.error(e); }
}

/* =====================================================================
 * Spelets API för UI
 * ===================================================================== */
app.setSpeed = s => {
  if (s === 0 && app.speed !== 0) app.prevSpeed = app.speed;
  app.speed = s; loop.timeScale = s;
  $('pausedTag').classList.toggle('hidden', s !== 0);
};
app.pause = (on) => {
  if (!app.inGame) return;
  app.paused = on; loop.setPaused(on);
  if (on) { show('pause'); cancelPlacing(); } else hide('pause');
  audio.play('click');
};
app.toggleAlarm = () => {
  G.alarm = !G.alarm; G.alarmAuto = G.alarm || !(G.raid && G.raid.active);
  ui.notify(G.alarm ? '🔔 Larm! Invånarna söker skydd.' : 'Larmet är avblåst – tillbaka till arbetet.', G.alarm ? 'warn' : 'info');
  audio.play(G.alarm ? 'countdown' : 'select');
  if (G.alarm) for (let i = 0; i < 3; i++) audio.tone({ freq: 880, dur: 0.15, vol: 0.08, type: 'triangle', delay: i * 0.25 });
};
app.selectArmy = () => {
  G.selUnits = new Set(G.units); G.sel = null;
  if (!G.units.length) ui.notify('Du har inga soldater – träna dem i en kasern', 'info');
  else { const cx = G.units.reduce((s, u) => s + u.x, 0) / G.units.length, cz = G.units.reduce((s, u) => s + u.z, 0) / G.units.length; app.jumpTo(cx, cz); }
};
app.deselect = () => { G.sel = null; if (G.selUnits) G.selUnits.clear(); app.follow = null; };
app.demolish = (b, confirmed) => {
  if (!b || b.type === 'hall' || b.team) return;
  if (!confirmed && b.built && !b.def.wall && !b.def.gate && !(app._demoArm && app._demoArm.b === b && performance.now() - app._demoArm.t < 3000)) {
    app._demoArm = { b, t: performance.now() };
    ui.notify('Tryck Riv (Delete) igen för att riva ' + b.def.name.toLowerCase(), 'warn');
    audio.play('click');
    return;
  }
  app._demoArm = null;
  removeBuilding(b, { refund: true });
  hooks.fx('dust', b.x, b.y + 0.3, b.z, 16);
  audio.play('break');
  G.sel = null;
};
app.disband = () => {
  for (const u of [...G.selUnits]) {
    const i = G.units.indexOf(u); if (i < 0) continue;
    G.units.splice(i, 1); u.dead = true;
    const c = makeCitizen(u.x, u.z, { name: u.name, hair: u.hair, skin: u.skin });
    c.hp = 25;
  }
  G.selUnits.clear();
  ui.notify('Soldaterna har återgått till vardagslivet', 'info');
};

/* =====================================================================
 * Byggläge
 * ===================================================================== */
let hoverGround = null, lineStart = null, touchGhost = null;
app.startPlacing = (type) => {
  if (!isAllowed(type)) { audio.play('error'); ui.notify('Den byggnaden är inte tillgänglig i det här scenariot', 'warn'); return; }
  if (G.placing && G.placing.type === type) { cancelPlacing(); return; }
  G.placing = { type, rot: G.placing ? G.placing.rot : 0 };
  G.sel = null; if (G.selUnits) G.selUnits.clear();
  audio.play('select');
  ui.refreshCards();
  tut.onEvent('placing', type);
  if (isTouchDevice() || lastPointerType === 'touch') {
    // börja på närmaste lediga plats runt skärmens mitt (inte inuti hallen)
    touchGhost = { i: Math.floor(cam.tx), j: Math.floor(cam.tz) };
    const [w, d] = footprint(type, G.placing.rot);
    search: for (let r = 0; r < 14; r++) for (let a = 0; a < Math.max(1, r * 8); a++) {
      const ang = a / Math.max(1, r * 8) * Math.PI * 2;
      const i = Math.round(cam.tx - w / 2 + Math.cos(ang) * r), j = Math.round(cam.tz - d / 2 + Math.sin(ang) * r);
      if (canPlace(type, i, j, G.placing.rot, { ignoreCost: true }).ok) { touchGhost = { i, j }; break search; }
    }
    updateGhost(); $('confirmBar').classList.remove('hidden');
  }
};
function cancelPlacing() {
  G.placing = null; lineStart = null; touchGhost = null;
  $('lineCost').textContent = '';
  if (render) render.setGhost(null);
  if (world) world.setGrid(false);
  $('confirmBar').classList.add('hidden');
  ui.refreshCards();
}
function placingOrigin(gx, gz) {
  const p = G.placing; const [w, d] = footprint(p.type, p.rot);
  return { i: Math.floor(gx - w / 2 + 0.5), j: Math.floor(gz - d / 2 + 0.5) };
}
function updateGhost() {
  if (!G.placing || !render) return;
  let o;
  if (touchGhost) o = touchGhost;
  else { if (!hoverGround) { render.setGhost(null); world.setGrid(false); return; } o = placingOrigin(hoverGround.x, hoverGround.z); }
  const p = G.placing;
  if (world) world.setGrid(true, o.i + 0.5, o.j + 0.5, lineStart ? 12 : 9);
  if (lineStart && BUILDINGS[p.type].drag) {
    const tiles = lineTiles(lineStart, o);
    const ok = lineOk(p.type, tiles);
    render.setLine(p.type, tiles, ok.okSet);
    $('lineCost').textContent = ok.count ? (ok.count + ' st · ' + costText(Object.fromEntries(Object.entries(BUILDINGS[p.type].cost).map(([k, v]) => [k, v * ok.count])))) : '';
    return;
  }
  const chk = canPlace(p.type, o.i, o.j, p.rot);
  if (BUILDINGS[p.type].req === 'shore' && chk.ok) chk.face = shoreFaceFor(o.i, o.j, chk.w, chk.d);
  render.setGhost(p.type, o.i, o.j, p.rot, chk.ok, chk);
  app.ghostReason = chk.ok ? '' : chk.reason;
  const d = BUILDINGS[p.type];
  $('lineCost').textContent = chk.ok ? (d.icon + ' ' + d.name + (costText(SIM.buildCost(p.type)) ? ' · ' + costText(SIM.buildCost(p.type)) : ' · gratis') + (d.drag ? ' – dra för en sträcka' : '') + (d.size[0] !== d.size[1] && !d.drag ? ' · R vrider' : '')) : '⛔ ' + chk.reason;
  $('lineCost').classList.toggle('bad', !chk.ok);
  app.ghostAt = o;
}
function shoreFaceFor(i0, j0, w, d) { return SIM.shoreFace(i0, j0, w, d); }
function lineTiles(a, b) {
  const n = G.map.n, out = [];
  const di = Math.sign(b.i - a.i), dj = Math.sign(b.j - a.j);
  let i = a.i, j = a.j;
  out.push(j * n + i);
  // först längs dominerande axel, sedan den andra
  if (Math.abs(b.i - a.i) >= Math.abs(b.j - a.j)) { while (i !== b.i) { i += di; out.push(j * n + i); } while (j !== b.j) { j += dj; out.push(j * n + i); } }
  else { while (j !== b.j) { j += dj; out.push(j * n + i); } while (i !== b.i) { i += di; out.push(j * n + i); } }
  return out.slice(0, 120);
}
function lineOk(type, tiles) {
  const n = G.map.n, cost = BUILDINGS[type].cost, okSet = new Set();
  let count = 0;
  const budget = { ...G.stock };
  for (const k of tiles) {
    const chk = canPlace(type, k % n, (k / n) | 0, 0, { ignoreCost: true });
    if (!chk.ok) continue;
    let afford = true; for (const r in cost) if (budget[r] < cost[r]) afford = false;
    if (!afford) continue;
    for (const r in cost) budget[r] -= cost[r];
    okSet.add(k); count++;
  }
  return { okSet, count };
}
function tryPlace(o) {
  const p = G.placing; if (!p) return;
  const chk = canPlace(p.type, o.i, o.j, p.rot);
  if (!chk.ok) { audio.play('error'); ui.notify(chk.reason, 'warn'); return false; }
  const b = placeBuilding(p.type, o.i, o.j, p.rot);
  audio.play('place');
  hooks.fx('dust', o.i + chk.w / 2, groundY(o.i + chk.w / 2, o.j + chk.d / 2) + 0.2, o.j + chk.d / 2, 10);
  tut.onEvent('placed', p.type);
  if (!canAfford(SIM.buildCost(p.type))) cancelPlacing();
  return b;
}
function placeLine(a, b) {
  const p = G.placing; if (!p) return;
  const tiles = lineTiles(a, b);
  const ok = lineOk(p.type, tiles);
  const n = G.map.n;
  for (const k of tiles) if (ok.okSet.has(k)) placeBuilding(p.type, k % n, (k / n) | 0, 0);
  if (ok.count) { audio.play(p.type === 'demolish' ? 'break' : 'place'); tut.onEvent('placed', p.type); } else audio.play('error');
  $('lineCost').textContent = '';
  if (!canAfford(SIM.buildCost(p.type))) cancelPlacing();
}
app.touchConfirm = (c) => {
  if (!G.placing) return;
  if (c === 'ok') {
    const o = touchGhost; if (!o) return;
    if (BUILDINGS[G.placing.type].drag) {
      if (!lineStart) { lineStart = { ...o }; ui.notify('Tryck där sträckan ska sluta och bekräfta', 'info'); updateGhost(); return; }
      placeLine(lineStart, o); lineStart = null;
    } else tryPlace(o);
    updateGhost();
  } else if (c === 'rot') { G.placing.rot = (G.placing.rot + 1) & 3; updateGhost(); }
  else cancelPlacing();
};

/* =====================================================================
 * Val och kommandon
 * ===================================================================== */
const _sp = { x: 0, y: 0, z: 0 };
function pickEntity(sx, sy, radius = 20) {
  const r = R.canvas.getBoundingClientRect();
  const px = sx - r.left, py = sy - r.top;
  let best = null, bd = radius * radius;
  const test = (e, yo = 0.3) => {
    if (Math.abs(e.x - cam.tx) > cam.dist * 2.5 || Math.abs(e.z - cam.tz) > cam.dist * 2.5) return;
    toScreen(e.x, (e.y || 0) + yo, e.z, _sp);
    if (_sp.z > 1) return;
    const d = (_sp.x - px) ** 2 + (_sp.y - py) ** 2;
    if (d < bd) { bd = d; best = e; }
  };
  for (const u of G.units) test(u);
  for (const e of G.enemies) test(e, e.type === 'troll' ? 1 : 0.3);
  for (const c of G.citizens) if (!c.inside) test(c);
  return best;
}
/** Byggnad under skärmpunkten: modellen själv först (höga torn, tak), annars marken. */
function pickBuildingAt(sx, sy) {
  if (render) {
    const r = R.canvas.getBoundingClientRect();
    _ndc.set((sx - r.left) / r.width * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    const id = render.pickBuilding(raycaster.ray);
    if (id && G.buildings.has(id)) return G.buildings.get(id);
  }
  return buildingAt(groundAt(sx, sy));
}
function buildingAt(gp) {
  if (!gp) return null;
  const k = tileOf(gp.x, gp.z); if (k < 0) return null;
  const id = G.occ[k];
  return id ? G.buildings.get(id) : null;
}
function selectAt(sx, sy, additive) {
  const touch = lastPointerType === 'touch';
  const e = pickEntity(sx, sy, touch ? 30 : 18);
  if (e) {
    if (e.kind === 'unit') {
      if (!additive) { G.selUnits.clear(); G.sel = null; }
      if (G.selUnits.has(e) && additive) G.selUnits.delete(e); else G.selUnits.add(e);
      audio.play('select');
      // dubbelklick: alla av samma typ på skärmen
      const now = performance.now();
      if (app._lastSel === e && now - app._lastSelT < 350) {
        for (const u of G.units) { if (u.type !== e.type) continue; toScreen(u.x, u.y, u.z, _sp); if (_sp.x > 0 && _sp.y > 0 && _sp.x < R.size.w && _sp.y < R.size.h) G.selUnits.add(u); }
      }
      app._lastSel = e; app._lastSelT = now;
      tut.onEvent('select');
      return;
    }
    G.selUnits.clear();
    G.sel = e.kind === 'cit' ? { kind: 'citizen', c: e } : { kind: 'enemy', e };
    audio.play('click');
    tut.onEvent('select');
    return;
  }
  const b = pickBuildingAt(sx, sy);
  G.selUnits.clear();
  if (b) {
    G.sel = { kind: 'building', b }; audio.play('click'); tut.onEvent('select', b.type);
  }
  else G.sel = null;
}
function formationSlots(cnt, tx, tz, dirx, dirz, kind) {
  const out = [];
  const sp = 0.85;
  const rx = -dirz, rz = dirx; // höger
  if (kind === 'line') {
    const per = Math.min(cnt, 14);
    for (let i = 0; i < cnt; i++) { const row = Math.floor(i / per), col = i % per; const inRow = Math.min(per, cnt - row * per); const off = (col - (inRow - 1) / 2) * sp; out.push([tx + rx * off - dirx * row * sp, tz + rz * off - dirz * row * sp]); }
  } else if (kind === 'wedge') {
    let i = 0, row = 0;
    while (i < cnt) { const inRow = Math.min(row + 1, cnt - i); for (let c = 0; c < inRow; c++) { const off = (c - (inRow - 1) / 2) * sp; out.push([tx + rx * off - dirx * row * sp, tz + rz * off - dirz * row * sp]); i++; } row++; }
  } else {
    const cols = Math.ceil(Math.sqrt(cnt * 1.5));
    for (let i = 0; i < cnt; i++) { const row = Math.floor(i / cols), col = i % cols; const inRow = Math.min(cols, cnt - row * cols); const off = (col - (inRow - 1) / 2) * sp; out.push([tx + rx * off - dirx * row * sp, tz + rz * off - dirz * row * sp]); }
  }
  return out;
}
function commandAt(sx, sy) {
  // samlingsplats för kasern
  if (G.sel && G.sel.kind === 'building' && G.sel.b.type === 'barracks' && (!G.selUnits || !G.selUnits.size)) {
    const gp = groundAt(sx, sy); if (gp) { G.sel.b.rally = { x: gp.x, z: gp.z }; audio.play('select'); ui.notify('Samlingsplats satt', 'info'); }
    return true;
  }
  if (!G.selUnits || !G.selUnits.size) return false;
  const us = [...G.selUnits].filter(u => !u.dead);
  const e = pickEntity(sx, sy, lastPointerType === 'touch' ? 30 : 20);
  if (e && e.kind === 'enemy') {
    for (const u of us) { u.order = { type: 'attack', target: e }; u.target = null; u.path = null; }
    audio.play('hit', { vol: 0.5 }); markAt(e.x, e.z, 0xff5050);
    tut.onEvent('command');
    return true;
  }
  const gp = groundAt(sx, sy);
  const b = pickBuildingAt(sx, sy);
  if (b && b.team === 1) {
    for (const u of us) { u.order = { type: 'attack', target: b }; u.target = null; u.path = null; }
    audio.play('hit', { vol: 0.5 }); markAt(b.x, b.z, 0xff5050);
    return true;
  }
  if (!gp) return true;
  const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cz = us.reduce((s, u) => s + u.z, 0) / us.length;
  let dx = gp.x - cx, dz = gp.z - cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  // närstrid fram, bågskyttar bak
  us.sort((a, b2) => (a.range > 2 ? 1 : 0) - (b2.range > 2 ? 1 : 0) || ((a.x - gp.x) * -dz + (a.z - gp.z) * dx) - ((b2.x - gp.x) * -dz + (b2.z - gp.z) * dx));
  const slots = formationSlots(us.length, gp.x, gp.z, dx, dz, app.formation);
  us.forEach((u, i) => { u.order = { type: 'move', x: slots[i][0], z: slots[i][1] }; u.target = null; u.path = null; u.finalX = null; u.state = 'idle'; });
  audio.play('select', { vol: 0.6 }); markAt(gp.x, gp.z, 0x7dffa0);
  tut.onEvent('command');
  return true;
}
const marks = [];
function markAt(x, z, color) { marks.push({ x, z, t: 0, color }); }

function boxSelect(x0, y0, x1, y1) {
  const r = R.canvas.getBoundingClientRect();
  const a = Math.min(x0, x1) - r.left, b = Math.max(x0, x1) - r.left, c = Math.min(y0, y1) - r.top, d = Math.max(y0, y1) - r.top;
  G.selUnits.clear(); G.sel = null;
  for (const u of G.units) { toScreen(u.x, u.y + 0.3, u.z, _sp); if (_sp.z < 1 && _sp.x >= a && _sp.x <= b && _sp.y >= c && _sp.y <= d) G.selUnits.add(u); }
  if (G.selUnits.size) { audio.play('select'); tut.onEvent('select'); }
}

/* =====================================================================
 * Pekare (mus + pek)
 * ===================================================================== */
const ptrs = new Map();
let lastPointerType = 'mouse';
let drag = null; // { mode, x0, y0, x, y, btn, t0 }
let pinch = null;
const boxEl = $('boxsel');
const cv = R.canvas;
cv.addEventListener('pointerdown', e => {
  if (!app.inGame || app.paused) return;
  lastPointerType = e.pointerType;
  cv.focus({ preventScroll: true });
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  if (e.pointerType === 'touch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    drag = null; clearTimeout(longPressT);
    return;
  }
  drag = { mode: e.button === 1 ? 'pan' : e.button === 2 ? 'pendR' : 'pendL', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, btn: e.button, t0: performance.now(), touch: e.pointerType === 'touch', shift: e.shiftKey };
  if (e.pointerType === 'touch') {
    clearTimeout(longPressT);
    longPressT = setTimeout(() => { if (drag && drag.mode === 'pendL') { drag.mode = 'done'; if (G.placing) return; if (commandAt(drag.x, drag.y)) { if (navigator.vibrate) navigator.vibrate(20); } } }, 520);
  }
  if (e.button === 0 && G.placing && BUILDINGS[G.placing.type].drag && !drag.touch) {
    const gp = groundAt(e.clientX, e.clientY); if (gp) { lineStart = placingOrigin(gp.x, gp.z); drag.mode = 'line'; updateGhost(); }
  }
});
let longPressT = 0;
cv.addEventListener('pointermove', e => {
  if (!app.inGame) return;
  const p = ptrs.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (e.pointerType === 'mouse') { app.mouse = { x: e.clientX, y: e.clientY }; if (!drag || drag.mode === 'line') { hoverGround = groundAt(e.clientX, e.clientY); updateGhost(); } }
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.tdist = clamp(cam.tdist * pinch.d / Math.max(10, d), cam.min, cam.max);
    let da = ang - pinch.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    cam.tyaw += da;
    const s = cam.dist * 0.0021;
    panBy(-(mx - pinch.mx) * s, (my - pinch.my) * s);
    pinch.d = d; pinch.ang = ang; pinch.mx = mx; pinch.my = my;
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
  if (drag.mode === 'pendL' && moved > (drag.touch ? 10 : 6)) {
    clearTimeout(longPressT);
    if (drag.touch || settings.get('leftDrag') === 'pan' || (G.placing && !BUILDINGS[G.placing.type].drag)) drag.mode = 'pan';
    else drag.mode = 'box';
  }
  if (drag.mode === 'pendR' && moved > 5) drag.mode = 'rot';
  if (drag.mode === 'pan') { const s = cam.dist * 0.0021; panBy(-dx * s, dy * s); }
  else if (drag.mode === 'rot') { cam.tyaw -= dx * 0.006 * settings.get('sensitivity'); }
  else if (drag.mode === 'box') {
    const r = root.getBoundingClientRect();
    boxEl.style.display = 'block';
    boxEl.style.left = Math.min(drag.x0, drag.x) - r.left + 'px'; boxEl.style.top = Math.min(drag.y0, drag.y) - r.top + 'px';
    boxEl.style.width = Math.abs(drag.x - drag.x0) + 'px'; boxEl.style.height = Math.abs(drag.y - drag.y0) + 'px';
  } else if (drag.mode === 'line') { hoverGround = groundAt(e.clientX, e.clientY); updateGhost(); }
});
function endPointer(e) {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  clearTimeout(longPressT);
  if (!drag || !app.inGame) { drag = null; return; }
  const d = drag; drag = null;
  boxEl.style.display = 'none';
  if (d.mode === 'pendL') {
    if (d.touch) handleTap(d.x0, d.y0);
    else handleLeftClick(d.x0, d.y0, d.shift);
  } else if (d.mode === 'pendR') {
    if (G.placing) cancelPlacing(); else commandAt(d.x0, d.y0);
  } else if (d.mode === 'box') boxSelect(d.x0, d.y0, d.x, d.y);
  else if (d.mode === 'line') {
    const gp = groundAt(d.x, d.y);
    if (gp && lineStart) placeLine(lineStart, placingOrigin(gp.x, gp.z));
    lineStart = null; updateGhost();
  }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; boxEl.style.display = 'none'; clearTimeout(longPressT); });
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') app.mouse = null; });
cv.addEventListener('wheel', e => {
  if (!app.inGame) return;
  const f = Math.exp(clamp(e.deltaY, -200, 200) * 0.0018 * (e.deltaMode === 1 ? 30 : 1));
  const before = cam.tdist;
  cam.tdist = clamp(cam.tdist * f, cam.min, cam.max);
  tut.camMoved += 2;
  // zooma mot markören
  if (cam.tdist < before && app.mouse) {
    const gp = groundAt(app.mouse.x, app.mouse.y);
    if (gp) { const t = (1 - cam.tdist / before) * 0.6; cam.ttx += (gp.x - cam.ttx) * t; cam.ttz += (gp.z - cam.ttz) * t; }
  }
  e.preventDefault();
}, { passive: false });
cv.addEventListener('dblclick', e => e.preventDefault());

function handleLeftClick(sx, sy, shift) {
  if (G.placing) {
    if (BUILDINGS[G.placing.type].drag) return;
    const gp = groundAt(sx, sy); if (!gp) return;
    tryPlace(placingOrigin(gp.x, gp.z));
    hoverGround = gp; updateGhost();
    return;
  }
  selectAt(sx, sy, shift);
}
function handleTap(sx, sy) {
  if (G.placing) {
    const gp = groundAt(sx, sy); if (!gp) return;
    touchGhost = placingOrigin(gp.x, gp.z);
    $('confirmBar').classList.remove('hidden');
    updateGhost();
    return;
  }
  // med valda soldater: tryck på mark/fiende = kommando, på egen soldat = välj
  if (G.selUnits && G.selUnits.size) {
    const e = pickEntity(sx, sy, 30);
    if (e && e.kind === 'unit') { selectAt(sx, sy, false); return; }
    commandAt(sx, sy); return;
  }
  selectAt(sx, sy, false);
}

/* =====================================================================
 * Tangentbord
 * ===================================================================== */
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (!app.inGame) return;
  const k = e.code;
  if (k === 'Escape') {
    e.preventDefault();
    if (!$('statsModal').classList.contains('hidden')) { ui.closeStats(); return; }
    if (!$('story').classList.contains('hidden')) { closeStory(); return; }
    if (app.paused) { if (!$('end').classList.contains('hidden')) return; app.pause(false); return; }
    if (G.placing) { cancelPlacing(); return; }
    if (G.sel || (G.selUnits && G.selUnits.size)) { app.deselect(); return; }
    app.pause(true); return;
  }
  if (k === 'KeyP') { if (!$('end').classList.contains('hidden')) return; app.pause(!app.paused); return; }
  if (app.paused) return;
  if (k === 'Space') { e.preventDefault(); app.setSpeed(app.speed === 0 ? (app.prevSpeed || 1) : 0); return; }
  if (k === 'Period' || k === 'NumpadAdd' && e.shiftKey) { app.setSpeed(Math.min(3, app.speed + 1)); return; }
  if (k === 'Comma') { app.setSpeed(Math.max(0, app.speed - 1)); return; }
  if (/^Digit[1-5]$/.test(k)) { const cats = ['base', 'raw', 'food', 'craft', 'def']; ui.setCat(cats[+k.slice(5) - 1]); audio.play('click'); return; }
  if (k === 'KeyB') { const bb = $('buildbar'); bb.classList.toggle('open'); if (bb.classList.contains('open')) ui.setCat(ui.cat); return; }
  if (k === 'KeyR' && G.placing) { G.placing.rot = (G.placing.rot + 1) & 3; updateGhost(); audio.play('click'); return; }
  if ((k === 'Delete' || k === 'Backspace') && G.sel && G.sel.kind === 'building') { app.demolish(G.sel.b); return; }
  if (k === 'KeyU' && G.sel && G.sel.kind === 'building') { if (upgradeBuilding(G.sel.b)) audio.play('select'); else audio.play('error'); return; }
  if (k === 'KeyF') { app.selectArmy(); return; }
  if (k === 'KeyH') { app.focusHall(); return; }
  if (k === 'KeyL') { app.toggleAlarm(); return; }
  if (k === 'KeyT') { if ($('statsModal').classList.contains('hidden')) ui.openStats(); else ui.closeStats(); return; }
});

/* =====================================================================
 * Handkontroll – virtuell markör
 * ===================================================================== */
const cursorEl = $('gpcursor');
const gpc = { x: 0, y: 0, on: false };
function gamepadFrame(dt) {
  if (input.gamepad == null) { if (gpc.on) { gpc.on = false; cursorEl.classList.add('hidden'); } return; }
  const ax = input.gpAxis(0), ay = input.gpAxis(1);
  if (!gpc.on && (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2 || input.pressed('Pad0'))) { gpc.on = true; gpc.x = R.size.w / 2; gpc.y = R.size.h / 2; cursorEl.classList.remove('hidden'); }
  if (!gpc.on) return;
  const sp = 620 * dt;
  gpc.x = clamp(gpc.x + ax * sp, 0, R.size.w - 2); gpc.y = clamp(gpc.y + ay * sp, 0, R.size.h - 2);
  cursorEl.style.transform = `translate(${gpc.x}px, ${gpc.y}px)`;
  const r = cv.getBoundingClientRect();
  const sx = r.left + gpc.x, sy = r.top + gpc.y;
  if (app.inGame && !app.paused) {
    const rx = input.gpAxis(2), ry = input.gpAxis(3);
    if (rx || ry) panBy(rx * cam.dist * dt * 1.2, -ry * cam.dist * dt * 1.2);
    if (input.down('Pad4')) cam.tyaw += dt * 1.6;
    if (input.down('Pad5')) cam.tyaw -= dt * 1.6;
    if (input.down('Pad6')) cam.tdist = clamp(cam.tdist * (1 + dt * 1.5), cam.min, cam.max);
    if (input.down('Pad7')) cam.tdist = clamp(cam.tdist * (1 - dt * 1.5), cam.min, cam.max);
    hoverGround = groundAt(sx, sy); updateGhost();
    if (input.pressed('Pad2')) $('buildbar').classList.toggle('open');
    if (input.pressed('Pad3')) app.setSpeed((app.speed + 1) % 4);
    if (input.pressed('Pad14')) { const cats = ['base', 'raw', 'food', 'craft', 'def']; ui.setCat(cats[(cats.indexOf(ui.cat) + 4) % 5]); }
    if (input.pressed('Pad15')) { const cats = ['base', 'raw', 'food', 'craft', 'def']; ui.setCat(cats[(cats.indexOf(ui.cat) + 1) % 5]); }
    if (input.pressed('Pad1')) { if (G.placing) cancelPlacing(); else if (!commandAt(sx, sy)) app.deselect(); }
  }
  if (input.pressed('Pad9')) { if (app.inGame && $('end').classList.contains('hidden')) app.pause(!app.paused); }
  if (input.pressed('Pad0')) {
    cursorEl.style.display = 'none';
    const el = document.elementFromPoint(sx, sy);
    cursorEl.style.display = '';
    if (el === cv && app.inGame && !app.paused) { lastPointerType = 'mouse'; handleLeftClick(sx, sy, false); }
    else if (el && el !== cv) { const b = el.closest('button, a, [data-b], [data-cat], [data-act], select, input'); if (b) b.click(); }
  }
}

/* =====================================================================
 * Överlägg (hälsostaplar, flytande text, räd-pil)
 * ===================================================================== */
function drawOverlay(dt) {
  const W = R.size.w, H = R.size.h, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (overlay.width !== Math.round(W * dpr) || overlay.height !== Math.round(H * dpr)) { overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr); }
  const c = octx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  if (!app.inGame) return;
  const viewR = cam.dist * 2.2 + 10;
  const bar = (x, y, w, f, col, bg = 'rgba(0,0,0,.55)') => { c.fillStyle = bg; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5); c.fillStyle = col; c.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 3); };
  const hpCol = f => f > 0.6 ? '#5bd46a' : f > 0.3 ? '#e8c040' : '#e85040';
  const showAll = cam.dist < 40;
  for (const u of G.units) {
    if (Math.hypot(u.x - cam.tx, u.z - cam.tz) > viewR) continue;
    const sel = G.selUnits && G.selUnits.has(u);
    if (!sel && u.hp >= u.maxHp) continue;
    toScreen(u.x, u.y + 0.75, u.z, _sp); if (_sp.z > 1) continue;
    bar(_sp.x, _sp.y, 22, u.hp / u.maxHp, hpCol(u.hp / u.maxHp));
  }
  for (const e of G.enemies) {
    if (Math.hypot(e.x - cam.tx, e.z - cam.tz) > viewR) continue;
    if (e.hp >= e.maxHp && !(G.sel && G.sel.e === e)) continue;
    const h = e.type === 'troll' ? 2.4 : e.type === 'murbracka' ? 1.3 : 0.75;
    toScreen(e.x, e.y + h, e.z, _sp); if (_sp.z > 1) continue;
    bar(_sp.x, _sp.y, e.type === 'troll' ? 40 : 22, e.hp / e.maxHp, '#ff4a4a');
  }
  for (const ci of G.citizens) {
    if (ci.inside || ci.hp >= ci.maxHp) continue;
    toScreen(ci.x, ci.y + 0.75, ci.z, _sp); if (_sp.z > 1) continue;
    bar(_sp.x, _sp.y, 16, ci.hp / ci.maxHp, hpCol(ci.hp / ci.maxHp));
  }
  c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'center';
  for (const b of G.buildings.values()) {
    if (Math.hypot(b.x - cam.tx, b.z - cam.tz) > viewR) continue;
    const v = render && render.bmesh.get(b.id);
    const h = (v && v.h) || 1.4;
    const selB = G.sel && G.sel.kind === 'building' && G.sel.b === b;
    if (!b.built) {
      toScreen(b.x, b.y + h + 0.3, b.z, _sp); if (_sp.z > 1) continue;
      bar(_sp.x, _sp.y, 34, b.progress, '#7ab8ff');
      if (!b.builders && !b.def.wall) { c.fillStyle = '#ffd860'; c.fillText('🔨', _sp.x, _sp.y - 6); }
      continue;
    }
    if (b.hp < b.maxHp - 0.5 || selB) {
      if (b.def.wall && !selB && b.hp > b.maxHp * 0.5) continue;
      toScreen(b.x, b.y + h + 0.3, b.z, _sp); if (_sp.z > 1) continue;
      bar(_sp.x, _sp.y, b.def.wall ? 18 : 34, b.hp / b.maxHp, b.team ? '#ff4a4a' : hpCol(b.hp / b.maxHp));
    }
    // saknar arbetare
    if (!b.team && b.built && (bstat(b, 'workers') || 0) > 0 && b.want > 0 && !b.paused && b.workers.length === 0 && cam.dist < 45) {
      toScreen(b.x, b.y + h + 0.6, b.z, _sp); if (_sp.z > 1) continue;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(_sp.x, _sp.y - 4, 9, 0, 6.28); c.fill();
      c.fillStyle = '#ffd860'; c.fillText('👷', _sp.x, _sp.y);
    }
    if (b.field && b.field.state === 'ripe' && cam.dist < 35) { toScreen(b.x, b.y + 0.8, b.z, _sp); if (_sp.z < 1) c.fillText('🌾', _sp.x, _sp.y); }
  }
  // flytande text
  c.font = '700 13px Rubik, sans-serif';
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt;
    if (f.t > 1.6) { floats.splice(i, 1); continue; }
    toScreen(f.x, f.y + f.t * 0.8, f.z, _sp); if (_sp.z > 1) continue;
    c.globalAlpha = clamp(1.6 - f.t, 0, 1);
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(f.text, _sp.x + 1, _sp.y + 1);
    c.fillStyle = f.color; c.fillText(f.text, _sp.x, _sp.y);
    c.globalAlpha = 1;
  }
  // markeringar för order
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]; m.t += dt; if (m.t > 0.7) { marks.splice(i, 1); continue; }
    toScreen(m.x, groundY(m.x, m.z) + 0.05, m.z, _sp); if (_sp.z > 1) continue;
    c.strokeStyle = '#' + new THREE.Color(m.color).getHexString(); c.globalAlpha = 1 - m.t / 0.7; c.lineWidth = 2;
    c.beginPath(); c.ellipse(_sp.x, _sp.y, 6 + m.t * 26, (6 + m.t * 26) * 0.5, 0, 0, 6.28); c.stroke(); c.globalAlpha = 1;
  }
  // räd-pil vid skärmkanten
  const RD = G.raid;
  if (RD && RD.warned && RD.spawns && RD.spawns.length && !RD.active || (RD && RD.active && G.enemies.length && cam.dist)) {
    let tx, tz;
    if (RD.active) {
      let best = null, bd = 1e9; for (const e of G.enemies) { if (e.guard) continue; const d = (e.x - cam.tx) ** 2 + (e.z - cam.tz) ** 2; if (d < bd) { bd = d; best = e; } }
      if (best) { tx = best.x; tz = best.z; }
    } else { tx = RD.spawns[0].x; tz = RD.spawns[0].z; }
    if (tx != null) {
      toScreen(tx, 0.5, tz, _sp);
      const inside = _sp.z < 1 && _sp.x > 20 && _sp.y > 60 && _sp.x < W - 20 && _sp.y < H - 20;
      if (!inside) {
        let dx = _sp.x - W / 2, dy = _sp.y - H / 2; if (_sp.z > 1) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx);
        const rx = W / 2 - 40, ry = H / 2 - 70;
        const t = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
        const px = W / 2 + Math.cos(a) * t, py = H / 2 + Math.sin(a) * t;
        c.save(); c.translate(px, py); c.rotate(a);
        const pulse = 1 + Math.sin(performance.now() / 160) * 0.15;
        c.scale(pulse, pulse);
        c.fillStyle = '#ff4040'; c.strokeStyle = '#300'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(16, 0); c.lineTo(-10, -11); c.lineTo(-4, 0); c.lineTo(-10, 11); c.closePath(); c.fill(); c.stroke();
        c.restore();
      }
    }
  }
}

/* =====================================================================
 * Handledning och tips
 * ===================================================================== */
const TUT = [
  { text: 'Välkommen till Nordheim! Flytta kameran genom att dra med mittenknappen, med WASD/piltangenterna eller genom att föra musen mot kanten. Rulla för att zooma och håll högerknappen för att vrida. (Pek: dra och nyp.)', until: 'camera' },
  { text: 'Trä är viktigast i början. Öppna kategorin Råvaror och bygg en huggarstuga nära skogen.', hl: '[data-cat="raw"]', until: 'placed:woodcutter' },
  { text: 'Lediga invånare blir byggare och uppför byggnaden. Bygg nu en fiskarhydda vid stranden – maten tar annars slut.', hl: '[data-cat="food"]', until: 'placed:fisher' },
  { text: 'Klicka på en byggnad eller invånare för att se vad den gör. I byggnadens panel kan du ändra antalet arbetare.', until: 'select' },
  { text: 'Fler bostäder låter byn växa. Bygg ett långhus under Bas. Glädje 🙂 och mat 🍖 avgör hur snabbt nybyggare flyttar in.', hl: '[data-cat="base"]', until: 'placed:house' },
  { text: 'Bra jobbat! Håll muspekaren över (eller tryck på) en resurs högst upp för att se varför den ökar eller minskar. Klara målen till vänster för att vinna. Mellanslag pausar och 1×–3× skyndar på tiden.', until: 'time:14' }
];
const tut = {
  step: 0, active: false, t: 0,
  start(i = 0) { this.step = i; this.active = true; this.t = 0; this.show(); },
  show() {
    const s = TUT[this.step]; if (!s) { this.hide(); return; }
    $('tipText').textContent = s.text;
    $('tipStep').textContent = (this.step + 1) + '/' + TUT.length;
    $('tipbox').classList.remove('hidden');
    document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse'));
    if (s.hl) document.querySelectorAll(s.hl).forEach(e => e.classList.add('pulse'));
    this.t = 0;
  },
  hide() { this.active = false; $('tipbox').classList.add('hidden'); document.querySelectorAll('.pulse').forEach(e => e.classList.remove('pulse')); },
  next() { this.step++; G.tutStep = this.step; audio.play('pickup'); if (this.step >= TUT.length) { this.hide(); Spelhallen.store.set('nordheim:tutDone', true); } else this.show(); },
  onEvent(ev, arg) {
    if (!this.active) return;
    const u = TUT[this.step] && TUT[this.step].until;
    if (!u) return;
    if (u === ev || u === ev + ':' + arg) this.next();
  },
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const u = TUT[this.step] && TUT[this.step].until;
    // steg som spelaren redan gjort i förväg (t.ex. byggt innan rutan bad om det)
    if (u && u.startsWith('placed:') && this.t > 1.5) { const ty = u.slice(7); for (const b of G.buildings.values()) if (b.type === ty && !b.team) { this.next(); return; } }
    if (u && u.startsWith('time:') && this.t > +u.slice(5)) this.next();
    if (u === 'camera' && this.camMoved > 25) { this.camMoved = 0; this.next(); }
  },
  camMoved: 0
};
$('tipSkip').onclick = () => { tut.hide(); Spelhallen.store.set('nordheim:tutDone', true); };
$('tipNext').onclick = () => tut.next();
function startTutorialIfNeeded() {
  if (G.sc && G.sc.tutorial) { tut.start(0); return; }
  if (!Spelhallen.store.get('nordheim:tutDone', false) && G.mode === 'free') tut.start(0);
}
const shownTips = Spelhallen.store.get('nordheim:tips', {});
function tipOnce(key, text) {
  if (!settings.get('hints') || shownTips[key]) return;
  shownTips[key] = 1; Spelhallen.store.set('nordheim:tips', shownTips);
  ui.notify('💡 ' + text, 'tip');
}
function seasonTip(s) {
  if (s === 3) tipOnce('winter', 'Vintern: åkrar och bärbuskar ger inget, fisket går långsamt och alla äter mer. Ha mat i lager!');
  if (s === 2) tipOnce('autumn', 'Hösten är skördetid. Se till att bönderna hinner skörda innan vintern.');
}

/* ---------- Berättelse vid scenariostart ---------- */
function showStory() {
  const sc = G.sc;
  $('storyTitle').textContent = sc.icon + ' ' + sc.name;
  $('storyText').textContent = sc.story;
  $('storyGoals').innerHTML = sc.goals.map(g => '<li>' + g.label + '</li>').join('') + (sc.deadline ? '<li>⏳ ' + sc.deadline.label + '</li>' : '');
  const newStuff = { c2: 'Nytt: åkrar och lada, årstider och vinter.', c3: 'Nytt: räder, kasern, torn, murar och portar. Välj soldater (dra en ram eller tryck F) och högerklicka för att flytta/anfalla.', c4: 'Nytt: hov, marknad och handel. Glädjen styr tillväxten – håll pekaren över 🙂 högst upp för att se vad som höjer och sänker den.', c5: 'Nytt: gruva och smedja. Smedjan gör vapen av järn och trä. Bygger du murar kommer fienden med stormstegar och murbräckor.', c6: 'Nytt: anfall! Högerklicka på fiendebyggnader för att anfalla dem.', c7: 'Troll! De tål mycket – använd sköldmör och många bågskyttar.' }[sc.id];
  $('storyNew').textContent = newStuff || '';
  $('storyNew').classList.toggle('hidden', !newStuff);
  show('story');
  app.paused = true; loop.setPaused(true);
}
function closeStory() {
  hide('story'); app.paused = false; loop.setPaused(false);
  startTutorialIfNeeded();
}
$('storyGo').onclick = closeStory;

/* =====================================================================
 * Spelloop
 * ===================================================================== */
let autosaveT = 0, tintT = 0;
const loop = new Loop({
  step: 1 / 60, maxSteps: 8,
  update(dt) {
    if (!app.inGame || !G.on) return;
    const t0 = performance.now();
    tick(dt);
    app.simMs = (app.simMs || 0) * 0.95 + (performance.now() - t0) * 0.05;
  },
  render(alpha, frameDt) {
    const t0 = performance.now();
    const dt = Math.min(frameDt, 0.1);
    audio.update();
    if (app.inGame) {
      // kamera från tangentbord
      if (!app.paused) {
        const sp = cam.dist * 1.1 * settings.get('camSpeed') * dt;
        const ax = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']), az = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
        if (ax || az) { panBy(ax * sp, az * sp); tut.camMoved += 1; }
        if (input.down('KeyQ')) cam.tyaw += dt * 1.8 * settings.get('sensitivity');
        if (input.down('KeyE')) cam.tyaw -= dt * 1.8 * settings.get('sensitivity');
        if (input.down('Equal', 'NumpadAdd', 'PageUp')) cam.tdist = clamp(cam.tdist * (1 - dt * 1.6), cam.min, cam.max);
        if (input.down('Minus', 'NumpadSubtract', 'PageDown')) cam.tdist = clamp(cam.tdist * (1 + dt * 1.6), cam.min, cam.max);
        // kantpanorering
        if (settings.get('edgePan') && app.mouse && !drag && document.hasFocus() && !isTouchDevice()) {
          const r = cv.getBoundingClientRect(), m = 6;
          const ex = app.mouse.x < r.left + m ? -1 : app.mouse.x > r.right - m ? 1 : 0;
          const ez = app.mouse.y < r.top + m ? 1 : app.mouse.y > r.bottom - m ? -1 : 0;
          if (ex || ez) panBy(ex * sp, ez * sp);
        }
        if (drag && (drag.mode === 'pan' || drag.mode === 'rot')) tut.camMoved += 0.5;
      }
      gamepadFrame(dt);
      const prevTx = cam.tx, prevTz = cam.tz;
      updateCamera(dt);
      if (Math.abs(cam.tx - prevTx) + Math.abs(cam.tz - prevTz) > 0.001 && app.mouse && !drag) { hoverGround = groundAt(app.mouse.x, app.mouse.y); if (G.placing) updateGhost(); }
      // årstidsövergång i färger
      if (app.tintF < 1) { app.tintF = Math.min(1, app.tintF + dt / 5); world.setSeasonTint(G.cal.season, app.tintF); }
      if (app.mmTree) { app.mmTree = false; app.mmTreeT = (app.mmTreeT || 0) + 1; if (app.mmTreeT > 20) { app.mmTreeT = 0; ui.mmDirty = true; } }
      env.update(app.paused ? 0 : dt * Math.max(0.0001, app.speed ? 1 : 0.0001), { x: cam.tx, z: cam.tz }, cam.dist, camera);
      world.update(dt, performance.now() / 1000);
      render.drawAll(camera, dt, cam.dist * 2.4 + 14);
      emitAmbient(dt);
      ui.update(dt);
      tut.update(dt);
      musicT -= dt; if (musicT <= 0) { musicT = 2; musicForState(); }
      autosaveT += dt;
      const asMin = settings.get('autosave');
      if (asMin > 0 && autosaveT > asMin * 60 && !app.paused && !G.over) { autosaveT = 0; saveGame('auto').then(ok => { if (ok) toast('💾 Autosparat', { ms: 1200 }); }); }
    } else {
      // menybakgrund: långsam kamerarunda
      menuCam(dt);
      env.update(dt, { x: 64, z: 64 }, 40, camera);
      if (world) world.update(dt, performance.now() / 1000);
    }
    drawOverlay(dt);
    R.renderer.render(scene, camera);
    input.endFrame();
    app.frameMs = (app.frameMs || 0) * 0.95 + (performance.now() - t0) * 0.05;
  }
});
let musicT = 0;
fpsMeter(root, loop, settings);

// Rök, eld, ässjor
let ambT = 0;
function emitAmbient(dt) {
  if (app.paused) return;
  ambT += dt;
  const doSmoke = ambT > 0.18; if (doSmoke) ambT = 0;
  const view = cam.dist * 2 + 12;
  let fireNear = null, fd = 1e9;
  for (const b of G.buildings.values()) {
    const d = Math.hypot(b.x - cam.tx, b.z - cam.tz);
    if (d > view) continue;
    if (b.fire > 0) {
      const v = render.bmesh.get(b.id); const h = v && v.h || 1.2;
      env.burst('fire', b.x + (Math.random() - 0.5) * b.w * 0.5, b.y + h * 0.5, b.z + (Math.random() - 0.5) * b.d * 0.5, Math.ceil(b.fire * 3));
      if (doSmoke) env.burst('blacksmoke', b.x, b.y + h, b.z);
      if (d < fd) { fd = d; fireNear = b; }
      continue;
    }
    if (!doSmoke || !b.built || b.team) continue;
    if ((b.type === 'house' || b.type === 'hall') && Math.random() < (isNight(G.cal.phase) || G.cal.season === 3 ? 0.6 : 0.25)) {
      const occ = b.inside && b.inside.length || G.citizens.some(c => c.home === b.id);
      if (occ) { const off = rotOff(b, b.type === 'hall' ? 0 : -0.6, b.type === 'hall' ? 0 : 0.15); env.burst('smoke', b.x + off.x, b.y + (b.type === 'hall' ? 2.7 : 1.75) * (b.lvl > 1 && b.type === 'house' ? 1.1 : 1), b.z + off.z); }
    }
    if (b.type === 'smithy' && b.inside && b.inside.length) {
      const off = rotOff(b, -0.55, -0.4);
      env.burst('blacksmoke', b.x + off.x, b.y + 1.7, b.z + off.z);
      const f2 = rotOff(b, 0.55, 0.55); env.burst('forge', b.x + f2.x, b.y + 0.45, b.z + f2.z);
    }
    if (b.type === 'woodcutter' && Math.random() < 0.2) { const off = rotOff(b, -0.55, -0.4); env.burst('smoke', b.x + off.x, b.y + 1.3, b.z + off.z); }
    if ((b.type === 'hall') && Math.random() < 0.8) { for (const sx of [-1, 1]) { const o = rotOff(b, sx * 0.6, (b.lvl > 1 ? 1.3 : 1.15) + 0.5); env.burst('torch', b.x + o.x, b.y + 0.95, b.z + o.z); } }
  }
  // fisk som hoppar
  if (Math.random() < dt * 1.2) {
    const m = G.map, n = m.n;
    for (let t = 0; t < 6; t++) { const x = cam.tx + (Math.random() - 0.5) * cam.dist * 2, z = cam.tz + (Math.random() - 0.5) * cam.dist * 2; const k = tileOf(x, z); if (k >= 0 && m.res[k] === 5) { env.burst('ripple', x, 0, z); env.burst('splash', x, 0, z, 3); break; } }
  }
  // eldljus
  const fl = env.fireLight;
  if (fireNear && settings.q.shadows) { fl.position.set(fireNear.x, fireNear.y + 1.5, fireNear.z); fl.intensity = (8 + Math.random() * 6) * fireNear.fire; }
  else fl.intensity = 0;
}
function rotOff(b, x, z) {
  let a = -b.rot * Math.PI / 2; if (b.face != null) a = b.face * Math.PI / 2;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + z * s, z: -x * s + z * c };
}

let menuA = 0;
function menuCam(dt) {
  menuA += dt * 0.05;
  camera.position.set(64 + Math.cos(menuA) * 50, 22, 64 + Math.sin(menuA) * 50);
  camera.lookAt(64, 0, 64);
  camera.userData.tx = 64; camera.userData.tz = 64;
}

/* =====================================================================
 * Menyer
 * ===================================================================== */
function showMenu() {
  show('menu');
  const best = bestScore(GAME_ID);
  $('menuBest').textContent = best > 0 ? 'Ditt rekord: ' + Spelhallen.fmt(best) : '';
}
async function refreshContinue() {
  const d = await loadData('auto');
  const btn = $('btnContinue');
  if (d && d.meta) {
    btn.classList.remove('hidden');
    btn.querySelector('small').textContent = metaText(d.meta);
    btn.onclick = () => { audio.play('select'); startGame(null, d); };
  } else btn.classList.add('hidden');
}
function metaText(m) {
  const mode = m.mode === 'campaign' ? (m.scName || 'Kampanj') : m.mode === 'survival' ? 'Överlevnad' : 'Fritt spel';
  const season = ['vår', 'sommar', 'höst', 'vinter'][m.season] || '';
  return `${mode} · år ${m.year} ${season} · ${m.pop} invånare`;
}
$('btnCampaign').onclick = () => { audio.play('click'); openCampaign(); };
$('btnFree').onclick = () => { audio.play('click'); openSetup('free'); };
$('btnSurvival').onclick = () => { audio.play('click'); openSetup('survival'); };
$('btnLoad').onclick = () => { audio.play('click'); openLoad(); };
$('btnSettings').onclick = () => { audio.play('click'); openSettings('menu'); };
$('btnHelp').onclick = () => { audio.play('click'); openHelp('menu'); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { audio.play('click'); hide(b.closest('.g3-screen')); const to = b.dataset.back; show(to === 'auto' ? (app.inGame ? 'pause' : 'menu') : to); });

function openCampaign() {
  hide('menu');
  const prog = Spelhallen.store.get('nordheim:campaign', { unlocked: 0, best: {} });
  $('campList').innerHTML = CAMPAIGN.map((c, i) => {
    const locked = i > prog.unlocked;
    const b = prog.best[c.id];
    return `<button class="scen${locked ? ' locked' : ''}" data-sc="${c.id}" ${locked ? 'disabled' : ''}>
      <span class="si">${locked ? '🔒' : c.icon}</span>
      <span class="st"><b>${i + 1}. ${c.name}</b><small>${locked ? 'Klara föregående scenario först' : c.goals.map(g => g.label).join(' · ')}</small></span>
      <span class="ss">${b ? '⭐'.repeat(b.stars) + '<small>' + b.score + ' p</small>' : ''}</span></button>`;
  }).join('');
  const total = Object.values(prog.best).reduce((s, b) => s + b.score, 0);
  $('campTotal').textContent = total ? 'Kampanjpoäng: ' + total : '';
  $('campList').onclick = e => { const b = e.target.closest('[data-sc]'); if (b && !b.disabled) startGame({ mode: 'campaign', scenario: b.dataset.sc }); };
  show('campaign');
}
let setupMode = 'free';
function openSetup(mode) {
  setupMode = mode;
  hide('menu');
  $('setupTitle').textContent = mode === 'free' ? '🌲 Fritt spel' : '🛡️ Överlevnad';
  $('setupDesc').textContent = mode === 'free' ? 'Bygg fritt på en ny ö. Välj storlek och svårighet – eller stäng av räderna helt.' : 'Räderna blir hårdare och tätare för varje gång. Poäng = överlevda räder × befolkning.';
  const diffSel = $('setDiff');
  diffSel.innerHTML = Object.entries(DIFFS).filter(([k]) => mode === 'free' || k !== 'fredlig').map(([k, d]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${d.name} – ${d.desc}</option>`).join('');
  $('setSize').innerHTML = Object.entries(SIZES).map(([k, s]) => `<option value="${k}" ${k === 'medel' ? 'selected' : ''}>${s.name} (${s.n}×${s.n})</option>`).join('');
  $('rowRaids').classList.toggle('hidden', mode !== 'free');
  $('setSeed').value = '';
  show('setup');
}
$('setupGo').onclick = () => {
  const diff = $('setDiff').value, size = SIZES[$('setSize').value].n;
  const seed = $('setSeed').value.trim() || String(Math.floor(Math.random() * 1e9));
  startGame({ mode: setupMode, diff, size, seed, raids: setupMode === 'survival' ? true : $('setRaids').checked && diff !== 'fredlig' });
};
async function openLoad(from = 'menu') {
  hide('menu'); hide('pause');
  const list = await listSaves();
  const inGame = app.inGame;
  $('loadTitle').textContent = inGame ? 'Spara / ladda' : 'Ladda spel';
  $('slotList').innerHTML = list.map(s => `<div class="slot"><span class="sn">${s.slot === 'auto' ? '🔄 Autospar' : '💾 Plats ' + s.slot}</span><span class="sm">${s.meta ? metaText(s.meta) + '<small>' + new Date(s.meta.date).toLocaleString('sv-SE') + '</small>' : '<small>Tom</small>'}</span><span class="sb">
    ${inGame && s.slot !== 'auto' ? `<button class="btn small" data-save="${s.slot}">Spara</button>` : ''}
    ${s.meta ? `<button class="btn small primary" data-load="${s.slot}">Ladda</button><button class="btn small" data-del="${s.slot}" title="Radera">🗑</button>` : ''}</span></div>`).join('');
  $('slotList').onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.save) { const ok = await saveGame(t.dataset.save); toast(ok ? '💾 Sparat på plats ' + t.dataset.save : 'Kunde inte spara'); openLoad(); }
    else if (t.dataset.load) { const d = await loadData(t.dataset.load); if (d) { hide('loadgame'); if (app.inGame) quitToMenuNoSave(); startGame(null, d); } }
    else if (t.dataset.del) {
      // Tvåstegsbekräftelse i knappen (confirm() fungerar inte i alla miljöer)
      if (t.dataset.armed !== '1') {
        t.dataset.armed = '1'; t.textContent = 'Radera?'; t.classList.add('primary');
        setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = '🗑'; t.classList.remove('primary'); } }, 4000);
        return;
      }
      await deleteSave(t.dataset.del); toast('Sparningen raderad'); openLoad(); refreshContinue();
    }
  };
  show('loadgame');
}
function quitToMenuNoSave() {
  app.inGame = false; G.on = false; hide('pause');
  if (world) { world.dispose(); world = null; } if (render) { render.dispose(); render = null; }
}
let settingsFrom = 'menu';
function openSettings(from) {
  settingsFrom = from;
  hide('menu'); hide('pause');
  buildSettings($('setBody'), settings, [
    { key: 'camSpeed', label: 'Kamerahastighet', type: 'range', min: 0.4, max: 2.5, step: 0.1, format: v => (+v).toFixed(1) + '×' },
    { key: 'edgePan', label: 'Panorera vid skärmkanten', type: 'check' },
    { key: 'leftDrag', label: 'Vänster musdrag', type: 'select', options: [['box', 'Ram-markering'], ['pan', 'Panorera']] },
    { key: 'autosave', label: 'Autospara', type: 'select', options: [[0, 'Av'], [2, 'Var 2:a minut'], [3, 'Var 3:e minut'], [5, 'Var 5:e minut']] },
    { key: 'hints', label: 'Visa tips', type: 'check' }
  ], { hide: ['fov', 'invertY'] });
  const lab = $('setBody').querySelector('label[for="set-sensitivity"]'); if (lab) lab.textContent = 'Rotationskänslighet';
  show('settings');
}
$('settingsBack').onclick = () => { hide('settings'); show(app.inGame ? 'pause' : 'menu'); audio.play('click'); };
function openHelp(from) { hide('menu'); hide('pause'); show('help'); }
document.querySelectorAll('#helpTabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#helpTabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.helppage').forEach(p => p.classList.toggle('hidden', p.dataset.page !== b.dataset.page));
});
$('helpBack').onclick = () => { hide('help'); show(app.inGame ? 'pause' : 'menu'); audio.play('click'); };
// pausmeny
$('pResume').onclick = () => app.pause(false);
$('pSave').onclick = () => openLoad('pause');
$('pSettings').onclick = () => openSettings('pause');
$('pHelp').onclick = () => openHelp('pause');
$('pQuit').onclick = () => { quitToMenu(true); };
$('pGiveUp').onclick = () => { hide('pause'); endGame(false, 'Du gav upp.'); };
$('endMenu').onclick = () => { hide('end'); quitToMenu(false); };
$('endRetry').onclick = () => { hide('end'); const o = { mode: G.mode, scenario: G.scenario, diff: G.diffId, size: G.size, seed: G.mode === 'campaign' ? undefined : String(Math.floor(Math.random() * 1e9)), raids: G.raidsOn }; startGame(o); };
$('endContinue').onclick = () => { hide('end'); app.paused = false; loop.setPaused(false); G.sc && (G.won = true); musicForState(); };

// autopaus
document.addEventListener('visibilitychange', () => { if (document.hidden && app.inGame && !app.paused) app.pause(true); });
addEventListener('blur', () => { if (app.inGame && !app.paused) app.pause(true); });
R.onResize((w, h) => { env.setPixelScale(h, R.renderer.getPixelRatio()); });
env.setPixelScale(R.size.h, R.renderer.getPixelRatio());

// pekknappar (rotera/zooma)
input.setupTouch($('touch'), {
  buttons: [
    { code: 'KeyQ', label: '⟲', right: 66, bottom: 250, size: 48 },
    { code: 'KeyE', label: '⟳', right: 12, bottom: 250, size: 48 },
    { code: 'Minus', label: '－', right: 66, bottom: 194, size: 48 },
    { code: 'Equal', label: '＋', right: 12, bottom: 194, size: 48 }
  ]
});

/* ---------- Start ---------- */
showMenu();
refreshContinue();
// bakgrundsö i menyn
(async () => {
  await menuBackdrop();
  loop.start();
  if (/[?&]debug\b/.test(location.search)) window.__nordheim = { G, app, cam, ui, get world() { return world; }, get render() { return render; }, env, loop, settings, startGame, tick, SIM, hooks, saveGame, loadData, restore, R, scene, camera };
})();
