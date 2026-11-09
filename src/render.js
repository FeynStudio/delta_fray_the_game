// All canvas drawing. Each draw<Thing>(ctx, state) only reads state, never changes it.
// Drawing happens in game units; fitCanvas sets a transform that scales the world to the screen.
import config from './config.js';
import { shipPoints } from './rules.js';

// The ship shape lives in rules.js so hits use the same triangle that is drawn; re-exported here.
export { shipPoints };

// All drawing colours in one place. Lines must stay readable on the near-black background:
// the light grey 'dim' (map border, inactive gauge parts) has about 8:1 contrast against it.
export const COLORS = {
  background: '#05060f',
  dim: '#9aa5b8',
  ships: ['#4fd1ff', '#ff6b6b'], // active gauge parts use the active player's ship colour
};

// Largest world-to-CSS-pixel scale that fits the window while keeping the aspect ratio.
export function fitScale(viewWidth, viewHeight, worldWidth, worldHeight) {
  return Math.min(viewWidth / worldWidth, viewHeight / worldHeight);
}

// Sizes and centers the canvas to fit the window; backing store uses devicePixelRatio for sharpness.
export function fitCanvas(canvas, viewWidth, viewHeight, dpr) {
  const scale = fitScale(viewWidth, viewHeight, config.worldWidth, config.worldHeight);
  const cssWidth = config.worldWidth * scale;
  const cssHeight = config.worldHeight * scale;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.style.left = `${(viewWidth - cssWidth) / 2}px`;
  canvas.style.top = `${(viewHeight - cssHeight) / 2}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / config.worldWidth, 0, 0, canvas.height / config.worldHeight, 0, 0);
  return ctx;
}

export function drawMap(ctx) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, config.worldWidth, config.worldHeight);
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, config.worldWidth - 2, config.worldHeight - 2);
}

const SHIP_COLORS = COLORS.ships;

export function drawShips(ctx, state) {
  state.ships.forEach((ship, i) => {
    if (!ship.alive) return;
    // Outline only: no fill, no shading. The slim shape shows the heading.
    const [tip, left, right] = shipPoints(ship, config.shipSize, config.shipWidth);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.lineJoin = 'round'; // keeps the stroke within lineWidth / 2 of each corner
    ctx.lineWidth = config.shipLineWidth;
    ctx.strokeStyle = SHIP_COLORS[i % SHIP_COLORS.length];
    ctx.stroke();
  });
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const rad = (deg) => (deg * Math.PI) / 180;

// Gauge layout on the ship whose turn it is, in game units, from config at call time.
// Follows the ship's current position and heading, so the gauges move with it.
// - dial: a half-disc of fixed size (never scaled by distance) whose flat side sits just past the nose
//   (forward) or just past the tail (backward), on the ship's long axis, arc facing away from the ship.
// - bar: centred under the ship, a fixed distance below it: just past the farthest point the dial can
//   reach in any heading or direction, so the bar never overlaps the dial and never moves with the phase.
// Near a map edge both are clamped inside the map; the bar moves above the ship if it does not fit below.
export function gaugeLayout(state) {
  const ship = state.ships[state.turn];
  const { backward } = state.gauge;
  const W = config.worldWidth, H = config.worldHeight, m = config.gaugeEdgeMargin;
  const half = config.gaugeLineWidth / 2;
  const pts = shipPoints(ship, config.shipSize, config.shipWidth);
  const h = rad(ship.heading);
  const fx = Math.cos(h), fy = Math.sin(h);

  const r = config.gaugeDialRadius * config.gaugeDialScale;
  const facing = rad(ship.heading + (backward ? 180 : 0));
  const anchor = backward
    ? { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 } // middle of the tail edge
    : pts[0]; // nose
  const sign = backward ? -1 : 1;
  const push = config.gaugeDialGap + config.shipLineWidth / 2 + half;
  const dial = {
    x: clamp(anchor.x + sign * fx * push, m + r, W - m - r),
    y: clamp(anchor.y + sign * fy * push, m + r, H - m - r),
    r,
    facing,
  };

  const w = config.gaugeBarWidth * config.gaugePowerScale;
  const bh = config.gaugeBarHeight * config.gaugePowerScale;
  // The nose is the ship point farthest from its centre, so a forward dial reaches farthest.
  const dialReach = Math.hypot(pts[0].x - ship.x, pts[0].y - ship.y) + push + r + half;
  const offset = dialReach + config.gaugePowerGap;
  let y = ship.y + offset;
  if (y + bh > H - m) y = ship.y - offset - bh;
  const bar = { x: clamp(ship.x - w / 2, m, W - m - w), y: clamp(y, m, H - m - bh), w, h: bh };
  return { bar, dial };
}

const GAUGE_DIM = COLORS.dim;

// Power bar: fills with the reading in the power phase; shows the locked reading (dim) in the direction phase.
export function drawPowerBar(ctx, state) {
  const { phase, power } = state.gauge;
  const { bar } = gaugeLayout(state);
  const color = SHIP_COLORS[state.turn % SHIP_COLORS.length];
  ctx.lineWidth = config.gaugeLineWidth;
  ctx.strokeStyle = phase === 'power' ? color : GAUGE_DIM;
  ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = phase === 'power' ? color : GAUGE_DIM;
  ctx.fillRect(bar.x, bar.y, bar.w * Math.min(Math.max(power, 0), 1), bar.h);
}

// Direction dial at the active ship: only the active 180-degree side is drawn, in front of the nose
// (forward) or behind the tail (backward). Fixed size, never scaled by the locked distance, so it marks
// no path or end point (docs/ARCHITECTURE.md "Do NOT Add").
export function drawDirectionDial(ctx, state) {
  const { needle } = state.gauge;
  const { dial } = gaugeLayout(state);
  const max = rad(config.gaugeNeedleMax);
  ctx.lineWidth = config.gaugeLineWidth;
  ctx.strokeStyle = GAUGE_DIM;
  ctx.beginPath();
  ctx.arc(dial.x, dial.y, dial.r, dial.facing - max, dial.facing + max);
  ctx.closePath();
  ctx.stroke();
  const a = dial.facing + rad(needle);
  ctx.strokeStyle = SHIP_COLORS[state.turn % SHIP_COLORS.length];
  ctx.beginPath();
  ctx.moveTo(dial.x, dial.y);
  ctx.lineTo(dial.x + Math.cos(a) * dial.r, dial.y + Math.sin(a) * dial.r);
  ctx.stroke();
}

// The active gauge: power bar in the power phase, plus the direction dial in the direction phase.
export function drawGauge(ctx, state) {
  const { phase } = state.gauge;
  if (phase !== 'power' && phase !== 'direction') return;
  drawPowerBar(ctx, state);
  if (phase === 'direction') drawDirectionDial(ctx, state);
}

export function drawFrame(ctx, state) {
  drawMap(ctx);
  drawShips(ctx, state);
  drawGauge(ctx, state);
}
