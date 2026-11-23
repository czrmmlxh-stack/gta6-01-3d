// Sunvale 3D — bootstrap. Builds the world, wires input, audio and
// the renderer, and runs the frame loop. Also owns the overlays,
// the save in localStorage, and the ?shot= screenshot presets.

import { WORLD } from './config.js';
import { createWorld, startGame, stepWorld, snapshot } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'sunvale3d-save-v1';

export function start() {
  const container = document.getElementById('game');
  const world = createWorld();
  const input = createInput();
  const audio = createAudio();
  const view = createRenderer(container, world);

  function resize() {
    view.resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot(world)));
    } catch (err) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  window.__sunvaleStart = () => {
    audio.unlock();
    view.hideOverlays();
    if (!world.started) {
      startGame(world);
      save();
    }
  };
  window.__sunvaleResume = () => {
    view.hideOverlays();
    world.paused = false;
  };
  window.__sunvaleRestart = () => {
    audio.engineStop();
    audio.sirenStop();
    const fresh = createWorld();
    Object.keys(world).forEach((k) => delete world[k]);
    Object.assign(world, fresh);
    view.hideOverlays();
    startGame(world);
    save();
  };

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const isShot = shot === '1-start' || shot === '2-play' || shot === '3-chase' || shot === '4-end';

  // Exposed for debugging and screenshot checks.
  window.__world = world;
  window.__view = view;

  if (isShot) {
    // Deterministic screenshot mode: no title screen, no save.
    applyShot(world, shot);
    view.hideOverlays();
    if (shot === '1-start') view.showTitle();
    if (shot === '4-end') view.showComplete();
  } else {
    const prev = load();
    if (prev && prev.jobsDone > 0) {
      // Returning player: restore cash, respect and progress.
      world.cash = prev.cash || 0;
      world.respect = prev.respect || 0;
      world.stats.jobsDone = prev.jobsDone || 0;
      world.stats.stolen = prev.stolen || 0;
      world.stats.delivered = prev.delivered || 0;
    }
    view.showTitle();
  }

  input.attach();
  let last = performance.now();
  let saveTimer = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!isShot && input.wasPressed('p')) {
      if (world.started && !world.arrested && !world.allDone) {
        world.paused = !world.paused;
        if (world.paused) view.showPause();
        else view.hideOverlays();
      }
    }
    if (!isShot && input.wasPressed('Escape')) {
      if (world.started && !world.arrested && !world.allDone) {
        world.paused = !world.paused;
        if (world.paused) view.showPause();
        else view.hideOverlays();
      }
    }

    const axes = input.moveAxes();
    stepWorld(world, {
      axes,
      run: input.run,
      brake: input.brake,
      pressed: { e: input.wasPressed('e'), f: input.wasPressed('f'), g: input.wasPressed('g') },
    }, dt, audio);
    input.endFrame();

    if (world.wanted > 0) audio.sirenStart();
    else audio.sirenStop();

    if (world.arrested && !isShot) view.showBusted();
    if (world.allDone && !isShot) view.showComplete();

    saveTimer += dt;
    if (saveTimer > 5) {
      saveTimer = 0;
      if (world.started) save();
    }

    view.update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Auto-start when loaded as the page's module script.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
