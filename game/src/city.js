// The city itself: the road grid, the blocks between the roads, the buildings and parks
// and trees in them, and the route data the simulation drives on. Everything comes from
// the seed, so the same seed builds the same city. Coordinates: x east, z south, y up,
// the city centred on the origin.

import { CITY, PALETTE } from './config.js';
import { pick } from './random.js';

/** Every road centre line, from -HALF to +HALF. */
export function roadLines() {
  const lines = [];
  for (let c = -CITY.half; c <= CITY.half; c += CITY.roadGap) lines.push(c);
  return lines;
}

/** Is (x, z) on asphalt — on a road, not on a sidewalk? */
export function onRoad(x, z) {
  const half = CITY.roadWidth / 2;
  for (let c = -CITY.half; c <= CITY.half; c += CITY.roadGap) {
    if (Math.abs(x - c) <= half || Math.abs(z - c) <= half) return true;
  }
  return false;
}

/** The road centre line nearest to a coordinate. */
export function nearestRoadLine(v) {
  const lines = roadLines();
  let best = lines[0];
  for (const c of lines) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

/** Keep a point inside the city, `margin` units from the edge. */
export function clampCity(x, z, margin) {
  const m = CITY.half - margin;
  return [Math.max(-m, Math.min(m, x)), Math.max(-m, Math.min(m, z))];
}

/**
 * A circle (x, z, r) against an axis-aligned box: the push-out that separates them,
 * or null when they do not touch.
 */
export function circleVsBox(x, z, r, box) {
  const cx = Math.max(box.x0, Math.min(x, box.x1));
  const cz = Math.max(box.z0, Math.min(z, box.z1));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    return [(dx / d) * (r - d), (dz / d) * (r - d)];
  }
  // The centre is inside the box: push out along the least-penetrating side.
  const pl = x - box.x0 + r;
  const pr = box.x1 - x + r;
  const pt = z - box.z0 + r;
  const pb = box.z1 - z + r;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return [-pl, 0];
  if (m === pr) return [pr, 0];
  if (m === pt) return [0, -pt];
  return [0, pb];
}

/**
 * Lay out the city. Returns the roads, the buildings (with the footprint boxes the
 * simulation collides with), the parks, the trees, and the intersections traffic
 * drives between.
 */
export function buildCity(random) {
  const lines = roadLines();
  const buildings = [];
  const boxes = [];
  const parks = [];
  const trees = [];
  const intersections = [];
  for (const x of lines) for (const z of lines) intersections.push({ x, z });

  const m = CITY.blockMargin;
  const gap = CITY.roadGap;
  const halfRoad = CITY.roadWidth / 2;
  for (let ix = 0; ix < lines.length - 1; ix += 1) {
    for (let iz = 0; iz < lines.length - 1; iz += 1) {
      const x0 = lines[ix] + halfRoad + m;
      const x1 = lines[ix + 1] - halfRoad - m;
      const z0 = lines[iz] + halfRoad + m;
      const z1 = lines[iz + 1] - halfRoad - m;
      if (x1 - x0 < 30 || z1 - z0 < 30) continue;
      // Some blocks are parks rather than buildings.
      if (random() < 0.14) {
        parks.push({ x0, x1, z0, z1 });
        const n = 3 + Math.floor(random() * 4);
        for (let t = 0; t < n; t += 1) {
          trees.push({
            x: x0 + 8 + random() * (x1 - x0 - 16),
            z: z0 + 8 + random() * (z1 - z0 - 16),
            s: 0.8 + random() * 0.9,
          });
        }
        continue;
      }
      const count = random() < 0.55 ? 1 : 2;
      for (let b = 0; b < count; b += 1) {
        const w = 26 + random() * 34;
        const d = 26 + random() * 34;
        const bx0 = x0 + random() * Math.max(1, x1 - x0 - w);
        const bz0 = z0 + random() * Math.max(1, z1 - z0 - d);
        const h = 14 + random() * random() * 66;
        const color = pick(random, PALETTE.building);
        const building = { x0: bx0, x1: bx0 + w, z0: bz0, z1: bz0 + d, h, color };
        buildings.push(building);
        boxes.push(building);
      }
    }
  }
  return { lines, buildings, boxes, parks, trees, intersections };
}

/** A random point on a road — where cars and the player spawn. */
export function randomRoadPoint(random, intersections) {
  const a = pick(random, intersections);
  const b = pick(random, intersections);
  const t = random();
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** A random sidewalk point beside a road — where pedestrians spawn. */
export function randomSidewalkPoint(random) {
  const lines = roadLines();
  const c = pick(random, lines);
  const along = (random() * 2 - 1) * (CITY.half - 20);
  const off = CITY.roadWidth / 2 + 4 + random() * 3;
  let pt;
  if (random() < 0.5) pt = { x: c + (random() < 0.5 ? off : -off), z: along };
  else pt = { x: along, z: c + (random() < 0.5 ? off : -off) };
  // The outermost road's outer sidewalk sits past the edge the player is clamped to
  // (±796), so a marker there could never be reached: keep the point inside the
  // reachable square, where a player on foot can always close to within 4 units.
  const reach = CITY.half - 20;
  pt.x = Math.max(-reach, Math.min(reach, pt.x));
  pt.z = Math.max(-reach, Math.min(reach, pt.z));
  return pt;
}

/** The intersection closest to a point. */
export function nearestIntersection(x, z, intersections) {
  let best = intersections[0];
  let bd = Infinity;
  for (const p of intersections) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** The intersections one road gap away from `p`, up/down/left/right. */
export function adjacentIntersections(p, intersections) {
  const out = [];
  for (const q of intersections) {
    const dx = Math.abs(q.x - p.x);
    const dz = Math.abs(q.z - p.z);
    if ((dx === CITY.roadGap && dz === 0) || (dz === CITY.roadGap && dx === 0)) out.push(q);
  }
  return out;
}
