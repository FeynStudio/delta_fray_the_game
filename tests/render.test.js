import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import {
  COLORS, drawExplosions, drawGauge, drawScores, drawShips, explosionPieces, fitCanvas, fitScale, gaugeLayout,
  protectionAlpha, shipPoints,
} from '../src/render.js';
import { createInitialState, isSpawnProtected } from '../src/rules.js';

const W = config.worldWidth;
const H = config.worldHeight;

test('fitScale fills one window dimension and keeps the aspect ratio', () => {
  for (const [vw, vh] of [[1920, 1080], [1000, 1000], [800, 1200]]) {
    const s = fitScale(vw, vh, W, H);
    const w = W * s;
    const h = H * s;
    assert.ok(w <= vw + 1e-9 && h <= vh + 1e-9, `fits ${vw}x${vh}`);
    assert.ok(Math.abs(w - vw) < 1e-9 || Math.abs(h - vh) < 1e-9, `fills ${vw}x${vh}`);
    assert.ok(Math.abs(w / h - W / H) < 1e-9);
  }
});

test('shipPoints is a narrow isosceles triangle with its tip along the heading', () => {
  const side = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  for (const heading of [0, 90, 180, 237]) {
    const ship = { x: 100, y: 100, heading, alive: true };
    const [tip, a, b] = shipPoints(ship, config.shipSize, config.shipWidth);
    assert.ok(Math.abs(side(tip, a) - config.shipSize) < 1e-9, 'long side');
    assert.ok(Math.abs(side(tip, b) - config.shipSize) < 1e-9, 'long side');
    assert.ok(Math.abs(side(a, b) - config.shipWidth) < 1e-9, 'back edge is shipWidth');
    assert.ok(side(a, b) < side(tip, a), 'narrower than equilateral');
    const cx = (tip.x + a.x + b.x) / 3, cy = (tip.y + a.y + b.y) / 3;
    assert.ok(Math.abs(cx - ship.x) < 1e-9 && Math.abs(cy - ship.y) < 1e-9, 'centroid at ship position');
    const tipAngle = (Math.atan2(tip.y - ship.y, tip.x - ship.x) * 180) / Math.PI;
    assert.ok(Math.abs(((((tipAngle - heading) % 360) + 540) % 360) - 180) < 1e-9, 'tip along heading');
  }
});

test('drawShips draws outlines only: stroke, no fill or gradient', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push(k)),
    set: (t, k, v) => { t[k] = v; calls.push(`set ${String(k)}`); return true; },
  });
  const state = { ships: [{ x: 190, y: 480, heading: 0, alive: true }, { x: 1090, y: 480, heading: 180, alive: true }] };
  drawShips(ctx, state);
  assert.equal(calls.filter((c) => c === 'stroke').length, 2);
  assert.ok(!calls.some((c) => /fill|Gradient|shadow|Pattern/i.test(String(c))), `unexpected calls: ${calls}`);
});

test('fitCanvas sizes the canvas to fit, keep aspect and stay sharp (same checks as the smoke probe)', () => {
  for (const [vw, vh, dpr] of [[1920, 1080, 1], [1000, 1000, 2]]) {
    const stubCtx = { setTransform() {} };
    const canvas = { style: {}, width: 0, height: 0, getContext: () => stubCtx };
    fitCanvas(canvas, vw, vh, dpr);
    const left = parseFloat(canvas.style.left);
    const top = parseFloat(canvas.style.top);
    const w = parseFloat(canvas.style.width);
    const h = parseFloat(canvas.style.height);
    assert.ok(left >= -0.5 && top >= -0.5 && left + w <= vw + 0.5 && top + h <= vh + 0.5, `inside ${vw}x${vh}`);
    assert.ok(Math.abs(w - vw) <= 2 || Math.abs(h - vh) <= 2, `fills ${vw}x${vh}`);
    assert.ok(Math.abs(w / h - W / H) <= 0.01, 'aspect kept');
    assert.ok(Math.abs(canvas.width - w * dpr) <= 2 && Math.abs(canvas.height - h * dpr) <= 2, 'sharp');
  }
});

