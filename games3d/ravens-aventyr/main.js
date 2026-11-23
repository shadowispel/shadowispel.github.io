/* Rävens äventyr – huvudmodul: start, spelloop, tillstånd, HUD, menyer, sparning. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Settings, createRenderer, Loop, Input, Audio, buildSettings, fpsMeter, toast, show, hide, nextFrame, submitScore, bestScore, isTouchDevice } from '../../engine/kit.js';
import { Builder, makeSky, farRing } from './core.js';
import { Particles, BlobShadow, Shockwaves } from './fx.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { World } from './world.js';
import { stoneTick, setShadows } from './models.js';
import { WORLDS, WORLD_ORDER, TOTAL_STONES } from './worlds/index.js';

const ID = 'ravens-aventyr';
Spelhallen.init(ID);
const $ = id => document.getElementById(id);
const root = $('root');
const settings = new Settings(ID, { mouseMode: 'drag', camSpeed: 1, autoCam: true });
const scene = new THREE.Scene();
const R = createRenderer(root, settings, { scene });
const renderer = R.renderer;
const cam = new THREE.PerspectiveCamera(settings.get('fov') * 0.9, 1, 0.1, 900);
R.setCamera(cam);
const input = new Input(R.canvas, settings);
const audio = new Audio(settings);
const fx = new Particles(scene);
const shock = new Shockwaves(scene);
const rig = new CameraRig(cam);

/* ---------------------------------------------------------------- Ljus */
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6a40, 1.4);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.castShadow = settings.q.shadows;
sun.shadow.mapSize.set(settings.q.shadowSize, settings.q.shadowSize);
const SC = 34; Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 160 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const lantern = new THREE.PointLight(0xffd9a0, 0, 22, 1.2);
scene.add(lantern);
const sunDir = new THREE.Vector3(0.5, 1, 0.35).normalize();

/* ---------------------------------------------------------------- Efterbehandling */
let composer = null, bloom = null;
function setupPost() {
  const want = ['high', 'ultra'].includes(settings.get('quality'));
  if (want && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    bloom = new UnrealBloomPass(new THREE.Vector2(R.size.w, R.size.h), 0.45, 0.5, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(R.size.w, R.size.h);
  } else if (!want && composer) { composer.dispose(); composer = null; bloom = null; }
}
setupPost();
R.onResize((w, h) => { if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); } fx.setScale(h); });
fx.setScale(R.size.h);
settings.onChange(k => {
  if (k === 'quality') {
    setupPost(); sun.castShadow = settings.q.shadows;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(settings.q.shadowSize, settings.q.shadowSize);
    if (G.player) setShadows(G.player.obj, settings.q.shadows);
    if (G.world) toast('Grafikändringen gäller fullt ut nästa gång en värld laddas');
  }
  if (k === 'fov') { cam.fov = settings.get('fov') * 0.9; cam.updateProjectionMatrix(); }
});

/* ---------------------------------------------------------------- Musik */
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], LYD = [0, 2, 4, 6, 7, 9, 11], MIX = [0, 2, 4, 5, 7, 9, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
export const MUSIC = {
  hub: { tempo: 84, root: 62, scale: MAJ, chords: [[0, 2, 4], [3, 5, 7], [5, 7, 9], [4, 6, 8]], pad: 'sine', arp: true, arpEvery: 2, bass: true, arpType: 'triangle', arpVol: 0.022 },
  forest: { tempo: 108, root: 64, scale: MIX, chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [4, 6, 8]], pad: 'triangle', arp: true, bass: true, drums: true, arpVol: 0.022 },
  cave: { tempo: 70, root: 57, scale: DOR, chords: [[0, 2, 4, 6], [3, 5, 7], [5, 7, 9], [4, 6, 8, 10]], pad: 'sine', arp: true, arpEvery: 2, bass: true, arpType: 'sine', arpVol: 0.03 },
  ice: { tempo: 92, root: 65, scale: LYD, chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 2, 4, 6]], pad: 'sine', arp: true, bass: true, arpType: 'sine', arpVol: 0.028 },
  islands: { tempo: 118, root: 60, scale: MAJ, chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]], pad: 'triangle', arp: true, bass: true, drums: true, arpType: 'triangle', arpVol: 0.022 },
  tower: { tempo: 124, root: 55, scale: MIN, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.016 },
  boss: { tempo: 142, root: 52, scale: MIN, chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [4, 6, 8]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.018 },
  race: { tempo: 150, root: 62, scale: MAJ, chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]], pad: 'square', arp: true, bass: true, drums: true, arpVol: 0.016 },
  ending: 'victory'
};
let curMusic = null;
function music(name) { if (curMusic === name) return; curMusic = name; audio.music(name ? (typeof MUSIC[name] === 'string' ? MUSIC[name] : MUSIC[name]) : null); }

