/**
 * Fjällracet – speldata: bilar, banor (sköldpaddsprogram), cuper, förare, färger.
 * Ren logik utan three-beroende (kan testas med jsc).
 */

/* ---------------- Bilar ----------------
 * Alla tillverkare och modeller är påhittade.
 * top: toppfart (m/s), accel: m/s² från stillastående, grip: max sidoacceleration (m/s²),
 * mass: relativ vikt (krockar), drift: hur villigt bilen driftar, brake: m/s², iceBonus: grepp på is/snö/grus.
 * body: modellstil i carmodel.js. price: pris i bilhandeln (null = går bara att vinna).
 * De sex första id:na kommer från gamla versionen (gamla sparfiler fortsätter fungera).
 */
const SHAPE_OF = { Kompakt: 'hatch', Sport: 'coupe', Muskel: 'gt', Rally: 'rally', Klassiker: 'hatch', 'Terräng': 'wagon', El: 'coupe', Super: 'super' }; // reservform (gamla car.js)
const C = (id, maker, model, year, klass, desc, st, price, extra = {}) => Object.assign({
  id, maker, model, name: maker + ' ' + model, year, klass, desc, body: id, price, shape: SHAPE_OF[klass] || 'hatch',
  top: st[0], accel: st[1], grip: st[2], mass: st[3], drift: st[4], brake: st[5] || 22
}, extra);

export const CLASSES = [
  { id: 'Kompakt', icon: '🚗', color: '#7fc8ff' },
  { id: 'Sport', icon: '🏎️', color: '#ff7a59' },
  { id: 'Muskel', icon: '💪', color: '#ffb347' },
  { id: 'Rally', icon: '🌲', color: '#9ee06a' },
  { id: 'Klassiker', icon: '🕰️', color: '#e8d6a8' },
  { id: 'Terräng', icon: '⛰️', color: '#c9a27a' },
  { id: 'El', icon: '⚡', color: '#6ef0e0' },
  { id: 'Super', icon: '👑', color: '#ff5fd2' }
];

