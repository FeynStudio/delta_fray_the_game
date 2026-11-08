import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config.js';
import { shipPoints } from '../src/render.js';

const angleDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

test('config holds the Prototype 1 starting values', () => {
  assert.equal(config.worldWidth, 1280);
  assert.equal(config.worldHeight, 960);
  assert.equal(config.shipSize, 30);
  assert.equal(config.maxMove, 150);
  assert.equal(config.spawns.length, 2);
  for (const s of config.spawns) {
    assert.equal(typeof s.x, 'number');
    assert.equal(typeof s.y, 'number');
    assert.equal(typeof s.heading, 'number');
  }
});

test('config is a plain, mutable object', () => {
  assert.equal(Object.getPrototypeOf(config), Object.prototype);
  assert.equal(Object.isFrozen(config), false);
});

test('spawns are on opposite sides of the map, 850 to 950 units apart', () => {
  const [a, b] = config.spawns;
  const midX = config.worldWidth / 2;
  assert.ok((a.x - midX) * (b.x - midX) < 0, 'spawns must be on opposite halves of the map');
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(dist >= 850 && dist <= 950, `spawns are ${dist} units apart`);
});

test('each spawned ship triangle lies fully inside the map without touching an edge', () => {
  for (const s of config.spawns) {
    for (const p of shipPoints(s, config.shipSize)) {
      assert.ok(p.x > 0 && p.x < config.worldWidth, `corner x ${p.x} is not inside the map`);
      assert.ok(p.y > 0 && p.y < config.worldHeight, `corner y ${p.y} is not inside the map`);
    }
  }
});

test('each spawn heading points at the other spawn (within 1 degree)', () => {
  config.spawns.forEach((s, i) => {
    const o = config.spawns[1 - i];
    const toOther = (Math.atan2(o.y - s.y, o.x - s.x) * 180) / Math.PI;
    assert.ok(Math.abs(angleDiff(s.heading, toOther)) < 1, `spawn ${i} heading ${s.heading} vs ${toOther}`);
  });
});
