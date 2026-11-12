import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SLASH = '/';
const STAR = '*';
const HASH = '#';
const BACKSLASH = '\\';
const NEWLINE = '\n';
const LINE_OPEN = SLASH + SLASH;
const BLOCK_OPEN = SLASH + STAR;
const BLOCK_CLOSE = STAR + SLASH;
const HTML_OPEN = '<' + '!--';
const HTML_CLOSE = '--' + '>';
const WORD = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$';
const BLANK = ' \t\r\n\f\v';
const REGEX_AFTER_WORD = ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'];
const KINDS = { '.js': 'js', '.mjs': 'js', '.sh': 'sh', '.html': 'html' };
const CODE_DIRS = [
  { dir: 'src', exts: ['.js', '.mjs'] },
  { dir: 'tests', exts: ['.js', '.mjs'] },
  { dir: 'sim', exts: ['.js', '.mjs'] },
  { dir: 'scripts', exts: ['.js', '.mjs', '.sh'] },
];
const EVIDENCE_DIR = 'agent-team/evidence';
const EVIDENCE_EXTS = ['.js', '.mjs', '.sh', '.html'];
const OLD_EVIDENCE = Array.from({ length: 14 }, (_, i) => 'T-0' + String(i + 1).padStart(2, '0'));
const ALLOWED = [
  { file: 'scripts/run-scenario.mjs', text: ' nosemgrep: javascript.lang.security.insecure-object-assign.insecure-object-assign' },
  { file: 'scripts/smoke.mjs', text: ' nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket' },
];
const MESSAGE = 'GUARD FAIL [no-comments]: Remove the comment; put the reason in the brief, the handoff or FEATURE_MAP';

const isWord = (ch) => ch !== undefined && (WORD.includes(ch) || ch > '\x7f');
const lineOf = (text, index) => text.slice(0, index).split(NEWLINE).length;
const firstLine = (text) => text.split(NEWLINE)[0].trimEnd();
const lineEnd = (text, from) => {
  const end = text.indexOf(NEWLINE, from);
  return end === -1 ? text.length : end;
};

function skipQuoted(text, start) {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote && text[i] !== NEWLINE) i += text[i] === BACKSLASH ? 2 : 1;
  return i + 1;
}

function skipRegex(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length && text[i] !== NEWLINE && (inClass || text[i] !== SLASH)) {
    if (text[i] === BACKSLASH) i += 1;
    else if (text[i] === '[') inClass = true;
    else if (text[i] === ']') inClass = false;
    i += 1;
  }
  i += 1;
  while (isWord(text[i])) i += 1;
  return i;
}

function skipTemplateText(text, start) {
  let i = start;
  while (i < text.length && text[i] !== '`' && !(text[i] === '$' && text[i + 1] === '{')) i += text[i] === BACKSLASH ? 2 : 1;
  return i;
}

function findJs(text) {
  const found = [];
  const stack = [];
  let regexNext = true;
  let i = 0;
  const report = (start, end) => found.push({ line: lineOf(text, start), text: firstLine(text.slice(start, end)) });
  const template = (from) => {
    const stop = skipTemplateText(text, from);
    if (text[stop] === '$') {
      stack.push('template');
      regexNext = true;
      return stop + 2;
    }
    regexNext = false;
    return stop + 1;
  };
  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (BLANK.includes(ch)) i += 1;
    else if (two === HASH + '!') {
      const end = lineEnd(text, i);
      if (i > 0) report(i, end);
      i = end;
    } else if (two === LINE_OPEN) {
      const end = lineEnd(text, i);
      report(i, end);
      i = end;
    } else if (two === BLOCK_OPEN) {
      const close = text.indexOf(BLOCK_CLOSE, i + 2);
      const end = close === -1 ? text.length : close + 2;
      report(i, end);
      i = end;
    } else if (ch === SLASH) {
      i = regexNext ? skipRegex(text, i) : i + 1;
      regexNext = !regexNext;
    } else if (ch === '\'' || ch === '"') {
      i = skipQuoted(text, i);
      regexNext = false;
    } else if (ch === '`') i = template(i + 1);
    else if (isWord(ch)) {
      let end = i;
      while (isWord(text[end])) end += 1;
      regexNext = REGEX_AFTER_WORD.includes(text.slice(i, end));
      i = end;
    } else if (ch === '{') {
      stack.push('brace');
      regexNext = true;
      i += 1;
    } else if (ch === '}') {
      regexNext = false;
      i = stack.pop() === 'template' ? template(i + 1) : i + 1;
    } else {
      regexNext = !(ch === ')' || ch === ']' || two === '++' || two === '--');
      i += two === '++' || two === '--' ? 2 : 1;
    }
  }
  return found;
}

