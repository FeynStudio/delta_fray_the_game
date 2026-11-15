import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const LEFT_OUT = ['.git', 'node_modules', 'secrets'];
const SUITE = 'checkHandoff on throw-away git repos';

const T_SAME_RULE = 'counts a name that only starts like agent-team/, a nested agent-team folder and a deleted code file as code';
const T_REPLACE = 'ignores a replace ref that hides the latest code commit';
const T_LAZY_ROW = 'gitEnv keeps the other names and always sets GIT_NO_LAZY_FETCH to 1';
const T_FORCED_ROW = 'gitEnv sets GIT_NO_LAZY_FETCH and GIT_NO_REPLACE_OBJECTS to 1 over any value or case of the name, and keeps names that only look like a removed one';
const T_GIT_DIR_LOWER = 'checkHandoff and currentBranch answer for the repo at root when a lower-case git_dir points at another repo';
const REMOVED = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX',
  'GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS',
];
const otherCases = (name) => [name.toLowerCase(), name.split('_').map((part) => part[0] + part.slice(1).toLowerCase()).join('_')];
const envTest = (name) => 'gitEnv removes ' + name + ' from the environment given to git';

const CODE_PATHS_LINE = 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE + \'*\'];';
const CONTROLS = [
  { name: 'item 2: exclude pathspec changed to the no-slash :(exclude)agent-team', find: CODE_PATHS_LINE, put: 'const CODE_PATHS = [\'.\', \':(exclude)agent-team\'];', fails: [T_SAME_RULE] },
  { name: 'item 2: exclude pathspec changed back to the round-1 :(exclude)agent-team/', find: CODE_PATHS_LINE, put: 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE];', fails: [T_SAME_RULE] },
  {
    name: 'item 3: exact-case comparison put back in gitEnv',
    find: '!removed.includes(key.toUpperCase())',
    put: '!removed.includes(key)',
    fails: [...REMOVED.flatMap(otherCases).map(envTest), T_FORCED_ROW, ...(process.platform === 'win32' ? [T_GIT_DIR_LOWER] : [])],
  },
  { name: 'item 4: GIT_NO_REPLACE_OBJECTS dropped from FORCED_ENV', find: ', GIT_NO_REPLACE_OBJECTS: \'1\' }', put: ' }', fails: [T_REPLACE, T_LAZY_ROW, T_FORCED_ROW], show: T_REPLACE },
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
  const rows = text.split('\n');
  const trimmed = rows.map((row) => row.trim());
  const count = (key) => Number((trimmed.find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  const failed = trimmed.filter((row) => row.startsWith('not ok ')).map((row) => row.slice(row.indexOf(' - ') + 3)).filter((name) => name !== SUITE);
  return { code, rows, tests: count('tests'), pass: count('pass'), fail: count('fail'), failed };
}

function diffOf(rows, name) {
  const start = rows.findIndex((row) => row.trim().startsWith('not ok ') && row.trim().endsWith(' - ' + name));
  if (start === -1) return [];
  const end = rows.findIndex((row, i) => i > start && row.trim() === '...');
  return rows.slice(start, end).map((row) => row.trim()).filter((row) => /^[+-] /.test(row) || row.startsWith('result:') || row.startsWith('reason:'));
}

const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));

function main() {
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-r2-controls-'));
  const copy = join(scratch, 'copy');
  try {
    cpSync(ROOT, copy, { recursive: true, filter: (from) => !LEFT_OUT.includes(basename(from)) && !basename(from).startsWith('.env') });
    const plain = runTests(copy);
    line('scratch copy of the worktree (without .git, node_modules, .env files and secrets folders), nothing changed: exit ' + plain.code + ', tests ' + plain.tests + ', pass ' + plain.pass + ', fail ' + plain.fail, plain.code === 0 && plain.fail === 0);
    const full = join(copy, MODULE);
    const original = readFileSync(full, 'utf8');
    for (const control of CONTROLS) {
      if (original.split(control.find).length !== 2) throw new Error('the text to change is not there exactly once: ' + control.find);
      writeFileSync(full, original.split(control.find).join(control.put));
      let result;
      try {
        result = runTests(copy);
      } finally {
        writeFileSync(full, original);
      }
      line('with ' + control.name + ': exit ' + result.code + ', tests ' + result.tests + ', pass ' + result.pass + ', fail ' + result.fail + '; failed (' + result.failed.length + '): '
        + result.failed.map((name) => '"' + name + '"').join(', '), result.code !== 0 && sameList(result.failed, control.fails));
      if (control.show) out.push('  assertion diff of "' + control.show + '" (+ actual, - expected): ' + diffOf(result.rows, control.show).join(' | '));
    }
    const restored = [MODULE, TESTS].every((file) => readFileSync(join(copy, file), 'utf8') === readFileSync(join(ROOT, file), 'utf8'));
    line('every scratch change undone (the two files in the scratch copy equal the worktree files): ' + yes(restored), restored);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  line('scratch folder removed: ' + yes(!existsSync(scratch)), !existsSync(scratch));
  out.push('all controls as expected: ' + yes(asExpected));
  process.stdout.write('r2-controls.mjs, platform ' + process.platform + ', node ' + process.version + ', module and tests as in the worktree\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(main());
