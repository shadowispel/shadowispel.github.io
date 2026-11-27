/**
 * Fjällracet – delar, lådor och sällsynthet. Ren logik (ingen three).
 * Prestandadelar och utseendedelar är "upplåsningar": när du hittat en del kan du montera den på alla dina bilar.
 * Hittar du en del du redan har blir den en dubblett som kan bytas mot kronor.
 */
import { FINISHES, RIMS, SPOILERS, KITS, DECALS, TINTS } from './carmodel.js';

export const RARITIES = [
  { id: 0, name: 'Vanlig', color: '#b9c2cf', sell: 120 },
  { id: 1, name: 'Ovanlig', color: '#4ade80', sell: 300 },
  { id: 2, name: 'Sällsynt', color: '#39a0ff', sell: 700 },
  { id: 3, name: 'Episk', color: '#b56cff', sell: 1600 },
  { id: 4, name: 'Legendarisk', color: '#ffb52e', sell: 4000 }
];

/** Prestandakategorier. fx(lvl) → tillägg på bilens värden (lvl 1–5 = sällsynthet + 1). */
export const PERF = [
  { id: 'motor', name: 'Motor', icon: '🔧', desc: 'Mer effekt: högre toppfart och bättre acceleration.', fx: l => ({ top: 0.7 * l, accel: 0.22 * l }) },
  { id: 'turbo', name: 'Turbo', icon: '🌀', desc: 'Kraftigt mer acceleration, lite mer toppfart.', fx: l => ({ accel: 0.4 * l, top: 0.3 * l }) },
  { id: 'vaxel', name: 'Växellåda', icon: '⚙️', desc: 'Kortare växlar och snabbare växlingar.', fx: l => ({ accel: 0.18 * l, top: 0.45 * l }) },
  { id: 'dack', name: 'Däck', icon: '🛞', desc: 'Grepp – välj däcktyp efter underlaget.', fx: l => ({}) },
  { id: 'fjad', name: 'Fjädring', icon: '🪛', desc: 'Stabilare kurvtagning och lite villigare drift.', fx: l => ({ grip: 0.18 * l, drift: 0.025 * l }) },
  { id: 'broms', name: 'Bromsar', icon: '🛑', desc: 'Kortare bromssträckor – bromsa senare.', fx: l => ({ brake: 1.1 * l }) },
  { id: 'nitro', name: 'Nitrosystem', icon: '🔥', desc: 'Nitron räcker längre och laddas snabbare.', fx: l => ({ nitro: 0.07 * l }) },
  { id: 'vikt', name: 'Viktminskning', icon: '🪶', desc: 'Lättare bil: bättre acceleration men knuffas lättare.', fx: l => ({ mass: -0.035 * l, accel: 0.12 * l, grip: 0.06 * l }) }
];
/** Däcktyper: grepptillägg per underlag (per nivå). */
export const TIRES = [
  { id: 'asfalt', name: 'Asfaltsdäck', g: { asfalt: 0.32, grus: 0.05, 'snö': 0, is: 0 } },
  { id: 'grus', name: 'Grusdäck', g: { asfalt: 0.08, grus: 0.4, 'snö': 0.2, is: 0.08 } },
  { id: 'vinter', name: 'Vinterdäck (dubb)', g: { asfalt: 0, grus: 0.15, 'snö': 0.4, is: 0.5 } }
];
export const SURFACE_NAME = { asfalt: 'Asfalt', grus: 'Grus', 'snö': 'Snö', is: 'Is' };

/** Utseendekategorier (id-listor kommer från carmodel.js). */
export const LOOK = [
  { id: 'finish', name: 'Lackyta', icon: '✨', items: FINISHES.filter(x => x.id !== 'gloss'), rar: { metallic: 0, matte: 1, pearl: 3, chrome: 4 } },
  { id: 'rims', name: 'Fälgar', icon: '⭕', items: RIMS.filter(x => x.id !== 'std'), rar: { fem: 0, stal: 0, mesh: 1, skal: 1, racing: 2, turbin: 2, trad: 3 } },
  { id: 'spoiler', name: 'Spoiler', icon: '🪽', items: SPOILERS.filter(x => x.id !== 'none'), rar: { lip: 0, duck: 1, rally: 1, gt: 2, swan: 3 } },
  { id: 'kit', name: 'Bodykit', icon: '🛡️', items: KITS.filter(x => x.id !== 'none'), rar: { sport: 1, rally: 1, retro: 2, wide: 3 } },
  { id: 'decal', name: 'Dekaler', icon: '🎨', items: DECALS.filter(x => x.id !== 'none'), rar: { side: 0, race: 0, checker: 1, fade: 1, geo: 2, camo: 2, bolt: 2, flames: 3 } },
  { id: 'neon', name: 'Neon', icon: '💡', items: [{ id: '0x39d5ff', name: 'Isblå neon' }, { id: '0xff3df0', name: 'Rosa neon' }, { id: '0x4ade80', name: 'Grön neon' }, { id: '0xffb52e', name: 'Bärnstensneon' }, { id: '0xb56cff', name: 'Lila neon' }, { id: '0xff3333', name: 'Röd neon' }], rar: { '0x39d5ff': 2, '0xff3df0': 2, '0x4ade80': 2, '0xffb52e': 3, '0xb56cff': 3, '0xff3333': 4 } },
  { id: 'tint', name: 'Rutfärg', icon: '🪟', items: TINTS.filter(x => x.id !== 'clear'), rar: { dark: 0, blue: 1, green: 1, gold: 3 } }
];
export const lookCat = (id) => LOOK.find(c => c.id === id);
export const perfCat = (id) => PERF.find(c => c.id === id);

