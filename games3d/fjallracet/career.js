/**
 * Fjällracet – karriär: evenemang i kapitel, belöningar, stjärnor och dagliga utmaningar. Ren logik.
 */
export const ETYPES = {
  race: { name: 'Lopp', icon: '🏁', desc: 'Vanligt lopp. 1:a = ★★★, 2:a = ★★, 3:a = ★.' },
  cup: { name: 'Cup', icon: '🏆', desc: 'Flera lopp i rad – poäng efter varje lopp. Slutplacering ger stjärnor.' },
  elim: { name: 'Eliminering', icon: '❌', desc: 'Sist ut efter varje varv! Den som är sist när ledaren går över mållinjen åker ut.' },
  drift: { name: 'Driftmästerskap', icon: '🌀', desc: 'Samla driftpoäng under loppet. Poängen avgör medaljen.' },
  tid: { name: 'Tidsjakt', icon: '⏱️', desc: 'Ensam mot klockan. Slå måltiderna.' },
  duel: { name: 'Duell', icon: '⚔️', desc: 'En mot en. Vinn – och motståndarens bil blir din!' },
  rally: { name: 'Rallysträcka', icon: '🌲', desc: 'En sträcka mot klockan på grus eller snö. Slå måltiderna.' },
  klass: { name: 'Klasslopp', icon: '🎟️', desc: 'Bara bilar i en viss klass. Har du ingen får du låna en.' }
};

/** Kapitel med evenemang. req = stjärnor som krävs för att låsa upp kapitlet. */
export const CHAPTERS = [
  { id: 'k1', name: 'Kapitel 1 – Klubbracing', req: 0, diff: 'easy' },
  { id: 'k2', name: 'Kapitel 2 – Distriktsserien', req: 6, diff: 'medium' },
  { id: 'k3', name: 'Kapitel 3 – Riksmästerskapen', req: 16, diff: 'medium' },
  { id: 'k4', name: 'Kapitel 4 – Elitserien', req: 30, diff: 'hard' },
  { id: 'k5', name: 'Final – Kungsbucklan', req: 44, diff: 'hard' }
];

/** tgt (tid/rally): måltider i sekunder [guld, silver, brons] som multipel av par. drift: poäng [guld, silver, brons]. */
export const EVENTS = [
  // Kapitel 1
  { id: 'e_mids', ch: 'k1', type: 'race', name: 'Midsommarloppet', tracks: ['midsommar'], laps: 2, opp: 5, kr: 1200, crate: 'tra' },
  { id: 'e_skartid', ch: 'k1', type: 'tid', name: 'Tidsjakt i skärgården', tracks: ['skargarden'], laps: 1, tgt: [0.93, 1.0, 1.1], kr: 900, crate: 'tra' },
  { id: 'e_dadrift', ch: 'k1', type: 'drift', name: 'Driftskolan i Dalarna', tracks: ['dalarna'], laps: 2, tgt: [3200, 2000, 1000], kr: 1000, crate: 'tra' },
  { id: 'e_veteran', ch: 'k1', type: 'klass', klass: 'Klassiker', name: 'Veteranloppet på Gotland', tracks: ['gotland'], laps: 2, opp: 5, kr: 1400, crate: 'stal', car: 'vega' },
  { id: 'e_duel1', ch: 'k1', type: 'duel', name: 'Duell: Majken Mård', tracks: ['midsommar'], laps: 2, rival: { name: 'Majken Mård', car: 'pixel', skill: 0.96 }, kr: 800 },
  // Kapitel 2
  { id: 'e_brons', ch: 'k2', type: 'cup', name: 'Bronsbucklan', tracks: ['midsommar', 'skargarden', 'dalarna'], laps: 2, opp: 7, kr: 4000, crate: 'stal', car: 'lodjuret' },
  { id: 'e_hamnelim', ch: 'k2', type: 'elim', name: 'Utslagning i hamnen', tracks: ['hamnen'], opp: 5, kr: 2200, crate: 'stal' },
  { id: 'e_skogrally', ch: 'k2', type: 'rally', name: 'Skogsrallyt', tracks: ['skogsrally'], laps: 1, tgt: [0.94, 1.0, 1.1], kr: 2000, crate: 'stal' },
  { id: 'e_gruva', ch: 'k2', type: 'race', name: 'Gruvloppet', tracks: ['gruvan'], laps: 2, opp: 7, kr: 2400, crate: 'tra' },
  { id: 'e_elkvall', ch: 'k2', type: 'klass', klass: 'El', name: 'Elektrisk afton', tracks: ['tivoli'], laps: 2, opp: 5, kr: 2600, crate: 'stal', car: 'spark' },
  { id: 'e_duel2', ch: 'k2', type: 'duel', name: 'Duell: Ture Turbo', tracks: ['hogakusten'], laps: 2, rival: { name: 'Ture Turbo', car: 'blixten', skill: 0.97 }, kr: 1500 },
  // Kapitel 3
  { id: 'e_silver', ch: 'k3', type: 'cup', name: 'Silverbucklan', tracks: ['fjallpasset', 'storstad', 'hogakusten', 'gotland'], laps: 2, opp: 7, kr: 8000, crate: 'guld', car: 'tempesta' },
  { id: 'e_flygelim', ch: 'k3', type: 'elim', name: 'Utslagning på flygfältet', tracks: ['flygfaltet'], opp: 6, kr: 3500, crate: 'stal' },
  { id: 'e_neodrift', ch: 'k3', type: 'drift', name: 'Driftmästerskapet i Neostad', tracks: ['storstad'], laps: 2, tgt: [5200, 3400, 1800], kr: 3200, crate: 'stal' },
  { id: 'e_muskel', ch: 'k3', type: 'klass', klass: 'Muskel', name: 'Muskelmästerskapet', tracks: ['odemarken'], laps: 2, opp: 7, kr: 4000, crate: 'stal', car: 'bison' },
  { id: 'e_lapprally', ch: 'k3', type: 'rally', name: 'Lapplandsrallyt', tracks: ['lappland'], laps: 1, tgt: [0.94, 1.0, 1.1], kr: 3200, crate: 'stal' },
  { id: 'e_istid', ch: 'k3', type: 'tid', name: 'Tidsjakt på isen', tracks: ['isbanan'], laps: 1, tgt: [0.94, 1.0, 1.1], kr: 2600, crate: 'stal' },
  { id: 'e_duel3', ch: 'k3', type: 'duel', name: 'Duell: Harald Hård', tracks: ['oland'], laps: 1, rival: { name: 'Harald Hård', car: 'vraken', skill: 0.98 }, kr: 2500 },
  // Kapitel 4
  { id: 'e_guld', ch: 'k4', type: 'cup', name: 'Guldbucklan', tracks: ['isbanan', 'lappland', 'gruvan', 'tivoli', 'flygfaltet'], laps: 2, opp: 7, kr: 15000, crate: 'guld', car: 'stormfagel' },
  { id: 'e_olandsprint', ch: 'k4', type: 'race', name: 'Ölandsleden – storsprinten', tracks: ['oland'], laps: 1, opp: 7, kr: 6000, crate: 'guld' },
  { id: 'e_supergala', ch: 'k4', type: 'klass', klass: 'Super', name: 'Superbilsgalan', tracks: ['hogakusten'], laps: 2, opp: 5, kr: 7000, crate: 'guld' },
  { id: 'e_neoelim', ch: 'k4', type: 'elim', name: 'Neostad-utslagningen', tracks: ['storstad'], opp: 7, kr: 6000, crate: 'guld' },
  { id: 'e_terrang', ch: 'k4', type: 'klass', klass: 'Terräng', name: 'Terrängdraget', tracks: ['gruvan'], laps: 2, opp: 5, kr: 5000, crate: 'stal', car: 'timmer' },
  { id: 'e_duel4', ch: 'k4', type: 'duel', name: 'Duell: Sixten Snabb', tracks: ['fjallpasset'], laps: 2, rival: { name: 'Sixten Snabb', car: 'valkyria', skill: 1.0 }, kr: 5000 },
  // Final
  { id: 'e_kung', ch: 'k5', type: 'cup', name: 'Kungsbucklan', tracks: ['hogakusten', 'storstad@r', 'gotland', 'lappland', 'skargarden@r', 'oland'], laps: 2, opp: 7, kr: 30000, crate: 'guld', car: 'norrsken' }
];
export const eventById = (id) => EVENTS.find(e => e.id === id);
export const chapterOf = (e) => CHAPTERS.find(c => c.id === e.ch);

