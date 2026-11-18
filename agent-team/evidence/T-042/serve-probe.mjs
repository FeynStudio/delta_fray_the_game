import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startServer } from '../../../scripts/serve.mjs';

const LIMIT_MS = 5000;
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
const FAKE = new Set([...Object.values(FILES), ...Object.values(OUTSIDE)]);

const unchunk = (text) => {
  let out = '';
  let rest = text;
  for (;;) {
    const end = rest.indexOf('\r\n');
    const size = end < 0 ? 0 : parseInt(rest.slice(0, end), 16);
    if (!size) return out;
    out += rest.slice(end + 2, end + 2 + size);
    rest = rest.slice(end + 4 + size);
  }
};

const send = (port, path, host) => new Promise((done) => {
  const socket = connect(port, '127.0.0.1');
  let data = '';
  const timer = setTimeout(() => { socket.destroy(); done({ status: 'timeout', body: '' }); }, LIMIT_MS);
  socket.setEncoding('latin1');
  socket.on('data', (d) => { data += d; });
  socket.on('error', (e) => { clearTimeout(timer); done({ status: `socket error ${e.code}`, body: '' }); });
  socket.on('close', () => {
    clearTimeout(timer);
    const split = data.indexOf('\r\n\r\n');
    const head = split < 0 ? data : data.slice(0, split);
    const raw = split < 0 ? '' : data.slice(split + 4);
    const status = (/^HTTP\/1\.[01] (\d{3})/.exec(head) ?? [])[1] ?? 'no status line';
    const body = /\r\ntransfer-encoding: *chunked/i.test(head) ? unchunk(raw) : raw;
    done({ status, body: body.trim() });
  });
  const hostLine = host === null ? '' : `Host: ${host}\r\n`;
  socket.write(`GET ${path} HTTP/1.1\r\n${hostLine}Connection: close\r\n\r\n`, 'latin1');
});

