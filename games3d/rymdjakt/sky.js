/**
 * Rymdjakt – rymdmiljöer: bakad nebulosa (kubkarta), stjärnfält, planeter med atmosfär och ringar, sol, ljus och dimma.
 */
import * as THREE from 'three';
import { makeRng } from '../../engine/kit.js';
import { makeNoise3, sunTexture, makeEnvMap } from './gfx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

export const ENVS = {
  hemma: {
    name: 'Polstjärnan, Vegagränsen', base: '#03040b', c1: '#2a3f9a', c2: '#7a2f8f', c3: '#2fa0c0', density: 0.9, scale: 2.2, seed: 3,
    bandN: V(0.3, 1, 0.2), bandC: '#6a70b0',
    sun: { dir: V(0.8, 0.35, -0.5), color: '#fff0dc', size: 1, intensity: 2.6 },
    planets: [{ dir: V(-0.55, -0.25, -0.8), dist: 7600, r: 2100, type: 'ice', seed: 4, atmo: '#7ac0ff', ring: true },
      { dir: V(-0.1, 0.25, -1), dist: 7800, r: 300, type: 'rock', seed: 9, atmo: null }],
    hemi: ['#5a6aa8', '#1a1020', 0.55], env: { top: '#4a5a9a', bottom: '#0c0a18', tint: '#6a3a8a' }, dust: '#a8b8d8'
  },
  kalla: {
    name: 'Kallgrund, yttre patrullbanan', base: '#05030a', c1: '#8a3a20', c2: '#3a1a5a', c3: '#d08a30', density: 0.75, scale: 2.6, seed: 11,
    bandN: V(1, 0.4, 0), bandC: '#806050',
    sun: { dir: V(-0.6, 0.3, 0.75), color: '#ffd8b0', size: 0.8, intensity: 2.3 },
    planets: [{ dir: V(0.7, -0.15, -0.7), dist: 7600, r: 2600, type: 'gas', seed: 12, atmo: '#ffb070', ring: false, palette: ['#d89a60', '#a8582e', '#f0d0a0', '#8a4a30', '#e0b080'] }],
    hemi: ['#806050', '#140a10', 0.5], env: { top: '#6a4a3a', bottom: '#0c0808', tint: '#8a4a2a' }, dust: '#d8b8a0'
  },
  grus: {
    name: 'Grusbältet', base: '#060504', c1: '#5a4a30', c2: '#2a3a5a', c3: '#a07a40', density: 0.6, scale: 1.8, seed: 21,
    bandN: V(0, 1, 0.1), bandC: '#706050',
    sun: { dir: V(0.3, 0.45, -0.85), color: '#fff6e0', size: 1.3, intensity: 2.9 },
    planets: [{ dir: V(-0.8, -0.1, 0.55), dist: 7400, r: 1500, type: 'rock', seed: 22, atmo: '#d0a070' }],
    hemi: ['#706a60', '#100c08', 0.5], env: { top: '#6a6050', bottom: '#0c0a08', tint: '#5a4a3a' }, dust: '#c0b090'
  },
  dimma: {
    name: 'Dimslöjan', base: '#071612', c1: '#1f6a5a', c2: '#2a4a7a', c3: '#5ad0a0', density: 1.6, scale: 1.6, seed: 31,
    bandN: V(0.2, 1, 0.5), bandC: '#3a8a7a',
    sun: { dir: V(0.2, 0.8, -0.4), color: '#d0fff0', size: 0.6, intensity: 1.7 },
    planets: [],
    hemi: ['#4a9a8a', '#08201a', 0.9], env: { top: '#3a7a6a', bottom: '#06140f', tint: '#2a8a6a' }, dust: '#a0f0d0',
    fog: { color: '#0e3a32', density: 0.00115 }
  },
  nyhamn: {
    name: 'Nyhamn, kolonivärlden', base: '#020409', c1: '#1a3a6a', c2: '#1a5a5a', c3: '#6aa0d0', density: 0.55, scale: 2.4, seed: 41,
    bandN: V(0.5, 1, -0.3), bandC: '#5a7090',
    sun: { dir: V(-0.3, 0.4, -0.85), color: '#fffaf0', size: 1.1, intensity: 2.8 },
    planets: [{ dir: V(0.2, -0.75, 0.6), dist: 7000, r: 3600, type: 'earth', seed: 42, atmo: '#6ab8ff' },
      { dir: V(-0.7, 0.2, 0.6), dist: 7800, r: 260, type: 'rock', seed: 43, atmo: null }],
    hemi: ['#5a7ab0', '#0a1020', 0.55], env: { top: '#4a6a9a', bottom: '#0a0c18', tint: '#3a6a8a' }, dust: '#b8d0f0'
  },
  rod: {
    name: 'Järnsvärmens gränsland', base: '#0a0203', c1: '#8a1a1a', c2: '#3a0a2a', c3: '#ff6a30', density: 1.0, scale: 2.0, seed: 51,
    bandN: V(0.7, 0.7, 0), bandC: '#803030',
    sun: { dir: V(0.6, 0.2, 0.75), color: '#ffb090', size: 1.4, intensity: 2.2 },
    planets: [{ dir: V(-0.6, 0.35, -0.7), dist: 7400, r: 1900, type: 'lava', seed: 52, atmo: '#ff6a30' }],
    hemi: ['#804040', '#140404', 0.5], env: { top: '#6a3030', bottom: '#0c0404', tint: '#8a2a1a' }, dust: '#f0b0a0'
  },
  flykt: {
    name: 'Polstjärnans evakueringskorridor', base: '#03050c', c1: '#2a5aaa', c2: '#5a2a8a', c3: '#a0d0ff', density: 0.8, scale: 2.0, seed: 61,
    bandN: V(-0.3, 1, 0.4), bandC: '#7080c0',
    sun: { dir: V(0.0, 0.3, -1), color: '#e0ecff', size: 1.6, intensity: 3.0 },
    planets: [{ dir: V(0.75, -0.3, 0.5), dist: 7600, r: 2100, type: 'ice', seed: 4, atmo: '#7ac0ff', ring: true }],
    hemi: ['#6a7ab8', '#10101c', 0.55], env: { top: '#5a6aaa', bottom: '#0c0c18', tint: '#5a4a9a' }, dust: '#c0d0ff'
  },
  djup: {
    name: 'Svärmens hjärta', base: '#06020a', c1: '#6a1a5a', c2: '#a02a1a', c3: '#ffa040', density: 1.25, scale: 1.7, seed: 71,
    bandN: V(0.1, 1, 0.3), bandC: '#a04060',
    sun: { dir: V(-0.5, 0.25, -0.83), color: '#ffc8a0', size: 2.0, intensity: 2.4 },
    planets: [{ dir: V(0.5, -0.4, -0.75), dist: 7600, r: 2500, type: 'gas', seed: 72, atmo: '#ff7a50', ring: true, palette: ['#8a2a3a', '#d06040', '#401020', '#f0a060', '#a03a30'] }],
    hemi: ['#804060', '#140410', 0.55], env: { top: '#6a3050', bottom: '#0c040a', tint: '#a03a3a' }, dust: '#f0c0b0'
  }
};

