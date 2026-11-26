# Phase 2 draft — Feel and polish

Status: DRAFT (written by /triage via /plan-phase next, 2026-11-25). Not approved. Nothing here is a build go-ahead; the human approves the plan, adds the lines to BACKLOG.md and moves the "Current phase" line in ROADMAP.md.

Sources read: agent-team/design/DESIGN.md, docs/ARCHITECTURE.md, agent-team/ROADMAP.md, agent-team/design/IDEAS.md (no rows, so no accepted ideas), agent-team/DECISIONS.md (playtest answers P1 to P11 of 2026-11-19, lines 177-178; exit-gate decision of 2026-11-24, lines 212-213), agent-team/BACKLOG.md (Phase 2 lines at 134, 153, 154 and note (42j) at 129), src/config.js, src/render.js (COLORS). design-scout was not run (optional step).

Note on timing: the human's 2026-11-24 words were "continuing with the current design but still tightening up loose ends". Phase 1 briefs T-049 to T-054 are READY and unbuilt. Human answer, 2026-11-26: Phase 2 starts after the Phase 1 cleanup is finished.

## Goal
Make the hot-seat prototype easier to read and nicer to watch, using only the Phase 1 playtest notes and the DESIGN.md visual style, without changing any game rule or number in balance-targets.json.

## In scope
- Score readability: a label on each corner score and a short "+1" / "-2" cue when it changes (playtest answer P1).
- Turn readability: make it obvious whose turn it is before the gauge starts.
- Visual style from DESIGN.md: bright retro versions of the primary colors, solid lines, smooth sliding of the ship.
- Title and branding: "Prototype 1" title with version 1.0, and the FeynStudio splash screen (human requests of 2026-11-24).
- Feedback timing only where it is in config.js (gauge sweep times, explosion time), tuned by playtest, not by guess.

## Out of scope
- Networking, servers, accounts, currency, factions, payments (later phases).
- Any rule change: hit detection, edge deaths, respawn, spawn protection, scoring values, max move.
- Path preview, kill confirmation, dodging, map wraparound (ARCHITECTURE.md "Do NOT Add"; DESIGN.md "Decided, don't reopen").
- Fix for the turn-first rule results (a) and (b) (BACKLOG line 144): the human chose no fix in prototype 1 and kept "no fix" for Phase 2 (2026-11-26).
- Changes declined in playtest: per-ship blink clock (P3), first-time hint (P4), reduced-motion outline (P5), exact title centring (P6), backward-launch turn animation (P7), blink rate (P8 says 600 ms is right).

## Architecture changes (proposed for docs/ARCHITECTURE.md; the human edits it)
1. "Current Phase" section: replace "Prototype 1 only" with Phase 2 "Feel and polish", same Do-not-build list.
2. Tech Rules: allow static asset files (SVG images, maybe one CSS file) next to index.html. Why: the splash logos are SVG files, and scripts/serve.mjs serves only /index.html and .js under /src/ (BACKLOG (42j)). The serve.mjs allow-list change goes by route A (protected file, checks-change label).
3. Architecture Rules: name where non-game screens live (splash before the game loop). Proposal: a new src/splash.js that game.js calls before the first turn; no game state inside it. Why: keeps render.js for the play field and rules.js free of DOM.
4. Game Constants: all new timings and colors go in config.js (score cue time, splash fade time, turn cue time); COLORS moves from render.js to config.js so the color pass touches one file.

## Backlog lines (proposed; not added to BACKLOG.md)
1. Score label and change cue (P1): each corner score shows the label "P1" or "P2" in the ship's color and a "+1" or "-2" next to it for a set time after it changes. Done when: tests/score.test.js covers the cue start and end for a kill, a wall death and a hit-then-wall; a smoke screenshot during the cue and one after it are in evidence; design reviewer approves.
2. Turn cue: at the start of each turn the active ship is marked (for example a short pulse of its outline); the gauge starts at once, with no wait for the cue. Done when: a unit test pins the cue duration from config.js; smoke screenshots at turn start for both players; no change to rules.js; design reviewer approves.
3. Primary-color palette: ship colors, gauge and score use bright retro versions of the primary colors per DESIGN.md (not pure #ff0000 / #0000ff / #ffff00) (current ships are #4fd1ff and #ff6b6b); colors move to config.js. Done when: tests/render.test.js reads the colors from config; a contrast check (WCAG 3:1 against the background, for lines) passes in a unit test; before/after screenshots; design reviewer approves.
4. Smooth slide check: the ship's move animation (moveAnimMs 600) eases in and out instead of a linear slide, if the human's playtest asks for it. Done when: a unit test pins the position curve at 0, 50 and 100 percent; game state at the end of the move is unchanged (same scenario results in expected/); design reviewer approves.
5. Hit and death feedback: the explosion reads as the enemy's loss and the wall death reads as a self-loss (for example a short flash in the destroyed ship's color at the hit point). Done when: scenario results unchanged; smoke screenshots of a kill and a wall death mid-effect; tests/flash-rate.test.js still passes (no flashing above 3 per second); design reviewer approves.
6. Gauge feel: playtest-led tuning of gaugePowerSweepMs (2000) and gaugeNeedleSweepMs (3000) only if the second playtest asks for it; otherwise closed with no change. Done when: the human's playtest note names a target; config.test.js pins the new values; balance simulation still passes.
7. Play screen title: "Delta Fray" plus "Prototype 1", with "1.0" on a second, smaller line (human request 2026-11-24, BACKLOG line 154). Done when: version text comes from config.js; smoke screenshot; the direction dial stays readable under the title (P9 check repeated); design reviewer approves.
8. Static assets in serve.mjs (route A): widen the scripts/serve.mjs allow-list to named SVG files (and only those) so the splash logos load. Done when: tests/serve.test.js has a 200 case for each allowed SVG and a 404 case for an SVG outside the list and for a link to a file outside the root; security review passes; the human copies the files in.
9. FeynStudio splash (human request 2026-11-24, BACKLOG line 153; depends on line 8): adapt the workspace feyn-splash/ folder; shown on every page load; black screen, logo fades out, then the game starts; any key skips it. Done when: a unit test covers skip and the end of the fade; smoke screenshots at start, mid-fade and game start; no comments in the copied code (guards pass); design reviewer approves.
10. Second playtest kit: a one-page checklist in agent-team/ for the human's second playtest (what to look at for lines 1 to 7, questions with yes/no answers). Done when: the checklist lists one question per shipped line and the human has the file before the playtest.