// ---- gauges on the active ship (human decision of 2026-11-08) ----
const deepFreeze = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const recordingCtx = (calls) => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
  set: (t, k, v) => { t[k] = v; return true; },
});
const drawnPoints = (calls) => calls.flatMap(([k, ...a]) => {
  if (k === 'moveTo' || k === 'lineTo') return [{ x: a[0], y: a[1] }];
  if (k === 'arc') return [{ x: a[0] - a[2], y: a[1] - a[2] }, { x: a[0] + a[2], y: a[1] + a[2] }];
  if (k === 'strokeRect' || k === 'fillRect') return [{ x: a[0], y: a[1] }, { x: a[0] + a[2], y: a[1] + a[3] }];
  return [];
});
const gaugeState = (turn, gauge, ships) => {
  const base = createInitialState();
  return deepFreeze({ ...base, turn, ships: ships ?? base.ships, gauge: { ...base.gauge, ...gauge } });
};
const dialR = () => config.gaugeDialRadius * config.gaugeDialScale;
// Farthest any gauge part may reach from the active ship's centre.
const reach = () => config.shipSize + config.gaugeDialGap + config.gaugeLineWidth + 2 * dialR()
  + config.gaugePowerGap
  + Math.hypot((config.gaugeBarWidth * config.gaugePowerScale) / 2, config.gaugeBarHeight * config.gaugePowerScale);
const CASES = [
  { phase: 'power', power: 0.6 },
  { phase: 'direction', power: 0.6, distance: 0.6 * config.maxMove, needle: 30, backward: false },
  { phase: 'direction', power: 1, distance: config.maxMove, needle: -config.gaugeNeedleMax, backward: true },
];
const testShips = (x, y, heading) => [{ x, y, heading, alive: true }, { x: 1000, y: 800, heading: 180, alive: true }];

test('drawGauge only reads state and draws only around the active ship', () => {
  for (const turn of [0, 1]) {
    for (const g of CASES) {
      const state = gaugeState(turn, g);
      const before = structuredClone(state);
      const calls = [];
      drawGauge(recordingCtx(calls), state);
      assert.deepEqual(state, before, 'state unchanged');
      const pts = drawnPoints(calls);
      assert.ok(pts.length > 0, `${g.phase}: something is drawn`);
      const me = state.ships[turn], other = state.ships[1 - turn];
      for (const p of pts) {
        const dMe = Math.hypot(p.x - me.x, p.y - me.y);
        assert.ok(dMe <= reach(), `turn ${turn} ${g.phase}: point ${p.x},${p.y} is ${dMe} from the active ship`);
        assert.ok(dMe < Math.hypot(p.x - other.x, p.y - other.y), 'nothing drawn at the inactive ship');
      }
    }
  }
  const calls = [];
  drawGauge(recordingCtx(calls), gaugeState(0, { phase: 'moving' }));
  assert.equal(calls.length, 0, 'nothing drawn in the moving phase');
});

test('gauges are scaled: power bar 0.5 x 60% = 0.3 and dial 0.7 x 80% = 0.56 of base size (read from config)', () => {
  const { bar, dial } = gaugeLayout(gaugeState(0, { phase: 'direction' }));
  assert.ok(Math.abs(bar.w - config.gaugeBarWidth * config.gaugePowerScale) < 1e-9);
  assert.ok(Math.abs(bar.h - config.gaugeBarHeight * config.gaugePowerScale) < 1e-9);
  assert.ok(Math.abs(dial.r - config.gaugeDialRadius * config.gaugeDialScale) < 1e-9);
  // Deliberately pinned, not derived: these two values are the human's decisions of 2026-11-08
  // (agent-team/DECISIONS.md): power gauge 50%, then 60% of that (0.5 x 0.6); direction gauge 70%,
  // then 80% of that (0.7 x 0.8). Change them only with a new human decision.
  assert.ok(Math.abs(config.gaugePowerScale - 0.5 * 0.6) < 1e-9);
  assert.ok(Math.abs(config.gaugeDialScale - 0.7 * 0.8) < 1e-9);
});

