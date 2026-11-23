// The game's rules and state, with no drawing and no browser in it: the player on foot
// and in a car, traffic, pedestrians, police, the wanted level, ten missions, combat and
// particles. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react without the world knowing about screens or sound. Nothing here
// allocates after createWorld runs.

import {
  CAR, CITY, GARAGE, HELI, MISSIONS, PED, PISTOL, PLAYER, POLICE, POOLS, RESPECT,
  ROADBLOCK, STEP, TRAFFIC, WANTED,
} from './config.js';
import {
  adjacentIntersections, buildCity, circleVsBox, clampCity, nearestIntersection,
  nearestRoadLine, randomRoadPoint, randomSidewalkPoint,
} from './city.js';
import { pick } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_BUSTED = 4;
export const EVENT_MISSION = 8;
export const EVENT_CRASH = 16;
export const EVENT_SHOT = 32;
export const EVENT_CASH = 64;
export const EVENT_STEAL = 128;

const TAU = Math.PI * 2;

/** Shortest signed turn from angle b to angle a, in (-PI, PI]. */
function turnDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function createWorld(random) {
  const city = buildCity(random);
  const intersections = city.intersections;
  const garageSpot = chooseGarageSpot();

  const player = {
    x: 0, z: 0, angle: 0, speed: 0, health: PLAYER.health, money: 0,
    inCar: null, hasPistol: false, invulnerable: 0, lastHurtAt: -99,
    punchCooldown: 0, shootCooldown: 0, bustTimer: 0, moving: false,
  };

  const cars = [];
  for (let i = 0; i < POOLS.cars; i += 1) {
    cars.push({
      active: false, x: 0, z: 0, angle: 0, speed: 0, color: 0x888888,
      isPolice: false, isPlayer: false, target: null, stopped: 0, honk: 0, blocked: false,
    });
  }
  const peds = [];
  for (let i = 0; i < POOLS.peds; i += 1) {
    peds.push({
      active: false, x: 0, z: 0, angle: 0, speed: 0, target: null,
      fleeing: false, fleeX: 0, fleeZ: 0, color: 0x888888, walkPhase: random() * TAU,
    });
  }
  const cops = [];
  for (let i = 0; i < POOLS.cops; i += 1) {
    cops.push({ active: false, x: 0, z: 0, angle: 0, speed: 0 });
  }
  const particles = [];
  for (let i = 0; i < POOLS.particles; i += 1) {
    particles.push({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1, color: 0xffa030, size: 1,
    });
  }

  const state = {
    player, cars, peds, cops, particles, city,
    wantedHeat: 0, lastCrimeAt: -99,
    missionIndex: 0, missionStage: 0, missionMarker: { x: 0, z: 0 },
    missionBanner: '', bannerTimer: 0,
    elapsed: 0, gameOver: false, busted: false, shake: 0,
    stats: { stolen: 0, delivered: 0, respect: 0 },
    // Air support: a single helicopter, hovering ahead of the player at 3+ stars.
    heli: { active: false, x: 0, z: 0, y: HELI.hoverHeight, angle: 0, rotor: 0 },
    // Roadblocks: two blocks of two parked police cars across the road ahead.
    roadblocks: [
      { active: false, x: 0, z: 0, angle: 0, carA: null, carB: null },
      { active: false, x: 0, z: 0, angle: 0, carA: null, carB: null },
    ],
    // The garage: a roadside bay that fixes the car up and pays out.
    garage: garageSpot,
    garageCooldown: 0,
    respectLevel: 0,
  };

  /** Current wanted stars, 0..5. */
  function stars() {
    return Math.min(WANTED.maxStars, Math.floor(state.wantedHeat / WANTED.perStar));
  }

  function addHeat(amount) {
    state.wantedHeat = Math.min(WANTED.perStar * WANTED.maxStars, state.wantedHeat + amount);
    state.lastCrimeAt = state.elapsed;
  }

  function nextFreeCar() {
    for (const c of cars) if (!c.active) return c;
    return null;
  }
  function nextFreePed() {
    for (const p of peds) if (!p.active) return p;
    return null;
  }
  function nextFreeCop() {
    for (const c of cops) if (!c.active) return c;
    return null;
  }
  function nextFreeParticle() {
    for (const p of particles) if (!p.active) return p;
    return null;
  }

  /** A burst of particles at (x, y, z), drifting outward and upward. */
  function spawnBurst(x, y, z, color, count, speed, up) {
    for (let i = 0; i < count; i += 1) {
      const p = nextFreeParticle();
      if (p === null) return;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = (up || 0) * (0.5 + random());
      p.maxLife = 0.5 + random() * 0.7;
      p.life = p.maxLife;
      p.color = color;
      p.size = 0.5 + random() * 0.9;
    }
  }

  /** Push a point out of every building it overlaps, and return the corrected point. */
  function pushOutOfBuildings(x, z, r) {
    for (const box of city.boxes) {
      if (x < box.x0 - r || x > box.x1 + r || z < box.z0 - r || z > box.z1 + r) continue;
      const push = circleVsBox(x, z, r, box);
      if (push) {
        x += push[0];
        z += push[1];
      }
    }
    return [x, z];
  }

  function spawnTrafficCar() {
    const car = nextFreeCar();
    if (car === null) return;
    const pt = randomRoadPoint(random, intersections);
    car.active = true;
    car.isPolice = false;
    car.isPlayer = false;
    car.x = pt.x;
    car.z = pt.z;
    car.angle = pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    car.speed = TRAFFIC.speed * (0.8 + random() * 0.4);
    car.color = pick(random, [0xc0392b, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xd35400, 0xecf0f1]);
    car.target = nearestIntersection(car.x, car.z, intersections);
    car.stopped = 0;
    car.blocked = false;
  }

  function spawnPed() {
    const ped = nextFreePed();
    if (ped === null) return;
    const pt = randomSidewalkPoint(random);
    ped.active = true;
    ped.x = pt.x;
    ped.z = pt.z;
    ped.angle = random() * TAU;
    ped.speed = PED.speed * (0.7 + random() * 0.6);
    ped.target = randomSidewalkPoint(random);
    ped.fleeing = false;
    ped.color = pick(random, [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22]);
  }

  function spawnPoliceCar() {
    const car = nextFreeCar();
    if (car === null) return null;
    let pt;
    let tries = 0;
    do {
      pt = randomRoadPoint(random, intersections);
      tries += 1;
    } while (tries < 8 && distSq(pt.x, pt.z, player.x, player.z) < 120 * 120);
    car.active = true;
    car.isPolice = true;
    car.isPlayer = false;
    car.x = pt.x;
    car.z = pt.z;
    car.angle = Math.atan2(player.x - pt.x, player.z - pt.z);
    car.speed = 0;
    car.color = 0x1a1a2e;
    car.target = null;
    car.blocked = false;
    return car;
  }

  function spawnFootCop() {
    const cop = nextFreeCop();
    if (cop === null) return null;
    const pt = randomSidewalkPoint(random);
    cop.active = true;
    cop.x = pt.x;
    cop.z = pt.z;
    cop.angle = 0;
    cop.speed = 0;
    return cop;
  }

  /** Nearest car within maxD of (x, z), optionally police only, never the player's car. */
  function nearestCar(x, z, maxD, policeOnly) {
    let best = null;
    let bd = maxD * maxD;
    for (const c of cars) {
      if (!c.active || c.isPlayer) continue;
      if (policeOnly && !c.isPolice) continue;
      const d = distSq(x, z, c.x, c.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** An intersection at least minDist from the player, for a mission marker. */
  function distantIntersection(minDist) {
    let pt;
    let tries = 0;
    do {
      pt = pick(random, intersections);
      tries += 1;
    } while (tries < 10 && distSq(pt.x, pt.z, player.x, player.z) < minDist * minDist);
    return pt;
  }

  /**
   * The garage: a roadside bay beside a random intersection, clear of buildings so a car
   * can drive into it. The angle faces the road it sits beside.
   */
  function chooseGarageSpot() {
    for (let tries = 0; tries < 20; tries += 1) {
      const it = pick(random, intersections);
      const dir = pick(random, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const x = it.x + dir[0] * (CITY.roadWidth / 2 + 12);
      const z = it.z + dir[1] * (CITY.roadWidth / 2 + 12);
      let clear = true;
      for (const box of city.boxes) {
        if (x > box.x0 - GARAGE.radius - 1 && x < box.x1 + GARAGE.radius + 1
          && z > box.z0 - GARAGE.radius - 1 && z < box.z1 + GARAGE.radius + 1) {
          clear = false;
          break;
        }
      }
      if (clear) return { x, z, angle: dir[0] !== 0 ? Math.PI / 2 : 0 };
    }
    // Fallback: the sidewalk beside the road through the origin (buildings start 27 out).
    return { x: CITY.roadWidth / 2 + 12, z: 0, angle: Math.PI / 2 };
  }

  /** Respect grows with jobs and thefts; each milestone banner fires once. */
  function addRespect(n) {
    state.stats.respect += n;
    const r = state.stats.respect;
    if (state.respectLevel < 2 && r >= RESPECT.milestones[1]) {
      state.respectLevel = 2;
      state.missionBanner = 'RESPECT UP — Sunvale respects you';
      state.bannerTimer = 3;
    } else if (state.respectLevel < 1 && r >= RESPECT.milestones[0]) {
      state.respectLevel = 1;
      state.missionBanner = 'RESPECT UP — the streets know your name';
      state.bannerTimer = 3;
    }
  }

  /** Lay out the current mission: its marker, and its opening heat for evade jobs. */
  function setupMission() {
    const m = MISSIONS[state.missionIndex];
    if (!m) {
      state.missionMarker = { x: 0, z: 0 };
      return;
    }
    state.missionStage = 0;
    if (m.kind === 'steal') {
      // Marker: a parking spot at an intersection away from the player.
      const pt = distantIntersection(300);
      state.missionMarker = { x: pt.x, z: pt.z };
    } else if (m.kind === 'deliver' || m.kind === 'walk') {
      const pt = randomSidewalkPoint(random);
      state.missionMarker = { x: pt.x, z: pt.z };
    } else if (m.kind === 'evade') {
      // Heat on the spot, hideout marker far away.
      state.wantedHeat = WANTED.perStar * (m.stars || 3);
      state.lastCrimeAt = state.elapsed;
      const pt = distantIntersection(400);
      state.missionMarker = { x: pt.x, z: pt.z };
    }
  }

  /** Jump to a mission (for loading a save): set the index and lay out its marker. */
  function setMission(index) {
    state.missionIndex = Math.min(index, MISSIONS.length);
    state.missionStage = 0;
    setupMission();
  }

  /** Pay out the current mission and advance to the next one. */
  function finishMission() {
    const m = MISSIONS[state.missionIndex];
    player.money += m.reward;
    state.missionBanner = m.done;
    state.bannerTimer = 3.5;
    state.missionIndex += 1;
    state.stats.delivered += 1;
    addRespect(RESPECT.perMission);
    if (state.missionIndex < MISSIONS.length) setupMission();
    else state.missionMarker = { x: 0, z: 0 };
    return EVENT_MISSION | EVENT_CASH;
  }

  /** Hurt the player, with a brief invulnerability window; returns event flags. */
  function damagePlayer(amount) {
    if (player.invulnerable > 0 || state.gameOver) return 0;
    player.health -= amount;
    player.invulnerable = PLAYER.invulnerable;
    player.lastHurtAt = state.elapsed;
    state.shake = Math.max(state.shake, 0.7);
    if (player.health <= 0) {
      player.health = 0;
      state.gameOver = true;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  /** Fire the pistol at a world point: hitscan along a corridor, nearest target wins. */
  function fireShot(tx, tz) {
    if (!player.hasPistol || player.shootCooldown > 0 || state.gameOver) return 0;
    player.shootCooldown = PISTOL.cooldown;
    addHeat(WANTED.shoot);
    const ox = player.x;
    const oz = player.z;
    const dx = tx - ox;
    const dz = tz - oz;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    // Nearest ped, cop or car inside a corridor along the shot.
    let bestD = PISTOL.range;
    let bestKind = null;
    let bestObj = null;
    for (const p of peds) {
      if (!p.active) continue;
      const rx = p.x - ox;
      const rz = p.z - oz;
      const along = rx * nx + rz * nz;
      if (along < 0 || along > PISTOL.range) continue;
      const perp = Math.abs(rx * nz - rz * nx);
      if (perp < 2.2 && along < bestD) {
        bestD = along;
        bestKind = 'ped';
        bestObj = p;
      }
    }
    for (const c of cops) {
      if (!c.active) continue;
      const rx = c.x - ox;
      const rz = c.z - oz;
      const along = rx * nx + rz * nz;
      if (along < 0 || along > PISTOL.range) continue;
      const perp = Math.abs(rx * nz - rz * nx);
      if (perp < 2.2 && along < bestD) {
        bestD = along;
        bestKind = 'cop';
        bestObj = c;
      }
    }
    for (const c of cars) {
      if (!c.active || c.isPlayer) continue;
      const rx = c.x - ox;
      const rz = c.z - oz;
      const along = rx * nx + rz * nz;
      if (along < 0 || along > PISTOL.range) continue;
      const perp = Math.abs(rx * nz - rz * nx);
      if (perp < 3.5 && along < bestD) {
        bestD = along;
        bestKind = 'car';
        bestObj = c;
      }
    }
    const hx = ox + nx * bestD;
    const hz = oz + nz * bestD;
    spawnBurst(hx, 1.4, hz, 0xffd21f, 6, 6, 2);
    let events = EVENT_SHOT;
    if (bestKind === 'ped') {
      bestObj.active = false;
      spawnBurst(bestObj.x, 1.2, bestObj.z, 0xc0392b, 10, 7, 3);
      addHeat(WANTED.hitPed);
    } else if (bestKind === 'cop') {
      bestObj.active = false;
      spawnBurst(bestObj.x, 1.2, bestObj.z, 0x1a1a2e, 10, 7, 3);
      addHeat(WANTED.punchCop);
    } else if (bestKind === 'car') {
      spawnBurst(bestObj.x, 1.2, bestObj.z, 0xffa030, 12, 8, 4);
      if (bestObj.isPolice) addHeat(WANTED.shoot);
      state.shake = Math.max(state.shake, 0.4);
    }
    return events;
  }

  /** A punch on foot: anything in range ahead of the player goes down. */
  function punch() {
    if (player.punchCooldown > 0 || state.gameOver || player.inCar) return 0;
    player.punchCooldown = PLAYER.punchCooldown;
    const fx = Math.sin(player.angle);
    const fz = Math.cos(player.angle);
    const px = player.x + fx * 1.6;
    const pz = player.z + fz * 1.6;
    let events = 0;
    for (const p of peds) {
      if (!p.active) continue;
      if (distSq(px, pz, p.x, p.z) < PLAYER.punchRange * PLAYER.punchRange) {
        p.active = false;
        spawnBurst(p.x, 1.2, p.z, 0xc0392b, 8, 6, 3);
        addHeat(WANTED.hitPed);
        p.fleeing = false;
        events |= EVENT_HIT;
      }
    }
    for (const c of cops) {
      if (!c.active) continue;
      if (distSq(px, pz, c.x, c.z) < PLAYER.punchRange * PLAYER.punchRange) {
        c.active = false;
        spawnBurst(c.x, 1.2, c.z, 0x1a1a2e, 8, 6, 3);
        addHeat(WANTED.punchCop);
        events |= EVENT_HIT;
      }
    }
    return events;
  }

  /** E: step out of the car, or climb into the nearest car (stealing it if civilian). */
  function toggleCar() {
    if (state.gameOver) return 0;
    if (player.inCar) {
      const car = player.inCar;
      car.isPlayer = false;
      car.speed = 0;
      // Step out to the side of the car.
      const sx = car.x + Math.cos(car.angle) * 3.4;
      const sz = car.z - Math.sin(car.angle) * 3.4;
      const [cx, cz] = pushOutOfBuildings(sx, sz, PLAYER.radius);
      player.x = cx;
      player.z = cz;
      player.angle = car.angle;
      player.inCar = null;
      return 0;
    }
    const car = nearestCar(player.x, player.z, CAR.enterRange, false);
    if (!car) return 0;
    car.isPlayer = true;
    player.inCar = car;
    player.angle = car.angle;
    player.speed = 0;
    let events = 0;
    if (!car.isPolice) {
      // Stealing a civilian car is a crime; police cars are fair game once empty.
      addHeat(WANTED.stealCar);
      state.stats.stolen += 1;
      addRespect(RESPECT.perSteal);
      events |= EVENT_STEAL;
      const m = MISSIONS[state.missionIndex];
      if (m && m.kind === 'steal' && state.missionStage === 0) {
        state.missionStage = 1;
      }
    }
    return events;
  }

  /** One step of a civilian traffic car: follow the road grid, slow for the car ahead. */
  function driveTraffic(car, dt) {
    if (car.isPlayer) return;
    if (car.isPolice) return; // police cars are stepped separately
    if (!car.target) car.target = nearestIntersection(car.x, car.z, intersections);
    const dx = car.target.x - car.x;
    const dz = car.target.z - car.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 10) {
      const next = adjacentIntersections(car.target, intersections);
      car.target = next.length ? pick(random, next) : car.target;
      return;
    }
    const want = Math.atan2(dx, dz);
    const diff = turnDiff(want, car.angle);
    car.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
    // Slow down for the car ahead.
    let slow = false;
    for (const other of cars) {
      if (!other.active || other === car) continue;
      const ox = other.x - car.x;
      const oz = other.z - car.z;
      const along = ox * Math.sin(car.angle) + oz * Math.cos(car.angle);
      const perp = Math.abs(ox * Math.cos(car.angle) - oz * Math.sin(car.angle));
      if (along > 0 && along < 12 && perp < 3.5) {
        slow = true;
        break;
      }
    }
    const targetSpeed = slow ? 0 : TRAFFIC.speed * (0.8 + ((car.color % 7) / 7) * 0.4);
    car.speed += clamp(targetSpeed - car.speed, -20 * dt, 12 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    const [cx, cz] = clampCity(car.x, car.z, 6);
    car.x = cx;
    car.z = cz;
  }

  /** One step of a chasing police car: home in on the player and ram them. */
  function drivePoliceCar(car, dt) {
    if (car.blocked) return 0; // a roadblock car holds its post and never chases
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const want = Math.atan2(dx, dz);
    const diff = turnDiff(want, car.angle);
    car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
    const targetSpeed = d > 14 ? POLICE.carMaxSpeed : POLICE.carMaxSpeed * 0.6;
    car.speed += clamp(targetSpeed - car.speed, -30 * dt, 22 * dt);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    const [cx, cz] = pushOutOfBuildings(car.x, car.z, CAR.radius);
    car.x = cx;
    car.z = cz;
    const [bx, bz] = clampCity(car.x, car.z, 6);
    car.x = bx;
    car.z = bz;
    // Ram the player.
    if (player.inCar) {
      const pc = player.inCar;
      if (distSq(car.x, car.z, pc.x, pc.z) < (CAR.radius + CAR.radius) * (CAR.radius + CAR.radius)) {
        const ev = damagePlayer(POLICE.ramDamage);
        spawnBurst(pc.x, 1.2, pc.z, 0xffa030, 14, 9, 4);
        state.shake = Math.max(state.shake, 0.8);
        // Shove the player's car away.
        const px = pc.x - car.x;
        const pz = pc.z - car.z;
        const pl = Math.sqrt(px * px + pz * pz) || 1;
        pc.x += (px / pl) * 3;
        pc.z += (pz / pl) * 3;
        return ev | EVENT_CRASH;
      }
    } else if (distSq(car.x, car.z, player.x, player.z) < (CAR.radius + PLAYER.radius) * (CAR.radius + PLAYER.radius)) {
      const ev = damagePlayer(POLICE.ramDamage);
      spawnBurst(player.x, 1.2, player.z, 0xffa030, 14, 9, 4);
      state.shake = Math.max(state.shake, 0.8);
      return ev | EVENT_CRASH;
    }
    return 0;
  }

  /** One step of a pedestrian: wander the sidewalks, or flee a speeding car. */
  function walkPed(ped, dt) {
    if (ped.fleeing) {
      const dx = ped.x - ped.fleeX;
      const dz = ped.z - ped.fleeZ;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      ped.angle = Math.atan2(dx, dz);
      ped.x += Math.sin(ped.angle) * PED.fleeSpeed * dt;
      ped.z += Math.cos(ped.angle) * PED.fleeSpeed * dt;
      ped.walkPhase += dt * 11;
      if (d > 60) ped.fleeing = false;
    } else {
      if (!ped.target) ped.target = randomSidewalkPoint(random);
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 3) {
        ped.target = randomSidewalkPoint(random);
        return;
      }
      const want = Math.atan2(dx, dz);
      ped.angle += clamp(turnDiff(want, ped.angle), -3 * dt, 3 * dt);
      ped.x += Math.sin(ped.angle) * ped.speed * dt;
      ped.z += Math.cos(ped.angle) * ped.speed * dt;
      ped.walkPhase += dt * 7;
    }
    const [cx, cz] = pushOutOfBuildings(ped.x, ped.z, PED.radius);
    ped.x = cx;
    ped.z = cz;
    const [bx, bz] = clampCity(ped.x, ped.z, 4);
    ped.x = bx;
    ped.z = bz;
  }

  /** One step of a foot cop: close in on the player and bust them on foot. */
  function chaseCop(cop, dt) {
    if (player.inCar) {
      // Foot cops chase the car on foot but cannot bust the driver.
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 3) {
        cop.angle = Math.atan2(dx, dz);
        cop.x += Math.sin(cop.angle) * POLICE.footSpeed * dt;
        cop.z += Math.cos(cop.angle) * POLICE.footSpeed * dt;
      }
      return 0;
    }
    const dx = player.x - cop.x;
    const dz = player.z - cop.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    cop.angle = Math.atan2(dx, dz);
    if (d > 1.5) {
      cop.x += Math.sin(cop.angle) * POLICE.footSpeed * dt;
      cop.z += Math.cos(cop.angle) * POLICE.footSpeed * dt;
    }
    if (d < POLICE.bustRange) {
      player.bustTimer += dt;
      if (player.bustTimer >= POLICE.bustTime) {
        state.busted = true;
        state.gameOver = true;
        return EVENT_BUSTED | EVENT_OVER;
      }
    } else {
      player.bustTimer = 0;
    }
    return 0;
  }

  /** Keep the right number of police cars and foot cops out for the current heat. */
  function updatePolice() {
    const s = stars();
    const wantCars = Math.min(POLICE.maxCars, s);
    let haveCars = 0;
    for (const c of cars) if (c.active && c.isPolice && !c.isPlayer && !c.blocked) haveCars += 1;
    if (s === 0) {
      for (const c of cars) if (c.active && c.isPolice && !c.isPlayer) c.active = false;
      for (const c of cops) if (c.active) c.active = false;
      return;
    }
    while (haveCars < wantCars) {
      if (spawnPoliceCar() === null) break;
      haveCars += 1;
    }
    const wantCops = s >= 2 ? Math.min(3, s - 1) : 0;
    let haveCops = 0;
    for (const c of cops) if (c.active) haveCops += 1;
    while (haveCops < wantCops) {
      if (spawnFootCop() === null) break;
      haveCops += 1;
    }
  }

  /**
   * The police helicopter: arrives at 3 stars and hovers ahead of the player, in the
   * direction they face, so it stays inside the third-person frame. It stands down only
   * once the heat is below 2 stars, so it is still overhead in the chase screenshot.
   */
  function updateHeli(dt) {
    const h = state.heli;
    if (state.wantedHeat < WANTED.perStar * 2) {
      h.active = false;
      return;
    }
    // Activate at 3 stars of heat; once up, keep flying until the stand-down below.
    // Heat decays continuously, so the 3-star boundary (90) is crossed within a step of
    // being reached — a 1-heat tolerance lets the response trigger when the player is
    // effectively at 3 stars (and in the chase scene, which starts at exactly 90).
    if (!h.active && state.wantedHeat < WANTED.perStar * HELI.minStars - 1) return;
    if (!h.active) {
      h.active = true;
      h.x = player.x - Math.sin(player.angle) * 60;
      h.z = player.z - Math.cos(player.angle) * 60;
      h.y = HELI.hoverHeight;
    }
    const tx = player.x + Math.sin(player.angle) * HELI.ahead;
    const tz = player.z + Math.cos(player.angle) * HELI.ahead;
    const k = Math.min(1, HELI.follow * dt);
    h.x += (tx - h.x) * k;
    h.z += (tz - h.z) * k;
    h.y += (HELI.hoverHeight - h.y) * k;
    h.angle = Math.atan2(player.x - h.x, player.z - h.z);
    h.rotor += HELI.rotorSpeed * dt;
  }

  /** One parked police car of a roadblock: from the pool, marked so it never chases. */
  function makeRoadblockCar(x, z, angle) {
    const car = nextFreeCar();
    if (car === null) return null;
    car.active = true;
    car.isPolice = true;
    car.isPlayer = false;
    car.x = x;
    car.z = z;
    car.angle = angle;
    car.speed = 0;
    car.color = 0x1a1a2e;
    car.target = null;
    car.blocked = true;
    return car;
  }

  function clearRoadblock(rb) {
    if (rb.carA) {
      rb.carA.active = false;
      rb.carA.blocked = false;
      rb.carA = null;
    }
    if (rb.carB) {
      rb.carB.active = false;
      rb.carB.blocked = false;
      rb.carB = null;
    }
    rb.active = false;
  }

  /**
   * Place one roadblock ahead of the player: two police cars side by side across the
   * nearest road to the point ahead of them, so the road the player is heading for is
   * blocked. Returns false when the car pool is full (the slot retries next step).
   */
  function placeRoadblock(rb, ahead) {
    const fx = player.x + Math.sin(player.angle) * ahead;
    const fz = player.z + Math.cos(player.angle) * ahead;
    const lx = nearestRoadLine(fx);
    const lz = nearestRoadLine(fz);
    const vertical = Math.abs(fx - lx) <= Math.abs(fz - lz);
    let x1; let z1; let x2; let z2; let angle;
    if (vertical) {
      const zc = Math.max(-CITY.half + 20, Math.min(CITY.half - 20, fz));
      x1 = lx - 8; z1 = zc; x2 = lx + 8; z2 = zc; angle = 0;
    } else {
      const xc = Math.max(-CITY.half + 20, Math.min(CITY.half - 20, fx));
      x1 = xc; z1 = lz - 8; x2 = xc; z2 = lz + 8; angle = Math.PI / 2;
    }
    const carA = makeRoadblockCar(x1, z1, angle);
    if (carA === null) return false;
    const carB = makeRoadblockCar(x2, z2, angle);
    if (carB === null) {
      carA.active = false;
      carA.blocked = false;
      return false;
    }
    rb.active = true;
    rb.x = (x1 + x2) / 2;
    rb.z = (z1 + z2) / 2;
    rb.angle = angle;
    rb.carA = carA;
    rb.carB = carB;
    return true;
  }

  /**
   * Police roadblocks: two blocks arrive at 3 stars, sit on the roads ahead of the
   * player, and stand down only once the heat is below 2 stars. A block whose cars
   * vanished (the 0-star cleanup) is dropped, and one the player outran is re-placed
   * ahead of them.
   */
  function updateRoadblocks() {
    if (state.wantedHeat < WANTED.perStar * 2) {
      for (const rb of state.roadblocks) clearRoadblock(rb);
      return;
    }
    for (const rb of state.roadblocks) {
      if (rb.active && !(rb.carA && rb.carA.active && rb.carB && rb.carB.active)) {
        clearRoadblock(rb);
      }
    }
    // Place new blocks only at 3 stars of heat (with the same 1-heat boundary tolerance
    // as the helicopter); existing ones hold until the stand-down.
    if (state.wantedHeat < WANTED.perStar * ROADBLOCK.minStars - 1) return;
    for (let i = 0; i < state.roadblocks.length; i += 1) {
      const rb = state.roadblocks[i];
      const d2p = rb.active ? distSq(rb.x, rb.z, player.x, player.z) : Infinity;
      if (!rb.active || d2p > ROADBLOCK.repositionDist * ROADBLOCK.repositionDist) {
        clearRoadblock(rb);
        placeRoadblock(rb, ROADBLOCK.ahead + i * ROADBLOCK.slotGap);
      }
    }
  }

  /**
   * The garage: drive the player's car into the bay and it is fixed up — the player is
   * healed, the car gets a fresh paint job, and Marla pays for the trouble. A cooldown
   * stops the player farming it by sitting in the bay.
   */
  function tryGarage() {
    if (state.garageCooldown > 0 || !player.inCar) return 0;
    const g = state.garage;
    if (distSq(player.x, player.z, g.x, g.z) >= GARAGE.radius * GARAGE.radius) return 0;
    const car = player.inCar;
    player.health = PLAYER.health;
    car.color = pick(random, [0xc0392b, 0x2980b9, 0xf1c40f, 0x8e44ad, 0x16a085, 0xd35400, 0xecf0f1, 0x2ecc71]);
    player.money += GARAGE.payout;
    state.garageCooldown = GARAGE.cooldown;
    state.missionBanner = `GARAGE — ride fixed, fresh paint +$${GARAGE.payout}`;
    state.bannerTimer = 3;
    spawnBurst(car.x, 1.5, car.z, 0xffd21f, 12, 6, 3);
    return EVENT_CASH;
  }

  /** Check whether the current mission's goal has been met. */
  function tryMissions() {
    const m = MISSIONS[state.missionIndex];
    if (!m) return 0;
    const mk = state.missionMarker;
    if (m.kind === 'steal') {
      if (state.missionStage === 1 && player.inCar) {
        if (distSq(player.x, player.z, mk.x, mk.z) < 12 * 12) return finishMission();
      }
    } else if (m.kind === 'deliver') {
      if (state.missionStage === 0 && !player.inCar) {
        if (distSq(player.x, player.z, mk.x, mk.z) < 4 * 4) {
          state.missionStage = 1;
          const pt = distantIntersection(300);
          state.missionMarker = { x: pt.x, z: pt.z };
          return EVENT_CASH;
        }
      } else if (state.missionStage === 1) {
        if (distSq(player.x, player.z, mk.x, mk.z) < 10 * 10) return finishMission();
      }
    } else if (m.kind === 'evade') {
      if (state.wantedHeat <= 0) return finishMission();
      if (distSq(player.x, player.z, mk.x, mk.z) < 12 * 12) {
        state.wantedHeat = 0;
        return finishMission();
      }
    } else if (m.kind === 'walk') {
      if (!player.inCar && distSq(player.x, player.z, mk.x, mk.z) < 4 * 4) {
        return finishMission();
      }
    }
    return 0;
  }

  /** Back to a fresh run: player at the start, streets full, first mission laid out. */
  function reset() {
    player.x = 0;
    player.z = 40;
    player.angle = 0;
    player.speed = 0;
    player.health = PLAYER.health;
    player.money = 0;
    player.inCar = null;
    player.hasPistol = false;
    player.invulnerable = 0;
    player.lastHurtAt = -99;
    player.punchCooldown = 0;
    player.shootCooldown = 0;
    player.bustTimer = 0;
    for (const c of cars) {
      c.active = false;
      c.isPolice = false;
      c.isPlayer = false;
      c.blocked = false;
    }
    for (const p of peds) p.active = false;
    for (const c of cops) c.active = false;
    for (const p of particles) p.active = false;
    state.wantedHeat = 0;
    state.lastCrimeAt = -99;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.missionBanner = '';
    state.bannerTimer = 0;
    state.elapsed = 0;
    state.gameOver = false;
    state.busted = false;
    state.shake = 0;
    state.stats.stolen = 0;
    state.stats.delivered = 0;
    state.stats.respect = 0;
    state.heli.active = false;
    state.heli.rotor = 0;
    for (const rb of state.roadblocks) {
      rb.active = false;
      rb.carA = null;
      rb.carB = null;
    }
    state.garageCooldown = 0;
    state.respectLevel = 0;
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (let i = 0; i < PED.count; i += 1) spawnPed();
    setupMission();
  }

  /**
   * One fixed step. `input` holds up/down/left/right/sprint booleans, `enter` and
   * `punch` one-shots, and `shoot` as {x, z} or null. With `harmless` set (the title
   * screen's backdrop) the world moves but nothing hurts the player and no crime counts.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.garageCooldown > 0) state.garageCooldown -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.6);
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.shootCooldown > 0) player.shootCooldown -= dt;

    // Wanted heat decays when quiet and hidden.
    if (!harmless && state.wantedHeat > 0) {
      let near = false;
      for (const c of cars) {
        if (c.active && c.isPolice && distSq(c.x, c.z, player.x, player.z) < WANTED.policeNear * WANTED.policeNear) {
          near = true;
          break;
        }
      }
      const quiet = state.elapsed - state.lastCrimeAt > WANTED.quietSeconds;
      const rate = quiet && !near ? WANTED.decayHidden : WANTED.decayHot;
      state.wantedHeat = Math.max(0, state.wantedHeat - rate * dt);
    }

    // Player movement.
    player.moving = false;
    if (!state.gameOver) {
      if (player.inCar) {
        const car = player.inCar;
        if (input.up) car.speed += CAR.accel * dt;
        else if (input.down) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
        else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt);
        car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
        const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        const grip = clamp(Math.abs(car.speed) / 12, 0.25, 1);
        car.angle += steer * CAR.steer * grip * Math.sign(car.speed) * dt;
        car.x += Math.sin(car.angle) * car.speed * dt;
        car.z += Math.cos(car.angle) * car.speed * dt;
        const [cx, cz] = pushOutOfBuildings(car.x, car.z, CAR.radius);
        if ((cx !== car.x || cz !== car.z) && Math.abs(car.speed) > 12) {
          events |= EVENT_CRASH;
          spawnBurst(car.x, 1.2, car.z, 0xffa030, 10, 8, 3);
          state.shake = Math.max(state.shake, 0.5);
          car.speed *= 0.4;
        }
        car.x = cx;
        car.z = cz;
        const [bx, bz] = clampCity(car.x, car.z, 6);
        car.x = bx;
        car.z = bz;
        // Roadblocks are solid: the player's car bounces off them.
        if (!harmless) {
          for (const rb of state.roadblocks) {
            if (!rb.active) continue;
            for (const rc of [rb.carA, rb.carB]) {
              if (!rc || !rc.active) continue;
              const rdx = car.x - rc.x;
              const rdz = car.z - rc.z;
              const rd2 = rdx * rdx + rdz * rdz;
              const minD = CAR.radius + CAR.radius;
              if (rd2 < minD * minD) {
                const rd = Math.sqrt(rd2) || 1;
                car.x = rc.x + (rdx / rd) * minD;
                car.z = rc.z + (rdz / rd) * minD;
                if (Math.abs(car.speed) > 12) {
                  events |= EVENT_CRASH;
                  spawnBurst(car.x, 1.2, car.z, 0xffa030, 10, 8, 3);
                  state.shake = Math.max(state.shake, 0.5);
                }
                car.speed *= 0.3;
              }
            }
          }
        }
        player.x = car.x;
        player.z = car.z;
        player.angle = car.angle;
        player.moving = Math.abs(car.speed) > 1;
        // Running over a pedestrian is a crime.
        if (!harmless) {
          for (const p of peds) {
            if (!p.active) continue;
            if (distSq(car.x, car.z, p.x, p.z) < (CAR.radius + PED.radius) * (CAR.radius + PED.radius)) {
              p.active = false;
              spawnBurst(p.x, 1.2, p.z, 0xc0392b, 10, 7, 3);
              addHeat(WANTED.hitPed);
              state.shake = Math.max(state.shake, 0.4);
            }
          }
        }
      } else {
        if (input.left) player.angle += PLAYER.turnSpeed * dt;
        if (input.right) player.angle -= PLAYER.turnSpeed * dt;
        const maxSpeed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
        let target = 0;
        if (input.up) target = maxSpeed;
        else if (input.down) target = -maxSpeed * 0.45;
        player.speed += clamp(target - player.speed, -PLAYER.accel * dt, PLAYER.accel * dt);
        player.x += Math.sin(player.angle) * player.speed * dt;
        player.z += Math.cos(player.angle) * player.speed * dt;
        const [cx, cz] = pushOutOfBuildings(player.x, player.z, PLAYER.radius);
        player.x = cx;
        player.z = cz;
        const [bx, bz] = clampCity(player.x, player.z, 4);
        player.x = bx;
        player.z = bz;
        player.moving = Math.abs(player.speed) > 0.5;
        if (input.punch && !harmless) events |= punch();
        if (input.shoot && !harmless) events |= fireShot(input.shoot.x, input.shoot.z);
      }
      if (input.enter) events |= toggleCar();
    }

    // Traffic, pedestrians, police.
    for (const car of cars) {
      if (!car.active) continue;
      if (car.isPlayer) continue;
      if (car.isPolice) events |= drivePoliceCar(car, dt);
      else driveTraffic(car, dt);
    }
    for (const ped of peds) {
      if (!ped.active) continue;
      walkPed(ped, dt);
      // A car close behind makes a pedestrian flee.
      if (!ped.fleeing) {
        for (const car of cars) {
          if (!car.active || Math.abs(car.speed) < 6) continue;
          if (distSq(car.x, car.z, ped.x, ped.z) < 10 * 10) {
            ped.fleeing = true;
            ped.fleeX = car.x;
            ped.fleeZ = car.z;
            break;
          }
        }
      }
    }
    for (const cop of cops) {
      if (!cop.active) continue;
      if (!harmless) events |= chaseCop(cop, dt);
    }

    // Keep the streets populated.
    let trafficCount = 0;
    for (const c of cars) if (c.active && !c.isPolice && !c.isPlayer) trafficCount += 1;
    if (trafficCount < TRAFFIC.count) spawnTrafficCar();
    let pedCount = 0;
    for (const p of peds) if (p.active) pedCount += 1;
    if (pedCount < PED.count) spawnPed();
    if (!harmless) {
      updatePolice();
      updateHeli(dt);
      updateRoadblocks();
    }

    // Health regen after a quiet spell.
    if (!harmless && player.health > 0 && player.health < PLAYER.health
      && state.elapsed - player.lastHurtAt > PLAYER.regenDelay) {
      player.health = Math.min(PLAYER.health, player.health + PLAYER.healthRegen * dt);
    }

    if (!harmless && !state.gameOver) {
      events |= tryGarage();
      events |= tryMissions();
    }

    // Particles.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 22 * dt;
      if (p.y < 0.1) {
        p.y = 0.1;
        p.vy *= -0.3;
      }
    }

    if (state.gameOver) events |= EVENT_OVER;
    return events;
  }

  reset();
  return {
    state, reset, step, stars, shootAt: fireShot, enterExitCar: toggleCar, burst: spawnBurst, setMission,
  };
}
