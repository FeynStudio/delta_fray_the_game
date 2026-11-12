#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else',
  'yield', 'await',
]);
const DIRECTIVE = /^\/\/\s*nosemgrep:/;
const MARK = /\/\/|\/\*|\*\//;

function scan(text) {
  const comments = [];
  const literals = [];
  let i = 0;
  let last = 'op';
  const n = text.length;

  if (text.startsWith('#!')) {
    while (i < n && text[i] !== '\n') i++;
  }

  function quoted(q) {
    const start = i;
    i++;
    while (i < n && text[i] !== q) {
      if (text[i] === '\\') i++;
      if (text[i] === '\n') throw new Error(`unterminated string at ${start}`);
      i++;
    }
    i++;
    literals.push({ start, end: i, kind: 'string' });
    last = 'value';
  }

  function template() {
    let start = i;
    i++;
    while (i < n && text[i] !== '`') {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === '$' && text[i + 1] === '{') {
        literals.push({ start, end: i, kind: 'template' });
        i += 2;
        last = 'op';
        code(true);
        start = i;
        i++;
        continue;
      }
      i++;
    }
    i++;
    literals.push({ start, end: i, kind: 'template' });
    last = 'value';
  }

  function regex() {
    const start = i;
    i++;
    let inClass = false;
    while (i < n) {
      const ch = text[i];
      if (ch === '\n') throw new Error(`unterminated regex at ${start}`);
      if (ch === '\\') { i += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) break;
      i++;
    }
    i++;
    while (i < n && /[a-z]/.test(text[i])) i++;
    literals.push({ start, end: i, kind: 'regex' });
    last = 'value';
  }

  function code(untilBrace) {
    let depth = 0;
    while (i < n) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '\'' || ch === '"') { quoted(ch); continue; }
      if (ch === '`') { template(); continue; }
      if (ch === '/' && next === '/') {
        const start = i;
        while (i < n && text[i] !== '\n') i++;
        comments.push({ start, end: i, kind: 'line' });
        continue;
      }
      if (ch === '/' && next === '*') {
        const start = i;
        const close = text.indexOf('*/', i + 2);
        if (close < 0) throw new Error(`unterminated block comment at ${start}`);
        i = close + 2;
        comments.push({ start, end: i, kind: 'block' });
        continue;
      }
      if (ch === '/') {
        if (last === 'op') { regex(); continue; }
        i++;
        last = 'op';
        continue;
      }
      if (/\s/.test(ch)) { i++; continue; }
      if (/[\w$]/.test(ch)) {
        const start = i;
        while (i < n && /[\w$]/.test(text[i])) i++;
        last = KEYWORDS.has(text.slice(start, i)) ? 'op' : 'value';
        continue;
      }
      if (ch === '{') { depth++; i++; last = 'op'; continue; }
      if (ch === '}') {
        if (untilBrace && depth === 0) return;
        depth--;
        i++;
        last = 'value';
        continue;
      }
      i++;
      last = ch === ')' || ch === ']' ? 'value' : 'op';
    }
    if (untilBrace) throw new Error('unterminated template expression');
  }

  code(false);
  return { comments, literals };
}

function lineOf(text, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (text[k] === '\n') line++;
  return line;
}

function classify(text, c) {
  const body = text.slice(c.start, c.end);
  if (body.includes('\n')) throw new Error(`multi-line comment at line ${lineOf(text, c.start)}`);
  const ls = text.lastIndexOf('\n', c.start - 1) + 1;
  let le = text.indexOf('\n', c.end);
  if (le < 0) le = text.length;
  const before = text.slice(ls, c.start);
  const after = text.slice(c.end, le);
  if (after.trim() !== '') throw new Error(`code after comment at line ${lineOf(text, c.start)}`);
  const whole = before.trim() === '';
  const directive = DIRECTIVE.test(body);
  return { ls, le, whole, directive, body, line: lineOf(text, c.start) };
}

function strip(text) {
  const { comments } = scan(text);
  let out = text;
  for (const c of [...comments].reverse()) {
    const k = classify(text, c);
    if (k.directive) continue;
    if (k.whole) {
      const cut = k.le < text.length ? k.le + 1 : k.le;
      out = out.slice(0, k.ls) + out.slice(cut);
    } else {
      let s = c.start;
      while (s > k.ls && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
      out = out.slice(0, s) + out.slice(c.end);
    }
  }
  return out;
}

function targets() {
  const pick = (dir, ext) => readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);
  return [...pick('tests', '.js'), ...pick('sim', '.mjs'), ...pick('scripts', '.mjs')];
}

function git(args) {
  return execFileSync('git', args, { encoding: 'buffer', maxBuffer: 1 << 26 });
}