test('power bar sits below the active ship, clear of its body, centred on it', () => {
  for (const turn of [0, 1]) {
    const state = gaugeState(turn, { phase: 'power' });
    const ship = state.ships[turn];
    const { bar } = gaugeLayout(state);
    const lowest = Math.max(...shipPoints(ship, config.shipSize, config.shipWidth).map((p) => p.y));
    assert.ok(bar.y > lowest + config.shipLineWidth, 'below the ship body');
    assert.ok(bar.y - ship.y <= reach(), 'still close to the ship');
    assert.ok(Math.abs(bar.x + bar.w / 2 - ship.x) < 1e-9, 'centred under the ship');
  }
});

test('the power bar does not move when the dial appears or flips (any heading)', () => {
  for (const heading of [0, 45, 90, 135, 180, 237, 270, 315]) {
    const ships = testShips(640, 400, heading);
    const base = gaugeLayout(gaugeState(0, { phase: 'power' }, ships)).bar;
    for (const backward of [false, true]) {
      const { bar } = gaugeLayout(gaugeState(0, { phase: 'direction', backward }, ships));
      assert.deepEqual(bar, base, `heading ${heading} backward ${backward}`);
    }
  }
});

test('direction dial is on the nose side when forward and the tail side when backward, on the long axis', () => {
  for (const heading of [0, 90, 180, 237]) {
    const ships = testShips(640, 400, heading);
    const s = ships[0];
    const fx = Math.cos((heading * Math.PI) / 180), fy = Math.sin((heading * Math.PI) / 180);
    const [tip, b1, b2] = shipPoints(s, config.shipSize, config.shipWidth);
    const noseAlong = (tip.x - s.x) * fx + (tip.y - s.y) * fy;
    const tailAlong = ((b1.x + b2.x) / 2 - s.x) * fx + ((b1.y + b2.y) / 2 - s.y) * fy;
    for (const backward of [false, true]) {
      const { dial } = gaugeLayout(gaugeState(0, { phase: 'direction', backward, needle: 0 }, ships));
      const along = (dial.x - s.x) * fx + (dial.y - s.y) * fy;
      const across = -(dial.x - s.x) * fy + (dial.y - s.y) * fx;
      assert.ok(Math.abs(across) < 1e-9, `heading ${heading}: dial on the long axis`);
      if (backward) assert.ok(along < tailAlong, `heading ${heading}: dial behind the tail`);
      else assert.ok(along > noseAlong, `heading ${heading}: dial in front of the nose`);
      assert.ok(Math.abs(along) <= config.shipSize + config.gaugeDialGap + config.gaugeLineWidth, 'right at the ship');
    }
  }
});

test('the dial size does not depend on the locked distance (no path preview)', () => {
  for (const p of [0, 0.5, 1]) {
    const calls = [];
    drawGauge(recordingCtx(calls), gaugeState(0, { phase: 'direction', power: p, distance: p * config.maxMove, needle: 20 }));
    const arc = calls.find(([k]) => k === 'arc');
    const needleEnd = calls.filter(([k]) => k === 'lineTo').at(-1);
    assert.ok(Math.abs(arc[3] - dialR()) < 1e-9, 'dial radius fixed');
    assert.ok(Math.abs(Math.hypot(needleEnd[1] - arc[1], needleEnd[2] - arc[2]) - dialR()) < 1e-9, 'needle length fixed');
  }
});

