// Nordheim – delat speltillstånd (singleton) och krokar mellan moduler.
import { DAY, DAYS_PER_SEASON, SEASONS } from './data.js';

export const G = { on: false };

// Krokar som main.js/render.js fyller i
export const hooks = {
  sfx: () => {},          // (namn, x, z, opts)
  float: () => {},        // (text, x, y, z, färg)
  fx: () => {},           // (typ, x, y, z, n)
  notify: () => {},       // (text, typ, {x,z})
  onBuildingAdded: () => {}, onBuildingRemoved: () => {}, onBuildingChanged: () => {},
  onTileChanged: () => {}, onTreeChanged: () => {}, onResChanged: () => {},
  onGameOver: () => {}, onVictory: () => {}, onObjective: () => {}
};

export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

/** Höjd på terrängen i världskoordinat (exakt samma triangulering som terrängmeshen). */
export function heightAt(x, z) {
  const m = G.map; if (!m) return 0;
  const n = m.n, N1 = n + 1, h = m.h;
  if (x < 0 || z < 0 || x >= n || z >= n) return -3;
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const a = h[j * N1 + i], b = h[j * N1 + i + 1], c = h[(j + 1) * N1 + i], d = h[(j + 1) * N1 + i + 1];
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}
export const groundY = (x, z) => Math.max(heightAt(x, z), 0);
export const tileOf = (x, z) => { const n = G.map.n; const i = Math.floor(x), j = Math.floor(z); return (i < 0 || j < 0 || i >= n || j >= n) ? -1 : j * n + i; };
export const tileX = k => (k % G.map.n) + 0.5;
export const tileZ = k => Math.floor(k / G.map.n) + 0.5;

/* ---------- Tid ---------- */
export function calendar(t = G.time) {
  const dayN = Math.floor(t / DAY);
  const phase = (t % DAY) / DAY;
  const sIdx = Math.floor(dayN / DAYS_PER_SEASON) % 4;
  const year = Math.floor(dayN / (DAYS_PER_SEASON * 4)) + 1;
  const dayInSeason = dayN % DAYS_PER_SEASON + 1;
  const seasonPhase = ((t / DAY) % DAYS_PER_SEASON) / DAYS_PER_SEASON;
  return { dayN, phase, season: sIdx, seasonInfo: SEASONS[sIdx], year, dayInSeason, seasonPhase };
}
// dygnsfas: 0 = gryning, 0.25 = förmiddag, 0.5 = eftermiddag, 0.72 skymning, 0.8–1 natt
export const isNight = (phase) => phase > 0.8 || phase < 0.03;
export const sleepTime = (phase) => phase > 0.83 && phase < 0.985;

let _rs = 1234567;
export function rand() { _rs = (_rs * 1103515245 + 12345) & 0x7fffffff; return _rs / 0x7fffffff; }
export function seedRand(s) { _rs = (s >>> 0) || 1; }

export function nextId() { return ++G.nextId; }

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
