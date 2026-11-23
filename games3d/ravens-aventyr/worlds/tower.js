/* Stormtornet – vertikal slutvärld: roterande plattformar, vind, blixtar och Korpen Kaos. */
import * as THREE from 'three';
import { makeClouds, GEO, basic } from '../core.js';
import { V3, glow, mesa } from './common.js';
import { enemy } from '../enemies.js';
import { Race } from '../race.js';
import { Kaos } from '../bosses.js';
import { P, outline } from '../models.js';
import { clockFace } from '../missions.js';

const pol = (r, deg, y) => { const a = deg * Math.PI / 180; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
const TR = 7, TOP = 58;
const AC = new V3(0, 84, -30);

export default {
  id: 'tower', name: 'Stormtornet', sub: 'Värld 5', icon: '🌩️', color: '#6a3a8a', need: 20, music: 'tower',
  stones: ['Tornets spira', 'Korpen Kaos', 'Klocktornets nedräkning', 'Kapplöpning med Kråkan Kaja', 'Åskstavarna', 'Molnön'],
  env: {
    sky: { top: 0x07040f, mid: 0x2a1648, hor: 0x7a3a80, bot: 0x120a20, sunDir: [0, -1, 0], stars: 0.25, haze: 0 },
    fog: 0x2a1a3a, fogNear: 40, fogFar: 160,
    hemi: [0xc8b8ff, 0x5a4a6a, 2.3], sun: [0xd8c8ff, 2.2], sunDir: [-0.4, 1, 0.3], exposure: 1.3
  },
  build(W, B, G, q) {
    W.setSpawn(0, 0.3, 22, Math.PI);
    W.killY = -30;
    // --- basön
    mesa(B, 0, 0, 0, 26, 14, { top: 0x5a9a5a, side: 0x5a4a5a, seg: 28 });
    B.cone(0, -26, 0, 22, 12, { rot: [Math.PI, 0, 0], color: 0x4a3a4a, mat: 'noise', collide: false });
    // tornet
    B.cyl(0, TOP, 0, TR, TOP + 1, { mat: 'bricks', color: 0xa898b8, seg: 20 });
    for (let y = 8; y < TOP; y += 10) B.cyl(0, y, 0, TR + 0.3, 0.6, { color: 0x5a4a6a, seg: 20 });
    // tornfönster (glöd)
    for (let i = 0; i < 16; i++) { const p = pol(TR + 0.05, i * 67, 5 + i * 3.3); B.box(p[0], p[1], p[2], 0.8, 1.4, 0.8, { mat: 'glow', color: 0xffc860, collide: false, ry: -i * 67 * Math.PI / 180 }); }
    // topp
    B.cyl(0, TOP + 0.4, 0, 12, 0.8, { mat: 'bricks', color: 0x8a7a9a, seg: 24 });
    for (let i = 0; i < 16; i++) { const p = pol(11.6, i * 22.5, TOP + 1); B.box(p[0], p[1], p[2], 1, 1.2, 1, { mat: 'bricks', color: 0x8a7a9a }); }
    // spira
    B.cyl(0, TOP + 12, 0, 1.4, 12, { color: 0x5a4a6a, seg: 8 });
    B.box(2.75, TOP + 6.95, 0, 0.6, 12.1, 2.4, { mat: 'vine', tag: 'climb' });
    B.box(2.1, TOP + 6.5, 0, 0.8, 0.3, 0.3, { color: 0x5a4a6a, collide: false });
    B.cyl(0, TOP + 12.4, 0, 2.4, 0.5, { color: 0x8a7a9a, seg: 12 });
    W.stone(0, 0, TOP + 13.9, 0);
    W.checkpoint(...pol(9, 200, TOP + 0.8), 0);

    // --- 1: spiralstenar 0 → 14
    const steps = [];
    for (let i = 0; i < 6; i++) { const p = pol(11.5, 100 + i * 34, 2.3 + i * 2.2); B.cyl(p[0], p[1], p[2], 1.7, 1.2, { color: 0x6a5a7a, mat: 'noise', seg: 7 }); W.coin(p[0], p[1] + 1, p[2]); steps.push(p); }
    const b1 = pol(10.5, 300, 14.6);
    B.box(b1[0], 14.3, b1[2], 6, 0.6, 6, { mat: 'planks', color: 0x9a7a5a, ry: -300 * Math.PI / 180 });
    W.checkpoint(b1[0], 14.6, b1[2], 0.5);
    enemy(W, 'spoklykta', ...pol(15.5, 312, 15.2), { radius: 4 });

    // --- 2: roterande armar 14 → 28
    const arm = (y, sp, ph) => W.platform({ pos: [0, y, 0], ry: ph, rot: { axis: 'y', speed: sp }, color: 0x8a6aa0, geo: new THREE.BoxGeometry(7, 0.6, 2.8).translate(TR + 3.6, 0, 0), decor: r => { const g = glow(0xc090ff, 3, 0.35); g.position.set(TR + 6.8, 0.3, 0); r.add(g); } });
    arm(17.6, 0.42, 0); arm(21.2, -0.48, 2); arm(24.6, 0.45, 4);
    const b2 = pol(10.5, 90, 28.3);
    B.box(b2[0], 28, b2[2], 6, 0.6, 6, { mat: 'planks', color: 0x9a7a5a, ry: -Math.PI / 2 });
    W.checkpoint(b2[0] + 1.5, 28.3, b2[2], 0);
    W.coinRing(0, 18.6, 0, TR + 6, 8);

    // --- åskstavarna (pussel på B2)
    const temp = [];
    for (let i = 0; i < 5; i++) { const p = pol(14 + i * 2.6, 70 - i * 9, 29.5 + i * 1.4); temp.push(W.platform({ size: [2.2, 0.4, 2.2], color: 0xffe066, mat: 'glow', pos: p, visible: false })); }
    const sp = pol(28, 30, 36);
    B.cyl(sp[0], 36, sp[2], 1.8, 6, { color: 0x5a4a6a, mat: 'noise', seg: 8 });
    W.stone(4, sp[0], 37.6, sp[2]);
    W.button(b2[0] - 1.5, 28.3, b2[2] + 1.5, (b, g) => { temp.forEach(t => t.setVisible(true)); g.toast('Åskstavarna laddas – skynda dig ut på de lysande plattformarna!'); g.audio.play('zap'); }, { timed: 12, color: 0xffd040, onColor: 0xfff0a0, onTimeout: (b, g) => { temp.forEach(t => t.setVisible(false)); g.audio.play('error'); } });
    W.sign(b2[0] + 2.4, 28.3, b2[2] - 2, -2.2, ['Åskstavarna', 'Tryck ned knappen med en markstöt. I tolv sekunder bär blixtljuset dig ut mot pelaren.'], 'Gnistrande skylt');
    void sp;

    // --- hiss 28 → mot B3, vind & smulande plattformar, klättervägg
    const el = pol(11, 140, 0);
    W.platform({ size: [3, 0.5, 3], color: 0x8a7aa0, mat: 'bricks', path: [[el[0], 28.3, el[2]], [el[0], 33.3, el[2]]], speed: 2.2, wait: 1 });
    for (let i = 0; i < 4; i++) { const p = pol(11.5, 165 + i * 22, 34 + i * 0.4); W.platform({ size: [2.6, 0.5, 2.6], color: 0x8a7a6a, mat: 'noise', pos: p, crumble: true }); W.coin(p[0], p[1] + 1, p[2]); }
    const th = 250 * Math.PI / 180;
    const bt = pol(11, 250, 0);
    B.box(bt[0], 40.5, bt[2], 4, 12, 4, { ry: -th, mat: 'bricks', color: 0x6a5a7a });
    const cw = pol(13.3, 250, 0);
    B.box(cw[0], 40.8, cw[2], 0.6, 12.6, 2.8, { ry: -th, mat: 'vine', tag: 'climb' });
    const sp0 = pol(16, 250, 0);
    B.box(sp0[0], 34.3, sp0[2], 4, 0.6, 4, { ry: -th, mat: 'planks', color: 0x9a7a5a });
    const b3 = pol(11, 250, 46.5);
    W.checkpoint(b3[0], 46.5, b3[2], 0);
    const gust = W.wind([-18, 33, -18, 18, 46, 18], [0, 0, 0]);
    let gt = 0;
    W.onUpdate((dt, t, G2) => {
      gt += dt; const cyc = gt % 7, on = cyc > 5.4;
      const pl = G2.player.pos; const d = Math.hypot(pl.x, pl.z) || 1;
      gust.f.set(on ? -pl.z / d * 16 : 0, 0, on ? pl.x / d * 16 : 0);
      // varning: sus innan vindbyn kommer
      if (pl.y > 31 && pl.y < 48 && cyc > 4.6 && cyc < 5.4 && Math.floor(cyc * 4) !== Math.floor((cyc - dt) * 4)) G2.audio.play('whoosh', { vol: 0.3, pitch: 0.5 });
      if (pl.y > 31 && pl.y < 48 && on && !G2._towerWindTold) { G2._towerWindTold = true; G2.toast('Vindbyar runt tornet! Hoppa när det är lugnt.'); }
      if (on && pl.y > 32 && pl.y < 47 && Math.random() < 0.7) G2.fx.emit(pl.x + (Math.random() - 0.5) * 8, pl.y + Math.random() * 3, pl.z + (Math.random() - 0.5) * 8, { vx: -pl.z / d * 12, vz: pl.x / d * 12, life: 0.6, size: 0.25, size1: 0.1, color: 0xd0c0ff });
    });
    enemy(W, 'krak', 0, 36, 0, { radius: 14, height: 4 });
    enemy(W, 'krak', 0, 20, 0, { radius: 14, height: 3 });

    // --- 4: cirklande plattformar 46 → toppen
    // en roterande spiraltrappa: samma fart, varje platta 3 m högre och ~4,5 m före den förra
    for (let i = 0; i < 3; i++) {
      const y = 49 + i * 3;
      const path = []; for (let k = 0; k < 8; k++) path.push(pol(14.5, k * 45 + 250, y));
      W.platform({ size: [3, 0.5, 3], color: 0x9a80c0, path, loop: true, speed: 2.5, phase: i * 0.052, smooth: false });
    }
    enemy(W, 'krak', 0, 52, 0, { radius: 14, height: 3 });
    enemy(W, 'spoklykta', 4, TOP + 0.8, 5, { radius: 7 });
    W.coinRing(0, TOP + 1.6, 0, 8, 10);

    // --- uppvind till bossarenan
    W.wind([-2.2, TOP, -12.2, 2.2, AC.y + 4, -7.8], [0, 62, -3]);
    B.cyl(0, TOP + 0.9, -10, 2.3, 0.2, { mat: 'glow', color: 0xb090ff, collide: false });
    W.onUpdate((dt, t, G2) => { if (Math.random() < 0.8) G2.fx.emit((Math.random() - 0.5) * 4, TOP + 1 + Math.random() * 3, -10 + (Math.random() - 0.5) * 4, { vy: 14, life: 2, size: 0.3, size1: 0.1, color: 0xd8c8ff, alpha: 0.7 }); });
    B.cyl(AC.x, AC.y, AC.z, 14, 1, { mat: 'bricks', color: 0x6a5a7a, seg: 28 });
    B.cone(AC.x, AC.y - 9, AC.z, 12, 8, { rot: [Math.PI, 0, 0], color: 0x4a3a4a, mat: 'noise', collide: false });
    W.checkpoint(AC.x, AC.y, AC.z + 11, Math.PI);
    // blixtstänger + knappar
    const rods = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const x = AC.x + Math.cos(a) * 11.5, z = AC.z + Math.sin(a) * 11.5;
      B.cyl(x, AC.y + 5, z, 0.2, 5, { color: 0x9a9aa8, seg: 6 });
      const tip = new THREE.Mesh(GEO.sph, basic(0x444455)); tip.position.set(x, AC.y + 5.3, z); tip.scale.setScalar(0.45); tip.userData.sharedGeo = true; W.group.add(tip);
      const gl = glow(0xfff0a0, 4, 0); gl.position.copy(tip.position); W.group.add(gl);
      const rod = { p: new V3(x, AC.y + 5, z), charged: false, t: 0, btn: null };
      rod.zap = (g, kp) => { rod.charged = false; tip.material = basic(0x444455); gl.material.opacity = 0; bolt(g, rod.p, kp); rod.btn && rod.btn.release(); };
      rod.discharge = () => { rod.charged = false; tip.material = basic(0x444455); gl.material.opacity = 0; rod.btn && rod.btn.pressed && rod.btn.release(); };
      rod.btn = W.button(AC.x + Math.cos(a) * 9, AC.y, AC.z + Math.sin(a) * 9, (b, g) => { rod.charged = true; rod.t = 9; tip.material = basic(0xfff0a0); gl.material.opacity = 0.8; g.audio.play('zap'); g.toast('Blixtstången är laddad!', { ms: 1200 }); }, { color: 0xffd040, onColor: 0xfff0a0 });
      W.add({ update(dt) { if (rod.charged) { rod.t -= dt; gl.scale.setScalar(3.5 + Math.sin(W.t * 30) * 0.6); if (rod.t <= 0) rod.discharge(); } } });
      rods.push(rod);
    }
    W.stone(1, AC.x, AC.y + 1.6, AC.z, { hidden: true });
    new Kaos(W, AC.clone(), { arenaR: 14, stone: 1, rods, arenaH: 14 });

    // --- blixtar
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xf0e8ff, transparent: true, opacity: 0, depthWrite: false });
    const boltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 40, 6), boltMat); boltMesh.visible = false; boltMesh.userData.disposeMat = [boltMat]; W.group.add(boltMesh);
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    const warn = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 24).rotateX(-Math.PI / 2), warnMat); warn.visible = false; warn.userData.disposeMat = [warnMat]; W.group.add(warn);
    let boltT = 0;
    const bolt = (g, a, b) => {
      boltMesh.visible = true; boltT = 0.25;
      const mid = a.clone().add(b).multiplyScalar(0.5); boltMesh.position.copy(mid);
      const len = a.distanceTo(b); boltMesh.scale.set(1, len / 40, 1);
      boltMesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
      g.audio.play('boom'); g.audio.play('zap'); g.shake(0.4);
      if (W.sky) W.sky.material.uniforms.flash.value = 0.8;
    };
    let strike = null, nextStrike = 4;
    W.onUpdate((dt, t, G2) => {
      if (W.sky) W.sky.material.uniforms.flash.value *= Math.exp(-dt * 8);
      if (boltT > 0) { boltT -= dt; boltMat.opacity = boltT * 4; if (boltT <= 0) boltMesh.visible = false; }
      if (Math.random() < dt * 0.08 && W.sky) { W.sky.material.uniforms.flash.value = 0.5; setTimeout(() => G2.audio.play('boom', { vol: 0.25, pitch: 0.6 }), 400); }
      const pl = G2.player;
      if (W.bossActive || pl.pos.y < 8 || pl.pos.y > TOP + 20 || G2.state !== 'play') { warn.visible = false; strike = null; return; }
      if (!strike) {
        nextStrike -= dt;
        if (nextStrike <= 0 && pl.onGround) { strike = { p: pl.pos.clone(), t: 1.1 }; warn.position.set(strike.p.x, strike.p.y + 0.08, strike.p.z); warn.visible = true; G2.audio.play('countdown', { pitch: 1.8, vol: 0.4 }); }
      } else {
        strike.t -= dt;
        warnMat.opacity = 0.4 + Math.sin(strike.t * 30) * 0.3;
        if (strike.t <= 0) {
          warn.visible = false;
          bolt(G2, new V3(strike.p.x, strike.p.y + 40, strike.p.z), strike.p);
          G2.fx.burst(strike.p.x, strike.p.y + 0.3, strike.p.z, 18, { speed: 6, color: [0xfff0a0, 0xffffff], size: 0.4, life: 0.5 });
          if (Math.hypot(pl.pos.x - strike.p.x, pl.pos.z - strike.p.z) < 1.9 && Math.abs(pl.pos.y - strike.p.y) < 2) pl.damage(strike.p);
          strike = null; nextStrike = 5 + Math.random() * 4;
        }
      }
    });

    // --- Kajas lopp
    const kaja = W.npc('krake', 6, 0, 16, -2.4, 'Kråkan Kaja', null, { mark: true });
    const race = new Race(W, kaja, [[6, 0, 16], ...steps.map(p => [p[0], p[1] + 0.6, p[2]]), [b1[0], 14.6, b1[2]]], {
      speed: 4.6, gates: [3], stone: 3, finishR: 3, finishRy: 0.5,
      goal: 'Upp för spiralstenarna till första balkongen!',
      loseLine: 'Kraa! Vingar slår ben. Försök igen!',
      onWin: g => { kaja.marker.visible = false; g.dialog('Kråkan Kaja', ['Du har bättre spänst än jag trodde! Kaos är min kusin, men han är elak. Ta stenen och stoppa honom!'], kaja, () => W.revealStone(3)); }
    });
    W.stone(3, b1[0] + 1.5, 16.2, b1[2], { hidden: true });
    kaja.talk = g => [g.hasStone('tower', 3) ? 'Flyger vi en gång till?' : 'Kraa! Jag är Kaja. Flyger jag snabbare upp till balkongen än du hoppar?', { text: 'Tävla mot Kaja?', choices: [['Ja!', () => race.start(g)], ['Nej', null]] }];
    W.npc('uggla', -6, 0, 18, 2.6, 'Ugglan Ulla', g => g.hasStone('tower', 1) ? ['Du klarade det, Ylva!'] : ['Jag flög hit för att se hur det går. Korpen Kaos sitter högst upp – ovanför tornet.', 'Uppvinden på tornets tak tar dig dit. Tryck ned knapparna vid blixtstängerna så laddas de – när Kaos flyger förbi slår blixten ned i honom!', 'Och håll utkik efter blixtringar på marken – flytta dig snabbt!']);

    // --- Molnön (hemlig)
    W.platform({ size: [4, 1, 3.4], color: 0xf0eaff, path: [[22, -0.5, 14], [38, 6, 30], [46, 12, 44]], speed: 2.6, wait: 2, decor: r => { P(r, 'sph', 0xf0eaff, [1.4, 0.3, 0], [1.4, 0.7, 1.4]); P(r, 'sph', 0xf0eaff, [-1.2, 0.3, 0.4], [1.2, 0.6, 1.2]); } });
    B.cyl(54, 12, 52, 6, 2, { color: 0xf0eaff, seg: 14 });
    B.sphere(54, 11.4, 52, 6.5, 2, 6.5, { geo: GEO.ico, color: 0xe0d8ff, collide: false });
    W.stone(5, 54, 13.6, 52);
    W.coinRing(54, 13, 52, 4, 6);
    W.npc('groda', 18, 0, 12, 0.8, 'Molngrodan Majken', ['Kväck! Ibland seglar ett moln förbi kanten här. Vem vet vart det åker?']);

    // --- bär
    W.heart(...pol(15, 0, 9)); B.cyl(...pol(15, 0, 7.6), 1.4, 7.6, { color: 0x5a4a5a, mat: 'noise', seg: 7 });
    W.coin(...pol(TR + 6.5, 200, 19));
    W.coin(...pol(11.5, 209, 35.6));
    W.coin(sp0[0], 35.6, sp0[2]);
    W.coin(...pol(9, 20, TOP + 2));
    W.coinRing(-18, 1.3, -10, 1.5, 5);

    // --- Klocktornets nedräkning: ring i klockan på första balkongen, sedan har du LIMIT sekunder
    //     på dig att ta dig upp via de roterande armarna och ringa i klockan på andra balkongen.
    const LIMIT = 45;
    const clock = clockFace(W.group, new V3(TR + 0.06, 21.2, 0), Math.PI / 2, 3.3);
    const mkBell = (x, y, z, col) => {
      for (const sd of [-0.8, 0.8]) B.box(x + sd, y + 1.1, z, 0.16, 2.2, 0.16, { color: 0x4a3a2a });
      B.box(x, y + 2.25, z, 1.9, 0.18, 0.22, { color: 0x4a3a2a, collide: false });
      const g = new THREE.Group(); g.position.set(x, y + 2.15, z);
      const bell = new THREE.Group(); g.add(bell);
      P(bell, 'cone', col, [0, -0.55, 0], [0.55, 0.85, 0.55]); P(bell, 'sph', 0x2a2a2a, [0, -1.0, 0], 0.13);
      outline(g, 0.03); W.group.add(g);
      return { bell, p: new V3(x, y + 1.5, z), sw: 0, cool: 0 };
    };
    const startBell = mkBell(b1[0] + 1.8, 14.6, b1[2] + 1.2, 0xd0a030);
    const goalBell = mkBell(b2[0] - 2, 28.3, b2[2] - 1.4, 0xe05a4a);
    W.sign(b1[0] - 1.9, 14.6, b1[2] - 1.7, 2.6, ['Klocktornet', `Ring i den gula klockan med en svanssnurr. Sedan har du ${LIMIT} sekunder på dig att ringa i den röda klockan på balkongen ovanför – via de snurrande armarna!`], 'Mässingsskylt');
    W.stone(2, goalBell.p.x, 30.2, goalBell.p.z + 1.6, { hidden: true });
    let ch = null, chDone = G.hasStone('tower', 2);
    const ring = (b, g, f) => { b.sw = 1; b.cool = 0.6; g.audio.tone({ freq: f, dur: 1.1, vol: 0.12, type: 'triangle' }); g.audio.tone({ freq: f * 2.01, dur: 0.7, vol: 0.05, type: 'sine' }); g.fx.sparkle(b.p.x, b.p.y + 0.5, b.p.z, 10, 0xffe080); };
    W.add({
      update(dt, g) {
        for (const b of [startBell, goalBell]) { b.sw *= Math.exp(-dt * 2); b.bell.rotation.z = Math.sin(W.t * 10) * b.sw * 0.5; b.cool -= dt; }
        const pl = g.player;
        if (startBell.cool <= 0 && pl.attackHit(startBell.p, 0.7)) {
          ring(startBell, g, 523);
          if (!ch) { ch = { t: LIMIT, last: LIMIT + 1 }; g.music('race'); g.toast(chDone ? 'Klockan tickar – slå ditt eget rekord!' : 'Klockan tickar! Upp till den röda klockan!', { ms: 2200 }); clock.glow.material.opacity = 0.5; }
        }
        if (ch) {
          ch.t -= dt;
          g.raceText('⏰ ' + Math.max(0, ch.t).toFixed(1) + ' s');
          if (Math.ceil(ch.t) !== ch.last) { ch.last = Math.ceil(ch.t); g.audio.play('countdown', { vol: ch.t < 6 ? 0.5 : 0.25, pitch: ch.t < 6 ? 1.6 : 2.2 }); }
          if (goalBell.cool <= 0 && pl.attackHit(goalBell.p, 0.7)) {
            ring(goalBell, g, 784); setTimeout(() => g.audio.tone({ freq: 1047, dur: 1.2, vol: 0.1, type: 'triangle' }), 180);
            const used = LIMIT - ch.t; ch = null; g.raceText(null); g.music(W.def.music); clock.glow.material.opacity = 0;
            g.bigText('Dong!', 1.2); g.toast(`Du klarade det på ${used.toFixed(1)} sekunder!`, { ms: 2600 });
            if (!chDone) { chDone = true; W.revealStone(2); }
          } else if (ch.t <= 0) {
            ch = null; g.raceText(null); g.music(W.def.music); clock.glow.material.opacity = 0;
            g.audio.play('lose'); g.bigText('Dong …', 1.2); g.toast('Tiden tog slut. Ring i den gula klockan igen!', { ms: 2600 });
          }
        }
        // visarna: minutvisaren varvar under nedräkningen, annars går klockan sakta
        const k = ch ? 1 - ch.t / LIMIT : (W.t / 120) % 1;
        clock.minute.rotation.z = -k * Math.PI * 2; clock.hour.rotation.z = -(k / 12 + 0.25) * Math.PI * 2;
      },
      resetVisit() { if (ch) { ch = null; this.W.G.raceText(null); clock.glow.material.opacity = 0; } },
      W
    });
    // --- övrigt
    W.checkpoint(-4, 0.3, 18, Math.PI);
    enemy(W, 'taggsvin', -12, 0.3, -6, { radius: 7 });
    enemy(W, 'taggsvin', 14, 0.3, -8, { radius: 7 });
    enemy(W, 'krak', -14, 4, 8, { radius: 8, height: 3 });
    W.crate(-16, 0.3, 4, 3); W.crate(12, 0.3, 14, 3);
    W.heart(b3[0], 47.5, b3[2]);
    W.heart(...pol(9, 120, TOP + 1.6));
    W.coinLine([0, 1.3, 20], [0, 1.3, 10], 4);
    W.coinRing(0, 1.3, 0, 18, 12);
    W.coinRing(b1[0], 15.6, b1[2], 2, 4);
    W.coinRing(b2[0], 29.3, b2[2], 2, 4);
    for (let i = 0; i < 5; i++) { const p = pol(14 + i * 2.6, 70 - i * 9, 30.6 + i * 1.4); W.coin(p[0], p[1], p[2]); }
    for (let i = 0; i < 5; i++) W.coin(cw[0] + Math.cos(th) * 0.8, 36 + i * 2.3, cw[2] + Math.sin(th) * 0.8);
    for (let i = 0; i < 8; i++) { W.coin(...pol(14.5, i * 45 + 22, 50.6)); W.coin(...pol(14.5, i * 45, 53.6)); }
    W.coinLine([26, 1.5, 18], [44, 13.5, 42], 4);
    W.coinRing(0, TOP + 1.6, 0, 4, 6);
    W.coinTotal(100, [-8, 1.3, 8]);
    W.sign(3, 0.3, 21, Math.PI - 0.5, ['Stormtornet', 'Korpen Kaos bor högst upp. Akta dig för blixtarna – när en ring lyser på marken: spring!'], 'Varningsskylt');
    W.group.add(makeClouds(22, 160, -20, 80, { color: 0x6a5a8a, emissive: 0x2a1a4a, seed: 15 }));
  },
  onStone(G, idx, first) { if (idx === 1 && first) setTimeout(() => G.ending(), 400); }
};
