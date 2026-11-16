import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const GRAPH = 'agent-team/evidence/T-035/graph.mjs';
const LEFT_OUT = ['.git', 'node_modules', 'secrets'];
const SUITE = 'checkHandoff on throw-away git repos';
const T_GRAPH = 'ignores a forged commit-graph file or chain that hides the latest code commit';
const VARIANTS = (name) => [name, name.toLowerCase(), name.split('_').map((part) => part[0] + part.slice(1).toLowerCase()).join('_')];
const T_TABLE = VARIANTS('GIT_TEST_COMMIT_GRAPH').map((name) => 'gitEnv sets ' + name + ' to 0 over any value');
const T_GRAFT_TABLE = VARIANTS('GIT_GRAFT_FILE').map((name) => 'gitEnv sets ' + name + ' to a file that cannot exist over any value');
const T_KEEPS = 'gitEnv keeps the other names and always sets GIT_NO_LAZY_FETCH to 1';
const T_FORCED = 'gitEnv sets GIT_NO_LAZY_FETCH and GIT_NO_REPLACE_OBJECTS to 1 over any value or case of the name, and keeps names that only look like a removed one';
const ENTRY = ', GIT_TEST_COMMIT_GRAPH: \'0\' };';
const FORCED_SET = [T_GRAPH, ...T_GRAFT_TABLE, ...T_TABLE, T_KEEPS, T_FORCED];

const CONTROLS = [
  { name: 'the GIT_TEST_COMMIT_GRAPH: \'0\' entry removed from FORCED_ENV', file: MODULE, find: ENTRY, put: ' };', fails: FORCED_SET, graph: true },
  { name: 'the FORCED_ENV value set to \'1\'', file: MODULE, find: ENTRY, put: ', GIT_TEST_COMMIT_GRAPH: \'1\' };', fails: FORCED_SET, graph: true },
  { name: 'the liveness step runs without the variable (repo.env[name] = \'1\' removed)', file: TESTS, find: '        repo.env[name] = \'1\';\n', put: '', fails: [T_GRAPH], message: 'plain git does not follow the forged commit-graph under GIT_TEST_COMMIT_GRAPH=1' },
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
  const text = execFileSync(process.execPath, [GRAPH, 'worktree'], { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return text.split('\n').filter((row) => row.includes('=1:') || row.includes('=true:') || row.includes('=yes:') || row.startsWith('summary') || row.startsWith('module ')).map((row) => '    ' + row.trim());
}

const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const summary = (r) => 'exit ' + r.code + ', tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped;

function main() {
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim() === '';
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t035-controls-'));
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
      if (control.graph) out.push('  graph.mjs worktree on this scratch copy (after-test-graph cases):');
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
