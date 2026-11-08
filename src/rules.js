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
