import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { findHomePaths } from '../../../scripts/home-paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const EVIDENCE = join(ROOT, 'agent-team', 'evidence', 'T-038');
const PROPOSED = join(EVIDENCE, 'proposed', 'tests', 'syntax-check.test.js');
const TEST = 'tests/syntax-check.test.js';
const DASH = '-dash-temp';
const PREFIX = 'syntax-check-';
const BS = '\\';
const ESC = '\u001b';
const BAD_LINE = 'const a = "' + ESC + '[31m\u0007\u0008" }';
const BASE_NAMES = ['every .js and .mjs file under sim/ passes node --check', 'the walk and the check report a broken file by name, pass clean files, skip other files and report a folder with no code file'];
const STEP = process.argv[2];
const TEMP_KEYS = ['TEMP', 'TMP', 'TMPDIR'];
const FOUND_FROM = "    const found = checkSyntax(root, join(root, 'sim'));\n";
const FOUND_TO = FOUND_FROM + "    writeFileSync(join(ROOT, 'found.json'), JSON.stringify(found));\n";

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

const visible = (text) => text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, (ch) => '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0'));
const scrub = (text) => visible(HIDE.reduce((acc, [form, mark]) => swap(acc, form, mark), String(text)));
const out = [];
const say = (text) => String(text).split('\n').forEach((line) => out.push(scrub(line.replace(/\r$/, ''))));
function save(name) {
  const text = out.join('\n') + '\n';
  const left = findHomePaths(text).map((hit) => hit.line);
  if (left.length > 0 || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(text)) throw new Error('not saved: a home path or a control character is left, lines ' + left.join(','));
  writeFileSync(join(EVIDENCE, name), text);
}

const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_') && key.toUpperCase() !== 'FORCE_COLOR')),
  GIT_CEILING_DIRECTORIES: dirname(resolve(tmpdir())),
};
const DASH_ENV = { ...Object.fromEntries(Object.entries(ENV).filter(([key]) => !TEMP_KEYS.includes(key.toUpperCase()))), TEMP: DASH, TMP: DASH, TMPDIR: DASH };

function run(cmd, args, cwd, env = ENV) {
  const started = performance.now();
  const r = spawnSync(cmd, args, { cwd, env, windowsHide: true, maxBuffer: 1 << 28 });
  const stdout = r.stdout || Buffer.alloc(0);
  const stderr = r.stderr || Buffer.alloc(0);
  return { code: r.status, ms: Math.round(performance.now() - started), raw: Buffer.concat([stdout, stderr]), stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') };
}

const lines = (text) => text.split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line !== '');
const head = () => run('git', ['rev-parse', '--short', 'HEAD'], ROOT).stdout.trim();

function controls(buf) {
  const by = {};
  let n = 0;
  for (const b of buf) {
    if (b <= 0x09 || (b >= 0x0b && b <= 0x1f) || b === 0x7f) {
      n += 1;
      const key = '0x' + b.toString(16).padStart(2, '0');
      by[key] = (by[key] || 0) + 1;
    }
  }
  return n + ' ' + JSON.stringify(by);
}

function withBase(prefix, work) {
  const base = mkdtempSync(join(resolve(tmpdir()), prefix));
  try {
    return work(base);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
  }
}

const skipName = (name) => ['.git', 'node_modules', 'secrets'].includes(name) || (name !== '.env.example' && (name === '.env' || name.startsWith('.env.')));
function copy(base, name, file) {
  const dir = join(base, name);
  cpSync(ROOT, dir, { recursive: true, filter: (src) => src === ROOT || !skipName(basename(src)) });
  if (file) copyFileSync(file, join(dir, TEST));
  return dir;
}

