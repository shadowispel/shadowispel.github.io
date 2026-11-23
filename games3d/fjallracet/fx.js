/**
 * Fjällracet – effekter: poolade partiklar, sladdmärken, fartlinjer/vinjett.
 */
import * as THREE from 'three';
import * as TX from './textures.js';

/* ------------------------------------------------------------------ Partiklar */
export class Particles {
  constructor(scene, max = 1500, additive = false) {
    this.max = max; this.n = 0;
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.age = F(1); this.life = F(1); this.s0 = F(1); this.s1 = F(1);
    this.c = F(3); this.a0 = F(1); this.drag = F(1); this.grav = F(1);
    this.gPos = new Float32Array(max * 3); this.gCol = new Float32Array(max * 4); this.gSize = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.gPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.gCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.gSize, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcol', this.aCol); g.setAttribute('psize', this.aSize);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { tex: { value: TX.dotTex() }, scale: { value: 600 } },
      vertexShader: `attribute vec4 pcol; attribute float psize; uniform float scale; varying vec4 vC;
        void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * scale / max(0.5, -mv.z); }`,
      fragmentShader: `uniform sampler2D tex; varying vec4 vC; void main(){ float a = texture2D(tex, gl_PointCoord).a * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 4;
    this.geo = g;
    scene.add(this.points);
  }
  setScale(h) { this.mat.uniforms.scale.value = h * 0.9; }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav;
  }
  _kill(i) {
    const j = --this.n; if (i === j) return;
    for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; this.c[i * 3 + k] = this.c[j * 3 + k]; }
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); i--; continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      this.gPos[i * 3] = this.p[i * 3]; this.gPos[i * 3 + 1] = this.p[i * 3 + 1]; this.gPos[i * 3 + 2] = this.p[i * 3 + 2];
      this.gCol[i * 4] = this.c[i * 3]; this.gCol[i * 4 + 1] = this.c[i * 3 + 1]; this.gCol[i * 4 + 2] = this.c[i * 3 + 2];
      this.gCol[i * 4 + 3] = this.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
      this.gSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
    }
    this.geo.setDrawRange(0, this.n);
    if (this.n) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.n * 3); this.aPos.needsUpdate = true;
      this.aCol.clearUpdateRanges(); this.aCol.addUpdateRange(0, this.n * 4); this.aCol.needsUpdate = true;
      this.aSize.clearUpdateRanges(); this.aSize.addUpdateRange(0, this.n); this.aSize.needsUpdate = true;
    }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  dispose(scene) { scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}

/* ------------------------------------------------------------------ Sladdmärken */
export class Skids {
  constructor(scene, max = 1400, color = 0x000000, opacity = 0.42) {
    this.max = max; this.head = 0; this.count = 0;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const idx = new Uint32Array(max * 6);
    for (let q = 0; q < max; q++) { const a = q * 4; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], q * 6); }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAl = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('al', this.aAl); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader: `attribute float al; varying float vA; void main(){ vA = al; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(color, opacity * vA); }`
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.geo = g;
    scene.add(this.mesh);
    this.last = new Map();
  }
  /** key = unik id per hjul; p = mittpunkt på marken, side = vektor åt sidan (normaliserad), on = sladdar? */
  mark(key, p, side, on, strength = 1) {
    const prev = this.last.get(key);
    if (!on) { if (prev) prev.valid = false; return; }
    const w = 0.13;
    if (prev && prev.valid) {
      const dx = p.x - prev.x, dz = p.z - prev.z;
      if (dx * dx + dz * dz < 0.5) return;
      if (dx * dx + dz * dz < 25) {
        const q = this.head; this.head = (this.head + 1) % this.max; this.count = Math.min(this.max, this.count + 1);
        const o = q * 12;
        const s = [prev.x - prev.sx * w, prev.y, prev.z - prev.sz * w, prev.x + prev.sx * w, prev.y, prev.z + prev.sz * w,
          p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w];
        this.pos.set(s, o);
        const al = Math.min(1, strength);
        this.alpha[q * 4] = this.alpha[q * 4 + 1] = prev.al; this.alpha[q * 4 + 2] = this.alpha[q * 4 + 3] = al;
        this.dirty = true;
      }
    }
    const e = prev || {};
    e.x = p.x; e.y = p.y + 0.03; e.z = p.z; e.sx = side.x; e.sz = side.z; e.valid = true; e.al = Math.min(1, strength);
    if (!prev) this.last.set(key, e);
  }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.aPos.needsUpdate = true; this.aAl.needsUpdate = true;
    this.geo.setDrawRange(0, this.count * 6);
  }
  clear() { this.head = 0; this.count = 0; this.last.clear(); this.geo.setDrawRange(0, 0); }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

/* ------------------------------------------------------------------ Fartlinjer + vinjett (skärmöverlägg) */
export class SpeedFx {
  constructor(scene) {
    const g = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { time: { value: 0 }, amount: { value: 0 }, nitro: { value: 0 }, aspect: { value: 1 }, hurt: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform float time, amount, nitro, aspect, hurt; varying vec2 vUv;
        float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
        void main(){
          vec2 p = vUv * 2.0 - 1.0; p.x *= aspect;
          float r = length(p);
          if (r < 0.58) discard; // alla effekter är noll i mitten – spara fyllnad
          float vig = smoothstep(0.75, 1.6, r) * (0.18 + 0.35 * amount + 0.25 * nitro);
          float va = vig + hurt * smoothstep(0.6, 1.5, r) * 0.5;
          float lines = 0.0;
          if (amount > 0.001) {
            float a = atan(p.y, p.x);
            float bands = 90.0; float id = floor((a / 6.2831853 + 0.5) * bands);
            float h = h1(id), h2 = h1(id + 31.7);
            float f = fract((a / 6.2831853 + 0.5) * bands);
            float thin = smoothstep(0.5, 0.0, abs(f - 0.5) - 0.12);
            float seg = fract(r * 0.55 - time * (1.6 + h * 2.4) + h2 * 7.0);
            float streak = smoothstep(0.0, 0.25, seg) * smoothstep(0.75, 0.3, seg) * step(0.55, h2) * thin;
            lines = streak * smoothstep(0.7, 1.35, r) * amount * 0.45;
          }
          float alpha = clamp(lines * 0.55 + va, 0.0, 0.85);
          if (alpha < 0.003) discard;
          vec3 col = mix(vec3(1.0), vec3(0.55, 0.8, 1.0), nitro);
          vec3 vc = mix(vec3(0.0), vec3(0.6, 0.0, 0.0), hurt);
          gl_FragColor = vec4(mix(vc, col, lines / max(0.001, lines + va)), alpha);
        }`
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 999;
    this.geo = g;
    scene.add(this.mesh);
  }
  set(time, amount, nitro, aspect, hurt) {
    const u = this.mat.uniforms; u.time.value = time; u.amount.value = amount; u.nitro.value = nitro; u.aspect.value = aspect; u.hurt.value = hurt;
    this.mesh.visible = true; // vinjetten syns alltid
  }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
