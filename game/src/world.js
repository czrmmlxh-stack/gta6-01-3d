// Sunvale 3D — game world. Pure logic: no three.js, no DOM, so the
// headless checks in Node can load this module directly. The renderer
// reads this state every frame and draws it; the world never draws.

import { makeRng } from './random.js';
import { WORLD, DISTRICTS, GARAGE, RESPECT_MILESTONES, MISSIONS, TOTAL_REWARD } from './config.js';
import { buildCity, hitsBuilding, resolveBuilding } from './city.js';

export { TOTAL_REWARD, MISSIONS };

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

const CAR_COLORS = [
  0xd23c2e, 0x2e6fd2, 0xe8b563, 0x3aa655, 0xe8e8e8,
  0x222226, 0x7a4fd0, 0xd2802e, 0x4fc3d0, 0xc9c9c9,
];

let nextCarId = 1;

function spawnTrafficCar(rng, city) {
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = Math.round(rng.range(-3, 3)) * WORLD.ROAD_EVERY;
  const along = rng.range(-WORLD.CLAMP + 60, WORLD.CLAMP - 60);
  const lane = rng.chance(0.5) ? 7 : -7;
  const dir = rng.chance(0.5) ? 1 : -1;
  const car = {
    id: nextCarId,
    x: axis === 'x' ? along : line + lane,
    z: axis === 'x' ? line + lane : along,
    angle: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    speed: rng.range(8, 14),
    color: rng.pick(CAR_COLORS),
    kind: 'traffic',
    stolen: false,
    health: 100,
    axis,
    dir,
    turnAt: null,
    ramCooldown: 0,
  };
  nextCarId += 1;
  return car;
}

function spawnPed(rng) {
  const line = Math.round(rng.range(-3, 3)) * WORLD.ROAD_EVERY;
  const along = rng.range(-WORLD.CLAMP + 40, WORLD.CLAMP - 40);
  const onXRoad = rng.chance(0.5);
  return {
    x: onXRoad ? along : line + (rng.chance(0.5) ? 20 : -20),
    z: onXRoad ? line + (rng.chance(0.5) ? 20 : -20) : along,
    angle: rng.range(0, TAU),
    speed: rng.range(1.2, 2.6),
    target: null,
    down: 0,
    flee: 0,
    hue: rng.pick([0xd23c2e, 0x2e6fd2, 0xe8b563, 0x3aa655, 0x7a4fd0, 0xd2802e]),
  };
}

export function createWorld(seed) {
  const city = buildCity(seed);
  const rng = makeRng((seed === undefined ? WORLD.SEED : seed) + 77);
  const w = {
    city,
    rng,
    time: 0,
    cash: 0,
    respect: 0,
    wanted: 0,
    heat: 0,
    started: false,
    paused: false,
    arrested: false,
    allDone: false,
    garageCooldown: 0,
    arrestTimer: 0,
    player: {
      x: DISTRICTS.plaza.x,
      z: DISTRICTS.plaza.z + 24,
      angle: 0,
      speed: 0,
      onFoot: true,
      carId: null,
      health: 100,
    },
    cars: [],
    peds: [],
    police: [],
    heli: { active: false, fade: 0, x: 0, z: 0, angle: 0, height: 58, spotlight: false },
    roadblocks: [],
    mission: { index: 0, stage: 'go', marker: null, pickedUp: false },
    stats: { stolen: 0, delivered: 0, jobsDone: 0, punches: 0, shots: 0 },
    banners: [],
    ticker: [],
    milestonesHit: [],
    shake: 0,
    radio: 'SUNVALE FM 101.1',
  };
  for (let i = 0; i < 14; i += 1) w.cars.push(spawnTrafficCar(rng, city));
  for (let i = 0; i < 26; i += 1) w.peds.push(spawnPed(rng));
  return w;
}

export function pushTicker(w, text) {
  w.ticker.push({ text, t: w.time });
  if (w.ticker.length > 5) w.ticker.shift();
}

export function pushBanner(w, text, dur) {
  w.banners.push({ text, t: w.time, dur: dur || 4 });
  if (w.banners.length > 3) w.banners.shift();
}

export function addWanted(w, n) {
  w.wanted = clamp(w.wanted + n, 0, 5);
  w.heat = clamp(w.heat + n * 25, 0, 100);
  if (w.wanted > 0) pushTicker(w, `WANTED ${'★'.repeat(w.wanted)} — lose the cops!`);
}

