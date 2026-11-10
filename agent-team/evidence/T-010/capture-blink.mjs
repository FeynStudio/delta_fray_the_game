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
// Review round 1 adds: a respawn turn with the destroyed ship's explosion running (0, 100 and 300 ms into
// it), the nearly invisible end of a cycle (390 ms) in the power and in the direction phase with the
// gauge's own drawn opacity measured, and a dense sequence (16 ms steps, two cycles) saved as one
// contact sheet. Fixed frames only: this does not show how the blink feels in real time.
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
  const { protectionAlpha, COLORS, gaugeLayout } = await import('/src/render.js');
  const { isSpawnProtected } = await import('/src/rules.js');
  window.__loopCb(window.__t);
  const s = window.__game.getState();
  const c = document.querySelector('canvas');
  const k = c.width / cfg.worldWidth;
  const ctx = c.getContext('2d');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const bg = hex(COLORS.background);
  // Drawn opacity estimate of ship colour i in a canvas pixel box: brightest strongest-channel value.
  const measure = (x0, y0, w, h, i) => {
    const px = ctx.getImageData(x0, y0, w, h).data;
    const col = hex(COLORS.ships[i]);
    const ch = col.indexOf(Math.max(...col)); // the ship colour's strongest channel
    let max = 0;
    for (let p = 0; p < px.length; p += 4) max = Math.max(max, px[p + ch]);
    return (max - bg[ch]) / (col[ch] - bg[ch]);
  };
  const ships = s.ships.map((ship, i) => {
    // Box around the ship body only (centroid -12..+21 along x for these headings, +-11 across);
    // gauges sit further out (power bar below, dial past the nose + gap).
    const x0 = Math.floor((ship.x - 21) * k), y0 = Math.floor((ship.y - 11) * k);
    const w = Math.ceil(42 * k), h = Math.ceil(22 * k);
    const drawnAlpha = measure(x0, y0, w, h, i);
    const prot = isSpawnProtected(s, i);
    return {
      ship: i, x: ship.x, y: ship.y, protected: prot,
      expectedAlpha: prot ? Number(protectionAlpha(s.clock).toFixed(4)) : 1,
      drawnAlphaEstimate: Number(drawnAlpha.toFixed(3)),
    };
  });
  // The active player's gauge (power bar always, dial in the direction phase), measured the same way.
  const g = { phase: s.gauge.phase };
  if (s.gauge.phase === 'power' || s.gauge.phase === 'direction') {
    const { bar, dial } = gaugeLayout(s);
    g.powerBarAlphaEstimate = Number(measure(Math.floor((bar.x - 2) * k), Math.floor((bar.y - 2) * k),
      Math.ceil((bar.w + 4) * k), Math.ceil((bar.h + 4) * k), s.turn).toFixed(3));
    if (s.gauge.phase === 'direction') {
      g.dialNeedleAlphaEstimate = Number(measure(Math.floor((dial.x - dial.r - 2) * k), Math.floor((dial.y - dial.r - 2) * k),
        Math.ceil((2 * dial.r + 4) * k), Math.ceil((2 * dial.r + 4) * k), s.turn).toFixed(3));
    }
  }
  const explosions = (s.explosions ?? []).map((e) => ({ ship: e.ship, x: e.x, y: e.y, elapsed: e.elapsed }));
  return { clock: s.clock, turn: s.turn, phase: s.gauge.phase, ships, gauge: g, explosions };
}
// Loads a respawn set-up and launches player 1's full-power move straight through player 2's ship
// (which has moved, so it is not protected). The step that ends the move starts the explosion and
// respawns player 2's ship on its spawn, protected.
async function killP2() {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const s = g.getState();
  const ships = [
    { x: 870, y: 480, heading: 0, alive: true, unmovedSinceSpawn: false },
    { x: 1000, y: 480, heading: 180, alive: true, unmovedSinceSpawn: false },
  ];
  g.setState({ ...s, turn: 0, ships, explosions: [], scores: [0, 0], clock: 0,
    gauge: { ...s.gauge, phase: 'power', power: 1, sweep: 1 } });
  g.press('Space');
  const d = g.getState();
  g.setState({ ...d, gauge: { ...d.gauge, needle: 0 } });
  g.press('Space');
  g.step(cfg.moveAnimMs);
  const e = g.getState();
  return { turn: e.turn, ship1: e.ships[1], explosions: e.explosions };
}
// Game start in a chosen phase (power, or direction after one Space) at a chosen clock.
async function startAt(phase, clock) {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const s = g.getState();
  g.setState({ ...s, turn: 0, explosions: [], scores: [0, 0], clock: 0,
    ships: cfg.spawns.map((p) => ({ x: p.x, y: p.y, heading: p.heading, alive: true, unmovedSinceSpawn: true })),
    gauge: { phase: 'power', power: 0.6, needle: 0, backward: false, distance: 0, sweep: 1 } });
  if (phase === 'direction') {
    g.press('Space');
    const d = g.getState();
    g.setState({ ...d, gauge: { ...d.gauge, needle: 25 } });
  }
  const t = g.getState();
  g.setState({ ...t, clock });
  return g.getState().gauge.phase;
}
// Dense sequence: from game start, step(stepMs) n times; after each draw, copy a crop around player 1's
// ship and power bar into a contact sheet cell labelled with clock and expected alpha.
async function contactSheet(n, stepMs) {
  const cfg = (await import('/src/config.js')).default;
  const { protectionAlpha } = await import('/src/render.js');
  const game = document.querySelector('canvas');
  const k = game.width / cfg.worldWidth;
  const crop = { x: 130, y: 440, w: 120, h: 120 }; // world units around (190, 480) and the power bar below it
  const zoom = 2, cols = 9, label = 22;
  const cw = Math.round(crop.w * k * zoom), ch = Math.round(crop.h * k * zoom);
  const rows = Math.ceil((n + 1) / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cw; sheet.height = rows * (ch + label);
  const c = sheet.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, sheet.width, sheet.height);
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    if (i > 0) window.__game.step(stepMs);
    window.__loopCb(window.__t);
    const s = window.__game.getState();
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * (ch + label);
    c.imageSmoothingEnabled = false;
    c.drawImage(game, crop.x * k, crop.y * k, crop.w * k, crop.h * k, cx, cy + label, cw, ch);
    const a = protectionAlpha(s.clock);
    c.fillStyle = '#ddd'; c.font = '16px monospace'; c.textBaseline = 'top';
    c.fillText('t=' + s.clock + 'ms a=' + a.toFixed(2), cx + 4, cy + 3);
    c.strokeStyle = '#333'; c.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch + label - 1);
    out.push({ clock: s.clock, expectedAlpha: Number(a.toFixed(4)) });
  }
  return { png: sheet.toDataURL('image/png').split(',')[1], frames: out, crop, cols, stepMs };
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
let sequence = null;
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

  // Review round 1, issue 1: respawn turn with the explosion running (0, 100 and 300 ms into it).
  const killed = await page.eval(killP2);
  if (killed.turn !== 1 || !killed.ship1.unmovedSinceSpawn || killed.explosions?.length !== 1) {
    throw new Error(`respawn set-up failed: ${JSON.stringify(killed)}`);
  }
  for (const [ms, label] of [[0, '0ms'], [100, '100ms'], [200, '300ms']]) {
    if (ms) await page.eval(step, ms);
    const r = await page.eval(drawAndMeasure);
    frames.push({ file: `blink-respawn-explosion-${label}.png`, ...r });
    await page.shot(`blink-respawn-explosion-${label}.png`);
  }

  // Review round 1, issue 2: about 390 ms into a cycle (alpha 0.025), power phase and direction phase.
  for (const phase of ['power', 'direction']) {
    const got = await page.eval(startAt, phase, 390);
    if (got !== phase) throw new Error(`wanted phase ${phase}, got ${got}`);
    const r = await page.eval(drawAndMeasure);
    frames.push({ file: `blink-start-390ms-${phase}.png`, ...r });
    await page.shot(`blink-start-390ms-${phase}.png`);
  }

  // Review round 1, issue 3: dense sequence, 16 ms steps over two cycles, as one contact sheet.
  await page.eval(startAt, 'power', 0);
  const seq = await page.eval(contactSheet, 50, 16);
  writeFileSync(join(HERE, 'blink-sequence-16ms.png'), Buffer.from(seq.png, 'base64'));
  sequence = {
    file: 'blink-sequence-16ms.png', stepMs: seq.stepMs, cols: seq.cols, cropWorld: seq.crop,
    note: 'player 1 ship and power bar at game start, power phase; one cell per step(16), left to right',
    frames: seq.frames,
  };
} finally {
  await browser.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
const result = { commit, url: '/index.html?debug=1', viewport: '1920x1080 dpr 1', frames, sequence };
writeFileSync(join(HERE, 'blink-capture.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
