import config from './config.js';
import { createInitialState, shipPoints, wrapDegrees } from './rules.js';

export function bounce(value, dir, delta, min, max) {
  const span = max - min;
  if (span <= 0) return { value: min, dir };
  const offset = Math.min(Math.max(value - min, 0), span);
  const period = 2 * span;
  const p = (((dir === -1 ? period - offset : offset) + delta) % period + period) % period;
  return p <= span ? { value: min + p, dir: 1 } : { value: min + period - p, dir: -1 };
}

export function stepGauge(state, ms) {
  const g = state.gauge;
  if (!(ms > 0) || (g.phase !== 'power' && g.phase !== 'direction')) return state;
  const dir = g.sweep === -1 ? -1 : 1;
  if (g.phase === 'power') {
    const r = bounce(g.power, dir, ms / config.gaugePowerSweepMs, 0, 1);
    return { ...state, gauge: { ...g, power: r.value, sweep: r.dir } };
  }
  const max = config.gaugeNeedleMax;
  const r = bounce(g.needle, dir, (ms / config.gaugeNeedleSweepMs) * 2 * max, -max, max);
  return { ...state, gauge: { ...g, needle: r.value, sweep: r.dir } };
}

export function pressKey(state, key) {
  const g = state.gauge;
  if (key === 'Space' && g.phase === 'power') {
    const distance = g.power * config.maxMove;
    return { ...state, gauge: { ...g, phase: 'direction', distance, needle: 0, backward: false, sweep: 1 } };
  }
  if (key === 'Space' && g.phase === 'direction') {
    return { ...state, gauge: { ...g, phase: 'moving' } };
  }
  if (key === 'Shift' && g.phase === 'direction') {
    return { ...state, gauge: { ...g, backward: !g.backward } };
  }
  return state;
}

export function keyFromEvent(event) {
  if (event.repeat) return null;
  if (event.code === 'Space') return 'Space';
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return 'Shift';
  return null;
}

export function moveFromGauge(state) {
  const { distance, needle, backward } = state.gauge;
  const heading = state.ships[state.turn].heading;
  return { distance, angle: wrapDegrees(heading + (backward ? 180 : 0) + needle), backward };
}

export function pointAlong(from, to, t) {
  const k = Math.min(Math.max(t, 0), 1);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

const withShip = (state, ship) => ({
  ...state,
  ships: state.ships.map((s, j) => (j === state.turn ? ship : s)),
});

export function startMove(state, end) {
  const ship = state.ships[state.turn];
  const to = end.ships[state.turn];
  const anim = { from: { x: ship.x, y: ship.y }, to, ships: end.ships, elapsed: 0 };
  return { ...withShip(state, { ...ship, heading: to.heading }), anim };
}

export function stepMove(state, ms) {
  const a = state.anim;
  if (state.gauge.phase !== 'moving' || !(ms > 0)) return state;
  if (!a) {
    const { anim: _none, ...rest } = state;
    return { ...rest, gauge: createInitialState().gauge };
  }
  const elapsed = a.elapsed + ms;
  if (elapsed >= config.moveAnimMs) {
    const { anim: _done, ...rest } = withShip(state, a.to);
    const ships = a.ships ?? rest.ships;
    return { ...rest, ships, gauge: createInitialState().gauge };
  }
  const ship = state.ships[state.turn];
  const p = pointAlong(a.from, a.to, elapsed / config.moveAnimMs);
  return { ...withShip(state, { ...ship, x: p.x, y: p.y }), anim: { ...a, elapsed } };
}

export function insideMap(ship) {
  const pts = shipPoints(ship, config.shipSize, config.shipWidth);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const shift = (lo, hi, max) => Math.max(0, -lo) - Math.max(0, hi - max);
  return {
    x: ship.x + shift(Math.min(...xs), Math.max(...xs), config.worldWidth),
    y: ship.y + shift(Math.min(...ys), Math.max(...ys), config.worldHeight),
  };
}

export function startExplosions(state) {
  const born = state.ships.flatMap((ship, i) => {
    if (ship.alive !== false) return [];
    const centre = i === state.turn ? insideMap(ship) : { x: ship.x, y: ship.y };
    return [{ ship: i, x: centre.x, y: centre.y, heading: ship.heading, elapsed: 0 }];
  });
  if (born.length === 0) return state;
  return { ...state, explosions: [...(state.explosions ?? []), ...born] };
}

export function stepExplosions(state, ms) {
  if (!state.explosions || !(ms > 0)) return state;
  const explosions = state.explosions
    .map((e) => ({ ...e, elapsed: e.elapsed + ms }))
    .filter((e) => e.elapsed < config.explosionMs);
  return { ...state, explosions };
}