function tap(dir, env = ENV, extra = []) {
  const r = run(process.execPath, ['--test', '--test-reporter=tap', ...extra, TEST], dir, env);
  const tests = lines(r.stdout).map((line) => line.match(/^(not ok|ok) \d+ - (.*)$/)).filter(Boolean).map((m) => ({ ok: m[1] === 'ok', name: m[2].split('\\#').join('#') }));
  const count = (key) => (lines(r.stdout).find((line) => line.startsWith('# ' + key + ' ')) || '').split(' ')[2];
  return { ...r, tests, failed: tests.filter((t) => !t.ok).map((t) => t.name), summary: 'tests ' + count('tests') + ', pass ' + count('pass') + ', fail ' + count('fail') + ', exit ' + r.code + ', ' + r.ms + ' ms' };
}

function sayTap(label, result) {
  say(label + ': ' + result.summary);
  for (const name of result.failed) say('  failed: ' + name);
}

function edit(dir, file, from, to) {
  const full = join(dir, file);
  const text = readFileSync(full, 'utf8');
  if (!text.includes(from)) throw new Error('text not found in ' + file);
  writeFileSync(full, text.split(from).join(to));
  return () => writeFileSync(full, text);
}

const leftovers = (dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => name.startsWith(PREFIX)) : []);
const syntaxLines = (text) => lines(text).filter((line) => /SyntaxError|bad option|sim\/balance\.mjs/.test(line));

function gaps() {
  say('T-038 Done-when 3, the gaps on BASE\'s tests/syntax-check.test.js, run from the worktree at ' + head() + ', platform ' + process.platform + ', node ' + process.version);
  say('');
  say('3a. Throw-away folder in the OS temp dir; bad.mjs holds one failing line `const a = "<ESC>[31m<BEL><BS>" }` (bytes written by the script, never saved here)');
  withBase('t038-3a-', (base) => {
    writeFileSync(join(base, 'bad.mjs'), BAD_LINE + '\n');
    const r = run(process.execPath, ['--check', join(base, 'bad.mjs')], base);
    say('$ node --check <throw-away>/bad.mjs -> exit ' + r.code);
    say('count of bytes 0x00-0x09, 0x0B-0x1F and 0x7F in stderr: ' + controls(Buffer.from(r.stderr, 'utf8')));
    say('stderr with every control character shown as \\xNN:');
    for (const line of lines(r.stderr).slice(0, 5)) say('  ' + line);
  });
  say('');
  say('3b. Scratch copy of the worktree with BASE\'s file; folder ' + DASH + ' made in the copy root; TEMP, TMP and TMPDIR all set to ' + DASH + '; `node --test tests/syntax-check.test.js` run from the copy root');
  withBase('t038-3b-', (base) => {
    const dir = copy(base, 'copy', null);
    mkdirSync(join(dir, DASH));
    const r = tap(dir, DASH_ENV);
    sayTap('BASE file, dash set-up', r);
    say('the failing assertion compares names only, so Node\'s message is not in that output; scratch-only instrumentation: one line added after `const found = checkSyntax(...)` in test 2 of the copy writes `found` to found.json in the copy root, then the same run again');
    const undo = edit(dir, TEST, FOUND_FROM, FOUND_TO);
    const i = tap(dir, DASH_ENV);
    undo();
    sayTap('instrumented BASE file, dash set-up', i);
    const found = JSON.parse(readFileSync(join(dir, 'found.json'), 'utf8'));
    say('checked: ' + JSON.stringify(found.checked));
    for (const line of found.errors) say('error: ' + line.split(': ')[0] + ' -> ' + (lines(line.slice(line.indexOf(': ') + 2))[0] || ''));
    say('copy\'s test file equals BASE\'s again: ' + (readFileSync(join(dir, TEST), 'utf8') === readFileSync(join(ROOT, TEST), 'utf8') ? 'yes' : 'NO'));
    say(PREFIX + '* folders left in ' + DASH + ': ' + leftovers(join(dir, DASH)).length);
  });
  say('');
  say('3c. Throw-away folder; t.js holds `return;` and a line feed, next to package.json');
  withBase('t038-3c-', (base) => {
    writeFileSync(join(base, 't.js'), 'return;\n');
    for (const type of ['commonjs', 'module']) {
      writeFileSync(join(base, 'package.json'), JSON.stringify({ type }) + '\n');
      const r = run(process.execPath, ['--check', join(base, 't.js')], base);
      say('{"type":"' + type + '"}: node --check t.js -> exit ' + r.code + (r.code ? ', ' + (lines(r.stderr).find((l) => l.includes('SyntaxError')) || '') : ''));
    }
  });
  const above = [];
  for (let dir = dirname(resolve(tmpdir())), up = '<OS temp dir>/..'; ; dir = dirname(dir), up += '/..') {
    above.push(up + (dir === parse(dir).root ? ' (the drive or file-system root)' : '') + ': package.json ' + (existsSync(join(dir, 'package.json')) ? 'FOUND' : 'none'));
    if (dir === parse(dir).root) break;
  }
  say('package.json in each folder above the OS temp dir (<OS temp dir> itself: ' + (existsSync(join(resolve(tmpdir()), 'package.json')) ? 'FOUND' : 'none') + '):');
  for (const line of above) say('  ' + line);
  say('');
  say('3d. $ grep -nE "symlink|junction" tests/syntax-check.test.js   (worktree, BASE file)');
  const g = run('grep', ['-nE', 'symlink|junction', TEST], ROOT);
  say('exit ' + g.code + ', output ' + JSON.stringify(g.stdout));
  save('before-gaps.txt');
}