export function addRespect(w, n, sfx) {
  w.respect += n;
  for (const m of RESPECT_MILESTONES) {
    if (w.respect >= m.at && !w.milestonesHit.includes(m.at)) {
      w.milestonesHit.push(m.at);
      pushBanner(w, m.text, 5);
      pushTicker(w, m.text);
    }
  }
}

export function currentMission(w) {
  return MISSIONS[w.mission.index] || null;
}

export function startMission(w, idx) {
  const m = MISSIONS[idx];
  if (!m) {
    w.mission = { index: idx, stage: 'done', marker: null, pickedUp: false };
    return;
  }
  w.mission.index = idx;
  w.mission.pickedUp = false;
  if (m.kind === 'steal') {
    w.mission.stage = 'car';
    w.mission.marker = m.dropoff;
  } else if (m.kind === 'deliver') {
    w.mission.stage = 'pickup';
    w.mission.marker = m.pickup;
  } else if (m.kind === 'walk') {
    w.mission.stage = 'go';
    w.mission.marker = m.target;
  } else if (m.kind === 'evade') {
    w.mission.stage = 'evade';
    w.mission.marker = m.hideout;
    w.wanted = m.stars || 2;
    w.heat = 100;
  }
  pushTicker(w, `MARLA'S JOB ${idx + 1}/20 — ${m.name} ($${m.reward})`);
  pushTicker(w, m.brief);
}

function completeMission(w, sfx) {
  const m = currentMission(w);
  if (!m) return;
  w.cash += m.reward;
  w.stats.jobsDone += 1;
  if (m.kind === 'deliver') w.stats.delivered += 1;
  addRespect(w, 2, sfx);
  pushBanner(w, `JOB DONE — ${m.name}  +$${m.reward}`, 4);
  pushTicker(w, m.done);
  if (sfx) {
    sfx.missionDone();
    sfx.cash();
  }
  if (w.mission.index >= MISSIONS.length - 1) {
    w.allDone = true;
    pushBanner(w, 'THE VIPERS ARE FINISHED — SUNVALE IS OURS', 8);
    pushTicker(w, 'All 20 jobs done. Marla owns Sunvale now.');
  } else {
    startMission(w, w.mission.index + 1);
  }
}

