/**
 * Gnistkretsar: ledning (gnistdamm), strömkällor (spak, knapp, tryckplatta, gnistfackla, dagsljussensor, observatör),
 * förstärkare och mekanismer (lampa, dörr, fällucka, grind, TNT, kolv, utmatare, notblock).
 *
 * Simuleras i fasta steg (10 Hz). Bara "smutsiga" platser räknas om: när ett block ändras markeras det och dess
 * närmaste grannar (två steg ut). Ledningsnät räknas om som helhet med en hinkkö (styrka 15 → 1).
 * Exakt ledningsstyrka sparas inte – den räknas om när en chunk laddas (bara chunkens sparade ändringar genomsöks).
 */
import * as THREE from 'three';
import {
  BLOCKS, B, I, DIR6, isWire, WIRE0, isRep, REP0, isPiston, isPHead, PHEAD0, isDoor, DOOR0, isTrap, TRAP0, isGate, GATE0,
  isButton, isObs, isSparkTorch, T_SOLID, T_OPAQUE, isWater, isLava, M_CROSS, DISP0
} from './blocks.js';

export const TICK = 0.1;
const REP_D = [0, 1, 4, 5];          // förstärkarens riktning → DIR6
const key = (x, y, z) => x + ',' + y + ',' + z;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];

/** Är blocket något kretsmotorn bryr sig om? (används vid chunkladdning) */
function relevant(b) {
  const d = BLOCKS[b]; if (!d) return false;
  return !!(d.wire || d.circ || d.rep || d.plate || d.powerable || d.door || d.obs !== undefined || d.piston || b === B.lever_on || b === B.tnt || isPHead(b));
}

export class Circuits {
  constructor(game, saved) {
    this.g = game; this.w = game.world;
    this.level = new Map();      // ledning → styrka
    this.pressed = new Map();    // knapp/tryckplatta → kvarvarande steg
    this.state = new Map();      // mekanism → senast sedd strömstatus (för kantstyrda: dörrar, TNT, utmatare…)
    this.pulse = new Map();      // observatör → kvarvarande pulssteg
    this.sched = new Map();      // plats → { at, fn } (förstärkare, gnistfacklor)
    this.data = new Map(saved !== undefined ? saved || [] : game.meta.circ || []); // sparat: förstärkarfördröjning, notblockets ton
    this.plates = new Set(); this.sensors = new Set();
    this.dirty = new Map();      // nyckel → [x,y,z]
    this.ticks = 0; this.acc = 0; this._quiet = false;
    this.stats = { ms: 0 };
  }
  serialize() { return [...this.data]; }

