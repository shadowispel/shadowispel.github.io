/**
 * Rymdjakt – effekter: partiklar (eld, gnistor, rök), explosioner med chockvåg, skräp, sköldträffar,
 * motorstrimmor och rymddamm som ger fartkänsla. Allt är poolat.
 */
import * as THREE from 'three';
import { mat } from './gfx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
function randDir(out) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); return out.set(r * Math.cos(t), u, r * Math.sin(t)); }

/* ---------------------------------------------------------------- Partikelsystem */
const P_VS = `
attribute float size; attribute float alpha; attribute vec3 color;
uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = alpha <= 0.0 ? 0.0 : min(size * uScale / max(0.5, -mv.z), 600.0); vC = color; vA = alpha; }`;
const P_FS_ADD = `
varying vec3 vC; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard; float a = 1.0 - d; a *= a;
  gl_FragColor = vec4(vC * a * vA, a * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const P_FS_SMOKE = `
varying vec3 vC; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard; float a = (1.0 - d); a = a * a * vA;
  gl_FragColor = vec4(vC, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.siz = new Float32Array(max); this.alp = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSiz = new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlp = new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSiz); g.setAttribute('alpha', this.aAlp);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } }, vertexShader: P_VS, fragmentShader: additive ? P_FS_ADD : P_FS_SMOKE,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 0, r1 = r, g1 = g, b1 = b) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.drag[i] = drag;
    this.siz[i] = s0; this.alp[i] = a; this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
  }
  _copy(d, s) {
    const d3 = d * 3, s3 = s * 3;
    for (let k = 0; k < 3; k++) { this.pos[d3 + k] = this.pos[s3 + k]; this.vel[d3 + k] = this.vel[s3 + k]; this.c0[d3 + k] = this.c0[s3 + k]; this.c1[d3 + k] = this.c1[s3 + k]; this.col[d3 + k] = this.col[s3 + k]; }
    this.life[d] = this.life[s]; this.maxLife[d] = this.maxLife[s]; this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s]; this.a0[d] = this.a0[s]; this.drag[d] = this.drag[s];
    this.siz[d] = this.siz[s]; this.alp[d] = this.alp[s];
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      if (t >= 1) { this.n--; if (i !== this.n) this._copy(i, this.n); continue; }
      const i3 = i * 3, dr = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.siz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alp[i] = this.a0[i] * (1 - t) * Math.min(1, t * 12 + 0.25);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    if (this.n > 0) {
      for (const a of [this.aPos, this.aCol, this.aSiz, this.aAlp]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
    }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  dispose(scene) { scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}

/* ---------------------------------------------------------------- Strimmor (band mot kameran) */
const T_VS = `attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; void main(){ vA = alpha; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const T_FS = `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC * vA, vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const TP = 22;
class Trails {
  constructor(scene, max = 48) {
    this.max = max; this.list = [];
    const nv = max * TP * 2;
    this.pos = new Float32Array(nv * 3); this.alp = new Float32Array(nv); this.col = new Float32Array(nv * 3);
    const idx = [];
    for (let t = 0; t < max; t++) for (let i = 0; i < TP - 1; i++) { const a = (t * TP + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlp = new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('alpha', this.aAlp); g.setAttribute('color', this.aCol);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: T_VS, fragmentShader: T_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }
  /** Skapar en strimma. getPos(out) → bool (sant om källan lever). */
  add(getPos, { width = 0.6, life = 0.5, color = [0.6, 1.2, 2.2], alpha = 0.6, interval = 0.025 } = {}) {
    if (this.list.length >= this.max) return null;
    const t = { getPos, width, life, color, alpha, interval, pts: [], acc: 0, emit: 1, dead: false, k: 1 };
    this.list.push(t);
    return t;
  }
  update(dt, cam) {
    const camPos = cam.position;
    for (let ti = this.list.length - 1; ti >= 0; ti--) {
      const t = this.list[ti];
      for (const p of t.pts) p.age += dt;
      while (t.pts.length && t.pts[t.pts.length - 1].age > t.life) t.pts.pop();
      if (!t.dead) {
        const alive = t.getPos(_v);
        if (!alive) t.dead = true;
        else {
          t.acc += dt;
          if (t.pts.length === 0 || t.acc >= t.interval) { t.acc = 0; t.pts.unshift({ x: _v.x, y: _v.y, z: _v.z, age: 0, e: t.emit }); if (t.pts.length > TP) t.pts.pop(); }
          else { const h = t.pts[0]; h.x = _v.x; h.y = _v.y; h.z = _v.z; h.e = t.emit; }
        }
      }
      if (t.dead && t.pts.length === 0) this.list.splice(ti, 1);
    }
    // bygg geometrin
    for (let ti = 0; ti < this.max; ti++) {
      const t = this.list[ti];
      const base = ti * TP * 2;
      for (let i = 0; i < TP; i++) {
        const v0 = base + i * 2;
        if (!t || i >= t.pts.length || t.pts.length < 2) {
          const src = t && t.pts.length ? t.pts[Math.min(i, t.pts.length - 1)] : null;
          const x = src ? src.x : 0, y = src ? src.y : -99999, z = src ? src.z : 0;
          for (const v of [v0, v0 + 1]) { this.pos[v * 3] = x; this.pos[v * 3 + 1] = y; this.pos[v * 3 + 2] = z; this.alp[v] = 0; }
          continue;
        }
        const p = t.pts[i], pa = t.pts[Math.max(0, i - 1)], pb = t.pts[Math.min(t.pts.length - 1, i + 1)];
        _v.set(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
        _v2.set(camPos.x - p.x, camPos.y - p.y, camPos.z - p.z);
        _v.cross(_v2);
        const l = _v.length() || 1;
        const f = 1 - p.age / t.life;
        const w = t.width * (0.25 + 0.75 * f) / l;
        _v.multiplyScalar(w);
        this.pos[v0 * 3] = p.x + _v.x; this.pos[v0 * 3 + 1] = p.y + _v.y; this.pos[v0 * 3 + 2] = p.z + _v.z;
        this.pos[v0 * 3 + 3] = p.x - _v.x; this.pos[v0 * 3 + 4] = p.y - _v.y; this.pos[v0 * 3 + 5] = p.z - _v.z;
        const a = t.alpha * f * f * p.e * (i === 0 ? 0.3 : 1);
        this.alp[v0] = a; this.alp[v0 + 1] = a;
        for (let k = 0; k < 3; k++) { this.col[v0 * 3 + k] = t.color[k]; this.col[v0 * 3 + 3 + k] = t.color[k]; }
      }
    }
    this.aPos.needsUpdate = true; this.aAlp.needsUpdate = true; this.aCol.needsUpdate = true;
  }
  clear() { this.list.length = 0; }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

/* ---------------------------------------------------------------- Rymddamm */
class Dust {
  constructor(scene, n = 420, color = '#a8b8d8') {
    this.n = n; this.box = 240;
    this.p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.p[i] = (Math.random() - 0.5) * this.box;
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol);
    this.geo = g;
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = new THREE.LineSegments(g, this.mat); this.mesh.frustumCulled = false;
    this.color = new THREE.Color(color);
    scene.add(this.mesh);
  }
  update(cam, vel) {
    const B = this.box, H = B / 2, c = cam.position;
    const sp = vel.length();
    const k = Math.min(0.06, 0.012 + sp * 0.00018);
    const vis = Math.min(1, 0.25 + sp / 160);
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      let x = this.p[i3] - c.x, y = this.p[i3 + 1] - c.y, z = this.p[i3 + 2] - c.z;
      x = ((x + H) % B + B) % B - H; y = ((y + H) % B + B) % B - H; z = ((z + H) % B + B) % B - H;
      const wx = c.x + x, wy = c.y + y, wz = c.z + z;
      this.p[i3] = wx; this.p[i3 + 1] = wy; this.p[i3 + 2] = wz;
      const o = i * 6;
      this.pos[o] = wx; this.pos[o + 1] = wy; this.pos[o + 2] = wz;
      this.pos[o + 3] = wx - vel.x * k - 0.3; this.pos[o + 4] = wy - vel.y * k; this.pos[o + 5] = wz - vel.z * k;
      const d = Math.sqrt(x * x + y * y + z * z) / H;
      const f = Math.max(0, 1 - d) * vis * 0.9;
      this.col[o] = this.color.r * f; this.col[o + 1] = this.color.g * f; this.col[o + 2] = this.color.b * f;
      this.col[o + 3] = 0; this.col[o + 4] = 0; this.col[o + 5] = 0;
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

/* ---------------------------------------------------------------- Sköldbubblor */
const SH_VS = `varying vec3 vP; varying vec3 vWN; varying vec3 vWP; void main(){ vP = position; vWN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SH_FS = `uniform vec3 uHit; uniform float uAge; uniform vec3 uColor; uniform float uFull; varying vec3 vP; varying vec3 vWN; varying vec3 vWP;
void main(){ float d = distance(normalize(vP), uHit); float fade = 1.0 - uAge;
  float hot = exp(-d * d * 5.0) * fade;
  float rim = pow(1.0 - abs(dot(normalize(vWN), normalize(cameraPosition - vWP))), 2.5);
  float rip = 0.55 + 0.45 * sin(d * 26.0 - uAge * 28.0);
  float hex = step(0.92, fract(vP.x * 6.0 + vP.y * 3.5)) + step(0.92, fract(vP.y * 7.0 - vP.z * 3.0));
  float a = hot * (0.55 + 0.45 * rip) * (1.0 + hex * 0.5) + rim * fade * (0.12 + uFull * 0.5);
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ---------------------------------------------------------------- FX-samlingen */
export class FX {
  constructor(scene, settings) {
    this.scene = scene;
    const q = settings.q;
    this.lowFx = q.pixelRatio < 1;
    this.add = new Particles(scene, this.lowFx ? 3000 : 7000, true);
    this.smoke = new Particles(scene, this.lowFx ? 1200 : 2600, false);
    this.trails = new Trails(scene, 56);
    this.dust = null;
    // chockvågsringar
    const ringGeo = new THREE.RingGeometry(0.93, 1, 72);
    this.rings = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const r = new THREE.Mesh(ringGeo, m); r.visible = false; r.renderOrder = 7; scene.add(r);
      this.rings.push({ mesh: r, t: 1, dur: 1, size: 1, color: new THREE.Color() });
    }
    this.ringGeo = ringGeo;
    // eldklot
    const ballGeo = new THREE.SphereGeometry(1, 20, 14);
    this.balls = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const b = new THREE.Mesh(ballGeo, m); b.visible = false; b.renderOrder = 7; scene.add(b);
      this.balls.push({ mesh: b, t: 1, dur: 1, size: 1 });
    }
    this.ballGeo = ballGeo;
    // ljusblixtar
    this.lights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffaa66, 0, 600, 1.6); scene.add(l); this.lights.push({ light: l, t: 1, dur: 1, peak: 0 }); }
    // skräp
    const dg = new THREE.DodecahedronGeometry(1, 0); dg.scale(1, 0.5, 1.4);
    this.debrisMax = 180;
    this.debrisMesh = new THREE.InstancedMesh(dg, mat('debris'), this.debrisMax);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.debrisMesh.count = 0; this.debrisMesh.frustumCulled = false;
    scene.add(this.debrisMesh);
    this.debrisGeo = dg;
    this.debris = [];
    // sköldbubblor
    const sg = new THREE.SphereGeometry(1, 28, 18);
    this.shields = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.ShaderMaterial({ uniforms: { uHit: { value: new THREE.Vector3(0, 0, 1) }, uAge: { value: 1 }, uColor: { value: new THREE.Color(0.4, 1.2, 2.4) }, uFull: { value: 0 } }, vertexShader: SH_VS, fragmentShader: SH_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(sg, m); mesh.visible = false; mesh.renderOrder = 8; scene.add(mesh);
      this.shields.push({ mesh, ship: null, t: 1, dur: 0.45 });
    }
    this.shieldGeo = sg;
    this.shakeAdd = 0;
  }
  setDust(color) { if (this.dust) this.dust.dispose(this.scene); this.dust = new Dust(this.scene, this.lowFx ? 260 : 420, color); }
  setScale(h, fov) { const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); this.add.mat.uniforms.uScale.value = s; this.smoke.mat.uniforms.uScale.value = s; }

  /* ---- byggstenar ---- */
  spark(p, dir, n = 6, speed = 60, color = [3, 2, 1], size = 0.6) {
    for (let i = 0; i < n; i++) {
      randDir(_v); if (dir) _v.addScaledVector(dir, 1.2).normalize();
      const s = speed * rnd(0.4, 1.2);
      this.add.spawn(p.x, p.y, p.z, _v.x * s, _v.y * s, _v.z * s, rnd(0.15, 0.45), size * rnd(0.8, 1.4), size * 0.3, color[0], color[1], color[2], 1, 2.5, color[0] * 0.8, color[1] * 0.3, color[2] * 0.2);
    }
  }
  muzzle(p, color, size = 1.8) { this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.06, size, size * 0.4, color[0], color[1], color[2], 1); }
  glowAt(p, color, size, life = 0.2) { this.add.spawn(p.x, p.y, p.z, 0, 0, 0, life, size, size * 0.5, color[0], color[1], color[2], 1); }
  smokePuff(p, v, size = 2, life = 1.2, shade = 0.18, alpha = 0.5) {
    this.smoke.spawn(p.x, p.y, p.z, v ? v.x : 0, v ? v.y : 0, v ? v.z : 0, life, size, size * 2.6, shade, shade, shade * 1.05, alpha, 0.8);
  }
  ring(p, size, color, dur = 0.7, normal = null) {
    const r = this.rings.find(x => x.t >= 1) || this.rings[0];
    r.t = 0; r.dur = dur; r.size = size; r.color.setRGB(color[0], color[1], color[2]);
    r.mesh.position.copy(p);
    if (normal) r.mesh.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), normal);
    else { randDir(_v); r.mesh.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), _v); }
    r.mesh.visible = true; r.mesh.scale.setScalar(0.01);
  }
  ball(p, size, dur = 0.8) {
    const b = this.balls.find(x => x.t >= 1) || this.balls[0];
    b.t = 0; b.dur = dur; b.size = size; b.mesh.position.copy(p); b.mesh.visible = true; b.mesh.scale.setScalar(size * 0.2);
  }
  flash(p, peak, dist, dur = 0.35, color = 0xffaa66) {
    const l = this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    l.t = 0; l.dur = dur; l.peak = peak; l.light.position.copy(p); l.light.distance = dist; l.light.color.set(color);
  }
  debrisBurst(p, vel, n, scale = 1, spread = 30) {
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= this.debrisMax) this.debris.shift();
      randDir(_v);
      const s = spread * rnd(0.3, 1);
      this.debris.push({
        p: new THREE.Vector3(p.x + _v.x * scale, p.y + _v.y * scale, p.z + _v.z * scale),
        v: new THREE.Vector3(vel.x * 0.6 + _v.x * s, vel.y * 0.6 + _v.y * s, vel.z * 0.6 + _v.z * s),
        axis: randDir(new THREE.Vector3()), ang: 0, spin: rnd(2, 9), q: new THREE.Quaternion(),
        size: scale * rnd(0.25, 0.9), life: 0, max: rnd(1.6, 3.4), burn: Math.random() < 0.5, smokeT: 0
      });
    }
  }

  /** Explosion med radie R (världsenheter). */
  explode(p, R, vel = null, opts = {}) {
    const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
    const big = R > 20;
    const k = this.lowFx ? 0.6 : 1;
    const color = opts.color || null;
    // blixt
    this.add.spawn(p.x, p.y, p.z, vx, vy, vz, big ? 0.5 : 0.2, R * 3.2, R * 5, 2.2, 1.7, 1.1, 0.9);
    // eld
    const nf = Math.round((big ? 60 : 22) * k);
    for (let i = 0; i < nf; i++) {
      randDir(_v); const s = R * rnd(0.6, 2.6);
      const c = color || [2.2, rnd(0.7, 1.3), 0.22];
      this.add.spawn(p.x + _v.x * R * 0.3, p.y + _v.y * R * 0.3, p.z + _v.z * R * 0.3, vx + _v.x * s, vy + _v.y * s, vz + _v.z * s,
        rnd(0.45, 1.1) * (big ? 1.6 : 1), R * rnd(0.8, 1.5), R * rnd(1.8, 3.2), c[0], c[1], c[2], 0.75, 2.2, 0.9, 0.12, 0.03);
    }
    // gnistor
    const ns = Math.round((big ? 70 : 26) * k);
    for (let i = 0; i < ns; i++) {
      randDir(_v); const s = R * rnd(5, 16) + 20;
      this.add.spawn(p.x, p.y, p.z, vx + _v.x * s, vy + _v.y * s, vz + _v.z * s, rnd(0.4, 1.3), rnd(0.5, 1.4) * Math.max(1, R * 0.12), 0.2, 3, 2.2, 1.2, 1, 1.4, 2, 0.5, 0.1);
    }
    // rök
    const nk = Math.round((big ? 30 : 10) * k);
    for (let i = 0; i < nk; i++) {
      randDir(_v); const s = R * rnd(0.3, 1.2);
      this.smoke.spawn(p.x + _v.x * R * 0.5, p.y + _v.y * R * 0.5, p.z + _v.z * R * 0.5, vx + _v.x * s, vy + _v.y * s, vz + _v.z * s,
        rnd(1.6, 3.2) * (big ? 1.5 : 1), R * 1.2, R * rnd(3, 5), 0.09, 0.08, 0.08, 0.55, 0.6);
    }
    if (R >= 3) this.ring(p, R * (big ? 10 : 7), color ? [color[0] * 0.4, color[1] * 0.4, color[2] * 0.4] : [1.3, 0.8, 0.4], big ? 1.4 : 0.55);
    if (big) { this.ring(p, R * 14, [0.8, 0.6, 0.45], 2.2); this.ball(p, R * 1.8, 1.4); }
    else if (R >= 5) this.ball(p, R * 1.3, 0.4);
    if (vel || opts.debris) this.debrisBurst(p, vel || _v.set(0, 0, 0), opts.debris != null ? opts.debris : Math.min(14, Math.round(R * 1.5)), Math.max(0.6, R * 0.22), R * 6 + 10);
    this.flash(p, big ? 60 : 14, big ? 2400 : 500, big ? 0.9 : 0.35);
  }
  /** Ankomst genom hopp: ljusstrimma och ring. */
  warpIn(p, dir, R = 6) {
    for (let i = 0; i < 18; i++) {
      const s = rnd(200, 900);
      this.add.spawn(p.x, p.y, p.z, -dir.x * s, -dir.y * s, -dir.z * s, rnd(0.2, 0.5), R * 0.8, 0.2, 0.8, 1.6, 3, 1, 3);
    }
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.4, R * 6, R * 10, 1.2, 1.8, 3, 1);
    this.ring(p, R * 8, [0.6, 1.2, 2.6], 0.6, dir);
  }
  shieldHit(ship, point, color) {
    const s = this.shields.find(x => x.ship === ship && x.t < 0.5) || this.shields.find(x => x.t >= 1) || this.shields.reduce((a, b) => (a.t > b.t ? a : b));
    s.ship = ship; s.t = 0; s.dur = 0.45;
    const m = s.mesh.material.uniforms;
    _v.copy(point).sub(ship.pos).applyQuaternion(_q.copy(ship.quat).invert()).normalize();
    m.uHit.value.copy(_v);
    m.uColor.value.setRGB(color ? color[0] : 0.4, color ? color[1] : 1.2, color ? color[2] : 2.4);
    m.uFull.value = ship.isLarge ? 0 : (ship.isPlayer ? 0.08 : 0.3);
    s.mesh.visible = true;
  }

  update(dt, cam, playerVel) {
    this.add.update(dt); this.smoke.update(dt);
    this.trails.update(dt, cam);
    if (this.dust) this.dust.update(cam, playerVel || _v.set(0, 0, 0));
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / r.dur);
      const e = 1 - Math.pow(1 - r.t, 3);
      r.mesh.scale.setScalar(Math.max(0.01, r.size * e));
      r.mesh.material.color.copy(r.color).multiplyScalar((1 - r.t) * (1 - r.t));
      if (r.t >= 1) r.mesh.visible = false;
    }
    for (const b of this.balls) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / b.dur);
      b.mesh.scale.setScalar(b.size * (0.3 + 0.7 * Math.sqrt(b.t)));
      const f = (1 - b.t);
      b.mesh.material.color.setRGB(1.5 * f * f, 0.65 * f * f * f, 0.15 * f * f * f);
      if (b.t >= 1) b.mesh.visible = false;
    }
    for (const l of this.lights) {
      if (l.t >= 1) { l.light.intensity = 0; continue; }
      l.t = Math.min(1, l.t + dt / l.dur);
      l.light.intensity = l.peak * 1000 * (1 - l.t) * (1 - l.t);
    }
    for (const s of this.shields) {
      if (s.t >= 1) continue;
      s.t = Math.min(1, s.t + dt / s.dur);
      if (!s.ship || s.ship.dead) { s.t = 1; }
      if (s.t >= 1) { s.mesh.visible = false; s.ship = null; continue; }
      s.mesh.position.copy(s.ship.pos); s.mesh.quaternion.copy(s.ship.quat);
      const r = s.ship.shieldRadius || s.ship.radius * 1.35;
      s.mesh.scale.setScalar(r);
      s.mesh.material.uniforms.uAge.value = s.t;
    }
    // skräp
    const dm = this.debrisMesh;
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      if (d.life >= d.max) { this.debris.splice(i, 1); continue; }
    }
    for (const d of this.debris) {
      d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(Math.exp(-0.3 * dt));
      d.ang += d.spin * dt;
      _q.setFromAxisAngle(d.axis, d.ang);
      const sc = d.size * Math.min(1, (d.max - d.life) * 2);
      _s.set(sc, sc, sc);
      _m.compose(d.p, _q, _s);
      dm.setMatrixAt(n++, _m);
      if (d.burn) {
        d.smokeT -= dt;
        if (d.smokeT <= 0) {
          d.smokeT = 0.05;
          this.add.spawn(d.p.x, d.p.y, d.p.z, 0, 0, 0, 0.35, d.size * 2.2, d.size * 0.5, 3, 1.3, 0.3, 0.9);
          if (!this.lowFx) this.smoke.spawn(d.p.x, d.p.y, d.p.z, 0, 0, 0, 0.9, d.size * 1.5, d.size * 4, 0.12, 0.11, 0.1, 0.35);
        }
      }
    }
    dm.count = n;
    dm.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.add.clear(); this.smoke.clear(); this.trails.clear(); this.debris.length = 0; this.debrisMesh.count = 0;
    for (const r of this.rings) { r.t = 1; r.mesh.visible = false; }
    for (const b of this.balls) { b.t = 1; b.mesh.visible = false; }
    for (const s of this.shields) { s.t = 1; s.mesh.visible = false; s.ship = null; }
    for (const l of this.lights) { l.t = 1; l.light.intensity = 0; }
  }
}