/* ---------------------------------------------------------------- Planettexturer */
const PLANET_CACHE = new Map();
function planetTexture(type, seed, palette, w) {
  const key = type + ':' + seed + ':' + w + ':' + (palette ? palette.join() : '');
  if (PLANET_CACHE.has(key)) return PLANET_CACHE.get(key);
  const h = w / 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), D = img.data;
  const n = makeNoise3(seed * 31 + 7);
  const rng = makeRng(seed);
  const pal = (palette || ['#c8d8f0', '#9ab8e0', '#f0f6ff', '#7a98c8']).map(x => new THREE.Color(x));
  const emis = type === 'lava' ? document.createElement('canvas') : null;
  let E = null, eg = null;
  if (emis) { emis.width = w; emis.height = h; eg = emis.getContext('2d'); E = eg.createImageData(w, h); }
  const tmp = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = x / w * Math.PI * 2;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      let r = 0, gg = 0, b = 0, e = 0;
      if (type === 'gas') {
        const turb = n.fbm(px * 3, py * 3, pz * 3, 4);
        const band = (py * 6 + turb * 1.6 + n(px * 1.5, py * 12, pz * 1.5) * 0.6);
        const t = (band * 0.5 % 1 + 1) % 1 * (pal.length - 1);
        const i0 = Math.floor(t), f = t - i0;
        tmp.copy(pal[i0]).lerp(pal[Math.min(pal.length - 1, i0 + 1)], f);
        const storm = n.fbm(px * 8, py * 8, pz * 8, 3);
        const k = 0.85 + storm * 0.3;
        r = tmp.r * k; gg = tmp.g * k; b = tmp.b * k;
      } else if (type === 'earth') {
        const land = n.fbm(px * 2.2, py * 2.2, pz * 2.2, 6);
        const cloud = n.fbm(px * 4 + 10, py * 6, pz * 4, 5);
        if (land > 0.53) { const m = n(px * 10, py * 10, pz * 10); r = 0.12 + m * 0.15; gg = 0.32 + m * 0.12; b = 0.1; if (land > 0.62) { r = 0.42; gg = 0.36; b = 0.26; } }
        else { const d = land / 0.53; r = 0.02; gg = 0.08 + d * 0.12; b = 0.25 + d * 0.25; }
        if (Math.abs(py) > 0.86) { r = gg = b = 0.92; }
        const cv = Math.max(0, (cloud - 0.5) * 3);
        r += (1 - r) * cv * 0.85; gg += (1 - gg) * cv * 0.85; b += (1 - b) * cv * 0.85;
      } else if (type === 'ice') {
        const f = n.fbm(px * 3, py * 3, pz * 3, 5);
        const crack = Math.abs(n.fbm(px * 5, py * 5, pz * 5, 3) - 0.5) < 0.012 ? 0.12 : 0;
        tmp.copy(pal[0]).lerp(pal[1], f).lerp(pal[3], crack * 2);
        const band = n(px * 2, py * 14, pz * 2) * 0.15;
        r = tmp.r + band; gg = tmp.g + band; b = tmp.b + band;
      } else if (type === 'lava') {
        const f = n.fbm(px * 3, py * 3, pz * 3, 5);
        const cr = Math.abs(n.fbm(px * 6 + 3, py * 6, pz * 6, 3) - 0.5);
        r = 0.12 + f * 0.1; gg = 0.09 + f * 0.06; b = 0.08 + f * 0.05;
        if (cr < 0.05) { e = 1 - cr / 0.05; }
      } else { // sten
        const f = n.fbm(px * 3, py * 3, pz * 3, 6);
        const cr = n(px * 14, py * 14, pz * 14);
        const v = 0.25 + f * 0.45 - (cr > 0.82 ? 0.12 : 0);
        r = v * 1.05; gg = v; b = v * 0.92;
      }
      const i = (y * w + x) * 4;
      D[i] = Math.min(255, r * 255); D[i + 1] = Math.min(255, gg * 255); D[i + 2] = Math.min(255, b * 255); D[i + 3] = 255;
      if (E) { E.data[i] = 255 * e; E.data[i + 1] = 110 * e; E.data[i + 2] = 30 * e; E.data[i + 3] = 255; }
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  let et = null;
  if (E) { eg.putImageData(E, 0, 0); et = new THREE.CanvasTexture(emis); et.colorSpace = THREE.SRGBColorSpace; }
  const res = { map: t, emissive: et };
  PLANET_CACHE.set(key, res);
  if (PLANET_CACHE.size > 8) { const k0 = PLANET_CACHE.keys().next().value; const o = PLANET_CACHE.get(k0); o.map.dispose(); if (o.emissive) o.emissive.dispose(); PLANET_CACHE.delete(k0); }
  void rng;
  return res;
}

