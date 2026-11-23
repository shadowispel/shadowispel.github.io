/* Rävlyan – navvärlden: byn i gläntan med portaler till de fem världarna. */
import * as THREE from 'three';
import { makeNoise, terrain, makeWater, makeClouds, GEO } from '../core.js';
import { pine, oak, bush, cottage, fence, lamp, addGrass, addFlowers, portalMesh, shroom, V3, P } from './common.js';
import { Race } from '../race.js';
import { isTouchDevice } from '../../../engine/kit.js';

const PORTALS = [
  { id: 'forest', a: -50 }, { id: 'cave', a: -25 }, { id: 'ice', a: 0 }, { id: 'islands', a: 25 }, { id: 'tower', a: 50 }
].map(p => { const r = (p.a * Math.PI) / 180; return { ...p, x: Math.sin(r) * 36, z: -Math.cos(r) * 36, ry: -r }; });

const N = makeNoise(11);
function H(x, z) {
  const r = Math.hypot(x, z);
  let h = (N(x * 0.05 + 10, z * 0.05) - 0.5) * 1.4;
  // mjuka kullar i kanten (ingen mur) – en osynlig vägg håller Ylva kvar i gläntan
  if (r > 43) h += Math.min(1, (r - 43) / 14) ** 2 * 6 + Math.max(0, r - 57) * 0.4;
  const dp = Math.hypot(x + 18, z - 10);
  if (dp < 9) { const k = 1 - dp / 9; h -= k * k * (3 - 2 * k) * 3.2; }
  // portalplatåer
  for (const p of PORTALS) { const d = Math.hypot(x - p.x, z - p.z); if (d < 7) h = h * (d / 7) + 0.3 * (1 - d / 7); }
  return h;
}
function pathDist(x, z) {
  const r = Math.hypot(x, z);
  let d = Math.abs(r - 19);
  // stig från start till mitten
  if (z > 0 && z < 40) d = Math.min(d, Math.abs(x));
  // stigar till portalerna
  for (const p of PORTALS) { const t = Math.max(0, Math.min(1, (x * p.x + z * p.z) / (36 * 36))); if (t > 0.5) d = Math.min(d, Math.hypot(x - p.x * t, z - p.z * t)); }
  return d;
}

const tipText = (G, k) => {
  const pad = G.input.gamepad != null, touch = isTouchDevice();
  const T = {
    move: touch ? 'Dra på vänster sida av skärmen för att springa.' : pad ? 'Använd vänster spak för att springa.' : 'Spring med W A S D eller piltangenterna.',
    jump: touch ? 'Tryck på Hoppa. Håll in för ett högre hopp!' : pad ? 'Tryck A för att hoppa. Håll in för ett högre hopp!' : 'Tryck Mellanslag för att hoppa. Håll in för ett högre hopp!',
    double: 'Tryck hopp igen medan du är i luften – ett dubbelhopp!',
    spin: touch ? 'Tryck på Snurr för en svanssnurr – din attack.' : pad ? 'Tryck X för en svanssnurr – din attack.' : 'Tryck E eller vänsterklicka för en svanssnurr – din attack.',
    pound: touch ? 'Hoppa och tryck Huka i luften för en markstöt. Prova på den röda knappen!' : pad ? 'Hoppa och tryck B i luften för en markstöt. Prova på den röda knappen!' : 'Hoppa och tryck C i luften för en markstöt. Prova på den röda knappen!',
    cam: touch ? 'Dra på höger sida för att vrida kameran. Kamera-knappen centrerar den.' : pad ? 'Höger spak vrider kameran. Tryck in den (R3) för att centrera.' : 'Håll höger musknapp och dra för att vrida kameran. Q centrerar den bakom Ylva.',
    done: 'Snyggt! Prata med Ugglan Ulla vid stora eken – hon vet vart du ska.'
  };
  return T[k];
};

