/* Isfjället – snöigt berg i terrasser: halka, vindbyar, rullande snöbollar, klockgåta och Snökungen Frost. */
import * as THREE from 'three';
import { makeNoise, terrain, makeClouds, makeWater, GEO } from '../core.js';
import { pine, V3, glow, toon, clearOf } from './common.js';
import { enemy } from '../enemies.js';
import { Race } from '../race.js';
import { Frost } from '../bosses.js';
import { P, outline } from '../models.js';

const N = makeNoise(44);
const MX = 15, MZ = -25;
const LX = -55, LZ = 45;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pol = (r, deg, y = 0) => { const a = deg * Math.PI / 180; return [MX + Math.cos(a) * r, y, MZ + Math.sin(a) * r]; };
// Isälven: smältvattenkanal på östra sidan, där isflaket flyter
const RCX = z => 72 + 3.5 * Math.sin(z * 0.09);
const inRiver = (x, z) => z > -38 && z < 50 && Math.abs(x - RCX(z)) < 5.2;
function H(x, z) {
  let h = (N(x * 0.035, z * 0.035) - 0.5) * 2.4;
  h *= ss(17, 23, Math.hypot(x - LX, z - LZ));
  if (z > -40 && z < 52) { const d = Math.abs(x - RCX(z)); const k = ss(6.5, 4.6, d) * ss(52, 47, z) * ss(-40, -35, z); h = h * (1 - k) - 3.2 * k; }
  const rr = Math.hypot(x, z);
  if (rr > 88) h += ((rr - 88) / 7) ** 2 * 6;
  return h;
}
const TIERS = [{ r: 44, top: 4 }, { r: 32, top: 12 }, { r: 22, top: 20 }, { r: 13, top: 28 }, { r: 6, top: 36 }];

