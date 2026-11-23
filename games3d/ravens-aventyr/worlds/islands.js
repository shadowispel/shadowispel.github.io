/* Skärgårdsöarna – hav, båtar, studsande sjöstjärnor, fyrtorn, sjunket skepp och Krabbkungen Klabbe. */
import * as THREE from 'three';
import { makeNoise, terrain, makeWater, makeClouds, GEO } from '../core.js';
import { V3, glow, toon, addGrass } from './common.js';
import { enemy } from '../enemies.js';
import { Race } from '../race.js';
import { Klabbe } from '../bosses.js';
import { Clam } from '../missions.js';
import { P, outline } from '../models.js';

const N = makeNoise(55);
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ISL = [
  { x: 0, z: 45, r: 18, top: 2.2 }, { x: -40, z: -25, r: 13, top: 3 }, { x: 45, z: -40, r: 19, top: 1.5 },
  { x: 35, z: 20, r: 6, top: 1.6 }, { x: -35, z: 25, r: 7, top: 1.8 }, { x: 10, z: -10, r: 5, top: 1.2 }, { x: -10, z: -50, r: 6, top: 1.6 }
];
function H(x, z) {
  let h = -7 + (N(x * 0.05, z * 0.05) - 0.5) * 2.5;
  for (const s of ISL) {
    const d = Math.hypot(x - s.x, z - s.z);
    const k = ss(s.r + 8, s.r - 3, d);
    const top = s.top + (N(x * 0.2, z * 0.2) - 0.5) * 0.4 * (s === ISL[2] ? 0 : 1);
    h = Math.max(h, h * (1 - k) + top * k);
  }
  const rr = Math.hypot(x, z);
  if (rr > 88) h = Math.max(h, -7 + ((rr - 88) / 5) ** 2 * 6);
  return h;
}
function palm(B, x, y, z, s = 1, lean = 0.3) {
  let px = x, py = y, pz = z;
  for (let i = 0; i < 5; i++) { const nx = px + lean * 0.5 * s, ny = py + 1.1 * s; B.cyl((px + nx) / 2, ny, (pz + pz) / 2, (0.32 - i * 0.03) * s, 1.15 * s, { color: i % 2 ? 0x9a7048 : 0x8a6038, seg: 8, rot: [0, 0, -lean * 0.4], tag: 'nocam' }); px = nx; py = ny; }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.box(px + Math.cos(a) * 1.3 * s, py + 0.1, pz + Math.sin(a) * 1.3 * s, 2.8 * s, 0.12, 0.8 * s, { ry: -a, rot: [0, -a, 0.35], color: i % 2 ? 0x3faa4a : 0x4fc05a, collide: i % 2 === 0, tag: 'nocam' }); }
  B.sphere(px, py - 0.2, pz, 0.35 * s, 0.35 * s, 0.35 * s, { color: 0x6a4a2a, collide: false });
  return [px, py, pz];
}

