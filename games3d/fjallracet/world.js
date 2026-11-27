/**
 * Fjällracet – värld runt banan: himmel, ljus, dimma, terräng, vatten, landskap (instansierat),
 * åskådare, väder och horisont.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { makeRng } from '../../engine/kit.js';
import * as TX from './textures.js';
import { colorize, merge, treeSpruce, treeBirch, treePine, rockGeo, cottageGeo, turbineTower, turbineRotor, spectatorBody, spectatorHead } from './props.js';
import { buildThemeScenery, buildLampPosts } from './scenery.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);
const _tc = new THREE.Color();

/* ------------------------------------------------------------------ Himmel */
function makeSky(th) {
  const s = th.sky;
  const el = s.sunEl * Math.PI / 180, az = s.sunAz * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(s.top) }, horizon: { value: new THREE.Color(s.horizon) }, bottom: { value: new THREE.Color(s.bottom) },
      sunColor: { value: new THREE.Color(s.sun) }, sunDir: { value: sunDir }, sunSize: { value: s.sunSize },
      stars: { value: s.stars || 0 }, aurora: { value: s.aurora || 0 }, moon: { value: s.moon ? 1 : 0 }, clouds: { value: s.clouds || 0 }, time: { value: 0 }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; gl_Position.z = p.w * 0.99995; }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float sunSize, stars, aurora, moon, clouds, time;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 col = y > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, y), 0.75)) : mix(horizon, bottom, smoothstep(0.0, -0.2, y));
        float sd = max(dot(d, sunDir), 0.0);
        if (moon > 0.5) {
          col += sunColor * pow(sd, 200.0) * 0.25;
          float disc = smoothstep(0.99955, 0.9997, sd);
          col = mix(col, sunColor * 1.4, disc);
        } else {
          col += sunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.45) * sunSize;
          col += sunColor * smoothstep(0.9993 - 0.0005 * sunSize, 0.99965, sd) * 4.0;
        }
        if (stars > 0.0 && y > 0.0) {
          vec3 p = floor(d * 380.0);
          float h = hash(p);
          float tw = 0.6 + 0.4 * sin(time * 2.0 + h * 50.0);
          col += vec3(smoothstep(0.9975, 1.0, h)) * stars * smoothstep(0.02, 0.25, y) * tw * 1.4;
        }
        if (aurora > 0.0 && y > 0.04) {
          vec2 q = d.xz / (y + 0.35);
          float w1 = sin(q.x * 1.6 + sin(q.y * 1.1 + time * 0.12) * 2.2 + time * 0.07);
          float w2 = sin(q.x * 0.9 - q.y * 1.4 + sin(q.x * 2.3 - time * 0.1) * 1.4 + 1.7);
          float band = smoothstep(0.55, 1.0, w1) + 0.6 * smoothstep(0.7, 1.0, w2);
          float rays = 0.55 + 0.45 * sin(q.x * 26.0 + q.y * 9.0 + time * 0.6);
          float hf = smoothstep(0.04, 0.22, y) * smoothstep(0.85, 0.3, y);
          vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.65, 0.25, 1.0), smoothstep(0.25, 0.65, y));
          col += ac * band * rays * hf * aurora * 0.75;
        }
        if (clouds > 0.0 && y > 0.0) {
          vec2 q = d.xz / (y + 0.12) * 1.4 + vec2(time * 0.012, time * 0.004);
          float n = vn(q) * 0.55 + vn(q * 2.3 + 7.0) * 0.3 + vn(q * 5.1 + 3.0) * 0.15;
          float c = smoothstep(0.5, 0.78, n) * smoothstep(0.02, 0.2, y);
          col = mix(col, mix(vec3(0.86, 0.9, 0.96), vec3(1.0), smoothstep(0.6, 0.9, n)), c * clouds * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, mat, sunDir };
}

/** Åskådarmaterial som hoppar i vertexshadern (gemensam tid/uppspelthet). */
function cheerMaterial(base, uniforms) {
  const m = new THREE.MeshStandardMaterial(base);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uCheer = uniforms.uCheer;
    sh.vertexShader = 'uniform float uTime; uniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float ph = float(gl_InstanceID) * 1.731;
      transformed.y += abs(sin(uTime * (5.0 + mod(ph, 3.0)) + ph)) * (0.08 + 0.3 * uCheer);
      #endif`);
  };
  return m;
}

/* ------------------------------------------------------------------ Instanser i chunkar */
export class Chunked {
  constructor(geo, mat, chunk = 220, opts = {}) { this.geo = geo; this.mat = mat; this.chunk = chunk; this.map = new Map(); this.opts = opts; }
  add(m4, color) {
    const e = m4.elements; const key = Math.floor(e[12] / this.chunk) + ',' + Math.floor(e[14] / this.chunk);
    let l = this.map.get(key); if (!l) { l = []; this.map.set(key, l); }
    l.push([m4.clone(), color]);
  }
  build(group, disp) {
    let total = 0;
    for (const list of this.map.values()) {
      const im = new THREE.InstancedMesh(this.geo, this.mat, list.length);
      list.forEach(([m, c], i) => { im.setMatrixAt(i, m); if (c) im.setColorAt(i, c); });
      im.castShadow = !!this.opts.shadow; im.receiveShadow = this.opts.receive !== false;
      im.computeBoundingSphere();
      group.add(im); disp.push(im); total += list.length;
    }
    return total;
  }
}

/* ------------------------------------------------------------------ Världen */
export class World {
  /**
   * @param track Track
   * @param scene THREE.Scene
   * @param q kvalitetsobjekt (settings.q)
   * @param onProgress (f, text)
   */
  constructor(track, scene, renderer, q) {
    this.track = track; this.scene = scene; this.q = q; this.renderer = renderer;
    this.th = track.theme; this.group = new THREE.Group(); this.group.name = 'world';
    this.disp = [];
    this.time = 0;
    this.cheer = { uTime: { value: 0 }, uCheer: { value: 0 } };
    this.animated = [];
    this.rng = makeRng('world:' + track.def.id + (track.reverse ? 'r' : ''));
    this.noise = new SimplexNoise({ random: this.rng });
    this.view = q.view;
    this.waterY = this.th.water != null ? track.minY + this.th.water : null;
  }

