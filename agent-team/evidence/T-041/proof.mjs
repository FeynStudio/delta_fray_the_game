import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { findHomePaths } from '../../../scripts/home-paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const EVIDENCE = join(ROOT, 'agent-team', 'evidence', 'T-041');
const SCAN = join(EVIDENCE, 'scan-root.mjs');
const MODULE = 'scripts/home-paths.mjs';
const TEST = 'tests/home-paths.test.js';
const SCRATCH = 'T-041-scratch.txt';
const FAKE = 'someone';
const BS = '\\';
const FIXTURES = {
  windows: 'see C:' + BS + 'Users' + BS + FAKE + BS + 'notes.txt',
  'drive-mount': 'cd /c/Users/' + FAKE + '/notes',
  home: 'cd /home/' + FAKE,
};
const MESSAGE = 'GUARD FAIL [no-home-paths]: Replace the home-directory path with a placeholder such as <OS temp dir> or <user>; never commit an account name';
const REAL_TREE = 'no file in this repo holds a home-directory path';
const CLI = 'run directly, the checker is silent with exit 0 on a clean tree and prints the report with exit 1 on a hit';
const STEP = process.argv[2];

const real = (path) => (existsSync(path) ? realpathSync.native(path) : path);
function forms(path) {
  const fwd = path.split(BS).join('/');
  const list = [path, fwd, path.split(BS).join(BS + BS), encodeURI(fwd)];
  if (fwd[1] === ':') list.push('/' + fwd[0] + fwd.slice(2));
  return list;
}
const HIDE = [
  ...[ROOT, real(ROOT)].flatMap(forms).map((form) => [form, '<worktree>']),
  ...[tmpdir(), real(tmpdir())].flatMap(forms).map((form) => [form, '<OS temp dir>']),
  ...[homedir(), real(homedir())].flatMap(forms).map((form) => [form, '<home>']),
  [userInfo().username, '<user>'],
].sort((a, b) => b[0].length - a[0].length);

function swap(text, form, mark) {
  const lower = text.toLowerCase();
  const want = form.toLowerCase();
  let out = '';
  let from = 0;
  for (let at = lower.indexOf(want); at !== -1; at = lower.indexOf(want, from)) {
    out += text.slice(from, at) + mark;
    from = at + want.length;
  }
  return out + text.slice(from);
}

const scrub = (text) => HIDE.reduce((acc, [form, mark]) => swap(acc, form, mark), String(text));
const out = [];
const say = (line) => out.push(scrub(line));
function save(name) {
  const text = out.join('\n') + '\n';
  const left = findHomePaths(text).map((hit) => hit.line);
  if (left.length > 0 || text.includes(FAKE)) throw new Error('not saved: a home path or the fake name is left at lines ' + left.join(','));
  writeFileSync(join(EVIDENCE, name), text);
}

const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CEILING_DIRECTORIES: dirname(tmpdir()) };

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const lines = (text) => text.split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line !== '');
const head = () => run('git', ['rev-parse', '--short', 'HEAD'], ROOT).stdout.trim();

function withBase(work) {
  const base = mkdtempSync(join(tmpdir(), 't041-'));
  try {
    return work(base);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
  }
}

function copyTree(base, name) {
  const dir = join(base, name);
  mkdirSync(dir);
  const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: ROOT, env, maxBuffer: 1 << 28, windowsHide: true });
  const unpack = spawnSync('tar', ['-xf', '-'], { cwd: dir, input: archive.stdout, windowsHide: true });
  if (archive.status !== 0 || unpack.status !== 0) throw new Error('copy failed: git archive exit ' + archive.status + ', tar exit ' + unpack.status);
  return dir;
}

function tap(dir) {
  const r = run(process.execPath, ['--test', '--test-reporter=tap', TEST], dir);
  const tests = lines(r.stdout).map((line) => line.match(/^(not ok|ok) \d+ - (.*)$/)).filter(Boolean).map((m) => ({ ok: m[1] === 'ok', name: m[2].split('\\#').join('#') }));
  const count = (key) => (lines(r.stdout).find((line) => line.startsWith('# ' + key + ' ')) || '').split(' ')[2];
  return { code: r.code, stdout: r.stdout, tests, failed: tests.filter((t) => !t.ok).map((t) => t.name), summary: 'tests ' + count('tests') + ', pass ' + count('pass') + ', fail ' + count('fail') + ', exit ' + r.code };
}

