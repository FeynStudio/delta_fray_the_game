import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTree, findMarkers, report } from '../scripts/conflict-markers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN = 7;
const OPEN = '<'.repeat(RUN);
const CLOSE = '>'.repeat(RUN);
const BASE = '|'.repeat(RUN);
const SPLIT = '='.repeat(RUN);
const MARKS = [['opening', OPEN], ['closing', CLOSE], ['base', BASE]];
const HEAD_BYTES = 8000;

const FLAGGED = [
  ['an opening marker followed by a space and text', 'one\n' + OPEN + ' HEAD\ntwo\n', [[2, OPEN + ' HEAD']]],
  ['a closing marker followed by a space and text', 'one\ntwo\n' + CLOSE + ' task/T-000-other\n', [[3, CLOSE + ' task/T-000-other']]],
  ['a closing marker alone in the text, with no opening marker', 'kept\n' + SPLIT + '\ntheirs\n' + CLOSE + ' other\nrest\n', [[4, CLOSE + ' other']]],
  ['a base marker of a diff3-style conflict', 'one\n' + BASE + ' merged common ancestors\ntwo\n', [[2, BASE + ' merged common ancestors']]],
  ['an opening marker that is the whole line', 'one\n' + OPEN + '\ntwo\n', [[2, OPEN]]],
  ['a closing marker that is the whole line', 'one\n' + CLOSE + '\ntwo\n', [[2, CLOSE]]],
  ['a base marker that is the whole line', 'one\n' + BASE + '\ntwo\n', [[2, BASE]]],
  ['a marker on line 1', OPEN + ' HEAD\none\n', [[1, OPEN + ' HEAD']]],
  ['a marker on the last line with no line feed after it', 'one\ntwo\n' + CLOSE, [[3, CLOSE]]],
  ['a marker that is the whole text', OPEN, [[1, OPEN]]],
  ['a marker followed by a space only', 'one\n' + OPEN + ' \ntwo', [[2, OPEN + ' ']]],
  ['a whole-line marker that ends with a carriage return and a line feed', 'one\r\n' + BASE + '\r\ntwo\r\n', [[2, BASE]]],
  ['a marker with text that ends with a carriage return and a line feed', 'one\r\ntwo\r\n' + OPEN + ' HEAD\r\nthree\r\n', [[3, OPEN + ' HEAD']]],
  ['two markers in one text', 'one\n' + OPEN + ' HEAD\nours\n' + SPLIT + '\ntheirs\n' + CLOSE + ' other\ntwo\n', [[2, OPEN + ' HEAD'], [6, CLOSE + ' other']]],
  ['all three markers of a diff3-style conflict', OPEN + ' HEAD\nours\n' + BASE + ' base\nold\n' + SPLIT + '\ntheirs\n' + CLOSE + ' other\n', [[1, OPEN + ' HEAD'], [3, BASE + ' base'], [7, CLOSE + ' other']]],
  ['the same marker twice', OPEN + ' a\n' + OPEN + ' b\n', [[1, OPEN + ' a'], [2, OPEN + ' b']]],
];

const CLEAN = [
  ['a marker with a space before it', 'one\n ' + OPEN + ' HEAD\n ' + CLOSE + ' other\n ' + BASE + ' base\n'],
  ['a marker with a tab before it', 'one\n\t' + OPEN + ' HEAD\n\t' + CLOSE + '\n'],
  ['a marker with other text before it', 'one\n+' + OPEN + ' HEAD\n-' + CLOSE + ' other\nx' + BASE + '\nfile.md:3: ' + OPEN + ' HEAD\n'],
  ['a marker later on a line that starts with the same character', '<abcdef ' + OPEN + '\n>abcdef ' + CLOSE + ' other\n|abcdef ' + BASE + '\n'],
  ['a bare line of seven equals signs', 'one\n' + SPLIT + '\ntwo\n' + SPLIT + ' text\n'],
  ['seven of the character followed by a tab', OPEN + '\tHEAD\n' + CLOSE + '\tother\n' + BASE + '\tbase\n'],
  ['a carriage return that is not before the line feed', OPEN + '\rHEAD\n' + CLOSE + '\r\rother\n'],
  ['a clean text', 'const a = 1;\nconst b = a < 2 || a > 3;\n'],
  ['an empty text', ''],
  ['a text of line feeds only', '\n\n\n'],
];

