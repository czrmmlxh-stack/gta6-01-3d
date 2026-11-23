// Sunvale 3D — one file for every number the game runs on. The city is a flat square,
// 1600 units on a side, centred on the origin: x points east, z points south, y is up.
// The simulation steps at a fixed 1/60 s, so none of these numbers depend on frame rate.

export const STEP = 1 / 60;

/** Street layout: a road every roadGap units, roadWidth wide, spanning -half..+half. */
export const CITY = {
  half: 800,
  roadGap: 200,
  roadWidth: 26,
  blockMargin: 14,
};

/** The person on foot. */
export const PLAYER = {
  radius: 1.1,
  walkSpeed: 9,
  sprintSpeed: 15,
  accel: 60,
  turnSpeed: 5.2,
  health: 100,
  healthRegen: 2.5,
  regenDelay: 6,
  punchRange: 3.2,
  punchDamage: 25,
  punchCooldown: 0.45,
  invulnerable: 1.0,
};

/** How a driven car handles. */
export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 46,
  maxReverse: 12,
  steer: 1.9,
  grip: 8,
  radius: 2.4,
  enterRange: 6,
  crashDamage: 8,
};

/** Civilian traffic. */
export const TRAFFIC = {
  count: 14,
  speed: 14,
  speedJitter: 5,
  radius: 2.4,
};

/** People on the sidewalks. */
export const PED = {
  count: 22,
  speed: 2.6,
  speedJitter: 1.2,
  radius: 0.9,
  fleeSpeed: 6,
};

/** The police response on the ground. */
export const POLICE = {
  carAccel: 30,
  carMaxSpeed: 52,
  footSpeed: 8.5,
  bustRange: 2.6,
  bustTime: 1.0,
  ramDamage: 12,
  maxCars: 4,
};

/**
 * The police helicopter. It shows up at 3 stars and hovers ahead of the player, in the
 * direction the player faces, so it stays inside the third-person frame. It only stands
 * down once the heat is below 2 stars, so the chase screenshot still has it overhead
 * even after a star has decayed away.
 */
export const HELI = {
  minStars: 3,
  hoverHeight: 15,
  ahead: 50,
  follow: 1.2,
  rotorSpeed: 22,
};

/** Police roadblocks: two blocks, two parked police cars each, set ahead of the player. */
export const ROADBLOCK = {
  minStars: 3,
  ahead: 110,
  slotGap: 180,
  repositionDist: 350,
};

/** The garage: a roadside bay that repairs the car and pays out, on a cooldown. */
export const GARAGE = {
  radius: 13,
  payout: 50,
  cooldown: 20,
};

/** Respect: +2 per finished job, +1 per stolen car; banners fire at 5 and 10. */
export const RESPECT = {
  perMission: 2,
  perSteal: 1,
  milestones: [5, 10],
};

/** Wanted heat: 30 heat is one star, 150 is the five-star cap. */
export const WANTED = {
  perStar: 30,
  maxStars: 5,
  stealCar: 30,
  hitPed: 20,
  shoot: 25,
  punchCop: 40,
  decayHidden: 2.2,
  decayHot: 0.5,
  quietSeconds: 10,
  policeNear: 70,
};

/** The pistol: endless ammo, a short cooldown, a fixed range. */
export const PISTOL = {
  damage: 34,
  range: 90,
  cooldown: 0.28,
};

/**
 * Marla's ten jobs, in order. `kind` picks the rule that completes the job:
 * steal — take a car, drive it to the marker; deliver — pick up on foot, then drop off;
 * evade — the heat is set for you, lose it or reach the hideout; walk — reach the
 * marker on foot. `stars` only matters for evade jobs: the heat it starts with.
 */
export const MISSIONS = [
  {
    name: 'Borrowed Wheels',
    reward: 150,
    kind: 'steal',
    brief: 'Steal a car and bring it to the yellow marker.',
    done: 'Borrowed Wheels complete  +$150',
  },
  {
    name: 'The Package',
    reward: 300,
    kind: 'deliver',
    brief: 'Pick up the package, then deliver it to the yellow marker.',
    done: 'The Package delivered  +$300',
  },
  {
    name: 'Break the Dragnet',
    reward: 500,
    kind: 'evade',
    stars: 3,
    brief: 'You have 3 stars. Lose the heat or reach the hideout.',
    done: 'Dragnet broken  +$500',
  },
  {
    name: 'The Informant',
    reward: 600,
    kind: 'walk',
    brief: 'Meet Marla\u2019s informant on foot at the yellow marker.',
    done: 'Informant met  +$600',
  },
  {
    name: 'The Getaway Car',
    reward: 700,
    kind: 'steal',
    brief: 'Steal a fresh car and bring it to the yellow marker.',
    done: 'Getaway car delivered  +$700',
  },
  {
    name: 'Hot Cargo',
    reward: 800,
    kind: 'deliver',
    brief: 'Pick up the hot cargo on foot, then deliver it across town.',
    done: 'Hot cargo delivered  +$800',
  },
  {
    name: 'Heat Wave',
    reward: 900,
    kind: 'evade',
    stars: 2,
    brief: 'Two stars on you. Lose the heat or reach the hideout.',
    done: 'Heat Wave survived  +$900',
  },
  {
    name: 'The Lookout',
    reward: 1000,
    kind: 'walk',
    brief: 'Reach the lookout on foot and scope the police yard.',
    done: 'Lookout reached  +$1000',
  },
  {
    name: 'Chop Shop Run',
    reward: 1200,
    kind: 'steal',
    brief: 'Steal a car and deliver it to the chop shop marker.',
    done: 'Chop shop paid out  +$1200',
  },
  {
    name: 'The Big Score',
    reward: 1500,
    kind: 'deliver',
    brief: 'Pick up the big score on foot, then deliver it to the far marker.',
    done: 'The Big Score delivered  +$1500',
  },
];

/** Pool sizes: every car, pedestrian, cop, particle and shot is allocated once, at boot. */
export const POOLS = { cars: 24, peds: 28, cops: 8, particles: 160, shots: 8 };

/** The city's colours, in hex. */
export const PALETTE = {
  sky: 0x87b5d6,
  fog: 0x9fc3dd,
  ground: 0x5d7a4a,
  road: 0x33363b,
  roadLine: 0xd8d8c8,
  sidewalk: 0x8a8d90,
  building: [0x9a8f7a, 0x7a8a9a, 0xa89a8a, 0x8a7a6a, 0x6a7a8a, 0xb0a090],
  buildingRoof: 0x4a4a52,
  park: 0x4a7a3a,
  tree: 0x2f6a2a,
  trunk: 0x6a4a2a,
  player: 0x3fa7ff,
  playerShirt: 0x2f8fe8,
  police: 0x1a1a2e,
  policeLight: 0xff2a2a,
  particle: 0xffa030,
  marker: 0xffd21f,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress lives between visits (this browser only). */
export const SAVE_KEY = 'sunvale-3d.save.v1';