/* ---------------------------------------------------------------- Sparning */
const SLOT_KEY = i => ID + ':slot' + i;
function newSave() {
  const s = { v: 1, created: Date.now(), time: 0, stones: {}, coins: {}, tut: false, intro: false, last: 'hub', done: false, seen: {} };
  WORLD_ORDER.forEach(id => { s.stones[id] = new Array(WORLDS[id].stones.length).fill(false); s.coins[id] = 0; });
  return s;
}
function loadSlot(i) {
  const s = Spelhallen.store.get(SLOT_KEY(i), null);
  if (!s) return null;
  const d = newSave();
  Object.assign(d, s);
  WORLD_ORDER.forEach(id => { if (!d.stones[id]) d.stones[id] = new Array(WORLDS[id].stones.length).fill(false); if (d.coins[id] == null) d.coins[id] = 0; });
  return d;
}
function writeSave() { if (G.save && G.slot != null) Spelhallen.store.set(SLOT_KEY(G.slot), G.save); }
function stoneCount(s = G.save) { if (!s) return 0; let n = 0; for (const id of WORLD_ORDER) n += s.stones[id].filter(Boolean).length; return n; }
function coinScore(s = G.save) { let n = 0; for (const id of WORLD_ORDER) n += s.coins[id] || 0; return n; }
function score(s = G.save) { return stoneCount(s) * 1000 + coinScore(s); }
const fmtTime = t => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };

/* ---------------------------------------------------------------- Spelkontext */
const G = {
  scene, cam, rig, fx, shock, audio, input, settings,
  inp: { mx: 0, mz: 0, jump: false, jumpHeld: false, crouch: false, crouchHeld: false, attack: false, dash: false },
  world: null, player: null, save: null, slot: null, state: 'menu',
  visitCoins: 0, visitTime: 0, promptEnt: null, promptText: '', talkingTo: null, lastPound: null,
  get col() { return this.world ? this.world.col : null; },
  shake(a) { rig.shake(a); },
  toast(t, o) { toast(t, o); },
  hasStone(wid, idx) { return !!(this.save && this.save.stones[wid] && this.save.stones[wid][idx]); },
  prompt(ent, text) { if (!this.promptEnt) { this.promptEnt = ent; this.promptText = text; } },
  hud: { berries: (n, tot = 8, kind = 'berry') => { $('berries').classList.remove('hidden'); $('berryN').textContent = n; $('berryTot').textContent = tot; $('berryIcon').className = kind === 'lysmask' ? 'ra-bug' : kind === 'parla' ? 'ra-pearl' : 'ra-berry'; } },
  stoneCount: () => stoneCount(),
  worlds: WORLDS,
  lantern,
  music
};

/* ---------------------------------------------------------------- HUD */
function hudHearts() {
  const h = $('hearts');
  const p = G.player;
  if (h.children.length !== p.maxHp) { h.innerHTML = ''; for (let i = 0; i < p.maxHp; i++) { const d = document.createElement('i'); d.className = 'ra-heart'; h.appendChild(d); } }
  [...h.children].forEach((d, i) => { const was = !d.classList.contains('empty'); const on = i < p.hp; d.classList.toggle('empty', !on); if (on && !was) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); } });
}
function hudCoins(bump) { $('coins').textContent = G.visitCoins; if (bump) { const e = $('coins').parentElement; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } }
function hudStones(bump) { $('stones').textContent = stoneCount(); if (bump) { const e = $('stones').parentElement; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } }
let bannerT = 0;
function banner(title, sub = '') { const b = $('banner'); b.innerHTML = ''; b.append(title); if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); } b.classList.add('on'); bannerT = 3; }
let bigT = 0;
function bigText(t, dur = 0.9) { const b = $('big'); b.textContent = t; b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; bigT = dur; }
G.bigText = bigText;
G.bossBar = (name, frac) => { if (frac == null) { $('boss').classList.add('hidden'); return; } $('boss').classList.remove('hidden'); $('bossName').textContent = name; $('bossBar').style.width = Math.max(0, frac * 100) + '%'; };
G.raceText = t => { const r = $('race'); if (t == null) r.classList.add('hidden'); else { r.classList.remove('hidden'); r.textContent = t; } };
G.onHp = () => hudHearts();
let tipEl = $('tip');
G.tip = t => { if (!t) { tipEl.classList.add('hidden'); return; } tipEl.classList.remove('hidden'); $('tipText').textContent = t; };

/* ---------------------------------------------------------------- Dialog */
const dlg = { open: false, lines: [], i: 0, shown: 0, full: '', onDone: null, choices: null, sel: 0, ent: null };
G.dialog = (name, lines, ent, onDone) => {
  dlg.open = true; dlg.lines = lines.slice(); dlg.i = -1; dlg.onDone = onDone || null; dlg.ent = ent || null;
  G.talkingTo = ent || null;
  $('dname').textContent = name;
  $('dialog').classList.remove('hidden');
  if (G.state === 'play') G.state = 'dialog';
  nextLine();
};
function nextLine() {
  dlg.i++;
  const dc = $('dchoices'); dc.innerHTML = ''; dlg.choices = null;
  if (dlg.i >= dlg.lines.length) { closeDialog(); return; }
  let L = dlg.lines[dlg.i];
  if (typeof L === 'function') { L = L(); if (L == null) { nextLine(); return; } }
  if (typeof L === 'string') L = { text: L };
  dlg.full = L.text; dlg.shown = 0; $('dtext').textContent = '';
  if (L.choices) {
    dlg.choices = L.choices; dlg.sel = 0;
    L.choices.forEach(([label, fn], k) => {
      const b = document.createElement('button'); b.textContent = label; if (k === 0) b.classList.add('sel');
      b.onclick = e => { e.stopPropagation(); choose(k); };
      dc.appendChild(b);
    });
  }
  $('dnext').style.visibility = L.choices ? 'hidden' : 'visible';
  audio.play('select', { vol: 0.4, pitch: 1.3 });
}
function choose(k) {
  const c = dlg.choices[k]; dlg.choices = null;
  const fn = c[1];
  const more = fn ? fn() : null;
  if (Array.isArray(more)) { dlg.lines.splice(dlg.i + 1, 0, ...more); }
  nextLine();
}
function advanceDialog() {
  if (dlg.shown < dlg.full.length) { dlg.shown = dlg.full.length; $('dtext').textContent = dlg.full; return; }
  if (dlg.choices) { choose(dlg.sel); return; }
  nextLine();
}
function closeDialog() {
  dlg.open = false; $('dialog').classList.add('hidden'); G.talkingTo = null;
  if (G.state === 'dialog') G.state = 'play';
  const fn = dlg.onDone; dlg.onDone = null;
  fn && fn();
}
$('dialog').addEventListener('click', () => { if (dlg.open && !dlg.choices) advanceDialog(); });

