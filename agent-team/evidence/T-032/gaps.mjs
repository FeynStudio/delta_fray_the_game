import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = resolve(HERE, '..', '..', '..', 'scripts', 'handoff-check.mjs');
const MODE = process.argv[2];
const CASES = process.argv[3] || '14r';
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const REF = 'refs/heads/' + BRANCH;
const BRIEF = 'agent-team/tasks/T-900.md';
const STALE = '- Latest code commit: 0000000.';
const UNREADABLE = 'git history cannot be read';
const MARKER = 'marker';
const RUN = 'printf ran > ../' + MARKER + '; :';
const FILES = 20000;
const FOLDERS = 200;
const MIN_BYTES = 1420000;
const BIG = 256 * 1024 * 1024;
const WHEN = 1700000000;
const NOT_CODE = 'agent-team/';
const LARGE_SUBJECT = 'Add the generated files';
const RULE_CASES = [
  ['a file in agent-team/ only (root commit)', 'agent-team/a.md'],
  ['a code file', 'src/game.js'],
  ['a nested path in agent-team/ only', 'agent-team/x/y/z.md'],
  ['a top-level file agent-team.txt', 'agent-team.txt'],
  ['a folder agent-teams/', 'agent-teams/a.txt'],
  ['a nested docs/agent-team/', 'docs/agent-team/a.txt'],
  ['a folder Agent-Team/ (upper case)', 'Agent-Team/a.txt'],
  ['a file in agent-team/ and a code file', 'agent-team/b.md', 'zz.txt'],
  ['a file in agent-team/ with glob characters in its name', 'agent-team/[x]y.md'],
  ['a dot file', '.hidden'],
  ['a code file deleted', '-src/game.js'],
  ['a file in agent-team/ deleted', '-agent-team/b.md'],
  ['every file in agent-team/ deleted and a top-level file named agent-team added', '-agent-team/a.md', '-agent-team/x/y/z.md', '-agent-team/[x]y.md', 'agent-team'],
  ['the file named agent-team deleted and a file in agent-team/ added', '-agent-team', 'agent-team/c.md'],
];

const made = [];
const out = [];
let asExpected = true;

const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');
const names = (hash) => '- Latest code commit: ' + hash.slice(0, 7) + '.';
const yes = (flag) => (flag ? 'yes' : 'no');
const short = (hash) => (hash ? hash.slice(0, 7) : 'none');
const told = (outcome) => outcome.result + ' (' + outcome.reason + ')';

function line(text, ok) {
  if (!ok) asExpected = false;
  out.push(text + ' [as expected for ' + MODE + ': ' + yes(ok) + ']');
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'handoff-gaps-'));
  made.push(base);
  const root = join(base, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = join(base, 'gitconfig');
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (args, input) => execFileSync('git', args, {
    cwd: root, env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, maxBuffer: BIG,
  }).trim();
  const attempt = (args) => {
    try {
      git(args);
      return 'exit 0';
    } catch (error) {
      return 'exit ' + error.status;
    }
  };
  const write = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const commit = (subject, files) => {
    for (const [file, text] of Object.entries(files)) write(file, text);
    git(['add', '-A']);
    git([...WHO, 'commit', '-q', '-m', subject]);
    return git(['rev-parse', 'HEAD']);
  };
  mkdirSync(root);
  writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  git(['init', '-q']);
  git(['symbolic-ref', 'HEAD', REF]);
  return { base, root, git, attempt, write, commit };
}

function stream(commits) {
  const parts = ['blob', 'mark :1', 'data 5', 'file'];
  commits.forEach(({ subject, changes }, index) => {
    const mark = index + 2;
    parts.push('commit ' + REF, 'mark :' + mark, 'committer Fixture <fixture@example.invalid> ' + (WHEN + index) + ' +0000', 'data ' + Buffer.byteLength(subject), subject);
    if (index > 0) parts.push('from :' + (mark - 1));
    for (const change of changes) parts.push(change.startsWith('-') ? 'D ' + change.slice(1) : 'M 100644 :1 ' + change);
    parts.push('');
  });
  return parts.join('\n') + '\n';
}

