# T-021 inventory (read before any src/ change)

Source read at 426a82f (branch commit 06b2701 adds only the brief; `git diff --stat 426a82f -- src/` is empty).
Line numbers below are the line in each file at 426a82f.

## What was read
- src/config.js, src/log.js, src/rules.js, src/input.js, src/render.js, src/game.js (every line), index.html
- docs/ARCHITECTURE.md, docs/PLAN.md, agent-team/FEATURE_MAP.md, agent-team/design/DESIGN.md, agent-team/design/balance-targets.json
- agent-team/ROADMAP.md (main checkout, read only), agent-team/DECISIONS.md, agent-team/BACKLOG.md
- agent-team/tasks/T-001..T-014 (status lines; searched in full for every comment fact listed below), T-021 (in full)
- scripts/verify.sh, scripts/guards.sh (in full); scripts/run-scenario.mjs, scripts/smoke.mjs, scripts/serve.mjs (imports and how they load src/)
- sim/balance.mjs (in full); tests/*.test.js (imports; searched for anything that reads src/ as text or changes COLORS: none)

## What is built (short)
Phase 1 hot-seat prototype, plain ES modules, no build step. game.js owns one state object and a requestAnimationFrame loop;
input.js holds the pure gauge, move-animation and explosion steps; rules.js holds the pure rules (move, swept-hull hits, walls,
spawn protection, score, respawn and turn); render.js draws everything in game units; config.js holds every tunable number;
log.js is the logger, silent without ?debug=1. T-001..T-014 are merged. Roadmap phase 1 exit-gate items 3 and 4 (playtest,
decision) are the human's and are not touched here.

## Functions and the FEATURE_MAP section that covers each

### src/config.js
- default export `config` (plain mutable object): section 7 (Config), contract in section 9. Gauge keys: section 3. Explosion keys: sections 2 and 6. Score keys: sections 2, 5, 9. Protection blink keys: section 2. Title keys: section 2. spawns: sections 6, 9.

### src/log.js
- `log` / default export (info, warn, error; silent unless ?debug=1): section 8 (Errors and logging). `emit` and `enabled` are internal.

### src/rules.js
- createInitialState: section 9 (Rules), sections 6 and 8 (only definition of the default gauge)
- currentScores, scoreMove: sections 5 and 9 (T-012)
- wrapDegrees, applyMove: sections 4 and 9
- shipPoints: sections 2 and 5
- isSpawnProtected (and the internal TOUCH = 1e-9): sections 5, 6, 9
- convexHull, polygonsOverlap (internal): section 5 ("convex hull ... separating axis test ... touching counts")
- resolveMove: sections 5 and 9
- endTurn: sections 6 and 9

### src/input.js
- bounce, stepGauge, pressKey, keyFromEvent: section 3
- moveFromGauge, pointAlong, startMove, stepMove (and the internal withShip): section 4 (stepMove's reset of a moving phase without anim: sections 3 and 4, T-014)
- insideMap, startExplosions, stepExplosions: section 6 (T-007)

### src/render.js
- COLORS, fitScale, fitCanvas, drawMap, shipPoints (re-export), drawFrame: section 2
- protectionAlpha, drawShips: section 2 (T-010)
- gaugeLayout, drawPowerBar, drawDirectionDial, drawGauge (and the internal clamp, rad): section 3
- explosionPieces, drawExplosions: section 2 (T-007)
- drawScores: section 2 (T-012)
- drawTitle: section 2 (T-011)

### src/game.js (no exports; needs a DOM)
- fit, loop, the keydown and resize listeners: sections 2 and 3
- press: sections 3, 4, 5 (launch through rules.resolveMove, scores kept in anim.scores)
- step: sections 4, 6, 9 (clock, move end, explosions, scores, endTurn once)
- window.__game (getState, setState, press, step): sections 1 and 9

## Comments holding information not found in FEATURE_MAP, DECISIONS.md or a brief
Checked by searching FEATURE_MAP.md, DECISIONS.md, docs/ and tasks/T-001..T-014 for each fact. Everything else in the comments
(decision citations, task IDs, behavior descriptions) is already in those files. These are kept here and in the Handoff.

- config.js:13 `// power reading 0 -> 1 (then back) takes this long` (gaugePowerSweepMs is the time for one 0 -> 1 pass, not a full there-and-back cycle. T-002 gives only the value.)
- config.js:14 `// needle crosses its whole range (-max -> +max) in this long` (same point for gaugeNeedleSweepMs.)
- config.js:33 `// each side (tip-left, left-right, right-tip) is cut once at this fraction` (the order of the three explosionCuts entries. FEATURE_MAP says "each side cut once" but not which entry is which side.)
- rules.js:93 `// Convex hull of points (monotone chain), counter-clockwise in screen axes, collinear points dropped.` (algorithm name, winding and the dropping of collinear points.)
- input.js:23-24 `// Moves value by delta along a line that bounces between min and max (a triangle wave).` / `// Returns the new value and the direction it is now moving in.` (FEATURE_MAP says the readings "bounce back and forth" but does not describe the bounce function or its return value.)
- input.js:80 `// Point at fraction t of the straight segment from -> to. t is clamped to 0..1, so it never overshoots.` (T-003 says it never overshoots; the clamp of t is only here.)
- render.js:9-10 `// All drawing colours in one place. Lines must stay readable on the near-black background:` / `// the light grey 'dim' (map border, inactive gauge parts) has about 8:1 contrast against it.` (the 8:1 figure.)
- render.js:22 `// Sizes and centers the canvas to fit the window; backing store uses devicePixelRatio for sharpness.` (T-001 asks for "sharp on a 2x screen"; that the backing store is scaled by dpr is only here.)
- render.js:70 `// keeps the stroke within lineWidth / 2 of each corner` (why drawShips sets lineJoin = 'round'. T-011 mentions lineJoin for the title only.)
- render.js:114 `// The nose is the ship point farthest from its centre, so a forward dial reaches farthest.` (why dialReach is measured from pts[0]. T-002 states the result, not this reason.)

Not unique, but worth noting because the code does not say it by itself: input.js:113 (`a.ships ?? rest.ships` fallback for an anim
without ships) is recorded in T-005; game.js:53 (preventDefault on Space stops page scrolling) is recorded in T-002.

## Comment count at 426a82f
- Whole-line comments: config 15, game 12, input 40, log 1, render 37, rules 41 = 146 lines (deleted).
- Lines with a trailing comment: config 27, game 1, input 1, render 6, rules 3 = 38 lines (each counts as 1 added + 1 deleted).
- Comment removal alone is about 146 + 76 = 222 changed lines, plus a few blank lines left double. About 170 lines remain for optimizations.

## Planned optimizations (each must leave every before/after output byte-identical)
1. rules.js polygonsOverlap: replace the `project` closure, the two arrays per edge and the spread Math.max/Math.min calls with one loop that keeps min and max through two-argument Math.min/Math.max. Reason: no allocation in the hot path of every move (and of the 2000-game balance run). Two-argument Math.min/Math.max give the same value as the spread form, also for NaN and for an empty polygon (-Infinity / Infinity). The projection expression `v.x * nx + v.y * ny` is kept as written, so no arithmetic is reordered.
2. rules.js polygonsOverlap: compute the edge vector (q - p) once per edge instead of three times. Reason: same values, less repeated arithmetic. The expressions `-(dy) / len` and `(dx) / len` stay in the same form.
3. render.js: remove the SHIP_COLORS and GAUGE_DIM aliases and read COLORS directly through one small internal helper `shipColor(i)`. Reason: the same lookup was written out four times, and the aliases are redundant. Note: the aliases captured COLORS.ships and COLORS.dim when the module loaded, the new code reads them at call time (as drawMap and drawTitle already do). Nothing in src/, tests/, scripts/ or sim/ reassigns COLORS, so no output changes.
4. render.js drawGauge: compute gaugeLayout(state) once per frame instead of twice in the direction phase. drawPowerBar(ctx, state) and drawDirectionDial(ctx, state) keep their exported signatures and still compute the layout themselves when called directly; the drawing moves into two internal helpers that take the layout part. Reason: gaugeLayout is pure, so one call gives the same bar and dial.
5. render.js drawPowerBar: use the existing `clamp` helper for the 0..1 fill fraction, and compute the active/dim colour once instead of twice. Reason: duplicate expressions. clamp(power, 0, 1) is Math.min(Math.max(power, 0), Math.max(0, 1)), the same value.
6. render.js drawShips: drop the one-use `blinking` variable. Reason: simpler; same call order is not needed (isSpawnProtected is pure and ctx is not touched before it).
7. game.js press: build the launched state in one statement instead of two assignments. Reason: small duplication. Same object, same key order.
8. input.js stepMove: one internal helper for "drop anim and reset the gauge" used by both branches. Reason: the two branches repeat the same destructuring and the same createInitialState().gauge (which stays the only definition of the default gauge). Key order of the returned state is kept so the JSON outputs stay identical.

Considered and not planned (would change an exported name, a signature, the state shape, or risk the last bits of a number):
- Exporting a shared clamp or a shared debug flag (log.js `enabled` and game.js both parse ?debug): new exports.
- Sharing the forward vector between shipPoints and gaugeLayout: changes the shipPoints return value.
- Rewriting insideMap, bounce, stepGauge, shipPoints or explosionPieces arithmetic: no clear gain and any reordering could change the last bits.

## Extra check added by the owner
agent-team/evidence/T-021/trace.mjs calls every exported function of rules.js, input.js and render.js on seeded inputs
(4000 resolved moves with scoreMove, endTurn, isSpawnProtected and insideMap; a 3000-step input run; 600 recorded frames where
every canvas call and property set of drawFrame, drawPowerBar, drawDirectionDial, drawGauge, drawShips, drawExplosions and
drawScores is logged through a stub context) and writes one JSON file. The file is 6.8 MB, so only its SHA-256 is committed:
before-trace.sha256 = 955143540de3669453949273a78c28cfd99d3535ba2f1b715bfff9b0fa0853f0. The after run must give the same hash.
