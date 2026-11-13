import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHandoff, currentBranch, report, taskFromBranch } from '../scripts/handoff-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const BRIEF = 'agent-team/tasks/T-900.md';
const PLACEHOLDER = '(owner fills in)';
const STALE = '- Latest code commit: 0000000.';
const TITLE = 'handoff names the latest code commit';
const NO_TASK = { result: 'SKIP', reason: 'no task: not on a task branch', commit: null, subject: null };

const brief = ({ status = 'IN REVIEW', context = 'None.', handoff = PLACEHOLDER, eol = '\n' } = {}) => [
  '# T-900 fixture', 'Status: ' + status, '', '## Context', context, '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', '',
].join(eol);

async function inRepo(run) {
  const base = mkdtempSync(join(tmpdir(), 'handoff-check-'));
  const root = join(base, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = join(base, 'gitconfig');
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (...args) => new Promise((done, failed) => {
    execFile('git', args, { cwd: root, env, encoding: 'utf8', windowsHide: true }, (error, out) => (error ? failed(error) : done(out.trim())));
  });
  const write = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const commit = async (subject, files) => {
    for (const [file, text] of Object.entries(files)) write(file, text);
    await git('add', '-A');
    await git(...WHO, 'commit', '-q', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  try {
    mkdirSync(root);
    writeFileSync(env.GIT_CONFIG_GLOBAL, '');
    await git('init', '-q');
    await git('symbolic-ref', 'HEAD', 'refs/heads/' + BRANCH);
    return await run({ root, git, write, commit });
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
}

const names = (hash) => '- Latest code commit: ' + hash.slice(0, 7) + '.';
const check = (repo) => checkHandoff(repo.root, 'T-900');
const skipped = (reason) => ({ result: 'SKIP', reason, commit: null, subject: null });
const insideRepo = (dir) => existsSync(join(dir, '.git')) || (dirname(dir) !== dir && insideRepo(dirname(dir)));
const CONTROLS = [27, 7, 133].map((code) => String.fromCharCode(code));

function withCode(run) {
  return inRepo(async (repo) => {
    const code = await repo.commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief() });
    return run(repo, code);
  });
}

for (const [name, expected] of [
  ['task/T-016-stale-handoff-check', 'T-016'], ['task/T-1234-x', 'T-1234'], ['task/T-016', 'T-016'],
  ['master', null], ['', null], ['fix/master-conflict-markers', null], ['task/adhoc', null],
  ['task/T-01-x', null], ['task/T-016x', null], ['T-016', null], [undefined, null],
]) {
  test(`taskFromBranch gives ${expected} for the branch name '${name}'`, () => {
    assert.equal(taskFromBranch(name), expected);
  });
}

describe('checkHandoff on throw-away git repos', { concurrency: true }, () => {
  test('skips when the task has no brief', async () => {
    await inRepo(async (repo) => {
      await repo.commit('Add the game', { 'src/game.js': 'export const a = 1;\n' });
      assert.deepEqual(check(repo), { result: 'SKIP', reason: 'no brief agent-team/tasks/T-900.md', commit: null, subject: null });
    });
  });

  test('skips while the Handoff is the placeholder', async () => {
    await withCode(async (repo) => {
      assert.deepEqual(check(repo), { result: 'SKIP', reason: 'handoff not filled in', commit: null, subject: null });
      repo.write(BRIEF, brief({ handoff: '  ' + PLACEHOLDER + '  \n', eol: '\r\n' }));
      assert.equal(check(repo).reason, 'handoff not filled in');
    });
  });

  test('skips a brief whose Status is DONE, and fails the same brief while it is IN REVIEW', async () => {
    await withCode(async (repo) => {
      await repo.commit('Close the brief', { [BRIEF]: brief({ status: 'DONE (merged)', handoff: STALE }) });
      assert.deepEqual(check(repo), { result: 'SKIP', reason: 'brief T-900 is DONE', commit: null, subject: null });
      repo.write(BRIEF, brief({ handoff: '- Status: DONE\n' + STALE }));
      assert.equal(check(repo).result, 'FAIL');
    });
  });

  test('skips when there is no task, and fails the same repo for its own branch name', async () => {
    await withCode(async (repo) => {
      await repo.commit('Stale handoff', { [BRIEF]: brief({ handoff: STALE }) });
      for (const task of [null, undefined, '', 'adhoc', 'ci-12', 'T-9', '../T-900']) assert.deepEqual(checkHandoff(repo.root, task), NO_TASK);
      const branch = await repo.git('branch', '--show-current');
      assert.equal(branch, BRANCH);
      assert.equal(checkHandoff(repo.root, taskFromBranch(branch)).result, 'FAIL');
      await repo.git('checkout', '-q', '--detach');
      assert.deepEqual(checkHandoff(repo.root, taskFromBranch(await repo.git('branch', '--show-current'))), NO_TASK);
    });
  });

  test('skips a folder that is not a git repo', () => {
    const base = mkdtempSync(join(tmpdir(), 'handoff-check-'));
    try {
      mkdirSync(join(base, dirname(BRIEF)), { recursive: true });
      writeFileSync(join(base, BRIEF), brief({ handoff: STALE }));
      assert.deepEqual(checkHandoff(base, 'T-900'), skipped(insideRepo(base) ? 'not the top folder of a git repo' : 'not a git repo'));
    } finally {
      rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  test('passes when the Handoff names the code commit, here the root commit', async () => {
    await withCode(async (repo, code) => {
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      assert.deepEqual(check(repo), { result: 'PASS', reason: 'Handoff names ' + code.slice(0, 7), commit: code, subject: 'Add the game' });
    });
  });

  test('fails on a code commit made after the Handoff and names that commit and its subject', async () => {
    await withCode(async (repo, code) => {
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      const later = await repo.commit('Fix the wall bounce', { 'src/game.js': 'export const a = 2;\n' });
      const short = later.slice(0, 7);
      assert.deepEqual(check(repo), {
        result: 'FAIL', reason: 'Handoff does not name ' + short + '; latest code commit is ' + short + ' (Fix the wall bounce)', commit: later, subject: 'Fix the wall bounce',
      });
    });
  });

  test('passes when only agent-team commits follow the code commit', async () => {
    await withCode(async (repo) => {
      const code = await repo.commit('Tune the config', { 'src/config.js': 'export default {};\n', 'agent-team/FEATURE_MAP.md': 'Config.\n' });
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      await repo.commit('After evidence', { 'agent-team/evidence/T-900/after.log': 'RESULT: PASS\n' });
      await repo.commit('Review round 1', { [BRIEF]: brief({ handoff: names(code) + '\n- Reviewed.' }) });
      assert.equal(check(repo).result, 'PASS');
      assert.equal(check(repo).commit, code);
    });
  });

  test('fails on a merge commit that brings in code until the Handoff names the merge', async () => {
    await withCode(async (repo, code) => {
      await repo.git('checkout', '-q', '-b', 'side');
      await repo.commit('Side work', { 'src/side.js': 'export const b = 1;\n' });
      await repo.git('checkout', '-q', BRANCH);
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      await repo.git(...WHO, 'merge', '-q', '--no-ff', '-m', 'Merge side into the task', 'side');
      const merge = await repo.git('rev-parse', 'HEAD');
      const parents = await repo.git('rev-list', '--parents', '-n', '1', 'HEAD');
      assert.equal(parents.split(' ').length, 3);
      const failed = check(repo);
      assert.equal(failed.result, 'FAIL');
      assert.equal(failed.commit, merge);
      assert.ok(failed.reason.endsWith('latest code commit is ' + merge.slice(0, 7) + ' (Merge side into the task)'));
      await repo.commit('Handoff names the merge', { [BRIEF]: brief({ handoff: names(merge) }) });
      assert.equal(check(repo).result, 'PASS');
      assert.equal(check(repo).commit, merge);
    });
  });

  test('uses brief T-900 for the task T-900-review', async () => {
    await withCode(async (repo, code) => {
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      assert.equal(checkHandoff(repo.root, 'T-900-review').result, 'PASS');
      await repo.commit('Later code', { 'scripts/x.mjs': 'export const c = 1;\n' });
      assert.equal(checkHandoff(repo.root, 'T-900-review').result, 'FAIL');
    });
  });

  test('reads the brief from the working tree, so a saved but uncommitted Handoff counts', async () => {
    await withCode(async (repo, code) => {
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      const later = await repo.commit('Later code', { 'index.html': '<p>a</p>\n' });
      assert.equal(check(repo).result, 'FAIL');
      repo.write(BRIEF, brief({ handoff: names(later), eol: '\r\n' }));
      assert.equal(check(repo).result, 'PASS');
      assert.equal(await repo.git('rev-parse', 'HEAD'), later);
    });
  });

  test('looks for the hash in the Handoff section only', async () => {
    await withCode(async (repo, code) => {
      const elsewhere = brief({ context: names(code), handoff: STALE }) + '\n## Notes\n' + names(code) + '\n';
      await repo.commit('Handoff', { [BRIEF]: elsewhere });
      assert.equal(check(repo).result, 'FAIL');
      assert.equal(check(repo).commit, code);
    });
  });

  test('skips a subfolder of a git repo', async () => {
    await withCode(async (repo) => {
      repo.write('sub/' + BRIEF, brief({ handoff: STALE }));
      assert.deepEqual(checkHandoff(join(repo.root, 'sub'), 'T-900'), skipped('not the top folder of a git repo'));
    });
  });

  test('skips a repo whose commits touch agent-team/ only', async () => {
    await inRepo(async (repo) => {
      await repo.commit('Brief only', { [BRIEF]: brief({ handoff: STALE }) });
      assert.deepEqual(check(repo), skipped('no commit touches a path outside agent-team/'));
    });
  });

  test('skips a repo that has no commit yet', async () => {
    await inRepo(async (repo) => {
      repo.write(BRIEF, brief({ handoff: STALE }));
      assert.deepEqual(check(repo), skipped('git history cannot be read'));
    });
  });

  test('removes control characters from the subject and the reason', async () => {
    await inRepo(async (repo) => {
      const [escape, bell, nextLine] = CONTROLS;
      const code = await repo.commit(escape + '[31mFix' + bell + ' the ' + nextLine + 'wall', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief({ handoff: STALE }) });
      const short = code.slice(0, 7);
      assert.deepEqual(check(repo), {
        result: 'FAIL', reason: 'Handoff does not name ' + short + '; latest code commit is ' + short + ' ([31mFix the wall)', commit: code, subject: '[31mFix the wall',
      });
    });
  });
});

test('checkHandoff and currentBranch answer for the repo at root when GIT_DIR and GIT_WORK_TREE point at another repo', async () => {
  await withCode((repo, code) => inRepo(async (other) => {
    repo.write(BRIEF, brief({ handoff: STALE }));
    await other.git('symbolic-ref', 'HEAD', 'refs/heads/task/T-901-other');
    await other.commit('Other work', { 'src/other.js': 'export const b = 1;\n' });
    const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
    try {
      process.env.GIT_DIR = join(other.root, '.git');
      process.env.GIT_WORK_TREE = other.root;
      assert.equal(currentBranch(repo.root), BRANCH);
      assert.equal(check(repo).commit, code);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }));
});

test('skips when git cannot be run', () => {
  const base = mkdtempSync(join(tmpdir(), 'handoff-check-'));
  const saved = process.env.PATH;
  try {
    mkdirSync(join(base, dirname(BRIEF)), { recursive: true });
    writeFileSync(join(base, BRIEF), brief({ handoff: STALE }));
    process.env.PATH = '';
    assert.deepEqual(checkHandoff(base, 'T-900'), skipped('git cannot be run'));
  } finally {
    process.env.PATH = saved;
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('report gives the result lines and the exit code', () => {
  assert.deepEqual(report({ result: 'PASS', reason: 'Handoff names abc1234' }), { lines: ['PASS ' + TITLE], code: 0 });
  assert.deepEqual(report({ result: 'SKIP', reason: 'handoff not filled in' }), { lines: ['SKIP handoff check (handoff not filled in)'], code: 0 });
  const reason = 'Handoff does not name abc1234; latest code commit is abc1234 (Fix it)';
  assert.deepEqual(report({ result: 'FAIL', reason }), { lines: ['FAIL ' + TITLE, reason], code: 1 });
});

test('the Handoff of the brief for the current task branch names the latest code commit in this repo', (t) => {
  const outcome = checkHandoff(ROOT, taskFromBranch(currentBranch(ROOT)));
  if (outcome.result === 'SKIP') {
    t.skip(outcome.reason);
    return;
  }
  assert.equal(outcome.result, 'PASS', outcome.reason + '. Update the Handoff in the brief, then run verify.sh again');
});