function nearestCar(w, x, z, maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of w.cars) {
    const d = dist2(x, z, c.x, c.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function enterCar(w, sfx) {
  const p = w.player;
  if (!p.onFoot) return false;
  const car = nearestCar(w, p.x, p.z, 7);
  if (!car) return false;
  p.onFoot = false;
  p.carId = car.id;
  car.kind = 'player';
  p.x = car.x;
  p.z = car.z;
  p.angle = car.angle;
  if (!car.stolen) {
    car.stolen = true;
    w.stats.stolen += 1;
    addRespect(w, 1, sfx);
    addWanted(w, 1);
    pushTicker(w, 'You jacked a ride. +1 respect.');
  }
  if (sfx) sfx.engineStart();
  return true;
}

export function exitCar(w, sfx) {
  const p = w.player;
  if (p.onFoot) return false;
  const car = w.cars.find((c) => c.id === p.carId);
  p.onFoot = true;
  p.carId = null;
  p.speed = 0;
  if (car) {
    p.x = car.x + Math.sin(car.angle + Math.PI / 2) * 4;
    p.z = car.z + Math.cos(car.angle + Math.PI / 2) * 4;
    p.angle = car.angle;
  }
  if (sfx) sfx.engineStop();
  return true;
}

function playerCar(w) {
  if (w.player.onFoot) return null;
  return w.cars.find((c) => c.id === w.player.carId) || null;
}

function updatePlayer(w, input, dt, sfx) {
  const p = w.player;
  const axes = input.axes || { x: 0, z: 0 };
  if (p.onFoot) {
    const turnRate = 3.4;
    if (axes.x !== 0) p.angle += axes.x * turnRate * dt;
    const moving = axes.z !== 0;
    const speed = input.run ? 11 : 7;
    if (moving) {
      const dir = axes.z < 0 ? 1 : -0.55;
      p.speed = speed * dir;
      p.x += Math.sin(p.angle) * p.speed * dt;
      p.z += Math.cos(p.angle) * p.speed * dt;
    } else {
      p.speed = 0;
    }
    const fixed = resolveBuilding(w.city, p.x, p.z, 1.2);
    p.x = fixed.x;
    p.z = fixed.z;
  } else {
    const car = playerCar(w);
    if (!car) {
      p.onFoot = true;
      return;
    }
    const steer = 1.9;
    const accel = 26;
    const maxSpeed = 40;
    const maxReverse = 12;
    if (axes.x !== 0 && Math.abs(car.speed) > 0.5) {
      car.angle += axes.x * steer * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 12);
    }
    if (axes.z < 0) car.speed += accel * dt;
    else if (axes.z > 0) car.speed -= accel * 0.7 * dt;
    else car.speed *= Math.max(0, 1 - 1.4 * dt);
    if (input.brake) car.speed *= Math.max(0, 1 - 4 * dt);
    car.speed = clamp(car.speed, -maxReverse, maxSpeed);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    const fixed = resolveBuilding(w.city, car.x, car.z, 2.6);
    if (fixed.hit) {
      if (Math.abs(car.speed) > 10) {
        w.shake = Math.min(1, w.shake + 0.5);
        if (sfx) sfx.crash();
        car.health -= 6;
      }
      car.speed *= 0.4;
      car.x = fixed.x;
      car.z = fixed.z;
    }
    p.x = car.x;
    p.z = car.z;
    p.angle = car.angle;
    p.speed = car.speed;
    if (sfx) sfx.engine(clamp(Math.abs(car.speed) / maxSpeed, 0, 1));
    if (car.health <= 0) {
      pushTicker(w, 'Your ride is wrecked. Bail out!');
      pushBanner(w, 'CAR WRECKED', 3);
      exitCar(w, sfx);
      car.kind = 'wreck';
    }
  }
  p.x = clamp(p.x, -WORLD.CLAMP, WORLD.CLAMP);
  p.z = clamp(p.z, -WORLD.CLAMP, WORLD.CLAMP);
}

function updateTraffic(w, dt) {
  for (const c of w.cars) {
    if (c.kind !== 'traffic') continue;
    c.x += Math.sin(c.angle) * c.speed * dt;
    c.z += Math.cos(c.angle) * c.speed * dt;
    // At intersections, sometimes turn onto the cross street.
    const nearX = Math.abs(c.x % WORLD.ROAD_EVERY) < 4 || Math.abs(c.x % WORLD.ROAD_EVERY) > WORLD.ROAD_EVERY - 4;
    const nearZ = Math.abs(c.z % WORLD.ROAD_EVERY) < 4 || Math.abs(c.z % WORLD.ROAD_EVERY) > WORLD.ROAD_EVERY - 4;
    if ((nearX || nearZ) && c.turnAt !== `${Math.round(c.x / 50)}:${Math.round(c.z / 50)}`) {
      c.turnAt = `${Math.round(c.x / 50)}:${Math.round(c.z / 50)}`;
      if (w.rng.chance(0.3)) {
        c.angle += w.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        const tmp = c.axis;
        c.axis = tmp === 'x' ? 'z' : 'x';
      }
    }
    if (c.x > WORLD.CLAMP || c.x < -WORLD.CLAMP || c.z > WORLD.CLAMP || c.z < -WORLD.CLAMP) {
      // Wrap to the far side so traffic never runs out.
      c.x = clamp(-c.x, -WORLD.CLAMP + 20, WORLD.CLAMP - 20);
      c.z = clamp(-c.z, -WORLD.CLAMP + 20, WORLD.CLAMP - 20);
    }
    const fixed = resolveBuilding(w.city, c.x, c.z, 2.4);
    if (fixed.hit) {
      c.x = fixed.x;
      c.z = fixed.z;
      c.angle += Math.PI / 2;
    }
  }
}

function updatePeds(w, dt) {
  const p = w.player;
  for (const ped of w.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      continue;
    }
    const dPlayer = dist2(ped.x, ped.z, p.x, p.z);
    if (dPlayer < 14 && !p.onFoot) {
      ped.flee = 1.5;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      const away = angleTo(p.x, p.z, ped.x, ped.z);
      ped.angle = away;
      ped.x += Math.sin(away) * 5 * dt;
      ped.z += Math.cos(away) * 5 * dt;
      continue;
    }
    if (!ped.target || dist2(ped.x, ped.z, ped.target.x, ped.target.z) < 4) {
      ped.target = {
        x: clamp(ped.x + w.rng.range(-120, 120), -WORLD.CLAMP, WORLD.CLAMP),
        z: clamp(ped.z + w.rng.range(-120, 120), -WORLD.CLAMP, WORLD.CLAMP),
      };
    }
    const go = angleTo(ped.x, ped.z, ped.target.x, ped.target.z);
    ped.angle = go;
    ped.x += Math.sin(go) * ped.speed * dt;
    ped.z += Math.cos(go) * ped.speed * dt;
    ped.x = clamp(ped.x, -WORLD.CLAMP, WORLD.CLAMP);
    ped.z = clamp(ped.z, -WORLD.CLAMP, WORLD.CLAMP);
  }
  // Running a pedestrian over is a crime.
  if (!p.onFoot) {
    for (const ped of w.peds) {
      if (ped.down <= 0 && dist2(ped.x, ped.z, p.x, p.z) < 3.2) {
        ped.down = 6;
        addWanted(w, 1);
        pushTicker(w, 'You ran someone over! The cops saw that.');
        w.shake = Math.min(1, w.shake + 0.4);
      }
    }
  }
}

