// Owns the single game state object and connects rules, input and rendering.
import { applyMove, createInitialState } from './rules.js';
import { keyFromEvent, moveFromGauge, pressKey, startMove, stepGauge, stepMove } from './input.js';
import { drawFrame, fitCanvas } from './render.js';
import log from './log.js';

let state = createInitialState();

const canvas = document.getElementById('game');
let ctx = null;

function fit() {
  ctx = fitCanvas(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  drawFrame(ctx, state);
}

// Same path for real keys and the debug API. The second Space launches the move: the end state comes
// from rules.applyMove, and the animation only shows the ship getting there.
function press(key) {
  const launching = state.gauge.phase === 'direction';
  state = pressKey(state, key);
  if (launching && state.gauge.phase === 'moving') {
    state = startMove(state, applyMove(state, moveFromGauge(state)));
  }
}

// Advances the game clock: the gauge sweep, or the move animation while a move runs.
// Passing the turn (endTurn) comes with the turns slice.
function step(ms) {
  state = stepMove(stepGauge(state, ms), ms);
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
