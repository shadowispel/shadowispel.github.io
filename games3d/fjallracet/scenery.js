/**
 * Fjällracet – miljöer för de nya banorna (och Neostad): placering av modeller, landmärken,
 * gatlampor och animerade detaljer. Anropas från World.buildScenery.
 */
import * as THREE from 'three';
import * as TX from './textures.js';
import * as PR from './props.js';
import { Chunked } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/* ------------------------------------------------------------------ hjälp */
function vmat(w, opts = {}) { const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85 }, opts)); w.disp.push(m); return m; }
function chunked(w, geo, mat, shadow = true, chunk = 260) { w.disp.push(geo); return new Chunked(geo, mat, chunk, { shadow: shadow && w.q.shadows }); }
function addAt(ch, x, y, z, ry, s = 1, color = null, sy = null) {
  _p.set(x, y, z); _q.setFromAxisAngle(UP, ry); if (typeof s === 'number') _s.set(s, sy == null ? s : sy, s); else _s.copy(s);
  _m4.compose(_p, _q, _s); ch.add(_m4, color);
}
function single(w, geo, mat, x, y, z, ry = 0, s = 1) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s);
  m.castShadow = w.q.shadows; m.receiveShadow = true; w.group.add(m); w.disp.push(geo); return m;
}
/** Slumpar en fri plats på avstånd [minD,maxD] från vägen och minst sep från tidigare platser i 'taken'. */
function freeSpot(w, minD, maxD, sep, taken, filter, tries = 600) {
  const t = w.tg, rng = w.rng;
  for (let k = 0; k < tries; k++) {
    const x = t.x0 + rng() * (t.nx - 1) * t.cell, z = t.z0 + rng() * (t.nz - 1) * t.cell;
    const ri = w.roadInfo(x, z); if (ri.d < minD || ri.d > maxD) continue;
    if (taken && taken.some(p => Math.hypot(p[0] - x, p[1] - z) < p[2] + sep)) continue;
    if (w.waterY != null && w.heightAt(x, z) < w.waterY + 0.8) continue;
    if (filter && !filter(x, z, ri)) continue;
    if (taken) taken.push([x, z, sep]);
    return [x, z, ri];
  }
  return null;
}
/** Vinkel (rotation.y) så att modellens +z pekar mot närmaste vägpunkt. */
function yawToRoad(w, x, z, ri) {
  const P = w.track.P, i = ri.i; return Math.atan2(P[i * 3] - x, P[i * 3 + 2] - z);
}
/** Punkt vid banposition s, sida d (meter) – på marken. */
function trackPt(w, i, d) {
  const tr = w.track; return [tr.P[i * 3] + tr.R[i * 3] * d, tr.P[i * 3 + 2] + tr.R[i * 3 + 2] * d];
}
const tangentYaw = (tr, i) => Math.atan2(tr.T[i * 3], tr.T[i * 3 + 2]);

/** Stenmurar längs vägen och ut över fälten (Öland, Gotland). */
function stoneWalls(w, dens, amount = 1) {
  const tr = w.track, rng = w.rng;
  const geo = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(); PR.colorize(geo, 0xffffff);
  const ch = chunked(w, geo, vmat(w, { roughness: 1, flatShading: true }), false, 200);
  const stone = (x, z) => {
    const h = w.heightAt(x, z); if (w.waterY != null && h < w.waterY + 0.5) return;
    const c = new THREE.Color().setHSL(0.1, 0.05, 0.55 + rng() * 0.2);
    addAt(ch, x, h + 0.15, z, rng() * 6, new THREE.Vector3(0.55 + rng() * 0.3, 0.4 + rng() * 0.25, 0.5 + rng() * 0.25), c);
  };
  const step = Math.round(1.1 / tr.ds * 10) / 10;
  for (const side of [-1, 1]) {
    let on = rng() < 0.6, k = 0;
    for (let i = 0; i < tr.N; i += Math.max(1, step)) {
      if (++k % 60 === 0) on = rng() < 0.65 * amount;
      const ii = Math.floor(i);
      if (!on || tr.bridge[ii] || tr.tunnel[ii]) continue;
      const [x, z] = trackPt(w, ii, side * (tr.limit + 5.5));
      if (w.roadInfo(x, z).d < tr.limit + 4) continue;
      stone(x, z);
    }
  }
  // fältmurar ut från vägen
  for (let n = 0; n < 40 * dens * amount; n++) {
    const i = Math.floor(rng() * tr.N); if (tr.bridge[i]) continue;
    const side = rng() < 0.5 ? -1 : 1, len = 40 + rng() * 120;
    for (let d = tr.limit + 6; d < tr.limit + 6 + len; d += 1.2) { const [x, z] = trackPt(w, i, side * d); if (w.roadInfo(x, z).d < tr.limit + 5) break; stone(x, z); }
  }
  ch.build(w.group, w.disp);
}

/* ------------------------------------------------------------------ gatlampor */
export function buildLampPosts(w) {
  const tr = w.track, th = w.th, lay = tr.lampLayout(), L = th.lamps;
  const kind = tr.def.theme;
  const H = L.height, lc = L.color;
  const lim = tr.limit;
  const poleH = H + 0.3, armLen = lim + 0.6 - lay.D;
  const pole = new THREE.CylinderGeometry(kind === 'stad' ? 0.09 : 0.12, kind === 'stad' ? 0.16 : 0.18, poleH, 6); pole.translate(0, poleH / 2, 0);
  const arm = new THREE.BoxGeometry(0.12, 0.12, armLen + 0.3); arm.translate(0, H + 0.2, -armLen / 2);
  const poleGeo = PR.merge([PR.colorize(pole, kind === 'tivoli' ? 0x1a1a1a : 0x2a2e36), PR.colorize(arm, kind === 'tivoli' ? 0x1a1a1a : 0x2a2e36)]);
  let headGeo;
  if (kind === 'stad') { headGeo = new THREE.BoxGeometry(0.22, 0.1, 2.4); headGeo.translate(0, H - 0.02, -armLen + 0.4); }
  else if (kind === 'tivoli') { headGeo = new THREE.SphereGeometry(0.38, 10, 8); headGeo.translate(0, H - 0.25, -armLen); }
  else { headGeo = new THREE.BoxGeometry(0.5, 0.16, 1.0); headGeo.translate(0, H, -armLen); }
  const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.5 });
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(lc[0], lc[1], lc[2]).multiplyScalar(3.2) });
  w.disp.push(poleGeo, headGeo, poleMat, headMat);
  const list = lay.list.filter(l => !tr.tunnel[Math.floor(l.s / tr.ds) % tr.N]);
  const ip = new THREE.InstancedMesh(poleGeo, poleMat, list.length), ih = new THREE.InstancedMesh(headGeo, headMat, list.length);
  const f = tr.constructor.makeFrame();
  list.forEach((l, n) => {
    tr.frameAt(l.s, f);
    _p.copy(f.c).addScaledVector(f.R, l.side * (lim + 0.6)); _p.y -= 0.05;
    // armen (lokal -z) pekar in mot vägen
    _q.setFromAxisAngle(UP, Math.atan2(f.R.x * l.side, f.R.z * l.side));
    _m4.compose(_p, _q, _s.set(1, 1, 1)); ip.setMatrixAt(n, _m4); ih.setMatrixAt(n, _m4);
  });
  [ip, ih].forEach(m => { m.computeBoundingSphere(); w.group.add(m); w.disp.push(m); });
  ip.castShadow = w.q.shadows;
}