function list(files, read) {
  const totals = { whole: 0, trailing: 0, directive: 0, literal: 0 };
  for (const file of files) {
    const text = read(file);
    const { comments, literals } = scan(text);
    const lines = text.split('\n');
    const rows = [];
    let whole = 0;
    let trailing = 0;
    let directive = 0;
    for (const c of comments) {
      const k = classify(text, c);
      const tag = k.directive ? 'DIRECTIVE (kept)' : k.whole ? 'whole-line' : 'trailing';
      if (k.directive) directive++;
      else if (k.whole) whole++;
      else trailing++;
      rows.push([k.line, `${file}:${k.line}: [${tag}] ${k.body}`]);
    }
    const seen = new Set();
    for (const l of literals) {
      const first = lineOf(text, l.start);
      const parts = text.slice(l.start, l.end).split('\n');
      parts.forEach((part, offset) => {
        const line = first + offset;
        if (!MARK.test(part) || seen.has(line)) return;
        seen.add(line);
        rows.push([line + 0.5, `${file}:${line}: [NOT A COMMENT, inside a ${l.kind}] ${lines[line - 1].trim()}`]);
      });
    }
    rows.sort((a, b) => a[0] - b[0]);
    process.stdout.write(`\n${file}: ${whole} whole-line, ${trailing} trailing, ${directive} directive kept, ${seen.size} non-comment line(s)\n`);
    for (const [, row] of rows) process.stdout.write(`${row}\n`);
    totals.whole += whole;
    totals.trailing += trailing;
    totals.directive += directive;
    totals.literal += seen.size;
  }
  process.stdout.write(`\nTOTAL: ${totals.whole} whole-line + ${totals.trailing} trailing = ${totals.whole + totals.trailing} comments to remove; ${totals.directive} directive comments kept; ${totals.literal} non-comment line(s)\n`);
}

function shape(base, head, file) {
  const diff = git(['diff', '-U0', base, head, '--', file]).toString('utf8').split('\n');
  let deleted = 0;
  let changed = 0;
  const problems = [];
  let removed = [];
  let added = [];
  const flush = () => {
    let a = 0;
    for (const r of removed) {
      const candidate = added[a];
      if (candidate !== undefined && candidate.trim() !== '' && r.startsWith(candidate) && /^[ \t]+\/\/.*$/.test(r.slice(candidate.length))) {
        changed++;
        a++;
      } else if (/^[ \t]*\/\/.*$/.test(r)) {
        deleted++;
      } else {
        problems.push(`unexpected removed line: ${r}`);
      }
    }
    for (; a < added.length; a++) problems.push(`unexpected added line: ${added[a]}`);
    removed = [];
    added = [];
  };
  for (const line of diff) {
    if (line.startsWith('@@')) flush();
    else if (line.startsWith('---') || line.startsWith('+++')) continue;
    else if (line.startsWith('-')) removed.push(line.slice(1));
    else if (line.startsWith('+')) added.push(line.slice(1));
  }
  flush();
  return { deleted, changed, problems };
}

function prove(base, head) {
  const files = git(['diff', '--name-only', base, head, '--', 'tests', 'sim', 'scripts']).toString('utf8').split('\n').filter(Boolean);
  let bad = 0;
  let deleted = 0;
  let changed = 0;
  process.stdout.write(`BASE ${git(['rev-parse', base]).toString().trim()}\nHEAD ${git(['rev-parse', head]).toString().trim()}\n`);
  process.stdout.write(`Changed files under tests/ sim/ scripts/: ${files.length}\n\n`);
  for (const file of files) {
    const before = git(['show', `${base}:${file}`]);
    const after = git(['show', `${head}:${file}`]);
    const stripped = Buffer.from(strip(before.toString('utf8')), 'utf8');
    const same = stripped.equals(after);
    const s = shape(base, head, file);
    const blankBefore = before.toString('utf8').split('\n').filter((l) => l.trim() === '').length;
    const blankAfter = after.toString('utf8').split('\n').filter((l) => l.trim() === '').length;
    const lineDelta = before.toString('utf8').split('\n').length - after.toString('utf8').split('\n').length;
    const ok = same && s.problems.length === 0 && blankBefore === blankAfter && lineDelta === s.deleted;
    if (!ok) bad++;
    deleted += s.deleted;
    changed += s.changed;
    process.stdout.write(`${ok ? 'OK  ' : 'FAIL'} ${file}: strip(BASE) byte-identical to HEAD: ${same}; deleted whole-line comment lines: ${s.deleted}; lines changed in place (trailing comment cut): ${s.changed}; added lines: 0; blank lines ${blankBefore} -> ${blankAfter}; line count delta ${lineDelta}\n`);
    for (const p of s.problems) process.stdout.write(`     ${p}\n`);
  }
  process.stdout.write(`\nTOTAL: ${deleted} lines deleted, ${changed} lines changed in place, ${deleted + changed} comments removed, ${bad} file(s) failing\n`);
  process.stdout.write(`RESULT: ${bad === 0 && files.length > 0 ? 'COMMENT-ONLY' : 'NOT COMMENT-ONLY'}\n`);
  process.exit(bad === 0 && files.length > 0 ? 0 : 1);
}

const [mode, a, b] = process.argv.slice(2);
if (mode === 'list') {
  if (a) list(targets(), (f) => git(['show', `${a}:${f}`]).toString('utf8'));
  else list(targets(), (f) => readFileSync(f, 'utf8'));
} else if (mode === 'apply') {
  for (const file of targets()) {
    const text = readFileSync(file, 'utf8');
    const out = strip(text);
    if (out !== text) writeFileSync(file, out);
  }
} else if (mode === 'prove') {
  prove(a, b ?? 'HEAD');
} else {
  process.stderr.write('usage: strip-comments.mjs list [rev] | apply | prove <base> [head]\n');
  process.exit(2);
}