function spawnPolice(w) {
  const want = Math.min(w.wanted + 1, 6);
  while (w.police.length < want) {
    const ang = w.rng.range(0, TAU);
    const d = w.rng.range(100, 140);
    const x = clamp(w.player.x + Math.sin(ang) * d, -WORLD.CLAMP, WORLD.CLAMP);
    const z = clamp(w.player.z + Math.cos(ang) * d, -WORLD.CLAMP, WORLD.CLAMP);
    w.police.push({
      id: nextCarId,
      x, z,
      angle: angleTo(x, z, w.player.x, w.player.z),
      speed: 0,
      color: 0x1c2733,
      kind: 'police',
      health: 100,
      ramCooldown: 0,
    });
    nextCarId += 1;
  }
}

function updatePolice(w, dt, sfx) {
  if (w.wanted <= 0) {
    // No heat: the force stands down, cars peel away and despawn.
    for (const pc of w.police) {
      pc.x += Math.sin(pc.angle) * 10 * dt;
      pc.z += Math.cos(pc.angle) * 10 * dt;
    }
    w.police = w.police.filter((pc) => dist2(pc.x, pc.z, w.player.x, w.player.z) < 260);
    if (w.police.length === 0) w.arrestTimer = 0;
    return;
  }
  spawnPolice(w);
  const p = w.player;
  let closest = Infinity;
  for (const pc of w.police) {
    const target = angleTo(pc.x, pc.z, p.x, p.z);
    pc.angle += clamp(normAngle(target - pc.angle), -2.4 * dt, 2.4 * dt);
    const top = 17 + w.wanted * 2.2;
    pc.speed = Math.min(top, pc.speed + 14 * dt);
    pc.x += Math.sin(pc.angle) * pc.speed * dt;
    pc.z += Math.cos(pc.angle) * pc.speed * dt;
    const fixed = resolveBuilding(w.city, pc.x, pc.z, 2.4);
    if (fixed.hit) {
      pc.x = fixed.x;
      pc.z = fixed.z;
      pc.speed *= 0.5;
    }
    pc.x = clamp(pc.x, -WORLD.CLAMP, WORLD.CLAMP);
    pc.z = clamp(pc.z, -WORLD.CLAMP, WORLD.CLAMP);
    const d = dist2(pc.x, pc.z, p.x, p.z);
    if (d < closest) closest = d;
    // Ram the player.
    if (d < 5.5) {
      pc.ramCooldown -= dt;
      if (pc.ramCooldown <= 0) {
        pc.ramCooldown = 1.2;
        w.shake = Math.min(1, w.shake + 0.6);
        if (sfx) sfx.crash();
        const car = playerCar(w);
        if (car) {
          car.health -= 9;
          pushTicker(w, 'Police rammed your car!');
        } else {
          p.health -= 12;
          pushTicker(w, 'A cop car clipped you!');
          if (p.health <= 0) {
            w.arrested = true;
            pushBanner(w, 'BUSTED', 6);
          }
        }
      }
    }
  }
  // Arrest: a cop sitting on the player for 3.5 seconds ends the run.
  if (closest < 7) {
    w.arrestTimer += dt;
    if (w.arrestTimer > 3.5 && !w.arrested) {
      w.arrested = true;
      pushBanner(w, 'BUSTED — The cops got you', 6);
      pushTicker(w, 'Busted. Marla will post bail — restart and go again.');
    }
  } else {
    w.arrestTimer = Math.max(0, w.arrestTimer - dt * 2);
  }
  // Heat decay: out of sight, the wanted level cools off.
  if (closest > 90) {
    w.heat -= 14 * dt;
    if (w.heat <= 0) {
      if (w.wanted > 0) {
        w.wanted -= 1;
        w.heat = w.wanted > 0 ? 45 : 0;
        pushTicker(w, w.wanted > 0 ? `Heat dropping — ${w.wanted} star${w.wanted > 1 ? 's' : ''} left.` : 'You lost the cops. Clean.');
      }
    }
  }
}

