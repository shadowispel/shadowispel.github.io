// Nordheim – vägsökning på rutnätet: A* med binär heap, väg-cache, siktlinje-utjämning och flödesfält (Dijkstra).
// Ren logik (ingen three).

export const PASS_P = 1;   // gångbar för spelarens folk
export const PASS_E = 2;   // gångbar för fiender

const SQ2 = Math.SQRT2;
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];

export class PathGrid {
  constructor(n) {
    this.n = n;
    const NN = n * n;
    this.pass = new Uint8Array(NN);        // bitmask PASS_P | PASS_E
    this.cost = new Float32Array(NN).fill(1);
    this.version = 1;
    this._g = new Float32Array(NN);
    this._par = new Int32Array(NN);
    this._stamp = new Uint32Array(NN);
    this._closed = new Uint32Array(NN);
    this._gen = 1;
    this._heap = new Int32Array(NN + 8);
    this._hf = new Float32Array(NN + 8);
    this._hs = 0;
    this.cache = new Map();
    this.stats = { searches: 0, cacheHits: 0, expanded: 0 };
  }
  bump() { this.version++; this.cache.clear(); }
  walk(k, mask) { return (this.pass[k] & mask) !== 0; }
  inb(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n; }

  _push(k, f) {
    let i = this._hs++;
    const H = this._heap, F = this._hf;
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; H[i] = H[p]; F[i] = F[p]; i = p; }
    H[i] = k; F[i] = f;
  }
  _pop() {
    const H = this._heap, F = this._hf;
    const top = H[0];
    const n = --this._hs;
    if (n > 0) {
      const k = H[n], f = F[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= f) break;
        H[i] = H[c]; F[i] = F[c]; i = c;
      }
      H[i] = k; F[i] = f;
    }
    return top;
  }

  /**
   * A* från ruta (si,sj) till rektangeln [i0..i1]×[j0..j1] (inklusive).
   * Returnerar lista med rutindex (exkl. start) eller null.
   */
  find(si, sj, i0, j0, i1, j1, mask = PASS_P, maxExp = 9000) {
    const n = this.n;
    if (!this.inb(si, sj)) return null;
    const key = (sj * n + si) + ':' + i0 + ',' + j0 + ',' + i1 + ',' + j1 + ':' + mask;
    const hit = this.cache.get(key);
    if (hit) { this.stats.cacheHits++; this.cache.delete(key); this.cache.set(key, hit); return hit; }
    this.stats.searches++;
    const gen = ++this._gen;
    const G = this._g, P = this._par, S = this._stamp, C = this._closed, pass = this.pass, cost = this.cost;
    this._hs = 0;
    const start = sj * n + si;
    const hfun = (i, j) => {
      const ci = i < i0 ? i0 : (i > i1 ? i1 : i), cj = j < j0 ? j0 : (j > j1 ? j1 : j);
      const dx = Math.abs(i - ci), dy = Math.abs(j - cj);
      return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy);
    };
    G[start] = 0; P[start] = -1; S[start] = gen;
    this._push(start, hfun(si, sj));
    let found = -1, exp = 0;
    // tillåt start i en blockerad ruta (t.ex. när en byggnad just placerats ovanpå)
    while (this._hs > 0) {
      const k = this._pop();
      if (C[k] === gen) continue;
      C[k] = gen;
      const i = k % n, j = (k / n) | 0;
      if (i >= i0 && i <= i1 && j >= j0 && j <= j1) { found = k; break; }
      if (++exp > maxExp) break;
      const gk = G[k];
      for (let d = 0; d < 8; d++) {
        const ni = i + DI[d], nj = j + DJ[d];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (!(pass[nk] & mask)) {
          // målrutan får vara blockerad om den ligger i målområdet (t.ex. en sten att bryta)
          if (!(ni >= i0 && ni <= i1 && nj >= j0 && nj <= j1 && i0 === i1 && j0 === j1)) continue;
        }
        let step = 1;
        if (d >= 4) {
          if (!(pass[j * n + ni] & mask) || !(pass[nj * n + i] & mask)) continue;
          step = SQ2;
        }
        const ng = gk + step * cost[nk];
        if (S[nk] === gen && ng >= G[nk]) continue;
        if (C[nk] === gen) continue;
        S[nk] = gen; G[nk] = ng; P[nk] = k;
        this._push(nk, ng + hfun(ni, nj));
      }
    }
    this.stats.expanded += exp;
    if (found < 0) return null;
    const out = [];
    for (let k = found; k !== start && k >= 0; k = P[k]) out.push(k);
    out.reverse();
    const sm = this.smooth(start, out, mask);
    if (this.cache.size > 600) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, sm);
    return sm;
  }

  /** Siktlinje mellan två rutcentrum där alla passerade rutor är gångbara och har låg kostnad. */
  los(a, b, mask) {
    const n = this.n;
    let x0 = a % n, y0 = (a / n) | 0;
    const x1 = b % n, y1 = (b / n) | 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const c0 = this.cost[a];
    for (let guard = 0; guard < 400; guard++) {
      const k = y0 * n + x0;
      if (!(this.pass[k] & mask) && k !== a && k !== b) return false;
      if (Math.abs(this.cost[k] - c0) > 0.3 && k !== a && k !== b) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) {
        // diagonalt steg: kontrollera hörnen
        if (!(this.pass[y0 * n + x0 + sx] & mask) || !(this.pass[(y0 + sy) * n + x0] & mask)) return false;
      }
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return false;
  }

  smooth(start, path, mask) {
    if (path.length < 3) return path;
    const out = [];
    let anchor = start, i = 0;
    while (i < path.length) {
      let j = i;
      // gå så långt som möjligt i fri sikt (begränsat för att hålla det billigt)
      for (let t = i + 1; t < path.length && t < i + 14; t++) { if (this.los(anchor, path[t], mask)) j = t; else break; }
      out.push(path[j]);
      anchor = path[j];
      i = j + 1;
    }
    return out;
  }

  /**
   * Sammanhängande områden (4-grannar) för spelarens folk. Cachas per version.
   * Returnerar { id: Int32Array, size: Int32Array-liknande array }.
   */
  regions(mask = PASS_P) {
    if (this._reg && this._regVer === this.version && this._regMask === mask) return this._reg;
    const n = this.n, NN = n * n, id = this._regId || (this._regId = new Int32Array(NN));
    id.fill(-1);
    const size = [], q = this._regQ || (this._regQ = new Int32Array(NN));
    for (let s = 0; s < NN; s++) {
      if (id[s] >= 0 || !(this.pass[s] & mask)) continue;
      const r = size.length; let h = 0, t = 0; q[t++] = s; id[s] = r;
      while (h < t) {
        const k = q[h++], i = k % n, j = (k / n) | 0;
        if (i > 0 && id[k - 1] < 0 && (this.pass[k - 1] & mask)) { id[k - 1] = r; q[t++] = k - 1; }
        if (i < n - 1 && id[k + 1] < 0 && (this.pass[k + 1] & mask)) { id[k + 1] = r; q[t++] = k + 1; }
        if (j > 0 && id[k - n] < 0 && (this.pass[k - n] & mask)) { id[k - n] = r; q[t++] = k - n; }
        if (j < n - 1 && id[k + n] < 0 && (this.pass[k + n] & mask)) { id[k + n] = r; q[t++] = k + n; }
      }
      size.push(t);
    }
    this._reg = { id, size }; this._regVer = this.version; this._regMask = mask;
    return this._reg;
  }
  /** Storlek på området som rutan k tillhör (0 om blockerad). */
  regionSize(k, mask = PASS_P) { const r = this.regions(mask); const i = r.id[k]; return i < 0 ? 0 : r.size[i]; }

  /**
   * Flödesfält: Dijkstra från målrutor. costFn(k) → steg-kostnad (Infinity = ogenomtränglig).
   * Returnerar Float32Array med avstånd.
   */
  flow(goals, costFn) {
    const n = this.n, NN = n * n;
    const dist = new Float32Array(NN).fill(Infinity);
    this._hs = 0;
    for (const k of goals) { dist[k] = 0; this._push(k, 0); }
    while (this._hs > 0) {
      const f = this._hf[0];
      const k = this._pop();
      if (f > dist[k]) continue;
      const i = k % n, j = (k / n) | 0;
      for (let d = 0; d < 8; d++) {
        const ni = i + DI[d], nj = j + DJ[d];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        const c = costFn(nk);
        if (c === Infinity) continue;
        let step = c;
        if (d >= 4) {
          if (costFn(j * n + ni) === Infinity || costFn(nj * n + i) === Infinity) continue;
          step *= SQ2;
        }
        const nd = f + step;
        if (nd < dist[nk]) { dist[nk] = nd; this._push(nk, nd); }
      }
    }
    return dist;
  }
}

export { DI, DJ };
