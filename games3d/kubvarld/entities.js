/** Entiteter: föremål på marken, partiklar, fallande block, projektiler och varelser (AI + spawn). */
import * as THREE from 'three';
import { BLOCKS, B, I, CY, isWater, isLava, T_SOLID, itemName } from './blocks.js';
import { buildModel, extrudedGeo, blockGeo, isCubeItem, boxGeo } from './models.js';
import { moveBody, overlaps } from './physics.js';
import { World } from './world.js';
import { tileColorSample } from './textures.js';
import { mobSound, matSound } from './sfx.js';
import { BI } from './worldgen.js';

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpC = new THREE.Color();
const TORCH = new THREE.Color(1.0, 0.66, 0.36);
const FIRE = [new THREE.Color('#ffb040'), new THREE.Color('#ff7a20'), new THREE.Color('#ffd870')];
const ARROW_G = 14;

/** Ljusfärg (linjär) vid en punkt – samma kurva som terrängshadern */
export function lightColor(world, sky, x, y, z, out, minL = 0.03) {
  const L = world.light(Math.floor(x), Math.floor(y), Math.floor(z));
  const s = L >> 4, b = L & 15;
  const sf = s ? Math.pow(0.8, 15 - s) : 0, bf = b ? Math.pow(0.8, 15 - b) * 1.05 : 0;
  out.setRGB(Math.max(sky.r * sf, TORCH.r * bf, minL), Math.max(sky.g * sf, TORCH.g * bf, minL), Math.max(sky.b * sf, TORCH.b * bf, minL));
  return out;
}

/**
 * Varelser. art = obestämd artikel ("en"/"ett") för texter. blood = partikelfärg vid träff.
 * Fredliga djur vandrar och flyr när de slås. Fientliga föds i mörker.
 */
export const MOBS = {
  cow: { name: 'Ko', art: 'en', hp: 10, speed: 1.0, run: 3.4, hostile: false, drops: [[I.meat, 1, 3], [I.leather, 0, 2]], blood: '#c84040', graze: true },
  pig: { name: 'Gris', art: 'en', hp: 10, speed: 1.1, run: 3.6, hostile: false, drops: [[I.pork, 1, 3]], blood: '#c84040', graze: true },
  sheep: { name: 'Får', art: 'ett', hp: 8, speed: 1.1, run: 3.4, hostile: false, drops: [[B.wool_white, 1, 2], [I.meat, 1, 2]], blood: '#c84040', graze: true },
  chicken: { name: 'Höna', art: 'en', hp: 4, speed: 1.2, run: 3.8, hostile: false, drops: [[I.feather, 0, 2], [I.chicken, 1, 1]], blood: '#e8e0d0', flutter: true, eggs: true },
  zombie: { name: 'Zombie', art: 'en', hp: 20, speed: 2.1, hostile: true, dmg: 3, reach: 1.5, kb: 6, drops: [[I.rotten_flesh, 0, 2], [I.iron_ingot, 0, 1, 0.04], [I.carrot, 1, 1, 0.04], [I.potato, 1, 1, 0.04]], sunburn: true, detect: 24, blood: '#56703e' },
  skeleton: { name: 'Skelett', art: 'ett', hp: 16, speed: 2.3, hostile: true, ranged: true, dmg: 3, drops: [[I.bone, 0, 2], [I.arrow, 0, 2]], sunburn: true, detect: 20, blood: '#e6dec6' },
  spider: { name: 'Spindel', art: 'en', hp: 14, speed: 3.6, hostile: true, dmg: 2.5, reach: 1.6, kb: 5, drops: [[I.string, 0, 2]], climb: true, leap: true, dayPeaceful: true, detect: 16, blood: '#3a4a22' }
};
/** Äldre varelsetyper (från tidigare versioner) → nya. Varelser sparas inte, men nycklar kan förekomma i t.ex. statistik. */
export const OLD_MOBS = { hare: 'chicken', moose: 'cow', wolf: 'zombie', giant: 'zombie', ghost: 'skeleton' };