/* ---------------------------------------------------------------- Mellansekvenser */
let cut = null;
G.cutscene = (pos, text, dur = 2.4) => {
  const p = G.player.pos;
  const dir = new THREE.Vector3(p.x - pos.x, 0, p.z - pos.z);
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  rig.override = { pos: new THREE.Vector3(pos.x + dir.x * 8, pos.y + 3.5, pos.z + dir.z * 8), look: pos.clone(), k: 3 };
  cut = { t: dur };
  if (G.state === 'play') G.state = 'cutscene';
  if (text) toast(text, { ms: 2200 });
};
function endCutscene() { cut = null; rig.override = null; if (G.state === 'cutscene') G.state = 'play'; }

/* ---------------------------------------------------------------- Mynt, stenar, död */
G.collectCoin = pos => {
  G.visitCoins++;
  audio.play('coin', { pitch: 1 + (G.visitCoins % 5) * 0.03 });
  fx.sparkle(pos.x, pos.y, pos.z, 8);
  hudCoins(true);
  if (G.visitCoins % 20 === 0 && G.player.hp < G.player.maxHp) { G.player.heal(1); toast('+1 hjärta'); }
  const w = G.world.id;
  if (G.save.coins[w] != null && G.visitCoins > G.save.coins[w]) { G.save.coins[w] = G.visitCoins; G.dirty = true; }
  if (G.visitCoins === 100) { toast('Alla 100 mynt i världen! 🎉', { big: true }); audio.play('win'); }
};
let sg = null, sgClick = false;
$('stoneget').addEventListener('pointerdown', e => { e.preventDefault(); if (sg && sg.t > 1.6) sgClick = true; });
G.collectStone = (wid, idx, pos) => {
  const first = !G.save.stones[wid][idx];
  G.save.stones[wid][idx] = true;
  writeSave();
  hudStones(true);
  const p = G.player;
  p.victory = 99; p.vel.set(0, 0, 0); p.spinT = 0;
  const f = p.face;
  rig.override = { pos: new THREE.Vector3(p.pos.x + Math.sin(f) * 3.6, p.pos.y + 1.5, p.pos.z + Math.cos(f) * 3.6), look: new THREE.Vector3(p.pos.x, p.pos.y + 0.9, p.pos.z), k: 4 };
  G.state = 'stoneget';
  sg = { t: 0, wid, idx, first }; sgClick = false;
  const def = WORLDS[wid];
  $('sgName').textContent = def.stones[idx];
  $('sgCount').textContent = first ? `${stoneCount()} av ${TOTAL_STONES} stenar` : 'Den här stenen hade du redan';
  $('stoneget').classList.remove('hidden');
  $('sgHint').style.visibility = 'hidden';
  audio.stopMusic(); curMusic = null;
  audio.play('win'); setTimeout(() => audio.play('levelup'), 450);
  fx.burst(pos.x, pos.y, pos.z, 50, { speed: 8, color: [0x8affc8, 0xb08aff, 0x7ad8ff, 0xffffff], size: 0.5, life: 1.3 });
  G.raceText(null);
};
function endStoneGet() {
  $('stoneget').classList.add('hidden');
  G.player.victory = 0; rig.override = null;
  G.state = 'play';
  const { wid, idx, first } = sg; sg = null;
  const def = WORLDS[wid];
  music(G.world.bossActive ? 'boss' : def.music);
  if (first) {
    const n = stoneCount();
    // nya portaler?
    WORLD_ORDER.forEach(id => { const d = WORLDS[id]; if (d.need && d.need === n) setTimeout(() => toast(`Portalen till ${d.name} har öppnats!`, { big: true, ms: 3200 }), 400); });
  }
  if (def.onStone) def.onStone(G, idx, first);
}
G.onDeath = () => {
  G.deathT = 1.6;
  G.raceText(null);
  if (G.world && G.world.onDeath) G.world.onDeath(G);
};
let fallT = 0;
G.onFallOut = () => {
  if (fallT > 0 || G.player.state === 'dead') return;
  fallT = 0.6;
  $('fade').classList.add('on');
  audio.play('whoosh', { pitch: 0.5 });
};
G.onPound = (pos, dyn) => {
  G.lastPound = { pos, t: G.world.t, dyn };
  shock.spawn(pos.x, pos.y, pos.z, 2.2, 0xfff3d0, 0.35);
  for (const e of G.world.ents) {
    if (e.dead) continue;
    if (e.hit && e.top && e.p && Math.hypot(e.p.x - pos.x, e.p.z - pos.z) < 1.25 && Math.abs(pos.y - (e.p.y + 0.5)) < 0.9) e.hit(G);
    if (e.onPound) e.onPound(pos, G, dyn);
  }
};
G.onEnemyKilled = (e) => { if (G.world.onEnemyKilled) G.world.onEnemyKilled(e, G); };

