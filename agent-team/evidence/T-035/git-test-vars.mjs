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
const MARKER = 'marker';
const RUN = 'printf ran > ../' + MARKER;
const PROMISOR = ['[extensions]', 'partialClone = origin', '[remote "origin"]', 'promisor = true', 'url = ../remote', 'uploadpack = "' + RUN + '; :"', ''].join('\n');
const VARS = [
  'GIT_TEST_ASSUME_DIFFERENT_OWNER', 'GIT_TEST_BLOOM_SETTINGS_BITS_PER_ENTRY', 'GIT_TEST_BLOOM_SETTINGS_MAX_CHANGED_PATHS', 'GIT_TEST_BLOOM_SETTINGS_NUM_HASHES',
  'GIT_TEST_CAT_FILE_NO_FLUSH_ON_EXIT', 'GIT_TEST_CHECKOUT_WORKERS', 'GIT_TEST_CHECK_CACHE_TREE', 'GIT_TEST_COMMIT_GRAPH', 'GIT_TEST_COMMIT_GRAPH_CHANGED_PATHS',
  'GIT_TEST_COMMIT_GRAPH_DIE_ON_PARSE', 'GIT_TEST_DATE_NOW', 'GIT_TEST_DEFAULT_HASH_ALGO', 'GIT_TEST_DEFAULT_INITIAL_BRANCH_NAME', 'GIT_TEST_DISALLOW_ABBREVIATED_OPTIONS',
  'GIT_TEST_FSCACHE', 'GIT_TEST_FSMONITOR', 'GIT_TEST_FSMONITOR_TOKEN', 'GIT_TEST_FSYNC', 'GIT_TEST_FULL_IN_PACK_ARRAY', 'GIT_TEST_INDEX_THREADS', 'GIT_TEST_LEGACY_DELETE',
  'GIT_TEST_MAINT_AUTO_DETACH', 'GIT_TEST_MAINT_SCHEDULER', 'GIT_TEST_MIDX_READ_BTMP', 'GIT_TEST_MIDX_READ_RIDX', 'GIT_TEST_MIDX_WRITE_REV', 'GIT_TEST_MULTI_PACK_INDEX',
  'GIT_TEST_MULTI_PACK_INDEX_WRITE_INCREMENTAL', 'GIT_TEST_NAME_HASH_VERSION', 'GIT_TEST_NO_WRITE_REV_INDEX', 'GIT_TEST_OE_DELTA_SIZE', 'GIT_TEST_OE_SIZE', 'GIT_TEST_PACK_PATH_WALK',
  'GIT_TEST_PACK_SPARSE', 'GIT_TEST_PACK_USE_BITMAP_BOUNDARY_TRAVERSAL', 'GIT_TEST_PRELOAD_INDEX', 'GIT_TEST_PROTOCOL_VERSION', 'GIT_TEST_READ_COMMIT_TABLE',
  'GIT_TEST_REFTABLE_AUTOCOMPACTION', 'GIT_TEST_REV_INDEX_DIE_IN_MEMORY', 'GIT_TEST_REV_INDEX_DIE_ON_DISK', 'GIT_TEST_SIDEBAND_ALL', 'GIT_TEST_SPARSE_INDEX', 'GIT_TEST_SPLIT_INDEX',
  'GIT_TEST_UF_DELAY_WARNING', 'GIT_TEST_UPGRADE_BLOOM_FILTERS', 'GIT_TEST_USE_PSEUDO_MERGES', 'GIT_TEST_VALIDATE_INDEX_CACHE_ENTRIES',
];
const out = [];
const gitNames = () => Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('GIT_'));
const START_NAMES = gitNames();
const short = (hash) => hash.slice(0, 7);
const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');
const moduleText = () => (REF === 'worktree' ? readFileSync(join(ROOT, MODULE), 'utf8') : execFileSync('git', ['show', REF + ':' + MODULE], { cwd: ROOT, encoding: 'utf8', windowsHide: true }));

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
  return { root, git, a, handoff, b, c, d, label: (hash) => labels[hash] || hash, baseEnv, marker: join(scratch, MARKER) };
}

function graphSource(scratch) {
  const f = fixture(scratch, 'graph');
  const file = join(f.root, '.git', 'objects', 'info', 'commit-graph');
  f.git(['commit-graph', 'write', '--reachable']);
  writeFileSync(file, forge(file, f.d, f.handoff));
  return { name: 'commit-graph (forged single file, D\'s parent set to H)', f, args: ['-c', 'core.commitGraph=false'], env: {}, off: 'core.commitGraph=false' };
}

