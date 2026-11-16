import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHandoff, currentBranch, gitEnv, report, taskFromBranch } from '../scripts/handoff-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const BRIEF = 'agent-team/tasks/T-900.md';
const PLACEHOLDER = '(owner fills in)';
const STALE = '- Latest code commit: 0000000.';
const TITLE = 'handoff names the latest code commit';
const NO_GRAFTS = join(ROOT, 'scripts', 'handoff-check.mjs', 'none');
const NO_TASK = { result: 'SKIP', reason: 'no task: not on a task branch', commit: null, subject: null };

const brief = ({ status = 'IN REVIEW', context = 'None.', handoff = PLACEHOLDER, eol = '\n' } = {}) => [
  '# T-900 fixture', 'Status: ' + status, '', '## Context', context, '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', '',
].join(eol);

async function inRepo(run) {
  const base = mkdtempSync(join(tmpdir(), 'handoff-check-'));
  const root = join(base, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
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
    return await run({ root, env, git, write, commit });
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
}

const names = (hash) => '- Latest code commit: ' + hash.slice(0, 7) + '.';
const check = (repo) => checkHandoff(repo.root, 'T-900');
const skipped = (reason) => ({ result: 'SKIP', reason, commit: null, subject: null });
const insideRepo = (dir) => existsSync(join(dir, '.git')) || (dirname(dir) !== dir && insideRepo(dirname(dir)));
const CONTROLS = [27, 7, 133].map((code) => String.fromCharCode(code));
const EDGES = [0x1f, 0x7f, 0x20, 0xa0].map((code) => String.fromCharCode(code));
const MARKER = 'marker';
const RUN = 'printf ran > ../' + MARKER;
const GPG = '#!/bin/sh\n' + RUN + '\n';
const PROMISOR = ['[extensions]', 'partialClone = origin', '[remote "origin"]', 'promisor = true', 'url = ../remote', 'uploadpack = "' + RUN + '; :"', ''].join('\n');
const SIGNATURE = ['gpgsig -----BEGIN PGP SIGNATURE-----', ' ', ' fixture', ' -----END PGP SIGNATURE-----'].join('\n');
const LATE = 'committer Fixture <fixture@example.invalid> 4102444800 +0000';
const REMOVED_ENV = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX',
  'GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS',
];
const failure = (commit, subject) => ({ result: 'FAIL', reason: 'Handoff does not name ' + commit.slice(0, 7) + '; latest code commit is ' + commit.slice(0, 7) + ' (' + subject + ')', commit, subject });
const withEnv = (name, value, run, saved = process.env[name]) => {
  process.env[name] = value;
  try { return run(); } finally { if (saved === undefined) delete process.env[name]; else process.env[name] = saved; }
};
const signed = (text) => text.replace('\n\n', '\n' + SIGNATURE + '\n\n');
const dated = (text) => text.split('\n').map((line) => (line.startsWith('committer ') ? LATE : line)).join('\n');

async function rewriteHead(repo, edit) {
  repo.write('../commit.txt', edit(await repo.git('cat-file', 'commit', 'HEAD') + '\n'));
  const hash = await repo.git('hash-object', '-t', 'commit', '-w', '../commit.txt');
  await repo.git('update-ref', 'HEAD', hash);
  return hash;
}

