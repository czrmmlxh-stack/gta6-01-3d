// Screenshot presets. `?shot=<name>` puts the game into a fixed,
// deterministic scene for the four screenshots the entry ships with.
// The presets only move the player and set state — they never change
// the underlying data or the mission list.

import { DISTRICTS } from './config.js';
import { teleportPlayer, startMission } from './world.js';

export const SHOTS = {
  '1-start': {
    label: 'Title screen over the city',
    setup(w) {
      w.started = false;
      teleportPlayer(w, DISTRICTS.plaza.x, DISTRICTS.plaza.z + 24, 0.6);
    },
  },
  '2-play': {
    label: 'Gameplay with the mission HUD',
    setup(w) {
      w.started = true;
      startMission(w, 0);
      // Face the plaza beacon so the mission marker reads in the shot.
      teleportPlayer(w, 60, 60, -2.36);
      const car = w.cars[0];
      if (car) {
        car.x = 60;
        car.z = 52;
        car.angle = -2.36;
        car.speed = 0;
        car.kind = 'player';
        car.stolen = true;
        w.player.onFoot = false;
        w.player.carId = car.id;
        w.player.x = car.x;
        w.player.z = car.z;
        w.player.angle = car.angle;
      }
    },
  },
  '3-chase': {
    label: 'Police chase at three stars',
    setup(w) {
      w.started = true;
      startMission(w, 2);
      w.wanted = 3;
      w.heat = 100;
      teleportPlayer(w, -40, -40, Math.PI * 0.25);
      const car = w.cars[1];
      if (car) {
        car.x = -40;
        car.z = -48;
        car.angle = Math.PI * 0.25;
        car.speed = 0;
        car.kind = 'player';
        car.stolen = true;
        w.player.onFoot = false;
        w.player.carId = car.id;
        w.player.x = car.x;
        w.player.z = car.z;
        w.player.angle = car.angle;
      }
      // Two cop cars close behind, heli overhead.
      w.police = [];
      for (let i = 0; i < 2; i += 1) {
        w.police.push({
          id: 900 + i,
          x: -40 - (i + 1) * 14,
          z: -48 - (i + 1) * 10,
          angle: Math.PI * 0.25,
          speed: 20,
          color: 0x1c2733,
          kind: 'police',
          health: 100,
          ramCooldown: 0,
        });
      }
      // The heli circles at 0.55 rad/s but the software renderer runs the
      // loop at ~28% of wall speed, so after the ~5 s settle before the
      // screenshot only ~1.4 s of game time has passed. Start the angle
      // near 0 so it ends up dead ahead (facing ~0.79), low in frame.
      w.heli.active = true;
      w.heli.fade = 1;
      w.heli.angle = 0.0;
      w.heli.x = -40 + Math.sin(0.0) * 46;
      w.heli.z = -40 + Math.cos(0.0) * 46;
      w.heli.height = 20;
      w.heli.spotlight = false;
    },
  },
  '4-end': {
    label: 'Mission complete — the Viper War won',
    setup(w) {
      w.started = true;
      w.cash = 36150;
      w.respect = 45;
      w.mission.index = 19;
      w.allDone = true;
      w.banners = [{ text: 'THE VIPERS ARE FINISHED — SUNVALE IS OURS', t: 0, dur: 99 }];
      teleportPlayer(w, DISTRICTS.casino.x - 30, DISTRICTS.casino.z - 20, Math.PI * 0.8);
      const car = w.cars[2];
      if (car) {
        car.x = DISTRICTS.casino.x - 30;
        car.z = DISTRICTS.casino.z - 28;
        car.angle = Math.PI * 0.8;
        car.speed = 0;
        car.kind = 'player';
        car.stolen = true;
        w.player.onFoot = false;
        w.player.carId = car.id;
        w.player.x = car.x;
        w.player.z = car.z;
        w.player.angle = car.angle;
      }
    },
  },
};

export function applyShot(w, name) {
  const shot = SHOTS[name];
  if (!shot) return false;
  shot.setup(w);
  return true;
}