test('gauges follow the ship: a moved ship carries its gauges along', () => {
  const a = gaugeLayout(gaugeState(0, { phase: 'direction' }, testShips(300, 300, 0)));
  const b = gaugeLayout(gaugeState(0, { phase: 'direction' }, testShips(500, 350, 0)));
  assert.ok(Math.abs(b.dial.x - a.dial.x - 200) < 1e-9 && Math.abs(b.dial.y - a.dial.y - 50) < 1e-9);
  assert.ok(Math.abs(b.bar.x - a.bar.x - 200) < 1e-9 && Math.abs(b.bar.y - a.bar.y - 50) < 1e-9);
});

test('near the map edges every gauge part stays inside the map', () => {
  const spots = [[20, 20, 225], [W - 20, H - 20, 45], [W - 20, 20, 315], [20, H - 20, 135], [W / 2, H - 20, 90]];
  for (const [x, y, heading] of spots) {
    for (const g of CASES) {
      const calls = [];
      const ships = [{ x, y, heading, alive: true }, { x: W / 2, y: H / 2, heading: 0, alive: true }];
      drawGauge(recordingCtx(calls), gaugeState(0, g, ships));
      for (const p of drawnPoints(calls)) {
        assert.ok(p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H, `ship at ${x},${y}: point ${p.x},${p.y} off the map`);
      }
    }
  }
});

test('the power bar does not overlap the direction dial', () => {
  for (let heading = 0; heading < 360; heading += 15) {
    for (const backward of [false, true]) {
      const { bar, dial } = gaugeLayout(gaugeState(0, { phase: 'direction', backward }, testShips(640, 400, heading)));
      // Sample the whole bar: no point may fall inside the dial's half-disc.
      for (let i = 0; i <= 40; i++) {
        for (let j = 0; j <= 4; j++) {
          const dx = bar.x + (bar.w * i) / 40 - dial.x, dy = bar.y + (bar.h * j) / 4 - dial.y;
          const inFront = dx * Math.cos(dial.facing) + dy * Math.sin(dial.facing) >= 0;
          assert.ok(!(inFront && Math.hypot(dx, dy) < dial.r), `heading ${heading} backward ${backward}`);
        }
      }
    }
  }
});

// ---- explosions (T-007, human answer of 2026-11-09) ----
const boom = { ship: 1, x: 400, y: 300, heading: 237, elapsed: 0 };
const len = (s) => Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
const mid = (s) => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 });
const close = (p, q) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;

test('explosionPieces at 0 ms: 6 segments joined end to end into the ship triangle', () => {
  const pieces = explosionPieces(boom, 0);
  assert.equal(pieces.length, 6);
  const pts = shipPoints(boom, config.shipSize, config.shipWidth);
  pieces.forEach((p, i) => assert.ok(close(p.to, pieces[(i + 1) % 6].from), `piece ${i} joins piece ${i + 1}`));
  pts.forEach((pt, k) => assert.ok(close(pieces[2 * k].from, pt), `side ${k} starts at shipPoints[${k}]`));
});

test('explosionPieces: the two pieces of each side differ in length', () => {
  const pieces = explosionPieces(boom, 0);
  for (let k = 0; k < 3; k += 1) {
    assert.ok(Math.abs(len(pieces[2 * k]) - len(pieces[2 * k + 1])) > 1e-6, `side ${k} is cut unevenly`);
  }
});

test('explosionPieces at explosionMs: each piece is explosionEndScale of its 0 ms length', () => {
  const start = explosionPieces(boom, 0);
  const end = explosionPieces(boom, config.explosionMs);
  start.forEach((p, i) => assert.ok(Math.abs(len(end[i]) - config.explosionEndScale * len(p)) < 1e-9, `piece ${i}`));
});

