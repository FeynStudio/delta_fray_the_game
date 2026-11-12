import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTree, findComments } from '../scripts/no-comments.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const S2 = '/'.repeat(2);
const OPEN = '/' + '*';
const CLOSE = '*' + '/';
const HASH = String.fromCharCode(35);
const HOPEN = '<' + '!--';
const HCLOSE = '--' + '>';
const SHEBANG = HASH + '!/usr/bin/env node';
const RE = '/\\' + OPEN + '/';
const URL_TEXT = 'http' + ':' + S2 + 'x.test/' + OPEN + ' ws:' + S2 + 'y.test';
const ASSIGN = ' nosemgrep: javascript.lang.security.insecure-object-assign.insecure-object-assign';
const SOCKET = ' nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket';

const FLAGGED = [
  ['js', 'a whole-line comment', 'const a = 1;\n' + S2 + ' note\nconst b = 2;', [2]],
  ['js', 'a trailing comment after code', 'const a = 1; ' + S2 + ' note', [1]],
  ['js', 'a trailing comment after a division', 'const a = 1;\nconst d = a / 2; ' + S2 + ' note /', [2]],
  ['js', 'a one-line block comment', 'const a = 1;\n' + OPEN + ' note ' + CLOSE + '\n', [2]],
  ['js', 'a block comment over several lines', 'const a = 1;\n' + OPEN + ' one\ntwo\nthree ' + CLOSE + '\nconst b = 2;', [2]],
  ['js', 'a block comment in the middle of a line', 'const a = 1;\n\nconst b = ' + OPEN + ' note ' + CLOSE + ' 2;', [3]],
  ['js', 'a comment inside the code part of a template literal', 'const a = `x ${\n1 + `y ${2}` ' + S2 + ' note\n} ' + S2 + ' z`;', [2]],
  ['js', 'a comment on line 2 under a shebang', SHEBANG + '\n' + S2 + ' note', [2]],
  ['js', 'a shebang that is not on line 1', 'const a = 1;\n' + SHEBANG, [2]],
  ['sh', 'a whole-line comment', 'echo a\n' + HASH + ' note\necho b', [2]],
  ['sh', 'a trailing comment after a command', 'echo a\necho "b" ' + HASH + ' note', [2]],
  ['html', 'a one-line comment', '<p>a</p>\n' + HOPEN + ' note ' + HCLOSE, [2]],
  ['html', 'a comment across lines', '<p>a</p>\n' + HOPEN + ' one\ntwo ' + HCLOSE + '\n<p>b</p>\n' + HOPEN + ' x ' + HCLOSE, [2, 5]],
  ['html', 'a block comment inside style', '<style>\nbody { margin: 0; }\n' + OPEN + ' note ' + CLOSE + '\n</style>', [3]],
  ['html', 'a comment inside an inline script', '<p>a</p>\n<script>\nconst a = 1;\nconst b = 2; ' + S2 + ' note\n</script>', [4]],
];

const CLEAN = [
  ['js', 'comment marks in a single-quoted string', 'const a = \'' + URL_TEXT + '\';'],
  ['js', 'comment marks in a double-quoted string', 'const a = "' + URL_TEXT + '";'],
  ['js', 'comment marks in a template string', 'const a = `' + URL_TEXT + ' ${b} ' + S2 + ' c`;'],
  ['js', 'an escaped quote before comment marks', 'const a = \'it\\\'s ' + S2 + ' fine\'; const b = "say \\"' + OPEN + '\\" now";'],
  ['js', 'comment marks in a regular expression', 'const m = s.match(/ws:\\/\\/\\S+/); const n = ' + RE + '.test(s);'],
  ['js', 'comment marks in a character class', 'const r = /[' + S2 + ']+/; const q = /[' + OPEN + ']/g;'],
  ['js', 'a regular expression after ( , = and return', 'f(' + RE + ');\nf(a, ' + RE + ');\nconst r = ' + RE + ';\nfunction g() { return ' + RE + '; }'],
  ['js', 'division', 'const d = a / b / c; const e = (a + b) / 2 / list[0] / 3; i++ / 2;'],
  ['js', 'a shebang on line 1', SHEBANG + '\nconst a = 1;'],
  ['sh', 'a shebang on line 1', HASH + '!/usr/bin/env bash\nset -uo pipefail'],
  ['sh', 'the argument count and an array length', 'while [ $# -gt 0 ]; do shift; done\n[ ${#files[@]} -gt 0 ] || exit 1'],
  ['sh', 'a hash inside single and double quotes', 'echo \'a ' + HASH + ' b\'\necho "c ' + HASH + ' d \\" ' + HASH + ' e"'],
  ['sh', 'a path with a glob', 'ls src' + OPEN + '.js tests' + OPEN],
  ['html', 'the doctype', '<!doctype html>\n<html></html>'],
  ['html', 'a block comment mark in an attribute value', '<a href="x' + OPEN + 'y' + CLOSE + '">z</a>'],
  ['html', 'a colour inside style', '<style>\nbody { background: ' + HASH + '000; }\n</style>'],
];

