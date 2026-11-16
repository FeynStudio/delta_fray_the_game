import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STEP = process.argv[2];
const BASE = 'c0f6d36';
const START = '60bd3df';
const PROPOSED = 'agent-team/evidence/T-036/proposed';
const FILES = ['scripts/handoff-check.mjs', 'tests/handoff-check.test.js', 'scripts/guards.sh', 'scripts/verify.sh'];
const MODULE = FILES[0];
const TEST = FILES[1];
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const BRIEF = 'agent-team/tasks/T-900.md';
const VARS = [['GIT_TEST_ASSUME_DIFFERENT_OWNER', []], ['GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE', ['-c', 'core.commitGraph=false']]];
const WALK = ['rev-list', '--first-parent', '--parents', '-n', '200', 'HEAD'];
const FORMAT_FAIL = 'GUARD FAIL [format-string-literal]';
const C = 'con' + 'sole';
const U = 'ut' + 'il';
const out = [];
const gitNames = () => Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('GIT_')).sort();
const START_NAMES = gitNames();
const tmpForms = [tmpdir(), tmpdir().split('\\').join('/'), homedir(), homedir().split('\\').join('/')];
const scrub = (text) => [...tmpForms, userInfo().username].reduce((acc, form) => acc.split(form).join(form === userInfo().username ? '<user>' : '<tmp>'), String(text));
const say = (line) => out.push(scrub(line));
const titleCase = (name) => name.split('_').map((part) => part[0] + part.slice(1).toLowerCase()).join('_');
const noGit = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));

function place(dir, file, text) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

function cleanEnv(base) {
  const global = join(base, 'gitconfig');
  if (!existsSync(global)) writeFileSync(global, '');
  return { ...noGit(), GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1' };
}

function run(cmd, args, cwd, env) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
}

function exportRef(ref, dir) {
  mkdirSync(dir, { recursive: true });
  const tar = basename(dir) + '.tar';
  execFileSync('git', ['archive', '--format=tar', '-o', join(dirname(dir), tar), ref], { cwd: ROOT, windowsHide: true });
  execFileSync('tar', ['-xf', '../' + tar], { cwd: dir, windowsHide: true });
  rmSync(join(dirname(dir), tar));
  return dir;
}

function headScratch(base, name = 'head') {
  const dir = exportRef('HEAD', join(base, name));
  for (const file of FILES) copyFileSync(join(dir, PROPOSED, file), join(dir, file));
  return dir;
}

function withEnv(changes, run) {
  const saved = Object.fromEntries(gitNames().map((key) => [key, process.env[key]]));
  for (const key of gitNames()) delete process.env[key];
  for (const [key, value] of Object.entries(changes)) process.env[key] = value;
  try {
    return run();
  } finally {
    for (const key of gitNames()) delete process.env[key];
    for (const [key, value] of Object.entries(saved)) process.env[key] = value;
  }
}

function fixtureGit(root, env) {
  return (args, extra = {}) => run('git', args, root, { ...env, ...extra });
}

function staleFixture(base) {
  const root = join(base, 'stale');
  mkdirSync(root);
  const env = cleanEnv(base);
  const git = fixtureGit(root, env);
  const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');
  const commit = (subject, files) => {
    for (const [file, text] of Object.entries(files)) place(root, file, text);
    git(['add', '-A']);
    git([...WHO, 'commit', '-q', '-m', subject]);
    return git(['rev-parse', 'HEAD']).stdout.trim();
  };
  git(['init', '-q']);
  git(['symbolic-ref', 'HEAD', 'refs/heads/' + BRANCH]);
  const a = commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief('(owner fills in)') });
  commit('Handoff', { [BRIEF]: brief('- Latest code commit: ' + a.slice(0, 7) + '.') });
  const b = commit('Fix the wall bounce', { 'src/game.js': 'export const a = 2;\n' });
  return { root, env, git, a, b };
}

async function loadModule(file, tag) {
  return import(pathToFileURL(file).href + '?' + tag);
}

function gitTestCases(mod, f) {
  const want = 'Handoff does not name ' + f.b.slice(0, 7) + '; latest code commit is ' + f.b.slice(0, 7) + ' (Fix the wall bounce)';
  const rows = [];
  for (const [key, args] of VARS) {
    const cases = [[key, '1'], [key.toLowerCase(), '1'], [titleCase(key), '1'], [key, 'true'], [key, 'yes'], [key, '0']];
    for (const [name, value] of cases) {
      const plain = f.git([...args, ...WALK], { [name]: value });
      const outcome = withEnv({ GIT_CONFIG_GLOBAL: f.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: '1', [name]: value }, () => mod.checkHandoff(f.root, 'T-900'));
      const rep = mod.report(outcome);
      const named = outcome.result === 'FAIL' && outcome.commit === f.b && outcome.reason === want;
      rows.push({ name, value, live: plain.code !== 0, result: outcome.result, named });
      say(name + '=' + value + ': plain git ' + (args.length ? args.join(' ') + ' ' : '') + WALK.join(' ') + ' exit ' + plain.code + ' (live: ' + (plain.code !== 0 ? 'yes' : 'no') + '); checkHandoff ' + outcome.result + ' (' + outcome.reason + '); report exit ' + rep.code + (named ? '; names the true latest code commit B' : ''));
    }
  }
  return rows;
}

