// Nordheim – miljö och effekter: himmel, sol/måne, dimma, partiklar (rök, eld, damm…), snöfall, moln, fåglar.
import * as THREE from 'three';
import { G, clamp } from './state.js';
import { SNOW, NIGHT, cloudGeo, birdGeo } from './models.js';

const C = (h) => new THREE.Color(h);
const LIGHT = { value: 1 }; // ljusnivå för icke-lysande partiklar (rök, damm) – mörkare på natten
const SKY = {
  dayTop: C(0x4f8fd8), dayHor: C(0xc4e2f4),
  setTop: C(0x3a5a96), setHor: C(0xf2a066),
  nightTop: C(0x040814), nightHor: C(0x16203a),
  winterHor: C(0xd6e2ee)
};

/* =====================================================================
 * Partikelsystem (Points med egen shader)
 * ===================================================================== */
class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uScale = { value: 400 };
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uScale: this.uScale, uLight: additive ? { value: 1 } : LIGHT }, THREE.UniformsLib.fog),
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vC; varying float vA;
        #include <fog_pars_vertex>
        void main() {
          vC = color; vA = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`.replace('void main', 'uniform float uScale;\nvoid main'),
      fragmentShader: `
        varying vec3 vC; varying float vA; uniform float uLight;
        #include <fog_pars_fragment>
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = vA * smoothstep(0.25, 0.05, r);
          gl_FragColor = vec4(vC * uLight, a);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
    this.geo = g;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grow = 0, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.a0[i] = a; this.alpha[i] = a;
    this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // byt plats med sista
        n--;
        if (i !== n) {
          for (let c = 0; c < 3; c++) { this.pos[i * 3 + c] = this.pos[n * 3 + c]; this.vel[i * 3 + c] = this.vel[n * 3 + c]; this.col[i * 3 + c] = this.col[n * 3 + c]; }
          this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.size[i] = this.size[n]; this.a0[i] = this.a0[n];
          this.grow[i] = this.grow[n]; this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n]; this.alpha[i] = this.alpha[n];
        }
        i--; continue;
      }
      const d = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, f * 2.2) * Math.min(1, (1 - f) * 8 + 0.15);
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.color.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

