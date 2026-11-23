/**
 * Rymdjakt – kampanjen "Nordstjärnans vakt" (12 uppdrag) och överlevnadsläget.
 * Varje uppdrag: metadata för genomgången + ett async-skript som använder MissionRun-API:t.
 */
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = a => a[Math.floor(Math.random() * a.length)];
const rollKeys = g => g.settings.get('adMode') === 'roll' ? '<kbd>A</kbd>/<kbd>D</kbd>' : '<kbd>Q</kbd>/<kbd>E</kbd>';

/** Hoppa ut genom grinden (fraktare, färjor). */
function jumpOut(m, s) {
  m.W.fx.warpIn(s.pos, s.fwd, s.radius * 0.5);
  m.W.sfxAt('warp', s.pos, 1.2);
  s.dead = true; s.jumped = true;
  m.W.removeShip(s);
}
/** Slumpad punkt på ett avstånd från en position. */
function around(c, dist, ySpread = 0.3) {
  const a = Math.random() * Math.PI * 2;
  return c.clone().add(V(Math.cos(a) * dist, (Math.random() - 0.5) * dist * ySpread, Math.sin(a) * dist));
}

export const MISSIONS = [
  /* ================================================================ 1 */
  {
    id: 'm1', title: 'Första flygningen', place: 'Polstjärnan, Vegagränsen', env: 'hemma', music: 'meny', par: 420, reward: 400,
    brief: [
      'Välkommen till Nordstjärneflottan, pilot. Du har anmält dig frivilligt till den flotta som vaktar Vegagränsen – och nu ska du lära dig flyga på riktigt.',
      'Det här är en lugn övningsflygning runt stationen Polstjärnan. Vi går igenom styrning, boost, laser, missiler och motåtgärder i din egen takt.'
    ],
    preview: ['Flyg genom ringarna', 'Använd boosten', 'Skjut ner övningsdrönare', 'Lås och avfyra en missil', 'Skjut en missil utan låsning', 'Fäll motåtgärder', 'Återvänd till Polstjärnan'],
    start: { pos: [0, 0, 0], look: [0, 0, -100] },
    bounds: { center: [0, 0, -1500], radius: 4500 },
    async run(m, g) {
      const st = m.spawn('polstjarnan', { team: 0, pos: [-900, -150, -2600], invulnerable: true, spin: 0.03, throttle: 0 });
      m.group([['ally', 2]], st.pos.clone().add(V(400, 120, 400)), { team: 0, warp: false, exact: true, ai: { passive: true, home: st.pos.clone().add(V(0, 0, 500)) } });
      await m.wait(1.2);
      await m.say('lind', 'Välkommen till Nordstjärneflottan, Stjärna Ett. Jag är kommendör Lind. Innan du får flyga skarpt går vi igenom grunderna.');
      m.tip(m.keys('<b>Klicka i bilden</b> för att styra med musen – den fungerar som en mjuk styrspak. <kbd>W</kbd>/<kbd>S</kbd> ändrar gasen.',
        '<b>Vänster spak</b> styr nosen, <b>höger spak</b> upp/ner ändrar gasen.', 'Dra med fingret på <b>vänster halva</b> av skärmen för att styra. Gasen sköts automatiskt.',
        '<b>Flygspaken</b> tippar och rollar, vrid spaken (eller använd pedalerna) för att gira. <b>Gasreglaget</b> sätter farten direkt. Knapparna ställer du in under Inställningar → Ställ in kontroller.'));
      m.obj('rings', 'Flyg genom ringarna', { progress: '0/5' });
      const pts = [V(0, 0, -420), V(170, 50, -820), V(450, 90, -1100), V(780, 40, -1330), V(1000, -30, -1700)];
      for (let i = 0; i < pts.length; i++) {
        const next = pts[i + 1] || pts[i].clone().add(V(60, 0, -300));
        const ring = m.W.makeRing(pts[i], next, 28, true);
        m.nav('ring', pts[i], 'Ring ' + (i + 1));
        await m.until(() => m.P.pos.distanceTo(pts[i]) < 32);
        m.W.removeExtra(ring); ring.geometry.dispose();
        g.sfx.play('pickup'); m.progress('rings', `${i + 1}/5`);
        if (i === 1) { m.radio('lind', 'Bra! Rolla med ' + (g.settings.get('adMode') === 'roll' ? 'A och D' : 'Q och E') + ' så går svängarna lättare – luta in i svängen och dra nosen uppåt.'); m.tip(m.keys('Rolla med ' + rollKeys(g) + '. Inställningen för A/D finns under Inställningar.', 'Rolla med <b>höger spak</b> åt sidorna eller <b>LB/RB</b>.', null)); }
      }
      m.navOff('ring'); m.done('rings');
      m.tip(m.keys('Håll <kbd>Skift</kbd> för att boosta. Boosten drar energi – den gula mätaren.', 'Håll <b>A</b> för att boosta.', 'Håll in <b>Boost</b>-knappen.', 'Håll boostknappen (' + g.stick.label('boost') + ') för att boosta.'));
      await m.say('lind', 'Snyggt flugit. Prova boosten nu – den ger rejäl fart men tömmer energin.');
      m.obj('boost', 'Boosta i tre sekunder');
      await m.hold(() => m.P.boosting, 3, f => m.progress('boost', Math.round(Math.min(1, f) * 100) + ' %'));
      m.done('boost');
      await m.say('lind', 'Dags för skjutövning. Ingenjör Ek har ställt ut tre drönare framför dig.');
      const d1 = [];
      for (let i = 0; i < 3; i++) d1.push(m.spawn('drone', { team: 1, pos: m.rel(520, (i - 1) * 90, (i % 2) * 40 - 20), ai: { mode: 'static' }, throttle: 0 }));
      m.tip(m.keys('Tryck <kbd>R</kbd> för att välja målet närmast siktet. Skjut med <kbd>vänster musknapp</kbd> eller <kbd>Mellanslag</kbd>.', 'Tryck <b>RB</b> för närmaste mål och skjut med <b>RT</b>.', 'Tryck <b>Mål</b> och håll in <b>Skjut</b>.', 'Välj målet närmast siktet (' + g.stick.label('tnear') + ') och skjut med avtryckaren (' + g.stick.label('fire') + ').'));
      m.obj('d1', 'Skjut ner övningsdrönarna', { progress: '0/3' });
      await m.killAll(d1, 'd1'); m.done('d1');
      await m.say('ek', 'Fint skjutet! Nu rör de sig. Sikta på den gula ringen framför målet – där möts skotten och drönaren.');
      const d2 = [];
      for (let i = 0; i < 3; i++) d2.push(m.spawn('drone', { team: 1, pos: m.rel(650, (i - 1) * 140, 30), ai: { mode: 'wander', range: 260, speedMult: 0.8 + i * 0.15 }, throttle: 1 }));
      m.tip('Den gula <b>förhandsringen</b> visar var du ska sikta på rörliga mål. Låt lasrarna svalna om värmebågen runt siktet blir röd.');
      m.obj('d2', 'Skjut ner de rörliga drönarna', { progress: '0/3' });
      await m.killAll(d2, 'd2'); m.done('d2');
      await m.say('lind', 'Missiler nu. Håll målet framför nosen tills siktet låser – sedan avfyrar du. Du har två missiler i magasinet och de laddas om av sig själva, en i taget.');
      m.P.mag = m.P.magMax;
      const d3 = m.spawn('drone', { team: 1, pos: m.rel(700, 0, 60), ai: { mode: 'wander', range: 200, speedMult: 0.7 }, throttle: 1, hpMult: 2 });
      g.pc.setTarget(d3);
      if (m.P.secondary.lockTime > 0) m.tip(m.keys('Håll målet i siktet tills det står <b>LÅST</b>. Avfyra med <kbd>höger musknapp</kbd> eller <kbd>C</kbd>. Laddningsikonerna nere till höger (och under siktet) visar magasinet.', 'Lås målet och avfyra med <b>LT</b>. Ikonerna under siktet visar magasinet.', 'Lås målet och tryck på <b>Missil</b>.', 'Lås målet och avfyra med missilknappen (' + g.stick.label('missile') + ').'));
      else m.tip(m.keys('Avfyra svärmraketer med <kbd>höger musknapp</kbd> eller <kbd>C</kbd> – de söker själva upp målet.', 'Avfyra med <b>LT</b>.', 'Tryck på <b>Missil</b>.', 'Avfyra med missilknappen (' + g.stick.label('missile') + ').'));
      m.obj('d3', 'Träffa drönaren med en missil');
      let missHint = false;
      await m.until(() => { if (!missHint && m.W.stats.missiles >= 2 && m.P.mag === 0 && !d3.dead) { missHint = true; m.radio('ek', 'Bom? Ingen fara – missilerna laddas om automatiskt. Vänta på låsningen innan du skjuter.', 3); } return d3.dead; });
      m.done('d3');
      // skjut på allt: en missil utan låsning mot ett föremål
      await m.say('ek', 'Missilerna går att skjuta på nästan allt – föremål, asteroider, minor, kanontorn och till och med fiendens missiler. Utan låsning flyger de rakt fram. Prova på containern framför dig!');
      const box = m.spawn('container', { team: 1, pos: m.rel(520, -20, 0), throttle: 0, hpMult: 1 });
      box.name = 'Övningscontainer';
      g.pc.setTarget(box);
      m.tip(m.keys('Rikta nosen mot containern och avfyra (<kbd>höger musknapp</kbd>/<kbd>C</kbd>) – med eller utan låsning. <kbd>R</kbd> väljer det mål siktet pekar på, <kbd>T</kbd> växlar mellan alla synliga mål.', 'Rikta nosen mot containern och avfyra med <b>LT</b>. <b>RB</b> väljer målet närmast siktet, <b>Y</b> växlar mål.', 'Rikta mot containern och tryck på <b>Missil</b>.', 'Rikta nosen mot containern och avfyra (' + g.stick.label('missile') + '). Mål närmast siktet: ' + g.stick.label('tnear') + '.'));
      m.obj('box', 'Förstör containern med en missil');
      await m.until(() => box.dead);
      m.done('box');
      await m.say('dator', 'Varning: simulerad målsökande missil närmar sig. Fäll motåtgärder!');
      m.tip(m.keys('Tryck <kbd>F</kbd> för att fälla motåtgärder när missilvarningen tjuter.', 'Tryck <b>X</b> för motåtgärder.', 'Tryck på <b>Fackla</b>.', 'Fäll motåtgärder (' + g.stick.label('flares') + ') när missilvarningen tjuter. Du kan också skjuta ner missilen med en egen missil!'));
      m.obj('flare', 'Fäll motåtgärder mot missilen');
      let flared = false;
      m.W.on('flare', () => { flared = true; });
      for (let tries = 0; tries < 4; tries++) {
        flared = false;
        m.trainingMissile(m.rel(-950, 250, 120));
        await m.wait(0.5);
        await m.until(() => m.W.missiles.incomingTo(m.P).n === 0);
        if (flared) break;
        m.P.flares = Math.max(m.P.flares, 3);
        await m.say('ek', 'Aj, den träffade! Bara en övningsladdning. Vi tar en till – tryck på motåtgärder när varningen tjuter.');
      }
      m.done('flare'); m.tip(null);
      m.P.mag = m.P.magMax; m.P.flares = m.P.maxFlares;
      await m.say('lind', 'Två saker till: V växlar mellan jakt- och cockpitvy. Med 1, 2 och 3 ger du order till dina vingmän – anfall mitt mål, skydda mig och fri jakt.');
      m.tip(m.keys('<kbd>V</kbd> byter kameravy. <kbd>1</kbd> anfall mitt mål · <kbd>2</kbd> skydda mig · <kbd>3</kbd> fri jakt. <kbd>G</kbd> väljer delsystem på stora skepp.', '<b>Select</b> byter kameravy. Styrkorset ger order till vingmännen.', null));
      m.later(10, () => m.tip(null));
      m.obj('home', 'Återvänd till Polstjärnan');
      const dock = st.pos.clone().add(V(0, 0, 440));
      m.nav('home', dock, 'Polstjärnan');
      await m.until(() => m.P.pos.distanceTo(dock) < 240);
      m.navOff('home'); m.done('home');
      m.secure(); await m.say('lind', 'Godkänt, Stjärna Ett. Välkommen till flottan på riktigt. Gå till hangaren – du har förtjänat några krediter.');
      m.win(2);
    }
  },
  /* ================================================================ 2 */
  {
    id: 'm2', title: 'Gränspatrull', place: 'Kallgrund, yttre patrullbanan', env: 'kalla', music: 'patrull', par: 420, reward: 600, wing: ['varg'],
    brief: [
      'Rutinpatrull längs Kallgrund tillsammans med löjtnant Erik ”Varg” Holm. Flyg till de tre navpunkterna och rapportera vad ni ser.',
      'Fraktbolagen har klagat på försvunna containrar i området. Troligen pirater – men håll ögonen öppna.'
    ],
    preview: ['Flyg till navpunkt Alfa, Beta och Gamma', 'Undersök eventuella fynd', 'Hantera hot'],
    start: { pos: [0, 0, 0], look: [0, 0, -100] },
    bounds: { center: [0, 0, -3500], radius: 7000 },
    async run(m, g) {
      const navA = V(0, 100, -2600), navB = V(2400, 300, -4400), navC = V(-500, -200, -6200);
      const cont = [];
      for (let i = 0; i < 5; i++) { const c = m.spawn('container', { team: 1, pos: navA.clone().add(V((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 260)), throttle: 0 }); c.quat.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)); cont.push(c); }
      await m.wait(1);
      await m.say('lind', 'Stjärna Ett, Varg – rutinpatrull längs Kallgrund. Kontrollera de tre navpunkterna och rapportera.');
      m.radio('varg', 'Kul att äntligen flyga med dig, nykomling. Häng på så visar jag vägen.');
      m.obj('a', 'Flyg till navpunkt Alfa'); m.nav('a', navA, 'Alfa');
      m.tip('Navpunkter visas som gula romber. Följ pilen vid skärmkanten om de ligger utanför bild.');
      m.later(9, () => m.tip(null));
      await m.until(() => m.near(m.P, navA, 350));
      m.navOff('a'); m.done('a');
      await m.say('varg', 'Lastcontainrar … och de är sönderskjutna. Det här var ingen olycka.');
      m.obj('scan', 'Undersök containrarna på nära håll', { optional: true });
      m.task(async () => { await m.until(() => cont.some(c => !c.dead && m.near(m.P, c, 70))); m.done('scan'); m.bonus += 300; m.radio('ek', 'Klomärken i plåten … det där är Järnsvärmens signatur. Det här är inte bra.'); });
      m.obj('b', 'Flyg till navpunkt Beta'); m.nav('b', navB, 'Beta');
      await m.until(() => m.near(m.P, navB, 380));
      m.navOff('b'); m.done('b');
      m.music('strid');
      const sc = m.group([['hugg', 3]], m.rel(1000, 200, 0));
      m.hush();
      await m.say('lind', 'Kontakt! Järnsvärmen – för första gången på tolv år. Stjärna Ett, Varg: bekämpa dem!');
      m.tip(m.keys('<kbd>R</kbd> väljer målet närmast siktet (annars närmaste fiende), <kbd>T</kbd> bläddrar mellan alla synliga mål. Röda markeringar är fiender.', '<b>RB</b> väljer närmaste fiende, <b>Y</b> bläddrar.', 'Tryck <b>Mål</b> för att välja närmaste fiende.'));
      m.later(8, () => m.tip(null));
      m.obj('k1', 'Förstör spaningsjaktplanen', { progress: '0/' + sc.length });
      await m.killAll(sc, 'k1'); m.done('k1');
      await m.say('svarm', 'Ni har ingen aning om vad som kommer, flottfolk. Svärmen vaknar.');
      await m.say('varg', 'Fler lär det bli. Vi kollar Gamma innan vi drar hem. Säg till om du vill att jag håller mig nära dig.');
      m.tip(m.keys('Order till Varg: <kbd>1</kbd> anfall mitt mål · <kbd>2</kbd> skydda mig · <kbd>3</kbd> fri jakt.', 'Order till Varg med styrkorset: upp = anfall mitt mål, ner = skydda mig, vänster = fri jakt.', null));
      m.later(10, () => m.tip(null));
      m.music('patrull');
      m.obj('c', 'Flyg till navpunkt Gamma'); m.nav('c', navC, 'Gamma');
      await m.until(() => m.near(m.P, navC, 420));
      m.navOff('c'); m.done('c');
      m.music('strid');
      const w2 = m.group([['hugg', 2], ['spjut', 1]], m.rel(1100, -300, 200)); // första riktiga striden: hålls hanterbar för nybörjare
      await m.say('dator', 'Varning: Spjut-snabbjakterna bär målsökande missiler. Fäll motåtgärder när varningen tjuter.');
      m.obj('k2', 'Slå tillbaka attacken', { progress: '0/' + w2.length });
      await m.killAll(w2, 'k2'); m.done('k2');
      m.music('patrull');
      m.secure(); await m.say('lind', 'Bra jobbat, båda två. Kom hem – amiralitetet måste få veta det här.');
      m.win(3);
    }
  },
  /* ================================================================ 3 */
  {
    id: 'm3', title: 'Malmkonvojen', place: 'Grusbältets utkant', env: 'grus', music: 'patrull', par: 260, reward: 800, wing: ['varg', 'gnista'],
    brief: [
      'Tre malmfraktare under kapten Mira Sund ska ta sig från gruvorna till hoppgrinden. Järnsvärmen har börjat plundra handelstrafiken.',
      'Fänrik Saga ”Gnista” Berg ansluter till rotegruppen. Minst två fraktare måste nå grinden. Bombplan är det största hotet – de bär torpeder.'
    ],
    preview: ['Eskortera konvojen till hoppgrinden', 'Minst två fraktare måste komma fram', 'Prioritera bombplanen'],
    start: { pos: [-140, 30, 160], look: [-140, 30, -100] },
    bounds: { center: [0, 0, -3300], radius: 6500 },
    asteroids: { count: 150, shape: 'slab', center: [1900, 0, -3200], radius: 1200, thickness: 900, minR: 10, maxR: 95, seed: 3 },
    async run(m, g) {
      m.spawn('gate', { team: 0, pos: [0, 0, -6600], look: [0, 0, -7000], throttle: 0, targetable: false, invulnerable: true });
      const base = [V(0, 0, -600), V(0, 0, -2000), V(-80, 60, -3800), V(0, 0, -5500), V(0, 0, -6700)];
      const fr = [0, 1, 2].map(i => {
        const off = V((i - 1) * 75, (i % 2) * 30, -i * 90);
        return m.protect(m.spawn('frakt', { team: 0, pos: off, look: off.clone().add(V(0, 0, -100)), ai: { path: base.map(p => p.clone().add(off)), speedMult: 1.25 }, name: 'Malmfraktare ' + ['Ett', 'Två', 'Tre'][i], tags: ['convoy'] }));
      });
      let arrived = 0, lost = 0;
      await m.wait(1);
      await m.say('sund', 'Konvoj Malm här. Tre fraktare, fulla lastrum och noll lust att träffa Järnsvärmen. Tack för eskorten.');
      await m.say('lind', 'Konvojen ska nå hoppgrinden. Minst två fraktare måste komma fram – förlora inte fler än en.');
      m.obj('conv', 'Eskortera konvojen till hoppgrinden', { progress: '0/3 framme' });
      m.radio('gnista', 'Gnista här! Äntligen lite action. Jag tar vänsterflanken.');
      let done = false;
      m.task(async () => {
        await m.until(() => {
          for (const f of fr) {
            if (f.jumped || f.dead) continue;
            if (f.ai.arrived || f.ai.pathIdx >= f.ai.path.length) { jumpOut(m, f); arrived++; m.radio('sund', pick(['En fraktare genom grinden!', 'Fraktare i säkerhet!', 'Den är igenom – tack, Stjärna Ett!'])); }
          }
          lost = fr.filter(f => f.dead && !f.jumped).length;
          m.progress('conv', `${arrived}/3 framme` + (lost ? `, ${lost} förlorad${lost > 1 ? 'e' : ''}` : ''));
          return lost >= 2 || arrived + lost >= 3;
        });
        done = true;
        if (lost >= 2) m.lose('Konvojen förlorade för många fraktare.');
        else { m.done('conv'); m.secure(); await m.say('sund', 'Alla som kunde kom fram. Vi står i skuld till er, Nordstjärnan.'); m.win(3); }
      });
      const target = () => fr.find(f => !f.dead && !f.jumped) || m.P;
      await m.wait(16);
      if (done) return;
      m.music('strid');
      const w1 = m.group([['hugg', 4]], around(target().pos, 1500, 0.2), { look: target().pos, ai: { prefer: 'convoy' } });
      w1.forEach((s, i) => { if (i % 2) s.ai.prefer = 'player'; });
      await m.say('svarm', 'Feta byten! Ta fraktarna!');
      await m.until(() => m.alive(w1) <= 1 || done, 45);
      await m.wait(5);
      if (done) return;
      const w2 = m.group([['tordon', 2], ['hugg', 2]], around(target().pos, 1600, 0.2), { look: target().pos, ai: { prefer: 'convoy' } });
      w2.filter(s => s.type === 'tordon').forEach(s => m.mark(s));
      await m.say('varg', 'Bombplan! Tordön-klass med torpeder – ta dem först!');
      await m.until(() => m.alive(w2) <= 1 || done, 50);
      await m.wait(4);
      if (done) return;
      const w3 = m.group([['spjut', 3], ['tordon', 2]], around(target().pos, 1500, 0.2), { look: target().pos, ai: { prefer: 'convoy' } });
      w3.filter(s => s.type === 'tordon').forEach(s => m.mark(s));
      await m.until(() => target().pos.z < -4600 || done, 60);
      if (done) return;
      const kor = m.mark(m.spawn('bastion', { team: 1, pos: [500, 150, -6200], look: [0, 0, -5000], warp: true, ai: { target: target(), standoff: 700 } }));
      await m.say('sund', 'En korvett vid grinden! Den kommer att skjuta oss i bitar!');
      m.obj('kor', 'Förstör korvetten', { optional: true });
      m.task(async () => { await m.until(() => kor.dead); m.done('kor'); });
    }
  },
  /* ================================================================ 4 */
  {
    id: 'm4', title: 'Belägringen av Polstjärnan', place: 'Polstjärnan, Vegagränsen', env: 'hemma', music: 'hot', par: 720, reward: 900, wing: ['varg', 'gnista'],
    brief: [
      'Järnsvärmen har hoppat in i hemsystemet med en hel anfallsstyrka. Målet är Polstjärnan – vår station och vårt hem.',
      'Håll ut mot fem anfallsvågor. Stationens kanontorn hjälper till, men bombplan och stora skepp måste du och din rote stoppa.'
    ],
    preview: ['Skydda Polstjärnan', 'Slå tillbaka fem anfallsvågor', 'Förstör fregatten Klyvare'],
    start: { pos: [0, 120, 700], look: [0, 0, -500] },
    bounds: { center: [0, 0, 0], radius: 6000 },
    async run(m, g) {
      const st = m.protect(m.spawn('polstjarnan', { team: 0, pos: [0, 0, 0], spin: 0.02, throttle: 0 }));
      m.group([['ally', 4]], V(300, 150, 500), { team: 0, warp: false, exact: true, ai: { home: V(0, 0, 0), leash: 2600 } });
      m.task(async () => { await m.until(() => st.dead); m.lose('Polstjärnan föll.'); });
      m.task(async () => { await m.until(() => st.hull < st.maxHull * 0.5); m.radio('kontroll', 'Skrovet på femtio procent! Vi tål inte mycket mer!'); await m.until(() => st.hull < st.maxHull * 0.25); m.radio('kontroll', 'Kritiska skador! Stoppa bombplanen!'); });
      await m.wait(1);
      await m.say('kontroll', 'Alla jaktplan: Polstjärnan under attack! Järnsvärmens flotta har hoppat in i systemet!');
      await m.say('lind', 'Det här är det, Stjärna Ett. Stationen får inte falla. Håll ut tills förstärkningen kommer.');
      m.obj('st', 'Skydda Polstjärnan');
      m.obj('w', 'Slå tillbaka anfallsvågorna', { progress: m.cp === 'w4' ? '4/5' : '1/5' });
      if (m.cp !== 'w4') {
      const W1 = m.group([['hugg', 6]], V(200, 300, -2400), { look: st.pos });
      W1.forEach((s, i) => { if (i < 2) s.ai.prefer = 'player'; });
      await m.until(() => m.alive(W1) <= 1, 90);
      await m.wait(4);
      m.progress('w', '2/5');
      const W2 = m.group([['tordon', 3], ['hugg', 3]], V(2400, 150, 400), { look: st.pos });
      W2.filter(s => s.type === 'tordon').forEach(s => m.mark(s));
      await m.say('varg', 'Bombplan från styrbord! De går mot stationen!');
      await m.until(() => m.alive(W2) <= 1, 100);
      await m.wait(4);
      m.progress('w', '3/5');
      const kor = m.mark(m.spawn('bastion', { team: 1, pos: [-2000, 300, -1600], look: [0, 0, 0], warp: true, ai: { target: st, standoff: 900 } }));
      const W3 = [kor, ...m.group([['hugg', 4]], V(-1800, 400, -1400), { look: st.pos })];
      await m.say('lind', 'En Bastion-korvett! Slå ut dess kanontorn eller sänk den helt.');
      m.obj('kor', 'Förstör korvetten', { optional: true });
      m.task(async () => { await m.until(() => kor.dead); m.done('kor'); });
      await m.until(() => m.alive(W3) <= 1, 120);
      await m.wait(4);
      m.checkpoint('w4');
      }
      m.progress('w', '4/5');
      const W4 = [...m.group([['tordon', 2], ['spjut', 2]], V(0, -400, 2600), { look: st.pos }), ...m.group([['tordon', 2], ['spjut', 1]], V(-2600, 200, 300), { look: st.pos })];
      W4.filter(s => s.type === 'tordon').forEach(s => m.mark(s));
      await m.say('gnista', 'Två grupper samtidigt! Jag tar dem bakifrån!');
      await m.until(() => m.alive(W4) <= 1, 120);
      await m.wait(4);
      m.progress('w', '5/5');
      m.music('strid');
      const fr = m.mark(m.spawn('klyvare', { team: 1, pos: [300, -200, 2800], look: [0, 0, 0], warp: true, ai: { target: st, standoff: 1100 } }));
      const W5 = [fr, ...m.group([['hugg', 4], ['tordon', 2]], V(400, 0, 2600), { look: st.pos })];
      await m.say('lind', 'Fregatt på väg in! Dess skrov skyddas av en sköldgenerator – välj den med G och skjut sönder den först.');
      m.tip(m.keys('<kbd>G</kbd> väljer delsystem på stora skepp: sköldgeneratorer, motorer, kanontorn.', '<b>LB</b> väljer delsystem på stora skepp.', null));
      m.later(10, () => m.tip(null));
      m.obj('fr', 'Förstör fregatten Klyvare');
      await m.until(() => fr.dead);
      m.done('fr');
      await m.until(() => m.alive(W5) === 0, 60);
      m.done('w'); m.done('st');
      m.secure(); await m.say('lind', 'De drar sig tillbaka! Polstjärnan står kvar – tack vare er.');
      m.win(3);
    }
  },
  /* ================================================================ 5 */
  {
    id: 'm5', title: 'Malmkäften', place: 'Grusbältet', env: 'grus', music: 'strid', par: 560, reward: 1100, wing: ['varg', 'gnista'],
    brief: [
      'Spaningen har hittat Järnsvärmens gruvbas Malmkäften, byggd på en jätteasteroid mitt i Grusbältet. Härifrån kommer metallen till deras skepp.',
      'Basen drivs av fyra malmreaktorer. Slå ut dem och hela anläggningen slocknar. Flyg försiktigt – asteroiderna gör ont.'
    ],
    preview: ['Ta dig genom asteroidfältet', 'Förstör de fyra malmreaktorerna', 'Frivilligt: förstör basens kanontorn'],
    start: { pos: [0, 0, 0], look: [0, 0, -100] },
    bounds: { center: [0, 0, -3200], radius: 5400 },
    asteroids: { count: 360, shape: 'sphere', center: [0, 0, -3200], radius: 2500, minR: 12, maxR: 140, seed: 5, avoid: [{ p: V(0, 0, -3200), r: 560 }, { p: V(0, 0, 0), r: 450 }] },
    async run(m, g) {
      const base = m.mark(m.spawn('gruvbas', { team: 1, pos: [0, 0, -3200], throttle: 0, spin: 0.012 }));
      const def = m.group([['hugg', 4]], V(0, 300, -2600), { warp: false, look: V(0, 0, 0), ai: { home: V(0, 0, -3200), leash: 1600 } });
      await m.wait(1);
      await m.say('lind', 'Där är den – Malmkäften. Basen drivs av fyra malmreaktorer. Slå ut alla fyra.');
      await m.say('ek', 'Reaktorerna sitter på ytan, inne i burar. Välj basen och bläddra fram dem med G. Och akta asteroiderna!');
      m.obj('r', 'Förstör malmreaktorerna', { progress: '0/4' });
      const turrets = base.subs.filter(s => s.type === 'turret');
      m.obj('t', 'Förstör basens kanontorn', { optional: true, progress: '0/' + turrets.length });
      m.task(async () => { await m.until(() => { const d = turrets.filter(t => !t.alive).length; m.progress('t', `${d}/${turrets.length}`); return d === turrets.length; }); m.done('t'); });
      const reactors = base.subs.filter(s => s.type === 'target');
      let warned = false;
      await m.until(() => {
        const d = reactors.filter(r => !r.alive).length;
        m.progress('r', `${d}/4`);
        if (d >= 2 && !warned) {
          warned = true;
          m.task(async () => {
            await m.say('vahl', 'Ni vågar röra mina gruvor? Svärmen ser er, små stjärnor.');
            m.group([['hugg', 3], ['spjut', 2]], m.rel(-900, 300, 0), { look: m.P.pos });
            await m.say('varg', 'Förstärkningar bakifrån! Vem var det där – deras ledare?');
            await m.say('lind', 'Överherre Vahl. Om han är här är det värre än vi trott.');
          });
        }
        return d >= 4 || base.dead;
      });
      m.done('r');
      await m.say('gnista', 'Där small det! Hela basen går!');
      const rest = () => m.enemiesAlive(s => !s.isLarge);
      if (rest() > 0) { m.obj('c', 'Rensa området från jaktplan'); await m.until(() => rest() === 0, 120); m.done('c'); }
      m.secure(); await m.say('lind', 'Utmärkt. Svärmen får leta metall någon annanstans. Återvänd.');
      m.win(3);
    }
  },
  /* ================================================================ 6 */
  {
    id: 'm6', title: 'Dimslöjan', place: 'Nebulosan Dimslöjan', env: 'dimma', music: 'hot', par: 600, reward: 1200, wing: ['varg'], radar: 1500,
    brief: [
      'En Klyvare-fregatt har stulit navigationsdata om våra kolonier och gömmer sig i nebulosan Dimslöjan. Sikten är usel och radarn når bara en och en halv kilometer.',
      'Ingenjör Ek har placerat ut sensorbojar. Besök dem för att triangulera fram fregatten – och stoppa den innan den hinner fly.'
    ],
    preview: ['Besök sensorbojarna', 'Se upp för minor och bakhåll', 'Stoppa fregatten innan den flyr'],
    start: { pos: [0, 0, 0], look: [0, 0, -100] },
    bounds: { center: [0, 0, -3200], radius: 6200 },
    async run(m, g) {
      const n1 = V(-800, 100, -1800), n2 = V(900, -150, -3600), n3 = V(0, 200, -5200);
      await m.wait(1);
      await m.say('lind', 'Dimslöjan. Ni ser knappt längre än nosen, och radarn är halvblind. Håll ihop.');
      await m.say('ek', 'Första sensorbojen ligger framför er. Flyg nära så kalibrerar jag.');
      m.obj('n1', 'Besök sensorboj 1'); m.nav('n1', n1, 'Sensorboj 1');
      await m.until(() => m.near(m.P, n1, 260));
      m.navOff('n1'); m.done('n1');
      const amb = m.group([['spjut', 3]], m.rel(650, 100, 0), { look: m.P.pos });
      m.hush();
      await m.say('svarm', 'Välkommen till dimman, flottfolk.');
      m.obj('a1', 'Slå tillbaka bakhållet', { progress: '0/' + amb.length });
      await m.killAll(amb, 'a1'); m.done('a1');
      await m.say('ek', 'Signalen pekar mot boj två. Men jag ser något konstigt runt den …');
      m.obj('n2', 'Besök sensorboj 2'); m.nav('n2', n2, 'Sensorboj 2');
      const mines = [];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; mines.push(m.spawn('mine', { team: 1, pos: n2.clone().add(V(Math.cos(a) * (160 + Math.random() * 240), (Math.random() - 0.5) * 200, Math.sin(a) * (160 + Math.random() * 240) + 250)), throttle: 0 })); }
      await m.until(() => m.near(m.P, n2, 900));
      await m.say('ek', 'Minor! De apterar när du kommer nära – skjut dem på avstånd!');
      m.obj('mines', 'Röj minfältet', { optional: true, progress: '0/12' });
      m.task(async () => { await m.until(() => { const d = mines.filter(x => x.dead).length; m.progress('mines', `${d}/12`); return d >= 12; }); m.done('mines'); });
      await m.until(() => m.near(m.P, n2, 200));
      m.navOff('n2'); m.done('n2');
      await m.say('ek', 'Triangulering klar! Fregatten ligger bakom boj tre – och den har märkt oss.');
      m.obj('n3', 'Flyg till sensorboj 3'); m.nav('n3', n3, 'Sensorboj 3');
      const esc = V(-3600, 600, -6600);
      const fr = m.mark(m.spawn('klyvare', { team: 1, pos: [-300, 100, -5900], look: esc, ai: { path: [esc], speedMult: 0 } }));
      const guard = m.group([['hugg', 3], ['spjut', 1]], V(-200, 200, -5600), { warp: false, look: n3, ai: { home: fr.pos.clone(), leash: 1500 } });
      await m.until(() => m.near(m.P, fr, 1500) || m.near(m.P, n3, 400));
      m.navOff('n3'); m.done('n3');
      fr.ai.speedMult = 1;
      m.hush();
      await m.say('lind', 'Där är den – och den sätter fart mot nebulosans kant! Slå ut motorerna eller sänk den!');
      m.obj('stop', 'Stoppa fregatten innan den flyr');
      m.nav('esc', esc, 'Flyktpunkt');
      m.setTimer(170, () => m.lose('Fregatten kom undan med navigationsdata.'));
      m.task(async () => { await m.until(() => fr.ai.arrived && !fr.dead); m.lose('Fregatten kom undan med navigationsdata.'); });
      await m.until(() => fr.dead || fr.engineFactor === 0);
      m.stopTimer(); m.navOff('esc');
      m.done('stop');
      if (!fr.dead) {
        await m.say('varg', 'Motorerna är döda – den ligger som en sten! Nu tar vi den.');
        m.obj('kill', 'Förstör fregatten');
        await m.until(() => fr.dead);
        m.done('kill');
      }
      await m.say('lind', 'Fregatten är borta, och datan med den. Bra gjort i dimman.');
      if (m.alive(guard) > 0) { m.obj('c', 'Rensa området', { progress: '' }); await m.until(() => m.alive(guard) === 0, 60); m.done('c'); }
      m.win(3);
    }
  },
  /* ================================================================ 7 */
  {
    id: 'm7', title: 'Bakhållet', place: 'Kallgrunds mötesplats', env: 'kalla', music: 'patrull', par: 380, reward: 1300, wing: ['varg', 'gnista'],
    brief: [
      'Järnsvärmen har bett om fredssamtal. Amiral Johan Rask ska träffa deras sändebud vid Kallgrunds mötesplats, och du eskorterar hans färja.',
      'Ingen litar på Svärmen. Fregatten Stormfågel står i beredskap några minuter bort om något skulle gå snett.'
    ],
    preview: ['Eskortera Admiralsfärjan', 'Skydda amiralen', 'Vänta in Stormfågel'],
    start: { pos: [70, 10, 140], look: [70, 10, -100] },
    bounds: { center: [0, 0, -3000], radius: 6500 },
    async run(m, g) {
      const fj = m.protect(m.spawn('farja', { team: 0, pos: [0, 0, 0], look: [0, 0, -100], ai: { path: [V(0, 0, -1500), V(200, 0, -3100), V(0, 0, -5200)], speedMult: 0.9 }, name: 'Admiralsfärjan', tags: ['vip'] }));
      const gn = m.wing[1];
      if (gn) gn.invulnerable = true;
      m.task(async () => { await m.until(() => fj.dead); m.lose('Admiralsfärjan förstördes.'); });
      await m.wait(1);
      await m.say('rask', 'Amiral Rask här. Svärmen vill förhandla. Jag tvivlar, men vi måste försöka. Håll er nära.');
      await m.say('lind', 'Eskortera färjan till mötesplatsen, Stjärna Ett. Inga onödiga risker.');
      m.obj('esc', 'Eskortera Admiralsfärjan till mötesplatsen');
      m.radio('gnista', 'Fredssamtal med dem som sköt på oss förra veckan? Jag håller fingret på avtryckaren.');
      await m.until(() => fj.ai.pathIdx >= 2);
      fj.ai.hold = true;
      m.music('hot');
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; m.spawn('mine', { team: 1, pos: fj.pos.clone().add(V(Math.cos(a) * 420, (Math.random() - 0.5) * 120, Math.sin(a) * 420 - 200)), throttle: 0, warp: true }); }
      m.hush();
      await m.say('vahl', 'Fred? Svärmen förhandlar inte, amiral. Svärmen förtär.');
      await m.say('lind', 'Bakhåll! Skydda amiralen – Stormfågel är på väg men behöver två och en halv minut!');
      m.done('esc');
      m.obj('prot', 'Skydda färjan tills Stormfågel anländer');
      let arrived = false;
      m.setTimer(150, () => { arrived = true; });
      const w1 = m.group([['hugg', 4]], around(fj.pos, 1300, 0.3), { look: fj.pos, ai: { prefer: 'vip' } });
      w1.forEach((s, i) => { if (i % 2) s.ai.prefer = 'player'; });
      await m.until(() => m.alive(w1) <= 1 || arrived, 35);
      const w2 = m.group([['tordon', 2], ['spjut', 2]], around(fj.pos, 1500, 0.3), { look: fj.pos, ai: { prefer: 'vip' } });
      w2.filter(s => s.type === 'tordon').forEach(s => m.mark(s));
      await m.say('varg', 'Bombplan på väg mot färjan!');
      await m.until(() => m.alive(w2) <= 1 || arrived, 35);
      // Gnista tillfångatas
      if (gn && !gn.dead) {
        m.hush();
        gn.ai = null; gn.ctrl.throttle = 0; gn.ctrl.pitch = gn.ctrl.yaw = 0; gn.ctrl.roll = 0.3; gn.ctrl.fire = false;
        await m.say('gnista', 'Något träffade mig – alla system är döda! Jag driver …');
        const kor = m.spawn('bastion', { team: 1, pos: gn.pos.clone().add(V(0, 60, -120)), look: gn.pos, warp: true, throttle: 0, ai: { goal: gn.pos.clone() }, invulnerable: true });
        await m.say('vahl', 'Vi tar med oss en souvenir. Säg adjö till er lilla gnista.');
        await m.wait(2.5);
        m.W.fx.warpIn(gn.pos, gn.fwd, 8); m.W.fx.warpIn(kor.pos, kor.fwd, 30); m.W.sfxAt('warp', kor.pos, 1.5);
        gn.dead = true; m.W.removeShip(gn); kor.dead = true; m.W.removeShip(kor);
        m.lostWing.push('Gnista (tillfångatagen)');
        await m.say('varg', 'NEJ! De tog Gnista! Lind, de tog henne!');
        await m.say('lind', 'Jag vet, Varg. Vi får tillbaka henne. Men nu – skydda amiralen!');
      }
      const w3 = m.group([['hugg', 3], ['spjut', 2]], around(fj.pos, 1300, 0.3), { look: fj.pos, ai: { prefer: 'vip' } });
      await m.until(() => arrived);
      m.done('prot');
      const sf = m.spawn('vaktare', { team: 0, pos: fj.pos.clone().add(V(-500, 120, 600)), look: fj.pos, warp: true, name: 'Fregatten Stormfågel', ai: { goal: fj.pos.clone().add(V(-300, 100, 300)) } });
      m.music('strid');
      await m.say('lind', 'Stormfågel här – vi tar över! Rensa bort resten av dem.');
      void sf; void w3;
      m.obj('c', 'Rensa området');
      await m.until(() => m.enemiesAlive(s => s.kind !== 'mine') === 0, 120);
      m.done('c');
      m.secure(); await m.say('rask', 'Tack, piloter. Fredssamtalen var en fälla – och nu vet vi vad Vahl är kapabel till.');
      m.win(3);
    }
  },
  /* ================================================================ 8 */
  {
    id: 'm8', title: 'Domaren', place: 'Nyhamn, kolonivärlden', env: 'nyhamn', music: 'strid', par: 540, reward: 1600, wing: ['varg'],
    brief: [
      'Kryssaren Domaren är på väg mot kolonivärlden Nyhamn. När den når bombardemangsläge kan den slå ut hela kolonins försvar – och tusentals bor där.',
      'Kryssarens skrov skyddas av två sköldgeneratorer. Slå ut dem, sedan skrovet. Fregatten Stormfågel stöttar med tunga kanoner.'
    ],
    preview: ['Slå ut kryssarens sköldgeneratorer', 'Förstör kryssaren Domaren', 'Frivilligt: förstör hangaren och skydda Stormfågel'],
    start: { pos: [0, 0, 0], look: [0, 100, -1000] },
    bounds: { center: [0, 0, -2500], radius: 7000 },
    async run(m, g) {
      const cr = m.mark(m.spawn('domare', { team: 1, pos: [0, 250, -4800], look: [0, 250, 2000], ai: { path: [V(0, 250, 1800)], launch: { type: 'hugg', every: 24, max: 4 } } }));
      const sf = m.protect(m.spawn('vaktare', { team: 0, pos: [-700, -80, -500], look: [0, 0, -3000], name: 'Fregatten Stormfågel', ai: { target: cr, standoff: 1400 } }));
      const esc = m.group([['hugg', 3], ['spjut', 2]], V(0, 300, -3800), { warp: false, look: V(0, 0, 0) });
      void esc;
      await m.wait(1);
      await m.say('lind', 'Där är Domaren. Når den Nyhamn är kolonin förlorad. Du har ungefär sex minuter.');
      await m.say('ek', 'Två sköldgeneratorer på sidorna. Så länge de lever biter ingenting på skrovet. Välj kryssaren och bläddra fram dem med G.');
      if (m.P.secondary.id === 'torpedo') m.radio('ek', 'Och du har tungtorpeder – perfekt mot kryssare!');
      m.setTimer(390, () => m.lose('Domaren nådde bombardemangsläge över Nyhamn.'));
      const gens = cr.subs.filter(s => s.type === 'shield');
      if (m.cp === 'gens') m.preDestroy(cr, 'shield');
      m.obj('gens', 'Slå ut sköldgeneratorerna', { progress: '0/2' });
      m.obj('hang', 'Förstör kryssarens hangar', { optional: true });
      m.obj('sf', 'Håll Stormfågel vid liv', { optional: true });
      m.task(async () => { await m.until(() => !cr.subs.find(s => s.type === 'hangar').alive); m.done('hang'); m.radio('varg', 'Hangaren brinner – inga fler jaktplan därifrån!'); });
      m.task(async () => { await m.until(() => sf.dead); m.fail('sf'); m.radio('lind', 'Stormfågel är förlorad … fortsätt, Stjärna Ett!'); });
      m.task(async () => { await m.until(() => cr.engineFactor === 0 && !cr.dead); m.stopTimer(); m.radio('ek', 'Motorsektionen är utslagen – den kommer ingenstans nu!'); m.bonus += 500; });
      await m.until(() => { const d = gens.filter(x => !x.alive).length; m.progress('gens', `${d}/2`); return d === 2 || cr.dead; });
      m.done('gens');
      m.checkpoint('gens');
      await m.say('lind', 'Skölden är nere! Allt ni har mot skrovet nu!');
      m.group([['spjut', 2], ['tordon', 2]], around(cr.pos, 1400, 0.3), { look: sf.dead ? m.P.pos : sf.pos });
      m.radio('vahl', 'Domaren faller inte för några myggor!');
      m.obj('kill', 'Förstör kryssaren Domaren');
      await m.until(() => cr.dead);
      m.stopTimer();
      m.done('kill');
      if (!sf.dead) m.done('sf');
      m.secure(); await m.wait(4);
      await m.say('lind', 'Domaren är borta! Nyhamn är räddat. Fantastiskt flugit.');
      m.win(3);
    }
  },
  /* ================================================================ 9 */
  {
    id: 'm9', title: 'Kedjan', place: 'Järnsvärmens gränsland', env: 'rod', music: 'hot', par: 620, reward: 1700, wing: ['varg'],
    brief: [
      'Underrättelsen bekräftar: Gnista finns ombord på fångtransporten Kedjan, tillsammans med tjugo andra fångar. Den är på väg djupt in i Svärmens territorium.',
      'Slå ut transportens två motorer – men skjut INTE sönder skrovet. Därefter dockar en räddningsfärja och hämtar fångarna, och den måste skyddas.'
    ],
    preview: ['Slå ut fångskeppets två motorer', 'Skona skrovet', 'Skydda räddningsfärjan', 'Eskortera färjan ut'],
    start: { pos: [0, 0, 0], look: [0, 0, -100] },
    bounds: { center: [0, 0, -3500], radius: 7000 },
    async run(m, g) {
      const exitP = V(4200, 0, -6800);
      const fang = m.spawn('fangskepp', { team: 1, pos: [0, 0, -3000], look: exitP, ai: { path: [exitP], speedMult: 0.9 } });
      fang.hudMark = 'disable';
      fang.aiIgnore = true; // vingmän och kanontorn får aldrig skjuta på fångskeppet
      fang.hullFloor = Math.round(fang.maxHull * 0.2);
      const esc = m.group([['hugg', 3]], V(0, 200, -2800), { warp: false, look: V(0, 0, 0), ai: { home: fang.pos.clone(), leash: 1600 } });
      const kor = m.spawn('bastion', { team: 1, pos: [300, -150, -3300], look: exitP, ai: { path: [exitP.clone().add(V(200, -150, 0))], speedMult: 0.85 } });
      void esc;
      let floorHit = false;
      m.W.on('floor', s => { if (s === fang) floorHit = true; });
      m.task(async () => { await m.until(() => floorHit); m.lose('Fångskeppets skrov gav vika – fångarna omkom.'); });
      m.task(async () => { await m.until(() => fang.hull < fang.maxHull * 0.45); m.radio('ek', 'Försiktigt med skrovet! Det håller inte mycket mer – sikta bara på motorerna!'); });
      m.task(async () => { await m.until(() => fang.ai.arrived && fang.engineFactor > 0); m.lose('Kedjan kom undan med fångarna.'); });
      await m.wait(1);
      await m.say('lind', 'Där är Kedjan. Gnista och tjugo andra finns ombord. Slå ut motorerna – och bara motorerna.');
      await m.say('varg', 'Håll ut, Gnista. Vi kommer.');
      m.obj('eng', 'Slå ut fångskeppets två motorer', { progress: '0/2' });
      m.obj('hull', 'Skona fångskeppets skrov');
      m.tip(m.keys('Välj fångskeppet och tryck <kbd>G</kbd> tills en motor är markerad.', 'Välj fångskeppet och tryck <b>LB</b> tills en motor är markerad.', null));
      m.later(12, () => m.tip(null));
      const engs = fang.subs.filter(s => s.type === 'engine');
      await m.until(() => { const d = engs.filter(x => !x.alive).length; m.progress('eng', `${d}/2`); return d === 2; });
      m.done('eng');
      m.hush();
      // fångarna gör uppror ombord och stänger av vapnen
      for (const t of fang.subs) if (t.type === 'turret') { t.alive = false; t.hp = 0; }
      await m.say('gnista', 'Gnista här – vi har tagit över vapenkontrollen inifrån! Kanontornen är döda. Men få bort eskorten innan färjan kommer!');
      const escort = () => m.W.teams[1].filter(x => !x.dead && x !== fang);
      if (escort().length) {
        m.obj('clr', 'Rensa bort eskorten', { progress: '' });
        await m.until(() => { const n = escort().length; m.progress('clr', `– ${n} kvar`); return n === 0; }, 150);
        m.done('clr');
      }
      await m.say('lind', 'Fritt fram! Räddningsfärjan hoppar in nu – skydda den medan den dockar.');
      const fj = m.protect(m.spawn('farja', { team: 0, pos: m.P.pos.clone().add(V(200, 80, 400)), look: fang.pos, warp: true, name: 'Räddningsfärjan', tags: ['vip'], hpMult: 1.6, ai: { path: [fang.pos.clone().add(V(0, 40, -90))], speedMult: 1.3 } }));
      m.task(async () => { await m.until(() => fj.dead && !fj.jumped); m.lose('Räddningsfärjan förstördes.'); });
      m.obj('dock', 'Skydda räddningsfärjan under dockningen');
      await m.until(() => fj.ai.arrived || fj.ai.pathIdx >= 1);
      m.radio('vahl', 'Ni tror att ni kan stjäla från Svärmen? Ta dem!');
      const w1 = m.group([['hugg', 3], ['tordon', 1]], around(fang.pos, 1600, 0.3), { look: fang.pos, ai: { prefer: 'vip' } });
      w1.filter(s => s.type === 'tordon').forEach(s => m.mark(s));
      let wave2 = false;
      await m.hold(() => true, 40, f => {
        m.progress('dock', Math.round(f * 100) + ' %');
        if (f > 0.5 && !wave2) { wave2 = true; m.group([['spjut', 2], ['hugg', 1]], around(fang.pos, 1500, 0.3), { look: fang.pos, ai: { prefer: 'player' } }); m.radio('varg', 'Fler snabbjakter – och de är ute efter dig!'); }
      });
      m.done('dock');
      await m.say('gnista', 'Det tog er tid nog! Alla fångar är ombord. Få oss härifrån!');
      fj.ai.path = [V(0, 100, 600)]; fj.ai.pathIdx = 0; fj.ai.arrived = false;
      m.obj('out', 'Eskortera räddningsfärjan ut'); m.nav('out', V(0, 100, 600), 'Hopppunkt');
      await m.until(() => fj.ai.arrived || fj.ai.pathIdx >= 1);
      jumpOut(m, fj);
      m.navOff('out'); m.done('out');
      if (!floorHit) m.done('hull');
      m.secure(); await m.say('lind', 'Färjan är hemma med alla fångarna. Välkommen tillbaka, Gnista.');
      m.win(3);
    }
  },
  /* ================================================================ 10 */
  {
    id: 'm10', title: 'Flykten', place: 'Polstjärnans evakueringskorridor', env: 'flykt', music: 'final', par: 175, reward: 1800, wing: ['varg', 'gnista'],
    brief: [
      'Svärmmodern – Järnsvärmens gigantiska moderskepp – har hoppat in vid Polstjärnan. Ingenting vi har kan stoppa den. Stationen evakueras.',
      'Ta dig genom asteroidkorridoren till hoppgrinden innan Svärmen slår ut grindens kraftstation. Du har tre minuter.'
    ],
    preview: ['Nå hoppgrinden innan den stängs', 'Undvik minor och asteroider', 'Frivilligt: rädda en fraktare'],
    start: { pos: [0, 0, 0], look: [0, 0, -100] },
    bounds: { center: [0, 0, -4500], radius: 6800 },
    asteroids: { count: 280, shape: 'slab', center: [0, 0, -4600], radius: 2500, thickness: 800, minR: 10, maxR: 120, seed: 10, avoid: [{ p: V(0, 0, 0), r: 500 }, { p: V(0, 0, -9000), r: 700 }] },
    async run(m, g) {
      const gate = V(0, 0, -9000);
      m.spawn('gate', { team: 0, pos: gate, look: [0, 0, -9500], throttle: 0, targetable: false, invulnerable: true });
      const mod = m.spawn('modern', { team: 1, pos: [0, 900, 4600], look: [0, 900, 0], throttle: 0, targetable: false, invulnerable: true, ai: {} });
      mod.ai = null;
      const fr = [0, 1].map(i => m.protect(m.spawn('frakt', { team: 0, pos: [(i ? 1 : -1) * 220, -60, 200], look: [(i ? 1 : -1) * 220, -60, -100], name: 'Evakueringsfraktare ' + (i + 1), tags: ['convoy'], ai: { path: [V((i ? 1 : -1) * 220, -60, -2000), V((i ? 1 : -1) * 120, 0, -6000), V(0, 0, -9100)], speedMult: 1.9 } })));
      await m.wait(0.8);
      await m.say('lind', 'Svärmmodern är här! Polstjärnan kan inte hållas – alla skepp genom hoppgrinden, NU!');
      m.obj('gate', 'Nå hoppgrinden innan den stängs');
      m.nav('gate', gate, 'Hoppgrinden');
      m.setTimer(180, () => m.lose('Hoppgrinden stängdes innan du hann igenom.'));
      m.obj('frakt', 'Se till att minst en fraktare kommer fram', { optional: true });
      let saved = 0;
      m.task(async () => {
        await m.until(() => { for (const f of fr) if (!f.dead && !f.jumped && (f.ai.arrived || f.ai.pathIdx >= f.ai.path.length)) { jumpOut(m, f); saved++; } return saved > 0 || fr.every(f => f.dead); });
        if (saved > 0) { m.done('frakt'); m.radio('kontroll', 'Fraktaren är igenom grinden!'); } else m.fail('frakt');
      });
      await m.say('kontroll', 'Grinden stängs om tre minuter när kraftstationen faller. Flyg!');
      m.tip(m.keys('Boosta med <kbd>Skift</kbd> – men spara energi till svängarna runt asteroiderna.', 'Boosta med <b>A</b>.', 'Använd <b>Boost</b>.'));
      m.later(8, () => m.tip(null));
      for (let i = 0; i < 14; i++) m.spawn('mine', { team: 1, pos: [(Math.random() - 0.5) * 900, (Math.random() - 0.5) * 300, -6400 - Math.random() * 600], throttle: 0 });
      m.task(async () => {
        for (let k = 0; k < 5; k++) {
          await m.wait(k === 0 ? 14 : 26);
          const behind = m.P.pos.clone().add(V((Math.random() - 0.5) * 600, 200, 1300));
          m.group([['spjut', 2], ['hugg', 1]], behind, { look: m.P.pos, ai: { prefer: 'player' } });
          if (k === 0) m.radio('varg', 'Snabbjakter i baken! Fortsätt flyga – de hinner inte ikapp!');
        }
      });
      m.task(async () => { await m.wait(45); m.group([['hugg', 4]], V(0, 100, -6000), { look: V(0, 0, 0) }); m.radio('gnista', 'Jaktplan framför oss! Rakt igenom dem!'); });
      m.task(async () => { await m.wait(95); m.spawn('bastion', { team: 1, pos: [600, 200, -8300], look: [0, 0, -7000], warp: true, ai: { target: m.P, standoff: 600 } }); m.radio('ek', 'Korvett vid grinden! Flyg förbi den – den är inte värd tiden!'); });
      m.task(async () => { await m.wait(30); m.radio('vahl', 'Fly, små stjärnor. Fly så långt ni kan. Svärmen hittar er ändå.'); });
      await m.until(() => m.P.pos.distanceTo(gate) < 125);
      m.stopTimer();
      m.done('gate'); m.navOff('gate');
      m.W.fx.warpIn(m.P.pos, m.P.fwd, 10); g.sfx.play('warp');
      g.pc.disabled = true;
      m.secure(); await m.say('lind', 'Du är igenom! Alla som kunde ta sig ut har gjort det. Nu samlar vi oss – och slår tillbaka.');
      m.win(2);
    }
  },
  /* ================================================================ 11 */
  {
    id: 'm11', title: 'Smedjan', place: 'Järnsvärmens varv', env: 'rod', music: 'strid', par: 720, reward: 2200, wing: ['varg', 'gnista'],
    brief: [
      'Smedjan är varvet där Järnsvärmen bygger sina skepp – och där Svärmmoderns sköldkoder förvaras. Utan dem kan vi aldrig skada moderskeppet.',
      'Slå ut varvets sköldgeneratorer, flyg nära kontrolltornet så att Ek kan ladda ner koderna, och jämna sedan varvet med marken. Stormfågel och fyra jaktplan anfaller med dig.'
    ],
    preview: ['Slå ut sköldgeneratorerna', 'Ladda ner sköldkoderna vid kontrolltornet', 'Förstör dockkärnorna och kontrolltornet'],
    start: { pos: [0, 0, 900], look: [0, 0, 0] },
    bounds: { center: [0, 0, -2600], radius: 6500 },
    async run(m, g) {
      const yard = m.mark(m.spawn('varv', { team: 1, pos: [0, 0, -3000], throttle: 0, spin: 0.01 }));
      const sf = m.protect(m.spawn('vaktare', { team: 0, pos: [-600, 0, 500], look: [0, 0, -3000], name: 'Fregatten Stormfågel', ai: { target: yard, standoff: 1500 } }));
      m.group([['ally', 4]], V(300, 100, 600), { team: 0, warp: false, exact: true });
      const guard = m.spawn('klyvare', { team: 1, pos: [900, 250, -2200], look: [0, 0, 0], ai: { target: sf, standoff: 1200 } });
      m.group([['hugg', 4], ['spjut', 2]], V(0, 300, -2400), { warp: false, look: V(0, 0, 0) });
      void guard;
      await m.wait(1);
      await m.say('lind', 'Smedjan. Allt Järnsvärmen flyger har byggts här. I dag stänger vi den.');
      await m.say('ek', 'Först sköldgeneratorerna – en på toppen och en på undersidan av tornet.');
      const gens = yard.subs.filter(s => s.type === 'shield');
      if (m.cp) m.preDestroy(yard, 'shield');
      m.obj('gens', 'Slå ut sköldgeneratorerna', { progress: '0/2' });
      m.obj('sf', 'Håll Stormfågel vid liv', { optional: true });
      m.task(async () => { await m.until(() => sf.dead); m.fail('sf'); });
      await m.until(() => { const d = gens.filter(x => !x.alive).length; m.progress('gens', `${d}/2`); return d === 2; });
      m.done('gens');
      if (!m.cp) m.checkpoint('gens');
      const tower = yard.subs.find(s => s.name === 'Kontrolltornet');
      await m.say('ek', 'Skölden är nere! Flyg nära kontrolltornet och håll dig där – jag behöver tolv sekunder för att ladda ner koderna.');
      m.obj('codes', 'Ladda ner sköldkoderna (håll dig nära kontrolltornet)', { progress: '0 %' });
      m.nav('codes', tower.w.clone(), 'Kontrolltornet');
      m.radio('vahl', 'Rör inte mitt varv!');
      m.group([['hugg', 3], ['spjut', 2]], around(yard.pos, 1500, 0.3), { look: yard.pos, ai: { prefer: 'player' } });
      let acc = m.cp === 'codes' ? 12 : 0, last = m.t;
      await m.until(() => {
        const dt = m.t - last; last = m.t;
        if (!tower.alive) return true;
        if (m.P.pos.distanceTo(tower.w) < 320) acc += dt;
        m.progress('codes', Math.round(Math.min(1, acc / 12) * 100) + ' %');
        const n = m.W.navs.find(x => x.id === 'codes'); if (n) n.pos.copy(tower.w);
        return acc >= 12;
      });
      m.navOff('codes'); m.done('codes');
      m.checkpoint('codes');
      if (acc < 12) await m.say('ek', 'Tornet är borta – men jag hann få ut tillräckligt ur nätverket. Jämna resten med marken!');
      else await m.say('ek', 'Koderna är mina! Nu kan Svärmmoderns sköld knäckas. Jämna varvet med marken!');
      const targets = yard.subs.filter(s => s.type === 'target');
      m.obj('t', 'Förstör dockkärnorna och kontrolltornet', { progress: `0/${targets.length}` });
      await m.until(() => { const d = targets.filter(x => !x.alive).length; m.progress('t', `${d}/${targets.length}`); return d === targets.length || yard.dead; });
      m.done('t');
      if (!sf.dead) m.done('sf');
      m.secure(); await m.say('gnista', 'Smedjan brinner! Det där var för Kedjan!');
      await m.wait(3);
      await m.say('lind', 'Strålande. Nu vet vi hur vi knäcker moderskeppet. Gör er redo – nästa strid blir den sista.');
      m.win(3);
    }
  },
  /* ================================================================ 12 */
  {
    id: 'm12', title: 'Svärmmodern', place: 'Svärmens hjärta', env: 'djup', music: 'final', par: 900, reward: 3000, wing: ['varg', 'gnista'],
    brief: [
      'Allt vi har samlas för en sista strid. Med sköldkoderna från Smedjan kan vi äntligen nå Svärmmoderns hjärta: kärnreaktorn.',
      'Först hangarkapslarna, som spottar ut jaktplan. Sedan de två sköldgeneratorerna. När skölden faller ligger kärnreaktorn öppen. Nordstjärnan räknar med dig.'
    ],
    preview: ['Förstör de fyra hangarkapslarna', 'Slå ut de två sköldgeneratorerna', 'Förstör kärnreaktorn'],
    start: { pos: [0, 0, 1600], look: [0, 0, 0] },
    bounds: { center: [0, 0, -1600], radius: 7200 },
    async run(m, g) {
      const mod = m.mark(m.spawn('modern', { team: 1, pos: [0, 0, -3000], look: [1000, 0, -3000], throttle: 0, ai: { launch: { type: 'hugg', every: 13, max: 8 } } }));
      const sf = m.spawn('vaktare', { team: 0, pos: [-700, 0, 700], look: [0, 0, -3000], name: 'Fregatten Stormfågel', ai: { target: mod, standoff: 1500 } });
      const nl = m.spawn('vaktare', { team: 0, pos: [700, 120, 500], look: [0, 0, -3000], name: 'Fregatten Nordljus', ai: { target: mod, standoff: 1600 } });
      void sf; void nl;
      m.group([['ally', 6]], V(0, 150, 900), { team: 0, warp: false, exact: true });
      m.group([['hugg', 4], ['spjut', 2]], V(0, 200, -2000), { warp: false, look: V(0, 0, 0) });
      await m.wait(1);
      await m.say('rask', 'Till alla skepp: det här är vår enda chans. Svärmmodern får inte lämna systemet.');
      await m.say('lind', 'Stjärna Ett – hangarkapslarna först, annars dränks vi i jaktplan.');
      const hang = mod.subs.filter(s => s.type === 'hangar'), gens = mod.subs.filter(s => s.type === 'shield'), core = mod.subs.find(s => s.type === 'reactor');
      if (m.cp) m.preDestroy(mod, 'hangar');
      if (m.cp === 'gens') m.preDestroy(mod, 'shield');
      m.obj('hang', 'Förstör hangarkapslarna', { progress: '0/4' });
      let ev1 = false;
      await m.until(() => {
        const d = hang.filter(x => !x.alive).length; m.progress('hang', `${d}/4`);
        if (d >= 2 && !ev1) { ev1 = true; m.radio('vahl', 'Ni river i mitt skal som barn med stenar. Svärmen är oändlig!'); m.group([['spjut', 4]], m.rel(-1200, 300, 0), { look: m.P.pos, ai: { prefer: 'player' } }); }
        return d === 4;
      });
      m.done('hang');
      if (!m.cp) m.checkpoint('hangars');
      await m.say('varg', 'Hangarerna är tysta! Inga fler jaktplan från det där monstret.');
      m.obj('gens', 'Slå ut sköldgeneratorerna', { progress: '0/2' });
      await m.say('ek', 'Generatorerna sitter ovanför och under ryggraden, bakom ringen. Koderna gör skölden svag – skjut!');
      let ev2 = false;
      await m.until(() => {
        const d = gens.filter(x => !x.alive).length; m.progress('gens', `${d}/2`);
        if (d >= 1 && !ev2) { ev2 = true; m.group([['tordon', 3], ['hugg', 2]], around(mod.pos, 1800, 0.3), { look: V(0, 0, 0), ai: { prefer: 'large' } }); m.radio('lind', 'Bombplan mot våra fregatter!'); }
        return d === 2;
      });
      m.done('gens');
      m.checkpoint('gens');
      m.music('final');
      m.hush();
      await m.say('ek', 'Skölden är nere – kärnreaktorn ligger bar bakom ringen! Allt du har!');
      m.radio('vahl', 'Om jag faller, så faller jag i eld – och tar er med mig!');
      m.obj('core', 'Förstör kärnreaktorn');
      g.pc.setTarget(mod); g.targetSub = core;
      m.group([['hugg', 4], ['spjut', 3]], m.rel(-1000, 200, 0), { look: m.P.pos });
      await m.until(() => mod.dead);
      m.done('core');
      m.hush();
      m.secure(); await m.say('lind', 'Den går! Svärmmodern går under!');
      await m.wait(4.5);
      await m.say('rask', 'Till alla skepp … vi har vunnit. Nordstjärnan lyser igen. Tack, Stjärna Ett.');
      m.flags.campaignDone = true;
      m.win(4);
    }
  }
];

