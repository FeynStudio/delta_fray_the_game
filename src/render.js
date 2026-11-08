// All canvas drawing. Each draw<Thing>(ctx, state) only reads state, never changes it.
// Drawing happens in game units; fitCanvas sets a transform that scales the world to the screen.
import config from './config.js';

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

// Triangle corners in game units: tip points along the heading, centroid at the ship position.
export function shipPoints(ship, size) {
  const r = size / Math.sqrt(3); // centroid-to-corner distance of an equilateral triangle
  const h = (ship.heading * Math.PI) / 180;
  return [0, 120, 240].map((offset) => {
    const a = h + (offset * Math.PI) / 180;
    return { x: ship.x + r * Math.cos(a), y: ship.y + r * Math.sin(a) };
  });
}

export function drawMap(ctx) {
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, config.worldWidth, config.worldHeight);
  ctx.strokeStyle = '#3a4a7a';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, config.worldWidth - 2, config.worldHeight - 2);
}

const SHIP_COLORS = ['#4fd1ff', '#ff6b6b'];

export function drawShips(ctx, state) {
  state.ships.forEach((ship, i) => {
    if (!ship.alive) return;
    const [tip, left, right] = shipPoints(ship, config.shipSize);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fillStyle = SHIP_COLORS[i % SHIP_COLORS.length];
    ctx.fill();
    // Nose marker so the heading is visible at a glance.
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, config.shipSize / 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
}

export function drawFrame(ctx, state) {
  drawMap(ctx);
  drawShips(ctx, state);
}