async function gitTest(which) {
  const base = mkdtempSync(join(tmpdir(), 't036-gittest-'));
  try {
    const file = join(base, 'module', MODULE);
    const text = which === 'before' ? execFileSync('git', ['show', START + ':' + MODULE], { cwd: ROOT, encoding: 'utf8', windowsHide: true }) : readFileSync(join(ROOT, PROPOSED, MODULE), 'utf8');
    place(join(base, 'module'), MODULE, text);
    const mod = await loadModule(file, which);
    const f = staleFixture(base);
    say('module: ' + (which === 'before' ? MODULE + ' at START ' + START : PROPOSED + '/' + MODULE + ' (proposed)') + '; ' + text.split('\n').find((line) => line.startsWith('const FORCED_ENV')));
    say('fixture: stale Handoff; commit A ' + f.a.slice(0, 7) + ' (Add the game), Handoff names A, then code commit B ' + f.b.slice(0, 7) + ' (Fix the wall bounce) is the true latest code commit; checkHandoff runs with an empty GIT_CONFIG_GLOBAL and GIT_CONFIG_NOSYSTEM=1, every other GIT_ name removed for the call and restored after it');
    const rows = gitTestCases(mod, f);
    const set = rows.filter((row) => row.value !== '0');
    const zero = rows.filter((row) => row.value === '0');
    say('summary: variable set to 1/true/yes in ' + set.length + ' cases, live in ' + set.filter((row) => row.live).length + ', SKIP in ' + set.filter((row) => row.result === 'SKIP').length + ', FAIL naming B in ' + set.filter((row) => row.named).length + '; value 0 in ' + zero.length + ' cases, FAIL naming B in ' + zero.filter((row) => row.named).length);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('fixture folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

const PASS_SNIPPETS = [C + ".log('x')", C + '.log("a %s", v)', C + '.error(`plain`)', U + ".format('%s', v)", C + ".info( 'x', a + b )", C + '.log()'];
const HIT_SNIPPETS = [C + '.log(v)', C + '.log(v, w)', C + ".warn('a' + v)", C + '.error(`a ${v}`)', U + '.format(fmt, v)', C + '.info(obj.msg)', C + "(\n  'x'\n);".replace('(', '.log(')];
const EXTRA_HIT = [C + ".log('a'\n  + v);", C + '.log(`a\n${v}`);', C + ".log('a'.concat(v));", 'globalThis.' + C + '.log(v);', C + ".log('a' ? v : w);", C + '.log(1);', C + ".log(('a' + v));"];
const EXTRA_PASS = [C + ".log('%s', `a ${v}`)",C + ".log ('x', v)", C + ".log('it\\'s %s', v)", C + '.log("say \\"%s\\"", v)', 'my' + C + '.log(v)', C + "[method]('[game]', ...args)"];
const show = (snippet) => snippet.split('\n').join('\\n');

function guardCase(dir, env, file, snippet, expectHit) {
  place(dir, file, snippet + '\n');
  const r = run('bash', ['scripts/guards.sh'], dir, env);
  rmSync(join(dir, file));
  const lines = r.stdout.split('\n');
  const fmt = lines.includes(FORMAT_FAIL + ": First argument of console.* and util.format must be a fixed string; use '%s' and pass the value after it");
  const at = lines.filter((line) => line.startsWith(file + ':')).map((line) => line.split(':').slice(0, 2).join(':'));
  const debug = lines.some((line) => line.startsWith('GUARD FAIL [no-debug-prints]'));
  const others = lines.filter((line) => line.startsWith('GUARD FAIL') && !line.startsWith(FORMAT_FAIL) && !line.startsWith('GUARD FAIL [no-debug-prints]'));
  const ok = expectHit ? fmt && r.code === 1 && at.length > 0 : !fmt && (r.code === 0 || (debug && file.startsWith('src/')));
  return { ok, text: (ok ? 'ok    ' : 'WRONG ') + file + ' `' + show(snippet) + '` -> exit ' + r.code + ', format guard ' + (fmt ? 'HIT at ' + [...new Set(at)].join(' ') : 'no hit') + (debug ? ', no-debug-prints fires too' : '') + (others.length ? ', other: ' + others.join(' | ') : '') + ', file removed: ' + (existsSync(join(dir, file)) ? 'no' : 'yes') };
}

function formatGuard() {
  const base = mkdtempSync(join(tmpdir(), 't036-format-'));
  try {
    const dir = headScratch(base);
    const env = cleanEnv(base);
    const clean = run('bash', ['scripts/guards.sh'], dir, env);
    say('scratch copy of the task head with the four proposed files; guards.sh before planting: exit ' + clean.code + ', output ' + JSON.stringify(clean.stdout));
    const folders = ['scripts', 'tests', 'sim', 'src', 'agent-team/evidence/T-999', 'src/deep/a'];
    let wrong = 0;
    let count = 0;
    const record = (result) => {
      count += 1;
      if (!result.ok) wrong += 1;
      say(result.text);
    };
    say('brief cases, one planted file at a time, .mjs and .js in each covered folder (src/deep/a shows any depth):');
    for (const folder of folders) {
      for (const ext of ['.mjs', '.js']) {
        const file = folder + '/planted-format' + ext;
        for (const snippet of PASS_SNIPPETS) record(guardCase(dir, env, file, snippet, false));
        for (const snippet of HIT_SNIPPETS) record(guardCase(dir, env, file, snippet, true));
      }
    }
    say('owner extras in scripts/ (.mjs): stricter cases the rule makes hits, and lines that must pass');
    for (const snippet of EXTRA_HIT) record(guardCase(dir, env, 'scripts/planted-format.mjs', snippet, true));
    for (const snippet of EXTRA_PASS) record(guardCase(dir, env, 'scripts/planted-format.mjs', snippet, false));
    say('places that are not checked: the same hit text gives no format-guard line');
    for (const file of ['docs/x.mjs', 'agent-team/tasks/x.mjs', 'node_modules/x/x.mjs', 'src/node_modules/x/x.mjs', 'scripts/x.cjs', 'scripts/x.ts']) {
      for (const snippet of [C + '.log(v)', U + '.format(fmt, v)']) record(guardCase(dir, env, file, snippet, false));
    }
    say('cases: ' + count + ', as expected: ' + (count - wrong) + ', wrong: ' + wrong);
    const left = run('git', ['status', '--porcelain'], dir, env);
    say('guards.sh after all cases: exit ' + run('bash', ['scripts/guards.sh'], dir, env).code + '; scratch is not a git repo (git status exit ' + left.code + '), so removal is checked per file above');
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

function semgrep() {
  const base = mkdtempSync(join(tmpdir(), 't036-semgrep-'));
  const file = 'agent-team/evidence/T-033/time-options.mjs';
  try {
    const dir = headScratch(base);
    const env = cleanEnv(base);
    const fixed = readFileSync(join(dir, file), 'utf8');
    const before = execFileSync('git', ['show', '5c90a51^:' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    const diff = run('git', ['diff', '-U0', '5c90a51^', '5c90a51', '--', file], ROOT, process.env);
    say('git diff -U0 5c90a51^ 5c90a51 -- ' + file + ' (the line the CI semgrep rule flagged and its fix):');
    for (const line of diff.stdout.trimEnd().split('\n')) say('  ' + line);
    writeFileSync(join(dir, file), before);
    const pre = run('bash', ['scripts/guards.sh'], dir, env);
    say('proposed guards.sh on the pre-fix file (5c90a51^): exit ' + pre.code);
    for (const line of pre.stdout.trimEnd().split('\n')) say('  ' + line);
    writeFileSync(join(dir, file), fixed);
    const post = run('bash', ['scripts/guards.sh'], dir, env);
    say('proposed guards.sh on the fixed file (5c90a51 and later): exit ' + post.code + ', output ' + JSON.stringify(post.stdout));
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

function guardsMaster() {
  const base = mkdtempSync(join(tmpdir(), 't036-master-'));
  try {
    const env = cleanEnv(base);
    const master = exportRef(BASE, join(base, 'master'));
    copyFileSync(join(ROOT, PROPOSED, 'scripts/guards.sh'), join(master, 'scripts/guards.sh'));
    const a = run('bash', ['scripts/guards.sh'], master, env);
    say('(a) scratch export of BASE ' + BASE + ' (no sim fix) with the proposed guards.sh: exit ' + a.code);
    for (const line of a.stdout.trimEnd().split('\n')) say('  ' + line);
    const head = headScratch(base);
    const b = run('bash', ['scripts/guards.sh'], head, env);
    say('(b) scratch copy of the task head with all four proposed files: exit ' + b.code + ', output ' + JSON.stringify(b.stdout));
    const old = exportRef('HEAD', join(base, 'old'));
    const c1 = run('bash', ['scripts/guards.sh'], old, env);
    const c2 = run('bash', ['scripts/guards.sh'], head, env);
    say('(c) clean tree of the task head: BASE guards.sh exit ' + c1.code + ' output ' + JSON.stringify(c1.stdout) + '; proposed guards.sh exit ' + c2.code + ' output ' + JSON.stringify(c2.stdout) + '; same: ' + (c1.code === c2.code && c1.stdout === c2.stdout ? 'yes' : 'no'));
    const plants = [['src/planted.js', 'export const todo = 1;\n'.replace('todo', 'TO' + 'DO')], ['src/game.js', null]];
    for (const [file, text] of plants) {
      const results = [old, head].map((dir) => {
        const original = readFileSync(join(dir, file === 'src/game.js' ? file : 'src/game.js'), 'utf8');
        if (text === null) appendFileSync(join(dir, file), C + ".log('x');\n");
        else writeFileSync(join(dir, file), text);
        const r = run('bash', ['scripts/guards.sh'], dir, env);
        if (text === null) writeFileSync(join(dir, file), original);
        else rmSync(join(dir, file));
        return r;
      });
      const label = text === null ? "console.log('x') appended to src/game.js" : 'TODO in a new src/planted.js';
      say('(d) ' + label + ': BASE guards.sh exit ' + results[0].code + ', proposed exit ' + results[1].code + ', same output: ' + (results[0].stdout === results[1].stdout ? 'yes' : 'no'));
      for (const line of results[1].stdout.trimEnd().split('\n')) say('  ' + line);
    }
    const e = run('git', ['diff', '--no-index', '-U0', join(old, 'scripts/guards.sh'), join(head, 'scripts/guards.sh')], base, env);
    const changed = e.stdout.split('\n').filter((line) => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'));
    say('(e) diff of BASE and proposed guards.sh: ' + changed.filter((line) => line.startsWith('+')).length + ' added, ' + changed.filter((line) => line.startsWith('-')).length + ' deleted lines');
    for (const line of e.stdout.trimEnd().split('\n').filter((row) => !row.startsWith('diff --git') && !row.startsWith('index ') && !row.startsWith('---') && !row.startsWith('+++'))) say('  ' + line);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

const DIRTY_CASES = [
  ['clean checkout', 'no', () => {}],
  ['tracked src/game.js changed, unstaged', 'yes', (r) => appendFileSync(join(r.dir, 'src/game.js'), '\n')],
  ['tracked src/game.js changed, staged', 'yes', (r) => { appendFileSync(join(r.dir, 'src/game.js'), '\n'); r.git(['add', 'src/game.js']); }],
  ['tracked docs/ARCHITECTURE.md deleted', 'yes', (r) => rmSync(join(r.dir, 'docs/ARCHITECTURE.md'))],
  ['tracked docs/ARCHITECTURE.md deleted and staged', 'yes', (r) => r.git(['rm', '-q', 'docs/ARCHITECTURE.md'])],
  ['new untracked src/extra.js', 'yes', (r) => place(r.dir, 'src/extra.js', 'export const extra = 1;\n')],
  ['new untracked tests/extra.mjs', 'yes', (r) => place(r.dir, 'tests/extra.mjs', 'export const extra = 1;\n')],
  ['new untracked scripts/extra.mjs', 'yes', (r) => place(r.dir, 'scripts/extra.mjs', 'export const extra = 1;\n')],
  ['new untracked sim/extra.mjs', 'yes', (r) => place(r.dir, 'sim/extra.mjs', 'export const extra = 1;\n')],
  ['new untracked scenarios/extra.json', 'yes', (r) => place(r.dir, 'scenarios/extra.json', '{}\n')],
  ['new untracked expected/extra.json', 'yes', (r) => place(r.dir, 'expected/extra.json', '{}\n')],
  ['untracked index.html (untracked in a commit, file left in place)', 'yes', (r) => { r.git(['rm', '-q', '--cached', 'index.html']); r.git([...WHO, 'commit', '-q', '-m', 'Untrack index.html']); }],
  ['owner extra: new untracked src/node_modules/x.js', 'yes', (r) => place(r.dir, 'src/node_modules/x.js', 'export const extra = 1;\n')],
  ['owner extra: new untracked top-level node_modules.js', 'yes', (r) => place(r.dir, 'node_modules.js', 'export const extra = 1;\n')],
  ['owner extra: agent-team/tasks/T-036.md moved to src/moved.md (staged rename)', 'yes', (r) => r.git(['mv', 'agent-team/tasks/T-036.md', 'src/moved.md'])],
  ['owner extra: new untracked docs/new.md', 'yes', (r) => place(r.dir, 'docs/new.md', 'New.\n')],
  ['agent-team/ only: tracked brief changed and staged, new untracked agent-team/notes.md', 'no', (r) => { appendFileSync(join(r.dir, 'agent-team/tasks/T-036.md'), 'x\n'); r.git(['add', 'agent-team/tasks/T-036.md']); place(r.dir, 'agent-team/notes.md', 'Notes.\n'); }],
  ['untracked node_modules/ with no .gitignore (worktree after npm ci, CI)', 'no', (r) => place(r.dir, 'node_modules/x/index.js', 'export const x = 1;\n')],
  ['untracked top-level .gitignore (main checkout)', 'no', (r) => place(r.dir, '.gitignore', 'node_modules/\n')],
  ['untracked .gitignore and node_modules/ together', 'no', (r) => { place(r.dir, '.gitignore', 'node_modules/\n'); place(r.dir, 'node_modules/x/index.js', 'export const x = 1;\n'); }],
];

function verifyRun(dir, env, task = 'T-036-dirty') {
  const r = run('bash', ['scripts/verify.sh', task, '--feature', 'config'], dir, env);
  const log = join(dir, 'agent-team/evidence', task, 'run-config.log');
  const lines = existsSync(log) ? readFileSync(log, 'utf8').split('\n') : [];
  const result = lines.find((line) => line.startsWith('RESULT:')) || 'no RESULT line';
  const fails = lines.filter((line) => line.startsWith('FAIL '));
  return { code: r.code, head: lines.slice(0, 2), result, fails, stdoutHead: r.stdout.split('\n').slice(0, 2) };
}

const shape = (line) => line.replace(/[0-9a-f]{7,}/, '<hash>').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/, '<time>');

function dirtyCases(variant, only) {
  const base = mkdtempSync(join(tmpdir(), 't036-dirty-'));
  try {
    const env = cleanEnv(base);
    const scratch = headScratch(base);
    if (variant) writeFileSync(join(scratch, 'scripts/verify.sh'), variant(readFileSync(join(scratch, 'scripts/verify.sh'), 'utf8')));
    const baseVerify = execFileSync('git', ['show', BASE + ':scripts/verify.sh'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    const dir = join(base, 'repo');
    cpSync(scratch, dir, { recursive: true });
    const git = fixtureGit(dir, env);
    git(['init', '-q']);
    git(['symbolic-ref', 'HEAD', 'refs/heads/master']);
    git(['add', '-A']);
    git([...WHO, 'commit', '-q', '-m', 'Scratch copy of the task head with the proposed files']);
    const top = git(['rev-parse', 'HEAD']).stdout.trim();
    const r = { dir, git };
    let wrong = 0;
    for (const [name, expect, apply] of DIRTY_CASES.filter(([, expect]) => !only || expect === only)) {
      apply(r);
      const porcelain = git(['status', '--porcelain', '--no-renames']).stdout.trimEnd().split('\n').filter(Boolean);
      const v = verifyRun(dir, env);
      const got = (v.head[1] || '').replace('dirty: ', '');
      if (got !== expect) wrong += 1;
      say((got === expect ? 'ok    ' : 'WRONG ') + name + ': expected dirty: ' + expect + ', log line 2 "' + v.head[1] + '"; git status --porcelain before the run: ' + (porcelain.length ? porcelain.slice(0, 4).join(' | ') + (porcelain.length > 4 ? ' | ... (' + porcelain.length + ' lines)' : '') : '(empty)'));
      say('       log line 1 shape "' + shape(v.head[0] || '') + '"; terminal lines 1-2 match the log: ' + (v.stdoutHead.join('\n') === v.head.join('\n') ? 'yes' : 'no') + '; ' + v.result + ', exit ' + v.code + (v.fails.length ? ', ' + v.fails.join(', ') : ''));
      if (name === 'clean checkout' && !variant) {
        place(dir, 'scripts/verify-base.sh', baseVerify);
        const b = run('bash', ['scripts/verify-base.sh', 'T-036-base', '--feature', 'config'], dir, env);
        const baseLog = readFileSync(join(dir, 'agent-team/evidence/T-036-base/run-config.log'), 'utf8').split('\n');
        say('       BASE verify.sh in the same repo: log line 1 shape "' + shape(baseLog[0]) + '", line 2 "' + baseLog[1] + '"; ' + (baseLog.find((line) => line.startsWith('RESULT:')) || '') + ', exit ' + b.code + '; line 1 shape same as the proposed log: ' + (shape(baseLog[0]) === shape(v.head[0]) ? 'yes' : 'no'));
      }
      git(['reset', '-q', '--hard', top]);
      git(['clean', '-fdxq']);
    }
    if (!only) {
      const plain = verifyRun(scratch, env);
      say('not a git repo (the plain scratch copy, git rev-parse there exits ' + run('git', ['rev-parse', '--git-dir'], scratch, env).code + '): log line 1 "' + scrub(plain.head[0]).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/, '<time>') + '", line 2 "' + plain.head[1] + '"; ' + plain.result + ', exit ' + plain.code);
      if (plain.head[1] !== 'dirty: unknown') wrong += 1;
      const missing = verifyRun(dir, { ...env, GIT_DIR: join(base, 'no-such-git-dir') });
      say('git fails (GIT_DIR set to a folder that does not exist, in the clean repo): log line 1 "' + shape(missing.head[0]) + '", line 2 "' + missing.head[1] + '"; ' + missing.result + ', exit ' + missing.code);
      if (missing.head[1] !== 'dirty: unknown') wrong += 1;
    }
    say('cases with the wrong dirty value: ' + wrong);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

function tapNames(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^(\s*)(not ok|ok) \d+ - (.*?)(\s+# (SKIP|TODO).*)?$/);
    if (m) rows.push({ name: m[1].length / 4 + ':' + m[3], ok: m[2] === 'ok', skip: Boolean(m[4]) });
  }
  return rows;
}

function tapSummary(text) {
  const value = (key) => (text.split('\n').find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2];
  return 'tests ' + value('tests') + ', pass ' + value('pass') + ', fail ' + value('fail') + ', skipped ' + value('skipped');
}

function allTests(dir, env, files) {
  const list = files || readdirSync(join(dir, 'tests')).filter((name) => name.endsWith('.test.js')).sort().map((name) => 'tests/' + name);
  return run(process.execPath, ['--test', '--test-reporter=tap', ...list], dir, env);
}

function scratchVerify() {
  const base = mkdtempSync(join(tmpdir(), 't036-verify-'));
  const names = [];
  try {
    const env = cleanEnv(base);
    const dir = headScratch(base);
    const v = run('bash', ['scripts/verify.sh', 'T-036-scratch', '--feature', 'config'], dir, env);
    say('$ ./scripts/verify.sh T-036-scratch --feature config   (scratch copy of the task head with the four proposed files and the sim fix; not a git repo)');
    say('exit ' + v.code);
    for (const line of v.stdout.trimEnd().split('\n')) say('  ' + line);
    const log = readFileSync(join(dir, 'agent-team/evidence/T-036-scratch/run-config.log'), 'utf8');
    const summary = log.split('\n').filter((line) => line.startsWith('\u2139 '));
    say('unit-test summary from the log: ' + summary.join('; '));
    const g = run('bash', ['scripts/guards.sh'], dir, env);
    say('$ ./scripts/guards.sh -> exit ' + g.code + ', output ' + JSON.stringify(g.stdout));
    const t = run(process.execPath, ['--test', '--test-reporter=tap', TEST], dir, env);
    say('$ node --test tests/handoff-check.test.js -> exit ' + t.code + ', ' + tapSummary(t.stdout));
    const n = run(process.execPath, ['scripts/no-comments.mjs'], dir, env);
    say('$ node scripts/no-comments.mjs -> exit ' + n.code + ', output ' + JSON.stringify(n.stdout));
    const start = exportRef(START, join(base, 'start'));
    const before = allTests(start, env);
    const after = allTests(dir, env);
    const b = tapNames(before.stdout);
    const a = tapNames(after.stdout);
    const byName = new Map(a.map((row) => [row.name, row]));
    const missing = b.filter((row) => !byName.has(row.name));
    const notPassing = b.filter((row) => byName.has(row.name) && !byName.get(row.name).ok);
    const known = new Set(b.map((row) => row.name));
    const added = a.filter((row) => !known.has(row.name));
    names.push('all tests/*.test.js with the TAP reporter, outside any repo');
    names.push('before (export of START ' + START + '): exit ' + before.code + ', ' + tapSummary(before.stdout) + ', ' + b.length + ' result lines');
    names.push('after (scratch copy with the proposed files): exit ' + after.code + ', ' + tapSummary(after.stdout) + ', ' + a.length + ' result lines');
    names.push('before names missing after: ' + missing.length + (missing.length ? ' (' + missing.map((row) => row.name).join(' | ') + ')' : ''));
    names.push('before names that do not pass after: ' + notPassing.length + (notPassing.length ? ' (' + notPassing.map((row) => row.name).join(' | ') + ')' : ''));
    names.push('skipped before: ' + b.filter((row) => row.skip).map((row) => row.name).join(' | '));
    names.push('skipped after: ' + a.filter((row) => row.skip).map((row) => row.name).join(' | '));
    names.push('new names after (' + added.length + '), each passing: ' + (added.every((row) => row.ok) ? 'yes' : 'no'));
    for (const row of added) names.push('  ' + (row.ok ? 'ok ' : 'not ok ') + row.name);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
  if (process.argv[3]) writeFileSync(process.argv[3], names.map(scrub).join('\n') + '\n');
}

function failing(dir, env) {
  const t = run(process.execPath, ['--test', '--test-reporter=tap', TEST], dir, env);
  const rows = tapNames(t.stdout).filter((row) => !row.ok);
  return 'exit ' + t.code + ', ' + tapSummary(t.stdout) + '; failing: ' + (rows.map((row) => row.name).join(' | ') || 'none');
}

function edit(dir, file, from, to) {
  const path = join(dir, file);
  const original = readFileSync(path, 'utf8');
  if (original.split(from).length !== 2) throw new Error('edit: text not found once in ' + file + ': ' + from);
  writeFileSync(path, original.split(from).join(to));
  return () => writeFileSync(path, original);
}

async function negative() {
  const base = mkdtempSync(join(tmpdir(), 't036-negative-'));
  try {
    const env = cleanEnv(base);
    const dir = headScratch(base);
    const f = staleFixture(base);
    say('scratch copy of the task head with the four proposed files; every change below is made in the scratch copy only, one at a time, and undone after it');
    say('baseline: node --test tests/handoff-check.test.js -> ' + failing(dir, env));
    let tag = 0;
    const entries = { GIT_TEST_ASSUME_DIFFERENT_OWNER: ", GIT_TEST_ASSUME_DIFFERENT_OWNER: '0'", GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE: ", GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE: '0'" };
    for (const [label, change] of [['(a) removed', () => ''], ['(b) set to 1', (text) => text.replace("'0'", "'1'")]]) {
      for (const [key, text] of Object.entries(entries)) {
        const undo = edit(dir, MODULE, text, change(text));
        say(label + ' ' + key + ' in FORCED_ENV: ' + failing(dir, env));
        if (label.startsWith('(a)')) {
          tag += 1;
          const mod = await loadModule(join(dir, MODULE), 'neg' + tag);
          const rows = gitTestCases(mod, f).filter((row) => row.value !== '0' && VARS.some(([name]) => name === key && name.toUpperCase() === row.name.toUpperCase()));
          say('    Done-when 5 cases for ' + key + ' with this module: ' + rows.length + ' cases, SKIP in ' + rows.filter((row) => row.result === 'SKIP').length);
        }
        undo();
      }
    }
    let undo = edit(dir, TEST, "repo.env[name] = '1';\n          await assert.rejects", 'await assert.rejects');
    say('(c) liveness step run without the variable (the repo.env line before assert.rejects removed): ' + failing(dir, env));
    undo();
    undo = edit(dir, TEST, "caseTable('GIT_GRAFT_FILE', (name) => {", "((key, table) => table)('GIT_GRAFT_FILE', (name) => {");
    say('(d) GIT_GRAFT_FILE caseVariants table removed (its tests are not registered): ' + failing(dir, env));
    undo();
    undo = edit(dir, TEST, ", 'GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE']) {", ']) {');
    say('(d) GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE caseVariants table removed: ' + failing(dir, env));
    undo();
    undo = edit(dir, TEST, "for (const key of ['GIT_NO_LAZY_FETCH', 'GIT_NO_REPLACE_OBJECTS'])", "for (const key of ['GIT_NO_REPLACE_OBJECTS'])");
    say('(d) GIT_NO_LAZY_FETCH caseVariants table removed: ' + failing(dir, env));
    undo();
    undo = edit(dir, MODULE, "GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE: '0' };", "GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE: '0', GIT_TEST_DUMMY: '0' };");
    say("(e) GIT_TEST_DUMMY: '0' added to FORCED_ENV with no table: " + failing(dir, env));
    undo();
    say('after the controls: ' + failing(dir, env));
    for (const folder of ['scripts', 'tests', 'sim', 'src', 'agent-team/evidence/T-999']) {
      const file = folder + '/planted-negative.mjs';
      place(dir, file, 'export const v = 1;\n' + C + '.log(v);\n');
      const g = run('bash', ['scripts/guards.sh'], dir, env);
      const v = run('bash', ['scripts/verify.sh', 'T-036-scratch', '--feature', 'config'], dir, env);
      rmSync(join(dir, file));
      const named = g.stdout.split('\n').filter((line) => line.startsWith(file + ':'));
      say('(f) ' + C + '.log(v) planted in ' + file + ' line 2: guards.sh exit ' + g.code + ', format guard line: ' + (g.stdout.includes(FORMAT_FAIL) ? 'yes' : 'no') + ', names ' + named.map((line) => line.split(':').slice(0, 2).join(':')).join(' and ') + '; verify.sh: ' + v.stdout.split('\n').filter((line) => line === 'FAIL guards' || line.startsWith('RESULT:')).join(', ') + ', exit ' + v.code);
    }
    const g = run('bash', ['scripts/guards.sh'], dir, env);
    say('guards.sh after (f): exit ' + g.code + ', output ' + JSON.stringify(g.stdout));
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

function timed(dir) {
  const t = run(process.execPath, ['--test', '--test-reporter=tap', TEST], dir, process.env);
  const value = (key) => Number((t.stdout.split('\n').find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  return { tests: value('tests'), pass: value('pass'), fail: value('fail'), skipped: value('skipped'), ms: Math.round(value('duration_ms')) };
}

function time() {
  const base = mkdtempSync(join(tmpdir(), 't036-time-'));
  try {
    const sides = { base: join(base, 'base'), proposed: join(base, 'proposed') };
    for (const file of [MODULE, TEST, 'package.json']) {
      place(sides.base, file, execFileSync('git', ['show', BASE + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));
      place(sides.proposed, file, file === 'package.json' ? readFileSync(join(ROOT, file), 'utf8') : readFileSync(join(ROOT, PROPOSED, file), 'utf8'));
    }
    const times = { base: [], proposed: [] };
    for (let n = 1; n <= 3; n += 1) {
      for (const side of ['base', 'proposed']) {
        const r = timed(sides[side]);
        times[side].push(r.ms);
        say(side + ' run ' + n + ': tests ' + r.tests + ', pass ' + r.pass + ', fail ' + r.fail + ', skipped ' + r.skipped + ', ' + r.ms + ' ms');
      }
    }
    const average = (list) => Math.round(list.reduce((x, y) => x + y, 0) / list.length);
    const difference = average(times.proposed) - average(times.base);
    say('average base ' + average(times.base) + ' ms, proposed ' + average(times.proposed) + ' ms, difference ' + difference + ' ms (limit 1000 ms): ' + (difference <= 1000 ? 'within' : 'over') + ' the limit');
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

function apply() {
  const base = mkdtempSync(join(tmpdir(), 't036-apply-'));
  try {
    const env = cleanEnv(base);
    const dir = exportRef('HEAD', join(base, 'repo'));
    const git = fixtureGit(dir, env);
    git(['init', '-q']);
    git(['symbolic-ref', 'HEAD', 'refs/heads/human-apply']);
    git(['add', '-A']);
    const executable = execFileSync('git', ['ls-tree', '-r', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).split('\n').filter((row) => row.startsWith('100755 ')).map((row) => row.split('\t')[1]);
    for (const file of executable) git(['update-index', '--chmod=+x', file]);
    git([...WHO, 'commit', '-q', '-m', 'Task head']);
    say('throw-away git repo made from the task head (git archive HEAD), branch human-apply, the 100755 modes of HEAD set in its index: ' + executable.join(', '));
    for (const file of FILES) {
      const r = run('cp', [PROPOSED + '/' + file, file], dir, env);
      say('$ cp ' + PROPOSED + '/' + file + ' ' + file + '   -> exit ' + r.code + (r.out ? ', ' + r.out.trim() : ''));
    }
    for (const args of [['diff', '--stat'], ['ls-files', '-s', 'scripts/guards.sh', 'scripts/verify.sh']]) {
      const r = git(args);
      say('$ git ' + args.join(' ') + '   -> exit ' + r.code);
      for (const line of r.out.trimEnd().split('\n')) say('  ' + line);
    }
    const v = run('bash', ['scripts/verify.sh', 'T-036-applied', '--feature', 'all'], dir, env);
    say('$ ./scripts/verify.sh T-036-applied --feature all   -> exit ' + v.code);
    for (const line of v.stdout.trimEnd().split('\n')) say('  ' + line);
    const log = readFileSync(join(dir, 'agent-team/evidence/T-036-applied/run-all.log'), 'utf8').split('\n');
    say('log line 2: ' + log[1]);
    const g = run('bash', ['scripts/guards.sh'], dir, env);
    say('$ ./scripts/guards.sh   -> exit ' + g.code + ', output ' + JSON.stringify(g.stdout));
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  say('scratch folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
}

const READER_PATTERN = "commit: |branch: |RESULT|\\$LOG|[-.]log[\"'`)]|-(config|all|render|input|movement|hits|turns|balance)\\.log|head -(n ?)?[0-9]|tail -(n ?)?[0-9]|sed -n|lines\\[[0-9]\\]|split\\([^)]*\\)\\[[0-9]\\]|readline";

function headerReaders() {
  const code = ['--include=*.js', '--include=*.mjs', '--include=*.cjs', '--include=*.sh', '--include=*.py', '--include=*.ps1'];
  const scopes = [[['scripts', 'tests', 'sim', 'src', 'agent-team/evidence'], code], [['agent-team/evals', '.claude'], []]];
  say('$ grep -rnE --exclude-dir=node_modules [--include=*.js *.mjs *.cjs *.sh *.py *.ps1 for code folders; every file in agent-team/evals and .claude] -e <pattern> <folders>');
  say('pattern: ' + READER_PATTERN);
  for (const [folders, includes] of scopes) {
    const r = run('grep', ['-rnE', '--exclude-dir=node_modules', ...includes, '-e', READER_PATTERN, ...folders], ROOT, process.env);
    say('folders ' + folders.join(' ') + (includes.length ? ' (code files)' : ' (all files)') + ': grep exit ' + r.code + ', ' + (r.stdout.trim() ? r.stdout.trim().split('\n').length : 0) + ' lines');
    for (const line of r.stdout.trimEnd().split('\n').filter(Boolean)) say('  ' + (line.length > 220 ? line.slice(0, 220) + ' ...' : line));
  }
}

const STEPS = {
  apply,
  'header-readers': headerReaders,
  'git-test-before': () => gitTest('before'),
  'git-test-after': () => gitTest('after'),
  'format-guard': formatGuard,
  semgrep,
  'guards-master': guardsMaster,
  dirty: () => dirtyCases(null),
  'dirty-always-no': () => dirtyCases((text) => text.split('echo "dirty: $DIRTY"').join('echo "dirty: no"'), 'yes'),
  'scratch-verify': scratchVerify,
  negative,
  time,
};

async function main() {
  if (!STEPS[STEP]) throw new Error('use one of: ' + Object.keys(STEPS).join(', '));
  try {
    await STEPS[STEP]();
  } finally {
    say('process.env holds the same GIT_ names as at the start: ' + (gitNames().join(',') === START_NAMES.join(',') ? 'yes' : 'no'));
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
    process.stdout.write(scrub('proof.mjs ' + STEP + ', run from the worktree at ' + head + ', platform ' + process.platform + ', node ' + process.version + ', ' + execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim()) + '\n' + out.join('\n') + '\n');
  }
}

await main();
