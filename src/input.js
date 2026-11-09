// Controls and gauges (docs/DESIGN.md "Controls"). Pure functions: each takes the state and
// returns a state, never mutating the input. No DOM here; game.js wires keyboard events to pressKey.
// Reads config at call time.
//
// Gauge: { phase: 'power' | 'direction' | 'moving', power: 0..1, needle, backward, distance, sweep }
// - sweep (1 or -1) is the direction the active reading is moving in, so a gauge edited through
//   setState carries on smoothly from its new value.
// - needle is in degrees within -config.gaugeNeedleMax..+config.gaugeNeedleMax, same rotation sense as
//   heading (positive = clockwise on screen). backward: false measures it from the ship's nose
//   (world angle = heading + needle); backward: true measures it from the ship's tail
//   (world angle = heading + 180 + needle). moveFromGauge turns this into a world angle.
//
// Move animation (T-003, T-005): after the second Space, game.js gets the end state from
// rules.resolveMove and calls startMove, which keeps state.anim = { from: {x, y}, to: ship, ships,
// elapsed } (ships = every ship as the end state has it, so an enemy destroyed on the way is kept).
// stepMove moves only the mover along the straight segment from -> to at constant speed and, after
// config.moveAnimMs, puts in all of `ships` (the mover exactly at `to`), drops anim and puts the gauge
// back in the power phase. Passing the turn (rules.endTurn) is game.js's job.
import config from './config.js';
import { createInitialState, wrapDegrees } from './rules.js';

// Moves value by delta along a line that bounces between min and max (a triangle wave).
// Returns the new value and the direction it is now moving in.
export function bounce(value, dir, delta, min, max) {
  const span = max - min;
  if (span <= 0) return { value: min, dir };
  const offset = Math.min(Math.max(value - min, 0), span);
  const period = 2 * span;
  const p = (((dir === -1 ? period - offset : offset) + delta) % period + period) % period;
  return p <= span ? { value: min + p, dir: 1 } : { value: min + period - p, dir: -1 };
}

// Advances the active gauge reading by ms of elapsed time. Does nothing in the moving phase.
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

// Applies one key press ('Space' or 'Shift'). Uses the gauge values in state at the moment of the press.
export function pressKey(state, key) {
  const g = state.gauge;
  if (key === 'Space' && g.phase === 'power') {
    const distance = g.power * config.maxMove;
    return { ...state, gauge: { ...g, phase: 'direction', distance, needle: 0, backward: false, sweep: 1 } };
  }
  if (key === 'Space' && g.phase === 'direction') {
    // Launch immediately: no confirm step. Needle, backward and distance stay as they were.
    return { ...state, gauge: { ...g, phase: 'moving' } };
  }
  if (key === 'Shift' && g.phase === 'direction') {
    return { ...state, gauge: { ...g, backward: !g.backward } };
  }
  return state;
}

// Maps a keydown event to a control name, or null. Key repeat never counts as a press.
export function keyFromEvent(event) {
  if (event.repeat) return null;
  if (event.code === 'Space') return 'Space';
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return 'Shift';
  return null;
}

// Turns the locked gauge into a Move for the ship whose turn it is (convention at the top of this file).
export function moveFromGauge(state) {
  const { distance, needle, backward } = state.gauge;
  const heading = state.ships[state.turn].heading;
  return { distance, angle: wrapDegrees(heading + (backward ? 180 : 0) + needle), backward };
}

// Point at fraction t of the straight segment from -> to. t is clamped to 0..1, so it never overshoots.
export function pointAlong(from, to, t) {
  const k = Math.min(Math.max(t, 0), 1);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

const withShip = (state, ship) => ({
  ...state,
  ships: state.ships.map((s, j) => (j === state.turn ? ship : s)),
});

// Starts the move animation towards end (the rules.resolveMove result for this state).
// A forward move turns the ship to its new heading as the move starts.
export function startMove(state, end) {
  const ship = state.ships[state.turn];
  const to = end.ships[state.turn];
  const anim = { from: { x: ship.x, y: ship.y }, to, ships: end.ships, elapsed: 0 };
  return { ...withShip(state, { ...ship, heading: to.heading }), anim };
}

// Advances the move animation by ms. Does nothing unless a move is running.
export function stepMove(state, ms) {
  const a = state.anim;
  if (!a || state.gauge.phase !== 'moving' || !(ms > 0)) return state;
  const elapsed = a.elapsed + ms;
  if (elapsed >= config.moveAnimMs) {
    const { anim: _done, ...rest } = withShip(state, a.to);
    const ships = a.ships ?? rest.ships; // an anim loaded without ships (older state) moves only the mover
    return { ...rest, ships, gauge: createInitialState().gauge };
  }
  const ship = state.ships[state.turn];
  const p = pointAlong(a.from, a.to, elapsed / config.moveAnimMs);
  return { ...withShip(state, { ...ship, x: p.x, y: p.y }), anim: { ...a, elapsed } };
}
