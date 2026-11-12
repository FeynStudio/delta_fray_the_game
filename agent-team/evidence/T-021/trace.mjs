import { writeFileSync } from 'node:fs';
import config from '../../../src/config.js';
import * as rules from '../../../src/rules.js';
import * as input from '../../../src/input.js';
import * as render from '../../../src/render.js';

function seeded(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => (...args) => { calls.push([String(name), ...args]); },
    set: (_t, name, value) => { calls.push(['set', String(name), value]); return true; },
  });
  return { ctx, calls };
}

function draw(fn, ...args) {
  const { ctx, calls } = recorder();
  fn(ctx, ...args);
  return calls;
}

const out = { rules: [], input: [], render: [] };
const rng = seeded(21);
const rnd = (lo, hi) => lo + rng() * (hi - lo);

for (let n = 0; n < 4000; n += 1) {
  const state = rules.createInitialState();
  state.turn = n % 2;
  if (n % 3 !== 0) {
    state.ships = state.ships.map((s) => ({
      x: rnd(0, config.worldWidth), y: rnd(0, config.worldHeight), heading: rnd(-720, 720),
      alive: rng() > 0.1, unmovedSinceSpawn: rng() > 0.5,
    }));
  }
  if (n % 7 === 0) state.ships[1 - state.turn] = { ...state.ships[state.turn], heading: rnd(0, 360) };
  if (n % 11 === 0) delete state.scores;
  const move = { distance: n % 13 === 0 ? 0 : rnd(0, config.maxMove * 1.05), angle: rnd(-400, 400) };
  const after = rules.resolveMove(state, move);
  out.rules.push([move, after, rules.scoreMove(state, after), rules.endTurn(after),
    rules.isSpawnProtected(after, 0), rules.isSpawnProtected(after, 1), input.insideMap(after.ships[state.turn])]);
}

let s = rules.createInitialState();
for (let n = 0; n < 3000; n += 1) {
  const ms = n % 17 === 0 ? 0 : rnd(1, 400);
  const r = rng();
  if (r < 0.15) s = input.pressKey(s, 'Space');
  else if (r < 0.25) s = input.pressKey(s, 'Shift');
  if (s.gauge.phase === 'moving' && !s.anim && rng() > 0.05) {
    s = input.startMove(s, rules.resolveMove(s, input.moveFromGauge(s)));
  }
  const wasMoving = Boolean(s.anim);
  s = input.stepMove(input.stepGauge(input.stepExplosions(s, ms), ms), ms);
  if (wasMoving && !s.anim) s = rules.endTurn(input.startExplosions(s));
  s = { ...s, clock: (s.clock ?? 0) + ms };
  out.input.push(structuredClone(s));
  if (n % 5 === 0) {
    out.render.push({
      frame: draw(render.drawFrame, s),
      layout: render.gaugeLayout(s),
      bar: draw(render.drawPowerBar, s),
      dial: draw(render.drawDirectionDial, s),
      gauge: draw(render.drawGauge, s),
      ships: draw(render.drawShips, s),
      explosions: draw(render.drawExplosions, s),
      scores: draw(render.drawScores, s),
    });
  }
}

out.misc = {
  bounce: Array.from({ length: 200 }, () => input.bounce(rnd(-2, 2), rng() > 0.5 ? 1 : -1, rnd(-5, 5), -1, rnd(-1.5, 3))),
  pointAlong: Array.from({ length: 50 }, () => input.pointAlong({ x: rnd(0, 9), y: rnd(0, 9) }, { x: rnd(0, 9), y: rnd(0, 9) }, rnd(-1, 2))),
  keys: [{ code: 'Space' }, { code: 'ShiftLeft' }, { code: 'ShiftRight' }, { code: 'KeyA' }, { code: 'Space', repeat: true }].map(input.keyFromEvent),
  alpha: Array.from({ length: 200 }, () => render.protectionAlpha(rnd(-1000, 5000))),
  pieces: Array.from({ length: 50 }, () => render.explosionPieces({ ship: 0, x: rnd(0, 1280), y: rnd(0, 960), heading: rnd(0, 360) }, rnd(-100, 1200))),
  fitScale: [render.fitScale(1920, 1080, config.worldWidth, config.worldHeight), render.fitScale(800, 900, config.worldWidth, config.worldHeight)],
  map: draw(render.drawMap),
  title: draw(render.drawTitle),
  wrap: [-720, -90, 0, 359.5, 360, 450, 1e9].map(rules.wrapDegrees),
  shipPoints: rules.shipPoints({ x: 3, y: 4, heading: 33 }, config.shipSize, config.shipWidth),
  sameShipPoints: render.shipPoints === rules.shipPoints,
  colors: render.COLORS,
};

writeFileSync(process.argv[2], JSON.stringify(out));