  /* ---------- markering ---------- */
  mark(x, y, z) { const k = key(x, y, z); if (!this.dirty.has(k)) this.dirty.set(k, [x, y, z]); }
  markAround(x, y, z) {
    this.mark(x, y, z);
    for (const [dx, dy, dz] of DIR6) {
      const ax = x + dx, ay = y + dy, az = z + dz;
      this.mark(ax, ay, az);
      for (const [ex, ey, ez] of DIR6) this.mark(ax + ex, ay + ey, az + ez);
    }
  }
  /** Anropas för varje blockändring i världen */
  onBlockChange(x, y, z, o, n) {
    const od = BLOCKS[o], nd = BLOCKS[n];
    if (od && od.plate) this.plates.delete(key(x, y, z));
    if (nd && nd.plate) this.plates.add(key(x, y, z));
    if (o === B.daylight) this.sensors.delete(key(x, y, z));
    if (n === B.daylight) this.sensors.add(key(x, y, z));
    // borttagen kolv: ta bort huvudet också
    if (od && od.piston && !(nd && nd.piston)) { const [dx, dy, dz] = DIR6[od.piston.f]; const h = this.w.get(x + dx, y + dy, z + dz); if (h === PHEAD0 + od.piston.f) this.w.set(x + dx, y + dy, z + dz, 0, { noUpdate: true }); }
    if (od && od.wire && !(nd && nd.wire)) this.level.delete(key(x, y, z));
    if (!this._quiet) this.markAround(x, y, z);
    // observatörer som tittar på den här platsen
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIR6[d], qx = x + dx, qy = y + dy, qz = z + dz, q = this.w.get(qx, qy, qz);
      if (q > 0 && isObs(q) && BLOCKS[q].obs === (d ^ 1)) { const k = key(qx, qy, qz); if (!this.pulse.has(k)) { this.pulse.set(k, 3); this.markAround(qx, qy, qz); } }
    }
  }
  /** En chunk har laddats: väck kretsblock i dess sparade ändringar */
  onChunkReady(c, mods) {
    // genererade kretsblock (t.ex. fällor i strukturer)
    if (c.extra && c.extra.circ) for (const [x, y, z] of c.extra.circ) { const b = this.w.get(x, y, z); if (b > 0 && BLOCKS[b].plate) this.plates.add(key(x, y, z)); this.mark(x, y, z); }
    if (!mods) return;
    for (const [i, id] of mods) {
      if (!relevant(id)) continue;
      const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = i >> 8;
      this.mark(x, y, z);
      if (BLOCKS[id].plate) this.plates.add(key(x, y, z));
      if (id === B.daylight) this.sensors.add(key(x, y, z));
    }
  }

  /* ---------- källor ---------- */
  press(x, y, z, ticks = 10) { this.pressed.set(key(x, y, z), ticks); this.markAround(x, y, z); const a = BLOCKS[this.w.get(x, y, z)]; if (a && a.attach !== undefined && a.attach < 4) { const [dx, , dz] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][a.attach]; this.markAround(x + dx, y, z + dz); } else this.markAround(x, y - 1, z); }
  sensorLevel(x, y, z) { const L = this.w.light(x, y + 1, z) >> 4; return Math.round(L / 15 * this.g.sky.daylight * 15); }
  /** Styrka som blocket b på (x,y,z) sänder åt riktning d */
  emit(b, x, y, z, d) {
    if (b <= 0) return 0;
    if (b === B.lever_on) return 15;
    const bd = BLOCKS[b]; if (!bd) return 0;
    if (bd.wire) return d === 2 ? 0 : (this.level.get(key(x, y, z)) || 0);
    if (isButton(b) || bd.plate) return this.pressed.has(key(x, y, z)) ? 15 : 0;
    if (b === B.spark_torch) return d === 3 ? 0 : 15;
    if (bd.rep) return bd.rep.on && d === REP_D[bd.rep.f] ? 15 : 0;
    if (b === B.daylight) return this.sensorLevel(x, y, z);
    if (bd.obs !== undefined) return this.pulse.get(key(x, y, z)) > 0 && this.pulse.get(key(x, y, z)) <= 2 && d === (bd.obs ^ 1) ? 15 : 0;
    return 0;
  }
  /** Starkt strömsatt block: drivs av en källa (inte ledning) */
  strong(x, y, z) {
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIR6[d], nb = this.w.get(x + dx, y + dy, z + dz);
      if (nb > 0 && !isWire(nb) && this.emit(nb, x + dx, y + dy, z + dz, d ^ 1) > 0) return true;
    }
    return false;
  }
  /** Strömsatt block (även av ledning) – driver intilliggande mekanismer */
  weak(x, y, z) {
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIR6[d], nb = this.w.get(x + dx, y + dy, z + dz);
      if (nb > 0 && this.emit(nb, x + dx, y + dy, z + dz, d ^ 1) > 0) return true;
    }
    return false;
  }
  /** Får mekanismen på (x,y,z) ström? skip = riktning som ignoreras (kolvens framsida) */
  powered(x, y, z, skip = -1) {
    for (let d = 0; d < 6; d++) {
      if (d === skip) continue;
      const [dx, dy, dz] = DIR6[d], nx = x + dx, ny = y + dy, nz = z + dz, nb = this.w.get(nx, ny, nz);
      if (nb <= 0) continue;
      if (this.emit(nb, nx, ny, nz, d ^ 1) > 0) return true;
      if (T_OPAQUE[nb] && !BLOCKS[nb].powerable && this.weak(nx, ny, nz)) return true;
    }
    return false;
  }

  /* ---------- ledningsnät ---------- */
  _wireNbrs(x, y, z, out) {
    out.length = 0; const W = this.w;
    const upFree = !T_OPAQUE[Math.max(0, W.get(x, y + 1, z))];
    for (const d of [0, 1, 4, 5]) {
      const [dx, , dz] = DIR6[d], nx = x + dx, nz = z + dz, n = W.get(nx, y, nz);
      if (n > 0 && isWire(n)) { out.push(nx, y, nz); continue; }
      if (n >= 0 && !T_OPAQUE[n] && isWire(W.get(nx, y - 1, nz))) out.push(nx, y - 1, nz);
      if (upFree && n > 0 && T_OPAQUE[n] && isWire(W.get(nx, y + 1, nz))) out.push(nx, y + 1, nz);
    }
    return out;
  }
  _updateWires(seeds, changedOut) {
    const seen = new Set(), nb = [];
    for (const s of seeds) {
      const sk = key(s[0], s[1], s[2]);
      if (seen.has(sk)) continue;
      // samla nätet
      const net = [], q = [s]; seen.add(sk);
      while (q.length && net.length < 4096) {
        const p = q.pop(); net.push(p);
        this._wireNbrs(p[0], p[1], p[2], nb);
        for (let i = 0; i < nb.length; i += 3) { const k = key(nb[i], nb[i + 1], nb[i + 2]); if (!seen.has(k)) { seen.add(k); q.push([nb[i], nb[i + 1], nb[i + 2]]); } }
      }
      // yttre matning
      const lev = new Map(), buckets = Array.from({ length: 16 }, () => []);
      for (const p of net) {
        const [x, y, z] = p; let src = 0;
        for (let d = 0; d < 6 && src < 15; d++) {
          const [dx, dy, dz] = DIR6[d], n = this.w.get(x + dx, y + dy, z + dz);
          if (n <= 0 || isWire(n)) continue;
          let e = this.emit(n, x + dx, y + dy, z + dz, d ^ 1);
          if (!e && T_OPAQUE[n] && this.strong(x + dx, y + dy, z + dz)) e = 15;
          if (e > src) src = e;
        }
        const k = key(x, y, z); lev.set(k, src); if (src > 0) buckets[src].push(p);
      }
      for (let L = 15; L > 1; L--) for (const p of buckets[L]) {
        if (lev.get(key(p[0], p[1], p[2])) !== L) continue;
        this._wireNbrs(p[0], p[1], p[2], nb);
        for (let i = 0; i < nb.length; i += 3) { const k = key(nb[i], nb[i + 1], nb[i + 2]); if ((lev.get(k) ?? 99) < L - 1) { lev.set(k, L - 1); buckets[L - 1].push([nb[i], nb[i + 1], nb[i + 2]]); } }
      }
      // skriv tillbaka
      this._quiet = true;
      for (const p of net) {
        const k = key(p[0], p[1], p[2]), v = lev.get(k) || 0, old = this.level.get(k) || 0;
        if (v === old) continue;
        if (v) this.level.set(k, v); else this.level.delete(k);
        changedOut.push(p);
        const vis = WIRE0 + (v === 0 ? 0 : v < 6 ? 1 : v < 11 ? 2 : 3);
        if (this.w.get(p[0], p[1], p[2]) !== vis) this.w.set(p[0], p[1], p[2], vis, { noUpdate: true });
      }
      this._quiet = false;
    }
  }

  /* ---------- steg ---------- */
  update(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n++ < 3) { this.acc -= TICK; this.tick(); }
    if (this.acc > TICK) this.acc = 0;
  }
  tick() {
    const t0 = performance.now();
    this.ticks++;
    const W = this.w, g = this.g;
    // knappar och plattor
    for (const [k, t] of this.pressed) {
      if (t > 1) { this.pressed.set(k, t - 1); continue; }
      const [x, y, z] = k.split(',').map(Number);
      const b = W.get(x, y, z);
      if (b > 0 && BLOCKS[b].plate && this._occupied(x, y, z, BLOCKS[b].plate)) { this.pressed.set(k, 3); continue; }
      this.pressed.delete(k); this.markAround(x, y, z); this.markAround(x, y - 1, z);
      if (b > 0) g.audio.play('click', { vol: 0.25, pitch: 0.7 });
    }
    const P = g.player.pos;
    for (const k of this.plates) {
      if (this.pressed.has(k)) continue;
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x - P.x) > 64 || Math.abs(z - P.z) > 64) continue;
      const b = W.get(x, y, z); if (b <= 0 || !BLOCKS[b].plate) { this.plates.delete(k); continue; }
      if (this._occupied(x, y, z, BLOCKS[b].plate)) { this.pressed.set(k, 3); this.markAround(x, y, z); this.markAround(x, y - 1, z); g.audio.play('click', { vol: 0.25, pitch: 0.9 }); }
    }
    for (const [k, t] of this.pulse) {
      if (t > 1) { this.pulse.set(k, t - 1); if (t === 3) { const [x, y, z] = k.split(',').map(Number); this.markAround(x, y, z); } continue; }
      this.pulse.delete(k); const [x, y, z] = k.split(',').map(Number); this.markAround(x, y, z);
    }
    if (this.ticks % 20 === 0) for (const k of this.sensors) { const [x, y, z] = k.split(',').map(Number); this.markAround(x, y, z); }
    // schemalagda ändringar
    for (const [k, s] of this.sched) if (s.at <= this.ticks) { this.sched.delete(k); s.fn(); }
    if (!this.dirty.size) { this.stats.ms = this.stats.ms * 0.9 + (performance.now() - t0) * 0.1; return; }
    const list = [...this.dirty.values()]; this.dirty.clear();
    const seeds = [], comps = [];
    for (const p of list) {
      const b = W.get(p[0], p[1], p[2]); if (b <= 0) continue;
      if (isWire(b)) seeds.push(p); else if (relevant(b)) comps.push(p);
    }
    const changed = [];
    if (seeds.length) this._updateWires(seeds, changed);
    // mekanismer bredvid ändrade ledningar
    const seen = new Set(comps.map(p => key(p[0], p[1], p[2])));
    for (const p of changed) for (const [dx, dy, dz] of DIR6) {
      const ax = p[0] + dx, ay = p[1] + dy, az = p[2] + dz;
      for (const [ex, ey, ez] of [[0, 0, 0], ...DIR6]) {
        const x = ax + ex, y = ay + ey, z = az + ez, k = key(x, y, z);
        if (seen.has(k)) continue; seen.add(k);
        const b = W.get(x, y, z); if (b > 0 && !isWire(b) && relevant(b)) comps.push([x, y, z]);
      }
    }
    for (const p of comps) this._evaluate(p[0], p[1], p[2]);
    this.stats.ms = this.stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  _occupied(x, y, z, kind) {
    const g = this.g, P = g.player, inCell = (px, py, pz, hw) => px + hw > x && px - hw < x + 1 && pz + hw > z && pz - hw < z + 1 && py >= y - 0.05 && py < y + 0.5;
    if (P.alive && inCell(P.pos.x, P.pos.y, P.pos.z, 0.3)) return true;
    for (const m of g.ents.mobs) if (!m.dead && inCell(m.pos.x, m.pos.y, m.pos.z, m.hw)) return true;
    if (kind === 2) for (const e of g.ents.drops) if (inCell(e.pos.x, e.pos.y, e.pos.z, 0.1)) return true;
    return false;
  }
  _schedule(x, y, z, delay, fn) { const k = key(x, y, z); if (!this.sched.has(k)) this.sched.set(k, { at: this.ticks + delay, fn }); }
  /** Kantstyrd mekanism: returnerar 1 vid påslag, -1 vid avslag, 0 annars. Första gången räknas bara påslag. */
  _edge(k, p) {
    const prev = this.state.get(k); this.state.set(k, p);
    if (prev === undefined) return p ? 1 : 0;
    return p === prev ? 0 : p ? 1 : -1;
  }
  _evaluate(x, y, z) {
    const W = this.w, g = this.g, b = W.get(x, y, z), d = BLOCKS[b]; if (!d) return;
    const k = key(x, y, z);
    if (b === B.lamp || b === B.lamp_on) {
      const p = this.powered(x, y, z);
      if (p !== (b === B.lamp_on)) { W.set(x, y, z, p ? B.lamp_on : B.lamp, { noUpdate: true }); if (p) g.tally('lamp', 1); }
      return;
    }
    if (isSparkTorch(b)) {
      const below = W.get(x, y - 1, z);
      const input = below > 0 && T_OPAQUE[below] && this.weak(x, y - 1, z);
      const want = input ? B.spark_torch_off : B.spark_torch;
      if (want !== b) this._schedule(x, y, z, 1, () => { if (isSparkTorch(W.get(x, y, z))) W.set(x, y, z, want, { noUpdate: true }); });
      return;
    }
    if (d.rep) {
      const f = REP_D[d.rep.f], [dx, dy, dz] = DIR6[f ^ 1], bx = x + dx, by = y + dy, bz = z + dz, nb = W.get(bx, by, bz);
      const input = nb > 0 && (this.emit(nb, bx, by, bz, f) > 0 || (T_OPAQUE[nb] && this.weak(bx, by, bz)));
      if (input !== !!d.rep.on) {
        const delay = (this.data.get(k) || {}).delay || 1;
        this._schedule(x, y, z, delay, () => { const c = W.get(x, y, z); if (isRep(c)) W.set(x, y, z, REP0 + (c - REP0 & 3) + (input ? 4 : 0), { noUpdate: true }); });
      }
      return;
    }
    if (d.door) {
      const ly = d.door.upper ? y - 1 : y, lk = key(x, ly, z);
      const p = this.powered(x, ly, z) || this.powered(x, ly + 1, z);
      const e = this._edge(lk, p); if (!e) return;
      const lower = W.get(x, ly, z); if (!isDoor(lower)) return;
      const dd = BLOCKS[lower].door, open = e > 0;
      if (!!dd.open === open) return;
      W.set(x, ly, z, DOOR0 + (open ? 4 : 0) + dd.f, { noUpdate: true });
      if (isDoor(W.get(x, ly + 1, z))) W.set(x, ly + 1, z, DOOR0 + 8 + (open ? 4 : 0) + dd.f, { noUpdate: true });
      g.audio.play('click', { vol: 0.3, pitch: 0.6 }); if (open) g.tally('autodoor', 1);
      return;
    }
    if (d.trap || d.gate) {
      const e = this._edge(k, this.powered(x, y, z)); if (!e) return;
      const open = e > 0;
      if (d.trap) { if (!!d.trap.open !== open) W.set(x, y, z, TRAP0 + d.trap.f + (open ? 4 : 0), { noUpdate: true }); }
      else if (!!d.gate.open !== open) W.set(x, y, z, GATE0 + d.gate.ax + (open ? 2 : 0), { noUpdate: true });
      g.audio.play('click', { vol: 0.3, pitch: 0.7 });
      return;
    }
    if (b === B.tnt) { if (this.powered(x, y, z)) { g._ignite(x, y, z, 3); g.tally('tnt', 1); } return; }
    if (d.piston) {
      const f = d.piston.f, [dx, dy, dz] = DIR6[f], h = W.get(x + dx, y + dy, z + dz);
      const ext = h === PHEAD0 + f;
      const p = this.powered(x, y, z, f);
      if (p && !ext) this._extend(x, y, z, f);
      else if (!p && ext) this._retract(x, y, z, f, d.piston.sticky);
      return;
    }
    if (isPHead(b)) {
      // föräldralöst kolvhuvud tas bort
      const f = d.phead, [dx, dy, dz] = DIR6[f], base = W.get(x - dx, y - dy, z - dz);
      if (!(BLOCKS[base] && BLOCKS[base].piston && BLOCKS[base].piston.f === f)) W.set(x, y, z, 0);
      return;
    }
    if (d.disp !== undefined) { if (this._edge(k, this.powered(x, y, z)) > 0) this._dispense(x, y, z, d.disp); return; }
    if (b === B.note_block) { if (this._edge(k, this.powered(x, y, z)) > 0) this.playNote(x, y, z); return; }
    if (d.spout) { if (this._edge(k, this.powered(x, y, z)) > 0 && g.fireSpout) g.fireSpout(x, y, z); return; }
  }

  /* ---------- kolvar ---------- */
  _movable(b) {
    if (b <= 0) return false;
    const d = BLOCKS[b]; if (!d || d.hardness < 0 || b === B.obsidian || isPHead(b) || d.door || d.bed) return false;
    if (d.interact === 'chest' || d.interact === 'furnace' || d.interact === 'dispenser' || b === B.chest || b === B.furnace_lit) return false;
    return true;
  }
  _fragile(b) { const d = BLOCKS[b]; return b === 0 || isWater(b) || isLava(b) || !!(d && (d.replace || d.support || d.attach !== undefined || d.model === M_CROSS || d.wall !== undefined || b === B.torch || (b >= 36 && b <= 39))); }
  _extend(x, y, z, f) {
    const W = this.w, g = this.g, [dx, dy, dz] = DIR6[f];
    const line = [];
    let px = x + dx, py = y + dy, pz = z + dz;
    for (; ;) {
      const b = W.get(px, py, pz);
      if (b < 0 || py <= 0 || py >= 127) return;
      if (this._fragile(b)) break;
      if (!this._movable(b) || line.length >= 12) { return; }
      line.push([px, py, pz, b]);
      px += dx; py += dy; pz += dz;
    }
    // slutcellen: ömtåliga saker går sönder
    const end = W.get(px, py, pz);
    if (end > 0 && !isWater(end) && !isLava(end)) { W.set(px, py, pz, 0); if (!g.creative) g._dropsFor(end, px, py, pz); }
    for (let i = line.length - 1; i >= 0; i--) { const [ax, ay, az, b] = line[i]; W.set(ax + dx, ay + dy, az + dz, b); }
    W.set(x + dx, y + dy, z + dz, PHEAD0 + f, { noUpdate: true });
    // knuffa spelaren (och varelser) med
    const cells = line.map(c => [c[0] + dx, c[1] + dy, c[2] + dz]); cells.push([x + dx, y + dy, z + dz]);
    const hit = (p, hw, h) => cells.some(([cx, cy, cz]) => p.x + hw > cx && p.x - hw < cx + 1 && p.y + h > cy && p.y < cy + 1 && p.z + hw > cz && p.z - hw < cz + 1);
    if (hit(g.player.pos, 0.3, g.player.height)) { g.player.pos.x += dx * 1.01; g.player.pos.y += dy * 1.01; g.player.pos.z += dz * 1.01; if (dy > 0) g.player.vel.y = Math.max(g.player.vel.y, 2); }
    for (const m of g.ents.mobs) if (!m.dead && hit(m.pos, m.hw, m.h)) { m.pos.x += dx; m.pos.y += dy; m.pos.z += dz; }
    this._pistonSound(x, y, z, 1);
    g.tally('piston', 1);
  }
  _retract(x, y, z, f, sticky) {
    const W = this.w, [dx, dy, dz] = DIR6[f];
    W.set(x + dx, y + dy, z + dz, 0, { noUpdate: true });
    if (sticky) {
      const qx = x + 2 * dx, qy = y + 2 * dy, qz = z + 2 * dz, b = W.get(qx, qy, qz);
      if (b > 0 && this._movable(b) && !this._fragile(b)) { W.set(qx, qy, qz, 0); W.set(x + dx, y + dy, z + dz, b); }
    }
    this.markAround(x + dx, y + dy, z + dz);
    this._pistonSound(x, y, z, 0.8);
  }
  _pistonSound(x, y, z, pitch) {
    const a = this.g.audio, d = this.g.player.pos.distanceTo(new THREE.Vector3(x, y, z)), v = Math.max(0, 1 - d / 24);
    if (v <= 0) return;
    try { a.noise({ dur: 0.18, vol: 0.18 * v, freq: 500 * pitch, type: 'lowpass' }); a.tone({ freq: 140 * pitch, to: 90 * pitch, dur: 0.14, vol: 0.08 * v, type: 'square' }); } catch (e) { }
  }

  /* ---------- utmatare och notblock ---------- */
  _dispense(x, y, z, f) {
    const g = this.g, W = this.w, k = key(x, y, z);
    const inv = W.chests.get(k);
    const [dx, dy, dz] = DIR6[f];
    const full = inv ? inv.map((s, i) => s ? i : -1).filter(i => i >= 0) : [];
    if (!full.length) { g.audio.play('click', { vol: 0.3, pitch: 1.4 }); return; }
    const i = full[Math.random() * full.length | 0], s = inv[i];
    const id = s.id; s.n--; if (s.n <= 0) inv[i] = null;
    const from = new THREE.Vector3(x + 0.5 + dx * 0.7, y + 0.5 + dy * 0.7, z + 0.5 + dz * 0.7);
    if (id === I.arrow) g.ents.shootArrow(from, new THREE.Vector3(dx, dy + 0.1, dz).normalize().multiplyScalar(22), 'player', 4);
    else g.ents.drop(id, 1, from.x, from.y - 0.2, from.z, s.d || 0, new THREE.Vector3(dx * 5 + (Math.random() - 0.5), dy * 5 + 1.5, dz * 5 + (Math.random() - 0.5))).age = -0.5;
    g.ents.puff(from.x, from.y, from.z, '#9a9a9a', 5, 0.2);
    g.audio.play('click', { vol: 0.35, pitch: 0.9 });
    if (g.ui.mode === 'chest') g.ui.refresh();
  }
  noteOf(x, y, z) { return (this.data.get(key(x, y, z)) || {}).note || 0; }
  cycleNote(x, y, z) {
    const k = key(x, y, z), o = Object.assign({}, this.data.get(k)); o.note = ((o.note || 0) + 1) % 25; this.data.set(k, o);
    this.playNote(x, y, z); return o.note;
  }
  noteName(n) { return NOTE_NAMES[(n + 6) % 12] + (n + 6 >= 24 ? '³' : n + 6 >= 12 ? '²' : '¹'); }
  playNote(x, y, z) {
    const n = this.noteOf(x, y, z), g = this.g, d = g.player.pos.distanceTo(new THREE.Vector3(x, y, z)), v = Math.max(0, 1 - d / 40);
    if (v > 0) try { g.audio.tone({ freq: 185 * Math.pow(2, n / 12), dur: 0.5, vol: 0.22 * v, type: 'triangle' }); } catch (e) { }
    const c = new THREE.Color().setHSL(n / 25, 0.9, 0.6);
    g.ents.particle(x + 0.5, y + 1.15, z + 0.5, 0, 1.2, 0, c, 0.12, 0.8, -0.3, true);
  }
  cycleDelay(x, y, z) { const k = key(x, y, z), o = Object.assign({}, this.data.get(k)); o.delay = ((o.delay || 1) % 4) + 1; this.data.set(k, o); return o.delay; }
  forget(x, y, z) { const k = key(x, y, z); this.data.delete(k); this.state.delete(k); this.pressed.delete(k); this.sched.delete(k); this.pulse.delete(k); }
}