async function live(repo, ...args) {
  const marker = join(repo.root, '..', MARKER);
  assert.equal(existsSync(marker), false);
  await repo.git(...args).catch(() => '');
  assert.equal(existsSync(marker), true, 'the fixture does not run its marker command');
  rmSync(marker);
  return marker;
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

  test('removes U+001F and DEL from the subject and the reason, and keeps the space and U+00A0', async () => {
    await inRepo(async (repo) => {
      const [unitSeparator, del, space, noBreakSpace] = EDGES;
      const code = await repo.commit('Fix' + unitSeparator + del + space + noBreakSpace + 'wall', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief({ handoff: STALE }) });
      const short = code.slice(0, 7);
      const subject = 'Fix' + space + noBreakSpace + 'wall';
      assert.deepEqual(check(repo), {
        result: 'FAIL', reason: 'Handoff does not name ' + short + '; latest code commit is ' + short + ' (' + subject + ')', commit: code, subject,
      });
    });
  });

  test('keeps U+007E and removes U+009F in the subject and the reason', async () => {
    await inRepo(async (repo) => {
      const code = await repo.commit('Fix' + String.fromCharCode(0x7e) + 'the' + String.fromCharCode(0x9f) + 'wall', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief({ handoff: STALE }) });
      assert.deepEqual(check(repo), failure(code, 'Fix' + String.fromCharCode(0x7e) + 'thewall'));
    });
  });

  test('does not run the upload-pack command of a promisor remote when an object is missing', async () => {
    await withCode(async (repo) => {
      repo.write(BRIEF, brief({ handoff: STALE }));
      writeFileSync(join(repo.root, '.git', 'config'), PROMISOR, { flag: 'a' });
      const tree = await repo.git('rev-parse', 'HEAD^{tree}');
      rmSync(join(repo.root, '.git', 'objects', tree.slice(0, 2), tree.slice(2)), { force: true });
      const marker = await live(repo, 'diff-tree', '--root', 'HEAD');
      assert.deepEqual(check(repo), skipped('git history cannot be read'));
      assert.equal(currentBranch(repo.root), BRANCH);
      assert.equal(existsSync(marker), false);
    });
  });

  test('does not run the fsmonitor command of the repo', async () => {
    await withCode(async (repo, code) => {
      repo.write(BRIEF, brief({ handoff: STALE }));
      await repo.git('config', 'core.fsmonitor', RUN + '; :');
      const marker = await live(repo, 'status');
      assert.equal(check(repo).commit, code);
      assert.equal(currentBranch(repo.root), BRANCH);
      assert.equal(existsSync(marker), false);
    });
  });

  test('does not run the gpg program of the repo for a signed commit and names that commit', async () => {
    await withCode(async (repo) => {
      repo.write(BRIEF, brief({ handoff: STALE }));
      const code = await rewriteHead(repo, signed);
      writeFileSync(join(repo.root, '..', 'gpg'), GPG, { mode: 0o755 });
      await repo.git('config', 'log.showSignature', 'true');
      await repo.git('config', 'gpg.program', join(repo.root, '..', 'gpg'));
      const marker = await live(repo, 'log', '-1', '--format=%s');
      const outcome = check(repo);
      assert.equal(outcome.result, 'FAIL');
      assert.equal(outcome.commit, code);
      assert.equal(outcome.subject, 'Add the game');
      assert.equal(existsSync(marker), false);
    });
  });

  test('walks first parents only, so a merged side branch that adds and removes code is not the latest code commit', async () => {
    await withCode(async (repo, code) => {
      await repo.git('checkout', '-q', '-b', 'side');
      await repo.commit('Side adds code', { 'src/side.js': 'export const b = 1;\n' });
      rmSync(join(repo.root, 'src', 'side.js'));
      await repo.commit('Side removes code', {});
      const side = await rewriteHead(repo, dated);
      await repo.git('checkout', '-q', BRANCH);
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      await repo.git(...WHO, 'merge', '-q', '--no-ff', '-m', 'Merge side into the task', 'side');
      assert.equal((await repo.git('rev-list', '--parents', '-n', '1', 'HEAD')).split(' ')[2], side);
      assert.deepEqual(check(repo), { result: 'PASS', reason: 'Handoff names ' + code.slice(0, 7), commit: code, subject: 'Add the game' });
    });
  });

  test('counts a name that only starts like agent-team/, a nested agent-team folder and a deleted code file as code', async () => {
    await inRepo(async (repo) => {
      await repo.commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief({ handoff: STALE }) });
      for (const file of ['agent-team.txt', 'agent-teams/notes.txt', 'docs/agent-team/notes.txt']) {
        const added = await repo.commit('Add ' + file, { [file]: 'Notes.\n' });
        assert.equal(check(repo).commit, added);
      }
      rmSync(join(repo.root, 'src', 'game.js'));
      const removed = await repo.commit('Remove the game', {});
      assert.equal(check(repo).commit, removed);
      await repo.git('rm', '-r', '-q', '--cached', 'agent-team');
      await repo.git(...WHO, 'commit', '-q', '-m', 'Untrack agent-team');
      const index = async (subject, ...args) => {
        await repo.git('update-index', ...args, 'agent-team');
        await repo.git(...WHO, 'commit', '-q', '-m', subject);
        return repo.git('rev-parse', 'HEAD');
      };
      const file = await index('Add a file named agent-team', '--add', '--cacheinfo', '100644', await repo.git('hash-object', '-w', BRIEF));
      assert.equal(check(repo).commit, file);
      await index('Remove the file named agent-team', '--force-remove');
      const gitlink = await index('Add a gitlink named agent-team', '--add', '--cacheinfo', '160000', removed);
      assert.equal(check(repo).commit, gitlink);
      for (const name of ['Agent-Team/x', 'AGENT-TEAM/x']) {
        await repo.git('update-index', '--add', '--cacheinfo', '100644', await repo.git('hash-object', '-w', BRIEF), name);
        await repo.git(...WHO, 'commit', '-q', '-m', 'Add ' + name);
        for (const ignoreCase of ['false', 'true']) {
          await repo.git('config', 'core.ignorecase', ignoreCase);
          assert.equal(check(repo).commit, await repo.git('rev-parse', 'HEAD'), name + ' with core.ignorecase ' + ignoreCase);
        }
      }
    });
  });

  test('ignores a replace ref that hides the latest code commit', async () => {
    await withCode(async (repo, code) => {
      await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      const later = await repo.commit('Fix the wall bounce', { 'src/game.js': 'export const a = 2;\n' });
      const tree = await repo.git('rev-parse', code + '^{tree}');
      const rewrite = (line) => (line.startsWith('tree ') ? 'tree ' + tree : line.startsWith('parent ') ? 'parent ' + code : line);
      repo.write('../replace.txt', (await repo.git('cat-file', 'commit', later)).split('\n').map(rewrite).join('\n') + '\n');
      await repo.git('update-ref', 'refs/replace/' + later, await repo.git('hash-object', '-t', 'commit', '-w', '../replace.txt'));
      assert.equal(await repo.git('rev-parse', 'HEAD^{tree}'), tree, 'plain git does not see the replacement');
      const short = later.slice(0, 7);
      assert.deepEqual(check(repo), {
        result: 'FAIL', reason: 'Handoff does not name ' + short + '; latest code commit is ' + short + ' (Fix the wall bounce)', commit: later, subject: 'Fix the wall bounce',
      });
    });
  });

  test('ignores a graft in .git/info/grafts or in GIT_GRAFT_FILE that hides the latest code commit', async () => {
    await withCode(async (repo, code) => {
      const handoff = await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      await repo.commit('Change the game', { 'src/game.js': 'export const a = 2;\n' });
      const revert = await repo.commit('Revert the change', { 'src/game.js': 'export const a = 1;\n' });
      const graft = await repo.commit('Notes', { 'agent-team/notes.md': 'Notes.\n' }) + ' ' + handoff + '\n';
      const file = join(repo.root, '..', 'grafts');
      writeFileSync(file, graft);
      for (const name of process.platform === 'win32' ? ['GIT_GRAFT_FILE', 'git_graft_file'] : ['GIT_GRAFT_FILE']) {
        repo.env[name] = file;
        assert.equal(await repo.git('rev-parse', 'HEAD^'), handoff, 'plain git does not follow ' + name);
        delete repo.env[name];
        assert.deepEqual(withEnv(name, file, () => check(repo)), failure(revert, 'Revert the change'));
      }
      repo.write('.git/info/grafts', graft);
      assert.equal(await repo.git('rev-parse', 'HEAD^'), handoff, 'plain git does not follow .git/info/grafts');
      assert.deepEqual(check(repo), failure(revert, 'Revert the change'));
    });
  });

  test('ignores a forged commit-graph file or chain that hides the latest code commit', async () => {
    await withCode(async (repo, code) => {
      const handoff = await repo.commit('Handoff', { [BRIEF]: brief({ handoff: names(code) }) });
      await repo.commit('Change the game', { 'src/game.js': 'export const a = 2;\n' });
      const revert = await repo.commit('Revert the change', { 'src/game.js': 'export const a = 1;\n' });
      const notes = await repo.commit('Notes', { 'agent-team/notes.md': 'Notes.\n' });
      const graph = join(repo.root, '.git', 'objects', 'info', 'commit-graph');
      await repo.git('commit-graph', 'write', '--reachable');
      writeFileSync(graph, forge(graph, notes, handoff));
      assert.equal(await repo.git('rev-parse', 'HEAD^'), handoff, 'plain git does not follow the forged commit-graph file');
      assert.deepEqual(check(repo), failure(revert, 'Revert the change'));
      rmSync(graph);
      await repo.git('commit-graph', 'write', '--reachable', '--split');
      const layer = (name) => join(graph + 's', name ? 'graph-' + name + '.graph' : 'commit-graph-chain');
      const data = forge(layer(readFileSync(layer(), 'utf8').trim()), notes, handoff);
      writeFileSync(layer(data.toString('hex', data.length - 20)), data);
      rmSync(layer());
      writeFileSync(layer(), data.toString('hex', data.length - 20) + '\n');
      assert.equal(await repo.git('rev-parse', 'HEAD^'), handoff, 'plain git does not follow the forged commit-graph chain');
      assert.deepEqual(check(repo), failure(revert, 'Revert the change'));
    });
  });
});

