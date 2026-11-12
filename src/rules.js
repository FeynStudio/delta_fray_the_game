import config from './config.js';

export function createInitialState() {
  return {
    turn: 0,
    ships: config.spawns.map((s) => ({ x: s.x, y: s.y, heading: s.heading, alive: true, unmovedSinceSpawn: true })),
    gauge: { phase: 'power', power: 0, needle: 0, backward: false, distance: 0, sweep: 1 },
    scores: config.spawns.map(() => config.scoreStart),
  };
}

export function currentScores(state) {
  return state.scores ? [...state.scores] : state.ships.map(() => config.scoreStart);
}

export function scoreMove(before, after) {
  const scores = currentScores(before);
  const i = before.turn;
  before.ships.forEach((ship, j) => {
    if (ship.alive === false || after.ships[j].alive !== false) return;
    scores[i] += j === i ? config.scoreWall : config.scoreKill;
  });
  return scores;
}

export function wrapDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

export function applyMove(state, move) {
  if (move.distance > config.maxMove) return state;
  const i = state.turn;
  const ship = state.ships[i];
  const a = (move.angle * Math.PI) / 180;
  const moved = {
    ...ship,
    x: ship.x + Math.cos(a) * move.distance,
    y: ship.y + Math.sin(a) * move.distance,
    heading: wrapDegrees(move.angle),
    unmovedSinceSpawn: false,
  };
  return { ...state, ships: state.ships.map((s, j) => (j === i ? moved : s)) };
}

export function shipPoints(ship, size, width) {
  const length = Math.sqrt(size * size - (width / 2) * (width / 2));
  const h = (ship.heading * Math.PI) / 180;
  const fx = Math.cos(h), fy = Math.sin(h);
  const px = -fy, py = fx;
  const backX = ship.x - (fx * length) / 3, backY = ship.y - (fy * length) / 3;
  return [
    { x: ship.x + (fx * 2 * length) / 3, y: ship.y + (fy * 2 * length) / 3 },
    { x: backX + (px * width) / 2, y: backY + (py * width) / 2 },
    { x: backX - (px * width) / 2, y: backY - (py * width) / 2 },
  ];
}

const TOUCH = 1e-9;

export function isSpawnProtected(state, i) {
  const ship = state.ships[i];
  const spawn = config.spawns[i];
  return Boolean(ship && spawn && ship.alive === true && ship.unmovedSinceSpawn === true
    && Math.abs(ship.x - spawn.x) <= TOUCH && Math.abs(ship.y - spawn.y) <= TOUCH);
}

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

function polygonsOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = -dy / len, ny = dx / len;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA < minB - TOUCH || maxB < minA - TOUCH) return false;
    }
  }
  return true;
}

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
    if (ship.alive && !isSpawnProtected(moved, j) && polygonsOverlap(swept, shape(ship))) {
      return { ...ship, alive: false };
    }
    return ship;
  });
  return { ...moved, ships };
}

export function endTurn(state) {
  const ships = state.ships.map((ship, i) => {
    if (ship.alive !== false) return ship;
    const { x, y, heading } = config.spawns[i];
    return { x, y, heading, alive: true, unmovedSinceSpawn: true };
  });
  return { ...state, ships, turn: state.turn === 0 ? 1 : 0 };
}
