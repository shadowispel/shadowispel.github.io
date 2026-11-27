/**
 * Fjällracet – bandata: banor (sköldpaddsprogram) och layoutbyggare. Ren logik utan three-beroende.
 */

/* ---------------- Banor ----------------
 * prog: sköldpaddsprogram. ['S', längd, dy, tagg], ['R'|'L', radie, grader, dy, tagg]
 * Taggar: { bridge, tunnel, crest: höjd, open: 'L'|'R'|'B' (inget räcke – går att åka av), lift: höjning (broar),
 *          suspension (hängbro), long (lång låg bro), town/coast/lake/quay/runway (miljömarkörer för world.js) }
 * surface: 'asfalt'|'grus'|'snö'|'is' · sprint: true = ett långt varv · region: kort platsetikett
 * aiPace: banspecifik justering av AI-farten (snabba svepkurvor gynnar annars AI:n jämfört med människor)
 * close: index för två raksträckor vars längd justeras så att banan sluter sig exakt.
 */
export const TRACKS = [
  {
    id: 'midsommar', scale: 1.4, name: 'Midsommarskogen', theme: 'midsommar', laps: 3, half: 7, shoulder: 2.6, grip: 1, y0: 14, aiPace: 0.97,
    surface: 'asfalt', region: 'Dalsland',
    desc: 'Böljande landsväg genom björkskog och blommande ängar i ljus midsommarkväll. Perfekt för att lära sig.',
    par: 58,
    prog: [
      ['S', 120, 0], ['R', 80, 90, 3], ['S', 100, 4], ['L', 60, 50, 0], ['R', 48, 120, -2],
      ['S', 140, -3, { crest: 2.2 }], ['R', 100, 60, 0], ['L', 50, 70, 2], ['R', 42, 100, 0],
      ['S', 160, -4], ['R', 110, 70, 0], ['L', 70, 40, 0], ['R', 60, 80, 0], ['S', 120, 0]
    ],
    close: [5, 9]
  },
  {
    id: 'skargarden', scale: 1.45, name: 'Skärgården', theme: 'skargard', laps: 3, half: 7, shoulder: 2.4, grip: 1, y0: 6,
    surface: 'asfalt', region: 'Stockholms skärgård',
    desc: 'Röda granitklippor, glittrande fjärdar och höga broar mellan öarna. Se upp för klippkanterna!',
    par: 66,
    prog: [
      ['S', 110, 0], ['L', 70, 80, 2], ['S', 180, 2, { bridge: true, lift: 5 }], ['L', 50, 60, -1], ['R', 60, 70, 0],
      ['S', 90, -2, { open: 'R' }], ['L', 40, 120, 0], ['S', 130, 0, { bridge: true, lift: 4 }], ['R', 80, 50, 2],
      ['L', 60, 110, -2], ['S', 140, 0, { crest: 2 }], ['L', 90, 60, 0, { open: 'L' }], ['R', 50, 40, 0], ['L', 70, 90, 0], ['S', 100, 0]
    ],
    close: [7, 10]
  },
  {
    id: 'odemarken', scale: 1.45, name: 'Ödemarken', theme: 'odemark', laps: 3, half: 7.5, shoulder: 3.2, grip: 1, y0: 12,
    surface: 'asfalt', region: 'Halland',
    desc: 'Långa raksträckor genom sanddyner och vindkraftverk i solnedgången – och ett par rejäla hopp.',
    par: 77,
    prog: [
      ['S', 150, 0], ['R', 120, 80, 0], ['S', 250, 0, { crest: 4.2 }], ['R', 70, 100, 4], ['L', 90, 60, 0],
      ['S', 200, -2], ['R', 60, 110, 0], ['S', 180, 0, { crest: 4.8 }], ['R', 140, 70, -2], ['L', 80, 50, 0],
      ['R', 90, 110, 0], ['S', 150, 0]
    ],
    close: [7, 11]
  },
  {
    id: 'fjallpasset', scale: 1.15, name: 'Fjällpasset', theme: 'fjall', laps: 3, half: 7, shoulder: 2.4, grip: 0.96, y0: 30,
    surface: 'asfalt', region: 'Jämtland',
    desc: 'Hårnålskurvor, rasskyddsgalleri och krön högt uppe på kalfjället. Stora höjdskillnader och stup.',
    par: 83,
    prog: [
      ['S', 100, 0], ['R', 60, 70, 4], ['S', 160, 16], ['L', 30, 160, 6], ['S', 140, 14],
      ['R', 32, 160, 6], ['S', 130, 8, { tunnel: true }], ['R', 90, 80, 0], ['S', 150, -6, { crest: 3 }],
      ['L', 60, 60, -8, { open: 'L' }], ['R', 45, 130, -10], ['S', 200, -20], ['R', 70, 90, -8], ['L', 50, 70, -4],
      ['R', 80, 120, 0], ['S', 90, 0]
    ],
    close: [2, 11]
  },
  {
    id: 'storstad', scale: 1.25, name: 'Neostad', theme: 'stad', laps: 3, half: 6.8, shoulder: 1.6, grip: 0.94, y0: 4,
    surface: 'asfalt', region: 'Stockholm år 2089',
    desc: 'Framtidens storstad i regn: neonfasader, svävande hologram och pulserande ljuslister. Banan korsar sig själv på en bro.',
    par: 68,
    prog: [
      ['S', 60, 0], ['S', 80, 9], ['S', 120, 0, { bridge: true }], ['S', 80, -9],
      ['L', 35, 90, 0], ['S', 150, 0, { tunnel: true }], ['L', 35, 90, 0], ['S', 105, 0], ['L', 35, 90, 0],
      ['S', 335, 0], ['R', 35, 90, 0], ['S', 60, 0], ['L', 30, 30, 0], ['R', 30, 60, 0], ['L', 30, 30, 0], ['S', 60, 0],
      ['R', 35, 90, 0], ['S', 115, 0], ['R', 35, 90, 0], ['S', 40, 0]
    ],
    close: [7, 17]
  },
  {
    id: 'isbanan', scale: 1.4, name: 'Isbanan', theme: 'is', laps: 3, half: 9, shoulder: 2.2, grip: 0.58, y0: 2,
    surface: 'is', region: 'Norrbotten',
    desc: 'Isrejs på en frusen sjö under norrskenet. Spegelblankt – drifta dig runt eller snurra ut i snövallen.',
    par: 62,
    prog: [
      ['S', 100, 0], ['L', 50, 180, 0], ['S', 60, 0], ['R', 40, 90, 0], ['S', 60, 0], ['L', 40, 90, 0],
      ['S', 120, 0], ['L', 50, 180, 0], ['R', 40, 90, 0], ['S', 40, 0], ['L', 60, 90, 0], ['S', 50, 0]
    ],
    close: [4, 6]
  },
  {
    id: 'hogakusten', scale: 1.3, name: 'Höga kusten', theme: 'kust', laps: 3, half: 7, shoulder: 2.4, grip: 1, y0: 34,
    surface: 'asfalt', region: 'Västernorrland',
    desc: 'Branta klippor ner mot havet och en svindlande hängbro över fjärden. Kuperat, snabbt och vackert.',
    par: 69,
    prog: [
      ['S', 120, 0], ['R', 70, 80, 3], ['S', 110, 6], ['L', 55, 70, 4], ['R', 65, 100, 2],
      ['S', 90, -2, { crest: 2 }], ['R', 90, 60, -4], ['S', 330, 0, { bridge: true, lift: 10, suspension: true }],
      ['R', 60, 90, -3], ['L', 45, 110, 0], ['R', 50, 130, 2], ['S', 150, -4, { open: 'L' }],
      ['R', 110, 70, -2], ['L', 70, 40, 0], ['R', 80, 50, 0], ['S', 120, 0]
    ],
    close: [2, 11]
  },
  {
    id: 'hamnen', scale: 1.3, name: 'Göteborgs hamn', theme: 'hamn', laps: 3, half: 7.5, shoulder: 2, grip: 0.93, y0: 3,
    surface: 'asfalt', region: 'Västra Götaland',
    desc: 'Regnvåt kaj i skymningen mellan containerberg, portalkranar och väldiga fartyg. Raka kajer och kantiga hörn.',
    par: 68,
    prog: [
      ['S', 200, 0], ['R', 30, 90, 0], ['S', 120, 0], ['L', 30, 90, 0], ['S', 80, 0], ['R', 35, 90, 0],
      ['S', 260, 0, { quay: true }], ['R', 40, 90, 0], ['S', 100, 0], ['L', 25, 60, 0], ['R', 25, 120, 0], ['L', 25, 60, 0],
      ['S', 90, 0], ['R', 35, 90, 0], ['S', 230, 0], ['R', 45, 90, 0], ['S', 60, 0]
    ],
    close: [6, 8]
  },
  {
    id: 'gotland', scale: 1.4, name: 'Gotland', theme: 'gotland', laps: 3, half: 7, shoulder: 2.6, grip: 1, y0: 8,
    surface: 'asfalt', region: 'Gotland',
    desc: 'Kalkstensraukar vid ett turkost hav och rakt genom ringmurens port in i den medeltida staden. Sommar och rosor.',
    par: 63,
    prog: [
      ['S', 160, 0], ['L', 90, 70, 0], ['S', 140, 2], ['L', 70, 50, 0], ['R', 50, 70, 0], ['S', 110, 0],
      ['L', 45, 90, 0, { town: true }], ['S', 70, 0, { town: true }], ['R', 35, 80, 0, { town: true }], ['L', 35, 80, 0, { town: true }],
      ['S', 90, 0, { town: true }], ['L', 50, 90, 0, { town: true }], ['S', 120, -2], ['L', 80, 70, 0],
      ['S', 180, 0, { coast: true }], ['L', 110, 50, 0], ['R', 60, 60, 0], ['L', 70, 70, 0], ['S', 100, 0]
    ],
    close: [2, 14]
  },
  {
    id: 'lappland', scale: 1.45, name: 'Lappland', theme: 'lappland', laps: 3, half: 7.5, shoulder: 3, grip: 0.72, y0: 10,
    surface: 'snö', region: 'Lappland',
    desc: 'Packad snö under norrskenet, fjällbjörkar, kåtor och renar längs vägen. Mjuka kurvor men lömskt lite grepp.',
    par: 69,
    prog: [
      ['S', 150, 0], ['R', 100, 70, 2], ['S', 120, 4], ['L', 70, 60, 2], ['R', 55, 120, 0],
      ['S', 160, -3, { crest: 2 }], ['R', 120, 60, -2], ['L', 80, 70, 0], ['R', 60, 110, -2], ['S', 140, 0],
      ['R', 90, 80, 0], ['L', 60, 50, 1], ['R', 80, 100, 0], ['S', 100, 0]
    ],
    close: [2, 9]
  },
  {
    id: 'dalarna', scale: 1.35, name: 'Dalarna', theme: 'dalarna', laps: 3, half: 7, shoulder: 2.6, grip: 1, y0: 12,
    surface: 'asfalt', region: 'Dalarna',
    desc: 'Morgondis över sjön, röda stugor med vita knutar och en jättelik dalahäst på kullen. Böljande och lättsamt.',
    par: 67,
    prog: [
      ['S', 130, 0], ['L', 80, 80, 3], ['S', 100, 5], ['R', 60, 100, 2], ['L', 50, 80, 0],
      ['S', 150, -2, { crest: 2.4 }], ['L', 100, 90, -4], ['S', 120, -2, { lake: true }], ['L', 70, 60, 0],
      ['R', 45, 110, 0], ['L', 60, 130, 2], ['S', 140, 0], ['L', 90, 130, -2], ['S', 90, 0]
    ],
    close: [2, 7]
  },
  {
    id: 'oland', scale: 1.5, name: 'Ölandsleden', theme: 'oland', laps: 1, sprint: true, half: 6.5, shoulder: 2.4, grip: 1, y0: 4,
    surface: 'asfalt', region: 'Öland',
    desc: 'En lång sprint över alvaret: stenmurar, enbuskar och väderkvarnar i blåsigt solsken – och sist den långa bron.',
    par: 113,
    prog: [
      ['S', 200, 0], ['R', 200, 25, 0], ['S', 260, 0], ['L', 150, 35, 0], ['S', 180, 0, { crest: 1.5 }],
      ['R', 60, 70, 0], ['L', 60, 70, 0], ['S', 220, 0], ['R', 120, 60, 0], ['S', 160, 0], ['R', 70, 90, 0],
      ['S', 200, 0], ['L', 90, 50, 0], ['R', 100, 80, 0], ['S', 280, 0], ['R', 60, 40, 0], ['L', 60, 40, 0],
      ['S', 160, 0], ['R', 90, 70, 0], ['S', 360, 0, { bridge: true, lift: 12, long: true }], ['R', 100, 120, 0], ['S', 120, 0]
    ],
    close: [2, 11]
  },
  {
    id: 'flygfaltet', scale: 1.5, name: 'Flygfältet', theme: 'flyg', laps: 3, half: 9, shoulder: 4, grip: 1, y0: 2,
    surface: 'asfalt', region: 'Östergötland',
    desc: 'Startbanan i skymningen: brutala raksträckor i full fart mellan banljus, hangarer och parkerade plan.',
    par: 69,
    prog: [
      ['S', 420, 0, { runway: true }], ['R', 35, 180, 0], ['S', 200, 0], ['L', 30, 90, 0], ['S', 60, 0], ['R', 30, 90, 0],
      ['S', 120, 0], ['R', 40, 60, 0], ['L', 40, 60, 0], ['S', 80, 0], ['R', 30, 90, 0], ['S', 100, 0], ['R', 45, 90, 0], ['S', 80, 0]
    ],
    close: [9, 11]
  },
  {
    id: 'gruvan', scale: 1.2, name: 'Gruvstaden', theme: 'gruva', laps: 3, half: 7, shoulder: 2.2, grip: 0.8, y0: 45,
    surface: 'grus', region: 'Bergslagen',
    desc: 'Ner i det djupa dagbrottet längs terrasserna och upp igen förbi gruvtruckar och lavar. Grus och damm.',
    par: 65,
    prog: [
      ['S', 140, 0], ['L', 60, 90, 0], ['S', 90, -3], ['L', 80, 60, -8], ['S', 100, -10], ['L', 70, 80, -8],
      ['S', 90, -8], ['L', 60, 70, -4], ['S', 70, 0], ['R', 25, 180, 6], ['S', 90, 10], ['L', 25, 180, 6],
      ['S', 110, 10], ['L', 70, 30, 6], ['S', 80, 4], ['L', 60, 30, 0], ['S', 100, 0]
    ],
    close: [0, 2]
  },
  {
    id: 'tivoli', scale: 1.35, name: 'Nöjesparken', theme: 'tivoli', laps: 3, half: 6.5, shoulder: 2, grip: 0.97, y0: 3,
    surface: 'asfalt', region: 'Stockholm',
    desc: 'Nattrace genom nöjesparken: pariserhjul, karuseller, berg-och-dalbana och tusentals ljusslingor. Tight och teknisk.',
    par: 52,
    prog: [
      ['S', 120, 0], ['R', 40, 90, 0], ['S', 60, 0], ['L', 30, 120, 0], ['R', 35, 150, 1], ['S', 100, 2],
      ['L', 50, 60, 0], ['R', 30, 100, -2], ['S', 90, -1], ['R', 60, 90, 0], ['L', 35, 70, 0], ['R', 40, 110, 0],
      ['S', 140, 0], ['R', 45, 70, 0], ['S', 60, 0]
    ],
    close: [2, 12]
  },
  {
    id: 'skogsrally', scale: 1.7, name: 'Skogsrallyt', theme: 'skog', laps: 1, sprint: true, half: 4.8, shoulder: 1.6, grip: 0.78, y0: 20,
    surface: 'grus', region: 'Värmland',
    desc: 'En smal grusväg genom tät barrskog med blinda krön och hopp. Rallysträcka – ett enda långt varv mot klockan.',
    par: 101,
    prog: [
      ['S', 160, 0], ['R', 60, 50, 2], ['S', 120, 3, { crest: 2.5 }], ['L', 40, 80, 1], ['R', 45, 70, 0],
      ['S', 140, -4, { crest: 3 }], ['L', 70, 40, -2], ['R', 35, 100, 0], ['S', 100, 2], ['L', 50, 60, 3],
      ['R', 80, 45, 0], ['S', 180, -3, { crest: 3.5 }], ['R', 40, 90, 0], ['L', 60, 50, -2], ['R', 30, 120, 0],
      ['S', 120, 2, { crest: 2 }], ['L', 45, 70, 0], ['R', 70, 80, 0], ['S', 160, 0, { crest: 2.5 }], ['R', 50, 90, -2],
      ['L', 40, 60, 0], ['R', 60, 75, 0], ['S', 100, 0]
    ],
    close: [8, 22]
  }
];

