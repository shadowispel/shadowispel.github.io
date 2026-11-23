/** Världen: chunkar, arbetare, terrängmaterial, blockändringar, vatten, strålkastning. */
import * as THREE from 'three';
import {
  CX, CY, CZ, SEA, CHUNK_VOL, BLOCKS, B, T_SOLID, T_OPAQUE, M_CUBE, M_BOX, M_CROSS, M_LIQUID, WATER, isWater, waterLevel, LAVA, isLava,
  T_CONN, fenceLinks, fenceBoxes, fenceColl, fenceSel
} from './blocks.js';
import { createGen } from './worldgen.js';

export const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

/* ---------- terrängshader ---------- */
const VS = /* glsl */`
in vec2 aUV; in vec4 aData; in vec4 aLight;
uniform float uTime;
out vec3 vUV; out vec4 vL; out vec3 vTint; out float vFog; out vec3 vWP; out vec2 vLiq;
#ifdef ENTITY
uniform vec2 uEntLight;
#endif
const vec3 TINT[10] = vec3[10](vec3(1.0), vec3(1.04,1.06,0.86), vec3(0.82,0.94,0.86), vec3(1.0,1.08,0.88), vec3(0.86,0.92,0.86), vec3(1.1,1.0,0.75), vec3(1.08,1.0,0.78), vec3(1.0,1.05,0.88), vec3(0.95,1.0,0.9), vec3(1.0,1.02,0.84));
void main() {
  vec3 p = position / 16.0;
  int fi = int(aData.y + 0.5);
  int face = fi & 7;
  vec4 wp = modelMatrix * vec4(p, 1.0);
#ifndef ENTITY
  if ((fi & 8) != 0 && aData.w > 0.5) { wp.x += sin(uTime * 1.7 + wp.x * 0.7 + wp.z * 0.5) * 0.07; wp.z += cos(uTime * 1.3 + wp.z * 0.6 + wp.x * 0.3) * 0.06; }
  if ((fi & 16) != 0) { wp.x += sin(uTime * 1.1 + wp.y * 0.8 + wp.z * 0.4) * 0.022; wp.z += cos(uTime * 0.9 + wp.x * 0.5) * 0.018; }
  if ((fi & 32) != 0 && face == 2) { wp.y += sin(uTime * 1.6 + wp.x * 0.6 + wp.z * 0.8) * 0.035 + sin(uTime * 2.3 - wp.x * 0.9 + wp.z * 0.4) * 0.02 - 0.06; }
#endif
  vWP = wp.xyz;
  vLiq = (fi & 32) != 0 ? vec2(face == 2 ? 2.0 : 1.0, aData.w) : vec2(0.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vFog = length(mv.xyz);
  float layer = aData.x;
  if ((fi & 32) != 0) layer += mod(floor(uTime * 2.5 + (wp.x + wp.z) * 0.05), 4.0);
  vUV = vec3(aUV / 16.0, layer);
  float sh = face == 2 ? 1.0 : face == 3 ? 0.55 : face < 2 ? 0.8 : face < 6 ? 0.66 : 0.88;
#ifdef ENTITY
  vL = vec4(uEntLight.x, uEntLight.y, 1.0, sh);
#else
  vL = vec4(aLight.x / 255.0, aLight.y / 255.0, aLight.z / 255.0, sh);
#endif
  vTint = TINT[int(aData.z + 0.5)];
}`;
const FS = /* glsl */`
precision highp sampler2DArray;
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
uniform sampler2DArray uTex;
uniform vec3 uSkyLight; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uMinLight; uniform float uTime; uniform float uFlicker;
uniform float uUnderwater;
in vec3 vUV; in vec4 vL; in vec3 vTint; in float vFog; in vec3 vWP; in vec2 vLiq;
void main() {
  vec4 c = texture(uTex, vUV);
  if (vLiq.x > 0.5) {
    // vatten: mjuka, animerade vågor i pixelsteg (ingen upprepad ruta per block), mörkare på djupet
    vec2 q = floor(vWP.xz * 8.0) / 8.0;
    float n = sin(q.x * 0.85 + uTime * 0.9) + sin(q.y * 1.15 - uTime * 0.7) + sin((q.x - q.y) * 0.42 + uTime * 0.5) + 0.5 * sin((q.x + q.y) * 2.1 + uTime * 1.6);
    n = n / 3.5 * 0.5 + 0.5;
    float d = vLiq.x > 1.5 ? clamp(vLiq.y / 9.0, 0.0, 1.0) : 0.45;
    vec3 wc = mix(vec3(0.17, 0.47, 0.62), vec3(0.03, 0.14, 0.30), d) * (0.86 + n * 0.28);
    if (vLiq.x > 1.5) {
      // glitter: slumpade pixlar som blinkar till (hash, inget rutmönster)
      float h = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
      float tw = fract(h * 13.7 + uTime * (0.12 + h * 0.2));
      wc += vec3(0.5, 0.6, 0.65) * step(0.965, h) * smoothstep(0.75, 1.0, tw) * (uUnderwater > 0.5 ? 0.5 : 0.4);
      // mjuka ljusa band där vågorna toppar
      wc += vec3(0.06, 0.08, 0.09) * smoothstep(0.78, 0.95, n);
    }
    c = vec4(wc, uUnderwater > 0.5 ? 0.5 : mix(0.6, 0.86, d));
  }
#ifdef CUTOUT
  if (c.a < 0.5) discard;
  c.a = 1.0;
#endif
  float s = vL.x <= 0.0 ? 0.0 : pow(0.8, (1.0 - vL.x) * 15.0);
  float b = vL.y <= 0.0 ? 0.0 : pow(0.8, (1.0 - vL.y) * 15.0) * uFlicker;
  vec3 light = max(uSkyLight * s, vec3(1.0, 0.66, 0.36) * b * 1.1);
  light = max(light, vec3(uMinLight));
  float ao = mix(0.42, 1.0, vL.z);
  vec3 col = c.rgb * vTint * light * ao * vL.w;
  // nordisk färgsättning: svala blå skuggor, varmt ljus
  float lum = clamp(dot(light * ao * vL.w, vec3(0.3333)) * 1.15, 0.0, 1.0);
  col *= mix(vec3(0.84, 0.92, 1.1), vec3(1.05, 1.01, 0.94), lum);
  float f = smoothstep(uFogNear, uFogFar, vFog);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, c.a);
  #include <colorspace_fragment>
}`;

