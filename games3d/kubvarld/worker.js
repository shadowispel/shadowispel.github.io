/** Arbetare: genererar och meshar chunkar (vanliga världen och Muspelheim). */
import { createGen } from './worldgen.js';
import { createMuspelGen } from './muspel.js';
import { meshChunk } from './mesher.js';

const gens = new Map();
function genFor(seed, ver, dim) {
  const k = seed + ':' + ver + ':' + (dim || 'over');
  let g = gens.get(k);
  if (!g) { g = dim === 'muspel' ? createMuspelGen(seed) : createGen(seed, ver); gens.set(k, g); if (gens.size > 4) gens.delete(gens.keys().next().value); }
  return g;
}
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'gen') {
      const gen = genFor(m.seed, m.ver, m.dim);
      const t0 = performance.now();
      const r = gen.generate(m.cx, m.cz, m.skip || null);
      self.postMessage({ type: 'gen', id: m.id, token: m.token, cx: m.cx, cz: m.cz, data: r.data, biomes: r.biomes, maxY: r.maxY, extra: r.extra || null, ms: performance.now() - t0 }, [r.data.buffer, r.biomes.buffer]);
    } else if (m.type === 'mesh') {
      const t0 = performance.now();
      const r = meshChunk(m.chunks, m.maxYs, m.biomes, m.fancy, m.cx, m.cz);
      const tr = [r.opaque.pos.buffer, r.opaque.uv.buffer, r.opaque.dat.buffer, r.opaque.lit.buffer, r.trans.pos.buffer, r.trans.uv.buffer, r.trans.dat.buffer, r.trans.lit.buffer, r.light.buffer];
      self.postMessage({ type: 'mesh', id: m.id, token: m.token, cx: m.cx, cz: m.cz, ver: m.ver, opaque: r.opaque, trans: r.trans, light: r.light, ms: performance.now() - t0 }, tr);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, msg: String(err && err.stack || err) });
  }
};
