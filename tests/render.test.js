import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { fitCanvas, fitScale, shipPoints } from '../src/render.js';

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

test('shipPoints is an equilateral triangle with its tip along the heading', () => {
  const ship = { x: 100, y: 100, heading: 90, alive: true };
  const [tip, a, b] = shipPoints(ship, config.shipSize);
  const side = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  for (const len of [side(tip, a), side(a, b), side(b, tip)]) assert.ok(Math.abs(len - config.shipSize) < 1e-9);
  assert.ok(Math.abs(tip.x - ship.x) < 1e-9 && tip.y > ship.y, 'heading 90 points down (+y)');
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
