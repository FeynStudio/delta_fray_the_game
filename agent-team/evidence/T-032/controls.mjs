import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODE = process.argv[2];
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const GAPS = 'agent-team/evidence/T-032/gaps.mjs';
const LEFT_OUT = ['.git', 'node_modules', 'secrets'];
const SUITE = 'checkHandoff on throw-away git repos';
const RUNS = 3;
const SKIPS_AGAIN = 'Handoff names 0000000 -> SKIP (git history cannot be read)';

const T_FSMONITOR = 'does not run the fsmonitor command of the repo';
const T_SIGNATURE = 'does not run the gpg program of the repo for a signed commit and names that commit';
const T_FIRST_PARENT = 'walks first parents only, so a merged side branch that adds and removes code is not the latest code commit';
const T_PROMISOR = 'does not run the upload-pack command of a promisor remote when an object is missing';
const T_LAZY_ROW = 'gitEnv keeps the other names and always sets GIT_NO_LAZY_FETCH to 1';
const T_EDGES = 'removes U+001F and DEL from the subject and the reason, and keeps the space and U+00A0';
const T_SAME_RULE = 'counts a name that only starts like agent-team/, a nested agent-team folder and a deleted code file as code';
const T_ONLY_AGENT_TEAM = 'passes when only agent-team commits follow the code commit';
const T_AGENT_TEAM_REPO = 'skips a repo whose commits touch agent-team/ only';
const T_ROOT = 'passes when the Handoff names the code commit, here the root commit';
const T_LATER = 'fails on a code commit made after the Handoff and names that commit and its subject';
const T_MERGE = 'fails on a merge commit that brings in code until the Handoff names the merge';
const T_CONTROLS = 'removes control characters from the subject and the reason';
const T_REVIEW = 'uses brief T-900 for the task T-900-review';
const T_SECTION = 'looks for the hash in the Handoff section only';
const envTest = (name) => 'gitEnv removes ' + name + ' from the environment given to git';

const REPO_NAMES = ['GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX'];
const PATHSPEC_NAMES = ['GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS'];
const LAST_NAMES = ['GIT_PREFIX', 'GIT_ICASE_PATHSPECS'];
const nameChange = (name) => ({ find: LAST_NAMES.includes(name) ? ', \'' + name + '\'' : '\'' + name + '\', ', put: '' });

const SAFE = { find: '[...SAFE, ...args]', put: 'args' };
const SIGNATURE = { find: '\'--no-show-signature\', ', put: '' };
const FIRST_PARENT = { find: '\'--first-parent\', ', put: '' };
const UNIT_KEPT = { find: 'const LAST_C0 = 0x1f;', put: 'const LAST_C0 = 0x1e;' };
const DEL_KEPT = { find: 'const FIRST_C1 = 0x7f;', put: 'const FIRST_C1 = 0x80;' };
const SPACE_REMOVED = { find: 'const LAST_C0 = 0x1f;', put: 'const LAST_C0 = 0x20;' };
const NBSP_REMOVED = { find: 'const LAST_C1 = 0x9f;', put: 'const LAST_C1 = 0xa0;' };
const LAZY = { find: ', GIT_NO_LAZY_FETCH: \'1\' }', put: ' }' };
const WALK = {
  find: '      if (touchesCode(root, parent ? [parent, commit] : [\'--root\', commit])) return commit;\n',
  put: '      const range = parent ? [parent, commit] : [\'--root\', commit];\n'
    + '      const names = git(root, [\'diff-tree\', \'--no-commit-id\', \'--name-only\', \'-r\', \'-z\', ...range]).split(\'\\0\').filter(Boolean);\n'
    + '      if (names.some((name) => !name.startsWith(NOT_CODE))) return commit;\n',
};
const NO_EXCLUDE = { find: 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE];', put: 'const CODE_PATHS = [\'.\'];' };
const WIDE_EXCLUDE = { find: 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE];', put: 'const CODE_PATHS = [\'.\', \':(exclude)agent-team*\'];' };

const BEFORE = [
  { name: '`SAFE` dropped from the helper', change: SAFE, fails: [] },
  { name: '`--no-show-signature` dropped', change: SIGNATURE, fails: [] },
  { name: '`--first-parent` dropped', change: FIRST_PARENT, fails: [] },
  ...REPO_NAMES.map((name) => ({ name: name + ' dropped from REPO_ENV', change: nameChange(name), fails: [] })),
  { name: 'U+001F kept by `clean`', change: UNIT_KEPT, fails: [] },
  { name: 'DEL kept by `clean`', change: DEL_KEPT, fails: [] },
];
const SPACE_FAILS = [T_EDGES, T_ROOT, T_LATER, T_MERGE, T_CONTROLS, T_SIGNATURE, T_FIRST_PARENT];
const NO_EXCLUDE_FAILS = [T_ROOT, T_ONLY_AGENT_TEAM, T_MERGE, T_REVIEW, T_SECTION, T_AGENT_TEAM_REPO, T_FIRST_PARENT];
const AFTER = [
  { name: '`SAFE` dropped from the helper', change: SAFE, fails: [T_FSMONITOR] },
  { name: '`--no-show-signature` dropped', change: SIGNATURE, fails: [T_SIGNATURE] },
  ...Array.from({ length: RUNS }, (_, i) => ({ name: '`--first-parent` dropped, run ' + (i + 1) + ' of ' + RUNS, change: FIRST_PARENT, fails: [T_FIRST_PARENT] })),
  { name: 'GIT_NO_LAZY_FETCH taken out of the builder', change: LAZY, fails: [T_PROMISOR, T_LAZY_ROW] },
  ...[...REPO_NAMES, ...PATHSPEC_NAMES].map((name) => ({ name: name + ' dropped from the list of removed names', change: nameChange(name), fails: [envTest(name)] })),
  { name: 'U+001F kept by `clean`', change: UNIT_KEPT, fails: [T_EDGES] },
  { name: 'DEL kept by `clean`', change: DEL_KEPT, fails: [T_EDGES] },
  { name: 'the cleaned range widened at the low end (U+0020 removed)', change: SPACE_REMOVED, fails: SPACE_FAILS },
  { name: 'the cleaned range widened at the high end (U+00A0 removed)', change: NBSP_REMOVED, fails: [T_EDGES] },
  { name: 'the walk put back to reading the name list as on BASE', change: WALK, fails: [] },
  { name: 'the exclude pathspec dropped', change: NO_EXCLUDE, fails: NO_EXCLUDE_FAILS },
  { name: 'the exclude pathspec changed to `:(exclude)agent-team*`', change: WIDE_EXCLUDE, fails: [T_SAME_RULE] },
];

