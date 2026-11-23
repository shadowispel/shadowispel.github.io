/**
 * Rymdjakt – projektiler: laserskott (instansierade), missiler/torpeder och motåtgärder (flares).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, glowSpriteMat } from './gfx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** Segment (p0 + d·t, t∈[0,1]) mot sfär. Returnerar t eller −1. */
export function segSphere(p0x, p0y, p0z, dx, dy, dz, L2, cx, cy, cz, r) {
  const ox = cx - p0x, oy = cy - p0y, oz = cz - p0z;
  let t = L2 > 0 ? (ox * dx + oy * dy + oz * dz) / L2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const ex = p0x + dx * t - cx, ey = p0y + dy * t - cy, ez = p0z + dz * t - cz;
  return ex * ex + ey * ey + ez * ez < r * r ? t : -1;
}

/* ================================================================ Laserskott */
export class Bolts {
  constructor(scene, max = 900) {
    this.max = max; this.n = 0;
    const inner = new THREE.CylinderGeometry(0.16, 0.16, 1, 6, 1); inner.rotateX(Math.PI / 2);
    const outer = new THREE.CylinderGeometry(0.34, 0.34, 1.06, 8, 1); outer.rotateX(Math.PI / 2);
    const ci = new Float32Array(inner.attributes.position.count * 3).fill(1);
    const co = new Float32Array(outer.attributes.position.count * 3).fill(0.28);
    inner.setAttribute('color', new THREE.BufferAttribute(ci, 3)); outer.setAttribute('color', new THREE.BufferAttribute(co, 3));
    this.geo = mergeGeometries([inner.toNonIndexed(), outer.toNonIndexed()]);
    inner.dispose(); outer.dispose();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.scene = scene;
    const F = n => new Float32Array(max * n);
    this.p = F(3); this.v = F(3); this.c = F(3);
    this.life = F(1); this.maxLife = F(1); this.dmg = F(1); this.sm = F(1); this.hm = F(1); this.len = F(1); this.size = F(1);
    this.team = new Int8Array(max); this.owner = new Array(max).fill(null);
  }
  fire(pos, dir, speed, baseVel, w, team, owner, dmgMult = 1) {
    let i = this.n; if (i >= this.max) return; this.n++;
    const i3 = i * 3;
    this.p[i3] = pos.x; this.p[i3 + 1] = pos.y; this.p[i3 + 2] = pos.z;
    this.v[i3] = dir.x * speed + baseVel.x; this.v[i3 + 1] = dir.y * speed + baseVel.y; this.v[i3 + 2] = dir.z * speed + baseVel.z;
    this.c[i3] = w.color[0]; this.c[i3 + 1] = w.color[1]; this.c[i3 + 2] = w.color[2];
    this.life[i] = 0; this.maxLife[i] = w.life; this.dmg[i] = w.dmg * dmgMult; this.sm[i] = w.shieldMult || 1; this.hm[i] = w.hullMult || 1;
    this.len[i] = 9 * (w.size || 1); this.size[i] = w.size || 1; this.team[i] = team; this.owner[i] = owner;
  }
  _kill(i) {
    this.n--;
    if (i !== this.n) {
      const j = this.n, i3 = i * 3, j3 = j * 3;
      for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; this.c[i3 + k] = this.c[j3 + k]; }
      this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.dmg[i] = this.dmg[j]; this.sm[i] = this.sm[j]; this.hm[i] = this.hm[j];
      this.len[i] = this.len[j]; this.size[i] = this.size[j]; this.team[i] = this.team[j]; this.owner[i] = this.owner[j];
    }
    this.owner[this.n] = null;
  }
  update(dt, world) {
    const ships = world.ships, ast = world.asteroids;
    let i = 0;
    while (i < this.n) {
      const i3 = i * 3;
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this._kill(i); continue; }
      const x0 = this.p[i3], y0 = this.p[i3 + 1], z0 = this.p[i3 + 2];
      const dx = this.v[i3] * dt, dy = this.v[i3 + 1] * dt, dz = this.v[i3 + 2] * dt;
      const L2 = dx * dx + dy * dy + dz * dz, half = Math.sqrt(L2) * 0.5;
      const mx = x0 + dx * 0.5, my = y0 + dy * 0.5, mz = z0 + dz * 0.5;
      const team = this.team[i];
      let hitT = 2, hitShip = null, hitSub = null;
      for (let s = 0; s < ships.length; s++) {
        const sh = ships[s];
        if (sh.dead || sh.team === team || sh.noCollide) continue;
        const ex = sh.pos.x - mx, ey = sh.pos.y - my, ez = sh.pos.z - mz, rr = sh.boundR + half;
        if (ex * ex + ey * ey + ez * ez > rr * rr) continue;
        if (sh.isLarge) {
          // delsystem först
          for (const sub of sh.subs) {
            if (!sub.alive) continue;
            const t = segSphere(x0, y0, z0, dx, dy, dz, L2, sub.w.x, sub.w.y, sub.w.z, sub.r);
            if (t >= 0 && t < hitT) { hitT = t; hitShip = sh; hitSub = sub; }
          }
          const wc = sh.wColl;
          for (let k = 0; k < wc.length; k += 4) {
            const t = segSphere(x0, y0, z0, dx, dy, dz, L2, wc[k], wc[k + 1], wc[k + 2], wc[k + 3]);
            if (t >= 0 && t < hitT - 0.001) { hitT = t; hitShip = sh; hitSub = null; }
          }
        } else {
          const t = segSphere(x0, y0, z0, dx, dy, dz, L2, sh.pos.x, sh.pos.y, sh.pos.z, sh.hitR);
          if (t >= 0 && t < hitT) { hitT = t; hitShip = sh; hitSub = null; }
        }
      }
      if (ast) {
        _p0.set(x0, y0, z0); _p1.set(x0 + dx, y0 + dy, z0 + dz);
        const h = ast.hitSegment(_p0, _p1);
        if (h && h.t < hitT) {
          _v.set(x0 + dx * h.t, y0 + dy * h.t, z0 + dz * h.t);
          world.onBoltRock(_v, h.i, this.c[i3], this.c[i3 + 1], this.c[i3 + 2], this.owner[i]);
          this._kill(i); continue;
        }
      }
      if (hitShip) {
        _v.set(x0 + dx * hitT, y0 + dy * hitT, z0 + dz * hitT);
        _v2.set(this.v[i3], this.v[i3 + 1], this.v[i3 + 2]).normalize();
        world.onBoltHit(hitShip, hitSub, _v, _v2, this.dmg[i], this.sm[i], this.hm[i], this.owner[i], [this.c[i3], this.c[i3 + 1], this.c[i3 + 2]]);
        this._kill(i); continue;
      }
      this.p[i3] = x0 + dx; this.p[i3 + 1] = y0 + dy; this.p[i3 + 2] = z0 + dz;
      i++;
    }
  }
  /** Skriver instansmatriser (anropas före rendering). */
  sync() {
    const m = this.mesh;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      _v.set(this.v[i3], this.v[i3 + 1], this.v[i3 + 2]);
      const sp = _v.length() || 1;
      _v.multiplyScalar(1 / sp);
      _q.setFromUnitVectors(Z, _v);
      const L = Math.min(this.len[i], this.life[i] * sp + 1);
      _v2.set(this.p[i3] - _v.x * L * 0.5, this.p[i3 + 1] - _v.y * L * 0.5, this.p[i3 + 2] - _v.z * L * 0.5);
      _s.set(this.size[i], this.size[i], L);
      _m.compose(_v2, _q, _s);
      m.setMatrixAt(i, _m);
      m.instanceColor.setXYZ(i, this.c[i3], this.c[i3 + 1], this.c[i3 + 2]);
    }
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; this.owner.fill(null); }
}

