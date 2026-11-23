// City layout — pure data, no three.js here so the headless checks in
// Node can load this module directly. A seeded RNG lays out a grid of
// streets, blocks of buildings, trees and street props. The layout is
// identical on every load.

import { makeRng } from './random.js';
import { WORLD, DISTRICTS } from './config.js';

const PALETTE = [
  0xe8b563, 0xd98a5f, 0xc96f4a, 0xe6d3a3, 0xb5c4a1,
  0x9fb8c8, 0xd9a441, 0xc25b4e, 0x7ba05b, 0xe0cfa8,
];

function roadLines() {
  const lines = [];
  for (let c = -WORLD.HALF; c <= WORLD.HALF; c += WORLD.ROAD_EVERY) lines.push(c);
  return lines;
}

export function buildCity(seed) {
  const rng = makeRng(seed === undefined ? WORLD.SEED : seed);
  const roads = roadLines();
  const halfRoad = WORLD.ROAD_WIDTH / 2;
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Buildings fill the blocks between roads. A block spans from one
  // road edge to the next; each block holds a small cluster of boxes.
  for (let bx = -WORLD.HALF; bx < WORLD.HALF; bx += WORLD.ROAD_EVERY) {
    for (let bz = -WORLD.HALF; bz < WORLD.HALF; bz += WORLD.ROAD_EVERY) {
      const innerX0 = bx + halfRoad + 14;
      const innerZ0 = bz + halfRoad + 14;
      const innerX1 = bx + WORLD.ROAD_EVERY - halfRoad - 14;
      const innerZ1 = bz + WORLD.ROAD_EVERY - halfRoad - 14;
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(26, 58);
        const d = rng.range(26, 58);
        const x = rng.range(innerX0 + w / 2, Math.max(innerX0 + w / 2 + 1, innerX1 - w / 2));
        const z = rng.range(innerZ0 + d / 2, Math.max(innerZ0 + d / 2 + 1, innerZ1 - d / 2));
        const h = rng.range(16, 74);
        buildings.push({
          x, z, w, d, h,
          color: rng.pick(PALETTE),
          roof: rng.pick([0x8a6f4d, 0x5d6b7a, 0x9c8464, 0x6e5a44]),
        });
      }
      // A couple of trees per block, on the block corners.
      for (let i = 0; i < 2; i += 1) {
        trees.push({
          x: rng.range(innerX0, innerX1),
          z: rng.range(innerZ0, innerZ1),
          s: rng.range(0.8, 1.5),
        });
      }
    }
  }

  // Street lamps along the roads, every 100 units, alternating sides.
  for (const line of roads) {
    for (let c = -WORLD.HALF + 50; c <= WORLD.HALF - 50; c += 100) {
      lamps.push({ x: line + halfRoad + 4, z: c });
      lamps.push({ x: c, z: line - halfRoad - 4 });
    }
  }

  // District markers: a small plaza disc at each named place.
  const districts = Object.entries(DISTRICTS).map(([key, d]) => ({
    key,
    x: d.x,
    z: d.z,
    label: d.label,
  }));

  return { roads, buildings, trees, lamps, districts };
}

// Axis-aligned building test: is the circle at (x, z) with radius r
// touching any building? The renderer uses this for shadows only;
// the world uses it to push the player and cars out of walls.
export function hitsBuilding(city, x, z, r) {
  for (const b of city.buildings) {
    const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
    if (dx * dx + dz * dz < r * r) return b;
  }
  return null;
}

// Push a circle out of a building. Returns the corrected position.
export function resolveBuilding(city, x, z, r) {
  const b = hitsBuilding(city, x, z, r);
  if (!b) return { x, z, hit: false };
  const dx = x - b.x;
  const dz = z - b.z;
  const px = b.w / 2 + r - Math.abs(dx);
  const pz = b.d / 2 + r - Math.abs(dz);
  if (px < pz) {
    return { x: b.x + (dx >= 0 ? b.w / 2 + r : -b.w / 2 - r), z, hit: true };
  }
  return { x, z: b.z + (dz >= 0 ? b.d / 2 + r : -b.d / 2 - r), hit: true };
}

// Snap a point to the nearest road line (for traffic and spawn logic).
export function nearestRoadCoord(v) {
  const step = WORLD.ROAD_EVERY;
  return Math.round(v / step) * step;
}

export function isOnRoad(x, z) {
  const halfRoad = WORLD.ROAD_WIDTH / 2;
  const mx = Math.abs(((x + WORLD.HALF) % WORLD.ROAD_EVERY) - WORLD.ROAD_EVERY / 2);
  const mz = Math.abs(((z + WORLD.HALF) % WORLD.ROAD_EVERY) - WORLD.ROAD_EVERY / 2);
  return mx < halfRoad + 4 || mz < halfRoad + 4;
}