function balanceSetup(dir) {
  const full = join(dir, 'sim', 'balance.mjs');
  const before = readFileSync(full, 'utf8');
  writeFileSync(full, before + (before.endsWith('\n') ? '' : '\n') + BAD_LINE + '\n');
  return () => writeFileSync(full, before);
}

function fixes() {
  say('T-038 Done-when 5, the proposed file in a scratch copy of the worktree at ' + head() + ', platform ' + process.platform + ', node ' + process.version);
  withBase('t038-fix-', (base) => {
    const dir = copy(base, 'proposed', PROPOSED);
    const baseDir = copy(base, 'base', null);
    say('');
    say('5a. $ node --test --test-reporter=tap tests/syntax-check.test.js   (proposed file)');
    const a = tap(dir);
    sayTap('proposed file', a);
    for (const t of a.tests) say('  ' + (t.ok ? 'ok     ' : 'not ok ') + t.name);
    for (const name of BASE_NAMES) say('BASE test name present and passing: ' + (a.tests.some((t) => t.ok && t.name === name) ? 'yes' : 'NO') + ' (' + name + ')');
    say('');
    say('5b. The string test and the control-character fixture test are in the 5a list above. Set-up: the line `const a = "<ESC>[31m<BEL><BS>" }` appended to the copy\'s sim/balance.mjs (scratch only), then tests/syntax-check.test.js run with the default reporter (as verify.sh runs it) and with TAP; count of bytes 0x00-0x09, 0x0B-0x1F and 0x7F in stdout plus stderr');
    for (const [label, where] of [['BASE file', baseDir], ['proposed file', dir]]) {
      const undo = balanceSetup(where);
      const spec = run(process.execPath, ['--test', TEST], where);
      const t = tap(where);
      undo();
      say(label + ', default reporter: exit ' + spec.code + ', names sim/balance.mjs: ' + (spec.stdout.includes('sim/balance.mjs: ') ? 'yes' : 'no') + ', control bytes ' + controls(spec.raw));
      sayTap(label + ', TAP', t);
      say(label + ', TAP: names sim/balance.mjs: ' + (t.stdout.includes('sim/balance.mjs: ') ? 'yes' : 'no') + ', control bytes ' + controls(t.raw));
      say(label + ', default reporter, lines naming sim/balance.mjs or SyntaxError (controls shown as \\xNN):');
      for (const line of syntaxLines(spec.stdout).slice(0, 6)) say('  ' + line.trim());
    }
    say('sim/balance.mjs restored in both copies: ' + (readFileSync(join(dir, 'sim', 'balance.mjs'), 'utf8') === readFileSync(join(ROOT, 'sim', 'balance.mjs'), 'utf8') && readFileSync(join(baseDir, 'sim', 'balance.mjs'), 'utf8') === readFileSync(join(ROOT, 'sim', 'balance.mjs'), 'utf8') ? 'yes' : 'NO'));
    say('');
    say('5c. The 3b set-up (folder ' + DASH + ' in the copy root, TEMP, TMP and TMPDIR = ' + DASH + ') with the proposed file');
    const tempBefore = leftovers(resolve(tmpdir()));
    mkdirSync(join(dir, DASH));
    const c = tap(dir, DASH_ENV);
    sayTap('proposed file, dash set-up', c);
    say(PREFIX + '* folders left in ' + DASH + ': ' + leftovers(join(dir, DASH)).length + ' (entries in it: ' + readdirSync(join(dir, DASH)).length + ')');
    const tempAfter = leftovers(resolve(tmpdir()));
    say(PREFIX + '* folders in <OS temp dir> before the run ' + tempBefore.length + ', after ' + tempAfter.length + ', new ' + tempAfter.filter((n) => !tempBefore.includes(n)).length);
    rmSync(join(dir, DASH), { recursive: true, force: true });
    say(DASH + ' removed: ' + (existsSync(join(dir, DASH)) ? 'no' : 'yes'));
    say('');
    say('5d. Scratch-only instrumentation: one line added after `const found = checkSyntax(...)` in test 2 of the copy that writes `found` to found.json in the copy root; removed after the run');
    const undo = edit(dir, TEST, FOUND_FROM, FOUND_TO);
    const d = tap(dir);
    undo();
    sayTap('instrumented proposed file', d);
    const found = JSON.parse(readFileSync(join(dir, 'found.json'), 'utf8'));
    say('checked: ' + JSON.stringify(found.checked));
    for (const line of found.errors) say('error: ' + line.split(': ')[0] + ' -> ' + (lines(line).find((l) => l.includes('SyntaxError')) || 'NO SyntaxError line'));
    say('copy\'s test file equals the proposed file again: ' + (readFileSync(join(dir, TEST), 'utf8') === readFileSync(PROPOSED, 'utf8') ? 'yes' : 'NO'));
    say('');
    say('5e. Link test result from 5a: ' + ((a.tests.find((t) => t.name.startsWith('the walk does not follow')) || { ok: false }).ok ? 'ok' : 'NOT OK') + '; the test ends with assert.equal(existsSync(root), false) after rmSync, so the junction and its target (both inside the fixture) are gone when it passes');
    say(PREFIX + '* folders in <OS temp dir> now: ' + leftovers(resolve(tmpdir())).length);
  });
  save('fixes.txt');
}

