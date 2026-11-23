/** Inventarie, stackar och tillverkningsrecept. Ingen DOM här. */
import { B, I, TOOL0, maxStack, toolOf, SMELT, fuelOf, itemName } from './blocks.js';

export const TAGS = {
  '#planks': [B.spruce_planks, B.birch_planks, B.pine_planks],
  '#log': [B.spruce_log, B.birch_log, B.pine_log],
  '#stone': [B.cobble, B.mossy_cobble],
  '#wool': [41, 42, 43, 44, 45, 46, 47]
};
export const TAG_NAMES = { '#planks': 'Plankor (valfria)', '#log': 'Stam (valfri)', '#stone': 'Kullersten', '#wool': 'Ull (valfri)' };
const matches = (want, id) => want === id || (typeof want === 'string' && TAGS[want] && TAGS[want].includes(id));

/* ---------- recept ---------- */
export const RECIPES = [];
const R = (out, n, shape, key, cat) => RECIPES.push({ out, n, shape, key, cat });
const RS = (out, n, list, cat) => RECIPES.push({ out, n, shapeless: list, cat });
RS(B.spruce_planks, 4, [B.spruce_log], 'Grund');
RS(B.birch_planks, 4, [B.birch_log], 'Grund');
RS(B.pine_planks, 4, [B.pine_log], 'Grund');
R(I.stick, 4, ['P', 'P'], { P: '#planks' }, 'Grund');
R(B.workbench, 1, ['PP', 'PP'], { P: '#planks' }, 'Grund');
R(B.torch, 4, ['C', 'S'], { C: I.coal, S: I.stick }, 'Grund');
R(B.torch, 2, ['C', 'S'], { C: B.peat, S: I.stick }, 'Grund');
const MATS = [['#planks', 0], ['#stone', 1], [I.iron_ingot, 2], [I.crystal, 3]];
for (const [m, t] of MATS) {
  R(TOOL0 + t * 4 + 0, 1, ['MMM', ' S ', ' S '], { M: m, S: I.stick }, 'Verktyg');
  R(TOOL0 + t * 4 + 1, 1, ['MM', 'MS', ' S'], { M: m, S: I.stick }, 'Verktyg');
  R(TOOL0 + t * 4 + 2, 1, ['M', 'S', 'S'], { M: m, S: I.stick }, 'Verktyg');
  R(TOOL0 + t * 4 + 3, 1, ['M', 'M', 'S'], { M: m, S: I.stick }, 'Verktyg');
}
R(B.furnace, 1, ['CCC', 'C C', 'CCC'], { C: '#stone' }, 'Bygg');
R(B.chest, 1, ['PPP', 'P P', 'PPP'], { P: '#planks' }, 'Bygg');
R(I.door, 2, ['PP', 'PP', 'PP'], { P: '#planks' }, 'Bygg');
R(I.bed, 1, ['WWW', 'PPP'], { W: '#wool', P: '#planks' }, 'Bygg');
R(I.bed, 1, ['FFF', 'PPP'], { F: I.shadowfur, P: '#planks' }, 'Bygg');
R(B.stone_bricks, 4, ['SS', 'SS'], { S: B.stone }, 'Bygg');
R(B.sandstone, 1, ['SS', 'SS'], { S: B.sand }, 'Bygg');
R(B.cobble_slab, 6, ['CCC'], { C: '#stone' }, 'Bygg');
R(B.plank_slab, 6, ['PPP'], { P: '#planks' }, 'Bygg');
R(B.lantern, 1, [' I ', 'IGI', ' I '], { I: I.iron_ingot, G: I.glowdust }, 'Ljus');
R(B.lantern, 1, [' I ', 'ITI', ' I '], { I: I.iron_ingot, T: B.torch }, 'Ljus');
R(B.crystal_block, 1, ['CC', 'CC'], { C: I.crystal }, 'Ljus');
R(B.gold_block, 1, ['GGG', 'GGG', 'GGG'], { G: I.gold_ingot }, 'Bygg');
R(B.iron_block, 1, ['GGG', 'GGG', 'GGG'], { G: I.iron_ingot }, 'Bygg');
RS(I.gold_ingot, 9, [B.gold_block], 'Bygg');
RS(I.iron_ingot, 9, [B.iron_block], 'Bygg');
R(B.wool_white, 1, ['CC', 'CC'], { C: B.cottongrass }, 'Ull');
RS(B.wool_blue, 1, [B.wool_white, B.bluebell], 'Ull');
RS(B.wool_yellow, 1, [B.wool_white, B.buttercup], 'Ull');
RS(B.wool_pink, 1, [B.wool_white, B.fireweed], 'Ull');
RS(B.wool_red, 1, [B.wool_white, I.lingon], 'Ull');
RS(B.wool_green, 1, [B.wool_white, I.moss], 'Ull');
RS(B.wool_black, 1, [B.wool_white, I.coal], 'Ull');
RS(B.wool_black, 1, [B.wool_white, I.shadowfur], 'Ull');
RS(B.mossy_cobble, 1, [B.cobble, I.moss], 'Bygg');

