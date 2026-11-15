import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULE = 'scripts/handoff-check.mjs';
const BASE = '838a3ae';
const ROUND1 = 'e70a264';
const ROUND1_LINE = 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE];';
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false'];
const BRANCH = 'refs/heads/task/T-900-probe';
const BRIEF = ['# T-900 probe', 'Status: IN REVIEW', '', '## Handoff', '- Latest code commit: 0000000.', ''].join('\n');
const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);

const VARIANTS = [
  { name: 'round 1 module (e70a264), :(exclude)agent-team/', line: null },
  { name: 'round 1 module with :(exclude)agent-team/*', line: 'const CODE_PATHS = [\'.\', \':(exclude)\' + NOT_CODE + \'*\'];' },
  { name: 'round 1 module with :(exclude,glob)agent-team/**', line: 'const CODE_PATHS = [\'.\', \':(exclude,glob)agent-team/**\'];' },
  { name: 'round 1 module with :(exclude)agent-team (no slash)', line: 'const CODE_PATHS = [\'.\', \':(exclude)agent-team\'];' },
];

const CODE = ['add', 'src/game.js', 'a'];
const TEAM = ['add', 'agent-team/notes.md', 'n'];
const SCENARIOS = [
  ['root commit with code', [[CODE]]],
  ['root commit with agent-team/ only, then agent-team/ only', [[TEAM], [['add', 'agent-team/more.md', 'm']]]],
  ['rename into agent-team/', [[CODE, ['add', 'src/move.js', 'm']], [['rm', 'src/move.js'], ['add', 'agent-team/move.js', 'm']]]],
  ['rename out of agent-team/', [[CODE, TEAM], [['rm', 'agent-team/notes.md'], ['add', 'src/notes.md', 'n']]]],
  ['mode-only change inside agent-team/', [[CODE, TEAM], [['chmod', 'agent-team/notes.md']]]],
  ['mode-only change outside agent-team/', [[CODE, TEAM], [['chmod', 'src/game.js']]]],
  ['gitlink at src/sub added, changed, removed', [[CODE], [['gitlink', 'src/sub', H1]], [['gitlink', 'src/sub', H2]], [['rm', 'src/sub']]]],
  ['gitlink at agent-team/sub added, changed, removed', [[CODE], [['gitlink', 'agent-team/sub', H1]], [['gitlink', 'agent-team/sub', H2]], [['rm', 'agent-team/sub']]]],
  ['gitlink at agent-team added, changed, removed', [[CODE], [['gitlink', 'agent-team', H1]], [['gitlink', 'agent-team', H2]], [['rm', 'agent-team']]]],
  ['folder agent-team/ replaced by a gitlink agent-team and back', [[CODE, TEAM], [['gitlink', 'agent-team', H1]], [TEAM]]],
  ['symlink src/link to agent-team/notes.md', [[CODE, TEAM], [['link', 'src/link', 'agent-team/notes.md']]]],
  ['symlink agent-team/link to ../src/game.js', [[CODE], [['link', 'agent-team/link', '../src/game.js']]]],
  ['top-level symlink named agent-team added, changed, removed', [[CODE], [['link', 'agent-team', 'src']], [['link', 'agent-team', 'docs']], [['rm', 'agent-team']]]],
  ['top-level file named agent-team added, changed, removed', [[CODE], [['add', 'agent-team', 'x']], [['add', 'agent-team', 'y']], [['rm', 'agent-team']]]],
  ['file agent-team replaced by folder agent-team/ and back', [[CODE, ['add', 'agent-team', 'x']], [TEAM], [['add', 'agent-team', 'x']]]],
  ['names with spaces', [[CODE], [['add', 'agent-team/a b.md', 's']], [['add', 'src/a b.js', 's']]]],
  ['names with leading dashes', [[CODE], [['add', 'agent-team/-rf', 'd']], [['add', '-rf', 'd']], [['add', 'agent-team/--quiet', 'd']], [['add', '--quiet', 'd']]]],
  ['names that look like pathspec magic', [[CODE], [['add', 'agent-team/:(exclude)x', 'p']], [['add', ':(exclude)x', 'p']], [['add', ':(top)', 'p']], [['add', ':(exclude)agent-team/x', 'p']]]],
  ['non-ASCII names', [[CODE], [['add', 'agent-team/ü.md', 'u']], [['add', 'src/ü.js', 'u']], [['add', 'ägent-team/x', 'u']]]],
  ['glob characters', [[CODE], [['add', 'agent-team/*', 'g']], [['add', 'agent-team/[a]', 'g']], [['add', 'agent-team/?', 'g']], [['add', '*', 'g']], [['add', '[a]', 'g']], [['add', '?', 'g']], [['add', 'agent-team./x', 'g']], [['add', 'agent-team*x', 'g']], [['add', 'agent-tea?/x', 'g']]]],
  ['nested agent-team folders', [[CODE], [['add', 'agent-team/x/agent-team/y', 'n']], [['add', 'x/agent-team/y', 'n']]]],
  ['names that only start like agent-team', [[CODE], [['add', 'agent-team.txt', 'p']], [['add', 'agent-teams/n', 'p']], [['add', 'agent-team-x/n', 'p']]]],
  ['other case of agent-team', [[CODE], [['add', 'Agent-Team/x.md', 'c']], [['add', 'agent-team/X.md', 'c']], [['add', 'AGENT-TEAM/x.md', 'c']]]],
  ['empty commits', [[CODE], [], [TEAM], []]],
  ['deletions', [[CODE, TEAM, ['add', 'src/b.js', 'b']], [['rm', 'agent-team/notes.md']], [['rm', 'src/b.js']]]],
  ['folder src/dir replaced by a file and back', [[CODE, ['add', 'src/dir/x', 'd']], [['add', 'src/dir', 'f']], [['add', 'src/dir/x', 'd']]]],
  ['merge whose first-parent diff touches agent-team/ only while its second parent brought code', 'merge'],
];