const NEGATIVES = [
  ['(a) cleaning taken out of the stderr path', [["plain(String(error.stderr || error.message)).trim()", "String(error.stderr || error.message).trim()"]], ENV],
  ['(b) package.json line removed from the fixture of test 2', [["    'package.json': '{\"type\":\"module\"}\\n',\n", '']], ENV],
  ['(c) walk follows folder links (entry tested with statSync)', [['readdirSync, rmSync, symlinkSync', 'readdirSync, rmSync, statSync, symlinkSync'], ['    if (entry.isDirectory()) {', '    if (statSync(full).isDirectory()) {']], ENV],
  ['(d) resolve(...) taken out of both mkdtempSync calls, run in the 3b set-up', [["join(resolve(tmpdir()), 'syntax-check-')", "join(tmpdir(), 'syntax-check-')"]], DASH_ENV],
];

function negative() {
  say('T-038 Done-when 6, negative controls in a scratch copy of the worktree at ' + head() + ' with the proposed file; one at a time, each undone before the next; never committed');
  withBase('t038-neg-', (base) => {
    const dir = copy(base, 'proposed', PROPOSED);
    mkdirSync(join(dir, DASH));
    sayTap('unchanged proposed file', tap(dir));
    sayTap('unchanged proposed file, dash set-up', tap(dir, DASH_ENV));
    for (const [label, swaps, env] of NEGATIVES) {
      const undos = swaps.map(([from, to]) => edit(dir, TEST, from, to));
      const changed = run('diff', ['-u', PROPOSED, join(dir, TEST)], ROOT);
      const r = tap(dir, env);
      undos.reverse().forEach((undo) => undo());
      say('');
      say(label);
      say('change (diff -u proposed -> scratch, changed lines only):');
      for (const line of lines(changed.stdout).filter((l) => /^[+-][^+-]/.test(l))) say('  ' + line);
      sayTap('result', r);
      say('file restored: ' + (readFileSync(join(dir, TEST), 'utf8') === readFileSync(PROPOSED, 'utf8') ? 'yes' : 'NO'));
    }
    say('');
    say(PREFIX + '* folders left in ' + DASH + ': ' + leftovers(join(dir, DASH)).length);
  });
  say(PREFIX + '* folders in <OS temp dir> now: ' + leftovers(resolve(tmpdir())).length);
  save('negative-scratch.txt');
}

