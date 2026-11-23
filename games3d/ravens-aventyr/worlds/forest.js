/* Blåbärsskogen – introvärlden: äng, flod, jätteek, ruinkulle, stubbgåta och Taggsvinet Torbjörn. */
import * as THREE from 'three';
import { makeNoise, terrain, makeWater, makeClouds, GEO } from '../core.js';
import { pine, oak, bush, shroom, addGrass, addFlowers, waterfall, V3, clearOf } from './common.js';
import { enemy } from '../enemies.js';
import { Chick } from '../missions.js';
import { Torbjorn } from '../bosses.js';

const N = makeNoise(21);
const cz = x => 22 + 4 * Math.sin(0.05 * x);
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function H(x, z) {
  let h = (N(x * 0.04, z * 0.04) - 0.5) * 1.8;
  // kulle
  const dh = Math.hypot(x + 30, z + 28);
  h += 9 * Math.exp(-((dh / 15) ** 2));
  // klippa i väster
  h = h + (10 - h) * ss(-72, -77, x);
  // flod
  const d = Math.abs(z - cz(x));
  if (x > -72.5) { const k = ss(8, 3.2, d); h = h * (1 - k) - 3.5 * k; }
  // arena
  const da = Math.hypot(x - 12, z + 66);
  h = h * ss(16, 21, da);
  // gläntor
  const dc = Math.hypot(x + 55, z + 45); h = h * ss(9, 13, dc);
  const dok = Math.hypot(x - 42, z + 18); h = h * ss(8, 12, dok);
  // kant
  const rr = Math.hypot(x, z + 5);
  if (rr > 82) h += ((rr - 82) / 7) ** 2 * 6;
  return h;
}
/** Högsta markhöjd under en plattform (så att den aldrig sjunker ned i terrängen). */
const footY = (h, x, z, r) => { let m = -1e9; for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) m = Math.max(m, h(x + i * r / 2, z + k * r / 2)); return m; };
const pathD = (x, z) => {
  let d = Math.abs(x) + (z < 30 ? 99 : 0);
  if (z < 14 && z > -40) { const t = (z - 14) / -54; d = Math.min(d, Math.abs(x - (t * 12))); }
  return d;
};