/* ---------------- Sköldpadda → kontrollpunkter ---------------- */
function walk(prog, overrideLen, sc = 1) {
  let x = 0, z = 0, y = 0, h = 0, dist = 0;
  const pts = [{ x, y, z, d: 0 }];
  const ranges = [];      // per kommando: [startDist, endDist]
  prog.forEach((c, ci) => {
    const d0 = dist;
    if (c[0] === 'S') {
      const len = overrideLen && overrideLen[ci] != null ? overrideLen[ci] : c[1] * sc;
      const n = Math.max(1, Math.ceil(len / 18));
      const dy = c[2] || 0;
      for (let k = 0; k < n; k++) {
        x += Math.sin(h) * len / n; z += Math.cos(h) * len / n; y += dy / n; dist += len / n;
        pts.push({ x, y, z, d: dist });
      }
    } else {
      const r = c[1] * sc, ang = c[2] * Math.PI / 180, dy = c[3] || 0;
      const sign = c[0] === 'R' ? -1 : 1;
      const arc = r * ang;
      const n = Math.max(2, Math.ceil(arc / 12));
      const dh = sign * ang / n;
      const chord = 2 * r * Math.sin(ang / n / 2);
      for (let k = 0; k < n; k++) {
        h += dh / 2;
        x += Math.sin(h) * chord; z += Math.cos(h) * chord; y += dy / n; dist += arc / n;
        h += dh / 2;
        pts.push({ x, y, z, d: dist });
      }
    }
    ranges.push([d0, dist]);
  });
  return { pts, ranges, end: { x, y, z, h }, length: dist };
}

