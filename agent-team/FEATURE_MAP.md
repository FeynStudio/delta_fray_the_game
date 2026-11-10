Feature Map - product-a (Galaxy Shooter - Prototype 1)
Feature plan doc: docs/PLAN.md source of truth for game features plan.
Roles: Coordinator, Owner, Reviewer.

1. Agent test hook (applies to all features)
The game draws on a canvas, so agents can't click elements. src/game.js exposes a debug API when the URL has ?debug=1:
- window.__game.getState(): ships, positions, headings, turn, gauge state
- window.__game.press('Space' | 'Shift'): simulates input
- window.__game.setState(state): loads a test scenario
- window.__game.step(ms): advances the game clock
Command-line checks: ./scripts/verify.sh T-### --feature <name> always runs guards, lint and all unit tests (node --test tests/*.test.js), then that feature's scenario and/or browser smoke check. --feature all (the default) runs every feature, so it only passes once the whole prototype is built. See section 9 for the harness contract.

2. Map & Rendering
- What it does: "I see the play area full screen with two triangle ships."
- Where it lives: src/render.js, src/config.js (ship triangle: rules.shipPoints, re-exported by render.js, T-004). Explosions (T-007): render.js explosionPieces(explosion, elapsedMs) (pure: the ship's outline triangle, each side cut once at config.explosionCuts, 6 pieces whose midpoints move straight out from the centre at config.explosionSpeed units/s and that shrink about their midpoints from 1 to config.explosionEndScale over config.explosionMs) and drawExplosions(ctx, state) (outline pieces in COLORS.ships[ship], config.shipLineWidth; drawFrame calls it before drawShips). Scores (T-012): drawScores(ctx, state) draws player 1's score top-left and player 2's top-right (right-aligned), each in its ship colour, config.scoreFontSize, config.scoreMargin inside the map; drawFrame calls it right after drawMap
- How a user reaches it: open index.html through a local server (e.g., npx serve .)
- How an agent drives it: ?debug=1, then __game.getState(); screenshot the canvas; verify.sh --feature render
- Inputs: world 1280 × 960 units, browser window 1920 × 1080
- Correct output looks like: world scaled to fit with aspect ratio kept; ships are 30-unit triangles at their spawn points, pointing at each other; no scrollbars; a destroyed ship's outline breaks into 6 uneven pieces that fly outward and shrink to half size over 1 second while play carries on (T-007)
- Known traps: mixing screen pixels with game units; stretching the map at other aspect ratios; blurry canvas on high-DPI screens
- Owner role: Owner

3. Controls & Gauges
- What it does: "I press Space to set distance, Shift to flip backward, Space again to launch."
- Where it lives: src/input.js (pure: stepGauge(state, ms), pressKey(state, 'Space' | 'Shift'), keyFromEvent(event)); keydown listener, animation loop and debug API in src/game.js; drawGauge / drawPowerBar / drawDirectionDial / gaugeLayout(state) in src/render.js (drawn only on the ship whose turn it is and following its position and heading every frame: power bar at 0.3 of base size a fixed distance below the ship that clears the dial in every heading, so it never moves with the phase; fixed-size direction dial at 0.56 of base size just in front of the nose, or just behind the tail when backward, on the long axis; clamped inside the map near edges); sweep speeds, needle range and gauge layout in src/config.js (gauge*) (T-002)
- Gauge state notes (T-002): the gauge also carries sweep: 1 | -1 (direction the active reading moves in), so a gauge edited through setState keeps sweeping smoothly. Both readings bounce back and forth. needle stays within -gaugeNeedleMax..+gaugeNeedleMax, positive = clockwise; backward: false measures it from the nose (world angle = heading + needle), backward: true from the tail (world angle = heading + 180 + needle). Shift toggles backward in the direction phase only. In the moving phase step(ms) runs the move animation instead (section 4).
- How a user reaches it: keyboard during their turn
- How an agent drives it: __game.press('Space'), __game.step(ms), __game.press('Shift'), __game.press('Space'), then check getState().gauge; verify.sh --feature input
- Inputs: Space at a 60% power reading; no Shift; Space at a 30° needle reading
- Correct output looks like: distance locked at 90 units (60% of 150), direction 30° forward, launch starts immediately with no confirm step
- Known traps: key-repeat registering multiple presses; Shift working after the direction is locked; gauges sweeping too fast for careful aim; adding a path preview (not allowed)
- Owner role: Owner

4. Movement
- What it does: "My ship flies the distance and direction I chose."
- Where it lives: src/rules.js applyMove(state, move) and wrapDegrees (math; a move longer than config.maxMove is refused and the state returned unchanged, human decision 2026-11-08); src/input.js moveFromGauge(state) (locked gauge to Move), pointAlong(from, to, t), startMove(state, end) and stepMove(state, ms) (animation progress kept in state.anim = { from, to, ships, elapsed, scores? } (scores added by game.js at launch, T-012), where ships is every ship of the rules.resolveMove end state; only the mover goes along the straight segment at constant speed, and at the end all of anim.ships is put in place, so the mover ends exactly on the rules result and a destroyed enemy stays destroyed; the gauge returns to the power phase); src/game.js press() launches on the second Space with rules.resolveMove, and step(ms) runs stepMove and, in the step where the animation ends, calls rules.endTurn once (section 6) (T-003, T-005); drawShips in src/render.js draws the ship where state puts it (no path, trail or end marker); animation length config.moveAnimMs (T-003)
- How a user reaches it: the second Space press
- How an agent drives it: unit test calling rules.applyMove(state, {distance, angle}); tests/game.test.js loads src/game.js in Node with a stubbed DOM and drives __game.press/step; verify.sh --feature movement
- Inputs: ship at (200, 480) heading 0°, move 150 units at 0°
- Correct output looks like: ship ends at (350, 480). A forward move turns the heading to the travel direction; a backward move keeps the heading.
- Known traps: degrees vs. radians; y-axis pointing down on canvas; allowing distance over 150; letting the animation, not rules.js, decide the final position
- Owner role: Owner

5. Hit Detection & Edges
- What it does: "If my path sweeps over the enemy, it explodes. If I reach the wall, I explode."
- Where it lives: src/rules.js resolveMove(state, move) (applyMove, then the convex hull of the mover's start and end triangles in its new heading, as input.startMove turns the ship before it moves; separating axis test against each living enemy, touching counts, except an enemy for which isSpawnProtected(state, j) is true, which survives the sweep (human decision 2026-11-09, A2; T-006); the mover is destroyed if any hull corner touches or crosses 0..config.worldWidth or 0..config.worldHeight, human decision 2026-11-09; a move over maxMove returns the state unchanged) and shipPoints(ship, size, width) (the one ship triangle, also drawn by render.js); tests in tests/hits.test.js (T-004) and tests/spawn.test.js (T-006). Called by src/game.js press() for every launched move (T-005). Score (T-012): src/rules.js scoreMove(before, after) counts resolveMove's result for the mover: +config.scoreKill per enemy destroyed, config.scoreWall when the mover dies at the wall, both for hit-then-wall, negative scores allowed (human decisions 2026-11-09); tests in tests/score.test.js; game.js computes it at launch and applies it when the move ends (section 6).
- How a user reaches it: automatically after every move
- How an agent drives it: unit tests calling rules.resolveMove(state, move); verify.sh --feature hits
- Inputs: ship A at (200, 480), enemy B at (300, 490), A moves 150 at 0°
- Correct output looks like: B is destroyed; A survives at (350, 480). Hit-then-wall destroys both. Grazing contact counts as a hit. An enemy that has not moved since it spawned and still sits on its spawn point survives (spawn protection, T-006); a protected mover that reaches the wall still dies. Score: A gets +1 for destroying B; a wall death gives the mover -2; hit-then-wall gives -1; sweeping a protected enemy scores nothing (T-012).
- Known traps: checking only the end position instead of the swept area; missing grazing contacts; tunneling through the enemy on long moves; checking the wall before the enemy
- Owner role: Reviewer owns the test cases; Owner owns the code

6. Respawn & Turns
- What it does: "When a ship is destroyed, a new one appears at its spawn point and play continues."
- Where it lives: src/rules.js endTurn(state) (pure: every ship with alive: false is replaced by config.spawns[i], read at call time, with alive: true and unmovedSinceSpawn: true; living ships unchanged; turn flips exactly once, also after a double kill; other fields kept); src/game.js step(ms) (turn manager: when the move animation ends it puts the resolved end state in place and calls endTurn once, so the next player starts on the power gauge; nothing else changes the turn, so there is no turn timer); tests in tests/turns.test.js and tests/game.test.js (T-005). A destroyed enemy stays drawn until the move ends and reappears at its spawn in the same step. In that same step, before endTurn, input.startExplosions adds one entry per destroyed ship to state.explosions (a hit enemy where it was hit; the wall-killed mover moved the shortest distance that puts its whole triangle inside the map), and input.stepExplosions ages them on every step and removes them at config.explosionMs. Explosions are decoration: play does not wait for them and they never change turn, ships or gauge (T-007, human answer 2026-11-09). Score (T-012): in that same step, before endTurn, game.js puts in the scores that rules.scoreMove computed when the move was launched (kept in anim.scores), so a score never changes before the player sees the hit; endTurn keeps scores unchanged.
- How a user reaches it: automatically after a destruction or the end of a move
- How an agent drives it: __game.setState() with a destroyed ship, then getState(); verify.sh --feature turns
- Inputs: Player 1 destroys Player 2's ship
- Correct output looks like: Player 2's ship reappears at its spawn point, it becomes Player 2's turn, the game never ends, and there is no turn timer
- Known traps: skipping a turn after a double kill; making spawn points attackable. Spawn protection is settled (human decision 2026-11-09, A2, T-006): a ship that has not moved since it spawned (createInitialState or endTurn respawn) and still sits on its spawn point cannot be destroyed by an enemy sweep; any accepted move of its own ends it, including a distance-0 launch (human decision 2026-11-09). No time limit and no other protection. Traps: a protection flag alone would survive a setState teleport (scripts/smoke.mjs turnsProbe copies ship 1 from getState()), so isSpawnProtected also checks the position; ships without the field (scenario states) are not protected.
- Owner role: Owner

7. Config
- What it does: "I can tune the game numbers in one place."
- Where it lives: src/config.js
- How a user reaches it: edit the file and reload
- How an agent drives it: grep for hard-coded numbers outside config.js; verify.sh --feature config
- Inputs: change max move from 150 to 200
- Correct output looks like: gauges, movement, and tests all use 200 with no other edits
- Known traps: magic numbers scattered across files; tests hard-coding values instead of reading config
- Owner role: Reviewer

8. Paved roads (one way to do each common job)
- New game rule: add a pure function to src/rules.js and its test file in tests/ using the rules.test.js pattern. No DOM or canvas code in rules.
- New drawn element: add a draw<Thing>(ctx, state) function in src/render.js. Read from state only, never change it.
- New control: add it in src/input.js and expose it through __game.press().
- Data access: no database or API in Prototype 1. All game state lives in one state object owned by src/game.js.
- Errors and logging: use src/log.js (log.info, log.warn, log.error), silent unless ?debug=1. No bare console.log.
- Tests: tests/<feature>.test.js with Node's built-in test runner (node --test). Copy the pattern from tests/rules.test.js.

9. Test harness contract (set 2026-11-07; changing it needs a brief)
- Files: scripts/run-scenario.mjs (rules scenarios), scripts/smoke.mjs (headless Chrome/Edge, no npm dependencies; set CHROME_PATH to choose a browser), scripts/serve.mjs (static server; npm run dev serves http://localhost:5173/index.html), scenarios/*.json (inputs), expected/*.json (correct output).
- scenarios/ and expected/ are the spec. The owner never edits them to make a check pass; a wrong expectation goes back to the coordinator as a new brief.
- Smoke checks save a screenshot next to their output in agent-team/evidence/T-###/ for the reviewer.
  - input also saves one screenshot per gauge phase (T-008): input-smoke-power.png (phase 'power'), input-smoke-direction.png (phase 'direction', backward false) and input-smoke-direction-backward.png (phase 'direction', backward true, after Shift). Each is taken in its own page, separate from the pages behind the checked results; smoke.mjs reads getState().gauge just before and after each capture and fails the run with an error naming the file if the phase or backward flag is wrong. input-smoke.png (after the launch) is still written.
- Every slice must keep guards green, so src/rules.js has to exist from slice 1 (it may start with just the functions below as they are built).
- Config: src/config.js has a default export of one plain, mutable object with at least worldWidth, worldHeight, shipSize, maxMove and spawns: [{x, y, heading}, {x, y, heading}]. Rules read it at call time, so a scenario can override values.
- State: { turn: 0 | 1, ships: [{x, y, heading, alive, unmovedSinceSpawn?}, {x, y, heading, alive, unmovedSinceSpawn?}], gauge, scores? }. unmovedSinceSpawn (T-006) is true from createInitialState or an endTurn respawn until the ship's own accepted move sets it to false; a ship without it is treated as false. scores (T-012): [p1, p2], set by createInitialState from config.scoreStart; a state without scores (scenario states, older test states) counts as both on config.scoreStart (rules.currentScores), so scenarios and expected/ are unaffected. Optional explosions: [{ ship, x, y, heading, elapsed }] (ship index, centre, heading, ms since it began; T-007), absent or [] when nothing is exploding; move animation in anim (section 4). Game units; heading in degrees, 0 = right (+x), 90 = down (+y), kept within 0 to 360.
- Move: { distance, angle, backward? }. angle is the world travel direction in degrees (same convention as heading).
- Rules (pure, return a new state, never mutate input; run-scenario.mjs freezes inputs to enforce this):
  - createInitialState(): builds { turn: 0, ships at config.spawns[i] with alive: true and unmovedSinceSpawn: true, gauge, scores: [scoreStart, scoreStart] } from config at call time (T-001). game.js uses it to start the game.
  - applyMove(state, move): moves ships[state.turn]; forward moves set heading to angle, backward moves keep it; sets the mover's unmovedSinceSpawn to false for any accepted move (distance 0 included); a move over maxMove returns the state unchanged.
  - resolveMove(state, move): applyMove plus swept-area hits and walls; destroyed ships get alive: false, except a spawn-protected enemy, which stays alive. No respawn, no turn change.
  - isSpawnProtected(state, i): true only if ships[i] is alive, has unmovedSinceSpawn === true and sits on config.spawns[i] (read at call time, within 1e-9). Used by resolveMove; T-010 draws it.
  - endTurn(state): respawns destroyed ships at config.spawns[i] with unmovedSinceSpawn: true (living ships unchanged) and passes the turn; scores are kept. game.js calls it after the move animation.
  - scoreMove(before, after) (T-012): new scores array for the move from before to after = resolveMove(before, move). Only the mover (before.turn) scores: config.scoreKill (1) per enemy that went from alive to destroyed, config.scoreWall (-2) if the mover was destroyed (the wall); hit-then-wall gets both (net -1); no clamping at 0. currentScores(state) returns state.scores or [scoreStart, scoreStart].
- Gauge (in getState().gauge): { phase: 'power' | 'direction' | 'moving', power: 0..1, needle: degrees relative to the ship's heading (0 = straight ahead), backward: boolean, distance }. distance = power × maxMove once locked.
- Debug API: getState() returns a copy; setState(state) accepts a modified copy; press() and real keydown events both work and keydown with repeat is ignored; step(ms) finishes the move animation and calls endTurn.