/* ================================================================ Överlevnad */
export const SURVIVAL = {
  id: 'survival', title: 'Överlevnad', place: 'Övningsfältet Vargklippan', music: 'strid', par: 0, reward: 0,
  get env() { return pick(['hemma', 'grus', 'rod', 'djup', 'kalla']); },
  start: { pos: [0, 0, 600], look: [0, 0, 0] },
  bounds: { center: [0, 0, 0], radius: 3400 },
  asteroids: { count: 130, shape: 'sphere', center: [0, 0, 0], radius: 2600, minR: 14, maxR: 120, seed: 77, avoid: [{ p: V(0, 0, 0), r: 700 }, { p: V(0, 0, 600), r: 300 }] },
  onKill(m, s, from) { if (from && from.isPlayer && s.team === 1 && m.wave > 1) m.extraScore += Math.round(s.points * 0.15 * (m.wave - 1)); },
  async run(m, g) {
    m.wave = 0;
    await m.wait(1);
    await m.say('dator', 'Överlevnadsläge. Vågorna blir större och större. Hur länge håller du?');
    for (;;) {
      m.wave++;
      const w = m.wave;
      g.hud.flashMsg('Våg ' + w, 2.5);
      g.sfx.play('levelup');
      const list = [['hugg', 2 + Math.floor(w * 0.9)]];
      if (w >= 3) list.push(['tordon', Math.floor((w - 1) / 2)]);
      if (w >= 4) list.push(['spjut', Math.floor((w - 2) / 2)]);
      const groups = Math.min(3, 1 + Math.floor(w / 3));
      const spawned = [];
      for (let k = 0; k < groups; k++) {
        const part = list.map(([t, n]) => [t, Math.max(0, Math.round(n / groups + (k === 0 ? n % groups : 0)))]).filter(x => x[1] > 0);
        spawned.push(...m.group(part, around(m.P.pos, 1400 + Math.random() * 400, 0.4), { look: m.P.pos, exact: true }));
      }
      if (w % 5 === 0) spawned.push(m.mark(m.spawn('bastion', { team: 1, pos: around(m.P.pos, 1700, 0.2), look: m.P.pos, warp: true, ai: { target: m.P, standoff: 700 } })));
      if (w % 8 === 0) spawned.push(m.mark(m.spawn('klyvare', { team: 1, pos: around(m.P.pos, 2000, 0.2), look: m.P.pos, warp: true, ai: { target: m.P, standoff: 900 } })));
      if (w % 4 === 0) for (let i = 0; i < 8; i++) m.spawn('mine', { team: 1, pos: around(V(0, 0, 0), 300 + Math.random() * 900, 0.5), throttle: 0, warp: true });
      m.obj('wave', 'Våg ' + w + ': förstör alla fiender', { progress: '', silent: true });
      await m.until(() => { const n = spawned.filter(s => !s.dead).length; m.progress('wave', `– ${n} kvar`); return n === 0; });
      const bonus = w * 250;
      m.extraScore += bonus;
      g.hud.flashMsg(`Våg ${w} avklarad! +${bonus} i bonus`, 3);
      g.sfx.play('objective');
      const P = m.P;
      P.shield = P.maxShield; P.hull = Math.min(P.maxHull, P.hull + P.maxHull * 0.3);
      P.mag = P.magMax; P.flares = Math.min(P.maxFlares, P.flares + 2);
      m.radio('dator', 'Sköld återställd, skrov delvis lagat, ammunition påfylld. Nästa våg om sex sekunder.', 3);
      await m.wait(6);
    }
  }
};
