// Gauge and control tests (pattern: tests/rules.test.js). Values come from config; config is restored
// after each test; inputs are deep-frozen, as scripts/run-scenario.mjs does, to catch mutation.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { createInitialState } from '../src/rules.js';
import { keyFromEvent, pressKey, stepGauge } from '../src/input.js';

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
  // Small steps across a full back-and-forth: no reading leaves 0..1 and no step jumps.
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
  // Turns back instead of wrapping: past the top it comes down.
  assert.ok(near(stepGauge(fresh({ power: 0.9, sweep: 1 }), T * 0.2).gauge.power, 0.9));
  assert.ok(near(stepGauge(fresh({ power: 0.1, sweep: -1 }), T * 0.2).gauge.power, 0.1));
  // A long step still lands inside 0..1.
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