/* ---------------------------------------------------------------- Världsbyte */
async function loadWorld(id, opts = {}) {
  const def = WORLDS[id];
  const menu = !!opts.menu;
  const ls = $('loading');
  const bar = ls.querySelector('.g3-loadbar > i'), txt = ls.querySelector('.g3-loadtext');
  $('loadTitle').textContent = def.name;
  if (!menu) { show(ls); bar.style.width = '10%'; txt.textContent = 'Bygger världen …'; }
  await nextFrame();
  if (G.world) { G.world.dispose(); scene.remove(G.world.group); G.world = null; }
  fx.clear(); shock.clear();
  ensurePlayer();
  // menyn kan visas innan någon resa valts: bygg byn med en tillfällig (aldrig sparad) resa
  const realSave = G.save;
  if (menu && !G.save) G.save = newSave();
  const W = new World(def, G);
  W.menu = menu;
  scene.add(W.group);
  G.world = W;
  const B = new Builder();
  const env = def.env;
  // himmel & ljus
  scene.fog = env.fog ? new THREE.Fog(env.fog, env.fogNear, env.fogFar * (0.6 + settings.q.view * 0.4)) : null;
  scene.background = new THREE.Color(env.sky.mid);
  const sky = makeSky(env.sky);
  if (env.sky.aurora === 'stones') sky.material.uniforms.aurora.value = menu ? Math.max(0.9, 0.45 + 0.85 * stoneCount() / TOTAL_STONES) : 0.45 + 0.85 * stoneCount() / TOTAL_STONES;
  W.group.add(sky); W.sky = sky;
  if (env.far) env.far.forEach(f => farRing(W.group, f));
  hemi.color.set(env.hemi[0]); hemi.groundColor.set(env.hemi[1]); hemi.intensity = env.hemi[2];
  sun.color.set(env.sun[0]); sun.intensity = env.sun[1];
  sunDir.set(...env.sunDir).normalize();
  lantern.intensity = env.lantern || 0; lantern.distance = 22;
  renderer.toneMappingExposure = env.exposure || 1;
  if (!menu) { bar.style.width = '30%'; txt.textContent = 'Planterar träd …'; await nextFrame(); }
  def.build(W, B, G, settings.q);
  if (!menu) { bar.style.width = '70%'; txt.textContent = 'Räknar kollisioner …'; await nextFrame(); }
  const fin = B.finish(W.group, settings.q.shadows);
  W.col.setStatic(fin.octree);
  W.finalize();
  if (menu) {
    G.save = realSave;
    // Ylva står i byn och tittar ut över gläntan
    const P = G.player, mp = def.menuSpot || { p: [0, 0, 0], face: 0 };
    P.reset(new THREE.Vector3(...mp.p), mp.face);
    P.pos.y = W.col.groundY(mp.p[0], mp.p[1] + 5, mp.p[2], 20);
    P.state = 'ground'; P.onGround = true; P.hp = P.maxHp;
    scene.add(P.obj); setShadows(P.obj, settings.q.shadows);
    menuT = 0;
    try { renderer.compile(scene, cam); } catch (e) { /* ignorera */ }
    return;
  }
  // placera spelaren
  const sp = opts.spawn || W.spawn;
  G.player.reset(sp, opts.face != null ? opts.face : W.spawnFace);
  if (opts.spawn) { W.respawn.copy(sp); W.respawnFace = opts.face || 0; }
  scene.add(G.player.obj);
  setShadows(G.player.obj, settings.q.shadows);
  rig.snap(G.player);
  G.visitCoins = 0; G.visitTime = 0; hudCoins(); hudHearts(); hudStones();
  $('berries').classList.add('hidden');
  G.bossBar(null); G.raceText(null); G.tip(null); G.inpBlock = false; G.deathT = 0;
  W.bossActive = false;
  bar.style.width = '100%';
  // värm upp shaders
  try { renderer.compile(scene, cam); } catch (e) { /* ignorera */ }
  await nextFrame();
  hide(ls);
  G.save.last = id; writeSave();
  music(def.music);
  banner(def.name, def.sub || '');
  if (def.onEnter) def.onEnter(G, W, opts);
}
function ensurePlayer() {
  if (G.player) return;
  G.player = new Player(G);
  G.blob = new BlobShadow(scene, 1.25);
}
G.travel = async (id, opts = {}) => {
  if (G.busy) return;
  G.busy = true;
  const prev = G.world ? G.world.id : null;
  if (prev && prev !== 'hub') submitIfAny();
  G.state = 'transition';
  $('fade').classList.add('on');
  audio.play('whoosh', { pitch: 0.6 });
  await new Promise(r => setTimeout(r, 380));
  if (id === 'hub' && prev && prev !== 'hub' && !opts.spawn) {
    const ps = WORLDS.hub.portalSpawn && WORLDS.hub.portalSpawn[prev];
    if (ps) { opts.spawn = new THREE.Vector3(...ps.p); opts.face = ps.face; }
  }
  await loadWorld(id, opts);
  $('fade').classList.remove('on');
  G.state = 'play';
  G.busy = false;
};
function submitIfAny() { const s = score(); if (s > 0) submitScore(ID, s); }

