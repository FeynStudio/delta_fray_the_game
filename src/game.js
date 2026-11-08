// Owns the single game state object and connects rules, input and rendering.
import { createInitialState } from './rules.js';
import { keyFromEvent, pressKey, stepGauge } from './input.js';
import { drawFrame, fitCanvas } from './render.js';
import log from './log.js';

let state = createInitialState();

const canvas = document.getElementById('game');
let ctx = null;

function fit() {
  ctx = fitCanvas(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  drawFrame(ctx, state);
}

// Same path for real keys and the debug API.
function press(key) {
  state = pressKey(state, key);
}

// Advances the game clock. For now only the gauge sweep; the move animation comes in a later slice.
function step(ms) {
  state = stepGauge(state, ms);
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') event.preventDefault(); // Space must not scroll the page
  const key = keyFromEvent(event);
  if (key) press(key);
});

let last = null;
function loop(now) {
  if (last !== null) step(now - last);
  last = now;
  drawFrame(ctx, state);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', fit);
fit();
requestAnimationFrame(loop);
log.info('game started', state);

if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    getState: () => structuredClone(state),
    setState: (next) => { state = structuredClone(next); },
    press,
    step,
  };
}
