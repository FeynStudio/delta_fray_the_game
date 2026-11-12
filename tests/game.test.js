import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import {
  applyMove, createInitialState, isSpawnProtected, resolveMove, shipPoints, wrapDegrees,
} from '../src/rules.js';
import { gaugeLayout } from '../src/render.js';
import { moveFromGauge } from '../src/input.js';

const listeners = {};
let game;
let loaded;

before(async () => {
  const ctx = new Proxy({}, { get: () => () => {} });
  globalThis.document = { getElementById: () => ({ style: {}, getContext: () => ctx }) };
  globalThis.window = {
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  globalThis.location = { search: '?debug=1' };
  globalThis.requestAnimationFrame = () => 0;
  await import('../src/game.js');
  game = window.__game;
  loaded = game.getState();
});

beforeEach(() => game.setState(createInitialState()));

const T = () => config.moveAnimMs;
const near = (a, b) => Math.abs(a - b) < 1e-3;

function launch(power, needle, backward = false) {
  const s = game.getState();
  game.setState({ ...s, gauge: { ...s.gauge, power } });
  game.press('Space');
  if (backward) game.press('Shift');
  const d = game.getState();
  game.setState({ ...d, gauge: { ...d.gauge, needle } });
  game.press('Space');
}

test('second Space flies ship 0 to the rules end point; gauge back to power, turn passes to 1', () => {
  const start = createInitialState();
  launch(0.6, 30);
  game.step(T() + 1);
  const end = applyMove(start, { distance: 0.6 * config.maxMove, angle: 30 }).ships[0];
  const s = game.getState();
  assert.ok(near(s.ships[0].x, end.x) && near(s.ships[0].y, end.y), JSON.stringify(s.ships[0]));
  assert.equal(s.ships[0].heading, 30);
  assert.deepEqual(s.ships[1], start.ships[1]);
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
});

const tipAhead = (ship, angle) => {
  const tip = shipPoints(ship, config.shipSize, config.shipWidth)[0];
  const a = (angle * Math.PI) / 180;
  return (tip.x - ship.x) * Math.cos(a) + (tip.y - ship.y) * Math.sin(a);
};

test('with Shift the ship turns to the travel angle at launch, flies there and keeps that heading', () => {
  for (const [heading, needle] of [[0, 0], [0, 40], [30, -40]]) {
    const ships = [{ x: 640, y: 480, heading, alive: true }, { ...config.spawns[1], alive: true }];
    const startState = { ...createInitialState(), ships };
    game.setState(startState);
    launch(0.5, needle, true);
    const angle = wrapDegrees(heading + 180 + needle);
    const launched = game.getState();
    assert.equal(launched.gauge.phase, 'moving');
    assert.ok(near(launched.ships[0].heading, angle), `needle ${needle}: heading ${launched.ships[0].heading}`);
    assert.ok(tipAhead(launched.ships[0], angle) > 0, `needle ${needle}: tip on the travel side`);
    game.step(T());
    const s = game.getState();
    const end = applyMove(startState, { distance: 0.5 * config.maxMove, angle, backward: true }).ships[0];
    assert.ok(near(s.ships[0].x, end.x) && near(s.ships[0].y, end.y), JSON.stringify(s.ships[0]));
    assert.ok(near(s.ships[0].heading, angle), `needle ${needle}: heading kept after the move`);
    assert.equal(s.ships[0].alive, true);
    assert.equal(s.turn, 1);
    assert.equal(s.gauge.phase, 'power');
  }
});

test('after a backward move, on its next turn the dial sits at the new nose and a forward move follows it', () => {
  const ships = [{ x: 640, y: 480, heading: 30, alive: true }, { ...config.spawns[1], alive: true }];
  game.setState({ ...createInitialState(), ships });
  launch(0.5, -40, true);
  const angle = wrapDegrees(30 + 180 - 40);
  game.step(T());
  launch(0.3, 0);
  game.step(T());
  const mine = game.getState();
  assert.equal(mine.turn, 0);
  const ship = mine.ships[0];
  assert.ok(near(ship.heading, angle), `heading still the travel angle: ${ship.heading}`);
  game.setState({ ...mine, gauge: { ...mine.gauge, power: 0.4 } });
  game.press('Space');
  const aiming = game.getState();
  assert.equal(aiming.gauge.phase, 'direction');
  const { dial } = gaugeLayout(aiming);
  const a = (angle * Math.PI) / 180;
  assert.ok((dial.x - ship.x) * Math.cos(a) + (dial.y - ship.y) * Math.sin(a) > 0, 'dial on the nose side');
  game.setState({ ...aiming, gauge: { ...aiming.gauge, needle: 0 } });
  game.press('Space');
  game.step(T());
  const moved = game.getState().ships[0];
  const d = 0.4 * config.maxMove;
  assert.ok(near(moved.x, ship.x + Math.cos(a) * d) && near(moved.y, ship.y + Math.sin(a) * d), JSON.stringify(moved));
  assert.ok(near(moved.heading, angle));
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

function launchFrom(turn, ships, power, needle) {
  const s = createInitialState();
  game.setState({ ...s, turn, ships });
  launch(power, needle);
}

test('turns smoke scenario: enemy destroyed on the path respawns, attacker stays, turn 1 on power', () => {
  launchFrom(0, [
    { x: 200, y: 480, heading: 0, alive: true },
    { x: 300, y: 490, heading: 180, alive: true },
  ], 1, 0);
  game.step(10000);
  const s = game.getState();
  assert.deepEqual(s.ships[1], { ...config.spawns[1], alive: true, unmovedSinceSpawn: true });
  assert.ok(s.ships[0].alive === true && near(s.ships[0].x, 200 + config.maxMove) && near(s.ships[0].y, 480),
    JSON.stringify(s.ships[0]));
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
  assert.equal('anim' in s, false);
});

test('the end point is the resolveMove result: the enemy stays drawn alive until the move ends', () => {
  const ships = [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }];
  launchFrom(0, ships, 1, 0);
  const end = resolveMove({ turn: 0, ships }, { distance: config.maxMove, angle: 0 });
  assert.equal(end.ships[1].alive, false, 'resolveMove destroys the enemy');
  game.step(T() / 2);
  const mid = game.getState();
  assert.equal(mid.gauge.phase, 'moving');
  assert.equal(mid.turn, 0);
  assert.deepEqual(mid.ships[1], ships[1]);
});

test('a move into the wall: the mover is back at its spawn point, alive, and the turn has passed', () => {
  const enemy = { x: 600, y: 200, heading: 180, alive: true };
  launchFrom(0, [{ x: 1200, y: 480, heading: 0, alive: true }, enemy], 1, 0);
  game.step(T());
  const s = game.getState();
  assert.deepEqual(s.ships[0], { ...config.spawns[0], alive: true, unmovedSinceSpawn: true });
  assert.deepEqual(s.ships[1], enemy);
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
});

test('a plain move passes the turn, and the next Space, Space moves the other ship', () => {
  const start = createInitialState();
  launch(0.5, 0);
  game.step(T());
  const after0 = game.getState();
  assert.equal(after0.turn, 1);
  assert.ok(near(after0.ships[0].x, start.ships[0].x + 0.5 * config.maxMove));
  assert.deepEqual(after0.ships[1], start.ships[1]);
  launch(0.4, 0);
  game.step(T());
  const after1 = game.getState();
  assert.equal(after1.turn, 0);
  assert.deepEqual(after1.ships[0], after0.ships[0]);
  assert.ok(near(after1.ships[1].x, start.ships[1].x - 0.4 * config.maxMove), JSON.stringify(after1.ships[1]));
  assert.equal(after1.gauge.phase, 'power');
});

test('later steps never change the turn again: no turn timer and no second endTurn', () => {
  launch(0.5, 0);
  game.step(T() + 1);
  const ended = game.getState();
  assert.equal(ended.turn, 1);
  for (const ms of [1, T(), T() * 3, 600000]) {
    game.step(ms);
    const s = game.getState();
    assert.equal(s.turn, 1, `after step(${ms})`);
    assert.deepEqual(s.ships, ended.ships);
  }
  assert.equal(game.getState().gauge.phase, 'power');
});

test('double kill through the game: both respawn, the turn passes once, and the next mover is alive', () => {
  launchFrom(0, [
    { x: 1150, y: 480, heading: 0, alive: true },
    { x: 1220, y: 480, heading: 180, alive: true },
  ], 1, 0);
  game.step(T());
  const s = game.getState();
  assert.deepEqual(s.ships, [
    { ...config.spawns[0], alive: true, unmovedSinceSpawn: true },
    { ...config.spawns[1], alive: true, unmovedSinceSpawn: true },
  ]);
  assert.equal(s.turn, 1);
  assert.equal(s.ships[s.turn].alive, true);
});

const inMap = (e) => shipPoints(e, config.shipSize, config.shipWidth)
  .every((p) => p.x >= 0 && p.x <= config.worldWidth && p.y >= 0 && p.y <= config.worldHeight);

test('explosion after a hit: one entry at the enemy where it was hit; turn and gauge as before T-007', () => {
  const ships = [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }];
  launchFrom(0, ships, 1, 0);
  game.step(T() - 1);
  assert.equal((game.getState().explosions ?? []).length, 0, 'nothing explodes before the move ends');
  game.step(1);
  const s = game.getState();
  assert.deepEqual(s.explosions, [{ ship: 1, x: 300, y: 490, heading: 180, elapsed: 0 }]);
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
  assert.deepEqual(s.ships[1], { ...config.spawns[1], alive: true, unmovedSinceSpawn: true });
});

test('explosion after a wall death: centre moved so the whole triangle is inside the map', () => {
  const enemy = { x: 600, y: 200, heading: 180, alive: true };
  launchFrom(0, [{ x: 1200, y: 480, heading: 0, alive: true }, enemy], 1, 0);
  game.step(T());
  const s = game.getState();
  assert.equal(s.explosions.length, 1);
  const e = s.explosions[0];
  assert.equal(e.ship, 0);
  assert.equal(e.heading, 0);
  assert.equal(e.elapsed, 0);
  assert.ok(inMap(e), JSON.stringify(e));
  assert.ok(e.x > 1200 && e.x < 1200 + config.maxMove && e.y === 480, 'shortest shift back from the end point');
  const tip = shipPoints(e, config.shipSize, config.shipWidth)[0];
  assert.ok(Math.abs(tip.x - config.worldWidth) < 1e-9, 'moved only as far as needed: tip on the edge');
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
});

test('explosions after a double kill: two entries, enemy where hit, mover inside the map', () => {
  launchFrom(0, [
    { x: 1150, y: 480, heading: 0, alive: true },
    { x: 1220, y: 480, heading: 180, alive: true },
  ], 1, 0);
  game.step(T());
  const s = game.getState();
  assert.equal(s.explosions.length, 2);
  const byShip = Object.fromEntries(s.explosions.map((e) => [e.ship, e]));
  assert.deepEqual(byShip[1], { ship: 1, x: 1220, y: 480, heading: 180, elapsed: 0 });
  assert.ok(inMap(byShip[0]), JSON.stringify(byShip[0]));
  assert.equal(s.turn, 1);
});

test('no explosion after a plain move', () => {
  launch(0.5, 0);
  game.step(T());
  const s = game.getState();
  assert.equal((s.explosions ?? []).length, 0);
  assert.equal(s.turn, 1);
});

test('an explosion is present at explosionMs - 1 and gone at explosionMs; turn, ships, gauge untouched', () => {
  launchFrom(0, [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }], 1, 0);
  game.step(T());
  const ended = game.getState();
  game.step(config.explosionMs - 1);
  const late = game.getState();
  assert.equal(late.explosions.length, 1);
  assert.equal(late.explosions[0].elapsed, config.explosionMs - 1);
  game.step(1);
  const gone = game.getState();
  assert.equal(gone.explosions.length, 0);
  for (const s of [late, gone]) {
    assert.equal(s.turn, ended.turn);
    assert.deepEqual(s.ships, ended.ships);
    assert.equal(s.gauge.phase, 'power');
  }
});

