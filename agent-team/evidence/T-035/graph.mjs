import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REF = process.argv[2];
const MODULE = 'scripts/handoff-check.mjs';
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const BRIEF = 'agent-team/tasks/T-900.md';
const WIN = process.platform === 'win32';
const NAME = 'GIT_TEST_COMMIT_GRAPH';
const NAMES = WIN ? [NAME, NAME.toLowerCase(), 'Git_Test_Commit_Graph'] : [NAME];
const VALUES = ['1', 'true', 'yes'];
const out = [];
const tally = { cases: 0, stale: 0, named: 0, other: 0, dead: 0 };

const short = (hash) => hash.slice(0, 7);
const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');
const moduleText = () => (REF === 'worktree' ? readFileSync(join(ROOT, MODULE), 'utf8') : execFileSync('git', ['show', REF + ':' + MODULE], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));
const gitNames = () => Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('GIT_'));
const START_NAMES = gitNames();

function place(dir, file, text) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
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

function forge(file, commit, parent) {
  const data = readFileSync(file);
  const chunk = (id) => Number(data.readBigUInt64BE(data.indexOf(id, 8, 'latin1') + 4));
  const oids = data.subarray(chunk('OIDL'), chunk('OIDL') + 20 * data.readUInt32BE(chunk('OIDF') + 1020));
  const position = (hash) => oids.indexOf(Buffer.from(hash, 'hex')) / 20;
  data.writeUInt32BE(position(parent), chunk('CDAT') + 36 * position(commit) + 20);
  createHash('sha1').update(data.subarray(0, -20)).digest().copy(data, data.length - 20);
  rmSync(file);
  return data;
}

function fixture(scratch, name) {
  const root = join(scratch, name);
  const global = join(scratch, name + '-gitconfig');
  writeFileSync(global, '');
  const baseEnv = { GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1' };
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), ...baseEnv };
  mkdirSync(root);
  const git = (args, extra = {}) => {
    try {
      return execFileSync('git', args, { cwd: root, env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    } catch (error) {
      return 'error (exit ' + error.status + ')';
    }
  };
  const commit = (subject, files) => {
    for (const [file, text] of Object.entries(files)) place(root, file, text);
    git(['add', '-A']);
    git([...WHO, 'commit', '-q', '-m', subject]);
    return git(['rev-parse', 'HEAD']);
  };
  git(['init', '-q']);
  git(['symbolic-ref', 'HEAD', 'refs/heads/' + BRANCH]);
  const a = commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief('(owner fills in)') });
  const handoff = commit('Handoff', { [BRIEF]: brief('- Latest code commit: ' + short(a) + '.') });
  const b = commit('Change the game', { 'src/game.js': 'export const a = 2;\n' });
  const c = commit('Revert the change', { 'src/game.js': 'export const a = 1;\n' });
  const d = commit('Notes', { 'agent-team/notes.md': 'Notes.\n' });
  const labels = { [a]: 'A', [handoff]: 'H', [b]: 'B', [c]: 'C', [d]: 'D' };
  const label = (hash) => labels[hash] || hash;
  return { root, git, a, handoff, b, c, d, label, info: join(root, '.git', 'objects', 'info'), baseEnv };
}

function single(f) {
  f.git(['commit-graph', 'write', '--reachable']);
  const file = join(f.info, 'commit-graph');
  writeFileSync(file, forge(file, f.d, f.handoff));
  return file;
}

function split(f) {
  f.git(['commit-graph', 'write', '--reachable', '--split']);
  const dir = join(f.info, 'commit-graphs');
  const chain = join(dir, 'commit-graph-chain');
  const old = readFileSync(chain, 'utf8').trim();
  const data = forge(join(dir, 'graph-' + old + '.graph'), f.d, f.handoff);
  const sum = data.toString('hex', data.length - 20);
  writeFileSync(join(dir, 'graph-' + sum + '.graph'), data);
  rmSync(chain);
  writeFileSync(chain, sum + '\n');
}

