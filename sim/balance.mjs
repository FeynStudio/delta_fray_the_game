// sim/balance.mjs — plays scripted games with the real rules; exits 1 if a balance target is missed.
// Usage: node sim/balance.mjs --games 2000 --out agent-team/evidence/T-001/balance.json
import { readFileSync, writeFileSync } from 'node:fs';

// ===== Hooks: connect your game here =====
import config from '../src/config.js';
import { createInitialState, resolveMove, endTurn } from '../src/rules.js';
import { moveFromGauge } from '../src/input.js';

// Scripted player: aims roughly at the enemy within what the gauge allows (needle ±90°, or backward).
function scriptedMove(state, rng) {
  const me = state.ships[state.turn], foe = state.ships[1 - state.turn];
  const toFoe = (Math.atan2(foe.y - me.y, foe.x - me.x) * 180) / Math.PI;
  let rel = ((toFoe - me.heading + 540) % 360) - 180;   // -180..180 from the ship's heading
  const backward = Math.abs(rel) > 90;
  if (backward) rel = ((rel + 360) % 360) - 180;        // measured from the tail instead
  const needle = Math.max(-config.gaugeNeedleMax, Math.min(config.gaugeNeedleMax, rel + (rng() * 2 - 1) * 30));
  const gauge = { distance: (0.5 + rng() * 0.5) * config.maxMove, needle, backward };
  return moveFromGauge({ ...state, gauge });            // the same move the real controls produce
}

function playOne(rng, maxTurns = 300) {
  let state = createInitialState();
  const events = [];
  for (let turn = 1; turn <= maxTurns; turn++) {
    const mover = state.turn;
    const after = resolveMove(state, scriptedMove(state, rng));
    after.ships.forEach((ship, j) => {
      if (state.ships[j].alive && !ship.alive) {
        events.push({ turn, type: 'destroyed', cause: j === mover ? 'edge' : 'ship' });
      }
    });
    state = endTurn(after);
  }
  return events;
}

function measure(events) {
  // One number per metric for this game; names must match balance-targets.json.
  const firstHit = events.find(e => e.type === 'destroyed' && e.cause === 'ship');
  const deaths = events.filter(e => e.type === 'destroyed');
  return {
    movesToFirstEncounter: firstHit ? Math.ceil(firstHit.turn / 2) : null, // turns alternate, so moves per player
    edgeDeathRate: deaths.length ? deaths.filter(e => e.cause === 'edge').length / deaths.length : 0,
  };
}
// ===== End hooks =====

const args = {};
process.argv.slice(2).forEach((v, i, all) => { if (v.startsWith('--')) args[v.slice(2)] = all[i + 1]; });
const games = Number(args.games ?? 2000);
const targets = JSON.parse(readFileSync('agent-team/design/balance-targets.json', 'utf8'));

// Seeded random numbers, so the same code always gives the same result (no flaky CI).
function seeded(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sorted = xs => [...xs].sort((a, b) => a - b);
const stats = {
  mean: xs => xs.reduce((s, x) => s + x, 0) / xs.length,
  median: xs => { const s = sorted(xs), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; },
  p90: xs => sorted(xs)[Math.floor(xs.length * 0.9)],
};

const samples = {};
for (let g = 1; g <= games; g++) {
  for (const [name, value] of Object.entries(measure(playOne(seeded(g))))) {
    if (value !== null) (samples[name] ??= []).push(value);
  }
}

let fail = false;
const report = {};
for (const [name, t] of Object.entries(targets)) {
  const xs = samples[name] ?? [];
  const value = xs.length ? stats[t.stat](xs) : null;
  const ok = value !== null && (t.min === undefined || value >= t.min) && (t.max === undefined || value <= t.max);
  report[name] = { ...t, value, samples: xs.length, ok };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${t.stat} = ${value} (target ${t.min ?? '-'} to ${t.max ?? '-'})`);
  if (!ok) fail = true;
}
if (args.out) writeFileSync(args.out, JSON.stringify({ games, report }, null, 2));
process.exit(fail ? 1 : 0);