function sayTap(label, result) {
  say(label + ': ' + result.summary);
  for (const name of result.failed) say('  failed: ' + name);
}

function append(dir, file, text) {
  const full = join(dir, file);
  const before = readFileSync(full);
  const body = before.toString('utf8');
  const gap = body.endsWith('\n') ? '' : '\n';
  appendFileSync(full, gap + text + '\n');
  return { before, line: (body + gap).split('\n').length };
}

function edit(dir, file, from, to) {
  const full = join(dir, file);
  const text = readFileSync(full, 'utf8');
  if (!text.includes(from)) throw new Error('text not found in ' + file);
  writeFileSync(full, text.split(from).join(to));
  return text;
}

function noexempt() {
  say('T-041 Done-when 8, on the committed tree ' + head());
  say('');
  say('8a. Every quoted string constant of ' + MODULE + ' (line: text), from the file itself:');
  readFileSync(join(ROOT, MODULE), 'utf8').split('\n').forEach((line, index) => {
    for (const m of line.matchAll(/'[^']*'|`[^`]*`/g)) say('  ' + (index + 1) + ': ' + m[0]);
  });
  say('The names in them that skip anything: .git (GIT_NAME), node_modules and secrets (SKIP_DIRS), .env (ENV_NAME) and the .env. prefix (ENV_PREFIX); .env.example (ENV_KEPT) is the one name kept. No other file, folder or path name appears; the three regular expressions are literals with no name in them.');
  say('');
  say('8b. A scratch copy of the committed tree (git archive HEAD) under <OS temp dir>; one joined fixture line (built at run time with the fake name, never saved) appended to one file at a time and undone before the next; each time `node agent-team/evidence/T-041/scan-root.mjs <copy root>` is run from the worktree (it calls the worktree checker\'s checkTree and report on the folder given)');
  const targets = [
    [MODULE, 'windows'], [TEST, 'drive-mount'], ['agent-team/tasks/T-041.md', 'home'],
    ['agent-team/DECISIONS.md', 'windows'], ['agent-team/BACKLOG.md', 'drive-mount'], ['agent-team/evidence/T-041/precheck.txt', 'home'],
  ];
  withBase((base) => {
    const dir = copyTree(base, 'tree');
    const scan = () => run(process.execPath, [SCAN, dir], ROOT);
    const clean = scan();
    say('clean copy: exit ' + clean.code + ', stdout lines ' + lines(clean.stdout).length);
    let all = clean.code === 0 && clean.stdout === '';
    for (const [file, kind] of targets) {
      const { before, line } = append(dir, file, FIXTURES[kind]);
      const r = scan();
      writeFileSync(join(dir, file), before);
      const want = [MESSAGE, file + ':' + line + ': ' + kind + ' home-directory path'];
      const exact = r.code === 1 && JSON.stringify(lines(r.stdout)) === JSON.stringify(want);
      all = all && exact;
      say('');
      say('fixture line of kind ' + kind + ' appended to ' + file + ' as line ' + line + ': exit ' + r.code + ', stdout:');
      for (const l of lines(r.stdout)) say('  ' + l);
      say('  exactly that file and line: ' + (exact ? 'yes' : 'NO') + '; undone: ' + (readFileSync(join(dir, file)).equals(before) ? 'yes' : 'no'));
    }
    const after = scan();
    say('');
    say('after all six, copy clean again: exit ' + after.code + ', stdout lines ' + lines(after.stdout).length);
    say('expectation of Done-when 8b holds: ' + (all && after.code === 0 ? 'yes' : 'NO'));
  });
  save('no-exemption.txt');
}

const CONTROLS = [
  ['(b) the exit code forced to 0', 'process.exit(code);', 'process.exit(0);', null],
  ['(c) the windows pattern dropped', '  [\'windows\', /[A-Za-z]:[\\\\/]+users[\\\\/]+[A-Za-z0-9_]/i],\n', '', null],
  ['(d) the walk narrowed to agent-team/evidence/', 'const files = walk(base, base, [])', 'const files = (existsSync(join(base, \'agent-team\', \'evidence\')) ? walk(base, join(base, \'agent-team\', \'evidence\'), []) : [])', ['import { readdirSync, readFileSync }', 'import { existsSync, readdirSync, readFileSync }']],
  ['(e) agent-team added to the skipped folder names', '[\'node_modules\', \'secrets\']', '[\'node_modules\', \'secrets\', \'agent-team\']', null],
];

function negative() {
  say('T-041 Done-when 9, negative controls on the committed change ' + head() + ', one at a time, nothing committed');
  say('');
  say('(a) in the worktree: the untracked scratch file ' + SCRATCH + ' at the root, one line: a windows-form path joined at run time from the drive letter C, Users, the fake name and a file name (not saved)');
  writeFileSync(join(ROOT, SCRATCH), FIXTURES.windows + '\n');
  try {
    const t = run(process.execPath, ['--test', TEST], ROOT);
    const named = [...new Set(lines(t.stdout).filter((l) => l.includes(SCRATCH) || l.startsWith('✖') || /^ℹ (tests|pass|fail) /.test(l)).map((l) => l.trim()))];
    say('$ node --test ' + TEST + ': exit ' + t.code + '; the lines that name the scratch file, the failed tests and the counts:');
    for (const l of named) say('  ' + l);
    const c = run(process.execPath, [MODULE], ROOT);
    say('$ node ' + MODULE + ': exit ' + c.code + ', stdout:');
    for (const l of lines(c.stdout)) say('  ' + l);
    const v = run('bash', ['scripts/verify.sh', 'T-041', '--feature', 'config', '--label', 'negative'], ROOT);
    say('$ ./scripts/verify.sh T-041 --feature config --label negative: exit ' + v.code + ', stdout:');
    for (const l of lines(v.stdout)) say('  ' + l);
    const g = run('grep', ['-c', FAKE, 'agent-team/evidence/T-041/negative-config.log'], ROOT);
    say('$ grep -c <fake name> agent-team/evidence/T-041/negative-config.log: ' + g.stdout.trim() + ' (grep exit ' + g.code + ')');
  } finally {
    rmSync(join(ROOT, SCRATCH), { force: true });
  }
  say('scratch file removed: ' + (existsSync(join(ROOT, SCRATCH)) ? 'no' : 'yes'));
  say('$ git status --short');
  for (const l of lines(run('git', ['status', '--short'], ROOT).stdout)) say('  ' + l);
  say('');
  say('(b) to (e) in a scratch copy of the committed tree (git archive HEAD) under <OS temp dir>; each edit made to the copy\'s ' + MODULE + ' and undone before the next; node --test --test-reporter=tap ' + TEST + ' in the copy');
  withBase((base) => {
    const dir = copyTree(base, 'tree');
    sayTap('copy unchanged', tap(dir));
    for (const [label, from, to, extra] of CONTROLS) {
      const original = edit(dir, MODULE, from, to);
      if (extra) edit(dir, MODULE, extra[0], extra[1]);
      const t = tap(dir);
      writeFileSync(join(dir, MODULE), original);
      sayTap(label, t);
      say('  undone: ' + (readFileSync(join(dir, MODULE), 'utf8') === readFileSync(join(ROOT, MODULE), 'utf8') ? 'yes' : 'no'));
    }
    sayTap('after all controls, copy unchanged again', tap(dir));
  });
  save('negative.txt');
}

function home() {
  say('T-041 Done-when 10, a checkout under a home folder (the CI case): a fresh scratch copy of the committed tree ' + head() + ' (git archive HEAD, so no .git, no .env file, no secrets/ folder, no node_modules) under <OS temp dir>');
  withBase((base) => {
    const dir = copyTree(base, 'tree');
    const hit = findHomePaths(dir).length > 0 || findHomePaths(dir.split(BS).join('/')).length > 0;
    say('the copy\'s absolute path is itself a hit under the windows pattern (findHomePaths on the path string, the path not written down): ' + (hit ? 'yes' : 'no') + '; kinds: ' + (findHomePaths(dir).map((h) => h.kind).join(',') || 'none'));
    const v = run('bash', ['scripts/verify.sh', 'T-041-scratch', '--feature', 'all'], dir);
    say('$ ./scripts/verify.sh T-041-scratch --feature all (in the copy): exit ' + v.code + ', stdout:');
    for (const l of lines(v.stdout)) say('  ' + (l.startsWith('commit: ') ? l.split('  ').slice(0, 2).join('  ') + '  <time>' : l));
    const written = readdirSync(join(dir, 'agent-team', 'evidence', 'T-041-scratch')).sort();
    say('files the run wrote into the copy\'s agent-team/evidence/T-041-scratch/ (' + written.length + '): ' + written.join(' '));
    const log = readFileSync(join(dir, 'agent-team', 'evidence', 'T-041-scratch', 'run-all.log'), 'utf8');
    say('unit-test counts from the copy\'s run-all.log:');
    for (const l of lines(log).filter((x) => /^ℹ (tests|pass|fail|skipped) /.test(x))) say('  ' + l);
    const c = run(process.execPath, [MODULE], dir);
    say('$ node ' + MODULE + ' (in the copy, after the run): exit ' + c.code + ', stdout lines ' + lines(c.stdout).length);
    for (const l of lines(c.stdout)) say('  ' + l);
    say('expectation of Done-when 10 holds: ' + (v.code === 0 && c.code === 0 && c.stdout === '' ? 'yes' : 'NO'));
  });
  save('home-checkout.txt');
}

function hookup() {
  say('T-041 Done-when 11, hook-up without touching guards.sh: a scratch copy of the committed tree ' + head() + ' (git archive HEAD) under <OS temp dir>');
  withBase((base) => {
    const dir = copyTree(base, 'tree');
    edit(dir, 'scripts/guards.sh', '\nexit $FAIL', '\nnode scripts/home-paths.mjs || FAIL=1\nexit $FAIL');
    say('the copy\'s scripts/guards.sh, last three lines after the edit:');
    for (const l of lines(readFileSync(join(dir, 'scripts/guards.sh'), 'utf8')).slice(-3)) say('  ' + l);
    say('worktree scripts/guards.sh unchanged against HEAD: ' + (run('git', ['diff', '--quiet', 'HEAD', '--', 'scripts/guards.sh'], ROOT).code === 0 ? 'yes' : 'no'));
    const g1 = run('bash', ['scripts/guards.sh'], dir);
    say('clean copy: ./scripts/guards.sh exit ' + g1.code + ', output lines ' + lines(g1.stdout + g1.stderr).length);
    writeFileSync(join(dir, SCRATCH), FIXTURES.windows + '\n');
    const g2 = run('bash', ['scripts/guards.sh'], dir);
    say('with ' + SCRATCH + ' at the copy root (the Done-when 2 scratch line): ./scripts/guards.sh exit ' + g2.code + ', output:');
    for (const l of lines(g2.stdout + g2.stderr)) say('  ' + l);
    say('expectation of Done-when 11 holds: ' + (g1.code === 0 && g1.stdout === '' && g2.code === 1 && lines(g2.stdout).join('\n') === MESSAGE + '\n' + SCRATCH + ':1: windows home-directory path' ? 'yes' : 'NO'));
  });
  save('hookup-check.txt');
}

function countWalk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'secrets'].includes(entry.name)) countWalk(full, acc);
    } else if (entry.isFile()) {
      if (entry.name !== '.env.example' && (entry.name === '.env' || entry.name.startsWith('.env.'))) continue;
      if (readFileSync(full).subarray(0, 8000).includes(0)) acc.binary += 1;
      else acc.text += 1;
    }
  }
  return acc;
}

