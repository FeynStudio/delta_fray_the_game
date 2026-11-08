// Owns the single game state object and connects rules, rendering and (later) input.
import { createInitialState } from './rules.js';
import { drawFrame, fitCanvas } from './render.js';
import log from './log.js';

let state = createInitialState();

const canvas = document.getElementById('game');
let ctx = null;

function render() {
  ctx = fitCanvas(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  drawFrame(ctx, state);
}

window.addEventListener('resize', render);
render();
log.info('game started', state);

if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    getState: () => structuredClone(state),
  };
}
