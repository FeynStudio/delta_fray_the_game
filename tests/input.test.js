import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { applyMove, createInitialState } from '../src/rules.js';
import { keyFromEvent, moveFromGauge, pointAlong, pressKey, startMove, stepGauge, stepMove } from '../src/input.js';

const original = structuredClone(config);
afterEach(() => Object.assign(config, structuredClone(original)));

const deepFreeze = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const fresh = (gauge = {}) => {
  const s = createInitialState();
  return deepFreeze({ ...s, gauge: { ...s.gauge, ...gauge } });
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the starting gauge is in the power phase', () => {
  const g = createInitialState().gauge;
  assert.equal(g.phase, 'power');
  assert.equal(g.backward, false);
});

test('power sweeps with elapsed time, stays within 0..1 and turns back at both ends', () => {
  const T = config.gaugePowerSweepMs;
  let s = fresh({ power: 0 });
  s = stepGauge(s, T / 4);
  assert.ok(near(s.gauge.power, 0.25), `quarter sweep gives ${s.gauge.power}`);
  let prev = s.gauge.power;
  const dt = T / 50;
  let sawTop = false, sawBottom = false;
  for (let i = 0; i < 200; i++) {
    s = stepGauge(deepFreeze(s), dt);
    const p = s.gauge.power;
    assert.ok(p >= 0 && p <= 1, `power ${p} out of range`);
    assert.ok(Math.abs(p - prev) <= dt / T + 1e-9, `jump from ${prev} to ${p}`);
    if (p > 1 - dt / T) sawTop = true;
    if (p < dt / T) sawBottom = true;
    prev = p;
  }
  assert.ok(sawTop && sawBottom, 'reaches both ends');
  assert.ok(near(stepGauge(fresh({ power: 0.9, sweep: 1 }), T * 0.2).gauge.power, 0.9));
  assert.ok(near(stepGauge(fresh({ power: 0.1, sweep: -1 }), T * 0.2).gauge.power, 0.1));
  const long = stepGauge(fresh({ power: 0.3 }), T * 7.3).gauge.power;
  assert.ok(long >= 0 && long <= 1);
});

test('first Space locks distance = power x maxMove', () => {
  const s = pressKey(fresh({ power: 0.6 }), 'Space');
  assert.equal(s.gauge.phase, 'direction');
  assert.ok(near(s.gauge.distance, 0.6 * config.maxMove));
});

test('first Space reads maxMove at call time (override to 200)', () => {
  config.maxMove = 200;
  const s = pressKey(fresh({ power: 0.6 }), 'Space');
  assert.ok(near(s.gauge.distance, 0.6 * config.maxMove));
  assert.ok(near(s.gauge.distance, 120));
});

test('sweep speeds are read from config at call time', () => {
  config.gaugePowerSweepMs = 1000;
  assert.ok(near(stepGauge(fresh({ power: 0 }), 500).gauge.power, 0.5));
});

test('direction phase: needle sweeps with time within -max..max, backward starts false', () => {
  const max = config.gaugeNeedleMax;
  const T = config.gaugeNeedleSweepMs;
  let s = pressKey(fresh({ power: 0.5 }), 'Space');
  assert.equal(s.gauge.backward, false);
  assert.equal(s.gauge.needle, 0);
  const moved = stepGauge(deepFreeze(s), T / 4);
  assert.ok(near(Math.abs(moved.gauge.needle), max / 2), `quarter sweep gives ${moved.gauge.needle}`);
  let prev = s.gauge.needle;
  const dt = T / 40;
  let sawMin = false, sawMax = false;
  for (let i = 0; i < 200; i++) {
    s = stepGauge(deepFreeze(s), dt);
    const n = s.gauge.needle;
    assert.ok(n >= -max && n <= max, `needle ${n} out of range`);
    assert.ok(Math.abs(n - prev) <= (2 * max * dt) / T + 1e-9, `jump from ${prev} to ${n}`);
    if (n > max - (2 * max * dt) / T) sawMax = true;
    if (n < -max + (2 * max * dt) / T) sawMin = true;
    prev = n;
  }
  assert.ok(sawMin && sawMax, 'reaches both ends');
  assert.equal(s.gauge.phase, 'direction');
  assert.ok(near(s.gauge.distance, 0.5 * config.maxMove), 'stepping keeps the locked distance');
});

