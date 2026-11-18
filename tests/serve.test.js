import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startServer } from '../scripts/serve.mjs';

const FILES = {
  'index.html': 'fake-index',
  'src/game.js': 'fake-game',
  'src/config.js': 'fake-config',
  'src/sub/deep.js': 'fake-deep',
  'src/longmodulename.js': 'fake-longmodule',
  'src/secrets/x.js': 'fake-src-secret',
  '.env': 'fake-env',
  '.env.local': 'fake-env-local',
  '.gitignore': 'fake-gitignore',
  '.git/config': 'fake-git-config',
  'secrets/x.txt': 'fake-secret',
  'secrets/x.js': 'fake-secret-js',
  'sub/s.txt': 'fake-sub',
  'package.json': 'fake-package',
};
const OUTSIDE = { 'o.txt': 'fake-outside', 'o.js': 'fake-outside-js' };
const LIMIT_MS = 4000;

const KINDS = {
  a: ['/sub%5C..%5C.env', '/sub%5c..%5c.env.local', '/sub%5C..%5C.git%5Cconfig', '/secrets%5Cx.txt', '/nope%5C..%5C.env', '/%5Csecrets%5Cx.txt', '/sub%5C..%5C..%5Coutside%5Co.txt', '/secrets%2Fx.txt', '/sub%2f..%2f.env', '/src%2Fgame.js'],
  b: ['/SECRETS/x.txt', '/Secrets/x.txt', '/sEcReTs/x.txt', '/%53ECRETS/x.txt', '/.ENV', '/.GIT/config', '/INDEX.HTML', '/SRC/game.js', '/src/GAME.JS', '/Index.html', '/src/Game.js'],
  c: ['/ENV~1', '/ENV~1.LOC', '/GIT~1/config', '/GITIGN~1', '/ENV~1::$DATA', '/src/LONGMO~1.JS'],
  d: ['/secrets::$INDEX_ALLOCATION/x.txt', '/secrets%3A%3A$INDEX_ALLOCATION/x.txt', '/.env::$DATA', '/index.html::$DATA', '/src/game.js::$DATA'],
  e: ['/secrets./x.txt', '/secrets%20/x.txt', '/.env.', '/.env%20', '/index.html.', '/index.html%20', '/src./game.js', '/src/game.js.', '/src/game.js%20'],
  f: ['/link-out/o.txt', '/link-secrets/x.txt', '/link-secrets/x.js', '/src/link-out/o.js', '/src/link-secrets/x.js'],
  h: ['/.env', '/.env.local', '/.git/config', '/secrets/x.txt', '/%2e%2e/outside/o.txt', '//secrets/x.txt', '/src/', '/sub/s.txt', '/package.json', '/%00', '/src/game.js%00', '/src/game%01.js', '/nul', '/src/nul.js'],
};
const ALLOWED = [
  ['/', 'fake-index', 'text/html; charset=utf-8'],
  ['/index.html', 'fake-index', 'text/html; charset=utf-8'],
  ['/index.html?debug=1', 'fake-index', 'text/html; charset=utf-8'],
  ['/src/game.js', 'fake-game', 'text/javascript; charset=utf-8'],
  ['/src/config.js', 'fake-config', 'text/javascript; charset=utf-8'],
  ['/src/sub/deep.js', 'fake-deep', 'text/javascript; charset=utf-8'],
];

const lstatSafe = (path) => {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const removeLink = (link) => {
  if (!lstatSafe(link)) return;
  try {
    unlinkSync(link);
  } catch {
    rmdirSync(link);
  }
};

async function withServer(work, viaLink = false) {
  const parent = mkdtempSync(join(resolve(tmpdir()), 'serve-test-'));
  const root = join(parent, 'root');
  const outside = join(parent, 'outside');
  const links = [];
  const link = (target, path, type) => {
    symlinkSync(target, path, type);
    links.push(path);
  };
  let server;
  try {
    for (const [name, text] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), `${text}\n`);
    }
    mkdirSync(outside);
    for (const [name, text] of Object.entries(OUTSIDE)) writeFileSync(join(outside, name), `${text}\n`);
    link(outside, join(root, 'link-out'), 'junction');
    link(outside, join(root, 'src', 'link-out'), 'junction');
    link(join(root, 'secrets'), join(root, 'link-secrets'), 'junction');
    link(join(root, 'secrets'), join(root, 'src', 'link-secrets'), 'junction');
    let fileLink = null;
    try {
      link(join(root, '.env'), join(root, 'src', 'env.js'), 'file');
    } catch (error) {
      fileLink = String(error.code);
    }
    if (viaLink) link(root, join(parent, 'root-link'), 'junction');
    server = await startServer(viaLink ? join(parent, 'root-link') : root, 0);
    await work({ port: Number(new URL(server.url).port), root, fileLink });
  } finally {
    if (server) await server.close();
    for (const path of links.reverse()) removeLink(path);
    rmSync(parent, { recursive: true, force: true });
  }
  assert.equal(existsSync(parent), false);
}

const viaHttp = (port, path, host) => new Promise((ok, fail) => {
  const req = request({ host: '127.0.0.1', port, path, headers: { Host: host }, setHost: false, agent: false, timeout: LIMIT_MS }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { body += d; });
    res.on('end', () => ok({ status: res.statusCode, type: res.headers['content-type'], cache: res.headers['cache-control'], body: body.trim() }));
  });
  req.on('timeout', () => req.destroy(new Error(`${path} timed out`)));
  req.on('error', fail);
  req.end();
});