test('explosionPieces: at 500 ms each midpoint is explosionSpeed x 0.5 farther from the centre', () => {
  const dist = (s) => Math.hypot(mid(s).x - boom.x, mid(s).y - boom.y);
  const start = explosionPieces(boom, 0);
  const half = explosionPieces(boom, 500);
  start.forEach((p, i) => {
    assert.ok(dist(half[i]) > dist(p), `piece ${i} moved outward`);
    assert.ok(Math.abs(dist(half[i]) - dist(p) - config.explosionSpeed * 0.5) < 1e-9, `piece ${i} speed`);
  });
});

test('drawExplosions: nothing without explosions; strokes in the ship colour with one; state unchanged', () => {
  const none = [];
  drawExplosions(recordingCtx(none), deepFreeze({ ships: [], explosions: [] }));
  drawExplosions(recordingCtx(none), deepFreeze({ ships: [] }));
  assert.equal(none.length, 0);

  const calls = [];
  const styles = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
    set: (t, k, v) => { if (k === 'strokeStyle') styles.push(v); t[k] = v; return true; },
  });
  const state = deepFreeze({ ships: [], explosions: [{ ...boom, elapsed: 250 }] });
  const before = JSON.stringify(state);
  drawExplosions(ctx, state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(calls.filter(([k]) => k === 'stroke').length, 1);
  assert.deepEqual(styles, [COLORS.ships[boom.ship]]);
  assert.equal(calls.filter(([k]) => k === 'moveTo').length, 6);
  assert.ok(!calls.some(([k]) => /fill/i.test(String(k))), 'outline only');
});

// ---- score corners (T-012) ----
test('drawScores: player 1 top-left, player 2 top-right, each in its ship colour, minus sign kept', () => {
  const texts = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      if (k === 'fillText') texts.push({ text: args[0], x: args[1], y: args[2], color: t.fillStyle, align: t.textAlign });
    }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const state = deepFreeze({ ...createInitialState(), scores: [-2, 7] });
  const copy = structuredClone(state);
  drawScores(ctx, state);
  assert.equal(texts.length, 2);
  const [p1, p2] = texts;
  assert.equal(p1.text, '-2');
  assert.ok(p1.x >= 0 && p1.x < W / 4 && p1.y >= 0 && p1.y < H / 4, JSON.stringify(p1));
  assert.equal(p1.color, COLORS.ships[0]);
  assert.equal(p2.text, '7');
  assert.ok(p2.x > (3 * W) / 4 && p2.x <= W && p2.y >= 0 && p2.y < H / 4, JSON.stringify(p2));
  assert.equal(p2.align, 'right', 'right-aligned so the text stays inside the map');
  assert.equal(p2.color, COLORS.ships[1]);
  assert.deepEqual(state, copy, 'state unchanged');
});

