Feature Map - product-a (Galaxy Shooter - Prototype 1)
Roles: Coordinator, Owner, Reviewer.

1. Agent test hook (applies to all features)
The game draws on a canvas, so agents can't click elements. src/game.js exposes a debug API when the URL has ?debug=1:
- window.__game.getState(): ships, positions, headings, turn, gauge state
- window.__game.press('Space' | 'Shift'): simulates input
- window.__game.setState(state): loads a test scenario
- window.__game.step(ms): advances the game clock
Command-line checks: ./verify.sh --feature <name> runs that feature's unit tests (node --test tests/<name>.test.js) and a browser smoke check.

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
- Where it lives: src/input.js, gauge drawing in src/render.js
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