/* ---------------------------------------------------------------- Indata */
let dragLook = false;
R.canvas.addEventListener('mousedown', e => {
  if (e.button === 2 || (e.button === 1)) dragLook = true;
  if (settings.get('mouseMode') === 'lock' && G.state === 'play' && !input.locked && e.button === 0) { input.requestLock(); G._lockClick = true; }
});
addEventListener('mouseup', e => { if (e.button === 2 || e.button === 1) dragLook = false; });
addEventListener('mousemove', e => {
  if (dragLook && !input.locked && G.state === 'play') { input.look.dx += e.movementX; input.look.dy += e.movementY; }
});
addEventListener('blur', () => { dragLook = false; });
input.onLockChange(locked => { if (!locked && G.state === 'play' && settings.get('mouseMode') === 'lock') pauseGame(); });

const K = {
  jump: ['Space', 'Pad0', 'KeyJ'],
  attack: ['KeyE', 'Pad2', 'Pad3', 'KeyL'],
  crouch: ['KeyC', 'ControlLeft', 'ControlRight', 'Pad1', 'Pad4', 'Pad6'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyK', 'Pad5', 'Pad7'],
  recenter: ['KeyQ', 'KeyR', 'Pad11'],
  pause: ['Escape', 'KeyP', 'Pad9'],
  confirm: ['KeyE', 'Space', 'Enter', 'Pad0', 'Pad2', 'NumpadEnter']
};
const _f = new THREE.Vector3(), _r = new THREE.Vector3();
function readInput() {
  const I = G.inp;
  const ax = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'], { stick: 'move', comp: 'x', gpAxis: 0 });
  const ay = input.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], { stick: 'move', comp: 'y', gpAxis: 1 });
  rig.forward(_f); rig.right(_r);
  let mx = _r.x * ax - _f.x * ay, mz = _r.z * ax - _f.z * ay;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  I.mx = mx; I.mz = mz;
  I.jump = input.pressed(...K.jump); I.jumpHeld = input.down(...K.jump);
  I.crouch = input.pressed(...K.crouch); I.crouchHeld = input.down(...K.crouch);
  const click = input.mousePressed(0) && (input.locked || settings.get('mouseMode') === 'drag') && !G._lockClick;
  G._lockClick = false;
  I.attack = input.pressed(...K.attack) || click;
  I.dash = input.pressed(...K.dash);
  if (G.inpBlock) { I.mx = I.mz = 0; I.jump = I.jumpHeld = I.crouch = I.crouchHeld = I.attack = I.dash = false; }
}

/* ---------------------------------------------------------------- Uppdatering */
let lastStones = 0, saveTick = 0;
function update(dt) {
  audio.update();
  const st = G.state;
  if (st === 'menu' || st === 'transition' || st === 'pause') { input.endFrame(); return; }
  if (input.pressed(...K.pause) && (st === 'play' || st === 'dialog' || st === 'cutscene')) { if (st === 'play') pauseGame(); input.endFrame(); return; }
  if (st === 'dialog') {
    if (dlg.open) {
      if (dlg.choices) {
        const ax = input.pressed('KeyA', 'ArrowLeft', 'Pad14', 'KeyW', 'ArrowUp') ? -1 : input.pressed('KeyD', 'ArrowRight', 'Pad15', 'KeyS', 'ArrowDown') ? 1 : 0;
        if (ax) { dlg.sel = (dlg.sel + ax + dlg.choices.length) % dlg.choices.length; [...$('dchoices').children].forEach((b, i) => b.classList.toggle('sel', i === dlg.sel)); audio.play('hover'); }
      }
      if (input.pressed(...K.confirm) || input.mousePressed(0)) advanceDialog();
      dlg.shown = Math.min(dlg.full.length, dlg.shown + dt * 70);
      $('dtext').textContent = dlg.full.slice(0, Math.floor(dlg.shown));
    }
    G.world.frameIdle && G.world.frameIdle(dt);
    input.endFrame(); return;
  }
  if (st === 'cutscene') {
    if (cut) { cut.t -= dt; if (cut.t <= 0) endCutscene(); }
    rig.update(dt, G.player, G.col, { dx: 0, dy: 0 }, 0);
    input.endFrame(); return;
  }
  if (st === 'stoneget') {
    sg.t += dt;
    if (sg.t > 1.6) $('sgHint').style.visibility = 'visible';
    if ((sg.t > 1.6 && (input.pressed(...K.confirm) || input.mousePressed(0) || sgClick)) || sg.t > 6) { sgClick = false; endStoneGet(); input.endFrame(); return; }
    if (Math.random() < 0.5) { const p = G.player.pos; fx.emit(p.x + (Math.random() - 0.5) * 3, p.y + Math.random() * 3, p.z + (Math.random() - 0.5) * 3, { vy: 1, life: 1, size: 0.3, size1: 0, color: Math.random() < 0.5 ? 0x8affc8 : 0xc0a0ff }); }
    G.player.update(dt, G.inp);
    rig.update(dt, G.player, G.col, { dx: 0, dy: 0 }, 0);
    input.endFrame(); return;
  }
  // ---- spelande
  readInput();
  const p = G.player;
  G.save.time += dt; G.visitTime += dt;
  // interaktion
  if (G.inp.attack && G.promptEnt && p.onGround && p.state !== 'dead') {
    const e = G.promptEnt; G.inp.attack = false; G.promptEnt = null;
    p.vel.x = p.vel.z = 0;
    e.interact(G);
    input.endFrame(); return;
  }
  G.promptEnt = null;
  G.world.update(dt, G);
  if (G.state !== 'play') { input.endFrame(); return; }
  p.update(dt, G.inp);
  shock.update(dt, p, src => p.damage(src));
  // död/fall
  if (G.deathT > 0) {
    G.deathT -= dt;
    if (G.deathT < 0.5) $('fade').classList.add('on');
    if (G.deathT <= 0) respawnAfterDeath();
  }
  if (fallT > 0) {
    fallT -= dt;
    if (fallT <= 0) {
      const W = G.world;
      if (p.state !== 'dead') {
        p.hp -= 1; hudHearts();
        if (p.hp <= 0) { p.hp = 1; p.die(); }
        else {
          const safe = p.lastSafe.y > W.killY + 2 ? p.lastSafe : W.respawn;
          const hp = p.hp; p.reset(safe, p.face); p.hp = hp; p.invuln = 1.5; rig.snap(p);
          hudHearts();
        }
      }
      $('fade').classList.remove('on');
    }
  }
  // kamera
  if (input.pressed(...K.recenter)) rig.recenter(p);
  const ld = input.lookDelta();
  const cs = settings.get('camSpeed') || 1;
  if (input.pressed('Pad12')) input.wheel -= 1;
  if (input.pressed('Pad13')) input.wheel += 1;
  rig.update(dt, p, G.col, { dx: ld.dx * cs, dy: ld.dy * cs }, input.wheel);
  if (G.world.def.tick) G.world.def.tick(G, dt);
  saveTick += dt;
  if (saveTick > 10) { saveTick = 0; if (G.dirty) { G.dirty = false; writeSave(); } }
  input.endFrame();
}
function respawnAfterDeath() {
  const W = G.world, p = G.player;
  const lost = G.visitCoins;
  W.resetVisit();
  G.visitCoins = 0; hudCoins();
  p.reset(W.respawn, W.respawnFace);
  rig.snap(p);
  $('berries').classList.add('hidden');
  W.berryCount = 0; W.berries.forEach(b => b.reset());
  if (W.onBerriesReset) W.onBerriesReset(G);
  hudHearts();
  $('fade').classList.remove('on');
  if (W.bossActive) { W.bossActive = false; G.bossBar(null); }
  music(W.def.music);
  if (lost > 0) toast(`Ylva tappade ${lost} mynt – de ligger kvar i världen`);
  else toast('Försök igen!');
}

