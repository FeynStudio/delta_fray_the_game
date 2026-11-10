// One-off evidence capture for T-011 (title decal). Not part of verify.sh.
// Run from the repo root: node agent-team/evidence/T-011/capture-title.mjs
// Browser plumbing copied from agent-team/evidence/T-010/capture-blink.mjs (scripts/ helpers are not exported).
// Exact frames: requestAnimationFrame is replaced so the game loop stops scheduling itself; the clock moves
// only with __game.step(ms) or setState, and the captured loop callback is called again to draw.
// For every frame:
// - drawOrder: every CanvasRenderingContext2D drawing call made by the real game loop for that one frame, in
//   order (method, text, globalAlpha); the check is that the last one is strokeText('DELTA FRAY').
// - pixels: the title box is read back from the canvas (count of pixels near COLORS.dim, count of filled-looking
//   pixels is not measured); each ship's outline opacity is estimated as in T-010; each score corner is checked
//   for pixels in that player's ship colour.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../../scripts/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

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
  const [port, path] = readFileSync(portFile, 'utf8').split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`); // local DevTools only
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
        async shot(file, clip) {
          const params = { format: 'png' };
          if (clip) params.clip = { ...clip, scale: 1 };
          writeFileSync(join(HERE, file), Buffer.from((await s('Page.captureScreenshot', params)).data, 'base64'));
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

// ---- in-page helpers (run in the browser) ----
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
  return g.getState().gauge.phase;
}
function launchP1(power, needle) {
  const g = window.__game;
  const s = g.getState();
  g.setState({ ...s, gauge: { ...s.gauge, phase: 'power', power, sweep: 1 } });
  g.press('Space');
  const d = g.getState();
  g.setState({ ...d, gauge: { ...d.gauge, needle } });
  g.press('Space');
  return g.getState().gauge.phase;
}
function step(ms) { window.__game.step(ms); return true; }
// Draws one frame through the real game loop while logging every drawing call, then reads pixels back.
async function drawAndMeasure() {
  const cfg = (await import('/src/config.js')).default;
  const { protectionAlpha, COLORS } = await import('/src/render.js');
  const { isSpawnProtected } = await import('/src/rules.js');
  const P = CanvasRenderingContext2D.prototype;
  const DRAW = ['stroke', 'fill', 'strokeRect', 'fillRect', 'strokeText', 'fillText', 'clearRect', 'drawImage'];
  const saved = DRAW.map((m) => P[m]);
  const order = [];
  DRAW.forEach((m, i) => {
    P[m] = function logged(...args) {
      order.push({ call: m, text: /Text$/.test(m) ? args[0] : undefined, alpha: this.globalAlpha });
      return saved[i].apply(this, args);
    };
  });
  try { window.__loopCb(window.__t); } finally { DRAW.forEach((m, i) => { P[m] = saved[i]; }); }

  const s = window.__game.getState();
  const c = document.querySelector('canvas');
  const k = c.width / cfg.worldWidth;
  const ctx = c.getContext('2d');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const bg = hex(COLORS.background);
  const box = (x, y, w, h) => ctx.getImageData(Math.floor(x * k), Math.floor(y * k), Math.ceil(w * k), Math.ceil(h * k)).data;
  const near = (px, p, col, tol) => Math.abs(px[p] - col[0]) <= tol && Math.abs(px[p + 1] - col[1]) <= tol && Math.abs(px[p + 2] - col[2]) <= tol;
  const countNear = (px, col, tol) => { let n = 0; for (let p = 0; p < px.length; p += 4) if (near(px, p, col, tol)) n += 1; return n; };
  const lit = (px) => { let n = 0; for (let p = 0; p < px.length; p += 4) if (px[p] + px[p + 1] + px[p + 2] > bg[0] + bg[1] + bg[2] + 60) n += 1; return n; };
  // Title box: centre third of the width, from the top border down to titleTop + font size + a little.
  const tb = { x: cfg.worldWidth / 3, y: 4, w: cfg.worldWidth / 3, h: cfg.titleTop + cfg.titleFontSize + 8 };
  const tpx = box(tb.x, tb.y, tb.w, tb.h);
  const dim = hex(COLORS.dim);
  const shipAlpha = (ship, i) => {
    const px = box(ship.x - 21, ship.y - 21, 42, 42);
    const col = hex(COLORS.ships[i]);
    const ch = col.indexOf(Math.max(...col));
    let max = 0;
    for (let p = 0; p < px.length; p += 4) max = Math.max(max, px[p + ch]);
    return Number(((max - bg[ch]) / (col[ch] - bg[ch])).toFixed(3));
  };
  // Visible ink extent of the title (pixels near COLORS.dim in the title box), in world units.
  let inkL = Infinity, inkR = -Infinity;
  const bw = Math.ceil(tb.w * k);
  for (let p = 0; p < tpx.length; p += 4) {
    if (!near(tpx, p, dim, 40)) continue;
    const col = (p / 4) % bw;
    inkL = Math.min(inkL, col); inkR = Math.max(inkR, col);
  }
  const ink = { left: Number((Math.floor(tb.x * k) / k + inkL / k).toFixed(1)), right: Number((Math.floor(tb.x * k) / k + (inkR + 1) / k).toFixed(1)) };
  ink.centre = Number(((ink.left + ink.right) / 2).toFixed(1));
  const m = cfg.scoreMargin, fs = cfg.scoreFontSize;
  const corners = [box(m - 2, m - 2, 4 * fs, fs + 4), box(cfg.worldWidth - m - 4 * fs + 2, m - 2, 4 * fs, fs + 4)];
  const last = order.at(-1);
  return {
    clock: s.clock, turn: s.turn, phase: s.gauge.phase, scores: s.scores,
    drawOrder: { calls: order.length, last, lastIsTitle: last?.call === 'strokeText' && last.text === cfg.titleText.toUpperCase(),
      titleCalls: order.filter((o) => o.text === cfg.titleText.toUpperCase()).map((o) => o.call),
      texts: order.filter((o) => o.text !== undefined).map((o) => `${o.call}:${o.text}`) },
    titleBoxWorld: tb,
    titlePixels: { nearDim: countNear(tpx, dim, 40), lit: lit(tpx), total: tpx.length / 4, inkWorld: ink },
    scoreCornerPixels: corners.map((px, i) => countNear(px, hex(COLORS.ships[i]), 60)),
    ships: s.ships.map((ship, i) => ({
      ship: i, x: ship.x, y: ship.y, alive: ship.alive, protected: isSpawnProtected(s, i),
      expectedAlpha: isSpawnProtected(s, i) ? Number(protectionAlpha(s.clock).toFixed(4)) : 1,
      drawnAlphaEstimate: shipAlpha(ship, i),
    })),
    explosions: (s.explosions ?? []).map((e) => ({ ship: e.ship, elapsed: e.elapsed })),
  };
}

const exe = findBrowser();
if (!exe) throw new Error('no Chrome/Edge found; set CHROME_PATH');
const profile = mkdtempSync(join(tmpdir(), 't011-'));
const server = await startServer(ROOT, 0);
const url = `${server.url}/index.html?debug=1`;
const browser = await launch(exe, profile);
const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const dirty = execSync('git status --porcelain -- src tests', { cwd: ROOT }).toString().trim() !== '';
const frames = [];
const shoot = async (page, file, extra = {}) => {
  const f = await page.eval(drawAndMeasure);
  frames.push({ file, ...extra, ...f });
  await page.shot(file);
};
try {
  const page = await browser.open(url, { width: 1920, height: 1080, dpr: 1 });
  await page.eval(freeze);

  // 1. Game start with scores in both corners; both ships protected, blinking: one cycle in 100 ms steps.
  await page.eval(load, { scores: [12, -3], explosions: [], clock: 0 });
  for (const ms of [0, 100, 200, 300]) {
    if (ms) await page.eval(step, 100);
    await shoot(page, `title-start-blink-${ms}ms.png`, { note: 'game start, scores 12 and -3, both ships blinking, power phase' });
  }

  // 2. A ship directly under the title (not protected), direction phase: the title is drawn over it.
  await page.eval(load, {
    turn: 0, clock: 0, scores: [12, -3], explosions: [],
    ships: [{ x: 640, y: 44, heading: 0, alive: true, unmovedSinceSpawn: false }, { x: 1090, y: 480, heading: 180, alive: true, unmovedSinceSpawn: true }],
    gauge: { phase: 'power', power: 0.6, needle: 0, backward: false, distance: 0, sweep: 1 },
  });
  await page.eval(() => window.__game.press('Space'));
  await page.eval(load, { clock: 300 });
  await shoot(page, 'title-ship-under-title-direction.png', { note: 'player 1 ship at (640, 44) under the title letters; player 2 blinking at 300 ms' });
  // Zoomed crop of the top band (canvas left edge at (1920 - 1440) / 2 = 240 CSS px at this window).
  await page.shot('title-ship-under-title-crop.png', { x: 240 + 480 * 1.125, y: 0, width: 320 * 1.125, height: 100 });

  // 3. Respawn turn: player 1 flies through player 2 (moved, so not protected); player 2 respawns protected,
  //    its explosion runs, scores update, title stays on top.
  await page.eval(load, {
    turn: 0, clock: 0, scores: [12, -3], explosions: [],
    ships: [{ x: 870, y: 480, heading: 0, alive: true, unmovedSinceSpawn: false }, { x: 1000, y: 480, heading: 180, alive: true, unmovedSinceSpawn: false }],
  });
  const phase = await page.eval(launchP1, 1, 0);
  if (phase !== 'moving') throw new Error(`launch failed, phase ${phase}`);
  await page.eval(step, 600);
  await page.eval(step, 100);
  await shoot(page, 'title-respawn-explosion.png', { note: 'player 2 destroyed and respawned (protected, blinking), explosion running, score 13' });
  // Mid-move frame: the moving phase, so the move animation is on screen under the title.
  await page.eval(load, {
    turn: 1, clock: 0, explosions: [],
    ships: [{ x: 1020, y: 480, heading: 0, alive: true, unmovedSinceSpawn: false }, { x: 640, y: 160, heading: 270, alive: true, unmovedSinceSpawn: false }],
  });
  await page.eval(() => {
    const g = window.__game;
    const s = g.getState();
    g.setState({ ...s, gauge: { ...s.gauge, phase: 'power', power: 1, sweep: 1 } });
    g.press('Space');
    const d = g.getState();
    g.setState({ ...d, gauge: { ...d.gauge, needle: 0 } });
    g.press('Space');
    return true;
  });
  await page.eval(step, 450);
  await shoot(page, 'title-move-toward-title.png', { note: 'player 2 flying up toward the title, 450 of 600 ms into its move' });

  // 4. Another window size: 1000 x 1000 at dpr 2, game start.
  const small = await browser.open(url, { width: 1000, height: 1000, dpr: 2 });
  await small.eval(freeze);
  await small.eval(load, { scores: [0, 0], explosions: [], clock: 200 });
  await shoot(small, 'title-1000x1000-dpr2.png', { note: '1000x1000 window, device pixel ratio 2' });
} finally {
  await browser.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
const result = {
  commit, srcOrTestsDirty: dirty, url: '/index.html?debug=1', viewport: '1920x1080 dpr 1 unless noted',
  allLastDrawIsTitle: frames.every((f) => f.drawOrder.lastIsTitle),
  frames,
};
writeFileSync(join(HERE, 'title-capture.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ commit, dirty, allLastDrawIsTitle: result.allLastDrawIsTitle,
  frames: frames.map((f) => ({ file: f.file, last: f.drawOrder.last, titlePixels: f.titlePixels, corners: f.scoreCornerPixels,
    ships: f.ships.map((s) => [s.expectedAlpha, s.drawnAlphaEstimate]), phase: f.phase, scores: f.scores, turn: f.turn })) }, null, 1) + '\n');
