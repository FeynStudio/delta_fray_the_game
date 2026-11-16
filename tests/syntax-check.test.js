import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['.js', '.mjs'];
const NONE = 'no .js or .mjs file found';

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
  const name = (path) => relative(base, path).split(sep).join('/');
  const files = codeFiles(dir).sort();
  const errors = files.length === 0 ? [`${name(dir)}: ${NONE}`] : [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    } catch (error) {
      errors.push(`${name(file)}: ${String(error.stderr || error.message).trim()}`);
    }
  }
  return { checked: files.map(name), errors };
}

test('every .js and .mjs file under sim/ passes node --check', (t) => {
  const { checked, errors } = checkSyntax(ROOT, join(ROOT, 'sim'));
  for (const file of checked) t.diagnostic(`node --check ran on ${file}`);
  assert.equal(errors.length, 0, ['Fix the syntax error; node --check failed under sim/', ...errors].join('\n'));
});

test('the walk and the check report a broken file by name, pass clean files, skip other files and report a folder with no code file', () => {
  const root = mkdtempSync(join(tmpdir(), 'syntax-check-'));
  const clean = 'const a = 1;\nexport default a;\n';
  const broken = 'const a = 1;\n' + '}' + '\nexport default a;\n';
  const files = {
    'sim/broken.mjs': broken,
    'sim/clean.mjs': clean,
    'sim/data.json': broken,
    'sim/notes.md': broken,
    'sim/deep/more/bad.js': 'const b = ;\n',
    'sim/deep/fine.js': 'const c = 2;\n',
    'sim/node_modules/pkg/bad.mjs': broken,
    'empty/data.json': '{}\n',
  };
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    const found = checkSyntax(root, join(root, 'sim'));
    assert.deepEqual(found.checked, ['sim/broken.mjs', 'sim/clean.mjs', 'sim/deep/fine.js', 'sim/deep/more/bad.js']);
    assert.deepEqual(found.errors.map((line) => line.split(': ')[0]), ['sim/broken.mjs', 'sim/deep/more/bad.js']);
    for (const line of found.errors) assert.match(line, /SyntaxError/);
    assert.deepEqual(checkSyntax(root, join(root, 'empty')), { checked: [], errors: [`empty: ${NONE}`] });
    assert.throws(() => checkSyntax(root, join(root, 'missing')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(existsSync(root), false);
});
