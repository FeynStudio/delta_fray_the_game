import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const GRAPH = 'agent-team/evidence/T-034/graph.mjs';
const LEFT_OUT = ['.git', 'node_modules', 'secrets'];
const SUITE = 'checkHandoff on throw-away git repos';
const T_GRAPH = 'ignores a forged commit-graph file or chain that hides the latest code commit';
const SAFE_LINE = 'const SAFE = [\'-c\', \'core.fsmonitor=false\', \'-c\', \'core.commitGraph=false\'];';

const CONTROLS = [
  { name: '\'-c\', \'core.commitGraph=false\' removed from SAFE', file: MODULE, find: SAFE_LINE, put: 'const SAFE = [\'-c\', \'core.fsmonitor=false\'];', fails: [T_GRAPH], graph: true },
  { name: 'SAFE value set to core.commitGraph=true', file: MODULE, find: SAFE_LINE, put: 'const SAFE = [\'-c\', \'core.fsmonitor=false\', \'-c\', \'core.commitGraph=true\'];', fails: [T_GRAPH], graph: true },
  { name: 'the new test forges the single file with the true parent C (dead fixture for case (i))', file: TESTS, find: 'writeFileSync(graph, forge(graph, notes, handoff));', put: 'writeFileSync(graph, forge(graph, notes, revert));', fails: [T_GRAPH], message: 'plain git does not follow the forged commit-graph file' },
  { name: 'the new test skips the forge step of the single file', file: TESTS, find: 'writeFileSync(graph, forge(graph, notes, handoff));', put: '', fails: [T_GRAPH], message: 'plain git does not follow the forged commit-graph file' },
  { name: 'the new test forges the chain layer with the true parent C (dead fixture for case (ii))', file: TESTS, find: 'forge(layer(readFileSync(layer(), \'utf8\').trim()), notes, handoff)', put: 'forge(layer(readFileSync(layer(), \'utf8\').trim()), notes, revert)', fails: [T_GRAPH], message: 'plain git does not follow the forged commit-graph chain' },
];

const out = [];
let asExpected = true;
const yes = (flag) => (flag ? 'yes' : 'no');

function line(text, ok) {
  if (!ok) asExpected = false;
  out.push(text + ' [as expected: ' + yes(ok) + ']');
}

function runTests(copy) {
  let code = 0;
  let text;
  try {
    text = execFileSync(process.execPath, ['--test', '--test-reporter=tap', TESTS], { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    code = error.status;
    text = String(error.stdout);
  }
  const rows = text.split('\n').map((row) => row.trim());
  const count = (key) => Number((rows.find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  const failed = rows.filter((row) => row.startsWith('not ok ')).map((row) => row.slice(row.indexOf(' - ') + 3)).filter((name) => name !== SUITE);
  const messages = rows.flatMap((row, at) => (row.startsWith('error: ') && row !== 'error: \'1 subtest failed\'' ? [row === 'error: |-' ? rows[at + 1] : row.slice(7)] : []));
  return { code, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'), failed, messages };
}

function graph(copy) {
  const text = execFileSync(process.execPath, [GRAPH, 'worktree', 'graph'], { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return text.split('\n').filter((row) => row.includes('checkHandoff') || row.startsWith('case (') || row.startsWith('module ')).map((row) => '    ' + row.trim());
}

const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const summary = (r) => 'exit ' + r.code + ', tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped;

function main() {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim() === '';
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t034-controls-'));
  const copy = join(scratch, 'copy');
  const files = [MODULE, TESTS];
  try {
    cpSync(ROOT, copy, { recursive: true, filter: (from) => !LEFT_OUT.includes(basename(from)) && !basename(from).startsWith('.env') });
    const plain = runTests(copy);
    line('scratch copy of the worktree (without .git, node_modules, .env files and secrets folders), nothing changed: ' + summary(plain), plain.code === 0 && plain.fail === 0);
    const originals = Object.fromEntries(files.map((file) => [file, readFileSync(join(copy, file), 'utf8')]));
    for (const control of CONTROLS) {
      const full = join(copy, control.file);
      const original = originals[control.file];
      if (original.split(control.find).length !== 2) throw new Error('the text to change is not there exactly once: ' + control.find);
      writeFileSync(full, original.split(control.find).join(control.put));
      let result;
      let shown = [];
      try {
        result = runTests(copy);
        if (control.graph) shown = graph(copy);
      } finally {
        writeFileSync(full, original);
      }
      const listed = result.failed.length === 0 ? 'none' : result.failed.map((name) => '"' + name + '"').join(', ');
      const messageOk = !control.message || result.messages.some((text) => text.includes(control.message));
      const ok = sameList(result.failed, control.fails) && result.code !== 0 && messageOk;
      line('with ' + control.name + ' (' + control.file + '): ' + summary(result) + '; failed tests (' + result.failed.length + '): ' + listed + '; failure messages: ' + (result.messages.join(' | ') || 'none'), ok);
      if (control.graph) out.push('  graph.mjs worktree graph on this scratch copy:');
      out.push(...shown);
    }
    const restored = files.every((file) => readFileSync(join(copy, file), 'utf8') === readFileSync(join(ROOT, file), 'utf8'));
    line('every scratch change undone (the two files in the scratch copy equal the worktree files): ' + yes(restored), restored);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  line('scratch folder removed: ' + yes(!existsSync(scratch)), !existsSync(scratch));
  out.push('all as expected: ' + yes(asExpected));
  process.stdout.write('controls.mjs, platform ' + process.platform + ', node ' + process.version + ', worktree at ' + head + ', git status --porcelain empty at the start: ' + yes(clean) + '\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(main());
