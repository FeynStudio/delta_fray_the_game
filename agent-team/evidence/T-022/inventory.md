# T-022 inventory (written before any change to tests/, sim/ or scripts/)

BASE = 0155ba3b883270c2a08b770e8a815335dbafd576 (head of task/T-021-src-cleanup, "T-021: record human decision of 2026-11-11").
Branch commit afd564b adds only the brief; `git diff --stat 0155ba3 afd564b -- tests sim scripts src index.html` is empty.
All line numbers below are the line in each file at BASE.

## What was read
- tests/*.test.js (10 files), sim/balance.mjs, scripts/run-scenario.mjs, scripts/serve.mjs, scripts/smoke.mjs: every comment line and the code around it.
- scripts/verify.sh, scripts/guards.sh (in full, read only).
- agent-team/FEATURE_MAP.md (sections 8 and 9 in full; searched in full), agent-team/DECISIONS.md, agent-team/tasks/T-001..T-014, T-021, T-022, docs/*.md (searched for each fact listed below).
- agent-team/evidence/T-021/inventory.md and identical.txt (format).

## Method
- agent-team/evidence/T-022/strip-comments.mjs (one-off, comment-free) tokenises each file: it knows strings, template literals (with nested `${}`), regular expressions, `//` and `/* */` comments and the shebang. `list 0155ba3` wrote before-comment-list.txt: every comment at BASE, verbatim, with its line and class, plus every `//`, `/*` or `*/` that is not a comment.
- Cross-check against plain grep: `grep -nE '//|/\*|\*/' tests/*.js sim/*.mjs scripts/*.mjs src/*.js` at BASE prints 158 lines (before-comment-grep.txt). The tokeniser accounts for all of them: 153 comments to remove + 2 directive comments + 4 non-comment lines = 159 entries on 158 lines (scripts/smoke.mjs line 81 holds both a `ws://` template literal and a directive comment). No grep line is unexplained.

## Counts at BASE (owner re-count; equal to the coordinator's)
| File | Whole-line | Trailing | Directive kept | Not a comment |
|---|---|---|---|---|
| tests/config.test.js | 0 | 1 | 0 | 0 |
| tests/game.test.js | 14 | 10 | 0 | 0 |
| tests/hits.test.js | 20 | 1 | 0 | 0 |
| tests/input.test.js | 8 | 0 | 0 | 0 |
| tests/movement.test.js | 3 | 0 | 0 | 0 |
| tests/render.test.js | 23 | 3 | 0 | 0 |
| tests/rules.test.js | 2 | 0 | 0 | 0 |
| tests/score.test.js | 4 | 0 | 0 | 0 |
| tests/spawn.test.js | 12 | 0 | 0 | 0 |
| tests/turns.test.js | 3 | 0 | 0 | 0 |
| sim/balance.mjs | 7 | 4 | 0 | 0 |
| scripts/run-scenario.mjs | 10 | 0 | 1 | 0 |
| scripts/serve.mjs | 4 | 0 | 0 | 3 |
| scripts/smoke.mjs | 24 | 0 | 1 | 1 |
| Total | 134 | 19 | 2 | 4 |

