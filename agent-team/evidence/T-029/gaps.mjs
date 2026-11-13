import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = resolve(HERE, '..', '..', '..', 'scripts', 'handoff-check.mjs');
const MODE = process.argv[2];
const CASES = process.argv[3] || 'abce';
const WHO = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const BRANCH = 'task/T-900-fixture';
const OTHER_BRANCH = 'task/T-901-other';
const BRIEF = 'agent-team/tasks/T-900.md';
const STALE = '- Latest code commit: 0000000.';
const COMMITS = 14000;
const TAIL = 450;
const BIG = 256 * 1024 * 1024;
const ESC = String.fromCharCode(27);
const BELL = String.fromCharCode(7);
const NEXT_LINE = String.fromCharCode(133);
const SUBJECT = ESC + '[31mFix' + BELL + ' the ' + NEXT_LINE + 'wall';
const SUBJECT_TEXT = '[31mFix the wall';
const MARKER = 'fsmonitor-marker';

const made = [];
const out = [];
let asExpected = true;

const brief = (handoff) => ['# T-900 fixture', 'Status: IN REVIEW', '', '## Handoff', handoff, '', '## Review', '(reviewer fills in)', ''].join('\n');
const names = (hash) => '- Latest code commit: ' + hash.slice(0, 7) + '.';
const isControl = (code) => code <= 31 || (code >= 127 && code <= 159);
const controls = (text) => Array.from(text).map((ch) => ch.codePointAt(0)).filter(isControl);
const show = (text) => Array.from(text).map((ch) => (isControl(ch.codePointAt(0)) ? '<' + ch.codePointAt(0) + '>' : ch)).join('');
const yes = (flag) => (flag ? 'yes' : 'no');

function line(text, ok) {
  if (!ok) asExpected = false;
  out.push(text + ' [as expected for ' + MODE + ': ' + yes(ok) + ']');
}