function shown(f, outcome) {
  const stale = outcome.result === 'PASS' && outcome.commit === f.a;
  const named = outcome.result === 'FAIL' && outcome.commit === f.c && outcome.reason === 'Handoff does not name ' + short(f.c) + '; latest code commit is ' + short(f.c) + ' (Revert the change)';
  const reason = outcome.reason.split(short(f.a)).join('<A>').split(short(f.c)).join('<C>');
  return outcome.result + ' naming ' + (outcome.commit ? f.label(outcome.commit) : 'none') + ' (reason: ' + reason + ')' + (stale ? ' = stale' : named ? ' = names the true latest code commit C' : '');
}

function parent(f, extra) {
  return f.label(f.git(['-c', 'core.commitGraph=false', 'rev-parse', 'HEAD^'], extra));
}

function row(mod, f, name, value, counted) {
  const extra = name ? { [name]: value } : {};
  const plain = parent(f, extra);
  const outcome = withEnv({ ...f.baseEnv, ...extra }, () => mod.checkHandoff(f.root, 'T-900'));
  const live = plain === 'H';
  if (counted) {
    tally.cases += 1;
    if (!live) tally.dead += 1;
    if (outcome.result === 'PASS' && outcome.commit === f.a) tally.stale += 1;
    else if (outcome.result === 'FAIL' && outcome.commit === f.c) tally.named += 1;
    else tally.other += 1;
  }
  const label = name ? name + '=' + value : 'no ' + NAME + ' variable';
  out.push('  ' + label + ': git -c core.commitGraph=false parent of D = ' + plain + (counted ? ' (live: ' + (live ? 'yes' : 'no') + ')' : '') + '; checkHandoff ' + shown(f, outcome));
}

async function main() {
  if (!REF) throw new Error('use <ref>');
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t035-graph-'));
  const commit = REF === 'worktree' ? 'the files of the folder the script runs from' : execFileSync('git', ['rev-parse', '--short', REF], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const forced = moduleText().split('\n').find((line) => line.startsWith('const FORCED_ENV'));
  try {
    place(join(scratch, 'module'), MODULE, moduleText());
    const mod = await import(pathToFileURL(join(scratch, 'module', MODULE)).href);
    out.push('module ' + MODULE + ' at ' + commit + ': ' + forced);
    out.push('fixture: A "Add the game" (code); H "Handoff" names A (agent-team/ only); B "Change the game" (code); C "Revert the change" (code back to A); D "Notes" (agent-team/ only, HEAD). True latest code commit: C');
    const f = fixture(scratch, 'single');
    out.push('no graph:');
    row(mod, f, null, null, false);
    single(f);
    out.push('case (i) single file .git/objects/info/commit-graph, D\'s first-parent index set to H, SHA-1 trailer recomputed:');
    row(mod, f, null, null, false);
    for (const name of NAMES) {
      for (const value of VALUES) row(mod, f, name, value, true);
      row(mod, f, name, '0', false);
    }
    const g = fixture(scratch, 'split');
    split(g);
    out.push('case (ii) split chain .git/objects/info/commit-graphs/, the layer\'s D first-parent index set to H, trailer recomputed, layer renamed and the chain file updated; no single-file graph:');
    row(mod, g, null, null, false);
    row(mod, g, NAME, '1', true);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  out.push('summary: ' + tally.cases + ' cases with the variable set to a true value; live for plain git in ' + (tally.cases - tally.dead) + '; checkHandoff stale PASS naming A in ' + tally.stale + ', FAIL naming C in ' + tally.named + ', other in ' + tally.other);
  out.push('process.env holds the same GIT_ names as at the start: ' + (gitNames().join(',') === START_NAMES.join(',') ? 'yes' : 'no'));
  out.push('scratch folder removed: ' + (existsSync(scratch) ? 'no' : 'yes'));
  process.stdout.write('graph.mjs, platform ' + process.platform + ', node ' + process.version + ', ' + execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim() + '\n' + out.join('\n') + '\n');
}

await main();