function replaceSource(scratch) {
  const f = fixture(scratch, 'replace');
  const text = f.git(['cat-file', 'commit', f.d]).split('\n').map((line) => (line.startsWith('parent ') ? 'parent ' + f.handoff : line)).join('\n') + '\n';
  writeFileSync(join(scratch, 'replace.txt'), text);
  f.git(['update-ref', 'refs/replace/' + f.d, f.git(['hash-object', '-t', 'commit', '-w', join(scratch, 'replace.txt')])]);
  return { name: 'replace ref (refs/replace/<D> names a copy of D with parent H)', f, args: [], env: { GIT_NO_REPLACE_OBJECTS: '1' }, off: 'GIT_NO_REPLACE_OBJECTS=1' };
}

function graftSource(scratch) {
  const f = fixture(scratch, 'graft');
  writeFileSync(join(f.root, '.git', 'info', 'grafts'), f.d + ' ' + f.handoff + '\n');
  return { name: 'graft (.git/info/grafts gives D the parent H)', f, args: [], env: { GIT_GRAFT_FILE: join(scratch, 'no-such-grafts') }, off: 'GIT_GRAFT_FILE=<a file that does not exist>' };
}

function parentRow(mod, source, extra) {
  const plain = source.f.label(source.f.git([...source.args, 'rev-parse', 'HEAD^'], { ...source.env, ...extra }));
  const outcome = withEnv({ ...source.f.baseEnv, ...extra }, () => mod.checkHandoff(source.f.root, 'T-900'));
  const verdict = outcome.result === 'PASS' && outcome.commit === source.f.a ? 'stale PASS naming A' : outcome.result === 'FAIL' && outcome.commit === source.f.c ? 'FAIL naming C' : outcome.result + ' (' + outcome.reason + ')';
  return { plain, verdict, reopens: plain === 'H' || verdict === 'stale PASS naming A' };
}

function lazyFixture(scratch) {
  const f = fixture(scratch, 'lazy');
  writeFileSync(join(f.root, '.git', 'config'), PROMISOR, { flag: 'a' });
  const tree = f.git(['rev-parse', 'HEAD^{tree}']);
  rmSync(join(f.root, '.git', 'objects', tree.slice(0, 2), tree.slice(2)), { force: true });
  return f;
}

function lazyRow(mod, f, extra) {
  rmSync(f.marker, { force: true });
  f.git(['-c', 'core.fsmonitor=false', 'diff-tree', '--root', 'HEAD'], { GIT_NO_LAZY_FETCH: '1', ...extra });
  const plain = existsSync(f.marker);
  rmSync(f.marker, { force: true });
  const outcome = withEnv({ ...f.baseEnv, ...extra }, () => mod.checkHandoff(f.root, 'T-900'));
  const ran = existsSync(f.marker);
  rmSync(f.marker, { force: true });
  return { plain, ran, verdict: outcome.result + (outcome.reason ? ' (' + outcome.reason + ')' : '') };
}

function binaryNames() {
  const file = join(execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }).trim(), process.platform === 'win32' ? 'git.exe' : 'git');
  return [...new Set(readFileSync(file, 'latin1').match(/GIT_TEST_[A-Z0-9_]+/g) || [])].sort();
}

