// Loads the real src/game.js in Node with a minimal stubbed DOM and ?debug=1, then drives the move
// through window.__game (pattern: tests/rules.test.js; values come from config). T-005: the end of
// every move comes from rules.resolveMove, and the step that finishes it calls rules.endTurn once.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { applyMove, createInitialState, resolveMove, shipPoints, wrapDegrees } from '../src/rules.js';
import { gaugeLayout } from '../src/render.js';

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

// T-009: a backward move turns the ship to the travel angle at launch, flies tip first, keeps the heading.
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
  launch(0.3, 0); // ship 1 makes any move
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

// Loads ships and turn, then locks power, a forward needle and launches (same as launch()).
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
  launch(0.4, 0); // ship 1 faces heading 180, so a forward move goes toward -x
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
  // resolveMove does not check that the mover is alive (T-004 review); endTurn leaves no ship destroyed,
  // so the ship whose turn it is is always alive when it launches.
  assert.equal(s.ships[s.turn].alive, true);
});

// ---- explosions (T-007): decoration only, play does not wait (human, 2026-11-09) ----
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
  launch(0.4, 0); // player 2, explosion still playing
  assert.equal(game.getState().gauge.phase, 'moving');
  assert.equal(game.getState().explosions.length, 1);
  game.step(T());
  const s = game.getState();
  assert.equal(s.turn, 0, 'turn passed once, in the step the move ended');
  assert.equal(s.explosions.length, config.explosionMs > T() ? 1 : 0);
});