for (const [kind, name, text, lines] of FLAGGED) {
  test(`findComments flags ${name} (${kind})`, () => {
    assert.deepEqual(findComments(text, kind).map((hit) => hit.line), lines);
  });
}

for (const [kind, name, text] of CLEAN) {
  test(`findComments does not flag ${name} (${kind})`, () => {
    assert.deepEqual(findComments(text, kind), []);
  });
}

test('findComments returns the comment text and rejects an unknown kind', () => {
  assert.deepEqual(findComments('a();   ' + S2 + ' note  \r\nb();', 'js'), [{ line: 1, text: S2 + ' note' }]);
  assert.throws(() => findComments('', 'css'));
});

function inTree(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'no-comments-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    return run(checkTree(root).map((hit) => `${hit.file}:${hit.line}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const JS_NOTE = 'const a = 1;\n' + S2 + ' note\n';
const SH_NOTE = 'echo a\n' + HASH + ' note\n';
const HTML_NOTE = '<!doctype html>\n' + HOPEN + ' note ' + HCLOSE + '\n';

test('checkTree reports a comment in every checked place with file and line', () => {
  inTree({
    'src/a.js': JS_NOTE,
    'tests/deep/b.mjs': JS_NOTE,
    'sim/c.mjs': '\n' + JS_NOTE,
    'scripts/d.mjs': JS_NOTE,
    'scripts/e.sh': SH_NOTE,
    'index.html': HTML_NOTE,
    'agent-team/evidence/T-023/f.mjs': JS_NOTE,
    'agent-team/evidence/T-015/g.sh': SH_NOTE,
    'agent-team/evidence/T-015/h.html': HTML_NOTE,
  }, (found) => assert.deepEqual(found.sort(), [
    'agent-team/evidence/T-015/g.sh:2', 'agent-team/evidence/T-015/h.html:2', 'agent-team/evidence/T-023/f.mjs:2',
    'index.html:2', 'scripts/d.mjs:2', 'scripts/e.sh:2', 'sim/c.mjs:3', 'src/a.js:2', 'tests/deep/b.mjs:2',
  ]));
});

test('checkTree skips old evidence, unchecked files and node_modules', () => {
  inTree({
    'agent-team/evidence/T-010/x.mjs': JS_NOTE,
    'agent-team/evidence/T-001-old/x.sh': SH_NOTE,
    '.github/x.js': JS_NOTE,
    '.gitattributes': SH_NOTE,
    'src/data.json': JS_NOTE,
    'src/notes.md': HTML_NOTE,
    'docs/x.js': JS_NOTE,
    'src/node_modules/x.js': JS_NOTE,
    'node_modules/pkg/x.js': JS_NOTE,
    'src/clean.js': 'const a = 1;\n',
  }, (found) => assert.deepEqual(found, []));
});

test('checkTree accepts each scanner directive only in its own file with its exact text', () => {
  inTree({
    'scripts/run-scenario.mjs': SHEBANG + '\nrun(); ' + S2 + ASSIGN + '\n',
    'scripts/smoke.mjs': SHEBANG + '\nrun(); ' + S2 + SOCKET + '\r\n',
  }, (found) => assert.deepEqual(found, []));
  inTree({
    'scripts/run-scenario.mjs': 'run(); ' + S2 + SOCKET + '\nrun(); ' + S2 + ' nosemgrep: other.rule\n',
    'scripts/smoke.mjs': 'run(); ' + S2 + SOCKET + ' and more\n',
    'scripts/serve.mjs': 'run(); ' + S2 + ASSIGN + '\n',
    'src/a.js': 'run(); ' + S2 + SOCKET + '\n',
  }, (found) => assert.deepEqual(found.sort(), ['scripts/run-scenario.mjs:1', 'scripts/run-scenario.mjs:2', 'scripts/serve.mjs:1', 'scripts/smoke.mjs:1', 'src/a.js:1']));
});

test('the two real scanner directives are seen by the tokenizer', () => {
  for (const [file, text] of [['scripts/run-scenario.mjs', ASSIGN], ['scripts/smoke.mjs', SOCKET]]) {
    const found = findComments(readFileSync(join(ROOT, file), 'utf8'), 'js');
    assert.deepEqual(found.map((hit) => hit.text), [S2 + text]);
  }
});

test('no code file in this repo holds a comment', () => {
  const found = checkTree(ROOT).map((hit) => `${hit.file}:${hit.line}: ${hit.text}`);
  assert.equal(found.length, 0, ['Remove the comment; put the reason in the brief, the handoff or FEATURE_MAP', ...found].join('\n'));
});