/* ---------------------------------------------------------------- Rendering */
let tAcc = 0;
let fdtAvg = 1 / 60;
function render(alpha, fdt) {
  tAcc += fdt;
  // anpassa fysiksteget till skärmens uppdateringsfrekvens (60/120 Hz) för jämn rörelse
  if (fdt > 0 && fdt < 0.05) { fdtAvg += (fdt - fdtAvg) * 0.02; const want = fdtAvg < 0.0105 ? 1 / 120 : 1 / 60; if (loop.step !== want && (fdtAvg < 0.0095 || fdtAvg > 0.0125)) loop.step = want; }
  root.classList.toggle('inmenu', G.state === 'menu');
  const p = G.player;
  if (G.world) {
    G.world.frame(fdt, tAcc, G);
    stoneTick(tAcc);
    p.animate(fdt, tAcc);
    if (G.world.menu) menuFrame(fdt);
    if (G.blob) {
      const h = G.blob.update(G.col, p.pos, 40);
      G.blob.mesh.visible = !!h && p.state !== 'dead' && p.obj.visible !== undefined;
    }
    // sol & skugga följer spelaren
    sun.position.set(p.pos.x + sunDir.x * 60, p.pos.y + sunDir.y * 60, p.pos.z + sunDir.z * 60);
    sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);
    lantern.position.set(p.pos.x - Math.sin(rig.yaw) * -1.5, p.pos.y + 4, p.pos.z - Math.cos(rig.yaw) * -1.5);
    // prompt
    const pr = $('prompt');
    if (G.promptEnt && G.state === 'play' && p.onGround) { pr.classList.remove('hidden'); $('promptText').textContent = G.promptText; $('promptKey').textContent = isTouchDevice() ? 'Snurr' : (input.gamepad != null ? 'X' : 'E'); }
    else pr.classList.add('hidden');
    if (G.state === 'play' || G.state === 'dialog') $('time').textContent = fmtTime(G.visitTime);
  }
  fx.update(fdt);
  if (bannerT > 0) { bannerT -= fdt; if (bannerT <= 0) $('banner').classList.remove('on'); }
  if (bigT > 0) { bigT -= fdt; if (bigT <= 0) $('big').classList.add('hidden'); }
  if (composer) composer.render(fdt); else renderer.render(scene, cam);
}

const loop = new Loop({ update, render });
fpsMeter(root, loop, settings);

