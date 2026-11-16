import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = '838a3ae';
const ROUND1 = 'e70a264';
const FILES = ['scripts/handoff-check.mjs', 'tests/handoff-check.test.js', 'package.json'];
const RUNS = 3;

function place(dir, file, text) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

function timed(dir) {
  let text;
  try {
    text = execFileSync(process.execPath, ['--test', '--test-reporter=tap', FILES[1]], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    text = String(error.stdout);
  }
  const value = (key) => Number((text.split('\n').find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  return { tests: value('tests'), pass: value('pass'), fail: value('fail'), skipped: value('skipped'), ms: Math.round(value('duration_ms')) };
}

const out = [];
const scratch = mkdtempSync(join(tmpdir(), 'handoff-r2-time-'));
try {
  for (const file of FILES) {
    place(join(scratch, 'base'), file, execFileSync('git', ['show', BASE + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));
    place(join(scratch, 'round1'), file, execFileSync('git', ['show', ROUND1 + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));
    place(join(scratch, 'head'), file, readFileSync(join(ROOT, file), 'utf8'));
  }
  const times = { base: [], round1: [], head: [] };
  for (let run = 1; run <= RUNS; run += 1) {
    for (const side of ['base', 'round1', 'head']) {
      const r = timed(join(scratch, side));
      times[side].push(r.ms);
      out.push(side + ' run ' + run + ': tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped + ', ' + r.ms + ' ms');
    }
  }
  const average = (list) => Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  out.push('average base ' + average(times.base) + ' ms, head ' + average(times.head) + ' ms, difference ' + (average(times.head) - average(times.base)) + ' ms (limit 3000 ms); round 1 (' + ROUND1 + ') ' + average(times.round1) + ' ms, round 2 adds ' + (average(times.head) - average(times.round1)) + ' ms');
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
}
out.push('scratch folder removed: ' + (existsSync(scratch) ? 'no' : 'yes'));
process.stdout.write('r2-time.mjs, platform ' + process.platform + ', node ' + process.version + ', base ' + BASE + ', round 1 ' + ROUND1 + ' and the worktree files, both run from copies outside any repo (the real-repo test skips in both)\n' + out.join('\n') + '\n');
