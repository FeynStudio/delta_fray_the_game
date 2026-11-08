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
- Where it lives: src/render.js, src/config.js
- How a user reaches it: open index.html through a local server (e.g., npx serve .)
- How an agent drives it: ?debug=1, then __game.getState(); screenshot the canvas; verify.sh --feature render
- Inputs: world 1280 × 960 units, browser window 1920 × 1080
- Correct output looks like: world scaled to fit with aspect ratio kept; ships are 30-unit triangles at their spawn points, pointing at each other; no scrollbars
- Known traps: mixing screen pixels with game units; stretching the map at other aspect ratios; blurry canvas on high-DPI screens
- Owner role: Owner

3. Controls & Gauges
- What it does: "I press Space to set distance, Shift to flip backward, Space again to launch."
- Where it lives: src/input.js (pure: stepGauge(state, ms), pressKey(state, 'Space' | 'Shift'), keyFromEvent(event)); keydown listener, animation loop and debug API in src/game.js; drawGauge / drawPowerBar / drawDirectionDial in src/render.js (panel at the bottom center of the map); sweep speeds, needle range and gauge layout in src/config.js (gauge*) (T-002)
- Gauge state notes (T-002): the gauge also carries sweep: 1 | -1 (direction the active reading moves in), so a gauge edited through setState keeps sweeping smoothly. Both readings bounce back and forth. needle stays within -gaugeNeedleMax..+gaugeNeedleMax, positive = clockwise; backward: false measures it from the nose (world angle = heading + needle), backward: true from the tail (world angle = heading + 180 + needle). Shift toggles backward in the direction phase only. step(ms) only advances the gauge for now; in the moving phase it does nothing until the movement slice.
- How a user reaches it: keyboard during their turn
- How an agent drives it: __game.press('Space'), __game.step(ms), __game.press('Shift'), __game.press('Space'), then check getState().gauge; verify.sh --feature input
- Inputs: Space at a 60% power reading; no Shift; Space at a 30° needle reading
- Correct output looks like: distance locked at 90 units (60% of 150), direction 30° forward, launch starts immediately with no confirm step
- Known traps: key-repeat registering multiple presses; Shift working after the direction is locked; gauges sweeping too fast for careful aim; adding a path preview (not allowed)
- Owner role: Owner

4. Movement
- What it does: "My ship flies the distance and direction I chose."
- Where it lives: src/rules.js (math), animation in src/render.js
- How a user reaches it: the second Space press
- How an agent drives it: unit test calling rules.applyMove(state, {distance, angle}); verify.sh --feature movement
- Inputs: ship at (200, 480) heading 0°, move 150 units at 0°
- Correct output looks like: ship ends at (350, 480). A forward move turns the heading to the travel direction; a backward move keeps the heading.
- Known traps: degrees vs. radians; y-axis pointing down on canvas; allowing distance over 150; letting the animation, not rules.js, decide the final position
- Owner role: Owner

5. Hit Detection & Edges
- What it does: "If my path sweeps over the enemy, it explodes. If I reach the wall, I explode."
- Where it lives: src/rules.js
- How a user reaches it: automatically after every move
- How an agent drives it: unit tests calling rules.resolveMove(state, move); verify.sh --feature hits
- Inputs: ship A at (200, 480), enemy B at (300, 490), A moves 150 at 0°
- Correct output looks like: B is destroyed; A survives at (350, 480). Hit-then-wall destroys both. Grazing contact counts as a hit.
- Known traps: checking only the end position instead of the swept area; missing grazing contacts; tunneling through the enemy on long moves; checking the wall before the enemy
- Owner role: Reviewer owns the test cases; Owner owns the code

6. Respawn & Turns
- What it does: "When a ship is destroyed, a new one appears at its spawn point and play continues."
- Where it lives: src/rules.js (respawn), src/game.js (turn manager)
- How a user reaches it: automatically after a destruction or the end of a move
- How an agent drives it: __game.setState() with a destroyed ship, then getState(); verify.sh --feature turns
- Inputs: Player 1 destroys Player 2's ship
- Correct output looks like: Player 2's ship reappears at its spawn point, it becomes Player 2's turn, the game never ends, and there is no turn timer
- Known traps: skipping a turn after a double kill; making spawn points attackable; adding spawn protection (deferred)
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
- Every slice must keep guards green, so src/rules.js has to exist from slice 1 (it may start with just the functions below as they are built).
- Config: src/config.js has a default export of one plain, mutable object with at least worldWidth, worldHeight, shipSize, maxMove and spawns: [{x, y, heading}, {x, y, heading}]. Rules read it at call time, so a scenario can override values.
- State: { turn: 0 | 1, ships: [{x, y, heading, alive}, {x, y, heading, alive}], gauge }. Game units; heading in degrees, 0 = right (+x), 90 = down (+y), kept within 0 to 360.
- Move: { distance, angle, backward? }. angle is the world travel direction in degrees (same convention as heading).
- Rules (pure, return a new state, never mutate input; run-scenario.mjs freezes inputs to enforce this):
  - createInitialState(): builds { turn: 0, ships at config.spawns[i] with alive: true, gauge } from config at call time (T-001). game.js uses it to start the game.
  - applyMove(state, move): moves ships[state.turn]; forward moves set heading to angle, backward moves keep it.
  - resolveMove(state, move): applyMove plus swept-area hits and walls; destroyed ships get alive: false. No respawn, no turn change.
  - endTurn(state): respawns destroyed ships at config.spawns[i] and passes the turn. game.js calls it after the move animation.
- Gauge (in getState().gauge): { phase: 'power' | 'direction' | 'moving', power: 0..1, needle: degrees relative to the ship's heading (0 = straight ahead), backward: boolean, distance }. distance = power × maxMove once locked.
- Debug API: getState() returns a copy; setState(state) accepts a modified copy; press() and real keydown events both work and keydown with repeat is ignored; step(ms) finishes the move animation and calls endTurn.
