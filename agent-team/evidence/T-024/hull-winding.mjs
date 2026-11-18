import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../../../src/rules.js', import.meta.url)), 'utf8');
const start = source.indexOf('function convexHull(points)');
const end = source.indexOf('\nfunction polygonsOverlap', start);
if (start < 0 || end < 0) throw new Error('convexHull not found in src/rules.js');

const dir = mkdtempSync(join(tmpdir(), 't024-hull-'));
let convexHull;
try {
  const file = join(dir, 'hull.mjs');
  writeFileSync(file, `export ${source.slice(start, end)}\n`);
  ({ convexHull } = await import(pathToFileURL(file).href));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const signedArea = (poly) => poly.reduce((sum, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return sum + (p.x * q.y - q.x * p.y);
}, 0) / 2;

const cases = {
  'right triangle': [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
  'square with edge midpoints and centre': [
    { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 },
    { x: 5, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 5 }, { x: 5, y: 5 },
  ],
};

console.log('%s', `convexHull taken from src/rules.js characters ${start} to ${end}`);
for (const [name, pts] of Object.entries(cases)) {
  const hull = convexHull(pts);
  console.log('%s', `${name}: ${pts.length} points in, hull ${JSON.stringify(hull)}, signed area ${signedArea(hull)}`);
}