const caseVariants = (name) => [name, name.toLowerCase(), name.split('_').map((part) => part[0] + part.slice(1).toLowerCase()).join('_')];

for (const name of REMOVED_ENV.flatMap(caseVariants)) {
  test(`gitEnv removes ${name} from the environment given to git`, () => {
    const source = { [name]: 'set', KEPT: 'kept' };
    const result = gitEnv(source);
    assert.equal(Object.hasOwn(result, name), false);
    assert.equal(result.KEPT, 'kept');
    assert.deepEqual(source, { [name]: 'set', KEPT: 'kept' });
  });
}

for (const name of caseVariants('GIT_GRAFT_FILE')) {
  test(`gitEnv sets ${name} to a file that cannot exist over any value`, () => {
    for (const value of ['', 'grafts', '.git/info/grafts']) assert.deepEqual(gitEnv({ PATH: 'bin', [name]: value }), { PATH: 'bin', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: NO_GRAFTS });
    assert.equal(existsSync(NO_GRAFTS), false);
  });
}

test('gitEnv keeps the other names and always sets GIT_NO_LAZY_FETCH to 1', () => {
  const source = { PATH: 'bin', GIT_CONFIG_GLOBAL: 'gitconfig', GIT_NO_LAZY_FETCH: '0' };
  assert.deepEqual(gitEnv(source), { PATH: 'bin', GIT_CONFIG_GLOBAL: 'gitconfig', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: NO_GRAFTS });
  assert.deepEqual(source, { PATH: 'bin', GIT_CONFIG_GLOBAL: 'gitconfig', GIT_NO_LAZY_FETCH: '0' });
  assert.deepEqual(gitEnv({ PATH: 'bin' }), { PATH: 'bin', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: NO_GRAFTS });
});

