import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODE = process.argv[2];
const BASE = 'bf8eaaa';
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const GAPS = 'agent-team/evidence/T-029/gaps.mjs';
const LEFT_OUT = ['.git', 'node_modules'];
const SUITE = 'checkHandoff on throw-away git repos';

const FILTER = { find: '.filter(([key]) => !REPO_ENV.includes(key))', put: '' };
const TOP = {
  find: 'if (git(root, [\'rev-parse\', \'--show-prefix\']).trim() !== \'\') return skip(\'not the top folder of a git repo\');',
  put: 'git(root, [\'rev-parse\', \'--show-prefix\']);',
};
const NO_CODE = { find: '    if (commit === null) return skip(\'no commit touches a path outside agent-team/\');\n', put: '' };
const HISTORY = { find: '    stage = \'git history cannot be read\';\n', put: '' };
const PAGED = { find: '\'-n\', String(PAGE), \'--skip=\' + done, \'HEAD\'', put: '\'HEAD\'' };
const CLEANED = { find: 'clean(git(root, [\'log\', \'-1\', \'--no-show-signature\', \'--format=%s\', commit]))', put: 'git(root, [\'log\', \'-1\', \'--no-show-signature\', \'--format=%s\', commit])' };

const BEFORE = [
  { name: 'the REPO_ENV filter removed', change: FILTER, fails: [] },
  { name: 'the SKIP branch \'not the top folder of a git repo\' removed', change: TOP, fails: [] },
  { name: 'the SKIP branch \'no commit touches a path outside agent-team/\' removed', change: NO_CODE, fails: [] },
  { name: 'the SKIP branch \'git history cannot be read\' removed (the stage line)', change: HISTORY, fails: [] },
];
const AFTER = [
  { name: 'the REPO_ENV filter removed', change: FILTER, fails: ['checkHandoff and currentBranch answer for the repo at root when GIT_DIR and GIT_WORK_TREE point at another repo'] },
  { name: 'the SKIP branch \'not the top folder of a git repo\' removed', change: TOP, fails: ['skips a subfolder of a git repo'] },
  { name: 'the SKIP branch \'no commit touches a path outside agent-team/\' removed', change: NO_CODE, fails: ['skips a repo whose commits touch agent-team/ only'] },
  { name: 'the SKIP branch \'git history cannot be read\' removed (the stage line)', change: HISTORY, fails: ['skips a repo that has no commit yet'] },
  { name: 'the cleaning of Fix E removed', change: CLEANED, fails: ['removes control characters from the subject and the reason'] },
];

const out = [];
let asExpected = true;
const yes = (flag) => (flag ? 'yes' : 'no');

function line(text, ok) {
  if (!ok) asExpected = false;
  out.push(text + ' [as expected: ' + yes(ok) + ']');
}

function run(copy, args, extra) {
  const env = { ...process.env, ...extra };
  try {
    return { code: 0, text: execFileSync(process.execPath, args, { cwd: copy, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) };
  } catch (error) {
    return { code: error.status, text: String(error.stdout) };
  }
}

function runTests(copy, extra) {
  const { code, text } = run(copy, ['--test', '--test-reporter=tap', TESTS], extra);
  const rows = text.split('\n').map((row) => row.trim());
  const count = (key) => Number((rows.find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  const failed = rows.filter((row) => row.startsWith('not ok ')).map((row) => row.slice(row.indexOf(' - ') + 3)).filter((name) => name !== SUITE);
  return { code, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'), failed };
}

const summary = (r) => 'exit ' + r.code + ', tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped
  + (r.failed.length > 0 ? ', failed: ' + r.failed.map((name) => '"' + name + '"').join(', ') : '');
const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const asListed = (r, fails) => (fails.length === 0 ? r.code === 0 && r.fail === 0 : r.code !== 0 && sameList(r.failed, fails));

function changed(copy, file, change, action) {
  const full = join(copy, file);
  const original = readFileSync(full, 'utf8');
  if (original.split(change.find).length !== 2) throw new Error('the text to change is not there exactly once: ' + change.find);
  writeFileSync(full, original.split(change.find).join(change.put));
  try {
    return action();
  } finally {
    writeFileSync(full, original);
  }
}

function tempInsideRepo(scratch, copy) {
  const repo = join(scratch, 'outer-repo');
  const inner = join(repo, 'temp');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = join(scratch, 'gitconfig');
  env.GIT_CONFIG_NOSYSTEM = '1';
  mkdirSync(inner, { recursive: true });
  writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  execFileSync('git', ['init', '-q'], { cwd: repo, env, stdio: 'ignore', windowsHide: true });
  const temp = { TEMP: inner, TMP: inner, TMPDIR: inner };
  const head = 'temp dir (TEMP, TMP and TMPDIR for the one run) pointed at a folder inside a throw-away git repo';
  const committed = runTests(copy, temp);
  line(head + ', the committed test file: ' + summary(committed), asListed(committed, []));
  const baseText = execFileSync('git', ['show', BASE + ':' + TESTS], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const full = join(copy, TESTS);
  const original = readFileSync(full, 'utf8');
  writeFileSync(full, baseText);
  try {
    const old = runTests(copy, temp);
    line(head + ', the test file as it is on BASE ' + BASE + ': ' + summary(old), asListed(old, ['skips a folder that is not a git repo']));
  } finally {
    writeFileSync(full, original);
  }
}

function main() {
  if (MODE !== 'before' && MODE !== 'after') {
    process.stdout.write('usage: node agent-team/evidence/T-029/controls.mjs before|after\n');
    return 2;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-scratch-'));
  const copy = join(scratch, 'copy');
  try {
    cpSync(ROOT, copy, { recursive: true, filter: (from) => !LEFT_OUT.includes(basename(from)) });
    const plain = runTests(copy);
    line('scratch copy of the worktree in the OS temp dir, nothing changed: ' + summary(plain), asListed(plain, []));
    for (const { name, change, fails } of MODE === 'before' ? BEFORE : AFTER) {
      const result = changed(copy, MODULE, change, () => runTests(copy));
      line('with ' + name + ': ' + summary(result), asListed(result, fails));
    }
    if (MODE === 'after') {
      const gaps = changed(copy, MODULE, PAGED, () => run(copy, [GAPS, 'after', 'a']));
      const row = gaps.text.split('\n').find((text) => text.startsWith('a. ')) || '(no line for case a)';
      line('with Fix A removed (one unpaged rev-list call), gaps.mjs after a: exit ' + gaps.code + '; ' + row, gaps.code === 1 && row.includes('Handoff names 0000000 -> SKIP (git history cannot be read)'));
      tempInsideRepo(scratch, copy);
    }
    const restored = [MODULE, TESTS].every((file) => readFileSync(join(copy, file), 'utf8') === readFileSync(join(ROOT, file), 'utf8'));
    line('every scratch change undone (the two files in the scratch copy equal the worktree files): ' + yes(restored), restored);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  line('scratch folder removed: ' + yes(!existsSync(scratch)), !existsSync(scratch));
  out.push('all controls as expected for ' + MODE + ': ' + yes(asExpected));
  process.stdout.write('controls.mjs ' + MODE + '\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(main());
