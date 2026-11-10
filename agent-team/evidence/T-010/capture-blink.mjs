// One-off evidence capture for T-010 (spawn protection blink). Not part of verify.sh.
// Run from the repo root: node agent-team/evidence/T-010/capture-blink.mjs
// The standard smoke screenshots are taken at an arbitrary clock, so they cannot show the blink phases.
// This script reuses scripts/serve.mjs (unchanged) and the headless Chrome/Edge + DevTools approach of
// scripts/smoke.mjs (helpers not exported, minimum repeated here, same as T-012 capture-r1.mjs).
// Exact frames: the page's requestAnimationFrame is replaced so the game loop stops scheduling itself;
// the clock is then moved only with __game.step(ms), and the captured loop callback is called again with
// the same timestamp (step(0)) to draw the current state before each screenshot. For every frame the
// canvas pixels around each ship are read back and the outline's drawn opacity is estimated from the
// brightest ship-colour channel against the background, next to render.protectionAlpha(clock).
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

// ---- in-page helpers (run in the browser) ----
async function freeze() {
  await new Promise((done) => {
    window.requestAnimationFrame = (cb) => { window.__loopCb = cb; done(); return 0; };
  });
  window.__t = performance.now();
  window.__loopCb(window.__t);
  return true;
}
// Draws the current state (loop step(0)) and measures each ship's outline on the canvas.
async function drawAndMeasure() {
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
    // Box around the ship body only (centroid -12..+21 along x for these headings, +-11 across);
    // gauges sit further out (power bar below, dial past the nose + gap).
    const x0 = Math.floor((ship.x - 21) * k), y0 = Math.floor((ship.y - 11) * k);
    const w = Math.ceil(42 * k), h = Math.ceil(22 * k);
    const px = ctx.getImageData(x0, y0, w, h).data;
    const col = hex(COLORS.ships[i]);
    const ch = col.indexOf(Math.max(...col)); // the ship colour's strongest channel
    let max = 0;
    for (let p = 0; p < px.length; p += 4) max = Math.max(max, px[p + ch]);
    const drawnAlpha = (max - bg[ch]) / (col[ch] - bg[ch]);
    const prot = isSpawnProtected(s, i);
    return {
      ship: i, x: ship.x, y: ship.y, protected: prot,
      expectedAlpha: prot ? Number(protectionAlpha(s.clock).toFixed(4)) : 1,
      drawnAlphaEstimate: Number(drawnAlpha.toFixed(3)),
    };
  });
  return { clock: s.clock, turn: s.turn, phase: s.gauge.phase, ships };
}
function setClock(ms) {
  const g = window.__game;
  g.setState({ ...g.getState(), clock: ms });
  return true;
}
async function moveP1() {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const s = g.getState();
  g.setState({ ...s, gauge: { ...s.gauge, power: 0.5, sweep: 1 } });
  g.press('Space');
  const d = g.getState();
  g.setState({ ...d, gauge: { ...d.gauge, needle: 0 } });
  g.press('Space');
  g.step(cfg.moveAnimMs);
  return g.getState().turn;
}
function step(ms) { window.__game.step(ms); return true; }

const exe = findBrowser();
if (!exe) throw new Error('no Chrome/Edge found; set CHROME_PATH');
const profile = mkdtempSync(join(tmpdir(), 't010-'));
const server = await startServer(ROOT, 0);
const url = `${server.url}/index.html?debug=1`;
const browser = await launch(exe, profile);
const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const frames = [];
try {
  const page = await browser.open(url, { width: 1920, height: 1080, dpr: 1 });
  await page.eval(freeze);
  // Game start: both ships protected. One 400 ms cycle in 100 ms steps, driven by __game.step.
  await page.eval(setClock, 0);
  for (const [i, label] of ['0ms', '100ms', '200ms', '300ms', '400ms'].entries()) {
    if (i > 0) await page.eval(step, 100);
    const f = await page.eval(drawAndMeasure);
    frames.push({ file: `blink-start-${label}.png`, ...f });
    await page.shot(`blink-start-${label}.png`);
  }
  // Player 1 moves: player 1's ship is drawn normally, player 2's keeps blinking.
  await page.eval(moveP1);
  const t = (await page.eval(() => window.__game.getState().clock)) % 400;
  await page.eval(step, (400 - t) + 300); // to phase 300 ms of a cycle: protected alpha 0.25
  const f = await page.eval(drawAndMeasure);
  frames.push({ file: 'blink-after-p1-move-300ms.png', ...f });
  await page.shot('blink-after-p1-move-300ms.png');
} finally {
  await browser.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
const result = { commit, url: '/index.html?debug=1', viewport: '1920x1080 dpr 1', frames };
writeFileSync(join(HERE, 'blink-capture.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
