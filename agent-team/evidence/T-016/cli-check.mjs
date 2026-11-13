import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULE = 'scripts/handoff-check.mjs';
const BRIEF = 'agent-team/tasks/T-900.md';
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const say = (line) => process.stdout.write(line + '\n');
const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');

function run(title, root, args) {
  const done = spawnSync(process.execPath, [MODULE, ...args], { cwd: root, encoding: 'utf8' });
  say('--- ' + title);
  say('$ node ' + [MODULE, ...args].join(' '));
  process.stdout.write(done.stdout + done.stderr);
  say('exit ' + done.status);
  say('');
}

function fixture(title, steps) {
  const base = mkdtempSync(join(tmpdir(), 'handoff-cli-'));
  const root = join(base, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = join(base, 'gitconfig');
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  const commit = (subject, files) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    git('add', '-A');
    git(...WHO, 'commit', '-q', '-m', subject);
    return git('rev-parse', '--short=7', 'HEAD');
  };
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(env.GIT_CONFIG_GLOBAL, '');
    git('init', '-q');
    git('symbolic-ref', 'HEAD', 'refs/heads/task/T-900-fixture');
    copyFileSync(join(ROOT, MODULE), join(root, MODULE));
    const code = commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief('(owner fills in)') });
    steps(commit, code);
    say('fixture history, newest first (branch ' + git('branch', '--show-current') + '):');
    say(git('log', '--format=%h %s'));
    run(title, root, []);
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
}

fixture('fixture 1: the Handoff names the code commit', (commit, code) => {
  commit('Handoff', { [BRIEF]: brief('- Latest code commit: ' + code + '.') });
});
fixture('fixture 2: a code commit after the Handoff', (commit, code) => {
  commit('Handoff', { [BRIEF]: brief('- Latest code commit: ' + code + '.') });
  commit('Fix the wall bounce', { 'src/game.js': 'export const a = 2;\n' });
});
fixture('fixture 3: the Handoff is still the placeholder', () => {});

const head = execFileSync('git', ['log', '-1', '--format=%h %s'], { cwd: ROOT, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
say('real repo: HEAD ' + head + ', branch ' + branch);
run('real repo, task from the branch name', ROOT, []);
run('real repo, task given by hand', ROOT, ['T-016-review']);
run('real repo, a task with a closed brief', ROOT, ['T-014']);
run('real repo, not a task', ROOT, ['adhoc']);
