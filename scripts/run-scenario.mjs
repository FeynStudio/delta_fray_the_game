#!/usr/bin/env node
// Runs a rules scenario against src/rules.js and writes the picked values as JSON.
// Usage: node scripts/run-scenario.mjs scenarios/<name>.json --out <file.json>
//
// Scenario format (see FEATURE_MAP.md, "Test harness contract"):
//   { "overrides": {config keys}, "cases": [ { "name", "state", "steps": [{ "call", "move"? }], "pick": ["ships.0.x", ...] } ] }
// Each step calls rules[call](state, move) or rules[call](state) and must return the new state.
// Inputs are deep-frozen, so a rules function that mutates its input fails here.
// Numbers are rounded to 3 decimals. Exit code 1 if anything could not run.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scenarioPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
if (!scenarioPath || !out) {
  process.stderr.write('Usage: node scripts/run-scenario.mjs scenarios/<name>.json --out <file.json>\n');
  process.exit(2);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function pick(state, path) {
  let v = state;
  for (const key of path.split('.')) v = v == null ? undefined : v[key];
  if (v === undefined) return '<missing>';
  if (typeof v === 'number') {
    const r = Math.round(v * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
  }
  return v;
}

const result = {};
let failed = false;
try {
  const scenario = JSON.parse(readFileSync(resolve(scenarioPath), 'utf8'));
  const config = (await import(pathToFileURL(resolve(ROOT, 'src/config.js')).href)).default;
  if (!config || typeof config !== 'object') throw new Error('src/config.js must export a default config object');
  const rules = await import(pathToFileURL(resolve(ROOT, 'src/rules.js')).href);
  const original = structuredClone(config);

  for (const c of scenario.cases) {
    try {
      // Reset config, then apply the scenario's and the case's overrides.
      // Overrides come from scenario files checked into the repo, not from user input.
      for (const key of Object.keys(config)) if (!(key in original)) delete config[key];
      Object.assign(config, structuredClone(original), scenario.overrides ?? {}, c.overrides ?? {}); // nosemgrep: javascript.lang.security.insecure-object-assign.insecure-object-assign

      let state = deepFreeze(structuredClone(c.state));
      for (const step of c.steps) {
        const fn = rules[step.call];
        if (typeof fn !== 'function') throw new Error(`src/rules.js does not export ${step.call}()`);
        const next = 'move' in step ? fn(state, deepFreeze(structuredClone(step.move))) : fn(state);
        if (!next || typeof next !== 'object') throw new Error(`${step.call}() must return the new state`);
        state = deepFreeze(next);
      }
      result[c.name] = Object.fromEntries(c.pick.map((p) => [p, pick(state, p)]));
    } catch (e) {
      result[c.name] = { error: e.message };
      failed = true;
    }
  }
  Object.assign(config, original);
} catch (e) {
  result.error = e.message;
  failed = true;
}

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
process.exit(failed ? 1 : 0);