const out = [];
const counts = new Map();

function cleanEnv(source, base) {
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  return { ...env, GIT_CONFIG_GLOBAL: join(base, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
}

function makeGit(dir, env) {
  return (args, input) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }).trim();
}

function apply(g, op) {
  const [kind, path, value] = op;
  const entry = (mode, hash) => g(['update-index', '--add', '--replace', '--cacheinfo', mode + ',' + hash + ',' + path]);
  if (kind === 'add') return entry('100644', g(['hash-object', '-w', '--stdin'], value));
  if (kind === 'link') return entry('120000', g(['hash-object', '-w', '--stdin'], value));
  if (kind === 'gitlink') return entry('160000', value);
  if (kind === 'chmod') return entry('100755', g(['rev-parse', ':' + path]));
  if (kind === 'rm') return g(['update-index', '--force-remove', '--', path]);
  throw new Error('unknown op ' + kind);
}

function commit(g, subject, parents) {
  const tree = g(['write-tree']);
  const hash = g([...WHO, 'commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', subject]);
  g(['update-ref', 'HEAD', hash]);
  return hash;
}

function head(g) {
  try {
    return [g(['rev-parse', '--verify', '-q', 'HEAD'])];
  } catch {
    return [];
  }
}

function summary(outcome, labels) {
  if (outcome.result === 'SKIP') return 'SKIP (' + outcome.reason + ')';
  return outcome.result + ' ' + (labels.get(outcome.commit) || outcome.commit);
}

function compare(dir, label, labels, modules) {
  const reference = summary(modules[0].checkHandoff(dir, 'T-900'), labels);
  const answers = modules.slice(1).map((mod) => summary(mod.checkHandoff(dir, 'T-900'), labels));
  const marks = answers.map((answer, i) => {
    const name = modules[i + 1].name;
    if (answer === reference) return 'same';
    counts.set(name, (counts.get(name) || 0) + 1);
    return 'DIFFERS: ' + answer;
  });
  out.push(label + ' | BASE: ' + reference + ' | ' + marks.map((mark, i) => '[' + (i + 1) + '] ' + mark).join(' | '));
}

