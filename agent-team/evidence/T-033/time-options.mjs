import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = process.argv[2];
const FILES = ['scripts/handoff-check.mjs', 'tests/handoff-check.test.js', 'package.json'];
const SAME = 'counts a name that only starts like agent-team/, a nested agent-team folder and a deleted code file as code';
const show = (ref, file) => execFileSync('git', ['show', ref + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
const LOOP_START = "      for (const name of ['Agent-Team/x', 'AGENT-TEAM/x']) {";
const head = show('4c329b2', FILES[1]);
const loopEnd = 1 + head.indexOf('\n      }\n', head.indexOf("assert.equal(check(repo).commit, await repo.git('rev-parse', 'HEAD'), name")) + 8;
const loop = head.slice(head.indexOf(LOOP_START), loopEnd);
const without = head.replace(loop, '');
const separate = without.replace("  test('ignores a replace ref", "  test('counts Agent-Team/x as code', async () => {\n    await inRepo(async (repo) => {\n      await repo.commit('Add the game', { 'src/game.js': 'export const a = 1;\\n', [BRIEF]: brief({ handoff: STALE }) });\n" + loop.split('\n').map((l) => (l ? l.slice(2) : l)).join('\n') + "    });\n  });\n\n  test('ignores a replace ref");
const cut = (text, from, to) => text.slice(0, text.indexOf(from)) + text.slice(text.indexOf(to));
const variants = {
  base: show('8042468', FILES[1]),
  head,
  onlyAgentTeam: head.replace("['Agent-Team/x', 'AGENT-TEAM/x']", "['Agent-Team/x']"),
  separateTest: separate,
  withoutAgentTeamLoop: without,
  withoutGraftTest: cut(head, "\n  test('ignores a graft", '\n});\n\nconst caseVariants'),
  withoutEdgeTest: cut(head, "  test('keeps U+007E", "  test('does not run the upload-pack"),
  withoutGraftRows: cut(head, "for (const name of caseVariants('GIT_GRAFT_FILE'))", "test('gitEnv keeps the other names"),
};
const scratch = mkdtempSync(join(tmpdir(), 'handoff-t033-options-'));
try {
  for (const [name, text] of Object.entries(variants)) {
    for (const file of FILES) {
      mkdirSync(dirname(join(scratch, name, file)), { recursive: true });
      writeFileSync(join(scratch, name, file), file === FILES[1] ? text : show(name === 'base' ? '8042468' : '4c329b2', file));
    }
  }
  const results = Object.fromEntries(Object.keys(variants).map((k) => [k, []]));
  for (let run = 0; run < 3; run += 1) {
    for (const name of Object.keys(variants)) {
      let text;
      try {
        text = execFileSync(process.execPath, ['--test', '--test-reporter=tap', FILES[1]], { cwd: join(scratch, name), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch (error) {
        text = String(error.stdout);
      }
      const rows = text.split('\n');
      const total = Math.round(Number(rows.find((r) => r.startsWith('# duration_ms ')).split(' ')[2]));
      const fail = rows.find((r) => r.startsWith('# fail ')).split(' ')[2];
      const tests = rows.find((r) => r.startsWith('# tests ')).split(' ')[2];
      const i = rows.findIndex((r) => r.trim().endsWith(' - ' + SAME));
      const same = Math.round(Number(rows.slice(i).find((r) => r.trim().startsWith('duration_ms:')).trim().split(' ')[1]));
      results[name].push({ total, same, fail, tests });
      console.log(name, 'run', run + 1, 'tests', tests, 'fail', fail, 'file', total, 'ms, same-rule test', same, 'ms');
    }
  }
  const avg = (l, k) => Math.round(l.reduce((a, b) => a + b[k], 0) / l.length);
  for (const [name, list] of Object.entries(results)) console.log('average', name, 'file', avg(list, 'total'), 'ms (vs base ' + (avg(list, 'total') - avg(results.base, 'total')) + ' ms), same-rule test', avg(list, 'same'), 'ms');
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
}