- To remove: 134 + 19 = 153 comments. Expected diff: 134 deleted lines, 19 lines changed in place (19 deleted + 19 added in numstat), 172 changed lines.
- There is no `/* */` block comment in any of these files, and no comment spans more than one line.
- Template literal check (the brief's open point): none of the 134 whole-line `//` lines sits inside a template literal, string or regular expression. The tokeniser found only the 4 non-comment lines in the allowlist below, all of them single-line literals. tests/render.test.js has 38 backticks; all are single-line template literals.
- scripts/smoke.mjs "in-page probes" (lines 151 onward) are functions sent to the browser as source text. No comment sits inside any probe function body; the comments at lines 214 and 219 stand before the function declarations, so the text sent to the browser does not change.

## Allowlist: lines that still match `//|/\*|\*/` after this task (Done-when 3 and 6)
Not comments (inside a string or template literal), never changed:
- scripts/serve.mjs:26 `path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);` (string)
- scripts/serve.mjs:54 ``url: `http://${host}:${server.address().port}`,`` (template literal)
- scripts/serve.mjs:66 ``process.stdout.write(`Serving ${root} at http://localhost:${port}/index.html (Ctrl+C to stop)\n`);`` (template literal)
- scripts/smoke.mjs:81 ``if (port && path) finish(ok, `ws://127.0.0.1:${port}${path}`);`` (template literal; the same line ends with the directive below)

Directive comments, kept as they are (the only comment text on the line is the directive):
- scripts/run-scenario.mjs:57 `// nosemgrep: javascript.lang.security.insecure-object-assign.insecure-object-assign`
- scripts/smoke.mjs:81 `// nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket`

After the removal the line numbers move: serve.mjs 26, 54, 66 become 23, 50, 62; smoke.mjs 81 becomes 68; run-scenario.mjs 57 becomes 47 (old line minus the whole-line comments deleted above it).

No regular expression in these files holds `//`, `/*` or `*/`. src/*.js has no match at all (T-021).

Other file types (read-only checks at BASE, files not edited):
- `grep -nE '(^|[[:space:]])#' scripts/*.sh` prints only `scripts/guards.sh:1:#!/usr/bin/env bash` and `scripts/verify.sh:1:#!/usr/bin/env bash`.
- `grep -nE '<!--|/\*|//' index.html` prints nothing. `git ls-files '*.css'` prints nothing.
- Shebangs kept: line 1 of scripts/run-scenario.mjs, scripts/serve.mjs, scripts/smoke.mjs (`#!/usr/bin/env node`).

## Facts that live only in comments
Rule used (Owner choice): a comment is listed here when it gives a reason, a derivation, a usage line, a format or a cross-reference that I could not find in agent-team/FEATURE_MAP.md, agent-team/DECISIONS.md or a brief (searched with grep for its key words). A comment that only names the code right below it (section rulers such as `// ---------- main ----------`, "Loads ships and turn, then ...") or repeats a fact that is in one of those documents is not listed here. Every comment, listed or not, is kept verbatim in before-comment-list.txt, so nothing is lost.

### scripts/run-scenario.mjs (FEATURE_MAP section 9 names the file and says it freezes inputs; it has no usage line and no scenario format)
- 3: `// Usage: node scripts/run-scenario.mjs scenarios/<name>.json --out <file.json>` (not in section 9; the same call is visible in scripts/verify.sh)
- 5-6: `// Scenario format (see FEATURE_MAP.md, "Test harness contract"):` / `//   { "overrides": {config keys}, "cases": [ { "name", "state", "steps": [{ "call", "move"? }], "pick": ["ships.0.x", ...] } ] }` (the format is NOT in section 9, although the comment points there)
- 7: `// Each step calls rules[call](state, move) or rules[call](state) and must return the new state.`
- 9: `// Numbers are rounded to 3 decimals. Exit code 1 if anything could not run.` (the rounding is in briefs T-003 and T-004; the exit code is nowhere)
- 54-55: `// Reset config, then apply the scenario's and the case's overrides.` / `// Overrides come from scenario files checked into the repo, not from user input.` (a case may carry its own overrides; the second line is the reason the nosemgrep directive on line 57 is safe)
- Covered, not a new fact: line 8 (inputs deep-frozen: section 9 "Rules").

### scripts/serve.mjs (section 9: "static server; npm run dev serves http://localhost:5173/index.html")
- 3: `` // `npm run dev` serves the project at http://localhost:5173/index.html (set PORT to change). `` (the PORT variable is not in section 9)
- 32: `// Never serve dotfiles (.env, .git) or secrets/, and never leave the project folder.` (security rule of the static server; nowhere else)
- Covered: line 2 (static server, no build step), line 4 (smoke.mjs imports startServer(): brief T-008).

### scripts/smoke.mjs (section 9: headless Chrome/Edge, no npm dependencies, CHROME_PATH, screenshots)
- 2-3: `// Browser smoke check: serves the game, opens index.html?debug=1 in headless Chrome or Edge,` / `// drives window.__game and writes named PASS/FAIL booleans as JSON (compared to expected/<feature>-smoke.json).` (the output shape, named booleans, is not in section 9)
- 7: `// Usage: node scripts/smoke.mjs --feature render|input|turns --out <file.json>` (not in section 9; the same call is visible in scripts/verify.sh)
- 8: `// No npm dependencies: talks to the browser over the DevTools protocol with Node's built-in WebSocket.` (the built-in WebSocket part is nowhere else)
- 9: `// Set CHROME_PATH to pick a browser; otherwise Chrome, then Edge, is used.` (the order Chrome, then Edge is nowhere else)
- 65-67: `// Chrome prints "DevTools listening on <websocket url>" to stderr when it has a console. Started from a shell` / `// without one (e.g. an agent's shell on Windows), chrome.exe hands off to a detached browser and exits 0` / `// without printing it, so also read the DevToolsActivePort file the browser writes into the profile.` (the reason behind the smoke.mjs fix ef1704e; "DevToolsActivePort" appears in no document)
- 80: `// Local DevTools on 127.0.0.1 only speaks plain ws (no wss); nothing leaves the machine.` (the reason the nosemgrep directive on line 81 is safe)
- 134: `// Ask the browser itself to quit: proc may be only the launcher, which a detached browser outlives.`
- 140: `// The browser removes its profile lockfile as it exits; wait for that so the profile can be deleted.` (brief T-008 names the wait, not the reason)
- 151: `// ---------- in-page probes (run inside the browser, not in Node) ----------` (the functions below it are sent to the page as source text)
- Covered: lines 4-6 (screenshots per gauge phase: section 9), 214, 219, 265-266, 316 (brief T-008 and section 9), 121 and the rulers on 23, 261, 348 (name the code below).

### sim/balance.mjs (FEATURE_MAP does not mention the balance sim at all; `grep -n balance agent-team/FEATURE_MAP.md` prints nothing)
- 1: `// sim/balance.mjs — plays scripted games with the real rules; exits 1 if a balance target is missed.`
- 2: `// Usage: node sim/balance.mjs --games 2000 --out agent-team/evidence/T-001/balance.json` (the same call is visible in scripts/verify.sh)
- 5 and 47, the "Hooks" markers: `// ===== Hooks: connect your game here =====` / `// ===== End hooks =====` (they mark lines 6-46, the imports from src/, scriptedMove, playOne and measure, as the part that is tied to this game; the rest, lines 49-88, is the generic harness. Brief T-021 line 52 says only that the markers exist.)
- 10: `// Scripted player: aims roughly at the enemy within what the gauge allows (needle ±90°, or backward).`
- 14: `// -180..180 from the ship's heading` (trailing, on `let rel = ...`)
- 16: `// measured from the tail instead` (trailing, on `if (backward) rel = ...`)
- 19: `// the same move the real controls produce` (trailing, on `return moveFromGauge(...)`)
- 39: `// One number per metric for this game; names must match balance-targets.json.`
- 43: `// turns alternate, so moves per player` (trailing; why movesToFirstEncounter is `Math.ceil(firstHit.turn / 2)`)
- 54: `// Seeded random numbers, so the same code always gives the same result (no flaky CI).`

### tests/config.test.js
- 41: `// round-joined stroke reaches this far past each corner` (trailing, on `const m = config.shipLineWidth / 2;`)

### tests/game.test.js
- 18: `// every canvas call is a no-op` (trailing, on the Proxy ctx stub)
- 25: `// the loop is driven by step() in these tests` (trailing, on the requestAnimationFrame stub)
- 28: `// the state game.js starts with, before any test's setState (T-010)` (trailing)
- 202: `// ship 1 faces heading 180, so a forward move goes toward -x` (trailing)
- 356: `// P1 kills P2 (+1), P2 plain move, P1 dies at the wall (-2), P2 kills P1 (+1).`
- 373: `// ship 1 faces 180, a full forward move sweeps ship 0` (trailing)
- 417: `// the ships as they were before startMove turned the mover` (trailing)
- Covered: 1-3 (FEATURE_MAP section 4, stubbed DOM; section 9), 237-238 (brief T-005), 391-392 (T-014, DECISIONS), 242, 329, 428 (section rulers with task numbers).

### tests/hits.test.js
- 36-37: `// Mover heading 0 sweeps a band y = 480 +- shipWidth/2. An enemy (heading 0) shipWidth lower has its` / `// back corner exactly on the band's edge; moved 0.01 further down it no longer touches.`
- 45: `// End position's tip and the enemy's tip (facing back at it) meet exactly at one point.`
- 58: `// Sanity: the enemy is clear of both the start and the end triangle along x.`
- 112: `// Heading 0 at y = shipWidth/2: the back corner sits exactly on y = 0.`
- 122: `// Heading 180 moving at 0 (backward): the ship turns to heading 0, so the tip leads to the right wall.`
- 155: `// The brief's angled example: heading 30, angle 240; the enemy on the path is destroyed either way.`
- 201-203: `// Mover heading 0 turns to 90 and moves down (input.startMove turns it before it moves). The enemy's` / `// back edge sits 1 unit behind the old (heading 0) tip, so it overlaps the old start triangle, but the` / `// new swept area only reaches shipWidth/2 to the right of the centre: the enemy survives.`
- Covered: 1-3 (FEATURE_MAP sections 5 and 8), 137 (section 3: backward angle = heading + 180 + needle), 97, 101, 105, 140, 142, 144 (name the assertion below).

### tests/render.test.js
- 127-129: `// Deliberately pinned, not derived: these two values are the human's decisions of 2026-11-08` / `// (agent-team/DECISIONS.md): power gauge 50%, then 60% of that (0.5 x 0.6); direction gauge 70%,` / `// then 80% of that (0.7 x 0.8). Change them only with a new human decision.` (the decisions are in DECISIONS.md; that the test pins the two numbers on purpose, instead of reading config, is only here)
- 404-406: `// Respawn turn (T-010 review round 1): ship 1 was just destroyed, its explosion is running in the same` / `// colour, and the respawned ship 1 sits on its spawn, protected, blinking. Only that ship's outline is` / `// drawn below full opacity; the explosion pieces, the other ship, the scores, the map and the gauge are not.`
- 440: `// Order in drawFrame: map border, explosion pieces (ship 1 colour, alpha 1), ship 0, ship 1 (faded), gauge.`
- 527: `// Only the scores are other text, and they come before the title.`
- Covered: 68, 225, 284, 321, 450 (section rulers naming task and decision dates; the 400 ms blink decision is in DECISIONS.md and brief T-010, and brief T-015 was amended for the missing comment), 88, 213, 328, 359, 372, 411, 412, 420, 428, 451-452, 471-472 (name the code below).

### tests/spawn.test.js
- 30: `// Player 1's ship 110 units left of player 2's spawn, facing it: a max move sweeps over that spawn.`
- 61: `// Player 2 has just destroyed player 1 and sits 110 units right of player 1's spawn, facing it.`
- 110: `// Same move with the enemy unprotected: both die (FEATURE_MAP 5 hit-then-wall is unchanged).`
- Covered: 1-5 (FEATURE_MAP sections 5, 6, 9; DECISIONS 2026-11-09 A2), 24, 68, 71, 89 (name the code below).

### tests/input.test.js, tests/movement.test.js, tests/rules.test.js, tests/score.test.js, tests/turns.test.js
- No comment-only fact. Their headers restate the tests/rules.test.js pattern (FEATURE_MAP section 8; brief T-001: config restored afterEach, inputs frozen) and T-014 (DECISIONS); the others name the code below.

## Before evidence (on afd564b, code identical to BASE)
- `./scripts/verify.sh T-022 --feature all --label before`: `RESULT: PASS` (before-all.log). Outputs renamed to before-*.json / before-*.png.
- Unit tests: before-test-names.txt, 145 tests, 145 pass (written by test-names.sh).
- before-comment-list.txt (every comment, verbatim) and before-comment-grep.txt (the Done-when 6 grep at BASE, 158 lines).