for (const [name, mark] of MARKS) {
  const ch = mark[0];
  CLEAN.push([`eight of the ${name} character in a row`, ch.repeat(RUN + 1) + '\n' + ch.repeat(RUN + 1) + ' text\n' + ch.repeat(RUN * 2) + '\n']);
  CLEAN.push([`six of the ${name} character in a row`, ch.repeat(RUN - 1) + '\n' + ch.repeat(RUN - 1) + ' text\n']);
  CLEAN.push([`seven of the ${name} character followed directly by a letter`, mark + 'HEAD\n' + mark + 'x text\n']);
}

for (const [name, text, hits] of FLAGGED) {
  test(`findMarkers flags ${name}`, () => {
    assert.deepEqual(findMarkers(text), hits.map(([line, found]) => ({ line, text: found })));
  });
}

for (const [name, text] of CLEAN) {
  test(`findMarkers does not flag ${name}`, () => {
    assert.deepEqual(findMarkers(text), []);
  });
}

test('findMarkers returns the marker line without control characters', () => {
  assert.deepEqual(findMarkers(OPEN + ' a\u001b[31mb\tc\u009bd\u007f \r\n'), [{ line: 1, text: OPEN + ' a[31mbcd ' }]);
});

function withTree(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'conflict-markers-'));
  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const hitsIn = (files) => withTree(files, (root) => checkTree(root).map((hit) => `${hit.file}:${hit.line}`));
const OPEN_LINE = OPEN + ' HEAD\n';
const CLOSE_LINE = CLOSE + ' other\n';
const zeroAt = (index) => Buffer.concat([Buffer.from(OPEN_LINE), Buffer.alloc(index - OPEN_LINE.length, 'a'), Buffer.from([0])]);

test('checkTree reports a marker in every checked place with file and line, in sorted order', () => {
  assert.deepEqual(hitsIn({
    'tests/deep/b.test.js': '\n\n' + CLOSE_LINE,
    'src/a.js': 'const a = 1;\n' + OPEN_LINE,
    'secrets.txt': OPEN_LINE,
    'prod.env': OPEN_LINE,
    'node_modules-old/x.js': OPEN_LINE,
    'tools/node_modules': OPEN_LINE,
    'docs/secrets-old/a.md': OPEN_LINE,
    'docs/secrets': OPEN_LINE,
    'agent-team/evidence/T-000/run.log': BASE + ' base\n',
    'agent-team/REPEATS.md': 'one\r\n' + OPEN + ' HEAD\r\ntwo\r\n' + CLOSE + '\r\n',
    'README.md': 'one\ntwo\nthree\n' + CLOSE,
    'LICENSE': OPEN + '\n',
    '.envrc': OPEN_LINE,
    '.github/workflows/x.yml': 'on: push\n' + CLOSE_LINE,
    '.gitattributes': OPEN_LINE,
  }), [
    '.envrc:1', '.gitattributes:1', '.github/workflows/x.yml:2', 'LICENSE:1', 'README.md:4',
    'agent-team/REPEATS.md:2', 'agent-team/REPEATS.md:4', 'agent-team/evidence/T-000/run.log:1',
    'docs/secrets:1', 'docs/secrets-old/a.md:1', 'node_modules-old/x.js:1',
    'prod.env:1', 'secrets.txt:1', 'src/a.js:2', 'tests/deep/b.test.js:3', 'tools/node_modules:1',
  ]);
});

test('checkTree returns file, line and text for each finding', () => {
  withTree({ 'docs/notes/a.md': 'one\n' + OPEN_LINE + 'two\n' + CLOSE_LINE }, (root) => {
    assert.deepEqual(checkTree(root), [
      { file: 'docs/notes/a.md', line: 2, text: OPEN + ' HEAD' },
      { file: 'docs/notes/a.md', line: 4, text: CLOSE + ' other' },
    ]);
  });
});

