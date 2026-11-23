/** AABB-rörelse mot blockvärlden. */
import { World } from './world.js';
import { isWater } from './blocks.js';

const EPS = 1e-4;
const UNLOADED = [[0, 0, 0, 1, 1, 1]];

function boxes(world, x, y, z) {
  const b = world.get(x, y, z);
  if (b < 0) return UNLOADED;
  return World.boxesOf(b);
}

/** Kolliderar AABB (center x,z; fötter y; halvbredd hw; höjd h) mot block. Returnerar true om något överlappar. */
export function overlaps(world, px, py, pz, hw, h) {
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw - EPS), y0 = Math.floor(py), y1 = Math.floor(py + h - EPS), z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw - EPS);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const bs = boxes(world, x, y, z); if (!bs) continue;
    for (const b of bs) {
      if (px + hw > x + b[0] + EPS && px - hw < x + b[3] - EPS && py + h > y + b[1] + EPS && py < y + b[4] - EPS && pz + hw > z + b[2] + EPS && pz - hw < z + b[5] - EPS) return true;
    }
  }
  return false;
}

/**
 * Flytta kroppen (pos: Vector3, vel: Vector3) dt sekunder. opts: { hw, h, stepUp (0..0.6), sneak }
 * Returnerar { ground, hitX, hitZ, hitY }
 */
export function moveBody(world, pos, vel, dt, opts) {
  const hw = opts.hw, h = opts.h;
  const res = { ground: false, hitX: false, hitZ: false, hitY: false, ceil: false };
  // y
  let dy = vel.y * dt;
  if (dy !== 0) {
    const ny = sweepAxis(world, pos, 1, dy, hw, h);
    if (ny !== null) { if (dy < 0) res.ground = true; else res.ceil = true; res.hitY = true; vel.y = 0; }
  }
  const wasGround = res.ground || opts.grounded;
  // x och z
  for (const ax of [0, 2]) {
    const d = (ax === 0 ? vel.x : vel.z) * dt;
    if (d === 0) continue;
    const before = ax === 0 ? pos.x : pos.z;
    const hit = sweepAxis(world, pos, ax, d, hw, h);
    if (hit !== null) {
      // trappsteg (plattor, sängar)
      if (opts.stepUp && wasGround) {
        const save = ax === 0 ? pos.x : pos.z;
        if (ax === 0) pos.x = before; else pos.z = before;
        const oy = pos.y;
        pos.y += opts.stepUp;
        if (!overlaps(world, pos.x, pos.y, pos.z, hw, h)) {
          const hit2 = sweepAxis(world, pos, ax, d, hw, h);
          if (hit2 === null) {
            // sänk ned
            sweepAxis(world, pos, 1, -opts.stepUp, hw, h);
            res.stepped = true;
            continue;
          }
        }
        pos.y = oy; if (ax === 0) pos.x = save; else pos.z = save;
      }
      if (ax === 0) { res.hitX = true; vel.x = 0; } else { res.hitZ = true; vel.z = 0; }
    } else if (opts.sneak && wasGround) {
      // gå inte över kanter när man smyger
      if (!overlaps(world, pos.x, pos.y - 0.6, pos.z, hw, 0.58)) {
        if (ax === 0) { pos.x = before; vel.x = 0; } else { pos.z = before; vel.z = 0; }
      }
    }
  }
  return res;
}

/** Flytta längs en axel; returnerar null om fritt annars den klämda positionen */
function sweepAxis(world, pos, ax, d, hw, h) {
  const comp = ax === 0 ? 'x' : ax === 1 ? 'y' : 'z';
  // dela upp stora steg
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.45));
  const sd = d / steps;
  for (let s = 0; s < steps; s++) {
    pos[comp] += sd;
    const px = pos.x, py = pos.y, pz = pos.z;
    const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw - EPS), y0 = Math.floor(py), y1 = Math.floor(py + h - EPS), z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw - EPS);
    let clamp = null;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const bs = boxes(world, x, y, z); if (!bs) continue;
      for (const b of bs) {
        const bx0 = x + b[0], bx1 = x + b[3], by0 = y + b[1], by1 = y + b[4], bz0 = z + b[2], bz1 = z + b[5];
        if (px + hw > bx0 + EPS && px - hw < bx1 - EPS && py + h > by0 + EPS && py < by1 - EPS && pz + hw > bz0 + EPS && pz - hw < bz1 - EPS) {
          let v;
          if (ax === 0) v = sd > 0 ? bx0 - hw - EPS : bx1 + hw + EPS;
          else if (ax === 1) v = sd > 0 ? by0 - h - EPS : by1 + EPS;
          else v = sd > 0 ? bz0 - hw - EPS : bz1 + hw + EPS;
          if (clamp === null || (sd > 0 ? v < clamp : v > clamp)) clamp = v;
        }
      }
    }
    if (clamp !== null) { pos[comp] = clamp; return clamp; }
  }
  return null;
}

/** Är kroppen i vatten? Returnerar andel 0..1 (fötter → huvud) ungefärligt */
export function waterAt(world, x, y, z) { const b = world.get(Math.floor(x), Math.floor(y), Math.floor(z)); return b > 0 && isWater(b); }