function scratchVerify() {
  say('T-038 Done-when 7, a fresh scratch copy of the worktree at ' + head() + ' (not a git repo) with the proposed file copied over tests/syntax-check.test.js; platform ' + process.platform + ', node ' + process.version + ', ' + run('git', ['--version'], ROOT).stdout.trim());
  withBase('t038-verify-', (base) => {
    const dir = copy(base, 'proposed', PROPOSED);
    const v = run('bash', ['scripts/verify.sh', 'T-038-scratch', '--feature', 'config'], dir);
    say('$ ./scripts/verify.sh T-038-scratch --feature config -> exit ' + v.code);
    for (const line of lines(v.stdout)) say('  ' + line);
    const log = readFileSync(join(dir, 'agent-team', 'evidence', 'T-038-scratch', 'run-config.log'), 'utf8');
    say('unit-test summary from the log: ' + lines(log).filter((line) => /^\u2139 (tests|suites|pass|fail|cancelled|skipped|todo) /.test(line)).join('; '));
    const names = [...readFileSync(PROPOSED, 'utf8').matchAll(/^test\('([^']*)'/gm)].map((m) => m[1]);
    say('the ' + names.length + ' tests of the proposed file, as the log reports them:');
    for (const name of names) say('  ' + (lines(log).find((line) => /^[\u2714\u2716] /.test(line) && line.slice(2).startsWith(name + ' (')) || 'NOT FOUND: ' + name).replace(/ \([\d.]+ms\)$/, ''));
    const g = run('bash', ['scripts/guards.sh'], dir);
    say('$ ./scripts/guards.sh -> exit ' + g.code + ', output ' + JSON.stringify(g.stdout + g.stderr));
  });
  say(PREFIX + '* folders in <OS temp dir> now: ' + leftovers(resolve(tmpdir())).length);
  save('after-scratch-verify.txt');
}

function time() {
  say('T-038 Done-when 8, time of `node --test tests/syntax-check.test.js` (TAP reporter), three runs per file, interleaved; copies of the worktree at ' + head() + '; platform ' + process.platform + ', node ' + process.version);
  withBase('t038-time-', (base) => {
    const dirs = { base: copy(base, 'base', null), proposed: copy(base, 'proposed', PROPOSED) };
    const ms = { base: [], proposed: [] };
    for (let i = 1; i <= 3; i += 1) {
      for (const key of ['base', 'proposed']) {
        const r = tap(dirs[key]);
        ms[key].push(r.ms);
        say(key + ' run ' + i + ': ' + r.summary);
      }
    }
    const avg = (list) => Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    const diff = avg(ms.proposed) - avg(ms.base);
    say('average base ' + avg(ms.base) + ' ms, proposed ' + avg(ms.proposed) + ' ms, difference ' + diff + ' ms (limit 500 ms): ' + (diff <= 500 ? 'within the limit' : 'OVER THE LIMIT'));
  });
  save('time.txt');
}

const STEPS = { gaps, fixes, negative, verify: scratchVerify, time };
if (!STEPS[STEP]) throw new Error('step must be one of: ' + Object.keys(STEPS).join(', '));
STEPS[STEP]();
