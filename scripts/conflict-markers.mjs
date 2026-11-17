import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NEWLINE = '\n';
const RETURN = '\r';
const SPACE = ' ';
const MARKS = ['<', '>', '|'];
const RUN = 7;
const HEAD_BYTES = 8000;
const GIT_NAME = '.git';
const SKIP_DIRS = ['node_modules', 'secrets'];
const ENV_NAME = '.env';
const LAST_C0 = 0x1f;
const FIRST_C1 = 0x7f;
const LAST_C1 = 0x9f;
const MESSAGE = 'GUARD FAIL [no-conflict-markers]: Resolve the merge conflict; never commit conflict markers';

function isMarker(line) {
  if (!MARKS.includes(line[0]) || !line.startsWith(line[0].repeat(RUN))) return false;
  return line.length === RUN || line[RUN] === SPACE;
}

function clean(text) {
  const keep = (code) => code > LAST_C0 && (code < FIRST_C1 || code > LAST_C1);
  return Array.from(text).filter((ch) => keep(ch.codePointAt(0))).join('');
}

export function findMarkers(text) {
  const found = [];
  text.split(NEWLINE).forEach((raw, index) => {
    const line = raw.endsWith(RETURN) ? raw.slice(0, -1) : raw;
    if (isMarker(line)) found.push({ line: index + 1, text: clean(line) });
  });
  return found;
}

const isEnvFile = (name) => name === ENV_NAME || name.startsWith(ENV_NAME + '.');

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
    for (const hit of findMarkers(data.toString('utf8'))) found.push({ file, line: hit.line, text: hit.text });
  }
  return found;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const found = checkTree(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (found.length > 0) {
    process.stdout.write(MESSAGE + NEWLINE);
    for (const hit of found) process.stdout.write(`${hit.file}:${hit.line}: ${hit.text}${NEWLINE}`);
    process.exit(1);
  }
}
