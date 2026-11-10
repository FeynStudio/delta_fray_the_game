// One-off evidence capture for T-012 review round 1 (design issues 1 and 2). Not part of verify.sh.
// Run from the repo root: node agent-team/evidence/T-012/capture-r1.mjs
// Reuses scripts/serve.mjs (unchanged) and the same headless Chrome/Edge + DevTools approach as
// scripts/smoke.mjs (whose helpers are not exported, so the minimum is repeated here).
// Exact frames: the page's requestAnimationFrame is replaced so the game loop stops scheduling itself;
// the clock is then moved only with __game.step(ms), and the captured loop callback is called again
// with the same timestamp (step(0) changes nothing) just to draw the current state before a screenshot.
import { spawn } from 'node:child_process';
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
// Stops the game loop: the next frame hands its callback to us instead of the browser.
async function freeze() {
  await new Promise((done) => {
    window.requestAnimationFrame = (cb) => { window.__loopCb = cb; done(); return 0; };
  });
  window.__t = performance.now();
  window.__loopCb(window.__t); // one last tiny real step; from now on `last` is window.__t
  return true;
}
// Draws the current state without moving the clock (the loop runs step(0), which changes nothing).
function draw() {
  window.__loopCb(window.__t);
  const s = window.__game.getState();
  return { turn: s.turn, phase: s.gauge.phase, scores: s.scores, animElapsed: s.anim?.elapsed ?? null,
    alive: s.ships.map((x) => x.alive), explosions: (s.explosions ?? []).map((e) => ({ ship: e.ship, elapsed: e.elapsed })) };
}
async function setScores(scores) {
  const g = window.__game;
  g.setState({ ...g.getState(), scores });
  // Bounds of each score text as drawn (same font and alignment as render.drawScores), in game units.
  const cfg = (await import('/src/config.js')).default;
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${cfg.scoreFontSize}px monospace`;
  return scores.map((v, i) => {
    const w = c.measureText(String(v)).width;
    const left = i === 1 ? cfg.worldWidth - cfg.scoreMargin - w : cfg.scoreMargin;
    return { text: String(v), left, right: left + w, top: cfg.scoreMargin, worldWidth: cfg.worldWidth, borderInner: 2 };
  });
}
// Loads ships and turn, then launches a full-power forward move (needle 0), like tests/game.test.js launch().
async function launchMove(ships) {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const s = g.getState();
  g.setState({ ...s, turn: 0, ships, scores: [0, 0], explosions: [], gauge: { ...s.gauge, phase: 'power', power: 1, sweep: 1 } });
  g.press('Space');
  const d = g.getState();
  g.setState({ ...d, gauge: { ...d.gauge, needle: 0 } });
  g.press('Space');
  return cfg.moveAnimMs;
}
function step(ms) { window.__game.step(ms); return true; }

// ---- run ----
const FULL_HD = { width: 1920, height: 1080, dpr: 1 };
const SQUARE = { width: 1000, height: 1000, dpr: 2 };
const report = {};
const profile = mkdtempSync(join(tmpdir(), 'galaxy-capture-'));
const exe = findBrowser();
if (!exe) throw new Error('No Chrome or Edge found; set CHROME_PATH');
const server = await startServer(ROOT, 0);
const browser = await launch(exe, profile);
try {
  const url = `${server.url}/index.html?debug=1`;
  // Design issue 1: negative scores on screen, at 1920x1080 and 1000x1000 (dpr 2).
  for (const [name, size] of [['1920x1080', FULL_HD], ['1000x1000', SQUARE]]) {
    const p = await browser.open(url, size);
    await p.eval(freeze);
    const bounds = await p.eval(setScores, [-2, -4]);
    const drawn = await p.eval(draw);
    await p.shot(`r1-negative-scores-${name}.png`);
    report[`negative-${name}`] = { drawn, bounds };
  }
  // Design issue 2: last frame before the move ends, and the next frame (ending step of 1 ms).
  const cases = {
    kill: [{ x: 200, y: 480, heading: 0, alive: true }, { x: 300, y: 490, heading: 180, alive: true }],
    wall: [{ x: 1200, y: 480, heading: 0, alive: true }, { x: 600, y: 200, heading: 180, alive: true }],
  };
  for (const [name, ships] of Object.entries(cases)) {
    const p = await browser.open(url, FULL_HD);
    await p.eval(freeze);
    const T = await p.eval(launchMove, ships);
    await p.eval(step, T - 1);
    const last = await p.eval(draw);
    await p.shot(`r1-${name}-last-frame-before-end.png`);
    await p.eval(step, 1);
    const next = await p.eval(draw);
    await p.shot(`r1-${name}-next-frame-move-ended.png`);
    report[name] = { lastFrameBeforeEnd: last, nextFrame: next };
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
writeFileSync(join(HERE, 'r1-capture.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