export default {
  id: 'hub', name: 'Rävlyan', sub: 'Byn i gläntan', icon: '🏡', color: '#3a6a4a', need: 0, music: 'hub',
  stones: ['Kvarnens topp', 'Kapplöpning med Harald'],
  menuSpot: { p: [5, 0, 15.5], face: 0.5 },
  menuCam: { c: [-2, 0, 6], r: 26, h: 6.5, look: [0, 7.5, 0] },
  portalSpawn: Object.fromEntries(PORTALS.map(p => { const k = (36 - 6) / 36; return [p.id, { p: [p.x * k, 0.6, p.z * k], face: Math.atan2(-p.x, -p.z) }]; })),
  env: {
    sky: { top: 0x070b33, mid: 0x3b2a86, hor: 0xff9a7c, bot: 0x241638, sunDir: [-0.55, 0.05, -0.83], sunCol: 0xffa060, sunSize: 1.4, haze: 1.6, aurora: 'stones', stars: 0.9 },
    fog: 0xc88fa6, fogNear: 55, fogFar: 175,
    hemi: [0xffd6ea, 0x3d5a3a, 1.55], sun: [0xffb070, 2.7], sunDir: [-0.55, 0.42, -0.72], exposure: 1.05,
    far: [{ r: 120, n: 110, hMin: 6, hMax: 16, cBot: 0x3a2a55, cTop: 0x6a4a7e, seed: 4, layers: 1, jag: 0.3 }, { r: 175, n: 70, hMin: 18, hMax: 46, cBot: 0x4a3870, cTop: 0x9a78b4, seed: 9, layers: 1, jag: 0.6 }]
  },
  build(W, B, G, q) {
    W.setSpawn(0, 0.5, 36, Math.PI);
    W.killY = -20;
    // osynlig gräns i kullarna (kameran ignorerar den)
    { const wg = new THREE.CylinderGeometry(52, 52, 40, 48, 1, true); wg.scale(-1, 1, 1); B.add(wg, new THREE.Matrix4().makeTranslation(0, 15, 0), { visible: false, tag: 'nocam' }); wg.dispose(); }
    terrain(B, { size: 140, res: 70, height: H, color: (x, y, z, sl, c) => {
      const pd = pathDist(x, z), dp = Math.hypot(x + 18, z - 10);
      if (dp < 9.5 && y < 0.2) return c.set(0xd8c898);
      if (sl > 0.45) return c.set(0x7a6a5a);
      if (pd < 1.6) return c.set(0xc8a878);
      const n = N(x * 0.3, z * 0.3);
      return c.setRGB(0.32 + n * 0.12, 0.6 + n * 0.12, 0.25);
    } });
    // damm
    W.water(-0.45, [-28, 0, -8, 20]);
    const pond = makeWater(20, 20, { deep: 0x2a6a9a, shallow: 0x5ac0c8, amp: 0.06 });
    pond.position.set(-18, -0.45, 10); W.group.add(pond);
    // bro över dammen
    B.ramp(-18, 0.2, 1.5, -18, 1.1, 6, 2.4, 0.3, { mat: 'planks', color: 0xd0a070 });
    B.plat(-18, 1.1, 10, 2.4, 8, 0.3, { mat: 'planks', color: 0xd0a070 });
    B.ramp(-18, 1.1, 14, -18, 0.2, 18.5, 2.4, 0.3, { mat: 'planks', color: 0xd0a070 });
    for (const zz of [6.5, 13.5]) for (const sx of [-1.1, 1.1]) B.cyl(-18 + sx, 1.1, zz, 0.15, 3, { color: 0x8a6040, seg: 8 });
    // stora eken
    B.cyl(0, 5, -4, 1.4, 5, { color: 0x6a4a2e, seg: 10 });
    B.sphere(0, 7.4, -4, 5.5, 3.6, 5.5, { geo: GEO.ico, color: 0x5aae44, collide: false });
    B.sphere(3, 6.4, -2, 3, 2.4, 3, { geo: GEO.ico, color: 0x4f9e3e, collide: false });
    B.sphere(-3, 6.8, -6, 3.2, 2.4, 3.2, { geo: GEO.ico, color: 0x63b84a, collide: false });
    B.plat(3.2, 0.5, -0.2, 2.6, 0.7, 0.15, { mat: 'planks', color: 0xc08a50 });
    // stugor
    cottage(B, 15, 12, -0.8, 6, 5, 3.2, { lit: true, y: H(15, 12) - 0.1 });
    cottage(B, 26, -6, -1.57, 7, 5, 3.4, { lit: true, y: H(26, -6) - 0.1 });
    cottage(B, -27, -9, 1.57, 6, 5, 3.2, { lit: true, y: H(-27, -9) - 0.1 });
    cottage(B, -9, 25, 0.35, 5, 4.5, 3, { lit: true, y: H(-9, 25) - 0.1 });
    fence(B, 9, 20, 22, 20, H(15, 20)); fence(B, 22, 20, 22, 6, H(22, 12));
    // brunn
    B.cyl(8, H(8, 4) + 0.9, 4, 1.1, 1, { mat: 'bricks', color: 0xffffff });
    B.box(8, H(8, 4) + 2.6, 4, 2.6, 0.2, 2.6, { color: 0xa8322a, rot: [0, 0.78, 0] });
    for (const sx of [-0.9, 0.9]) B.box(8 + sx, H(8, 4) + 1.7, 4, 0.15, 1.8, 0.15, { color: 0x6a4a2e, collide: false });
    // lyktor
    [[4, 27.5], [-4, 18], [10, -12], [-12, -14], [17, 3], [-6, 6]].forEach(([x, z]) => lamp(B, W, x, H(x, z), z));
    // väderkvarn
    const mx = 34, mz = 10, my = H(mx, mz) - 0.2;
    B.add(new THREE.CylinderGeometry(2.6, 3.6, 12, 8), new THREE.Matrix4().makeTranslation(mx, my + 6, mz), { color: 0xe8e0d0, mat: 'planks' });
    const toV = new V3(-mx, 0, -mz).normalize(); const vry = Math.atan2(toV.x, toV.z);
    // rankvägg mot byn
    B.box(mx + toV.x * 5.2, my + 5.1, mz + toV.z * 5.2, 2.6, 9.6, 0.5, { ry: vry, mat: 'vine', tag: 'climb', color: 0xffffff });
    for (const yy of [3, 7]) B.box(mx + toV.x * 4.4, my + yy, mz + toV.z * 4.4, 0.3, 0.3, 1.8, { ry: vry, color: 0x6a4a2e, collide: false });
    // balkong
    B.cyl(mx, my + 10.6, mz, 4.8, 0.3, { mat: 'planks', color: 0xd0a070 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - Math.atan2(toV.x, toV.z) + Math.PI / 2), 1)) < 0) continue; B.box(mx + Math.cos(a) * 4.6, my + 11.1, mz + Math.sin(a) * 4.6, 0.12, 0.9, 0.12, { color: 0x8a6040, collide: false }); }
    // kåpa
    B.box(mx, my + 13.2, mz, 4.4, 2.4, 4.4, { color: 0xa8322a, mat: 'planks' });
    B.plat(mx, my + 14.6, mz, 5, 5, 0.3, { mat: 'roof', color: 0xffffff });
    // vingar (dekor)
    const blades = new THREE.Group(); blades.position.set(mx + toV.x * 2.6, my + 13.2, mz + toV.z * 2.6); blades.rotation.y = vry;
    const hubm = P(blades, 'cyl', 0x5a4030, [0, 0, 0.3], [0.5, 0.6, 0.5], [Math.PI / 2, 0, 0]);
    void hubm;
    const spin = new THREE.Group(); spin.position.z = 0.7; blades.add(spin);
    for (let i = 0; i < 4; i++) { const a = new THREE.Group(); a.rotation.z = i * Math.PI / 2; spin.add(a); P(a, 'box', 0x8a6040, [0, 3.4, 0], [0.25, 6.8, 0.15]); P(a, 'box', 0xf4eedc, [0.55, 4, 0.05], [0.9, 5, 0.06]); }
    blades.userData.update = t => { spin.rotation.z = t * 0.6; };
    W.group.add(blades);
    W.stone(0, mx, my + 15.8, mz);
    // höbalar vid kvarnen
    B.cyl(mx + toV.x * 6.5 + 1.6, my + 1.2, mz + toV.z * 6.5 - 1.2, 0.8, 1.2, { color: 0xe8c860, rot: [Math.PI / 2, 0, 0.3] });
    // träd runt gläntan
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + Math.sin(i * 7) * 0.05, r = 47 + (i % 3) * 4 + Math.sin(i * 3.7) * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (PORTALS.some(p => Math.hypot(p.x - x, p.z - z) < 9)) continue;
      pine(B, x, H(x, z) - 0.2, z, 1.6 + (i % 4) * 0.25, { solid: true, color: 0x2f7d52, color2: 0x47a160 });
    }
    [[-34, 20], [24, 30], [-30, -26], [36, -16], [-10, -30], [12, -30]].forEach(([x, z], i) => oak(B, x, H(x, z), z, 1.2 + (i % 3) * 0.2, { color: [0x5aae44, 0x6ab84a, 0xe0a040][i % 3] }));
    [[6, 14], [-6, 12], [12, 26], [-14, 30], [20, 14], [-22, -18], [28, 22]].forEach(([x, z]) => bush(B, x, H(x, z), z, 1));
    [[-3, 33], [3, 20], [-12, 18], [18, -16]].forEach(([x, z], i) => shroom(B, x, H(x, z), z, 0.9 + i * 0.2, i % 2 ? 0xd83a2e : 0x3a7ae0));
    // grönska
    const grassOK = (x, z) => Math.hypot(x, z) < 44 && pathDist(x, z) > 1.8 && Math.hypot(x + 18, z - 10) > 9.5 && Math.hypot(x, z + 4) > 2;
    addGrass(W, q, 5500, 92, 0, 0, H, grassOK, { color: 0x3f8a32, tip: 0x9ad050 });
    addFlowers(W, q, 260, 88, 0, 0, H, grassOK);
    W.group.add(makeClouds(14, 180, 40, 60, { emissive: 0xa07080, seed: 3 }));
    // portaler
    PORTALS.forEach(p => {
      const def = G.worlds[p.id];
      B.cyl(p.x, 0.6, p.z, 4.2, 1.2, { mat: 'bricks', color: 0xd8d0c8 });
      const open = G.stoneCount() >= def.need;
      const pm = portalMesh(parseInt(def.color.slice(1), 16), open);
      pm.position.set(p.x, 3.1, p.z); pm.rotation.y = p.ry;
      W.group.add(pm);
      // stolpar
      const fx = Math.cos(p.ry), fz = -Math.sin(p.ry);
      for (const s of [-1, 1]) B.box(p.x + fx * s * 2.9, 1.5, p.z + fz * s * 2.9, 0.6, 3, 0.6, { mat: 'bricks', color: 0xd8d0c8 });
      W.sign(p.x + fx * 4.3 - Math.sin(-p.ry) * 0, 0.6, p.z + fz * 4.3, p.ry + Math.PI, [
        `${def.icon} ${def.name}`,
        open ? `Portalen är öppen. Du har ${G.save.stones[p.id].filter(Boolean).length} av ${def.stones.length} stenar härifrån.` : `Portalen sover. Den vaknar när du har ${def.need} Norrskensstenar (du har ${G.stoneCount()}).`
      ], def.name);
      W.add({
        cool: 0,
        update(dt, G2) {
          this.cool -= dt;
          const pl = G2.player.pos;
          const dx = pl.x - p.x, dz = pl.z - p.z;
          const along = dx * fx + dz * fz;
          const nrm = -dx * Math.sin(-p.ry) * 0 + (dx * Math.sin(p.ry) + dz * Math.cos(p.ry));
          void nrm;
          if (Math.abs(along) < 1.8 && Math.hypot(dx, dz) < 1.9 && pl.y < 4.5 && this.cool <= 0) {
            if (G2.stoneCount() >= def.need) { this.cool = 5; G2.travel(p.id); }
            else { this.cool = 3; G2.toast(`Portalen behöver ${def.need} stenar – du har ${G2.stoneCount()}.`); G2.audio.play('error'); }
          }
        }
      });
    });
    // kontrollpunkt (för att återvända)
    // --- NPC:er
    const ulla = W.npc('uggla', 3.4, 0.62, -0.2, Math.PI * 0.1, 'Ugglan Ulla', g => {
      const n = g.stoneCount();
      const next = Object.values(g.worlds).filter(d => d.need > n).sort((a, b) => a.need - b.need)[0];
      if (g.save.done) return ['Ylva, vår hjälte! Norrskenet dansar igen tack vare dig.', 'Det finns kanske fler stenar kvar att hitta – kolla pausmenyn för att se vilka.'];
      const L = [`Du har hittat ${n} Norrskensstenar. Ser du hur norrskenet redan lyser starkare?`];
      if (next) L.push(`Portalen till ${next.name} vaknar när du har ${next.need} stenar.`);
      else L.push('Alla portaler är öppna! Korpen Kaos väntar högst upp i Stormtornet. Var försiktig!');
      L.push('Glöm inte: varje värld har sex stenar. I pausmenyn ser du vilka uppdrag som finns kvar.');
      return L;
    }, { scale: 1.05 });
    void ulla;
    const harald = W.npc('hare', 9, H(9, 33), 33, -0.4, 'Haren Harald', null, { mark: !G.hasStone('hub', 1) });
    const race = new Race(W, harald, [[9, 0, 33], [20, 0, 22], [30, 0, 1], [32, 0, -10], [22, 0, -17], [8, 0, -21], [-10, 0, -22], [-30, 0, -17], [-35, 0, 0], [-32, 0, 21], [-14, 0, 31], [-2, 0, 30], [13, 0, 30]], {
      speed: 8.6, gates: [2, 5, 7, 9], stone: 1, finishR: 3.2, hop: true, finishRy: Math.PI / 2,
      goal: 'Spring genom de blå ljusen runt byn och tillbaka till mållinjen!',
      loseLine: 'Haha! Mina långa ben är svåra att slå. Prata med mig om du vill ha en ny chans!',
      onWin: g => { harald.marker.visible = false; g.dialog('Haren Harald', ['Wow, du är ju snabbare än vinden! Här, ta stenen – Korpen tappade den i mitt morotsland.'], harald, () => W.revealStone(1)); }
    });
    harald.talk = g => [
      g.hasStone('hub', 1) ? 'Du slog mig ju! Vill du springa en gång till – bara för skojs skull?' : 'Hej Ylva! Jag är den snabbaste haren i hela gläntan. Korpen tappade en sten i mitt morotsland – slå mig i ett lopp runt byn så får du den!',
      { text: 'Vill du tävla?', choices: [['Ja, kör!', () => { race.start(g); }], ['Inte nu', null]] }
    ];
    W.stone(1, 13, 1.6, 25.5, { hidden: true });
    W.npc('gravling', 17, H(17, 18), 18, -2.2, 'Grävlingen Greta', [
      'Visste du att du kan göra ett långhopp? Spring, håll ned Huka och hoppa!',
      'Och om du står still, håller Huka och hoppar blir det en bakåtvolt. Bra för att nå höga ställen.',
      'Gröna rankväggar kan du klättra på. Det finns en på väderkvarnen – den som tar sig upp på taket hittar något fint.'
    ]);
    W.npc('alg', -22, H(-22, -21), -21, 0.5, 'Älgen Åke', [
      'Mmm… portalerna där borta vaknade till liv när Korpen stal stenarna.',
      'Börja med Blåbärsskogen längst till vänster. Där är det inte så farligt.',
      'Om du ramlar ner någonstans tappar du ett hjärta. Förlorar du alla hjärtan tappar du dina mynt i världen – men stenarna du hittat behåller du alltid.'
    ], { r: 3.4 });
    W.npc('igelkott', -3, H(-3, 27), 27, 2.4, 'Igelkotten Ivar', [
      'Den röda knappen här bredvid är för tung för mig. Kan du trycka ned den med en markstöt?',
      'Hoppa upp i luften och tryck Huka – PANG! Då åker du rakt ned.'
    ]);
    W.npc('groda', -13, 0, 1.5, 2.6, 'Grodan Gunnar', ['Kvack! Simma kan du göra i dammen. Hoppa upp ur vattnet med hopp-knappen och dyk med Huka.', 'Det finns stenar på konstiga ställen – även under vatten i vissa världar. Kvack!']);
    // markstötsknapp → svampfjäder vid kvarnen
    const spr = { x: mx + toV.x * 9, z: mz + toV.z * 9 + 3 };
    let springMade = false;
    W.button(-5.5, H(-5.5, 30), 30, (b, g) => {
      if (springMade) return;
      springMade = true;
      const s = W.spring(spr.x, H(spr.x, spr.z), spr.z, 24, 'mushroom', 1.1);
      void s;
      g.cutscene(new V3(spr.x, H(spr.x, spr.z) + 1, spr.z), 'En studssvamp växte upp vid väderkvarnen!');
      g.fx.burst(spr.x, H(spr.x, spr.z) + 1, spr.z, 30, { speed: 6, color: [0x3a7ae0, 0xffffff], size: 0.5, life: 0.9 });
    }, { permanent: true });
    W.sign(3, H(3, 37), 37.5, Math.PI + 0.3, ['Välkommen till Rävlyan!', 'Portalerna i norr leder till världarna där Korpen Kaos gömt Norrskensstenarna.', 'Tryck Esc eller P för paus – där ser du vilka stenar som finns kvar.'], 'Välkomstskylt');
    W.heart(10, H(10, 8) + 0.8, 8);
  },
  onEnter(G, W) {
    if (!G.save.intro) {
      G.save.intro = true;
      setTimeout(() => {
        if (G.world !== W) return;
        G.dialog('Ugglan Ulla', [
          'Ylva! Vakna! Något hemskt har hänt i natt…',
          'Korpen Kaos flög över Rävlyan och stal alla Norrskensstenar. Utan dem slocknar norrskenet – och vintern blir evig!',
          'Han har gömt stenarna i världarna bakom portalerna i norr. Varje värld döljer sex stenar.',
          'Du är den snabbaste räven i skogen. Kom till mig vid stora eken när du har värmt upp – jag har mer att berätta.'
        ], null, () => { G.tutStep = 0; G.tutT = 0; });
      }, 700);
    } else if (!G.save.tut) { G.tutStep = 0; G.tutT = 0; }
  },
  tick(G, dt) {
    if (G.save.tut || G.tutStep == null || G.state !== 'play') return;
    const p = G.player;
    G.tutT += dt;
    const steps = ['move', 'jump', 'double', 'spin', 'pound', 'cam', 'done'];
    const k = steps[G.tutStep];
    G.tip(tipText(G, k));
    let ok = false;
    if (k === 'move') { G._tutStart = G._tutStart || p.pos.clone(); ok = p.pos.distanceTo(G._tutStart) > 6; }
    if (k === 'jump') ok = !p.onGround && p.vel.y > 2 && p.airTime > 0.15;
    if (k === 'double') ok = p.flipT > 0 && !p.onGround;
    if (k === 'spin') ok = p.spinT > 0;
    if (k === 'pound') ok = p.state === 'pound' || (G.lastPound && G.world.t - G.lastPound.t < 0.5);
    if (k === 'cam') ok = G.tutT > 1 && (Math.abs(G.rig.idle) < 0.05 || G.rig.recenterT > 0);
    if (k === 'done') ok = G.tutT > 7;
    if (ok && G.tutT > 0.6) {
      G.tutStep++; G.tutT = 0;
      if (k !== 'done') G.audio.play('pickup', { pitch: 1.3 });
      if (G.tutStep >= steps.length) { G.save.tut = true; G.tip(null); G.tutStep = null; }
    }
  }
};