function runScenario(base, index, title, steps, ignorecase, modules) {
  const dir = join(base, 'f' + index + '-' + ignorecase);
  mkdirSync(join(dir, 'agent-team', 'tasks'), { recursive: true });
  const g = makeGit(dir, cleanEnv(process.env, base));
  g(['init', '-q']);
  g(['symbolic-ref', 'HEAD', BRANCH]);
  g(['config', 'core.ignorecase', ignorecase]);
  g(['config', 'core.protectNTFS', 'false']);
  writeFileSync(join(dir, 'agent-team', 'tasks', 'T-900.md'), BRIEF);
  const labels = new Map();
  const prefix = (step) => title + ', ignorecase ' + ignorecase + ', ' + step;
  if (steps === 'merge') {
    apply(g, CODE);
    const root = commit(g, 'root', []);
    labels.set(root, 'root code commit');
    compare(dir, prefix('root code commit'), labels, modules);
    apply(g, ['add', 'src/side.js', 's']);
    const side = commit(g, 'side', [root]);
    labels.set(side, 'side code commit');
    compare(dir, prefix('side code commit on HEAD'), labels, modules);
    g(['read-tree', root]);
    g(['update-ref', 'HEAD', root]);
    apply(g, TEAM);
    const handoff = commit(g, 'handoff', [root]);
    labels.set(handoff, 'handoff commit');
    compare(dir, prefix('agent-team/ only commit on the first parent'), labels, modules);
    apply(g, ['add', 'agent-team/merge.md', 'm']);
    const merge = commit(g, 'merge', [handoff, side]);
    labels.set(merge, 'merge commit');
    compare(dir, prefix('merge commit'), labels, modules);
    return;
  }
  steps.forEach((ops, i) => {
    for (const op of ops) apply(g, op);
    const step = 'step ' + (i + 1) + (ops.length === 0 ? ' (empty commit)' : ': ' + ops.map((op) => op[0] + ' ' + op[1]).join(', '));
    labels.set(commit(g, title + ' ' + (i + 1), head(g)), 'step ' + (i + 1));
    compare(dir, prefix(step), labels, modules);
  });
}

async function load(base, name, text) {
  const file = join(base, 'modules', 'm' + name.length + '-' + Math.random().toString(16).slice(2) + '.mjs');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return { name, ...(await import(pathToFileURL(file).href)) };
}

async function main() {
  const show = (rev) => execFileSync('git', ['show', rev + ':' + MODULE], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const baseText = show(BASE);
  const round1Text = show(ROUND1);
  const headText = readFileSync(join(ROOT, MODULE), 'utf8');
  if (round1Text.split(ROUND1_LINE).length !== 2) throw new Error('the round 1 CODE_PATHS line is not there exactly once');
  const base = mkdtempSync(join(tmpdir(), 'handoff-r2-probe-'));
  try {
    writeFileSync(join(base, 'gitconfig'), '');
    for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith('GIT_')) delete process.env[key];
    process.env.GIT_CONFIG_GLOBAL = join(base, 'gitconfig');
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    const modules = [await load(base, 'BASE module (838a3ae)', baseText)];
    for (const variant of VARIANTS) modules.push(await load(base, variant.name, variant.line === null ? round1Text : round1Text.split(ROUND1_LINE).join(variant.line)));
    modules.push(await load(base, 'worktree module (this branch, as checked out)', headText));
    out.push('reference: ' + modules[0].name);
    modules.slice(1).forEach((mod, i) => out.push('[' + (i + 1) + '] ' + mod.name));
    out.push('worktree CODE_PATHS line: ' + headText.split('\n').find((row) => row.startsWith('const CODE_PATHS')));
    for (const ignorecase of ['false', 'true']) {
      SCENARIOS.forEach(([title, steps], index) => runScenario(base, index, title, steps, ignorecase, modules));
    }
    out.push('checkpoints: ' + out.filter((row) => row.includes(' | BASE: ')).length);
    modules.slice(1).forEach((mod, i) => out.push('divergences from BASE for [' + (i + 1) + '] ' + mod.name + ': ' + (counts.get(mod.name) || 0)));
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  out.push('probe folder removed: ' + (existsSync(base) ? 'no' : 'yes'));
  process.stdout.write('r2-probe.mjs, platform ' + process.platform + ', node ' + process.version + ', ' + execFileSync('git', ['--version'], { encoding: 'utf8' }).trim() + '\n' + out.join('\n') + '\n');
}

await main();