const lstatSafe = (p) => {
  try {
    return lstatSync(p);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};
const removeLink = (link) => {
  if (!lstatSafe(link)) return 'absent';
  try {
    unlinkSync(link);
  } catch (e) {
    rmdirSync(link);
    return `removed with rmdir after unlink failed (${e.code})`;
  }
  return 'removed';
};

const parent = mkdtempSync(join(resolve(tmpdir()), 't042-probe-'));
const root = join(parent, 'root');
const outside = join(parent, 'outside');
const rootLink = join(parent, 'root-link');
const dirLinks = [
  [join(root, 'link-out'), outside, 'link-out -> ../outside'],
  [join(root, 'src', 'link-out'), outside, 'src/link-out -> ../../outside'],
  [join(root, 'link-secrets'), join(root, 'secrets'), 'link-secrets -> secrets'],
  [join(root, 'src', 'link-secrets'), join(root, 'secrets'), 'src/link-secrets -> ../secrets'],
  [rootLink, root, 'root-link -> root (next to root, used as a server root)'],
];
const fileLink = join(root, 'src', 'env.js');
const made = [];
const servers = [];
try {
  for (const [name, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), `${text}\n`);
  }
  mkdirSync(outside);
  for (const [name, text] of Object.entries(OUTSIDE)) writeFileSync(join(outside, name), `${text}\n`);
  for (const [link, target, label] of dirLinks) {
    symlinkSync(target, link, 'junction');
    made.push(link);
    console.log('%s', `fixture: folder link ${label} made`);
  }
  let fileLinkNote;
  try {
    symlinkSync(join(root, '.env'), fileLink, 'file');
    made.push(fileLink);
    fileLinkNote = 'made';
  } catch (e) {
    fileLinkNote = `not made (${e.code}: this OS user may not create file symlinks)`;
  }
  console.log('%s', `fixture: file symlink src/env.js -> ../.env ${fileLinkNote}`);
  console.log('%s', `platform ${process.platform}, node ${process.version}; throw-away folder in the OS temp dir: root/ holds fake ${Object.keys(FILES).join(', ')}; outside/ next to root/ holds fake o.txt and o.js`);
  for (const short of ['ENV~1', 'ENV~1.LOC', 'GIT~1', 'GITIGN~1', 'src/LONGMO~1.JS']) {
    console.log('%s', `fixture: short name ${short} exists: ${existsSync(join(root, ...short.split('/'))) ? 'yes' : 'no'}`);
  }

  const main = await startServer(root, 0);
  servers.push(main);
  const viaLink = await startServer(rootLink, 0);
  servers.push(viaLink);
  const port = Number(new URL(main.url).port);
  const linkPort = Number(new URL(viaLink.url).port);
  const other = port === 65535 ? port - 1 : port + 1;
  const own = '127.0.0.1:<port>';

  const allowed = ['/', '/index.html', '/index.html?debug=1', '/src/game.js', '/src/config.js', '/src/sub/deep.js'];
  const kinds = [
    ['a', ['/sub%5C..%5C.env', '/sub%5c..%5c.env.local', '/sub%5C..%5C.git%5Cconfig', '/secrets%5Cx.txt', '/nope%5C..%5C.env', '/%5Csecrets%5Cx.txt', '/sub%5C..%5C..%5Coutside%5Co.txt', '/secrets%2Fx.txt', '/sub%2f..%2f.env', '/src%2Fgame.js']],
    ['b', ['/SECRETS/x.txt', '/Secrets/x.txt', '/sEcReTs/x.txt', '/%53ECRETS/x.txt', '/.ENV', '/.GIT/config', '/INDEX.HTML', '/SRC/game.js', '/src/GAME.JS', '/Index.html', '/src/Game.js']],
    ['c', ['/ENV~1', '/ENV~1.LOC', '/GIT~1/config', '/GITIGN~1', '/ENV~1::$DATA', '/src/LONGMO~1.JS']],
    ['d', ['/secrets::$INDEX_ALLOCATION/x.txt', '/secrets%3A%3A$INDEX_ALLOCATION/x.txt', '/.env::$DATA', '/index.html::$DATA', '/src/game.js::$DATA']],
    ['e', ['/secrets./x.txt', '/secrets%20/x.txt', '/.env.', '/.env%20', '/index.html.', '/index.html%20', '/src./game.js', '/src/game.js.', '/src/game.js%20']],
    ['f', ['/link-out/o.txt', '/link-secrets/x.txt', '/link-secrets/x.js', '/src/link-out/o.js', '/src/link-secrets/x.js', '/src/env.js']],
    ['h', ['/.env', '/.env.local', '/.git/config', '/secrets/x.txt', '/%2e%2e/outside/o.txt', '//secrets/x.txt', '/src/', '/sub/s.txt', '/package.json', '/%00', '/src/game.js%00', '/src/game%01.js', '/nul', '/src/nul.js', '/%E0%A4%A']],
    ['i', allowed],
  ];
  const line = (kind, path, hostLabel, r) => {
    const body = FAKE.has(r.body) ? ` ${r.body}` : '';
    console.log('%s', `${kind} | ${path} | Host: ${hostLabel} | ${r.status}${body}`);
  };
  console.log('%s', 'kind | request path as sent | Host header sent (<port> = the port the server listens on) | status, then the body when it is a fake file body');
  for (const [kind, paths] of kinds) {
    for (const path of paths) line(kind, path, own, await send(port, path, `127.0.0.1:${port}`));
  }
  for (const path of [...allowed, '/.env', '/sub%5C..%5C.env', '/ENV~1', '/SECRETS/x.txt', '/link-out/o.txt']) {
    line('f-root-link', path, own, await send(linkPort, path, `127.0.0.1:${linkPort}`));
  }
  const hosts = [
    ['rebind.example', 'rebind.example'],
    ['rebind.example:<port>', `rebind.example:${port}`],
    ['localhost:<another port>', `localhost:${other}`],
    ['127.0.0.1 (no port)', '127.0.0.1'],
    ['127.0.0.2:<port>', `127.0.0.2:${port}`],
    ['[::1]:<port>', `[::1]:${port}`],
    ['(empty)', ''],
    ['(no Host header)', null],
    ['127.0.0.1:<port>', `127.0.0.1:${port}`],
    ['localhost:<port>', `localhost:${port}`],
    ['LOCALHOST:<port>', `LOCALHOST:${port}`],
  ];
  for (const [label, host] of hosts) {
    for (const path of ['/index.html', '/sub%5C..%5C.env']) line('g', path, label, await send(port, path, host));
  }
} finally {
  for (const s of servers) await s.close();
  for (const link of made.reverse()) console.log('%s', `cleanup ${link === rootLink ? 'root-link' : link.slice(root.length + 1).split('\\').join('/')}: ${removeLink(link)}`);
  console.log('%s', `cleanup: link targets still there before the folder is removed: outside/o.txt ${existsSync(join(outside, 'o.txt'))}, secrets/x.txt ${existsSync(join(root, 'secrets', 'x.txt'))}, .env ${existsSync(join(root, '.env'))}, root/index.html ${existsSync(join(root, 'index.html'))}`);
  rmSync(parent, { recursive: true, force: true });
  console.log('%s', `cleanup: throw-away folder removed ${!existsSync(parent)}`);
}
