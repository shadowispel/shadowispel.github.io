/**
 * Fjällracet – stiliserade människor (åskådare, funktionärer) längs banorna.
 *
 * En enda människogeometri (två detaljnivåer) med alla tillbehör (frisyrer, keps, mössa, luva, halsduk,
 * regnrock, flagga, skylt). Varje vertex vet (aPart) sin kroppsdel, sin färgzon och vilket
 * tillbehör den hör till. Per instans: färger (hud, överdel, underdel, hår, accent), tillbehörsmask,
 * animationsstil, fas och vilken publikgrupp personen står i. Allt animeras i vertexshadern:
 * hopp, vinkningar, klappar, jubel, flaggviftning och huvud/kropp som vrids mot närmaste bil.
 * En InstancedMesh per publikgrupp och detaljnivå; grupper långt bort göms helt.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------------------------------------------------------- tillbehörsbitar */
const V_HAIR = 1, V_LONG = 2, V_CAP = 4, V_BEANIE = 8, V_HOOD = 16, V_FLAG = 32, V_SIGN = 64, V_SCARF = 128;
const O_SLEEVE = 256, O_PANTS = 512, O_NEON = 1024, V_COAT = 2048;
/* färgzoner: 0 fast (vertexfärg), 1 hud, 2 överdel, 3 underdel, 4 hår, 5 accent, 6 ärm (överdel/hud), 7 underben (byxa/hud) */
/* kroppsdelar: 0 kropp, 1 huvud, 2 vänster arm (+x), 3 höger arm (−x), 6 flaggstång (höger arm), 7 flaggduk */
const SH_Y = 1.45, SH_X = 0.2, NECK_Y = 1.58;
export const MAX_SPOTS = 48;

function part(geo, bone, reg, v = 0, col = 0xffffff) {
  const g = geo.index ? geo : geo; // alla three-primitiver är indexerade
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  const n = g.attributes.position.count, c = new THREE.Color(col);
  const cc = new Float32Array(n * 3), pp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b; pp[i * 3] = bone; pp[i * 3 + 1] = reg; pp[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(pp, 3)); // kroppsdel, färgzon, tillbehör
  return g;
}