/** Delnyckel: 'p:motor:2' (prestanda, sällsynthet 2), 'p:dack:grus:1', 'l:rims:turbin'. */
export function partInfo(key) {
  const a = key.split(':');
  if (a[0] === 'p') {
    const cat = perfCat(a[1]); if (!cat) return null;
    const tire = a[1] === 'dack' ? TIRES.find(t => t.id === a[2]) : null;
    const rar = +(tire ? a[3] : a[2]);
    if (!(rar >= 0 && rar <= 4) || (a[1] === 'dack' && !tire)) return null;
    const lvl = rar + 1;
    return { key, kind: 'perf', cat: cat.id, catName: cat.name, icon: cat.icon, rar, lvl, tire: tire && tire.id,
      name: (tire ? tire.name : cat.name) + ' ' + ['I', 'II', 'III', 'IV', 'V'][rar], desc: cat.desc };
  }
  if (a[0] === 'l') {
    const cat = lookCat(a[1]); if (!cat) return null;
    const it = cat.items.find(x => x.id === a.slice(2).join(':')); if (!it) return null;
    return { key, kind: 'look', cat: cat.id, catName: cat.name, icon: cat.icon, rar: cat.rar[it.id] || 0, id: it.id, name: it.name, desc: cat.name };
  }
  return null;
}

/** Alla delar som kan hittas. */
export const ALL_PARTS = (() => {
  const out = [];
  for (const c of PERF) for (let r = 0; r < 5; r++) {
    if (c.id === 'dack') for (const t of TIRES) out.push(`p:dack:${t.id}:${r}`);
    else out.push(`p:${c.id}:${r}`);
  }
  for (const c of LOOK) for (const it of c.items) out.push(`l:${c.id}:${it.id}`);
  return out;
})();

/** Lådor. weights: sannolikhet per sällsynthet. */
export const CRATES = {
  tra: { name: 'Trälåda', color: '#b07a45', weights: [60, 28, 9, 2.6, 0.4], items: 3, coins: [150, 400] },
  stal: { name: 'Stållåda', color: '#9fb4c8', weights: [30, 38, 21, 9, 2], items: 3, coins: [400, 900] },
  guld: { name: 'Guldlåda', color: '#ffcc33', weights: [0, 25, 42, 25, 8], items: 4, coins: [900, 2000] }
};

function pickRarity(w, rng) {
  const sum = w.reduce((a, b) => a + b, 0); let x = rng() * sum;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return 0;
}
/** Öppnar en låda: returnerar [{key, info, dup}] + kronor. inv = Set/array med ägda nycklar. */
export function openCrate(type, owned, rng = Math.random) {
  const c = CRATES[type] || CRATES.tra;
  const got = [];
  for (let k = 0; k < c.items; k++) {
    const rar = pickRarity(c.weights, rng);
    let pool = ALL_PARTS.filter(p => partInfo(p).rar === rar);
    // lite större chans för något nytt
    const fresh = pool.filter(p => !owned.includes(p) && !got.some(g => g.key === p));
    if (fresh.length && rng() < 0.7) pool = fresh;
    const key = pool[(rng() * pool.length) | 0];
    const dup = owned.includes(key) || got.some(g => g.key === key);
    got.push({ key, info: partInfo(key), dup });
  }
  got.sort((a, b) => a.info.rar - b.info.rar);
  const coins = Math.round((c.coins[0] + rng() * (c.coins[1] - c.coins[0])) / 10) * 10;
  return { items: got, coins };
}

/** Effektiv bilspec med monterade prestandadelar. setup.perf: { cat: key }. surface: banans underlag. */
export function applyParts(base, perf, surface = 'asfalt') {
  const s = Object.assign({}, base);
  s.nitroMul = 1;
  if (!perf) return s;
  for (const cat of Object.keys(perf)) {
    const info = perf[cat] && partInfo(perf[cat]); if (!info || info.kind !== 'perf' || info.cat !== cat) continue;
    if (cat === 'dack') {
      const t = TIRES.find(x => x.id === info.tire);
      s.grip += (t.g[surface] || 0) * info.lvl;
      if (info.tire !== 'asfalt' && surface !== 'asfalt') s.iceBonus = Math.min(0.8, (s.iceBonus || 0) + 0.04 * info.lvl);
      continue;
    }
    const fx = perfCat(cat).fx(info.lvl);
    for (const k in fx) { if (k === 'nitro') s.nitroMul += fx[k]; else s[k] = (s[k] || 0) + fx[k]; }
  }
  s.mass = Math.max(0.5, s.mass);
  return s;
}
