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

Decided by human in session, 2026-11-10: "1. blink is working but make it slower by 1/3 of the speed, 2. title is good but make it 50% larger, 3. explain what is needed, 4. confirm, 5. confirm, 6. confirm, 7. confirm, 8. confirm"
Context: answers the product-a outstanding-items review of 2026-11-10. 1: the T-010 blink is accepted on screen; its speed drops by a third, so the cycle goes from 400 ms to 600 ms (2.5 to about 1.67 cycles a second; coordinator's reading of "slower by 1/3 of the speed", fade to invisible and snap back unchanged). 2: the T-011 title is accepted; it becomes 50% larger (font size 48 to 72). 3: the human asks for an explanation of the scenario-rename spec change; nothing is built for it. 4 to 8: go-ahead to write briefs for the guard items: (4) stale-handoff check in verify.sh, (5) smoke capture of a backward launch and an explosion, (6) guards.sh fails on conflict markers, (7) flash-rate test (blink at most 3 flashes a second), (8) negative-score smoke check. Not a merge or push approval.

Decided by human in session, 2026-11-10: "1. confirm, 2. confirm, 3. fixed"
Context: 1 confirms the coordinator's reading of "slower by 1/3 of the speed" as a 600 ms blink cycle (was 400 ms). 2 confirms the title at 50% larger: font 72 (was 48), with letter spacing 12 and outline 2.25 scaled with it, titleTop unchanged. 3: the human renamed the scenario case themselves on master (scenarios/movement.json name and description, expected/movement.json key) to "backward move turns the ship around 180 degrees and turns the ship toward heading direction"; this is the human's own spec edit, so it needs no T-013-style approval brief. verify --feature movement gives RESULT: PASS on the edited tree (agent-team/evidence/scenario-rename/).

Decided by human in session, 2026-11-11: "1. do not build T-015 to T-020 yet. 2. remove comments from all. 3. no comments is a lasting rule."
Context: answers T-021's three open questions, asked after T-021 review round 1 (APPROVE): (1) does "finish current phase-1 optimization" also mean building T-015..T-020; (2) should comments also be removed from tests/, sim/balance.mjs and the non-protected files in scripts/; (3) is "no comments in src/" a lasting rule. 1: T-015 to T-020 are not built yet; they stay READY with no build go-ahead. 2: comments are removed outside src/ as well; briefed as agent-team/tasks/T-022.md. Coordinator's reading of "all": every code file agents may edit (tests/, sim/, scripts/run-scenario.mjs, scripts/serve.mjs, scripts/smoke.mjs); it is the go-ahead for comment-only edits in those scripts/ files (FEATURE_MAP section 9), and it is not permission to edit protected files (.claude/settings.json deny list); shebang lines, the two nosemgrep scanner directives and text inside strings are not treated as comments to remove. 3: coordinator's reading: with answer 2, the rule covers all code agents write, not only src/; T-015's two Done-when items that asked for comments are amended; a guard and an AGENTS.md line are proposed in BACKLOG (both need the human). Not a merge or push approval.

Decided by human in session, 2026-11-12: "1. leave them. 2. yes. 3. no. 4. all code. show me what to write in agents.md. 5. accept."
Context: answers the five questions put to the human after T-022 review round 1 (APPROVE): (1) should the seven comments in .github/workflows/agent-guards.yml go; (2) are the two // nosemgrep directives (scripts/run-scenario.mjs, scripts/smoke.mjs) a standing exception to the no-comments rule; (3) should comments also come out of the old evidence one-off scripts and .gitattributes; (4) does the lasting rule cover all code agents write or only src/, with a guard brief and an AGENTS.md line to follow; (5) is the 2 px ship offset in T-021's input-smoke screenshot pair acceptable as capture timing. 1: the agent-guards.yml comments stay. 2: the two nosemgrep directives are a standing exception. 3: the evidence scripts and .gitattributes keep their comments. 4: the rule covers all code; the human asked to be shown wording for AGENTS.md (agents do not edit AGENTS.md; the wording was shown in session). The answer does not say whether to write the guard brief; that stays open. 5: the 2 px offset is accepted. Not a merge or push approval.

Decided by human in session, 2026-11-12: "write no comment guard brief and make the changes. fix line numberes cited in T-015 to T-020. keept .gitignore untrack in produc-a."
Context: three instructions, given after T-021 and T-022 were merged and closed (master da8fe50). Each reading below is the coordinator's reading, not a human decision. (1) "write no comment guard brief and make the changes": go-ahead to write AND build the no-comments guard brief, agent-team/tasks/T-023.md. It is not a merge or push approval, and it does not lift the .claude/settings.json deny list: agents still do not edit scripts/guards.sh or scripts/verify.sh, so T-023 enforces the rule through a checker module and a unit test that verify.sh already runs. (2) "fix line numberes cited in T-015 to T-020": the coordinator corrects, now and in the briefs themselves, the file:line references and quoted text that moved or went away with T-021/T-022; it is not a build go-ahead for T-015 to T-020 (the answer of 2026-11-11, item 1, still holds). (3) "keept .gitignore untrack in produc-a": product-a/.gitignore stays untracked; no agent adds, commits, edits or deletes it.

Decided by human in session, 2026-11-12: "1. yes, 2. yes, 3. yes, 4. fix T-016 and T-018, 5. keep it strict"
Context: answers the five questions from the T-023 brief (no-comments guard), put to the human while T-023 was in review. The questions: (1) is "check every evidence folder except T-001 to T-014" the right reading of "new ones have none"; (2) should scripts/no-comments.mjs and tests/no-comments.test.js go on the .claude/settings.json deny list and in the CI "Block changes to the checks" step after T-023 merges; (3) should the human add `node scripts/no-comments.mjs || FAIL=1` above `exit $FAIL` in scripts/guards.sh after the merge; (4) T-016 and T-018 cannot be built by an agent as written because they edit the protected scripts/verify.sh and scripts/guards.sh (the recommendation was: T-018 rewritten the T-023 way, T-016 with a patch the human applies); (5) keep the nosemgrep allowlist strict (two exact directives, by file and text) instead of allowing any `// nosemgrep:` comment. 1: confirms the evidence-folder rule: every folder under agent-team/evidence/ is checked except T-001 to T-014. 2 and 3: yes to both edits. Coordinator's reading: these are edits the human makes themselves after T-023 is merged; agents do not edit .claude/settings.json, .github/** or scripts/guards.sh, and the answer does not lift the deny list. 4: coordinator's reading: the instruction to rewrite the T-016 and T-018 briefs so an agent can build them without editing a protected file. It is NOT a build go-ahead: the answer of 2026-11-11, item 1 ("do not build T-015 to T-020 yet"), still stands, and both briefs stay READY with no build go-ahead. The new designs in the two briefs are coordinator choices, not human decisions. 5: the allowlist stays strict: exactly the two directives, each only in its own file with its exact text; a new scanner directive needs a brief. Not a merge or push approval, for T-023 or anything else.

Decided by human in session, 2026-11-12: "1. yes accept T-016 change without patch, 2. yes, 3. yes.4. add clarifying sentence for agents.md stack line mismatch."
Context: answers the coordinator's three questions after the T-016 and T-018 rewrite, plus the AGENTS.md Stack item from BACKLOG. 1: the rewritten T-016 (scripts/handoff-check.mjs plus a unit test that reads the task ID from the branch name; no verify.sh patch) is accepted. 2: the new T-016 and T-018 files are protected the same way as the T-023 files after each merges (deny list and the CI "Block changes to the checks" step); those edits are the human's. 3: T-018 keeps checking untracked files. 4: a clarifying sentence is added to the AGENTS.md Stack line; session orchestrator's reading: the human asked for the edit, so the sentence was added in session to the main checkout, uncommitted, restating the 2026-11-07 decision. Not a build go-ahead for T-016 or T-018 (the 2026-11-11 "do not build T-015 to T-020 yet" still stands) and not a merge or push approval.

Decided by human in session, 2026-11-12: "1. pushed, 2. show me steps, 3. update backlog, 4. updated, 5. start building T-015, T-016, and T-017, 6. review backlog items and create briefs if not yet exist, 8. clean up"
Context: answers the session orchestrator's eight-item loose-ends list, put to the human after T-023 was merged and closed; relayed to the coordinator by the session orchestrator. The list: (1) the workspace repo had 2 unpushed commits; (2) semgrep and CI have never run on this work; (3) BACKLOG still listed the three protection edits as waiting; (4) the AGENTS.md Guards line did not mention comments; (5) T-015 to T-020 are READY but not built, waiting for a go-ahead; (6) open backlog items with no brief yet; (7) the Phase 1 exit gate; (8) the stale remote branch origin/chore/design-agents. 1: the human pushed the workspace repo. 2: the human asks to be shown the steps for a first CI and semgrep run; the session orchestrator gives them; nothing is built for it. 3: BACKLOG is updated by the coordinator (the three protection edits are done by the human: .claude/settings.json deny entries 2a5cd38; the CI "Block changes to the checks" pattern and the guards.sh line 4e83e53). 4: the human updated the AGENTS.md Guards line themselves (it now lists comments). 5: build go-ahead for T-015, T-016 and T-017. Coordinator's reading: for these three only; T-018, T-019 and T-020 still have no build go-ahead, and the answer of 2026-11-11, item 1 ("do not build T-015 to T-020 yet"), is superseded for T-015, T-016 and T-017 only. 6: coordinator's reading: the instruction to review every open BACKLOG item and write a brief where none exists; it is not a build go-ahead for any brief written from it (T-024 to T-028). 7: not answered; the Phase 1 exit gate stays open. 8: the stale remote branch is cleaned up by the session orchestrator and the human; no agent brief. Not a merge or push approval for any task. The build order and bases of T-015, T-016 and T-017 (a stack, one after another) are a process choice by the session orchestrator, not a human decision.
Decided by human in session, 2026-11-13: "continue from where we left off - build T-015, T-016 and T-017, update the backlog, write briefs for open backlog items, and clean up."
Context: said to the session orchestrator in a new session, after the session of 2026-11-12 was cut off by a usage limit while T-015 was in review. It repeats the go-ahead of 2026-11-12 (item 5) for T-015, T-016 and T-017 and adds no new one (session orchestrator's reading): T-018 to T-020 and T-024 to T-028 still have no build go-ahead. Not a merge or push approval. The backlog update and the briefs T-024 to T-028 were already done in adf3c07.
Decided by human in session, 2026-11-13: "build T-029"
Context: given through /run-task ("Run this through the agent team: build T-029") after T-015, T-016 and T-017 were approved in review and the coordinator wrote T-029 to T-031. It is the build go-ahead for T-029 only; T-018 to T-020, T-024 to T-028, T-030 and T-031 still have none. Not a merge or push approval; it does not lift the deny list.
Decided by human in session, 2026-11-13: "You merge the stack first (Recommended)"
Context: the human's choice among three options the session orchestrator put for the base of T-029, because T-016 is not merged to master and T-029 edits T-016's two files. The chosen option reads: "You merge T-015, T-016 and T-017 into master, in that order. Then I build T-029 from master exactly as its brief says. No extra merge commit, no conflict risk. Do not protect T-016's two files until T-029 is done." The other two options (stacking T-029 on the unmerged T-017 branch, with or without merging master into it) were not chosen. T-029 is not started until the three merges are on master.