test('Shift flips backward in the direction phase only', () => {
  const dir = pressKey(fresh({ power: 0.5 }), 'Space');
  const flipped = pressKey(deepFreeze(dir), 'Shift');
  assert.equal(flipped.gauge.backward, true);
  assert.equal(pressKey(deepFreeze(flipped), 'Shift').gauge.backward, false, 'second Shift flips back');
  const power = fresh({ power: 0.4 });
  assert.deepEqual(pressKey(power, 'Shift'), power);
  const moving = fresh({ phase: 'moving', needle: 30, distance: 90 });
  assert.deepEqual(pressKey(moving, 'Shift'), moving);
});

test('second Space launches and keeps the needle, backward and distance it had', () => {
  let s = pressKey(fresh({ power: 0.6 }), 'Space');
  s = pressKey(deepFreeze(s), 'Shift');
  s = deepFreeze({ ...s, gauge: { ...s.gauge, needle: -42.5 } });
  const launched = pressKey(s, 'Space');
  assert.equal(launched.gauge.phase, 'moving');
  assert.equal(launched.gauge.needle, -42.5);
  assert.equal(launched.gauge.backward, true);
  assert.ok(near(launched.gauge.distance, 0.6 * config.maxMove));
});

test('Space, Shift and time change nothing in the moving phase', () => {
  const moving = fresh({ phase: 'moving', power: 0.6, needle: 30, distance: 90 });
  assert.deepEqual(pressKey(moving, 'Space'), moving);
  assert.deepEqual(pressKey(moving, 'Shift'), moving);
  assert.deepEqual(stepGauge(moving, 1234), moving);
});

test('no function mutates the state passed in', () => {
  const inputs = [
    fresh(),
    fresh({ power: 0.7, sweep: -1 }),
    pressKey(fresh({ power: 0.7 }), 'Space'),
    fresh({ phase: 'moving' }),
  ].map(deepFreeze);
  for (const s of inputs) {
    const before = structuredClone(s);
    stepGauge(s, 777);
    pressKey(s, 'Space');
    pressKey(s, 'Shift');
    assert.deepEqual(s, before);
  }
});

test('keyFromEvent maps Space and both Shift keys and ignores key repeat', () => {
  assert.equal(keyFromEvent({ code: 'Space', repeat: false }), 'Space');
  assert.equal(keyFromEvent({ code: 'ShiftLeft', repeat: false }), 'Shift');
  assert.equal(keyFromEvent({ code: 'ShiftRight', repeat: false }), 'Shift');
  assert.equal(keyFromEvent({ code: 'Space', repeat: true }), null);
  assert.equal(keyFromEvent({ code: 'KeyA', repeat: false }), null);
});

const locked = (heading, gauge) => {
  const s = createInitialState();
  s.ships[0] = { ...s.ships[0], heading };
  return deepFreeze({ ...s, gauge: { ...s.gauge, phase: 'moving', ...gauge } });
};

test('moveFromGauge: 60% power, needle 30, forward, heading 0 gives 0.6 x maxMove at 30 (FEATURE_MAP 3)', () => {
  const m = moveFromGauge(locked(0, { distance: 0.6 * config.maxMove, needle: 30, backward: false }));
  assert.ok(near(m.distance, 0.6 * config.maxMove));
  assert.equal(m.angle, 30);
  assert.equal(m.backward, false);
});