/* ---------------------------------------------------------------- Shaders */
const NEB_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const NEB_FS = `
uniform vec3 uBase, uC1, uC2, uC3, uBandN, uBandC, uSeed; uniform float uDensity, uScale;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 7; i++){ s += a*noise(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  vec3 p = d * uScale + uSeed;
  float n1 = fbm(p);
  float n2 = fbm(p * 1.7 + vec3(n1 * 2.5));
  float band = exp(-pow(dot(d, uBandN) / 0.32, 2.0));
  float neb = smoothstep(0.38, 0.82, n2) * (0.3 + band * 0.9) * uDensity;
  vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.75, n1));
  col = mix(col, uC3, smoothstep(0.62, 0.9, n2) * 0.7);
  float dust = smoothstep(0.48, 0.72, fbm(p * 3.1 + 7.0));
  vec3 c = uBase + col * neb * (1.0 - dust * 0.75) * 0.55;
  c += uBandC * band * 0.12 * (0.4 + n1) * (1.0 - dust * 0.6);
  float sp = pow(noise(d * 380.0 + uSeed), 22.0) * band;
  c += vec3(sp * 1.5);
  gl_FragColor = vec4(c, 1.0);
}`;
const STAR_VS = `
attribute float aSize; attribute vec3 aColor; attribute float aPhase;
uniform float uPR, uTime; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + aPhase) + aPhase * 10.0);
  gl_PointSize = aSize * uPR; vC = aColor * tw; vA = 1.0; }`;
