#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const feature = opt('--feature');
const out = opt('--out');


function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [
    ...dirs.map((d) => join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...dirs.map((d) => join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => existsSync(p));
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.fail(new Error(`${p.method}: ${msg.error.message}`)); else p.ok(msg.result);
  };
  return {
    ready: new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('cannot connect to the browser')); }),
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((ok, fail) => pending.set(id, { ok, fail, method }));
    },
    close: () => ws.close(),
  };
}

async function launchBrowser(exe, profile) {
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise((done) => proc.once('exit', done));
  const portFile = join(profile, 'DevToolsActivePort');
  const wsUrl = await new Promise((ok, fail) => {
    let buf = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearInterval(poll); fn(value);
    };
    const timer = setTimeout(() => finish(fail, new Error('browser did not start within 20s')), 20000);
    const poll = setInterval(() => {
      if (!existsSync(portFile)) return;
      const [port, path] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (port && path) finish(ok, `ws://127.0.0.1:${port}${path}`); // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
    }, 100);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) finish(ok, m[1]);
    });
    exited.then((code) => { if (code !== 0) finish(fail, new Error(`browser exited early (code ${code})`)); });
  });
  const cdp = connect(wsUrl);
  await cdp.ready;

  return {
    async open(url, { width, height, dpr }) {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => cdp.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
      await send('Page.bringToFront');
      await send('Page.navigate', { url });

      const page = {
        async eval(fn, ...fnArgs) {
          const r = await send('Runtime.evaluate', {
            expression: `(${fn})(...${JSON.stringify(fnArgs)})`, awaitPromise: true, returnByValue: true,
          });
          if (r.exceptionDetails) {
            throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
          }
          return r.result.value;
        },
        async key(type, { autoRepeat = false } = {}, name = 'Space') {
          const keys = { Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, Shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 } };
          await send('Input.dispatchKeyEvent', { type, autoRepeat, ...keys[name] });
        },
        async screenshot() {
          return Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        },
      };

      const deadline = Date.now() + 15000;
      for (;;) {
        const ready = await page.eval(
          (base) => location.href.startsWith(base) && document.readyState === 'complete' && !!window.__game,
          url.split('?')[0],
        ).catch(() => false);
        if (ready) return page;
        if (Date.now() > deadline) throw new Error('window.__game not found; is index.html?debug=1 exposing the debug API?');
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async close() {
      const closing = cdp.send('Browser.close').then(() => null, (err) => err);
      const closeErr = await Promise.race([closing, new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (closeErr) process.stderr.write(`Browser.close failed: ${closeErr.message}\n`);
      cdp.close();
      proc.kill();
      const lockfile = join(profile, 'lockfile');
      for (const deadline = Date.now() + 10000; existsSync(lockfile) && Date.now() < deadline;) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (existsSync(lockfile)) process.stderr.write('browser still holds its profile after 10s\n');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    },
  };
}


async function renderProbe() {
  const cfg = (await import('/src/config.js')).default;
  const canvases = document.querySelectorAll('canvas');
  const c = canvases[0];
  if (!c) return { canvases: 0 };
  const r = c.getBoundingClientRect();
  const W = innerWidth, H = innerHeight;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const ships = window.__game.getState().ships ?? [];
  const angleDiff = (a, b) => (((a - b) % 360) + 540) % 360 - 180;
  return {
    canvases: canvases.length,
    fits: r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5
      && (near(r.width, W, 2) || near(r.height, H, 2)),
    aspect: near(r.width / r.height, cfg.worldWidth / cfg.worldHeight, 0.01),
    noScroll: document.documentElement.scrollWidth <= W && document.documentElement.scrollHeight <= H,
    sharp: near(c.width, r.width * devicePixelRatio, 2) && near(c.height, r.height * devicePixelRatio, 2),
    twoShips: ships.length === 2,
    atSpawns: ships.length === 2 && ships.every((s, i) => near(s.x, cfg.spawns[i].x, 0.001)
      && near(s.y, cfg.spawns[i].y, 0.001) && near(angleDiff(s.heading, cfg.spawns[i].heading), 0, 0.001)),
    facing: ships.length === 2 && ships.every((s, i) => {
      const o = ships[1 - i];
      return Math.abs(angleDiff(s.heading, Math.atan2(o.y - s.y, o.x - s.x) * 180 / Math.PI)) < 1;
    }),
  };
}

async function inputProbe() {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const gauge = () => g.getState().gauge;
  const setGauge = (patch) => { const s = g.getState(); s.gauge = { ...s.gauge, ...patch }; g.setState(s); };
  const r = {};
  r.startsOnPowerGauge = gauge().phase === 'power';
  setGauge({ power: 0.6 });
  g.press('Space');
  let gs = gauge();
  r.firstSpaceLocksDistance = gs.phase === 'direction';
  r.distanceIs60PercentOfMax = Math.abs(gs.distance - 0.6 * cfg.maxMove) < 1e-6;
  r.directionDefaultsForward = gs.backward === false;
  setGauge({ needle: 30 });
  g.press('Space');
  gs = gauge();
  r.secondSpaceLaunchesImmediately = gs.phase === 'moving';
  r.directionLockedAt30Forward = gs.needle === 30 && gs.backward === false;
  g.press('Shift');
  r.shiftIgnoredAfterLaunch = gauge().backward === false;
  return r;
}

function shiftFlipProbe() {
  const g = window.__game;
  g.press('Space');
  g.press('Shift');
  return g.getState().gauge.backward === true;
}

function phaseProbe() {
  return window.__game.getState().gauge.phase;
}

function phaseSetupProbe(keys) {
  for (const k of keys) window.__game.press(k);
}

function gaugeAfterFrameProbe() {
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(
    () => done(window.__game.getState().gauge))));
}