export default {
  id: 'ice', name: 'Isfjället', sub: 'Värld 3', icon: '🏔️', color: '#4ac0e8', need: 8, music: 'ice',
  stones: ['Fjällets topp', 'Snökungen Frost', 'Färden på isflaket', 'Kälkfärd med Pingvinen Pingo', 'Klockornas melodi', 'Vindens gömställe'],
  env: {
    sky: { top: 0x2c66d4, mid: 0x86bcf2, hor: 0xf6e4ee, bot: 0xb0c4dc, sunDir: [0.3, 0.25, -0.8], sunCol: 0xfff0dc, haze: 1.2 },
    far: [{ r: 150, n: 70, hMin: 20, hMax: 55, cBot: 0x9fb4d6, cTop: 0xf0f4ff, seed: 44, jag: 0.7 }],
    fog: 0xd8e6f4, fogNear: 50, fogFar: 170,
    hemi: [0xeaf4ff, 0x8aa0c0, 1.3], sun: [0xfff4e8, 2.1], sunDir: [0.4, 1, -0.6], exposure: 0.92
  },
  build(W, B, G, q) {
    W.setSpawn(-5, H(-5, 72) + 0.3, 72, Math.PI);
    W.killY = -20;
    terrain(B, { size: 190, res: 80, height: H, color: (x, y, z, sl, c) => {
      if (sl > 0.5) return c.set(0x8a96a8);
      const n = N(x * 0.3, z * 0.3);
      return c.setRGB(0.88 + n * 0.08, 0.92 + n * 0.06, 0.98);
    } });
    // --- berget i terrasser
    TIERS.forEach((t, i) => {
      const base = i === 0 ? -1 : TIERS[i - 1].top - 0.5;
      B.cyl(MX, t.top - 0.4, MZ, t.r * 0.985, t.top - 0.4 - base, { color: 0x9aa8c0, mat: "noise", seg: 28 });
      B.cyl(MX, t.top, MZ, t.r, 0.4, { color: 0xf4f8ff, seg: 28 });
    });
    // istappar & snökanter (dekor)
    TIERS.slice(0, 4).forEach((t, i) => { for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2 + i; B.cone(MX + Math.cos(a) * t.r * 0.99, t.top - 1.6, MZ + Math.sin(a) * t.r * 0.99, 0.25, 1.2, { rot: [Math.PI, 0, 0], color: 0xbfe8ff, collide: false }); } });
    const ramp = (a, b, w, tag, color) => B.ramp(a[0], a[1], a[2], b[0], b[1], b[2], w, 0.6, { tag, color, mat: tag === 'ice' ? 'ice' : 'plain' });
    // mark → T1 (söder)
    ramp(pol(55, 95, 0), pol(42, 95, 4.0), 5, 'ground', 0xf0f6ff);
    // T1 → T2: isrutschbana (söder)
    const r12a = pol(39, 60, 4), r12b = pol(31, 100, 12);
    ramp(r12a, r12b, 4, 'ice', 0xbfe8ff);
    // T1 → T2: snötrappa (öster)
    for (let i = 0; i < 6; i++) { const p = pol(38, -10 + i * 6.5, 0); B.box(p[0], 4 + (i + 1) * 1.35 - 1, p[2], 3, 2, 3, { color: 0xe8f0ff, ry: i }); }
    // T2 → T3: klättervägg + svävande isblock
    const cw = pol(22.3, 200);
    B.box(cw[0], 16.5, cw[2], 0.6, 8.6, 4, { ry: -200 * Math.PI / 180, mat: 'iceclimb', tag: 'climb' });
    for (let i = 0; i < 5; i++) { const p = pol(27, 300 + i * 9); W.platform({ size: [2.4, 0.5, 2.4], color: 0xbfe8ff, mat: 'ice', tag: 'ice', pos: [p[0], 13.2 + i * 1.6, p[2]], bob: [0.3, 1.5, i] }); }
    // T3 → T4: hiss
    // hissen går tätt längs bergväggen så att man kliver rakt av på T4
    const el = pol(14.7, 40);
    W.platform({ size: [3, 0.5, 3], color: 0x9ab0d0, path: [[el[0], 20.3, el[2]], [el[0], 28.3, el[2]]], speed: 2.5, wait: 1.4, ry: -40 * Math.PI / 180 });
    // T4 → topp: klättervägg + trappa
    const cw2 = pol(6.3, 120);
    B.box(cw2[0], 32.2, cw2[2], 0.6, 8.6, 3, { ry: -120 * Math.PI / 180, mat: 'iceclimb', tag: 'climb' });
    for (let i = 0; i < 4; i++) { const p = pol(9.5, 200 + i * 22); B.box(p[0], 28 + (i + 1) * 1.7 - 0.8, p[2], 2.4, 1.6, 2.4, { color: 0xe8f0ff }); }
    // toppflagga
    B.cyl(MX + 2, 40, MZ + 2, 0.1, 4, { color: 0xdddddd });
    B.box(MX + 2.7, 39.2, MZ + 2, 1.4, 0.8, 0.05, { color: 0xe03a3a, collide: false });
    W.stone(0, MX, 37.6, MZ);
    W.coinRing(MX, 37, MZ, 3.5, 8);
    // vindbyar på T3 och T4
    const gustA = W.wind([MX - 22, 20, MZ - 22, MX + 22, 26, MZ + 22], [0, 0, 0]);
    const gustB = W.wind([MX - 13, 28, MZ - 13, MX + 13, 34, MZ + 13], [0, 0, 0]);
    let gustT = 0;
    W.onUpdate((dt, t, G2) => {
      gustT += dt;
      const cyc = gustT % 7, on = cyc > 4.5;
      const pl = G2.player.pos;
      const dx = pl.x - MX, dz = pl.z - MZ, d = Math.hypot(dx, dz) || 1;
      // blåser utåt
      gustA.f.set(on ? dx / d * 21 : 0, 0, on ? dz / d * 21 : 0); gustB.f.copy(gustA.f);
      if (cyc > 3.6 && cyc < 4.5 && Math.floor(cyc * 4) !== Math.floor((cyc - dt) * 4)) G2.audio.play('whoosh', { vol: 0.3, pitch: 0.5 });
      if (on && pl.y > 19 && Math.random() < 0.8) { for (let k = 0; k < 2; k++) G2.fx.emit(pl.x + (Math.random() - 0.5) * 10, pl.y + Math.random() * 3, pl.z + (Math.random() - 0.5) * 10, { vx: dx / d * 14, vz: dz / d * 14, life: 0.6, size: 0.25, size1: 0.1, color: 0xffffff, alpha: 0.8 }); }
      if (on && pl.y > 19 && !G2._windTold) { G2._windTold = true; G2.toast('Vindbyar! Stå nära bergväggen när det blåser.'); }
      // snöfall
      if (Math.random() < 0.9) G2.fx.emit(pl.x + (Math.random() - 0.5) * 30, pl.y + 10 + Math.random() * 4, pl.z + (Math.random() - 0.5) * 30, { vy: -2.5, vx: Math.sin(t) * 0.5, life: 4, size: 0.18, size1: 0.18, color: 0xffffff, alpha: 0.9 });
    });
    // rullande snöbollar på isrutschbanan
    const balls = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(GEO.sph, new THREE.MeshToonMaterial({ color: 0xf4f8ff })); m.scale.setScalar(1.1); m.castShadow = true; m.userData.sharedGeo = true; m.userData.disposeMat = [m.material];
      W.group.add(m); balls.push({ m, u: i * 0.5 });
    }
    const A = new V3(...r12b), Bv = new V3(...r12a);
    W.add({ update(dt, G2) {
      for (const b of balls) {
        b.u += dt * 0.28; if (b.u > 1) b.u -= 1;
        b.m.position.lerpVectors(A, Bv, b.u); b.m.position.y += 1.1;
        b.m.rotation.x -= dt * 6;
        const pl = G2.player;
        if (pl.pos.distanceTo(b.m.position) < 1.6 + 0.4 && pl.pos.y < b.m.position.y + 0.6) pl.damage(b.m.position);
      }
    } });
    // --- ytor: mynt, fiender, kontrollpunkter
    W.checkpoint(...pol(46, 100, 4), Math.PI / 2);
    W.checkpoint(...pol(30, 110, 12), Math.PI / 2);
    W.checkpoint(...pol(20, 20, 20), 0);
    W.coinLine(pol(53, 95, 1.2), pol(43, 95, 5.2), 4);
    W.coinLine([r12a[0], 6.2, r12a[2]], [r12b[0], 14.4, r12b[2]], 6);
    for (let i = 0; i < 6; i++) { const p = pol(38, -10 + i * 6.5); W.coin(p[0], 4 + (i + 1) * 1.35 + 0.8, p[2]); }
    for (let i = 0; i < 10; i++) W.coin(...pol(40, 140 + i * 14, 5));
    for (let i = 0; i < 8; i++) W.coin(...pol(28, 130 + i * 20, 13));
    for (let i = 0; i < 6; i++) W.coin(...pol(18, 80 + i * 30, 21));
    for (let i = 0; i < 5; i++) { const p = pol(27, 300 + i * 9); W.coin(p[0], 14.6 + i * 1.6, p[2]); }
    enemy(W, 'snogubbe', ...pol(40, 30, 4), {});
    enemy(W, 'snogubbe', ...pol(40, 170, 4), {});
    enemy(W, 'snogubbe', ...pol(28, 250, 12), {});
    enemy(W, 'snogubbe', ...pol(18, 140, 20), {});
    enemy(W, 'snogubbe', -20, H(-20, 30), 30, {});
    enemy(W, 'snogubbe', 40, H(40, 40), 40, {});
    enemy(W, 'taggsvin', 10, H(10, 50), 50, { radius: 8 });
    enemy(W, 'taggsvin', -35, H(-35, 0), 0, { radius: 8 });
    W.heart(...pol(30, 160, 13));
    W.heart(-10, H(-10, 40) + 0.8, 40);
    W.crate(30, H(30, 55), 55, 3);
    W.crate(...pol(30, 60, 12), 3);
    W.crate(-30, H(-30, 60), 60, 3);

    // --- klockgåtan på T2
    const bellDefs = [{ deg: 200, f: 392, c: 0x6ab0ff }, { deg: 222, f: 523, c: 0xffd060 }, { deg: 244, f: 659, c: 0xff7a9a }];
    const bells = bellDefs.map((d, i) => {
      const p = pol(27, d.deg, 12);
      // klockorna hänger lågt nog för en svanssnurr från marken
      B.box(p[0] - 1.2, 13.8, p[2], 0.25, 3.6, 0.25, { color: 0x6a4a2e }); B.box(p[0] + 1.2, 13.8, p[2], 0.25, 3.6, 0.25, { color: 0x6a4a2e }); B.box(p[0], 15.6, p[2], 2.8, 0.25, 0.3, { color: 0x6a4a2e, collide: false });
      const g = new THREE.Group(); g.position.set(p[0], 15.45, p[2]);
      const m = new THREE.MeshToonMaterial({ color: d.c });
      const bell = new THREE.Group(); g.add(bell);
      P(bell, 'cone', m, [0, -0.7, 0], [0.75, 1.1, 0.75]); P(bell, 'sph', toon(0x333333), [0, -1.3, 0], 0.18);
      outline(g, 0.03); g.userData.disposeMat = [m];
      W.group.add(g);
      return { ...d, i, g, bell, p: new V3(p[0], 14.3, p[2]), swing: 0, cool: 0 };
    });
    const melody = [2, 0, 1, 2];
    let prog = 0, solvedB = G.hasStone('ice', 4), demo = null;
    const ring = (b, G2) => { b.swing = 1; G2.audio.tone({ freq: b.f, dur: 0.9, vol: 0.12, type: 'triangle' }); G2.audio.tone({ freq: b.f * 2, dur: 0.6, vol: 0.05, type: 'sine' }); G2.fx.sparkle(b.p.x, b.p.y, b.p.z, 8, b.c); };
    W.add({ update(dt, G2) {
      for (const b of bells) {
        b.swing *= Math.exp(-dt * 2.5); b.bell.rotation.z = Math.sin(G2.world.t * 9) * b.swing * 0.5; b.cool -= dt;
        if (!demo && b.cool <= 0 && G2.player.attackHit(b.p, 0.8)) {
          b.cool = 0.5; ring(b, G2);
          if (solvedB) continue;
          if (melody[prog] === b.i) { prog++; if (prog === melody.length) { solvedB = true; setTimeout(() => W.revealStone(4), 600); } }
          else { prog = b.i === melody[0] ? 1 : 0; G2.audio.play('error', { vol: 0.5 }); }
        }
      }
      if (demo) { demo.t += dt; const k = Math.floor(demo.t / 0.7); if (k !== demo.k && k < melody.length) { demo.k = k; ring(bells[melody[k]], G2); } if (demo.t > melody.length * 0.7 + 0.3) demo = null; }
    }, resetVisit() { prog = 0; } });
    W.npc('pingvin', ...pol(27, 268, 12), Math.PI, 'Klockaren Klas', g => solvedB ? ['Vacker musik! Fjället sjunger med dig.'] : [
      'Mina tre klockor spelar fjällets gamla melodi. Lyssna noga…',
      () => { demo = { t: 0, k: -1 }; prog = 0; return 'Ding… dong… Ring klockorna i samma ordning med svanssnurren!'; },
      'Prata med mig igen om du vill höra melodin en gång till.'
    ]);
    W.stone(4, ...pol(25, 222, 13.6), { hidden: true });

    // --- frusna sjön (boss)
    B.cyl(LX, 0.02, LZ, 19.5, 0.6, { mat: 'ice', tag: 'ice', color: 0xbfe8ff, seg: 40 });
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - 0.1), Math.cos(a - 0.1))) < 0.28) continue; B.sphere(LX + Math.cos(a) * 21, 0.5, LZ + Math.sin(a) * 21, 2.4, 1.6, 2.4, { color: 0xf4f8ff, geo: GEO.ico, rot: [0, i, 0] }); }
    W.checkpoint(LX + 26, H(LX + 26, LZ + 2), LZ + 2, -Math.PI / 2);
    W.stone(1, LX, 1.6, LZ, { hidden: true });
    new Frost(W, new V3(LX, 0.02, LZ), { arenaR: 19, stone: 1 });
    W.coinLine([LX + 30, 1, LZ - 6], [LX + 30, 1, LZ + 6], 5);

    // --- Pingos kälkfärd
    const pingo = W.npc('pingvin', ...pol(46, 92, 4), Math.PI / 2, 'Pingvinen Pingo', null, { mark: true });
    const rs = pol(46, 92, 4);
    const race = new Race(W, pingo, [rs, pol(55, 95, 0), [10, 0, 34], [-12, 0, 22], [-28, 0, 2], [-46, 0, 8], [LX + 24, 0, LZ - 14]], {
      speed: 8.8, gates: [1, 3, 4], stone: 3, finishR: 3.5, hop: false, finishRy: 0.6,
      goal: 'Nedför backen och västerut till sjön – före Pingo!',
      loseLine: 'Wiii! Jag glider ju på magen. Glid du också – huka när du springer!',
      onWin: g => { pingo.marker.visible = false; g.dialog('Pingvinen Pingo', ['Du är ju snabbare än en pingvin på is! Den här stenen hittade jag i snön.'], pingo, () => W.revealStone(3)); }
    });
    W.stone(3, LX + 24, 1.6, LZ - 11, { hidden: true });
    pingo.talk = g => [g.hasStone('ice', 3) ? 'En åktur till?' : 'Hej! Jag åker kälke på magen ända ned till sjön. Hinner du dit först?', { text: 'Tävla mot Pingo?', choices: [['Ja!', () => race.start(g)], ['Nej', null]] }];

    // --- vindens gömställe (uppvind)
    const UX = -40, UZ = -40;
    W.wind([UX - 2.5, -1, UZ - 2.5, UX + 2.5, 30, UZ + 2.5], [0, 62, 0]);
    B.cyl(UX, 0.3, UZ, 2.8, 0.6, { color: 0x9ae0ff, mat: 'glow', collide: false });
    W.onUpdate((dt, t, G2) => { for (let k = 0; k < 2; k++) G2.fx.emit(UX + (Math.random() - 0.5) * 4, Math.random() * 4, UZ + (Math.random() - 0.5) * 4, { vy: 14, life: 2.2, size: 0.3, size1: 0.1, color: 0xdff8ff, alpha: 0.7 }); });
    B.cyl(UX, 31, UZ - 6.5, 4, 1.4, { mat: 'ice', color: 0xbfe8ff, tag: 'ice' });
    B.sphere(UX, 29.6, UZ - 6.5, 3.6, 2, 3.6, { color: 0xdff4ff, geo: GEO.ico, collide: false });
    W.stone(5, UX, 32.6, UZ - 6.5);
    W.coinRing(UX, 8, UZ, 1.2, 4);
    W.coinRing(UX, 18, UZ, 1.2, 4);
    W.npc('sal', UX + 6, H(UX + 6, UZ + 5), UZ + 5, -2.4, 'Sälen Sigge', ['Puh, vilken vind! Den där virveln blåser rakt upp i himlen.', 'Kliv in i den så åker du uppåt – styr sedan mot isflaket däruppe.']);

    // --- bär
    W.coinLine(pol(42, 196, 5.2), pol(42, 204, 5.2), 3);
    W.coinLine(pol(30, 16, 13.2), pol(30, 24, 13.2), 3);
    W.coinLine(pol(20, 296, 21.2), pol(20, 304, 21.2), 3);
    W.coinLine(pol(11, 254, 29.2), pol(11, 266, 29.2), 3);
    W.coinRing(40, H(40, 20) + 1, 20, 2, 5);
    B.plat(-15, 5, -55, 3, 3, 5, { color: 0x8a96a8, mat: 'noise' }); B.box(-15, 2.5, -53.3, 2.6, 5, 0.5, { mat: 'iceclimb', tag: 'climb' });
    W.heart(-15, 6.2, -55); W.coinRing(-15, 6, -55, 1.1, 4);
    W.coinRing(LX, 1, LZ + 14, 2, 4);

    // --- Färden på isflaket: åk flaket nedför den iskalla älven, hoppa över isbågarna och nå holmen
    const fz = [46, 38, 30, 22, 14, 6, -2, -10, -18, -26];
    W.water(-0.7, [62, -38, 84, 50]);
    const river = makeWater(26, 92, { deep: 0x2a7ab0, shallow: 0x9adcf0, amp: 0.08, opacity: 0.86 });
    river.position.set(73, -0.7, 6); W.group.add(river);
    // isflak i kanten av vattnet (dekor)
    for (let i = 0; i < 14; i++) { const z = 44 - i * 6.2, sd = i % 2 ? 1 : -1; B.cyl(RCX(z) + sd * 4.6, -0.55, z, 0.9 + (i % 3) * 0.3, 0.3, { color: 0xeaf6ff, mat: 'ice', collide: false, seg: 7 }); }
    // brygga i söder
    const dock = [RCX(50) , 50.5];
    B.plat(dock[0], 0.35, dock[1], 4, 4.5, 0.4, { mat: 'planks', color: 0xb88a5a });
    for (const [dx, dz] of [[-1.8, -2], [1.8, -2], [-1.8, 2], [1.8, 2]]) B.cyl(dock[0] + dx, 0.35, dock[1] + dz, 0.18, 3.5, { color: 0x6a4a30, seg: 6 });
    const floe = W.platform({ shape: 'cyl', size: [3.8, 0.6, 3.8], color: 0xeaf8ff, mat: 'ice', path: fz.map(z => [RCX(z), -0.55, z]), speed: 3.8, wait: 3, smooth: false,
      decor: r => { for (let i = 0; i < 5; i++) { const a = i * 1.3; P(r, 'cone', 0xdff4ff, [Math.cos(a) * 1.5, 0.32, Math.sin(a) * 1.5], [0.25, 0.4, 0.25]).userData.noOutline = true; } } });
    // isbågar över älven – hoppa över dem medan flaket glider under
    [27, 10, -7].forEach((z, i) => {
      const cx = RCX(z);
      for (const sd of [-1, 1]) B.box(cx + sd * 6, 1.2, z, 1.2, 4.4, 1.2, { color: 0xbfe8ff, mat: 'ice' });
      B.box(cx, 1.05 + i * 0.1, z, 13, 0.5, 0.7, { color: 0xd8f2ff, mat: 'ice', tag: 'nocam' });
      for (let k = -4; k <= 4; k++) B.cone(cx + k * 1.3, 0.55 + i * 0.1, z, 0.14, 0.5, { rot: [Math.PI, 0, 0], color: 0xeaffff, collide: false });
      W.coin(cx, 2.6 + i * 0.1, z);
    });
    // holmen i norr med stenen
    const isl = [RCX(-31.5), -31.5];
    B.cyl(isl[0], 0.25, isl[1], 3.4, 3.2, { color: 0xeaf4ff, seg: 12 });
    B.sphere(isl[0] - 1.2, 0.4, isl[1] - 1, 1.1, 0.9, 1.1, { geo: GEO.ico, color: 0xf4f8ff, collide: false });
    W.stone(2, isl[0] + 0.6, 1.9, isl[1] + 0.4);
    enemy(W, 'snogubbe', RCX(16) + 7.5, H(RCX(16) + 7.5, 16), 16, {});
    enemy(W, 'snogubbe', RCX(-4) - 7.5, H(RCX(-4) - 7.5, -4), -4, {});
    W.npc('sal', dock[0] - 3.2, H(dock[0] - 3.2, 51), 51, 0.4, 'Sälen Selma', [
      'Isflaket glider nedför den iskalla älven ända till holmen i norr – och tillbaka igen.',
      'Akta dig för isbågarna! Hoppa över dem när flaket glider under. Och ramla inte i – vattnet är iskallt!'
    ]);
    W.sign(dock[0] + 3, H(dock[0] + 3, 49), 49, Math.PI + 0.3, ['Isälven', 'Iskallt vatten – bada inte! Åk isflaket till holmen.'], 'Varningsskylt');
    let coldT = 0;
    W.onUpdate((dt, t, g) => {
      coldT -= dt;
      const pl = g.player;
      if (pl.swimming && inRiver(pl.pos.x, pl.pos.z) && coldT <= 0 && pl.state !== 'dead') {
        coldT = 2;
        pl.lastSafe.set(dock[0], 0.6, dock[1] + 0.5);
        g.toast('Brrr! Iskallt vatten – tillbaka till bryggan.', { ms: 2200 });
        g.onFallOut();
      }
    });
    void floe;
    W.coinLine([-5, 1, 64], [-5, 1, 50], 5);
    for (let i = 0; i < 6; i++) W.coin(...pol(40, 220 + i * 14, 5));
    W.coinRing(LX + 27, 1, LZ + 9, 2.5, 6);
    for (let i = 0; i < 8; i++) W.coin(...pol(10, i * 45, 29));
    W.coinTotal(100, [0, H(0, 62) + 1, 62]);
    W.sign(-8, H(-8, 68), 68, Math.PI + 0.5, ['Isfjället', 'Det är halt på isen! Snögubbar kastar snöbollar – snurra för att slå tillbaka dem, eller hoppa på dem.'], 'Skylt');
    // --- dekor
    for (let i = 0; i < 70; i++) { const a = i * 2.39996, r = 50 + (i * 31 % 36); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x - LX, z - LZ) < 24 || Math.hypot(x - MX, z - MZ) < 50 || Math.hypot(x + 5, z - 70) < 10 || Math.hypot(x - UX, z - UZ) < 8 || (z > -42 && z < 56 && Math.abs(x - RCX(z)) < 9) || !clearOf(W, x, z, 3.4)) continue; pine(B, x, H(x, z) - 0.2, z, 1.4 + (i % 4) * 0.25, { solid: true, color: 0x3a7a5a, color2: 0x4a8a6a, snow: true }); }
    W.group.add(makeClouds(14, 200, 42, 60, { seed: 9, emissive: 0x8aa0c0 }));
  }
};
void glow;
