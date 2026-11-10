Decided by human in session, 2026-11-07: "stack difference should not be a problem. the agents.md stack calls for typescript, react, and etc as it is the stack plan for the actual/live product-a game. however, for our starting point of building prototype 1, only javascript web browser app is needed as a first small step."

Decided by human in session, 2026-11-08: "the mock screen's size looks right. make the ship triangle narrower and no shades with just the outline."

Decided by human in session, 2026-11-08: "field render looks good."

Decided by human in session, 2026-11-08: "T-002 build the whole sequence"

Decided by human in session, 2026-11-08: "dark blue wording is very hard to see, switch to a different color"

Decided by human in session, 2026-11-08: "see the power guage and direction selection on localhost. however, it does not distinguish who's turn it is. scale power gauge to 50% and have it show right below the ship itself. scale directional guage to 70% and show it right before the ship along its long axis. in addition, clicking shift makes the move goes backwards and show it right behind the ship along its long axis. so that the guages for power and direction follows where the ship goes."

Decided by human in session, 2026-11-08: "checked localhost and i do see the updates, however, scale power guage to 60% of its current size and move it away from the ship body for a bit so that it does not jump down when the directional guage displays. scale directional guage to 80% of its current size."

Decided by human in session, 2026-11-08: "confirm all changes and looks good."

Decided by human in session, 2026-11-08: "accept 1 and 2."
Context: answers the main session's two questions after review round 1: (1) accept the human's own browser check plus unit tests in place of a screenshot showing the gauges for Done-when 5; (2) keep T-002 as one task at about 529 changed lines.

Decided by human in session, 2026-11-08: "refuse the move and leave ship where it is."
Context: answers the coordinator's question about a move longer than maxMove (refuse vs. shorten to maxMove).

Decided by human in session, 2026-11-09: "Build T-004 now (Recommended)"
Context: the human was asked whether the team should build and review T-004 (hits) in this run, since T-005 (turns) can only start after T-004 is merged.

Decided by human in session, 2026-11-09: "Any part (Recommended)"
Context: the wall rule. The question was whether a ship dies when ANY part of its swept triangle touches or crosses the map edge, or only when its CENTER reaches the edge.

Decided by human in session, 2026-11-09: "do not build anything yet."
Context: applies to T-006..T-012. Briefs only; no build, branch or worktree until the human says to build.

Decided by human in session, 2026-11-09: "answer to T-006 is A2 as no destroy if the ship hasn't moved since it spawned."
Context: answers T-006's question (option A2). Conflicts with "Spawn protection" in docs/DESIGN.md "Do NOT Add" and docs/PLAN.md "Deferred Decisions"; docs update left to the human (see BACKLOG).

Decided by human in session, 2026-11-09: "asnswer to T-007 is play does not wait for explosion; explosion look like triangle line breaking in uneven pieces and falls outward from ship's location and scale down 50% over 1 second; ship dies at wall's explosion appear inside the map."
Context: answers T-007's three questions (waiting, look and length, wall position).

Decided by human in session, 2026-11-09: "add T-009 as ship moving backwards should flip the ship image so the tip of triangle heads backwards during motion."
Context: new request, briefed as T-009.

Decided by human in session, 2026-11-09: "add T-010 as ship outline gradually disapear but maintain in loop in quick sucsessions to simulate spawn protection animation."
Context: new request, briefed as T-010 (DRAFT; blink timing and fade questions open).

Decided by human in session, 2026-11-09: "add T=011 as adding a retro game name wording on middle top of page as decal. the retro name decal is on top of all game mechanism so ship movement will not be impacted."
Context: new request, briefed as T-011 ("T=011" as typed means T-011; DRAFT, title text open).

Decided by human in session, 2026-11-09: "add T-012 as adding a score count for each ship in the corner to keep track of amount of enemy ships destroyed. destroying 1 enemy ship plus 1 score. hitting wall and die minus 2 points."
Context: new request, briefed as T-012 (DRAFT; start value, negatives, corners and hit-then-wall open).

Decided by human in session, 2026-11-09: "400ms"
Context: answers question 1, T-010 blink cycle length (how long one fade cycle lasts).

Decided by human in session, 2026-11-09: "fade to invisible"
Context: answers question 2, T-010 fade depth (fade to fully invisible, or to a faint outline).

Decided by human in session, 2026-11-09: "fade out then snap back"
Context: answers question 3, T-010 loop shape (fade out then snap back to full, or a smooth fade out and in).

Decided by human in session, 2026-11-09: "Delta Fray"
Context: answers question 4, T-011 title text (the exact words the decal shows).