/* ---------------------------------------------------------------- Menyer */
let screenStack = [];
function openScreen(id) { const cur = ['menu', 'slots', 'help', 'settings', 'pause', 'confirm', 'ending'].find(s => !$(s).classList.contains('hidden')); if (cur) { screenStack.push(cur); hide(cur); } show(id); audio.play('click'); }
function backScreen() { const cur = ['slots', 'help', 'settings', 'confirm'].find(s => !$(s).classList.contains('hidden')); if (cur) hide(cur); const prev = screenStack.pop() || 'menu'; show(prev); audio.play('click'); }
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', backScreen));
$('btnPlay').onclick = () => { renderSlots(); openScreen('slots'); };
$('btnHelp').onclick = () => openScreen('help');
$('btnSet').onclick = () => { buildSet(); openScreen('settings'); };
$('btnPHelp').onclick = () => openScreen('help');
$('btnPSet').onclick = () => { buildSet(); openScreen('settings'); };
$('helpTabs').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  [...$('helpTabs').children].forEach(b => b.classList.toggle('on', b === t));
  ['hKeys', 'hPad', 'hTouch', 'hMoves'].forEach(id => $(id).classList.toggle('hidden', id !== t.dataset.tab));
});
function buildSet() {
  buildSettings($('setBox'), settings, [
    { key: 'mouseMode', label: 'Muskamera', type: 'select', options: [['drag', 'Dra med höger musknapp'], ['lock', 'Pekarlås (klicka i spelet)']] },
    { key: 'camSpeed', label: 'Kamerahastighet', type: 'range', min: 0.4, max: 2, step: 0.05, format: v => (+v).toFixed(2) }
  ]);
}
function confirmBox(title, text, yes) {
  $('confirmTitle').textContent = title; $('confirmText').textContent = text;
  $('confirmYes').onclick = () => { backScreen(); yes(); };
  $('confirmNo').onclick = backScreen;
  openScreen('confirm');
}
function renderSlots() {
  const list = $('slotList'); list.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = loadSlot(i);
    const d = document.createElement('div'); d.className = 'ra-slot';
    const h = document.createElement('h3'); h.textContent = `Resa ${i + 1}`; d.appendChild(h);
    const m = document.createElement('div'); m.className = 'meta';
    if (s) m.innerHTML = `<b>${stoneCount(s)}</b> av ${TOTAL_STONES} stenar<br><b>${coinScore(s)}</b> mynt (bästa per värld)<br>Speltid <b>${fmtTime(s.time)}</b><br>Poäng <b>${score(s).toLocaleString('sv-SE')}</b>${s.done ? '<br>⭐ Korpen besegrad' : ''}`;
    else m.textContent = 'Tom sparplats';
    d.appendChild(m);
    const row = document.createElement('div'); row.className = 'row';
    const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = s ? 'Fortsätt' : 'Ny resa';
    b.onclick = () => startGame(i);
    row.appendChild(b);
    if (s) { const del = document.createElement('button'); del.className = 'btn small'; del.textContent = 'Radera'; del.onclick = () => confirmBox('Radera resa?', `Resa ${i + 1} med ${stoneCount(s)} stenar raderas för alltid.`, () => { localStorage.removeItem('spelhallen:' + SLOT_KEY(i)); renderSlots(); }); row.appendChild(del); }
    d.appendChild(row);
    list.appendChild(d);
  }
}
async function startGame(i) {
  while (menuLoading) await nextFrame();
  G.slot = i;
  G.save = loadSlot(i) || newSave();
  writeSave();
  ['slots', 'menu'].forEach(hide); screenStack = [];
  ensurePlayer();
  G.player.maxHp = 5;
  lastStones = stoneCount();
  await G.travel(G.save.last && WORLDS[G.save.last] ? G.save.last : 'hub');
  setTouch();
  addEventListener('beforeunload', beforeUnload);
}
// sparningen sker direkt (localStorage) – ingen "Vill du lämna sidan?"-ruta behövs
function beforeUnload() { if (G.state !== 'menu') writeSave(); }

