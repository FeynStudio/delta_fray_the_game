import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REF = process.argv[2];
const PART = process.argv[3];
const MODULE = 'scripts/handoff-check.mjs';
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const BRIEF = 'agent-team/tasks/T-900.md';
const WIN = process.platform === 'win32';
const out = [];

const short = (hash) => hash.slice(0, 7);
const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');
const moduleText = () => (REF === 'worktree' ? readFileSync(join(ROOT, MODULE), 'utf8') : execFileSync('git', ['show', REF + ':' + MODULE], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));
const gitNames =() => Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('GIT_'));

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

async function loadModule(scratch) {
  const dir = join(scratch, 'module');
  place(dir, MODULE, moduleText());
  return import(pathToFileURL(join(dir, MODULE)).href);
}

function fixture(scratch, name) {
  const root = join(scratch, name);
  const global = join(scratch, name + '-gitconfig');
  writeFileSync(global, '');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1' };
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
  const labels = { [a]: 'A', [handoff]: 'H (the Handoff commit)', [b]: 'B', [c]: 'C', [d]: 'D' };
  const label = (hash) => labels[hash] || hash;
  const info = join(root, '.git', 'objects', 'info');
  const baseEnv = { GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1' };
  return { root, git, a, handoff, b, c, d, label, info, global, baseEnv };
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
  return { layers: old.split('\n').length, bases: data[7], renamed: old !== sum, verify: f.git(['commit-graph', 'verify']) };
}

function shown(f, outcome) {
  const stale = outcome.result === 'PASS' && outcome.commit === f.a;
  const named = outcome.result === 'FAIL' && outcome.commit === f.c && outcome.reason === 'Handoff does not name ' + short(f.c) + '; latest code commit is ' + short(f.c) + ' (Revert the change)';
  return outcome.result + ' naming ' + (outcome.commit ? f.label(outcome.commit) : 'none') + ' (reason: ' + outcome.reason.split(short(f.a)).join('<A>').split(short(f.c)).join('<C>') + ')' + (stale ? ' = stale' : named ? ' = names the true latest code commit C' : '');
}

function check(mod, f, extra = {}) {
  return withEnv({ ...f.baseEnv, ...extra }, () => mod.checkHandoff(f.root, 'T-900'));
}

function parentOf(f, args = [], extra = {}) {
  return f.label(f.git([...args, 'rev-parse', 'HEAD^'], extra));
}

function graphPart(mod, scratch) {
  const f = fixture(scratch, 'graph');
  out.push('fixture: A "Add the game" (code); H "Handoff" names A (agent-team/ only); B "Change the game" (code); C "Revert the change" (code back to A); D "Notes" (agent-team/ only, HEAD). True latest code commit: C');
  out.push('no graph: plain git parent of D = ' + parentOf(f) + '; checkHandoff ' + shown(f, check(mod, f)));
  const file = single(f);
  out.push('case (i) single file .git/objects/info/commit-graph, D\'s first-parent index set to H, SHA-1 trailer recomputed:');
  out.push('  plain git parent of D = ' + parentOf(f) + ' (live: ' + (parentOf(f) === f.label(f.handoff) ? 'yes' : 'no') + '); git -c core.commitGraph=false parent of D = ' + parentOf(f, ['-c', 'core.commitGraph=false']));
  out.push('  plain git rev-list --first-parent HEAD = ' + f.git(['rev-list', '--first-parent', 'HEAD']).split('\n').map(f.label).join(', '));
  out.push('  checkHandoff ' + shown(f, check(mod, f)));
  rmSync(file);
  const chain = split(f);
  out.push('case (ii) split chain .git/objects/info/commit-graphs/ (commit-graph-chain lists ' + chain.layers + ' layer, base graphs in the layer: ' + chain.bases + '), the layer\'s D first-parent index set to H, trailer recomputed, layer renamed to graph-<new trailer>.graph and the chain file updated (name changed: ' + (chain.renamed ? 'yes' : 'no') + '):');
  out.push('  single-file graph present: ' + (existsSync(file) ? 'yes' : 'no'));
  out.push('  plain git parent of D = ' + parentOf(f) + ' (live: ' + (parentOf(f) === f.label(f.handoff) ? 'yes' : 'no') + '); git -c core.commitGraph=false parent of D = ' + parentOf(f, ['-c', 'core.commitGraph=false']));
  out.push('  git commit-graph verify: ' + (chain.verify.startsWith('error') ? 'reports the forgery, ' + chain.verify : 'no error'));
  out.push('  checkHandoff ' + shown(f, check(mod, f)));
}

function variants(name) {
  return WIN ? [name, name.toLowerCase()] : [name];
}

function verdict(f, outcome) {
  return outcome.result === 'PASS' && outcome.commit === f.a ? 'still stale' : outcome.result === 'FAIL' && outcome.commit === f.c ? 'covered by the setting' : 'other: ' + outcome.result;
}

function switchPart(mod, scratch) {
  const f = fixture(scratch, 'switch');
  single(f);
  out.push('fixture as in graph.mjs, case (i) forged single-file graph in place; a route is live when git reads it (git config --get core.commitGraph gives true under it with no -c), and the verdict is from checkHandoff of the module at ' + REF);
  out.push('no route: plain git parent of D = ' + parentOf(f) + '; checkHandoff ' + shown(f, check(mod, f)));
  const routes = [];
  routes.push({ name: 'c1 core.commitGraph=true in the fixture .git/config', before: () => f.git(['config', 'core.commitGraph', 'true']), after: () => f.git(['config', '--unset', 'core.commitGraph']), env: {} });
  for (const name of variants('GIT_CONFIG_PARAMETERS')) routes.push({ name: 'c2 ' + name + '="\'core.commitGraph=true\'"', env: { [name]: '\'core.commitGraph=true\'' } });
  for (const [count, key, value] of WIN ? [['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'], ['git_config_count', 'git_config_key_0', 'git_config_value_0']] : [['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']]) {
    routes.push({ name: 'c3 ' + count + '=1, ' + key + '=core.commitGraph, ' + value + '=true', env: { [count]: '1', [key]: 'core.commitGraph', [value]: 'true' } });
  }
  const trueGlobal = join(scratch, 'true-gitconfig');
  writeFileSync(trueGlobal, '[core]\n\tcommitGraph = true\n');
  for (const name of variants('GIT_CONFIG_GLOBAL')) routes.push({ name: 'c4 ' + name + ' names a file with core.commitGraph = true', env: { [name]: trueGlobal }, dropGlobal: true });
  for (const name of variants('GIT_TEST_COMMIT_GRAPH')) routes.push({ name: 'c5 ' + name + '=1', env: { [name]: '1' }, test: true });
  for (const route of routes) {
    if (route.before) route.before();
    const extra = { ...(route.dropGlobal ? { GIT_CONFIG_NOSYSTEM: '1' } : f.baseEnv), ...route.env };
    const reads = withEnv(extra, () => execGit(f, ['config', '--get', 'core.commitGraph']));
    const plain = withEnv(extra, () => execGit(f, ['-c', 'core.commitGraph=false', 'rev-parse', 'HEAD^']));
    const outcome = withEnv(extra, () => mod.checkHandoff(f.root, 'T-900'));
    if (route.after) route.after();
    out.push(route.name + ':');
    out.push('  git config --get core.commitGraph under the route = ' + (reads || '(not set)') + (route.test ? ' (not a config route)' : '') + '; git -c core.commitGraph=false parent of D under the route = ' + f.label(plain));
    out.push('  checkHandoff ' + shown(f, outcome));
    out.push('  verdict: ' + verdict(f, outcome));
  }
  if (!WIN) out.push('lower-case names: cannot be shown on ' + process.platform + ' (environment names are case-sensitive there)');
  out.push('process.env holds the same GIT_ names as at the start: ' + (gitNames().join(',') === START_NAMES.join(',') ? 'yes' : 'no'));
}

function execGit(f, args) {
  try {
    return execFileSync('git', args, { cwd: f.root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch (error) {
    return 'error (exit ' + error.status + ')';
  }
}

function looseFile(dir, hash) {
  return join(dir, hash.slice(0, 2), hash.slice(2));
}

function forgedObject(f, hash, parent) {
  const text = f.git(['cat-file', 'commit', hash]).split('\n').map((line) => (line.startsWith('parent ') ? 'parent ' + parent : line)).join('\n') + '\n';
  return deflateSync(Buffer.concat([Buffer.from('commit ' + Buffer.byteLength(text) + '\0'), Buffer.from(text)]));
}

function alternatesPart(mod, scratch) {
  const f = fixture(scratch, 'alt-main');
  const alt = join(scratch, 'alt-objects');
  mkdirSync(join(alt, 'info'), { recursive: true });
  const graph = single(f);
  writeFileSync(join(alt, 'info', 'commit-graph'), readFileSync(graph));
  rmSync(graph);
  out.push('fixture as in graph.mjs; the forged single-file graph moved from the fixture to an alternate object store (a folder in the OS temp dir, info/commit-graph); the fixture has no graph of its own');
  out.push('no alternate: plain git parent of D = ' + parentOf(f) + '; checkHandoff ' + shown(f, check(mod, f)));
  const alternates = join(f.info, 'alternates');
  writeFileSync(alternates, alt + '\n');
  out.push('d1 objects/info/alternates names the alternate:');
  out.push('  plain git parent of D = ' + parentOf(f) + ' (live: ' + (parentOf(f) === f.label(f.handoff) ? 'yes' : 'no') + '); git -c core.commitGraph=false parent of D = ' + parentOf(f, ['-c', 'core.commitGraph=false']));
  let outcome = check(mod, f);
  out.push('  checkHandoff ' + shown(f, outcome));
  out.push('  verdict: ' + verdict(f, outcome));
  rmSync(alternates);
  for (const name of variants('GIT_ALTERNATE_OBJECT_DIRECTORIES')) {
    const plain = withEnv({ ...f.baseEnv, [name]: alt }, () => execGit(f, ['rev-parse', 'HEAD^']));
    const off = withEnv({ ...f.baseEnv, [name]: alt }, () => execGit(f, ['-c', 'core.commitGraph=false', 'rev-parse', 'HEAD^']));
    outcome = check(mod, f, { [name]: alt });
    out.push('d2 ' + name + ' names the alternate:');
    out.push('  plain git parent of D = ' + f.label(plain) + ' (live: ' + (plain === f.handoff ? 'yes' : 'no') + '); git -c core.commitGraph=false parent of D = ' + f.label(off));
    out.push('  checkHandoff ' + shown(f, outcome));
    out.push('  verdict: ' + verdict(f, outcome));
  }
  rmSync(join(alt, 'info', 'commit-graph'));
  const forged = forgedObject(f, f.c, f.handoff);
  const own = looseFile(join(f.root, '.git', 'objects'), f.c);
  const original = readFileSync(own);
  rmSync(own);
  mkdirSync(dirname(looseFile(alt, f.c)), { recursive: true });
  writeFileSync(looseFile(alt, f.c), forged);
  writeFileSync(alternates, alt + '\n');
  out.push('d3 other parent data: no graph anywhere; C\'s loose object removed from the fixture and a forged loose object for C (parent line set to H, stored under C\'s hash, so its content no longer matches the hash) put in the alternate named by objects/info/alternates:');
  out.push('  plain git parent of C (HEAD~1^) = ' + f.label(f.git(['rev-parse', 'HEAD~1^'])) + '; git -c core.commitGraph=false = ' + f.label(f.git(['-c', 'core.commitGraph=false', 'rev-parse', 'HEAD~1^'])));
  outcome = check(mod, f);
  out.push('  checkHandoff ' + shown(f, outcome));
  out.push('  verdict: ' + verdict(f, outcome) + ' (core.commitGraph does not cover a forged object)');
  rmSync(alternates);
  rmSync(looseFile(alt, f.c));
  writeFileSync(own, forged);
  out.push('d4 the same forged loose object for C written over C\'s own loose object in the fixture (no alternate, no graph), for comparison:');
  out.push('  plain git parent of C (HEAD~1^) = ' + f.label(f.git(['rev-parse', 'HEAD~1^'])) + '; git fsck reports it: ' + (f.git(['fsck', '--no-dangling']).startsWith('error') ? 'yes (fsck exits non-zero)' : 'no'));
  outcome = check(mod, f);
  out.push('  checkHandoff ' + shown(f, outcome));
  out.push('  verdict: ' + verdict(f, outcome) + ' (core.commitGraph does not cover a forged object)');
  rmSync(own);
  writeFileSync(own, original);
  out.push('process.env holds the same GIT_ names as at the start: ' + (gitNames().join(',') === START_NAMES.join(',') ? 'yes' : 'no'));
}

const START_NAMES = gitNames();

async function main() {
  if (!REF || !['graph', 'switch', 'alternates'].includes(PART)) throw new Error('use <ref> graph|switch|alternates');
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t034-graph-'));
  const commit = REF === 'worktree' ? 'the files of the folder the script runs from' : execFileSync('git', ['rev-parse', '--short', REF], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const safe = moduleText().split('\n').find((row) => row.startsWith('const SAFE'));
  try {
    const mod = await loadModule(scratch);
    out.push('module ' + MODULE + ' at ' + commit + ': ' + safe);
    if (PART === 'graph') graphPart(mod, scratch);
    if (PART === 'switch') switchPart(mod, scratch);
    if (PART === 'alternates') alternatesPart(mod, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  out.push('scratch folder removed: ' + (existsSync(scratch) ? 'no' : 'yes'));
  process.stdout.write('graph.mjs ' + PART + ', platform ' + process.platform + ', node ' + process.version + ', ' + execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim() + '\n' + out.join('\n') + '\n');
}

await main();
