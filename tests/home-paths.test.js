import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkTree, findHomePaths, report } from '../scripts/home-paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'scripts/home-paths.mjs';
const NAME = 'someone';
const HEAD_BYTES = 8000;
const MESSAGE = 'GUARD FAIL [no-home-paths]: Replace the home-directory path with a placeholder such as <OS temp dir> or <user>; never commit an account name';
const WIN = 'C:\\Users\\' + NAME + '\\notes.txt';
const MOUNT = '/c/Users/' + NAME + '/notes.txt';
const HOME = 'cd /home/' + NAME;

const FLAGGED = [
  ['windows with backslashes', 'see ' + WIN, 'windows'],
  ['windows with forward slashes', 'see C:/Users/' + NAME + '/notes.txt', 'windows'],
  ['windows with doubled backslashes inside JSON text', '{ "path": "C:\\\\Users\\\\' + NAME + '\\\\notes.txt" }', 'windows'],
  ['windows with lower-case users', 'd:\\users\\' + NAME, 'windows'],
  ['windows in a file:/// address', 'file:///C:/Users/' + NAME + '/notes.txt', 'windows'],
  ['windows with an 8.3 short name', 'C:\\Users\\' + NAME.toUpperCase().slice(0, 6) + '~1\\notes.txt', 'windows'],
  ['drive-mount in the Git Bash form', MOUNT, 'drive-mount'],
  ['drive-mount in the WSL form', 'cd /mnt/c/Users/' + NAME, 'drive-mount'],
  ['home for /Users/ at the line start', '/Users/' + NAME + '/notes.txt', 'home'],
  ['home for /Users/ after a space', 'open /Users/' + NAME, 'home'],
  ['home for /Users/ after a quote', '"/Users/' + NAME + '"', 'home'],
  ['home for /home/ after a space', HOME, 'home'],
  ['home for /home/ after =', 'HOME=/home/' + NAME, 'home'],
  ['home for /home/ after (', 'cd(/home/' + NAME + ')', 'home'],
  ['home for /home/ after a quote', '\'/home/' + NAME + '\'', 'home'],
  ['two hits on one line as one entry with the kind of the first', WIN + ' and /home/' + NAME, 'windows'],
  ['the kind of the first hit when a later one is windows', '/home/' + NAME + ' and ' + WIN, 'home'],
];

const CLEAN = [
  ['the placeholder <user>', 'C:\\Users\\<user>\\AppData and /home/<user>/x'],
  ['the placeholder <account>', 'C:/Users/<account>/x and /Users/<account>'],
  ['the placeholder <name> with <drive>', '/<drive>/Users/<name> and /mnt/<drive>/Users/<name> and /c/Users/<name>'],
  ['the placeholder %USERNAME%', 'C:\\Users\\%USERNAME%\\AppData'],
  ['the placeholder $USER', '/home/$USER/x and C:\\Users\\$USER'],
  ['the placeholder ${USER}', '/home/${USER}/x'],
  ['a tilde', 'C:\\Users\\~ and /Users/~/x'],
  ['a star', 'C:\\Users\\* and /home/*'],
  ['a backtick', '`C:\\Users\\` and `/home/`'],
  ['the end of the line', ['C:\\Users\\', '/c/Users/', '/Users/', '/home/', '/home/\r', ''].join('\n')],
  ['Users or home with nothing after the separator', 'C:\\Users\\ x /c/Users/ x /Users/ x /home/ x'],
  ['\\Users\\ with no drive letter', '\\Users\\' + NAME + '\\notes.txt'],
  ['example.com/home/page', 'see example.com/home/page and ../home/page and my-/Users/x'],
  ['/homework/', 'cd /homework/' + NAME],
  ['the word Users alone', 'Users and home and users'],
  ['a clean text', 'const a = 1;\nconst b = a / 2;\n'],
  ['an empty text', ''],
];

for (const [name, line, kind] of FLAGGED) {
  test(`findHomePaths flags ${name}`, () => {
    assert.deepEqual(findHomePaths('first\n\n' + line + '\nlast\n'), [{ line: 3, kind }]);
  });
}

for (const [name, text] of CLEAN) {
  test(`findHomePaths does not flag ${name}`, () => {
    assert.deepEqual(findHomePaths(text), []);
  });
}

test('findHomePaths gives one entry per line with a hit', () => {
  assert.deepEqual(findHomePaths(WIN + '\nclean\r\n' + MOUNT + '\r\n' + HOME), [
    { line: 1, kind: 'windows' }, { line: 3, kind: 'drive-mount' }, { line: 4, kind: 'home' },
  ]);
});