/**
 * Bygger banans kontrollpunkter. Returnerar { points:[[x,y,z]], length, tags: [{from,to,(bridge|tunnel|open|crest)}] }
 * Banan sluts exakt genom att justera längden på två raksträckor (def.close).
 */
export function buildLayout(def, reverse = false) {
  const prog = def.prog;
  const sc = def.scale || 1;
  let w = walk(prog, null, sc);
  const ov = {};
  if (def.close) {
    const [a, b] = def.close;
    // riktning för raksträcka a och b
    const dirOf = (idx) => {
      let h = 0;
      for (let i = 0; i < idx; i++) { const c = prog[i]; if (c[0] !== 'S') h += (c[0] === 'R' ? -1 : 1) * c[2] * Math.PI / 180; }
      return [Math.sin(h), Math.cos(h)];
    };
    const da = dirOf(a), db = dirOf(b);
    const ex = -w.end.x, ez = -w.end.z; // vi vill lägga till (ex, ez)
    const det = da[0] * db[1] - da[1] * db[0];
    if (Math.abs(det) > 0.05) {
      const la = (ex * db[1] - ez * db[0]) / det;
      const lb = (da[0] * ez - da[1] * ex) / det;
      ov[a] = Math.max(20, prog[a][1] * sc + la);
      ov[b] = Math.max(20, prog[b][1] * sc + lb);
      w = walk(prog, ov, sc);
    }
  }
  // fördela kvarvarande fel (även höjd) linjärt
  const L = w.length;
  const e = w.end;
  const pts = w.pts.map(p => [p.x - e.x * p.d / L, p.y - e.y * p.d / L, p.z - e.z * p.d / L]);
  pts.pop(); // sista = första
  // jämna ut höjden lite
  const n = pts.length;
  for (let it = 0; it < 2; it++) {
    const ys = pts.map(p => p[1]);
    for (let i = 0; i < n; i++) pts[i][1] = (ys[(i - 1 + n) % n] + 2 * ys[i] + ys[(i + 1) % n]) / 4;
  }
  pts.forEach(p => { p[1] += def.y0 || 0; });
  const tags = [];
  prog.forEach((c, ci) => {
    const t = c[0] === 'S' ? c[3] : c[4];
    if (!t) return;
    const [d0, d1] = w.ranges[ci];
    tags.push(Object.assign({ from: d0 / L, to: d1 / L }, t));
  });
  const res = { points: pts, length: L, tags, adjusted: ov, residual: Math.hypot(e.x, e.z) };
  if (reverse) {
    // vänd ordningen men behåll startpunkten (index 0)
    res.points = [pts[0]].concat(pts.slice(1).reverse());
    res.tags = tags.map(t => {
      const r = Object.assign({}, t, { from: 1 - t.to, to: 1 - t.from });
      if (t.open === 'L') r.open = 'R'; else if (t.open === 'R') r.open = 'L';
      return r;
    });
  }
  return res;
}

export function trackById(id) {
  const [base, flag] = String(id).split('@');
  const def = TRACKS.find(t => t.id === base);
  return def ? { def, reverse: flag === 'r', key: id } : null;
}
export function trackName(id) {
  const t = trackById(id); if (!t) return id;
  return t.def.name + (t.reverse ? ' (baklänges)' : '');
}