function time() {
  say('T-041 Done-when 16, time and walk size, in the worktree at ' + head());
  for (let i = 1; i <= 3; i += 1) {
    const start = performance.now();
    const t = tap(ROOT);
    const wall = (performance.now() - start) / 1000;
    const rows = lines(t.stdout);
    const at = rows.findIndex((l) => l.endsWith(' - ' + REAL_TREE));
    const ms = rows.slice(at + 1).find((l) => l.trim().startsWith('duration_ms:'));
    const total = rows.find((l) => l.startsWith('# duration_ms '));
    say('run ' + i + ': ' + t.summary + '; real-repo tree test ' + (ms ? ms.trim() : '?') + '; whole test file (node --test ' + TEST + ', ' + (total || '?') + '); wall time of the node process ' + wall.toFixed(3) + ' s');
  }
  const acc = countWalk(ROOT, { text: 0, binary: 0 });
  say('files the real-repo walk opens (a count by an evidence-only walk with the same skip rules as checkTree): ' + (acc.text + acc.binary) + ', of which ' + acc.text + ' read as text and ' + acc.binary + ' skipped as binary after the first 8000 bytes');
  save('time.txt');
}

function leftovers() {
  const names = readdirSync(tmpdir());
  return 'folders in <OS temp dir> named home-paths-*: ' + names.filter((n) => n.startsWith('home-paths-')).length + '; named t041-*: ' + names.filter((n) => n.startsWith('t041-')).length;
}

const STEPS = { noexempt, negative, home, hookup, time };
if (STEP === 'leftovers') process.stdout.write(leftovers() + '\n');
else {
  STEPS[STEP]();
  process.stdout.write(out.join('\n') + '\n');
}
