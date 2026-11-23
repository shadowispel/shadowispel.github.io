/**
 * Rymdjakt – procedurella texturer, delade material och hjälpfunktioner för grafik.
 */
import * as THREE from 'three';
import { makeRng } from '../../engine/kit.js';

/* ------------------------------------------------------------ Brus (snabbt värdebrus) */
export function makeNoise3(seed = 1) {
  const rng = makeRng(seed);
  const P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = rng(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const fade = t => t * t * (3 - 2 * t);
  const h = (x, y, z) => G[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const a = h(xi, yi, zi), b = h(xi + 1, yi, zi), c = h(xi, yi + 1, zi), d = h(xi + 1, yi + 1, zi);
    const e = h(xi, yi, zi + 1), f = h(xi + 1, yi, zi + 1), g = h(xi, yi + 1, zi + 1), k = h(xi + 1, yi + 1, zi + 1);
    const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (k - g) * u;
    const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
    return y1 + (y2 - y1) * w; // 0..1
  }
  n3.fbm = (x, y, z, oct = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * n3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };
  return n3;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

/* ------------------------------------------------------------ Texturer */
const TEX = {};
/** Skrovplåtar: ljusgrå bas med panelfogar, nitar och smuts. */
export function panelTexture() {
  if (TEX.panel) return TEX.panel;
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  const rng = makeRng(77);
  g.fillStyle = '#bfc3c9'; g.fillRect(0, 0, S, S);
  // stora och små paneler
  const panel = (x, y, w, h, depth) => {
    const v = 175 + Math.floor(rng() * 40);
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x, y, w, h);
    g.strokeStyle = `rgba(40,45,55,${0.55 + depth * 0.2})`; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 2, y + h - 2); g.lineTo(x + 2, y + 2); g.lineTo(x + w - 2, y + 2); g.stroke();
  };
  const split = (x, y, w, h, d) => {
    if (d > 3 || (w < 60 && h < 60) || (d > 1 && rng() < 0.25)) { panel(x, y, w, h, d); return; }
    if (w > h ? rng() < 0.8 : rng() < 0.2) { const s = Math.round(w * (0.3 + rng() * 0.4) / 8) * 8; split(x, y, s, h, d + 1); split(x + s, y, w - s, h, d + 1); }
    else { const s = Math.round(h * (0.3 + rng() * 0.4) / 8) * 8; split(x, y, w, s, d + 1); split(x, y + s, w, h - s, d + 1); }
  };
  split(0, 0, S, S, 0);
  // nitar
  g.fillStyle = 'rgba(60,65,75,0.6)';
  for (let i = 0; i < 260; i++) { const x = Math.floor(rng() * 64) * 8 + 4, y = Math.floor(rng() * 64) * 8 + 4; g.fillRect(x, y, 2, 2); }
  // smuts / slitage
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(30,30,35,${0.05 + rng() * 0.08})`); gr.addColorStop(1, 'rgba(30,30,35,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // varningsrader och små luckor
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rng() * 60) * 8, y = Math.floor(rng() * 60) * 8;
    g.fillStyle = 'rgba(70,75,85,0.7)'; g.fillRect(x, y, 16 + Math.floor(rng() * 3) * 8, 6);
  }
  return (TEX.panel = tex(c));
}

/** Upplysta fönsterrader (emissiv karta) för stora skepp och stationer. */
export function windowTexture() {
  if (TEX.windows) return TEX.windows;
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const rng = makeRng(31);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  for (let row = 0; row < 16; row++) {
    if (rng() < 0.45) continue;
    const y = row * 16 + 6;
    for (let x = 4; x < S; x += 8) {
      if (rng() < 0.3) { x += Math.floor(rng() * 24); continue; }
      const b = 0.6 + rng() * 0.4;
      g.fillStyle = rng() < 0.85 ? `rgba(255,${Math.floor(220 * b)},${Math.floor(150 * b)},${b})` : `rgba(160,210,255,${b})`;
      g.fillRect(x, y, 5, 4);
    }
  }
  return (TEX.windows = tex(c));
}

/** Solpaneler. */
export function solarTexture() {
  if (TEX.solar) return TEX.solar;
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#0d1f45'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) {
    const gr = g.createLinearGradient(x, y, x + 16, y + 16);
    gr.addColorStop(0, '#2a4f9a'); gr.addColorStop(1, '#10275a');
    g.fillStyle = gr; g.fillRect(x + 1, y + 1, 14, 14);
  }
  return (TEX.solar = tex(c));
}

/** Stenyta för asteroider. */
export function rockTexture() {
  if (TEX.rock) return TEX.rock;
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const n = makeNoise3(5), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
    // sömlös: sampla på en torus
    const f = n.fbm(Math.cos(u) * 2 + 9, Math.sin(u) * 2 + Math.cos(v) * 2, Math.sin(v) * 2, 5);
    const k = n(Math.cos(u) * 9, Math.sin(u) * 9 + Math.cos(v) * 9, Math.sin(v) * 9);
    const val = 110 + (f - 0.5) * 160 + (k > 0.8 ? -40 : 0);
    const i = (y * S + x) * 4;
    img.data[i] = val; img.data[i + 1] = val * 0.96; img.data[i + 2] = val * 0.92; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (TEX.rock = tex(c));
}

/** Mjuk rund glöd (för sprites). */
export function glowTexture() {
  if (TEX.glow) return TEX.glow;
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return (TEX.glow = tex(c, { srgb: false, repeat: false }));
}

/** Solens strålkrans. */
export function sunTexture() {
  if (TEX.sun) return TEX.sun;
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  const m = S / 2;
  let gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.05, 'rgba(255,250,235,1)'); gr.addColorStop(0.12, 'rgba(255,230,190,0.55)');
  gr.addColorStop(0.35, 'rgba(255,190,120,0.12)'); gr.addColorStop(1, 'rgba(255,160,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const rng = makeRng(9);
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, len = m * (0.45 + rng() * 0.55), w = 2 + rng() * 5;
    g.save(); g.translate(m, m); g.rotate(a);
    gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,240,210,0.35)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.fill(); g.restore();
  }
  return (TEX.sun = tex(c, { srgb: false, repeat: false }));
}

/** Flammans gradient (motorlåga). */
export function flameTexture() {
  if (TEX.flame) return TEX.flame;
  const c = canvas(32, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
  const t = tex(c, { srgb: false, repeat: false });
  return (TEX.flame = t);
}

/* ------------------------------------------------------------ Triplanar-patch
 * Ger hela modeller jämn texturtäthet oavsett hur primitiverna skalats (UV beräknas i objektrymd). */
export function triplanar(mat, scale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTri = { value: scale };
    sh.vertexShader = 'varying vec3 vTriP;\nvarying vec3 vTriN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = position; vTriN = normal;');
    sh.fragmentShader = 'uniform float uTri;\nvarying vec3 vTriP;\nvarying vec3 vTriN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 triN = abs(normalize(vTriN));
        vec2 triUv = (triN.x > triN.y && triN.x > triN.z) ? vTriP.zy : ((triN.y > triN.z) ? vTriP.xz : vTriP.xy);
        triUv *= uTri;
        #ifdef USE_MAP
          diffuseColor *= texture2D(map, triUv);
        #endif`)
      .replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP
          totalEmissiveRadiance *= texture2D(emissiveMap, triUv * 0.5).rgb;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'tri';
  return mat;
}