export class Entities {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.drops = []; this.mobs = []; this.falling = []; this.shots = [];
    this.itemMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // partiklar
    const N = 500;
    this.pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.pMesh.frustumCulled = false; this.pMesh.count = 0;
    this.group.add(this.pMesh);
    this.parts = []; for (let i = 0; i < N; i++) this.parts.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.1, c: new THREE.Color(), g: 1, glow: false });
    this.pFree = 0;
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this.spawnT = 0; this.howlT = 20;

  }

  dispose() {
    this.scene.remove(this.group);
    this.pMesh.geometry.dispose(); this.pMesh.material.dispose(); this.pMesh.dispose();
    this.itemMat.dispose();
    if (this.arrowGeos) { this.arrowGeos.forEach(x => x.dispose()); this.arrowMat.dispose(); }
    for (const d of this.drops) if (!d.cube) d.mesh.material.dispose();
    for (const m of this.mobs) disposeModel(m.model);
    this.drops.length = 0; this.mobs.length = 0; this.falling.length = 0; this.shots.length = 0;
  }

  /* ---------- partiklar ---------- */
  particle(x, y, z, vx, vy, vz, color, size = 0.1, life = 0.8, grav = 1, glow = false) {
    const P = this.parts;
    for (let k = 0; k < P.length; k++) {
      const i = (this.pFree + k) % P.length;
      if (!P[i].on) {
        const p = P[i]; p.on = true; p.p.set(x, y, z); p.v.set(vx, vy, vz); p.life = life; p.max = life; p.s = size; p.c.copy(color); p.g = grav; p.glow = glow;
        this.pFree = (i + 1) % P.length; return p;
      }
    }
    return null;
  }
  blockBurst(x, y, z, id, n = 18) {
    const d = BLOCKS[id]; if (!d || !d.tex) return;
    const tile = this.g.atlas.tileOf(d, 4);
    const r = Math.random;
    lightColor(this.g.world, this.g.sky.skyLight, x + 0.5, y + 0.5, z + 0.5, tmpC);
    const lc = tmpC.clone();
    for (let i = 0; i < n; i++) {
      const c = tileColorSample(this.g.atlas, tile, r);
      const col = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace).multiply(lc);
      this.particle(x + 0.15 + r() * 0.7, y + 0.15 + r() * 0.7, z + 0.15 + r() * 0.7, (r() - 0.5) * 3, r() * 3 + 1, (r() - 0.5) * 3, col, 0.06 + r() * 0.07, 0.5 + r() * 0.5);
    }
  }
  hitSpark(x, y, z, id, nx, ny, nz) {
    const d = BLOCKS[id]; if (!d || !d.tex) return;
    const tile = this.g.atlas.tileOf(d, 4);
    lightColor(this.g.world, this.g.sky.skyLight, x + 0.5 + nx, y + 0.5 + ny, z + 0.5 + nz, tmpC);
    for (let i = 0; i < 2; i++) {
      const c = tileColorSample(this.g.atlas, tile, Math.random);
      const col = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace).multiply(tmpC);
      this.particle(x + 0.5 + nx * 0.52 + (Math.random() - 0.5) * 0.6 * (1 - Math.abs(nx)), y + 0.5 + ny * 0.52 + (Math.random() - 0.5) * 0.6 * (1 - Math.abs(ny)), z + 0.5 + nz * 0.52 + (Math.random() - 0.5) * 0.6 * (1 - Math.abs(nz)),
        nx * 1.5 + (Math.random() - 0.5), ny * 1.5 + Math.random() * 1.5, nz * 1.5 + (Math.random() - 0.5), col, 0.05 + Math.random() * 0.04, 0.35);
    }
  }
  puff(x, y, z, color, n = 12, spread = 0.5, glow = false) {
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) this.particle(x + (Math.random() - 0.5) * spread, y + Math.random() * spread, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5, col, 0.08 + Math.random() * 0.12, 0.6 + Math.random() * 0.6, -0.2, glow);
  }
  _updateParticles(dt) {
    const w = this.g.world; let n = 0;
    const cam = this.g.camera.position;
    for (const p of this.parts) {
      if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.v.y -= 18 * p.g * dt;
      const nx = p.p.x + p.v.x * dt, ny = p.p.y + p.v.y * dt, nz = p.p.z + p.v.z * dt;
      const b = w.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (b > 0 && T_SOLID[b] && p.g > 0) { p.v.multiplyScalar(0.3); p.v.y = 0; } else p.p.set(nx, ny, nz);
      const s = p.s * Math.min(1, p.life / p.max * 2.5);
      this._s.set(s, s, s);
      this._m4.compose(p.p, this._q, this._s);
      this.pMesh.setMatrixAt(n, this._m4);
      this.pMesh.setColorAt(n, p.c);
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  /* ---------- föremål på marken ---------- */
  drop(id, n, x, y, z, d = 0, vel = null) {
    if (!id || n <= 0) return;
    const cube = isCubeItem(id);
    const mesh = cube ? new THREE.Mesh(blockGeo(id), this.g.mats.entity) : new THREE.Mesh(extrudedGeo(this.g.atlas, id), this.itemMat.clone());
    mesh.scale.setScalar(cube ? 0.28 : 0.4);
    const e = { id, n, d, pos: new THREE.Vector3(x, y, z), vel: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 3, 3.5, (Math.random() - 0.5) * 3), age: 0, mesh, cube, light: new THREE.Color(1, 1, 1), spin: Math.random() * 6 };
    const self = this;
    if (cube) mesh.onBeforeRender = function (r, s, c, g, mat) {
      const L = self.g.world.light(Math.floor(e.pos.x), Math.floor(e.pos.y + 0.2), Math.floor(e.pos.z)); mat.uniforms.uEntLight.value.set((L >> 4) / 15, (L & 15) / 15);
      mat.uniformsNeedUpdate = true;
    };
    this.group.add(mesh);
    this.drops.push(e);
    return e;
  }
  _updateDrops(dt) {
    const pl = this.g.player, w = this.g.world;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const e = this.drops[i];
      e.age += dt;
      const dx = pl.pos.x - e.pos.x, dy = (pl.pos.y + 0.8) - e.pos.y, dz = pl.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (e.age > 0.5 && dist < 2.3 && pl.alive) {
        e.vel.set(dx, dy, dz).multiplyScalar(9 / Math.max(0.3, dist));
        e.pos.addScaledVector(e.vel, dt);
        if (dist < 0.7) {
          const left = this.g.inv.add(e.id, e.n, e.d);
          if (left < e.n) { this.g.audio.play('pickup', { vol: 0.5, pitch: 0.9 + Math.random() * 0.3, gap: 40 }); this.g.onPickup(e.id, e.n - left); }
          if (left <= 0) { this._removeDrop(i); continue; }
          e.n = left;
        }
      } else {
        e.vel.y -= 20 * dt;
        if (isWater(w.get(Math.floor(e.pos.x), Math.floor(e.pos.y), Math.floor(e.pos.z)))) { e.vel.y = Math.min(e.vel.y + 30 * dt, 1.2); e.vel.x *= 0.95; e.vel.z *= 0.95; }
        const r = moveBody(w, e.pos, e.vel, dt, { hw: 0.12, h: 0.25 });
        if (r.ground) { e.vel.x *= Math.pow(0.02, dt); e.vel.z *= Math.pow(0.02, dt); }
      }
      if (e.age > 300 || e.pos.y < -10) { this._removeDrop(i); continue; }
      if (isLava(w.get(Math.floor(e.pos.x), Math.floor(e.pos.y), Math.floor(e.pos.z)))) { this.puff(e.pos.x, e.pos.y + 0.2, e.pos.z, '#ff9a30', 4, 0.2, true); this._removeDrop(i); continue; }
      e.spin += dt * 1.8;
      e.mesh.position.set(e.pos.x, e.pos.y + 0.2 + Math.sin(e.age * 2.5) * 0.06, e.pos.z);
      e.mesh.rotation.y = e.spin;
      if (!e.cube) lightColor(w, this.g.sky.skyLight, e.pos.x, e.pos.y + 0.3, e.pos.z, e.mesh.material.color);
    }
    // slå ihop likadana nära varandra
    if (this.drops.length > 30 && Math.random() < 0.1) {
      for (let i = this.drops.length - 1; i > 0; i--) {
        const a = this.drops[i];
        for (let j = 0; j < i; j++) { const b = this.drops[j]; if (b.id === a.id && !a.d && !b.d && a.pos.distanceToSquared(b.pos) < 1) { b.n += a.n; this._removeDrop(i); break; } }
      }
    }
  }
  _removeDrop(i) { const e = this.drops[i]; this.group.remove(e.mesh); if (!e.cube) e.mesh.material.dispose(); this.drops.splice(i, 1); }

  /* ---------- fallande block ---------- */
  fallBlock(x, y, z, id) {
    const mesh = new THREE.Mesh(blockGeo(id), this.g.mats.entity);
    const e = { id, pos: new THREE.Vector3(x + 0.5, y, z + 0.5), vel: new THREE.Vector3(), mesh };
    const self = this;
    mesh.onBeforeRender = function (r, s, c, g, mat) { const L = self.g.world.light(Math.floor(e.pos.x), Math.floor(e.pos.y + 0.5), Math.floor(e.pos.z)); mat.uniforms.uEntLight.value.set((L >> 4) / 15, (L & 15) / 15); mat.uniformsNeedUpdate = true; };
    this.group.add(mesh); this.falling.push(e);
  }
  _updateFalling(dt) {
    const w = this.g.world;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const e = this.falling[i];
      e.vel.y = Math.max(e.vel.y - 25 * dt, -30);
      const r = moveBody(w, e.pos, e.vel, dt, { hw: 0.49, h: 0.98 });
      e.mesh.position.set(e.pos.x, e.pos.y + 0.5, e.pos.z);
      if (r.ground || e.pos.y < 1) {
        const bx = Math.floor(e.pos.x), by = Math.round(e.pos.y), bz = Math.floor(e.pos.z);
        const cur = w.get(bx, by, bz);
        if (cur === 0 || (cur > 0 && BLOCKS[cur].replace)) w.set(bx, by, bz, e.id);
        else this.drop(e.id, 1, e.pos.x, e.pos.y + 0.5, e.pos.z);
        this.group.remove(e.mesh); this.falling.splice(i, 1);
      }
    }
  }

  /* ---------- varelser ---------- */
  spawnMob(type, x, y, z) {
    type = OLD_MOBS[type] || type;
    const def = MOBS[type];
    if (!def) return null;
    const model = buildModel(type);
    const m = {
      type, def, model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw: Math.random() * Math.PI * 2, tyaw: 0,
      hp: def.hp * (def.hostile ? this.g.diffHp() : 1), ground: false, walk: 0, wander: 0, dir: new THREE.Vector2(), moving: false,
      hurtT: 0, dead: false, deathT: 0, atkCd: 1, angryT: 0, fleeT: 0, path: null, pathT: 0, pi: 0, shotCd: 2 + Math.random() * 2,
      hw: model.width / 2, h: model.height, light: new THREE.Color(1, 1, 1), soundT: 4 + Math.random() * 10, burn: 0, stuckT: 0, lastPos: new THREE.Vector3(x, y, z), fade: 0,
      seed: Math.random() * 10, graze: false, aimT: 0, strafe: Math.random() < 0.5 ? 1 : -1, eggT: 90 + Math.random() * 150, calm: false
    };
    m.tyaw = m.yaw;
    model.root.position.copy(m.pos);
    this.group.add(model.root);
    this.mobs.push(m);
    return m;
  }
  _killMob(m, byPlayer) {
    m.dead = true; m.deathT = 0;
    mobSound(this.g.audio, m.type, 'death', this._vol(m));
    if (byPlayer) {
      for (const [id, a, b, p] of m.def.drops) {
        if (p != null && Math.random() > p) continue;
        const n = a + Math.floor(Math.random() * (b - a + 1));
        if (n > 0) this.drop(id, n, m.pos.x, m.pos.y + 0.5, m.pos.z);
      }
      this.g.stats.kills++; this.g.onKill(m.type);
      if (m.def.hostile) this.g.log('Du besegrade ' + m.def.art + ' ' + m.def.name.toLowerCase() + '.');
    }
  }
  _vol(m) { const d = m.pos.distanceTo(this.g.player.pos); const p = this.g.player; const ang = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z); return { vol: Math.max(0, 1 - d / 28), pan: Math.max(-1, Math.min(1, Math.sin(ang - p.yaw - Math.PI) * 0.8)) }; }

  /** Spelaren (eller spelarens pil) träffar en varelse */
  hitMob(m, dmg, dir) {
    if (m.dead || m.hurtT > 0.35) return false;
    m.hp -= dmg; m.hurtT = 0.5;
    const kb = 6;
    m.vel.x += dir.x * kb; m.vel.z += dir.z * kb; m.vel.y = Math.max(m.vel.y, 5);
    mobSound(this.g.audio, m.type, 'hurt', this._vol(m));
    this.puff(m.pos.x, m.pos.y + m.h * 0.6, m.pos.z, m.def.blood || '#c84040', 6, 0.4);
    if (m.def.dayPeaceful) m.angryT = 30;
    if (!m.def.hostile) m.fleeT = 5;
    if (m.hp <= 0) this._killMob(m, true);
    return true;
  }
  /** Strålkastning mot varelser */
  raycast(o, d, maxD) {
    let best = null, bt = maxD;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = rayAabb(o, d, m.pos.x - m.hw, m.pos.y, m.pos.z - m.hw, m.pos.x + m.hw, m.pos.y + m.h, m.pos.z + m.hw);
      if (t !== null && t < bt) { bt = t; best = m; }
    }
    return best ? { mob: best, dist: bt } : null;
  }
  /** Vägsökning mot spelaren: sätter riktning (tx,tz) och om varelsen vill hoppa */
  _chase(m, dt, pl, w, out) {
    m.pathT -= dt;
    if (m.pathT <= 0) {
      m.pathT = 0.8 + Math.random() * 0.5;
      m.path = findPath(w, m.pos, pl.pos, Math.ceil(m.h), 350);
      m.pi = 0;
    }
    let gx = pl.pos.x, gz = pl.pos.z;
    out.jump = false;
    if (m.path && m.pi < m.path.length) {
      const n = m.path[m.pi];
      gx = n[0] + 0.5; gz = n[2] + 0.5;
      if (Math.hypot(gx - m.pos.x, gz - m.pos.z) < 0.45) m.pi++;
      if (n[1] > Math.floor(m.pos.y + 0.1)) out.jump = true;
    }
    let tx = gx - m.pos.x, tz = gz - m.pos.z;
    const l = Math.hypot(tx, tz); if (l > 0.01) { tx /= l; tz /= l; }
    out.tx = tx; out.tz = tz;
  }
  _los(m, pl, eyeY) {
    const from = tmpV2.set(m.pos.x, m.pos.y + eyeY, m.pos.z);
    const to = tmpV.set(pl.pos.x, pl.pos.y + 1.5, pl.pos.z).sub(from);
    const dist = to.length(); if (dist < 0.01) return true;
    to.multiplyScalar(1 / dist);
    return !this.g.world.raycast(from.x, from.y, from.z, to.x, to.y, to.z, dist, {});
  }

  _updateMobs(dt) {
    const g = this.g, w = g.world, pl = g.player;
    const day = g.sky.daylight;
    const ch = this._ch || (this._ch = { tx: 0, tz: 0, jump: false });
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const md = m.def;
      // avlägsna långt borta eller i olastade chunkar
      const dpl = m.pos.distanceTo(pl.pos);
      if (dpl > (md.hostile ? 72 : 110) || !w.isLoaded(Math.floor(m.pos.x), Math.floor(m.pos.z)) || m.pos.y < -20) { this._removeMob(i); continue; }
      if (m.dead) {
        m.deathT += dt;
        m.model.root.rotation.z = Math.min(Math.PI / 2, m.deathT * 4);
        m.model.mat.color.setRGB(1, 0.35, 0.35);
        if (m.deathT > 0.9) { this.puff(m.pos.x, m.pos.y + m.h * 0.4, m.pos.z, md.hostile ? '#4a4a4a' : '#dddddd', 14, m.hw * 2); this._removeMob(i); }
        continue;
      }
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.atkCd = Math.max(0, m.atkCd - dt);
      m.angryT = Math.max(0, m.angryT - dt);
      m.fleeT = Math.max(0, m.fleeT - dt);
      m.aimT = Math.max(0, m.aimT - dt);
      // zombier och skelett brinner i solljus
      if (md.sunburn && day > 0.55) {
        const L = w.light(Math.floor(m.pos.x), Math.floor(m.pos.y + m.h * 0.7), Math.floor(m.pos.z));
        if ((L >> 4) >= 12 && !isWater(w.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.5), Math.floor(m.pos.z)))) {
          m.burn += dt;
          if (Math.random() < dt * 24) this.particle(m.pos.x + (Math.random() - 0.5) * m.hw * 2, m.pos.y + Math.random() * m.h, m.pos.z + (Math.random() - 0.5) * m.hw * 2, 0, 1.6, 0, FIRE[Math.random() * 3 | 0], 0.09 + Math.random() * 0.08, 0.5, -0.25, true);
          if (Math.random() < dt * 6) this.puff(m.pos.x, m.pos.y + m.h, m.pos.z, '#3a3634', 1, m.hw);
          if (m.burn > 0.5) { m.hp -= 5 * dt; if (m.hp <= 0) { this._killMob(m, false); continue; } }
        } else m.burn = 0;
      } else m.burn = 0;
      // lava bränner alla varelser; klippta får växer ny ull
      if (isLava(w.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.2), Math.floor(m.pos.z)))) { m.hp -= 8 * dt; m.burn = Math.max(m.burn, 0.1); if (Math.random() < dt * 10) this.particle(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z, 0, 1.5, 0, FIRE[0], 0.12, 0.5, -0.2, true); if (m.hp <= 0) { this._killMob(m, false); continue; } }
      if (m.sheared && (m.regrow -= dt) <= 0) { m.sheared = false; const P = m.model.parts; if (P.wool) for (const x of P.wool) x.visible = true; if (P.skin) P.skin.visible = false; }
      // spindlar är lugna i dagsljus om ingen slagit dem
      m.calm = false;
      if (md.dayPeaceful && m.angryT <= 0) { const L = w.light(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.6), Math.floor(m.pos.z)); if ((L >> 4) * day >= 9) m.calm = true; }
      // --- AI ---
      let tx = 0, tz = 0, speed = md.speed, wantJump = false;
      const canTarget = md.hostile && !m.calm && pl.alive && !pl.creative && dpl < (md.detect || 16) * (pl.sneaking ? 0.6 : 1);
      const hdist = Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
      if (canTarget && md.ranged) {
        // skelett: håll avstånd, sidsteg och skjut pilar när de ser spelaren
        const see = (m._seeT = (m._seeT || 0) - dt) > 0 ? m._see : (m._seeT = 0.3, m._see = this._los(m, pl, 1.5));
        const ax = (pl.pos.x - m.pos.x) / (hdist || 1), az = (pl.pos.z - m.pos.z) / (hdist || 1);
        if (hdist > 11 || !see) { this._chase(m, dt, pl, w, ch); tx = ch.tx; tz = ch.tz; wantJump = ch.jump; m.tyaw = Math.atan2(tx, tz); }
        else {
          if (Math.random() < dt * 0.4) m.strafe = -m.strafe;
          if (hdist < 5) { tx = -ax; tz = -az; }
          else { tx = -az * m.strafe * 0.6; tz = ax * m.strafe * 0.6; }
          speed = md.speed * 0.7;
          m.tyaw = Math.atan2(ax, az);
          // undvik stup när den backar
          const fx = Math.floor(m.pos.x + tx * 0.8), fz = Math.floor(m.pos.z + tz * 0.8), fy = Math.floor(m.pos.y);
          if (!T_SOLID[Math.max(0, w.get(fx, fy - 1, fz))] && !T_SOLID[Math.max(0, w.get(fx, fy - 2, fz))]) { tx = 0; tz = 0; }
          if (see && hdist < 16) m.aimT = 0.4;
        }
        m.shotCd -= dt;
        if (m.shotCd <= 0 && see && hdist < 16) {
          m.shotCd = 2.0 + Math.random() * 1.4 - (g.difficulty === 2 ? 0.5 : 0);
          m.swing = 0.4;
          const from = new THREE.Vector3(m.pos.x + Math.sin(m.yaw) * 0.4, m.pos.y + 1.45, m.pos.z + Math.cos(m.yaw) * 0.4);
          const aim = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.1, pl.pos.z).sub(from);
          const v = 17, tt = Math.hypot(aim.x, aim.z) / v;
          aim.y += 0.5 * ARROW_G * tt * tt;
          aim.normalize();
          const spread = g.difficulty === 2 ? 0.025 : 0.05;
          aim.x += (Math.random() - 0.5) * spread; aim.y += (Math.random() - 0.5) * spread; aim.z += (Math.random() - 0.5) * spread;
          this.shootArrow(from, aim.normalize().multiplyScalar(v), 'mob', md.dmg * g.diffDmg());
        }
      } else if (canTarget) {
        // zombie och spindel: väg mot spelaren och slå
        this._chase(m, dt, pl, w, ch); tx = ch.tx; tz = ch.tz; wantJump = ch.jump;
        m.tyaw = Math.atan2(tx, tz);
        // spindelns språng
        if (md.leap && m.ground && hdist > 2.2 && hdist < 5.5 && m.atkCd <= 0 && Math.random() < dt * 2.2) { m.vel.y = 6.8; m.vel.x = tx * 8.5; m.vel.z = tz * 8.5; mobSound(g.audio, m.type, 'attack', this._vol(m)); }
        const reach = (md.reach || 1.4) + 0.3;
        if (hdist < reach && Math.abs(pl.pos.y - m.pos.y) < Math.max(1.6, m.h * 0.8) && m.atkCd <= 0) {
          m.atkCd = m.type === 'spider' ? 0.8 : 1.0;
          m.swing = 0.4;
          g.damagePlayer(md.dmg * g.diffDmg(), tmpV.set(pl.pos.x - m.pos.x, 0, pl.pos.z - m.pos.z).normalize(), md.kb || 6, m.type);
          mobSound(g.audio, m.type, 'attack', this._vol(m));
        }
        if (hdist < reach * 0.7) { tx = 0; tz = 0; }
        if (hdist < m.hw + 0.35 && hdist > 0.001) { const k2 = (m.hw + 0.35 - hdist) / hdist; m.pos.x -= (pl.pos.x - m.pos.x) * k2 * 0.5; m.pos.z -= (pl.pos.z - m.pos.z) * k2 * 0.5; }
      } else if (m.fleeT > 0) {
        tx = m.pos.x - pl.pos.x; tz = m.pos.z - pl.pos.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; speed = md.run || md.speed * 2.2;
        // fly i sicksack
        const zz = Math.sin(g.time * 3 + m.seed) * 0.5; const ox = tx; tx += -tz * zz; tz += ox * zz;
        m.tyaw = Math.atan2(tx, tz); m.graze = false;
      } else {
        // vandra (och beta)
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 2 + Math.random() * 5;
          m.graze = false;
          if (Math.random() < 0.55) { const a = Math.random() * Math.PI * 2; m.dir.set(Math.sin(a), Math.cos(a)); m.moving = true; } else { m.moving = false; m.graze = !!md.graze && Math.random() < 0.6; }
        }
        if (m.moving) {
          tx = m.dir.x; tz = m.dir.y; m.tyaw = Math.atan2(tx, tz);
          // undvik stup och vatten
          const ax = Math.floor(m.pos.x + tx * (m.hw + 0.6)), az = Math.floor(m.pos.z + tz * (m.hw + 0.6)), ay = Math.floor(m.pos.y);
          let drop = 0; while (drop < 4 && !T_SOLID[Math.max(0, w.get(ax, ay - 1 - drop, az))]) drop++;
          if (drop >= 3 || isWater(w.get(ax, ay, az)) || isWater(w.get(ax, ay - 1, az))) { m.wander = 0.1; tx = tz = 0; m.moving = false; }
        }
        if (!md.hostile || m.calm) {
          m.soundT -= dt;
          if (m.soundT <= 0) { m.soundT = 6 + Math.random() * 14; mobSound(g.audio, m.type, 'idle', this._vol(m)); }
        }
      }
      if (canTarget) {
        m.soundT -= dt;
        if (m.soundT <= 0) { m.soundT = 4 + Math.random() * 6; mobSound(g.audio, m.type, 'idle', this._vol(m)); }
      }
      // hönor värper ibland
      if (md.eggs) { m.eggT -= dt; if (m.eggT <= 0) { m.eggT = 120 + Math.random() * 180; this.drop(I.egg, 1, m.pos.x, m.pos.y + 0.3, m.pos.z, 0, tmpV.set(0, 1, 0)); mobSound(g.audio, m.type, 'idle', this._vol(m)); } }
      // --- fysik ---
      const inW = isWater(w.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z)));
      const acc = m.ground ? 10 : 2;
      const k = 1 - Math.exp(-acc * dt);
      m.vel.x += (tx * speed - m.vel.x) * k;
      m.vel.z += (tz * speed - m.vel.z) * k;
      if (inW) { m.vel.y = Math.min(m.vel.y + 22 * dt, 2.2); }
      else m.vel.y = Math.max(m.vel.y - 28 * dt, md.flutter ? -2.2 : -40);
      const r = moveBody(w, m.pos, m.vel, dt, { hw: Math.min(m.hw, 0.45), h: Math.min(m.h, 2.8), stepUp: 0.55, grounded: m.ground });
      m.ground = r.ground;
      // ta sig upp ur vattnet mot en strandkant i stället för att fastna
      if (inW && (r.hitX || r.hitZ)) m.vel.y = Math.max(m.vel.y, 5.5);
      m.climbing = false;
      if ((r.hitX || r.hitZ) && (tx || tz)) {
        if (md.climb && canTarget) { m.vel.y = 3.4; m.climbing = true; }
        else if (m.ground || inW) wantJump = true;
      }
      if (wantJump && m.ground) m.vel.y = 8.5;
      // fastnat?
      m.stuckT += dt;
      if (m.stuckT > 1) { if (m.pos.distanceTo(m.lastPos) < 0.3 && (tx || tz)) { m.wander = 0; m.pathT = 0; m.dir.set(-m.dir.x, -m.dir.y); } m.stuckT = 0; m.lastPos.copy(m.pos); }
      // --- animation ---
      let dy = m.tyaw - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * (1 - Math.exp(-8 * dt));
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.walk += hs * dt * (m.type === 'spider' ? 3.2 : m.type === 'chicken' ? 3.5 : 2.2);
      this._animate(m, hs, dt);
      lightColor(w, g.sky.skyLight, m.pos.x, m.pos.y + m.h * 0.6, m.pos.z, m.light, 0.04);
      if (m.hurtT > 0.25) m.model.mat.color.setRGB(1, 0.3, 0.3);
      else if (m.burn > 0) m.model.mat.color.copy(m.light).lerp(tmpC.setRGB(1, 0.55, 0.25), 0.35);
      else m.model.mat.color.copy(m.light);
    }
  }
  _animate(m, hs, dt) {
    const P = m.model.parts, root = m.model.root, t = performance.now() * 0.001 + m.seed;
    root.position.copy(m.pos); root.rotation.y = m.yaw;
    const sw = Math.sin(m.walk) * Math.min(1, hs * 0.6) * 0.8;
    if (P.legs) { P.legs[0].rotation.x = sw; P.legs[3].rotation.x = sw; P.legs[1].rotation.x = -sw; P.legs[2].rotation.x = -sw; }
    if (P.legL) { P.legL.rotation.x = sw; P.legR.rotation.x = -sw; }
    if (m.swing > 0) m.swing -= dt;
    const atk = m.swing > 0 ? Math.sin((0.4 - m.swing) / 0.4 * Math.PI) : 0;
    const type = m.type;
    if (type === 'zombie') {
      // ena armen sträckt framåt, den andra slänger – vinglande huvud
      P.armL.rotation.x = -1.3 + sw * 0.15 - atk * 0.5;
      P.armR.rotation.x = -0.35 - sw * 0.6 - atk * 1.3;
      P.armR.rotation.z = 0.12;
      P.head.rotation.z = Math.sin(t * 1.3) * 0.14; P.head.rotation.x = 0.1 - atk * 0.3;
    } else if (type === 'skeleton') {
      const aim = m.aimT > 0 ? 1 : 0;
      P.armL.rotation.x = aim ? -1.5 : sw * 0.6;
      P.armR.rotation.x = aim ? -1.35 + atk * 0.5 : -sw * 0.6;
      P.armR.rotation.y = aim ? -0.5 : 0;
      P.jaw.rotation.x = Math.max(0, Math.sin(t * (m.aimT > 0 ? 4 : 9))) * 0.18;
      P.head.rotation.x = 0;
    } else if (type === 'spider') {
      const mv = Math.min(1, hs * 0.5);
      for (const L of P.slegs) {
        const ph = m.walk * 2 + L.i * Math.PI * 0.5 + (L.s > 0 ? 0 : Math.PI);
        L.g.rotation.y = L.yaw + Math.sin(ph) * 0.3 * mv;
        L.g.rotation.z = L.s * (0.55 + Math.max(0, Math.cos(ph)) * 0.25 * mv + (m.climbing ? 0.3 : 0));
      }
      P.abd.rotation.x = Math.sin(t * 1.7) * 0.04 - atk * 0.2;
    } else if (type === 'chicken') {
      const flap = !m.ground || m.fleeT > 0 ? Math.abs(Math.sin(t * 22)) * 0.9 : 0;
      P.wingL.rotation.z = -flap; P.wingR.rotation.z = flap;
      P.head.rotation.x = m.graze ? 0.7 : Math.sin(m.walk * 2) * 0.15 * Math.min(1, hs);
      if (!m.moving && hs < 0.2 && Math.sin(t * 0.7) > 0.6) P.head.rotation.x = 0.6 + Math.abs(Math.sin(t * 10)) * 0.3; // pickar
    } else if (P.head) {
      // fyrfota djur: betar när de står still
      P.head.rotation.x = m.graze && hs < 0.2 ? 0.55 + Math.sin(t * 2.2) * 0.08 : Math.sin(t * 0.9) * 0.05;
    }
    if (P.tail) { if (type === 'cow') P.tail.rotation.z = Math.sin(t * 2.5) * 0.25; else P.tail.rotation.y = Math.sin(t * 6) * 0.3; }
  }
  _removeMob(i) { const m = this.mobs[i]; this.group.remove(m.model.root); disposeModel(m.model); this.mobs.splice(i, 1); }

  /* ---------- pilar ---------- */
  _arrowTemplate() {
    if (this._arrowT) return this._arrowT;
    const mat = this.arrowMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const grp = new THREE.Group();
    const geos = this.arrowGeos = [boxGeo(0.04, 0.04, 0.62, '#8a5f33'), boxGeo(0.07, 0.07, 0.1, '#8a8c94'), boxGeo(0.12, 0.02, 0.14, '#ece8de'), boxGeo(0.02, 0.12, 0.14, '#ece8de')];
    const [a, b, c, d] = geos.map(gg => new THREE.Mesh(gg, mat));
    b.position.z = 0.33; c.position.z = -0.26; d.position.z = -0.26;
    grp.add(a, b, c, d);
    return (this._arrowT = grp);
  }
  /** Skjut en pil. owner: 'mob' (skadar spelaren) eller 'player' (skadar varelser) */
  shootArrow(from, vel, owner, dmg) {
    const mesh = this._arrowTemplate().clone();
    mesh.position.copy(from);
    this.group.add(mesh);
    this.shots.push({ pos: from.clone(), vel: vel.clone(), life: 6, mesh, owner, dmg });
    const d = from.distanceTo(this.g.player.pos);
    try { this.g.audio.noise({ dur: 0.12, vol: 0.12 * Math.max(0.15, 1 - d / 25), freq: 1800, type: 'bandpass', to: 600 }); this.g.audio.tone({ freq: 240, to: 150, dur: 0.12, vol: 0.05 * Math.max(0.15, 1 - d / 25), type: 'triangle' }); } catch (e) { }
  }
  _updateShots(dt) {
    const pl = this.g.player, w = this.g.world;
    if (this.arrowMat) lightColor(w, this.g.sky.skyLight, pl.pos.x, pl.pos.y + 1, pl.pos.z, this.arrowMat.color, 0.08);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.vel.y -= ARROW_G * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos); s.mesh.lookAt(tmpV.copy(s.pos).add(s.vel));
      let hit = false;
      if (s.owner === 'mob') {
        if (pl.alive && Math.abs(s.pos.x - pl.pos.x) < 0.45 && Math.abs(s.pos.z - pl.pos.z) < 0.45 && s.pos.y > pl.pos.y && s.pos.y < pl.pos.y + 1.85) {
          this.g.damagePlayer(s.dmg, tmpV.copy(s.vel).setY(0).normalize(), 3, 'arrow');
          hit = true;
        }
      } else {
        for (const m of this.mobs) {
          if (m.dead) continue;
          if (Math.abs(s.pos.x - m.pos.x) < m.hw + 0.1 && Math.abs(s.pos.z - m.pos.z) < m.hw + 0.1 && s.pos.y > m.pos.y - 0.1 && s.pos.y < m.pos.y + m.h + 0.1) {
            this.hitMob(m, s.dmg, tmpV.copy(s.vel).setY(0).normalize());
            hit = true; break;
          }
        }
      }
      const b = w.get(Math.floor(s.pos.x), Math.floor(s.pos.y), Math.floor(s.pos.z));
      const wall = b > 0 && T_SOLID[b];
      if (hit || wall || s.life <= 0 || s.pos.y < -5) {
        if (wall) { this.puff(s.pos.x, s.pos.y, s.pos.z, '#8a7a66', 4, 0.2); matSound(this.g.audio, 'wood', 'hit', { vol: Math.max(0, 1 - s.pos.distanceTo(pl.pos) / 20) }); }
        // spelarens pilar kan oftast plockas upp igen
        if (wall && s.owner === 'player' && Math.random() < 0.75) this.drop(I.arrow, 1, s.pos.x - s.vel.x * dt * 1.5, s.pos.y - s.vel.y * dt * 1.5, s.pos.z - s.vel.z * dt * 1.5, 0, tmpV.set(0, 0, 0));
        this.group.remove(s.mesh); this.shots.splice(i, 1);
      }
    }
  }

  /* ---------- spawn ---------- */
  _spawnTick(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const g = this.g, w = g.world, pl = g.player;
    this.spawnT = g.difficulty === 2 ? 1.6 : 2.4;
    let pass = 0, host = 0;
    for (const m of this.mobs) { if (m.def.hostile) host++; else pass++; }
    // fredliga djur
    if (pass < 10) {
      const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 30;
      const x = Math.floor(pl.pos.x + Math.cos(a) * d), z = Math.floor(pl.pos.z + Math.sin(a) * d);
      const c = w.getChunk(x >> 4, z >> 4);
      if (c && c.data && c.light) {
        const y = w.topY(x, z);
        const top = w.get(x, y, z);
        if (y > 0 && (top === B.grass || top === B.snowgrass || top === B.peat || top === B.snow) && (w.light(x, y + 1, z) >> 4) >= 10) {
          const bio = c.biomes[((z & 15) << 4) | (x & 15)];
          const r = Math.random();
          let type;
          if (bio === BI.fjall) type = r < 0.6 ? 'sheep' : r < 0.85 ? 'cow' : 'chicken';
          else if (bio === BI.gran || bio === BI.myr || bio === BI.tall) type = r < 0.35 ? 'pig' : r < 0.65 ? 'chicken' : r < 0.85 ? 'cow' : 'sheep';
          else type = r < 0.3 ? 'cow' : r < 0.6 ? 'sheep' : r < 0.8 ? 'pig' : 'chicken';
          const herd = type === 'chicken' ? 1 + (Math.random() * 3 | 0) : type === 'pig' ? 2 + (Math.random() * 2 | 0) : 2 + (Math.random() * 3 | 0);
          for (let k = 0; k < herd; k++) {
            const hx = x + (Math.random() * 4 | 0) - 2, hz = z + (Math.random() * 4 | 0) - 2;
            const hy = w.topY(hx, hz);
            if (hy > 0 && !isWater(w.get(hx, hy + 1, hz)) && T_SOLID[Math.max(0, w.get(hx, hy, hz))]) this.spawnMob(type, hx + 0.5, hy + 1, hz + 0.5);
          }
        }
      }
    }
    // fientliga (bara i mörker: natt, grottor)
    // första natten är snällare (färre fiender) så att nybörjare hinner lära sig
    const cap = g.difficulty === 0 ? 0 : Math.round((g.difficulty === 2 ? 12 : 7) * (g.day <= 1 ? 0.5 : 1));
    if (host < cap && !pl.creative) {
      for (let tr = 0; tr < 4; tr++) {
        const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 22;
        const x = Math.floor(pl.pos.x + Math.cos(a) * d), z = Math.floor(pl.pos.z + Math.sin(a) * d);
        const c = w.getChunk(x >> 4, z >> 4); if (!c || !c.light) continue;
        const top = w.topY(x, z); if (top <= 0) continue;
        let y;
        const cave = Math.random() < 0.5;
        if (cave) {
          y = 6 + Math.floor(Math.random() * Math.max(1, top - 8));
          let ok = false;
          for (let k = 0; k < 16 && y > 4; k++, y--) { if (w.get(x, y, z) === 0 && w.get(x, y + 1, z) === 0 && T_SOLID[Math.max(0, w.get(x, y - 1, z))]) { ok = true; break; } }
          if (!ok) continue;
        } else y = top + 1;
        if (isWater(w.get(x, y, z)) || w.get(x, y, z) !== 0) continue;
        const L = w.light(x, y, z);
        const eff = Math.max((L >> 4) * g.sky.daylight, L & 15);
        if (eff >= 6) continue;
        if (Math.abs(y - pl.pos.y) > 24) continue;
        const r = Math.random();
        let type = r < 0.42 ? 'zombie' : r < 0.75 ? 'skeleton' : 'spider';
        if (type !== 'spider' && w.get(x, y + 1, z) !== 0) type = 'spider';
        const n = type === 'zombie' && Math.random() < 0.35 ? 2 : 1;
        for (let k = 0; k < n; k++) this.spawnMob(type, x + 0.5 + k * 0.6, y, z + 0.5);
        break;
      }
    }
    // avlägsna stön i natten
    this.howlT -= 1.2;
    if (this.howlT <= 0 && g.sky.daylight < 0.2) { this.howlT = 30 + Math.random() * 40; mobSound(g.audio, 'zombie', 'idle', { vol: 0.35, pan: Math.random() * 1.6 - 0.8 }); }
  }

  /* ---------- tänd TNT ---------- */
  primeTnt(x, y, z, fuse) {
    const mesh = new THREE.Mesh(blockGeo(B.tnt), this.g.mats.entity);
    const e = { pos: new THREE.Vector3(x + 0.5, y, z + 0.5), vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 3, (Math.random() - 0.5) * 1.5), fuse, mesh };
    const self = this;
    mesh.onBeforeRender = function (r, s, c, g, mat) { const L = self.g.world.light(Math.floor(e.pos.x), Math.floor(e.pos.y + 0.5), Math.floor(e.pos.z)); const fl = Math.sin(e.fuse * 14) > 0.3 ? 1 : 0; mat.uniforms.uEntLight.value.set(Math.max((L >> 4) / 15, fl), Math.max((L & 15) / 15, fl)); mat.uniformsNeedUpdate = true; };
    this.group.add(mesh);
    (this.tnts || (this.tnts = [])).push(e);
    try { this.g.audio.noise({ dur: 0.6, vol: 0.12, freq: 3000, type: 'highpass' }); } catch (er) { }
  }
  _updateTnt(dt) {
    if (!this.tnts || !this.tnts.length) return;
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const e = this.tnts[i];
      e.fuse -= dt;
      e.vel.y = Math.max(e.vel.y - 25 * dt, -30); e.vel.x *= Math.pow(0.1, dt); e.vel.z *= Math.pow(0.1, dt);
      moveBody(this.g.world, e.pos, e.vel, dt, { hw: 0.49, h: 0.98 });
      const sc = 1 + Math.max(0, 0.6 - e.fuse) * 0.25;
      e.mesh.position.set(e.pos.x, e.pos.y + 0.5, e.pos.z); e.mesh.scale.setScalar(sc);
      if (Math.random() < dt * 12) this.particle(e.pos.x, e.pos.y + 1.05, e.pos.z, 0, 1, 0, FIRE[2], 0.06, 0.4, -0.1, true);
      if (e.fuse <= 0) { this.group.remove(e.mesh); this.tnts.splice(i, 1); this.g.explode(tmpV.set(e.pos.x, e.pos.y + 0.5, e.pos.z).clone()); }
    }
  }

  update(dt) {
    this._updateTnt(dt);
    this._updateParticles(dt);
    this._updateDrops(dt);
    this._updateFalling(dt);
    this._updateMobs(dt);
    this._updateShots(dt);
    this._spawnTick(dt);
  }
  /** Fientliga varelser i närheten (för sömn) */
  hostileNear(p, r) { return this.mobs.some(m => !m.dead && m.def.hostile && !m.calm && m.pos.distanceTo(p) < r); }
  clearHostiles() { for (let i = this.mobs.length - 1; i >= 0; i--) if (this.mobs[i].def.hostile) this._removeMob(i); }
  /** Antal levande varelser per typ (för F3) */
  census() { const c = {}; for (const m of this.mobs) if (!m.dead) c[m.def.name] = (c[m.def.name] || 0) + 1; return Object.entries(c).map(([k, v]) => k + ' ' + v).join(', '); }
}

