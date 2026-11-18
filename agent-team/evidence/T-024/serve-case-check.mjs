import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../../scripts/serve.mjs';

const root = mkdtempSync(join(tmpdir(), 't024-serve-'));
try {
  mkdirSync(join(root, 'secrets'));
  writeFileSync(join(root, 'secrets', 'x.txt'), 'secret-file\n');
  writeFileSync(join(root, '.env'), 'env-file\n');
  writeFileSync(join(root, 'index.html'), 'index-file\n');
  const server = await startServer(root, 0);
  try {
    console.log('%s', `platform ${process.platform}; throw-away root in the OS temp dir holding index.html, .env and secrets/x.txt`);
    for (const p of ['/index.html', '/secrets/x.txt', '/SECRETS/x.txt', '/Secrets/x.txt', '/secrets./x.txt', '/.env', '/.ENV', '/%2e%2e/x']) {
      const r = await fetch(server.url + p);
      const body = (await r.text()).trim();
      console.log('%s', `${p} -> ${r.status} ${body}`);
    }
  } finally {
    await server.close();
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