/* ------------------------------------------------------------ Material */
const MATS = {};
/** Delade material. key: se nedan. Skapas en gång och återanvänds av alla modeller. */
export function mat(key) {
  if (MATS[key]) return MATS[key];
  let m;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (r, g, b, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }, o));
  switch (key) {
    case 'hullW': m = triplanar(std({ color: 0xe4e8ee, map: panelTexture(), metalness: 0.45, roughness: 0.5 }), 0.09); break;
    case 'hullWBig': m = triplanar(std({ color: 0xd6dbe3, map: panelTexture(), metalness: 0.45, roughness: 0.55, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 1.4 }), 0.018); break;
    case 'hullWPlain': m = triplanar(std({ color: 0xd6dbe3, map: panelTexture(), metalness: 0.45, roughness: 0.55 }), 0.02); break;
    case 'hullD': m = triplanar(std({ color: 0x9a9ea8, map: panelTexture(), metalness: 0.4, roughness: 0.5 }), 0.09); break;
    case 'hullDBig': m = triplanar(std({ color: 0x8c909a, map: panelTexture(), metalness: 0.4, roughness: 0.55, emissive: 0xff6a3a, emissiveMap: windowTexture(), emissiveIntensity: 1.2 }), 0.016); break;
    case 'hullDPlain': m = triplanar(std({ color: 0x868a94, map: panelTexture(), metalness: 0.4, roughness: 0.55 }), 0.02); break;
    case 'blue': m = std({ color: 0x1f5fbf, metalness: 0.4, roughness: 0.45 }); break;
    case 'gold': m = std({ color: 0xf2c230, metalness: 0.6, roughness: 0.35 }); break;
    case 'red': m = std({ color: 0xa8321f, metalness: 0.45, roughness: 0.5 }); break;
    case 'rust': m = triplanar(std({ color: 0x8a3a22, map: panelTexture(), metalness: 0.5, roughness: 0.6 }), 0.05); break;
    case 'grey': m = std({ color: 0x8a9099, metalness: 0.6, roughness: 0.45 }); break;
    case 'dark': m = std({ color: 0x45484f, metalness: 0.5, roughness: 0.5 }); break;
    // cockpitglas med klarlack som speglar omgivningen (scene.environment)
    case 'glass': m = new THREE.MeshPhysicalMaterial({ color: 0x0c1a36, metalness: 0.35, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x0a2a55, emissiveIntensity: 0.45, envMapIntensity: 2.2 }); break;
    case 'glassRed': m = new THREE.MeshPhysicalMaterial({ color: 0x220806, metalness: 0.4, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xff2a10, emissiveIntensity: 1.5, envMapIntensity: 1.6 }); break;
    // detaljmaterial för skeppen
    case 'metal': m = std({ color: 0xb4bcc8, metalness: 0.92, roughness: 0.26 }); break;
    case 'nozzle': m = std({ color: 0x2c2e33, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide }); break;
    case 'carbon': m = triplanar(std({ color: 0x3a3f4a, map: panelTexture(), metalness: 0.35, roughness: 0.62 }), 0.16); break;
    case 'carbonRed': m = triplanar(std({ color: 0x5a1c14, map: panelTexture(), metalness: 0.4, roughness: 0.55 }), 0.14); break;
    case 'hullFine': m = triplanar(std({ color: 0xeef1f5, map: panelTexture(), metalness: 0.38, roughness: 0.4 }), 0.16); break;
    case 'hullDFine': m = triplanar(std({ color: 0x8a8f99, map: panelTexture(), metalness: 0.55, roughness: 0.42 }), 0.15); break;
    case 'blueGloss': m = std({ color: 0x1d5fd0, metalness: 0.35, roughness: 0.28 }); break;
    case 'goldGloss': m = std({ color: 0xf2c230, metalness: 0.7, roughness: 0.25 }); break;
    case 'redGloss': m = std({ color: 0xb0281a, metalness: 0.45, roughness: 0.3 }); break;
    case 'glowCore': m = glow(0.9, 1.25, 1.8); break;
    case 'glowCoreRed': m = glow(1.8, 0.95, 0.4); break;
    case 'solar': m = std({ color: 0xffffff, map: solarTexture(), metalness: 0.8, roughness: 0.25, emissive: 0x0a1a40, emissiveIntensity: 0.4 }); break;
    case 'rock': m = std({ color: 0xffffff, map: rockTexture(), vertexColors: true, metalness: 0.05, roughness: 0.95, flatShading: true }); break;
    case 'rockBase': m = triplanar(std({ color: 0xb8ae9e, map: rockTexture(), metalness: 0.05, roughness: 0.95, flatShading: true }), 0.012); break;
    case 'glowBlue': m = glow(0.15, 0.45, 1.25); break;
    case 'glowCyan': m = glow(0.4, 1.4, 1.8); break;
    case 'glowOrange': m = glow(1.3, 0.45, 0.1); break;
    case 'glowRed': m = glow(1.8, 0.2, 0.08); break;
    case 'glowGreen': m = glow(0.4, 3.0, 0.8); break;
    case 'glowWhite': m = glow(2.4, 2.4, 2.4); break;
    case 'glowGold': m = glow(1.6, 1.15, 0.3); break;
    case 'flameBlue': m = glow(0.2, 0.6, 1.5, { map: flameTexture(), side: THREE.DoubleSide }); break;
    case 'flameOrange': m = glow(1.5, 0.5, 0.12, { map: flameTexture(), side: THREE.DoubleSide }); break;
    case 'core': m = std({ color: 0x220a04, emissive: 0xff5a1a, emissiveIntensity: 3.2, metalness: 0.2, roughness: 0.4 }); break;
    case 'coreBlue': m = std({ color: 0x04101e, emissive: 0x3aa0ff, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.4 }); break;
    case 'shieldGen': m = std({ color: 0x103040, emissive: 0x30c0ff, emissiveIntensity: 1.8, metalness: 0.3, roughness: 0.3 }); break;
    case 'shieldGenRed': m = std({ color: 0x401010, emissive: 0xff4a20, emissiveIntensity: 1.8, metalness: 0.3, roughness: 0.3 }); break;
    case 'wreck': m = std({ color: 0x1a1a1c, metalness: 0.5, roughness: 0.9, emissive: 0x401006, emissiveIntensity: 0.6 }); break;
    case 'debris': m = std({ color: 0x55585f, metalness: 0.6, roughness: 0.6 }); break;
    case 'holo': m = glow(0.3, 1.6, 2.4, { opacity: 0.55, side: THREE.DoubleSide }); break;
    case 'holoGold': m = glow(2.4, 1.8, 0.5, { opacity: 0.6, side: THREE.DoubleSide }); break;
    default: throw new Error('okänt material ' + key);
  }
  m.name = key;
  return (MATS[key] = m);
}