function gaugeProbe() {
  return window.__game.getState().gauge;
}

async function turnsProbe() {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const near = (a, b) => Math.abs(a - b) < 0.001;
  const s = g.getState();
  s.turn = 0;
  s.ships = [
    { ...s.ships[0], x: 200, y: 480, heading: 0, alive: true },
    { ...s.ships[1], x: 300, y: 490, heading: 180, alive: true },
  ];
  s.gauge = { ...s.gauge, phase: 'power', power: 1, backward: false };
  g.setState(s);
  g.press('Space');
  const s2 = g.getState();
  s2.gauge = { ...s2.gauge, needle: 0 };
  g.setState(s2);
  g.press('Space');
  g.step(10000);
  const a = g.getState();
  const r = {
    enemyRespawnedAtSpawn: a.ships[1].alive === true && near(a.ships[1].x, cfg.spawns[1].x)
      && near(a.ships[1].y, cfg.spawns[1].y) && near(a.ships[1].heading, cfg.spawns[1].heading),
    attackerSurvivedAtEnd: a.ships[0].alive === true && near(a.ships[0].x, 200 + cfg.maxMove) && near(a.ships[0].y, 480),
    turnPassedToPlayer2: a.turn === 1,
    readyForNextMove: a.gauge.phase === 'power',
  };
  g.step(600000);
  const later = g.getState();
  r.noTurnTimer = later.turn === 1 && later.gauge.phase === 'power';
  return r;
}

function freezeLoopProbe() {
  return new Promise((done) => {
    window.requestAnimationFrame = (loop) => {
      window.requestAnimationFrame = () => 0;
      const now = performance.now();
      window.__redraw = () => loop(now);
      window.__redraw();
      done(true);
      return 0;
    };
  });
}

function drawnStateProbe() {
  window.__redraw();
  return window.__game.getState();
}

function stateProbe() {
  return window.__game.getState();
}

async function backwardLaunchProbe(flight) {
  const cfg = (await import('/src/config.js')).default;
  const { applyMove } = await import('/src/rules.js');
  const g = window.__game;
  const needle = 30;
  const s = g.getState();
  s.turn = 0;
  s.clock = 0;
  s.ships[0] = { ...s.ships[0], x: cfg.worldWidth / 2, y: cfg.worldHeight / 2, heading: 0, alive: true };
  s.gauge = { ...s.gauge, phase: 'power', power: 1, backward: false };
  g.setState(s);
  g.press('Space');
  g.press('Shift');
  const d = g.getState();
  d.gauge = { ...d.gauge, needle };
  g.setState(d);
  const from = d.ships[0];
  const angle = (((from.heading + 180 + needle) % 360) + 360) % 360;
  const to = applyMove(d, { distance: d.gauge.distance, angle }).ships[0];
  g.press('Space');
  g.step(cfg.moveAnimMs * flight);
  return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, angle };
}