/* ---------------------------------------------------------------- Paus & karta */
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  loop.setPaused(true);
  input.exitLock();
  writeSave();
  renderPause();
  show('pause');
  audio.play('click');
}
function resumeGame() {
  hide('pause'); screenStack = [];
  G.state = 'play';
  loop.setPaused(false);
  input.clear();
  if (settings.get('mouseMode') === 'lock') input.requestLock();
}
function renderPause() {
  const map = $('map'); map.innerHTML = '';
  const n = stoneCount();
  WORLD_ORDER.forEach(id => {
    const d = WORLDS[id];
    const open = n >= (d.need || 0);
    const b = document.createElement('button'); b.className = 'ra-world' + (G.world && G.world.id === id ? ' cur' : '');
    b.disabled = !open || (G.world && G.world.id === id);
    const got = G.save.stones[id];
    b.innerHTML = `<span class="ic" style="background:${d.color}">${d.icon}</span><span><span class="nm"></span><br><span class="sub"></span></span><span class="gems">${got.map(g => `<i class="${g ? 'on' : ''}"></i>`).join('')}</span>`;
    b.querySelector('.nm').textContent = d.name;
    b.querySelector('.sub').textContent = open ? (id === 'hub' ? 'Byn i gläntan' : `Mynt: ${G.save.coins[id]}/100`) : `Kräver ${d.need} stenar`;
    b.onclick = () => { hide('pause'); loop.setPaused(false); G.state = 'play'; G.travel(id); };
    map.appendChild(b);
  });
  const W = G.world;
  $('pauseStats').innerHTML = `Stenar: <b>${n}</b> / ${TOTAL_STONES}<br>Mynt i världen: <b>${G.visitCoins}</b>${W.id !== 'hub' ? ` (bästa ${G.save.coins[W.id]})` : ''}<br>Tid i världen: <b>${fmtTime(G.visitTime)}</b> · Total: <b>${fmtTime(G.save.time)}</b><br>Poäng: <b>${score().toLocaleString('sv-SE')}</b>`;
  const ms = $('missions'); ms.innerHTML = '';
  W.def.stones.forEach((name, i) => { const r = document.createElement('div'); if (G.save.stones[W.id][i]) r.className = 'on'; r.innerHTML = '<i></i><span></span>'; r.querySelector('span').textContent = name; ms.appendChild(r); });
  $('btnLeave').classList.toggle('hidden', W.id === 'hub');
}
$('btnResume').onclick = resumeGame;
$('btnLeave').onclick = () => { hide('pause'); loop.setPaused(false); G.state = 'play'; G.travel('hub'); };
$('btnQuit').onclick = () => {
  writeSave(); submitIfAny();
  hide('pause'); loop.setPaused(false);
  toMenu();
};
$('pauseBtn').onclick = () => { if (G.state === 'play') pauseGame(); else if (G.state === 'pause') resumeGame(); };
function toMenu() {
  G.state = 'menu';
  removeEventListener('beforeunload', beforeUnload);
  rig.override = null; cut = null;
  ['hearts'].forEach(id => { $(id).innerHTML = ''; });
  $('best').textContent = bestScore(ID).toLocaleString('sv-SE');
  $('dialog').classList.add('hidden'); dlg.open = false;
  G.bossBar(null); G.raceText(null); G.tip(null);
  G.save = null; G.slot = null;
  music('hub');
  menuScene();
  show('menu');
}
addEventListener('keydown', e => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && G.state === 'pause' && $('settings').classList.contains('hidden') && $('help').classList.contains('hidden')) { e.preventDefault(); resumeGame(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
addEventListener('blur', () => pauseGame());
// handkontroll: Start i pausmenyn
setInterval(() => {
  if (G.state !== 'pause' || input.gamepad == null) return;
  const gp = navigator.getGamepads && navigator.getGamepads()[input.gamepad];
  if (!gp) return;
  const s = gp.buttons[9] && gp.buttons[9].pressed;
  if (s && !G._padStart) resumeGame();
  G._padStart = s;
}, 60);

/* ---------------------------------------------------------------- Slutscen */
G.ending = () => {
  G.save.done = true; writeSave(); submitIfAny();
  G.state = 'pause'; loop.setPaused(true);
  $('endText').textContent = 'Korpen Kaos är besegrad och Norrskensstenarna lyser åter över Rävlyan. Ylva är byns hjälte!';
  $('endStats').innerHTML = `Stenar: <b>${stoneCount()}</b> / ${TOTAL_STONES}<br>Mynt: <b>${coinScore()}</b><br>Speltid: <b>${fmtTime(G.save.time)}</b><br>Poäng: <b>${score().toLocaleString('sv-SE')}</b>`;
  show('ending');
  audio.music('victory'); curMusic = 'ending';
};
$('btnEndCont').onclick = () => { hide('ending'); loop.setPaused(false); G.state = 'play'; G.travel('hub'); };
$('btnEndMenu').onclick = () => { hide('ending'); loop.setPaused(false); toMenu(); };

/* ---------------------------------------------------------------- Pekkontroller */
function setTouch() {
  input.setupTouch($('touch'), {
    sticks: [{ name: 'move', side: 'left' }],
    lookSide: 'right',
    buttons: [
      { code: 'Space', label: 'Hoppa', right: 24, bottom: 34, size: 84 },
      { code: 'KeyE', label: 'Snurr', right: 122, bottom: 26, size: 66 },
      { code: 'KeyC', label: 'Huka', right: 30, bottom: 134, size: 62 },
      { code: 'ShiftLeft', label: 'Rusa', right: 112, bottom: 110, size: 58 },
      { code: 'KeyQ', label: 'Kamera', right: 190, bottom: 30, size: 52 }
    ]
  });
}

/* ---------------------------------------------------------------- Meny-bakgrund: byn i skymningen med långsam kamerasvep */
let menuT = 0, menuLoading = false;
async function menuScene() {
  if (menuLoading || (G.world && G.world.menu)) return;
  menuLoading = true;
  try { await loadWorld('hub', { menu: true }); } finally { menuLoading = false; }
}
const _mLook = new THREE.Vector3();
function menuFrame(dt) {
  menuT += dt;
  const W = G.world, ms = W.def.menuCam || { c: [0, 0, 6], r: 30, h: 11, look: [0, 3, 0] };
  const a = 0.6 + menuT * 0.045;
  cam.position.set(ms.c[0] + Math.sin(a) * ms.r, ms.h + Math.sin(menuT * 0.17) * 1.5, ms.c[2] + Math.cos(a) * ms.r);
  _mLook.set(ms.look[0] + Math.sin(menuT * 0.11) * 2, ms.look[1], ms.look[2]);
  cam.lookAt(_mLook);
  // figurerna i byn lever lite
  for (const e of W.ents) if (e.rig && e.talk !== undefined && e.update) e.update(dt, G);
  G.promptEnt = null;
}
// menymusiken startar först efter första klick/tangent (webbläsarens ljudregler)
const menuMusic = () => { if (G.state === 'menu' && G.world && G.world.menu) music('hub'); removeEventListener('pointerdown', menuMusic); removeEventListener('keydown', menuMusic); };
addEventListener('pointerdown', menuMusic); addEventListener('keydown', menuMusic);

menuScene();
$('best').textContent = bestScore(ID).toLocaleString('sv-SE');
loop.start();
// för test
window.__ra = { G, loop, input, WORLDS, startGame, toMenu, renderer };
