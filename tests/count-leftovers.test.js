import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { countFolders, countImage, formatCounts, parseWait } from '../scripts/count-leftovers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'count-leftovers.mjs');
const USAGE = 'usage: node scripts/count-leftovers.mjs [seconds 0-120]';
const ROW = ',"1234","Console","1","10,000 K"';
const LINES = ['"chrome.exe"' + ROW, '"msedge.exe"' + ROW, '"chrome.exe"' + ROW, '"notepad.exe"' + ROW, ''];
const CRLF = LINES.join('\r\n');
const LF = LINES.join('\n');
const WAITS = [[[], 0], [['0'], 0], [['15'], 15], [['120'], 120], [['121'], null], [['-1'], null], [['1.5'], null], [['abc'], null], [[''], null], [['1e1'], null], [['0x1'], null], [['15', '1'], null]];
const IMAGE_CASES = [
  ['a CRLF listing', CRLF, 'chrome.exe', 2],
  ['a CRLF listing', CRLF, 'msedge.exe', 1],
  ['an LF listing', LF, 'chrome.exe', 2],
  ['an LF listing', LF, 'msedge.exe', 1],
  ['the INFO line for no match', 'INFO: No tasks are running which match the specified criteria.\r\n', 'chrome.exe', 0],
  ['another case', '"Chrome.exe"' + ROW + '\r\n', 'chrome.exe', 0],
  ['a longer name', '"chrome.exe.bak"' + ROW + '\r\n', 'chrome.exe', 0],
  ['a leading blank', ' "chrome.exe"' + ROW + '\r\n', 'chrome.exe', 0],
  ['an empty string', '', 'chrome.exe', 0],
];
const LINE_15 = 'counted 1970-01-01T00:00:00.000Z after waiting 15 s: galaxy-smoke-* folders in the OS temp dir 1; chrome.exe processes 11; msedge.exe processes 0';
const LINE_NULL = 'counted 1970-01-01T00:00:00.000Z after waiting 0 s: galaxy-smoke-* folders in the OS temp dir 0; processes not counted (not Windows)';

for (const [args, want] of WAITS) {
  test('parseWait: ' + JSON.stringify(args) + ' gives ' + want, () => assert.equal(parseWait(args), want));
}

for (const [name, listing, image, want] of IMAGE_CASES) {
  test('countImage: ' + name + ' gives ' + want + ' for ' + image, () => assert.equal(countImage(listing, image), want));
}

test('countFolders: exact-case galaxy-smoke- entries, files too, give 3; an empty folder gives 0; a missing folder throws', () => {
  const base = mkdtempSync(join(resolve(tmpdir()), 'count-leftovers-test-'));
  try {
    const full = join(base, 'full');
    for (const name of ['galaxy-smoke-a', 'galaxy-smoke-b', 'Galaxy-smoke-d', 'other']) mkdirSync(join(full, name), { recursive: true });
    writeFileSync(join(full, 'galaxy-smoke-c'), 'x');
    assert.equal(countFolders(full), 3);
    mkdirSync(join(base, 'empty'));
    assert.equal(countFolders(join(base, 'empty')), 0);
    assert.throws(() => countFolders(join(base, 'missing')));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('formatCounts: the line with process counts and the line with processes null, neither holding a slash', () => {
  const counted = formatCounts({ at: new Date(0), wait: 15, folders: 1, processes: { 'chrome.exe': 11, 'msedge.exe': 0 } });
  const notCounted = formatCounts({ at: new Date(0), wait: 0, folders: 0, processes: null });
  assert.equal(counted, LINE_15);
  assert.equal(notCounted, LINE_NULL);
  for (const line of [counted, notCounted]) assert.ok(!line.includes('/') && !line.includes('\\'));
});

test('run directly with a bad argument: usage line, exit 2, empty stderr', () => {
  let failure = null;
  try {
    execFileSync(process.execPath, [SCRIPT, 'abc'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure !== null);
  assert.equal(failure.status, 2);
  assert.equal(failure.stdout, USAGE + '\n');
  assert.equal(failure.stderr, '');
});

test('import: importing the module prints nothing and starts no wait', async () => {
  const written = [];
  const write = process.stdout.write;
  const timers = () => process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
  const before = timers();
  process.stdout.write = (chunk) => written.push(chunk);
  try {
    assert.equal(typeof (await import('../scripts/count-leftovers.mjs?fresh')).parseWait, 'function');
  } finally {
    process.stdout.write = write;
  }
  assert.deepEqual(written, []);
  assert.equal(timers(), before);
});
