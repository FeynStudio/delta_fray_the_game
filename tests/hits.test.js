// Hit detection and edges (FEATURE_MAP section 5): rules.resolveMove(state, move).
// Follows the tests/rules.test.js pattern: sizes come from config, config is restored after each test,
// and every input is deep-frozen so a mutation throws.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { applyMove, resolveMove, shipPoints } from '../src/rules.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const ship = (x, y, heading) => ({ x, y, heading, alive: true });
const state = (turn, a, b) => deepFreeze({ turn, ships: [a, b] });
const move = (distance, angle, backward = false) => deepFreeze({ distance, angle, backward });
// Tip-to-back length of the ship triangle, read from config at call time.
const shipLength = () => Math.sqrt(config.shipSize ** 2 - (config.shipWidth / 2) ** 2);
const alive = (s) => s.ships.map((sh) => sh.alive);

test('FEATURE_MAP 5 example: the swept path destroys the enemy, the attacker survives at the end', () => {
  const s = state(0, ship(200, 480, 0), ship(300, 490, 180));
  const out = resolveMove(s, move(config.maxMove, 0));
  assert.deepEqual(alive(out), [true, false]);
  assert.equal(out.ships[0].x, 200 + config.maxMove);
  assert.equal(out.ships[0].y, 480);
});

test('grazing contact counts: touching the swept area destroys, a little further away survives', () => {
  // Mover heading 0 sweeps a band y = 480 +- shipWidth/2. An enemy (heading 0) shipWidth lower has its
  // back corner exactly on the band's edge; moved 0.01 further down it no longer touches.
  const touching = state(0, ship(200, 480, 0), ship(300, 480 + config.shipWidth, 0));
  assert.deepEqual(alive(resolveMove(touching, move(config.maxMove, 0))), [true, false]);
  const apart = state(0, ship(200, 480, 0), ship(300, 480 + config.shipWidth + 0.01, 0));
  assert.deepEqual(alive(resolveMove(apart, move(config.maxMove, 0))), [true, true]);
});

test('grazing contact counts tip to tip along the path', () => {
  // End position's tip and the enemy's tip (facing back at it) meet exactly at one point.
  const tip = (2 * shipLength()) / 3;
  const endX = 200 + config.maxMove;
  const touching = state(0, ship(200, 480, 0), ship(endX + 2 * tip, 480, 180));
  assert.deepEqual(alive(resolveMove(touching, move(config.maxMove, 0))), [true, false]);
  const apart = state(0, ship(200, 480, 0), ship(endX + 2 * tip + 0.01, 480, 180));
  assert.deepEqual(alive(resolveMove(apart, move(config.maxMove, 0))), [true, true]);
});

test('no tunneling: an enemy fully between the start and end of a max-distance move is destroyed', () => {
  const L = shipLength();
  const mid = 200 + config.maxMove / 2;
  const enemy = ship(mid, 480, 0);
  // Sanity: the enemy is clear of both the start and the end triangle along x.
  assert.ok(mid - L / 3 > 200 + (2 * L) / 3, 'enemy starts past the start tip');
  assert.ok(mid + (2 * L) / 3 < 200 + config.maxMove - L / 3, 'enemy ends before the end back edge');
  const out = resolveMove(state(0, ship(200, 480, 0), enemy), move(config.maxMove, 0));
  assert.deepEqual(alive(out), [true, false]);
});

test('an enemy behind the start survives, as does one well beside the path', () => {
  const behind = state(0, ship(200, 480, 0), ship(150, 480, 0));
  assert.deepEqual(alive(resolveMove(behind, move(config.maxMove, 0))), [true, true]);
  const beside = state(0, ship(200, 480, 0), ship(300, 600, 180));
  assert.deepEqual(alive(resolveMove(beside, move(config.maxMove, 0))), [true, true]);
});

test('stopping short of the enemy misses', () => {
  const s = state(0, ship(200, 480, 0), ship(300, 490, 180));
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove / 3, 0))), [true, true]);
});

test('the wall on each of the four edges destroys the mover, forward and backward', () => {
  const W = config.worldWidth, H = config.worldHeight, d = config.maxMove;
  const enemy = ship(W / 2, H / 2, 0);
  const edges = [
    { name: 'right', x: W - d / 2, y: H / 4, angle: 0 },
    { name: 'left', x: d / 2, y: H / 4, angle: 180 },
    { name: 'bottom', x: W / 4, y: H - d / 2, angle: 90 },
    { name: 'top', x: W / 4, y: d / 2, angle: 270 },
  ];
  for (const e of edges) {
    const fwd = resolveMove(state(0, ship(e.x, e.y, e.angle), enemy), move(d, e.angle));
    assert.deepEqual(alive(fwd), [false, true], `${e.name} forward`);
    const back = resolveMove(state(0, ship(e.x, e.y, (e.angle + 180) % 360), enemy), move(d, e.angle, true));
    assert.deepEqual(alive(back), [false, true], `${e.name} backward`);
  }
});