/** grid: array (4 eller 9) av stack|null, size 2|3 → { recipe, out:{id,n} } | null */
export function findRecipe(grid, size) {
  // trimma
  let minX = 9, minY = 9, maxX = -1, maxY = -1; const ids = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = grid[y * size + x];
    if (s) { ids.push(s.id); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (!ids.length) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.shapeless) {
      if (r.shapeless.length !== ids.length) continue;
      const left = ids.slice();
      let ok = true;
      for (const want of r.shapeless) { const k = left.findIndex(id => matches(want, id)); if (k < 0) { ok = false; break; } left.splice(k, 1); }
      if (ok) return { recipe: r, out: { id: r.out, n: r.n } };
      continue;
    }
    const rh = r.shape.length, rw = Math.max(...r.shape.map(s => s.length));
    if (rw !== w || rh !== h || rw > size || rh > size) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
        const ch = (r.shape[y][mirror ? w - 1 - x : x] || ' ');
        const s = grid[(y + minY) * size + x + minX];
        if (ch === ' ') { if (s) ok = false; }
        else if (!s || !matches(r.key[ch], s.id)) ok = false;
      }
      // tagg-konsekvens: plankor av olika sorter får blandas (ok)
      if (ok) return { recipe: r, out: { id: r.out, n: r.n } };
    }
  }
  return null;
}

/** Ingredienser för ett recept som lista {want, n} */
export function ingredients(r) {
  const cnt = new Map();
  const list = r.shapeless || r.shape.join('').split('').filter(c => c !== ' ').map(c => r.key[c]);
  for (const w of list) cnt.set(w, (cnt.get(w) || 0) + 1);
  return [...cnt].map(([want, n]) => ({ want, n }));
}
export function wantName(w) { return typeof w === 'string' ? TAG_NAMES[w] || w : itemName(w); }

/* ---------- inventarie ---------- */
export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);   // 0..8 = snabbfält
    this.sel = 0;
    this.cursor = null;                      // stack på muspekaren
    this.craft = new Array(9).fill(null);
    this.onChange = null;
  }
  changed() { if (this.onChange) this.onChange(); }
  get held() { return this.slots[this.sel]; }
  /** Lägg till; returnerar antal som inte fick plats */
  add(id, n = 1, d = 0) {
    const ms = maxStack(id);
    if (ms > 1) for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 36 && n > 0; i++) {
      const order = i < 9 ? i : i; const s = this.slots[order];
      if (s && s.id === id && s.n < ms) { const k = Math.min(ms - s.n, n); s.n += k; n -= k; }
    }
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(ms, n); this.slots[i] = { id, n: k, d }; n -= k; }
    }
    this.changed();
    return n;
  }
  count(want) { let c = 0; for (const s of this.slots) if (s && matches(want, s.id)) c += s.n; return c; }
  /** ta bort n st som matchar want; returnerar lista av borttagna id:n */
  take(want, n) {
    const got = [];
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i]; if (!s || !matches(want, s.id)) continue;
      const k = Math.min(s.n, n); s.n -= k; n -= k; for (let j = 0; j < k; j++) got.push(s.id);
      if (s.n <= 0) this.slots[i] = null;
    }
    this.changed();
    return got;
  }
  useHeld(n = 1) { const s = this.slots[this.sel]; if (!s) return; s.n -= n; if (s.n <= 0) this.slots[this.sel] = null; this.changed(); }
  /** Slitage på hållet verktyg. Returnerar true om det gick sönder. */
  wearHeld(amount = 1) {
    const s = this.slots[this.sel]; if (!s) return false;
    const t = toolOf(s.id); if (!t) return false;
    s.d = (s.d || 0) + amount;
    if (s.d >= t.dur) { this.slots[this.sel] = null; this.changed(); return true; }
    this.changed(); return false;
  }
  serialize() { return { slots: this.slots.map(s => s && [s.id, s.n, s.d || 0]), sel: this.sel }; }
  load(o) {
    if (!o) return;
    this.slots = o.slots.map(s => s ? { id: s[0], n: s[1], d: s[2] || 0 } : null);
    while (this.slots.length < 36) this.slots.push(null);
    this.sel = o.sel || 0;
    this.changed();
  }
  clear() { this.slots.fill(null); this.cursor = null; this.craft.fill(null); this.changed(); }
}

/* ---------- ugn ---------- */
export function smeltResult(id) { return SMELT[id] || 0; }
export function newFurnace() { return { in: null, fuel: null, out: null, burn: 0, burnMax: 0, prog: 0 }; }
/** Uppdatera en ugn dt sekunder. Returnerar true om den brinner. */
export const SMELT_TIME = 8;
export function tickFurnace(f, dt) {
  const res = f.in ? smeltResult(f.in.id) : 0;
  const canOut = res && (!f.out || (f.out.id === res && f.out.n < maxStack(res)));
  if (f.burn <= 0 && canOut && f.fuel && fuelOf(f.fuel.id) > 0) {
    f.burn = f.burnMax = fuelOf(f.fuel.id);
    f.fuel.n--; if (f.fuel.n <= 0) f.fuel = null;
  }
  if (f.burn > 0) {
    f.burn -= dt;
    if (canOut) {
      f.prog += dt;
      if (f.prog >= SMELT_TIME) {
        f.prog = 0;
        f.in.n--; if (f.in.n <= 0) f.in = null;
        if (f.out) f.out.n++; else f.out = { id: res, n: 1, d: 0 };
      }
    } else f.prog = Math.max(0, f.prog - dt * 2);
    return true;
  }
  f.prog = Math.max(0, f.prog - dt * 2);
  return false;
}
