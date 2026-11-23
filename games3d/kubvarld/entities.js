/** Entiteter: föremål på marken, partiklar, fallande block, projektiler och varelser (AI + spawn). */
import * as THREE from 'three';
import { BLOCKS, B, I, CY, isWater, T_SOLID, itemName } from './blocks.js';
import { buildModel, extrudedGeo, blockGeo, isCubeItem } from './models.js';
import { moveBody, overlaps } from './physics.js';
import { World } from './world.js';
import { tileColorSample } from './textures.js';
import { mobSound, matSound } from './sfx.js';
import { BI } from './worldgen.js';

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpC = new THREE.Color();
const TORCH = new THREE.Color(1.0, 0.66, 0.36);

/** Ljusfärg (linjär) vid en punkt – samma kurva som terrängshadern */
export function lightColor(world, sky, x, y, z, out, minL = 0.03) {
  const L = world.light(Math.floor(x), Math.floor(y), Math.floor(z));
  const s = L >> 4, b = L & 15;
  const sf = s ? Math.pow(0.8, 15 - s) : 0, bf = b ? Math.pow(0.8, 15 - b) * 1.05 : 0;
  out.setRGB(Math.max(sky.r * sf, TORCH.r * bf, minL), Math.max(sky.g * sf, TORCH.g * bf, minL), Math.max(sky.b * sf, TORCH.b * bf, minL));
  return out;
}

