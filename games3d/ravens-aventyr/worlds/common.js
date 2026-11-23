/* Rävens äventyr – gemensamma byggblock för världarna. */
import * as THREE from 'three';
import { GEO, makeGrass, makeFlowers, rnd, toon, basic } from '../core.js';
import { glow } from '../fx.js';
import { P, outline } from '../models.js';

export const V3 = THREE.Vector3;
const C = new THREE.Color();

/** Gran: stam (kolliderar) + tre koner. */
export function pine(B, x, y, z, s = 1, o = {}) {
  const col = o.color || 0x2f7a3a, col2 = o.color2 || 0x3f9a48;
  B.cyl(x, y + 1.6 * s, z, 0.35 * s, 1.8 * s, { color: 0x6a4a2e, seg: 8, tag: 'nocam' });
  for (let i = 0; i < 3; i++) B.cone(x, y + (1.2 + i * 1.35) * s, z, (2.1 - i * 0.55) * s, 2.3 * s, { color: i % 2 ? col2 : col, collide: i === 0 && o.solid, ry: i, tag: 'nocam' });
  if (o.snow) B.cone(x, y + 4.4 * s, z, 0.7 * s, 1.0 * s, { color: 0xf4f8ff, collide: false });
}
/** Lövträd: stam + rund krona (kronan valfritt kolliderbar). */
export function oak(B, x, y, z, s = 1, o = {}) {
  B.cyl(x, y + 2.4 * s, z, 0.4 * s, 2.6 * s, { color: 0x6a4a2e, seg: 8, tag: 'nocam' });
  const c = o.color || 0x4fa83a;
  B.sphere(x, y + 3.6 * s, z, 1.9 * s, 1.6 * s, 1.9 * s, { color: c, geo: GEO.ico, collide: !!o.solid, tag: 'nocam' });
  B.sphere(x + 1.1 * s, y + 3.2 * s, z + 0.4 * s, 1.2 * s, 1.0 * s, 1.2 * s, { color: c, geo: GEO.ico, collide: false });
  B.sphere(x - 0.9 * s, y + 3.4 * s, z - 0.6 * s, 1.3 * s, 1.1 * s, 1.3 * s, { color: c, geo: GEO.ico, collide: false });
}
/** Blåbärsbuske. */
export function bush(B, x, y, z, s = 1, berries = true) {
  B.sphere(x, y + 0.45 * s, z, 0.9 * s, 0.6 * s, 0.9 * s, { color: 0x3c8a3a, geo: GEO.ico, collide: false });
  if (berries) { const r = rnd((x * 13 + z * 7) | 0); for (let i = 0; i < 6; i++) B.sphere(x + (r() - 0.5) * 1.3 * s, y + (0.5 + r() * 0.4) * s, z + (r() - 0.5) * 1.3 * s, 0.12 * s, 0.12 * s, 0.12 * s, { color: 0x3a4ad0, collide: false }); }
}
/** Dekorsvamp. */
export function shroom(B, x, y, z, s = 1, color = 0xd83a2e, o = {}) {
  B.cyl(x, y + 0.6 * s, z, 0.18 * s, 0.6 * s, { color: 0xf3e6cc, collide: !!o.solid, seg: 8 });
  B.sphere(x, y + 0.65 * s, z, 0.55 * s, 0.35 * s, 0.55 * s, { color, collide: !!o.solid, mat: o.glow ? 'glow' : 'plain' });
}
/** Stuga i falurött. */
export function cottage(B, x, z, ry, w = 6, d = 5, h = 3.2, o = {}) {
  const y = o.y || 0;
  const wall = o.wall || 0xa8322a;
  const c = Math.cos(ry), s = Math.sin(ry);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  B.box(x, y + h / 2, z, w, h, d, { ry, color: wall, mat: 'planks' });
  // vita knutar
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const [px, pz] = L(lx, lz); B.box(px, y + h / 2, pz, 0.35, h, 0.35, { ry, color: 0xf4f0e8, collide: false }); }
  // dörr & fönster
  { const [px, pz] = L(0, d / 2 + 0.03); B.box(px, y + 1.05, pz, 1.1, 2.1, 0.1, { ry, color: 0x4a6a8a, collide: false }); }
  for (const lx of [-w / 2 + 1.2, w / 2 - 1.2]) { const [px, pz] = L(lx, d / 2 + 0.03); B.box(px, y + 1.9, pz, 0.9, 0.9, 0.1, { ry, color: 0xf4f0e8, collide: false }); B.box(px, y + 1.9, pz, 0.7, 0.7, 0.14, { ry, color: 0xffe38a, collide: false, mat: o.lit ? 'glow' : 'plain' }); }
  // tak (två sneda skivor)
  const rh = h * 0.55, ov = 0.5;
  for (const sd of [-1, 1]) {
    const [ax, az] = L(0, sd * (d / 2 + ov)), [bx, bz] = L(0, 0);
    B.ramp(ax, y + h - 0.25, az, bx, y + h + rh, bz, w + ov * 2, 0.3, { mat: 'roof', color: 0xffffff });
  }
  // gavlar: triangulärt prisma under taket
  const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, rh); sh.lineTo(-d / 2, 0);
  const pr = new THREE.ExtrudeGeometry(sh, { depth: w - 0.05, bevelEnabled: false });
  pr.rotateY(Math.PI / 2); pr.translate(-(w - 0.05) / 2, 0, 0);
  const pm = new THREE.Matrix4().compose(new V3(x, y + h - 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(1, 1, 1));
  B.add(pr, pm, { color: wall, mat: 'planks', collide: false });
  pr.dispose();
  // skorsten
  { const [px, pz] = L(w * 0.25, -d * 0.15); B.box(px, y + h + rh + 0.2, pz, 0.6, 1.4, 0.6, { ry, color: 0x8a8a8a, mat: 'bricks' }); }
}
/** Staket längs linje. */
export function fence(B, ax, az, bx, bz, y = 0, color = 0xe8dcc6) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.6)), ry = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i <= n; i++) { const k = i / n; B.box(ax + (bx - ax) * k, y + 0.5, az + (bz - az) * k, 0.18, 1.0, 0.18, { color, collide: false }); }
  B.box((ax + bx) / 2, y + 0.7, (az + bz) / 2, 0.08, 0.14, len, { ry, color, collide: false });
  B.box((ax + bx) / 2, y + 0.35, (az + bz) / 2, 0.08, 0.14, len, { ry, color, collide: false });
}
/** Lykta med glöd. */
export function lamp(B, W, x, y, z, color = 0xffd27a) {
  B.cyl(x, y + 2.2, z, 0.08, 2.2, { color: 0x3a3a40, seg: 8 });
  B.box(x, y + 2.4, z, 0.4, 0.4, 0.4, { color: 0xffe3a0, mat: 'glow', collide: false });
  const g = glow(color, 2.4, 0.55); g.position.set(x, y + 2.4, z); W.group.add(g);
}
/** Spridda punkter (gräs/blommor) där pred(x,z) avgör och height ger y. */
export function scatter(n, area, cx, cz, height, pred, seed = 1) {
  const r = rnd(seed); const out = [];
  let tries = 0;
  while (out.length / 3 < n && tries < n * 6) {
    tries++;
    const x = cx + (r() - 0.5) * area, z = cz + (r() - 0.5) * area;
    if (pred && !pred(x, z)) continue;
    out.push(x, height(x, z), z);
  }
  return new Float32Array(out);
}
export function addGrass(W, q, n, area, cx, cz, height, pred, opts = {}) {
  const k = q.view < 0.7 ? 0.35 : q.view < 0.9 ? 0.65 : q.view < 1.2 ? 1 : 1.4;
  const pts = scatter(Math.round(n * k), area, cx, cz, height, pred, opts.seed || 3);
  if (pts.length) W.group.add(makeGrass(pts, opts));
}
export function addFlowers(W, q, n, area, cx, cz, height, pred, colors) {
  const k = q.view < 0.7 ? 0.4 : 1;
  const pts = scatter(Math.round(n * k), area, cx, cz, height, pred, 17);
  if (pts.length) W.group.add(makeFlowers(pts, colors || [0xff7ab0, 0xffffff, 0xffd84a, 0xa58aff]));
}
/** Vattenfall (dekor, ingen kollision). */
export function waterfall(W, x, y, z, w, h, ry = 0) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 8);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      void main(){ float s = sin(vUv.x * 40.0 + sin(vUv.x * 13.0) * 3.0) * 0.5 + 0.5; float f = fract(vUv.y * 3.0 + time * 1.6 + s * 0.3);
      vec3 c = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), smoothstep(0.75, 1.0, f) * 0.8 + s * 0.15);
      gl_FragColor = vec4(c, 0.78); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.renderOrder = 3;
  m.userData.update = t => { mat.uniforms.time.value = t; };
  W.group.add(m);
  return m;
}
/** Portal-ring med virvlande skiva. */
export function portalMesh(color, open) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 10, 32), toon(open ? 0xe8d8b0 : 0x8a8a8a));
  ring.castShadow = true;
  g.add(ring);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const s = new THREE.Mesh(GEO.ico, toon(open ? color : 0x666666)); s.scale.setScalar(0.32); s.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0); s.userData.sharedGeo = true; g.add(s); }
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(open ? color : 0x333344) }, open: { value: open ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float time, open; uniform vec3 col; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float sw = sin(a * 3.0 + r * 10.0 - time * 3.0) * 0.5 + 0.5;
        vec3 c = mix(col * 0.6, col * 1.6 + 0.2, sw * open) * (1.2 - r * 0.6);
        if (open < 0.5) c = mix(vec3(0.12, 0.12, 0.18), vec3(0.2, 0.2, 0.3), sw * 0.3);
        gl_FragColor = vec4(c, 0.92 * smoothstep(1.0, 0.92, r)); }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.0, 40), mat);
  g.add(disc);
  g.userData.update = t => { mat.uniforms.time.value = t; };
  outline(g, 0.03);
  return g;
}
/** Ö/platå: cylinderkulle med gräs ovanpå och jord på sidan. */
export function mesa(B, x, top, z, r, h, o = {}) {
  B.cyl(x, top - 0.35, z, r * 0.97, h - 0.35, { color: o.side || 0x8a6a4a, mat: 'noise', seg: o.seg });
  B.cyl(x, top, z, r, 0.45, { color: o.top || 0x5fb44a, seg: o.seg });
}
/** Sant om ingen mynt/samlarsak/sten finns inom r meter (så att dekorträd inte hamnar ovanpå dem). */
export function clearOf(W, x, z, r = 3.2) {
  const r2 = r * r;
  for (const c of W.coins.list) { const dx = c.home.x - x, dz = c.home.z - z; if (dx * dx + dz * dz < r2) return false; }
  for (const b of W.berries) { const dx = b.p.x - x, dz = b.p.z - z; if (dx * dx + dz * dz < r2) return false; }
  for (const s of W.stones) { if (!s) continue; const dx = s.p.x - x, dz = s.p.z - z; if (dx * dx + dz * dz < r2) return false; }
  return true;
}
export { P, glow, basic, toon };