export default {
  id: 'forest', name: 'Blåbärsskogen', sub: 'Värld 1', icon: '🫐', color: '#3a7ae0', need: 0, music: 'forest',
  stones: ['Toppen av ruintornet', 'Taggsvinet Torbjörn', 'Åtta röda bär', 'Kycklingen Pip hittar hem', 'Stubbarnas gåta', 'Bakom vattenfallet'],
  env: {
    sky: { top: 0x2a72de, mid: 0x7cc2fa, hor: 0xe8f6ff, bot: 0x6a9a6a, sunDir: [0.5, 0.6, -0.4], sunCol: 0xfff0c8 },
    far: [{ r: 150, n: 80, hMin: 12, hMax: 34, cBot: 0x7aa6bc, cTop: 0xa8cce0, seed: 21, jag: 0.4 }],
    fog: 0xbfe0f0, fogNear: 60, fogFar: 190,
    hemi: [0xdff0ff, 0x5a7a3a, 1.5], sun: [0xfff2d8, 2.8], sunDir: [0.5, 1, -0.45]
  },
  build(W, B, G, q) {
    W.setSpawn(0, H(0, 72) + 0.3, 72, Math.PI);
    W.killY = -14;
    terrain(B, { size: 190, res: 95, cz: -5, height: H, color: (x, y, z, sl, c) => {
      if (sl > 0.5) return c.set(0x8a7a6a);
      const d = Math.abs(z - cz(x));
      if (x > -72.5 && d < 8.5 && y < 0.2) return c.set(y < -1.5 ? 0x9a8a6a : 0xd8c890);
      if (pathD(x, z) < 1.7) return c.set(0xc8a070);
      if (Math.hypot(x - 12, z + 66) < 17) return c.set(0xb8a878);
      const n = N(x * 0.25, z * 0.25);
      return c.setRGB(0.3 + n * 0.12, 0.62 + n * 0.14, 0.24);
    } });
    // flod
    W.water(-0.6, [-72.5, 8, 100, 40]);
    const river = makeWater(175, 34, { deep: 0x1f6aa0, shallow: 0x4ac8d8 });
    river.position.set(14, -0.6, 24); W.group.add(river);
    waterfall(W, -71.6, -0.8, cz(-70), 9, 12, Math.PI / 2);
    W.onUpdate((dt, t, G2) => { if (Math.random() < dt * 30) G2.fx.emit(-71, -0.4, cz(-70) + (Math.random() - 0.5) * 8, { vy: 2 + Math.random() * 2, vx: 1 + Math.random(), g: 6, life: 0.7, size: 0.8, size1: 1.4, color: 0xffffff, alpha: 0.6 }); });
    // hemlig avsats bakom vattenfallet
    B.plat(-73.6, 2.4, cz(-70), 3.4, 7, 3.5, { mat: 'noise', color: 0x8a8a8a });
    B.rock(-67, -0.4, cz(-70) + 3, 1.4, { flat: 1.1 });
    W.stone(5, -73.4, 3.7, cz(-70));
    W.coinLine([-72.8, 3.3, cz(-70) - 2.5], [-72.8, 3.3, cz(-70) + 2.5], 3);

    // --- ängen
    W.coinLine([0, 1, 66], [0, 1, 40], 7);
    W.spring(-18, H(-18, 58), 58, 23, 'mushroom', 1.1);
    W.coinRing(-18, H(-18, 58) + 1, 58, 3.5, 8);
    B.plat(-18, 11, 49, 5, 5, 0.8, { color: 0x8ac050 });
    B.sphere(-18, 10.4, 49, 2.6, 1, 2.6, { color: 0x8a6a4a, mat: 'noise', collide: false });
    W.coinRing(-18, 12, 49, 1.8, 6);
    W.berry(-18, 12.2, 49);
    // storsvamp-plattformar
    for (const [x, z, h, s] of [[22, 46, 3, 1.4], [27, 40, 5.5, 1.6], [24, 33, 8, 1.8]]) {
      B.cyl(x, H(x, z) + h - 0.4, z, 0.5, h, { color: 0xf3e6cc, seg: 8 });
      B.sphere(x, H(x, z) + h, z, 2 * s, 0.7, 2 * s, { color: 0xd83a2e });
      for (let i = 0; i < 5; i++) { const a = i * 1.26; B.sphere(x + Math.sin(a) * 1.4 * s, H(x, z) + h + 0.45, z + Math.cos(a) * 1.4 * s, 0.35, 0.15, 0.35, { color: 0xffffff, collide: false }); }
    }
    W.berry(24, H(24, 33) + 9.5, 33);
    enemy(W, 'svampis', -8, H(-8, 54), 54, { radius: 6 });
    enemy(W, 'svampis', 10, H(10, 48), 48, { radius: 6 });
    enemy(W, 'svampis', -2, H(-2, 42), 42, { radius: 5 });
    W.crate(8, H(8, 60), 60, 3);
    W.sign(-3, H(-3, 68), 68, Math.PI + 0.4, ['Blåbärsskogen', 'Hoppa på svampisarna eller snurra på dem. Sex Norrskensstenar är gömda här – kolla pausmenyn för uppdragen!'], 'Skylt');
    W.npc('ekorre', 10, H(10, 63), 63, -2.5, 'Ekorren Ebbe', [
      'Tjenare! Har du sett jätteeken bortom floden? Grenarna går i en spiral ända upp till min trädkoja.',
      'Den gröna rankväggen på trädets södra sida är en genväg – och längst ut på en gren ligger ett rött bär.'
    ]);
    // --- Kycklingen Pip (eskortuppdrag): Hönan Hulda på ängen, Pip vilse vid ruinkullen
    const hulda = W.npc('hona', -7, H(-7, 61), 61, 0.6, 'Hönan Hulda', g => g.hasStone('forest', 3) ? ['Pip pratar inte om något annat än dig nu, Ylva! Tack igen.'] : pip.state === 'follow' || pip.state === 'wait' ? ['Pip! Är det du? Kom hit, gumman!'] : [
      'Kluck… Ylva, har du sett min lilla Pip? Hon jagade en fjäril och sprang vilse i natt!',
      'Jag tror att hon är borta vid ruinkullen, på andra sidan floden. Snälla, led henne hem.',
      'Gå lugnt så att hon hinner med – och håll henne borta från taggsvin och svampisar. Hon blir så rädd!'
    ], { mark: !G.hasStone('forest', 3) });
    const pip = new Chick(W, new V3(-40, H(-40, -6), -6), { hen: hulda, done: G.hasStone('forest', 3), onHome: g => {
      hulda.marker.visible = false;
      g.dialog('Hönan Hulda', ['Pip! Min lilla Pip! Kluck-kluck-kluck!', 'Tack, Ylva. Korpen tappade en glittrande sten i mitt rede – den är din.'], hulda, () => W.revealStone(3));
    } });
    W.stone(3, -9.5, H(-9.5, 59) + 1.6, 59, { hidden: true });
    // --- flod & bro
    W.checkpoint(4, H(4, 34), 34, Math.PI);
    B.plat(0, 0.3, 22, 3.2, 17, 0.5, { mat: 'planks', color: 0xc89060 });
    B.ramp(0, H(0, 11.2) - 0.05, 11.2, 0, 0.3, 13.6, 3.2, 0.4, { mat: 'planks', color: 0xc89060 });
    B.ramp(0, 0.3, 30.4, 0, H(0, 32.8) - 0.05, 32.8, 3.2, 0.4, { mat: 'planks', color: 0xc89060 });
    for (let z = 15; z <= 29; z += 3.5) for (const sx of [-1.5, 1.5]) B.cyl(sx, 0.3, z, 0.2, 4.5, { color: 0x7a5030, seg: 8, collide: false });
    for (const sx of [-1.5, 1.5]) B.box(sx, 1.2, 22, 0.15, 0.15, 17, { color: 0x7a5030, collide: false });
    W.coinLine([0, 1.3, 29], [0, 1.3, 15], 5);
    W.coinLine([-1.2, -2.2, 19], [1.2, -2.2, 25], 3);
    W.berry(0, -2.4, 22);
    // trampstenar
    const c30 = cz(-30);
    [5, 1.7, -1.7, -5].forEach((o, i) => { B.rock(-30 + (i % 2) * 1.2, 0.0, c30 + o, 1.25, { flat: 0.55 }); W.coin(-30 + (i % 2) * 1.2, 1.3, c30 + o); });
    W.berry(-30, 1.4, c30 - 1.7);
    // flytande stockar
    const c33 = cz(33);
    W.platform({ shape: 'log', size: [0, 1.1, 5], color: 0x8a5a30, path: [[30, -0.45, c33 + 6], [30, -0.45, c33 - 6]], speed: 2.4, wait: 0.8, ry: Math.PI / 2 });
    W.platform({ shape: 'log', size: [0, 1.1, 5], color: 0x8a5a30, path: [[36, -0.45, c33 - 6], [36, -0.45, c33 + 6]], speed: 2.4, wait: 0.8, ry: Math.PI / 2 });
    W.coinLine([30, 0.8, c33], [36, 0.8, c33], 4);

    // --- jätteeken
    const OX = 42, OZ = -18;
    B.cyl(OX, 26, OZ, 3.4, 26, { color: 0x6a4a2e, mat: 'noise', seg: 12 });
    for (let i = 0; i < 5; i++) { const a = i * 1.25; B.cyl(OX + Math.cos(a) * 3.6, 1.2, OZ + Math.sin(a) * 3.6, 1.2, 2.4, { color: 0x5a3e26, rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], seg: 8 }); }
    B.sphere(OX, 30, OZ, 10, 5.5, 10, { geo: GEO.ico, color: 0x4f9e3e, collide: false });
    B.sphere(OX + 6, 28, OZ + 3, 6, 4, 6, { geo: GEO.ico, color: 0x5aae44, collide: false });
    B.sphere(OX - 6, 29, OZ - 3, 6.5, 4, 6.5, { geo: GEO.ico, color: 0x63b84a, collide: false });
    const branches = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.5 + i * (Math.PI / 3), y = 2.6 + i * 2.5;
      const bx = OX + Math.cos(a) * 5.2, bz = OZ + Math.sin(a) * 5.2;
      B.box(OX + Math.cos(a) * 4.2, y - 0.6, OZ + Math.sin(a) * 4.2, 3.2, 0.6, 1.2, { ry: -a, color: 0x5a3e26, collide: false });
      B.plat(bx, y, bz, 3.2, 3.2, 0.5, { mat: 'planks', color: 0xb88050, ry: -a });
      W.coin(bx, y + 1, bz);
      branches.push([bx, y, bz]);
    }
    W.berry(OX + Math.cos(Math.PI * 0.5 + 4 * Math.PI / 3) * 7.5, 2.6 + 4 * 2.5 + 3.2, OZ + Math.sin(Math.PI * 0.5 + 4 * Math.PI / 3) * 7.5);
    B.plat(OX + Math.cos(Math.PI * 0.5 + 4 * Math.PI / 3) * 7.5, 2.6 + 4 * 2.5 + 2, OZ + Math.sin(Math.PI * 0.5 + 4 * Math.PI / 3) * 7.5, 2, 2, 0.4, { mat: 'planks', color: 0xb88050 });
    // rankvägg (genväg) på södra sidan
    B.box(OX, 6.5, OZ + 3.7, 2.6, 13, 0.6, { mat: 'vine', tag: 'climb' });
    // trädkoja
    B.cyl(OX, 23, OZ, 5.6, 0.5, { mat: 'planks', color: 0xc89060 });
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; B.cyl(OX + Math.cos(a) * 5.4, 24, OZ + Math.sin(a) * 5.4, 0.1, 1, { color: 0x7a5030, seg: 6, collide: false }); }
    W.coinRing(OX, 24, OZ, 4.3, 8);
    W.checkpoint(OX + 4, 23, OZ - 2, 0);
    // bikupa
    B.sphere(OX - 6, 11.5, OZ + 2, 1.2, 1.6, 1.2, { color: 0xe8b030, collide: false });
    for (let k = 0; k < 3; k++) B.cyl(OX - 6, 11 + k * 0.6 - 0.6, OZ + 2, 1.25 - Math.abs(k - 1) * 0.2, 0.12, { color: 0x8a5a10, collide: false });
    enemy(W, 'bi', OX - 6, 6, OZ + 2, { radius: 6, height: 2.5 });
    enemy(W, 'bi', OX + 4, 0, OZ + 8, { radius: 6, height: 2 });
    enemy(W, 'bi', OX + 8, 10, OZ - 6, { radius: 4, height: 2 });
    enemy(W, 'svampis', OX - 2, H(OX - 2, OZ + 12), OZ + 12, { radius: 6 });
    W.checkpoint(OX - 4, H(OX - 4, OZ + 9), OZ + 9, Math.PI);
    W.crate(OX + 8, H(OX + 8, OZ + 6), OZ + 6, 3);
    W.heart(OX + 5, H(OX + 5, OZ + 10) + 0.8, OZ + 10);
    void branches;

    // --- ruinkullen
    const TX = -30, TZ = -28, TY = H(TX, TZ);
    W.checkpoint(-20, H(-20, -12), -12, Math.PI * 1.2);
    for (let i = 0; i < 10; i++) { const a = -0.6 + i * 0.5, r = 15 - i * 0.6; const x = TX + Math.cos(a) * r, z = TZ + Math.sin(a) * r; if (Math.hypot(x - TX, z - TZ) < 9.8 || i === 2) continue; W.coin(x, H(x, z) + 1, z); }
    // torn (fyra väggar)
    const TH = 14;
    B.box(TX, TY + TH / 2 - 0.5, TZ - 3.5, 8, TH, 1, { mat: 'bricks', color: 0xd8d0c0 });
    B.box(TX, TY + TH / 2 - 0.5, TZ + 3.5, 8, TH, 1, { mat: 'bricks', color: 0xd8d0c0 });
    B.box(TX - 3.5, TY + TH / 2 - 0.5, TZ, 1, TH, 6, { mat: 'bricks', color: 0xd8d0c0 });
    B.box(TX + 3.5, TY + TH / 2 - 0.5, TZ, 1, TH, 6, { mat: 'bricks', color: 0xd8d0c0 });
    B.plat(TX, TY + TH, TZ, 8.6, 8.6, 0.6, { mat: 'bricks', color: 0xc8c0b0 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; B.box(TX + Math.cos(a) * 3.9, TY + TH + 0.5, TZ + Math.sin(a) * 3.9, 1, 1, 1, { mat: 'bricks', color: 0xc8c0b0 }); }
    // spiralblock runt tornet
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.5 + i * 0.8, y = TY + 1.6 + i * 1.8;
      const x = TX + Math.cos(a) * 7.2, z = TZ + Math.sin(a) * 7.2;
      const gb = H(x, z) - 1.5; B.box(x, (y + gb) / 2, z, 2.6, y - gb, 2.6, { mat: 'bricks', color: 0xb8b0a0, ry: a });
      W.coin(x, y + 0.9, z);
    }
    // rankvägg på västra sidan från sista blocket
    B.box(TX - 4.3, TY + 10, TZ, 0.6, 8, 3, { mat: 'vine', tag: 'climb' });
    // hiss på östra sidan
    W.platform({ size: [2.6, 0.5, 2.6], color: 0xd0c0a0, mat: 'bricks', path: [[TX + 6, footY(H, TX + 6, TZ, 1.6) + 0.3, TZ], [TX + 6, TY + TH + 0.2, TZ]], speed: 2.4, wait: 1.5 });
    W.stone(0, TX, TY + TH + 1.6, TZ);
    W.coinRing(TX, TY + TH + 1, TZ, 2.5, 6);
    enemy(W, 'svampis', TX + 8, H(TX + 8, TZ + 9), TZ + 9, { radius: 5 });
    enemy(W, 'taggsvin', -14, H(-14, -6), -6, { radius: 7 });
    // klippavsats bakom kullen
    B.plat(-50, 4, -18, 4, 4, 5, { mat: 'noise', color: 0x9a8a7a });
    B.rock(-46.5, H(-46.5, -15), -15, 1.6, { flat: 1 });
    W.berry(-50, 5.2, -18);

    // --- stubbgåtan
    const SX = -55, SZ = -45;
    const stumps = [];
    let solved = G.hasStone('forest', 4);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const x = SX + Math.cos(a) * 7, z = SZ + Math.sin(a) * 7;
      stumps.push(W.button(x, H(x, z), z, (b, g) => {
        if (solved) return;
        const n = stumps.filter(s => s.pressed).length;
        if (n === 1) g.toast('Tryck ned alla fem stubbar innan tiden tar slut!');
        if (n === 5) { solved = true; stumps.forEach(s => { s.timer = 0; }); W.revealStone(4); }
        else g.bigText(n + '/5', 0.7);
      }, { timed: 20, color: 0x8a5a30, onColor: 0x6ad04a, base: 0x5a3e26, onTimeout: (b, g) => { if (!solved) { stumps.forEach(s => { s.release(); s.timer = 0; }); g.toast('Tiden tog slut – stubbarna reste sig igen.'); } } }));
    }
    W.stone(4, SX, H(SX, SZ) + 1.6, SZ, { hidden: true });
    W.sign(SX + 6, H(SX + 6, SZ + 10), SZ + 10, -2.4, ['Stubbarnas gåta', 'Fem stubbar, en markstöt var. Hinner du med alla innan de reser sig igen?'], 'Gammal skylt');
    W.coinRing(SX, H(SX, SZ) + 1, SZ, 3, 5);
    B.plat(SX - 10, 3.2, SZ + 4, 2.5, 2.5, 3.6, { mat: 'noise', color: 0x6a4a2e });
    W.berry(SX - 10, 4.4, SZ + 4);
    enemy(W, 'taggsvin', SX + 12, H(SX + 12, SZ), SZ, { radius: 8 });
    W.crate(SX + 4, H(SX + 4, SZ - 10), SZ - 10, 3);

    // --- boss-arenan
    const AX = 12, AZ = -66;
    W.checkpoint(AX - 2, H(AX - 2, -44), -44, Math.PI);
    W.coinLine([AX, 1, -46], [AX, 1, -52], 5);
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue;
      B.rock(AX + Math.cos(a) * 19, 0.6, AZ + Math.sin(a) * 19, 2.4 + (i % 3) * 0.5, { flat: 1.3 });
    }
    const pillars = [];
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const x = AX + Math.cos(a) * 9, z = AZ + Math.sin(a) * 9; B.cyl(x, 3.2, z, 1.4, 3.2, { mat: 'noise', color: 0x9a9088, seg: 8 }); pillars.push(new V3(x, 0, z)); }
    W.stone(1, AX, 1.6, AZ, { hidden: true });
    new Torbjorn(W, new V3(AX, 0, AZ), { pillars, arenaR: 17, stone: 1 });
    // pelare med berry
    B.cyl(30, 7, -48, 2, 7, { mat: 'noise', color: 0x9a9088, seg: 8 });
    B.box(30, 3.5, -45.8, 2, 7, 0.6, { mat: 'vine', tag: 'climb' });
    W.berry(30, 8.2, -48);

    // --- mer fiender & lådor
    enemy(W, 'taggsvin', 20, H(20, -30), -30, { radius: 8 });
    enemy(W, 'svampis', -12, H(-12, 2), 2, { radius: 6 });
    W.crate(-6, H(-6, 4), 4, 3);
    W.heart(-24, H(-24, -10) + 0.8, -10);
    W.heart(6, 1.6, -40);
    W.berriesFor(2);
    W.stone(2, 4, H(4, 50) + 1.8, 50, { hidden: true });
    W.npc('igelkott', 6, H(6, 36), 37, Math.PI, 'Igelkotten Iris', [
      'Hej Ylva! Jag har sett åtta röda bär runt om i skogen – ett ligger till och med under bron, i vattnet!',
      'Om du hittar alla åtta dyker det kanske upp något fint på ängen.',
      'Och mina kusiner taggsvinen… hoppa inte på dem! Snurra först så att de vänder sig på rygg.'
    ]);
    W.npc('groda', -60, -0.2, cz(-60) + 7, -1, 'Grodan Gro', ['Kväck… jag har hört att det glittrar bakom vattenfallet.', 'Om du hoppar från stenen i vattnet och dubbelhoppar når du kanske dit.']);
    W.coinTotal(100, [5, H(5, 58) + 1, 58]);
    // --- dekor
    const deco = (x, z) => H(x, z) > -0.3 && Math.abs(z - cz(x)) > 9 && pathD(x, z) > 3 && Math.hypot(x - 12, z + 66) > 21 && Math.hypot(x + 30, z + 28) > 9 && Math.hypot(x - OX, z - OZ) > 9 && Math.hypot(x + 55, z + 45) > 11;
    let k = 0;
    for (let i = 0; i < 160 && k < 48; i++) {
      const a = i * 2.39996, r = 22 + (i * 37 % 60);
      const x = Math.cos(a) * r, z = -5 + Math.sin(a) * r;
      if (!deco(x, z) || Math.hypot(x, z - 62) < 20 || x < -66 || !clearOf(W, x, z, 3.4)) continue;
      k++;
      if (i % 3 === 0) oak(B, x, H(x, z) - 0.1, z, 1 + (i % 4) * 0.2); else pine(B, x, H(x, z) - 0.2, z, 1.2 + (i % 5) * 0.2, { solid: true });
    }
    for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2, r = 80 + (i % 3) * 3; const x = Math.cos(a) * r, z = -5 + Math.sin(a) * r; if (x < -70) continue; pine(B, x, H(x, z) - 0.3, z, 2 + (i % 3) * 0.4, { solid: true }); }
    for (let i = 0; i < 40; i++) { const a = i * 1.7, r = 14 + (i * 13 % 60); const x = Math.cos(a) * r, z = -5 + Math.sin(a) * r; if (!deco(x, z)) continue; if (i % 2) bush(B, x, H(x, z), z, 0.9 + (i % 3) * 0.2); else shroom(B, x, H(x, z), z, 0.7 + (i % 4) * 0.25, i % 4 ? 0xd83a2e : 0x3a7ae0); }
    addGrass(W, q, 7000, 170, 0, -5, H, (x, z) => deco(x, z) && Math.hypot(x, z + 5) < 80, { color: 0x3f9a32, tip: 0xa8e060 });
    addFlowers(W, q, 380, 160, 0, 10, H, (x, z) => deco(x, z) && Math.hypot(x, z + 5) < 78);
    W.group.add(makeClouds(16, 200, 45, 70, { seed: 5 }));
  }
};