async function explosionProbe() {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  const s = g.getState();
  s.turn = 0;
  s.clock = 0;
  s.ships = [
    { ...s.ships[0], x: 200, y: 480, heading: 0, alive: true },
    { ...s.ships[1], x: 300, y: 490, heading: 180, alive: true },
  ];
  s.gauge = { ...s.gauge, phase: 'power', power: 1, backward: false };
  g.setState(s);
  g.press('Space');
  const d = g.getState();
  d.gauge = { ...d.gauge, needle: 0 };
  g.setState(d);
  g.press('Space');
  g.step(cfg.moveAnimMs);
  g.step(cfg.explosionMs / 2);
  return { explosionMs: cfg.explosionMs, spawn: cfg.spawns[1] };
}

const headingOff = (s, want) => Math.abs((((s.ships[0].heading - want.angle) % 360) + 540) % 360 - 180) > 1e-6;

function backwardMidWrong(s, want) {
  const { from, to } = want;
  const ship = s.ships[0];
  const dx = to.x - from.x, dy = to.y - from.y;
  const t = ((ship.x - from.x) * dx + (ship.y - from.y) * dy) / (dx * dx + dy * dy);
  const off = Math.hypot(ship.x - (from.x + dx * t), ship.y - (from.y + dy * t));
  if (s.gauge.phase !== 'moving') return `wanted gauge phase 'moving', got '${s.gauge.phase}'`;
  if (!(t > 0 && t < 1 && off <= 0.001)) return `mover at (${ship.x}, ${ship.y}) is not strictly between its start and end points`;
  if (headingOff(s, want)) return `wanted heading ${want.angle} (heading before launch + 180 + needle), got ${ship.heading}`;
  return null;
}

function backwardEndWrong(s, want) {
  const ship = s.ships[0];
  if (s.gauge.phase !== 'power' || s.turn !== 1) return `wanted the move ended (phase 'power', turn 1), got phase '${s.gauge.phase}' turn ${s.turn}`;
  if (Math.abs(ship.x - want.to.x) > 0.001 || Math.abs(ship.y - want.to.y) > 0.001) {
    return `wanted the mover on the rules end point (${want.to.x}, ${want.to.y}), got (${ship.x}, ${ship.y})`;
  }
  if (headingOff(s, want)) return `wanted heading ${want.angle} (heading before launch + 180 + needle), got ${ship.heading}`;
  return null;
}

function explosionWrong(s, want) {
  const e = (s.explosions ?? []).find((x) => x.ship === 1);
  const ship = s.ships[1];
  if (!e) return 'wanted a running explosion for ship 1, got none';
  if (!(e.elapsed > 0 && e.elapsed < want.explosionMs)) return `wanted explosion elapsed between 0 and ${want.explosionMs}, got ${e.elapsed}`;
  if (ship.alive !== true || Math.abs(ship.x - want.spawn.x) > 0.001 || Math.abs(ship.y - want.spawn.y) > 0.001) {
    return `wanted the destroyed ship respawned at (${want.spawn.x}, ${want.spawn.y}), got alive ${ship.alive} at (${ship.x}, ${ship.y})`;
  }
  return null;
}


const FULL_HD = { width: 1920, height: 1080, dpr: 1 };

async function stateShot(browser, url, shots, suffix, setup, setupArgs, wrong) {
  const file = `${basename(out).replace(/\.json$/, '')}${suffix}.png`;
  const p = await browser.open(url, FULL_HD);
  await p.eval(freezeLoopProbe);
  const want = await p.eval(setup, ...setupArgs);
  const before = await p.eval(drawnStateProbe);
  const png = await p.screenshot();
  const after = await p.eval(stateProbe);
  for (const [when, s] of [['before', before], ['after', after]]) {
    const problem = wrong(s, want);
    if (problem) throw new Error(`${file}: ${problem} ${when} the capture`);
  }
  shots.push({ suffix, png });
}

async function phaseShot(browser, url, shots, suffix, keys, want) {
  const file = `${basename(out).replace(/\.json$/, '')}${suffix}.png`;
  const p = await browser.open(url, FULL_HD);
  await p.eval(phaseSetupProbe, keys);
  const before = await p.eval(gaugeAfterFrameProbe);
  const png = await p.screenshot();
  const after = await p.eval(gaugeProbe);
  for (const g of [before, after]) {
    if (g.phase !== want.phase || g.backward !== want.backward) {
      throw new Error(`${file}: wanted gauge phase '${want.phase}' backward ${want.backward}, `
        + `got phase '${g.phase}' backward ${g.backward} at capture time`);
    }
  }
  shots.push({ suffix, png });
}

