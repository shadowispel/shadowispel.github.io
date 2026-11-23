/**
 * Fjällracet – speldata: bilar, banor (sköldpaddsprogram), cuper, förare, färger.
 * Ren logik utan three-beroende (kan testas med jsc).
 */

/* ---------------- Bilar ----------------
 * top: toppfart (m/s), accel: m/s² från stillastående, grip: max sidoacceleration (m/s²),
 * mass: relativ vikt (krockar), drift: hur villigt bilen driftar, brake: m/s²
 */
export const CARS = [
  { id: 'viggen', name: 'Viggen', klass: 'Halvkombi', desc: 'Pigg och lättkörd allroundbil. Förlåtande i kurvorna.',
    top: 57, accel: 9.6, grip: 14.6, mass: 1.0, drift: 1.0, brake: 22, shape: 'hatch', unlock: null },
  { id: 'algen', name: 'Älgen', klass: 'Kombi', desc: 'Tung och stabil. Trivs i närkamp – den som knuffar Älgen får ångra sig.',
    top: 56.5, accel: 8.4, grip: 15.2, mass: 1.55, drift: 0.85, brake: 21, shape: 'wagon', unlock: null },
  { id: 'lodjuret', name: 'Lodjuret', klass: 'Rallybil', desc: 'Byggd för grus, snö och is. Behåller greppet när underlaget sviker.',
    top: 58.5, accel: 10.4, grip: 15.4, mass: 1.05, drift: 1.25, brake: 23, shape: 'rally', iceBonus: 0.5, unlock: 'brons' },
  { id: 'blixten', name: 'Blixten', klass: 'Lätt sportbil', desc: 'Fjäderlätt och vass. Accelererar som en raket men studsar lätt iväg vid krockar.',
    top: 60, accel: 11.6, grip: 16.2, mass: 0.82, drift: 1.05, brake: 24, shape: 'coupe', unlock: 'bronsWin' },
  { id: 'vraken', name: 'Vråken', klass: 'Muskel-GT', desc: 'Enorm toppfart och en bakvagn som gärna vill gå först. För driftkungar.',
    top: 66, accel: 10.8, grip: 14.2, mass: 1.35, drift: 1.45, brake: 22, shape: 'gt', unlock: 'silver' },
  { id: 'norrsken', name: 'Norrsken', klass: 'Superbil', desc: 'Prototypen alla pratar om. Snabbast i allt – om du kan tämja den.',
    top: 70, accel: 13, grip: 17.2, mass: 1.1, drift: 1.15, brake: 26, shape: 'super', unlock: 'guld' }
];

/** Prestandanivå – AI i snabblopp väljer bilar nära spelarens nivå. */
export const CAR_TIER = { viggen: 0, algen: 0, lodjuret: 1, blixten: 1, vraken: 2, norrsken: 3 };

export const UNLOCK_TEXT = {
  brons: 'Kom topp 3 i Bronsbucklan',
  bronsWin: 'Vinn Bronsbucklan',
  silver: 'Kom topp 3 i Silverbucklan',
  guld: 'Kom topp 3 i Guldbucklan'
};

export const COLORS = [
  { name: 'Faluröd', hex: 0xb0281f }, { name: 'Kungsblå', hex: 0x1f4fbf }, { name: 'Citrongul', hex: 0xf2c414 },
  { name: 'Granitgrå', hex: 0x5b6169 }, { name: 'Snövit', hex: 0xe8ecef }, { name: 'Skogsgrön', hex: 0x2e6b3a },
  { name: 'Midnatt', hex: 0x15171f }, { name: 'Apelsin', hex: 0xf06b12 }, { name: 'Lavendel', hex: 0x8a6fd1 },
  { name: 'Turkos', hex: 0x12a9b0 }, { name: 'Rosa', hex: 0xe0508f }, { name: 'Koppar', hex: 0xa8643a }
];

export const AI_DRIVERS = [
  { name: 'Sixten Snabb', skill: 1.0, aggr: 0.8 },
  { name: 'Majken Mård', skill: 0.985, aggr: 0.5 },
  { name: 'Ture Turbo', skill: 0.975, aggr: 0.9 },
  { name: 'Greta Gasfot', skill: 0.97, aggr: 0.6 },
  { name: 'Lova Ljung', skill: 0.96, aggr: 0.4 },
  { name: 'Harald Hård', skill: 0.95, aggr: 1.0 },
  { name: 'Elsa Ek', skill: 0.94, aggr: 0.3 },
  { name: 'Bosse Broms', skill: 0.92, aggr: 0.2 }
];

export const DIFFICULTY = {
  easy:   { label: 'Lätt',  power: 0.86, pace: 0.8, rubberBehind: 0.015, rubberAhead: 0.08, scoreMult: 1.0 },
  medium: { label: 'Medel', power: 0.94, pace: 0.91, rubberBehind: 0.03, rubberAhead: 0.045, scoreMult: 1.5 },
  hard:   { label: 'Svår',  power: 0.99, pace: 0.97, rubberBehind: 0.035, rubberAhead: 0.02, scoreMult: 2.2 }
};

export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

/* ---------------- Banor ----------------
 * prog: sköldpaddsprogram. ['S', längd, dy, tagg], ['R'|'L', radie, grader, dy, tagg]
 * Taggar: { bridge, tunnel, crest: höjd, open: 'L'|'R'|'B' (inget räcke – går att åka av) }
 * aiPace: banspecifik justering av AI-farten (snabba svepkurvor gynnar annars AI:n jämfört med människor)
 * close: index för två raksträckor vars längd justeras så att banan sluter sig exakt.
 */
export const TRACKS = [
  {
    id: 'midsommar', scale: 1.4, name: 'Midsommarskogen', theme: 'midsommar', laps: 3, half: 7, shoulder: 2.6, grip: 1, y0: 14, aiPace: 0.97,
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
    id: 'storstad', scale: 1.25, name: 'Storstad natt', theme: 'stad', laps: 3, half: 6.8, shoulder: 1.6, grip: 0.94, y0: 4,
    desc: 'Regnvåta gator, neonskyltar och en bro där banan korsar sig själv. Skarpa kvartershörn.',
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
    desc: 'Isrejs på en frusen sjö under norrskenet. Spegelblankt – drifta dig runt eller snurra ut i snövallen.',
    par: 62,
    prog: [
      ['S', 100, 0], ['L', 50, 180, 0], ['S', 60, 0], ['R', 40, 90, 0], ['S', 60, 0], ['L', 40, 90, 0],
      ['S', 120, 0], ['L', 50, 180, 0], ['R', 40, 90, 0], ['S', 40, 0], ['L', 60, 90, 0], ['S', 50, 0]
    ],
    close: [4, 6]
  }
];

export const CUPS = [
  { id: 'brons', name: 'Bronsbucklan', medal: '🥉', tracks: ['midsommar', 'skargarden', 'odemarken'], unlock: null, aiCars: ['viggen', 'algen', 'viggen', 'lodjuret'] },
  { id: 'silver', name: 'Silverbucklan', medal: '🥈', tracks: ['fjallpasset', 'storstad', 'isbanan'], unlock: 'brons', aiCars: ['lodjuret', 'blixten', 'viggen', 'algen', 'lodjuret'] },
  { id: 'guld', name: 'Guldbucklan', medal: '🥇', tracks: ['skargarden@r', 'fjallpasset@r', 'storstad@r', 'isbanan@r'], unlock: 'silver', aiCars: ['blixten', 'vraken', 'lodjuret', 'vraken', 'blixten'] }
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
