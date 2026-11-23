// Keyboard input state. Tracks which keys are held and fires one-shot
// presses (E to enter/exit a car, F to punch, G to fire the pistol,
// P or Escape to pause). The world reads this every frame.

export function createInput() {
  const keys = new Set();
  const pressed = new Set();
  let attached = false;

  function onDown(ev) {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
      ev.preventDefault();
    }
  }

  function onUp(ev) {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    keys.delete(k);
  }

  return {
    attach() {
      if (attached) return;
      attached = true;
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
    },
    detach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    },
    held(k) {
      return keys.has(k);
    },
    // True once per physical press; consumed by the caller each frame.
    wasPressed(k) {
      return pressed.has(k);
    },
    endFrame() {
      pressed.clear();
    },
    // WASD + arrows, as a -1..1 pair. x: right, z: forward.
    moveAxes() {
      let x = 0;
      let z = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('ArrowUp')) z -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) z += 1;
      return { x, z };
    },
    get run() {
      return keys.has('Shift');
    },
    get brake() {
      return keys.has(' ');
    },
  };
}