const FEATURES = {
  async render(browser, url, shots) {
    const a = await browser.open(url, FULL_HD);
    const r1 = await a.eval(renderProbe);
    shots.push({ suffix: '', png: await a.screenshot() });
    const b = await browser.open(url, { width: 1000, height: 1000, dpr: 2 });
    const r2 = await b.eval(renderProbe);
    return {
      'one canvas': r1.canvases === 1,
      'fits the 1920x1080 window': r1.fits === true,
      'aspect ratio kept at 1920x1080': r1.aspect === true,
      'no scrollbars at 1920x1080': r1.noScroll === true,
      'aspect ratio kept at 1000x1000': r2.aspect === true,
      'no scrollbars at 1000x1000': r2.noScroll === true,
      'sharp on a 2x screen': r2.sharp === true,
      'two ships': r1.twoShips === true,
      'ships at their spawn points': r1.atSpawns === true,
      'ships face each other': r1.facing === true,
    };
  },

  async input(browser, url, shots) {
    const a = await browser.open(url, FULL_HD);
    const r = await a.eval(inputProbe);
    shots.push({ suffix: '', png: await a.screenshot() });
    const b = await browser.open(url, FULL_HD);
    const flipped = await b.eval(shiftFlipProbe);
    const c = await browser.open(url, FULL_HD);
    await c.key('keyDown');
    const afterPress = await c.eval(phaseProbe);
    await c.key('keyDown', { autoRepeat: true });
    const afterRepeat = await c.eval(phaseProbe);
    await c.key('keyUp');
    await phaseShot(browser, url, shots, '-power', [], { phase: 'power', backward: false });
    await phaseShot(browser, url, shots, '-direction', ['Space'], { phase: 'direction', backward: false });
    await phaseShot(browser, url, shots, '-direction-backward', ['Space', 'Shift'], { phase: 'direction', backward: true });
    return {
      'starts on the power gauge': r.startsOnPowerGauge === true,
      'first Space locks distance': r.firstSpaceLocksDistance === true,
      'distance is 60% of max at a 60% reading': r.distanceIs60PercentOfMax === true,
      'direction defaults to forward': r.directionDefaultsForward === true,
      'second Space launches with no confirm step': r.secondSpaceLaunchesImmediately === true,
      'direction locked at 30 forward': r.directionLockedAt30Forward === true,
      'Shift ignored after direction is locked': r.shiftIgnoredAfterLaunch === true,
      'Shift flips the direction gauge to backward': flipped === true,
      'a real Space keypress locks distance': afterPress === 'direction',
      'key repeat does not count as a second press': afterRepeat === 'direction',
    };
  },

  async turns(browser, url, shots) {
    const a = await browser.open(url, FULL_HD);
    const r = await a.eval(turnsProbe);
    shots.push({ suffix: '', png: await a.screenshot() });
    await stateShot(browser, url, shots, '-backward-mid', backwardLaunchProbe, [0.5], backwardMidWrong);
    await stateShot(browser, url, shots, '-backward-end', backwardLaunchProbe, [1], backwardEndWrong);
    await stateShot(browser, url, shots, '-explosion', explosionProbe, [], explosionWrong);
    return {
      'destroyed enemy respawns at its spawn point': r.enemyRespawnedAtSpawn === true,
      'attacker survives at the end of its move': r.attackerSurvivedAtEnd === true,
      'turn passes to player 2': r.turnPassedToPlayer2 === true,
      'next move starts on the power gauge': r.readyForNextMove === true,
      'no turn timer': r.noTurnTimer === true,
    };
  },
};


if (!FEATURES[feature] || !out) {
  process.stderr.write(`Usage: node scripts/smoke.mjs --feature ${Object.keys(FEATURES).join('|')} --out <file.json>\n`);
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'galaxy-smoke-'));
const shots = [];
let result;
let code = 0;
let server;
let browser;
try {
  const exe = findBrowser();
  if (!exe) throw new Error('No Chrome or Edge found; set CHROME_PATH to a Chromium-based browser');
  server = await startServer(ROOT, 0);
  browser = await launchBrowser(exe, profile);
  result = await FEATURES[feature](browser, `${server.url}/index.html?debug=1`, shots);
} catch (e) {
  result = { error: e.message };
  code = 1;
  process.stderr.write(`smoke ${feature}: ${e.message}\n`);
} finally {
  await browser?.close();
  await server?.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
for (const { suffix, png } of shots) writeFileSync(`${out.replace(/\.json$/, '')}${suffix}.png`, png);
process.exit(code);