const STAR_FS = `
varying vec3 vC; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard; float a = pow(1.0 - d, 1.6);
  gl_FragColor = vec4(vC * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const ATMO_VS = `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FS = `
uniform vec3 uColor, uSun; uniform float uPow, uInt, uBack;
varying vec3 vN; varying vec3 vW;
void main(){ vec3 v = normalize(cameraPosition - vW); vec3 n = normalize(vN);
  float f;
  if (uBack > 0.5) f = pow(clamp(dot(-n, v) / 0.45, 0.0, 1.0), uPow);
  else f = pow(1.0 - max(0.0, dot(n, v)), uPow);
  float day = smoothstep(-0.35, 0.6, dot(n, uSun));
  float a = f * uInt * (0.12 + day);
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const RING_FS = `
uniform sampler2D uBands; uniform vec3 uSun, uPlanet; uniform float uIn, uOut, uPR; varying vec3 vW; varying vec3 vL;
void main(){ float r = length(vL.xy); float t = (r - uIn) / (uOut - uIn); if (t < 0.0 || t > 1.0) discard;
  vec4 b = texture2D(uBands, vec2(t, 0.5));
  vec3 toP = uPlanet - vW; float along = dot(toP, -uSun); vec3 perp = toP + uSun * along;
  float shadow = (along < 0.0 && length(perp) < uPR) ? 0.15 : 1.0;
  gl_FragColor = vec4(b.rgb * shadow * 0.9, b.a * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const RING_VS = 'varying vec3 vW; varying vec3 vL; void main(){ vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';

function ringBands(seed, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1;
  const g = c.getContext('2d'); const n = makeNoise3(seed + 99); const base = new THREE.Color(color);
  for (let x = 0; x < 256; x++) {
    const t = x / 256; const v = n(t * 40, 0.5, 0.5) * 0.7 + n(t * 120, 2, 1) * 0.3;
    const a = Math.max(0, v - 0.25) * 1.4 * Math.sin(Math.PI * t);
    const k = 0.6 + v * 0.6;
    g.fillStyle = `rgba(${Math.min(255, base.r * 255 * k + 60)},${Math.min(255, base.g * 255 * k + 50)},${Math.min(255, base.b * 255 * k + 40)},${Math.min(1, a)})`;
    g.fillRect(x, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------------------------------------------------------------- Miljö */
export class Environment {
  constructor(renderer, scene, presetId, settings) {
    const P = ENVS[presetId] || ENVS.hemma;
    this.preset = P; this.id = presetId;
    this.renderer = renderer; this.scene = scene;
    const q = settings.q;
    const hi = q.pixelRatio >= 1.5;
    this.group = new THREE.Group(); this.group.name = 'sky';
    this.disposables = [];
    // --- nebulosa (bakad kubkarta)
    const size = hi ? 1024 : (q.pixelRatio >= 1 ? 768 : 512);
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const tmpScene = new THREE.Scene();
    const nebMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uBase: { value: new THREE.Color(P.base) }, uC1: { value: new THREE.Color(P.c1) }, uC2: { value: new THREE.Color(P.c2) }, uC3: { value: new THREE.Color(P.c3) },
        uBandN: { value: P.bandN.clone() }, uBandC: { value: new THREE.Color(P.bandC) }, uSeed: { value: new THREE.Vector3(P.seed * 1.37, P.seed * 2.11, P.seed * 0.73) },
        uDensity: { value: P.density }, uScale: { value: P.scale }
      }, vertexShader: NEB_VS, fragmentShader: NEB_FS
    });
    const nebGeo = new THREE.SphereGeometry(100, 64, 32);
    tmpScene.add(new THREE.Mesh(nebGeo, nebMat));
    const cc = new THREE.CubeCamera(1, 1000, rt);
    cc.update(renderer, tmpScene);
    nebGeo.dispose(); nebMat.dispose();
    this.cubeRT = rt;
    scene.background = rt.texture;
    scene.backgroundIntensity = 1;
    // --- miljökarta för reflexer
    this.envRT = makeEnvMap(renderer, { top: P.env.top, bottom: P.env.bottom, tint: P.env.tint, sunDir: P.sun.dir, sunColor: P.sun.color });
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 1.1;
    // --- stjärnor
    const rng = makeRng(P.seed * 13 + 5);
    const N = Math.round((hi ? 6000 : 3500) * (P.fog ? 0.4 : 1));
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N), ph = new Float32Array(N);
    const v = new THREE.Vector3(), tmp = new THREE.Color();
    const temps = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffd2a1', '#ffcc6f'];
    for (let i = 0; i < N; i++) {
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      if (v.lengthSq() < 0.0001) v.set(1, 0, 0);
      v.normalize();
      if (rng() < 0.45) { const k = v.dot(P.bandN); v.addScaledVector(P.bandN, -k * 0.85).normalize(); }
      v.multiplyScalar(9000);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      tmp.set(temps[Math.floor(rng() * temps.length)]);
      const br = 0.35 + Math.pow(rng(), 4) * 2.2;
      col[i * 3] = tmp.r * br; col[i * 3 + 1] = tmp.g * br; col[i * 3 + 2] = tmp.b * br;
      sz[i] = 1.2 + Math.pow(rng(), 6) * 3.2; ph[i] = rng() * 3;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    this.starMat = new THREE.ShaderMaterial({ uniforms: { uPR: { value: renderer.getPixelRatio() }, uTime: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const stars = new THREE.Points(sg, this.starMat); stars.frustumCulled = false; stars.renderOrder = -5;
    this.group.add(stars);
    this.disposables.push(sg, this.starMat);
    // --- sol
    const sunPos = P.sun.dir.clone().multiplyScalar(8500);
    const sunMat = new THREE.SpriteMaterial({ map: sunTexture(), color: new THREE.Color(P.sun.color).multiplyScalar(3.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    const sun = new THREE.Sprite(sunMat); sun.position.copy(sunPos); sun.scale.setScalar(2600 * P.sun.size); sun.renderOrder = -4;
    const sunCoreMat = new THREE.SpriteMaterial({ map: sunTexture(), color: new THREE.Color(P.sun.color).multiplyScalar(8), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    const core = new THREE.Sprite(sunCoreMat); core.position.copy(sunPos); core.scale.setScalar(700 * P.sun.size); core.renderOrder = -4;
    this.group.add(sun, core);
    this.disposables.push(sunMat, sunCoreMat);
    this.sunDir = P.sun.dir.clone();
    // --- planeter
    const texW = hi ? 1024 : (q.pixelRatio >= 1 ? 512 : 256);
    this.planets = [];
    for (const pl of P.planets) {
      const tx = planetTexture(pl.type, pl.seed, pl.palette, pl.r < 500 ? Math.min(256, texW) : texW);
      const pm = new THREE.MeshStandardMaterial({ map: tx.map, roughness: 0.92, metalness: 0, fog: false, envMapIntensity: 0 });
      if (tx.emissive) { pm.emissiveMap = tx.emissive; pm.emissive = new THREE.Color(1, 1, 1); pm.emissiveIntensity = 1.6; }
      const geo = new THREE.SphereGeometry(pl.r, 64, 40);
      const mesh = new THREE.Mesh(geo, pm);
      mesh.position.copy(pl.dir).multiplyScalar(pl.dist);
      mesh.rotation.set(0.3, pl.seed, 0.2);
      mesh.renderOrder = -3;
      this.group.add(mesh);
      this.disposables.push(geo, pm);
      if (pl.atmo) {
        for (const back of [0, 1]) {
          const am = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(pl.atmo) }, uSun: { value: this.sunDir }, uPow: { value: back ? 3.0 : 2.4 }, uInt: { value: back ? 1.3 : 1.1 }, uBack: { value: back } },
            vertexShader: ATMO_VS, fragmentShader: ATMO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: back ? THREE.BackSide : THREE.FrontSide
          });
          const ag = new THREE.SphereGeometry(pl.r * (back ? 1.12 : 1.015), 64, 40);
          const a = new THREE.Mesh(ag, am); a.position.copy(mesh.position); a.renderOrder = -2;
          this.group.add(a); this.disposables.push(ag, am);
        }
      }
      if (pl.ring) {
        const rout = Math.min(pl.r * 2.3, pl.dist * 0.55), rin = Math.min(pl.r * 1.3, rout * 0.78);
        const bands = ringBands(pl.seed, pl.atmo || '#c0c0c0');
        const rg = new THREE.RingGeometry(rin, rout, 128, 1);
        const rmat = new THREE.ShaderMaterial({
          uniforms: { uBands: { value: bands }, uSun: { value: this.sunDir }, uPlanet: { value: new THREE.Vector3() }, uIn: { value: rin }, uOut: { value: rout }, uPR: { value: pl.r } },
          vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(rg, rmat); ring.position.copy(mesh.position); ring.rotation.set(Math.PI / 2 - 0.35, 0.2, 0.1); ring.renderOrder = -1;
        this.group.add(ring); this.disposables.push(rg, rmat, bands);
        this.planets.push({ mesh, ring, rmat });
      } else this.planets.push({ mesh });
    }
    scene.add(this.group);
    // --- ljus
    this.sunLight = new THREE.DirectionalLight(new THREE.Color(P.sun.color), P.sun.intensity);
    this.sunLight.position.copy(P.sun.dir).multiplyScalar(1000);
    this.sunLight.target.position.set(0, 0, 0);
    this.hemi = new THREE.HemisphereLight(new THREE.Color(P.hemi[0]), new THREE.Color(P.hemi[1]), P.hemi[2]);
    this.hemi.position.set(0, 1, 0);
    // motljus från nebulosan så att skuggsidan av skeppen syns
    this.fillDir = P.sun.dir.clone().negate().add(new THREE.Vector3(0, 0.35, 0)).normalize();
    this.fill = new THREE.DirectionalLight(new THREE.Color(P.hemi[0]).lerp(new THREE.Color('#ffffff'), 0.3), 0.75);
    scene.add(this.sunLight, this.sunLight.target, this.hemi, this.fill, this.fill.target);
    // --- dimma
    scene.fog = P.fog ? new THREE.FogExp2(new THREE.Color(P.fog.color), P.fog.density) : null;
    this.fogBase = P.fog ? P.fog.density : 0;
    this.dustColor = P.dust;
    this.time = 0;
  }
  update(camera, dt) {
    this.time += dt;
    this.group.position.copy(camera.position);
    this.starMat.uniforms.uTime.value = this.time;
    this.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();
    for (const p of this.planets) if (p.rmat) p.rmat.uniforms.uPlanet.value.setFromMatrixPosition(p.mesh.matrixWorld);
    // solljuset följer kameran så att riktningen alltid är densamma
    this.sunLight.position.copy(camera.position).addScaledVector(this.sunDir, 1000);
    this.sunLight.target.position.copy(camera.position);
    this.fill.position.copy(camera.position).addScaledVector(this.fillDir, 1000);
    this.fill.target.position.copy(camera.position);
  }
  dispose() {
    this.scene.remove(this.group, this.sunLight, this.sunLight.target, this.hemi, this.fill, this.fill.target);
    this.disposables.forEach(d => d.dispose());
    this.cubeRT.dispose(); this.envRT.dispose();
    if (this.scene.background === this.cubeRT.texture) this.scene.background = null;
    this.scene.environment = null; this.scene.fog = null;
  }
}