/** Människogeometri, fötterna i origo, ansiktet mot +z. lod 0 = nära, 1 = långt bort. */
export function personGeometry(lod = 0) {
  const near = lod === 0;
  const cs = near ? 2 : 1, rs = near ? 7 : 5, sw = near ? 9 : 6, sh = near ? 6 : 4;
  const cap = (r, len, x, y, z, sx = 1, sz = 1) => new THREE.CapsuleGeometry(r, len, cs, rs).scale(sx, 1, sz).translate(x, y, z);
  const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, th = Math.PI) => new THREE.SphereGeometry(r, sw, sh, 0, Math.PI * 2, 0, th).scale(sx, sy, sz).translate(x, y, z);
  // skal som är öppet framåt (+z) – frisyr och luva får inte täcka ansiktet
  const shell = (r, open, th, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, sw + 2, sh, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, th).scale(sx, sy, sz).translate(x, y, z);
  const P = [];
  for (const s of [-1, 1]) {
    // skor, underben, lår
    P.push(part(new THREE.CapsuleGeometry(0.058, 0.13, cs, rs).rotateX(Math.PI / 2).scale(1.05, 0.9, 1).translate(0.1 * s, 0.052, 0.04), 0, 0, 0, 0x26221f));
    P.push(part(cap(0.066, 0.36, 0.1 * s, 0.33, 0), 0, 7));
    P.push(part(cap(0.08, 0.32, 0.1 * s, 0.72, 0), 0, 3));
    // arm: axel, överarm, underarm, hand (vilar hängande längs −y från axeln)
    const bone = s > 0 ? 2 : 3;
    P.push(part(sph(0.074, SH_X * s, SH_Y, 0), bone, 2));
    P.push(part(cap(0.056, 0.24, SH_X * s, SH_Y - 0.15, 0), bone, 2));
    P.push(part(cap(0.047, 0.22, SH_X * s, SH_Y - 0.43, 0), bone, 6));
    P.push(part(sph(0.052, SH_X * s, SH_Y - 0.6, 0.0, 0.85, 1.15, 1), bone, 1));
  }
  // höfter, bål, hals
  P.push(part(sph(0.17, 0, 0.94, 0, 1.02, 0.62, 0.72), 0, 3));
  P.push(part(cap(0.165, 0.3, 0, 1.22, 0, 1.12, 0.7), 0, 2));
  P.push(part(new THREE.CapsuleGeometry(0.075, 0.26, cs, rs).rotateZ(Math.PI / 2).scale(1, 1, 0.9).translate(0, SH_Y - 0.01, 0), 0, 2)); // axelparti
  P.push(part(new THREE.CylinderGeometry(0.055, 0.06, 0.12, rs).translate(0, 1.56, 0), 1, 1));
  // regnrock / vinterrock: kjol nedanför midjan
  P.push(part(new THREE.CylinderGeometry(0.19, 0.23, 0.42, rs + 2, 1, true).translate(0, 0.78, 0), 0, 2, V_COAT));
  // huvud + ansikte
  P.push(part(sph(0.118, 0, 1.73, 0, 1, 1.1, 1.02), 1, 1));
  if (near) {
    for (const s of [-1, 1]) {
      P.push(part(sph(0.019, 0.042 * s, 1.75, 0.1, 1, 1.25, 0.6), 1, 0, 0, 0x16161c));
      P.push(part(new THREE.BoxGeometry(0.05, 0.012, 0.012).rotateZ(0.12 * s).translate(0.043 * s, 1.785, 0.105), 1, 4)); // ögonbryn
      P.push(part(sph(0.026, 0.117 * s, 1.73, 0, 0.5, 1, 0.8), 1, 1)); // öron
    }
    P.push(part(sph(0.022, 0, 1.715, 0.117, 0.8, 1, 0.9), 1, 1));
    P.push(part(new THREE.BoxGeometry(0.055, 0.012, 0.012).translate(0, 1.67, 0.108), 1, 0, 0, 0x7a2e2a));
  }
  // frisyrer och huvudbonader
  P.push(part(sph(0.126, 0, 1.745, -0.008, 1, 1.05, 1.06, Math.PI * 0.3), 1, 4, V_HAIR | V_LONG));
  P.push(part(shell(0.126, 0.75, Math.PI * 0.55, 0, 1.745, -0.008, 1, 1.05, 1.06), 1, 4, V_HAIR));
  P.push(part(shell(0.129, 0.8, Math.PI * 0.62, 0, 1.745, -0.01, 1.03, 1.06, 1.08), 1, 4, V_LONG));
  P.push(part(cap(0.1, 0.2, 0, 1.6, -0.055, 1.15, 0.55), 1, 4, V_LONG));
  P.push(part(sph(0.13, 0, 1.765, -0.005, 1, 0.9, 1.04, Math.PI * 0.5), 1, 5, V_CAP));
  P.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.016, rs + 2).scale(1, 1, 0.9).translate(0, 1.77, 0.12), 1, 5, V_CAP));
  P.push(part(sph(0.134, 0, 1.735, 0, 1, 1.25, 1.04, Math.PI * 0.55), 1, 5, V_BEANIE));
  P.push(part(new THREE.CylinderGeometry(0.137, 0.137, 0.05, rs + 2).translate(0, 1.76, 0), 1, 5, V_BEANIE, 0xd0d0d0));
  P.push(part(sph(0.042, 0, 1.92, 0), 1, 0, V_BEANIE, 0xf4f4f4));
  P.push(part(shell(0.155, 0.95, Math.PI * 0.66, 0, 1.73, -0.02, 1, 1.08, 1.05), 1, 2, V_HOOD));
  P.push(part(new THREE.TorusGeometry(0.085, 0.036, 5, rs + 2).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, 1.55, 0.005), 0, 5, V_SCARF));
  P.push(part(new THREE.BoxGeometry(0.07, 0.24, 0.025).translate(0.06, 1.4, 0.13), 0, 5, V_SCARF));
  // flagga (stången fortsätter från höger hand – armen hålls uppe)
  P.push(part(new THREE.CylinderGeometry(0.013, 0.013, 1.35, 4).translate(-SH_X, SH_Y - 0.6 - 0.62, 0.0), 6, 0, V_FLAG, 0xd8d8d8));
  P.push(part(new THREE.BoxGeometry(0.62, 0.4, 0.012, near ? 6 : 2, 1, 1).translate(-SH_X + 0.31, SH_Y - 0.6 - 1.08, 0), 7, 5, V_FLAG));
  // skylt som hålls över huvudet
  P.push(part(new THREE.BoxGeometry(0.86, 0.48, 0.03).translate(0, 2.16, 0.13), 0, 5, V_SIGN));
  P.push(part(new THREE.BoxGeometry(0.72, 0.32, 0.01).translate(0, 2.16, 0.15), 0, 0, V_SIGN, 0xf6f4ee));
  if (near) for (let k = 0; k < 3; k++) P.push(part(new THREE.BoxGeometry(0.5 - k * 0.12, 0.04, 0.01).translate(-0.05 + k * 0.03, 2.24 - k * 0.075, 0.157), 0, 5, V_SIGN));
  for (const p of P) { if (p.attributes.normal == null) p.computeVertexNormals(); }
  const g = mergeGeometries(P);
  P.forEach(p => p.dispose());
  return g;
}