function updateHeli(w, dt) {
  const h = w.heli;
  if (w.wanted >= 3) {
    h.active = true;
    h.fade = Math.min(1, h.fade + dt * 0.5);
  } else if (w.wanted < 2) {
    h.fade = Math.max(0, h.fade - dt * 0.5);
    if (h.fade <= 0) h.active = false;
  }
  if (h.active) {
    h.angle += dt * 0.55;
    h.x = w.player.x + Math.sin(h.angle) * 46;
    h.z = w.player.z + Math.cos(h.angle) * 46;
    h.spotlight = w.wanted >= 4;
  }
}

function updateRoadblocks(w) {
  if (w.wanted >= 3 && w.roadblocks.length === 0) {
    const p = w.player;
    const spots = [
      { x: clamp(p.x + 90, -WORLD.CLAMP, WORLD.CLAMP), z: p.z, angle: 0 },
      { x: clamp(p.x - 90, -WORLD.CLAMP, WORLD.CLAMP), z: p.z, angle: 0 },
    ];
    w.roadblocks = spots.map((s) => ({ ...s, active: true }));
    pushTicker(w, 'ROADBLOCKS AHEAD — the cops sealed the streets!');
  } else if (w.wanted < 2 && w.roadblocks.length > 0) {
    w.roadblocks = [];
    pushTicker(w, 'Roadblocks cleared.');
  }
}

function updateGarage(w, dt, sfx) {
  if (w.garageCooldown > 0) w.garageCooldown -= dt;
  const p = w.player;
  if (p.onFoot) return;
  const car = playerCar(w);
  if (!car) return;
  const d = dist2(p.x, p.z, GARAGE.x, GARAGE.z);
  if (d < GARAGE.radius && w.garageCooldown <= 0) {
    car.health = 100;
    car.color = w.rng.pick(CAR_COLORS);
    w.cash += GARAGE.bonus;
    w.garageCooldown = GARAGE.cooldown;
    pushBanner(w, `GARAGE — repaired, repainted, +$${GARAGE.bonus}`, 4);
    pushTicker(w, "Marla's garage fixed you up. +$50.");
    if (sfx) {
      sfx.cash();
      sfx.pickup();
    }
  }
}

function updateMission(w, sfx) {
  const m = currentMission(w);
  if (!m || w.allDone) return;
  const p = w.player;
  if (m.kind === 'steal') {
    if (w.mission.stage === 'car') {
      if (!p.onFoot && playerCar(w) && playerCar(w).stolen) {
        w.mission.stage = 'drop';
        pushTicker(w, 'Got the car. Now bring it to the marker.');
      }
    } else if (w.mission.stage === 'drop') {
      if (!p.onFoot && dist2(p.x, p.z, m.dropoff.x, m.dropoff.z) < 14) {
        completeMission(w, sfx);
      }
    }
  } else if (m.kind === 'deliver') {
    if (w.mission.stage === 'pickup') {
      if (dist2(p.x, p.z, m.pickup.x, m.pickup.z) < 12) {
        w.mission.stage = 'drop';
        w.mission.marker = m.dropoff;
        w.mission.pickedUp = true;
        pushTicker(w, 'Package picked up. Deliver it to the marker.');
        if (sfx) sfx.pickup();
      }
    } else if (w.mission.stage === 'drop') {
      if (dist2(p.x, p.z, m.dropoff.x, m.dropoff.z) < 14) {
        completeMission(w, sfx);
      }
    }
  } else if (m.kind === 'walk') {
    if (p.onFoot && dist2(p.x, p.z, m.target.x, m.target.z) < 10) {
      completeMission(w, sfx);
    }
  } else if (m.kind === 'evade') {
    if (w.wanted === 0) {
      completeMission(w, sfx);
    } else if (dist2(p.x, p.z, m.hideout.x, m.hideout.z) < 14) {
      w.wanted = 0;
      w.heat = 0;
      completeMission(w, sfx);
    }
  }
}

