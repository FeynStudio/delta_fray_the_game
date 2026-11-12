import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { createInitialState, currentScores, endTurn, resolveMove, scoreMove } from '../src/rules.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

const deepFreeze = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};

function play(turn, ships, move, scores) {
  const before = deepFreeze({ turn, ships, ...(scores ? { scores } : {}) });
  const after = deepFreeze(resolveMove(before, move));
  return { before, after, scores: scoreMove(before, after) };
}

const KILL = [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }];
const WALL = [{ x: 1200, y: 480, heading: 0, alive: true }, { x: 600, y: 200, heading: 180, alive: true }];
const HIT_THEN_WALL = [{ x: 1150, y: 480, heading: 0, alive: true }, { x: 1220, y: 480, heading: 180, alive: true }];
const full = () => ({ distance: config.maxMove, angle: 0 });

test('createInitialState starts both scores at config.scoreStart (0)', () => {
  assert.equal(config.scoreStart, 0);
  assert.deepEqual(createInitialState().scores, [0, 0]);
});

test('a kill gives the mover +1 and leaves the other score alone', () => {
  const { after, scores } = play(0, KILL, full(), [3, 5]);
  assert.equal(after.ships[1].alive, false, 'resolveMove destroys the enemy');
  assert.deepEqual(scores, [3 + config.scoreKill, 5]);
  assert.equal(config.scoreKill, 1);
});

test('a wall death gives the mover -2', () => {
  const { after, scores } = play(0, WALL, full(), [0, 0]);
  assert.equal(after.ships[0].alive, false);
  assert.equal(after.ships[1].alive, true);
  assert.deepEqual(scores, [-2, 0]);
  assert.equal(config.scoreWall, -2);
});

test('hit-then-wall gives the mover -1 in total and leaves the other score unchanged', () => {
  const { after, scores } = play(0, HIT_THEN_WALL, full(), [4, 7]);
  assert.equal(after.ships[0].alive, false);
  assert.equal(after.ships[1].alive, false);
  assert.deepEqual(scores, [3, 7]);
});

test('a plain move changes nothing', () => {
  const { scores } = play(0, KILL, { distance: 10, angle: 270 }, [2, 1]);
  assert.deepEqual(scores, [2, 1]);
});

test('a kill by player 2 changes only player 2\'s score', () => {
  const ships = [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }];
  const { after, scores } = play(1, ships, { distance: config.maxMove, angle: 180 }, [0, 0]);
  assert.equal(after.ships[0].alive, false);
  assert.deepEqual(scores, [0, 1]);
});

test('a wall death at 0 gives -2 and a second one gives -4 (no clamping at 0)', () => {
  const first = play(0, WALL, full(), [0, 0]).scores;
  assert.deepEqual(first, [-2, 0]);
  const second = play(0, WALL, full(), first).scores;
  assert.deepEqual(second, [-4, 0]);
});

test('a refused move over maxMove changes nothing', () => {
  const { before, after, scores } = play(0, WALL, { distance: config.maxMove + 1, angle: 0 }, [1, 1]);
  assert.equal(after, before, 'resolveMove refuses the move');
  assert.deepEqual(scores, [1, 1]);
});

test('sweeping a spawn-protected enemy scores nothing (T-006)', () => {
  const spawn = config.spawns[1];
  const mover = { x: spawn.x - 90, y: spawn.y, heading: 0, alive: true };
  const enemy = { ...spawn, alive: true, unmovedSinceSpawn: true };
  const move = { distance: 100, angle: 0 };
  const protectedRun = play(0, [mover, enemy], move, [0, 0]);
  assert.equal(protectedRun.after.ships[1].alive, true, 'protected enemy survives');
  assert.equal(protectedRun.after.ships[0].alive, true, 'mover stays inside the map');
  assert.deepEqual(protectedRun.scores, [0, 0]);
  const open = play(0, [mover, { ...enemy, unmovedSinceSpawn: false }], move, [0, 0]);
  assert.deepEqual(open.scores, [1, 0]);
});

test('a state without scores starts from [0, 0]', () => {
  assert.deepEqual(currentScores(deepFreeze({ turn: 0, ships: KILL })), [0, 0]);
  assert.deepEqual(play(0, KILL, full()).scores, [1, 0]);
  assert.deepEqual(play(0, WALL, full()).scores, [-2, 0]);
});

test('points overridden in config are used, read at call time', () => {
  config.scoreStart = 10;
  config.scoreKill = 5;
  config.scoreWall = -7;
  assert.deepEqual(createInitialState().scores, [10, 10]);
  assert.deepEqual(play(0, KILL, full()).scores, [15, 10]);
  assert.deepEqual(play(0, WALL, full()).scores, [3, 10]);
  assert.deepEqual(play(0, HIT_THEN_WALL, full(), [0, 0]).scores, [-2, 0]);
});

test('scoreMove never mutates its inputs and returns a new array', () => {
  const { before, scores } = play(0, KILL, full(), [0, 0]);
  assert.notEqual(scores, before.scores);
  assert.deepEqual(before.scores, [0, 0]);
});

test('endTurn keeps scores unchanged', () => {
  const { after, scores } = play(0, HIT_THEN_WALL, full(), [0, 0]);
  const ended = endTurn(deepFreeze({ ...after, scores }));
  assert.deepEqual(ended.scores, [-1, 0]);
  assert.equal(ended.turn, 1);
});
