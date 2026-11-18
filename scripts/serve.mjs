#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ALLOWED = /^\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/;
const ODD = /[\\:~\u0000-\u001f\u007f]/;
const allowed = (path) => path === '/index.html' || ALLOWED.test(path);
const plainNames = (parts) => parts.every((part) => {
  const name = part.toLowerCase();
  return !name.startsWith('.') && name !== 'secrets' && !name.endsWith('.') && !name.endsWith(' ');
});

async function realFile(base, path) {
  const parts = path.split('/').slice(1);
  if (ODD.test(path) || !allowed(path) || !plainNames(parts)) return null;
  const file = await realpath(resolve(base, ...parts)).catch(() => null);
  if (!file) return null;
  const rel = relative(base, file);
  const real = rel.split(/[\\/]/);
  if (!rel || isAbsolute(rel) || real[0] === '..' || !plainNames(real) || !allowed(`/${real.join('/')}`)) return null;
  return real.join('/') === parts.join('/') ? file : null;
}

export function startServer(root, port = 0, host = '127.0.0.1') {
  const ready = realpath(resolve(root));
  const server = createServer({ requireHostHeader: false }, async (req, res) => {
    const own = server.address().port;
    const sent = String(req.headers.host ?? '').toLowerCase();
    if (sent !== `127.0.0.1:${own}` && sent !== `localhost:${own}`) {
      res.writeHead(421).end('Misdirected request');
      return;
    }
    let path;
    try {
      const raw = new URL(req.url, 'http://localhost').pathname;
      path = /%2f|%5c/i.test(raw) ? null : decodeURIComponent(raw);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    const file = path === null ? null : await realFile(await ready, path === '/' ? '/index.html' : path);
    if (!file) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return ready.then(() => new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      ok({
        url: `http://${host}:${server.address().port}`,
        close: () => new Promise((done) => { server.closeAllConnections(); server.close(done); }),
      });
    });
  }));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const port = Number(process.env.PORT ?? 5173);
  await startServer(root, port, '127.0.0.1');
  process.stdout.write(`Serving ${root} at http://localhost:${port}/index.html (Ctrl+C to stop)\n`);
}
