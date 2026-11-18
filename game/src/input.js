// Keyboard and mouse input for SUNSET HEIST, including pointer lock for the
// third-person orbit camera. Shot/staged mode never requests pointer lock.
import { S } from './state.js';

export const keys = {};
export const mouse = { dx: 0, dy: 0, down: false, clicked: false };
let pointerLocked = false;

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    if (S.mode === 'playing' && !S.shotMode && !pointerLocked) {
      try { canvas.requestPointerLock(); } catch (e) { /* pointer lock unavailable */ }
    }
  });
}

export function consumeMouse() {
  const dx = mouse.dx, dy = mouse.dy;
  mouse.dx = 0; mouse.dy = 0;
  const clicked = mouse.clicked; mouse.clicked = false;
  return { dx, dy, clicked };
}
export function isPointerLocked() { return pointerLocked; }
export function exitPointerLock() { if (document.pointerLockElement) document.exitPointerLock(); }