/* ---------------------------------------------------------------- shader */
const HEAD = /* glsl */`
uniform float uTime; uniform float uCheer; uniform float uNeon; uniform float uGlow; uniform vec4 uSpot[${MAX_SPOTS}];
attribute vec3 aPart;
attribute vec3 aSkin; attribute vec3 aTop; attribute vec3 aBot; attribute vec3 aHair; attribute vec3 aAcc; attribute vec4 aCfg;
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
// armställning: a = lyft utåt, f = framåt, cl = inåt (klapp)
void armPose(int st, float side, float t, float ex, out float a, out float f, out float cl) {
  a = 0.1 + 0.03 * sin(t * 1.1 + side); f = 0.06 + 0.04 * sin(t * 1.3 + side * 2.0); cl = 0.0;
  float e = clamp(ex, 0.0, 1.2);
  if (st == 0) { // hoppare: knutna nävar upp
    float k = smoothstep(0.3, 0.45, e);
    f = mix(f, 2.65 + 0.3 * sin(t * 9.0 + side), k); a = mix(a, 0.35, k);
  } else if (st == 1) { // vinkare
    if (side < 0.0) { float k = smoothstep(0.08, 0.35, e); a = mix(a, 2.5 + sin(t * (6.0 + 4.0 * e)) * (0.3 + 0.2 * e), k); f = mix(f, 0.35, k) + 1.2 * sin(k * 3.14159); }
  } else if (st == 2) { // klappare
    float k = 0.5 + 0.5 * sin(t * (7.0 + 6.0 * e));
    float u = smoothstep(0.1, 0.3, e);
    f = mix(f, mix(0.9, 2.4, smoothstep(0.6, 1.0, e)), u); a = mix(a, 0.1, u); cl = mix(0.0, mix(0.05, 0.45, k), u);
  } else if (st == 3) { // jublare: armarna i ett V
    float k = smoothstep(0.2, 0.45, e);
    a = mix(a, 2.4 + 0.25 * sin(t * 6.5 + side * 0.6), k); f = mix(f, 0.45, k) + 1.2 * sin(k * 3.14159);
  } else if (st == 4) { // flagga i höger hand
    if (side < 0.0) { a = 2.55 + sin(t * (2.2 + 3.5 * e)) * (0.22 + 0.35 * e); f = 0.18; }
    else { float k = smoothstep(0.5, 0.8, e); a = mix(a, 2.3, k); f += 1.2 * sin(k * 3.14159); }
  } else if (st == 5) { // skylt över huvudet
    a = 2.86 + 0.04 * sin(t * 3.0); f = 0.22;
  }
}
void anim(in vec3 p, out vec3 P, out mat3 R) {
  int mask = int(aCfg.x + 0.5); int v = int(aPart.z + 0.5);
  if (v != 0 && (mask & v) == 0) { P = vec3(0.0, 0.9, 0.0); R = mat3(1.0); return; }
  int st = int(aCfg.y + 0.5); float ph = aCfg.z; int si = int(aCfg.w + 0.5);
  vec4 sp = uSpot[si];
  float ex = clamp(uCheer * 0.6 + sp.z, 0.0, 1.4);
  float t = uTime + ph * 11.0;
  // vänd sig mot närmaste bil
  vec3 wo = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 dl = transpose(mat3(instanceMatrix)) * vec3(sp.x - wo.x, 0.0, sp.y - wo.z);
  float yaw = clamp(atan(dl.x, dl.z), -1.3, 1.3) * sp.w + sin(t * 0.31) * 0.3 * (1.0 - sp.w);
  int bone = int(aPart.x + 0.5);
  vec3 q = p; R = mat3(1.0);
  if (bone == 1) {
    vec3 pv = vec3(0.0, ${NECK_Y.toFixed(2)}, 0.0);
    mat3 H = rY(yaw * 0.45) * rX(-0.12 * ex * (0.5 + 0.5 * sin(t * 6.0)));
    q = pv + H * (q - pv); R = H;
  } else if (bone >= 2) {
    float side = bone == 2 ? 1.0 : -1.0;
    if (bone == 7) { float d = q.x + ${SH_X.toFixed(3)}; q.z += sin(t * 9.0 - d * 10.0) * 0.09 * d; }
    float a, f, cl; armPose(st, side, t, ex, a, f, cl);
    vec3 pv = vec3(${SH_X.toFixed(3)} * side, ${SH_Y.toFixed(2)}, 0.0);
    mat3 A = rY(-side * cl) * rZ(side * a) * rX(-f);
    q = pv + A * (q - pv); R = A;
  }
  // hela kroppen: vridning, gungning och hopp
  float hop = (st == 0 || st == 3) ? 1.0 : 0.35;
  float w = 4.6 + mod(ph * 13.0, 2.0);
  float b = pow(max(0.0, sin(t * w)), 0.7) * (0.015 + 0.3 * hop * smoothstep(0.2, 1.0, ex));
  mat3 B = rY(yaw * 0.55) * rZ(sin(t * 0.9) * 0.025);
  q = B * q; R = B * R; q.y += b + 0.012 * sin(t * 1.7);
  P = q;
}
`;