test('checkTree reports nothing on a clean tree', () => {
  assert.deepEqual(hitsIn({
    'src/a.js': 'const a = 1;\n',
    'tests/a.test.js': 'const text = \'' + OPEN + ' HEAD\';\n',
    'agent-team/notes.md': 'Title\n' + SPLIT + '\n\n  ' + CLOSE + ' quoted\n',
    'agent-team/evidence/T-000/saved.diff': '+' + OPEN_LINE + '-' + CLOSE_LINE,
    'empty.txt': '',
  }), []);
});

test('checkTree does not open .git, node_modules, .env files, secrets folders or binary files', () => {
  assert.deepEqual(hitsIn({
    '.git/HEAD': OPEN_LINE,
    '.git/deep/x.txt': OPEN_LINE,
    'worktree/.git': OPEN_LINE,
    'node_modules/pkg/x.js': OPEN_LINE,
    'src/node_modules/x.js': OPEN_LINE,
    '.env': OPEN_LINE,
    '.env.local': OPEN_LINE,
    'src/.env': OPEN_LINE,
    'src/.env.production': OPEN_LINE,
    'secrets/key.txt': OPEN_LINE,
    'agent-team/secrets/deep/x.md': OPEN_LINE,
    'shot.png': Buffer.concat([Buffer.from([0]), Buffer.from('\n' + OPEN_LINE)]),
    'late-zero.bin': zeroAt(HEAD_BYTES - 1),
    'src/clean.js': 'const a = 1;\n',
  }), []);
});

test('checkTree reads a file whose first zero byte comes after the first 8000 bytes', () => {
  assert.deepEqual(hitsIn({ 'big.txt': zeroAt(HEAD_BYTES) }), ['big.txt:1']);
});

test('checkTree does not follow a link to a folder', () => {
  withTree({ 'target/a.txt': OPEN_LINE }, (outside) => {
    withTree({ 'src/clean.js': 'const a = 1;\n' }, (root) => {
      symlinkSync(join(outside, 'target'), join(root, 'linked'), 'junction');
      assert.deepEqual(checkTree(root), []);
    });
    assert.deepEqual(checkTree(outside).map((hit) => `${hit.file}:${hit.line}`), ['target/a.txt:1']);
  });
});

test('checkTree fails on a folder that does not exist', () => {
  withTree({}, (root) => assert.throws(() => checkTree(join(root, 'missing'))));
});

const GUARD_FAIL = 'GUARD FAIL [no-conflict-markers]: Resolve the merge conflict; never commit conflict markers';
const SCRIPT = join('scripts', 'conflict-markers.mjs');

test('report gives no lines and code 0 when nothing is found', () => {
  assert.deepEqual(report([]), { lines: [], code: 0 });
});

test('report gives the message, then one path:line: text line per finding in the given order, and code 1', () => {
  assert.deepEqual(report([{ file: 'src/b.js', line: 4, text: CLOSE + ' other' }, { file: 'docs/a.md', line: 2, text: OPEN + ' HEAD' }]), {
    lines: [GUARD_FAIL, 'src/b.js:4: ' + CLOSE + ' other', 'docs/a.md:2: ' + OPEN + ' HEAD'],
    code: 1,
  });
});

function runCopy(root) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [resolve(root, SCRIPT)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) };
  } catch (error) {
    return { code: error.status, out: error.stdout };
  }
}

test('run directly, the checker is silent with exit 0 on a clean tree and prints the message and path:line: text with exit 1 on a marker', () => {
  withTree({ [SCRIPT]: readFileSync(join(ROOT, SCRIPT)) }, (root) => {
    assert.deepEqual(runCopy(root), { code: 0, out: '' });
    writeFileSync(join(root, 'notes.md'), 'one\n' + OPEN_LINE);
    assert.deepEqual(runCopy(root), { code: 1, out: GUARD_FAIL + '\nnotes.md:2: ' + OPEN + ' HEAD\n' });
  });
});

test('no file in this repo holds a conflict marker', () => {
  const found = checkTree(ROOT).map((hit) => `${hit.file}:${hit.line}: ${hit.text}`);
  assert.equal(found.length, 0, ['Resolve the merge conflict; never commit conflict markers', ...found].join('\n'));
});
