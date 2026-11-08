import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { drawShips, fitCanvas, fitScale, shipPoints } from '../src/render.js';

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