export default {
  id: 'islands', name: 'Skärgårdsöarna', sub: 'Värld 4', icon: '🏝️', color: '#2ab0a0', need: 14, music: 'islands',
  stones: ['Fyrtornets lykta', 'Krabbkungen Klabbe', 'Pärldykning med Uttern Otto', 'Simtävling med Sälen Saga', 'Fyrlyktornas gåta', 'Det sjunkna skeppet'],
  env: {
    sky: { top: 0x1670e0, mid: 0x5ec4ff, hor: 0xfff2dc, bot: 0x2a7ab0, sunDir: [0.4, 0.35, 0.6], sunCol: 0xfff0c0, haze: 1.3 },
    fog: 0xbfe8f8, fogNear: 70, fogFar: 210,
    hemi: [0xe8f8ff, 0x6a9aa0, 1.2], sun: [0xfff4d8, 2.4], sunDir: [0.4, 1, 0.5], exposure: 0.95
  },
  build(W, B, G, q) {
    W.setSpawn(0, H(0, 54) + 0.3, 54, Math.PI);
    W.killY = -30;
    terrain(B, { size: 200, res: 100, height: H, color: (x, y, z, sl, c) => {
      if (y < -2) return c.setRGB(0.75, 0.7, 0.5);
      if (y < 1.2) return c.set(0xf0dca0);
      if (sl > 0.45) return c.set(0xb09870);
      const n = N(x * 0.3, z * 0.3);
      return c.setRGB(0.26 + n * 0.1, 0.58 + n * 0.1, 0.2);
    } });
    W.water(0);
    const sea = makeWater(230, 230, { deep: 0x1a7ab8, shallow: 0x40d0e0, amp: 0.25, opacity: 0.78 });
    sea.position.set(0, 0, 0); W.group.add(sea);
    // korallrev & tång
    for (let i = 0; i < 60; i++) { const a = i * 2.39996, r = 12 + (i * 23 % 70); const x = Math.cos(a) * r, z = Math.sin(a) * r; const y = H(x, z); if (y > -2.5) continue; if (i % 3) B.sphere(x, y + 0.3, z, 0.6 + (i % 3) * 0.3, 0.5, 0.6, { color: [0xff7a9a, 0xffa060, 0xb08aff][i % 3], geo: GEO.ico, collide: false }); else B.cone(x, y, z, 0.25, 2 + (i % 3), { color: 0x3a9a5a, collide: false }); }

    // --- huvudön
    const MI = ISL[0];
    W.sign(-3, H(-3, 50), 50, Math.PI + 0.5, ['Skärgårdsöarna', 'Simma mellan öarna eller åk båt. Krabbor: snurra först, sedan hoppa! Sjöstjärnor studsar dig högt.'], 'Skylt');
    W.checkpoint(4, H(4, 40), 40, Math.PI);
    const p1 = palm(B, -8, H(-8, 48), 48, 1.1, 0.4); palm(B, 9, H(9, 52), 52, 1, -0.3); palm(B, -12, H(-12, 38), 38, 0.9, 0.2);
    W.spring(-5, H(-5, 46), 46, 19, 'starfish', 1);
    W.coin(p1[0], p1[1] + 1.2, p1[2]);
    W.coinRing(MI.x, MI.top + 1, MI.z, 9, 10);
    enemy(W, 'krabba', 8, H(8, 38), 38, { radius: 6 });
    enemy(W, 'mas', 0, 3, 40, { radius: 8, height: 4 });
    // hus på stolpar
    B.box(12, 3.8, 44, 5, 3, 4, { mat: 'planks', color: 0x5a9ad0 });
    B.ramp(12, 5.6, 46.5, 12, 5.6, 41.5, 6.4, 0.3, { mat: 'roof', color: 0xffffff });
    for (const [dx, dz] of [[-2.2, -1.7], [2.2, -1.7], [-2.2, 1.7], [2.2, 1.7]]) B.cyl(12 + dx, 2.3, 44 + dz, 0.2, 2.6, { color: 0x6a4a30, seg: 6 });
    // brygga norrut med fyrlyktspusslet
    B.plat(0, 1.2, 21, 3, 16, 0.4, { mat: 'planks', color: 0xc89a60 });
    for (let z = 14; z <= 28; z += 3.5) for (const sx of [-1.4, 1.4]) B.cyl(sx, 1.2, z, 0.2, 9, { color: 0x6a4a30, seg: 6 });
    B.plat(0, 1.2, 9, 12, 8, 0.4, { mat: 'planks', color: 0xc89a60 });
    for (const [x, z] of [[-5.8, 5.2], [5.8, 5.2], [-5.8, 12.8], [5.8, 12.8]]) B.cyl(x, 1.2, z, 0.25, 9, { color: 0x6a4a30, seg: 6 });
    W.coinLine([0, 2.3, 27], [0, 2.3, 15], 5);
    // lyktor + knappar
    const lamps = [];
    let state = [1, 0, 1, 1], solved = G.hasStone('islands', 4);
    const LXs = [-4.2, -1.4, 1.4, 4.2];
    LXs.forEach((x, i) => {
      B.cyl(x, 3.6, 6, 0.12, 2.4, { color: 0x333344, seg: 6 });
      const m = new THREE.MeshToonMaterial({ color: 0x555566, emissive: 0x000000 });
      const lamp = new THREE.Mesh(GEO.sph, m); lamp.scale.setScalar(0.45); lamp.position.set(x, 4, 6); lamp.userData.sharedGeo = true; lamp.userData.disposeMat = [m];
      W.group.add(lamp);
      const gl = glow(0xffe080, 3, 0); gl.position.copy(lamp.position); W.group.add(gl);
      lamps.push({ m, gl });
      W.button(x, 1.2, 10, (b, g) => {
        if (solved) return;
        [i - 1, i, i + 1].forEach(k => { if (k >= 0 && k < 4) state[k] ^= 1; });
        paint(); g.audio.play('select', { pitch: 1 + i * 0.15 });
        if (state.every(v => v)) { solved = true; g.audio.play('levelup'); W.revealStone(4); }
      }, { timed: 0.8, color: 0x3a8ae0, onColor: 0x80c0ff, onTimeout: () => {} });
    });
    const paint = () => lamps.forEach((l, i) => { const on = solved || state[i]; l.m.color.setHex(on ? 0xfff0a0 : 0x555566); l.m.emissive.setHex(on ? 0xa08020 : 0); l.gl.material.opacity = on ? 0.6 : 0; });
    paint();
    W.add({ update() {}, resetVisit() { if (!solved) { state = [1, 0, 1, 1]; paint(); } } });
    W.stone(4, 0, 2.8, 11.5, { hidden: true });
    W.npc('sal', 3.5, 1.2, 11.8, Math.PI, 'Fyrvaktaren Fia', () => solved ? ['Alla lyktor lyser – nu hittar båtarna hem!'] : ['Mina fyra lyktor ska lysa allihop, men knapparna är krångliga.', 'Varje knapp tänder eller släcker sin egen lykta OCH grannarnas. Gör markstöt på knapparna!']);

    // --- båtar
    const boatGeo = () => { const g = new THREE.BoxGeometry(3.2, 0.7, 6); return g; };
    const decorBoat = (r) => { const m = P(r, 'cyl', 0x8a6040, [0, 2, 0], [0.1, 3.4, 0.1]); void m; const s = P(r, 'box', 0xf8f4e8, [0, 2.4, 0.6], [0.06, 2.2, 1.8]); s.userData.noOutline = true; P(r, 'box', 0xd04a3a, [0, -0.3, 0], [3.3, 0.3, 6.1]); };
    W.platform({ geo: boatGeo(), color: 0xc8a070, mat: 'planks', path: [[6, 0.2, 14], [36, 0.2, -12]], speed: 5, wait: 2.5, decor: decorBoat, ry: 2.28 });
    W.platform({ geo: boatGeo(), color: 0xc8a070, mat: 'planks', path: [[-8, 0.2, 18], [-30, 0.2, -4]], speed: 4.5, wait: 2.5, decor: decorBoat, ry: -2.36 });
    W.platform({ geo: boatGeo(), color: 0xc8a070, mat: 'planks', path: [[-27, 0.2, -40], [-17, 0.2, -45]], speed: 3.5, wait: 2, decor: decorBoat, ry: 2.03 });

    // --- fyrön
    const FI = ISL[1];
    const FX = FI.x, FZ = FI.z, FY = H(FX, FZ);
    for (let i = 0; i < 8; i++) B.cyl(FX, FY + (i + 1) * 3, FZ, 3.3 - i * 0.12, 3, { color: i % 2 ? 0xffffff : 0xd83a3a, seg: 16 });
    B.cyl(FX, FY + 10, FZ, 5.2, 0.4, { mat: 'planks', color: 0xc89a60 });
    B.cyl(FX, FY + 25, FZ, 4.2, 0.5, { color: 0x444455 });
    B.cyl(FX, FY + 27, FZ, 2.4, 2, { mat: 'glow', color: 0xfff0a0, collide: false });
    B.cone(FX, FY + 27, FZ, 3, 2, { color: 0xd83a3a });
    const beam = glow(0xfff0b0, 12, 0.5); beam.position.set(FX, FY + 26, FZ); W.group.add(beam);
    for (let i = 0; i < 6; i++) { const a = i * 0.9 + 0.4; B.box(FX + Math.cos(a) * 7, FY + 0.8 + i * 1.5, FZ + Math.sin(a) * 7, 2.4, 0.6, 2.4, { mat: 'planks', color: 0xc89a60, ry: a }); W.coin(FX + Math.cos(a) * 7, FY + 2 + i * 1.5, FZ + Math.sin(a) * 7); }
    B.box(FX, FY + 18.1, FZ + 4.0, 2.6, 16, 0.6, { mat: 'vine', tag: 'climb' });
    // utsikt (ytterkant för klättring)
    W.stone(0, FX - 3.3, FY + 26.5, FZ);
    W.coinRing(FX, FY + 26, FZ, 3.4, 6);
    W.checkpoint(FX + 6, H(FX + 6, FZ + 8), FZ + 8, 0.8);
    W.coin(FX - 5, FY + 11.3, FZ);
    enemy(W, 'krabba', FX - 6, H(FX - 6, FZ + 7), FZ + 7, { radius: 5 });
    enemy(W, 'mas', FX, 6, FZ, { radius: 10, height: 6 });

    // --- småöar
    const I3 = ISL[3], I4 = ISL[4], I5 = ISL[5], I6 = ISL[6];
    const p3 = palm(B, I3.x, H(I3.x, I3.z), I3.z, 1.2, 0.3);
    W.spring(I3.x + 2.5, H(I3.x + 2.5, I3.z + 2), I3.z + 2, 20, 'starfish', 1);
    W.coin(p3[0], p3[1] + 1.2, p3[2]);
    W.coinRing(I3.x, I3.top + 1, I3.z, 4, 6);
    enemy(W, 'krabba', I3.x - 2, H(I3.x - 2, I3.z), I3.z, { radius: 3 });
    palm(B, I4.x, H(I4.x, I4.z), I4.z, 1, -0.4);
    W.coinRing(I4.x, I4.top + 1, I4.z, 4.5, 6);
    W.crate(I4.x + 2, H(I4.x + 2, I4.z - 2), I4.z - 2, 3);
    W.heart(I4.x - 2, H(I4.x - 2, I4.z + 2) + 0.8, I4.z + 2);
    enemy(W, 'mas', I4.x, 3, I4.z, { radius: 6, height: 4 });
    W.coinRing(I5.x, I5.top + 1, I5.z, 3, 5);
    W.spring(I5.x, H(I5.x, I5.z), I5.z, 24, 'starfish', 1.1);
    W.coin(I5.x, 13, I5.z); W.coin(I5.x, 9, I5.z); W.coin(I5.x, 11, I5.z);
    palm(B, I6.x, H(I6.x, I6.z), I6.z, 1, 0.2);
    W.crate(I6.x + 2, H(I6.x + 2, I6.z), I6.z, 3);
    W.coin(I6.x - 2.5, H(I6.x - 2.5, I6.z + 2) + 1.2, I6.z + 2);
    enemy(W, 'krabba', I6.x, H(I6.x, I6.z - 2), I6.z - 2, { radius: 3 });

    // --- sjunket skepp (hemligt)
    const SX = -15, SZ = -15, SY = H(SX, SZ);
    B.box(SX, SY + 1.2, SZ, 4, 2.4, 10, { mat: 'planks', color: 0x6a5a48, rot: [0.1, 0.5, 0.25] });
    B.box(SX + 1.5, SY + 3.5, SZ - 1, 0.3, 6, 0.3, { color: 0x5a4a38, rot: [0.5, 0, 0.6], collide: false });
    W.stone(5, SX, SY + 3.2, SZ);
    W.coinRing(SX, SY + 4.4, SZ, 4.8, 6);
    const shimmer = glow(0x8affc8, 5, 0.35); shimmer.position.set(SX, SY + 3, SZ); W.group.add(shimmer);
    W.coin(SX + 5, SY + 1, SZ + 4);

    // --- bossön
    const KI = ISL[2];
    W.checkpoint(KI.x - 14, KI.top, KI.z + 16, -2.4);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; B.rock(KI.x + Math.cos(a) * 17.5, KI.top, KI.z + Math.sin(a) * 17.5, 1.2 + (i % 3) * 0.4, { flat: 0.8, color: 0xc0b090 }); }
    W.stone(1, KI.x, KI.top + 1.6, KI.z, { hidden: true });
    new Klabbe(W, new V3(KI.x, KI.top, KI.z), { arenaR: 16, stone: 1 });

    // --- simtävlingen
    const buoys = [[25, 0, 0], [0, 0, -25], [-25, 0, 0]];
    buoys.forEach(([x, , z]) => W.platform({ shape: 'cyl', size: [1.6, 1.4, 1.6], color: 0xe04a3a, pos: [x, 0.2, z], bob: [0.25, 2, x], decor: r => { P(r, 'cyl', 0xffffff, [0, 0.4, 0], [0.82, 0.3, 0.82]); P(r, 'cone', 0xe04a3a, [0, 0.9, 0], [0.4, 0.7, 0.4]); } }));
    const saga = W.npc('sal', 5, H(5, 31.5), 31.5, Math.PI / 2, 'Sälen Saga', null, { mark: true });
    const race = new Race(W, saga, [[6, 0, 31], [25, 0, 3], [0, 0, -22], [-23, 0, 0], [-6, 0, 30]], {
      speed: 5.4, gates: [1, 2, 3], stone: 3, finishR: 4, water: 0, finishRy: 1.2, gateR: 6,
      goal: 'Simma runt de tre bojarna och tillbaka till stranden!',
      loseLine: 'Plask! Sälar simmar snabbt. Du kan hoppa på båtar och öar för att genskjuta!',
      onWin: g => { saga.marker.visible = false; g.dialog('Sälen Saga', ['Imponerande, för att vara en räv! Här – den här låg på havsbotten.'], saga, () => W.revealStone(3)); }
    });
    W.stone(3, -6, H(-6, 30) + 1.6, 31, { hidden: true });
    saga.talk = g => [g.hasStone('islands', 3) ? 'En simtur till?' : 'Hej! Jag är snabbast i hela skärgården. Simma runt de tre bojarna före mig, så får du en sten!', { text: 'Tävla mot Saga?', choices: [['Ja!', () => race.start(g)], ['Nej', null]] }];

    // --- övrigt
    W.coin(40, 4, -22);
    B.plat(40, 2.6, -22, 2.4, 2.4, 9, { mat: 'noise', color: 0xb09870 });
    W.spring(38, 0.1, -19.5, 12, 'starfish', 0.8);
    // --- Pärldykning: fem musslor på havsbotten öppnar och stänger sig – ta pärlan när musslan är öppen
    let pearls = 0;
    const clamSpots = [[-30, 50], [30, 53], [-21, 21], [23, 26], [-3, 76]];
    clamSpots.forEach(([x, z], i) => new Clam(W, new V3(x, H(x, z) - 0.08, z), { phase: i * 0.37, ry: i * 1.3, color: [0xc89ad8, 0xf0a0b8, 0x9ab8e8, 0xe8c08a, 0xb8e0c0][i], onGet: g => {
      pearls++; g.hud.berries(pearls, clamSpots.length, 'parla');
      if (pearls === clamSpots.length) { g.toast('Alla fem pärlorna! Simma tillbaka till Uttern Otto.', { ms: 2800 }); otto.marker.visible = true; }
    } }));
    const otto = W.npc('utter', -0.6, 1.2, 26.5, Math.PI * 0.9, 'Uttern Otto', g => g.hasStone('islands', 2) ? ['Mina pärlor glittrar så fint i solen. Tack, Ylva!'] : pearls >= clamSpots.length ? [{ text: 'Fem pärlor! Du dyker som en riktig utter.', choices: null }, () => { otto.marker.visible = false; setTimeout(() => W.revealStone(2), 300); return 'Korpen tappade den här stenen när han flög över bryggan. Den är din!'; }] : [
      'Hej räv! Jag samlar pärlor. Fem musslor ligger på havsbotten runt huvudön.',
      'Håll in Huka för att dyka. Musslorna öppnar sig en stund och smäller sedan igen – ta pärlan när de är öppna, annars nyper de!',
      `Du har ${pearls} av ${clamSpots.length} pärlor.`
    ], { mark: !G.hasStone('islands', 2) });
    W.stone(2, 0, 2.9, 23.5, { hidden: true });
    enemy(W, 'krabba', -10, H(-10, 54), 54, { radius: 4 });
    W.crate(14, H(14, 36), 36, 3);
    for (let i = 0; i < 4; i++) { const z = 36 - i * 2.2; W.coin(-4, H(-4, z) + 1, z); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; W.coin(FX + Math.cos(a) * 10, H(FX + Math.cos(a) * 10, FZ + Math.sin(a) * 10) + 1, FZ + Math.sin(a) * 10); }
    W.coinRing(KI.x - 9, KI.top + 1.6, KI.z + 9, 2.5, 6);
    W.coinRing(5, -3.5, -30, 2, 6);
    for (let i = 0; i < 6; i++) { const x = 12 + i * 3.4, z = 33 - i * 2.3; W.coin(x, Math.max(H(x, z), 0) + 1, z); }
    W.coinLine([-35, 1, 17], [-38, 1, -10], 6);
    buoys.forEach(([x, , z]) => W.coin(x, 2.6, z));
    W.coinTotal(100, [6, H(6, 50) + 1, 50]);
    W.npc('groda', -14, H(-14, 44), 44, 1.2, 'Paddan Pelle', ['Psst… långt ute i väster ligger ett gammalt skepp på havsbotten.', 'Håll in Huka i vattnet för att dyka!']);
    addGrass(W, q, 1800, 40, 0, 45, H, (x, z) => H(x, z) > 1.3 && Math.hypot(x, z - 45) < 15, { color: 0x4a9a3a, tip: 0xb8e070 });
    W.group.add(makeClouds(16, 210, 40, 60, { seed: 12 }));
    void outline; void toon;
  }
};
