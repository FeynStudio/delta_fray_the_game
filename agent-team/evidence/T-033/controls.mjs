import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = '8042468';
const MODE = process.argv[2];
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const GAPS = 'agent-team/evidence/T-033/gaps.mjs';
const LEFT_OUT = ['.git', 'node_modules', 'secrets'];
const SUITE = 'checkHandoff on throw-away git repos';

const T_SAME_RULE = 'counts a name that only starts like agent-team/, a nested agent-team folder and a deleted code file as code';
const T_OLD_EDGE = 'removes U+001F and DEL from the subject and the reason, and keeps the space and U+00A0';
const T_NEW_EDGE = 'keeps U+007E and removes U+009F in the subject and the reason';
const T_GRAFT = 'ignores a graft in .git/info/grafts or in GIT_GRAFT_FILE that hides the latest code commit';
const T_LAZY_ROW = 'gitEnv keeps the other names and always sets GIT_NO_LAZY_FETCH to 1';
const T_FORCED_ROW = 'gitEnv sets GIT_NO_LAZY_FETCH and GIT_NO_REPLACE_OBJECTS to 1 over any value or case of the name, and keeps names that only look like a removed one';
const GRAFT_ROWS = ['GIT_GRAFT_FILE', 'git_graft_file', 'Git_Graft_File'].map((name) => 'gitEnv sets ' + name + ' to a file that cannot exist over any value');

const CODE_PATHS_LINE = 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE + \'*\'];';
const ICASE_LINE = 'const CODE_PATHS = [\'.\', \':(exclude,icase)\' + NOT_CODE + \'*\'];';
const FORCED_LINE = 'const FORCED_ENV = { GIT_NO_LAZY_FETCH: \'1\', GIT_NO_REPLACE_OBJECTS: \'1\', GIT_GRAFT_FILE: join(fileURLToPath(import.meta.url), \'none\') };';
const icase = { name: 'CODE_PATHS with :(exclude,icase)', file: MODULE, find: CODE_PATHS_LINE, put: ICASE_LINE };
const firstC1 = (value) => ({ name: 'FIRST_C1 = ' + value, file: MODULE, find: 'const FIRST_C1 = 0x7f;', put: 'const FIRST_C1 = ' + value + ';' });
const lastC1 = (value) => ({ name: 'LAST_C1 = ' + value, file: MODULE, find: 'const LAST_C1 = 0x9f;', put: 'const LAST_C1 = ' + value + ';' });

const BEFORE = [
  { ...icase, fails: [] },
  { ...firstC1('0x7e'), fails: [] },
  { ...lastC1('0x9e'), fails: [] },
];

const AFTER = [
  {
    name: 'GIT_GRAFT_FILE removed from FORCED_ENV', file: MODULE, find: FORCED_LINE, put: 'const FORCED_ENV = { GIT_NO_LAZY_FETCH: \'1\', GIT_NO_REPLACE_OBJECTS: \'1\' };',
    fails: [T_GRAFT, T_LAZY_ROW, T_FORCED_ROW, ...GRAFT_ROWS], gaps: 'grafts',
  },
  {
    name: 'GIT_GRAFT_FILE in FORCED_ENV set to the relative value .git/info/grafts', file: MODULE, find: FORCED_LINE, put: 'const FORCED_ENV = { GIT_NO_LAZY_FETCH: \'1\', GIT_NO_REPLACE_OBJECTS: \'1\', GIT_GRAFT_FILE: \'.git/info/grafts\' };',
    fails: [T_GRAFT, T_LAZY_ROW, T_FORCED_ROW, ...GRAFT_ROWS], gaps: 'grafts',
  },
  { name: 'inRepo filter put back to exact case', file: TESTS, find: '!key.toUpperCase().startsWith(\'GIT_\')', put: '!key.startsWith(\'GIT_\')', fails: [], gaps: 'reach' },
  { ...icase, fails: [T_SAME_RULE] },
  { ...firstC1('0x7e'), fails: [T_NEW_EDGE] },
  { ...lastC1('0x9e'), fails: [T_NEW_EDGE] },
  { ...firstC1('0x80'), fails: [T_OLD_EDGE] },
  { ...lastC1('0xa0'), fails: [T_OLD_EDGE] },
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
  return { code, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'), failed };
}

function gaps(copy, part) {
  const text = execFileSync(process.execPath, [GAPS, 'head', part], { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return text.trim().split('\n').filter((row) => !row.startsWith('failed (')).map((row) => '    ' + row);
}

const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const summary = (r) => 'exit ' + r.code + ', tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped;

function main() {
  if (MODE !== 'before' && MODE !== 'after') throw new Error('use before or after');
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t033-controls-'));
  const copy = join(scratch, 'copy');
  const files = [MODULE, TESTS];
  try {
    cpSync(ROOT, copy, { recursive: true, filter: (from) => !LEFT_OUT.includes(basename(from)) && !basename(from).startsWith('.env') });
    if (MODE === 'before') {
      const same = files.every((file) => readFileSync(join(copy, file), 'utf8') === execFileSync('git', ['show', BASE + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));
      line('the two files in the scratch copy equal BASE ' + BASE + ': ' + yes(same), same);
    }
    const plain = runTests(copy);
    line('scratch copy of the worktree (without .git, node_modules, .env files and secrets folders), nothing changed: ' + summary(plain), plain.code === 0 && plain.fail === 0);
    const originals = Object.fromEntries(files.map((file) => [file, readFileSync(join(copy, file), 'utf8')]));
    for (const control of MODE === 'before' ? BEFORE : AFTER) {
      const full = join(copy, control.file);
      const original = originals[control.file];
      if (original.split(control.find).length !== 2) throw new Error('the text to change is not there exactly once: ' + control.find);
      writeFileSync(full, original.split(control.find).join(control.put));
      let result;
      let shown = [];
      try {
        result = runTests(copy);
        if (control.gaps) shown = gaps(copy, control.gaps);
      } finally {
        writeFileSync(full, original);
      }
      const listed = result.failed.length === 0 ? 'none' : result.failed.map((name) => '"' + name + '"').join(', ');
      const ok = MODE === 'before' ? result.code === 0 && result.fail === 0 : sameList(result.failed, control.fails) && (control.fails.length === 0 ? result.code === 0 : result.code !== 0);
      line('with ' + control.name + ' (' + control.file + '): ' + summary(result) + '; failed tests (' + result.failed.length + '): ' + listed, ok);
      if (control.gaps === 'reach') out.push('  no unit test pins the inRepo filter; the throw-away repo run of after-gaps 3b on this scratch copy:');
      if (control.gaps === 'grafts') out.push('  the graft fixture of after-gaps 3a on this scratch copy:');
      out.push(...shown);
    }
    const restored = files.every((file) => readFileSync(join(copy, file), 'utf8') === readFileSync(join(ROOT, file), 'utf8'));
    line('every scratch change undone (the two files in the scratch copy equal the worktree files): ' + yes(restored), restored);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  line('scratch folder removed: ' + yes(!existsSync(scratch)), !existsSync(scratch));
  out.push('all as expected: ' + yes(asExpected));
  process.stdout.write('controls.mjs ' + MODE + ', platform ' + process.platform + ', node ' + process.version + ', module and tests as in the worktree\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(main());