test('drawScores: a state without scores draws 0 for both; margins come from config', () => {
  const texts = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { if (k === 'fillText') texts.push(args); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  drawScores(ctx, { turn: 0, ships: createInitialState().ships });
  assert.deepEqual(texts, [
    ['0', config.scoreMargin, config.scoreMargin],
    ['0', W - config.scoreMargin, config.scoreMargin],
  ]);
});

// ---- spawn protection blink (T-010, human answers 2026-11-09: 400 ms, fade to invisible, snap back) ----
test('protectionAlpha: 1, 0.75, 0.5, 0.25 at 0, 1/4, 1/2, 3/4 of the period and 1 again at one period', () => {
  const P = config.protectionBlinkMs;
  assert.equal(P, 400);
  assert.equal(config.protectionMinAlpha, 0);
  const want = [[0, 1], [P / 4, 0.75], [P / 2, 0.5], [(3 * P) / 4, 0.25], [P, 1]];
  for (const [ms, a] of want) assert.ok(Math.abs(protectionAlpha(ms) - a) < 1e-9, `${ms} ms: ${protectionAlpha(ms)}`);
  // repeats exactly every period
  for (const [ms, a] of want) assert.ok(Math.abs(protectionAlpha(ms + 3 * P) - a) < 1e-9, `${ms + 3 * P} ms`);
});

test('protectionAlpha falls strictly within a cycle (no fade back in) and snaps back to 1', () => {
  const P = config.protectionBlinkMs;
  let prev = protectionAlpha(0);
  for (let ms = 1; ms <= (3 * P) / 4; ms += 1) {
    const a = protectionAlpha(ms);
    assert.ok(a < prev, `${ms} ms: ${a} not below ${prev}`);
    assert.ok(a > 0 && a <= 1, `${ms} ms in range`);
    prev = a;
  }
  assert.ok(protectionAlpha(P - 1) < 0.01, 'almost invisible just before the cycle ends');
  assert.equal(protectionAlpha(P), 1);
});

test('protectionAlpha reads period and minimum from config at call time', () => {
  const saved = { p: config.protectionBlinkMs, m: config.protectionMinAlpha };
  try {
    config.protectionBlinkMs = 800;
    const want = [[0, 1], [200, 0.75], [400, 0.5], [600, 0.25], [800, 1]];
    for (const [ms, a] of want) assert.ok(Math.abs(protectionAlpha(ms) - a) < 1e-9, `period 800, ${ms} ms`);
    config.protectionMinAlpha = 0.2;
    assert.ok(Math.abs(protectionAlpha(400) - 0.6) < 1e-9, 'min 0.2: halfway is 0.6');
  } finally {
    config.protectionBlinkMs = saved.p;
    config.protectionMinAlpha = saved.m;
  }
});

// Records globalAlpha at every stroke, and the value left on the context at the end.
const alphaCtx = () => {
  const strokes = [];
  const t = { globalAlpha: 1 };
  const ctx = new Proxy(t, {
    get: (o, k) => (k in o ? o[k] : (...args) => { if (k === 'stroke') strokes.push({ alpha: o.globalAlpha, color: o.strokeStyle }); }),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, strokes, t };
};

test('drawShips: only a spawn-protected ship is drawn below full opacity; globalAlpha back at 1; state unchanged', () => {
  const P = config.protectionBlinkMs;
  const base = createInitialState(); // both ships protected at game start (T-006)
  const moved = { ...base.ships[0], x: 400, unmovedSinceSpawn: false };
  const cases = [
    { ships: base.ships, clock: P / 4, want: [0.75, 0.75] },
    { ships: base.ships, clock: P / 2 + 7 * P, want: [0.5, 0.5] },
    { ships: base.ships, clock: 0, want: [1, 1] },
    { ships: [moved, base.ships[1]], clock: (3 * P) / 4, want: [1, 0.25] },
    { ships: [moved, { ...base.ships[1], unmovedSinceSpawn: false }], clock: P / 2, want: [1, 1] },
  ];
  for (const { ships, clock, want } of cases) {
    const state = deepFreeze(structuredClone({ ...base, ships, clock, explosions: [] }));
    const copy = structuredClone(state);
    const { ctx, strokes, t } = alphaCtx();
    drawShips(ctx, state);
    assert.equal(strokes.length, 2);
    strokes.forEach((s, i) => {
      assert.ok(Math.abs(s.alpha - want[i]) < 1e-9, `clock ${clock}, ship ${i}: alpha ${s.alpha}, want ${want[i]}`);
      assert.equal(s.alpha < 1, isSpawnProtected(state, i) && clock % P !== 0, `ship ${i} below 1 only when protected`);
      assert.equal(s.color, COLORS.ships[i]);
    });
    assert.equal(t.globalAlpha, 1, 'globalAlpha left at 1 for the gauges and anything drawn later');
    assert.deepEqual(state, copy, 'state unchanged');
  }
});

test('drawShips: a state without clock draws a protected ship at full opacity (clock 0)', () => {
  const { ctx, strokes, t } = alphaCtx();
  drawShips(ctx, createInitialState());
  assert.deepEqual(strokes.map((s) => s.alpha), [1, 1]);
  assert.equal(t.globalAlpha, 1);
});
