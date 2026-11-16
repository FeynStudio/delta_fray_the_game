import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = '5c90a51';
const HEAD = process.argv[2];
const PART = process.argv[3];
const MODULE = 'scripts/handoff-check.mjs';
const FILES = [MODULE, 'tests/handoff-check.test.js', 'package.json'];
const show = (ref, file) => execFileSync('git', ['show', ref + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true });

function results(dir) {
  let text;
  try {
    text = execFileSync(process.execPath, ['--test', '--test-reporter=tap', FILES[1]], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    text = String(error.stdout);
  }
  const rows = text.split('\n').map((row) => row.trim()).filter((row) => /^(not )?ok \d+ - /.test(row));
  return new Map(rows.map((row) => [row.slice(row.indexOf(' - ') + 3).replace(/ # SKIP.*$/, ''), row.startsWith('ok ') ? (row.includes(' # SKIP') ? 'skipped' : 'pass') : 'fail']));
}

function wording(text) {
  return text.split('\n').filter((row) => row.includes('skip(') || row.includes('const skip') || row.includes('result: ') || row.includes('TITLE') || row.includes('PLACEHOLDER') || row.includes('lines: ['));
}

const out = [];
if (PART === 'names') {
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t035-names-'));
  try {
    for (const [side, ref] of [['base', BASE], ['head', HEAD]]) {
      for (const file of FILES) {
        mkdirSync(dirname(join(scratch, side, file)), { recursive: true });
        writeFileSync(join(scratch, side, file), show(ref, file));
      }
    }
    const before = results(join(scratch, 'base'));
    const after = results(join(scratch, 'head'));
    out.push('test names of tests/handoff-check.test.js, base ' + BASE + ' (' + before.size + ' entries) and head ' + HEAD + ' (' + after.size + ' entries), both run from exports outside any repo, so the real-repo test skips in both');
    let ok = true;
    for (const [name, state] of before) {
      const now = after.get(name);
      if (now === undefined || now === 'fail' || (state === 'pass' && now !== 'pass')) ok = false;
      out.push('before ' + state + ', head ' + (now === undefined ? 'MISSING' : now) + ': ' + name);
    }
    for (const [name, state] of after) if (!before.has(name)) out.push('new, head ' + state + ': ' + name);
    out.push('every base test name is still there and passes as before: ' + (ok ? 'yes' : 'no'));
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  out.push('scratch folder removed: ' + (existsSync(scratch) ? 'no' : 'yes'));
} else {
  const before = wording(show(BASE, MODULE));
  const after = wording(show(HEAD, MODULE));
  out.push('SKIP reasons, results and output wording in ' + MODULE + ' (lines with skip(, result:, TITLE, PLACEHOLDER or lines: [), base ' + BASE + ' and head ' + HEAD);
  out.push(...after.map((row) => '  ' + row.trim()));
  const same = before.length === after.length && before.every((row, i) => row === after[i]);
  out.push('the same ' + before.length + ' lines in base and head, unchanged: ' + (same ? 'yes' : 'no'));
  out.push('git diff of the module between base and head touches only the FORCED_ENV line: ' + (execFileSync('git', ['diff', '-U0', BASE, HEAD, '--', MODULE], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).split('\n').filter((row) => /^[+-][^+-]/.test(row)).every((row) => row.includes('const FORCED_ENV')) ? 'yes' : 'no'));
}
process.stdout.write('names.mjs ' + PART + ', platform ' + process.platform + ', node ' + process.version + '\n' + out.join('\n') + '\n');
