import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { drawGauge, drawShips, fitCanvas, fitScale, gaugeLayout, shipPoints } from '../src/render.js';
import { createInitialState } from '../src/rules.js';

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
  { phase: 'direction', power: 1, distance: config.maxMove, needle: -90, backward: true },
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

test('gauges are scaled: power bar 50% and dial 70% of their base size (read from config)', () => {
  const { bar, dial } = gaugeLayout(gaugeState(0, { phase: 'direction' }));
  assert.ok(Math.abs(bar.w - config.gaugeBarWidth * config.gaugePowerScale) < 1e-9);
  assert.ok(Math.abs(bar.h - config.gaugeBarHeight * config.gaugePowerScale) < 1e-9);
  assert.ok(Math.abs(dial.r - config.gaugeDialRadius * config.gaugeDialScale) < 1e-9);
  assert.equal(config.gaugePowerScale, 0.5);
  assert.equal(config.gaugeDialScale, 0.7);
});

test('power bar sits just below the active ship, centred on it', () => {
  for (const turn of [0, 1]) {
    const state = gaugeState(turn, { phase: 'power' });
    const ship = state.ships[turn];
    const { bar } = gaugeLayout(state);
    const lowest = Math.max(...shipPoints(ship, config.shipSize, config.shipWidth).map((p) => p.y));
    assert.ok(bar.y > lowest, 'below the ship');
    assert.ok(bar.y - lowest <= config.gaugePowerGap + config.shipLineWidth + config.gaugeLineWidth, 'right below');
    assert.ok(Math.abs(bar.x + bar.w / 2 - ship.x) < 1e-9, 'centred under the ship');
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
  for (const heading of [0, 45, 90, 135, 180, 270]) {
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