function caseOne(mod) {
  const repo = fixture();
  repo.commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief(STALE) });
  const marker = join(repo.base, MARKER);
  for (const [key, value] of [['extensions.partialClone', 'origin'], ['remote.origin.promisor', 'true'], ['remote.origin.url', '../remote'], ['remote.origin.uploadpack', RUN]]) repo.git(['config', key, value]);
  const tree = repo.git(['rev-parse', 'HEAD^{tree}']);
  rmSync(join(repo.root, '.git', 'objects', tree.slice(0, 2), tree.slice(2)), { force: true });
  const plain = repo.attempt(['diff-tree', '--root', 'HEAD']);
  const isLive = existsSync(marker);
  rmSync(marker, { force: true });
  const outcome = mod.checkHandoff(repo.root, 'T-900');
  const byCheck = existsSync(marker);
  rmSync(marker, { force: true });
  const branch = typeof mod.currentBranch === 'function' ? mod.currentBranch(repo.root) : '';
  const byBranch = existsSync(marker);
  const text = '1. promisor remote (row 1): fixture .git/config sets extensions.partialClone, remote.origin.promisor, remote.origin.url and remote.origin.uploadpack to a command that only writes ' + MARKER
    + ' inside the fixture folder; the loose object of the HEAD tree is deleted'
    + '; plain `git diff-tree --root HEAD` with the fixture\'s own environment -> ' + plain + ', marker created (the fixture is live): ' + yes(isLive)
    + '; one checkHandoff call -> ' + told(outcome) + ', marker created by the call: ' + yes(byCheck)
    + '; one currentBranch call -> ' + branch + ', marker created by the call: ' + yes(byBranch);
  const skips = outcome.result === 'SKIP' && outcome.reason === UNREADABLE;
  line(text, MODE === 'before' ? isLive && byCheck && skips : isLive && !byCheck && !byBranch && skips && branch === BRANCH);
}

function largeNames(folder) {
  return Array.from({ length: FILES }, (_, i) => folder + 'part-' + String(i % FOLDERS).padStart(3, '0') + '/generated-file-with-a-long-name-for-the-large-commit-fixture-' + String(i).padStart(6, '0') + '.txt');
}