/** Frigör en lådmodells geometrier och material (delade glöd-/ögonmaterial lämnas kvar) */
function disposeModel(model) {
  model.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  model.mat.dispose();
}

/* ---------- vägsökning (A*) ---------- */
function passable(w, x, y, z) { const b = w.get(x, y, z); if (b < 0) return false; return !World.boxesOf(b); }
function standable(w, x, y, z, h) {
  for (let k = 0; k < h; k++) if (!passable(w, x, y + k, z)) return false;
  const below = w.get(x, y - 1, z);
  return below > 0 && (T_SOLID[below] || isWater(below));
}
export function findPath(w, from, to, h, maxN = 300) {
  const sx = Math.floor(from.x), sy = Math.floor(from.y + 0.01), sz = Math.floor(from.z);
  const tx = Math.floor(to.x), ty = Math.floor(to.y + 0.01), tz = Math.floor(to.z);
  if (Math.abs(tx - sx) + Math.abs(tz - sz) > 40) return null;
  const key = (x, y, z) => ((x - sx + 64) * 128 + (y)) * 128 + (z - sz + 64);
  const open = [{ x: sx, y: sy, z: sz, g: 0, f: 0, p: null }];
  const seen = new Map(); seen.set(key(sx, sy, sz), open[0]);
  let best = open[0], bestH = 1e9, n = 0;
  while (open.length && n < maxN) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    n++;
    const hh = Math.abs(c.x - tx) + Math.abs(c.z - tz) + Math.abs(c.y - ty) * 0.5;
    if (hh < bestH) { bestH = hh; best = c; }
    if (hh <= 1) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      let ny = null, cost = 1;
      if (standable(w, nx, c.y, nz, h)) ny = c.y;
      else if (standable(w, nx, c.y + 1, nz, h) && passable(w, c.x, c.y + h, c.z)) { ny = c.y + 1; cost = 1.6; }
      else for (let k = 1; k <= 3; k++) { if (!passable(w, nx, c.y - k + h - 1 + 1, nz) && k > 1) break; if (standable(w, nx, c.y - k, nz, h)) { ny = c.y - k; cost = 1 + k * 0.3; break; } }
      if (ny === null) continue;
      const k2 = key(nx, ny, nz);
      const gg = c.g + cost;
      const ex = seen.get(k2);
      if (ex && ex.g <= gg) continue;
      const node = { x: nx, y: ny, z: nz, g: gg, f: gg + Math.abs(nx - tx) + Math.abs(nz - tz) + Math.abs(ny - ty), p: c };
      seen.set(k2, node); open.push(node);
    }
  }
  if (!best || best === seen.get(key(sx, sy, sz))) return null;
  const path = []; let c = best; while (c && c.p) { path.push([c.x, c.y, c.z]); c = c.p; }
  path.reverse();
  return path;
}

function rayAabb(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  return tmin;
}