const withoutHost = (port, path) => new Promise((ok, fail) => {
  const socket = connect(port, '127.0.0.1');
  let data = '';
  socket.setTimeout(LIMIT_MS, () => socket.destroy(new Error(`${path} timed out`)));
  socket.setEncoding('latin1');
  socket.on('data', (d) => { data += d; });
  socket.on('error', fail);
  socket.on('close', () => ok({ status: Number((/^HTTP\/1\.1 (\d{3})/.exec(data) ?? [])[1]), body: data }));
  socket.write(`GET ${path} HTTP/1.1\r\nConnection: close\r\n\r\n`, 'latin1');
});

async function refused(port, path, status = 404, host = `127.0.0.1:${port}`, label = '') {
  const r = host === null ? await withoutHost(port, path) : await viaHttp(port, path, host);
  assert.equal(r.status, status, `${path}${label} -> ${r.status}`);
  assert.doesNotMatch(r.body, /fake-/, `${path}${label} -> ${r.status} with a fake body`);
}

async function served(port, path, body, type, host = `127.0.0.1:${port}`, label = '') {
  const r = await viaHttp(port, path, host);
  assert.equal(r.status, 200, `${path}${label} -> ${r.status}`);
  assert.equal(r.body, body, `${path}${label} -> ${r.status} with another body`);
  assert.equal(r.type, type, `${path}${label} -> ${r.status} with another Content-Type`);
  assert.equal(r.cache, 'no-store', `${path}${label} -> ${r.status} without Cache-Control: no-store`);
}

test('a: encoded separators %5C and %2F get 404', () => withServer(async ({ port }) => {
  for (const path of KINDS.a) await refused(port, path);
}));

test('b: case variants of secrets, dotfiles, index.html and src get 404', () => withServer(async ({ port }) => {
  for (const path of KINDS.b) await refused(port, path);
}));

test('c: 8.3 short names and any ~ get 404', (t) => withServer(async ({ port, root }) => {
  if (process.platform === 'win32') {
    t.diagnostic(`short name ENV~1 existed in the fixture: ${existsSync(join(root, 'ENV~1')) ? 'yes' : 'no'}`);
    t.diagnostic(`short name src/LONGMO~1.JS existed in the fixture: ${existsSync(join(root, 'src', 'LONGMO~1.JS')) ? 'yes' : 'no'}`);
  }
  for (const path of KINDS.c) await refused(port, path);
}));

test('d: NTFS stream names and colons get 404', () => withServer(async ({ port }) => {
  for (const path of KINDS.d) await refused(port, path);
}));

test('e: trailing dots and spaces get 404', () => withServer(async ({ port }) => {
  for (const path of KINDS.e) await refused(port, path);
}));

test('f: folder links inside the root to secrets/ or outside the root get 404', () => withServer(async ({ port }) => {
  for (const path of KINDS.f) await refused(port, path);
}));

test('f: a file symlink src/env.js to .env gets 404', (t) => withServer(async ({ port, fileLink }) => {
  if (fileLink !== null) {
    t.skip(`file symlink not made (${fileLink}): this OS user may not create file symlinks`);
    return;
  }
  await refused(port, '/src/env.js');
}));

test('g: a wrong or missing Host gets 421; 127.0.0.1 and localhost with the own port get what the path alone gets', () => withServer(async ({ port }) => {
  const other = port === 65535 ? port - 1 : port + 1;
  const wrong = [
    ['rebind.example', 'rebind.example'],
    ['rebind.example:<port>', `rebind.example:${port}`],
    ['localhost:<another port>', `localhost:${other}`],
    ['127.0.0.1 with no port', '127.0.0.1'],
    ['127.0.0.2:<port>', `127.0.0.2:${port}`],
    ['[::1]:<port>', `[::1]:${port}`],
    ['empty', ''],
    ['none', null],
  ];
  for (const [label, host] of wrong) {
    for (const path of ['/index.html', '/sub%5C..%5C.env']) await refused(port, path, 421, host, ` with Host ${label}`);
  }
  for (const [label, host] of [['127.0.0.1:<port>', `127.0.0.1:${port}`], ['localhost:<port>', `localhost:${port}`], ['LOCALHOST:<port>', `LOCALHOST:${port}`]]) {
    await served(port, '/index.html', 'fake-index', 'text/html; charset=utf-8', host, ` with Host ${label}`);
    await refused(port, '/sub%5C..%5C.env', 404, host, ` with Host ${label}`);
  }
}));

test('h: dotfiles, secrets/, files outside the allow-list, control characters and device names get 404, a bad escape 400', () => withServer(async ({ port }) => {
  for (const path of KINDS.h) await refused(port, path);
  await refused(port, '/%E0%A4%A', 400);
}));

test('i: / and /index.html and JavaScript under src/ are served with their type', () => withServer(async ({ port }) => {
  for (const [path, body, type] of ALLOWED) await served(port, path, body, type);
}));

test('a server started on a folder link to the root serves the same files and refuses every kind', () => withServer(async ({ port }) => {
  for (const [path, body, type] of ALLOWED) await served(port, path, body, type);
  for (const path of Object.values(KINDS).map((paths) => paths[0])) await refused(port, path);
  await refused(port, '/index.html', 421, 'rebind.example', ' with Host rebind.example');
}, true));

test('startServer rejects when the root cannot be resolved', async () => {
  const parent = mkdtempSync(join(resolve(tmpdir()), 'serve-test-'));
  try {
    const outcome = await startServer(join(parent, 'missing'), 0).then((server) => server.close().then(() => 'listened'), () => 'rejected');
    assert.equal(outcome, 'rejected');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
  assert.equal(existsSync(parent), false);
});