Decided by human in session, 2026-11-09: "0"
Context: answers question 5, T-012 starting score for both players.

Decided by human in session, 2026-11-09: "yes"
Context: answers question 6, T-012 whether a score can go below 0 (for example a wall death at 0 gives -2).

Decided by human in session, 2026-11-09: "player 1 is top-left; player 2 is top-right; each in its ship colour"
Context: answers question 7, T-012 which corners show the scores.

Decided by human in session, 2026-11-09: "yes"
Context: answers question 8, T-012 hit-then-wall in one move: whether both +1 and -2 apply (net -1).

Decided by human in session, 2026-11-09: "ship point along the path when aim at an angle; game mechanism should flip the ship model first along the aim angle, then proceed as a forward movement"
Context: answers question 9, T-009: (a) whether the drawn tip sticking out about 10 units past the hit area is OK, and (b) whether the tip points straight back or along the path when the aim is angled. Changes T-009 from a render-only flip to a rules change (T-009 back to DRAFT, see its open question).

Decided by human in session, 2026-11-09: "yes"
Context: answers question 10, T-006: whether a zero-distance move ends spawn protection.

Decided by human in session, 2026-11-09: "do not consider prototype 2 yet"
Context: answers question 11, Prototype 2 timing and stack (BACKLOG question closed for now).

Decided by human in session, 2026-11-09: "keep the new heading just like a forward move with updated direction."
Context: answers T-009 Q-A: after a backward move ends, does the ship keep its new heading (option 1, needs a separate brief changing expected/movement.json that the human approves) or turn back to its original heading (option 2). Option 1 chosen: T-009 READY (on hold); the expected/movement.json change is briefed as T-013, whose exact diff still needs the human's approval.

Decided by human in session, 2026-11-09: "sending the gauge back to the power phase without moving the ship."
Context: answers the T-003 step(ms) recovery question: when step(ms) finds the game in phase 'moving' with no `anim`, what should happen. Briefed as T-014 (READY, on hold).

Decided by human in session, 2026-11-09: "release briefs hold but don't start building"
Context: lifts the "do not build anything yet." hold (2026-11-09) on briefs T-006, T-007, T-009, T-010, T-011, T-012, T-013 and T-014 (T-008 never carried a hold line). No build was started; each brief's Depends on lines and approval gates (T-013's exact diff) still apply.

Decided by human in session, 2026-11-09: "Yes, go ahead (Recommended)"
Context: answers "Was your /night-shift run the go-ahead to build T-006 and the next READY briefs?" (asked after T-006 review round 1 found no recorded go-ahead). Go-ahead for the night-shift run: T-006, then T-007 and T-008, oldest first, one at a time.

Decided by human in session, 2026-11-10: "T-012, T-013, T-014 (Recommended)"
Context: answers "Go-ahead for tonight's night-shift build: which 3 READY briefs should I build?" (options: T-012, T-013, T-014; T-009, T-010, T-011; don't build tonight). Go-ahead for this night-shift run: T-012, then T-013, then T-014, one at a time. T-013 still stops BLOCKED for the human's approval of the exact expected/movement.json diff; that approval is not given by this answer.

Decided by human in session, 2026-11-10: "approve T-013 spec change"
Context: approves the exact diff on branch task/T-013-backward-heading-spec, as shown to the human: expected/movement.json, case "backward move keeps the heading", "ships.0.heading": 0 to 180 (x 100 and y 480 unchanged). Clears the Approval gate; T-009 may now be built from this branch. Merge T-013 then T-009 back to back.

Decided by human in session, 2026-11-10: "start work on T-009"
Context: the human ran /run-task with "start work on T-009" after approving the exact T-013 diff (ccf20b7). Go-ahead to build T-009 on branch task/T-009-backward-turn, created from ccf20b7. Not a merge or push approval.

Decided by human in session, 2026-11-10: "Fix branch, you merge (Recommended)"
Context: answers "Master has committed conflict markers in tests/game.test.js, FEATURE_MAP.md and REPEATS.md, and its tests don't run. How should I fix it before T-009 is reviewed?" The coordinator resolves them on branch fix/master-conflict-markers (keeping both sides) and the human merges it; then master is merged into task/T-009-backward-turn before T-009 review.

Decided by human in session, 2026-11-10: "Build both, T-011 on T-010 (Recommended)"
Context: answers "Go-ahead for tonight's night shift: build T-010 (protection blink) then T-011 (title decal)? Both edit src/render.js. How should T-011 be based?" Go-ahead for this night-shift run: T-010 branches from master; T-011 branches from T-010's reviewed head so it already contains T-010 (no render.js conflict); the human merges T-010 first, then T-011. Not a merge or push approval.
