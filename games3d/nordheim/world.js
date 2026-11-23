// Nordheim – rendering av ön: terräng (lågpoly, vertexfärger), vatten (shader), träd/stenar/malm/buskar (InstancedMesh).
import * as THREE from 'three';
import { T, R } from './data.js';
import { G, heightAt } from './state.js';
import { addSnow, treeGeos, SNOW } from './models.js';

const COL = {
  [T.WATER]: new THREE.Color(0xb3a27a), [T.SAND]: new THREE.Color(0xdcc890), [T.GRASS]: new THREE.Color(0x77a345),
  [T.MEADOW]: new THREE.Color(0x8db24f), [T.FOREST]: new THREE.Color(0x5d8838), [T.ROCK]: new THREE.Color(0x8f8c84)
};
const ROAD = new THREE.Color(0x9a7a55), SOIL = new THREE.Color(0x6e4f30), FOUND = new THREE.Color(0x8a7556), CAMPC = new THREE.Color(0x6a5a44);
const SEASON_TINT = [
  new THREE.Color(1.0, 1.06, 0.92), // vår – friskt
  new THREE.Color(1, 1, 1),
  new THREE.Color(1.3, 1.0, 0.55), // höst – gulnat
  new THREE.Color(0.95, 0.97, 1.0)
];
const hash = k => { let x = (k * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

/** Tilande värdebrus (enkanalig textur) för detaljer i terräng och snö. */
let _noiseTex = null;
function noiseTexture() {
  if (_noiseTex) return _noiseTex;
  const S = 128, d = new Uint8Array(S * S * 4);
  const layer = (cell, amp, seed) => {
    const g = cell, v = new Float32Array(g * g);
    for (let i = 0; i < g * g; i++) v[i] = hash(i * 7 + seed);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x / S * g, fy = y / S * g, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = v[(iy % g) * g + ix % g], b = v[(iy % g) * g + (ix + 1) % g], c = v[((iy + 1) % g) * g + ix % g], e = v[((iy + 1) % g) * g + (ix + 1) % g];
      out[y * S + x] = ((a + (b - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty) * amp;
    }
    return out;
  };
  // R: mjukt fbm, G: fint brus, B: medelfint, A: en annan mjuk oktav
  const l1 = layer(8, 0.55, 1), l2 = layer(16, 0.3, 2), l3 = layer(32, 0.15, 3);
  const f1 = layer(64, 0.6, 4), f2 = layer(128, 0.4, 5);
  const m1 = layer(32, 0.6, 6), m2 = layer(64, 0.4, 7);
  const a1 = layer(4, 0.6, 8), a2 = layer(8, 0.4, 9);
  for (let i = 0; i < S * S; i++) {
    d[i * 4] = Math.round((l1[i] + l2[i] + l3[i]) * 255);
    d[i * 4 + 1] = Math.round((f1[i] + f2[i]) * 255);
    d[i * 4 + 2] = Math.round((m1[i] + m2[i]) * 255);
    d[i * 4 + 3] = Math.round((a1[i] + a2[i]) * 255);
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  _noiseTex = t;
  return t;
}

const TERRAIN_FRAG = `
  vec2 tUV = vTW.xz / uN;
  vec4 nz0 = texture2D(uNoise, vTW.xz * 0.019);
  vec4 nz1 = texture2D(uNoise, vTW.xz * 0.13 + 0.37);
  // organiska övergångar: förskjut uppslaget med lågfrekvent brus
  vec2 warp = (vec2(nz0.r, nz0.a) - 0.5) * 1.5 + (nz1.br - 0.5) * 0.55;
  vec4 nat = texture2D(uNat, tUV + warp / uN);
  vec3 col = nat.rgb * mix(vec3(1.0), uTint, nat.a);
  // detalj: stora fläckar + fint gräsbrus
  float macro = nz0.r - 0.5;
  vec4 nzF = texture2D(uNoise, vTW.xz * 0.9);
  float fine = (nzF.g - 0.5) * 0.7 + (nz1.b - 0.5) * 0.5;
  col *= 1.0 + macro * 0.24 + fine * 0.16 * nat.a + fine * 0.08;
  // gulare/torrare fläckar i gräset
  col = mix(col, col * vec3(1.14, 1.04, 0.72), smoothstep(0.58, 0.8, nz0.a) * nat.a * 0.6);
  // bergsslänter blir steniga
  float rocky = smoothstep(0.86, 0.6, vWN.y) * step(0.05, vTW.y);
  col = mix(col, vec3(0.42, 0.41, 0.38) * (0.9 + nz1.g * 0.25), rocky * 0.85);
  // våt sand vid strandkanten
  col *= mix(0.78, 1.0, smoothstep(0.02, 0.22, vTW.y));
  // vägar, åkrar, grunder: skarpare kant (lätt brusig)
  vec4 ov = texture2D(uOv, tUV);
  float m = smoothstep(0.36, 0.62, ov.a + (nzF.b - 0.5) * 0.22);
  col = mix(col, ov.rgb * (0.94 + nzF.g * 0.12), m);
  // snö
  if (uSnow > 0.001) {
    float sn = nz1.r * 0.6 + nzF.g * 0.4;
    float sf = smoothstep(0.35, 0.75, vWN.y + (sn - 0.5) * 0.45) * smoothstep(0.02, 0.3, vTW.y) * uSnow;
    sf *= 1.0 - m * 0.35;
    col = mix(col, vec3(0.88, 0.92, 0.98) * (0.96 + sn * 0.08), clamp(sf * 1.15, 0.0, 1.0));
  }
  // rutnät vid byggande
  if (uGrid > 0.001) {
    vec2 g = abs(fract(vTW.xz) - 0.5);
    vec2 fw = fwidth(vTW.xz) * 1.2;
    vec2 ln = smoothstep(vec2(0.5) - fw, vec2(0.5), g);
    float line = max(ln.x, ln.y);
    float fade = 1.0 - smoothstep(uGridR * 0.55, uGridR, length(vTW.xz - uGridC));
    col = mix(col, vec3(1.0, 0.98, 0.9), line * fade * uGrid * 0.4 * step(0.03, vTW.y));
  }
  diffuseColor.rgb = col;
`;

export class World {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tint = SEASON_TINT[1].clone();
    this._tmp = new THREE.Color();
    this.build();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
    if (this.depthTex) this.depthTex.dispose();
    if (this.natTex) this.natTex.dispose();
    if (this.ovTex) this.ovTex.dispose();
  }

  build() {
    const m = G.map, n = m.n;
    // ---------- Terräng ----------
    const NV = n * n * 6;
    this.pos = new Float32Array(NV * 3);
    this.nor = new Float32Array(NV * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.tgeo = geo;
    // färgtexturer per ruta: natur (rgb + vegetationsandel) och överlägg (väg/åker/grund)
    this.natData = new Uint8Array(n * n * 4);
    this.ovData = new Uint8Array(n * n * 4);
    const mkTex = (data) => { const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
    this.natTex = mkTex(this.natData); this.ovTex = mkTex(this.ovData);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.writeTile(i, j, false);
    geo.computeBoundingSphere();
    this.terrU = {
      uNat: { value: this.natTex }, uOv: { value: this.ovTex }, uNoise: { value: noiseTexture() }, uN: { value: n },
      uTint: { value: this.tint }, uGrid: { value: 0 }, uGridC: { value: new THREE.Vector2() }, uGridR: { value: 8 }
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.terrU, { uSnow: SNOW });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vWN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vWN;\nuniform sampler2D uNat; uniform sampler2D uOv; uniform sampler2D uNoise; uniform float uN; uniform vec3 uTint; uniform float uSnow; uniform float uGrid; uniform vec2 uGridC; uniform float uGridR;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + TERRAIN_FRAG);
    };
    mat.customProgramCacheKey = () => 'nordheim-terrain';
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.matrixAutoUpdate = false;
    this.group.add(this.terrain);
    // havsbotten utanför kartan (så kameran aldrig ser "kanten")
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(n * 8, n * 8), new THREE.MeshBasicMaterial({ color: 0x0e2a3a }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(n / 2, -3.2, n / 2);
    this.group.add(floor);
    // ---------- Vatten ----------
    const N1 = n + 1;
    const dd = new Uint8Array(N1 * N1);
    for (let k = 0; k < N1 * N1; k++) dd[k] = Math.max(0, Math.min(255, Math.round(-m.h[k] / 4 * 255)));
    const depthTex = this.depthTex = new THREE.DataTexture(dd, N1, N1, THREE.RedFormat, THREE.UnsignedByteType);
    depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
    this.waterU = {
      uTime: { value: 0 }, uDepth: { value: depthTex }, uN: { value: n },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uAmb: { value: new THREE.Color(0.45, 0.5, 0.6) },
      uShallow: { value: new THREE.Color(0x3fa7a2) }, uDeep: { value: new THREE.Color(0x0f3f5c) }, uIce: { value: 0 }
    };
    const wmat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `
        uniform float uTime;
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float w = sin(wp.x * 0.35 + uTime * 1.1) * 0.06 + sin(wp.z * 0.42 - uTime * 0.9) * 0.05 + sin((wp.x + wp.z) * 0.8 + uTime * 1.7) * 0.025;
          wp.y += w;
          vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D uDepth; uniform float uN; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
        uniform vec3 uShallow; uniform vec3 uDeep; uniform float uIce;
        varying vec3 vW;
        #include <fog_pars_fragment>
        void main() {
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
          if (n.y < 0.0) n = -n;
          vec2 uv = (vW.xz + 0.0) / uN;
          float depth = 3.5;
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r * 4.0;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 2.6, depth));
          float diff = max(dot(n, uSunDir), 0.0);
          vec3 V = normalize(cameraPosition - vW);
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(n, H), 0.0), 80.0);
          col = col * (uAmb + uSunCol * diff * 0.55) + uSunCol * spec * 0.6;
          float fw = depth + sin(uTime * 1.6 + vW.x * 1.3 + vW.z * 1.1) * 0.02;
          float foam = smoothstep(0.075, 0.0, fw) * (0.7 + 0.3 * sin(uTime * 2.3 + vW.x * 2.1 - vW.z * 1.7));
          col = mix(col, (uAmb + uSunCol) * 0.75, foam * 0.75);
          float ice = uIce * smoothstep(1.4, 0.4, depth);
          col = mix(col, vec3(0.75, 0.83, 0.9) * (uAmb + uSunCol * 0.6), ice);
          float alpha = mix(0.6, 0.96, smoothstep(0.0, 1.6, depth));
          alpha = max(alpha, max(foam, ice));
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true
    });
    Object.assign(wmat.uniforms, this.waterU);
    const wgeo = new THREE.PlaneGeometry(n * 3.2, n * 3.2, 140, 140);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, wmat);
    this.water.position.set(n / 2, 0, n / 2);
    this.water.renderOrder = 2;
    this.group.add(this.water);

    // ---------- Natur ----------
    const tg = treeGeos();
    this.tg = tg;
    const natMat = addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.natMat = natMat;
    let trees = 0, stones = 0, ores = 0, berries = 0;
    for (let k = 0; k < n * n; k++) { const r = m.res[k]; if (r === R.TREE) trees++; else if (r === R.STONE) stones++; else if (r === R.ORE) ores++; else if (r === R.BERRY) berries++; }
    const cap = Math.max(1500, Math.ceil(trees * 1.35) + 400);
    const mk = (geo, count, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, natMat, count);
      im.count = 0; im.castShadow = shadow; im.receiveShadow = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < count; i++) im.setMatrixAt(i, zero);
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    this.pineT = mk(tg.pineT, cap); this.pineC = mk(tg.pineC, cap);
    this.leafT = mk(tg.leafT, cap); this.leafC = mk(tg.leafC, cap);
    this.stumps = mk(tg.stump, cap, false);
    this.rocks = mk(tg.rock, Math.max(50, stones + 20));
    this.ores = mk(tg.ore, Math.max(20, ores + 10));
    this.bushes = mk(tg.bush, Math.max(50, berries + 20), false);
    this.berries = mk(tg.berries, Math.max(50, berries + 20), false);
    // slot-hantering (ruta → instans)
    const NN = n * n;
    this.slotTree = new Int32Array(NN).fill(-1); this.freeTree = { pine: [], leaf: [] }; this.nextTree = { pine: 0, leaf: 0 };
    this.slotStump = new Int32Array(NN).fill(-1); this.freeStump = []; this.nextStump = 0;
    this.slotRes = new Int32Array(NN).fill(-1); this.nextRes = { 2: 0, 3: 0, 4: 0 }; this.slotResKind = new Uint8Array(NN);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < NN; k++) this.refreshTile(k, false);
    [this.pineT, this.pineC, this.leafT, this.leafC, this.stumps, this.rocks, this.ores, this.bushes, this.berries].forEach(im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    this.dirtyNat = new Set();
    this.buildTufts();
  }

  /* ---------- Gräs och blommor ---------- */
  buildTufts() {
    const m = G.map, n = m.n, NN = n * n;
    // gräsgeometri: några blad i en tuva, mörkare vid roten
    const blades = [], cols = [];
    for (let b = 0; b < 6; b++) {
      const a = b / 6 * Math.PI * 2 + hash(b + 50) * 0.8, r = 0.05 + hash(b + 60) * 0.06, h = 0.16 + hash(b + 70) * 0.16, w = 0.028;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, lean = 0.06 + hash(b + 80) * 0.06;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      blades.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
      cols.push(0.55, 0.6, 0.5, 0.55, 0.6, 0.5, 1.05, 1.08, 0.95);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    // normaler uppåt ger jämnt ljus på tunna blad
    const nrm = tg.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const fl = new THREE.BufferGeometry();
    const fv = [];
    for (let f = 0; f < 3; f++) {
      const x = (hash(f + 90) - 0.5) * 0.3, z = (hash(f + 95) - 0.5) * 0.3, y = 0.13 + hash(f + 99) * 0.08, s = 0.035;
      fv.push(x - s, y, z, x + s, y, z, x, y, z + s * 1.6, x - s, y, z, x, y, z - s * 1.6, x + s, y, z);
      fv.push(x, 0, z, x + 0.008, 0, z, x, y, z);
    }
    fl.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3));
    const fn = []; for (let i = 0; i < fv.length / 3; i++) fn.push(0, 1, 0);
    fl.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
    this.tuftU = { uTime: { value: 0 }, uTint: { value: this.tint }, uSnow: SNOW };
    this.flowerU = { value: 1 };
    const mkMat = (flower) => {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: !flower, side: THREE.DoubleSide });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.tuftU, { uFlower: this.flowerU });
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uSnow; uniform float uFlower;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
  vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  #else
  vec2 ip = vec2(0.0);
  #endif
  float sway = sin(uTime * 1.6 + ip.x * 0.55 + ip.y * 0.4) * 0.07 + sin(uTime * 2.7 + ip.x * 1.3) * 0.03;
  transformed.xz += vec2(sway, sway * 0.6) * position.y * 2.5;
  transformed *= ${flower ? 'uFlower * (1.0 - uSnow)' : '1.0 - uSnow * 0.75'};`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uSnow;')
          .replace('#include <color_fragment>', `#include <color_fragment>
  ${flower ? '' : 'diffuseColor.rgb *= uTint;'}
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.98), uSnow * 0.8);`);
      };
      mat.customProgramCacheKey = () => 'nordheim-tuft' + (flower ? 'f' : 'g');
      return mat;
    };
    // kandidater
    const cand = [], flw = [];
    for (let k = 0; k < NN; k++) {
      const t = m.type[k];
      const p = t === T.MEADOW ? 0.95 : t === T.GRASS ? 0.75 : t === T.FOREST ? 0.45 : t === T.SAND ? 0.08 : 0;
      if (p && hash(k + 301) < p) cand.push(k);
      if ((t === T.MEADOW && hash(k + 401) < 0.4) || (t === T.GRASS && hash(k + 401) < 0.08)) flw.push(k);
    }
    const PER = 2;
    const cap = Math.min(cand.length * PER, 30000);
    this.tufts = new THREE.InstancedMesh(tg, mkMat(false), Math.max(1, cap));
    this.tufts.count = cap; this.tufts.frustumCulled = false; this.tufts.receiveShadow = true;
    this.flowers = new THREE.InstancedMesh(fl, mkMat(true), Math.max(1, flw.length));
    this.flowers.count = flw.length; this.flowers.frustumCulled = false;
    this.slotTuft = new Int32Array(NN).fill(-1); this.slotFlower = new Int32Array(NN).fill(-1);
    const c = new THREE.Color();
    for (let q = 0; q < cand.length && q * PER < cap; q++) {
      const k = cand[q]; this.slotTuft[k] = q * PER;
      this.natColor(k, c);
      const v = 0.85 + hash(k + 33) * 0.3;
      for (let s = 0; s < PER; s++) this.tufts.setColorAt(q * PER + s, this._tmp.copy(c).multiplyScalar(v * (s ? 1.08 : 0.96)));
    }
    const FC = [0xf4f0e0, 0xf2d040, 0xb080e0, 0xe85a6a, 0x80b0ff];
    for (let q = 0; q < flw.length; q++) { const k = flw[q]; this.slotFlower[k] = q; this.flowers.setColorAt(q, c.set(FC[Math.floor(hash(k + 77) * FC.length)])); }
    for (let k = 0; k < NN; k++) this.updateTuft(k);
    this.tufts.instanceMatrix.needsUpdate = true; this.flowers.instanceMatrix.needsUpdate = true;
    this.group.add(this.tufts, this.flowers);
  }
  updateTuft(k) {
    if (!this.slotTuft) return;
    const st = this.slotTuft[k], sf = this.slotFlower[k];
    if (st < 0 && sf < 0) return;
    const m = G.map, n = m.n;
    const t = m.type[k];
    const free = (t === T.GRASS || t === T.MEADOW || t === T.FOREST || t === T.SAND) && !m.res[k] && !(G.occ && G.occ[k]) && !(G.road && G.road[k]) && !(G.fieldOf && G.fieldOf[k]);
    const M = this._m4, Q = this._q, V = this._v, S = this._s;
    const i = k % n, j = (k / n) | 0;
    if (st >= 0) for (let s = 0; s < 2; s++) {
      if (!free) { this.tufts.setMatrixAt(st + s, this.zero); continue; }
      const x = i + 0.15 + hash(k * 5 + s) * 0.7, z = j + 0.15 + hash(k * 5 + s + 2) * 0.7;
      const sc = (t === T.SAND ? 0.6 : t === T.MEADOW ? 1.15 : 0.95) * (0.75 + hash(k * 5 + s + 4) * 0.55);
      Q.setFromAxisAngle(this._e.set(0, 1, 0), hash(k * 3 + s) * 6.28);
      M.compose(V.set(x, Math.max(heightAt(x, z), 0) - 0.01, z), Q, S.set(sc, sc * (0.8 + hash(k + s * 9) * 0.5), sc));
      this.tufts.setMatrixAt(st + s, M);
    }
    if (sf >= 0) {
      if (!free) this.flowers.setMatrixAt(sf, this.zero);
      else {
        const x = i + 0.5 + (hash(k + 17) - 0.5) * 0.5, z = j + 0.5 + (hash(k + 19) - 0.5) * 0.5;
        Q.setFromAxisAngle(this._e.set(0, 1, 0), hash(k + 23) * 6.28);
        M.compose(V.set(x, Math.max(heightAt(x, z), 0), z), Q, S.set(1, 1, 1));
        this.flowers.setMatrixAt(sf, M);
      }
    }
    this.tuftDirty = true;
  }

  /* ---------- Terräng ---------- */
  /** Naturlig markfärg för en ruta (utan vägar/byggnader). Returnerar vegetationsandel (0..1). */
  natColor(k, out) {
    const m = G.map, n = m.n;
    const t = m.type[k];
    const i = k % n, j = (k / n) | 0;
    out.copy(COL[t]);
    const h = (m.h[j * (n + 1) + i] + m.h[j * (n + 1) + i + 1] + m.h[(j + 1) * (n + 1) + i] + m.h[(j + 1) * (n + 1) + i + 1]) * 0.25;
    if (t === T.ROCK) out.multiplyScalar(0.88 + Math.min(0.3, h * 0.035));
    else if (t === T.WATER) out.multiplyScalar(Math.max(0.42, 1 + h * 0.2));
    return (t === T.GRASS || t === T.MEADOW || t === T.FOREST) ? 1 : 0;
  }
  /** Överlägg: väg, åker eller byggnadsgrund. Returnerar täckning (0/1). */
  ovColor(k, out) {
    const n = G.map.n, i = k % n, j = (k / n) | 0;
    if (G.road && G.road[k]) { out.copy(ROAD).multiplyScalar(0.96 + hash(k + 7) * 0.08); return 1; }
    if (G.fieldOf && G.fieldOf[k]) { out.copy(SOIL).multiplyScalar(0.94 + ((i + j) % 2) * 0.08); return 1; }
    if (G.occ && G.occ[k]) {
      const b = G.buildings.get(G.occ[k]);
      if (b && !b.def.wall && !b.def.gate) { out.copy(b.team ? CAMPC : FOUND).multiplyScalar(0.96 + hash(k + 3) * 0.06); return 1; }
    }
    return 0;
  }

  /** Normal i en hörnpunkt (mjuk skuggning). */
  vnormal(i, j, out) {
    const m = G.map, n = m.n, N1 = n + 1, h = m.h;
    const H = (a, b) => h[Math.max(0, Math.min(n, b)) * N1 + Math.max(0, Math.min(n, a))];
    let nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2;
    const l = Math.hypot(nx, ny, nz); out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  }

  writeTile(i, j, mark = true) {
    const m = G.map, n = m.n, N1 = n + 1, h = m.h;
    const k = j * n + i;
    const ha = h[j * N1 + i], hb = h[j * N1 + i + 1], hc = h[(j + 1) * N1 + i], hd = h[(j + 1) * N1 + i + 1];
    const P = this.pos, Nn = this.nor;
    let o = k * 18;
    // tri 1: a, c, b  ·  tri 2: b, c, d
    const set = (x, y, z) => { P[o++] = x; P[o++] = y; P[o++] = z; };
    set(i, ha, j); set(i, hc, j + 1); set(i + 1, hb, j);
    set(i + 1, hb, j); set(i, hc, j + 1); set(i + 1, hd, j + 1);
    const na = this._na || (this._na = [0, 0, 0]), nb = this._nb || (this._nb = [0, 0, 0]), nc = this._nc || (this._nc = [0, 0, 0]), nd = this._nd || (this._nd = [0, 0, 0]);
    this.vnormal(i, j, na); this.vnormal(i + 1, j, nb); this.vnormal(i, j + 1, nc); this.vnormal(i + 1, j + 1, nd);
    let o2 = k * 18;
    for (const v of [na, nc, nb, nb, nc, nd]) { Nn[o2++] = v[0]; Nn[o2++] = v[1]; Nn[o2++] = v[2]; }
    this.paintTile(k, false);
    if (mark) { this.tgeo.attributes.position.needsUpdate = true; this.tgeo.attributes.normal.needsUpdate = true; }
  }

  paintTile(k, mark = true) {
    const c = this._tmp2 || (this._tmp2 = new THREE.Color());
    const veg = this.natColor(k, c);
    const o = k * 4, D = this.natData;
    c.convertLinearToSRGB();
    D[o] = c.r * 255 + 0.5; D[o + 1] = c.g * 255 + 0.5; D[o + 2] = c.b * 255 + 0.5; D[o + 3] = veg * 255;
    const cov = this.ovColor(k, c);
    const O = this.ovData;
    if (cov) { c.convertLinearToSRGB(); O[o] = c.r * 255 + 0.5; O[o + 1] = c.g * 255 + 0.5; O[o + 2] = c.b * 255 + 0.5; O[o + 3] = 255; }
    else { O[o] = D[o]; O[o + 1] = D[o + 1]; O[o + 2] = D[o + 2]; O[o + 3] = 0; }
    if (this.tufts) this.updateTuft(k);
    if (mark) this.texDirty = true;
  }
  repaintAll() {
    const n = G.map.n;
    for (let k = 0; k < n * n; k++) this.paintTile(k, false);
    this.texDirty = true;
  }
  setSeasonTint(season, f) {
    // f = 0..1 övergång från föregående årstid (uniform – ingen ommålning behövs)
    const prev = SEASON_TINT[(season + 3) % 4], cur = SEASON_TINT[season];
    this.tint.copy(prev).lerp(cur, f);
    if (this.flowerU) this.flowerU.value = season === 0 ? f : season === 1 ? 1 : season === 2 ? 1 - f : 0;
  }
  /** Visa rutnät runt (x,z) med radie r (0 = av). */
  setGrid(on, x, z, r) {
    if (!this.terrU) return;
    this.terrU.uGrid.value = on ? 1 : 0;
    if (on) { this.terrU.uGridC.value.set(x, z); this.terrU.uGridR.value = r; }
  }

  /** Skriver om terrängen i ett område (efter att höjddatan ändrats). */
  rewriteArea(i0, j0, w, d) {
    const n = G.map.n;
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j0 + d); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i0 + w); i++) { this.writeTile(i, j, false); this.refreshTile(j * n + i); if (this.tufts) this.updateTuft(j * n + i); }
    this.tgeo.attributes.position.needsUpdate = true; this.tgeo.attributes.normal.needsUpdate = true; this.texDirty = true;
  }

  /** Stråle mot terrängen. Returnerar {x, z, y} eller null. */
  raycast(ray) {
    const o = ray.origin, d = ray.direction;
    if (d.y > -0.01) return null;
    let t = Math.max(0, (o.y - 12) / -d.y);
    const tEnd = (o.y + 4) / -d.y;
    let prevT = t;
    const step = 0.35;
    for (; t < tEnd; t += step) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const gh = Math.max(heightAt(x, z), 0);
      if (y <= gh) {
        // förfina
        let a = prevT, b = t;
        for (let it = 0; it < 10; it++) {
          const mid = (a + b) / 2;
          const mx = o.x + d.x * mid, my = o.y + d.y * mid, mz = o.z + d.z * mid;
          if (my <= Math.max(heightAt(mx, mz), 0)) b = mid; else a = mid;
        }
        const x2 = o.x + d.x * b, z2 = o.z + d.z * b;
        return { x: x2, z: z2, y: o.y + d.y * b };
      }
      prevT = t;
    }
    return null;
  }

  /* ---------- Natur ---------- */
  treeKind(k) { return hash(k * 3 + 1) < 0.62 ? 'pine' : 'leaf'; }

  refreshTile(k, mark = true) {
    if (this.tufts) this.updateTuft(k);
    const m = G.map;
    const r = m.res[k];
    const n = m.n;
    const x = (k % n) + 0.5 + (hash(k + 5) - 0.5) * 0.5, z = Math.floor(k / n) + 0.5 + (hash(k + 9) - 0.5) * 0.5;
    const y = Math.max(heightAt(x, z), 0) - 0.03;
    const M = this._m4, Q = this._q, V = this._v, S = this._s;
    // träd
    const kind = this.treeKind(k);
    const isTree = r === R.TREE && m.grow[k] >= 0;
    const isStump = r === R.TREE && m.grow[k] < 0;
    if (isTree) {
      let slot = this.slotTree[k];
      if (slot < 0) {
        const free = this.freeTree[kind];
        slot = free.length ? free.pop() : this.nextTree[kind]++;
        if (slot >= this.pineT.instanceMatrix.count) { this.nextTree[kind]--; return; }
        this.slotTree[k] = slot;
      }
      const g = m.grow[k];
      const s = (0.22 + 0.78 * Math.min(1, g)) * (0.8 + hash(k + 2) * 0.55);
      Q.setFromAxisAngle(this._e.set(0, 1, 0), hash(k) * 6.28);
      M.compose(V.set(x, y, z), Q, S.set(s, s * (0.9 + hash(k + 4) * 0.3), s));
      const trunk = kind === 'pine' ? this.pineT : this.leafT, crown = kind === 'pine' ? this.pineC : this.leafC;
      trunk.setMatrixAt(slot, M);
      const season = G.cal ? G.cal.season : 1;
      if (kind === 'leaf' && season === 3) crown.setMatrixAt(slot, this.zero);
      else crown.setMatrixAt(slot, M);
      crown.setColorAt(slot, this.crownColor(k, kind, season, this._tmp));
      if (mark) this.dirtyNat.add(trunk).add(crown);
    } else {
      const slot = this.slotTree[k];
      if (slot >= 0) {
        const trunk = kind === 'pine' ? this.pineT : this.leafT, crown = kind === 'pine' ? this.pineC : this.leafC;
        trunk.setMatrixAt(slot, this.zero); crown.setMatrixAt(slot, this.zero);
        this.freeTree[kind].push(slot); this.slotTree[k] = -1;
        if (mark) this.dirtyNat.add(trunk).add(crown);
      }
    }
    // stubbe
    if (isStump) {
      let slot = this.slotStump[k];
      if (slot < 0) { slot = this.freeStump.length ? this.freeStump.pop() : this.nextStump++; if (slot >= this.stumps.instanceMatrix.count) { this.nextStump--; slot = -1; } else this.slotStump[k] = slot; }
      if (slot >= 0) { M.compose(V.set(x, y, z), Q.identity(), S.set(1.2, 1, 1.2)); this.stumps.setMatrixAt(slot, M); if (mark) this.dirtyNat.add(this.stumps); }
    } else if (this.slotStump[k] >= 0) {
      this.stumps.setMatrixAt(this.slotStump[k], this.zero); this.freeStump.push(this.slotStump[k]); this.slotStump[k] = -1;
      if (mark) this.dirtyNat.add(this.stumps);
    }
    // sten, malm, bär
    if (r === R.STONE || r === R.ORE || r === R.BERRY || this.slotRes[k] >= 0) {
      const im = r === R.STONE ? this.rocks : r === R.ORE ? this.ores : r === R.BERRY ? this.bushes : null;
      let slot = this.slotRes[k];
      if (im && slot < 0) { slot = this.nextRes[r]++; if (slot >= im.instanceMatrix.count) { this.nextRes[r]--; return; } this.slotRes[k] = slot; this.slotResKind[k] = r; }
      const kind = this.slotResKind[k] || r;
      const imk = kind === R.STONE ? this.rocks : kind === R.ORE ? this.ores : this.bushes;
      if (r !== kind || (r === R.STONE && m.amt[k] <= 0) || (r === R.ORE && m.amt[k] <= 0)) {
        if (slot >= 0) { imk.setMatrixAt(slot, this.zero); if (kind === R.BERRY) this.berries.setMatrixAt(slot, this.zero); if (mark) this.dirtyNat.add(imk).add(this.berries); }
        return;
      }
      Q.setFromAxisAngle(this._e.set(0, 1, 0), hash(k) * 6.28);
      let s = 1;
      if (r === R.STONE) s = 0.55 + 0.55 * Math.min(1, m.amt[k] / 45);
      else if (r === R.ORE) s = 0.7 + 0.4 * Math.min(1, m.amt[k] / 260);
      else s = 0.85 + hash(k + 1) * 0.3;
      const cx = (k % n) + 0.5, cz = Math.floor(k / n) + 0.5;
      const cy = Math.max(heightAt(cx, cz), 0) - 0.04;
      M.compose(V.set(cx, cy, cz), Q, S.set(s, s, s));
      imk.setMatrixAt(slot, M);
      if (r === R.STONE) imk.setColorAt(slot, this._tmp.setRGB(0.46 + hash(k) * 0.1, 0.46 + hash(k) * 0.1, 0.45 + hash(k) * 0.08));
      if (r === R.ORE) imk.setColorAt(slot, this._tmp.setRGB(1, 1, 1));
      if (r === R.BERRY) {
        imk.setColorAt(slot, this._tmp.setRGB(1, 1, 1));
        const b = m.amt[k] / 6;
        if (b > 0.05) { M.compose(V.set(cx, cy, cz), Q, S.set(s * (0.6 + b * 0.4), s * (0.6 + b * 0.4), s * (0.6 + b * 0.4))); this.berries.setMatrixAt(slot, M); }
        else this.berries.setMatrixAt(slot, this.zero);
        this.berries.setColorAt(slot, hash(k + 3) > 0.6 ? this._tmp.setRGB(0.25, 0.25, 0.75) : this._tmp.setRGB(0.85, 0.12, 0.2));
        if (mark) this.dirtyNat.add(this.berries);
      }
      if (mark) this.dirtyNat.add(imk);
    }
  }

  crownColor(k, kind, season, out) {
    const v = hash(k + 13);
    if (kind === 'pine') return out.setRGB(0.17 + v * 0.06, 0.33 + v * 0.08, 0.17 + v * 0.04);
    if (season === 0) return out.setRGB(0.48 + v * 0.1, 0.75 + v * 0.08, 0.3);
    if (season === 1) return out.setRGB(0.3 + v * 0.08, 0.55 + v * 0.1, 0.22);
    if (season === 2) { const t = hash(k + 21); return t < 0.4 ? out.setRGB(0.9, 0.62, 0.15) : t < 0.75 ? out.setRGB(0.82, 0.36, 0.12) : out.setRGB(0.88, 0.78, 0.25); }
    return out.setRGB(0.5, 0.45, 0.35);
  }

  /** Uppdatera alla träd (vid årstidsbyte). */
  refreshAllTrees() {
    const m = G.map, NN = m.n * m.n;
    for (let k = 0; k < NN; k++) if (m.res[k] === R.TREE || m.res[k] === R.BERRY) this.refreshTile(k, false);
    [this.pineT, this.pineC, this.leafT, this.leafC, this.stumps, this.bushes, this.berries].forEach(im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }

  flush() {
    // rita bara använda instanser
    this.pineT.count = this.pineC.count = this.nextTree.pine; this.leafT.count = this.leafC.count = this.nextTree.leaf;
    this.stumps.count = this.nextStump; this.rocks.count = this.nextRes[2]; this.ores.count = this.nextRes[3]; this.bushes.count = this.berries.count = this.nextRes[4];
    if (this.texDirty) { this.texDirty = false; this.natTex.needsUpdate = true; this.ovTex.needsUpdate = true; }
    if (this.tuftDirty) { this.tuftDirty = false; this.tufts.instanceMatrix.needsUpdate = true; this.flowers.instanceMatrix.needsUpdate = true; }
    if (!this.dirtyNat.size) return;
    for (const im of this.dirtyNat) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.dirtyNat.clear();
  }

  update(dt, t) {
    this.waterU.uTime.value = t;
    if (this.tuftU) this.tuftU.uTime.value = t;
    this.flush();
  }
}