test('any part counts at the wall: the centre stays inside but the tip touches or crosses the edge', () => {
  const W = config.worldWidth, tip = (2 * shipLength()) / 3, d = config.maxMove / 2;
  const enemy = ship(200, 200, 0);
  // Tip ends exactly on the right edge (centre is tip units inside).
  const touch = resolveMove(state(0, ship(W - tip - d, 480, 0), enemy), move(d, 0));
  assert.ok(touch.ships[0].x < W);
  assert.deepEqual(alive(touch), [false, true], 'tip touching the edge');
  // Tip ends past the edge with the centre still inside.
  const cross = resolveMove(state(0, ship(W - tip / 2 - d, 480, 0), enemy), move(d, 0));
  assert.ok(cross.ships[0].x < W);
  assert.deepEqual(alive(cross), [false, true], 'tip crossing the edge');
  // Whole swept triangle stays inside: survives.
  const inside = resolveMove(state(0, ship(W - tip - d - 1, 480, 0), enemy), move(d, 0));
  assert.deepEqual(alive(inside), [true, true], 'tip 1 unit short of the edge');
});

test('any part counts at the wall: a back corner grazing the top edge while moving along it', () => {
  const half = config.shipWidth / 2, enemy = ship(600, 480, 0);
  // Heading 0 at y = shipWidth/2: the back corner sits exactly on y = 0.
  const graze = resolveMove(state(0, ship(200, half, 0), enemy), move(config.maxMove, 0));
  assert.deepEqual(alive(graze), [false, true]);
  const clear = resolveMove(state(0, ship(200, half + 0.5, 0), enemy), move(config.maxMove, 0));
  assert.deepEqual(alive(clear), [true, true]);
});

test('a backward move: the tail crossing the wall destroys the mover, stopping before it is safe', () => {
  const W = config.worldWidth, back = shipLength() / 3, d = config.maxMove;
  const enemy = ship(200, 200, 0);
  // Heading 180 moving at 0 (backward): the tail leads toward the right wall.
  const hit = resolveMove(state(0, ship(W - back - d + 1, 480, 180), enemy), move(d, 0, true));
  assert.ok(hit.ships[0].x < W);
  assert.deepEqual(alive(hit), [false, true]);
  assert.equal(hit.ships[0].heading, 180, 'backward keeps the heading');
  const safe = resolveMove(state(0, ship(W - back - d - 1, 480, 180), enemy), move(d, 0, true));
  assert.deepEqual(alive(safe), [true, true]);
});

test('hit then wall destroys both', () => {
  const s = state(0, ship(1150, 480, 0), ship(1220, 480, 180));
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [false, false]);
});

test('turn 1 can destroy the turn 0 ship', () => {
  const s = state(1, ship(1000, 470, 0), ship(1090, 480, 180));
  const out = resolveMove(s, move(config.maxMove, 180));
  assert.deepEqual(alive(out), [false, true]);
  assert.equal(out.ships[1].x, 1090 - config.maxMove);
});

test('a move longer than maxMove is refused: state unchanged, nobody destroyed', () => {
  const s = state(0, ship(200, 480, 0), ship(300, 490, 180));
  const out = resolveMove(s, move(config.maxMove + 1, 0));
  assert.equal(out, s);
  assert.deepEqual(alive(out), [true, true]);
});

test('no respawn and no turn change: dead ships keep x, y and heading; other fields carry over', () => {
  const gauge = { phase: 'moving', power: 1, needle: 0, backward: false, distance: config.maxMove, sweep: 1 };
  const s = deepFreeze({ turn: 0, ships: [ship(1150, 480, 90), ship(1220, 480, 180)], gauge });
  const out = resolveMove(s, move(config.maxMove, 0));
  const moved = applyMove(s, move(config.maxMove, 0));
  assert.equal(out.turn, 0);
  assert.deepEqual(out.gauge, gauge);
  assert.deepEqual(out.ships[0], { ...moved.ships[0], alive: false });
  assert.deepEqual(out.ships[1], { ...s.ships[1], alive: false });
  assert.equal(s.ships[0].alive, true, 'input untouched');
});

test('an already destroyed enemy stays as it is', () => {
  const s = state(0, ship(200, 480, 0), { ...ship(300, 490, 180), alive: false });
  const out = resolveMove(s, move(config.maxMove, 0));
  assert.deepEqual(out.ships[1], s.ships[1]);
});

test('the swept triangle uses the heading the ship turns to as the move starts', () => {
  // Mover heading 0 turns to 90 and moves down (input.startMove turns it before it moves). The enemy's
  // back edge sits 1 unit behind the old (heading 0) tip, so it overlaps the old start triangle, but the
  // new swept area only reaches shipWidth/2 to the right of the centre: the enemy survives.
  const tip = (2 * shipLength()) / 3;
  const s = state(0, ship(200, 480, 0), ship(200 + tip + shipLength() / 3 - 1, 480, 0));
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 90))), [true, true]);
});

test('shipWidth is read at call time: a near miss becomes a hit with wider ships', () => {
  const s = state(0, ship(200, 480, 0), ship(300, 480 + config.shipWidth + 1, 0));
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, true]);
  config.shipWidth += 4;
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, false]);
});

test('shipSize is read at call time: a near miss tip to tip becomes a hit with longer ships', () => {
  const tip = (2 * shipLength()) / 3;
  const s = state(0, ship(200, 480, 0), ship(200 + config.maxMove + 2 * tip + 1, 480, 180));
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, true]);
  config.shipSize += 10;
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, false]);
});

test('world size is read at call time for the wall', () => {
  const s = state(0, ship(1000, 480, 0), ship(200, 200, 0));
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [true, true]);
  config.worldWidth = 1100;
  assert.deepEqual(alive(resolveMove(s, move(config.maxMove, 0))), [false, true]);
});

test('hits use the same triangle that render.js draws', async () => {
  const render = await import('../src/render.js');
  assert.equal(render.shipPoints, shipPoints);
});