export const CARS = [
  // Kompakt
  C('viggen', 'Vinda', 'Kvick 1.6', 2019, 'Kompakt', 'Pigg och lättkörd halvkombi. Förlåtande i kurvorna – perfekt första bil.', [56, 9.6, 14.6, 1.0, 1.0, 22], 0),
  C('algen', 'Norden', 'Saga Kombi T5', 2016, 'Kompakt', 'Tung och stabil familjekombi med takräcke. Den som knuffar Sagan får ångra sig.', [56.5, 8.6, 15.0, 1.5, 0.9, 21], 0),
  C('pixel', 'Pella', 'Myra 1.0T', 2021, 'Kompakt', 'Liten stadsbil med turbo och go-kart-känsla. Lätt som en fjäder – och lika lätt att knuffa undan.', [53, 10.0, 15.4, 0.75, 1.1, 23], 6000),
  // Sport
  C('blixten', 'Kestrel', 'RS4', 2022, 'Sport', 'Vass fyrcylindrig coupé. Accelererar som en raket men studsar lätt iväg vid krockar.', [61, 11.6, 16.2, 0.85, 1.05, 24], 22000),
  C('falk', 'Aurea', 'Falk Roadster', 2020, 'Sport', 'Öppen tvåsitsig roadster med låg tyngdpunkt. Greppar som om den gick på räls.', [60, 11.2, 16.6, 0.8, 1.1, 24], 20000),
  C('kaze', 'Hoshi', 'Kaze RS', 2003, 'Sport', 'Turbomatad bakhjulsdriven coupé med stor vinge. Byggd för att köras på sniskan.', [62, 11.0, 15.8, 0.95, 1.4, 23], 24000),
  // Muskel
  C('vraken', 'Norden', 'V8 GT', 1971, 'Muskel', 'Fastback med stor V8 och racerränder. Enorm toppfart och en bakvagn som gärna vill gå först.', [65, 10.8, 14.2, 1.35, 1.45, 22], 30000),
  C('bison', 'Bergman', 'Bison 440', 1969, 'Muskel', 'Långt motorhuv, luftintag och vrålande sjuliters V8. Tung, bred och fullständigt orädd.', [64, 11.4, 13.8, 1.5, 1.5, 21], 28000),
  C('aska', 'Stålberg', 'Åska SS', 2018, 'Muskel', 'Modern muskelbil med kompressor. Mer grepp än föregångarna – men lika mycket kraft.', [66.5, 11.8, 15.0, 1.4, 1.35, 24], 38000),
  // Rally
  C('lodjuret', 'Kestrel', 'Lodjur R4', 2018, 'Rally', 'Fyrhjulsdriven rallybil med takljus och stänkskydd. Behåller greppet när underlaget sviker.', [58.5, 10.6, 15.4, 1.05, 1.25, 23], 16000, { iceBonus: 0.5 }),
  C('tempesta', 'Ferro', 'Tempesta S4', 1986, 'Rally', 'Legendarisk mittmotorbil från de vilda rallyåren. Kort, bred och explosiv på grus och snö.', [61, 12.2, 15.6, 0.95, 1.3, 24], 34000, { iceBonus: 0.4 }),
  // Klassiker
  C('vega', 'Vega', '1600 Classic', 1964, 'Klassiker', 'Rundad bakåtsluttande femtiotalsdesign och kromade stötfångare. Sladdar gärna och charmigt.', [51, 8.0, 13.6, 1.1, 1.3, 19], 9000),
  C('ankar', 'Ankar', 'Sorella Coupé', 1961, 'Klassiker', 'Elegant tvådörrars coupé med små stjärtfenor. Söndagsbil som överraskar på banan.', [54, 8.8, 14.2, 1.05, 1.2, 20], 14000),
  C('kupol', 'Kupol', '600 Bubbla', 1958, 'Klassiker', 'Rund mikrobil med bakmotor. Långsam på raksträckan men omöjlig att inte älska.', [47, 8.2, 14.8, 0.6, 1.15, 20], 5000),
  // Terräng
  C('fjallbjorn', 'Bergman', 'Fjällbjörn 4x4', 2010, 'Terräng', 'Kantig terrängbil med reservhjul och takräcke. Tung som en björn, trivs i snö och på grus.', [52, 9.0, 14.6, 1.7, 0.95, 20], 15000, { iceBonus: 0.45 }),
  C('timmer', 'Stålberg', 'Timmer XL', 2017, 'Terräng', 'Stor pickup med flak och ljusramp. Knuffar undan allt och kör vidare.', [54, 9.4, 14.2, 1.75, 1.1, 20], 17000, { iceBonus: 0.3 }),
  // El
  C('spark', 'Lumi', 'Spark e', 2023, 'El', 'Liten elbil utan grill och med blixtsnabb igångsättning. Tyst, nätt och förvånansvärt kvick.', [55, 11.0, 15.2, 1.05, 0.9, 23], 12000),
  C('aurora', 'Lumi', 'Aurora GT', 2024, 'El', 'Strömlinjeformad elsedan med ljuslister. Brutal acceleration, tung batteripack.', [64, 13.0, 16.0, 1.3, 0.95, 25], 42000),
  C('ion', 'Kvarts', 'Ion-S', 2025, 'El', 'Elektrisk hyperbil med fyra motorer. Accelerationen trycker in dig i stolen.', [68, 14.0, 17.0, 1.2, 1.0, 26], 70000),
  // Super
  C('norrsken', 'Norrsken', 'Prototyp X1', 2025, 'Super', 'Kilformad prototyp som alla pratar om. Snabbast i allt – om du kan tämja den. Kan bara vinnas.', [70, 13, 17.2, 1.1, 1.15, 26], null),
  C('valkyria', 'Aurea', 'Valkyria V12', 2023, 'Super', 'Frontmotor, lång huv och V12. En gran turismo som driftar lika gärna som den rusar.', [71, 12.6, 16.8, 1.2, 1.2, 25], 75000),
  C('stormfagel', 'Kestrel', 'Stormfågel RSR', 2021, 'Super', 'Banbil med jättevinge och racerdekaler. Mest grepp av alla. Kan bara vinnas.', [68, 12.8, 17.8, 1.0, 1.05, 27], null)
];

/** Prestandaindex (100–999) från egenskaper. */
export function perfIndex(s) {
  return Math.round(clampN(100 + (s.top - 46) * 13 + (s.accel - 7.5) * 30 + (s.grip - 13.5) * 34 + (s.brake - 19) * 4 - (s.mass - 1) * 25, 100, 999));
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
export function piClass(pi) { return pi < 300 ? 'D' : pi < 400 ? 'C' : pi < 500 ? 'B' : pi < 600 ? 'A' : 'S'; }
/** Prestandanivå 0–3 (för datorförarnas bilval). */
export const CAR_TIER = Object.fromEntries(CARS.map(c => { const p = perfIndex(c); return [c.id, p < 330 ? 0 : p < 450 ? 1 : p < 560 ? 2 : 3]; }));

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

export * from './trackdata.js';

export const CUPS = [
  { id: 'brons', name: 'Bronsbucklan', medal: '🥉', tracks: ['midsommar', 'skargarden', 'odemarken'], unlock: null, aiCars: ['viggen', 'algen', 'viggen', 'lodjuret'] },
  { id: 'silver', name: 'Silverbucklan', medal: '🥈', tracks: ['fjallpasset', 'storstad', 'isbanan'], unlock: 'brons', aiCars: ['lodjuret', 'blixten', 'viggen', 'algen', 'lodjuret'] },
  { id: 'guld', name: 'Guldbucklan', medal: '🥇', tracks: ['skargarden@r', 'fjallpasset@r', 'storstad@r', 'isbanan@r'], unlock: 'silver', aiCars: ['blixten', 'vraken', 'lodjuret', 'vraken', 'blixten'] }
];

