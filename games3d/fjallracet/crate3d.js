/**
 * Fjällracet – lådöppning i 3D.
 * Egen scen + kamera som renderas med spelets renderare (ingen extra WebGL-kontext). Allt byggs när överlägget öppnas
 * och allt dispose:as när det stängs. Sekvens: låda faller och studsar → skakar och glöder → locket flyger/fälls upp →
 * ljusstrålar, gnistor, konfetti → föremålen stiger upp ett i taget → sammanfattning ("Öppna nästa"/"Fortsätt").
 * Klick/Enter/Mellanslag skyndar på. Låg kvalitet: inga skuggor, ingen bloom, färre partiklar. prefers-reduced-motion:
 * kortare och lugnare (ingen studs/skakning/slow motion).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Particles } from './fx.js';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOutCubic = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeOutBack = x => { x = clamp(x, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const esc = (t) => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const _v = new THREE.Vector3(), _o = new THREE.Object3D(), _c = new THREE.Color();

/* ------------------------------------------------------------------ texturer (ritas per öppning, dispose vid stängning) */
function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const radialTex = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { srgb: false });
function woodTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const planks = 5, ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const l = 34 + Math.random() * 8;
      g.fillStyle = `hsl(${24 + Math.random() * 6},${48 + Math.random() * 10}%,${l}%)`; g.fillRect(0, p * ph, w, ph);
      for (let k = 0; k < 46; k++) { // ådring
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,8' : '255,210,160'},${0.05 + Math.random() * 0.12})`; g.lineWidth = 0.6 + Math.random() * 1.6;
        const y0 = p * ph + Math.random() * ph; g.beginPath(); g.moveTo(0, y0);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y0 + Math.sin(x * 0.02 + k) * 3 + (Math.random() - 0.5) * 2);
        g.stroke();
      }
      if (Math.random() < 0.7) { const kx = Math.random() * w, ky = p * ph + ph * (0.3 + Math.random() * 0.4); g.fillStyle = 'rgba(50,25,10,.55)'; g.beginPath(); g.ellipse(kx, ky, 10, 5, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(50,25,10,.3)'; g.beginPath(); g.ellipse(kx, ky, 18, 9, 0, 0, TAU); g.stroke(); }
      g.fillStyle = 'rgba(20,10,4,.85)'; g.fillRect(0, p * ph, w, 3); // fog mellan brädor
      g.fillStyle = 'rgba(255,220,180,.12)'; g.fillRect(0, p * ph + 3, w, 2);
    }
  });
}
function brushedTex(base = '#a9b4c0') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.12})` : `rgba(0,0,0,${Math.random() * 0.1})`; g.fillRect(Math.random() * w - 40, Math.random() * h, 40 + Math.random() * 160, 1); }
  });
}
function hazardTex() {
  return canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h); g.fillStyle = '#16171b';
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  });
}
function carbonTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const gr = (x + y) % 2 ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
      gr.addColorStop(0, '#1d2026'); gr.addColorStop(0.5, '#3a3f49'); gr.addColorStop(1, '#1d2026');
      g.fillStyle = gr; g.fillRect(x * 8 + 0.5, y * 8 + 0.5, 7, 7);
    }
  }, { repeat: [6, 6] });
}
/** Emblem: fjälltoppar i en ring. */
function emblemTex(bg, fg) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, 108, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 92, 0, TAU); g.stroke();
    g.fillStyle = fg; g.beginPath(); g.moveTo(52, 168); g.lineTo(104, 86); g.lineTo(128, 120); g.lineTo(156, 70); g.lineTo(204, 168); g.closePath(); g.fill();
    g.fillStyle = bg; g.beginPath(); g.moveTo(92, 104); g.lineTo(104, 86); g.lineTo(116, 104); g.lineTo(110, 100); g.lineTo(104, 108); g.lineTo(98, 100); g.fill();
    g.beginPath(); g.moveTo(142, 92); g.lineTo(156, 70); g.lineTo(170, 92); g.lineTo(162, 88); g.lineTo(156, 96); g.lineTo(150, 88); g.fill();
    g.fillStyle = fg; g.font = '900 30px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('★ ★ ★', w / 2, 206);
  });
}
function labelTex(title, sub, color) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 150, w, 70);
    g.fillStyle = '#16171b'; g.fillRect(0, 40, w, 12);
    g.font = '900 64px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#16171b'; g.fillText(title, w / 4, 125); g.fillText(title, w * 3 / 4, 125);
    g.font = '700 26px Rubik, system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(sub, w / 4, 196); g.fillText(sub, w * 3 / 4, 196);
  });
}
function coinTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w * 0.4, h * 0.35, 4, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.6, '#f0b62a'); gr.addColorStop(1, '#a06a10');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,70,0,.8)'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, 54, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(110,62,0,.9)'; g.font = '900 46px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('kr', w / 2, h / 2 + 2);
  });
}
function treadTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a';
    g.fillRect(30, 0, 4, h); g.fillRect(0, 0, w, 5);
    for (let k = 0; k < 2; k++) { g.save(); g.translate(k ? 48 : 16, 32); g.rotate(k ? 0.5 : -0.5); g.fillRect(-2, -34, 4, 68); g.restore(); }
  }, { srgb: false, repeat: [40, 1] });
}
function discTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#7c828c'); gr.addColorStop(0.4, '#9aa1ab'); gr.addColorStop(1, '#c3c8cf');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2d33';
    for (let r = 0; r < 3; r++) for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + r * 0.18, rr = 70 + r * 16; g.beginPath(); g.arc(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr, 4.5, 0, TAU); g.fill(); }
    g.fillStyle = '#4b5059'; g.beginPath(); g.arc(w / 2, h / 2, 42, 0, TAU); g.fill();
  });
}
function decalTex(id, car) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = car; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    switch (id) {
      case 'race': g.fillRect(180, 0, 56, h); g.fillRect(276, 0, 56, h); break;
      case 'side': for (let k = 0; k < 3; k++) g.fillRect(0, 120 + k * 26, w, 14 - k * 3); break;
      case 'checker': for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32); break;
      case 'camo': for (let k = 0; k < 70; k++) { g.fillStyle = ['#2e4a2a', '#5a6b3a', '#1e2a1c', '#8a8a5a'][k % 4]; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 12 + Math.random() * 22, Math.random() * 3, 0, TAU); g.fill(); } break;
      case 'bolt': for (let k = 0; k < 3; k++) { const x = 60 + k * 170; g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 60, 20); g.lineTo(x + 30, 110); g.lineTo(x + 80, 110); g.lineTo(x - 10, 240); g.lineTo(x + 20, 135); g.lineTo(x - 25, 135); g.fill(); } break;
      case 'fade': for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { const r = 7 * (x / w); g.beginPath(); g.arc(x + 8, y + 8, r, 0, TAU); g.fill(); } break;
      case 'geo': for (let k = 0; k < 14; k++) { g.fillStyle = k % 2 ? '#ffffff' : 'rgba(255,255,255,.45)'; const x = k * 40; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 60, 40 + (k % 3) * 40); g.lineTo(x + 100, h); g.fill(); } break;
      default: { // lågor
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ffe14a'); gr.addColorStop(0.5, '#ff8a1a'); gr.addColorStop(1, '#ff2d1a');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 60);
        for (let k = 0; k < 6; k++) { const y = 40 + k * 36; g.bezierCurveTo(200, y - 30, 320 + k * 20, y + 10, 470 - k * 30, y + 6); g.bezierCurveTo(300, y + 24, 200, y + 30, 0, y + 36); }
        g.lineTo(0, 260); g.fill();
      }
    }
  });
}

/* ------------------------------------------------------------------ sceneriet */
export function createCrateStage({ renderer, settings, audio, env, root, size, buildCar, disposeCar }) {
  let S = null; // aktiv scen

  function makeStage() {
    const q = settings.get('quality'), low = q === 'low', fancy = q === 'high' || q === 'ultra';
    const shadows = !!settings.q.shadows;
    const scene = new THREE.Scene();
    scene.environment = env || null; scene.environmentIntensity = 0.55;
    const FOG = new THREE.Color(0x04060d);
    scene.fog = new THREE.Fog(FOG, 14, 38);
    const cam = new THREE.PerspectiveCamera(35, size.w / size.h, 0.1, 120);
    const accent = new THREE.Color(0xb9c2cf), accentT = new THREE.Color(0xb9c2cf);
    const tex = { glow: radialTex() };

    // bakgrund: gradient + glöd i sällsynthetens färg
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color(0x0b1128) }, uBot: { value: FOG.clone() }, uAcc: { value: accent }, uGlow: { value: 0.35 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uBot, uAcc; uniform float uGlow; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); vec3 c = mix(uBot, uTop, smoothstep(-0.05, 0.7, d.y));
          float k = max(0.0, dot(d, normalize(vec3(0.0, 0.12, -1.0))));
          c += uAcc * (pow(k, 18.0) * 0.22 + pow(k, 90.0) * 0.35) * uGlow;
          c *= 1.0 - 0.35 * smoothstep(0.3, 0.9, abs(d.x));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), bgMat); bg.renderOrder = -1; scene.add(bg);
    // golv + piedestal
    tex.fade = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { srgb: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshLambertMaterial({ color: 0x141a2c, transparent: true, alphaMap: tex.fade, depthWrite: false }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = shadows; floor.renderOrder = -0.5; scene.add(floor);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.14, 64), new THREE.MeshStandardMaterial({ color: 0x161d33, metalness: 0.8, roughness: 0.22 }));
    ped.position.y = 0.07; ped.receiveShadow = shadows; scene.add(ped);
    const pedRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pedRing = new THREE.Mesh(new THREE.TorusGeometry(1.84, 0.022, 8, 96), pedRingMat); pedRing.rotation.x = PI / 2; pedRing.position.y = 0.12; scene.add(pedRing);
    const floorGlowMat = new THREE.MeshBasicMaterial({ map: tex.glow, color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 });
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), floorGlowMat); floorGlow.rotation.x = -PI / 2; floorGlow.position.y = 0.145; scene.add(floorGlow);

    // ljus: mjuk studio + kantljus i sällsynthetens färg
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x140f1c, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.3); key.position.set(3.5, 7, 5);
    if (shadows) { key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -3, near: 1, far: 20 }); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; }
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.6); fill.position.set(-4, 3, 4); scene.add(fill);
    const rimL = new THREE.DirectionalLight(accent, 3.2); rimL.position.set(-5, 3.5, -4); scene.add(rimL);
    const rimR = new THREE.DirectionalLight(accent, 2.6); rimR.position.set(5, 2.5, -4.5); scene.add(rimR);
    const core = new THREE.PointLight(accent, 0, 9, 2); core.position.set(0, 1.4, 0.2); scene.add(core);

    // ljusstrålar
    const beams = new THREE.Group(); beams.position.y = 0.95; scene.add(beams);
    const beamGeo = new THREE.CylinderGeometry(1, 0.06, 1, 24, 1, true); beamGeo.translate(0, 0.5, 0);
    const beamList = [];
    const NB = low ? 4 : 9;
    for (let k = 0; k < NB; k++) {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: accent }, uAlpha: { value: 0 }, uTime: { value: 0 }, uSeed: { value: Math.random() * 20 } },
        vertexShader: `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal); vF = abs(dot(n, normalize(cameraPosition - wp.xyz))); gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uAlpha, uTime, uSeed; varying vec2 vUv; varying float vF;
          void main(){ float y = vUv.y; float a = pow(1.0 - y, 1.6) * smoothstep(0.0, 0.06, y) * pow(vF, 2.0);
            a *= 0.65 + 0.35 * sin(vUv.x * 37.0 + uTime * 1.7 + uSeed) * sin(vUv.x * 13.0 - uTime + uSeed * 2.0);
            gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.2 * (1.0 - y)), a * uAlpha); }`
      });
      const b = new THREE.Mesh(beamGeo, m);
      const ang = k / NB * TAU + rnd(-0.2, 0.2), tilt = rnd(0.12, 0.42);
      b.rotation.set(Math.cos(ang) * tilt, 0, Math.sin(ang) * tilt);
      b.userData = { w: rnd(0.25, 0.7), h: rnd(5, 9), ph: rnd(0, TAU) };
      b.scale.set(0.001, 0.001, 0.001); b.renderOrder = 3; b.frustumCulled = false;
      beams.add(b); beamList.push(b);
    }
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    flare.position.set(0, 1.2, 0.1); flare.renderOrder = 5; scene.add(flare);

    // partiklar
    const sparks = new Particles(scene, low ? 260 : 800, true);
    const dust = new Particles(scene, low ? 40 : 120, false);
    const CN = low ? 50 : 170;
    const confMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.4 });
    const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.065), confMat, CN);
    conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); conf.frustumCulled = false;
    const confS = [];
    for (let i = 0; i < CN; i++) { conf.setColorAt(i, _c.set(0xffffff)); confS.push({ on: false, rest: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), ph: Math.random() * TAU }); _o.scale.setScalar(0); _o.updateMatrix(); conf.setMatrixAt(i, _o.matrix); }
    _o.scale.setScalar(1);
    scene.add(conf);

    // efterbehandling (bara Hög/Ultra)
    let composer = null, bloom = null;
    if (fancy) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, cam));
      bloom = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 0.5, 0.45, 0.85);
      const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
      composer.addPass(bloom); composer.addPass(new OutputPass());
      composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(size.w, size.h);
    }

    // DOM-överlägg
    const ov = document.createElement('div'); ov.className = 'fj-crateov fj-c3';
    ov.innerHTML = `<div class="fj-c3top"><h2></h2><small class="fj-c3hint">Klicka för att skynda på</small></div><div class="fj-c3card hidden" role="dialog" aria-live="polite"></div>`;
    root.appendChild(ov);

    return { scene, cam, low, fancy, shadows, accent, accentT, tex, bgMat, floorGlowMat, pedRingMat, key, rimL, rimR, core, beams, beamList, flare, sparks, dust, conf, confS, composer, bloom, ov,
      card: ov.querySelector('.fj-c3card'), title: ov.querySelector('h2'), hint: ov.querySelector('.fj-c3hint'), time: 0, shake: 0, slow: 0, cr: null };
  }

  /* ---------------- material- och mesh-hjälpare ---------------- */
  const std = (o) => new THREE.MeshStandardMaterial(o);
  function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = S.shadows; m.receiveShadow = S.shadows; parent.add(m); return m;
  }
  /** 12 kantlister runt en låda (b,h,d) centrerad i (0,cy,0). */
  function edgeBars(parent, W, H, D, t, mat, cy) {
    const hx = W / 2, hy = H / 2, hz = D / 2;
    const gx = new THREE.BoxGeometry(W + t, t, t), gy = new THREE.BoxGeometry(t, H + t, t), gz = new THREE.BoxGeometry(t, t, D + t);
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) add(parent, gx, mat, 0, cy + sy * hy, sz * hz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(parent, gy, mat, sx * hx, cy, sz * hz);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(parent, gz, mat, sx * hx, cy + sy * hy, 0);
  }
  function rivets(parent, pts, mat, r = 0.026) {
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 10, 6), mat, pts.length);
    pts.forEach((p, i) => { _o.position.set(p[0], p[1], p[2]); _o.rotation.set(0, 0, 0); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
    im.castShadow = false; parent.add(im); return im;
  }

  /* ---------------- lådan ---------------- */
  const W = 1.7, HB = 0.86, HL = 0.3, D = 1.2;
  function buildCrate(type, glowCol) {
    const T = S.tex, low = S.low;
    const g = new THREE.Group();
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, HB, -D / 2); g.add(lidPivot);
    const lid = new THREE.Group(); lid.position.set(0, HL / 2, D / 2); lidPivot.add(lid);
    let bodyMat, lidMat, trimMat, rivetMat, emblemBg, emblemFg;
    const seamMat = new THREE.MeshBasicMaterial({ color: glowCol.clone() });
    const glowInside = new THREE.MeshBasicMaterial({ map: S.tex.glow, color: glowCol.clone().multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    if (type === 'tra') {
      T.wood = T.wood || woodTex();
      bodyMat = std({ map: T.wood, bumpMap: T.wood, bumpScale: 1.5, roughness: 0.78, metalness: 0, color: 0xffffff });
      lidMat = bodyMat;
      trimMat = std({ color: 0x2c2f35, metalness: 0.85, roughness: 0.42 });
      rivetMat = std({ color: 0x8a8f98, metalness: 1, roughness: 0.3 });
      emblemBg = '#b8863b'; emblemFg = '#3a2208';
    } else if (type === 'stal') {
      T.steel = T.steel || brushedTex('#b4c0cc');
      bodyMat = std({ map: T.steel, color: 0xffffff, metalness: 0.92, roughness: 0.3 });
      lidMat = std({ map: T.steel, color: 0xc9d6e2, metalness: 0.92, roughness: 0.26 });
      trimMat = std({ color: 0x17181c, metalness: 0.1, roughness: 0.75 });
      rivetMat = std({ color: 0xe6ebf2, metalness: 1, roughness: 0.15 });
      emblemBg = '#d7dde4'; emblemFg = '#1b2a3c';
    } else {
      bodyMat = low ? std({ color: 0x15101f, metalness: 0.3, roughness: 0.25 }) : new THREE.MeshPhysicalMaterial({ color: 0x15101f, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
      lidMat = bodyMat;
      trimMat = std({ color: 0xffc94a, metalness: 1, roughness: 0.2 });
      rivetMat = trimMat;
      emblemBg = '#f5c542'; emblemFg = '#3b2300';
    }
    const body = add(g, new RoundedBoxGeometry(W, HB, D, 3, 0.045), bodyMat, 0, HB / 2, 0);
    add(lid, new RoundedBoxGeometry(W + 0.04, HL, D + 0.04, 3, 0.05), lidMat);
    // glödande fog mellan lock och låda + öppning
    const seam = add(g, new THREE.BoxGeometry(W + 0.012, 0.03, D + 0.012), seamMat, 0, HB - 0.012, 0); seam.castShadow = false;
    const inside = add(g, new THREE.PlaneGeometry(W - 0.1, D - 0.1), glowInside, 0, HB + 0.004, 0, -PI / 2); inside.castShadow = false; inside.visible = false;
    // emblem fram
    T['em' + type] = T['em' + type] || emblemTex(emblemBg, emblemFg);
    const emMat = std({ map: T['em' + type], metalness: type === 'stal' ? 0.6 : 0.85, roughness: 0.3, emissive: glowCol.clone(), emissiveMap: T['em' + type], emissiveIntensity: 0 });
    const emR = type === 'guld' ? 0.27 : 0.22;
    const emRim = std({ color: type === 'stal' ? 0x2b2f36 : emblemBg, metalness: 1, roughness: 0.25 });
    add(g, new THREE.CylinderGeometry(emR, emR, 0.04, type === 'guld' ? 6 : 40), [emRim, emMat, emRim], 0, HB * 0.5, D / 2 + 0.02, PI / 2, type === 'guld' ? PI / 2 : 0, 0);
    if (type === 'guld') add(g, new THREE.TorusGeometry(emR + 0.03, 0.022, 8, 6), trimMat, 0, HB * 0.5, D / 2 + 0.03, 0, 0, PI / 2);

    if (type === 'tra') {
      // järnband runt låda och lock, hörnbeslag, nitar, repöglor, hasp
      const bandF = new THREE.BoxGeometry(W + 0.03, 0.09, 0.02), bandS = new THREE.BoxGeometry(0.02, 0.09, D + 0.03);
      for (const y of [0.13, HB - 0.16]) { add(g, bandF, trimMat, 0, y, D / 2 + 0.01); add(g, bandF, trimMat, 0, y, -D / 2 - 0.01); add(g, bandS, trimMat, W / 2 + 0.01, y, 0); add(g, bandS, trimMat, -W / 2 - 0.01, y, 0); }
      const cg = new THREE.BoxGeometry(0.16, HB + 0.02, 0.16);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cg, trimMat, sx * (W / 2 - 0.06), HB / 2, sz * (D / 2 - 0.06));
      const strapT = new THREE.BoxGeometry(0.11, 0.02, D + 0.08), strapF = new THREE.BoxGeometry(0.11, HL + 0.02, 0.02);
      for (const sx of [-0.55, 0.55]) { add(lid, strapT, trimMat, sx, HL / 2 + 0.01, 0); add(lid, strapF, trimMat, sx, 0, (D + 0.04) / 2 + 0.01); }
      add(lid, new THREE.BoxGeometry(0.16, 0.2, 0.03), trimMat, 0, -0.05, (D + 0.04) / 2 + 0.015);
      const pts = [];
      for (const y of [0.13, HB - 0.16]) for (let k = -3; k <= 3; k++) if (Math.abs(k) !== 0) pts.push([k * 0.23, y, D / 2 + 0.025]);
      for (const sx of [-0.55, 0.55]) { pts.push([sx, HB + HL - 0.04, D / 2 + 0.045]); pts.push([sx, HB + 0.06, D / 2 + 0.045]); }
      rivets(g, pts, rivetMat);
      const rope = std({ color: 0xc8a36a, roughness: 0.95 });
      for (const sx of [-1, 1]) add(g, new THREE.TorusGeometry(0.13, 0.025, 8, 18, PI), rope, sx * (W / 2 + 0.03), HB * 0.55, 0, 0, sx * PI / 2, PI);
    } else if (type === 'stal') {
      // pressade ribbor, gummihörn, varningsrand, spännen och handtag
      const rib = new RoundedBoxGeometry(W - 0.3, 0.05, 0.03, 2, 0.012);
      for (const y of [0.18, HB - 0.2]) { add(g, rib, bodyMat, 0, y, D / 2 + 0.012); add(g, rib, bodyMat, 0, y, -D / 2 - 0.012); }
      const cap = new RoundedBoxGeometry(0.2, 0.2, 0.2, 2, 0.05);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(g, cap, trimMat, sx * W / 2, 0.08, sz * D / 2); add(lid, cap, trimMat, sx * (W / 2 + 0.02), 0.03, sz * (D / 2 + 0.02)); }
      T.haz = T.haz || hazardTex();
      add(g, new THREE.PlaneGeometry(W - 0.42, 0.07), std({ map: T.haz, roughness: 0.6 }), 0, 0.08, D / 2 + 0.004);
      const chromeM = std({ color: 0xeef2f6, metalness: 1, roughness: 0.12 });
      for (const sx of [-0.52, 0.52]) { add(g, new RoundedBoxGeometry(0.16, 0.22, 0.05, 2, 0.02), chromeM, sx, HB + 0.02, D / 2 + 0.04); add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.18, 10), trimMat, sx, HB - 0.08, D / 2 + 0.07, 0, 0, PI / 2); }
      add(lid, new THREE.TorusGeometry(0.32, 0.03, 10, 28, PI), chromeM, 0, HL / 2 + 0.02, 0);
      add(lid, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 14), trimMat, 0, HL / 2 + 0.34, 0, 0, 0, PI / 2);
      const pts = [];
      for (const sx of [-1, 1]) for (const y of [0.28, HB - 0.3]) pts.push([sx * (W / 2 - 0.25), y, D / 2 + 0.012]);
      rivets(g, pts, rivetMat, 0.022);
    } else {
      // lyx: guldlister på alla kanter, guldhörn, juvel på locket
      edgeBars(g, W, HB, D, 0.06, trimMat, HB / 2);
      edgeBars(lid, W + 0.04, HL, D + 0.04, 0.055, trimMat, 0);
      const ball = new THREE.SphereGeometry(0.06, 14, 10);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(g, ball, trimMat, sx * W / 2, 0.02, sz * D / 2); add(lid, ball, trimMat, sx * (W / 2 + 0.02), HL / 2, sz * (D / 2 + 0.02)); }
      const jewelMat = std({ color: glowCol.clone(), emissive: glowCol.clone(), emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.05 });
      const jw = add(lid, new THREE.OctahedronGeometry(0.11, 0), jewelMat, 0, HL / 2 + 0.11, 0); jw.scale.set(1, 1.4, 1);
      add(lid, new THREE.CylinderGeometry(0.13, 0.15, 0.04, 6), trimMat, 0, HL / 2 + 0.02, 0);
      // guldornament på sidorna
      const orn = new THREE.TorusGeometry(0.16, 0.018, 8, 32);
      for (const sx of [-1, 1]) add(g, orn, trimMat, sx * (W / 2 + 0.01), HB / 2, 0, 0, PI / 2, 0);
      const pts = []; for (let k = -3; k <= 3; k++) if (k) pts.push([k * 0.2, HB / 2, D / 2 + 0.035]);
      rivets(g, pts.filter(p => Math.abs(p[0]) > 0.35), rivetMat, 0.022);
    }
    g.traverse(o => { if (o.isMesh && o !== inside && o !== seam) { o.castShadow = S.shadows; } });
    return { g, lid, lidPivot, seamMat, emMat, inside, glowInside, body };
  }

  /* ---------------- föremålen ---------------- */
  class Helix extends THREE.Curve {
    constructor(r, h, turns) { super(); this.r = r; this.h = h; this.turns = turns; }
    getPoint(t, out = new THREE.Vector3()) { const a = t * this.turns * TAU; return out.set(Math.cos(a) * this.r, t * this.h - this.h / 2, Math.sin(a) * this.r); }
  }
  function gearGeo(r, teeth, depth, th) {
    const s = new THREE.Shape(), n = teeth * 4;
    for (let i = 0; i <= n; i++) { const a = i / n * TAU, k = i % 4, rr = k === 1 || k === 2 ? r + depth : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.28, 0, TAU, true); s.holes.push(hole);
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, h = new THREE.Path(); h.absarc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.14, 0, TAU, true); s.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8 });
    geo.translate(0, 0, -th / 2); return geo;
  }
  function rimGroup(style, R, accMat) {
    const g = new THREE.Group();
    const ch = std({ color: 0xe9edf3, metalness: 1, roughness: 0.14 });
    add(g, new THREE.CylinderGeometry(R, R, 0.3, 40, 1, true), std({ color: 0xaab1bb, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }), 0, 0, -0.05, PI / 2);
    add(g, new THREE.TorusGeometry(R, 0.03, 10, 48), ch, 0, 0, 0.1);
    add(g, new THREE.CylinderGeometry(R * 0.2, R * 0.24, 0.12, 24), accMat, 0, 0, 0.08, PI / 2);
    const spokes = (n, w, len, off = 0, z = 0.08, twist = 0) => {
      const geo = new THREE.BoxGeometry(w, len, 0.05); geo.translate(0, len / 2 + R * 0.16, 0);
      for (let i = 0; i < n; i++) { const m = add(g, geo, ch, 0, 0, z, 0, twist, i / n * TAU + off); }
    };
    const L = R * 0.8;
    switch (style) {
      case 'mesh': spokes(10, 0.035, L, 0.13); spokes(10, 0.035, L, -0.13, 0.06); break;
      case 'turbin': spokes(12, 0.09, L, 0, 0.08, 0.6); break;
      case 'skal': add(g, new THREE.TorusGeometry(R * 0.93, 0.05, 10, 48), ch, 0, 0, 0.1); spokes(5, 0.1, L * 0.85, 0, -0.04); break;
      case 'stal': { add(g, new THREE.CylinderGeometry(R * 0.88, R * 0.88, 0.04, 40), ch, 0, 0, 0.06, PI / 2); const hm = std({ color: 0x23262c, roughness: 0.5 }); const hg = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; add(g, hg, hm, Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, 0.07, PI / 2); } break; }
      case 'racing': spokes(6, 0.05, L, 0.07); spokes(6, 0.05, L, -0.07); break;
      case 'trad': spokes(24, 0.012, L, 0.05, 0.06); spokes(24, 0.012, L, -0.05, 0.02); break;
      default: spokes(5, 0.12, L);
    }
    return g;
  }
  /** Bygger en 3D-modell av föremålet (≈1 enhet stor, centrerad). */
  function buildItem(it, carColor) {
    const g = new THREE.Group();
    const acc = std({ color: new THREE.Color(it.color), metalness: 0.55, roughness: 0.28 });
    const ch = std({ color: 0xe9edf3, metalness: 1, roughness: 0.14 });
    const dk = std({ color: 0x2a2e36, metalness: 0.75, roughness: 0.38 });
    const rub = std({ color: 0x15161a, roughness: 0.85 });
    const T = S.tex;
    let car = null;
    switch (it.kind === 'perf' ? it.cat : it.kind === 'look' ? 'l_' + it.cat : it.kind) {
      case 'motor': {
        add(g, new RoundedBoxGeometry(1.0, 0.5, 0.62, 3, 0.05), dk, 0, 0, 0);
        for (const s of [-1, 1]) { const h = add(g, new RoundedBoxGeometry(1.0, 0.16, 0.3, 3, 0.05), acc, 0, 0.36, s * 0.2, s * 0.5, 0, 0); h.position.z = s * 0.24; }
        add(g, new RoundedBoxGeometry(0.7, 0.14, 0.24, 3, 0.05), ch, 0, 0.5, 0);
        for (let k = -1.5; k <= 1.5; k++) add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.26, 12), ch, k * 0.2, 0.42, 0, PI / 2);
        add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.06, 28), ch, 0.54, -0.05, 0, 0, 0, PI / 2);
        add(g, new THREE.TorusGeometry(0.16, 0.02, 8, 28), rub, 0.58, -0.05, 0, 0, PI / 2, 0);
        add(g, new RoundedBoxGeometry(0.9, 0.12, 0.5, 2, 0.03), rub, 0, -0.3, 0);
        break;
      }
      case 'turbo': {
        add(g, new THREE.TorusGeometry(0.3, 0.15, 16, 40), std({ color: 0x8a5a3a, metalness: 0.9, roughness: 0.35 }), -0.22, 0, 0, 0, PI / 2, 0);
        add(g, new THREE.TorusGeometry(0.3, 0.15, 16, 40), ch, 0.22, 0, 0, 0, PI / 2, 0);
        add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.3, 28), acc, 0, 0, 0, 0, 0, PI / 2);
        add(g, new THREE.CylinderGeometry(0.17, 0.2, 0.3, 28, 1, true), std({ color: 0xd0d6dd, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }), 0.48, 0, 0, 0, 0, PI / 2);
        const fan = new THREE.Group(); fan.position.x = 0.5; g.add(fan);
        const bl = new THREE.BoxGeometry(0.02, 0.3, 0.05); for (let k = 0; k < 8; k++) add(fan, bl, ch, 0, 0, 0, k / 8 * PI, 0.5, 0);
        add(g, new THREE.CylinderGeometry(0.1, 0.12, 0.42, 20), ch, -0.22, 0.38, 0.2);
        g.userData.spinPart = fan;
        break;
      }
      case 'vaxel': {
        const a = add(g, gearGeo(0.38, 16, 0.06, 0.12), ch, -0.22, 0.08, 0);
        const b = add(g, gearGeo(0.24, 10, 0.06, 0.12), acc, 0.4, -0.12, 0.02);
        add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.5, 16), dk, -0.22, 0.08, 0, PI / 2);
        add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 16), dk, 0.4, -0.12, 0, PI / 2);
        g.userData.gears = [a, b];
        break;
      }
      case 'dack': {
        T.tread = T.tread || treadTex();
        add(g, new THREE.TorusGeometry(0.44, 0.17, 20, 56), std({ color: 0x1b1c20, roughness: 0.88, bumpMap: T.tread, bumpScale: 3 }));
        g.add(rimGroup('fem', 0.3, acc));
        const sc = { asfalt: 0xff3b30, grus: 0xf09a1a, vinter: 0x39a0ff }[it.tire] || 0xffffff;
        const ring = new THREE.RingGeometry(0.5, 0.53, 64), rm = std({ color: sc, roughness: 0.5, side: THREE.DoubleSide });
        add(g, ring, rm, 0, 0, 0.122); add(g, ring, rm, 0, 0, -0.122);
        if (it.tire === 'vinter') { const st = new THREE.SphereGeometry(0.018, 6, 4); for (let k = 0; k < 36; k++) { const an = k / 36 * TAU; add(g, st, ch, Math.cos(an) * 0.61, Math.sin(an) * 0.61, (k % 2 ? 0.06 : -0.06)); } }
        break;
      }
      case 'fjad': {
        add(g, new THREE.TubeGeometry(new Helix(0.2, 0.75, 6), S.low ? 110 : 220, 0.034, 8), acc, 0, 0, 0);
        add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.7, 20), ch, 0, -0.08, 0);
        add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.4, 12), ch, 0, 0.45, 0);
        add(g, new THREE.CylinderGeometry(0.27, 0.27, 0.05, 28), dk, 0, 0.4, 0);
        add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.05, 28), dk, 0, -0.4, 0);
        add(g, new THREE.TorusGeometry(0.07, 0.03, 8, 20), dk, 0, -0.55, 0);
        add(g, new THREE.TorusGeometry(0.07, 0.03, 8, 20), dk, 0, 0.7, 0);
        break;
      }
      case 'broms': {
        T.disc = T.disc || discTex();
        const fm = std({ map: T.disc, metalness: 0.9, roughness: 0.35 });
        add(g, new THREE.CylinderGeometry(0.48, 0.48, 0.06, 56), [std({ color: 0x8d939c, metalness: 0.9, roughness: 0.4 }), fm, fm], 0, 0, 0, PI / 2);
        add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.14, 28), dk, 0, 0, 0.04, PI / 2);
        const cal = add(g, new RoundedBoxGeometry(0.42, 0.18, 0.22, 3, 0.06), acc, 0.27, 0.27, 0, 0, 0, -PI / 4);
        add(cal, new THREE.BoxGeometry(0.2, 0.04, 0.01), ch, 0, 0, 0.112);
        break;
      }
      case 'nitro': {
        const pts = [[0, 0], [0.19, 0], [0.22, 0.03], [0.22, 0.78], [0.19, 0.9], [0.1, 0.99], [0.065, 1.02], [0.065, 1.08], [0, 1.08]].map(p => new THREE.Vector2(p[0], p[1]));
        add(g, new THREE.LatheGeometry(pts, 40), acc, 0, -0.55, 0);
        T.nos = T.nos || labelTex('N₂O', 'NITRO', '#d62a2a');
        add(g, new THREE.CylinderGeometry(0.226, 0.226, 0.34, 40, 1, true), std({ map: T.nos, roughness: 0.35, metalness: 0.1 }), 0, -0.12, 0);
        add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16), ch, 0, 0.58, 0);
        add(g, new THREE.TorusGeometry(0.08, 0.022, 8, 20), std({ color: 0xd62a2a, roughness: 0.4 }), 0, 0.62, 0, PI / 2);
        add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10), ch, 0.12, 0.58, 0, 0, 0, PI / 2);
        break;
      }
      case 'vikt': {
        T.carbon = T.carbon || carbonTex();
        const s = new THREE.Shape(); const w = 0.5, h = 0.34, r = 0.08;
        s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
        for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) { const p = new THREE.Path(); p.absarc(-0.3 + k * 0.3, -0.13 + j * 0.26, 0.085, 0, TAU, true); s.holes.push(p); }
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 }); geo.translate(0, 0, -0.02);
        add(g, geo, std({ map: T.carbon, metalness: 0.4, roughness: 0.25 }));
        const rimM = acc; const ring = new THREE.TorusGeometry(0.087, 0.012, 8, 24);
        for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) add(g, ring, rimM, -0.3 + k * 0.3, -0.13 + j * 0.26, 0.03);
        break;
      }
      case 'l_finish': {
        T.can = T.can || labelTex('LACK', (it.name || '').toUpperCase(), '#' + new THREE.Color(carColor).getHexString());
        const fin = it.id;
        const paint = fin === 'chrome' ? std({ color: 0xeef2f8, metalness: 1, roughness: 0.04 }) : fin === 'matte' ? std({ color: carColor, roughness: 0.95 }) :
          fin === 'pearl' && !S.low ? new THREE.MeshPhysicalMaterial({ color: carColor, roughness: 0.2, metalness: 0.3, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1 }) : std({ color: carColor, metalness: 0.65, roughness: 0.22 });
        add(g, new THREE.CylinderGeometry(0.32, 0.32, 0.6, 40), [std({ map: T.can, roughness: 0.35, metalness: 0.2 }), paint, ch], 0, -0.05, 0);
        add(g, new THREE.TorusGeometry(0.32, 0.022, 8, 40), ch, 0, 0.25, 0, PI / 2);
        add(g, new THREE.TorusGeometry(0.32, 0.022, 8, 40), ch, 0, -0.35, 0, PI / 2);
        add(g, new THREE.TorusGeometry(0.33, 0.012, 6, 30, PI), ch, 0, 0.25, 0, 0, 0, 0);
        const lidM = add(g, new THREE.CylinderGeometry(0.33, 0.33, 0.04, 40), ch, 0.42, -0.1, 0.1, 0, 0, 1.25); lidM.castShadow = true;
        break;
      }
      case 'l_rims': g.add(rimGroup(it.id, 0.45, acc)); break;
      case 'l_spoiler': {
        const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.08, 0.06, 0.3, 0.05, 0.45, 0.0); s.bezierCurveTo(0.3, 0.015, 0.1, 0.0, 0, 0);
        const geo = new THREE.ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 16 });
        geo.translate(-0.22, 0, -0.65); geo.rotateY(PI / 2);
        T.carbon = T.carbon || carbonTex();
        const cm = std({ map: T.carbon, metalness: 0.4, roughness: 0.25 });
        add(g, geo, it.rar >= 3 ? acc : cm, 0, 0.25, 0, 0.12);
        for (const sx of [-0.4, 0.4]) add(g, new THREE.BoxGeometry(0.03, 0.42, 0.14), dk, sx, 0.03, 0.05);
        for (const sx of [-0.66, 0.66]) add(g, new RoundedBoxGeometry(0.02, 0.22, 0.5, 2, 0.008), acc, sx, 0.26, 0);
        add(g, new THREE.BoxGeometry(0.95, 0.03, 0.2), dk, 0, -0.18, 0.05);
        break;
      }
      case 'l_kit': {
        const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.5, 0); s.quadraticCurveTo(0.62, 0.02, 0.6, 0.14); s.lineTo(0.5, 0.36); s.quadraticCurveTo(0.3, 0.42, 0.05, 0.38); s.lineTo(0, 0.2); s.closePath();
        const geo = new THREE.ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
        geo.translate(-0.3, -0.2, -0.65); geo.rotateY(PI / 2);
        const pm = std({ color: carColor, metalness: 0.5, roughness: 0.22 });
        add(g, geo, pm);
        T.carbon = T.carbon || carbonTex();
        add(g, new RoundedBoxGeometry(1.42, 0.03, 0.5, 2, 0.012), std({ map: T.carbon, metalness: 0.4, roughness: 0.25 }), 0, -0.24, 0.12);
        for (const sx of [-0.45, 0, 0.45]) add(g, new RoundedBoxGeometry(0.3, 0.12, 0.03, 2, 0.01), rub, sx, -0.06, 0.35);
        for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.02, 0.1, 0.22), acc, sx * 0.62, 0.08, 0.32, 0.2 * sx, 0, 0);
        break;
      }
      case 'l_decal': {
        T['dec' + it.id] = T['dec' + it.id] || decalTex(it.id, '#' + new THREE.Color(carColor).getHexString());
        add(g, new THREE.CylinderGeometry(1, 1, 0.62, 40, 1, true, -0.6, 1.2), std({ map: T['dec' + it.id], roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide }), 0, 0, -0.85);
        add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.64, 20), std({ color: 0xf3f1ea, roughness: 0.6 }), Math.sin(0.6), 0, Math.cos(0.6) - 0.85);
        break;
      }
      case 'l_neon': {
        const nc = new THREE.Color(parseInt(it.id, 16));
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, -0.25, 0), new THREE.Vector3(-0.25, 0.25, 0.1), new THREE.Vector3(0.15, -0.2, -0.05), new THREE.Vector3(0.6, 0.25, 0)]);
        add(g, new THREE.TubeGeometry(curve, 80, 0.035, 10), new THREE.MeshBasicMaterial({ color: nc.clone().multiplyScalar(S.fancy ? 2.4 : 1.2) }));
        add(g, new THREE.TubeGeometry(curve, 80, 0.065, 12), std({ color: nc, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, emissive: nc, emissiveIntensity: 0.5, depthWrite: false }));
        for (const p of [curve.points[0], curve.points[3]]) add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16), ch, p.x, p.y, p.z, 0, 0, PI / 2);
        const pl = new THREE.PointLight(nc, 4, 3, 2); g.add(pl);
        break;
      }
      case 'l_tint': {
        const tc = { dark: 0x1a1c22, blue: 0x2a5bd7, green: 0x2fa35a, gold: 0xd4a020 }[it.id] || 0x334455;
        const gl = add(g, new RoundedBoxGeometry(1.1, 0.62, 0.03, 2, 0.012), std({ color: tc, transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.04, envMapIntensity: 2 }));
        gl.castShadow = false; gl.rotation.x = -0.12;
        edgeBars(g, 1.1, 0.62, 0.03, 0.04, rub, 0);
        g.children.forEach(c => { if (c !== gl) c.rotation.x = -0.12; });
        break;
      }
      case 'coins': {
        T.coin = T.coin || coinTex();
        const face = std({ map: T.coin, metalness: 1, roughness: 0.28, color: 0xffe08a }), side = std({ color: 0xe8b03a, metalness: 1, roughness: 0.3 });
        const stacks = [[-0.3, 0, 7], [0.05, -0.1, 11], [0.36, 0.12, 5], [-0.05, 0.3, 4]];
        const loose = 7, n = stacks.reduce((a, s) => a + s[2], 0) + loose;
        const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.045, 32), [side, face, face], n);
        let i = 0;
        for (const [x, z, h] of stacks) for (let k = 0; k < h; k++) { _o.position.set(x + rnd(-0.012, 0.012), -0.4 + k * 0.047, z + rnd(-0.012, 0.012)); _o.rotation.set(0, rnd(0, TAU), 0); _o.updateMatrix(); im.setMatrixAt(i++, _o.matrix); }
        for (let k = 0; k < loose; k++) { const a = k / loose * TAU; _o.position.set(Math.cos(a) * 0.62, -0.38, Math.sin(a) * 0.5); _o.rotation.set(rnd(-0.5, 0.5), 0, rnd(-0.4, 0.4)); _o.updateMatrix(); im.setMatrixAt(i++, _o.matrix); }
        im.castShadow = S.shadows; g.add(im);
        const big = add(g, new THREE.CylinderGeometry(0.24, 0.24, 0.06, 40), [side, face, face], 0, 0.45, 0, PI / 2 - 0.25); g.userData.spinPart = big; g.userData.spinAxis = 'z';
        break;
      }
      case 'car': {
        car = buildCar(it.carId, it.look);
        car.root.traverse(o => { if (o.isMesh) { o.castShadow = S.shadows; } });
        const sc = 1.7 / Math.max(3.2, car.shape.L);
        car.root.scale.setScalar(sc); car.root.position.y = -0.3;
        g.add(car.root);
        break;
      }
      default: add(g, new THREE.IcosahedronGeometry(0.4, 1), acc);
    }
    if (!car) { // normalisera storleken
      const box = new THREE.Box3().setFromObject(g), sz = box.getSize(_v), m = Math.max(sz.x, sz.y, sz.z) || 1;
      const s = 1.15 / m; g.scale.setScalar(s);
      box.getCenter(_v); g.position.set(-_v.x * s, -_v.y * s, -_v.z * s);
    }
    const holder = new THREE.Group(); holder.add(g);
    return { holder, inner: g, car };
  }

  /* ---------------- rensning ---------------- */
  function disposeTree(obj) {
    const geos = new Set(), mats = new Set(), texs = new Set();
    obj.traverse(o => {
      if (o.geometry && !o.isSprite) geos.add(o.geometry); // Sprite-geometrin delas av alla sprites
      if (o.material) for (const m of [].concat(o.material)) { mats.add(m); for (const k of ['map', 'bumpMap', 'emissiveMap', 'alphaMap', 'roughnessMap']) if (m[k]) texs.add(m[k]); }
      if (o.isInstancedMesh) o.dispose();
      if (o.isLight && o.dispose) o.dispose();
    });
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); texs.forEach(t => { if (t !== env) t.dispose(); });
  }
  function clearCrate() {
    const cr = S && S.cr; if (!cr) return;
    for (const it of cr.items) { if (it.car) { it.inner.remove(it.car.root); disposeCar(it.car); } }
    S.scene.remove(cr.root); disposeTree(cr.root);
    S.cr = null;
  }

  /* ---------------- sekvens ---------------- */
  function open(data) {
    if (!S) S = makeStage(); else clearCrate();
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const best = data.best, bestCol = new THREE.Color(data.bestColor);
    const crRoot = new THREE.Group(); S.scene.add(crRoot);
    const crate = buildCrate(data.type, bestCol);
    const base = new THREE.Group(); base.position.y = 0.14; base.add(crate.g); crRoot.add(base);
    const items = data.items.map(it => { const b = buildItem(it, data.carColor); b.it = it; b.state = 'hidden'; b.p = 0; b.spin = 0; b.holder.visible = false; crRoot.add(b.holder); return b; });
    const dropT = reduced ? 0.3 : 0.85, chargeT = reduced ? 0.45 : 0.9 + best * 0.12;
    S.cr = {
      data, root: crRoot, base, crate, items, reduced, best, bestCol,
      t: 0, tBurst: dropT + chargeT, dropT, burst: false, cur: -1, phase: 'intro', summary: false,
      y: reduced ? 0 : 6.5, vy: 0, bounces: 0, squash: 0, tilt: 0, tickT: 0,
      lid: { mode: reduced || best < 2 ? 'hinge' : 'fly', a: 0, va: 0, p: new THREE.Vector3(0, HL / 2, D / 2), v: new THREE.Vector3(), w: new THREE.Vector3(), landed: false },
      camA: 0, camKick: 0
    };
    S.accentT.set(data.bestColor).lerp(_c.set(0x9fb4c8), 0.65); S.accent.copy(S.accentT);
    S.slow = 0; S.shake = 0;
    S.sparks.clear(); S.dust.clear();
    for (let i = 0; i < S.confS.length; i++) { S.confS[i].on = false; _o.position.set(0, -10, 0); _o.scale.setScalar(0); _o.updateMatrix(); S.conf.setMatrixAt(i, _o.matrix); }
    _o.scale.setScalar(1); S.conf.instanceMatrix.needsUpdate = true;
    for (const b of S.beamList) b.scale.setScalar(0.001);
    S.title.textContent = data.name; S.title.style.setProperty('--c', data.color);
    S.hint.classList.remove('hidden');
    S.card.classList.add('hidden'); S.card.innerHTML = '';
    S.ov.onpointerdown = (e) => { if (e.target.closest('button, a, input')) return; e.preventDefault(); advance(); };
    removeEventListener('keydown', onKey); addEventListener('keydown', onKey);
    if (!reduced) audio.play('whoosh', { vol: 0.7, pitch: 0.7 });
  }
  function onKey(e) {
    if (!S) return;
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault(); e.stopPropagation();
      const p = S.card.querySelector('button.primary'); if (p && !S.card.classList.contains('hidden')) p.click(); else advance();
    } else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); const cr = S.cr; if (cr && cr.summary) close(); else if (cr) { skipToSummary(); } }
  }
  /** Klick: skynda på till nästa steg. */
  function advance() {
    const cr = S && S.cr; if (!cr) return;
    if (!cr.burst) { cr.t = cr.tBurst; cr.y = 0; cr.vy = 0; cr.bounces = 9; return; }
    const it = cr.items[cr.cur];
    if (it && it.state === 'rising') { it.p = 1; return; }
    if (cr.cur < 0) { reveal(0); return; }
  }
  function skipToSummary() {
    const cr = S.cr; if (!cr) return;
    if (!cr.burst) { cr.t = cr.tBurst; cr.y = 0; cr.vy = 0; cr.bounces = 9; }
    S.pendingSummary = true;
  }

  function doBurst(cr) {
    cr.burst = true;
    const rar = cr.best, low = S.low, red = cr.reduced;
    const col = cr.bestCol;
    S.accentT.copy(col);
    crateOpenLid(cr);
    cr.crate.inside.visible = true;
    // gnistor
    const n = Math.round([50, 80, 130, 200, 280][rar] * (low ? 0.45 : 1) * (red ? 0.4 : 1));
    for (let k = 0; k < n; k++) {
      const a = rnd(0, TAU), up = rnd(0.35, 1), sp = rnd(2.5, 8 + rar);
      const w = Math.random() < 0.3 ? 1 : 0;
      S.sparks.spawn(rnd(-0.6, 0.6), 1.0 + 0.14, rnd(-0.4, 0.4), Math.cos(a) * sp * (1 - up * 0.6), sp * up * 1.2, Math.sin(a) * sp * (1 - up * 0.6), rnd(0.6, 1.5), rnd(0.08, 0.16), 0.01,
        lerp(col.r, 1, w), lerp(col.g, 1, w), lerp(col.b, 1, w), 1, 1.4, 7);
    }
    // konfetti (Sällsynt och uppåt)
    if (rar >= 2 && !red) {
      const cn = Math.min(S.confS.length, Math.round(S.confS.length * [0, 0, 0.35, 0.7, 1][rar]));
      const pal = [col, _c.clone().set(0xffffff), new THREE.Color(0xffcc33), col.clone().lerp(new THREE.Color(0xffffff), 0.5)];
      for (let i = 0; i < cn; i++) {
        const c = S.confS[i]; c.on = true; c.rest = false;
        c.p.set(rnd(-0.5, 0.5), 1.2, rnd(-0.4, 0.4));
        const a = rnd(0, TAU), sp = rnd(1.5, 5);
        c.v.set(Math.cos(a) * sp, rnd(5, 9.5), Math.sin(a) * sp * 0.7);
        c.r.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)); c.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
        S.conf.setColorAt(i, pal[i % pal.length]);
      }
      S.conf.instanceColor.needsUpdate = true;
    }
    // ljud, kamera, slow motion
    audio.play('whoosh', { vol: 1 });
    if (rar >= 3) { audio.play('boom', { vol: rar >= 4 ? 1 : 0.7 }); }
    else audio.play('explode', { vol: 0.35 + rar * 0.15 });
    setTimeout(() => audio.play(rar >= 4 ? 'win' : rar >= 3 ? 'levelup' : 'power'), 120);
    if (!red) {
      S.shake = [0.05, 0.07, 0.1, 0.22, 0.32][rar];
      if (rar >= 3) { S.slow = rar >= 4 ? 0.85 : 0.6; cr.camKick = 1; }
    }
    S.flareP = 1;
  }
  function crateOpenLid(cr) {
    const L = cr.lid;
    if (L.mode === 'hinge') { L.va = cr.reduced ? -3 : -9; }
    else { L.v.set(rnd(-1.2, 1.2), 7 + cr.best * 0.8, -3.2); L.w.set(-7 - cr.best, rnd(-2, 2), rnd(-3, 3)); }
  }

  function reveal(i) {
    const cr = S.cr; if (!cr) return;
    if (cr.cur >= 0 && cr.items[cr.cur]) cr.items[cr.cur].state = 'parked';
    cr.cur = i;
    const b = cr.items[i]; if (!b) return showSummary();
    b.state = 'rising'; b.p = 0; b.holder.visible = true; b.spin = cr.reduced ? 1 : 9;
    b.holder.position.set(0, 0.9, 0); b.holder.scale.setScalar(0.01);
    S.accentT.set(b.it.color);
    b.cardShown = false;
    S.hint.classList.add('hidden');
    const r = b.it.rar;
    audio.play(b.it.kind === 'coins' ? 'coin' : r >= 3 ? 'levelup' : 'pickup', { vol: 0.8 });
    if (b.it.kind === 'coins') { for (let k = 1; k < 5; k++) setTimeout(() => S && audio.play('coin', { vol: 0.5, pitch: 1 + k * 0.08, gap: 0 }), k * 90); }
    // liten gnistkaskad i föremålets färg
    const c = _c.set(b.it.color), n = S.low ? 20 : 45;
    for (let k = 0; k < n; k++) { const a = rnd(0, TAU), sp = rnd(1, 3.5); S.sparks.spawn(0, 1.1, 0, Math.cos(a) * sp, rnd(2, 6), Math.sin(a) * sp, rnd(0.5, 1.1), rnd(0.06, 0.12), 0.01, c.r, c.g, c.b, 1, 1.5, 4); }
  }
  function cardFor(b) {
    const it = b.it, cr = S.cr, n = cr.items.length;
    const last = cr.cur >= n - 1;
    let h = `<div class="fj-c3tag" style="--r:${it.color}">${esc(it.rarName)}${it.sub ? ` · ${esc(it.sub)}` : ''}${it.isNew ? ' <b class="new">NY!</b>' : ''}</div>`;
    h += `<h3 style="--r:${it.color}">${esc(it.name)}</h3>`;
    if (it.statHtml) h += `<div class="fj-c3stats">${it.statHtml}</div>`;
    if (it.dupText) h += `<p class="fj-c3dup">${esc(it.dupText)}</p>`;
    h += `<div class="fj-c3btns">`;
    if (it.canMount) { const m = it.isMounted && it.isMounted(); h += `<button class="btn" data-a="mount" ${m ? 'disabled' : ''}>${m ? 'Monterad ✓' : esc(it.mountLabel || 'Montera nu')}</button>`; }
    h += `<button class="btn primary" data-a="next">${last ? 'Fortsätt' : 'Nästa ▶'}</button>`;
    if (!last) h += `<button class="btn ghost" data-a="all">Visa alla</button>`;
    h += `</div><small class="fj-c3count">${cr.cur + 1} / ${n}</small>`;
    S.card.style.setProperty('--r', it.color);
    S.card.innerHTML = h; S.card.classList.remove('hidden', 'sum'); S.card.classList.remove('pop'); void S.card.offsetWidth; S.card.classList.add('pop');
    S.card.onclick = (e) => {
      const btn = e.target.closest('button[data-a]'); if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'mount') { const msg = it.mount && it.mount(); audio.play('place'); audio.play('power', { vol: 0.6 }); btn.textContent = 'Monterad ✓'; btn.disabled = true; if (msg && it.statHtmlAfter) { const s = S.card.querySelector('.fj-c3stats'); if (s) s.innerHTML = it.statHtmlAfter(); } }
      else if (a === 'next') { audio.play('click'); if (last) showSummary(); else reveal(cr.cur + 1); }
      else if (a === 'all') { audio.play('click'); showSummary(); }
    };
    const p = S.card.querySelector('button.primary'); if (p) p.focus({ preventScroll: true });
  }
  function showSummary() {
    const cr = S.cr; if (!cr) return;
    S.pendingSummary = false;
    cr.summary = true; cr.cur = cr.items.length;
    cr.items.forEach(b => { if (b.state === 'hidden') { b.holder.visible = true; b.holder.position.set(0, 0.9, 0); b.holder.scale.setScalar(0.01); } b.state = 'parked'; });
    S.accentT.copy(cr.bestCol);
    S.hint.classList.add('hidden');
    const d = cr.data;
    let h = `<div class="fj-c3tag" style="--r:${d.bestColor}">${esc(d.name)} öppnad</div><div class="fj-c3sum">`;
    for (const b of cr.items) { const it = b.it; h += `<div class="fj-c3mini" style="--r:${it.color}"><b>${esc(it.name)}</b><small>${esc(it.rarName)}${it.isNew ? ' · <em>NY!</em>' : it.dupText ? ' · dubblett' : ''}</small></div>`; }
    h += `</div>`;
    if (d.krText) h += `<p class="fj-c3kr">${esc(d.krText)}</p>`;
    const nx = d.nextLabel && d.nextLabel();
    h += `<div class="fj-c3btns">${nx ? `<button class="btn" data-a="again">${esc(nx)}</button>` : ''}<button class="btn primary" data-a="close">Fortsätt</button></div>`;
    S.card.style.setProperty('--r', d.bestColor);
    S.card.innerHTML = h; S.card.classList.remove('hidden'); S.card.classList.add('sum');
    S.card.onclick = (e) => {
      const btn = e.target.closest('button[data-a]'); if (!btn) return;
      if (btn.dataset.a === 'close') { audio.play('click'); close(); }
      else if (btn.dataset.a === 'again') { const nd = d.next && d.next(); if (nd) { audio.play('select'); open(nd); } else close(); }
    };
    const p = S.card.querySelector('button.primary'); if (p) p.focus({ preventScroll: true });
  }

  function close() {
    if (!S) return;
    const cb = S.cr && S.cr.data.onClose;
    clearCrate();
    removeEventListener('keydown', onKey);
    S.ov.remove();
    S.sparks.clear(); S.dust.clear();
    if (S.composer) { S.composer.dispose(); if (S.bloom) S.bloom.dispose(); }
    disposeTree(S.scene);
    S.scene.environment = null;
    S = null;
    if (cb) cb();
  }

  /* ---------------- per bildruta ---------------- */
  function update(dtReal) {
    const cr = S.cr; if (!cr) return;
    S.time += dtReal;
    let dt = dtReal;
    if (S.slow > 0) { S.slow -= dtReal; dt *= 0.3; }
    cr.t += dt;
    const red = cr.reduced;
    if (S.pendingSummary && cr.burst && cr.t > cr.tBurst + 0.25) showSummary();

    // 1) fall och studs
    const crate = cr.crate;
    if (!cr.burst || cr.y > 0 || red) {
      if (red) { cr.y = 0; const s = easeOutCubic(cr.t / cr.dropT); cr.base.scale.setScalar(0.85 + 0.15 * s); }
      else if (cr.bounces < 9) {
        cr.vy -= 30 * dt; cr.y += cr.vy * dt;
        if (cr.y <= 0) {
          const imp = -cr.vy; cr.y = 0;
          if (imp > 1.5) {
            cr.squash = Math.min(0.22, imp * 0.017); cr.tilt = rnd(-1, 1) * imp * 0.006;
            if (cr.bounces === 0) { audio.play('land', { vol: 1.4 }); audio.play('place', { vol: 1 }); S.shake = Math.max(S.shake, 0.06);
              for (let k = 0; k < (S.low ? 14 : 36); k++) { const a = rnd(0, TAU), sp = rnd(0.8, 2.4); S.dust.spawn(Math.cos(a) * 0.9, 0.2, Math.sin(a) * 0.7, Math.cos(a) * sp, rnd(0.2, 0.9), Math.sin(a) * sp, rnd(0.6, 1.1), 0.25, 0.7, 0.55, 0.58, 0.66, 0.5, 2.5, -0.3); }
            } else audio.play('land', { vol: 0.6 });
            cr.vy = imp * 0.33; cr.bounces++;
          } else { cr.vy = 0; cr.bounces = 9; }
        }
      }
    }
    cr.squash = lerp(cr.squash, 0, 1 - Math.exp(-12 * dt)); cr.tilt = lerp(cr.tilt, 0, 1 - Math.exp(-6 * dt));
    // 2) laddning: skakning + glöd
    const ch = clamp((cr.t - cr.dropT) / (cr.tBurst - cr.dropT), 0, 1);
    let sx = 0, sz = 0, rz = cr.tilt, ry = 0;
    if (!cr.burst && cr.t > cr.dropT) {
      if (!cr.chargeStarted && ch < 0.8) { cr.chargeStarted = true; audio.tone({ freq: 140, to: 140 * (3 + cr.best), dur: cr.tBurst - cr.dropT, type: 'sawtooth', vol: 0.03 }); audio.tone({ freq: 70, to: 70 * (3 + cr.best), dur: cr.tBurst - cr.dropT, type: 'sine', vol: 0.06 }); }
      if (!red) {
        const amp = ch * ch * (0.035 + cr.best * 0.008);
        sx = Math.sin(cr.t * 61) * amp; sz = Math.cos(cr.t * 47) * amp * 0.6; rz += Math.sin(cr.t * 53) * amp * 1.2; ry = Math.sin(cr.t * 37) * amp;
        cr.tickT -= dt; if (cr.tickT <= 0) { cr.tickT = lerp(0.2, 0.06, ch); audio.play('click', { vol: 0.5, pitch: 0.7 + ch * 1.3, gap: 0 }); }
      }
    }
    if (cr.t >= cr.tBurst && !cr.burst) doBurst(cr);
    cr.base.position.set(sx, 0.14 + Math.max(0, cr.y), sz);
    cr.base.rotation.set(0, ry, rz);
    if (!red) cr.base.scale.set(1 + cr.squash * 0.5, 1 - cr.squash, 1 + cr.squash * 0.5);
    const glow = cr.burst ? 1 : ch;
    crate.seamMat.color.copy(cr.bestCol).multiplyScalar(0.2 + glow * (S.fancy ? 2.6 : 1.4));
    crate.emMat.emissiveIntensity = glow * (cr.burst ? 0.5 : 0.9);
    // 3) locket
    const L = cr.lid;
    if (cr.burst) {
      if (L.mode === 'hinge') {
        L.va += ((-2.05 - L.a) * 70 - L.va * 7) * dt; L.a += L.va * dt;
        if (L.a < -2.4) { L.a = -2.4; L.va *= -0.3; }
        crate.lidPivot.rotation.x = L.a;
      } else if (!L.done) {
        L.v.y -= 22 * dt; L.p.addScaledVector(L.v, dt);
        const r = crate.lid.rotation; r.x += L.w.x * dt; r.y += L.w.y * dt; r.z += L.w.z * dt;
        const fl = -HB + HL / 2 + 0.02;
        if (L.p.y < fl) {
          L.p.y = fl; L.v.y = -L.v.y * 0.28; L.v.x *= 0.5; L.v.z *= 0.5; L.w.multiplyScalar(0.35);
          if (!L.landed) { L.landed = true; audio.play('land', { vol: 0.8 }); }
          if (Math.abs(L.v.y) < 0.6) { L.v.set(0, 0, 0); L.w.set(0, 0, 0); L.done = true; }
        }
        if (L.landed) { r.x = lerp(r.x, Math.round(r.x / PI) * PI, 1 - Math.exp(-10 * dt)); r.z = lerp(r.z, Math.round(r.z / PI) * PI, 1 - Math.exp(-10 * dt)); }
        crate.lid.position.copy(L.p);
      }
    }
    // 4) föremål
    if (cr.burst && cr.cur < 0 && cr.t > cr.tBurst + (red ? 0.15 : 0.35) && !cr.summary) reveal(0);
    const n = cr.items.length, wide = size.w / size.h > 1.05, isz = size.w / size.h < 0.8 ? 1.45 : 1;
    cr.items.forEach((b, i) => {
      if (b.state === 'hidden') return;
      if (b.state === 'rising') {
        b.p = Math.min(1, b.p + dt / (red ? 0.4 : 0.75));
        const e = easeOutBack(b.p);
        b.holder.position.set(0, lerp(0.9, 2.35, e), 0);
        b.holder.scale.setScalar(Math.max(0.01, easeOutCubic(b.p * 1.4) * isz));
        if (b.p > 0.55 && !b.cardShown) { b.cardShown = true; cardFor(b); }
        if (b.p >= 1) b.state = 'show';
      } else if (b.state === 'show') {
        b.holder.position.y = 2.35 + Math.sin(S.time * 2) * (red ? 0.02 : 0.06);
        b.holder.scale.setScalar(lerp(b.holder.scale.x, isz, 1 - Math.exp(-8 * dtReal)));
      } else if (b.state === 'parked') {
        // rad ovanför lådan (två rader på smal skärm)
        let px, py, s;
        if (cr.summary) {
          const perRow = wide ? n : Math.ceil(n / 2), row = Math.floor(i / perRow), col = i % perRow, cnt = Math.min(perRow, n - row * perRow);
          const gap = wide ? 1.25 : 1.05;
          px = (col - (cnt - 1) / 2) * gap; py = (wide ? 2.2 : 2.75 - row * 1.05); s = wide ? 0.78 : 0.68;
        } else {
          // tidigare föremål åt sidan, små
          const k = i, side = k % 2 ? 1 : -1, slot = Math.floor(k / 2);
          px = side * (1.85 + slot * 0.75); py = 1.65 + slot * 0.2; s = 0.45;
        }
        const kk = 1 - Math.exp(-7 * dtReal);
        b.holder.position.x = lerp(b.holder.position.x, px, kk); b.holder.position.y = lerp(b.holder.position.y, py + Math.sin(S.time * 1.6 + i) * 0.03, kk); b.holder.position.z = lerp(b.holder.position.z, cr.summary ? 0.2 : -0.3, kk);
        b.holder.scale.setScalar(lerp(b.holder.scale.x, s, kk));
      }
      const target = red ? 0.35 : b.state === 'parked' ? 0.5 : 0.9;
      b.spin = lerp(b.spin, target, 1 - Math.exp(-2.2 * dtReal));
      b.holder.rotation.y += b.spin * dt;
      b.holder.rotation.x = b.state === 'parked' ? 0.1 : 0.18 + Math.sin(S.time * 0.9) * 0.06;
      const ud = b.inner.userData;
      if (ud.spinPart) { if (ud.spinAxis === 'z') ud.spinPart.rotation.z += dt * 2; else ud.spinPart.rotation.x += dt * 14; }
      if (ud.gears) { ud.gears[0].rotation.z += dt * 1.2; ud.gears[1].rotation.z -= dt * 1.2 * 16 / 10; }
    });

    // 5) effekter
    S.accent.lerp(S.accentT, 1 - Math.exp(-4 * dtReal));
    const burstAge = cr.burst ? (cr.t - cr.tBurst) : -1;
    const showing = cr.cur >= 0;
    const beamI = cr.burst ? clamp(burstAge * 3, 0, 1) * ([0.45, 0.55, 0.75, 0.95, 1.15][cr.best]) * (cr.summary ? 0.6 : 1) : 0;
    S.beams.rotation.y += dt * (0.25 + (cr.burst ? 0.1 : 0));
    S.beams.position.y = 0.14 + HB + Math.max(0, cr.y);
    for (const bm of S.beamList) {
      const u = bm.userData, grow = cr.burst ? easeOutCubic(burstAge * 1.6) : 0;
      const pul = 1 + Math.sin(S.time * 2 + u.ph) * 0.12;
      bm.scale.set(u.w * pul * Math.max(0.001, grow), u.h * Math.max(0.001, grow), u.w * pul * Math.max(0.001, grow));
      bm.material.uniforms.uAlpha.value = beamI * (S.low ? 0.6 : 0.5) * (cr.reduced ? 0.6 : 1) * (showing && !cr.summary ? 0.55 : 1);
      bm.material.uniforms.uTime.value = S.time;
    }
    S.flareP = Math.max(0, (S.flareP || 0) - dtReal * 1.6);
    const fl = cr.burst ? (showing ? 0.12 : 0.3) + S.flareP * 1.2 : ch * 0.5;
    S.flare.material.opacity = Math.min(1, fl);
    S.flare.scale.setScalar(1.4 + fl * (1.4 + cr.best * 0.45));
    S.flare.position.y = 0.14 + HB + 0.1 + Math.max(0, cr.y);
    S.core.intensity = (cr.burst ? (showing ? 1.5 : 4) + S.flareP * 14 : ch * ch * 6) * (1 + cr.best * 0.2);
    S.core.position.y = 0.14 + HB + 0.15;
    S.floorGlowMat.opacity = 0.18 + (cr.burst ? 0.35 : ch * 0.3);
    S.pedRingMat.color.copy(S.accent).multiplyScalar(S.fancy ? 1.6 : 1);
    S.bgMat.uniforms.uGlow.value = 0.5 + (cr.burst ? 0.5 + S.flareP * 0.8 : ch * 0.4);
    if (cr.crate.inside.visible) cr.crate.glowInside.opacity = 0.7 + Math.sin(S.time * 5) * 0.1;
    // glöd-glitter under visningen
    if (cr.burst && !S.low && !red && Math.random() < 0.5) { const c = S.accent; S.sparks.spawn(rnd(-0.6, 0.6), 0.14 + HB, rnd(-0.4, 0.4), rnd(-0.2, 0.2), rnd(0.8, 2), rnd(-0.2, 0.2), rnd(1, 2), 0.06, 0.01, c.r, c.g, c.b, 0.9, 0.6, -0.5); }
    S.sparks.update(dt); S.dust.update(dt);
    S.sparks.setScale(size.h); S.dust.setScale(size.h);
    // konfetti
    let any = false;
    for (let i = 0; i < S.confS.length; i++) {
      const c = S.confS[i]; if (!c.on) continue; any = true;
      if (!c.rest) {
        c.v.y -= 6 * dt; const d = Math.exp(-1.8 * dt); c.v.x *= d; c.v.z *= d; c.v.y = Math.max(c.v.y * Math.exp(-0.6 * dt), -2.2);
        c.p.addScaledVector(c.v, dt); c.p.x += Math.sin(S.time * 5 + c.ph) * 0.4 * dt;
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
        const fy = Math.hypot(c.p.x, c.p.z) < 1.8 ? 0.15 : 0.01;
        if (c.p.y < fy) { c.p.y = fy; c.rest = true; c.r.set(-PI / 2, 0, rnd(0, TAU)); }
      }
      _o.position.copy(c.p); _o.rotation.copy(c.r); _o.scale.setScalar(1); _o.updateMatrix(); S.conf.setMatrixAt(i, _o.matrix);
    }
    if (any) S.conf.instanceMatrix.needsUpdate = true;

    // 6) kamera
    const aspect = size.w / size.h;
    const portrait = aspect < 1;
    let d = (cr.summary ? 9.4 : cr.cur >= 0 ? 8.2 : 7.0) * Math.max(1, (portrait ? 1.05 : 1.35) / aspect);
    cr.camKick = Math.max(0, cr.camKick - dtReal * 0.9);
    d -= Math.sin(cr.camKick * PI) * 1.6;
    cr.camA += dtReal * (red ? 0.03 : 0.08);
    const a = Math.sin(cr.camA) * 0.22 + 0.12;
    const camY = cr.cur >= 0 ? 2.6 : 2.2;
    S.cam.position.set(Math.sin(a) * d, camY + (portrait ? 0.6 : 0), Math.cos(a) * d);
    const ty = cr.summary ? (portrait ? 1.35 : 1.05) : cr.cur >= 0 ? (portrait ? 1.15 : 1.3) : 0.75;
    S.camTY = S.camTY === undefined ? ty : lerp(S.camTY, ty, 1 - Math.exp(-3 * dtReal));
    S.cam.lookAt(0, S.camTY, 0);
    if (S.shake > 0.001) { S.shake *= Math.exp(-5 * dtReal); S.cam.position.x += rnd(-1, 1) * S.shake; S.cam.position.y += rnd(-1, 1) * S.shake; }
    S.cam.aspect = aspect; S.cam.updateProjectionMatrix();
  }

  function render(dt) {
    if (!S) return;
    update(dt);
    renderer.toneMappingExposure = 1.0;
    if (S.composer) S.composer.render(); else renderer.render(S.scene, S.cam);
  }
  function resize(w, h) { if (S && S.composer) { S.composer.setPixelRatio(renderer.getPixelRatio()); S.composer.setSize(w, h); } }

  return { get active() { return !!S; }, open, render, resize, close, advance, showSummary: () => S && showSummary(), get state() { return S; } };
}
