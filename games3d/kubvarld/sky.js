/** Himmel: gradientkupol, sol, måne, stjärnor, moln och dygnsljus. */
import * as THREE from 'three';
import { makeNoise } from './noise.js';

const C = h => new THREE.Color(h);
const DAY_TOP = C('#4f8fe6'), DAY_HOR = C('#b9d9f6'), SET_TOP = C('#34508f'), SET_HOR = C('#f2a06a'), NIGHT_TOP = C('#04060d'), NIGHT_HOR = C('#101831');
const SL_DAY = new THREE.Color(1, 1, 0.97), SL_SET = new THREE.Color(1, 0.78, 0.6), SL_NIGHT = new THREE.Color(0.075, 0.09, 0.17);

export class Sky {
  constructor(scene, seed = 1) {
    this.group = new THREE.Group();
    this.group.renderOrder = -10;
    scene.add(this.group);
    this.uniforms = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: new THREE.Color('#ffb070') }, uGlowAmt: { value: 0 } };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop, uHor, uGlow, uSun; uniform float uGlowAmt; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = d.y;
          vec3 col = h > 0.0 ? mix(uHor, uTop, pow(h, 0.55)) : uHor;
          float g = max(dot(d, normalize(uSun)), 0.0);
          col += uGlow * (pow(g, 6.0) * 0.55 + pow(g, 64.0) * 0.6) * uGlowAmt * clamp(1.0 - abs(h) * 1.8, 0.0, 1.0);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`
    }));
    dome.renderOrder = -10; dome.frustumCulled = false;
    this.group.add(dome);
    // sol & måne: runda, mjukt glödande skivor
    const glowTex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const sunTex = glowTex(x => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,252,235,1)'); g.addColorStop(0.2, 'rgba(255,244,200,1)'); g.addColorStop(0.24, 'rgba(255,214,120,.75)');
      g.addColorStop(0.45, 'rgba(255,190,110,.22)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
    const moonTex = glowTex(x => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(200,215,255,.35)'); g.addColorStop(0.3, 'rgba(160,185,255,.12)'); g.addColorStop(1, 'rgba(140,170,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#e8eefc'; x.beginPath(); x.arc(64, 64, 17, 0, 7); x.fill();
      x.fillStyle = 'rgba(150,165,200,.55)'; [[58, 58, 4], [70, 66, 3], [61, 71, 2.5], [69, 55, 2]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,.82)'; x.beginPath(); x.arc(74, 58, 15, 0, 7); x.fill();
    });
    const mk = (tex, size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending })); m.renderOrder = -9; m.frustumCulled = false; this.group.add(m); return m; };
    this.sun = mk(sunTex, 150); this.moon = mk(moonTex, 110);
    // stjärnor
    const N = 900, pos = new Float32Array(N * 3); const r = makeNoise(seed);
    let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u); pos.set([Math.cos(a) * q * 450, Math.abs(u) * 450 + 20, Math.sin(a) * q * 450], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -9; this.stars.frustumCulled = false; this.group.add(this.stars);
    // norrsken: böljande draperier som syns klara nätter
    this.aurora = { uTime: { value: 0 }, uAmt: { value: 0 } };
    const auroraMat = new THREE.ShaderMaterial({
      uniforms: this.aurora, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `uniform float uTime; varying vec2 vUv; void main() { vUv = uv; vec3 p = position;
        p.z += sin(p.x * 0.012 + uTime * 0.13) * 40.0 + sin(p.x * 0.031 - uTime * 0.21) * 14.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uAmt; varying vec2 vUv; void main() {
        float curtain = 0.55 + 0.45 * sin(vUv.x * 46.0 + uTime * 0.7 + sin(vUv.x * 9.0 + uTime * 0.23) * 3.0);
        curtain *= 0.6 + 0.4 * sin(vUv.x * 13.0 - uTime * 0.31);
        float a = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.6) * curtain;
        a *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        vec3 col = mix(vec3(0.25, 1.0, 0.62), vec3(0.62, 0.42, 1.0), smoothstep(0.35, 1.0, vUv.y));
        gl_FragColor = vec4(col * a * uAmt, a * uAmt);
        #include <colorspace_fragment>
      }`
    });
    this.auroraMeshes = [];
    for (const [ang, h, len] of [[0.3, 230, 720], [1.9, 260, 560], [3.6, 210, 640]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 130, 96, 1), auroraMat);
      m.position.set(Math.cos(ang) * 260, h, Math.sin(ang) * 260);
      m.rotation.y = -ang + Math.PI / 2; m.rotation.x = -0.35;
      m.renderOrder = -9; m.frustumCulled = false; m.visible = false;
      this.group.add(m); this.auroraMeshes.push(m);
    }
    // moln: mjuka, målade stråk (inte blockiga) – ljus ovansida, blågrå undersida
    const CN = 128;
    const cc = document.createElement('canvas'); cc.width = cc.height = CN; const cx = cc.getContext('2d');
    const img = cx.createImageData(CN, CN);
    const tor = (x, y, f, o) => { const ax = x / CN * Math.PI * 2, ay = y / CN * Math.PI * 2; return r.n3(Math.cos(ax) * f + o, Math.sin(ax) * f, Math.cos(ay) * f * 0.6 + Math.sin(ay) * f * 0.35 + o); };
    for (let y = 0; y < CN; y++) for (let x = 0; x < CN; x++) {
      const v = tor(x, y, 2.2, 0) * 0.62 + tor(x, y, 5, 9) * 0.28 + tor(x, y, 11, 3) * 0.1;
      const lit = tor(x + 3, y + 5, 2.2, 0) * 0.62 + tor(x + 3, y + 5, 5, 9) * 0.28; // förskjutet prov = "ljus från solen"
      const o = (y * CN + x) * 4;
      const a = Math.max(0, Math.min(1, (v - 0.12) / 0.26));
      const sh = Math.max(0, Math.min(1, (v - lit) * 5 + 0.5));
      img.data[o] = 255 - sh * 38; img.data[o + 1] = 255 - sh * 32; img.data[o + 2] = 255 - sh * 18; img.data[o + 3] = Math.round(a * a * (3 - 2 * a) * 235);
    }
    cx.putImageData(img, 0, 0);
    const ct = new THREE.CanvasTexture(cc); ct.magFilter = THREE.LinearFilter; ct.minFilter = THREE.LinearMipmapLinearFilter; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.colorSpace = THREE.SRGBColorSpace;
    this.cloudSize = CN * 11;
    ct.repeat.set(3, 3);
    this.cloudTex = ct;
    this.cloudMat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, color: 0xffffff, opacity: 0.85 });
    // tona ut molnen mot horisonten så att planets kant aldrig syns
    this.cloudFade = { value: new THREE.Vector2(260, 540) };
    this.cloudMat.onBeforeCompile = sh => {
      sh.uniforms.uFade = this.cloudFade;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying float vCloudD;\nvoid main() {').replace('#include <project_vertex>', '#include <project_vertex>\n  vCloudD = length(mvPosition.xyz);');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec2 uFade; varying float vCloudD;\nvoid main() {').replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a *= 1.0 - smoothstep(uFade.x, uFade.y, vCloudD);');
    };
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(this.cloudSize * 3, this.cloudSize * 3), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2; this.clouds.renderOrder = -8; this.clouds.frustumCulled = false;
    scene.add(this.clouds);
    this.cloudOff = 0;
    this.skyLight = new THREE.Color(); this.fog = new THREE.Color(); this.daylight = 1;
    this.sunDir = new THREE.Vector3();
    this._t = new THREE.Color(); this._h = new THREE.Color();
  }

  /** tod: 0 soluppgång, .25 middag, .5 solnedgång, .75 midnatt */
  update(tod, cam, dt, viewDist, nightIdx = 0) {
    const a = tod * Math.PI * 2;
    const sd = this.sunDir.set(Math.cos(a), Math.sin(a), 0.22).normalize();
    const h = sd.y;
    const day = smooth(-0.12, 0.22, h);
    const set = Math.max(0, 1 - Math.abs(h) / 0.32) * smooth(-0.3, 0.0, h);
    this._t.copy(NIGHT_TOP).lerp(DAY_TOP, day).lerp(SET_TOP, set * 0.6);
    this._h.copy(NIGHT_HOR).lerp(DAY_HOR, day).lerp(SET_HOR, set * 0.75);
    this.uniforms.uTop.value.copy(this._t); this.uniforms.uHor.value.copy(this._h);
    this.uniforms.uSun.value.copy(sd); this.uniforms.uGlowAmt.value = set + day * 0.25;
    this.skyLight.copy(SL_NIGHT).lerp(SL_DAY, day).lerp(SL_SET, set * 0.5 * day);
    this.fog.copy(this._h);
    this.daylight = day;
    this.group.position.copy(cam.position);
    this.sun.position.copy(sd).multiplyScalar(400); this.sun.lookAt(0, 0, 0);
    this.moon.position.copy(sd).multiplyScalar(-400); this.moon.lookAt(0, 0, 0);
    this.starMat.opacity = Math.max(0, 1 - day * 1.6) * 0.95;
    // norrskenets styrka varierar från natt till natt
    const nh = Math.sin(nightIdx * 12.9898 + 4.1) * 43758.5453, strength = 0.35 + 0.65 * (nh - Math.floor(nh));
    const aAmt = Math.max(0, 1 - day * 2.2) * strength;
    this.aurora.uAmt.value = aAmt; this.aurora.uTime.value += dt;
    for (const m of this.auroraMeshes) m.visible = aAmt > 0.02;
    this.stars.rotation.x = a * 0.5;
    // moln
    this.cloudOff += dt * 1.2;
    const cs = this.cloudSize;
    const px = cam.position.x, pz = cam.position.z;
    const ox = Math.floor(px / cs) * cs, oz = Math.floor(pz / cs) * cs;
    this.clouds.position.set(ox, 132, oz);
    this.cloudTex.offset.set((this.cloudOff % cs) / cs, 0);
    this.cloudMat.color.copy(SL_NIGHT).lerp(new THREE.Color(1, 1, 1), day).lerp(new THREE.Color(1, 0.8, 0.7), set * 0.6);
    this.cloudMat.opacity = 0.55 + day * 0.3;
    this.clouds.visible = viewDist > 40;
  }
  dispose(scene) {
    scene.remove(this.group); scene.remove(this.clouds);
    const all = [this.clouds];
    this.group.traverse(o => all.push(o));
    for (const o of all) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
  }
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