## Risks and open questions for the human
Questions 1 to 6 answered by the human, 2026-11-26 (also in DECISIONS.md):
1. Start time: after the Phase 1 cleanup.
2. Colors: bright retro versions of the primary colors.
3. Turn cue: no wait before the gauge starts.
4. Turn-first rule results (a) and (b): keep "no fix".
5. Splash: shown on every page load.
6. Score label: "P1" and "P2".
7. Risk: the splash and serve.mjs change touch protected files (route A), so they wait for the human's copy-in and checks-change label.
8. Risk: visual changes make the byte-identical screenshot checks in verify.sh change; each brief must say which expected screenshots are regenerated.

## Exit gate (proposed)
- [ ] verify.sh and guards.sh pass on master
- [ ] Balance targets in balance-targets.json still pass, unchanged (no rule or number change)
- [ ] Scenario results in expected/ unchanged by every Phase 2 brief
- [ ] tests/flash-rate.test.js passes (no effect flashes faster than 3 per second)
- [ ] Design reviewer approves every player-facing change (ROADMAP gate 1)
- [ ] Human playtest with the checklist from line 10: score, turn, colors and feedback each judged "better" or "same"; none "worse" (ROADMAP gate 2)

## Design review

design-reviewer, 2026-11-25, on this draft as written above (line numbers are lines of this file). Human answer, 2026-11-26: none of these points go in the draft; kept here for the record only.

1. Should-fix: line 37 (Hit and death feedback) and exit-gate line 58. tests/flash-rate.test.js only checks protectionBlinkMs and protectionMinAlpha, so it cannot catch a new flash or the turn-cue pulse in line 34. Fix: require a new test that limits every new flash or pulse effect to 3 per second.
2. Should-fix: line 37 against P2 (DECISIONS line 177: "this is ok for prototype 1. no change needed"). The wall-death half changes something the human just kept. Fix: add P2 to the declined list in line 24, or ask the human under Risks before the wall-death part is briefed.
3. Should-fix: line 35 (palette). A 3:1 check covers lines only. Score numbers, "P1"/"P2" labels, the "+1"/"-2" cue and the title are text and need 4.5:1. Colorblind players are not covered. Fix: add a 4.5:1 test for every text color and a check that the two ship colors stay distinguishable under protanopia, deuteranopia and tritanopia.
4. Should-fix: line 33 (score cue). The result of a hit-then-wall is undefined ("+1" and "-2", or a net "-1"), and so is a second change while a cue is still up. Fix: define both cases in the line and test them.
5. Should-fix: line 34 (turn cue). Space is also the power-lock key; ending the cue with Space could lock power by accident or double-fire. Fix: a Space press during the cue only ends the cue, with a unit test.
6. Should-fix: line 41 (splash). "Any key skips it" does not say whether that key press carries into the first turn's gauge. Fix: the skip key is consumed; test that the first gauge starts unlocked.
7. Should-fix: line 42 against line 60. The checklist asks yes/no questions, but the exit gate needs "better", "same" or "worse". Fix: make the checklist questions use better/same/worse.
8. Should-fix: line 38 (and line 36) against the exit gate. Line 38 tunes the gauge only if the second playtest asks for it, yet that playtest is also the final gate, so later changes would never be playtested. Fix: plan a re-check after any tuning, or drop lines 36 and 38 from this phase.
9. Nit: line 10 (Goal) says "using only the Phase 1 playtest notes", but the turn cue, title and splash do not come from the playtest. Fix: "playtest notes, ROADMAP Phase 2 scope and the human's requests of 2026-11-24".
10. Nit: line 28. "Maybe one CSS file" is open-ended, while line 40 allows SVGs only. Fix: drop CSS, or list it in line 40.
11. Nit: line 22 against line 37. The new hit feedback could be mistaken for the banned "kill confirmation". Fix: state that hit feedback appears only after launch, never before it.
12. Nit: ROADMAP Phase 2 scope covers "gauge speed and readability", but no line covers gauge readability. Fix: add an item, or record that P10 and P11 ("its fine") cover it.

Reviewer's note: the draft quotes DECISIONS lines 177-178 and BACKLOG lines 134, 153 and 154 correctly; nothing reopens a "Decided, don't reopen" or "Do NOT Add" item.
