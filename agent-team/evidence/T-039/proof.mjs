import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const EVIDENCE = join(ROOT, 'agent-team', 'evidence', 'T-039');
const PROPOSED = join(EVIDENCE, 'proposed');
const BASE = '5638864';
const MODULE = 'scripts/conflict-markers.mjs';
const TEST = 'tests/conflict-markers.test.js';
const FILES = [MODULE, TEST];
const OPEN = '<'.repeat(7);
const CLOSE = '>'.repeat(7);
const SKIP_NAMES = ['.git', 'node_modules', 'secrets'];
const REAL_TREE = 'no file in this repo holds a conflict marker';
const REPORT_EMPTY = 'report gives no lines and code 0 when nothing is found';
const REPORT_TWO = 'report gives the message, then one path:line: text line per finding in the given order, and code 1';
const END_TO_END = 'run directly, the checker is silent with exit 0 on a clean tree and prints the message and path:line: text with exit 1 on a marker';
const MESSAGE = 'GUARD FAIL [no-conflict-markers]: Resolve the merge conflict; never commit conflict markers';
const STEP = process.argv[2];

const forms = (path) => [path, path.split('\\').join('/'), path.split('\\').join('\\\\')];
const HIDE = [...forms(ROOT).map((form) => [form, '<worktree>']), ...forms(tmpdir()).map((form) => [form, '<OS temp dir>']), ...forms(homedir()).map((form) => [form, '<home>']), [userInfo().username, '<user>']];
const scrub = (text) => HIDE.reduce((acc, [form, mark]) => acc.split(form).join(mark), String(text));
const out = [];
const say = (line) => out.push(scrub(line));
const save = (name) => writeFileSync(join(EVIDENCE, name), out.join('\n') + '\n');
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CEILING_DIRECTORIES: dirname(tmpdir()) };

