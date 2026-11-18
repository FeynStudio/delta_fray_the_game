import config from '../../../src/config.js';
import { shipPoints } from '../../../src/rules.js';
import { bounce, pointAlong, stepGauge } from '../../../src/input.js';
import { explosionPieces, fitCanvas } from '../../../src/render.js';

const out = (label, value) => console.log('%s', `${label}: ${JSON.stringify(value)}`);
const r3 = (v) => Math.round(v * 1000) / 1000;

const ship = { x: 0, y: 0, heading: 0 };
const pts = shipPoints(ship, config.shipSize, config.shipWidth);
out('(a) shipPoints [tip, left, right] at heading 0', pts.map((p) => ({ x: r3(p.x), y: r3(p.y) })));
out('(a) config.explosionCuts', config.explosionCuts);
const pieces = explosionPieces(ship, 0);
const sides = [[0, 1], [1, 2], [2, 0]];
out('(a) cut point of each side k (end of piece 2k) and its fraction from pts[k] to pts[k+1]', sides.map(([a, b], k) => {
  const cut = pieces[2 * k].to;
  const t = Math.hypot(cut.x - pts[a].x, cut.y - pts[a].y) / Math.hypot(pts[b].x - pts[a].x, pts[b].y - pts[a].y);
  return { side: `${a}->${b}`, t: r3(t) };
}));

const stub = () => {
  const calls = [];
  return { style: {}, getContext: () => ({ setTransform: (...a) => calls.push(a) }), calls };
};
const c1 = stub();
fitCanvas(c1, 1920, 1080, 1);
const c2 = stub();
fitCanvas(c2, 1920, 1080, 2);
out('(c) fitCanvas 1920x1080 dpr 1: css size, backing store', [c1.style.width, c1.style.height, c1.width, c1.height]);
out('(c) fitCanvas 1920x1080 dpr 2: css size, backing store', [c2.style.width, c2.style.height, c2.width, c2.height]);

const gauge = (g) => ({ ships: [ship], turn: 0, gauge: { phase: 'power', power: 0, needle: 0, backward: false, distance: 0, sweep: 1, ...g } });
const p1 = stepGauge(gauge({}), config.gaugePowerSweepMs).gauge;
const p2 = stepGauge(gauge({}), 2 * config.gaugePowerSweepMs).gauge;
out('(e) power after gaugePowerSweepMs from 0, and after twice that', [r3(p1.power), p1.sweep, r3(p2.power), p2.sweep]);
const n1 = stepGauge(gauge({ phase: 'direction', needle: -config.gaugeNeedleMax }), config.gaugeNeedleSweepMs).gauge;
out('(f) needle after gaugeNeedleSweepMs from -gaugeNeedleMax', [r3(n1.needle), n1.sweep]);

out('(g) bounce(0, 1, d, 0, 1) for d = 0.25, 0.75, 1, 1.25, 2', [0.25, 0.75, 1, 1.25, 2].map((d) => bounce(0, 1, d, 0, 1)));

const dist = pts.map((p) => r3(Math.hypot(p.x - ship.x, p.y - ship.y)));
out('(h) distance of tip, left, right from the ship centre', dist);

out('(j) pointAlong at t = -0.5, 0.5, 1.5', [-0.5, 0.5, 1.5].map((t) => pointAlong({ x: 0, y: 0 }, { x: 10, y: 0 }, t)));