  buildSkyAndLights() {
    const th = this.th, scene = this.scene;
    const sky = this.sky = makeSky(th);
    this.group.add(sky.mesh);
    this.disp.push(sky.mesh.geometry, sky.mat);
    const far = th.fog.far * (0.55 + this.view * 0.5);
    this.fogFar = far;
    scene.fog = new THREE.Fog(th.fog.color, far * 0.1, far);
    scene.background = new THREE.Color(th.fog.color);
    this.hemi = new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity * 0.75);
    this.sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity);
    this.sunDir = sky.sunDir.clone();
    const sh = this.q.shadows;
    this.sun.castShadow = sh;
    if (sh) {
      this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      const c = this.sun.shadow.camera; const S = 70; c.left = -S; c.right = S; c.top = S; c.bottom = -S; c.near = 1; c.far = 500;
      this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.5;
    }
    this.group.add(this.hemi, this.sun, this.sun.target);
    // miljökarta för reflektioner (himmel + lite neon i staden)
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const skyCopy = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky.mat);
    envScene.add(skyCopy);
    if (th.night && (th.lamps || th.edgeGlow)) {
      const cols = th.edgeGlow ? [0xff3aa0, 0x34d4ff, 0x40ffd0, 0x9a5bff, 0x34d4ff] : [0xffc070, 0xffe0a0, 0xff9a50, 0xfff0c0, 0x8ab0ff];
      for (let k = 0; k < 26; k++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(6 + this.rng() * 10, 2 + this.rng() * 4, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[k % cols.length]).multiplyScalar(1.3) }));
        const a = this.rng() * Math.PI * 2; m.position.set(Math.cos(a) * 60, 2 + this.rng() * 25, Math.sin(a) * 60); m.lookAt(0, m.position.y, 0);
        envScene.add(m);
      }
    }
    const rt = pm.fromScene(envScene, 0.02);
    this.envRT = rt;
    scene.environment = rt.texture;
    scene.environmentIntensity = th.night ? 0.45 : 0.55;
    envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== sky.mat) o.material.dispose(); });
    pm.dispose();
    // några riktiga punktljus som följer med till gatlamporna närmast bilen (lyser upp bilar och räcken)
    this.lampLights = [];
    const lay = this.track.lampLayout();
    if (lay && th.pointLights) {
      const lc = th.lamps.color;
      for (let k = 0; k < th.pointLights; k++) {
        const l = new THREE.PointLight(new THREE.Color(lc[0], lc[1], lc[2]), 0, 34, 1.6);
        l.castShadow = false; this.group.add(l); this.lampLights.push(l);
      }
      this._lf = this.track.constructor.makeFrame(); this._lf.i = -1; this._lv = new THREE.Vector3();
    }
  }

  /* ---------- terräng ---------- */
  buildTerrain() {
    const tr = this.track, th = this.th, q = this.q;
    const margin = 360 + 260 * this.view;
    const bb = tr.bbox;
    const x0 = bb.x0 - margin, x1 = bb.x1 + margin, z0 = bb.z0 - margin, z1 = bb.z1 + margin;
    let cell = { 0.6: 11, 0.8: 8.5, 1.0: 7, 1.35: 6 }[q.view] || 8;
    while (((x1 - x0) / cell) * ((z1 - z0) / cell) > 110000) cell *= 1.12;
    const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
    this.tg = { x0, z0, cell, nx, nz };
    const cnt = nx * nz;
    const nearest = new Int32Array(cnt).fill(-1);
    const nd = new Float32Array(cnt).fill(1e12);
    const P = tr.P, N = tr.N;
    const pen = (i) => tr.bridge[i] ? 400 : 0; // broar förlorar mot vanlig väg vid korsningar
    const vx = (c) => x0 + (c % nx) * cell, vz = (c) => z0 + Math.floor(c / nx) * cell;
    const d2 = (c, i) => { const dx = vx(c) - P[i * 3], dz = vz(c) - P[i * 3 + 2]; return dx * dx + dz * dz + pen(i); };
    // frö
    const rad = Math.ceil((tr.limit + 4) / cell);
    for (let i = 0; i < N; i++) {
      const cx = Math.round((P[i * 3] - x0) / cell), cz = Math.round((P[i * 3 + 2] - z0) / cell);
      for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
        const x = cx + a, z = cz + b; if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
        const c = z * nx + x; const dd = d2(c, i);
        if (dd < nd[c]) { nd[c] = dd; nearest[c] = i; }
      }
    }
    // spridning (två svep, 8-grannar)
    const relax = (c, n) => { const i = nearest[n]; if (i < 0) return; const dd = d2(c, i); if (dd < nd[c]) { nd[c] = dd; nearest[c] = i; } };
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
        const c = z * nx + x;
        if (x > 0) relax(c, c - 1); if (z > 0) relax(c, c - nx); if (x > 0 && z > 0) relax(c, c - nx - 1); if (x < nx - 1 && z > 0) relax(c, c - nx + 1);
      }
      for (let z = nz - 1; z >= 0; z--) for (let x = nx - 1; x >= 0; x--) {
        const c = z * nx + x;
        if (x < nx - 1) relax(c, c + 1); if (z < nz - 1) relax(c, c + nx); if (x < nx - 1 && z < nz - 1) relax(c, c + nx + 1); if (x > 0 && z < nz - 1) relax(c, c + nx - 1);
      }
    }
    this.nearest = nearest;
    // öppenhet utjämnad längs banan
    const openL = new Float32Array(N), openR = new Float32Array(N);
    for (let i = 0; i < N; i++) { openL[i] = tr.openL[i]; openR[i] = tr.openR[i]; }
    const sm = (arr) => { let a = arr; for (let p = 0; p < 2; p++) { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let k = -12; k <= 12; k++) s += a[(i + k + N) % N]; o[i] = s / 25; } a = o; } return a; };
    const oL = sm(openL), oR = sm(openR);
    const bridgeS = sm(Float32Array.from(tr.bridge));

    this._prepNatural();
    const heights = new Float32Array(cnt);
    const dist = new Float32Array(cnt);
    const lim = tr.limit;
    const R = tr.R;
    const nat = this._natural.bind(this);
    const flatX = Math.max(2.5, cell * 1.05);
    for (let c = 0; c < cnt; c++) {
      const x = vx(c), z = vz(c);
      let i = nearest[c];
      if (i < 0) { heights[c] = nat(x, z, tr.minY, 999, 0, 0); dist[c] = 999; continue; }
      // förfina: exakt projektion på närmaste segment (±5 sampel)
      let bj = i, bt = 0, bd2 = Infinity;
      for (let k = -5; k <= 5; k++) {
        const a = ((i + k) % N + N) % N, b = (a + 1) % N;
        const sx = P[b * 3] - P[a * 3], sz = P[b * 3 + 2] - P[a * 3 + 2];
        const qx = x - P[a * 3], qz = z - P[a * 3 + 2];
        let t = (qx * sx + qz * sz) / (sx * sx + sz * sz); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - sx * t, ez = qz - sz * t, e2 = ex * ex + ez * ez + pen(a);
        if (e2 < bd2) { bd2 = e2; bj = a; bt = t; }
      }
      i = bj;
      const i2 = (i + 1) % N;
      const cxp = P[i * 3] + (P[i2 * 3] - P[i * 3]) * bt, cyp = P[i * 3 + 1] + (P[i2 * 3 + 1] - P[i * 3 + 1]) * bt, czp = P[i * 3 + 2] + (P[i2 * 3 + 2] - P[i * 3 + 2]) * bt;
      const px = x - cxp, pz = z - czp;
      const rl = Math.hypot(R[i * 3], R[i * 3 + 2]) || 1;
      const l = (px * R[i * 3] + pz * R[i * 3 + 2]) / rl;
      const dd = Math.sqrt(px * px + pz * pz);
      dist[c] = dd;
      const roadY = cyp + R[i * 3 + 1] * clamp(l, -lim, lim);
      const side = l < 0 ? -1 : 1;
      const open = side < 0 ? oL[i] : oR[i];
      let natural = nat(x, z, P[i * 3 + 1], dd, open, bridgeS[i]);
      // stup vid öppna kanter
      if (open > 0.01) {
        const drop = this.waterY != null ? Math.min(this.waterY - 5, roadY - 6) : roadY - 34;
        const w2 = smooth01((dd - lim - 3) / 9);
        natural = natural * (1 - open) + (drop + (natural - P[i * 3 + 1]) * 0.15) * open;
        natural = roadY - 0.35 + (natural - roadY + 0.35) * w2;
      }
      const blendW = { wet: 8, neo: 8, ice: 12, airfield: 10 }[th.road] || (th.flatBlend || 30);
      let w = smooth01((dd - (lim + flatX)) / blendW);
      if (open > 0.01) w = Math.max(w, smooth01((dd - lim - 3) / 4) * open);
      let h = (roadY - 0.35) * (1 - w) + natural * w;
      if (dd < tr.limit + 1) h = Math.min(h, roadY - 0.3);
      const bs = bridgeS[i];
      if (bs > 0.01) {
        const low = this.waterY != null ? this.waterY - 6 : Math.max(tr.minY - 0.4, P[i * 3 + 1] - 16);
        const target = Math.min(natural, low + smooth01((dd - lim - 6) / 40) * (natural - low));
        h = h * (1 - bs) + Math.min(h, target) * bs;
        if (tr.bridge[i]) h = Math.min(h, target);
      }
      heights[c] = h;
    }
    this.heights = heights; this.dist = dist;

    // geometri
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    // PlaneGeometry efter rotateX: rad 0 = z0? (y=+h/2 → z = -h/2 efter rotation) → rader går från z0 till z1
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const cx = Math.round((pos.getX(k) - x0) / cell), cz = Math.round((pos.getZ(k) - z0) / cell);
      pos.setY(k, heights[cz * nx + cx]);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const cc = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const cx = Math.round((x - x0) / cell), cz = Math.round((z - z0) / cell);
      this._terrainColor(cc, x, y, z, nrm.getY(k), dist[cz * nx + cx]);
      col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // uv för detaljtextur
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k) / 14, pos.getZ(k) / 14);
    const detail = TX.groundTex('detail');
    const wetGround = th.weather === 'rain';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: th.road === 'ice' ? 0.45 : wetGround ? 0.6 : 0.96, metalness: wetGround ? 0.1 : 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.name = 'terrain';
    this.group.add(mesh);
    this.disp.push(geo, mat);
    this.terrain = mesh;
  }

  /** Förberäknar strandlinjer (taggar coast/quay/lake) och gruvgropen. */
  _prepNatural() {
    const tr = this.track, N = tr.N, P = tr.P;
    let cx = 0, cz = 0; for (let i = 0; i < N; i++) { cx += P[i * 3]; cz += P[i * 3 + 2]; } cx /= N; cz /= N;
    this.center = [cx, cz];
    const shoreTag = { gotland: 'coast', hamn: 'quay', dalarna: 'lake' }[tr.def.theme];
    this.shore = null;
    if (shoreTag) {
      const t = tr.tags.find(t => t[shoreTag]);
      if (t) {
        const a = Math.round(t.from * N), b = Math.round(t.to * N), m = Math.round((a + b) / 2) % N;
        const ia = a % N, ib = b % N;
        let tx = P[ib * 3] - P[ia * 3], tz = P[ib * 3 + 2] - P[ia * 3 + 2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        let nx = -tz, nz = tx;
        const mx = P[m * 3], mz = P[m * 3 + 2];
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const gap = { gotland: 22, hamn: 9, dalarna: 26 }[tr.def.theme];
        this.shore = { mx, mz, nx, nz, tx, tz, off: tr.limit + gap, ramp: { gotland: 34, hamn: 1.2, dalarna: 30 }[tr.def.theme], ia, ib, wig: tr.def.theme === 'hamn' ? 0 : 9 };
      }
    }
    if (tr.def.theme === 'gruva') {
      // gropen: mittpunkt = tyngdpunkten av de djupaste delarna
      const th = tr.minY + (tr.maxY - tr.minY) * 0.45;
      let sx = 0, sz = 0, n = 0;
      for (let i = 0; i < N; i++) if (P[i * 3 + 1] < th) { sx += P[i * 3]; sz += P[i * 3 + 2]; n++; }
      sx /= n; sz /= n;
      let rr = 0; for (let i = 0; i < N; i++) if (P[i * 3 + 1] < tr.maxY - 4) rr = Math.max(rr, Math.hypot(P[i * 3] - sx, P[i * 3 + 2] - sz));
      this.pit = { x: sx, z: sz, rim: rr + 30, floor: tr.minY - 2, top: tr.maxY - 0.5 };
    }
  }
  /** Signerat avstånd ut över strandlinjen (> 0 = vatten). */
  shoreT(x, z) {
    const s = this.shore; if (!s) return -999;
    return (x - s.mx) * s.nx + (z - s.mz) * s.nz - s.off + (s.wig ? this.noise.noise(x / 60, z / 60) * s.wig : 0);
  }

  /** Naturlig terränghöjd (utan vägpåverkan). bs = närhet till bro (0..1). */
  _natural(x, z, baseY, dd, open, bs = 0) {
    const n = this.noise, th = this.th;
    const fbm = (s, oct = 4) => { let a = 0, f = 1, amp = 1, sum = 0; for (let o = 0; o < oct; o++) { a += n.noise(x * s * f, z * s * f) * amp; sum += amp; f *= 2.03; amp *= 0.5; } return a / sum; };
    const tr = this.track, W = this.waterY;
    const shore = (land, depth) => { const t = this.shoreT(x, z); if (t <= -998) return land; const f = smooth01(t / this.shore.ramp); return land + (W - depth - land) * f; };
    switch (tr.def.theme) {
      case 'midsommar': {
        const hills = fbm(1 / 260) * 26 + fbm(1 / 70, 2) * 4;
        return baseY + (hills - 2) * smooth01((dd - 12) / 120);
      }
      case 'skargard': {
        const isl = fbm(1 / 160) * 22 + fbm(1 / 40, 3) * 4;
        return W - 7 + Math.max(0, isl + 4) * 1.1 + (baseY - W) * (1 - smooth01((dd - 10) / 70)) * 0.9;
      }
      case 'odemark': {
        const r = 1 - Math.abs(n.noise(x / 140, z / 90));
        const dunes = r * r * 16 + fbm(1 / 300) * 14;
        return baseY - 1.5 + dunes * smooth01((dd - 14) / 80);
      }
      case 'fjall': {
        const r = 1 - Math.abs(fbm(1 / 420, 5));
        const m = r * r * 190 + fbm(1 / 120, 3) * 22;
        const up = smooth01((dd - 18) / 260);
        return baseY + m * up * (1 - open) + (fbm(1 / 60, 2) * 4) * (1 - up);
      }
      case 'stad': case 'tivoli': return baseY - 0.08;
      case 'is': {
        const shoreF = smooth01((dd - 230) / 160);
        return baseY - 0.12 + shoreF * (8 + fbm(1 / 180) * 40 + 20);
      }
      case 'kust': {
        // höga klippor: land (skog/berg) eller hav, skarp övergång = klippa. Fjärd under hängbron.
        const up = smooth01((dd - 14) / 160);
        const landH = baseY + (fbm(1 / 170, 3) * 0.5 + 0.5) * 55 * up + fbm(1 / 45, 2) * 3;
        const seaH = W - 16;
        let c = smooth01((fbm(1 / 420, 4) + 0.1) / 0.09);
        c = Math.max(c, 1 - smooth01((dd - 26) / 40));
        c *= 1 - smooth01((bs - 0.15) / 0.5);
        return seaH + (landH - seaH) * c;
      }
      case 'hamn': return shore(baseY - 0.08, 7);
      case 'gotland': {
        const land = baseY - 0.25 + fbm(1 / 220, 3) * 3.5 * smooth01((dd - 20) / 120);
        return shore(land, 5);
      }
      case 'lappland': {
        const up = smooth01((dd - 16) / 200);
        const r = 1 - Math.abs(fbm(1 / 650, 4));
        return baseY + fbm(1 / 260) * 16 * up + r * r * 150 * smooth01((dd - 280) / 380);
      }
      case 'dalarna': {
        const up = smooth01((dd - 14) / 150);
        return shore(baseY + (fbm(1 / 240) * 26 + fbm(1 / 70, 2) * 4 + 6) * up, 8);
      }
      case 'oland': {
        const land = baseY - 0.3 + fbm(1 / 260, 3) * 1.6 * smooth01((dd - 15) / 60);
        // sund under bron
        const sea = W - 6;
        return land + (sea - land) * smooth01((bs - 0.1) / 0.5);
      }
      case 'flyg': return baseY - 0.06 + fbm(1 / 300, 2) * 1.2 * smooth01((dd - 60) / 200);
      case 'gruva': {
        const p = this.pit, r = Math.hypot(x - p.x, z - p.z);
        if (r > p.rim) return p.top - 0.6 + fbm(1 / 160, 3) * 5 * smooth01((r - p.rim) / 80) + fbm(1 / 40, 2) * 0.8;
        // terrasserat dagbrott: hyllor med branta kanter
        const f = smooth01(r / p.rim), hgt = (p.top - p.floor) * Math.pow(f, 0.9);
        const step = 8, k = Math.floor(hgt / step), fr = hgt / step - k;
        return p.floor + k * step + step * smooth01((fr - 0.55) / 0.4);
      }
      case 'skog': {
        const up = smooth01((dd - 8) / 90);
        return baseY + (fbm(1 / 190) * 30 + fbm(1 / 55, 2) * 5 + 4) * up;
      }
      default: return baseY;
    }
  }
  _terrainColor(c, x, y, z, ny, dd) {
    const th = this.th, n = this.noise, W = this.waterY;
    const v = n.noise(x / 37, z / 37) * 0.5 + 0.5, v2 = n.noise(x / 9, z / 9) * 0.5 + 0.5;
    const slope = 1 - ny;
    const set = (hex) => c.setHex(hex);
    const lerpHex = (hex, f) => c.lerp(_tc.setHex(hex), f);
    switch (this.track.def.theme) {
      case 'midsommar': {
        set(0x4e7d2f); lerpHex(0x76a23e, v * 0.7);
        if (v2 > 0.78) lerpHex(0xd8d070, 0.25);
        if (slope > 0.35) lerpHex(0x7a6a54, smooth01((slope - 0.35) / 0.3));
        if (W != null && y < W + 0.8) lerpHex(0x8a7a5a, 0.8);
        break;
      }
      case 'skargard': {
        set(0x9a7f74); lerpHex(0xb59484, v);
        if (ny > 0.9 && y > W + 3 && v2 > 0.45) lerpHex(0x56723a, 0.6 * smooth01((v2 - 0.45) / 0.3));
        if (y < W + 0.6) lerpHex(0x4a4038, 0.6);
        break;
      }
      case 'odemark': { set(0xd7a96a); lerpHex(0xe8c08a, v); if (v2 > 0.72 && slope < 0.2) lerpHex(0x8a8a4a, 0.4); break; }
      case 'fjall': { set(0xf1f5fa); lerpHex(0xd9e2ee, v * 0.6); if (slope > 0.42) lerpHex(0x6e6a68, smooth01((slope - 0.42) / 0.25)); break; }
      case 'stad': { set(0x24252c); lerpHex(0x2e3038, v); if (v2 > 0.7) lerpHex(0x1a1c22, 0.5); break; }
      case 'is': {
        if (dd < 220) { set(0x9cc4de); lerpHex(0xe6f0f8, smooth01(v * 1.4 - 0.3)); }
        else { set(0xeaf0f6); if (slope > 0.4) lerpHex(0x707478, 0.6); }
        break;
      }
      case 'kust': {
        set(0x3a5a2e); lerpHex(0x4e6a34, v); lerpHex(0x2a4426, v2 * 0.4);
        if (slope > 0.32) lerpHex(v2 > 0.5 ? 0x8a6a62 : 0x77706a, smooth01((slope - 0.32) / 0.22));
        if (y < W + 2.5) lerpHex(0x5a5048, 0.85);
        break;
      }
      case 'hamn': {
        set(0x4a4c52); lerpHex(0x55575c, v); if (v2 > 0.8) lerpHex(0x3a3c40, 0.5);
        if (y < W + 0.5) lerpHex(0x2a2a2c, 0.9);
        break;
      }
      case 'gotland': {
        set(0x9aa058); lerpHex(0xc8c08a, v * 0.8); if (v2 > 0.7) lerpHex(0xd0ccc0, 0.6);
        if (v2 < 0.2 && dd > 30) lerpHex(0xc8484a, 0.35);
        const t = this.shoreT(x, z); if (t > -14) lerpHex(0xb8b4aa, smooth01((t + 14) / 10));
        break;
      }
      case 'lappland': { set(0xe8eef6); lerpHex(0xcfdcec, v * 0.7); if (slope > 0.45) lerpHex(0x5a5a62, smooth01((slope - 0.45) / 0.25)); break; }
      case 'dalarna': {
        set(0x5a8a36); lerpHex(0x7aa448, v * 0.6); if (v2 > 0.8) lerpHex(0xe8e070, 0.25);
        if (slope > 0.35) lerpHex(0x6a5a44, smooth01((slope - 0.35) / 0.3));
        if (this.shoreT(x, z) > -6) lerpHex(0x8a7a5a, 0.7);
        break;
      }
      case 'oland': {
        set(0x9a9a64); lerpHex(0xb8b07a, v * 0.7);
        if (v2 > 0.62) lerpHex(0xc8c4b8, smooth01((v2 - 0.62) / 0.2) * 0.8); // kalkhällar
        if (v2 < 0.18) lerpHex(0x8a5a8a, 0.35); // ljung
        if (W != null && y < W + 1.2) lerpHex(0x8a8070, 0.8);
        break;
      }
      case 'flyg': { set(0x4a6a32); lerpHex(0x5a7a3a, v * 0.7); if (dd < 40) lerpHex(0x5a5c60, smooth01((40 - dd) / 18) * 0.7); break; }
      case 'gruva': {
        set(0x8a6a54); lerpHex(0x9a7a5a, v); lerpHex(0x6a5a50, v2 * 0.5);
        if (slope > 0.4) lerpHex(0x5a4a44, smooth01((slope - 0.4) / 0.3));
        if (this.pit && Math.hypot(x - this.pit.x, z - this.pit.z) > this.pit.rim + 20) lerpHex(0x5a6a3a, 0.55 * smooth01(v2 * 1.5));
        break;
      }
      case 'tivoli': { set(0x3a5a2e); lerpHex(0x4a6a36, v); if (dd < 30 || v2 > 0.72) lerpHex(0x6a6460, 0.75); break; }
      case 'skog': { set(0x3e5a2c); lerpHex(0x5a6a34, v * 0.7); lerpHex(0x6a5a3a, v2 * 0.35); if (slope > 0.4) lerpHex(0x5a564e, 0.5); break; }
      default: set(0x808080);
    }
    c.multiplyScalar(0.92 + v2 * 0.16);
  }

  /** Terränghöjd vid (x,z) – bilinjär interpolation. */
  heightAt(x, z) {
    const t = this.tg; if (!t) return 0;
    const fx = clamp((x - t.x0) / t.cell, 0, t.nx - 1.001), fz = clamp((z - t.z0) / t.cell, 0, t.nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
    const H = this.heights, nx = t.nx;
    const h00 = H[iz * nx + ix], h10 = H[iz * nx + ix + 1], h01 = H[(iz + 1) * nx + ix], h11 = H[(iz + 1) * nx + ix + 1];
    return (h00 * (1 - ax) + h10 * ax) * (1 - az) + (h01 * (1 - ax) + h11 * ax) * az;
  }
  /** Avstånd till banans mittlinje (ungefärligt, från terrängrutnätet) + närmaste index. */
  roadInfo(x, z) {
    const t = this.tg;
    const cx = Math.round((x - t.x0) / t.cell), cz = Math.round((z - t.z0) / t.cell);
    if (cx < 0 || cz < 0 || cx >= t.nx || cz >= t.nz) return { d: 9999, i: -1 };
    const i = this.nearest[cz * t.nx + cx];
    if (i < 0) return { d: 9999, i };
    const P = this.track.P;
    return { d: Math.hypot(x - P[i * 3], z - P[i * 3 + 2]), i };
  }

  buildWater() {
    if (this.waterY == null) return;
    const t = this.tg;
    const size = Math.max(t.nx, t.nz) * t.cell * 1.6;
    const g = new THREE.PlaneGeometry(size, size, 1, 1); g.rotateX(-Math.PI / 2);
    const nt = TX.waterNormalTex();
    const th = this.th;
    const mat = new THREE.MeshStandardMaterial({ color: th.waterColor || ({ skargard: 0x1d4a66, kust: 0x1a3e58, hamn: 0x1e2a30, dalarna: 0x2a4a5a }[this.track.def.theme] || 0x2a4a50), roughness: th.weather === 'rain' ? 0.12 : 0.06, metalness: 0.1, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.92, envMapIntensity: 1.2 });
    nt.repeat.set(size / 24, size / 24);
    const m = new THREE.Mesh(g, mat);
    m.position.set(t.x0 + (t.nx - 1) * t.cell / 2, this.waterY, t.z0 + (t.nz - 1) * t.cell / 2);
    m.receiveShadow = true; m.renderOrder = 1;
    this.group.add(m); this.disp.push(g, mat);
    this.water = m; this.waterTex = nt;
  }

  /* ---------- landskap ---------- */
  buildScenery() {
    const tr = this.track, th = this.th, rng = this.rng, q = this.q;
    const dens = { 0.6: 0.45, 0.8: 0.75, 1.0: 1.0, 1.35: 1.3 }[q.view] || 0.8;
    const lim = tr.limit;
    const t = this.tg;
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
    const eul = new THREE.Euler();
    const place = (ch, x, z, s, rotY = rng() * 6.28, color = null, yOff = 0, sy = s) => {
      const y = this.heightAt(x, z) + yOff;
      pp.set(x, y, z); eul.set(0, rotY, 0); qq.setFromEuler(eul); sc.set(s, sy, s);
      m4.compose(pp, qq, sc); ch.add(m4, color);
    };
    const W = (t.nx - 1) * t.cell, H = (t.nz - 1) * t.cell;
    const randPt = () => [t.x0 + rng() * W, t.z0 + rng() * H];
    const veg = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const vegFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    this.disp.push(veg, vegFlat);
    const reg = (geo) => { this.disp.push(geo); return geo; };
    const tint = (base, amt) => { const c = new THREE.Color(1, 1, 1); c.offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * amt); return c; };
    const sets = [];
    const scatter = (geo, mat, count, minD, maxD, sMin, sMax, opts = {}) => {
      const ch = new Chunked(geo, mat, 220, { shadow: opts.shadow !== false && q.shadows });
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 12) {
        tries++;
        const [x, z] = randPt();
        const ri = this.roadInfo(x, z);
        if (ri.d < minD || ri.d > maxD) continue;
        if (opts.filter && !opts.filter(x, z, ri)) continue;
        const h = this.heightAt(x, z);
        if (this.waterY != null && h < this.waterY + (opts.waterMargin != null ? opts.waterMargin : 0.6)) continue;
        if (opts.bridgeAvoid !== false && ri.i >= 0 && (tr.bridge[ri.i] || tr.tunnel[ri.i]) && ri.d < lim + 30) continue;
        const s = sMin + rng() * (sMax - sMin);
        place(ch, x, z, s, rng() * 6.28, opts.tint ? tint(0, opts.tint) : null, opts.yOff || 0, opts.squash ? s * (0.6 + rng() * 0.5) : s);
        placed++;
      }
      sets.push(ch);
      return ch;
    };
    const theme = tr.def.theme;
    if (theme === 'midsommar') {
      scatter(reg(treeBirch()), veg, 900 * dens, lim + 6, 700, 0.8, 1.35, { tint: 0.12 });
      scatter(reg(treeSpruce(false)), veg, 700 * dens, lim + 10, 800, 0.9, 1.6, { tint: 0.1 });
      scatter(reg(rockGeo()), vegFlat, 120 * dens, lim + 5, 400, 0.6, 1.8, { tint: 0.1, squash: true });
      this._cottages(0xa0281e, 14);
      this._flowers(1800 * dens);
      this._maypole();
    } else if (theme === 'skargard') {
      scatter(reg(treePine(false)), veg, 600 * dens, lim + 6, 700, 0.8, 1.4, { tint: 0.1, waterMargin: 2 });
      scatter(reg(treeSpruce(false)), veg, 200 * dens, lim + 10, 600, 0.8, 1.3, { tint: 0.1, waterMargin: 3 });
      scatter(reg(rockGeo()), vegFlat, 260 * dens, lim + 4, 500, 0.8, 3.2, { tint: 0.08, squash: true, waterMargin: -2, shadow: false });
      this._boathouses();
      this._sailboats();
      this._lighthouse();
    } else if (theme === 'odemark') {
      scatter(reg(treePine(true)), veg, 160 * dens, lim + 12, 700, 0.7, 1.2, { tint: 0.12 });
      scatter(reg(rockGeo()), vegFlat, 160 * dens, lim + 6, 600, 0.6, 2.4, { tint: 0.1, squash: true });
      this._turbines();
    } else if (theme === 'fjall') {
      scatter(reg(treeSpruce(true)), veg, 1300 * dens, lim + 6, 520, 0.8, 1.5, { tint: 0.08, filter: (x, z) => { const h = this.heightAt(x, z); return h < this.track.maxY + 40; } });
      scatter(reg(rockGeo()), vegFlat, 220 * dens, lim + 5, 600, 0.8, 3.5, { tint: 0.06, squash: true });
      this._cottages(0x9a2a20, 6);
    } else if (buildThemeScenery(this, theme, dens, { scatter, reg, veg, vegFlat })) {
      // nya teman (scenery.js)
    } else if (theme === 'is') {
      scatter(reg(treeSpruce(true)), veg, 900 * dens, 240, 900, 0.9, 1.6, { tint: 0.08 });
      this._fishingHuts();
      this._torches();
    }
    sets.forEach(s => s.build(this.group, this.disp));
    if (this.track.lampLayout()) buildLampPosts(this);
    this._spectators(dens);
    this._billboards();
  }

  _cottages(wall, n) {
    const tr = this.track, rng = this.rng;
    const geo = cottageGeo(wall); this.disp.push(geo);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); this.disp.push(mat);
    const ch = new Chunked(geo, mat, 400, { shadow: this.q.shadows });
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    let placed = 0;
    for (let k = 0; k < n * 6 && placed < n; k++) {
      const i = Math.floor(rng() * tr.N); if (tr.tunnel[i] || tr.bridge[i]) continue;
      const side = rng() < 0.5 ? -1 : 1, d = side * (tr.limit + 16 + rng() * 40);
      const x = tr.P[i * 3] + tr.R[i * 3] * d, z = tr.P[i * 3 + 2] + tr.R[i * 3 + 2] * d;
      if (this.roadInfo(x, z).d < tr.limit + 12) continue;
      const h = this.heightAt(x, z);
      if (this.waterY != null && h < this.waterY + 1) continue;
      qq.setFromAxisAngle(UP, Math.atan2(tr.T[i * 3], tr.T[i * 3 + 2]) + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
      m4.compose(new THREE.Vector3(x, h - 0.2, z), qq, new THREE.Vector3(1, 1, 1));
      ch.add(m4); placed++;
    }
    ch.build(this.group, this.disp);
  }

  _flowers(count) {
    const tr = this.track, rng = this.rng;
    const g = new THREE.PlaneGeometry(0.5, 0.5); g.translate(0, 0.25, 0);
    const g2 = g.clone(); g2.rotateY(Math.PI / 2);
    const geo = mergeGeometries([g, g2]); g.dispose(); g2.dispose(); this.disp.push(geo);
    const mat = new THREE.MeshStandardMaterial({ map: TX.dotTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }); this.disp.push(mat);
    const ch = new Chunked(geo, mat, 200, { shadow: false });
    const cols = [0xffe14a, 0xffffff, 0xb06aff, 0xff5aa0, 0x4a7aff];
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), t = this.tg;
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rng() * tr.N); const side = rng() < 0.5 ? -1 : 1, d = side * (tr.limit + 1.5 + rng() * 26);
      const x = tr.P[i * 3] + tr.R[i * 3] * d + (rng() - 0.5) * 6, z = tr.P[i * 3 + 2] + tr.R[i * 3 + 2] * d + (rng() - 0.5) * 6;
      if (this.roadInfo(x, z).d < tr.limit + 1) continue;
      const h = this.heightAt(x, z); if (this.waterY != null && h < this.waterY + 0.5) continue;
      qq.setFromAxisAngle(UP, rng() * 3);
      const s = 0.6 + rng() * 0.8;
      m4.compose(new THREE.Vector3(x, h, z), qq, new THREE.Vector3(s, s, s));
      ch.add(m4, new THREE.Color(cols[(rng() * cols.length) | 0]));
    }
    ch.build(this.group, this.disp);
  }

  _maypole() {
    const tr = this.track; const f = { c: new THREE.Vector3(), T: new THREE.Vector3(), R: new THREE.Vector3(), N: new THREE.Vector3() };
    tr.frameAt(tr.L - 45, f);
    const x = f.c.x - f.R.x * (tr.limit + 14), z = f.c.z - f.R.z * (tr.limit + 14);
    const y = this.heightAt(x, z);
    const green = new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.9 });
    const parts = [];
    parts.push(new THREE.CylinderGeometry(0.22, 0.3, 14, 8).translate(0, 7, 0));
    const bar = new THREE.CylinderGeometry(0.18, 0.18, 5, 8); bar.rotateZ(Math.PI / 2); bar.translate(0, 10.5, 0); parts.push(bar);
    for (const sx of [-2.1, 2.1]) { const r = new THREE.TorusGeometry(1.0, 0.18, 6, 16); r.translate(sx, 9.3, 0); parts.push(r); }
    const geo = mergeGeometries(parts.map(p => p.toNonIndexed())); parts.forEach(p => p.dispose());
    const m = new THREE.Mesh(geo, green); m.position.set(x, y, z); m.castShadow = true;
    this.group.add(m); this.disp.push(geo, green);
    // blomkransar
    const fl = new THREE.MeshStandardMaterial({ color: 0xffe04a, emissive: 0x302000 });
    const wg = new THREE.TorusGeometry(1.0, 0.08, 4, 16);
    for (const sx of [-2.1, 2.1]) { const w = new THREE.Mesh(wg, fl); w.position.set(x + sx, y + 9.3, z); this.group.add(w); }
    this.disp.push(fl, wg);
  }

  _boathouses() {
    const tr = this.track, rng = this.rng, t = this.tg;
    const geo = cottageGeo(0xa3261c); this.disp.push(geo);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); this.disp.push(mat);
    const ch = new Chunked(geo, mat, 400, { shadow: this.q.shadows });
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    let placed = 0;
    for (let k = 0; k < 4000 && placed < 14; k++) {
      const x = t.x0 + rng() * (t.nx - 1) * t.cell, z = t.z0 + rng() * (t.nz - 1) * t.cell;
      const h = this.heightAt(x, z);
      if (Math.abs(h - (this.waterY + 0.8)) > 0.7) continue;
      const ri = this.roadInfo(x, z); if (ri.d < tr.limit + 12 || ri.d > 500) continue;
      qq.setFromAxisAngle(UP, rng() * 6.28);
      m4.compose(new THREE.Vector3(x, this.waterY + 0.3, z), qq, new THREE.Vector3(0.8, 0.8, 0.8)); ch.add(m4); placed++;
    }
    ch.build(this.group, this.disp);
  }
  _sailboats() {
    const tr = this.track, rng = this.rng, t = this.tg;
    const hull = new THREE.BoxGeometry(1.8, 0.8, 6); hull.translate(0, 0.2, 0);
    const mast = new THREE.CylinderGeometry(0.06, 0.08, 9, 5); mast.translate(0, 5, 0.4);
    const sail = new THREE.BufferGeometry(); sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0.5, 0, 9, 0.5, 0, 1, -2.6], 3)); sail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2)); sail.computeVertexNormals();
    const geo = mergeGeometries([colorize(hull.toNonIndexed(), 0xf4f4f0), colorize(mast.toNonIndexed(), 0xd8c8a8), colorize(sail, 0xffffff)]);
    hull.dispose(); mast.dispose(); sail.dispose(); this.disp.push(geo);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }); this.disp.push(mat);
    this.boats = [];
    for (let k = 0; k < 4000 && this.boats.length < 10; k++) {
      const x = t.x0 + rng() * (t.nx - 1) * t.cell, z = t.z0 + rng() * (t.nz - 1) * t.cell;
      if (this.heightAt(x, z) > this.waterY - 3) continue;
      if (this.roadInfo(x, z).d < 40) continue;
      const m = new THREE.Mesh(geo, mat); m.position.set(x, this.waterY, z); m.rotation.y = rng() * 6.28; m.castShadow = true;
      m.userData.ph = rng() * 6; this.group.add(m); this.boats.push(m);
    }
    this.animated.push((dt, time) => this.boats.forEach(b => { b.rotation.z = Math.sin(time * 0.9 + b.userData.ph) * 0.06; b.position.y = this.waterY + Math.sin(time * 1.3 + b.userData.ph) * 0.15; }));
  }
  _lighthouse() {
    const t = this.tg, rng = this.rng;
    for (let k = 0; k < 3000; k++) {
      const x = t.x0 + rng() * (t.nx - 1) * t.cell, z = t.z0 + rng() * (t.nz - 1) * t.cell;
      const h = this.heightAt(x, z);
      if (h < this.waterY + 2 || h > this.waterY + 8) continue;
      const ri = this.roadInfo(x, z); if (ri.d < 60 || ri.d > 300) continue;
      const parts = [];
      for (let s = 0; s < 4; s++) parts.push(colorize(new THREE.CylinderGeometry(2.0 - s * 0.3 - 0.3, 2.0 - s * 0.3, 4, 12).translate(0, 2 + s * 4, 0).toNonIndexed(), s % 2 ? 0xffffff : 0xc8261e));
      parts.push(colorize(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10).translate(0, 17, 0).toNonIndexed(), 0xfff0b0));
      parts.push(colorize(new THREE.ConeGeometry(1.5, 1.6, 10).translate(0, 18.7, 0).toNonIndexed(), 0x2a2a2a));
      const geo = mergeGeometries(parts); parts.forEach(p => p.dispose());
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      const m = new THREE.Mesh(geo, mat); m.position.set(x, h - 0.3, z); m.castShadow = true;
      this.group.add(m); this.disp.push(geo, mat);
      return;
    }
  }
  _turbines() {
    const tr = this.track, rng = this.rng, t = this.tg;
    const towerG = turbineTower(), rotorG = turbineRotor();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    this.disp.push(towerG, rotorG, mat);
    this.rotors = [];
    const yaw = rng() * 6.28;
    for (let k = 0; k < 3000 && this.rotors.length < 14; k++) {
      const x = t.x0 + rng() * (t.nx - 1) * t.cell, z = t.z0 + rng() * (t.nz - 1) * t.cell;
      const ri = this.roadInfo(x, z); if (ri.d < tr.limit + 40 || ri.d > 650) continue;
      if (this.rotors.some(r => Math.hypot(r.position.x - x, r.position.z - z) < 110)) continue;
      const h = this.heightAt(x, z);
      const tw = new THREE.Mesh(towerG, mat); tw.position.set(x, h - 0.5, z); tw.rotation.y = yaw; tw.castShadow = true; this.group.add(tw);
      const ro = new THREE.Mesh(rotorG, mat); ro.position.set(x + Math.sin(yaw) * 4, h + 60.5, z + Math.cos(yaw) * 4); ro.rotation.order = 'YXZ'; ro.rotation.y = yaw; ro.castShadow = true;
      ro.userData.sp = 0.7 + rng() * 0.5; ro.userData.ph = rng() * 6;
      this.group.add(ro); this.rotors.push(ro);
      // blinkande lampa (natt-känsla)
    }
    this.animated.push((dt, time) => this.rotors.forEach(r => { r.rotation.z = time * r.userData.sp + r.userData.ph; }));
  }
  _fishingHuts() {
    const tr = this.track, rng = this.rng;
    const geo = cottageGeo(0x9a2a20); geo.scale(0.45, 0.5, 0.45); this.disp.push(geo);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); this.disp.push(mat);
    const ch = new Chunked(geo, mat, 400, { shadow: this.q.shadows });
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
    let placed = 0;
    for (let k = 0; k < 400 && placed < 22; k++) {
      const i = Math.floor(rng() * tr.N); const side = rng() < 0.5 ? -1 : 1, d = side * (tr.limit + 12 + rng() * 120);
      const x = tr.P[i * 3] + tr.R[i * 3] * d, z = tr.P[i * 3 + 2] + tr.R[i * 3 + 2] * d;
      if (this.roadInfo(x, z).d < tr.limit + 10) continue;
      qq.setFromAxisAngle(UP, rng() * 6.28);
      m4.compose(new THREE.Vector3(x, this.heightAt(x, z), z), qq, new THREE.Vector3(1, 1, 1)); ch.add(m4); placed++;
    }
    ch.build(this.group, this.disp);
  }
  _torches() {
    const tr = this.track;
    const poleG = new THREE.CylinderGeometry(0.05, 0.06, 1.2, 5); poleG.translate(0, 0.6, 0);
    const flameG = new THREE.ConeGeometry(0.16, 0.5, 6); flameG.translate(0, 1.45, 0);
    const poleM = new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), flameM = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    flameM.color.multiplyScalar(2.2);
    this.disp.push(poleG, flameG, poleM, flameM);
    const list = [];
    for (let i = 0; i < tr.N; i += 9) for (const side of [-1, 1]) list.push([i, side]);
    const ip = new THREE.InstancedMesh(poleG, poleM, list.length), iF = new THREE.InstancedMesh(flameG, flameM, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([i, side], n) => {
      const d = side * (tr.limit + 4.4);
      const x = tr.P[i * 3] + tr.R[i * 3] * d, z = tr.P[i * 3 + 2] + tr.R[i * 3 + 2] * d;
      m4.makeTranslation(x, this.heightAt(x, z) + 0.6, z); ip.setMatrixAt(n, m4); iF.setMatrixAt(n, m4);
    });
    ip.computeBoundingSphere(); iF.computeBoundingSphere();
    this.group.add(ip, iF); this.disp.push(ip, iF);
    this.torchFlames = iF;
    this.animated.push((dt, time) => { const s = 1 + Math.sin(time * 17) * 0.08 + Math.sin(time * 23) * 0.05; iF.scale.set(1, s, 1); });
  }

  _spectators(dens) {
    const tr = this.track, rng = this.rng;
    const bodyG = spectatorBody(), headG = spectatorHead();
    const bodyM = cheerMaterial({ vertexColors: true, roughness: 0.8 }, this.cheer), headM = cheerMaterial({ vertexColors: true, roughness: 0.7 }, this.cheer);
    this.disp.push(bodyG, headG, bodyM, headM);
    const spots = [];
    // läktare vid start/mål + grupper i skarpa kurvor
    spots.push({ s: tr.L - 60, len: 110, side: tr.openL[0] ? 1 : -1, n: 150, stand: true });
    for (let i = 0; i < tr.N; i += 4) {
      if (Math.abs(tr.k[i]) > 1 / 55 && !tr.tunnel[i] && !tr.bridge[i] && rng() < 0.08) spots.push({ s: i * tr.ds, len: 26, side: tr.k[i] < 0 ? -1 : 1, n: 22, stand: false });
    }
    const pos = [];
    for (const sp of spots) {
      const outerD = tr.limit + (tr.theme.barrier === 'snow' ? 5.5 : 2.6);
      if (sp.side < 0 ? tr.openL[Math.floor(sp.s / tr.ds) % tr.N] : tr.openR[Math.floor(sp.s / tr.ds) % tr.N]) continue;
      const n = Math.round(sp.n * Math.max(0.5, dens));
      for (let k = 0; k < n; k++) {
        const s = sp.s + (rng() - 0.5) * sp.len;
        const row = sp.stand ? Math.floor(rng() * 6) : Math.floor(rng() * 3);
        const d = sp.side * (outerD + 0.5 + row * (sp.stand ? 1.0 : 0.8) + rng() * 0.3);
        const v = tr.pointAt(s, d, 0, new THREE.Vector3());
        const y = sp.stand ? v.y + row * 0.55 + 0.3 : Math.max(this.heightAt(v.x, v.z), v.y - 0.2);
        const i = Math.floor(((s % tr.L) + tr.L) % tr.L / tr.ds) % tr.N;
        pos.push([v.x, y, v.z, Math.atan2(-tr.R[i * 3] * sp.side, -tr.R[i * 3 + 2] * sp.side)]);
      }
      if (sp.stand) this._grandstand(sp);
    }
    if (!pos.length) return;
    const ib = new THREE.InstancedMesh(bodyG, bodyM, pos.length), ih = new THREE.InstancedMesh(headG, headM, pos.length);
    const shirt = [0xc8261e, 0x1f4fbf, 0xffcc33, 0xf4f4f4, 0x2e8b3a, 0xff7a1a, 0x8a6fd1, 0x222222, 0x39d5ff];
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    pos.forEach((p, n) => {
      qq.setFromAxisAngle(UP, p[3] + (rng() - 0.5) * 0.6);
      const s = 0.9 + rng() * 0.2;
      m4.compose(pv.set(p[0], p[1], p[2]), qq, one.set(s, s, s));
      ib.setMatrixAt(n, m4); ih.setMatrixAt(n, m4);
      ib.setColorAt(n, new THREE.Color(shirt[(rng() * shirt.length) | 0]));
      ih.setColorAt(n, new THREE.Color(1, 1, 1).multiplyScalar(0.75 + rng() * 0.3));
    });
    [ib, ih].forEach(m => { m.computeBoundingSphere(); m.castShadow = this.q.shadows; this.group.add(m); this.disp.push(m); });
  }
  _grandstand(sp) {
    const tr = this.track;
    const mat = new THREE.MeshStandardMaterial({ map: TX.concreteTex(), color: 0x9aa4b4, roughness: 0.8 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x1f4fbf, roughness: 0.6, side: THREE.DoubleSide });
    this.disp.push(mat, roofM);
    const outerD = tr.limit + (tr.theme.barrier === 'snow' ? 5.5 : 2.6);
    const i0 = Math.floor(((sp.s - sp.len / 2) % tr.L + tr.L) % tr.L / tr.ds), n = Math.floor(sp.len / tr.ds);
    const idx = []; for (let k = 0; k <= n; k++) idx.push((i0 + k) % tr.N);
    const prof = [];
    for (let r = 0; r < 6; r++) { prof.push([r * 1.0, r * 0.55 + 0.3], [r * 1.0 + 1.0, r * 0.55 + 0.3]); }
    prof.unshift([0, -1]); prof.push([6.2, -1]);
    const g = tr.sideProfile(idx, sp.side, outerD + 0.2, prof, 6);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; this.group.add(m); this.disp.push(g);
    const rg = tr.sideProfile(idx, sp.side, outerD + 0.2, [[-0.5, 7.2], [6.5, 6.4]], 6);
    const rm = new THREE.Mesh(rg, roofM); rm.castShadow = true; this.group.add(rm); this.disp.push(rg);
  }

  _billboards() {
    const tr = this.track, rng = this.rng;
    const ads = [['SPELHALLEN', '#16306e', '#ffd85c', 'Spela mer!'], ['ÄLGKORV', '#7a2a1a', '#fff0d0', 'Grillat & gott'], ['KANELBULLEN', '#c8781a', '#fff6e0', 'Nybakat varje dag'], ['FJÄLLRACET', '#0f4a3a', '#7affc8', 'Säsong 1'], ['SNABBDÄCK', '#222', '#ff5a3a', 'Grepp på riktigt'], ['NORRLJUS', '#2a1a5a', '#b8a4ff', 'Elbolaget i norr']];
    const geo = new THREE.PlaneGeometry(8, 2.2); geo.translate(0, 2.6, 0);
    const leg = new THREE.BoxGeometry(0.2, 1.6, 0.2); leg.translate(0, 0.8, 0);
    this.disp.push(geo, leg);
    const legM = new THREE.MeshStandardMaterial({ color: 0x555 }); this.disp.push(legM);
    for (let i = 20; i < tr.N; i += Math.floor(tr.N / 9)) {
      if (tr.tunnel[i] || tr.bridge[i]) continue;
      const side = Math.abs(tr.k[i]) > 0.003 ? (tr.k[i] < 0 ? -1 : 1) : (rng() < 0.5 ? -1 : 1);
      if (side < 0 ? tr.openL[i] : tr.openR[i]) continue;
      const a = ads[(rng() * ads.length) | 0];
      const t = TX.bannerTex(a[0], a[1], a[2], 512, 140, a[3]);
      const m = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: tr.theme.night ? 0.7 : 0.1, roughness: 0.6 });
      this.disp.push(m);
      const d = side * (tr.limit + (tr.theme.barrier === 'snow' ? 5 : 2.2));
      const b = new THREE.Mesh(geo, m);
      const x = tr.P[i * 3] + tr.R[i * 3] * d, z = tr.P[i * 3 + 2] + tr.R[i * 3 + 2] * d;
      b.position.set(x, tr.P[i * 3 + 1] - 0.2, z);
      b.rotation.y = Math.atan2(tr.R[i * 3] * -side, tr.R[i * 3 + 2] * -side);
      b.castShadow = true;
      this.group.add(b);
      for (const lx of [-3, 3]) { const l = new THREE.Mesh(leg, legM); l.position.set(lx, 0, -0.05); b.add(l); }
    }
  }

  /* ---------- horisont ---------- */
  buildHorizon() {
    const th = this.th, tr = this.track;
    const cx = (tr.bbox.x0 + tr.bbox.x1) / 2, cz = (tr.bbox.z0 + tr.bbox.z1) / 2;
    const R = Math.min(this.fogFar * 0.92, 1500);
    const seg = 160, rows = 4;
    const pos = [], col = [], idx = [];
    const fogC = new THREE.Color(th.fog.color), base = new THREE.Color();
    const kind = tr.def.theme;
    const baseCol = { midsommar: 0x2f5a30, skargard: 0x3a5a40, odemark: 0x8a5a48, fjall: 0xb0b8c8, stad: 0x0a0814, is: 0x24384a, kust: 0x2a4a34, hamn: 0x2a2c34,
      gotland: 0x6a7a58, lappland: 0x8aa0b8, dalarna: 0x2a4a2c, oland: 0x6a7a5a, flyg: 0x3a3a48, gruva: 0x5a4a40, tivoli: 0x0c0c18, skog: 0x2a3a2a }[kind] || 0x404040;
    base.setHex(baseCol);
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      const n1 = this.noise.noise(Math.cos(a) * 2, Math.sin(a) * 2) * 0.5 + 0.5;
      const n2 = this.noise.noise(Math.cos(a) * 7 + 9, Math.sin(a) * 7) * 0.5 + 0.5;
      let h;
      if (kind === 'fjall') h = 60 + n1 * 220 + n2 * 60;
      else if (kind === 'lappland') h = 40 + n1 * 160 + n2 * 40;
      else if (kind === 'kust') h = n1 < 0.35 ? 0 : 20 + (n1 - 0.35) * 160;
      else if (kind === 'stad') h = (Math.floor(n2 * 8) % 3 === 0 ? 90 : 35) + n1 * 110 + (i % 3 === 0 ? 50 * n2 : 0);
      else if (kind === 'hamn' || kind === 'tivoli') h = (i % 4 === 0 ? 25 : 10) + n1 * 30;
      else if (kind === 'oland' || kind === 'gotland' || kind === 'flyg') h = 4 + n1 * 14;
      else if (kind === 'skog') h = 30 + n1 * 60 + n2 * 20;
      else if (kind === 'odemark') h = 10 + n1 * 40;
      else if (kind === 'skargard') h = n1 < 0.45 ? 0 : (n1 - 0.45) * 60;
      else h = 20 + n1 * 50 + n2 * 15;
      for (let r = 0; r < rows; r++) {
        const f = r / (rows - 1);
        const rad = R * (1 + f * 0.25);
        const y = tr.minY - 20 + h * Math.sin(f * Math.PI * 0.5) * (r === rows - 1 ? 0.6 : 1);
        pos.push(cx + Math.cos(a) * rad, (r === 0 ? tr.minY - 30 : y), cz + Math.sin(a) * rad);
        const c = base.clone();
        if ((kind === 'fjall' || kind === 'lappland') && f > 0.3) c.lerp(new THREE.Color(0xffffff), 0.6);
        c.lerp(fogC, 0.55 + f * 0.15);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < seg; i++) for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r, b = a + rows;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -5; mesh.frustumCulled = false;
    this.group.add(mesh); this.disp.push(g, m);
    if (kind === 'stad' || kind === 'hamn' || kind === 'tivoli') {
      // fönsterljus i skyline: punkter
      const pts = [], cols = [];
      const pal = kind === 'stad' ? [0x9ad8ff, 0xff6ad0, 0xffe0a0, 0x60ffe0, 0xffffff] : [0xffd890, 0xffe8b0, 0xffc070];
      const cc = new THREE.Color();
      for (let k = 0; k < (kind === 'stad' ? 1800 : 600); k++) {
        const a = this.rng() * Math.PI * 2; const rad = R * (1.02 + this.rng() * 0.15);
        pts.push(cx + Math.cos(a) * rad, tr.minY - 15 + this.rng() * (kind === 'stad' ? 150 : 50), cz + Math.sin(a) * rad);
        cc.setHex(pal[(this.rng() * pal.length) | 0]); cols.push(cc.r, cc.g, cc.b);
      }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const pm = new THREE.PointsMaterial({ vertexColors: true, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75 });
      const p = new THREE.Points(pg, pm); p.frustumCulled = false; p.renderOrder = -4;
      this.group.add(p); this.disp.push(pg, pm);
    }
  }

  /* ---------- väder ---------- */
  buildWeather() {
    const kind = this.th.weather; if (kind === 'none') return;
    const count = Math.round({ snow: 2600, rain: 3200, pollen: 500, dust: 900 }[kind] * (0.4 + this.view * 0.6));
    const box = kind === 'rain' ? new THREE.Vector3(70, 36, 70) : new THREE.Vector3(90, 40, 90);
    const rng = this.rng;
    const isRain = kind === 'rain';
    const verts = isRain ? count * 2 : count;
    const pos = new Float32Array(verts * 3), rnd = new Float32Array(verts), end = new Float32Array(verts);
    for (let k = 0; k < count; k++) {
      const x = rng() * box.x, y = rng() * box.y, z = rng() * box.z, r = rng();
      if (isRain) { for (let e = 0; e < 2; e++) { const v = k * 2 + e; pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; rnd[v] = r; end[v] = e; } }
      else { pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; rnd[k] = r; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
    g.setAttribute('endp', new THREE.BufferAttribute(end, 1));
    const vel = this.th.weatherVel || { snow: [0.6, -2.2, 0.3], rain: [1.5, -26, 0.8], pollen: [0.4, 0.15, 0.2], dust: [7, 0.3, 2] }[kind];
    const dc = this.th.dust;
    const color = kind === 'dust' && dc ? new THREE.Color(dc[0] * 1.1, dc[1] * 1.1, dc[2] * 1.1).getHex() : { snow: 0xffffff, rain: this.th.edgeGlow ? 0xb8c8f0 : 0xa8b8d8, pollen: 0xfff0a0, dust: 0xe8c090 }[kind];
    const size = { snow: 0.22, rain: 1, pollen: 0.12, dust: 0.35 }[kind];
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: kind === 'pollen' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: box }, vel: { value: new THREE.Vector3(...vel) }, color: { value: new THREE.Color(color) }, size: { value: size }, tex: { value: TX.dotTex() }, carVel: { value: new THREE.Vector3() }, alpha: { value: kind === 'rain' ? 0.35 : kind === 'dust' ? 0.35 : 0.85 },
        lp: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, lcol: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `
        uniform float time; uniform vec3 cam, box, vel, carVel; uniform float size; uniform vec4 lp[3];
        attribute float rnd; attribute float endp; varying float vA; varying float vG;
        void main(){
          vec3 v = vel * (0.7 + 0.6 * rnd);
          vec3 p = position + v * time;
          p.x += sin(time * (0.8 + rnd) + rnd * 40.0) * ${kind === 'snow' || kind === 'pollen' ? '0.8' : '0.0'};
          p = mod(p - cam, box) - box * 0.5 + cam;
          ${isRain ? 'p -= (v - carVel * 0.6) * 0.035 * endp;' : ''}
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = length(p - cam);
          vA = smoothstep(box.x * 0.5, box.x * 0.3, dist) * smoothstep(0.5, 3.0, -mv.z);
          // glitter: droppar nära gatlamporna lyser upp
          vG = 0.0;
          for (int k = 0; k < 3; k++) { vec3 dl = p - lp[k].xyz; vG += lp[k].w / (1.0 + dot(dl, dl) * 0.025); }
          gl_PointSize = size * 420.0 / max(1.0, -mv.z);
        }`,
      fragmentShader: `
        uniform vec3 color, lcol; uniform sampler2D tex; uniform float alpha; varying float vA; varying float vG;
        void main(){
          ${isRain ? 'float a = 1.0;' : 'float a = texture2D(tex, gl_PointCoord).a;'}
          float g = min(vG, 3.0);
          gl_FragColor = vec4(color * (1.0 + g * 1.6) + lcol * g * 0.8, a * vA * alpha * (1.0 + g * 1.5));
        }`
    });
    const obj = isRain ? new THREE.LineSegments(g, mat) : new THREE.Points(g, mat);
    obj.frustumCulled = false; obj.renderOrder = 5;
    this.scene.add(obj);
    this.weather = obj; this.disp.push(g, mat);
  }

  build(progress) {
    this.buildSkyAndLights(); progress && progress(0.35, 'Formar terrängen …');
    this.buildTerrain(); progress && progress(0.6, 'Planterar skog …');
    this.buildWater();
    this.buildScenery(); progress && progress(0.8, 'Bygger horisonten …');
    this.buildHorizon();
    this.buildWeather();
    this.scene.add(this.group);
  }

  update(dt, cam, focus, carVel) {
    this.time += dt;
    const t = this.time;
    this.sky.mesh.position.copy(cam.position);
    this.sky.mat.uniforms.time.value = t;
    this.cheer.uTime.value = t;
    if (this.water) { this.waterTex.offset.set(t * 0.012, t * 0.008); }
    this.animated.forEach(fn => fn(dt, t));
    if (this.track.roadUniforms) this.track.roadUniforms.uTime.value = t;
    if (this.lampLights && this.lampLights.length && focus) this._updateLampLights(focus);
    if (this.weather) {
      const u = this.weather.material.uniforms;
      u.time.value = t; u.cam.value.copy(cam.position);
      if (carVel) u.carVel.value.copy(carVel);
      if (this.lampLights) for (let k = 0; k < 3; k++) { const l = this.lampLights[k]; if (l) u.lp.value[k].set(l.position.x, l.position.y, l.position.z, l.intensity / 120); else u.lp.value[k].w = 0; }
    }
    // skuggkameran följer bilen (snäppt till texelrutnät)
    if (focus) {
      const s = this.sun;
      const snap = 140 / (this.q.shadowSize || 1024);
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      s.target.position.set(fx, focus.y, fz);
      s.position.set(fx + this.sunDir.x * 200, focus.y + Math.max(0.25, this.sunDir.y) * 200, fz + this.sunDir.z * 200);
    }
  }

  /** Flyttar punktljusen till gatlamporna närmast bilen. Intensiteten tonas med avståndet längs banan så att bytet aldrig syns. */
  _updateLampLights(focus) {
    const tr = this.track, lay = tr.lampLayout(), f = this._lf;
    tr.project(focus, f.i, f);
    const n = this.lampLights.length, sp = lay.sp;
    const u = (f.s - lay.off) / sp;
    const k0 = n % 2 ? Math.floor(u + 0.5) - (n - 1) / 2 : Math.floor(u) - (n / 2 - 1);
    const win = n * sp / 2;
    const base = this.th.lamps.strength * 95;
    for (let j = 0; j < n; j++) {
      const k = k0 + j, s = lay.off + k * sp;
      const kk = ((k % lay.n) + lay.n) % lay.n, side = kk % 2 ? -1 : 1;
      const x = (s - f.s) / win;
      const w = Math.abs(x) >= 1 ? 0 : Math.cos(x * Math.PI / 2) ** 2;
      const l = this.lampLights[j];
      tr.pointAt(s, side * lay.D, this.th.lamps.height - 0.6, l.position);
      l.intensity = base * w;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.weather) this.scene.remove(this.weather);
    this.disp.forEach(d => { try { d.dispose(); } catch (e) {} });
    this.disp = [];
    if (this.sun) { try { this.sun.dispose(); } catch (e) {} }
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    this.scene.environment = null; this.scene.fog = null;
  }
}