test('the next player can press Space while an explosion plays, and its move ends on time', () => {
  launchFrom(0, [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }], 1, 0);
  game.step(T());
  launch(0.4, 0);
  assert.equal(game.getState().gauge.phase, 'moving');
  assert.equal(game.getState().explosions.length, 1);
  game.step(T());
  const s = game.getState();
  assert.equal(s.turn, 0, 'turn passed once, in the step the move ended');
  assert.equal(s.explosions.length, config.explosionMs > T() ? 1 : 0);
});

test('score after a hit: unchanged during the animation, +1 for the mover in the step it ends', () => {
  launchFrom(0, [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }], 1, 0);
  assert.deepEqual(game.getState().scores, [0, 0]);
  game.step(T() - 1);
  const mid = game.getState();
  assert.equal(mid.gauge.phase, 'moving');
  assert.deepEqual(mid.scores, [0, 0], 'no change before the player sees the hit');
  game.step(1);
  const s = game.getState();
  assert.deepEqual(s.scores, [config.scoreKill, 0]);
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
});

test('score after a wall death: unchanged during the animation, -2 for the mover when it ends', () => {
  launchFrom(0, [{ x: 1200, y: 480, heading: 0, alive: true }, { x: 600, y: 200, heading: 180, alive: true }], 1, 0);
  game.step(T() / 2);
  assert.deepEqual(game.getState().scores, [0, 0]);
  game.step(T());
  const s = game.getState();
  assert.deepEqual(s.scores, [config.scoreWall, 0]);
  assert.equal(s.turn, 1);
  assert.equal(s.gauge.phase, 'power');
});

