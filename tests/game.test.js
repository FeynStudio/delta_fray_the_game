// Loads the real src/game.js in Node with a minimal stubbed DOM and ?debug=1, then drives the move
// through window.__game (pattern: tests/rules.test.js; values come from config).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { applyMove, createInitialState } from '../src/rules.js';

const listeners = {};
let game;

before(async () => {
  const ctx = new Proxy({}, { get: () => () => {} }); // every canvas call is a no-op
  globalThis.document = { getElementById: () => ({ style: {}, getContext: () => ctx }) };
  globalThis.window = {
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  globalThis.location = { search: '?debug=1' };
  globalThis.requestAnimationFrame = () => 0; // the loop is driven by step() in these tests
  await import('../src/game.js');
  game = window.__game;
});

beforeEach(() => game.setState(createInitialState()));

const T = () => config.moveAnimMs;
const near = (a, b) => Math.abs(a - b) < 1e-3;

// From the spawn state: lock power, lock the needle (optionally backward), press the second Space.
function launch(power, needle, backward = false) {
  const s = game.getState();
  game.setState({ ...s, gauge: { ...s.gauge, power } });
  game.press('Space');
  if (backward) game.press('Shift');
  const d = game.getState();
  game.setState({ ...d, gauge: { ...d.gauge, needle } });
  game.press('Space');
}

test('second Space flies ship 0 to the applyMove end point; gauge back to power, same turn', () => {
  const start = createInitialState();
  launch(0.6, 30);
  game.step(T() + 1);
  const end = applyMove(start, { distance: 0.6 * config.maxMove, angle: 30 }).ships[0];
  const s = game.getState();
  assert.ok(near(s.ships[0].x, end.x) && near(s.ships[0].y, end.y), JSON.stringify(s.ships[0]));
  assert.equal(s.ships[0].heading, 30);
  assert.deepEqual(s.ships[1], start.ships[1]);
  assert.equal(s.turn, 0);
  assert.equal(s.gauge.phase, 'power');
});

test('with Shift the ship moves toward its tail side and keeps its heading', () => {
  const start = createInitialState().ships[0];
  launch(0.5, 0, true);
  game.step(T() + 1);
  const s = game.getState().ships[0];
  const angle = start.heading + 180;
  const end = applyMove(createInitialState(), { distance: 0.5 * config.maxMove, angle, backward: true }).ships[0];
  assert.ok(near(s.x, end.x) && near(s.y, end.y), JSON.stringify(s));
  assert.ok(s.x < start.x, 'moved toward the tail (heading 0, so -x)');
  assert.equal(s.heading, start.heading);
});

test('halfway: still moving, Space and Shift change nothing, ship not yet at its end point', () => {
  launch(0.6, 30);
  game.step(T() / 2);
  const mid = game.getState();
  assert.equal(mid.gauge.phase, 'moving');
  game.press('Space');
  game.press('Shift');
  assert.deepEqual(game.getState(), mid);
  const end = applyMove(createInitialState(), { distance: 0.6 * config.maxMove, angle: 30 }).ships[0];
  assert.ok(Math.hypot(end.x - mid.ships[0].x, end.y - mid.ships[0].y) > 1, 'not at the end yet');
});

test('a large step never takes the ship past the applyMove end point', () => {
  launch(1, -45);
  game.step(T() * 50);
  const end = applyMove(createInitialState(), { distance: config.maxMove, angle: 315 }).ships[0];
  const s = game.getState().ships[0];
  assert.ok(near(s.x, end.x) && near(s.y, end.y), JSON.stringify(s));
  assert.equal(s.heading, 315);
});

test('a real Space keydown launches the move like press(); key repeat is ignored', () => {
  const key = (code, repeat = false) => listeners.keydown({ code, repeat, preventDefault: () => {} });
  key('Space');
  key('Space', true);
  assert.equal(game.getState().gauge.phase, 'direction');
  key('Space');
  assert.equal(game.getState().gauge.phase, 'moving');
  game.step(T());
  assert.equal(game.getState().gauge.phase, 'power');
});
