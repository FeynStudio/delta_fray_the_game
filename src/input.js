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
//   (world angle = heading + 180 + needle). The movement slice turns this into a world angle.
import config from './config.js';

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
