// All canvas drawing. Each draw<Thing>(ctx, state) only reads state, never changes it.
// Drawing happens in game units; fitCanvas sets a transform that scales the world to the screen.
import config from './config.js';

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

// Slim isosceles triangle in game units: two long sides of length size, back edge of length width.
// Tip points along the heading; the centroid sits at the ship position. Returns [tip, back1, back2].
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

// Gauge panel layout at the bottom center of the map, in game units, from config at call time.
export function gaugeLayout() {
  const cx = config.worldWidth / 2;
  const barY = config.worldHeight - config.gaugeMargin - config.gaugeBarHeight;
  return {
    bar: { x: cx - config.gaugeBarWidth / 2, y: barY, w: config.gaugeBarWidth, h: config.gaugeBarHeight },
    dial: { x: cx, y: barY - config.gaugeGap - config.gaugeDialRadius, r: config.gaugeDialRadius },
  };
}

const GAUGE_DIM = COLORS.dim;
const rad = (deg) => (deg * Math.PI) / 180;

// Power bar: fills with the reading in the power phase; shows the locked reading (dim) in the direction phase.
export function drawPowerBar(ctx, state) {
  const { phase, power } = state.gauge;
  const { bar } = gaugeLayout();
  const color = SHIP_COLORS[state.turn % SHIP_COLORS.length];
  ctx.lineWidth = config.gaugeLineWidth;
  ctx.strokeStyle = phase === 'power' ? color : GAUGE_DIM;
  ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = phase === 'power' ? color : GAUGE_DIM;
  ctx.fillRect(bar.x, bar.y, bar.w * Math.min(Math.max(power, 0), 1), bar.h);
}

// Direction dial in the panel, turned to the active ship's heading so the needle points the way the
// ship will travel. Only the active 180-degree side is drawn: around the nose (forward) or tail (backward).
// Fixed size, never scaled by distance, and never drawn at the ship: no path or end-point preview.
export function drawDirectionDial(ctx, state) {
  const { needle, backward } = state.gauge;
  const ship = state.ships[state.turn];
  const { dial } = gaugeLayout();
  const center = ship.heading + (backward ? 180 : 0);
  const max = config.gaugeNeedleMax;
  ctx.lineWidth = config.gaugeLineWidth;
  ctx.strokeStyle = GAUGE_DIM;
  ctx.beginPath();
  ctx.arc(dial.x, dial.y, dial.r, rad(center - max), rad(center + max));
  ctx.closePath();
  ctx.stroke();
  const a = rad(center + needle);
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
