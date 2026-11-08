// Pure game rules only (see docs/DESIGN.md Architecture Rules). Reads config at call time.
import config from './config.js';

// Builds the starting state: player 1 to move, both ships alive at their spawn points.
export function createInitialState() {
  return {
    turn: 0,
    ships: config.spawns.map((s) => ({ x: s.x, y: s.y, heading: s.heading, alive: true })),
    gauge: { phase: 'power', power: 0, needle: 0, backward: false, distance: 0, sweep: 1 },
  };
}

// Keeps an angle in degrees within 0 (inclusive) to 360 (exclusive), e.g. -90 -> 270, 450 -> 90.
export function wrapDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

// Moves the ship whose turn it is by move.distance along move.angle (degrees, 0 = +x, 90 = +y).
// A forward move turns the heading to the travel angle; a backward move keeps it.
// A move longer than config.maxMove is refused: the state comes back unchanged
// (human decision, 2026-11-08). No hits, walls, respawn or turn change here.
export function applyMove(state, move) {
  if (move.distance > config.maxMove) return state;
  const i = state.turn;
  const ship = state.ships[i];
  const a = (move.angle * Math.PI) / 180;
  const moved = {
    ...ship,
    x: ship.x + Math.cos(a) * move.distance,
    y: ship.y + Math.sin(a) * move.distance,
    heading: move.backward ? ship.heading : wrapDegrees(move.angle),
  };
  return { ...state, ships: state.ships.map((s, j) => (j === i ? moved : s)) };
}
