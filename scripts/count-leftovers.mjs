import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARK = 'galaxy-smoke-';
export const IMAGES = ['chrome.exe', 'msedge.exe'];
const MAX_WAIT = 120;
const NEWLINE = '\n';
const USAGE = 'usage: node scripts/count-leftovers.mjs [seconds 0-120]';

export function parseWait(args) {
  if (args.length === 0) return 0;
  if (args.length !== 1 || !/^[0-9]+$/.test(args[0])) return null;
  const wait = Number(args[0]);
  return wait <= MAX_WAIT ? wait : null;
}

export function countFolders(dir) {
  return readdirSync(dir).filter((name) => name.startsWith(MARK)).length;
}

export function countImage(listing, image) {
  const start = '"' + image + '",';
  return listing.split(/\r?\n/).filter((line) => line.startsWith(start)).length;
}

export function formatCounts({ at, wait, folders, processes }) {
  const head = 'counted ' + at.toISOString() + ' after waiting ' + wait + ' s: ' + MARK + '* folders in the OS temp dir ' + folders + '; ';
  if (processes === null) return head + 'processes not counted (not Windows)';
  return head + IMAGES.map((image) => image + ' processes ' + processes[image]).join('; ');
}

function listImage(image) {
  return execFileSync('tasklist', ['/FI', 'IMAGENAME eq ' + image, '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
}

function errorCode(error) {
  const code = error && error.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'unknown';
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const wait = parseWait(process.argv.slice(2));
  if (wait === null) {
    process.stdout.write(USAGE + NEWLINE);
    process.exit(2);
  }
  await new Promise((done) => setTimeout(done, wait * 1000));
  try {
    const folders = countFolders(resolve(tmpdir()));
    const processes = process.platform === 'win32' ? Object.fromEntries(IMAGES.map((image) => [image, countImage(listImage(image), image)])) : null;
    process.stdout.write(formatCounts({ at: new Date(), wait, folders, processes }) + NEWLINE);
  } catch (error) {
    process.stdout.write('count-leftovers: count failed (' + errorCode(error) + ')' + NEWLINE);
    process.exit(1);
  }
}