/* ------------------------------------------------------------------ teman */
export function buildThemeScenery(w, theme, dens, ctx) {
  const fn = BUILDERS[theme]; if (!fn) return false;
  fn(w, dens, ctx); return true;
}

const BUILDERS = {
  /* ---------------- Höga kusten ---------------- */
  kust(w, dens, { scatter, reg, veg, vegFlat }) {
    const lim = w.track.limit, W = w.waterY;
    scatter(reg(PR.treeSpruce(false)), veg, 1500 * dens, lim + 7, 700, 0.9, 1.6, { tint: 0.1, waterMargin: 5 });
    scatter(reg(PR.treePine(false)), veg, 500 * dens, lim + 7, 600, 0.8, 1.3, { tint: 0.1, waterMargin: 5 });
    scatter(reg(PR.treeBirch()), veg, 300 * dens, lim + 6, 300, 0.8, 1.2, { tint: 0.1, waterMargin: 5 });
    scatter(reg(PR.rockGeo(7)), vegFlat, 220 * dens, lim + 5, 600, 1, 3.5, { tint: 0.08, squash: true, waterMargin: -3, shadow: false });
    w._cottages(0xa0281e, 10);
    w._sailboats();
    w._lighthouse();
    void W;
  },

  /* ---------------- Göteborgs hamn ---------------- */
  hamn(w, dens) {
    const tr = w.track, rng = w.rng, sh = w.shore, lim = tr.limit, W = w.waterY;
    const roadY = tr.minY;
    // kajkant längs hela strandlinjen
    if (sh) {
      const len = Math.max(w.tg.nx, w.tg.nz) * w.tg.cell * 1.6;
      const bx = sh.mx + sh.nx * sh.off, bz = sh.mz + sh.nz * sh.off;
      const hgt = roadY - 0.3 - (W - 7);
      const g = new THREE.BoxGeometry(len, hgt, 1.6); g.translate(0, hgt / 2, 0);
      const m = new THREE.MeshStandardMaterial({ map: TX.concreteTex(), color: 0x8a8a88, roughness: 0.9 }); w.disp.push(m);
      single(w, g, m, bx - sh.nx * 0.8, W - 7, bz - sh.nz * 0.8, Math.atan2(sh.nx, sh.nz) + Math.PI / 2);
      // kranar som grenslar vägen längs kajen, fartyg utanför
      const qi = Math.round((sh.ia + sh.ib) / 2);
      const segLen = Math.hypot(tr.P[sh.ib * 3] - tr.P[sh.ia * 3], tr.P[sh.ib * 3 + 2] - tr.P[sh.ia * 3 + 2]);
      const gauge = 2 * (lim + 9) - 4;
      const cols = [0x1f5aa8, 0x1f5aa8, 0xd8a020, 0x1f5aa8, 0xc8302a];
      const nCr = Math.max(2, Math.min(6, Math.floor(segLen / 55)));
      for (let k = 0; k < nCr; k++) {
        const u = (k - (nCr - 1) / 2) * 52;
        const cx = tr.P[qi * 3] + sh.tx * u, cz = tr.P[qi * 3 + 2] + sh.tz * u;
        // kranens mitt på vägens mittlinje, bommen ut över vattnet
        const ry = Math.atan2(sh.nx, sh.nz);
        const g2 = PR.craneGeo(cols[k % cols.length], gauge);
        single(w, g2, vmat(w, { metalness: 0.3, roughness: 0.6 }), cx, roadY - 0.35, cz, ry);
      }
      const hulls = [0x2a3a5a, 0x5a1e1e, 0x1e3a2a];
      for (let k = 0; k < 2; k++) {
        const u = (k - 0.5) * 175;
        const sx = bx + sh.nx * 15 + sh.tx * u, sz = bz + sh.nz * 15 + sh.tz * u;
        single(w, PR.shipGeo(hulls[k % 3], 7 + k), vmat(w, { roughness: 0.6 }), sx, W, sz, Math.atan2(-sh.tz, sh.tx));
      }
    }
    // containerfält
    const geo = PR.containerGeo();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.corrugatedTex(), roughness: 0.7, metalness: 0.2 }); w.disp.push(mat);
    const ch = chunked(w, geo, mat, true, 160);
    const pal = [0xc8261e, 0x1f5aa8, 0xe8a020, 0x2a8a4a, 0xd8d8d0, 0x8a2a8a, 0xe86a1a, 0x3a6a8a, 0x6a3a1a, 0xf0f0e8];
    const ax = sh ? sh.tx : 1, az = sh ? sh.tz : 0, bx2 = -az, bz2 = ax;
    const cx0 = w.center[0], cz0 = w.center[1];
    const ry = Math.atan2(ax, az) - Math.PI / 2;
    const dmax = 200 * Math.min(1, 0.6 + dens * 0.4);
    let n = 0;
    for (let u = -420; u <= 420; u += 13.4) for (let v = -420; v <= 420; v += 2.7) {
      // gångar mellan block
      const bu = Math.floor((u + 420) / 13.4), bv = Math.floor((v + 420) / 2.7);
      if (bu % 4 === 3 || bv % 8 >= 6) continue;
      const x = cx0 + ax * u + bx2 * v, z = cz0 + az * u + bz2 * v;
      const ri = w.roadInfo(x, z); if (ri.d < lim + 7 || ri.d > dmax) continue;
      if (sh && w.shoreT(x, z) > -14) continue;
      const blockSeed = Math.sin(Math.floor(bu / 4) * 12.9898 + Math.floor(bv / 8) * 78.233) * 43758.5453;
      const bh = 1 + Math.floor((blockSeed - Math.floor(blockSeed)) * 4);
      const hgt = Math.max(1, Math.min(4, bh - (rng() < 0.3 ? 1 : 0)));
      const y0 = w.heightAt(x, z);
      for (let k = 0; k < hgt; k++) { addAt(ch, x, y0 + k * 2.6, z, ry, 1, new THREE.Color(pal[(rng() * pal.length) | 0])); n++; }
    }
    ch.build(w.group, w.disp);
    // höga belysningsmaster i containerfältet
    const mast = new THREE.CylinderGeometry(0.3, 0.45, 30, 6); mast.translate(0, 15, 0);
    const mastHead = new THREE.BoxGeometry(4, 1.2, 1.2); mastHead.translate(0, 30, 0);
    const mm = new THREE.MeshStandardMaterial({ color: 0x5a5e66 }), hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(3) });
    w.disp.push(mm, hm);
    const taken = [];
    for (let k = 0; k < 8; k++) { const sp = freeSpot(w, lim + 10, 160, 60, taken, (x, z) => !sh || w.shoreT(x, z) < -10); if (!sp) continue; const y = w.heightAt(sp[0], sp[1]); single(w, mast.clone(), mm, sp[0], y, sp[1]); single(w, mastHead.clone(), hm, sp[0], y, sp[1], rng() * 3); }
    mast.dispose(); mastHead.dispose();
  },

  /* ---------------- Gotland ---------------- */
  gotland(w, dens, { scatter, reg, veg }) {
    const tr = w.track, rng = w.rng, lim = tr.limit, sh = w.shore;
    scatter(reg(PR.treePine(false)), veg, 350 * dens, lim + 10, 600, 0.8, 1.3, { tint: 0.1, filter: (x, z) => w.shoreT(x, z) < -30 });
    scatter(reg(PR.juniper()), veg, 600 * dens, lim + 4, 400, 0.7, 1.3, { tint: 0.1, shadow: false, filter: (x, z) => w.shoreT(x, z) < -16 });
    scatter(reg(PR.roseBush()), veg, 500 * dens, lim + 2.5, 120, 0.7, 1.3, { shadow: false, filter: (x, z) => w.shoreT(x, z) < -16 });
    stoneWalls(w, dens, 0.6);
    // raukar i strandkanten
    if (sh) {
      const geos = [PR.raukGeo(3), PR.raukGeo(9), PR.raukGeo(14)];
      const m = vmat(w, { roughness: 0.95, flatShading: true });
      const chs = geos.map(g => chunked(w, g, m, true));
      for (let k = 0; k < 34; k++) {
        const u = (rng() - 0.5) * 900, t = -8 + rng() * 40;
        const x = sh.mx + sh.tx * u + sh.nx * (sh.off + t), z = sh.mz + sh.tz * u + sh.nz * (sh.off + t);
        if (w.roadInfo(x, z).d < lim + 14) continue;
        addAt(chs[k % 3], x, w.heightAt(x, z) - 0.8, z, rng() * 6, 0.7 + rng() * 0.8);
      }
      chs.forEach(c => c.build(w.group, w.disp));
    }
    // ringmuren runt de "town"-taggade delarna
    const town = tr.tags.filter(t => t.town);
    if (town.length) {
      let sx = 0, sz = 0, n = 0;
      const a = Math.round(Math.min(...town.map(t => t.from)) * tr.N), b = Math.round(Math.max(...town.map(t => t.to)) * tr.N);
      for (let i = a; i <= b; i++) { const j = i % tr.N; sx += tr.P[j * 3]; sz += tr.P[j * 3 + 2]; n++; }
      sx /= n; sz /= n;
      let rad = 0; for (let i = a; i <= b; i++) { const j = i % tr.N; rad = Math.max(rad, Math.hypot(tr.P[j * 3] - sx, tr.P[j * 3 + 2] - sz)); }
      rad += 22;
      w.ringWall = { x: sx, z: sz, r: rad };
      const wallMat = new THREE.MeshStandardMaterial({ map: TX.rockTex(), color: 0xe0d8c4, roughness: 0.95 }); w.disp.push(wallMat);
      const segG = new THREE.BoxGeometry(1, 1, 1); segG.translate(0, 0.5, 0); w.disp.push(segG);
      const segs = [], towers = [], gates = [];
      const nSeg = Math.round(2 * Math.PI * rad / 4);
      let prevOnRoad = false;
      for (let k = 0; k < nSeg; k++) {
        const ang = k / nSeg * Math.PI * 2, x = sx + Math.cos(ang) * rad, z = sz + Math.sin(ang) * rad;
        const ri = w.roadInfo(x, z);
        const onRoad = ri.d < lim + 5;
        if (onRoad) { if (!prevOnRoad) gates.push(ri.i); prevOnRoad = true; continue; }
        prevOnRoad = false;
        segs.push([x, z, ang]);
        if (k % 11 === 0) towers.push([x, z, ang]);
      }
      const im = new THREE.InstancedMesh(segG, wallMat, segs.length + towers.length);
      segs.forEach(([x, z, ang], k) => { _p.set(x, w.heightAt(x, z) - 0.5, z); _q.setFromAxisAngle(UP, -ang); _m4.compose(_p, _q, _s.set(2.2, 9.5, 4.3)); im.setMatrixAt(k, _m4); });
      towers.forEach(([x, z, ang], k) => { _p.set(x, w.heightAt(x, z) - 0.5, z); _q.setFromAxisAngle(UP, -ang); _m4.compose(_p, _q, _s.set(5.5, 17, 5.5)); im.setMatrixAt(segs.length + k, _m4); });
      im.castShadow = w.q.shadows; im.receiveShadow = true; im.computeBoundingSphere(); w.group.add(im); w.disp.push(im);
      // tak på tornen
      const roofG = new THREE.ConeGeometry(4.4, 5, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 2.5, 0);
      const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7 }); w.disp.push(roofG, roofM);
      const ir = new THREE.InstancedMesh(roofG, roofM, towers.length);
      towers.forEach(([x, z, ang], k) => { _p.set(x, w.heightAt(x, z) + 16.5, z); _q.setFromAxisAngle(UP, -ang); _m4.compose(_p, _q, _s.set(1, 1, 1)); ir.setMatrixAt(k, _m4); });
      ir.computeBoundingSphere(); w.group.add(ir); w.disp.push(ir);
      // portar där banan går genom muren
      const f = tr.constructor.makeFrame();
      for (const gi of gates) {
        tr.frameAt(gi * tr.ds, f);
        const ry = Math.atan2(f.T.x, f.T.z), parts = [];
        for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(5, 18, 7).translate(s * (lim + 3), 9, 0));
        parts.push(new THREE.BoxGeometry(2 * lim + 11, 8.5, 7).translate(0, 13.75, 0));
        for (let k = -3; k <= 3; k++) parts.push(new THREE.BoxGeometry(1.2, 1.4, 7.2).translate(k * (lim + 3) / 3, 18.7, 0));
        const g = PR.merge(parts.map(p => PR.colorize(p.toNonIndexed(), 0xffffff)));
        g.deleteAttribute('color');
        single(w, g, wallMat, f.c.x, f.c.y - 0.5, f.c.z, ry);
      }
      // medeltida stenhus och domkyrkan inom murarna
      const hm = vmat(w, { roughness: 0.9 });
      const hch = chunked(w, PR.stoneHouseGeo(0xffffff), hm, true);
      const hcols = [0xf2ece0, 0xe8d8b8, 0xf0d8c8, 0xe0e0d8, 0xd8c8a0];
      const taken = [];
      for (let k = 0; k < 60; k++) {
        const a2 = rng() * Math.PI * 2, r2 = Math.sqrt(rng()) * (rad - 9);
        const x = sx + Math.cos(a2) * r2, z = sz + Math.sin(a2) * r2;
        const ri = w.roadInfo(x, z); if (ri.d < lim + 7) continue;
        if (taken.some(p => Math.hypot(p[0] - x, p[1] - z) < 10)) continue; taken.push([x, z]);
        addAt(hch, x, w.heightAt(x, z) - 0.2, z, yawToRoad(w, x, z, ri), 0.9 + rng() * 0.3, new THREE.Color(hcols[k % hcols.length]));
      }
      hch.build(w.group, w.disp);
      const sp = freeSpot(w, lim + 14, 60, 12, taken.map(t => [t[0], t[1], 6]), (x, z) => Math.hypot(x - sx, z - sz) < rad - 12, 400);
      if (sp) {
        const parts = [PR.colorize(new THREE.BoxGeometry(8, 28, 8).translate(0, 14, 0), 0xe8e0d0), PR.colorize(new THREE.BoxGeometry(14, 14, 30).translate(0, 7, -18), 0xe8e0d0)];
        for (const [x, h] of [[0, 14], [-3.2, 7], [3.2, 7]]) parts.push(PR.colorize(new THREE.ConeGeometry(x ? 1.6 : 4.2, h, 8).translate(x, 28 + h / 2, x ? 3.2 : 0), 0x1e1e22));
        single(w, PR.merge(parts), vmat(w), sp[0], w.heightAt(sp[0], sp[1]) - 0.3, sp[1], yawToRoad(w, sp[0], sp[1], sp[2]));
      }
    }
  },

  /* ---------------- Lappland ---------------- */
  lappland(w, dens, { scatter, reg, veg, vegFlat }) {
    const tr = w.track, rng = w.rng, lim = tr.limit;
    scatter(reg(PR.fellBirch()), veg, 1100 * dens, lim + 6, 600, 0.9, 1.6, { tint: 0.06 });
    scatter(reg(PR.treeSpruce(true)), veg, 350 * dens, lim + 40, 800, 0.8, 1.4, { tint: 0.06 });
    scatter(reg(PR.rockGeo(11)), vegFlat, 120 * dens, lim + 8, 500, 0.8, 2.4, { squash: true, shadow: false });
    const taken = [];
    // kåtor i små läger, med eld
    const kch = chunked(w, PR.kataGeo(), vmat(w, { roughness: 0.95 }), true);
    const fireG = new THREE.ConeGeometry(0.5, 1.4, 6); fireG.translate(0, 0.7, 0);
    const fireM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(3) }); w.disp.push(fireG, fireM);
    const fires = [];
    for (let c = 0; c < 5; c++) {
      const sp = freeSpot(w, lim + 22, 110, 50, taken); if (!sp) continue;
      const [cx, cz] = sp;
      for (let k = 0; k < 3 + (rng() * 3 | 0); k++) { const a = k * 1.7 + rng(), r = 8 + rng() * 6; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (w.roadInfo(x, z).d < lim + 8) continue; addAt(kch, x, w.heightAt(x, z) - 0.1, z, rng() * 6); }
      const f = single(w, fireG.clone(), fireM, cx, w.heightAt(cx, cz), cz); fires.push(f);
    }
    kch.build(w.group, w.disp);
    fireG.dispose();
    w.animated.push((dt, t) => fires.forEach((f, k) => f.scale.set(1, 1 + Math.sin(t * 13 + k) * 0.15, 1)));
    // renhjordar
    const rch = chunked(w, PR.reindeerGeo(), vmat(w, { roughness: 0.95 }), true, 200);
    for (let hgrp = 0; hgrp < 9; hgrp++) {
      const sp = freeSpot(w, lim + 14, 160, 30, taken); if (!sp) continue;
      const n = 8 + (rng() * 14 | 0), dir = rng() * 6.28;
      for (let k = 0; k < n; k++) {
        const x = sp[0] + (rng() - 0.5) * 30, z = sp[1] + (rng() - 0.5) * 30;
        if (w.roadInfo(x, z).d < lim + 6) continue;
        const c = new THREE.Color(1, 1, 1).multiplyScalar(0.75 + rng() * 0.45);
        addAt(rch, x, w.heightAt(x, z) - 0.05, z, dir + (rng() - 0.5) * 1.6, 0.85 + rng() * 0.3, c);
      }
    }
    rch.build(w.group, w.disp);
  },

  /* ---------------- Dalarna ---------------- */
  dalarna(w, dens, { scatter, reg, veg, vegFlat }) {
    const tr = w.track, rng = w.rng, lim = tr.limit;
    scatter(reg(PR.treeSpruce(false)), veg, 1500 * dens, lim + 16, 800, 0.9, 1.7, { tint: 0.1, waterMargin: 2 });
    scatter(reg(PR.treeBirch()), veg, 450 * dens, lim + 6, 350, 0.8, 1.3, { tint: 0.12, waterMargin: 1.5 });
    scatter(reg(PR.rockGeo(13)), vegFlat, 100 * dens, lim + 5, 400, 0.6, 1.8, { squash: true, shadow: false });
    w._cottages(0xa3261c, 24);
    w._flowers(900 * dens);
    w._maypole();
    w._sailboats();
    // jättelik dalahäst på en kulle, sidan mot vägen vid en raksträcka
    let best = -1, bestK = Infinity;
    for (let i = 0; i < tr.N; i += 7) { if (tr.bridge[i]) continue; const k = Math.abs(tr.k[i]); if (k < bestK && rng() < 0.6) { bestK = k; best = i; } }
    if (best >= 0) {
      for (const side of [1, -1]) {
        const [x, z] = trackPt(w, best, side * (lim + 34));
        if (w.roadInfo(x, z).d < lim + 25 || (w.waterY != null && w.heightAt(x, z) < w.waterY + 1)) continue;
        const ry = Math.atan2(-tr.T[best * 3 + 2], tr.T[best * 3]);
        single(w, PR.dalahastGeo(), vmat(w, { roughness: 0.45 }), x, w.heightAt(x, z) + 0.3, z, ry, 1.15);
        break;
      }
    }
  },

  /* ---------------- Ölandsleden ---------------- */
  oland(w, dens, { scatter, reg, veg }) {
    const tr = w.track, rng = w.rng, lim = tr.limit;
    scatter(reg(PR.juniper()), veg, 1500 * dens, lim + 4, 500, 0.6, 1.4, { tint: 0.1, shadow: false });
    scatter(reg(PR.treePine(true)), veg, 120 * dens, lim + 30, 600, 0.7, 1.1, { tint: 0.1 });
    stoneWalls(w, dens, 1);
    w._lighthouse();
    // väderkvarnar i rader, vingarna snurrar i vinden
    const body = PR.windmillBodyGeo(), sails = PR.windmillSailsGeo(); w.disp.push(body, sails);
    const bm = vmat(w, { roughness: 0.9 });
    const rotors = [], taken = [];
    for (let r = 0; r < 4; r++) {
      const sp = freeSpot(w, lim + 22, 120, 90, taken, (x, z, ri) => !tr.bridge[ri.i]); if (!sp) continue;
      const ty = tangentYaw(tr, sp[2].i), n = 3 + (rng() * 2 | 0);
      for (let k = 0; k < n; k++) {
        const x = sp[0] + Math.sin(ty) * k * 14, z = sp[1] + Math.cos(ty) * k * 14;
        if (w.roadInfo(x, z).d < lim + 14) continue;
        const y = w.heightAt(x, z) - 0.1, face = ty + Math.PI / 2;
        const b = new THREE.Mesh(body, bm); b.position.set(x, y, z); b.rotation.y = face; b.castShadow = w.q.shadows; w.group.add(b);
        const s = new THREE.Mesh(sails, bm); s.position.set(x + Math.sin(face) * 1.7, y + 7.2, z + Math.cos(face) * 1.7); s.rotation.order = 'YXZ'; s.rotation.y = face; s.castShadow = w.q.shadows;
        s.userData.ph = rng() * 6; s.userData.sp = 0.8 + rng() * 0.4; w.group.add(s); rotors.push(s);
      }
    }
    w.animated.push((dt, t) => rotors.forEach(r => { r.rotation.z = -t * r.userData.sp + r.userData.ph; }));
    // gårdar
    const hch = chunked(w, PR.stoneHouseGeo(0xffffff), vmat(w), true);
    for (let k = 0; k < 12; k++) { const sp = freeSpot(w, lim + 18, 140, 40, taken); if (!sp) continue; addAt(hch, sp[0], w.heightAt(sp[0], sp[1]) - 0.2, sp[1], yawToRoad(w, sp[0], sp[1], sp[2]), 0.8, new THREE.Color(0.95, 0.93, 0.88)); }
    hch.build(w.group, w.disp);
    w._cottages(0xa0281e, 6);
    w._sailboats();
  },

  /* ---------------- Flygfältet ---------------- */
  flyg(w, dens, { scatter, reg, veg }) {
    const tr = w.track, rng = w.rng, lim = tr.limit;
    scatter(reg(PR.treePine(false)), veg, 250 * dens, 160, 700, 0.8, 1.3, { tint: 0.1 });
    // banljus: vita längs startbanan, blå längs taxibanorna, inflygningsljus före banan
    const runway = new Uint8Array(tr.N);
    for (const t of tr.tags) if (t.runway) for (let i = Math.round(t.from * tr.N); i <= Math.round(t.to * tr.N); i++) runway[i % tr.N] = 1;
    const lg = new THREE.BoxGeometry(0.35, 0.3, 0.35); lg.translate(0, 0.15, 0); w.disp.push(lg);
    const mk = (col) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3) }); w.disp.push(m); return m; };
    const white = [], blue = [];
    const step = Math.max(1, Math.round(22 / tr.ds));
    for (let i = 0; i < tr.N; i += step) for (const side of [-1, 1]) {
      const d = side * (tr.half + 1.4); const [x, z] = trackPt(w, i, d);
      (runway[i] ? white : blue).push([x, tr.P[i * 3 + 1], z]);
    }
    let r0 = -1; for (let i = 0; i < tr.N; i++) if (runway[i] && !runway[(i - 1 + tr.N) % tr.N]) { r0 = i; break; }
    if (r0 >= 0) {
      const tx = tr.T[r0 * 3], tz = tr.T[r0 * 3 + 2];
      for (let k = 1; k <= 12; k++) for (let c = -2; c <= 2; c++) {
        const x = tr.P[r0 * 3] - tx * k * 28 + tz * c * 2.5 * (k % 4 === 0 ? 3 : 1), z = tr.P[r0 * 3 + 2] - tz * k * 28 - tx * c * 2.5 * (k % 4 === 0 ? 3 : 1);
        if (w.roadInfo(x, z).d < lim + 2) continue;
        white.push([x, w.heightAt(x, z) + 0.2, z]);
      }
    }
    for (const [list, m] of [[white, mk(0xfff0d0)], [blue, mk(0x3a6aff)]]) {
      const im = new THREE.InstancedMesh(lg, m, list.length);
      list.forEach(([x, y, z], n) => { _m4.makeTranslation(x, y, z); im.setMatrixAt(n, _m4); });
      im.computeBoundingSphere(); w.group.add(im); w.disp.push(im);
    }
    const taken = [];
    const bm = vmat(w, { roughness: 0.6, metalness: 0.3 });
    // terminal
    const sp = freeSpot(w, lim + 45, 110, 60, taken, (x, z) => [[-55, 0], [55, 0], [0, -12], [0, 12]].every(([a, b]) => w.roadInfo(x + a, z + b).d > lim + 12));
    if (sp) {
      const fac = TX.facadeTex(true);
      const tm = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissive, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 });
      fac.map.repeat.set(6, 1); w.disp.push(tm);
      const g = new THREE.BoxGeometry(110, 14, 22); g.translate(0, 7, 0);
      const ry = yawToRoad(w, sp[0], sp[1], sp[2]);
      single(w, g, tm, sp[0], w.heightAt(sp[0], sp[1]) - 0.2, sp[1], ry + Math.PI / 2);
      const tx = sp[0] + Math.sin(ry) * -30 + Math.cos(ry) * 65, tz = sp[1] + Math.cos(ry) * -30 - Math.sin(ry) * 65;
      if (w.roadInfo(tx, tz).d > lim + 10) single(w, PR.towerGeo(), bm, tx, w.heightAt(tx, tz) - 0.2, tz);
    }
    for (let k = 0; k < 3; k++) { const s2 = freeSpot(w, lim + 40, 160, 50, taken, (x, z) => [[-25, 0], [25, 0], [0, -28], [0, 28]].every(([a, b]) => w.roadInfo(x + a, z + b).d > lim + 6)); if (s2) single(w, PR.hangarGeo(), bm, s2[0], w.heightAt(s2[0], s2[1]) - 0.2, s2[1], yawToRoad(w, s2[0], s2[1], s2[2])); }
    const tails = [0x1f4fbf, 0xc8261e, 0x2a8a4a, 0xe8a020, 0x1a1a2a];
    for (let k = 0; k < 5; k++) { const s2 = freeSpot(w, lim + 24, 140, 30, taken, (x, z) => [[-20, 0], [20, 0], [0, -20], [0, 20]].every(([a, b]) => w.roadInfo(x + a, z + b).d > lim + 4)); if (s2) single(w, PR.planeGeo(tails[k]), bm, s2[0], w.heightAt(s2[0], s2[1]), s2[1], yawToRoad(w, s2[0], s2[1], s2[2]) - Math.PI / 2 + (rng() - 0.5) * 0.6); }
  },

  /* ---------------- Gruvstaden ---------------- */
  gruva(w, dens, { scatter, reg, veg, vegFlat }) {
    const tr = w.track, rng = w.rng, lim = tr.limit, pit = w.pit;
    const outside = (x, z) => Math.hypot(x - pit.x, z - pit.z) > pit.rim + 12;
    const inside = (x, z) => Math.hypot(x - pit.x, z - pit.z) < pit.rim - 10;
    scatter(reg(PR.treePine(false)), veg, 600 * dens, lim + 10, 700, 0.8, 1.3, { tint: 0.1, filter: outside });
    scatter(reg(PR.treeSpruce(false)), veg, 300 * dens, lim + 14, 700, 0.8, 1.3, { tint: 0.1, filter: outside });
    scatter(reg(PR.rockGeo(19)), vegFlat, 260 * dens, lim + 5, 500, 0.8, 3.0, { squash: true, shadow: false, filter: inside });
    const taken = [];
    const hch = chunked(w, PR.cottageGeo(0xffffff), vmat(w), true);
    for (let k = 0; k < 20; k++) { const sp = freeSpot(w, lim + 14, 90, 13, taken, outside); if (!sp) continue; addAt(hch, sp[0], w.heightAt(sp[0], sp[1]) - 0.2, sp[1], yawToRoad(w, sp[0], sp[1], sp[2]), 1, new THREE.Color(k % 5 ? 0x9a2a20 : 0xd8c070).multiplyScalar(1.6)); }
    hch.build(w.group, w.disp);
    const hm = vmat(w, { roughness: 0.7, metalness: 0.3 });
    for (let k = 0; k < 2; k++) { const sp = freeSpot(w, lim + 22, 140, 40, taken, outside); if (sp) single(w, PR.headframeGeo(), hm, sp[0], w.heightAt(sp[0], sp[1]) - 0.3, sp[1], yawToRoad(w, sp[0], sp[1], sp[2])); }
    const tch = chunked(w, PR.truckGeo(), vmat(w, { roughness: 0.6 }), true);
    for (let k = 0; k < 10; k++) { const sp = freeSpot(w, lim + 9, 80, 14, taken, k < 7 ? inside : outside); if (!sp) continue; addAt(tch, sp[0], w.heightAt(sp[0], sp[1]) - 0.1, sp[1], rng() * 6); }
    tch.build(w.group, w.disp);
  },

  /* ---------------- Nöjesparken ---------------- */
  tivoli(w, dens, { scatter, reg, veg }) {
    const tr = w.track, rng = w.rng, lim = tr.limit;
    scatter(reg(PR.treeBirch()), veg, 160 * dens, lim + 8, 300, 0.8, 1.2, { tint: 0.1 });
    const taken = [];
    const m = vmat(w, { roughness: 0.55, emissive: 0x222222 });
    // pariserhjul (roterar), hjulaxeln pekar mot vägen
    const sp = freeSpot(w, lim + 24, 80, 30, taken);
    if (sp) {
      const ry = yawToRoad(w, sp[0], sp[1], sp[2]), y = w.heightAt(sp[0], sp[1]);
      const grp = new THREE.Group(); grp.position.set(sp[0], y, sp[1]); grp.rotation.y = ry + Math.PI / 2;
      const stand = new THREE.Mesh(PR.ferrisStandGeo(), m); grp.add(stand);
      const wheel = new THREE.Mesh(PR.ferrisWheelGeo(), m); wheel.position.y = 20; grp.add(wheel);
      const bulbG = new THREE.SphereGeometry(0.35, 6, 4), bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.4).multiplyScalar(3) });
      const bulbs = new THREE.InstancedMesh(bulbG, bulbM, 48);
      for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; _m4.makeTranslation(0, Math.sin(a) * 18.4, Math.cos(a) * 18.4); bulbs.setMatrixAt(k, _m4); }
      wheel.add(bulbs);
      const gG = PR.gondolaGeo(), gond = [];
      for (let k = 0; k < 16; k++) { const g = new THREE.Mesh(gG, m); grp.add(g); gond.push(g); }
      w.group.add(grp); w.disp.push(stand.geometry, wheel.geometry, bulbG, bulbM, gG, bulbs);
      w.animated.push((dt, t) => {
        const a0 = t * 0.12; wheel.rotation.x = a0;
        gond.forEach((g, k) => { const a = a0 + k / 16 * Math.PI * 2; g.position.set(0, 20 + Math.cos(a) * 18, -Math.sin(a) * 18); });
      });
    }
    // karuseller
    const base = PR.carouselBaseGeo(), top = PR.carouselTopGeo(); w.disp.push(base, top);
    const tops = [];
    for (let k = 0; k < 2; k++) { const s2 = freeSpot(w, lim + 14, 70, 18, taken); if (!s2) continue; const y = w.heightAt(s2[0], s2[1]); const b = new THREE.Mesh(base, m); b.position.set(s2[0], y, s2[1]); w.group.add(b); const tp = new THREE.Mesh(top, m); tp.position.set(s2[0], y, s2[1]); w.group.add(tp); tops.push(tp); }
    w.animated.push((dt, t) => tops.forEach((tp, k) => { tp.rotation.y = t * (0.6 + k * 0.2); }));
    // tält
    const cols = [[0xd02a2a, 0xf2efe6], [0x2a5ad0, 0xffd21f], [0x2a9a4a, 0xf2efe6]];
    for (let k = 0; k < 5; k++) { const s2 = freeSpot(w, lim + 13, 90, 16, taken); if (s2) single(w, PR.tentGeo(...cols[k % 3]), m, s2[0], w.heightAt(s2[0], s2[1]), s2[1], rng() * 6, 0.7 + rng() * 0.4); }
    // berg-och-dalbana: sluten slinga med vågor, stöttor och ett tåg som åker runt
    const cs = freeSpot(w, lim + 52, 170, 50, taken, (x, z) => { for (let a = 0; a < 6.28; a += 0.3) if (w.roadInfo(x + Math.cos(a) * 46, z + Math.sin(a) * 30).d < lim + 8) return false; return true; }, 900);
    if (cs) {
      const y0 = w.heightAt(cs[0], cs[1]), pts = [];
      for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2; pts.push(new THREE.Vector3(cs[0] + Math.cos(a) * 42, y0 + 9 + 9 * Math.sin(a * 2 + 0.6) + 5 * Math.sin(a * 5), cs[1] + Math.sin(a) * 26)); }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const rm = new THREE.MeshStandardMaterial({ color: 0xd83a3a, metalness: 0.4, roughness: 0.4 }), sm = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.4, roughness: 0.5 }); w.disp.push(rm, sm);
      const tg = new THREE.TubeGeometry(curve, 256, 0.5, 6, true);
      single(w, tg, rm, 0, 0, 0);
      const sg = new THREE.BoxGeometry(0.35, 1, 0.35); sg.translate(0, 0.5, 0); w.disp.push(sg);
      const sim = new THREE.InstancedMesh(sg, sm, 64);
      for (let k = 0; k < 64; k++) { const p = curve.getPointAt(k / 64); _m4.compose(_p.set(p.x, y0, p.z), _q.identity(), _s.set(1, p.y - y0, 1)); sim.setMatrixAt(k, _m4); }
      sim.computeBoundingSphere(); w.group.add(sim); w.disp.push(sim);
      const cg = new THREE.BoxGeometry(2.2, 1.2, 1.6); w.disp.push(cg);
      const cars = []; for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(cg, m); w.group.add(c); cars.push(c); }
      const tmp = new THREE.Vector3();
      w.animated.push((dt, t) => cars.forEach((c, k) => { const u = ((t * 0.045 - k * 0.012) % 1 + 1) % 1; curve.getPointAt(u, c.position); c.position.y += 1.1; curve.getTangentAt(u, tmp); c.rotation.y = Math.atan2(tmp.z, -tmp.x) ; }));
    }
    // ljusslingor längs vägen
    const bulbG = new THREE.SphereGeometry(0.16, 6, 4), poleG = new THREE.CylinderGeometry(0.06, 0.08, 5.5, 5); poleG.translate(0, 2.75, 0);
    const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }), poleM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    w.disp.push(bulbG, poleG, bulbM, poleM);
    const bulbs = [], poles = [];
    const step = Math.max(2, Math.round(16 / tr.ds));
    const pal = [0xff4a4a, 0xffd23a, 0x4aff7a, 0x4ab0ff, 0xff6ad8];
    for (const side of [-1, 1]) for (let i = 0; i < tr.N; i += step) {
      const j = (i + step) % tr.N; if (tr.tunnel[i] || tr.tunnel[j] || tr.bridge[i]) continue;
      const d = side * (lim + 2.4);
      const a = trackPt(w, i, d), b = trackPt(w, j, d);
      const ya = w.heightAt(a[0], a[1]), yb = w.heightAt(b[0], b[1]);
      poles.push([a[0], ya, a[1]]);
      for (let k = 1; k < 8; k++) { const u = k / 8; bulbs.push([a[0] + (b[0] - a[0]) * u, ya + (yb - ya) * u + 5.3 - Math.sin(u * Math.PI) * 1.1, a[1] + (b[1] - a[1]) * u]); }
    }
    const ib = new THREE.InstancedMesh(bulbG, bulbM, bulbs.length), ip = new THREE.InstancedMesh(poleG, poleM, poles.length);
    bulbs.forEach(([x, y, z], n) => { _m4.makeTranslation(x, y, z); ib.setMatrixAt(n, _m4); ib.setColorAt(n, new THREE.Color(pal[n % pal.length])); });
    poles.forEach(([x, y, z], n) => { _m4.makeTranslation(x, y, z); ip.setMatrixAt(n, _m4); });
    [ib, ip].forEach(o => { o.computeBoundingSphere(); w.group.add(o); w.disp.push(o); });
  },

  /* ---------------- Skogsrallyt ---------------- */
  skog(w, dens, { scatter, reg, veg, vegFlat }) {
    const lim = w.track.limit;
    const tall = reg(PR.treeSpruceTall());
    scatter(tall, veg, 2600 * dens, lim + 3.6, lim + 40, 0.8, 1.4, { tint: 0.1 });
    scatter(tall, veg, 2600 * dens, lim + 30, 420, 0.9, 1.5, { tint: 0.1, shadow: false });
    scatter(reg(PR.treePine(false)), veg, 700 * dens, lim + 5, 350, 0.9, 1.4, { tint: 0.1 });
    scatter(reg(PR.treeBirch()), veg, 200 * dens, lim + 5, 200, 0.8, 1.1, { tint: 0.1 });
    scatter(reg(PR.rockGeo(23)), vegFlat, 260 * dens, lim + 4, 300, 0.6, 2.4, { squash: true, shadow: false });
  },

  /* ---------------- Neostad ---------------- */
  stad(w, dens) { buildNeoCity(w, dens); }
};

