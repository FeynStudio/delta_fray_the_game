import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { createInitialState, endTurn, resolveMove } from '../src/rules.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const ship = (x, y, heading, alive = true) => ({ x, y, heading, alive });
const spawnShip = (i) => ({ ...config.spawns[i], alive: true, unmovedSinceSpawn: true });

test('a destroyed ship respawns at its spawn point; the living ship is unchanged; turn 0 -> 1', () => {
  const living = ship(350, 480, 0);
  const s = deepFreeze({ turn: 0, ships: [living, ship(300, 490, 180, false)] });
  const out = endTurn(s);
  assert.deepEqual(out.ships[1], spawnShip(1));
  assert.equal(out.ships[0], living, 'the living ship is the same object, untouched');
  assert.equal(out.turn, 1);
});

test('turn 1 -> 0, and a move with no destruction respawns nothing', () => {
  const s = deepFreeze({ turn: 1, ships: [ship(190, 480, 0), ship(990, 480, 180)] });
  const out = endTurn(s);
  assert.equal(out.turn, 0);
  assert.deepEqual(out.ships, s.ships);
});

test('double kill: both ships respawn and the turn changes exactly once (no skipped turn)', () => {
  for (const turn of [0, 1]) {
    const s = deepFreeze({ turn, ships: [ship(1280, 480, 0, false), ship(1220, 480, 180, false)] });
    const out = endTurn(s);
    assert.deepEqual(out.ships, [spawnShip(0), spawnShip(1)]);
    assert.equal(out.turn, 1 - turn);
  }
});

test('the mover destroyed by the wall respawns at its own spawn point', () => {
  const s = deepFreeze({ turn: 0, ships: [ship(1200, 480, 0), ship(600, 200, 180)] });
  const out = endTurn(resolveMove(s, deepFreeze({ distance: config.maxMove, angle: 0 })));
  assert.deepEqual(out.ships[0], spawnShip(0));
  assert.deepEqual(out.ships[1], s.ships[1]);
  assert.equal(out.turn, 1);
});

test('reads config.spawns at call time (override)', () => {
  config.spawns = [{ x: 100, y: 200, heading: 45 }, { x: 900, y: 700, heading: 225 }];
  const s = deepFreeze({ turn: 0, ships: [ship(10, 10, 0, false), ship(20, 20, 0, false)] });
  const out = endTurn(s);
  assert.deepEqual(out.ships, [
    { x: 100, y: 200, heading: 45, alive: true, unmovedSinceSpawn: true },
    { x: 900, y: 700, heading: 225, alive: true, unmovedSinceSpawn: true },
  ]);
});

test('respawned ships do not share objects with config', () => {
  const s = deepFreeze({ turn: 0, ships: [ship(10, 10, 0, false), ship(20, 20, 0)] });
  const out = endTurn(s);
  out.ships[0].x += 1;
  assert.equal(config.spawns[0].x, original.spawns[0].x);
});

test('other fields are carried over, and a state with no gauge works', () => {
  const start = createInitialState();
  const s = deepFreeze({ ...start, extra: { note: 'kept' } });
  const out = endTurn(s);
  assert.deepEqual(out.gauge, start.gauge);
  assert.deepEqual(out.extra, { note: 'kept' });
  const bare = deepFreeze({ turn: 0, ships: [ship(10, 10, 0, false), ship(20, 20, 0)] });
  const outBare = endTurn(bare);
  assert.equal('gauge' in outBare, false);
  assert.deepEqual(Object.keys(outBare).sort(), ['ships', 'turn']);
});

test('after endTurn no ship is left destroyed, so the player whose turn it is always has a live ship', () => {
  const cases = [[true, false], [false, true], [false, false], [true, true]];
  for (const [a, b] of cases) {
    for (const turn of [0, 1]) {
      const out = endTurn(deepFreeze({ turn, ships: [ship(400, 300, 0, a), ship(800, 600, 180, b)] }));
      assert.deepEqual(out.ships.map((sh) => sh.alive), [true, true]);
      assert.equal(out.ships[out.turn].alive, true);
    }
  }
});