function run(cmd, args, cwd, encoding = 'utf8') {
  const r = spawnSync(cmd, args, { cwd, env, encoding, windowsHide: true, maxBuffer: 1 << 26 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const keep = (src) => {
  const name = basename(src);
  return !SKIP_NAMES.includes(name) && name !== '.env' && !name.startsWith('.env.');
};

function scratch(base, name, proposed) {
  const dir = join(base, name);
  cpSync(ROOT, dir, { recursive: true, filter: keep });
  if (proposed) for (const file of FILES) copyFileSync(join(PROPOSED, file), join(dir, file));
  return dir;
}

function withBase(run) {
  const base = mkdtempSync(join(tmpdir(), 't039-'));
  try {
    return run(base);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
  }
}

function tap(dir) {
  const r = run(process.execPath, ['--test', '--test-reporter=tap', TEST], dir);
  const tests = r.stdout.split('\n').map((line) => line.match(/^(not ok|ok) \d+ - (.*)$/)).filter(Boolean).map((m) => ({ ok: m[1] === 'ok', name: m[2].split('\\#').join('#') }));
  const count = (key) => (r.stdout.split('\n').find((line) => line.startsWith('# ' + key + ' ')) || '').split(' ')[2];
  return { code: r.code, tests, failed: tests.filter((t) => !t.ok).map((t) => t.name), summary: 'tests ' + count('tests') + ', pass ' + count('pass') + ', fail ' + count('fail') + ', exit ' + r.code };
}

function sayTap(label, result) {
  say(label + ': ' + result.summary);
  for (const name of result.failed) say('  failed: ' + name);
}

const lines = (text) => text.split('\n').filter((line) => line !== '');
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function edit(dir, file, from, to) {
  const full = join(dir, file);
  const text = readFileSync(full, 'utf8');
  if (!text.includes(from)) throw new Error('text not found in ' + file + ': ' + from);
  writeFileSync(full, text.split(from).join(to));
  return text;
}

function appendMarker(dir, file, marker) {
  const full = join(dir, file);
  const before = readFileSync(full);
  const text = before.toString('utf8');
  const sep = text.endsWith('\n') ? '' : '\n';
  appendFileSync(full, sep + marker + '\n');
  const line = (text + sep).split('\n').length;
  return { before, line };
}

function gap() {
  say('T-039 Done-when 3: the gap on BASE ' + BASE + ', in a scratch copy of the worktree (no .git, .env, secrets/ or node_modules) under <OS temp dir>');
  withBase((base) => {
    const dir = scratch(base, 'tree', false);
    for (const file of FILES) say(file + ' in the scratch copy is byte-identical to BASE: ' + (run('git', ['show', BASE + ':' + file], ROOT).stdout === readFileSync(join(dir, file), 'utf8') ? 'yes' : 'no'));
    const original = edit(dir, MODULE, '    process.exit(1);\n', '');
    say('step 1: removed the line `    process.exit(1);` from the scratch module; process.exit left in it: ' + (readFileSync(join(dir, MODULE), 'utf8').includes('process.exit') ? 'yes' : 'no'));
    const { before, line } = appendMarker(dir, 'src/config.js', OPEN + ' HEAD');
    say('step 2: appended one opening marker line (built at run time) to the scratch src/config.js as line ' + line);
    const t1 = tap(dir);
    sayTap('step 3: node --test --test-reporter=tap ' + TEST, t1);
    const c1 = run(process.execPath, [MODULE], dir);
    say('step 4: node ' + MODULE + ': exit ' + c1.code + ', stdout lines:');
    for (const l of lines(c1.stdout)) say(l);
    const g1 = run('bash', ['scripts/guards.sh'], dir);
    say('step 5: ./scripts/guards.sh: exit ' + g1.code + ', output lines:');
    for (const l of lines(g1.stdout + g1.stderr)) say(l);
    writeFileSync(join(dir, 'src/config.js'), before);
    const t2 = tap(dir);
    sayTap('step 6: marker removed from src/config.js, process.exit(1) still removed from the module; node --test --test-reporter=tap ' + TEST, t2);
    writeFileSync(join(dir, MODULE), original);
    const t3 = tap(dir);
    sayTap('step 7: module restored too (both files as on BASE); node --test --test-reporter=tap ' + TEST, t3);
    const holds = sameSet(t1.failed, [REAL_TREE]) && c1.code === 0 && lines(c1.stdout)[0] === MESSAGE && lines(c1.stdout)[1] === 'src/config.js:' + line + ': ' + OPEN + ' HEAD' && g1.code === 0 && lines(g1.stdout).includes(MESSAGE) && t2.code === 0 && t2.failed.length === 0 && t3.code === 0;
    say('expectation of Done-when 3 holds: ' + (holds ? 'yes' : 'NO'));
  });
  save('before-gap.txt');
}

function diff() {
  const size = ['T-039 Done-when 4: size of `diff -u` of each proposed file against BASE ' + BASE + ' (header lines not counted)'];
  const parts = [];
  withBase((base) => {
    for (const [file, limit] of [[MODULE, 15], [TEST, 50]]) {
      const old = join(base, basename(file) + '.base');
      writeFileSync(old, run('git', ['show', BASE + ':' + file], ROOT).stdout);
      const r = run('diff', ['-u', '--label', 'a/' + file, '--label', 'b/' + file, old, join(PROPOSED, file)], base);
      parts.push(r.stdout);
      const body = r.stdout.split('\n').slice(2);
      const added = body.filter((l) => l.startsWith('+')).length;
      const deleted = body.filter((l) => l.startsWith('-')).length;
      size.push(file + ': added ' + added + ', deleted ' + deleted + ', total ' + (added + deleted) + ' (limit ' + limit + '): ' + (added + deleted <= limit ? 'within' : 'OVER'));
    }
  });
  writeFileSync(join(EVIDENCE, 'proposed.diff'), parts.join(''));
  writeFileSync(join(EVIDENCE, 'size.txt'), [...size, ...out].join('\n') + '\n');
}

function after() {
  say('T-039 Done-when 5: scratch copies of the worktree under <OS temp dir>; BASE files in one, both proposed files copied over the real paths in the other');
  withBase((base) => {
    const old = tap(scratch(base, 'base', false));
    const neu = tap(scratch(base, 'proposed', true));
    sayTap('BASE files: node --test --test-reporter=tap ' + TEST, old);
    sayTap('proposed files: node --test --test-reporter=tap ' + TEST, neu);
    const names = neu.tests.map((t) => t.name);
    const added = neu.tests.filter((t) => !old.tests.some((o) => o.name === t.name));
    const missing = old.tests.filter((o) => !names.includes(o.name));
    const notPassing = old.tests.filter((o) => !neu.tests.some((t) => t.name === o.name && t.ok));
    say('new tests (' + added.length + '):');
    for (const t of added) say('  ' + (t.ok ? 'ok     ' : 'NOT OK ') + t.name);
    say('BASE tests: ' + old.tests.length + '; missing in the proposed file: ' + missing.length + '; present but not passing: ' + notPassing.length);
    say('every test in the proposed run:');
    for (const t of neu.tests) say('  ' + (t.ok ? 'ok     ' : 'NOT OK ') + t.name);
  });
  save('after-scratch.txt');
}

function same() {
  say('T-039 Done-when 6: one scratch copy of the worktree under <OS temp dir>; BASE module at ' + MODULE + ', proposed module copied next to it as scripts/conflict-markers.proposed.mjs, so both check the same root');
  withBase((base) => {
    const dir = scratch(base, 'tree', false);
    copyFileSync(join(PROPOSED, MODULE), join(dir, 'scripts/conflict-markers.proposed.mjs'));
    const both = (label) => {
      const a = run(process.execPath, [MODULE], dir, 'buffer');
      const b = run(process.execPath, ['scripts/conflict-markers.proposed.mjs'], dir, 'buffer');
      say(label + ': BASE exit ' + a.code + ', ' + a.stdout.length + ' stdout bytes; proposed exit ' + b.code + ', ' + b.stdout.length + ' stdout bytes; stdout byte-identical: ' + (a.stdout.equals(b.stdout) ? 'yes' : 'NO') + '; same exit code: ' + (a.code === b.code ? 'yes' : 'NO') + '; stderr empty: ' + (a.stderr.length + b.stderr.length === 0 ? 'yes' : 'no'));
      return b.stdout.toString('utf8');
    };
    both('clean tree');
    const c = appendMarker(dir, 'src/config.js', OPEN + ' HEAD');
    const r = appendMarker(dir, 'agent-team/REPEATS.md', CLOSE + ' task/T-000-other');
    say('marker lines (built at run time) appended: src/config.js line ' + c.line + ', agent-team/REPEATS.md line ' + r.line);
    const text = both('with markers');
    say('stdout of the proposed module with markers (identical to BASE above), line by line:');
    for (const l of lines(text)) say(l);
  });
  save('same-output.txt');
}

const CONTROLS = [
  ['(a) process.exit(code) removed from the isMain block', '  process.exit(code);\n', '', [END_TO_END]],
  ['(b) the exit code forced to 0', 'process.exit(code);', 'process.exit(0);', [END_TO_END]],
  ['(c) one word of MESSAGE changed (Resolve to Fix)', 'Resolve the merge conflict', 'Fix the merge conflict', [REPORT_TWO, END_TO_END]],
  ['(d) the line format changed to path:line text (colon after the line number removed)', '${hit.line}: ${hit.text}', '${hit.line} ${hit.text}', [REPORT_TWO, END_TO_END]],
  ['(e) the lines not written', '  for (const line of lines) process.stdout.write(line + NEWLINE);\n', '', [END_TO_END]],
];

function negative() {
  say('T-039 Done-when 7: negative controls in a scratch copy of the worktree under <OS temp dir> with both proposed files; one at a time on scripts/conflict-markers.mjs, each undone before the next; nothing committed');
  withBase((base) => {
    const dir = scratch(base, 'tree', true);
    sayTap('proposed files unchanged: node --test --test-reporter=tap ' + TEST, tap(dir));
    for (const [label, from, to, want] of CONTROLS) {
      const original = edit(dir, MODULE, from, to);
      const t = tap(dir);
      writeFileSync(join(dir, MODULE), original);
      sayTap(label, t);
      say('  as expected (exactly: ' + want.join(' | ') + '): ' + (sameSet(t.failed, want) ? 'yes' : 'NO') + '; undone: ' + (readFileSync(join(dir, MODULE), 'utf8') === readFileSync(join(PROPOSED, MODULE), 'utf8') ? 'yes' : 'no'));
    }
    sayTap('after all controls, proposed files unchanged again', tap(dir));
  });
  save('negative-scratch.txt');
}

function hookup() {
  say('T-039 Done-when 8: guards.sh hook-up with guards.sh unchanged, in a scratch copy of the worktree under <OS temp dir> with both proposed files (not a git repo, so verify.sh prints commit: none and dirty: unknown)');
  withBase((base) => {
    const dir = scratch(base, 'tree', true);
    say('scripts/guards.sh identical to BASE: ' + (run('git', ['show', BASE + ':scripts/guards.sh'], ROOT).stdout === readFileSync(join(dir, 'scripts/guards.sh'), 'utf8') ? 'yes' : 'no'));
    const g1 = run('bash', ['scripts/guards.sh'], dir);
    say('clean copy: ./scripts/guards.sh exit ' + g1.code + ', output ' + JSON.stringify(g1.stdout + g1.stderr));
    const { before, line } = appendMarker(dir, 'src/config.js', OPEN + ' HEAD');
    const g2 = run('bash', ['scripts/guards.sh'], dir);
    say('marker line (built at run time) appended to src/config.js as line ' + line + ': ./scripts/guards.sh exit ' + g2.code + ', output lines:');
    for (const l of lines(g2.stdout + g2.stderr)) say(l);
    writeFileSync(join(dir, 'src/config.js'), before);
    const v = run('bash', ['scripts/verify.sh', 'T-039-scratch', '--feature', 'config'], dir);
    say('marker removed; ./scripts/verify.sh T-039-scratch --feature config: exit ' + v.code + ', output lines:');
    for (const l of lines(v.stdout)) say(l.startsWith('commit: ') ? l.split('  ').slice(0, 2).join('  ') + '  <time>' : l);
    const log = readFileSync(join(dir, 'agent-team/evidence/T-039-scratch/run-config.log'), 'utf8');
    say('unit-test summary from the scratch log:');
    for (const l of log.split('\n').filter((x) => /^\u2139 (tests|pass|fail|skipped) /.test(x))) say(l);
  });
  save('hookup.txt');
}

function time() {
  say('T-039 Done-when 9: node --test ' + TEST + ' in two scratch copies of the worktree under <OS temp dir>, BASE files and proposed files, three runs each, interleaved; wall time of the whole node process');
  withBase((base) => {
    const dirs = [['BASE', scratch(base, 'base', false)], ['proposed', scratch(base, 'proposed', true)]];
    const times = { BASE: [], proposed: [] };
    for (let i = 1; i <= 3; i += 1) {
      for (const [name, dir] of dirs) {
        const start = performance.now();
        const r = run(process.execPath, ['--test', TEST], dir);
        const s = (performance.now() - start) / 1000;
        times[name].push(s);
        say('run ' + i + ' ' + name + ': ' + s.toFixed(3) + ' s, exit ' + r.code);
      }
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const d = avg(times.proposed) - avg(times.BASE);
    say('average BASE ' + avg(times.BASE).toFixed(3) + ' s, proposed ' + avg(times.proposed).toFixed(3) + ' s, difference ' + d.toFixed(3) + ' s (limit 0.5 s): ' + (d <= 0.5 ? 'within' : 'OVER'));
  });
  save('time.txt');
}

function leftovers() {
  const names = readdirSync(tmpdir());
  return 'folders in <OS temp dir> named conflict-markers-*: ' + names.filter((n) => n.startsWith('conflict-markers-')).length + '; named t039-*: ' + names.filter((n) => n.startsWith('t039-')).length;
}

const STEPS = { gap, diff, after, same, negative, hookup, time };
if (STEP === 'leftovers') process.stdout.write(leftovers() + '\n');
else {
  STEPS[STEP]();
  process.stdout.write(out.join('\n') + '\n');
}