/* ------------------------------------------------------------------ Neostad */
const NEON = [0x2ae8ff, 0xff3aa8, 0x9a5bff, 0x40ffb0, 0xffb040, 0xffffff];

function screenMaterial(w) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSeed; varying vec2 vUv; varying float vS;
      void main(){ vUv = uv; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vS;
      vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }
      void main(){
        vec2 u = vUv; float t = uTime * (0.6 + fract(vS * 7.3)); float k = floor(fract(vS * 3.7) * 5.0);
        vec3 c;
        if (k < 1.0) c = pal(u.x * 0.6 + t * 0.15 + vS) * (0.6 + 0.4 * sin(u.y * 40.0 - t * 6.0));
        else if (k < 2.0) { float r = length(u - 0.5); c = pal(vS + r - t * 0.2) * smoothstep(0.05, 0.0, abs(fract(r * 6.0 - t) - 0.5) - 0.2); }
        else if (k < 3.0) { float b = floor(u.x * 12.0); float h = 0.5 + 0.45 * sin(t * 3.0 + b * 1.7 + vS * 9.0); c = pal(vS + b * 0.05) * step(u.y, h) * step(0.15, fract(u.x * 12.0)); }
        else if (k < 4.0) c = mix(pal(vS), pal(vS + 0.5), step(0.5, fract((u.x + u.y) * 4.0 + t * 0.5))) * 0.9;
        else c = pal(vS + 0.3) * smoothstep(0.08, 0.0, abs(u.y - 0.5 - 0.3 * sin(u.x * 9.0 + t * 2.0)));
        float frame = step(0.03, u.x) * step(u.x, 0.97) * step(0.05, u.y) * step(u.y, 0.95);
        gl_FragColor = vec4(c * frame * 1.7 + vec3(0.02), 1.0);
      }`
  });
  w.disp.push(m);
  return m;
}
function holoMaterial(w, tex, col) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, map: { value: tex }, col: { value: new THREE.Color(col) } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D map; uniform vec3 col; varying vec2 vUv; varying vec3 vW;
      void main(){
        float a = texture2D(map, vUv + vec2(sin(uTime * 7.0 + vUv.y * 40.0) * 0.002, 0.0)).r;
        float scan = 0.65 + 0.35 * sin(vW.y * 9.0 - uTime * 4.0);
        float flick = 0.85 + 0.15 * sin(uTime * 23.0) * sin(uTime * 7.1);
        gl_FragColor = vec4(col * 1.8, (a * 0.9 + 0.06) * scan * flick);
      }`
  });
  w.disp.push(m);
  return m;
}
/** Rörliga ljus (svävande trafik/drönare) – rörelsen räknas helt i vertexshadern. */
function movers(w, lanes) {
  const n = lanes.length; if (!n) return;
  const geo = new THREE.InstancedBufferGeometry().copy(PR.flyerGeo());
  const A = new Float32Array(n * 3), D = new Float32Array(n * 3), S = new Float32Array(n * 2), Cc = new Float32Array(n * 3);
  lanes.forEach((l, k) => { A.set(l.a, k * 3); D.set(l.d, k * 3); S[k * 2] = l.ph; S[k * 2 + 1] = l.sp; Cc.set(l.c, k * 3); });
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 3)); geo.setAttribute('aD', new THREE.InstancedBufferAttribute(D, 3));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 2)); geo.setAttribute('aC', new THREE.InstancedBufferAttribute(Cc, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; attribute vec3 aA, aD, aC; attribute vec2 aS; attribute vec3 color; varying vec3 vC;
      void main(){
        float u = fract(aS.x + uTime * aS.y);
        vec3 fx = normalize(aD), fz = normalize(cross(fx, vec3(0.0, 1.0, 0.0))), fy = cross(fz, fx);
        vec3 p = aA + aD * u + fx * position.x + fy * position.y + fz * position.z;
        vC = aC * (0.4 + 0.6 * step(1.0, position.x)) * smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.95, u);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC * 2.4 + 0.02, 1.0); }`
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  w.group.add(mesh); w.disp.push(geo, mat);
  w.animated.push((dt, t) => { mat.uniforms.uTime.value = t; });
}

function buildNeoCity(w, dens) {
  const tr = w.track, rng = w.rng, lim = tr.limit, t = w.tg;
  const fac = TX.neoFacadeTex();
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissive, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
      vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vec2 fuv = abs(normal.x) > 0.5 ? vec2(position.z * isc.z, position.y * isc.y) : vec2(position.x * isc.x, position.y * isc.y);
      if (abs(normal.y) > 0.5) fuv = vec2(0.02, 0.02);
      vMapUv = fuv / vec2(16.0, 32.0);
      vEmissiveMapUv = vMapUv;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor.rgb * 1.5;\n#endif');
  };
  w.disp.push(geo, mat);
  const ch = new Chunked(geo, mat, 260, { shadow: w.q.shadows });
  const stripG = new THREE.BoxGeometry(1, 1, 1); stripG.translate(0, 0.5, 0);
  const stripM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) }); w.disp.push(stripG, stripM);
  const strips = new Chunked(stripG, stripM, 260, { shadow: false, receive: false });
  const placed = [], fronts = [];
  const neonCol = () => new THREE.Color(NEON[(rng() * NEON.length) | 0]);
  const tryPlace = (x, z, wd, dp, h, yaw, front) => {
    const r = Math.max(wd, dp) * 0.55;
    if (w.roadInfo(x, z).d < lim + 3 + r) return false;
    for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = x + (Math.cos(yaw) * ax * wd + Math.sin(yaw) * az * dp) / 2, cz = z + (-Math.sin(yaw) * ax * wd + Math.cos(yaw) * az * dp) / 2;
      if (w.roadInfo(cx, cz).d < lim + 3) return false;
    }
    if (placed.some(p => Math.hypot(p[0] - x, p[1] - z) < (p[2] + r) * 0.9)) return false;
    placed.push([x, z, r]);
    const y = w.heightAt(x, z) - 0.3;
    _q.setFromAxisAngle(UP, yaw); _m4.compose(_p.set(x, y, z), _q, _s.set(wd, h, dp));
    const c = neonCol().lerp(new THREE.Color(1, 1, 1), 0.35);
    ch.add(_m4, c);
    // neonlister i hörnen och vid takkanten
    const nc = neonCol();
    for (const ax of [-1, 1]) {
      const cx = x + Math.cos(yaw) * ax * wd / 2 + (front ? front.nx * dp / 2 : 0), cz = z - Math.sin(yaw) * ax * wd / 2 + (front ? front.nz * dp / 2 : 0);
      _m4.compose(_p.set(cx, y, cz), _q, _s.set(0.35, h, 0.35)); strips.add(_m4, nc);
    }
    _m4.compose(_p.set(x + (front ? front.nx * dp / 2 : 0), y + h - 0.6, z + (front ? front.nz * dp / 2 : 0)), _q, _s.set(wd, 0.4, 0.4)); strips.add(_m4, nc);
    if (front) fronts.push({ x: x + front.nx * (dp / 2 + 0.25), z: z + front.nz * (dp / 2 + 0.25), y, wd, h, yaw: Math.atan2(front.nx, front.nz) });
    return true;
  };
  // byggnader längs banan
  const step = Math.max(3, Math.round(12 / tr.ds));
  for (let i = 0; i < tr.N; i += step) {
    if (tr.bridge[i]) continue;
    for (const side of [-1, 1]) {
      if (rng() < 0.12) continue;
      const wd = 14 + rng() * 16, dp = 14 + rng() * 14, h = 18 + rng() * rng() * 80;
      const d = side * (lim + 5 + dp / 2 + rng() * 5);
      const [x, z] = trackPt(w, i, d);
      const rx = tr.R[i * 3], rz = tr.R[i * 3 + 2], rl = Math.hypot(rx, rz);
      tryPlace(x, z, wd, dp, h, tangentYaw(tr, i), { nx: -side * rx / rl, nz: -side * rz / rl });
    }
  }
  // skyskrapor längre bort
  for (let k = 0; k < 900 * dens; k++) {
    const x = t.x0 + rng() * (t.nx - 1) * t.cell, z = t.z0 + rng() * (t.nz - 1) * t.cell;
    const ri = w.roadInfo(x, z); if (ri.d > 520) continue;
    const far = ri.d > 90;
    tryPlace(x, z, 18 + rng() * 24, 18 + rng() * 24, (far ? 50 : 20) + rng() * rng() * (far ? 170 : 70), Math.round(rng() * 4) * Math.PI / 2 + 0.3, null);
  }
  ch.build(w.group, w.disp); strips.build(w.group, w.disp);
  // animerade skärmar och neonskyltar på fasaderna mot vägen
  const scrG = new THREE.PlaneGeometry(1, 1); w.disp.push(scrG);
  const scrM = screenMaterial(w);
  const scr = fronts.filter(() => rng() < 0.45);
  const seeds = new Float32Array(scr.length);
  const im = new THREE.InstancedMesh(scrG, scrM, scr.length);
  scr.forEach((f, n) => {
    const sw = Math.min(f.wd * 0.8, 8 + rng() * 8), shh = sw * (0.45 + rng() * 0.25);
    const y = f.y + Math.min(f.h - shh / 2 - 1, 9 + rng() * 18);
    _q.setFromAxisAngle(UP, f.yaw); _m4.compose(_p.set(f.x, y, f.z), _q, _s.set(sw, shh, 1)); im.setMatrixAt(n, _m4); seeds[n] = rng();
  });
  scrG.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  im.computeBoundingSphere(); w.group.add(im); w.disp.push(im);
  const words = [['NEOSTAD', '#39d5ff'], ['HYPERLOOP', '#ff4fb0'], ['KAFÉ NORD', '#ffcc33'], ['SPELHALLEN', '#4ade80'], ['DRÖNARTAXI', '#b083ff'], ['NATTÖPPET', '#39d5ff'], ['ROBOTVERKSTAN', '#ff6a3a'], ['SUSHI 24/7', '#ff5a8a']];
  const nG = new THREE.PlaneGeometry(6, 2.25); w.disp.push(nG);
  const nMats = words.map(([wd, c]) => { const m = new THREE.MeshBasicMaterial({ map: TX.neonTex(wd, c) }); m.color.setScalar(2.4); w.disp.push(m); return m; });
  fronts.filter(f => !scr.includes(f) && rng() < 0.5).forEach(f => {
    const m = new THREE.Mesh(nG, nMats[(rng() * nMats.length) | 0]);
    m.position.set(f.x, f.y + 7 + rng() * 6, f.z); m.rotation.y = f.yaw; w.group.add(m);
  });
  w.animated.push((dt, tt) => { scrM.uniforms.uTime.value = tt; });
  // svävande hologram, långt från vägen
  const holo = [['NEOSTAD', '2089'], ['FJÄLLRACET', 'NEONCUPEN'], ['ÄLGKORV', 'nu i 3D'], ['NORRLJUS', 'fusionsenergi'], ['KANELBULLEN', 'tryckt på plats']];
  const hG = new THREE.PlaneGeometry(26, 9.75); w.disp.push(hG);
  const holos = [];
  for (let k = 0; k < 7; k++) {
    const sp = freeSpot(w, lim + 18, 120, 60, holos.map(h => [h.position.x, h.position.z, 40]));
    if (!sp) continue;
    const [tx2, sub] = holo[k % holo.length];
    const m = new THREE.Mesh(hG, holoMaterial(w, TX.holoTex(tx2, sub), NEON[k % 5]));
    m.position.set(sp[0], w.heightAt(sp[0], sp[1]) + 24 + rng() * 14, sp[1]);
    m.rotation.y = yawToRoad(w, sp[0], sp[1], sp[2]); m.userData = { y: m.position.y, ph: rng() * 6, ry: m.rotation.y };
    m.renderOrder = 4; w.group.add(m); holos.push(m);
  }
  w.animated.push((dt, tt) => holos.forEach(h => { h.position.y = h.userData.y + Math.sin(tt * 0.7 + h.userData.ph) * 0.8; h.rotation.y = h.userData.ry + Math.sin(tt * 0.25 + h.userData.ph) * 0.35; h.material.uniforms.uTime.value = tt; }));
  // upphöjda motorvägar med ljuslister i bakgrunden + svävande trafik
  const deckG = new THREE.BoxGeometry(1, 1, 1); w.disp.push(deckG);
  const deckM = new THREE.MeshStandardMaterial({ color: 0x2a2c36, roughness: 0.6, metalness: 0.4 }); w.disp.push(deckM);
  const decks = new Chunked(deckG, deckM, 300, { shadow: false });
  const lanes = [];
  const cx = w.center[0], cz = w.center[1];
  const span = Math.max(tr.bbox.x1 - tr.bbox.x0, tr.bbox.z1 - tr.bbox.z0) * 0.5 + 320;
  for (let hw = 0; hw < 3; hw++) {
    const ang = rng() * Math.PI, ox = (rng() - 0.5) * span * 0.8, oz = (rng() - 0.5) * span * 0.8;
    const dx = Math.cos(ang), dz = Math.sin(ang), y = tr.minY + 24 + hw * 6;
    const segL = 12;
    for (let u = -span; u < span; u += segL) {
      const x = cx + ox + dx * u, z = cz + oz + dz * u;
      if (w.roadInfo(x, z).d < lim + 28) continue;
      const yaw = Math.atan2(dx, dz);
      _q.setFromAxisAngle(UP, yaw);
      _m4.compose(_p.set(x, y, z), _q, _s.set(14, 1.2, segL + 0.2)); decks.add(_m4);
      if (Math.round(u / segL) % 4 === 0) { const gy = w.heightAt(x, z); _m4.compose(_p.set(x, (gy + y) / 2, z), _q, _s.set(3, y - gy, 3)); decks.add(_m4); }
    }
    for (let k = 0; k < 26; k++) {
      const dir = k % 2 ? 1 : -1, lat = dir * 3.2;
      lanes.push({ a: [cx + ox - dx * span * dir + dz * lat, y + 1.2, cz + oz - dz * span * dir - dx * lat], d: [dx * 2 * span * dir, 0, dz * 2 * span * dir], ph: rng(), sp: 0.012 + rng() * 0.01, c: k % 2 ? [1, 0.25, 0.2] : [0.9, 0.95, 1] });
    }
  }
  decks.build(w.group, w.disp);
  for (let k = 0; k < 60; k++) {
    const ang = rng() * Math.PI * 2, y = tr.minY + 45 + rng() * 60;
    const c = new THREE.Color(NEON[(rng() * 5) | 0]);
    lanes.push({ a: [cx - Math.cos(ang) * span, y, cz - Math.sin(ang) * span], d: [Math.cos(ang) * 2 * span, (rng() - 0.5) * 20, Math.sin(ang) * 2 * span], ph: rng(), sp: 0.008 + rng() * 0.012, c: [c.r, c.g, c.b] });
  }
  movers(w, lanes);
}
