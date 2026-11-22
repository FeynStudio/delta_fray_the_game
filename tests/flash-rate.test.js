import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { protectionAlpha } from '../src/render.js';

const MAX_FLASHES_PER_SECOND = 3;
const DEEP_FADE_BELOW = 0.5;
const MIN_BLINK_MS = Math.ceil(1000 / MAX_FLASHES_PER_SECOND);

function formatRate(rate) {
  for (let digits = 2; digits < 6; digits += 1) {
    const shown = rate.toFixed(digits);
    if (Number(shown) !== MAX_FLASHES_PER_SECOND) return shown;
  }
  return String(rate);
}

function checkFlashRate() {
  const blinkMs = config.protectionBlinkMs;
  const minAlpha = config.protectionMinAlpha;
  if (minAlpha >= DEEP_FADE_BELOW) return;
  const rate = 1000 / blinkMs;
  if (rate <= MAX_FLASHES_PER_SECOND) return;
  throw new Error(
    `protection blink flashes ${formatRate(rate)} times a second; WCAG 2.3.1 allows at most ${MAX_FLASHES_PER_SECOND} ` +
      `(protectionBlinkMs must be >= ${MIN_BLINK_MS} while protectionMinAlpha < ${DEEP_FADE_BELOW})`,
  );
}

function withConfig(overrides, fn) {
  const saved = { protectionBlinkMs: config.protectionBlinkMs, protectionMinAlpha: config.protectionMinAlpha };
  Object.assign(config, overrides);
  try {
    return fn();
  } finally {
    Object.assign(config, saved);
  }
}

function countSnapBacks(periods) {
  const end = periods * config.protectionBlinkMs;
  let snaps = 0;
  let previous = protectionAlpha(0);
  for (let t = 1; t <= end; t += 1) {
    const alpha = protectionAlpha(t);
    if (alpha - previous > 0.5) snaps += 1;
    previous = alpha;
  }
  return snaps;
}

test('the protection blink in src/config.js flashes at most 3 times a second', () => {
  assert.doesNotThrow(checkFlashRate);
});

test('blink periods of 400 and 600 ms with a full fade pass', () => {
  for (const protectionBlinkMs of [400, 600]) {
    withConfig({ protectionBlinkMs, protectionMinAlpha: 0 }, () => assert.doesNotThrow(checkFlashRate));
  }
});

test('blink periods of 333 and 300 ms with a full fade fail and name the numbers and the rule', () => {
  const cases = [
    [333, 'protection blink flashes 3.003 times a second'],
    [300, 'protection blink flashes 3.33 times a second'],
  ];
  for (const [protectionBlinkMs, start] of cases) {
    withConfig({ protectionBlinkMs, protectionMinAlpha: 0 }, () =>
      assert.throws(checkFlashRate, {
        message: `${start}; WCAG 2.3.1 allows at most 3 (protectionBlinkMs must be >= 334 while protectionMinAlpha < 0.5)`,
      }),
    );
  }
});

test('a shallow blink that stays at 0.6 alpha or above is exempt at 300 ms', () => {
  withConfig({ protectionBlinkMs: 300, protectionMinAlpha: 0.6 }, () => assert.doesNotThrow(checkFlashRate));
});

test('overrides are restored after each check', () => {
  const before = { protectionBlinkMs: config.protectionBlinkMs, protectionMinAlpha: config.protectionMinAlpha };
  assert.throws(() => withConfig({ protectionBlinkMs: 300, protectionMinAlpha: 0 }, checkFlashRate));
  assert.deepEqual(
    { protectionBlinkMs: config.protectionBlinkMs, protectionMinAlpha: config.protectionMinAlpha },
    before,
  );
});

test('protectionAlpha snaps back once per period, so flashes a second is 1000 / protectionBlinkMs', () => {
  const snaps = countSnapBacks(10);
  assert.ok(Math.abs(snaps - 10) <= 1, `expected 10 snap backs (within 1) over 10 periods, got ${snaps}`);
});
