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
const EVAL_TIMEOUT_MS = 15000;
const SEND_TIMEOUT_MS = 20000;


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
      return new Promise((ok, fail) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          fail(new Error(`DevTools message ${method} timed out after ${SEND_TIMEOUT_MS} ms`));
        }, SEND_TIMEOUT_MS);
        const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
        pending.set(id, { ok: settle(ok), fail: settle(fail), method });
      });
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
          const answer = send('Runtime.evaluate', {
            expression: `(${fn})(...${JSON.stringify(fnArgs)})`, awaitPromise: true, returnByValue: true,
          });
          let timer;
          const timedOut = new Promise((_, fail) => {
            timer = setTimeout(() => {
              const error = new Error(`page evaluation timed out after ${EVAL_TIMEOUT_MS} ms in ${fn.name || 'an unnamed function'}`);
              error.evalTimedOut = true;
              fail(error);
            }, EVAL_TIMEOUT_MS);
          });
          const r = await Promise.race([answer, timedOut]).finally(() => clearTimeout(timer));
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
        async close() {
          await cdp.send('Target.closeTarget', { targetId });
        },
      };

      const deadline = Date.now() + 15000;
      for (;;) {
        const ready = await page.eval(pageReadyProbe, url.split('?')[0]).catch((error) => {
          if (error.evalTimedOut) throw error;
          return false;
        });
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


function pageReadyProbe(base) {
  return location.href.startsWith(base) && document.readyState === 'complete' && !!window.__game;
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

function phaseSetupProbe(keys, reading) {
  const g = window.__game;
  const s = g.getState();
  s.gauge = { ...s.gauge, power: reading.power, sweep: 1 };
  g.setState(s);
  for (const k of keys) g.press(k);
  const d = g.getState();
  if (d.gauge.phase === 'direction') d.gauge = { ...d.gauge, needle: reading.needle };
  g.setState(d);
}

async function steadyProbe(power) {
  const cfg = (await import('/src/config.js')).default;
  const g = window.__game;
  if (g.getState().anim) g.step(cfg.moveAnimMs);
  const s = g.getState();
  if (s.gauge.phase === 'power') s.gauge = { ...s.gauge, power, sweep: 1 };
  g.setState(s);
}

async function fixedClockProbe(clock) {
  const { protectionAlpha } = await import('/src/render.js');
  const g = window.__game;
  g.setState({ ...g.getState(), clock });
  return protectionAlpha(clock);
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
  if (window.__redraw) return true;
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
  const rad = angle * Math.PI / 180;
  const to = { x: from.x + d.gauge.distance * Math.cos(rad), y: from.y + d.gauge.distance * Math.sin(rad) };
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

function scoreSetupProbe(scores) {
  const s = window.__game.getState();
  s.scores = scores;
  window.__game.setState(s);
}

async function scorePixelsProbe(scores) {
  const cfg = (await import('/src/config.js')).default;
  const { COLORS } = await import('/src/render.js');
  const c = document.querySelector('canvas');
  const sx = c.width / cfg.worldWidth, sy = c.height / cfg.worldHeight;
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const m = document.createElement('canvas').getContext('2d');
  m.font = `${cfg.scoreFontSize}px monospace`;
  m.textBaseline = 'top';
  const edge = 2;
  const tol = 48;
  const inner = { x0: edge, y0: edge, x1: cfg.worldWidth - edge, y1: cfg.worldHeight - edge };
  const inside = (b) => b.x0 >= inner.x0 && b.x1 <= inner.x1 && b.y0 >= inner.y0 && b.y1 <= inner.y1;
  const fmt = (b) => `x ${b.x0.toFixed(1)}..${b.x1.toFixed(1)}, y ${b.y0.toFixed(1)}..${b.y1.toFixed(1)}`;
  const span = (lo, hi, scale, size) => [Math.max(0, Math.floor(lo * scale)), Math.min(size, Math.ceil(hi * scale))];
  const problems = [];
  scores.forEach((score, i) => {
    const color = COLORS.ships[i % COLORS.ships.length];
    const want = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    const colored = (x, y) => {
      const k = (y * c.width + x) * 4;
      return want.every((v, j) => Math.abs(data[k + j] - v) <= tol);
    };
    const text = String(score);
    const right = i % 2 === 1;
    const ax = right ? cfg.worldWidth - cfg.scoreMargin : cfg.scoreMargin, ay = cfg.scoreMargin;
    m.textAlign = right ? 'right' : 'left';
    const t = m.measureText(text);
    const box = {
      x0: ax - t.actualBoundingBoxLeft, x1: ax + t.actualBoundingBoxRight,
      y0: ay - t.actualBoundingBoxAscent, y1: ay + t.actualBoundingBoxDescent,
    };
    const who = `player ${i + 1} score ${text}`;
    if (!inside(box)) {
      problems.push(`${who}: text box (${fmt(box)}) is not inside the map border (inner edge ${fmt(inner)})`);
      return;
    }
    const pad = 8;
    const [px0, px1] = span(box.x0 - pad, box.x1 + pad, sx, c.width);
    const [py0, py1] = span(box.y0 - pad, box.y1 + pad, sy, c.height);
    for (let y = py0; y < py1; y++) {
      for (let x = px0; x < px1; x++) {
        if (!colored(x, y)) continue;
        if (x < inner.x0 * sx || x >= inner.x1 * sx || y < inner.y0 * sy || y >= inner.y1 * sy) {
          problems.push(`${who}: a pixel in the ship colour at canvas pixel (${x}, ${y}) is not inside the map border`);
          return;
        }
      }
    }
    if (!text.startsWith('-')) {
      problems.push(`${who}: wanted a minus sign, the score is not negative`);
      return;
    }
    const pen = right ? ax - t.width : ax;
    m.textAlign = 'left';
    const d = m.measureText('-');
    const minus = {
      x0: pen - d.actualBoundingBoxLeft, x1: pen + d.actualBoundingBoxRight,
      y0: ay - d.actualBoundingBoxAscent - 1, y1: ay + d.actualBoundingBoxDescent + 1,
    };
    const [mx0, mx1] = span(minus.x0, minus.x1, sx, c.width);
    const [my0, my1] = span(minus.y0, minus.y1, sy, c.height);
    let best = 0;
    for (let y = my0; y < my1; y++) {
      let run = 0;
      for (let x = mx0; x < mx1; x++) run += colored(x, y) ? 1 : 0;
      best = Math.max(best, run);
    }
    const cover = mx1 > mx0 ? best / (mx1 - mx0) : 0;
    if (cover < 0.6) {
      problems.push(`${who}: minus sign not drawn in the ship colour ${color} (best row covers ${Math.round(cover * 100)}% `
        + `of the minus box ${fmt(minus)}, wanted at least 60%)`);
    }
  });
  return problems;
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
    return `wanted the mover on the expected end point (${want.to.x}, ${want.to.y}), got (${ship.x}, ${ship.y})`;
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

function phaseWrong(s, want) {
  const g = s.gauge;
  if (g.phase !== want.phase || g.backward !== want.backward) {
    return `wanted gauge phase '${want.phase}' backward ${want.backward}, got phase '${g.phase}' backward ${g.backward}`;
  }
  if (g.power !== GAUGE.power) return `wanted power ${GAUGE.power}, got ${g.power}`;
  if (g.phase === 'direction' && g.needle !== GAUGE.needle) return `wanted needle ${GAUGE.needle}, got ${g.needle}`;
  return null;
}


const FULL_HD = { width: 1920, height: 1080, dpr: 1 };
const SQUARE_2X = { width: 1000, height: 1000, dpr: 2 };

const FIXED_CLOCK_MS = 0;
const MIN_PROTECTION_ALPHA = 0.75;
const GAUGE = { power: 0.6, needle: 30 };

async function fixedShot(p, shots, suffix, wrong = () => null) {
  const file = `${basename(out).replace(/\.json$/, '')}${suffix}.png`;
  await p.eval(freezeLoopProbe);
  const alpha = await p.eval(fixedClockProbe, FIXED_CLOCK_MS);
  const before = await p.eval(drawnStateProbe);
  const png = await p.screenshot();
  const after = await p.eval(stateProbe);
  const problems = [['before', before], ['after', after]].map(([when, s]) => {
    const problem = wrong(s);
    return problem && `${problem} ${when} the capture`;
  });
  if (JSON.stringify(before) !== JSON.stringify(after)) problems.push('the state changed during the capture');
  if (before.clock !== FIXED_CLOCK_MS) problems.push(`wanted clock ${FIXED_CLOCK_MS}, got ${before.clock}`);
  if (!(alpha >= MIN_PROTECTION_ALPHA)) problems.push(`protection alpha ${alpha} at clock ${FIXED_CLOCK_MS}, wanted at least ${MIN_PROTECTION_ALPHA}`);
  if (problems.some(Boolean)) throw new Error(`${file}: ${problems.filter(Boolean).join('; ')}`);
  shots.push({ suffix, png });
}

async function steadyShot(p, shots) {
  await p.eval(freezeLoopProbe);
  await p.eval(steadyProbe, GAUGE.power);
  await fixedShot(p, shots, '');
}

async function scoreShot(browser, url, shots, suffix, size, scores) {
  const p = await browser.open(url, size);
  await p.eval(freezeLoopProbe);
  await p.eval(scoreSetupProbe, scores);
  await p.eval(steadyProbe, GAUGE.power);
  await fixedShot(p, shots, suffix, (s) => (JSON.stringify(s.scores) === JSON.stringify(scores) ? null
    : `wanted scores ${JSON.stringify(scores)}, got ${JSON.stringify(s.scores)}`));
  const problems = await p.eval(scorePixelsProbe, scores);
  await p.close();
  if (problems.length) throw new Error(`${basename(out).replace(/\.json$/, '')}${suffix}.png: ${problems.join('; ')}`);
}

async function stateShot(browser, url, shots, suffix, setup, setupArgs, wrong) {
  const p = await browser.open(url, FULL_HD);
  await p.eval(freezeLoopProbe);
  const want = await p.eval(setup, ...setupArgs);
  await fixedShot(p, shots, suffix, (s) => wrong(s, want));
  await p.close();
}

async function phaseShot(browser, url, shots, suffix, keys, want) {
  const p = await browser.open(url, FULL_HD);
  await p.eval(freezeLoopProbe);
  await p.eval(phaseSetupProbe, keys, GAUGE);
  await fixedShot(p, shots, suffix, (s) => phaseWrong(s, want));
  await p.close();
}

const FEATURES = {
  async render(browser, url, shots) {
    const a = await browser.open(url, FULL_HD);
    const r1 = await a.eval(renderProbe);
    await steadyShot(a, shots);
    const b = await browser.open(url, SQUARE_2X);
    const r2 = await b.eval(renderProbe);
    await scoreShot(browser, url, shots, '-negative-score', FULL_HD, [-12, -7]);
    await scoreShot(browser, url, shots, '-negative-score-1000', SQUARE_2X, [-12, -7]);
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
    await steadyShot(a, shots);
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
    await steadyShot(a, shots);
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