test('moveFromGauge: forward = heading + needle, backward = heading + 180 + needle, within 0..360', () => {
  const cases = [
    [0, -30, false, 330], [90, 45, false, 135], [180, 90, false, 270], [300, 80, false, 20],
    [0, 30, true, 210], [180, 0, true, 0], [90, -60, true, 210], [270, 90, true, 180],
  ];
  for (const [heading, needle, backward, angle] of cases) {
    const m = moveFromGauge(locked(heading, { distance: 50, needle, backward }));
    assert.ok(near(m.angle, angle), `heading ${heading} needle ${needle} backward ${backward}: ${m.angle}`);
    assert.equal(m.backward, backward);
    assert.equal(m.distance, 50);
  }
});

test('moveFromGauge uses the ship whose turn it is', () => {
  const s = createInitialState();
  const st = deepFreeze({ ...s, turn: 1, gauge: { ...s.gauge, phase: 'moving', distance: 10, needle: 10 } });
  assert.equal(moveFromGauge(st).angle, s.ships[1].heading + 10);
});

test('pointAlong: start, middle and end of the segment, never past either end', () => {
  const a = { x: 100, y: 200 }, b = { x: 160, y: 120 };
  assert.deepEqual(pointAlong(a, b, 0), a);
  assert.deepEqual(pointAlong(a, b, 0.5), { x: 130, y: 160 });
  assert.deepEqual(pointAlong(a, b, 1), b);
  assert.deepEqual(pointAlong(a, b, 1.7), b);
  assert.deepEqual(pointAlong(a, b, -0.3), a);
});

test('startMove/stepMove: constant speed along the segment, ends exactly at the applyMove result', () => {
  const T = config.moveAnimMs;
  const s = locked(0, { distance: 0.6 * config.maxMove, needle: 30, backward: false });
  const end = applyMove(s, moveFromGauge(s));
  let m = startMove(s, end);
  assert.equal(m.ships[0].heading, 30, 'forward move turns the ship as it starts');
  assert.deepEqual(m.ships[0].x, s.ships[0].x);
  const half = stepMove(deepFreeze(m), T / 2);
  const mid = pointAlong(s.ships[0], end.ships[0], 0.5);
  assert.ok(near(half.ships[0].x, mid.x) && near(half.ships[0].y, mid.y));
  assert.equal(half.gauge.phase, 'moving');
  m = stepMove(deepFreeze(half), T * 10);
  assert.deepEqual(m.ships, end.ships);
  assert.deepEqual(m.gauge, createInitialState().gauge);
  assert.equal(m.turn, 0);
  assert.equal('anim' in m, false);
  assert.deepEqual(stepMove(deepFreeze(m), T), m, 'nothing to animate after the move');
});

const stuck = (turn, extra = {}) => {
  const s = createInitialState();
  const ships = [
    { ...s.ships[0], x: 400, y: 300, heading: 45, unmovedSinceSpawn: false },
    { ...s.ships[1], x: 800, y: 600, heading: 200, unmovedSinceSpawn: false },
  ];
  const gauge = { phase: 'moving', power: 0.6, needle: 30, backward: true, distance: 0.6 * config.maxMove, sweep: 1 };
  return deepFreeze({ ...s, turn, ships, gauge, ...extra });
};

test('stepMove: moving phase with no anim goes back to the power phase, ships and turn unchanged', () => {
  for (const turn of [0, 1]) {
    const st = stuck(turn);
    const r = stepMove(st, 16);
    assert.deepEqual(r.gauge, createInitialState().gauge, `turn ${turn}`);
    assert.deepEqual(r.ships, st.ships, `turn ${turn}`);
    assert.equal(r.turn, turn);
    assert.equal('anim' in r, false);
    assert.equal(st.gauge.phase, 'moving', 'input not mutated');
  }
});

test('stepMove: moving phase with no anim and ms 0 changes nothing', () => {
  const st = stuck(1);
  assert.deepEqual(stepMove(st, 0), st);
  assert.equal(stepMove(st, 0).gauge.phase, 'moving');
});

test('stepMove recovery carries every other state field over unchanged', () => {
  const st = stuck(0, { scores: [3, -2] });
  const r = stepMove(st, 16);
  assert.deepEqual(r, { ...st, gauge: createInitialState().gauge });
  assert.deepEqual(r.scores, [3, -2]);
});
