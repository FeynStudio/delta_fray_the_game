// Probe: at game start, player 1 sweeps over player 2's spawn point. Usage: node probe.mjs <worktree>
const root = process.argv[2];
const rules = await import(`file:///${root}/src/rules.js`);
const init = rules.createInitialState();
const s = { ...init, ships: [{ ...init.ships[0], x: 980 }, init.ships[1]] };
const out = rules.resolveMove(s, { distance: 150, angle: 0 });
console.log('ships before:', JSON.stringify(s.ships));
console.log('ships after resolveMove(150 at 0):', JSON.stringify(out.ships));
console.log('player 2 on spawn alive after sweep:', out.ships[1].alive);
console.log('isSpawnProtected exported:', typeof rules.isSpawnProtected === 'function');
