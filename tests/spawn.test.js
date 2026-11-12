import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { applyMove, createInitialState, endTurn, isSpawnProtected, resolveMove } from '../src/rules.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const move = (distance, angle, backward = false) => deepFreeze({ distance, angle, backward });
const alive = (s) => s.ships.map((sh) => sh.alive);
const onSpawn1 = (unmoved) => {
  const sp = config.spawns[1];
  const sh = { x: sp.x, y: sp.y, heading: sp.heading, alive: true };
  return unmoved === undefined ? sh : { ...sh, unmovedSinceSpawn: unmoved };
};
const attacker = () => ({ x: config.spawns[1].x - 110, y: config.spawns[1].y, heading: 0, alive: true });

test('(1) at game start, player 1 sweeping over player 2 on its spawn point leaves player 2 alive', () => {
  const init = createInitialState();
  assert.equal(isSpawnProtected(init, 0), true);
  assert.equal(isSpawnProtected(init, 1), true);
  const s = deepFreeze({ ...init, ships: [{ ...init.ships[0], ...attacker() }, init.ships[1]] });
  const out = resolveMove(s, move(config.maxMove, 0));
  assert.deepEqual(alive(out), [true, true]);
  assert.deepEqual(out.ships[1], init.ships[1], 'the protected ship is untouched');
  assert.equal(out.ships[0].x, s.ships[0].x + config.maxMove, 'the mover still makes its whole move');
});

test('(2) a ship on its spawn point that has moved since spawning is destroyed', () => {
  const s = deepFreeze({ turn: 0, ships: [attacker(), onSpawn1(false)] });
  assert.equal(isSpawnProtected(s, 1), false);
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, false]);
});

test('(3) unmovedSinceSpawn: true but 1 unit off the spawn point is not protected and is destroyed', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const off = { ...onSpawn1(true), x: config.spawns[1].x + dx, y: config.spawns[1].y + dy };
    const s = deepFreeze({ turn: 0, ships: [attacker(), off] });
    assert.equal(isSpawnProtected(s, 1), false, `offset ${dx},${dy}`);
    assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, false], `offset ${dx},${dy}`);
  }
});

test('(4) a ship respawned by endTurn is protected until its own next move (also distance 0), then not', () => {
  const sp = config.spawns[0];
  const hunter = { x: sp.x + 110, y: sp.y, heading: 180, alive: true };
  const s0 = deepFreeze({ turn: 1, ships: [{ x: 500, y: 300, heading: 0, alive: false }, hunter] });
  const respawned = deepFreeze(endTurn(s0));
  assert.equal(respawned.turn, 0);
  assert.deepEqual(respawned.ships[0], { ...sp, alive: true, unmovedSinceSpawn: true });
  assert.equal(isSpawnProtected(respawned, 0), true);
  const sweptEarly = resolveMove(deepFreeze({ ...respawned, turn: 1 }), move(config.maxMove, 180));
  assert.deepEqual(alive(sweptEarly), [true, true]);
  const ownMove = deepFreeze(resolveMove(respawned, move(0, 0)));
  assert.equal(ownMove.ships[0].x, sp.x);
  assert.equal(ownMove.ships[0].y, sp.y);
  assert.equal(ownMove.ships[0].unmovedSinceSpawn, false);
  assert.equal(isSpawnProtected(ownMove, 0), false);
  const next = deepFreeze(endTurn(ownMove));
  assert.equal(next.turn, 1);
  assert.equal(next.ships[0].unmovedSinceSpawn, false, 'endTurn keeps a living ship as it is');
  assert.deepEqual(alive(resolveMove(next, move(config.maxMove, 180))), [false, true]);
});

test('(5) a config.spawns override moves the protected point', () => {
  config.spawns = [{ x: 300, y: 300, heading: 0 }, { x: 600, y: 300, heading: 180 }];
  const init = createInitialState();
  const s = deepFreeze({ ...init, ships: [{ ...init.ships[0], x: 490 }, init.ships[1]] });
  assert.equal(isSpawnProtected(s, 1), true);
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, true]);
  const oldSpot = { x: original.spawns[1].x, y: original.spawns[1].y, heading: 180, alive: true, unmovedSinceSpawn: true };
  const t = deepFreeze({ turn: 0, ships: [{ x: oldSpot.x - 110, y: oldSpot.y, heading: 0, alive: true }, oldSpot] });
  assert.equal(isSpawnProtected(t, 1), false);
  assert.deepEqual(alive(resolveMove(t, move(config.maxMove, 0))), [true, false]);
});

test('(6) a protected mover that reaches the wall still dies', () => {
  config.spawns = [{ x: 100, y: 480, heading: 180 }, original.spawns[1]];
  const s = deepFreeze(createInitialState());
  assert.equal(isSpawnProtected(s, 0), true);
  const out = resolveMove(s, move(config.maxMove, 180));
  assert.deepEqual(alive(out), [false, true]);
});

test('(7) hit then wall where the swept enemy is protected destroys only the mover', () => {
  config.spawns = [original.spawns[0], { x: 1220, y: 480, heading: 180 }];
  const init = createInitialState();
  const s = deepFreeze({ ...init, ships: [{ ...init.ships[0], x: 1150, y: 480 }, init.ships[1]] });
  assert.equal(isSpawnProtected(s, 1), true);
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [false, true]);
  const u = deepFreeze({ ...s, ships: [s.ships[0], { ...s.ships[1], unmovedSinceSpawn: false }] });
  assert.deepEqual(alive(resolveMove(u, move(config.maxMove, 0))), [false, false]);
});

test('(8) a ship with no unmovedSinceSpawn field on its spawn point is destroyed (scenario states)', () => {
  const s = deepFreeze({ turn: 0, ships: [attacker(), onSpawn1(undefined)] });
  assert.equal(isSpawnProtected(s, 1), false);
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, false]);
});

test('(9) isSpawnProtected is false for a ship with alive: false', () => {
  const s = deepFreeze({ turn: 0, ships: [attacker(), { ...onSpawn1(true), alive: false }] });
  assert.equal(isSpawnProtected(s, 1), false);
  assert.equal(isSpawnProtected(deepFreeze({ turn: 0, ships: [attacker(), onSpawn1(true)] }), 1), true);
});

test('applyMove clears only the mover\'s flag; a refused move keeps the state; endTurn sets it on respawn only', () => {
  const init = deepFreeze(createInitialState());
  const moved = applyMove(init, move(0, 0));
  assert.equal(moved.ships[0].unmovedSinceSpawn, false, 'a distance-0 move is an accepted move');
  assert.equal(moved.ships[1], init.ships[1], 'the other ship is untouched');
  const back = applyMove(init, move(config.maxMove / 2, 180, true));
  assert.equal(back.ships[0].unmovedSinceSpawn, false, 'a backward move ends protection too');
  assert.equal(applyMove(init, move(config.maxMove + 1, 0)), init, 'over maxMove: state unchanged');
  assert.equal(resolveMove(init, move(config.maxMove + 1, 0)), init);
  const s = deepFreeze({ turn: 0, ships: [{ ...init.ships[0], unmovedSinceSpawn: false }, { ...init.ships[1], alive: false }] });
  const out = endTurn(s);
  assert.equal(out.ships[0], s.ships[0], 'a living ship keeps its value');
  assert.equal(out.ships[1].unmovedSinceSpawn, true, 'a respawned ship is protected');
});
