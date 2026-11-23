// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// that drives the player's car along the road grid toward a goal — so the frame is what
// a short game really looks like, and the same seed always gives the same frame.

import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { adjacentIntersections, nearestIntersection } from './city.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 20;
const END_LIMIT_SECONDS = 120;
export const SHOT_SEED = 20261123;

const IDLE = {
  up: false, down: false, left: false, right: false,
  sprint: false, enter: false, punch: false, shoot: null,
};

function wrapAngle(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Steering input that drives the player's car toward a point. */
function steerToward(car, tx, tz) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  const d = wrapAngle(want, car.angle);
  return {
    up: Math.abs(d) < 1.1,
    down: false,
    left: d > 0.12,
    right: d < -0.12,
    sprint: false, enter: false, punch: false, shoot: null,
  };
}

/**
 * A greedy road navigator: it keeps a waypoint intersection, and when the car reaches
 * it, picks the neighbouring intersection closest to the goal. Returns the drive input
 * toward the waypoint.
 */
function buildNavigator(world, goal) {
  const state = world.state;
  const intersections = state.city.intersections;
  let waypoint = nearestIntersection(state.player.x, state.player.z, intersections);
  return function input() {
    const car = state.player.inCar;
    if (!car) return IDLE;
    const dx = waypoint.x - car.x;
    const dz = waypoint.z - car.z;
    if (dx * dx + dz * dz < 15 * 15) {
      const next = adjacentIntersections(waypoint, intersections);
      let best = waypoint;
      let bd = Infinity;
      for (const q of next) {
        const d = (q.x - goal.x) ** 2 + (q.z - goal.z) ** 2;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      waypoint = best;
    }
    return steerToward(car, waypoint.x, waypoint.z);
  };
}

/** Put the player in a nearby traffic car — stealing it, as the game allows. */
function stealCar(world) {
  const state = world.state;
  let car = null;
  for (const c of state.cars) {
    if (c.active && !c.isPolice && !c.isPlayer) {
      car = c;
      break;
    }
  }
  if (!car) return false;
  state.player.x = car.x + 3;
  state.player.z = car.z + 3;
  world.enterExitCar();
  return state.player.inCar === car;
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name is start)
 * and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, IDLE, true);
    return { screen: SCREEN_TITLE };
  }

  if (name === 'chase') {
    // Three stars before the drive starts, so the police are already closing in; the
    // heat decays during the chase and it is still two stars when the frame is taken.
    state.wantedHeat = 90;
    state.lastCrimeAt = 0;
  }
  stealCar(world);
  if (name === 'chase') {
    // Stealing added heat; put it back to exactly three stars.
    state.wantedHeat = 90;
    state.lastCrimeAt = 0;
  } else {
    state.wantedHeat = 0;
  }

  const goal = name === 'end'
    ? { x: state.missionMarker.x, z: state.missionMarker.z }
    : { x: 600, z: -600 };
  const navigate = buildNavigator(world, goal);
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'chase' ? CHASE_SECONDS : PLAY_SECONDS;
  let missionDone = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = world.step(STEP, navigate(), false);
    if (name === 'end' && state.missionIndex >= 1) {
      missionDone = true;
      break;
    }
    if (events & EVENT_OVER) break;
  }
  if (name === 'end' && missionDone) {
    // A couple of seconds more so the mission-complete banner is on screen.
    for (let i = 0; i < 2 / STEP; i += 1) world.step(STEP, IDLE, false);
  }
  return { screen: state.gameOver ? SCREEN_OVER : SCREEN_PLAY };
}