test('scores add up over several turns; turn and gauge behave as before', () => {
  launchFrom(0, [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }], 1, 0);
  game.step(T());
  assert.deepEqual(game.getState().scores, [1, 0]);
  assert.equal(game.getState().turn, 1);
  launch(0.2, 0);
  game.step(T());
  assert.deepEqual(game.getState().scores, [1, 0]);
  assert.equal(game.getState().turn, 0);
  let s = game.getState();
  game.setState({ ...s, ships: [{ x: 1200, y: 480, heading: 0, alive: true }, s.ships[1]] });
  launch(1, 0);
  game.step(T());
  s = game.getState();
  assert.deepEqual(s.scores, [-1, 0]);
  assert.equal(s.turn, 1);
  game.setState({ ...s, ships: [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }] });
  launch(1, 0);
  game.step(T());
  s = game.getState();
  assert.deepEqual(s.scores, [-1, 1]);
  assert.equal(s.turn, 0);
  assert.equal(s.gauge.phase, 'power');
  game.step(600000);
  assert.deepEqual(game.getState().scores, [-1, 1], 'later steps never change the scores');
});

test('a state loaded without scores starts from [0, 0] when a move ends', () => {
  const { scores: _none, ...s } = createInitialState();
  game.setState({ ...s, ships: [{ x: 1200, y: 480, heading: 0, alive: true }, s.ships[1]] });
  launch(1, 0);
  game.step(T());
  assert.deepEqual(game.getState().scores, [config.scoreWall, 0]);
});

