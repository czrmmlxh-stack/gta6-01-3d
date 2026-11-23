// Sunvale 3D — configuration: world constants, districts, and the
// full 20-mission list. Missions 0-9 are defined here; missions 10-19
// come from the four story chapters and are concatenated below.

import { chapterA } from './story/chapterA.js';
import { chapterB } from './story/chapterB.js';
import { chapterC } from './story/chapterC.js';
import { chapterD } from './story/chapterD.js';

export const WORLD = {
  HALF: 800,
  CLAMP: 796,
  MARKER_MAX: 780,
  SEED: 20261123,
  ROAD_EVERY: 200,
  ROAD_WIDTH: 26,
};

// Named places on the map. Every mission marker is one of these, so
// every target is always inside the reachable area.
export const DISTRICTS = {
  plaza: { x: 0, z: 0, label: 'Sunvale Plaza' },
  garage: { x: -400, z: 625, label: "Marla's Garage" },
  docks: { x: 600, z: -650, label: 'The Docks' },
  oldChurch: { x: -600, z: -480, label: 'Old Church' },
  casino: { x: 680, z: 600, label: 'Abandoned Casino' },
  safehouse: { x: -200, z: -700, label: 'Safehouse' },
  chopShop: { x: 600, z: 120, label: 'Chop Shop' },
  warehouse: { x: -700, z: 200, label: 'Warehouse Row' },
  market: { x: 200, z: -300, label: 'Sunvale Market' },
  pier: { x: 700, z: -200, label: 'Sunvale Pier' },
};

export const GARAGE = {
  x: -400,
  z: 625,
  radius: 16,
  cooldown: 20,
  bonus: 50,
};

export const RESPECT_MILESTONES = [
  { at: 5, text: 'RESPECT 5 — Sunvale knows your name.' },
  { at: 10, text: 'RESPECT 10 — The crew looks up to you.' },
];

// Act 1 — earning Marla's trust, one job at a time.
const firstAct = [
  {
    name: 'Borrowed Wheels',
    kind: 'steal',
    reward: 150,
    brief: "Marla: First job — borrow a car off the street and bring it to the plaza. Don't scratch it.",
    done: 'First wheels secured. Marla is watching.',
    dropoff: { x: 0, z: 0 },
  },
  {
    name: 'The Package',
    kind: 'deliver',
    reward: 300,
    brief: 'Marla: Pick up the package at the market and run it to the docks. No detours.',
    done: 'Package delivered. Clean and quick.',
    pickup: { x: 200, z: -300 },
    dropoff: { x: 600, z: -650 },
  },
  {
    name: 'Break the Dragnet',
    kind: 'evade',
    reward: 500,
    stars: 3,
    brief: 'Marla: Cops set a dragnet — three stars. Break it and get to the safehouse.',
    done: 'Dragnet broken. You drive like you mean it.',
    hideout: { x: -200, z: -700 },
  },
  {
    name: 'The Informant',
    kind: 'walk',
    reward: 600,
    brief: 'Marla: Walk to the old church and hear what the informant has to say.',
    done: 'The informant talked. Good intel.',
    target: { x: -600, z: -480 },
  },
  {
    name: 'The Getaway Car',
    kind: 'steal',
    reward: 700,
    brief: 'Marla: I need a clean getaway car. Take one and bring it to the chop shop.',
    done: 'Getaway car parked and ready.',
    dropoff: { x: 600, z: 120 },
  },
  {
    name: 'Hot Cargo',
    kind: 'deliver',
    reward: 800,
    brief: 'Marla: Hot cargo at the warehouse. Move it to the casino before it cools off.',
    done: 'Hot cargo delivered, still warm.',
    pickup: { x: -700, z: 200 },
    dropoff: { x: 680, z: 600 },
  },
  {
    name: 'Heat Wave',
    kind: 'evade',
    reward: 900,
    stars: 2,
    brief: 'Marla: Two stars on you. Ride out the heat wave and reach the pier.',
    done: 'Heat wave over. You kept your cool.',
    hideout: { x: 700, z: -200 },
  },
  {
    name: 'The Lookout',
    kind: 'walk',
    reward: 1000,
    brief: 'Marla: Walk up to the docks and keep an eye out. Report back when you are there.',
    done: 'Lookout posted. Eyes on the docks.',
    target: { x: 600, z: -650 },
  },
  {
    name: 'Chop Shop Run',
    kind: 'steal',
    reward: 1200,
    brief: 'Marla: The chop shop needs another car. Take one off the street and run it over.',
    done: 'Another car for the chop shop. Business is good.',
    dropoff: { x: 600, z: 120 },
  },
  {
    name: 'The Big Score',
    kind: 'deliver',
    reward: 1500,
    brief: 'Marla: The big one. Pick up at the casino and run it to the safehouse. This is the job that makes you.',
    done: 'The big score is in. You are one of us now.',
    pickup: { x: 680, z: 600 },
    dropoff: { x: -200, z: -700 },
  },
];

export const MISSIONS = [...firstAct, ...chapterA, ...chapterB, ...chapterC, ...chapterD];

export const TOTAL_REWARD = MISSIONS.reduce((sum, m) => sum + m.reward, 0);

// Every marker a mission can point at must sit inside the reachable area.
export function markersAreReachable() {
  const bad = [];
  for (const m of MISSIONS) {
    for (const key of ['target', 'pickup', 'dropoff', 'hideout']) {
      const p = m[key];
      if (p && (Math.abs(p.x) > WORLD.MARKER_MAX || Math.abs(p.z) > WORLD.MARKER_MAX)) {
        bad.push(`${m.name}.${key}`);
      }
    }
  }
  return bad;
}
