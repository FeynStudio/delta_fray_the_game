// Pattern for rules tests: import config and rules, read expected values from config,
// restore any config change after the test, and check that inputs are not mutated.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { createInitialState } from '../src/rules.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

test('createInitialState starts on turn 0 with both ships alive at their spawns', () => {
  const state = createInitialState();
  assert.equal(state.turn, 0);
  assert.equal(state.ships.length, 2);
  state.ships.forEach((ship, i) => {
    assert.deepEqual(ship, { ...config.spawns[i], alive: true, unmovedSinceSpawn: true });
  });
  assert.ok('gauge' in state);
});

test('createInitialState reads config at call time', () => {
  config.spawns = [{ x: 100, y: 200, heading: 45 }, config.spawns[1]];
  const state = createInitialState();
  assert.deepEqual(state.ships[0], { x: 100, y: 200, heading: 45, alive: true, unmovedSinceSpawn: true });
});

test('createInitialState does not share objects with config', () => {
  const state = createInitialState();
  state.ships[0].x += 1;
  assert.equal(config.spawns[0].x, original.spawns[0].x);
});
