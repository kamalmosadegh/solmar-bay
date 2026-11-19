// Keyboard + mouse input. Tracks held keys, the mouse position in screen
// space, and one-shot presses (E, Space, P, M, Enter) the game consumes.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),   // keys pressed since the last consume
    mouseX: 0, mouseY: 0,
    mouseDown: false,
    mouseClicked: false,  // set on mousedown, consumed by the game
    clickX: 0, clickY: 0,
  };

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyE: 'enter', Space: 'action', KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute', Enter: 'confirm', KeyF: 'punch',
  };

  window.addEventListener('keydown', (e) => {
    const name = KEYMAP[e.code];
    if (name) {
      e.preventDefault();
      if (!input.keys.has(name)) input.pressed.add(name);
      input.keys.add(name);
    }
  });
  window.addEventListener('keyup', (e) => {
    const name = KEYMAP[e.code];
    if (name) input.keys.delete(name);
  });
  window.addEventListener('blur', () => input.keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
    input.mouseDown = true;
    input.mouseClicked = true;
    input.clickX = input.mouseX;
    input.clickY = input.mouseY;
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });

  return input;
}

/** True once per physical press; the game calls this to consume it. */
export function wasPressed(input, name) {
  if (input.pressed.has(name)) {
    input.pressed.delete(name);
    return true;
  }
  return false;
}

export function endFrame(input) {
  input.pressed.clear();
  input.mouseClicked = false;
}