export class Env {
  constructor(scene, renderer, settings) {
    this.scene = scene; this.renderer = renderer; this.settings = settings;
    this.group = new THREE.Group(); scene.add(this.group);
    // Ljus
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a5a30, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.applyShadowQuality();
    this.group.add(this.hemi, this.sun, this.sun.target);
    this.fireLight = new THREE.PointLight(0xff8a30, 0, 12, 1.6);
    this.group.add(this.fireLight);
    // Himmel
    this.skyU = { uTop: { value: SKY.dayTop.clone() }, uHor: { value: SKY.dayHor.clone() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uNight: { value: 0 } };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uNight; varying vec3 vD;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = clamp(vD.y, -0.2, 1.0);
          vec3 c = mix(uHor, uTop, pow(max(h, 0.0), 0.6));
          if (h < 0.0) c = mix(uHor, uHor * 0.6, -h * 4.0);
          float sd = max(dot(normalize(vD), normalize(uSun)), 0.0);
          c += uSunCol * (pow(sd, 400.0) * 3.0 + pow(sd, 12.0) * 0.25) * (1.0 - uNight * 0.7);
          if (uNight > 0.01 && h > 0.0) {
            vec3 q = floor(vD * 220.0);
            float s = hash(q);
            if (s > 0.996) c += vec3(0.9, 0.92, 1.0) * (s - 0.996) * 220.0 * uNight * smoothstep(0.0, 0.25, h);
          }
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 14), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    scene.fog = new THREE.Fog(0xc4e2f4, 60, 220);
    // Partiklar
    this.soft = new Particles(this.group, 2600, false);
    this.glow = new Particles(this.group, 1600, true);
    // Snö
    this.snowN = 1400;
    const sp = new Float32Array(this.snowN * 3);
    for (let i = 0; i < this.snowN; i++) { sp[i * 3] = (Math.random() - 0.5) * 60; sp[i * 3 + 1] = Math.random() * 30; sp[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    this.snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0.85, depthWrite: false, fog: true }));
    this.snowPts.frustumCulled = false; this.snowPts.visible = false;
    this.group.add(this.snowPts);
    // Moln
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, flatShading: true, depthWrite: false });
    this.clouds = new THREE.InstancedMesh(cloudGeo(), this.cloudMat, 12);
    this.clouds.frustumCulled = false;
    this.cloudData = [];
    for (let i = 0; i < 12; i++) this.cloudData.push({ x: Math.random(), z: Math.random(), y: 72 + Math.random() * 14, s: 2.2 + Math.random() * 2, r: Math.random() * 6 });
    this.group.add(this.clouds);
    // Fåglar
    this.birds = new THREE.InstancedMesh(birdGeo(), new THREE.MeshBasicMaterial({ color: 0x3a3a44, side: THREE.DoubleSide, fog: true }), 24);
    this.birds.frustumCulled = false;
    this.flocks = [0, 1, 2].map(i => ({ a: Math.random() * 6, r: 8 + Math.random() * 14, y: 15 + Math.random() * 6, s: 0.18 + Math.random() * 0.12, cx: 0.3 + Math.random() * 0.4, cz: 0.3 + Math.random() * 0.4 }));
    this.group.add(this.birds);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this.t = 0;
    this.snow = 0;
    this.shake = 0;
    settings.onChange(k => { if (k === 'quality') this.applyShadowQuality(); });
  }
  applyShadowQuality() {
    const q = this.settings.q;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }
  setPixelScale(h, pr) { this.soft.uScale.value = h * pr * 0.5; this.glow.uScale.value = h * pr * 0.5; }

  /* ---------- Effekter ---------- */
  burst(type, x, y, z, n = 8) {
    const R = Math.random;
    const S = this.soft, L = this.glow;
    switch (type) {
      case 'smoke': S.emit(x + (R() - 0.5) * 0.1, y, z + (R() - 0.5) * 0.1, (R() - 0.5) * 0.15 + 0.15, 0.55 + R() * 0.2, (R() - 0.5) * 0.15, 4 + R() * 2, 0.35, 0.62, 0.62, 0.64, 0.5, 0.45, 0, 0.1); break;
      case 'blacksmoke': S.emit(x + (R() - 0.5) * 0.3, y, z + (R() - 0.5) * 0.3, (R() - 0.5) * 0.3 + 0.2, 0.9 + R() * 0.4, (R() - 0.5) * 0.3, 3 + R() * 2, 0.7, 0.18, 0.17, 0.16, 0.7, 0.9, 0, 0.1); break;
      case 'fire':
        for (let i = 0; i < n * 2; i++) { const hot = R(); L.emit(x + (R() - 0.5) * 0.9, y + R() * 0.3, z + (R() - 0.5) * 0.9, (R() - 0.5) * 0.25, 1.6 + R() * 1.4, (R() - 0.5) * 0.25, 0.35 + R() * 0.4, 0.28 + R() * 0.3, 1, 0.3 + hot * 0.5, 0.05 + hot * 0.1, 0.75, -0.45, 0.6, 0); }
        if (R() < 0.3) L.emit(x, y + 0.5, z, (R() - 0.5) * 1.2, 2 + R(), (R() - 0.5) * 1.2, 1.2, 0.08, 1, 0.7, 0.2, 1, 0, -1, 0.2);
        break;
      case 'torch': L.emit(x + (R() - 0.5) * 0.04, y, z + (R() - 0.5) * 0.04, 0, 0.5 + R() * 0.3, 0, 0.35, 0.18, 1, 0.55, 0.15, 0.9, -0.2, 0, 0); break;
      case 'forge': L.emit(x + (R() - 0.5) * 0.2, y, z + (R() - 0.5) * 0.2, (R() - 0.5) * 0.8, 1 + R(), (R() - 0.5) * 0.8, 0.6, 0.07, 1, 0.6, 0.2, 1, 0, -2, 0.2); break;
      case 'dust': for (let i = 0; i < n; i++) S.emit(x + (R() - 0.5) * 0.6, y, z + (R() - 0.5) * 0.6, (R() - 0.5) * 1.0, 0.3 + R() * 0.5, (R() - 0.5) * 1.0, 0.8 + R() * 0.6, 0.25 + R() * 0.2, 0.72, 0.64, 0.5, 0.55, 0.4, -0.2, 1.5); break;
      case 'debris': for (let i = 0; i < n; i++) S.emit(x + (R() - 0.5) * 0.8, y + R() * 0.5, z + (R() - 0.5) * 0.8, (R() - 0.5) * 3, 1.5 + R() * 2.5, (R() - 0.5) * 3, 0.9 + R() * 0.6, 0.14 + R() * 0.12, 0.35, 0.25, 0.15, 1, 0, -9, 0.2); this.burst('dust', x, y, z, Math.ceil(n / 2)); break;
      case 'leaves': for (let i = 0; i < n; i++) S.emit(x + (R() - 0.5) * 0.8, y + R() * 0.5, z + (R() - 0.5) * 0.8, (R() - 0.5) * 1.5, R() * 1.2, (R() - 0.5) * 1.5, 1.3 + R(), 0.12, 0.3 + R() * 0.3, 0.5 + R() * 0.2, 0.2, 1, 0, -1.5, 1.2); break;
      case 'chaff': for (let i = 0; i < n; i++) S.emit(x + (R() - 0.5) * 0.6, y, z + (R() - 0.5) * 0.6, (R() - 0.5) * 1.2, 0.5 + R(), (R() - 0.5) * 1.2, 1 + R(), 0.1, 0.92, 0.8, 0.4, 1, 0, -1.2, 1.2); break;
      case 'blood': for (let i = 0; i < n; i++) S.emit(x, y, z, (R() - 0.5) * 2, 1 + R() * 1.5, (R() - 0.5) * 2, 0.45, 0.09, 0.6, 0.06, 0.05, 1, 0, -9, 0); break;
      case 'splash': for (let i = 0; i < n; i++) S.emit(x + (R() - 0.5) * 0.3, y + 0.05, z + (R() - 0.5) * 0.3, (R() - 0.5) * 1.5, 1.5 + R() * 1.5, (R() - 0.5) * 1.5, 0.6, 0.12, 0.8, 0.92, 1, 0.9, 0, -8, 0); break;
      case 'steam': for (let i = 0; i < n; i++) S.emit(x + (R() - 0.5) * 0.8, y, z + (R() - 0.5) * 0.8, (R() - 0.5) * 0.5, 1 + R(), (R() - 0.5) * 0.5, 1.5, 0.4, 0.92, 0.94, 0.96, 0.55, 0.8, 0, 0.3); break;
      case 'sparkle': for (let i = 0; i < n; i++) L.emit(x + (R() - 0.5) * 0.6, y + R() * 0.4, z + (R() - 0.5) * 0.6, (R() - 0.5) * 0.6, 0.8 + R(), (R() - 0.5) * 0.6, 0.9, 0.12, 1, 0.9, 0.5, 1, -0.05, -0.5, 0.5); break;
      case 'ripple': S.emit(x, 0.08, z, 0, 0, 0, 1.2, 0.2, 0.85, 0.95, 1, 0.6, 1.2, 0, 0); break;
    }
  }

  /* ---------- Uppdatering ---------- */
  update(dt, camTarget, camDist, camera) {
    this.t += dt;
    const cal = G.cal;
    const p = cal ? cal.phase : 0.3;
    const season = cal ? cal.season : 1;
    // solens bana: dag 0..0.8, natt 0.8..1
    let dayF, elev, az;
    const maxElev = [0.95, 1.1, 0.8, 0.55][season];
    if (p < 0.8) { const f = p / 0.8; elev = Math.sin(f * Math.PI) * maxElev; az = -Math.PI * 0.5 + f * Math.PI; }
    else { const f = (p - 0.8) / 0.2; elev = -Math.sin(f * Math.PI) * 0.5; az = Math.PI * 0.5 + f * Math.PI; }
    const night = clamp((-elev + 0.05) / 0.25, 0, 1);
    const dawn = clamp(1 - Math.abs(elev) / 0.35, 0, 1) * (1 - night * 0.5);
    NIGHT.value = night;
    LIGHT.value = 1 - night * 0.78;
    this.night = night;
    const sx = Math.cos(az) * Math.cos(Math.max(elev, 0.12)), sy = Math.sin(Math.max(elev, 0.12)), sz = Math.sin(az) * Math.cos(Math.max(elev, 0.12)) * 0.6 + 0.35;
    const sunDir = this._v.set(sx, sy, sz).normalize();
    // ljus
    const moon = night > 0.5;
    const sunCol = this._sc || (this._sc = new THREE.Color());
    sunCol.setRGB(1, 0.93, 0.82).lerp(this._t1 || (this._t1 = new THREE.Color(1, 0.6, 0.32)), dawn * 0.8);
    if (moon) sunCol.setRGB(0.55, 0.65, 0.95);
    const sunI = moon ? 0.45 * night : 2.15 * (1 - night) * (0.55 + 0.45 * clamp(elev * 2, 0, 1));
    this.sun.color.copy(sunCol); this.sun.intensity = sunI;
    const tx = camTarget.x, tz = camTarget.z;
    const md = moon ? -1 : 1;
    this.sun.position.set(tx + sunDir.x * 60 * md, sunDir.y * 60, tz + sunDir.z * 60 * md);
    if (moon) this.sun.position.set(tx - 30, 50, tz + 25);
    this.sun.target.position.set(tx, 0, tz);
    const ext = clamp(camDist * 1.05, 14, 70);
    const sc = this.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 180; sc.updateProjectionMatrix(); }
    this.hemi.intensity = 0.95 - night * 0.6;
    this.hemi.color.setRGB(0.8, 0.88, 1).lerp(this._t2 || (this._t2 = new THREE.Color(0.35, 0.4, 0.7)), night);
    this.hemi.groundColor.setRGB(0.35, 0.38, 0.22).lerp(this._t3 || (this._t3 = new THREE.Color(0.08, 0.08, 0.15)), night);
    // himmel och dimma
    const top = this.skyU.uTop.value, hor = this.skyU.uHor.value;
    top.copy(SKY.dayTop).lerp(SKY.setTop, dawn).lerp(SKY.nightTop, night);
    hor.copy(SKY.dayHor).lerp(SKY.winterHor, this.snow * 0.5).lerp(SKY.setHor, dawn * 0.85).lerp(SKY.nightHor, night);
    this.skyU.uSun.value.set(sx, Math.sin(elev), sz);
    this.skyU.uSunCol.value.copy(sunCol);
    this.skyU.uNight.value = night;
    this.sky.position.copy(camera.position);
    const fogC = this.scene.fog.color;
    fogC.copy(hor).lerp(top, 0.15);
    const view = this.settings.q.view;
    this.scene.fog.near = camDist * 1.1 + 10;
    this.scene.fog.far = camDist * 2.6 + 90 * view;
    if (this.water) {
      this.water.uSunDir.value.copy(moon ? this._v.set(-0.5, 0.8, 0.4).normalize() : sunDir);
      this.water.uSunCol.value.copy(sunCol).multiplyScalar(moon ? 0.35 : (1 - night) * 1.0);
      this.water.uAmb.value.setRGB(0.42, 0.48, 0.58).multiplyScalar(1 - night * 0.75);
      this.water.uIce.value = this.snow * 0.85;
    }
    // snö: ackumulera på vintern, smält på våren
    if (cal) {
      let target = 0;
      if (season === 3) target = clamp(cal.seasonPhase * 4, 0, 1);
      else if (season === 0 && cal.year > 1) target = clamp(1 - cal.seasonPhase * 3.5, 0, 1);
      else if (season === 2) target = clamp((cal.seasonPhase - 0.85) * 2, 0, 0.3);
      this.snow += (target - this.snow) * Math.min(1, dt * 0.6);
    }
    SNOW.value = this.snow;
    // snöfall
    const falling = cal && season === 3 && cal.seasonPhase > 0.03 && cal.seasonPhase < 0.92;
    this.snowPts.visible = falling;
    if (falling) {
      const pa = this.snowPts.geometry.attributes.position, arr = pa.array;
      for (let i = 0; i < this.snowN; i++) {
        arr[i * 3 + 1] -= dt * (1.4 + (i % 7) * 0.12);
        arr[i * 3] += Math.sin(this.t * 0.7 + i) * dt * 0.3 + dt * 0.4;
        if (arr[i * 3 + 1] < 0) { arr[i * 3 + 1] += 30; }
        if (arr[i * 3] > 30) arr[i * 3] -= 60;
      }
      pa.needsUpdate = true;
      this.snowPts.position.set(tx, 0, tz);
    }
    // moln
    const n = G.map ? G.map.n : 128;
    const M = this._m, Q = this._q, S = this._s;
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      c.x += dt * 0.0025; if (c.x > 1.3) c.x -= 1.6;
      Q.setFromEuler(this._e.set(0, c.r, 0));
      M.compose(this._v.set((c.x - 0.15) * n * 2.2 - n * 0.6, c.y, c.z * n * 2.2 - n * 0.6), Q, S.set(c.s * 2, c.s, c.s * 1.6));
      this.clouds.setMatrixAt(i, M);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    this.cloudMat.color.setRGB(1, 1, 1).lerp(this._t4 || (this._t4 = new THREE.Color(0.2, 0.22, 0.3)), night).lerp(this._t5 || (this._t5 = new THREE.Color(1, 0.75, 0.6)), dawn * 0.4);
    this.cloudMat.opacity = season === 3 ? 0.9 : 0.78;
    // fåglar (inte på natten/vintern)
    const birdsOn = night < 0.5 && season !== 3;
    this.birds.visible = birdsOn;
    if (birdsOn) {
      let idx = 0;
      for (const f of this.flocks) {
        f.a += dt * f.s;
        const cx = f.cx * n + Math.cos(f.a * 0.3) * 10, cz = f.cz * n + Math.sin(f.a * 0.23) * 10;
        for (let b = 0; b < 8; b++) {
          const off = b * 0.12;
          const a = f.a - off;
          const x = cx + Math.cos(a) * (f.r + (b % 3) * 0.8), z = cz + Math.sin(a) * (f.r + (b % 3) * 0.8), y = f.y + Math.sin(this.t * 0.7 + b) * 0.6;
          const flap = Math.sin(this.t * 9 + b * 1.7);
          Q.setFromEuler(this._e.set(0, -a, 0));
          M.compose(this._v.set(x, y, z), Q, S.set(0.75, 0.6 + flap * 2, 0.75));
          this.birds.setMatrixAt(idx++, M);
        }
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }
    this.soft.update(dt); this.glow.update(dt);
  }
  dispose() {
    this.soft.clear(); this.glow.clear();
  }
}
