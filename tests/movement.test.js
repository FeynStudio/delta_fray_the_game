import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { applyMove, createInitialState, wrapDegrees } from '../src/rules.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

const deepFreeze = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
const at = (x, y, heading, turn = 0) => {
  const s = createInitialState();
  s.turn = turn;
  s.ships[turn] = { ...s.ships[turn], x, y, heading };
  return deepFreeze(s);
};

test('forward moves at 0, 90, 180 and 270 go right, down, left and up and turn the heading', () => {
  const d = config.maxMove / 2;
  const cases = [[0, d, 0], [90, 0, d], [180, -d, 0], [270, 0, -d]];
  for (const [angle, dx, dy] of cases) {
    const s = at(400, 400, 45);
    const ship = applyMove(s, { distance: d, angle }).ships[0];
    assert.ok(near(ship.x, 400 + dx) && near(ship.y, 400 + dy), `angle ${angle}: (${ship.x}, ${ship.y})`);
    assert.equal(ship.heading, angle);
    assert.equal(ship.alive, true);
  }
});

test('45 degrees uses degrees, not radians', () => {
  const ship = applyMove(at(200, 480, 0), { distance: 100, angle: 45 }).ships[0];
  assert.ok(near(ship.x, 200 + 100 * Math.SQRT1_2) && near(ship.y, 480 + 100 * Math.SQRT1_2));
});

test('forward heading is kept within 0 to 360', () => {
  assert.equal(applyMove(at(400, 400, 0), { distance: 10, angle: -90 }).ships[0].heading, 270);
  assert.equal(applyMove(at(400, 400, 0), { distance: 10, angle: 450 }).ships[0].heading, 90);
  assert.equal(applyMove(at(400, 400, 0), { distance: 10, angle: 360 }).ships[0].heading, 0);
  assert.equal(wrapDegrees(-450), 270);
});

test('a backward move travels along the angle and turns the heading to the travel angle', () => {
  const ship = applyMove(at(400, 400, 30), { distance: 100, angle: 210, backward: true }).ships[0];
  assert.ok(near(ship.x, 400 + 100 * Math.cos((210 * Math.PI) / 180)));
  assert.ok(near(ship.y, 400 + 100 * Math.sin((210 * Math.PI) / 180)));
  assert.equal(ship.heading, 210);
  assert.equal(applyMove(at(400, 400, 300), { distance: 10, angle: 480, backward: true }).ships[0].heading, 120);
});

test('only the ship whose turn it is moves; every other field is carried over', () => {
  const s = at(1000, 300, 180, 1);
  const next = applyMove(s, { distance: 100, angle: 180 });
  assert.deepEqual(next.ships[0], s.ships[0]);
  assert.ok(near(next.ships[1].x, 900) && near(next.ships[1].y, 300));
  assert.equal(next.turn, 1);
  assert.deepEqual(next.gauge, s.gauge);
});

test('works without a gauge field (scenario states have none)', () => {
  const s = deepFreeze({ turn: 0, ships: at(200, 480, 0).ships });
  const next = applyMove(s, { distance: config.maxMove, angle: 0 });
  assert.ok(near(next.ships[0].x, 200 + config.maxMove));
  assert.equal('gauge' in next, false);
});

test('a move longer than maxMove is refused; exactly maxMove is made (human decision 2026-11-08)', () => {
  const s = at(200, 480, 0);
  const before = structuredClone(s);
  assert.deepEqual(applyMove(s, { distance: config.maxMove + 1, angle: 90 }), before);
  const full = applyMove(s, { distance: config.maxMove, angle: 90 }).ships[0];
  assert.ok(near(full.y, 480 + config.maxMove));
  assert.equal(full.heading, 90);
  assert.deepEqual(s, before, 'input not mutated');
});

test('distance comes from the move and the limit from config at call time (maxMove 200)', () => {
  config.maxMove = 200;
  const s = at(200, 480, 0);
  assert.ok(near(applyMove(s, { distance: 200, angle: 0 }).ships[0].x, 400));
  assert.deepEqual(applyMove(s, { distance: 201, angle: 0 }), structuredClone(s));
  assert.ok(near(applyMove(s, { distance: 175, angle: 0 }).ships[0].x, 375));
});
