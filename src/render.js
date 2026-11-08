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

export function drawFrame(ctx, state) {
  drawMap(ctx);
  drawShips(ctx, state);
}