test('moving phase with no anim: step goes back to power, same player, ships unmoved; then plays on', () => {
  const s = createInitialState();
  const ships = [
    { ...s.ships[0], x: 400, y: 300, heading: 45, unmovedSinceSpawn: false },
    { ...s.ships[1], x: 800, y: 600, heading: 200, unmovedSinceSpawn: false },
  ];
  const gauge = { phase: 'moving', power: 0.6, needle: 30, backward: true, distance: 0.6 * config.maxMove, sweep: 1 };
  game.setState({ ...s, turn: 1, ships, gauge });
  game.step(16);
  const r = game.getState();
  assert.deepEqual(r.gauge, createInitialState().gauge);
  assert.deepEqual(r.ships, ships);
  assert.equal(r.turn, 1);
  assert.equal('anim' in r, false);
  for (const ms of [1, T(), T() * 10]) {
    game.step(ms);
    const later = game.getState();
    assert.equal(later.turn, 1, `after step(${ms})`);
    assert.deepEqual(later.ships, ships, `after step(${ms})`);
  }
  launch(0.4, 0);
  const launched = game.getState();
  assert.equal(launched.gauge.phase, 'moving');
  assert.ok(launched.anim, 'Space, Space starts a normal move animation');
  const locked = { ...launched, ships };
  const end = resolveMove(locked, moveFromGauge(locked)).ships[1];
  game.step(T());
  const after = game.getState();
  assert.ok(near(after.ships[1].x, end.x) && near(after.ships[1].y, end.y), JSON.stringify(after.ships[1]));
  assert.equal(after.ships[1].heading, end.heading);
  assert.deepEqual(after.ships[0], ships[0]);
  assert.equal(after.turn, 0);
  assert.equal(after.gauge.phase, 'power');
});


test('the game starts with clock 0 and both ships spawn protected', () => {
  assert.equal(loaded.clock, 0);
  assert.equal(isSpawnProtected(loaded, 0), true);
  assert.equal(isSpawnProtected(loaded, 1), true);
});

test('step(ms) grows the clock by exactly ms, in every phase and across the end of a move', () => {
  game.setState({ ...createInitialState(), clock: 0 });
  let want = 0;
  for (const ms of [16, 0, 1, 250, 33.5]) {
    game.step(ms);
    want += ms;
    assert.equal(game.getState().clock, want, `after step(${ms})`);
  }
  launch(0.5, 0);
  for (const ms of [T() / 2, T() / 2 + 1, 16]) {
    game.step(ms);
    want += ms;
    assert.equal(game.getState().clock, want, `moving / after the move, step(${ms})`);
  }
  assert.equal(game.getState().turn, 1, 'the move ended and the turn passed');
  game.setState(createInitialState());
  game.step(40);
  assert.equal(game.getState().clock, 40);
});

test("after player 1's first move only player 2's ship is still protected (blinks)", () => {
  const s0 = game.getState();
  assert.equal(isSpawnProtected(s0, 0), true);
  assert.equal(isSpawnProtected(s0, 1), true);
  launch(0.5, 0);
  game.step(T());
  const s = game.getState();
  assert.equal(s.turn, 1);
  assert.equal(isSpawnProtected(s, 0), false, "player 1's ship moved: no longer protected");
  assert.equal(isSpawnProtected(s, 1), true, "player 2's ship has not moved: still protected");
});
