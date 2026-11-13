import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../../scripts/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const LABEL = process.argv[2];
if (LABEL !== 'before' && LABEL !== 'after') throw new Error('usage: node agent-team/evidence/T-015/capture.mjs before|after');

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  return [
    ...dirs.map((d) => join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...dirs.map((d) => join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find((p) => existsSync(p));
}

async function launch(exe, profile) {
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (const end = Date.now() + 20000; !existsSync(portFile); await new Promise((r) => setTimeout(r, 100))) {
    if (Date.now() > end) throw new Error('browser did not start within 20s');
  }
  await new Promise((r) => setTimeout(r, 200));
  const [port, path] = readFileSync(portFile, 'utf8').split('\n').map((l) => l.trim());
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.fail(new Error(m.error.message)); else p.ok(m.result);
  };
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    id += 1; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return {
    async open(url, { width, height, dpr }) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
      await s('Page.navigate', { url });
      const page = {
        async eval(fn, ...args) {
          const r = await s('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
          return r.result.value;
        },
        async shot(file) {
          writeFileSync(join(HERE, file), Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        },
      };
      for (const end = Date.now() + 15000; !(await page.eval(() => document.readyState === 'complete' && !!window.__game).catch(() => false));) {
        if (Date.now() > end) throw new Error('window.__game not found');
        await new Promise((r) => setTimeout(r, 100));
      }
      return page;
    },
    async close() {
      await Promise.race([send('Browser.close').catch(() => null), new Promise((r) => setTimeout(r, 3000))]);
      ws.close(); proc.kill();
      await new Promise((r) => setTimeout(r, 1000));
    },
  };
}

async function freeze() {
  await new Promise((done) => {
    window.requestAnimationFrame = (cb) => { window.__loopCb = cb; done(); return 0; };
  });
  window.__t = performance.now();
  window.__loopCb(window.__t);
  return true;
}

function load(patch) {
  const g = window.__game;
  g.setState({ ...g.getState(), ...patch });
  return true;
}

function step(ms) { window.__game.step(ms); return true; }

async function readConfig() {
  const cfg = (await import('/src/config.js')).default;
  return {
    protectionBlinkMs: cfg.protectionBlinkMs, protectionMinAlpha: cfg.protectionMinAlpha,
    titleText: cfg.titleText, titleFontSize: cfg.titleFontSize, titleTop: cfg.titleTop,
    titleLetterSpacing: cfg.titleLetterSpacing, titleLineWidth: cfg.titleLineWidth,
    worldWidth: cfg.worldWidth, worldHeight: cfg.worldHeight,
  };
}

async function measureBlink() {
  const cfg = (await import('/src/config.js')).default;
  const { protectionAlpha, COLORS } = await import('/src/render.js');
  const { isSpawnProtected } = await import('/src/rules.js');
  window.__loopCb(window.__t);
  const s = window.__game.getState();
  const c = document.querySelector('canvas');
  const k = c.width / cfg.worldWidth;
  const ctx = c.getContext('2d');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const bg = hex(COLORS.background);
  const ships = s.ships.map((ship, i) => {
    const px = ctx.getImageData(Math.floor((ship.x - 21) * k), Math.floor((ship.y - 11) * k), Math.ceil(42 * k), Math.ceil(22 * k)).data;
    const col = hex(COLORS.ships[i]);
    const ch = col.indexOf(Math.max(...col));
    let max = 0;
    for (let p = 0; p < px.length; p += 4) max = Math.max(max, px[p + ch]);
    const prot = isSpawnProtected(s, i);
    return {
      ship: i, protected: prot,
      expectedAlpha: prot ? Number(protectionAlpha(s.clock).toFixed(4)) : 1,
      alphaFromPixels: Number(((max - bg[ch]) / (col[ch] - bg[ch])).toFixed(3)),
    };
  });
  return { clock: s.clock, phase: s.gauge.phase, ships };
}

async function measureTitle() {
  const cfg = (await import('/src/config.js')).default;
  const { COLORS } = await import('/src/render.js');
  window.__loopCb(window.__t);
  const s = window.__game.getState();
  const c = document.querySelector('canvas');
  const kx = c.width / cfg.worldWidth;
  const ky = c.height / cfg.worldHeight;
  const ctx = c.getContext('2d');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const bg = hex(COLORS.background);
  const bgSum = bg[0] + bg[1] + bg[2];
  const bandWorld = 240;
  const w = c.width;
  const h = Math.ceil(bandWorld * ky);
  const px = ctx.getImageData(0, 0, w, h).data;
  const edgeX = Math.ceil(3 * kx);
  const edgeY = Math.ceil(3 * ky);
  const mk = () => ({ l: Infinity, r: -Infinity, t: Infinity, b: -Infinity, n: 0 });
  const boxes = { title: mk(), score0: mk(), score1: mk() };
  for (let y = edgeY; y < h; y += 1) {
    for (let x = edgeX; x < w - edgeX; x += 1) {
      const p = (y * w + x) * 4;
      if (px[p] + px[p + 1] + px[p + 2] <= bgSum + 30) continue;
      const r = Math.max(0, px[p] - bg[0]);
      const g = Math.max(0, px[p + 1] - bg[1]);
      const b = Math.max(0, px[p + 2] - bg[2]);
      const hi = Math.max(r, g, b);
      const lo = Math.min(r, g, b);
      const grey = (hi - lo) / hi < 0.4;
      const box = grey ? boxes.title : boxes[x < w / 2 ? 'score0' : 'score1'];
      box.l = Math.min(box.l, x); box.r = Math.max(box.r, x);
      box.t = Math.min(box.t, y); box.b = Math.max(box.b, y);
      box.n += 1;
    }
  }
  const n1 = (v) => Number(v.toFixed(2));
  const world = (box) => (box.n === 0 ? null : {
    left: n1(box.l / kx), right: n1((box.r + 1) / kx), top: n1(box.t / ky), bottom: n1((box.b + 1) / ky),
    width: n1((box.r + 1 - box.l) / kx), height: n1((box.b + 1 - box.t) / ky), pixels: box.n,
  });
  const title = world(boxes.title);
  const score0 = world(boxes.score0);
  const score1 = world(boxes.score1);
  ctx.save();
  ctx.font = `${cfg.titleFontSize}px monospace`;
  ctx.letterSpacing = `${cfg.titleLetterSpacing}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const m = ctx.measureText(cfg.titleText.toUpperCase());
  ctx.restore();
  const half = cfg.titleLineWidth / 2;
  const cx = cfg.worldWidth / 2;
  const metricsBox = {
    left: n1(cx - m.actualBoundingBoxLeft - half), right: n1(cx + m.actualBoundingBoxRight + half),
    top: n1(cfg.titleTop - m.actualBoundingBoxAscent - half), bottom: n1(cfg.titleTop + m.actualBoundingBoxDescent + half),
  };
  const gapLeft = n1(title.left - score0.right);
  const gapRight = n1(score1.left - title.right);
  const inside = (b) => b.left > 0 && b.top > 0 && b.right < cfg.worldWidth && b.bottom < cfg.worldHeight;
  return {
    scores: s.scores, clock: s.clock,
    canvasPixels: { width: c.width, height: c.height }, devicePixelRatio: window.devicePixelRatio,
    pixelsPerWorldUnit: n1(kx),
    scannedBandWorld: { x: [3, cfg.worldWidth - 3], y: [3, bandWorld] },
    titleInkWorld: title,
    titleInkCentreX: n1((title.left + title.right) / 2),
    titleMetricsBoxWorld: metricsBox,
    score0InkWorld: score0,
    score1InkWorld: score1,
    gapLeftWorld: gapLeft,
    gapRightWorld: gapRight,
    bothGapsPositive: gapLeft > 0 && gapRight > 0,
    titleInkInsideMap: inside(title),
    titleMetricsBoxInsideMap: inside(metricsBox),
    titleBand: {
      top: title.top, bottom: title.bottom, height: title.height,
      percentOfMapHeight: n1((100 * title.height) / cfg.worldHeight),
      bottomAsPercentOfMapHeight: n1((100 * title.bottom) / cfg.worldHeight),
    },
  };
}

const exe = findBrowser();
if (!exe) throw new Error('no Chrome/Edge found; set CHROME_PATH');
const profile = mkdtempSync(join(tmpdir(), 't015-'));
const server = await startServer(ROOT, 0);
const url = `${server.url}/index.html?debug=1`;
const browser = await launch(exe, profile);
const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const srcOrTestsDirty = execSync('git status --porcelain -- src tests', { cwd: ROOT }).toString().trim() !== '';
const blinkFrames = [];
const titleFrames = [];
let cfg;
try {
  const page = await browser.open(url, { width: 1920, height: 1080, dpr: 1 });
  await page.eval(freeze);
  cfg = await page.eval(readConfig);
  const quarter = cfg.protectionBlinkMs / 4;
  await page.eval(load, { clock: 0, scores: [0, 0], explosions: [] });
  for (let i = 0; i <= 4; i += 1) {
    if (i > 0) await page.eval(step, quarter);
    const file = `${LABEL}-blink-${i * quarter}ms.png`;
    blinkFrames.push({ file, ms: i * quarter, ...(await page.eval(measureBlink)) });
    await page.shot(file);
  }

  await page.eval(load, { clock: 0, scores: [-12, -12], explosions: [] });
  const wide = `${LABEL}-title-1920x1080-dpr1.png`;
  titleFrames.push({ file: wide, viewport: '1920x1080 dpr 1', ...(await page.eval(measureTitle)) });
  await page.shot(wide);

  const small = await browser.open(url, { width: 1000, height: 1000, dpr: 2 });
  await small.eval(freeze);
  await small.eval(load, { clock: 0, scores: [-12, -12], explosions: [] });
  const square = `${LABEL}-title-1000x1000-dpr2.png`;
  titleFrames.push({ file: square, viewport: '1000x1000 dpr 2', ...(await small.eval(measureTitle)) });
  await small.shot(square);
} finally {
  await browser.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const merge = (file, entry) => {
  const full = join(HERE, file);
  const all = existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : {};
  all[LABEL] = entry;
  const ordered = { before: all.before, after: all.after };
  writeFileSync(full, JSON.stringify(ordered, null, 2) + '\n');
};
const head = { commit, srcOrTestsDirty, url: '/index.html?debug=1', config: cfg };
merge('blink-capture.json', {
  ...head, viewport: '1920x1080 dpr 1',
  method: 'game loop frozen (requestAnimationFrame replaced), clock moved only by __game.step, alpha read back from canvas pixels around each ship',
  frames: blinkFrames,
});
merge('title-capture.json', {
  ...head,
  method: 'game loop frozen, scores set to [-12, -12], ink boxes read back from canvas pixels in the top band, world units; metrics box is measureText plus half the line width',
  frames: titleFrames,
});
process.stdout.write(JSON.stringify({
  label: LABEL, commit, srcOrTestsDirty,
  blink: blinkFrames.map((f) => [f.ms, f.clock, ...f.ships.map((s) => `${s.expectedAlpha}/${s.alphaFromPixels}`)]),
  title: titleFrames.map((f) => ({
    viewport: f.viewport, title: f.titleInkWorld, metrics: f.titleMetricsBoxWorld, s0: f.score0InkWorld, s1: f.score1InkWorld,
    gapLeft: f.gapLeftWorld, gapRight: f.gapRightWorld, inside: f.titleInkInsideMap, band: f.titleBand,
  })),
}, null, 1) + '\n');
