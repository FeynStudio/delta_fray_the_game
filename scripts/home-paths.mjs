import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NEWLINE = '\n';
const HEAD_BYTES = 8000;
const GIT_NAME = '.git';
const SKIP_DIRS = ['node_modules', 'secrets'];
const ENV_NAME = '.env';
const ENV_PREFIX = '.env.';
const ENV_KEPT = '.env.example';
const PATTERNS = [
  ['windows', /[A-Za-z]:[\\/]+users[\\/]+[A-Za-z0-9_]/i],
  ['drive-mount', /\/[A-Za-z]\/users\/[A-Za-z0-9_]/i],
  ['home', /(?:^|[^A-Za-z0-9_.-])\/(?:Users|home)\/[A-Za-z0-9_]/],
];
const MESSAGE = 'GUARD FAIL [no-home-paths]: Replace the home-directory path with a placeholder such as <OS temp dir> or <user>; never commit an account name';

function firstKind(line) {
  let first = null;
  for (const [kind, pattern] of PATTERNS) {
    const at = line.search(pattern);
    if (at !== -1 && (first === null || at < first.at)) first = { at, kind };
  }
  return first === null ? null : first.kind;
}

export function findHomePaths(text) {
  const found = [];
  text.split(NEWLINE).forEach((line, index) => {
    const kind = firstKind(line);
    if (kind !== null) found.push({ line: index + 1, kind });
  });
  return found;
}

const isEnvFile = (name) => name !== ENV_KEPT && (name === ENV_NAME || name.startsWith(ENV_PREFIX));

function walk(base, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === GIT_NAME) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) walk(base, full, out);
    } else if (entry.isFile() && !isEnvFile(entry.name)) out.push({ full, file: relative(base, full).split(sep).join('/') });
  }
  return out;
}

export function checkTree(root) {
  const base = resolve(root);
  const files = walk(base, base, []).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const found = [];
  for (const { full, file } of files) {
    const data = readFileSync(full);
    if (data.subarray(0, HEAD_BYTES).includes(0)) continue;
    for (const hit of findHomePaths(data.toString('utf8'))) found.push({ file, line: hit.line, kind: hit.kind });
  }
  return found;
}

export function report(found) {
  if (found.length === 0) return { lines: [], code: 0 };
  return { lines: [MESSAGE, ...found.map((hit) => `${hit.file}:${hit.line}: ${hit.kind} home-directory path`)], code: 1 };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const { lines, code } = report(checkTree(resolve(dirname(fileURLToPath(import.meta.url)), '..')));
  for (const line of lines) process.stdout.write(line + NEWLINE);
  process.exit(code);
}