export const MOBS = {
  sheep: { name: 'Tovfår', hp: 8, speed: 1.1, hostile: false, drops: [[B.wool_white, 1, 2], [I.meat, 1, 2]], xp: 1 },
  hare: { name: 'Fjällhare', hp: 4, speed: 1.4, run: 6.5, flee: 7, hostile: false, drops: [[I.meat, 1, 1]] },
  moose: { name: 'Älg', hp: 24, speed: 1.3, run: 4.2, hostile: false, retaliate: true, dmg: 5, reach: 1.9, kb: 10, drops: [[I.moose, 2, 3]] },
  wolf: { name: 'Skuggvarg', hp: 12, speed: 3.9, hostile: true, dmg: 3, reach: 1.5, kb: 6, drops: [[I.shadowfur, 0, 2]], sunburn: true, detect: 18 },
  giant: { name: 'Mossbjässe', hp: 36, speed: 1.7, hostile: true, dmg: 7, reach: 2.3, kb: 13, drops: [[I.moss, 1, 3], [I.iron_ingot, 0, 1, 0.3]], detect: 16, heavy: true },
  ghost: { name: 'Lyktgast', hp: 10, speed: 3, hostile: true, flying: true, ranged: true, dmg: 3, drops: [[I.glowdust, 1, 2]], sunburn: true, detect: 22 }
};

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
    this.shotGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    this.shotMat = new THREE.MeshBasicMaterial({ color: 0xc8ff9a });
  }

  dispose() {
    this.scene.remove(this.group);
    this.pMesh.geometry.dispose(); this.pMesh.material.dispose(); this.pMesh.dispose();
    this.shotGeo.dispose(); this.shotMat.dispose(); this.itemMat.dispose();
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
    const def = MOBS[type];
    const modelType = { sheep: 'sheep', hare: 'hare', moose: 'moose', wolf: 'wolf', giant: 'giant', ghost: 'ghost' }[type];
    const model = buildModel(modelType);
    const m = {
      type, def, model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw: Math.random() * Math.PI * 2, tyaw: 0,
      hp: def.hp * (def.hostile ? this.g.diffHp() : 1), ground: false, walk: 0, wander: 0, dir: new THREE.Vector2(), moving: false,
      hurtT: 0, dead: false, deathT: 0, atkCd: 1, angryT: 0, fleeT: 0, path: null, pathT: 0, pi: 0, shotCd: 2 + Math.random() * 2,
      hw: model.width / 2, h: model.height, light: new THREE.Color(1, 1, 1), soundT: 4 + Math.random() * 10, burn: 0, stuckT: 0, lastPos: new THREE.Vector3(x, y, z), fade: 0
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
      if (m.def.hostile) this.g.log('Du besegrade en ' + m.def.name.toLowerCase() + '.');
    }
  }
  _vol(m) { const d = m.pos.distanceTo(this.g.player.pos); const p = this.g.player; const ang = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z); return { vol: Math.max(0, 1 - d / 28), pan: Math.max(-1, Math.min(1, Math.sin(ang - p.yaw - Math.PI) * 0.8)) }; }

  /** Spelaren slår en varelse */
  hitMob(m, dmg, dir) {
    if (m.dead || m.hurtT > 0.35) return false;
    m.hp -= dmg; m.hurtT = 0.5;
    const kb = m.def.heavy ? 2.5 : 6;
    m.vel.x += dir.x * kb; m.vel.z += dir.z * kb; if (!m.def.flying) m.vel.y = Math.max(m.vel.y, m.def.heavy ? 2 : 5);
    mobSound(this.g.audio, m.type, 'hurt', this._vol(m));
    this.puff(m.pos.x, m.pos.y + m.h * 0.6, m.pos.z, m.def.hostile ? '#5a3a7a' : '#c84040', 6, 0.4);
    if (m.def.retaliate) m.angryT = 20;
    if (!m.def.hostile && !m.def.retaliate) m.fleeT = 5;
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

  _updateMobs(dt) {
    const g = this.g, w = g.world, pl = g.player;
    const day = g.sky.daylight;
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
        if (m.deathT > 0.9) { this.puff(m.pos.x, m.pos.y + m.h * 0.4, m.pos.z, md.hostile ? '#3a2a4a' : '#dddddd', 14, m.hw * 2); this._removeMob(i); }
        continue;
      }
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.atkCd = Math.max(0, m.atkCd - dt);
      m.angryT = Math.max(0, m.angryT - dt);
      m.fleeT = Math.max(0, m.fleeT - dt);
      // solen bränner nattvarelser
      if (md.sunburn && day > 0.55) {
        const L = w.light(Math.floor(m.pos.x), Math.floor(m.pos.y + m.h * 0.7), Math.floor(m.pos.z));
        if ((L >> 4) >= 12) {
          m.burn += dt;
          if (Math.random() < dt * 20) this.puff(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z, '#2a2238', 1, m.hw * 2);
          if (m.burn > 0.6) { m.hp -= 6 * dt; if (m.hp <= 0) { this._killMob(m, false); continue; } }
        }
      }
      // --- AI ---
      let tx = 0, tz = 0, speed = md.speed, wantJump = false, fly = 0;
      const canTarget = pl.alive && !pl.creative && dpl < (md.detect || 16) * (pl.sneaking ? 0.6 : 1);
      if (md.hostile && canTarget) {
        if (md.flying) {
          // håll avstånd, sväva ovanför
          const dx = m.pos.x - pl.pos.x, dz = m.pos.z - pl.pos.z, hd = Math.hypot(dx, dz) || 1;
          const want = 7;
          const gx = pl.pos.x + dx / hd * want, gz = pl.pos.z + dz / hd * want, gy = pl.pos.y + 3.2 + Math.sin(g.time * 1.3 + i) * 0.6;
          tx = gx - m.pos.x; tz = gz - m.pos.z; fly = gy - m.pos.y;
          const l = Math.hypot(tx, tz); if (l > 0.01) { tx /= l; tz /= l; } speed = md.speed * Math.min(1, l / 2);
          m.tyaw = Math.atan2(-dx, -dz);
          m.shotCd -= dt;
          if (m.shotCd <= 0 && dpl < 20) {
            m.shotCd = 2.6 + Math.random() * 1.5;
            const eye = tmpV.set(pl.pos.x, pl.pos.y + 1.4, pl.pos.z);
            const from = tmpV2.set(m.pos.x, m.pos.y + 1.1, m.pos.z);
            const dir = eye.clone().sub(from);
            const dist = dir.length(); dir.normalize();
            const hit = w.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, dist, {});
            if (!hit) this._shoot(from, dir);
          }
        } else {
          // väg mot spelaren
          m.pathT -= dt;
          const needPath = m.pathT <= 0;
          if (needPath) {
            m.pathT = 0.8 + Math.random() * 0.5;
            m.path = findPath(w, m.pos, pl.pos, Math.ceil(m.h), 350);
            m.pi = 0;
          }
          let gx = pl.pos.x, gz = pl.pos.z;
          if (m.path && m.pi < m.path.length) {
            const n = m.path[m.pi];
            gx = n[0] + 0.5; gz = n[2] + 0.5;
            if (Math.hypot(gx - m.pos.x, gz - m.pos.z) < 0.45) m.pi++;
            if (n[1] > Math.floor(m.pos.y + 0.1)) wantJump = true;
          }
          tx = gx - m.pos.x; tz = gz - m.pos.z;
          const l = Math.hypot(tx, tz); if (l > 0.01) { tx /= l; tz /= l; }
          m.tyaw = Math.atan2(tx, tz);
          // utfall för vargen
          if (m.type === 'wolf' && m.ground && dpl > 2.5 && dpl < 5 && m.atkCd <= 0 && Math.random() < dt * 2) { m.vel.y = 7; m.vel.x = tx * 9; m.vel.z = tz * 9; }
          // anfall
          const reach = (md.reach || 1.4) + 0.3;
          const hdist = Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
          if (hdist < reach && Math.abs(pl.pos.y - m.pos.y) < Math.max(1.6, m.h * 0.8) && m.atkCd <= 0) {
            m.atkCd = m.type === 'giant' ? 1.6 : 1.0;
            m.swing = 0.4;
            g.damagePlayer(md.dmg * g.diffDmg(), tmpV.set(pl.pos.x - m.pos.x, 0, pl.pos.z - m.pos.z).normalize(), md.kb || 6, md.name);
            mobSound(g.audio, m.type, 'attack', this._vol(m));
          }
          if (hdist < reach * 0.7) { tx = 0; tz = 0; }
          if (hdist < m.hw + 0.35 && hdist > 0.001) { const k2 = (m.hw + 0.35 - hdist) / hdist; m.pos.x -= (pl.pos.x - m.pos.x) * k2 * 0.5; m.pos.z -= (pl.pos.z - m.pos.z) * k2 * 0.5; }
        }
      } else if (md.retaliate && m.angryT > 0 && pl.alive && !pl.creative) {
        tx = pl.pos.x - m.pos.x; tz = pl.pos.z - m.pos.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; speed = md.run;
        m.tyaw = Math.atan2(tx, tz);
        if (l < md.reach + 0.4 && m.atkCd <= 0) { m.atkCd = 1.3; m.swing = 0.4; g.damagePlayer(md.dmg * g.diffDmg(), tmpV.set(tx, 0, tz), md.kb, md.name); }
      } else if ((md.flee && dpl < md.flee && !pl.sneaking) || m.fleeT > 0) {
        tx = m.pos.x - pl.pos.x; tz = m.pos.z - pl.pos.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; speed = md.run || md.speed * 2.2;
        m.tyaw = Math.atan2(tx, tz);
      } else {
        // vandra
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 2 + Math.random() * 5;
          if (Math.random() < 0.55) { const a = Math.random() * Math.PI * 2; m.dir.set(Math.sin(a), Math.cos(a)); m.moving = true; } else m.moving = false;
        }
        if (m.moving) {
          tx = m.dir.x; tz = m.dir.y; m.tyaw = Math.atan2(tx, tz);
          // undvik stup och vatten
          const ax = Math.floor(m.pos.x + tx * (m.hw + 0.6)), az = Math.floor(m.pos.z + tz * (m.hw + 0.6)), ay = Math.floor(m.pos.y);
          let drop = 0; while (drop < 4 && !T_SOLID[Math.max(0, w.get(ax, ay - 1 - drop, az))]) drop++;
          if (drop >= 3 || isWater(w.get(ax, ay, az)) || isWater(w.get(ax, ay - 1, az))) { m.wander = 0.1; tx = tz = 0; m.moving = false; }
        }
        if (md.flying) fly = Math.sin(g.time + i) * 0.5;
        m.soundT -= dt;
        if (m.soundT <= 0) { m.soundT = 6 + Math.random() * 14; mobSound(g.audio, m.type, 'idle', this._vol(m)); }
      }
      if (md.hostile && canTarget) {
        m.soundT -= dt;
        if (m.soundT <= 0) { m.soundT = 4 + Math.random() * 6; mobSound(g.audio, m.type, 'idle', this._vol(m)); }
      }
      // --- fysik ---
      const inW = isWater(w.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z)));
      const acc = m.ground || md.flying ? 10 : 2;
      const k = 1 - Math.exp(-acc * dt);
      m.vel.x += (tx * speed - m.vel.x) * k;
      m.vel.z += (tz * speed - m.vel.z) * k;
      if (md.flying) { m.vel.y += (fly * 2 - m.vel.y) * (1 - Math.exp(-3 * dt)); }
      else if (inW) { m.vel.y = Math.min(m.vel.y + 22 * dt, 2.2); }
      else m.vel.y = Math.max(m.vel.y - 28 * dt, -40);
      const r = moveBody(w, m.pos, m.vel, dt, { hw: Math.min(m.hw, 0.45), h: Math.min(m.h, 2.8), stepUp: 0.55, grounded: m.ground });
      m.ground = r.ground;
      if ((r.hitX || r.hitZ) && (m.ground || inW) && (tx || tz)) wantJump = true;
      if (wantJump && m.ground && !md.flying) m.vel.y = md.heavy ? 9 : 8.5;
      // fastnat?
      m.stuckT += dt;
      if (m.stuckT > 1) { if (m.pos.distanceTo(m.lastPos) < 0.3 && (tx || tz)) { m.wander = 0; m.pathT = 0; m.dir.set(-m.dir.x, -m.dir.y); } m.stuckT = 0; m.lastPos.copy(m.pos); }
      // --- animation ---
      let dy = m.tyaw - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * (1 - Math.exp(-8 * dt));
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.walk += hs * dt * (m.type === 'hare' ? 3 : 2.2);
      this._animate(m, hs, dt);
      lightColor(w, g.sky.skyLight, m.pos.x, m.pos.y + m.h * 0.6, m.pos.z, m.light, 0.04);
      if (m.hurtT > 0.25) m.model.mat.color.setRGB(1, 0.3, 0.3);
      else m.model.mat.color.copy(m.light);
    }
  }
  _animate(m, hs, dt) {
    const P = m.model.parts, root = m.model.root;
    root.position.copy(m.pos); root.rotation.y = m.yaw;
    const sw = Math.sin(m.walk) * Math.min(1, hs * 0.6) * 0.8;
    if (P.legs) { P.legs[0].rotation.x = sw; P.legs[3].rotation.x = sw; P.legs[1].rotation.x = -sw; P.legs[2].rotation.x = -sw; }
    if (P.legL) { P.legL.rotation.x = sw; P.legR.rotation.x = -sw; }
    if (m.swing > 0) m.swing -= dt;
    const atk = m.swing > 0 ? Math.sin((0.4 - m.swing) / 0.4 * Math.PI) : 0;
    if (P.armL) { P.armL.rotation.x = -sw * 0.8 - atk * 1.8; P.armR.rotation.x = sw * 0.8 - atk * 1.8; }
    if (P.head && m.type !== 'giant') P.head.rotation.x = m.type === 'sheep' && !m.moving && hs < 0.2 ? 0.5 + Math.sin(m.walk * 0.3 + performance.now() * 0.002) * 0.1 : -atk * 0.6;
    if (P.tail) P.tail.rotation.y = Math.sin(performance.now() * 0.006) * 0.4;
    if (P.earL) { P.earL.rotation.x = -0.2 + Math.sin(performance.now() * 0.004) * 0.1; P.earR.rotation.x = -0.2 + Math.cos(performance.now() * 0.005) * 0.1; }
    if (m.model.ghost) {
      const t = performance.now() * 0.001;
      P.t1.rotation.z = Math.sin(t * 2) * 0.2; P.t2.rotation.z = Math.sin(t * 2 + 1) * 0.3; P.t3.rotation.z = Math.sin(t * 2 + 2) * 0.4;
      P.core.scale.setScalar(1 + Math.sin(t * 5) * 0.1);
    }
    if (m.type === 'hare' && hs > 0.5) root.position.y += Math.abs(Math.sin(m.walk)) * 0.15;
  }
  _removeMob(i) { const m = this.mobs[i]; this.group.remove(m.model.root); disposeModel(m.model); this.mobs.splice(i, 1); }

  _shoot(from, dir) {
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.shots.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(10), life: 5, mesh });
    this.g.audio.play('zap', { vol: 0.5 * Math.max(0.2, 1 - from.distanceTo(this.g.player.pos) / 25) });
  }
  _updateShots(dt) {
    const pl = this.g.player, w = this.g.world;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt; s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos); s.mesh.rotation.x += dt * 6; s.mesh.rotation.y += dt * 4;
      if (Math.random() < 0.6) this.particle(s.pos.x, s.pos.y, s.pos.z, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, new THREE.Color('#b8ff8a'), 0.07, 0.4, -0.1, true);
      let hit = false;
      if (pl.alive && Math.abs(s.pos.x - pl.pos.x) < 0.5 && Math.abs(s.pos.z - pl.pos.z) < 0.5 && s.pos.y > pl.pos.y && s.pos.y < pl.pos.y + 1.85) {
        this.g.damagePlayer(MOBS.ghost.dmg * this.g.diffDmg(), tmpV.copy(s.vel).setY(0).normalize(), 5, 'Lyktgast');
        hit = true;
      }
      const b = w.get(Math.floor(s.pos.x), Math.floor(s.pos.y), Math.floor(s.pos.z));
      if (hit || (b > 0 && T_SOLID[b]) || s.life <= 0) {
        this.puff(s.pos.x, s.pos.y, s.pos.z, '#c8ff9a', 10, 0.3, true);
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
    if (pass < 9) {
      const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 30;
      const x = Math.floor(pl.pos.x + Math.cos(a) * d), z = Math.floor(pl.pos.z + Math.sin(a) * d);
      const c = w.getChunk(x >> 4, z >> 4);
      if (c && c.data && c.light) {
        const y = w.topY(x, z);
        const top = w.get(x, y, z);
        if (y > 0 && (top === B.grass || top === B.snowgrass || top === B.peat || top === B.snow) && (w.light(x, y + 1, z) >> 4) >= 10) {
          const bio = c.biomes[((z & 15) << 4) | (x & 15)];
          let type = 'sheep', herd = 2 + (Math.random() * 3 | 0);
          if (bio === BI.fjall) { type = Math.random() < 0.6 ? 'hare' : 'moose'; herd = type === 'hare' ? 1 + (Math.random() * 2 | 0) : 1; }
          else if (bio === BI.gran || bio === BI.myr || bio === BI.tall) { const r = Math.random(); type = r < 0.4 ? 'moose' : r < 0.75 ? 'hare' : 'sheep'; herd = type === 'moose' ? 1 + (Math.random() < 0.3 ? 1 : 0) : type === 'hare' ? 1 + (Math.random() * 2 | 0) : 2; }
          else if (bio === BI.bjork) { type = Math.random() < 0.6 ? 'sheep' : Math.random() < 0.5 ? 'hare' : 'moose'; herd = type === 'sheep' ? 2 + (Math.random() * 2 | 0) : 1; }
          for (let k = 0; k < herd; k++) {
            const hx = x + (Math.random() * 4 | 0) - 2, hz = z + (Math.random() * 4 | 0) - 2;
            const hy = w.topY(hx, hz);
            if (hy > 0 && !isWater(w.get(hx, hy + 1, hz)) && T_SOLID[Math.max(0, w.get(hx, hy, hz))]) this.spawnMob(type, hx + 0.5, hy + 1, hz + 0.5);
          }
        }
      }
    }
    // fientliga
    // första natten är snällare (färre fiender) så att nybörjare hinner lära sig
    const cap = g.difficulty === 0 ? 0 : Math.round((g.difficulty === 2 ? 12 : 6) * (g.day <= 1 ? 0.5 : 1));
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
        let type;
        const r = Math.random();
        const bio = c.biomes[((z & 15) << 4) | (x & 15)];
        if (y < top - 4) type = r < 0.45 ? 'giant' : r < 0.85 ? 'wolf' : 'ghost';
        else type = r < 0.5 ? 'wolf' : r < 0.75 ? 'ghost' : (bio === BI.gran || bio === BI.bjork || bio === BI.myr ? 'giant' : 'wolf');
        if (type === 'giant' && (w.get(x, y + 2, z) !== 0)) type = 'wolf';
        const n = type === 'wolf' && Math.random() < 0.5 ? 2 : 1;
        for (let k = 0; k < n; k++) this.spawnMob(type, x + 0.5 + k * 0.6, y + (type === 'ghost' ? 1 : 0), z + 0.5);
        break;
      }
    }
    // ylande om natten
    this.howlT -= 1.2;
    if (this.howlT <= 0 && g.sky.daylight < 0.2) { this.howlT = 25 + Math.random() * 40; mobSound(g.audio, 'wolf', 'howl', { vol: 0.5, pan: Math.random() * 1.6 - 0.8 }); }
  }

  update(dt) {
    this._updateParticles(dt);
    this._updateDrops(dt);
    this._updateFalling(dt);
    this._updateMobs(dt);
    this._updateShots(dt);
    this._spawnTick(dt);
  }
  /** Skuggvarelser i närheten (för sömn) */
  hostileNear(p, r) { return this.mobs.some(m => !m.dead && m.def.hostile && m.pos.distanceTo(p) < r); }
  clearHostiles() { for (let i = this.mobs.length - 1; i >= 0; i--) if (this.mobs[i].def.hostile) this._removeMob(i); }
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