export function totalStars(career) { return Object.values(career || {}).reduce((a, b) => a + (b || 0), 0); }
export function chapterUnlocked(ch, career) { return totalStars(career) >= ch.req; }
export function eventUnlocked(e, career) { return chapterUnlocked(chapterOf(e), career); }

/** Stjärnor för ett resultat. res: { pos, n, time, drift, par } */
export function starsFor(e, res) {
  if (e.type === 'tid' || e.type === 'rally') {
    const t = e.tgt.map(m => m * res.par * (e.laps || 1));
    return res.time <= t[0] ? 3 : res.time <= t[1] ? 2 : res.time <= t[2] ? 1 : 0;
  }
  if (e.type === 'drift') return res.drift >= e.tgt[0] ? 3 : res.drift >= e.tgt[1] ? 2 : res.drift >= e.tgt[2] ? 1 : 0;
  if (e.type === 'duel') return res.pos === 1 ? 3 : 0;
  return res.pos === 1 ? 3 : res.pos === 2 ? 2 : res.pos === 3 ? 1 : 0;
}
/** Belöningstext. */
export function rewardText(e, carName) {
  const out = [e.kr.toLocaleString('sv-SE') + ' kr'];
  if (e.crate) out.push({ tra: 'Trälåda', stal: 'Stållåda', guld: 'Guldlåda' }[e.crate]);
  if (e.car) out.push('Bil: ' + carName(e.car) + ' (★★★)');
  if (e.type === 'duel') out.push('Bil: ' + carName(e.rival.car) + ' (vid seger)');
  return out;
}

/* ---------------- Dagliga utmaningar ---------------- */
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngFrom(seed) { let s = seed || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function todayKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
/** Tre utmaningar per dag (samma för alla). tracks = lista med upplåsta bannycklar. */
export function dailyChallenges(tracks, day = todayKey()) {
  const rng = rngFrom(hash('fj' + day));
  const kinds = [
    { type: 'race', name: 'Dagens lopp', opp: 5, laps: 2 },
    { type: 'tid', name: 'Dagens tidsjakt', laps: 1, tgt: [0.95, 1.02, 1.12] },
    { type: 'drift', name: 'Dagens drift', laps: 1, tgt: [2400, 1500, 700] },
    { type: 'elim', name: 'Dagens utslagning', opp: 4 }
  ];
  const out = [];
  const pool = tracks.slice();
  for (let k = 0; k < 3; k++) {
    const kind = kinds[(rng() * kinds.length) | 0];
    const tr = pool.splice((rng() * pool.length) | 0, 1)[0] || tracks[0];
    out.push(Object.assign({ id: 'd' + day + '_' + k, ch: null, daily: true, tracks: [tr], kr: 1000 + k * 500, crate: k === 2 ? 'guld' : 'stal' }, kind));
  }
  return out;
}
