/* Rävens äventyr – effekter: partiklar, droppskugga, glöd, chockvågor. */
import * as THREE from 'three';
import { TEX } from './core.js';

const MAX = 900;

export class Particles {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX.radial() }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard;
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 0, s1: 0, r: 1, gg: 1, b: 1, a: 1 });
    this.next = 0;
    this.addMat = this.mat.clone();
    this.addMat.blending = THREE.AdditiveBlending;
  }
  setScale(h) { this.mat.uniforms.scale.value = h * 0.9; }
  emit(x, y, z, o = {}) {
    const p = this.p[this.next]; this.next = (this.next + 1) % MAX;
    p.x = x; p.y = y; p.z = z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.g == null ? 0 : o.g; p.drag = o.drag || 0;
    p.life = p.max = o.life || 0.6;
    p.s0 = o.size || 0.4; p.s1 = o.size1 == null ? p.s0 * 0.2 : o.size1;
    const c = o.color != null ? _c.set(o.color) : _c.set(0xffffff);
    p.r = c.r; p.gg = c.g; p.b = c.b; p.a = o.alpha == null ? 1 : o.alpha;
  }
  burst(x, y, z, n, o = {}) {
    const sp = o.speed || 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = o.flat ? (Math.random() * 0.4) : (Math.random() * 2 - 1) * (o.up ? 0.5 : 1);
      const r = Math.sqrt(1 - u * u), s = sp * (0.4 + Math.random() * 0.6);
      this.emit(x + (Math.random() - 0.5) * (o.spread || 0), y + (Math.random() - 0.5) * (o.spread || 0) * 0.5, z + (Math.random() - 0.5) * (o.spread || 0), {
        vx: Math.cos(a) * r * s, vy: (o.up ? Math.abs(u) + 0.5 : u) * s * (o.upMul || 1), vz: Math.sin(a) * r * s,
        g: o.g, drag: o.drag == null ? 2 : o.drag, life: (o.life || 0.6) * (0.6 + Math.random() * 0.6),
        size: (o.size || 0.35) * (0.7 + Math.random() * 0.6), size1: o.size1, color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color, alpha: o.alpha
      });
    }
  }
  dust(x, y, z, n = 8, color = 0xe8dcc6) { this.burst(x, y + 0.1, z, n, { speed: 2.4, flat: true, g: -1, drag: 3, life: 0.5, size: 0.5, size1: 0.9, color, alpha: 0.7 }); }
  sparkle(x, y, z, n = 10, color = 0xffe066) { this.burst(x, y, z, n, { speed: 4, g: 3, drag: 2, life: 0.55, size: 0.35, size1: 0, color }); }
  ring(x, y, z, r, n = 24, color = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      this.emit(x + Math.cos(a) * 0.4, y + 0.15, z + Math.sin(a) * 0.4, { vx: Math.cos(a) * r * 2.5, vz: Math.sin(a) * r * 2.5, vy: 0.4, drag: 4, life: 0.45, size: 0.6, size1: 0.9, color, alpha: 0.75 });
    }
  }
  update(dt) {
    const P = this.p;
    for (let i = 0; i < MAX; i++) {
      const p = P[i];
      if (p.life <= 0) { this.size[i] = 0; this.alpha[i] = 0; continue; }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = 1 - Math.max(0, p.life) / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gg; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.s0 + (p.s1 - p.s0) * t;
      this.alpha[i] = p.a * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
  clear() { this.p.forEach(p => { p.life = 0; }); }
}
const _c = new THREE.Color();

/** Droppskugga (blob) som läggs på marken under ett objekt. */
export class BlobShadow {
  constructor(scene, size = 1) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.blob(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    this.mesh.renderOrder = 1;
    this.size = size;
    scene.add(this.mesh);
    this._dn = new THREE.Vector3(0, -1, 0);
    this._o = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 0, 1);
  }
  update(col, pos, maxDist = 30) {
    this._o.set(pos.x, pos.y + 0.3, pos.z);
    const h = col.raycast(this._o, this._dn, maxDist);
    if (!h || h.normal.y < 0.2) { this.mesh.visible = false; return null; }
    this.mesh.visible = true;
    const d = Math.max(0, pos.y - h.point.y);
    const s = this.size * Math.max(0.45, 1 - d * 0.06);
    this.mesh.scale.set(s, s, s);
    this.mesh.position.copy(h.point).addScaledVector(h.normal, 0.04);
    this._q.setFromUnitVectors(this._up, h.normal);
    this.mesh.quaternion.copy(this._q);
    this.mesh.material.opacity = Math.max(0.35, 1 - d * 0.05);
    return h;
  }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

/** Additiv glöd-sprite. */
export function glow(color, size = 2, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.radial(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, size);
  s.userData.disposeMat = [s.material];
  return s;
}

/** Expanderande chockvågsring (för markstöt och bossattacker). */
export class Shockwaves {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.geo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  }
  spawn(x, y, z, maxR, color = 0xffffff, dur = 0.45, opts = {}) {
    let w = this.pool.find(p => !p.active);
    if (!w) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 4;
      w = { mesh: m }; this.pool.push(w); this.scene.add(m);
    }
    w.active = true; w.t = 0; w.dur = dur; w.maxR = maxR; w.hurt = !!opts.hurt; w.y = y; w.hitDone = false;
    w.mesh.material.color.set(color);
    w.mesh.position.set(x, y + 0.08, z); w.mesh.visible = true;
    w.mesh.scale.setScalar(0.1);
    return w;
  }
  update(dt, player, onHurt) {
    for (const w of this.pool) {
      if (!w.active) continue;
      w.t += dt;
      const k = w.t / w.dur;
      const r = Math.max(0.1, w.maxR * k);
      w.mesh.scale.set(r, 1 + (w.hurt ? 2 : 0), r);
      w.mesh.material.opacity = 1 - k;
      if (w.hurt && player && !w.hitDone) {
        const dx = player.pos.x - w.mesh.position.x, dz = player.pos.z - w.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (Math.abs(d - r) < 0.6 && player.pos.y - w.y < 0.7 && player.pos.y - w.y > -1) { w.hitDone = true; onHurt && onHurt(w.mesh.position); }
      }
      if (k >= 1) { w.active = false; w.mesh.visible = false; }
    }
  }
  clear() { this.pool.forEach(w => { w.active = false; w.mesh.visible = false; }); }
}
