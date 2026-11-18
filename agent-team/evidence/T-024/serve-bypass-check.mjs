import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../../scripts/serve.mjs';

const get = (base, path, host) => new Promise((ok, fail) => {
  const { hostname, port } = new URL(base);
  const req = request({ hostname, port, path, method: 'GET', headers: host ? { Host: host } : {} }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { body += d; });
    res.on('end', () => ok({ status: res.statusCode, body: body.trim() }));
  });
  req.on('error', fail);
  req.end();
});

const removeLink = (link) => {
  if (!existsSync(link) && !lstatSafe(link)) return 'absent';
  try {
    unlinkSync(link);
  } catch (e) {
    rmdirSync(link);
    return `removed with rmdir after unlink failed (${e.code})`;
  }
  return 'removed';
};
const lstatSafe = (p) => {
  try {
    return lstatSync(p);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};

const parent = mkdtempSync(join(tmpdir(), 't024-bypass-'));
const root = join(parent, 'root');
const outside = join(parent, 'outside');
const links = [join(root, 'link-out'), join(root, 'link-secrets')];
try {
  mkdirSync(join(root, 'secrets'), { recursive: true });
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, 'sub'));
  mkdirSync(outside);
  writeFileSync(join(root, 'index.html'), 'fake-index\n');
  writeFileSync(join(root, '.env'), 'fake-env\n');
  writeFileSync(join(root, '.env.local'), 'fake-env-local\n');
  writeFileSync(join(root, '.git', 'config'), 'fake-git-config\n');
  writeFileSync(join(root, 'secrets', 'x.txt'), 'fake-secret\n');
  writeFileSync(join(root, 'sub', 's.txt'), 'fake-sub\n');
  writeFileSync(join(outside, 'o.txt'), 'fake-outside\n');
  symlinkSync(outside, links[0], 'junction');
  symlinkSync(join(root, 'secrets'), links[1], 'junction');

  const server = await startServer(root, 0);
  try {
    console.log('%s', `platform ${process.platform}, node ${process.version}; throw-away folder in the OS temp dir: root/ holds fake index.html, .env, .env.local, .git/config, secrets/x.txt, sub/s.txt and two junctions (link-out -> ../outside, link-secrets -> secrets); outside/o.txt sits next to root/`);
    console.log('%s', 'request path as sent on the wire -> status body (bodies are the fake file contents; 404 = refused)');
    const paths = [
      '/index.html', '/secrets/x.txt', '/.env', '/.ENV', '/.git/config', '/secrets./x.txt', '/.env.',
      '/%2e%2e/outside/o.txt', '/sub%5C..%5C..%5Coutside%5Co.txt',
      '/SECRETS/x.txt', '/sEcReTs/x.txt', '/%53ECRETS/x.txt',
      '/secrets%5Cx.txt', '/sub%5C..%5Csecrets%5Cx.txt', '/sub%5C..%5C.env', '/sub%5C..%5C.env.local', '/sub%5C..%5C.git%5Cconfig',
      '/ENV~1', '/ENV~1.LOC', '/ENV~2.LOC', '/GIT~1/config',
      '/secrets::$INDEX_ALLOCATION/x.txt', '/secrets%3A%3A$INDEX_ALLOCATION/x.txt',
      '/link-out/o.txt', '/link-secrets/x.txt',
    ];
    for (const p of paths) {
      const r = await get(server.url, p);
      console.log('%s', `${p} -> ${r.status} ${r.body}`);
    }
    for (const p of ['/index.html', '/sub%5C..%5C.env']) {
      const r = await get(server.url, p, 'rebind.example');
      console.log('%s', `${p} with Host: rebind.example -> ${r.status} ${r.body}`);
    }
  } finally {
    await server.close();
  }
} finally {
  for (const link of links) console.log('%s', `cleanup ${link.slice(root.length + 1)}: ${removeLink(link)}`);
  console.log('%s', `cleanup: link targets still there before the folder is removed: outside/o.txt ${existsSync(join(outside, 'o.txt'))}, secrets/x.txt ${existsSync(join(root, 'secrets', 'x.txt'))}`);
  rmSync(parent, { recursive: true, force: true });
  console.log('%s', `cleanup: throw-away folder removed ${!existsSync(parent)}`);
}