/** Sprite-material med glödtextur (delas). */
const SPR = {};
export function glowSpriteMat(hex, intensity = 2, key) {
  const k = key || (hex + ':' + intensity);
  if (SPR[k]) return SPR[k];
  const c = new THREE.Color(hex).multiplyScalar(intensity);
  return (SPR[k] = new THREE.SpriteMaterial({ map: glowTexture(), color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
}

/* ------------------------------------------------------------ Miljökarta
 * En liten scen med gradient + sol bakas till en PMREM-karta för reflexer i metall. */
export function makeEnvMap(renderer, { top = '#3a4a7a', bottom = '#0a0c18', sunDir = new THREE.Vector3(1, 0.4, 0.2), sunColor = '#fff2dd', tint = '#4a3a8a' } = {}) {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cTop: { value: new THREE.Color(top) }, cBot: { value: new THREE.Color(bottom) }, cTint: { value: new THREE.Color(tint) }, sun: { value: sunDir.clone().normalize() }, cSun: { value: new THREE.Color(sunColor) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 cTop, cBot, cTint, sun, cSun; varying vec3 vD;
      void main(){ float h = vD.y*0.5+0.5; vec3 c = mix(cBot, cTop, smoothstep(0.0,1.0,h));
        c += cTint * 0.35 * pow(max(0.0, 1.0 - abs(vD.y)), 3.0);
        float s = max(0.0, dot(vD, sun)); c += cSun * (pow(s, 64.0) * 30.0 + pow(s, 6.0) * 0.6);
        gl_FragColor = vec4(c, 1.0); }`
  });
  sc.add(new THREE.Mesh(geo, m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.02);
  pm.dispose(); geo.dispose(); m.dispose();
  return rt; // .texture
}

/** Säker borttagning av ett objektträd (bara unika resurser som markerats med userData.own). */
export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.userData && o.userData.ownGeo && o.geometry) o.geometry.dispose();
    if (o.userData && o.userData.ownMat && o.material) [].concat(o.material).forEach(m => { if (m.map && m.userData && m.userData.ownMap) m.map.dispose(); m.dispose(); });
  });
}