test('gitEnv sets GIT_NO_LAZY_FETCH and GIT_NO_REPLACE_OBJECTS to 1 over any value or case of the name, and keeps names that only look like a removed one', () => {
  const forced = { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: NO_GRAFTS };
  for (const source of [{ GIT_NO_REPLACE_OBJECTS: '0' }, { git_no_replace_objects: '0', Git_No_Lazy_Fetch: '0' }, { Git_No_Replace_Objects: 'false', git_no_lazy_fetch: '' }]) {
    assert.deepEqual(gitEnv({ Path: 'bin', ...source }), { Path: 'bin', ...forced });
  }
  const lookalikes = { git_config_global: 'a', GIT_DIRS: 'b', XGIT_DIR: 'c', GIT_DIR_: 'd', git_prefix2: 'e' };
  assert.deepEqual(gitEnv(lookalikes), { ...lookalikes, ...forced });
});

test('checkHandoff and currentBranch answer for the repo at root when a lower-case git_dir points at another repo', async () => {
  await withCode((repo, code) => inRepo(async (other) => {
    repo.write(BRIEF, brief({ handoff: STALE }));
    await other.git('symbolic-ref', 'HEAD', 'refs/heads/task/T-901-other');
    const saved = process.env.git_dir;
    try {
      process.env.git_dir = join(other.root, '.git');
      assert.equal(currentBranch(repo.root), BRANCH);
      assert.equal(check(repo).commit, code);
    } finally {
      if (saved === undefined) delete process.env.git_dir;
      else process.env.git_dir = saved;
    }
  }));
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
    if (saved === undefined) delete process.env.PATH;
    else process.env.PATH = saved;
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