function findSh(text) {
  const found = [];
  let quote = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quote === '\'') {
      if (ch === quote) quote = '';
    } else if (ch === BACKSLASH) i += 1;
    else if (quote === '"') {
      if (ch === quote) quote = '';
    } else if (ch === '\'' || ch === '"') quote = ch;
    else if (ch === HASH && (i === 0 || BLANK.includes(text[i - 1]))) {
      const end = lineEnd(text, i);
      if (!(i === 0 && text[1] === '!')) found.push({ line: lineOf(text, i), text: text.slice(i, end).trimEnd() });
      i = end;
    }
    i += 1;
  }
  return found;
}

function tagBodies(text, name) {
  const lower = text.toLowerCase();
  const bodies = [];
  let at = lower.indexOf('<' + name);
  while (at !== -1) {
    const open = lower.indexOf('>', at);
    if (open === -1) break;
    const close = lower.indexOf('</' + name, open);
    const end = close === -1 ? text.length : close;
    bodies.push({ start: open + 1, body: text.slice(open + 1, end) });
    at = lower.indexOf('<' + name, end);
  }
  return bodies;
}

function findHtml(text) {
  const found = [];
  let at = text.indexOf(HTML_OPEN);
  while (at !== -1) {
    const close = text.indexOf(HTML_CLOSE, at);
    const end = close === -1 ? text.length : close + HTML_CLOSE.length;
    found.push({ line: lineOf(text, at), text: firstLine(text.slice(at, end)) });
    at = text.indexOf(HTML_OPEN, end);
  }
  for (const { start, body } of tagBodies(text, 'style')) {
    let open = body.indexOf(BLOCK_OPEN);
    while (open !== -1) {
      const close = body.indexOf(BLOCK_CLOSE, open + 2);
      const end = close === -1 ? body.length : close + 2;
      found.push({ line: lineOf(text, start + open), text: firstLine(body.slice(open, end)) });
      open = body.indexOf(BLOCK_OPEN, end);
    }
  }
  for (const { start, body } of tagBodies(text, 'script')) {
    const offset = lineOf(text, start) - 1;
    for (const hit of findJs(' ' + body)) found.push({ line: hit.line + offset, text: hit.text });
  }
  return found.sort((a, b) => a.line - b.line);
}

export function findComments(text, kind) {
  if (kind === 'js') return findJs(text);
  if (kind === 'sh') return findSh(text);
  if (kind === 'html') return findHtml(text);
  throw new Error('findComments: unknown kind ' + kind);
}

function walk(dir, exts, skip, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !skip(entry.name)) walk(full, exts, () => false, out);
    } else if (entry.isFile() && exts.includes(extname(entry.name))) out.push(full);
  }
  return out;
}

export function checkTree(root) {
  const base = resolve(root);
  const files = [];
  for (const { dir, exts } of CODE_DIRS) walk(join(base, dir), exts, () => false, files);
  if (existsSync(join(base, 'index.html'))) files.push(join(base, 'index.html'));
  walk(join(base, EVIDENCE_DIR), EVIDENCE_EXTS, (name) => OLD_EVIDENCE.some((old) => name.startsWith(old)), files);
  const found = [];
  for (const full of files.sort()) {
    const file = relative(base, full).split('\\').join('/');
    for (const hit of findComments(readFileSync(full, 'utf8'), KINDS[extname(full)])) {
      const allowed = ALLOWED.some((entry) => entry.file === file && LINE_OPEN + entry.text === hit.text);
      if (!allowed) found.push({ file, line: hit.line, text: hit.text });
    }
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
