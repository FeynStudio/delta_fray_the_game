import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const DIGITS = '0123456789';
const NEWLINE = '\n';
const BRANCH_PREFIX = 'task/';
const TASK_PREFIX = 'T-';
const MIN_DIGITS = 3;
const SHORT = 7;
const TASKS_DIR = ['agent-team', 'tasks'];
const NOT_CODE = 'agent-team/';
const HEADING = '## ';
const HANDOFF_HEADING = '## Handoff';
const STATUS = 'Status:';
const CLOSED = 'DONE';
const PLACEHOLDER = '(owner fills in)';
const TITLE = 'handoff names the latest code commit';
const REPO_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX'];

function taskId(text) {
  if (typeof text !== 'string' || !text.startsWith(TASK_PREFIX)) return null;
  let end = TASK_PREFIX.length;
  while (end < text.length && DIGITS.includes(text[end])) end += 1;
  if (end - TASK_PREFIX.length < MIN_DIGITS) return null;
  if (end < text.length && text[end] !== '-') return null;
  return text.slice(0, end);
}

export function taskFromBranch(name) {
  if (typeof name !== 'string' || !name.startsWith(BRANCH_PREFIX)) return null;
  return taskId(name.slice(BRANCH_PREFIX.length));
}

function git(root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !REPO_ENV.includes(key)));
  return execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
}

function briefStatus(lines) {
  for (const line of lines) {
    if (line.startsWith(HEADING)) return '';
    if (line.startsWith(STATUS)) return line.slice(STATUS.length).trim();
  }
  return '';
}

function handoffSection(lines) {
  const start = lines.findIndex((line) => line.trimEnd() === HANDOFF_HEADING);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith(HEADING));
  return (next === -1 ? rest : rest.slice(0, next)).join(NEWLINE);
}

function latestCodeCommit(root) {
  const rows = git(root, ['rev-list', '--first-parent', '--parents', 'HEAD']).split(NEWLINE).filter(Boolean);
  for (const row of rows) {
    const [commit, parent] = row.trim().split(' ');
    const range = parent ? [parent, commit] : ['--root', commit];
    const names = git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', ...range]).split('\0').filter(Boolean);
    if (names.some((name) => !name.startsWith(NOT_CODE))) return commit;
  }
  return null;
}

const skip = (reason) => ({ result: 'SKIP', reason, commit: null, subject: null });

export function checkHandoff(root, task) {
  const id = taskId(task);
  if (id === null) return skip('no task: not on a task branch');
  const file = join(resolve(root), ...TASKS_DIR, id + '.md');
  if (!existsSync(file)) return skip('no brief agent-team/tasks/' + id + '.md');
  const lines = readFileSync(file, 'utf8').split(NEWLINE).map((line) => line.trimEnd());
  if (briefStatus(lines).split(' ')[0] === CLOSED) return skip('brief ' + id + ' is DONE');
  const handoff = handoffSection(lines);
  if (handoff.split(PLACEHOLDER).join('').trim() === '') return skip('handoff not filled in');
  let stage = 'not a git repo';
  try {
    if (git(root, ['rev-parse', '--show-prefix']).trim() !== '') return skip('not the top folder of a git repo');
    stage = 'git history cannot be read';
    const commit = latestCodeCommit(root);
    if (commit === null) return skip('no commit touches a path outside agent-team/');
    const subject = git(root, ['log', '-1', '--format=%s', commit]).trim();
    const short = commit.slice(0, SHORT);
    if (handoff.toLowerCase().includes(short)) return { result: 'PASS', reason: 'Handoff names ' + short, commit, subject };
    return { result: 'FAIL', reason: 'Handoff does not name ' + short + '; latest code commit is ' + short + ' (' + subject + ')', commit, subject };
  } catch (error) {
    return skip(error.code === 'ENOENT' ? 'git cannot be run' : stage);
  }
}

export function report(outcome) {
  if (outcome.result === 'SKIP') return { lines: ['SKIP handoff check (' + outcome.reason + ')'], code: 0 };
  if (outcome.result === 'PASS') return { lines: ['PASS ' + TITLE], code: 0 };
  return { lines: ['FAIL ' + TITLE, outcome.reason], code: 1 };
}

function currentBranch(root) {
  try {
    return git(root, ['branch', '--show-current']).trim();
  } catch {
    return '';
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const task = process.argv[2] || taskFromBranch(currentBranch(root));
  const { lines, code } = report(checkHandoff(root, task));
  for (const line of lines) process.stdout.write(line + NEWLINE);
  process.exit(code);
}