function crowdMaterial(uniforms, neon) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = HEAD + 'varying float vNeon;\n' + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
        {
          int mk = int(aCfg.x + 0.5); int rg = int(aPart.y + 0.5);
          bool ls = (mk & ${O_SLEEVE}) != 0, lp = (mk & ${O_PANTS}) != 0;
          vec3 rc = vec3(1.0);
          if (rg == 1) rc = aSkin; else if (rg == 2) rc = aTop; else if (rg == 3) rc = aBot; else if (rg == 4) rc = aHair;
          else if (rg == 5) rc = aAcc; else if (rg == 6) rc = ls ? aTop : aSkin; else if (rg == 7) rc = lp ? aBot : aSkin;
          vColor.rgb *= rc;
          vNeon = ((mk & ${O_NEON}) != 0 && (rg == 2 || rg == 5 || (rg == 6 && ls))) ? 1.0 : 0.0;
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 aP; mat3 aR; anim(position, aP, aR); objectNormal = aR * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = aP;`);
    sh.fragmentShader = 'uniform float uNeon; uniform float uGlow;\nvarying float vNeon;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (vNeon * uNeon + uGlow);`);
  };
  m.customProgramCacheKey = () => 'fj-crowd';
  return m;
}
function crowdDepthMaterial(uniforms) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = HEAD + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 aP; mat3 aR; anim(position, aP, aR); transformed = aP; }`);
  };
  m.customProgramCacheKey = () => 'fj-crowd-depth';
  return m;
}

/* ---------------------------------------------------------------- klädpaletter per tema */
const SKIN = [0xf3cfb3, 0xe8b48f, 0xd29c74, 0xb67852, 0x8a5536, 0x5c3824, 0xf6dcc8];
const HAIR = [0x1d140d, 0x3b2414, 0x6b4223, 0xa5703a, 0xd9b46a, 0x161616, 0x8f3a1c, 0xb9b4ae, 0xe6dccb];
const PAL = {
  sommar: { top: [0xd6312a, 0x2456c8, 0xf6c431, 0xf4f4f0, 0x2f9a48, 0xff7f24, 0x8a6fd1, 0x2a2a30, 0x3ec7f0, 0xff7ab8, 0x1f8a8a], bot: [0x2b3a5a, 0x3a3a40, 0x1e2a44, 0x6b5b45, 0xcdbb93, 0x4a5a3a, 0x7a8796],
    acc: [0xd6312a, 0x2456c8, 0xf6c431, 0xffffff, 0x2f9a48, 0x111111, 0xff7f24], sleeve: 0.25, pants: 0.6 },
  regn: { top: [0xffd21f, 0x1f3a8a, 0xd62828, 0x2e8b3a, 0xff7a1a, 0x2a2a30, 0x1f8a8a, 0xff4fa0], bot: [0x22283a, 0x2f2f36, 0x1b2233, 0x3a4048],
    acc: [0xffd21f, 0x1f3a8a, 0xd62828, 0xffffff, 0x2e8b3a], sleeve: 1, pants: 1 },
  vinter: { top: [0xd62828, 0x1f4fbf, 0x1a1a1f, 0x2e8b3a, 0xff7a1a, 0x8a6fd1, 0xf1f1f1, 0x0f6b6b, 0xf6c431], bot: [0x1c2233, 0x2a2a30, 0x3a3a48, 0x24324a],
    acc: [0xd62828, 0xf6c431, 0xffffff, 0x1f4fbf, 0x2e8b3a, 0xff7ab8, 0x8a6fd1], sleeve: 1, pants: 1 },
  neon: { top: [0xff3df0, 0x39d5ff, 0x4ade80, 0xffe81f, 0xb56cff, 0xff5a3a, 0x1a1a22, 0x22222c], bot: [0x15151c, 0x1c1c26, 0x26203a, 0x101418],
    acc: [0xff3df0, 0x39d5ff, 0x4ade80, 0xffe81f, 0xb56cff], sleeve: 0.7, pants: 1 }
};
const COUNTRY_FLAGS = [0x2a6fd6, 0xd62828, 0xf6c431, 0x2e8b3a, 0xffffff];

/** Klädstil för en bana. */
export function crowdStyle(theme, def) {
  if (def && def.theme === 'stad') return 'neon';
  if (theme.weather === 'snow' || theme.shoulder === 'snow') return 'vinter';
  if (theme.weather === 'rain') return 'regn';
  return 'sommar';
}

/* ---------------------------------------------------------------- publiken */
/**
 * people: [{ x, y, z, rot, spot, kind: 'fan'|'marshal'|'stand' }]
 * spots: [{ x, z }] gruppcentrum (för upphetsning och blickriktning)
 * groups: [[index i people], …] en InstancedMesh per grupp och detaljnivå
 */
export class Crowd {
  constructor(people, spots, groups, opts) {
    const { rng, style, night, shadows } = opts;
    this.nearDist = opts.nearDist ?? 60;
    this.group = new THREE.Group(); this.group.name = 'crowd';
    this.disp = [];
    this.spots = spots.slice(0, MAX_SPOTS).map(s => ({ x: s.x, z: s.z, ex: 0, w: 0, tx: s.x + 1, tz: s.z }));
    const spotArr = []; for (let k = 0; k < MAX_SPOTS; k++) spotArr.push(new THREE.Vector4(0, 0, 0, 0));
    this.uniforms = { uTime: { value: 0 }, uCheer: { value: 0 }, uNeon: { value: style === 'neon' ? 0.9 : 0 }, uGlow: { value: night ? 0.12 : 0 }, uSpot: { value: spotArr } };
    const geoN = personGeometry(0), geoF = personGeometry(1);
    const mat = crowdMaterial(this.uniforms), depth = crowdDepthMaterial(this.uniforms);
    this.disp.push(geoN, geoF, mat, depth);
    const pal = PAL[style] || PAL.sommar;
    const pick = (a) => a[(rng() * a.length) | 0];
    const col = new THREE.Color();
    const setC = (arr, i, hex, j = 0.12) => { col.setHex(hex).offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * j, (rng() - 0.5) * j); arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; };
    this.meshes = [];
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pv = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    for (const idx of groups) {
      if (!idx.length) continue;
      const n = idx.length;
      const aSkin = new Float32Array(n * 3), aTop = new Float32Array(n * 3), aBot = new Float32Array(n * 3), aHair = new Float32Array(n * 3), aAcc = new Float32Array(n * 3), aCfg = new Float32Array(n * 4);
      const mats = [];
      let cx = 0, cz = 0;
      idx.forEach((pi, i) => {
        const p = people[pi];
        cx += p.x; cz += p.z;
        const kid = p.kind !== 'marshal' && rng() < 0.08;
        const h = kid ? 0.62 + rng() * 0.1 : 0.9 + rng() * 0.17;
        let wdt = kid ? 0.95 : 0.88 + rng() * 0.3;
        if (style === 'vinter') wdt += 0.08;
        qq.setFromAxisAngle(UP, p.rot + (rng() - 0.5) * 0.5);
        m4.compose(pv.set(p.x, p.y, p.z), qq, sc.set(wdt * h, h, (0.9 + rng() * 0.2) * wdt * h));
        mats.push(m4.clone());
        setC(aSkin, i, pick(SKIN), 0.05);
        setC(aHair, i, kid ? pick(HAIR.slice(0, 6)) : pick(HAIR));
        let mask = 0, st = (rng() * 4) | 0;
        const r = rng();
        if (p.kind === 'marshal') {
          setC(aTop, i, 0xff6a10, 0.04); setC(aBot, i, 0x22262e); setC(aAcc, i, rng() < 0.5 ? 0xffd21f : 0xffffff, 0.02);
          mask = O_SLEEVE | O_PANTS | V_FLAG | (style === 'vinter' ? V_BEANIE : style === 'regn' ? V_HOOD : V_CAP | V_HAIR);
          st = 4;
        } else {
          setC(aTop, i, pick(pal.top)); setC(aBot, i, pick(pal.bot)); setC(aAcc, i, pick(pal.acc));
          if (rng() < pal.sleeve) mask |= O_SLEEVE;
          if (rng() < pal.pants) mask |= O_PANTS;
          // huvud
          if (style === 'vinter') mask |= r < 0.7 ? V_BEANIE | (rng() < 0.4 ? V_LONG : 0) : r < 0.85 ? V_HOOD : V_HAIR;
          else if (style === 'regn') mask |= r < 0.6 ? V_HOOD : r < 0.8 ? V_CAP | V_HAIR : rng() < 0.5 ? V_LONG : V_HAIR;
          else if (style === 'neon') mask |= r < 0.3 ? V_CAP | V_HAIR : r < 0.5 ? V_HOOD : rng() < 0.5 ? V_LONG : V_HAIR;
          else mask |= r < 0.28 ? V_CAP | V_HAIR : r < 0.33 ? V_BEANIE : rng() < 0.45 ? V_LONG : V_HAIR;
          if (style === 'vinter' && rng() < 0.6) mask |= V_SCARF;
          if ((style === 'regn' || style === 'vinter') && rng() < 0.4) mask |= V_COAT;
          if (style === 'neon' && rng() < 0.65) mask |= O_NEON;
          // flaggor och skyltar
          const f = rng();
          if (f < 0.08) { mask |= V_FLAG; st = 4; setC(aAcc, i, pick(COUNTRY_FLAGS), 0.03); }
          else if (f < 0.13 && !kid) { mask |= V_SIGN; st = 5; }
        }
        aCfg[i * 4] = mask; aCfg[i * 4 + 1] = st; aCfg[i * 4 + 2] = rng(); aCfg[i * 4 + 3] = Math.min(MAX_SPOTS - 1, p.spot);
      });
      cx /= n; cz /= n;
      const inst = { aSkin: new THREE.InstancedBufferAttribute(aSkin, 3), aTop: new THREE.InstancedBufferAttribute(aTop, 3), aBot: new THREE.InstancedBufferAttribute(aBot, 3),
        aHair: new THREE.InstancedBufferAttribute(aHair, 3), aAcc: new THREE.InstancedBufferAttribute(aAcc, 3), aCfg: new THREE.InstancedBufferAttribute(aCfg, 4) };
      const mk = (base) => {
        const g = new THREE.BufferGeometry(); g.setIndex(base.index);
        for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
        for (const k of Object.keys(inst)) g.setAttribute(k, inst[k]);
        const im = new THREE.InstancedMesh(g, mat, n);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.customDepthMaterial = depth;
        im.castShadow = !!shadows; im.receiveShadow = true;
        im.computeBoundingSphere(); im.boundingSphere.radius += 3;
        this.group.add(im); this.disp.push(g); // geometrins delade attribut städas via bas-geometrierna
        return im;
      };
      const near = mk(geoN), far = mk(geoF);
      far.castShadow = false;
      const bs = near.boundingSphere;
      this.meshes.push({ near, far, c: bs.center.clone(), r: bs.radius });
    }
    this._t = 0;
  }
  /** cars: [{ root, speed }] */
  update(dt, time, cheer, cam, cars) {
    const u = this.uniforms; u.uTime.value = time; u.uCheer.value = cheer;
    // detaljnivå per grupp
    const cp = cam.position;
    for (const m of this.meshes) {
      const d = Math.max(0, m.c.distanceTo(cp) - m.r);
      m.near.visible = d < this.nearDist; m.far.visible = !m.near.visible && d < 650;
    }
    if (!dt) return;
    const arr = u.uSpot.value;
    this.spots.forEach((s, k) => {
      let best = 1e9, bx = s.tx, bz = s.tz, tgt = 0;
      if (cars) for (const c of cars) {
        const p = c.root.position, dx = p.x - s.x, dz = p.z - s.z, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; bx = p.x; bz = p.z; }
        const d = Math.sqrt(d2);
        tgt = Math.max(tgt, Math.min(1, Math.max(0, (75 - d) / 60)) * Math.min(1, 0.35 + (c.speed || 0) / 30));
      }
      const dist = Math.sqrt(best);
      s.ex += (tgt - s.ex) * (1 - Math.exp(-dt * (tgt > s.ex ? 5 : 1.2)));
      const wt = Math.min(1, Math.max(0, (140 - dist) / 90));
      s.w += (wt - s.w) * (1 - Math.exp(-dt * 3));
      s.tx += (bx - s.tx) * (1 - Math.exp(-dt * 8)); s.tz += (bz - s.tz) * (1 - Math.exp(-dt * 8));
      arr[k].set(s.tx, s.tz, s.ex, s.w);
    });
  }
  dispose() { this.disp.forEach(d => { try { d.dispose(); } catch (e) {} }); }
}