const out = [];
let asExpected = true;
const yes = (flag) => (flag ? 'yes' : 'no');

function line(text, ok) {
  if (!ok) asExpected = false;
  out.push(text + ' [as expected: ' + yes(ok) + ']');
}

function run(copy, args) {
  try {
    return { code: 0, text: execFileSync(process.execPath, args, { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) };
  } catch (error) {
    return { code: error.status, text: String(error.stdout) };
  }
}

function runTests(copy) {
  const { code, text } = run(copy, ['--test', '--test-reporter=tap', TESTS]);
  const rows = text.split('\n').map((row) => row.trim());
  const count = (key) => Number((rows.find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  const failed = rows.filter((row) => row.startsWith('not ok ')).map((row) => row.slice(row.indexOf(' - ') + 3)).filter((name) => name !== SUITE);
  return { code, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'), failed };
}

const summary = (r) => 'exit ' + r.code + ', tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped
  + (r.failed.length > 0 ? ', failed: ' + r.failed.map((name) => '"' + name + '"').join(', ') : '');
const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const asListed = (r, fails) => (fails.length === 0 ? r.code === 0 && r.fail === 0 : r.code !== 0 && sameList(r.failed, fails));

function changed(copy, change, action) {
  const full = join(copy, MODULE);
  const original = readFileSync(full, 'utf8');
  if (original.split(change.find).length !== 2) throw new Error('the text to change is not there exactly once: ' + change.find);
  writeFileSync(full, original.split(change.find).join(change.put));
  try {
    return action();
  } finally {
    writeFileSync(full, original);
  }
}

function gapsRows(copy, change, cases, prefix) {
  const result = changed(copy, change, () => run(copy, [GAPS, 'after', cases]));
  return { code: result.code, rows: result.text.split('\n').filter((text) => text.startsWith(prefix)) };
}

function main() {
  if (MODE !== 'before' && MODE !== 'after') {
    process.stdout.write('usage: node agent-team/evidence/T-032/controls.mjs before|after\n');
    return 2;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-scratch-'));
  const copy = join(scratch, 'copy');
  try {
    cpSync(ROOT, copy, { recursive: true, filter: (from) => !LEFT_OUT.includes(basename(from)) && !basename(from).startsWith('.env') });
    const plain = runTests(copy);
    line('scratch copy of the worktree in the OS temp dir (without .git, node_modules, .env files and secrets folders), nothing changed: ' + summary(plain), asListed(plain, []));
    for (const { name, change, fails } of MODE === 'before' ? BEFORE : AFTER) {
      const result = changed(copy, change, () => runTests(copy));
      line('with ' + name + ': ' + summary(result), asListed(result, fails));
    }
    if (MODE === 'after') {
      const lazy = gapsRows(copy, LAZY, '1', '1. ');
      line('with GIT_NO_LAZY_FETCH taken out of the builder, gaps.mjs after 1: exit ' + lazy.code + '; ' + lazy.rows.join(' '),
        lazy.code === 1 && lazy.rows.length === 1 && lazy.rows[0].includes('one checkHandoff call -> SKIP (git history cannot be read), marker created by the call: yes'));
      const walk = gapsRows(copy, WALK, '4', '4. ');
      line('with the walk put back to reading the name list as on BASE, gaps.mjs after 4: exit ' + walk.code + '; ' + walk.rows.join(' '),
        walk.code === 1 && walk.rows.length === 2 && walk.rows.every((row) => row.includes(SKIPS_AGAIN)));
      out.push('row 5 (the PATH restore) has no negative control: the state "PATH unset at the start" cannot be made inside the test file without breaking the fixture tests; it is shown by reading in self-check.txt');
    }
    const restored = [MODULE, TESTS].every((file) => readFileSync(join(copy, file), 'utf8') === readFileSync(join(ROOT, file), 'utf8'));
    line('every scratch change undone (the two files in the scratch copy equal the worktree files): ' + yes(restored), restored);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  line('scratch folder removed: ' + yes(!existsSync(scratch)), !existsSync(scratch));
  out.push('all controls as expected for ' + MODE + ': ' + yes(asExpected));
  process.stdout.write('controls.mjs ' + MODE + ', platform ' + process.platform + ', node ' + process.version + '\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(main());