export function createTerrainMaterials(atlas) {
  const tex = new THREE.DataArrayTexture(atlas.data, 16, 16, atlas.count);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true; tex.anisotropy = 1;
  tex.needsUpdate = true;
  const uniforms = {
    uTex: { value: tex }, uTime: { value: 0 }, uSkyLight: { value: new THREE.Color(1, 1, 1) }, uFogColor: { value: new THREE.Color(0.6, 0.75, 0.9) },
    uFogNear: { value: 60 }, uFogFar: { value: 100 }, uMinLight: { value: 0.03 }, uFlicker: { value: 1 }, uUnderwater: { value: 0 }
  };
  const base = { uniforms, vertexShader: VS, fragmentShader: FS, glslVersion: THREE.GLSL3 };
  const opaque = new THREE.ShaderMaterial({ ...base, defines: { CUTOUT: 1 } });
  const trans = new THREE.ShaderMaterial({ ...base, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  trans.polygonOffset = true; trans.polygonOffsetFactor = 1; trans.polygonOffsetUnits = 1;
  // föremål/fallande block: ljus från uniform per objekt
  const entUniforms = { ...uniforms, uEntLight: { value: new THREE.Vector2(1, 0) } };
  const entity = new THREE.ShaderMaterial({ uniforms: entUniforms, vertexShader: VS, fragmentShader: FS, glslVersion: THREE.GLSL3, defines: { CUTOUT: 1, ENTITY: 1 } });
  return { tex, uniforms, opaque, trans, entity };
}

/* ---------- arbetarpool ---------- */
class Pool {
  constructor(n) {
    this.w = [];
    this.cb = new Map(); this.nextId = 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      const rec = { w, busy: 0 };
      w.onmessage = e => { rec.busy--; const f = this.cb.get(e.data.id); this.cb.delete(e.data.id); if (e.data.type === 'error') console.warn('Kubvärld-arbetare:', e.data.msg); if (f) f(e.data); };
      w.onerror = e => { console.warn('arbetarfel', e.message); };
      this.w.push(rec);
    }
  }
  free() { let best = null; for (const r of this.w) if (r.busy < 2 && (!best || r.busy < best.busy)) best = r; return best; }
  post(msg, transfer, cb) {
    const r = this.free(); if (!r) return false;
    msg.id = this.nextId++; this.cb.set(msg.id, cb); r.busy++;
    r.w.postMessage(msg, transfer || []);
    return true;
  }
  get idle() { return this.w.every(r => r.busy === 0); }
}

/* ---------- världen ---------- */
export class World {
  constructor({ scene, mats, seed, fancy = true, genVer = 2 }) {
    this.scene = scene; this.mats = mats; this.seed = seed >>> 0; this.fancy = fancy; this.genVer = genVer;
    this.onChunkReady = null;
    this.chunks = new Map();
    this.mods = new Map();           // ckey → Map(idx → id)
    this.dirtyMods = new Set();
    this.furnaces = new Map(); this.chests = new Map(); this.saplings = new Map();
    this.gen = createGen(this.seed, this.genVer);  // för spawnsökning (huvudtråd)
    this.token = (Math.random() * 1e9) | 0;
    this.radius = 6;
    this.group = new THREE.Group(); scene.add(this.group);
    this.stats = { genMs: 0, meshMs: 0, gens: 0, meshes: 0 };
    this.waterQ = []; this.waterSet = new Set(); this._waterT = 0;
    this.lavaQ = []; this.lavaSet = new Set(); this._lavaT = 0;
    this.onBlockChange = null; this.onFall = null;
    this.edits = 0;
    if (!World.pool) World.pool = new Pool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)));
    this.pool = World.pool;
    if (!World.index || World.index.count < 65536 * 6) World.index = makeIndex(65536);
    this._last = null;
  }

  dispose() {
    this.token = -1;
    for (const c of this.chunks.values()) this._disposeMeshes(c);
    this.chunks.clear();
    this.scene.remove(this.group);
  }

  /* ----- block ----- */
  getChunk(cx, cz) {
    const l = this._last;
    if (l && l.cx === cx && l.cz === cz) return l;
    const c = this.chunks.get(ckey(cx, cz));
    if (c) this._last = c;
    return c;
  }
  get(x, y, z) {
    if (y < 0) return B.bedrock; if (y >= CY) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c || !c.data) return -1;
    return c.data[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  /** ljus (sky<<4|blk) – 0xF0 om okänt */
  light(x, y, z) {
    if (y >= CY) return 0xF0; if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || !c.light) return 0xF0;
    return c.light[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  isLoaded(x, z) { const c = this.getChunk(x >> 4, z >> 4); return !!(c && c.data); }
  isSolid(x, y, z) { const b = this.get(x, y, z); return b < 0 ? true : !!T_SOLID[b]; }

  set(x, y, z, id, opts = {}) {
    if (y < 0 || y >= CY) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c || !c.data) return false;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const old = c.data[i];
    if (old === id) return false;
    c.data[i] = id;
    if (y > c.maxY) c.maxY = y;
    c.ver++;
    // spara ändring
    const k = c.key;
    let m = this.mods.get(k); if (!m) { m = new Map(); this.mods.set(k, m); }
    m.set(i, id); this.dirtyMods.add(k);
    // ommeshning: chunken direkt + grannar (ljus kan sprida sig 15 block)
    c.dirty = true; c.urgent = true;
    const lx = x & 15, lz = z & 15;
    const lightChange = BLOCKS[old] && BLOCKS[id] && (BLOCKS[old].light || BLOCKS[id].light || T_OPAQUE[old] !== T_OPAQUE[id] || BLOCKS[old].att !== BLOCKS[id].att);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.chunks.get(ckey(cx + dx, cz + dz)); if (!n || !n.data) continue;
      const edge = (dx === -1 ? lx === 0 : dx === 1 ? lx === 15 : true) && (dz === -1 ? lz === 0 : dz === 1 ? lz === 15 : true);
      if (edge) { n.dirty = true; n.urgent = true; }
      else if (lightChange) { n.dirty = true; }
    }
    if (!opts.noUpdate) this._neighborUpdate(x, y, z, old, id);
    if (this.onBlockChange) this.onBlockChange(x, y, z, old, id);
    return true;
  }

  _neighborUpdate(x, y, z, old, id) {
    // vatten
    this.queueWater(x, y, z);
    this.queueWater(x + 1, y, z); this.queueWater(x - 1, y, z); this.queueWater(x, y + 1, z); this.queueWater(x, y - 1, z);
    this.queueWater(x, y, z + 1); this.queueWater(x, y, z - 1);
    // lava
    this.queueLava(x, y, z); this.queueLava(x + 1, y, z); this.queueLava(x - 1, y, z); this.queueLava(x, y + 1, z); this.queueLava(x, y - 1, z); this.queueLava(x, y, z + 1); this.queueLava(x, y, z - 1);
    // fallande sand/grus ovanför
    this._checkFall(x, y + 1, z);
    if (BLOCKS[id] && BLOCKS[id].gravity) this._checkFall(x, y, z);
    // växter och facklor utan stöd
    const above = this.get(x, y + 1, z);
    if (above > 0 && !T_SOLID[id]) {
      const ad = BLOCKS[above];
      if (ad && (ad.model === M_CROSS || above === B.torch || (ad.door && !ad.door.upper) )) { this.breakDrop(x, y + 1, z, above); }
    }
    // block som står på detta (ledning, tryckplatta, gnistfackla, förstärkare, golvknapp)
    if (above > 0 && !T_SOLID[id] && BLOCKS[above] && (BLOCKS[above].support || BLOCKS[above].attach === 4)) this.breakDrop(x, y + 1, z, above);
    // knappar på väggen: 0 sitter på +x-grannen osv.
    if (!T_SOLID[id]) for (const [dx, dz, a] of [[-1, 0, 0], [1, 0, 1], [0, -1, 2], [0, 1, 3]]) {
      const n = this.get(x + dx, y, z + dz); if (n > 0 && BLOCKS[n] && BLOCKS[n].attach === a) this.breakDrop(x + dx, y, z + dz, n);
    }
    // väggfacklor fästa i detta block
    if (!T_SOLID[id]) {
      const W = [[-1, 0, 0, 36], [1, 0, 0, 37], [0, 0, -1, 38], [0, 0, 1, 39]];
      for (const [dx, , dz, tid] of W) { if (this.get(x + dx, y, z + dz) === tid) this.breakDrop(x + dx, y, z + dz, tid); }
    }
    // dörrar: ta bort andra halvan
    const od = BLOCKS[old];
    if (od && od.door && !(BLOCKS[id] && BLOCKS[id].door)) {
      const oy = od.door.upper ? y - 1 : y + 1;
      const o = this.get(x, oy, z); if (BLOCKS[o] && BLOCKS[o].door) this.set(x, oy, z, 0, { noUpdate: true });
    }
    if (od && od.bed && !(BLOCKS[id] && BLOCKS[id].bed)) {
      const f = od.bed.f, s = od.bed.head ? -1 : 1;
      const [dx, dz] = DIR4[f];
      const o = this.get(x + dx * s, y, z + dz * s); if (BLOCKS[o] && BLOCKS[o].bed) this.set(x + dx * s, y, z + dz * s, 0, { noUpdate: true });
    }
  }
  breakDrop(x, y, z, id) {
    this.set(x, y, z, 0);
    if (this.onDrop) this.onDrop(x, y, z, id);
  }
  _checkFall(x, y, z) {
    const b = this.get(x, y, z);
    if (b <= 0 || !BLOCKS[b] || !BLOCKS[b].gravity) return;
    const below = this.get(x, y - 1, z);
    if (below === 0 || isWater(below) || (below > 0 && BLOCKS[below] && BLOCKS[below].replace)) {
      this.set(x, y, z, 0);
      if (this.onFall) this.onFall(x, y, z, b);
    }
  }

  /* ----- vatten ----- */
  queueWater(x, y, z) {
    if (y < 1 || y >= CY) return;
    const k = x + ',' + y + ',' + z;
    if (this.waterSet.has(k)) return;
    const b = this.get(x, y, z);
    if (!isWater(b) && b !== 0) return;
    this.waterSet.add(k); this.waterQ.push(x, y, z);
  }
  tickWater(dt) {
    this._waterT += dt;
    if (this._waterT < 0.3) return;
    this._waterT = 0;
    const q = this.waterQ; this.waterQ = []; this.waterSet.clear();
    let n = 0;
    for (let i = 0; i < q.length && n < 400; i += 3, n++) this._waterUpdate(q[i], q[i + 1], q[i + 2]);
    if (q.length / 3 > 400) for (let i = 1200; i < q.length; i += 3) this.queueWater(q[i], q[i + 1], q[i + 2]);
  }
  _waterUpdate(x, y, z) {
    const b = this.get(x, y, z);
    const repl = id => id === 0 || (id > 0 && BLOCKS[id] && BLOCKS[id].replace && !isWater(id));
    if (b === 0) {
      // kan vatten flöda hit?
      const above = this.get(x, y + 1, z);
      let lvl = 99;
      if (isWater(above)) lvl = 1;
      for (const [dx, dz] of DIR4) {
        const n = this.get(x + dx, y, z + dz);
        if (isWater(n)) {
          const under = this.get(x + dx, y - 1, z + dz);
          if (under !== 0 && !isWater(under) && !(BLOCKS[under] && BLOCKS[under].replace)) lvl = Math.min(lvl, waterLevel(n) + 2);
          else if (waterLevel(n) === 0) lvl = Math.min(lvl, 2);
        }
      }
      if (lvl <= 7) this.set(x, y, z, WATER + lvl);
      return;
    }
    if (!isWater(b)) return;
    const L = waterLevel(b);
    if (L > 0) {
      const above = this.get(x, y + 1, z);
      let want = 99;
      if (isWater(above)) want = 1;
      for (const [dx, dz] of DIR4) {
        const n = this.get(x + dx, y, z + dz);
        if (isWater(n)) {
          const nl = waterLevel(n);
          const under = this.get(x + dx, y - 1, z + dz);
          const supported = under !== 0 && !isWater(under) && !(under > 0 && BLOCKS[under] && BLOCKS[under].replace);
          if (supported || nl === 0) want = Math.min(want, nl + 2);
        }
      }
      if (want > 7) { this.set(x, y, z, 0); return; }
      if (want !== L) { this.set(x, y, z, WATER + want); return; }
    }
    // sprid
    const below = this.get(x, y - 1, z);
    if (repl(below) && below >= 0) { this.set(x, y - 1, z, WATER + 1); return; }
    if (isWater(below)) return;
    const nl = L + 2;
    if (nl > 7) return;
    for (const [dx, dz] of DIR4) {
      const n = this.get(x + dx, y, z + dz);
      if (n < 0) continue;
      if (repl(n)) { if (n !== 0 && this.onDrop) this.onDrop(x + dx, y, z + dz, n); this.set(x + dx, y, z + dz, WATER + nl); }
      else if (isWater(n) && waterLevel(n) > nl) this.set(x + dx, y, z + dz, WATER + nl);
    }
  }

  /* ----- lava: flyter långsamt och kort (3 steg), stelnar mot vatten ----- */
  queueLava(x, y, z) {
    if (y < 1 || y >= CY) return;
    const b = this.get(x, y, z);
    if (!isLava(b)) return;
    const k = x + ',' + y + ',' + z;
    if (this.lavaSet.has(k)) return;
    this.lavaSet.add(k); this.lavaQ.push(x, y, z);
  }
  tickLava(dt) {
    this._lavaT += dt;
    if (this._lavaT < 0.9) return;
    this._lavaT = 0;
    const q = this.lavaQ; this.lavaQ = []; this.lavaSet.clear();
    for (let i = 0; i < q.length && i < 600; i += 3) this._lavaUpdate(q[i], q[i + 1], q[i + 2]);
  }
  _lavaUpdate(x, y, z) {
    const b = this.get(x, y, z);
    if (!isLava(b)) return;
    const L = b - LAVA;
    // vatten intill: källa → obsidian, flytande → kullersten
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
      if (isWater(this.get(x + dx, y + dy, z + dz))) { this.set(x, y, z, L === 0 ? B.obsidian : B.cobble); if (this.onHiss) this.onHiss(x, y, z); return; }
    }
    const repl = id => id === 0 || (id > 0 && BLOCKS[id] && BLOCKS[id].replace && !isWater(id) && !isLava(id));
    if (L > 0) {
      // stöd: lava ovanför eller en granne med lägre nivå
      let ok = isLava(this.get(x, y + 1, z));
      for (const [dx, dz] of DIR4) { const n = this.get(x + dx, y, z + dz); if (isLava(n) && n - LAVA < L) ok = true; }
      if (!ok) { this.set(x, y, z, 0); return; }
    }
    const below = this.get(x, y - 1, z);
    if (repl(below)) { this.set(x, y - 1, z, LAVA + 1); return; }
    if (isLava(below) || L >= 3) return;
    for (const [dx, dz] of DIR4) {
      const n = this.get(x + dx, y, z + dz);
      if (n < 0) continue;
      if (repl(n)) this.set(x + dx, y, z + dz, LAVA + L + 1);
      else if (isLava(n) && n - LAVA > L + 1) this.set(x + dx, y, z + dz, LAVA + L + 1);
    }
  }

  /* ----- strålkastning ----- */
  raycast(ox, oy, oz, dx, dy, dz, maxD, out) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tx = dx === 0 ? 1e9 : ((sx > 0 ? x + 1 - ox : ox - x) * tdx);
    let ty = dy === 0 ? 1e9 : ((sy > 0 ? y + 1 - oy : oy - y) * tdy);
    let tz = dz === 0 ? 1e9 : ((sz > 0 ? z + 1 - oz : oz - z) * tdz);
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 200 && t <= maxD; i++) {
      const b = this.get(x, y, z);
      if (b > 0 && !isWater(b)) {
        const d = BLOCKS[b];
        if (d.model === M_CUBE) { Object.assign(out, { x, y, z, nx, ny, nz, id: b, dist: t }); return out; }
        const boxes = T_CONN[b] === 1 ? fenceSel(this.connMask(x, y, z)) : d.selBox ? [d.selBox] : d.boxes;
        if (boxes) {
          let best = null;
          for (const bx of boxes) {
            const r = rayBox(ox, oy, oz, dx, dy, dz, x + bx[0] / 16, y + bx[1] / 16, z + bx[2] / 16, x + bx[3] / 16, y + bx[4] / 16, z + bx[5] / 16);
            if (r && r.t <= maxD && (!best || r.t < best.t)) best = r;
          }
          if (best) { Object.assign(out, { x, y, z, nx: best.nx, ny: best.ny, nz: best.nz, id: b, dist: best.t }); return out; }
        }
      }
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  /** Staketets kopplingsmask (bit 0 +x, 1 −x, 2 +z, 3 −z) */
  connMask(x, y, z) {
    let m = 0; const g = (a, b) => { const v = this.get(a, y, b); return v < 0 ? 0 : v; };
    if (fenceLinks(g(x + 1, z), 0)) m |= 1; if (fenceLinks(g(x - 1, z), 1)) m |= 2;
    if (fenceLinks(g(x, z + 1), 2)) m |= 4; if (fenceLinks(g(x, z - 1), 3)) m |= 8;
    return m;
  }
  /** Lådor (1/16) för markering/ritning av blocket på en plats */
  shapeAt(x, y, z, id) {
    const d = BLOCKS[id]; if (!d) return null;
    if (T_CONN[id] === 1) return fenceSel(this.connMask(x, y, z));
    return d.selBox ? [d.selBox] : d.boxes;
  }
  /** Kollisionslådor på en plats (staket och stängda grindar är 1,5 block höga) */
  collBoxes(x, y, z, id) {
    if (id > 0 && T_CONN[id]) {
      if (T_CONN[id] === 1) return fenceColl(this.connMask(x, y, z));
      if (T_SOLID[id]) return T_CONN[id] === 2 ? GATE_COLL[0] : GATE_COLL[1];
    }
    return World.boxesOf(id);
  }
  /** kollisionslådor för ett block (i blockkoordinater 0..1) */
  static boxesOf(id) {
    if (id <= 0) return null;
    if (!T_SOLID[id]) return null;
    const d = BLOCKS[id];
    if (d.model === M_CUBE) return CUBE_BOX;
    if (d.model === M_BOX && d.boxes) return d._cb || (d._cb = d.boxes.map(b => b.map(v => v / 16)));
    return null;
  }

  /* ----- strömning av chunkar ----- */
  update(px, pz, dt) {
    const pcx = Math.floor(px / CX), pcz = Math.floor(pz / CZ);
    const R = this.radius, RG = R + 1;
    const pool = this.pool;
    // avlasta
    if (!this._unloadT || (this._unloadT -= dt) <= 0) {
      this._unloadT = 1;
      for (const c of this.chunks.values()) {
        if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > RG + 2 && !c.busy) { this._disposeMeshes(c); this.chunks.delete(c.key); if (this._last === c) this._last = null; }
      }
    }
    // brådskande ommeshning
    for (const c of this.chunks.values()) {
      if (c.urgent && c.dirty && !c.busy && c.data && this._neighborsReady(c)) { if (!this._mesh(c)) break; }
    }
    // jobb sorterade efter avstånd (spiral)
    if (!this._order || this._orderR !== RG) { this._order = spiral(RG); this._orderR = RG; }
    let budget = 6;
    for (const [dx, dz] of this._order) {
      if (!pool.free() || budget <= 0) break;
      const cx = pcx + dx, cz = pcz + dz;
      const inMesh = Math.max(Math.abs(dx), Math.abs(dz)) <= R;
      const k = ckey(cx, cz);
      let c = this.chunks.get(k);
      if (!c) { c = this._newChunk(cx, cz); this._gen(c); budget--; continue; }
      if (inMesh && c.data && c.dirty && !c.busy && this._neighborsReady(c)) { this._mesh(c); budget--; }
    }
    this.tickWater(dt);
    this.tickLava(dt);
  }
  _newChunk(cx, cz) {
    const c = { cx, cz, key: ckey(cx, cz), data: null, biomes: null, light: null, maxY: 0, ver: 0, dirty: true, urgent: false, busy: false, mesh: null, tmesh: null, meshed: false };
    this.chunks.set(c.key, c);
    return c;
  }
  _neighborsReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz)); if (!n || !n.data) return false;
    }
    return true;
  }
  _gen(c) {
    c.busy = true;
    const tok = this.token;
    const ok = this.pool.post({ type: 'gen', seed: this.seed, ver: this.genVer, cx: c.cx, cz: c.cz, token: tok }, null, r => {
      c.busy = false;
      if (this.token !== tok || r.type !== 'gen') { if (this.chunks.get(c.key) === c && this.token === tok) this.chunks.delete(c.key); return; }
      c.data = r.data; c.biomes = r.biomes; c.maxY = r.maxY; c.ver = 1;
      const m = this.mods.get(c.key);
      if (m) for (const [i, id] of m) { c.data[i] = id; if ((i >> 8) > c.maxY) c.maxY = i >> 8; }
      this.stats.genMs += r.ms; this.stats.gens++;
      if (this.onChunkReady) this.onChunkReady(c, m);
    });
    if (!ok) { c.busy = false; this.chunks.delete(c.key); }
  }
  _mesh(c) {
    const chunks = [], maxYs = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz));
      chunks.push(n.data.slice()); maxYs.push(n.maxY);
    }
    const ver = c.ver, tok = this.token;
    c.busy = true; c.dirty = false; c.urgent = false;
    const ok = this.pool.post({ type: 'mesh', chunks, maxYs, biomes: c.biomes, fancy: this.fancy, cx: c.cx, cz: c.cz, ver, token: tok }, chunks.map(a => a.buffer), r => {
      c.busy = false;
      if (this.token !== tok || r.type !== 'mesh') return;
      if (this.chunks.get(c.key) !== c) return;
      this._applyMesh(c, r);
      if (c.ver !== ver) c.dirty = true;
      this.stats.meshMs += r.ms; this.stats.meshes++;
    });
    if (!ok) { c.busy = false; c.dirty = true; }
    return ok;
  }
  _applyMesh(c, r) {
    this._disposeMeshes(c);
    c.light = r.light;
    const mk = (part, mat) => {
      if (!part.quads) return null;
      if (part.quads > World.index.count / 6) World.index = makeIndex(Math.ceil(part.quads * 1.5));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
      g.setAttribute('aUV', new THREE.BufferAttribute(part.uv, 2));
      g.setAttribute('aData', new THREE.BufferAttribute(part.dat, 4));
      g.setAttribute('aLight', new THREE.BufferAttribute(part.lit, 4));
      g.setIndex(World.index);
      g.setDrawRange(0, part.quads * 6);
      const hy = (c.maxY + 2) / 2;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, hy, 8), Math.sqrt(128 + hy * hy));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(16, c.maxY + 2, 16));
      const m = new THREE.Mesh(g, mat);
      m.position.set(c.cx * CX, 0, c.cz * CZ);
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.group.add(m);
      return m;
    };
    c.mesh = mk(r.opaque, this.mats.opaque);
    c.tmesh = mk(r.trans, this.mats.trans);
    if (c.tmesh) c.tmesh.renderOrder = 2; // genomskinligt pass efter allt fast
    c.meshed = true;
  }
  _disposeMeshes(c) {
    for (const k of ['mesh', 'tmesh']) {
      const m = c[k]; if (!m) continue;
      this.group.remove(m);
      m.geometry.index = null; // delat indexbuffert får inte frigöras
      m.geometry.dispose();
      c[k] = null;
    }
  }
  /** Antal chunkar som är meshade inom radie r runt (px,pz) och hur många som behövs */
  readyAround(px, pz, r) {
    const pcx = Math.floor(px / CX), pcz = Math.floor(pz / CZ);
    let ok = 0, need = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { need++; const c = this.chunks.get(ckey(pcx + dx, pcz + dz)); if (c && c.meshed) ok++; }
    return { ok, need };
  }
  setFancy(f) { if (this.fancy === f) return; this.fancy = f; for (const c of this.chunks.values()) c.dirty = true; }
  remeshAll() { for (const c of this.chunks.values()) c.dirty = true; }

  /** Sök en bra startplats nära origo */
  findSpawn() {
    // 1: öppen äng/björkskog/tallhed (lätt att komma igång), 2: allt utom öken/fjäll/sjö
    const good = [[0, 2, 8, true], [0, 2, 8, false], [0, 1, 2, 5, 6, 8, false]];
    const G = this.gen, hAt = (x, z) => G.column(x, z).h;
    for (const ok of good) for (let r = 0; r < 480; r += 8) {
      const flatReq = ok[ok.length - 1];
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        const c = G.column(x, z);
        if (c.h > SEA + 1 && c.h < SEA + 26 && ok.includes(c.biome) && c.river < 0.1 && c.mtn < 0.5) {
          const h = c.h;
          if (flatReq && Math.max(Math.abs(hAt(x + 4, z) - h), Math.abs(hAt(x - 4, z) - h), Math.abs(hAt(x, z + 4) - h), Math.abs(hAt(x, z - 4) - h)) > 2) continue;
          return { x: x + 0.5, y: h + 1, z: z + 0.5 };
        }
        if (r === 0) break;
      }
    }
    return { x: 0.5, y: SEA + 20, z: 0.5 };
  }
  /** Högsta fasta blocket i en kolumn (kräver laddad chunk) */
  topY(x, z) {
    for (let y = CY - 1; y > 0; y--) { const b = this.get(x, y, z); if (b > 0 && T_SOLID[b]) return y; if (b < 0) return -1; }
    return 0;
  }

  /* ----- sparning ----- */
  modsFor(key) { const m = this.mods.get(key); if (!m) return null; const a = new Uint32Array(m.size); let i = 0; for (const [idx, id] of m) a[i++] = (idx << 8) | id; return a; }
  loadMods(key, arr) { const m = new Map(); for (let i = 0; i < arr.length; i++) m.set(arr[i] >>> 8, arr[i] & 255); this.mods.set(key, m); }
}

export const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CUBE_BOX = [[0, 0, 0, 1, 1, 1]];
const GATE_COLL = [[[0, 0, 0.375, 1, 1.5, 0.625]], [[0.375, 0, 0, 0.625, 1.5, 1]]];

function makeIndex(quads) {
  const a = new Uint32Array(quads * 6);
  for (let q = 0, o = 0; q < quads; q++, o += 6) { const v = q * 4; a[o] = v; a[o + 1] = v + 1; a[o + 2] = v + 2; a[o + 3] = v; a[o + 4] = v + 2; a[o + 5] = v + 3; }
  return new THREE.BufferAttribute(a, 1);
}
function spiral(R) {
  const out = [];
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) out.push([dx, dz]);
  out.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
  return out;
}
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -1e9, tmax = 1e9, nx = 0, ny = 0, nz = 0;
  const ax = [[ox, dx, x0, x1, 0], [oy, dy, y0, y1, 1], [oz, dz, z0, z1, 2]];
  for (const [o, d, a, b, k] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = k === 0 ? s : 0; ny = k === 1 ? s : 0; nz = k === 2 ? s : 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), nx, ny, nz };
}
