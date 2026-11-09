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

// Slim isosceles triangle in game units: two long sides of length size, back edge of length width.
// Tip points along the heading; the centroid sits at the ship position. Returns [tip, back1, back2].
// The one ship shape: render.js draws it and resolveMove tests hits with it.
export function shipPoints(ship, size, width) {
  const length = Math.sqrt(size * size - (width / 2) * (width / 2)); // tip to back edge
  const h = (ship.heading * Math.PI) / 180;
  const fx = Math.cos(h), fy = Math.sin(h); // forward
  const px = -fy, py = fx; // perpendicular
  const backX = ship.x - (fx * length) / 3, backY = ship.y - (fy * length) / 3;
  return [
    { x: ship.x + (fx * 2 * length) / 3, y: ship.y + (fy * 2 * length) / 3 },
    { x: backX + (px * width) / 2, y: backY + (py * width) / 2 },
    { x: backX - (px * width) / 2, y: backY - (py * width) / 2 },
  ];
}

// Floating-point slack in game units, so shapes that only just touch still count as touching.
const TOUCH = 1e-9;

// Convex hull of points (monotone chain), counter-clockwise in screen axes, collinear points dropped.
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

// Separating axis test for two convex polygons. Touching (a shared edge or point) counts as overlap.
function polygonsOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len === 0) continue;
      const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
      const project = (poly2) => poly2.map((v) => v.x * nx + v.y * ny);
      const pa = project(a), pb = project(b);
      if (Math.max(...pa) < Math.min(...pb) - TOUCH || Math.max(...pb) < Math.min(...pa) - TOUCH) return false;
    }
  }
  return true;
}

// applyMove plus hits and walls (FEATURE_MAP sections 5 and 9). The mover's triangle, already turned
// to its new heading as the move starts (as input.startMove draws it), sweeps the convex hull of its
// start and end triangles. Every living enemy whose triangle overlaps or touches that area is
// destroyed; the whole path counts, so an enemy hit before the wall is still destroyed. The mover is
// destroyed if any part of the swept area touches or crosses a map edge (human decision 2026-11-09).
// Destroyed ships get alive: false where they are: no clamping, respawn or turn change here.
// A move over config.maxMove is refused and the state comes back unchanged (applyMove).
export function resolveMove(state, move) {
  const moved = applyMove(state, move);
  if (moved === state) return state;
  const i = state.turn;
  const end = moved.ships[i];
  const start = { ...end, x: state.ships[i].x, y: state.ships[i].y };
  const shape = (ship) => shipPoints(ship, config.shipSize, config.shipWidth);
  const swept = convexHull([...shape(start), ...shape(end)]);
  const W = config.worldWidth, H = config.worldHeight;
  const hitsWall = swept.some((p) => p.x <= TOUCH || p.y <= TOUCH || p.x >= W - TOUCH || p.y >= H - TOUCH);
  const ships = moved.ships.map((ship, j) => {
    if (j === i) return hitsWall ? { ...ship, alive: false } : ship;
    if (ship.alive && polygonsOverlap(swept, shape(ship))) return { ...ship, alive: false };
    return ship;
  });
  return { ...moved, ships };
}

// Ends the turn after a move (FEATURE_MAP sections 6 and 9): every destroyed ship (alive: false) is
// replaced by a new one at config.spawns[i] (read at call time), living ships stay as they are, and
// the turn passes to the other player exactly once, also after a double kill. Other fields are kept.
// When to call it is up to game.js (after the move animation). No turn timer, no end of game.
export function endTurn(state) {
  const ships = state.ships.map((ship, i) => {
    if (ship.alive !== false) return ship;
    const { x, y, heading } = config.spawns[i];
    return { x, y, heading, alive: true };
  });
  return { ...state, ships, turn: state.turn === 0 ? 1 : 0 };
}