function doPunch(w, sfx) {
  const p = w.player;
  if (!p.onFoot) return;
  w.stats.punches += 1;
  for (const ped of w.peds) {
    if (ped.down <= 0 && dist2(ped.x, ped.z, p.x, p.z) < 3.5) {
      ped.down = 5;
      addWanted(w, 1);
      pushTicker(w, 'You decked a pedestrian. Somebody called it in.');
      if (sfx) sfx.punch();
      return;
    }
  }
  if (sfx) sfx.punch();
}

function doShoot(w, sfx) {
  const p = w.player;
  if (!p.onFoot) return;
  w.stats.shots += 1;
  addWanted(w, 2);
  if (sfx) sfx.gunshot();
  w.shake = Math.min(1, w.shake + 0.25);
  for (const ped of w.peds) {
    if (ped.down > 0) continue;
    const d = dist2(ped.x, ped.z, p.x, p.z);
    if (d > 42) continue;
    const ang = Math.abs(normAngle(angleTo(p.x, p.z, ped.x, ped.z) - p.angle));
    if (ang < 0.3) {
      ped.down = 8;
      pushTicker(w, 'Shot fired. The whole block heard it.');
      return;
    }
  }
  for (const pc of w.police) {
    const d = dist2(pc.x, pc.z, p.x, p.z);
    if (d > 42) continue;
    const ang = Math.abs(normAngle(angleTo(p.x, p.z, pc.x, pc.z) - p.angle));
    if (ang < 0.3) {
      pc.health -= 30;
      pushTicker(w, 'You hit a cop car!');
      return;
    }
  }
}

export function teleportPlayer(w, x, z, angle) {
  w.player.x = clamp(x, -WORLD.CLAMP, WORLD.CLAMP);
  w.player.z = clamp(z, -WORLD.CLAMP, WORLD.CLAMP);
  if (angle !== undefined) w.player.angle = angle;
  const car = playerCar(w);
  if (car) {
    car.x = w.player.x;
    car.z = w.player.z;
    car.angle = w.player.angle;
    car.speed = 0;
  }
}

export function stepWorld(w, input, dt, sfx) {
  if (!w.started || w.paused || w.arrested || w.allDone) return;
  w.time += dt;
  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 1.6);
  if (w.garageCooldown > 0) w.garageCooldown -= dt;

  const pressed = input.pressed || {};
  if (pressed.e) {
    if (w.player.onFoot) enterCar(w, sfx);
    else exitCar(w, sfx);
  }
  if (pressed.f) doPunch(w, sfx);
  if (pressed.g) doShoot(w, sfx);

  updatePlayer(w, input, dt, sfx);
  updateTraffic(w, dt);
  updatePeds(w, dt);
  updatePolice(w, dt, sfx);
  updateHeli(w, dt);
  updateRoadblocks(w);
  updateGarage(w, dt, sfx);
  updateMission(w, sfx);

  // Old banners and ticker lines age out.
  w.banners = w.banners.filter((b) => w.time - b.t < b.dur);
  w.ticker = w.ticker.filter((t) => w.time - t.t < 14);
}

export function startGame(w) {
  w.started = true;
  w.paused = false;
  startMission(w, 0);
  pushTicker(w, 'Welcome to Sunvale. Marla runs this town — and now you work for her.');
  pushTicker(w, 'WASD move / drive · E enter car · F punch · G pistol · P pause');
}

export function snapshot(w) {
  return {
    cash: w.cash,
    respect: w.respect,
    missionIndex: w.mission.index,
    jobsDone: w.stats.jobsDone,
    stolen: w.stats.stolen,
    delivered: w.stats.delivered,
    wanted: w.wanted,
    milestones: [...w.milestonesHit],
    allDone: w.allDone,
  };
}
