import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['.js', '.mjs'];
const NONE = 'no .js or .mjs file found';
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
const plain = (text) => text.replace(new RegExp(CONTROL.source, 'g'), '');

function codeFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') codeFiles(full, out);
    } else if (entry.isFile() && EXTS.includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function checkSyntax(base, dir) {
  const name = (path) => plain(relative(base, path).split(sep).join('/'));
  const files = codeFiles(dir).sort();
  const errors = files.length === 0 ? [`${name(dir)}: ${NONE}`] : [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    } catch (error) {
      errors.push(`${name(file)}: ${plain(String(error.stderr || error.message)).trim()}`);
    }
  }
  return { checked: files.map(name), errors };
}

function inFixture(work) {
  const root = mkdtempSync(join(resolve(tmpdir()), 'syntax-check-'));
  try {
    mkdirSync(join(root, 'sim'));
    work(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
}

test('every .js and .mjs file under sim/ passes node --check', (t) => {
  const { checked, errors } = checkSyntax(ROOT, join(ROOT, 'sim'));
  for (const file of checked) t.diagnostic(`node --check ran on ${file}`);
  assert.equal(errors.length, 0, ['Fix the syntax error; node --check failed under sim/', ...errors].join('\n'));
});

test('the walk and the check report a broken file by name, pass clean files, skip other files and report a folder with no code file', () => {
  const root = mkdtempSync(join(resolve(tmpdir()), 'syntax-check-'));
  const clean = 'const a = 1;\nexport default a;\n';
  const broken = 'const a = 1;\n' + '}' + '\nexport default a;\n';
  const files = {
    'package.json': '{"type":"module"}\n',
    'sim/broken.mjs': broken,
    'sim/clean.mjs': clean,
    'sim/data.json': broken,
    'sim/notes.md': broken,
    'sim/deep/more/bad.js': 'const b = ;\n',
    'sim/deep/fine.js': 'const c = 2;\n',
    'sim/deep/top-return.js': 'return;\n',
    'sim/node_modules/pkg/bad.mjs': broken,
    'empty/data.json': '{}\n',
  };
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    const found = checkSyntax(root, join(root, 'sim'));
    assert.deepEqual(found.checked, ['sim/broken.mjs', 'sim/clean.mjs', 'sim/deep/fine.js', 'sim/deep/more/bad.js', 'sim/deep/top-return.js']);
    assert.deepEqual(found.errors.map((line) => line.split(': ')[0]), ['sim/broken.mjs', 'sim/deep/more/bad.js', 'sim/deep/top-return.js']);
    for (const line of found.errors) assert.match(line, /SyntaxError/);
    assert.deepEqual(checkSyntax(root, join(root, 'empty')), { checked: [], errors: [`empty: ${NONE}`] });
    assert.throws(() => checkSyntax(root, join(root, 'missing')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
});

test('plain removes every C0 control except the line feed, DEL and every C1 control', () => {
  assert.equal(plain('a\u0000\t\r\u001b[31mb\u0007\u0008\u007f\u0085\u009b\u009fc\nd\u00a0~'), 'a[31mbc\nd\u00a0~');
});

test('a failing line with control characters is reported by name with SyntaxError and none of them', () => inFixture((root) => {
  writeFileSync(join(root, 'sim', 'ctl.mjs'), 'const a = "\u001b[31m\u0007\u0008\u009b" }\n');
  const { errors } = checkSyntax(root, join(root, 'sim'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^sim\/ctl\.mjs: [^]*SyntaxError/);
  assert.doesNotMatch(errors[0], CONTROL);
}));

test('the walk does not follow a folder link under sim/, while the linked folder itself is reported', () => inFixture((root) => {
  mkdirSync(join(root, 'outside'));
  writeFileSync(join(root, 'outside', 'broken.mjs'), 'const a = ;\n');
  symlinkSync(join(root, 'outside'), join(root, 'sim', 'linked'), 'junction');
  assert.equal(existsSync(join(root, 'sim', 'linked', 'broken.mjs')), true);
  assert.deepEqual(checkSyntax(root, join(root, 'sim')), { checked: [], errors: [`sim: ${NONE}`] });
  assert.match(checkSyntax(root, join(root, 'outside')).errors.join('\n'), /^outside\/broken\.mjs: [^]*SyntaxError/);
}));
