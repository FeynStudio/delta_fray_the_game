import config from './config.js';
import { currentScores, isSpawnProtected, shipPoints } from './rules.js';

export { shipPoints };

export const COLORS = {
  background: '#05060f',
  dim: '#9aa5b8',
  ships: ['#4fd1ff', '#ff6b6b'],
};

export function fitScale(viewWidth, viewHeight, worldWidth, worldHeight) {
  return Math.min(viewWidth / worldWidth, viewHeight / worldHeight);
}

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

const shipColor = (i) => COLORS.ships[i % COLORS.ships.length];

export function protectionAlpha(clockMs) {
  const period = config.protectionBlinkMs;
  const t = (((clockMs % period) + period) % period) / period;
  return 1 - (1 - config.protectionMinAlpha) * t;
}

export function drawShips(ctx, state) {
  state.ships.forEach((ship, i) => {
    if (!ship.alive) return;
    const [tip, left, right] = shipPoints(ship, config.shipSize, config.shipWidth);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = config.shipLineWidth;
    ctx.strokeStyle = shipColor(i);
    ctx.globalAlpha = isSpawnProtected(state, i) ? protectionAlpha(state.clock ?? 0) : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const rad = (deg) => (deg * Math.PI) / 180;

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
    ? { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 }
    : pts[0];
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
  const dialReach = Math.hypot(pts[0].x - ship.x, pts[0].y - ship.y) + push + r + half;
  const offset = dialReach + config.gaugePowerGap;
  let y = ship.y + offset;
  if (y + bh > H - m) y = ship.y - offset - bh;
  const bar = { x: clamp(ship.x - w / 2, m, W - m - w), y: clamp(y, m, H - m - bh), w, h: bh };
  return { bar, dial };
}

function powerBar(ctx, state, bar) {
  const { phase, power } = state.gauge;
  const color = phase === 'power' ? shipColor(state.turn) : COLORS.dim;
  ctx.lineWidth = config.gaugeLineWidth;
  ctx.strokeStyle = color;
  ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = color;
  ctx.fillRect(bar.x, bar.y, bar.w * clamp(power, 0, 1), bar.h);
}

function directionDial(ctx, state, dial) {
  const { needle } = state.gauge;
  const max = rad(config.gaugeNeedleMax);
  ctx.lineWidth = config.gaugeLineWidth;
  ctx.strokeStyle = COLORS.dim;
  ctx.beginPath();
  ctx.arc(dial.x, dial.y, dial.r, dial.facing - max, dial.facing + max);
  ctx.closePath();
  ctx.stroke();
  const a = dial.facing + rad(needle);
  ctx.strokeStyle = shipColor(state.turn);
  ctx.beginPath();
  ctx.moveTo(dial.x, dial.y);
  ctx.lineTo(dial.x + Math.cos(a) * dial.r, dial.y + Math.sin(a) * dial.r);
  ctx.stroke();
}

export function drawPowerBar(ctx, state) {
  powerBar(ctx, state, gaugeLayout(state).bar);
}

export function drawDirectionDial(ctx, state) {
  directionDial(ctx, state, gaugeLayout(state).dial);
}

export function drawGauge(ctx, state) {
  const { phase } = state.gauge;
  if (phase !== 'power' && phase !== 'direction') return;
  const { bar, dial } = gaugeLayout(state);
  powerBar(ctx, state, bar);
  if (phase === 'direction') directionDial(ctx, state, dial);
}

export function explosionPieces(explosion, elapsedMs) {
  const pts = shipPoints(explosion, config.shipSize, config.shipWidth);
  const ms = Math.min(Math.max(elapsedMs, 0), config.explosionMs);
  const scale = 1 + (config.explosionEndScale - 1) * (ms / config.explosionMs);
  const travel = (config.explosionSpeed * ms) / 1000;
  const pieces = [];
  pts.forEach((a, k) => {
    const b = pts[(k + 1) % pts.length];
    const t = config.explosionCuts[k];
    const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    for (const [p, q] of [[a, cut], [cut, b]]) {
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const d = Math.hypot(mx - explosion.x, my - explosion.y);
      const ox = d > 0 ? ((mx - explosion.x) / d) * travel : 0;
      const oy = d > 0 ? ((my - explosion.y) / d) * travel : 0;
      const hx = ((q.x - p.x) / 2) * scale, hy = ((q.y - p.y) / 2) * scale;
      pieces.push({
        from: { x: mx + ox - hx, y: my + oy - hy },
        to: { x: mx + ox + hx, y: my + oy + hy },
      });
    }
  });
  return pieces;
}

export function drawExplosions(ctx, state) {
  for (const e of state.explosions ?? []) {
    ctx.beginPath();
    for (const { from, to } of explosionPieces(e, e.elapsed)) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.lineWidth = config.shipLineWidth;
    ctx.strokeStyle = shipColor(e.ship);
    ctx.stroke();
  }
}

export function drawScores(ctx, state) {
  const m = config.scoreMargin;
  ctx.font = `${config.scoreFontSize}px monospace`;
  ctx.textBaseline = 'top';
  currentScores(state).forEach((score, i) => {
    const right = i % 2 === 1;
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillStyle = shipColor(i);
    ctx.fillText(String(score), right ? config.worldWidth - m : m, m);
  });
}

export function drawTitle(ctx) {
  ctx.save();
  ctx.font = `${config.titleFontSize}px monospace`;
  ctx.letterSpacing = `${config.titleLetterSpacing}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = config.titleLineWidth;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.dim;
  ctx.strokeText(config.titleText.toUpperCase(), config.worldWidth / 2, config.titleTop);
  ctx.restore();
}

export function drawFrame(ctx, state) {
  drawMap(ctx);
  drawScores(ctx, state);
  drawExplosions(ctx, state);
  drawShips(ctx, state);
  drawGauge(ctx, state);
  drawTitle(ctx);
}
