// Owns the single game state object and connects rules, input and rendering.
import { createInitialState, endTurn, resolveMove, scoreMove } from './rules.js';
import {
  keyFromEvent, moveFromGauge, pressKey, startExplosions, startMove, stepExplosions, stepGauge, stepMove,
} from './input.js';
import { drawFrame, fitCanvas } from './render.js';
import log from './log.js';

// clock (T-010): game time in ms, advanced only by step(ms); render.js reads it for the protection blink.
let state = { ...createInitialState(), clock: 0 };

const canvas = document.getElementById('game');
let ctx = null;

function fit() {
  ctx = fitCanvas(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  drawFrame(ctx, state);
}

// Same path for real keys and the debug API. The second Space launches the move: the end state comes
// from rules.resolveMove (hits and walls), and the animation only shows the ship getting there.
// The move's new scores (rules.scoreMove, T-012) wait in anim.scores until the move ends.
function press(key) {
  const launching = state.gauge.phase === 'direction';
  state = pressKey(state, key);
  if (launching && state.gauge.phase === 'moving') {
    const end = resolveMove(state, moveFromGauge(state));
    const scores = scoreMove(state, end);
    state = startMove(state, end);
    state = { ...state, anim: { ...state.anim, scores } };
  }
}

// Advances the game clock: the gauge sweep, or the move animation while a move runs. In the step
// where the move animation finishes, the resolved end state is in place and rules.endTurn runs once:
// destroyed ships respawn and the other player's turn starts on the power gauge. No turn timer.
// Explosions (T-007) age on every step and start, one per destroyed ship, in that same step, just
// before endTurn respawns the ships; they never hold up or change the turn.
// The scores change in that same step (T-012), so they never change before the player sees the hit.
// The game clock (state.clock, T-010) grows by exactly ms on every step; a state without it starts at 0.
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
