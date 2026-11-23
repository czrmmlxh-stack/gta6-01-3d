// Sunvale 3D — boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between four screens: title, play, paused and game over.
// Progress (money, missions, pistol) is saved to localStorage when a mission completes
// and on game over.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_MISSION, EVENT_OVER, EVENT_SHOT, EVENT_STEAL } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { SHOT_SEED, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SHOT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);
const audio = createAudio();
let saveData = null;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: Math.max(0, Math.floor(data.money || 0)),
      missionIndex: Math.max(0, Math.min(MISSIONS.length, Math.floor(data.missionIndex || 0))),
      hasPistol: data.hasPistol === true,
    };
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.state.player.money,
      missionIndex: world.state.missionIndex,
      hasPistol: world.state.player.hasPistol,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function applySave() {
  if (!saveData) return;
  world.state.player.money = saveData.money;
  world.state.player.hasPistol = saveData.hasPistol;
  if (saveData.missionIndex > 0) world.setMission(saveData.missionIndex);
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(scene.screen, saveData, STEP);
    painted += 1;
    // Paint many frames so the third-person camera lerps from its start pose to behind
    // the player before the screenshot is taken.
    if (painted < 45) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let shootTarget = null;
  const input = createInput(canvas, (clientX, clientY) => {
    const pt = renderer.groundPoint(clientX, clientY);
    if (pt) shootTarget = pt;
  });
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  saveData = readSave();
  if (saveData) applySave();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    applySave();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Marla has twenty jobs for you.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    writeSave();
    saveData = readSave();
    announce(world.state.busted ? 'Busted. The cops got you.' : 'Wasted. Sunvale got the better of you.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_MISSION) audio.mission();
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_MISSION) {
      // The pistol is Marla's gift: it appears in the player's hands once the first job is done.
      if (world.state.missionIndex === 1) world.state.player.hasPistol = true;
      saveData = {
        money: world.state.player.money,
        missionIndex: world.state.missionIndex,
        hasPistol: world.state.player.hasPistol,
      };
      writeSave();
    }
    if (events & EVENT_BUSTED) announce('Busted!');
    if (events & EVENT_OVER) endGame();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function buildInput() {
    const move = input.move();
    const actions = input.takeActions();
    return {
      up: move.up,
      down: move.down,
      left: move.left,
      right: move.right,
      sprint: move.sprint,
      enter: Boolean(actions & ACTION_ENTER),
      punch: Boolean(actions & ACTION_PUNCH),
      shoot: shootTarget,
    };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, {
        up: false, down: false, left: false, right: false,
        sprint: false, enter: false, punch: false, shoot: null,
      }, true);
      return;
    }
    const events = world.step(STEP, buildInput(), false);
    shootTarget = null;
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.player;
    const speed01 = p.inCar
      ? Math.min(1, Math.abs(p.inCar.speed) / 46)
      : Math.min(1, Math.abs(p.speed) / 15);
    audio.engine(speed01, Boolean(p.inCar));
    audio.siren(dt, world.stars());
    renderer.draw(screen, saveData, dt);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sunvale 3D. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