function fixture(branch) {
  const base = mkdtempSync(join(tmpdir(), 'handoff-gaps-'));
  made.push(base);
  const root = join(base, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = join(base, 'gitconfig');
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (args, input) => execFileSync('git', args, {
    cwd: root, env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, maxBuffer: BIG,
  }).trim();
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
  git(['symbolic-ref', 'HEAD', 'refs/heads/' + branch]);
  return { base, root, git, write, commit };
}

function historyStream() {
  const parts = [];
  for (let i = 1; i <= COMMITS; i += 1) {
    const isCode = i <= COMMITS - TAIL;
    const subject = (isCode ? 'Code commit ' : 'Evidence commit ') + i + '\n';
    const path = isCode ? 'src/value.txt' : 'agent-team/evidence/T-900/value.txt';
    const content = 'value ' + i + '\n';
    parts.push('commit refs/heads/' + BRANCH, 'mark :' + i, 'committer Fixture <fixture@example.invalid> ' + (1700000000 + i) + ' +0000');
    parts.push('data ' + subject.length, subject + (i > 1 ? 'from :' + (i - 1) : '').trimEnd());
    parts.push('M 100644 inline ' + path, 'data ' + content.length, content);
  }
  return parts.filter((part) => part !== '').join('\n') + '\n';
}

function caseA(mod) {
  const started = Date.now();
  const repo = fixture(BRANCH);
  repo.git(['fast-import', '--quiet'], historyStream());
  const count = repo.git(['rev-list', '--count', '--first-parent', 'HEAD']);
  const code = repo.git(['rev-parse', 'HEAD~' + TAIL]);
  const subject = repo.git(['log', '-1', '--format=%s', code]);
  const built = Date.now() - started;
  repo.write(BRIEF, brief(STALE));
  const stale = mod.checkHandoff(repo.root, 'T-900');
  repo.write(BRIEF, brief(names(code)));
  const named = mod.checkHandoff(repo.root, 'T-900');
  const head = 'a. long history: ' + count + ' first-parent commits (the newest ' + TAIL + ' touch agent-team/ only), fixture built in ' + built + ' ms, latest code commit ' + code.slice(0, 7) + ' (' + subject + ')';
  const text = head + '; Handoff names 0000000 -> ' + stale.result + ' (' + stale.reason + '); Handoff names ' + code.slice(0, 7) + ' -> ' + named.result + ' (' + named.reason + ')';
  const fails = stale.result === 'FAIL' && stale.commit === code && stale.reason.includes(code.slice(0, 7)) && stale.reason.includes('(' + subject + ')');
  const ok = MODE === 'before'
    ? count === String(COMMITS) && stale.result === 'SKIP' && stale.reason === 'git history cannot be read'
    : count === String(COMMITS) && fails && named.result === 'PASS' && named.commit === code;
  line(text, ok);
}

function caseB(mod) {
  const first = fixture(BRANCH);
  const code = first.commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief(STALE) });
  const second = fixture(OTHER_BRANCH);
  const otherCode = second.commit('Other work', { 'src/other.js': 'export const b = 1;\n', [BRIEF]: brief(STALE) });
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  let plain = '';
  let fromModule = '';
  let outcome = null;
  try {
    process.env.GIT_DIR = join(second.root, '.git');
    process.env.GIT_WORK_TREE = second.root;
    plain = execFileSync('git', ['branch', '--show-current'], { cwd: first.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    fromModule = typeof mod.currentBranch === 'function' ? mod.currentBranch(first.root) : '(currentBranch is not exported)';
    outcome = mod.checkHandoff(first.root, 'T-900');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const whose = outcome.commit === code ? 'the first repo' : outcome.commit === otherCode ? 'the second repo' : 'neither repo';
  const text = 'b. foreign environment: first repo on ' + BRANCH + ', GIT_DIR and GIT_WORK_TREE set to a second repo on ' + OTHER_BRANCH
    + '; branch read made as the real-repo test makes it on BASE (plain git call, cwd first repo) -> ' + plain
    + '; branch read through the module -> ' + fromModule
    + '; checkHandoff(first repo) -> ' + outcome.result + ' for the code commit of ' + whose
    + '; environment restored: ' + yes(process.env.GIT_DIR === saved.GIT_DIR && process.env.GIT_WORK_TREE === saved.GIT_WORK_TREE);
  const ok = MODE === 'before' ? plain === OTHER_BRANCH : fromModule === BRANCH && outcome.result === 'FAIL' && outcome.commit === code;
  line(text, ok);
}

function caseC(mod) {
  const repo = fixture(BRANCH);
  const code = repo.commit(SUBJECT, { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief(STALE) });
  const stored = controls(repo.git(['log', '-1', '--format=%s', code]));
  const outcome = mod.checkHandoff(repo.root, 'T-900');
  const printed = mod.report(outcome).lines.join('\n');
  const inReason = controls(outcome.reason);
  const inSubject = controls(outcome.subject);
  const inPrinted = controls(printed).filter((codePoint) => codePoint !== 10);
  const kept = outcome.reason.includes('(' + SUBJECT_TEXT + ')') && printed.includes('(' + SUBJECT_TEXT + ')') && outcome.subject === SUBJECT_TEXT;
  const text = 'c. control characters: commit subject as git stores it holds the character codes ' + stored.join(', ')
    + '; ' + outcome.result + ' reason: ' + show(outcome.reason)
    + '; control codes in reason: ' + (inReason.join(', ') || 'none')
    + '; in subject: ' + (inSubject.join(', ') || 'none')
    + '; in the printed lines (line ends not counted): ' + (inPrinted.join(', ') || 'none')
    + '; other text of the subject kept in subject, reason and printed lines: ' + yes(kept);
  const ok = MODE === 'before'
    ? outcome.result === 'FAIL' && inReason.includes(27)
    : outcome.result === 'FAIL' && inReason.length === 0 && inSubject.length === 0 && inPrinted.length === 0 && kept;
  line(text, ok);
}

function caseE(mod) {
  const repo = fixture(BRANCH);
  repo.commit('Add the game', { 'src/game.js': 'export const a = 1;\n', [BRIEF]: brief(STALE) });
  const marker = join(repo.base, MARKER);
  const command = 'printf ran > \'' + marker.split('\\').join('/') + '\'; :';
  repo.git(['config', 'core.fsmonitor', command]);
  const before = existsSync(marker);
  const outcome = mod.checkHandoff(repo.root, 'T-900');
  const after = existsSync(marker);
  const text = 'e. fsmonitor: fixture .git/config sets core.fsmonitor to a command that only writes ' + MARKER + ' inside the fixture folder'
    + '; marker before the call: ' + yes(before) + '; one checkHandoff call -> ' + outcome.result
    + '; marker created by the call: ' + yes(after);
  const ok = MODE === 'before' ? !before && after : !before && !after && outcome.result === 'FAIL';
  line(text, ok);
}

async function main() {
  if (MODE !== 'before' && MODE !== 'after') {
    process.stdout.write('usage: node agent-team/evidence/T-029/gaps.mjs before|after [cases, default abce]\n');
    return 2;
  }
  const mod = await import(pathToFileURL(MODULE).href);
  const all = { a: caseA, b: caseB, c: caseC, e: caseE };
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
  process.stdout.write('gaps.mjs ' + MODE + ' ' + CASES + ', exports of scripts/handoff-check.mjs: ' + Object.keys(mod).sort().join(', ') + '\n' + out.join('\n') + '\n');
  return asExpected ? 0 : 1;
}

process.exit(await main());