async function main() {
  if (!REF) throw new Error('use <ref>');
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t035-vars-'));
  const commit = REF === 'worktree' ? 'the files of the folder the script runs from' : execFileSync('git', ['rev-parse', '--short', REF], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  try {
    place(join(scratch, 'module'), MODULE, moduleText());
    const mod = await import(pathToFileURL(join(scratch, 'module', MODULE)).href);
    const found = binaryNames();
    out.push('module ' + MODULE + ' at ' + commit + ': ' + moduleText().split('\n').find((line) => line.startsWith('const FORCED_ENV')));
    out.push('GIT_TEST_ names in the installed git binary (git --exec-path, git.exe, read as bytes): ' + found.length + '; in the probe list: ' + VARS.length + '; in the binary but not probed: ' + (found.filter((name) => !VARS.includes(name)).join(', ') || 'none') + '; probed but not in the binary: ' + (VARS.filter((name) => !found.includes(name)).join(', ') || 'none'));
    const sources = [graphSource(scratch), replaceSource(scratch), graftSource(scratch)];
    for (const source of sources) {
      const on = source.f.label(source.f.git(['rev-parse', 'HEAD^']));
      const base = parentRow(mod, source, {});
      out.push('source ' + source.name + ': plain git parent of D with the source on = ' + on + ' (live: ' + (on === 'H' ? 'yes' : 'no') + '); with ' + source.off + ' = ' + base.plain + '; checkHandoff ' + base.verdict);
    }
    const lazy = lazyFixture(scratch);
    const lazyOn = (() => {
      rmSync(lazy.marker, { force: true });
      lazy.git(['-c', 'core.fsmonitor=false', 'diff-tree', '--root', 'HEAD']);
      const ran = existsSync(lazy.marker);
      rmSync(lazy.marker, { force: true });
      return ran;
    })();
    const lazyBase = lazyRow(mod, lazy, {});
    out.push('source lazy fetch (promisor remote whose upload-pack runs a marker command, HEAD\'s tree object removed): plain git diff-tree runs the marker = ' + (lazyOn ? 'yes' : 'no') + ' (live: ' + (lazyOn ? 'yes' : 'no') + '); with GIT_NO_LAZY_FETCH=1 = ' + (lazyBase.plain ? 'yes' : 'no') + '; checkHandoff ' + lazyBase.verdict + ', marker run: ' + (lazyBase.ran ? 'yes' : 'no'));
    out.push('each variable below is set to 1 (GIT_TEST_FSMONITOR also to a marker command) in the caller\'s environment, one at a time; plain git runs with the module\'s switch for that source; checkHandoff is the module above');
    const reopened = [];
    const values = (name) => (name === 'GIT_TEST_FSMONITOR' ? ['1', RUN + '; :'] : ['1']);
    for (const name of VARS) {
      for (const value of values(name)) {
        const rows = sources.map((source) => parentRow(mod, source, { [name]: value }));
        const l = lazyRow(mod, lazy, { [name]: value });
        const hit = ['commit-graph', 'replace objects', 'grafts'].filter((label, at) => rows[at].reopens).concat(l.plain || l.ran ? ['lazy fetch'] : []);
        if (hit.length) reopened.push(name + '=' + value + ' (' + hit.join(', ') + ')');
        out.push(name + '=' + (value === '1' ? '1' : 'marker command') + ': graph ' + rows[0].plain + ' / ' + rows[0].verdict + '; replace ' + rows[1].plain + ' / ' + rows[1].verdict + '; graft ' + rows[2].plain + ' / ' + rows[2].verdict + '; lazy fetch marker plain ' + (l.plain ? 'yes' : 'no') + ', checkHandoff ' + l.verdict + ' marker ' + (l.ran ? 'yes' : 'no') + ' => ' + (hit.length ? 're-enables ' + hit.join(', ') : 'does not touch a parent source'));
      }
    }
    const fsm = { GIT_TEST_FSMONITOR: RUN + '; :' };
    const plainRepo = fixture(scratch, 'fsmonitor');
    const fsmRun = (args, extra) => {
      rmSync(plainRepo.marker, { force: true });
      if (args) plainRepo.git(args, extra); else withEnv({ ...plainRepo.baseEnv, ...extra }, () => mod.checkHandoff(plainRepo.root, 'T-900'));
      const ran = existsSync(plainRepo.marker);
      rmSync(plainRepo.marker, { force: true });
      return ran ? 'yes' : 'no';
    };
    out.push('command source, not a parent source, in a fixture without a promisor remote: GIT_TEST_FSMONITOR=marker command: plain git status runs the marker = ' + fsmRun(['status'], fsm) + '; git -c core.fsmonitor=false status = ' + fsmRun(['-c', 'core.fsmonitor=false', 'status'], fsm) + '; checkHandoff runs it = ' + fsmRun(null, fsm));
    out.push('variables that re-enable a parent source the module turns off: ' + (reopened.join(', ') || 'none'));
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  out.push('process.env holds the same GIT_ names as at the start: ' + (gitNames().join(',') === START_NAMES.join(',') ? 'yes' : 'no'));
  out.push('scratch folder removed: ' + (existsSync(scratch) ? 'no' : 'yes'));
  process.stdout.write('git-test-vars.mjs, platform ' + process.platform + ', node ' + process.version + ', ' + execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim() + '\n' + out.join('\n') + '\n');
}

await main();
