/* Kristallgrottan – mörk grotta med lysande svampar, kristaller, rörliga och smulande plattformar. */
import * as THREE from 'three';
import { makeNoise, terrain, GEO } from '../core.js';
import { shroom, V3, glow } from './common.js';
import { enemy } from '../enemies.js';
import { Race } from '../race.js';
import { Gnistra } from '../bosses.js';
import { P, outline } from '../models.js';

const N = makeNoise(33);
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const chasmZ = x => 11.5 + Math.sin(x * 0.06) * 2;
function inChasm(x, z) {
  if (Math.abs(z - chasmZ(x)) < 6.5 && Math.abs(x) < 70) return true;
  const da = Math.hypot(x - 30, z + 40);
  if (da > 15.5 && da < 26 && !(Math.abs(x - 30) < 2 && z > -30)) return true;
  return false;
}
function H(x, z) {
  let h = (N(x * 0.06, z * 0.06) - 0.5) * 1.6;
  const r = Math.hypot(x, z);
  h += ss(58, 68, r) * 14;
  h *= 1 - ss(16, 13, Math.hypot(x - 30, z + 40));
  return h;
}
const CRYS = [0xc070ff, 0x60e0ff, 0xff70d0, 0x80ffc0];

export default {
  id: 'cave', name: 'Kristallgrottan', sub: 'Värld 2', icon: '💎', color: '#8a4ae0', need: 3, music: 'cave',
  stones: ['Kristalltornets topp', 'Grottmasken Gnistra', 'Lysmaskarnas lykta', 'Kapplöpning med Mullvaden Mats', 'Ljuskristallerna', 'Under bron'],
  env: {
    sky: { top: 0x0a0618, mid: 0x1a0e36, hor: 0x2c1652, bot: 0x05030c, sunDir: [0, -1, 0], stars: 0.7, haze: 0 },
    fog: 0x140c26, fogNear: 18, fogFar: 85,
    hemi: [0x8a7aff, 0x302040, 1.0], sun: [0xb0a0ff, 0.9], sunDir: [0.3, 1, 0.2], lantern: 12, exposure: 1.1
  },
  build(W, B, G, q) {
    W.setSpawn(0, H(0, 56) + 0.3, 56, Math.PI);
    W.berryKind = 'lysmask';
    W.killY = -24;
    terrain(B, { size: 150, res: 90, height: H, clip: (x, z) => inChasm(x, z), color: (x, y, z, sl, c) => {
      const n = N(x * 0.3, z * 0.3);
      if (sl > 0.45) return c.setRGB(0.22, 0.18, 0.3);
      if (n > 0.72) return c.setRGB(0.25, 0.5 + n * 0.2, 0.45);
      return c.setRGB(0.28 + n * 0.08, 0.24 + n * 0.06, 0.36 + n * 0.1);
    } });
    // kanter ned i avgrunden
    for (let x = -66; x <= 66; x += 4) {
      const zc = chasmZ(x);
      B.box(x, -4, zc - 6.8, 4.2, 8, 0.8, { color: 0x2a2238, collide: false });
      B.box(x, -4, zc + 6.8, 4.2, 8, 0.8, { color: 0x2a2238, collide: false });
    }
    // avgrundens sken
    B.box(0, -15, 0, 150, 0.2, 150, { mat: 'glow', color: 0x2a1448, collide: false, cast: false });
    // grottväggen (inåtvänd)
    const wall = new THREE.CylinderGeometry(70, 70, 60, 48, 1, true); wall.scale(-1, 1, 1); wall.computeVertexNormals();
    B.add(wall, new THREE.Matrix4().makeTranslation(0, 22, 0), { color: 0x2a2040, mat: 'noise' });
    wall.dispose();
    // tak-stalaktiter
    for (let i = 0; i < 60; i++) { const a = i * 2.4, r = 10 + (i * 17 % 55); const x = Math.cos(a) * r, z = Math.sin(a) * r; const s = 1 + (i % 4); B.cone(x, 30 - s * 3, z, s * 0.8, s * 3, { rot: [Math.PI, 0, 0], color: 0x3a2e50, collide: false }); if (i % 3 === 0) B.sphere(x, 30 - s * 3 - 0.2, z, 0.3, 0.5, 0.3, { mat: 'glow', color: CRYS[i % 4], collide: false }); }
    // kristallkluster & lysande svampar
    const crystal = (x, y, z, s, col) => { for (let k = 0; k < 3; k++) B.sphere(x + (k - 1) * 0.6 * s, y + s * (1 + k % 2 * 0.4), z + (k % 2) * 0.4 * s, 0.35 * s, (1.2 + (k % 2) * 0.5) * s, 0.35 * s, { geo: GEO.ico, mat: 'glow', color: col, collide: k === 1, rot: [0.2 * (k - 1), k, 0.3 * (k - 1)] }); };
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996, r = 8 + (i * 29 % 56);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inChasm(x, z) || Math.hypot(x - 30, z + 40) < 17 || Math.hypot(x + 35, z + 32) < 9 || Math.hypot(x, z - 56) < 6 || Math.abs(x) < 3) continue;
      if (i % 2) crystal(x, H(x, z) - 0.3, z, 0.8 + (i % 3) * 0.4, CRYS[i % 4]);
      else shroom(B, x, H(x, z), z, 0.8 + (i % 3) * 0.3, [0x40e0ff, 0x80ff9a, 0xff80e0][i % 3], { glow: true });
    }
    // glödpunkter (dekor)
    for (let i = 0; i < 18; i++) { const a = i * 1.7, r = 12 + (i * 13 % 48); const gl = glow(CRYS[i % 4], 4, 0.35); gl.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r); W.group.add(gl); }
    // grottmynning (varmt ljus)
    const mouth = glow(0xffc070, 14, 0.4); mouth.position.set(0, 4, 66); W.group.add(mouth);

    // --- start
    W.sign(-3, H(-3, 52), 52, Math.PI + 0.4, ['Kristallgrottan', 'Det är mörkt här nere – håll dig nära ljuset. Lyktspöken tål inte svanssnurrar!'], 'Skylt');
    const mats = W.npc('mullvad', 6, H(6, 50), 50, -2.6, 'Mullvaden Mats', null, { mark: true });
    W.coinLine([0, 1, 50], [0, 1, 28], 6);
    enemy(W, 'fladdermus', -8, 2, 40, { radius: 6, height: 2.5 });
    enemy(W, 'spoklykta', 12, 0, 34, { radius: 8 });
    W.checkpoint(4, H(4, 24), 24, Math.PI);

    // --- ljuskristallerna (pussel)
    const PX = -36, PZ = 40;
    const peds = [];
    let solved = G.hasStone('cave', 4);
    const pedSpots = [[-42, 0, 33], [-29, 3, 45], [-45, 6, 40], [-27, 0, 31]];
    B.box(-29, 1.5, 45, 3, 3, 3, { color: 0x3a3050, mat: 'noise' });
    B.stairs(-29, 0, 49.5, Math.PI, 2, 1, 1.2, 2.4, { color: 0x3a3050 });
    B.cyl(-45, 6, 40, 1.6, 6.5, { color: 0x3a3050, mat: 'noise', seg: 8 });
    W.spring(-41.5, H(-41.5, 40), 40, 17, 'pad', 1);
    pedSpots.forEach(([x, y, z], i) => {
      const yy = y || H(x, z);
      B.cyl(x, yy + 0.6, z, 0.7, 0.6, { color: 0x6a6080, mat: 'bricks', seg: 8 });
      const g = new THREE.Group(); g.position.set(x, yy + 0.6, z);
      const m = new THREE.MeshToonMaterial({ color: 0x4a4060, emissive: 0x000000, transparent: true, opacity: 0.95 });
      const cr = P(g, 'oct', m, [0, 1, 0], [0.5, 1, 0.5]);
      const gl = glow(0x80ffe0, 3.5, 0); gl.position.y = 1; g.add(gl);
      outline(g, 0.03);
      g.userData.disposeMat = [m];
      W.group.add(g);
      peds.push({ g, cr, m, gl, x, y: yy + 1.6, z, t: 0 });
    });
    W.add({
      update(dt, G2) {
        const pl = G2.player;
        let lit = 0;
        for (const p of peds) {
          p.cr.rotation.y += dt * (p.t > 0 ? 3 : 0.3);
          if (!solved && p.t <= 0 && pl.attackHit(new V3(p.x, p.y, p.z), 0.6)) { p.t = 15; G2.audio.play('power'); G2.fx.sparkle(p.x, p.y, p.z, 16, 0x80ffe0); if (peds.filter(q => q.t > 0).length === 1) G2.toast('Tänd alla fyra kristaller samtidigt!'); }
          if (p.t > 0 && !solved) { p.t -= dt; if (p.t <= 0) G2.audio.play('error', { vol: 0.4 }); }
          const on = p.t > 0 || solved;
          if (on) lit++;
          const blink = !solved && p.t > 0 && p.t < 4 ? (Math.sin(p.t * 12) > 0 ? 1 : 0.3) : 1;
          p.m.emissive.setHex(on ? 0x40c0a0 : 0x000000).multiplyScalar(blink);
          p.m.color.setHex(on ? 0x9affe8 : 0x4a4060);
          p.gl.material.opacity = on ? 0.6 * blink : 0;
        }
        if (!solved && lit === 4) { solved = true; W.revealStone(4); }
      },
      resetVisit() { peds.forEach(p => { p.t = 0; }); }
    });
    W.stone(4, PX, 1.8, PZ, { hidden: true });
    W.sign(PX + 6, H(PX + 6, PZ - 8), PZ - 8, 2.6, ['Ljuskristallerna', 'Väck kristallerna med en svanssnurr. Deras ljus slocknar snart – lys upp alla fyra på samma gång!'], 'Gammal sten');
    W.coinRing(PX, 1, PZ, 4, 6);
    W.berry(-46.2, 7.3, 40.6);
    enemy(W, 'spoklykta', -36, 0, 28, { radius: 8 });

    // --- avgrunden: bro, svävande plattformar, smulande stenar
    B.plat(0, 0.3, chasmZ(0), 3.2, 15, 0.5, { mat: 'planks', color: 0x9a7050 });
    for (const sd of [-1, 1]) { const z0 = chasmZ(0) + sd * 7.4, z1 = z0 + sd * 2.4; B.ramp(0, 0.3, z0, 0, Math.min(0.3, H(0, z1)) - 0.05, z1, 3.2, 0.4, { mat: 'planks', color: 0x9a7050 }); }
    for (const sx of [-1.5, 1.5]) B.box(sx, 1.1, chasmZ(0), 0.12, 0.12, 15, { color: 0x6a4a30, collide: false });
    W.coinLine([0, 1.3, chasmZ(0) + 5], [0, 1.3, chasmZ(0) - 5], 4);
    // under bron (hemlig)
    B.plat(4, -8, chasmZ(4), 5, 4, 1, { color: 0x3a3050, mat: 'noise' });
    W.spring(5.5, -8, chasmZ(4) + 0.6, 28, 'pad', 0.9);
    W.stone(5, 2.6, -6.6, chasmZ(4));
    W.coinLine([2, -7.2, chasmZ(4) - 1.2], [2, -7.2, chasmZ(4) + 1.2], 3);
    // västra: rörliga plattformar
    const zw = chasmZ(-35);
    W.platform({ size: [3, 0.6, 3], color: 0x7a60b0, path: [[-35, 0, zw + 6.5], [-35, 0, zw - 6.5]], speed: 3, wait: 0.7, decor: r => { const g = glow(0xc070ff, 3, 0.4); g.position.y = -0.6; r.add(g); } });
    W.platform({ size: [3, 0.6, 3], color: 0x7a60b0, path: [[-41, 1.5, zw - 6.5], [-41, 1.5, zw + 6.5]], speed: 3, wait: 0.7 });
    W.coin(-35, 1.2, zw); W.coin(-41, 2.7, zw);
    W.berry(-38, 3.5, zw);
    // östra: smulande stenar
    for (let i = 0; i < 5; i++) { const x = 35 + (i % 2) * 1.5, z = chasmZ(35) + 6 - i * 3; W.platform({ size: [2.4, 0.6, 2.4], color: 0x8a7a6a, pos: [x, -0.3, z], crumble: true, mat: 'noise' }); W.coin(x, 0.8, z); }
    W.checkpoint(3, H(3, 0), 0, Math.PI);
    enemy(W, 'fladdermus', 20, 2, 0, { radius: 8, height: 3 });
    enemy(W, 'fladdermus', -20, 2, -4, { radius: 8, height: 3 });
    W.crate(-10, H(-10, -2), -2, 3);
    W.crate(14, H(14, 30), 30, 3);

    // --- kristalltornet
    const TX = -35, TZ = -32;
    B.cyl(TX, 26, TZ, 5, 26, { color: 0x6a40b0, seg: 6 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; B.box(TX + Math.cos(a) * 4.6, 13, TZ + Math.sin(a) * 4.6, 0.25, 26, 0.25, { mat: 'glow', color: 0xc090ff, collide: false }); }
    const tp = [[0, 2.2], [1, 4.6], [2, 7], [3, 9.4], [4, 11.8]];
    tp.forEach(([i, y]) => { const a = i * 1.1 + 1.6, x = TX + Math.cos(a) * 7.5, z = TZ + Math.sin(a) * 7.5; B.cyl(x, y, z, 1.6, 0.6, { mat: 'glow', color: CRYS[i % 4], seg: 6 }); W.coin(x, y + 1, z); });
    // roterande plattformar
    W.platform({ size: [9, 0.6, 2.4], color: 0x5a4a80, pos: [TX, 14.5, TZ], rot: { axis: 'y', speed: 0.7 }, geo: (() => { const g = new THREE.BoxGeometry(17, 0.6, 2.4); return g; })() });
    W.coin(TX + 7.5, 16.5, TZ); W.coin(TX - 7.5, 15.6, TZ);
    // klätterkristall
    B.box(TX + 5.3, 21.2, TZ, 0.6, 11.6, 3, { mat: 'iceclimb', tag: 'climb', color: 0xd0b0ff });
    B.plat(TX + 7.4, 15.4, TZ, 3.2, 3.2, 0.5, { color: 0x5a4a80 });
    B.plat(TX, 26.4, TZ, 10, 10, 0.6, { color: 0x8a60d0 });
    W.stone(0, TX, 27.9, TZ);
    W.coinRing(TX, 27.3, TZ, 3, 6);
    W.checkpoint(-24, H(-24, -22), -22, -2.2);
    enemy(W, 'spoklykta', TX + 10, 0, TZ + 10, { radius: 9 });
    enemy(W, 'fladdermus', TX - 9, 9, TZ + 3, { radius: 4, height: 2 });
    W.berry(TX - 7.5, 15.8, TZ);
    W.heart(-22, H(-22, -18) + 0.8, -18);

    // --- boss-arenan
    const AX = 30, AZ = -40;
    B.plat(AX, 0.3, -27.5, 3.2, 5, 0.6, { mat: 'planks', color: 0x9a7050 });
    W.checkpoint(AX - 3, H(AX - 3, -12), -12, Math.PI);
    W.coinLine([AX, 1.3, -18], [AX, 1.3, -26], 4);
    const holes = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; const x = AX + Math.cos(a) * 9, z = AZ + Math.sin(a) * 9; holes.push([x, z]); B.cyl(x, 0.06, z, 1.6, 0.1, { color: 0x0a0610, collide: false }); B.cyl(x, 0.12, z, 2.0, 0.08, { color: 0x4a3a60, collide: false }); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.25) continue; crystal(AX + Math.cos(a) * 14.8, 0, AZ + Math.sin(a) * 14.8, 1.2, CRYS[i % 4]); }
    W.stone(1, AX, 1.6, AZ, { hidden: true });
    new Gnistra(W, new V3(AX, 0, AZ), { holes, arenaR: 15, stone: 1 });

    // --- loppet: Mats gräver under jorden
    const race = new Race(W, mats, [[6, 0, 50], [1, 0, 22], [0, 0, -2], [-24, 0, -20], [-50, 0, -22]], {
      speed: 7.5, gates: [2, 3], stone: 3, finishR: 3.5, dig: true, finishRy: 0.8,
      goal: 'Över bron och förbi kristalltornet – mållinjen ligger i väster!',
      loseLine: 'Gräv, gräv, gräv – först! Prata med mig igen om du vill ha revansch.',
      onWin: g => { mats.marker.visible = false; g.dialog('Mullvaden Mats', ['Oj! Du sprang fortare än jag grävde. Den här glittriga stenen hittade jag i en tunnel – ta den!'], mats, () => W.revealStone(3)); }
    });
    W.stone(3, -50, H(-50, -20) + 1.6, -19.5, { hidden: true });
    mats.talk = g => [g.hasStone('cave', 3) ? 'Revansch? Jag har vässat klorna!' : 'Hej rävunge! Jag gräver snabbare än du springer. Ska vi tävla till kristallerna längst in i grottan?', { text: 'Tävla mot Mats?', choices: [['Ja!', () => race.start(g)], ['Nej', null]] }];

    // --- fler bär & mynt
    B.plat(52, 3, 30, 3, 3, 3, { color: 0x3a3050, mat: 'noise' });
    W.spring(48, H(48, 30), 30, 18, 'pad', 0.8);
    W.berry(52, 4.2, 30);
    W.berry(-55, H(-55, -12) + 1.2, -12);
    B.plat(10, 4.5, -20, 2.5, 2.5, 4.5, { color: 0x3a3050, mat: 'noise' });
    B.box(10, 2.25, -18.6, 2.4, 4.5, 0.5, { mat: 'iceclimb', tag: 'climb', color: 0xd0b0ff });
    W.berry(10, 5.7, -20);
    W.berry(46, H(46, -10) + 1, -10);
    W.berry(0, 1.3, chasmZ(0) + 3.9);
    // --- Lysmaskarnas lykta: samla åtta lysmaskar – de följer Ylva och lyser upp grottan – och för dem till den stora lyktan
    const LX = -12, LZ = 40, LY = H(LX, LZ);
    B.cyl(LX, LY + 0.4, LZ, 1.3, 0.8, { color: 0x4a4060, mat: 'bricks', seg: 8 });
    B.cyl(LX, LY + 3.6, LZ, 0.18, 3.2, { color: 0x3a3048, seg: 8 });
    B.box(LX, LY + 4.1, LZ, 1.5, 0.15, 1.5, { color: 0x3a3048, collide: false });
    B.box(LX, LY + 5.9, LZ, 1.7, 0.2, 1.7, { color: 0x3a3048, collide: false });
    B.cone(LX, LY + 6.0, LZ, 1.2, 0.9, { color: 0x3a3048, collide: false });
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) B.box(LX + dx, LY + 5, LZ + dz, 0.1, 1.8, 0.1, { color: 0x3a3048, collide: false });
    const cageMat = new THREE.MeshToonMaterial({ color: 0x5a5470, transparent: true, opacity: 0.35, emissive: 0x000000 });
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.7, 1.35), cageMat); cage.position.set(LX, LY + 5, LZ); cage.userData.disposeMat = [cageMat]; W.group.add(cage);
    const lanternGlow = glow(0xd8ff7a, 9, 0); lanternGlow.position.set(LX, LY + 5, LZ); W.group.add(lanternGlow);
    let lit = G.hasStone('cave', 2);
    const lightLantern = (on) => { cageMat.color.setHex(on ? 0xeaffb0 : 0x5a5470); cageMat.emissive.setHex(on ? 0x90c030 : 0); cageMat.opacity = on ? 0.85 : 0.35; lanternGlow.material.opacity = on ? 0.85 : 0; };
    lightLantern(lit);
    W.sign(LX + 2.2, LY, LZ + 2.2, 0.8, ['Lysmaskarnas lykta', 'Lysmaskarna har flytt ut i grottan. Samla alla åtta – de följer dig och lyser upp mörkret – så flyger de hem till lyktan.'], 'Gammal lykta');
    // svärmen som följer Ylva
    const swarm = [];
    W.onBerry = (b, g) => {
      const s = glow(0xd8ff7a, 1.1, 0.9); s.userData.ph = Math.random() * 6; W.group.add(s); swarm.push(s);
      g.lantern.intensity = 12 + swarm.length * 3; g.lantern.distance = 22 + swarm.length * 3;
      if (swarm.length === 1) g.toast('En lysmask! Den lyser upp vägen åt dig. Hitta alla åtta.', { ms: 2600 });
    };
    W.onBerriesReset = g => { swarm.forEach(s => { W.group.remove(s); s.material.dispose(); }); swarm.length = 0; g.lantern.intensity = 12; g.lantern.distance = 22; };
    let homing = 0;
    W.onBerriesDone = g => { homing = 2.2; g.toast('Alla åtta! Lysmaskarna flyger hem till den stora lyktan …', { ms: 2600 }); };
    W.onUpdate((dt, t, g) => {
      const pp = g.player.pos;
      swarm.forEach((s, i) => {
        const a = t * 1.6 + s.userData.ph + i * 0.8;
        if (homing > 0) { s.position.lerp(new V3(LX + Math.cos(a) * 0.4, LY + 5 + Math.sin(a * 2) * 0.3, LZ + Math.sin(a) * 0.4), Math.min(1, dt * 2.5)); }
        else s.position.set(pp.x + Math.cos(a) * (1 + 0.2 * Math.sin(t * 2 + i)), pp.y + 1.3 + Math.sin(a * 1.7) * 0.5, pp.z + Math.sin(a) * (1 + 0.2 * Math.sin(t * 2 + i)));
      });
      if (homing > 0) { homing -= dt; if (homing <= 0) { lit = true; lightLantern(true); g.audio.play('levelup'); g.fx.burst(LX, LY + 5, LZ, 30, { speed: 5, color: [0xd8ff7a, 0xffffff], size: 0.5, life: 1 }); swarm.forEach(s => { W.group.remove(s); s.material.dispose(); }); swarm.length = 0; g.lantern.intensity = 12; W.revealStone(2); } }
    });
    W.stone(2, LX, LY + 1.9, LZ + 1.9, { hidden: true });
    W.coinRing(-12, H(-12, 40) + 1, 40, 3, 6);
    W.coinRing(46, H(46, -10) + 1, -10, 2.5, 6);
    for (let i = 0; i < 6; i++) { const z = -4 - i * 4; W.coin(-55, H(-55, z) + 1, z); }
    for (let i = 0; i < 5; i++) { const x = 4 + i * 2.5, z = -16 + i * 0.5; W.coin(x, H(x, z) + 1, z); }
    enemy(W, 'spoklykta', 46, 0, -12, { radius: 8 });
    enemy(W, 'fladdermus', -50, 2, -45, { radius: 6, height: 2.5 });
    W.npc('groda', -14, H(-14, 25), 25, 2, 'Grottgrodan Gry', ['Kväck… Under bron finns en avsats. Jag såg något glittra där nere.', 'Släpp dig ned från brons östra kant – men sikta noga!']);
    for (let i = 0; i < 5; i++) { const z = 30 + i * 5; W.coin(-20, H(-20, z) + 1, z); }
    W.coinRing(-35, 1, -32, 8.5, 8);
    for (let i = 0; i < 5; i++) { const z = 40 - i * 5; W.coin(40, H(40, z) + 1, z); }
    for (let i = 0; i < 4; i++) { const x = 20 + i * 3, z = -5 - i * 2.3; W.coin(x, H(x, z) + 1, z); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = -48 + Math.cos(a) * 3, z = -28 + Math.sin(a) * 3; W.coin(x, H(x, z) + 1, z); }
    W.coinTotal(100, [-12, 1, 30]);
  }
};
