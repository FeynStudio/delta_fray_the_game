import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASE = '8042468';
const SIDE = process.argv[2];
const PART = process.argv[3] || 'all';
const MODULE = 'scripts/handoff-check.mjs';
const TESTS = 'tests/handoff-check.test.js';
const FILES = [MODULE, TESTS, 'package.json'];
const LEFT_OUT = ['.git', 'node_modules', 'secrets'];
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const SAFE = ['-c', 'core.fsmonitor=false'];
const BRANCH = 'task/T-900-fixture';
const BRIEF = 'agent-team/tasks/T-900.md';
const GRAFT_NAMES = process.platform === 'win32' ? ['GIT_GRAFT_FILE', 'git_graft_file', 'Git_Graft_File'] : ['GIT_GRAFT_FILE'];
const out = [];

const isGit = (key) => key.toUpperCase().startsWith('GIT_');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !isGit(key)));
const short = (hash) => hash.slice(0, 7);
const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');

function place(dir, file, text) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

function sideFiles(dir) {
  for (const file of FILES) {
    const text = SIDE === 'base' ? execFileSync('git', ['show', BASE + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true }) : readFileSync(join(ROOT, file), 'utf8');
    place(dir, file, text);
  }
}

function withEnv(name, value, run) {
  const saved = process.env[name];
  process.env[name] = value;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

async function grafts(scratch) {
  const moduleDir = join(scratch, 'module');
  sideFiles(moduleDir);
  const mod = await import(pathToFileURL(join(moduleDir, MODULE)).href);
  const root = join(scratch, 'fixture');
  const env = { ...cleanEnv(), GIT_CONFIG_GLOBAL: join(scratch, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
  writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  mkdirSync(root);
  const git = (args, extra = {}) => execFileSync('git', [...SAFE, ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
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
  const graft = d + ' ' + handoff + '\n';
  const label = (hash) => ({ [a]: 'A', [handoff]: 'the Handoff commit', [b]: 'B', [c]: 'C', [d]: 'D' }[hash] || 'unknown ' + short(hash));
  const shown = (outcome) => outcome.result + ' (commit ' + (outcome.commit ? label(outcome.commit) : 'none') + '; reason: ' + outcome.reason + ')';
  const forced = mod.gitEnv({}).GIT_GRAFT_FILE;
  const moduleFile = fileURLToPath(pathToFileURL(join(moduleDir, MODULE)).href);
  out.push('item 1, grafts, ' + SIDE + ' module (' + (SIDE === 'base' ? BASE : 'worktree files') + ')');
  out.push('fixture: A ' + short(a) + ' "Add the game"; the Handoff commit ' + short(handoff) + ' names A; B ' + short(b) + ' "Change the game"; C ' + short(c) + ' "Revert the change" (code back to A); D ' + short(d) + ' "Notes" (agent-team/ only)');
  out.push('graft line used: "<D> <the Handoff commit>"');
  out.push('GIT_GRAFT_FILE forced by gitEnv: ' + (forced === undefined ? 'not set' : forced === join(moduleFile, 'none') ? 'the child "none" of the module file' : 'another value') + (forced === undefined ? '' : '; exists: ' + (existsSync(forced) ? 'yes' : 'no')));
  out.push('no graft: plain git parent of D = ' + label(git(['rev-parse', 'HEAD^'])) + '; checkHandoff ' + shown(mod.checkHandoff(root, 'T-900')));
  place(root, '.git/info/grafts', graft);
  out.push('case (i) .git/info/grafts: plain git parent of D = ' + label(git(['rev-parse', 'HEAD^'])) + ' (live: ' + (git(['rev-parse', 'HEAD^']) === handoff ? 'yes' : 'no') + ')'
    + '; git with the environment gitEnv gives = ' + label(execFileSync('git', [...SAFE, 'rev-parse', 'HEAD^'], { cwd: root, env: mod.gitEnv(env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim())
    + '; checkHandoff ' + shown(mod.checkHandoff(root, 'T-900')));
  rmSync(join(root, '.git', 'info', 'grafts'));
  const file = join(scratch, 'grafts');
  writeFileSync(file, graft);
  for (const name of GRAFT_NAMES) {
    const plain = git(['rev-parse', 'HEAD^'], { [name]: file });
    const viaModule = execFileSync('git', [...SAFE, 'rev-parse', 'HEAD^'], { cwd: root, env: mod.gitEnv({ ...env, [name]: file }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    const outcome = withEnv(name, file, () => mod.checkHandoff(root, 'T-900'));
    out.push('case (ii) ' + name + ' set to a grafts file outside .git: plain git parent of D = ' + label(plain) + ' (live: ' + (plain === handoff ? 'yes' : 'no') + '); git with the environment gitEnv gives = ' + label(viaModule) + '; checkHandoff ' + shown(outcome));
  }
  out.push('process.env holds no graft name after the cases: ' + (GRAFT_NAMES.every((name) => process.env[name] === undefined) ? 'yes' : 'no'));
}

function state(repo, env) {
  const git = (args) => {
    try {
      return execFileSync('git', [...SAFE, ...args], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
    } catch (error) {
      return 'none (git ' + args[0] + ' exit ' + error.status + (String(error.stderr).trim() ? ': ' + String(error.stderr).split('\n')[0].split(repo).join('<throw-away repo>') : '') + ')';
    }
  };
  const status = git(['status', '--porcelain']);
  const at = git(['rev-parse', '-q', '--verify', 'HEAD']);
  return 'HEAD is ' + git(['symbolic-ref', '-q', 'HEAD']) + ' at commit ' + (at.startsWith('none') ? at : short(at)) + ', rev-list --all --count ' + git(['rev-list', '--all', '--count']) + ', status --porcelain ' + (status === '' ? 'empty' : status.split('\n').length + ' lines');
}

function reach(scratch) {
  out.push('item 2, inRepo, ' + SIDE + ' test file (' + (SIDE === 'base' ? BASE : 'worktree files') + ')');
  if (process.platform !== 'win32') {
    out.push('cannot be shown on ' + process.platform + ': git reads a lower-case git_dir only on Windows');
    return;
  }
  const repo = join(scratch, 'throwaway');
  const env = { ...cleanEnv(), GIT_CONFIG_GLOBAL: join(scratch, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
  writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  mkdirSync(repo);
  const git = (args) => execFileSync('git', [...SAFE, ...args], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  git(['init', '-q']);
  writeFileSync(join(repo, 'readme.txt'), 'Throw-away.\n');
  git(['add', '-A']);
  git([...WHO, 'commit', '-q', '-m', 'Throw-away']);
  const copy = join(scratch, 'copy');
  cpSync(ROOT, copy, { recursive: true, filter: (from) => !LEFT_OUT.includes(basename(from)) && !basename(from).startsWith('.env') });
  if (SIDE === 'base') sideFiles(copy);
  const before = state(repo, env);
  let code = 0;
  let text;
  try {
    text = execFileSync(process.execPath, ['--test', '--test-reporter=tap', TESTS], { cwd: copy, env: { ...cleanEnv(), git_dir: join(repo, '.git') }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    code = error.status;
    text = String(error.stdout);
  }
  const rows = text.split('\n').map((row) => row.trim());
  const count = (key) => Number((rows.find((row) => row.startsWith('# ' + key + ' ')) || '').split(' ')[2]);
  const failed = rows.filter((row) => row.startsWith('not ok ')).map((row) => row.slice(row.indexOf(' - ') + 3));
  const after = state(repo, env);
  out.push('throw-away repo in the OS temp dir, before: ' + before);
  out.push('node --test ' + TESTS + ' from a scratch copy (no .git, node_modules, .env files, secrets folders) with lower-case git_dir set to the throw-away .git folder: exit ' + code + ', tests ' + count('tests') + ', pass ' + count('pass') + ', fail ' + count('fail') + ', skipped ' + count('skipped'));
  out.push('failed (' + failed.length + '): ' + failed.map((name) => '"' + name + '"').join(', '));
  out.push('throw-away repo, after: ' + after);
  out.push('throw-away repo reached by the test run: ' + (before === after ? 'no' : 'yes'));
}

async function main() {
  if (SIDE !== 'base' && SIDE !== 'head') throw new Error('use base or head');
  const scratch = mkdtempSync(join(tmpdir(), 'handoff-t033-gaps-'));
  try {
    if (PART === 'all' || PART === 'grafts') await grafts(scratch);
    if (PART === 'all' || PART === 'reach') reach(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  out.push('scratch folder removed: ' + (existsSync(scratch) ? 'no' : 'yes'));
  process.stdout.write('gaps.mjs ' + SIDE + ' ' + PART + ', platform ' + process.platform + ', node ' + process.version + ', ' + execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim() + '\n' + out.join('\n') + '\n');
}

await main();
