import { createInitialState, endTurn, resolveMove, scoreMove } from './rules.js';
import {
  keyFromEvent, moveFromGauge, pressKey, startExplosions, startMove, stepExplosions, stepGauge, stepMove,
} from './input.js';
import { drawFrame, fitCanvas } from './render.js';
import log from './log.js';

let state = { ...createInitialState(), clock: 0 };

const canvas = document.getElementById('game');
let ctx = null;

function fit() {
  ctx = fitCanvas(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  drawFrame(ctx, state);
}

function press(key) {
  const launching = state.gauge.phase === 'direction';
  state = pressKey(state, key);
  if (launching && state.gauge.phase === 'moving') {
    const end = resolveMove(state, moveFromGauge(state));
    const scores = scoreMove(state, end);
    const moving = startMove(state, end);
    state = { ...moving, anim: { ...moving.anim, scores } };
  }
}

function step(ms) {
  state = { ...state, clock: (state.clock ?? 0) + ms };
  const wasMoving = Boolean(state.anim);
  const scores = state.anim?.scores;
  state = stepMove(stepGauge(stepExplosions(state, ms), ms), ms);
  if (wasMoving && !state.anim) {
    if (scores) state = { ...state, scores };
    state = endTurn(startExplosions(state));
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') event.preventDefault();
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
