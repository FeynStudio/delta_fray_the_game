import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTree, findComments } from '../../../scripts/no-comments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const S2 = '/'.repeat(2);
const OPEN = '/' + '*';
const CLOSE = '*' + '/';
const HASH = String.fromCharCode(35);
const SOCKET = ' nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket';
const JS_NOTE = 'const a = 1;\n' + S2 + ' note\n';
const SH_NOTE = 'echo a\n' + HASH + ' note\n';

const out = (line) => process.stdout.write(line + '\n');
const show = (hits) => (hits.length === 0 ? 'no finding' : hits.join(', '));

function inTree(files) {
  const root = mkdtempSync(join(resolve(tmpdir()), 'gaps-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    return checkTree(root).map((hit) => `${hit.file}:${hit.line}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const lineCase = 'const d = o.of / 2; ' + S2 + ' note';
const blockCase = 'const d = o.case / 2; ' + OPEN + ' note ' + CLOSE;
out('case 1a, division by o.of then a line comment: ' + show(findComments(lineCase, 'js').map((hit) => 'line ' + hit.line)));
out('case 1b, division by o.case then a block comment: ' + show(findComments(blockCase, 'js').map((hit) => 'line ' + hit.line)));

const twice = 'run(); ' + S2 + SOCKET + '\nrun(); ' + S2 + SOCKET + '\n';
out('case 2, scripts/smoke.mjs holds the allowed directive twice: ' + show(inTree({ 'scripts/smoke.mjs': twice })));

for (const folder of ['T-014-new', 'T-0140', 'T-001-old']) {
  const found = inTree({ ['agent-team/evidence/' + folder + '/x.mjs']: JS_NOTE, ['agent-team/evidence/' + folder + '/y.sh']: SH_NOTE });
  out('case 3, comment in agent-team/evidence/' + folder + '/: ' + show(found));
}

const testText = readFileSync(resolve(HERE, '../../../tests/no-comments.test.js'), 'utf8');
const names = testText.split('\n').filter((line) => /^\s*test\(/.test(line));
const pinned = names.filter((line) => line.includes('T-014'));
out('case 4, test lines in tests/no-comments.test.js: ' + names.length + ', of which name T-014: ' + pinned.length);
out('case 4, the string T-014 anywhere in tests/no-comments.test.js: ' + (testText.includes('T-014') ? 'yes' : 'no'));
