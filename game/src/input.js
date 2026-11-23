// Keyboard and pointer input. Held keys are movement; one-shot presses (confirm, pause,
// enter a car, punch) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. A mouse click is a shot
// request carrying the world point the renderer worked out from the cursor.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);

export function createInput(target, onShoot) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sprint = false;
  let queued = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SPRINT.has(event.code)) sprint = true;
    else if (ENTER.has(event.code)) {
      if (!event.repeat) queued |= ACTION_ENTER;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) queued |= ACTION_CONFIRM | ACTION_PUNCH;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) queued |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SPRINT.has(event.code)) sprint = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of all of them.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sprint = false;
  });
  target.addEventListener('pointerdown', (event) => {
    if (event.button === 0) onShoot(event.clientX, event.clientY);
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The held movement keys, as an object the world steps with. */
    move() {
      return { up, down, left, right, sprint };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}