function withTree(files, run) {
  const root = mkdtempSync(join(resolve(tmpdir()), 'home-paths-'));
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

const hitsIn = (files) => withTree(files, (root) => checkTree(root).map((hit) => `${hit.file}:${hit.line}: ${hit.kind}`));
const zeroAt = (index) => Buffer.concat([Buffer.from(WIN + '\n'), Buffer.alloc(index - WIN.length - 1, 'a'), Buffer.from([0])]);

test('checkTree reports a hit in every checked place with file, line and kind, in sorted order', () => {
  const found = hitsIn({
    'agent-team/evidence/T-000/run.log': 'ok\n' + WIN + '\n',
    'agent-team/tasks/x.md': MOUNT + '\n',
    'agent-team/DECISIONS.md': '\n\n' + HOME + '\n',
    'src/a.js': 'const a = 1;\nconst p = \'' + WIN + '\';\n',
    'README.md': HOME,
    'LICENSE': WIN,
    '.github/workflows/x.yml': 'on: push\n' + HOME + '\n',
    '.claude/settings.local.json': '{\n  "allow": ["Read(' + WIN.split('\\').join('\\\\') + ')"]\n}\n',
    '.env.example': 'DIR=' + MOUNT + '\n',
    'scripts/home-paths.mjs': 'const a = 1;\n' + WIN + '\n',
    'tests/home-paths.test.js': HOME + '\n',
  });
  assert.deepEqual(found, [
    '.claude/settings.local.json:2: windows', '.env.example:1: drive-mount', '.github/workflows/x.yml:2: home',
    'LICENSE:1: windows', 'README.md:1: home', 'agent-team/DECISIONS.md:3: home',
    'agent-team/evidence/T-000/run.log:2: windows', 'agent-team/tasks/x.md:1: drive-mount',
    'scripts/home-paths.mjs:2: windows', 'src/a.js:2: windows', 'tests/home-paths.test.js:1: home',
  ]);
  assert.equal(found.join('\n').includes(NAME), false);
});

test('checkTree returns file, line and kind only for each finding', () => {
  withTree({ 'docs/notes/a.md': 'one\n' + WIN + '\ntwo\n' + HOME + '\n' }, (root) => {
    const found = checkTree(root);
    assert.deepEqual(found, [
      { file: 'docs/notes/a.md', line: 2, kind: 'windows' },
      { file: 'docs/notes/a.md', line: 4, kind: 'home' },
    ]);
    assert.equal(JSON.stringify(found).includes(NAME), false);
  });
});

test('checkTree does not open .git, node_modules, secrets folders, .env files other than .env.example, or binary files', () => {
  assert.deepEqual(hitsIn({
    '.git/HEAD': WIN,
    '.git/deep/x.txt': WIN,
    'worktree/.git': WIN,
    'node_modules/pkg/x.js': WIN,
    'src/node_modules/x.js': WIN,
    'secrets/key.txt': WIN,
    'agent-team/secrets/deep/x.md': WIN,
    '.env': WIN,
    '.env.local': WIN,
    'src/.env.production': WIN,
    'shot.png': Buffer.concat([Buffer.from([0]), Buffer.from('\n' + WIN)]),
    'late-zero.bin': zeroAt(HEAD_BYTES - 1),
    'src/clean.js': 'const a = 1;\n',
  }), []);
});

test('checkTree reads a file whose first zero byte comes after the first 8000 bytes', () => {
  assert.deepEqual(hitsIn({ 'big.txt': zeroAt(HEAD_BYTES) }), ['big.txt:1: windows']);
});

test('checkTree does not follow a link to a folder', () => {
  withTree({ 'target/a.txt': WIN }, (outside) => {
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

test('report gives no lines and code 0 when nothing is found', () => {
  assert.deepEqual(report([]), { lines: [], code: 0 });
});

test('report gives the message, then one path:line: kind line per finding, and code 1', () => {
  withTree({ 'notes/a.md': 'one\n' + WIN + '\n', 'docs/b.txt': HOME }, (root) => {
    const result = report(checkTree(root));
    assert.deepEqual(result, {
      lines: [MESSAGE, 'docs/b.txt:1: home home-directory path', 'notes/a.md:2: windows home-directory path'],
      code: 1,
    });
    assert.equal(result.lines.some((line) => line.includes(NAME)), false);
  });
});

function runCopy(root) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [resolve(root, SCRIPT)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) };
  } catch (error) {
    return { code: error.status, out: error.stdout };
  }
}

test('run directly, the checker is silent with exit 0 on a clean tree and prints the report with exit 1 on a hit', () => {
  withTree({ [SCRIPT]: readFileSync(join(ROOT, SCRIPT)), 'notes/b.md': 'clean\n' }, (root) => {
    assert.deepEqual(runCopy(root), { code: 0, out: '' });
    writeFileSync(join(root, 'notes/a.md'), 'one\n' + WIN + '\n');
    const result = runCopy(root);
    assert.deepEqual(result, { code: 1, out: MESSAGE + '\nnotes/a.md:2: windows home-directory path\n' });
    assert.equal(result.out.includes(NAME), false);
  });
});

test('no file in this repo holds a home-directory path', () => {
  const found = checkTree(ROOT).map((hit) => `${hit.file}:${hit.line}: ${hit.kind}`);
  assert.equal(found.length, 0, ['Replace the home-directory path with a placeholder such as <OS temp dir> or <user>; never commit an account name', ...found].join('\n'));
});