/* ================================================================ Missiler */
let MISSILE_GEO = null;
function missileGeo() {
  if (MISSILE_GEO) return MISSILE_GEO;
  const parts = [];
  const body = new THREE.CylinderGeometry(0.22, 0.25, 2.6, 8); body.rotateX(Math.PI / 2); parts.push(body.toNonIndexed());
  const nose = new THREE.ConeGeometry(0.22, 0.7, 8); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -1.65); parts.push(nose.toNonIndexed());
  for (let k = 0; k < 4; k++) { const f = new THREE.BoxGeometry(0.05, 0.9, 0.7); f.translate(0, 0.4, 1.0); f.rotateZ(k * Math.PI / 2 + Math.PI / 4); parts.push(f.toNonIndexed()); }
  for (const p of parts) { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k); }
  MISSILE_GEO = mergeGeometries(parts);
  return MISSILE_GEO;
}

export class Missiles {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx;
    this.list = []; this.pool = [];
  }
  _mesh(team, torpedo) {
    let m = this.pool.find(x => x.userData.team === team && x.userData.torpedo === torpedo);
    if (m) { this.pool.splice(this.pool.indexOf(m), 1); m.visible = true; return m; }
    m = new THREE.Mesh(missileGeo(), mat(team === 0 ? 'grey' : 'red'));
    const glow = new THREE.Sprite(glowSpriteMat(team === 0 ? '#8ad0ff' : '#ff8a4a', 3, 'mglow' + team));
    glow.position.z = 1.6; glow.scale.setScalar(torpedo ? 3 : 2.2); m.add(glow);
    m.userData.team = team; m.userData.torpedo = torpedo;
    if (torpedo) m.scale.setScalar(2.2);
    this.scene.add(m);
    return m;
  }
  /** opts: { pos, dir, baseVel, def, team, owner, target, sub, dmgMult } */
  fire(o) {
    const def = o.def;
    const mesh = this._mesh(o.team, !!def.torpedo || def.id === 'torpedo');
    const torp = !!def.torpedo || def.id === 'torpedo';
    const m = {
      uid: (this.uidN = (this.uidN || 0) + 1),
      mesh, def, team: o.team, owner: o.owner, target: o.target || null, sub: o.sub || null,
      pos: o.pos.clone(), dir: o.dir.clone().normalize(), speed: Math.max(60, o.baseVel.dot(o.dir) + 30),
      life: 0, alive: true, dmg: def.dmg * (o.dmgMult || 1), smoke: 0, guided: !!o.target, arm: 0.15, wobble: o.wobble || 0,
      // målbar: spelaren kan låsa på och skjuta ner fiendens missiler och torpeder
      isProxy: true, isMissile: true, dead: false, targetable: true, kind: torp ? 'torpedo' : 'missile',
      name: torp ? 'Torped' : (o.team === 1 ? 'Fientlig missil' : 'Missil'), vel: new THREE.Vector3(),
      hitR: torp ? 5 : 3, radius: torp ? 5 : 3, boundR: torp ? 5 : 3, subs: [], isLarge: false, hull: 1, maxHull: 1, shield: 0, maxShield: 0, points: 0
    };
    m.vel.copy(m.dir).multiplyScalar(m.speed);
    mesh.position.copy(m.pos);
    mesh.quaternion.setFromUnitVectors(_v.set(0, 0, -1), m.dir);
    const self = m;
    m.trail = this.fx.trails.add(out => { if (!self.alive) return false; out.copy(self.pos).addScaledVector(self.dir, -1.6 * (mesh.scale.x)); return true; },
      { width: def.id === 'torpedo' || def.torpedo ? 1.2 : 0.5, life: 0.55, color: o.team === 0 ? [0.8, 1.4, 2.4] : [2.4, 1.0, 0.4], alpha: 0.55 });
    this.list.push(m);
    return m;
  }
  targetPos(m, out) {
    const t = m.target;
    if (!t) return null;
    if (t.isFlare) return t.alive ? out.copy(t.pos) : null;
    if (t.dead || t.alive === false) return null;
    if (m.sub && m.sub.alive) return out.copy(m.sub.w);
    return out.copy(t.pos);
  }
  update(dt, world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (!m || !m.alive) continue; // kan ha sprängts av en annan explosion under samma uppdatering
      m.life += dt; m.arm -= dt;
      const def = m.def;
      m.speed = Math.min(def.speed, m.speed + def.speed * 1.6 * dt);
      const tp = m.guided ? this.targetPos(m, _v) : null;
      if (tp) {
        const tv = m.target.vel || _v3.set(0, 0, 0);
        const d = tp.distanceTo(m.pos);
        const tti = Math.min(2.5, d / Math.max(1, m.speed));
        _v2.copy(tp).addScaledVector(tv, tti * 0.85).sub(m.pos).normalize();
        const ang = m.dir.angleTo(_v2);
        const maxT = def.turn * dt * (m.life < 0.35 ? 0.4 : 1);
        if (ang > 1e-4) {
          if (ang <= maxT) m.dir.copy(_v2);
          else { _v3.crossVectors(m.dir, _v2); if (_v3.lengthSq() < 1e-10) _v3.set(0, 1, 0); _v3.normalize(); m.dir.applyAxisAngle(_v3, maxT).normalize(); }
        }
        // närhetständning
        const hitR = m.target.isFlare ? 6 : (m.sub && m.sub.alive ? m.sub.r + 2 : (m.target.isMissile ? m.target.hitR + def.blast * 0.5 : (m.target.hitR || 5) + 2));
        if (m.arm <= 0 && d < hitR + m.speed * dt) { this._explode(m, world, m.target.isFlare ? null : m.target, m.sub); continue; }
      } else if (m.guided && m.target && (m.target.isFlare || m.target.isProxy)) { m.guided = false; }
      if (m.wobble) { _v3.set(Math.sin(m.life * 13 + m.wobble), Math.cos(m.life * 11 + m.wobble * 2), 0).multiplyScalar(0.012); m.dir.add(_v3).normalize(); }
      const step = m.speed * dt;
      _p0.copy(m.pos);
      m.pos.addScaledVector(m.dir, step);
      m.vel.copy(m.dir).multiplyScalar(m.speed);
      // kollision med skepp längs vägen
      if (m.arm <= 0) {
        const hit = world.segmentHitShips(_p0, m.pos, m.team, 1.5);
        if (hit) { m.pos.copy(hit.point); this._explode(m, world, hit.ship, hit.sub); continue; }
        if (world.asteroids) {
          const h = world.asteroids.hitSegment(_p0, m.pos);
          if (h) { m.pos.lerpVectors(_p0, m.pos, h.t); this._explode(m, world, world.asteroids.target(h.i), null); continue; }
        }
      }
      if (m.life > def.life) { this._explode(m, world, null, null, true); continue; }
      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(_v.set(0, 0, -1), m.dir);
      m.smoke -= dt;
      if (m.smoke <= 0) {
        m.smoke = 0.03;
        _v.copy(m.pos).addScaledVector(m.dir, -1.8 * m.mesh.scale.x);
        this.fx.smokePuff(_v, null, 0.8 * m.mesh.scale.x, 0.9, 0.35, 0.35);
        this.fx.glowAt(_v, m.team === 0 ? [1.2, 1.8, 3] : [3, 1.4, 0.5], 1.6 * m.mesh.scale.x, 0.08);
      }
    }
  }
  _explode(m, world, ship, sub, fizzle = false) {
    if (!m.alive) return;
    m.alive = false; m.dead = true;
    const def = m.def;
    world.blast(m.pos, fizzle ? def.blast * 0.5 : def.blast, fizzle ? 0 : m.dmg, m.team, m.owner, ship, sub, def.capMult || 1, def);
    this.fx.explode(m.pos, (def.id === 'torpedo' || def.torpedo) ? 9 : 3.2, null, { debris: 0 });
    world.sfxAt('missileBoom', m.pos, def.id === 'torpedo' || def.torpedo ? 1.4 : 0.8);
    this._release(m);
  }
  _release(m) {
    m.alive = false; m.dead = true;
    const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1);
    m.mesh.visible = false; this.pool.push(m.mesh);
  }
  /** Spränger (utan skada) en missil som skjutits ner. */
  shootDown(m, world) { if (m && m.alive) this._explode(m, world, null, null, true); }
  /** Explosion: fientliga missiler/torpeder inom radien skjuts ner. */
  blastKill(pos, radius, team, world, except = null) {
    for (const m of this.list.slice()) {
      if (!m.alive || m === except || m.team === team) continue;
      const r = radius + m.hitR;
      if (m.pos.distanceToSquared(pos) < r * r) { this.shootDown(m, world); world.emit('missileDown', m); }
    }
  }
  /** Avleda missiler som jagar `ship` mot en flare. */
  decoy(ship, flare, chance) {
    for (const m of this.list) if (m.target === ship && Math.random() < chance) { m.target = flare; m.sub = null; }
  }
  incomingTo(ship) { let n = 0, best = null, bd = 1e9; for (const m of this.list) if (m.guided && m.target === ship) { n++; const d = m.pos.distanceTo(ship.pos); if (d < bd) { bd = d; best = m; } } return { n, nearest: best, dist: bd }; }
  clear() { for (const m of this.list.slice()) { m.alive = false; this._release(m); } this.list.length = 0; }
  dispose() { this.clear(); for (const m of this.pool) this.scene.remove(m); this.pool.length = 0; }
}

/* ================================================================ Motåtgärder */
export class Flares {
  constructor(fx) { this.fx = fx; this.list = []; }
  launch(ship, count = 3) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const f = { isFlare: true, alive: true, pos: ship.pos.clone(), vel: new THREE.Vector3(), life: 0, max: 3.2, team: ship.team };
      _v.set((Math.random() - 0.5) * 2, -0.6 - Math.random(), 1.2).normalize().applyQuaternion(ship.quat);
      f.vel.copy(ship.vel).multiplyScalar(0.55).addScaledVector(_v, 45 + Math.random() * 25);
      this.list.push(f); out.push(f);
    }
    return out;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life += dt;
      if (f.life > f.max) { f.alive = false; this.list.splice(i, 1); continue; }
      f.pos.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.exp(-0.6 * dt));
      this.fx.glowAt(f.pos, [3, 2.4, 1.4], 5 * (1 - f.life / f.max) + 2, 0.05);
      if (Math.random() < 0.5) this.fx.spark(f.pos, null, 1, 15, [3, 2, 1], 0.5);
    }
  }
  clear() { for (const f of this.list) f.alive = false; this.list.length = 0; }
}