function caseFour(mod) {
  const started = Date.now();
  const first = fixture();
  first.git(['fast-import', '--quiet'], stream([
    { subject: 'Add the game', changes: ['src/game.js'] },
    { subject: LARGE_SUBJECT, changes: largeNames('src/generated/') },
  ]));
  const large = first.git(['rev-parse', 'HEAD']);
  const bytes = Buffer.byteLength(first.git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD~1', 'HEAD']));
  const built = Date.now() - started;
  first.write(BRIEF, brief(STALE));
  const stale = mod.checkHandoff(first.root, 'T-900');
  first.write(BRIEF, brief(names(large)));
  const named = mod.checkHandoff(first.root, 'T-900');
  const head = '4. large path list (row 4), first fixture: the latest commit ' + short(large) + ' (' + LARGE_SUBJECT + ') adds ' + FILES + ' files in ' + FOLDERS + ' folders outside agent-team/, ' + bytes
    + ' bytes of path names (at least ' + MIN_BYTES + ': ' + yes(bytes >= MIN_BYTES) + '), built with one git fast-import process in ' + built + ' ms';
  const text = head + '; Handoff names 0000000 -> ' + told(stale) + '; Handoff names ' + short(large) + ' -> ' + told(named);
  const fails = stale.result === 'FAIL' && stale.commit === large && stale.reason.includes(short(large)) && stale.reason.includes('(' + LARGE_SUBJECT + ')');
  line(text, bytes >= MIN_BYTES && (MODE === 'before'
    ? stale.result === 'SKIP' && stale.reason === UNREADABLE
    : fails && named.result === 'PASS' && named.commit === large));

  const second = fixture();
  second.git(['fast-import', '--quiet'], stream([
    { subject: 'Add the game', changes: ['src/game.js'] },
    { subject: 'Add the evidence files', changes: largeNames('agent-team/evidence/T-900/') },
  ]));
  const code = second.git(['rev-parse', 'HEAD~1']);
  const otherBytes = Buffer.byteLength(second.git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD~1', 'HEAD']));
  second.write(BRIEF, brief(STALE));
  const walked = mod.checkHandoff(second.root, 'T-900');
  second.write(BRIEF, brief(names(code)));
  const passed = mod.checkHandoff(second.root, 'T-900');
  const more = '4. large path list (row 4), second fixture: the latest commit adds ' + FILES + ' files in agent-team/ only, ' + otherBytes + ' bytes of path names; the commit before it, '
    + short(code) + ' (Add the game), is the code commit; Handoff names 0000000 -> ' + told(walked) + ', commit in the outcome: ' + short(walked.commit)
    + '; Handoff names ' + short(code) + ' -> ' + told(passed);
  line(more, otherBytes >= MIN_BYTES && (MODE === 'before'
    ? walked.result === 'SKIP' && walked.reason === UNREADABLE
    : walked.result === 'FAIL' && walked.commit === code && passed.result === 'PASS' && passed.commit === code));
}

function caseRule(mod) {
  const repo = fixture();
  repo.git(['-c', 'core.ignorecase=false', 'fast-import', '--quiet'], stream(RULE_CASES.map(([subject, ...changes]) => ({ subject, changes }))));
  repo.write(BRIEF, brief(STALE));
  const commits = repo.git(['rev-list', '--reverse', 'HEAD']).split('\n');
  let expected = null;
  let same = commits.length === RULE_CASES.length;
  commits.forEach((commit, index) => {
    const range = index === 0 ? ['--root', commit] : [commits[index - 1], commit];
    const listed = repo.git(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', ...range]).split('\0').filter(Boolean);
    const isCode = listed.some((name) => !name.startsWith(NOT_CODE));
    if (isCode) expected = commit;
    repo.git(['update-ref', REF, commit]);
    const outcome = mod.checkHandoff(repo.root, 'T-900');
    const agrees = outcome.commit === expected;
    if (!agrees) same = false;
    out.push('   r' + (index + 1) + '. ' + RULE_CASES[index][0] + ': code commit by the BASE rule (a listed name does not start with agent-team/): ' + yes(isCode)
      + '; latest code commit by that rule: ' + short(expected) + '; by the module: ' + short(outcome.commit) + ' (' + outcome.result + '); same: ' + yes(agrees));
  });
  line('r. same rule for C (row 4): ' + commits.length + ' commits made with one git fast-import process, the branch moved to each in turn; the module gives the same latest code commit as the BASE rule for every one: ' + yes(same), same);
}

async function main() {
  if (MODE !== 'before' && MODE !== 'after') {
    process.stdout.write('usage: node agent-team/evidence/T-032/gaps.mjs before|after [cases, default 14r]\n');
    return 2;
  }
  const mod = await import(pathToFileURL(MODULE).href);
  const all = { 1: caseOne, 4: caseFour, r: caseRule };
  try {
    for (const [key, run] of Object.entries(all)) {
      if (CASES.includes(key)) run(mod);
    }
  } finally {
    for (const base of made) rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
  const left = made.filter((base) => existsSync(base)).length;
  if (left > 0) asExpected = false;
  out.push('fixtures made in the OS temp dir: ' + made.length + '; left after the run: ' + left);
  out.push('all cases as expected for ' + MODE + ': ' + yes(asExpected));
  const version = execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
  process.stdout.write('gaps.mjs ' + MODE + ' ' + CASES + ', ' + version + ', node ' + process.version + ', platform ' + process.platform
    + ', exports of scripts/handoff-check.mjs: ' + Object.keys(mod).sort().join(', ') + '\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(await main());
