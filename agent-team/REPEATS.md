# Repeats

Recurring kinds of issue found in review. At count 3, promote to a guard or a verify.sh check.

| Kind | Count | Tasks |
|---|---|---|
| agent sandbox cannot run the browser smoke check; human run needed (handled, not promoted: smoke.mjs fix ef1704e; no recurrence in T-004, T-005) | 3 | T-001, T-002, T-003 |
| evidence log header missing commit (git did not resolve in the runner's shell) | 2 | T-001, T-002 |
| design doc left stale after a human design decision (logged to BACKLOG, not updated) | 1 | T-001 |
| smoke screenshot cannot show the feature under review (taken in the wrong phase) (handled, marked 2026-11-16: per-phase gauge screenshots by T-008, merge 8743557; checked backward-launch and explosion screenshots by T-017, merge bf8eaaa) | 3 | T-002, T-007, T-009 |
| task past ~400 changed lines with no recorded split decision | 1 | T-002 |
| handoff text left stale after a later change or decision (promoted to guard, marked 2026-11-16: stale-handoff check scripts/handoff-check.mjs and tests/handoff-check.test.js, T-016, merge 3df0266) | 3 | T-002, T-006, T-009 |
| build started without a recorded human go-ahead (latest tagged decision says don't build) | 1 | T-006 |
| evidence log header commit does not match the code that ran (uncommitted change at run time) (promoted to guard, marked 2026-11-16: verify.sh writes a `dirty:` line (yes, no or unknown) as line 2 of every log, T-036, merge 794bf0c, applied d47fac1; information only, it never changes RESULT) | 4 | T-008, T-009, T-017, T-033 |
| before evidence overwritten by the after run (verify.sh writes the same artifact file names for every label) | 1 | T-012 |
| file edited outside the brief's Allowed sections (disclosed leftover-conflict cleanup) | 2 | T-014, T-009 |
| owner wrote a 'Decided by human' line the brief reserves for the coordinator (verbatim copy, not an approval) | 2 | T-013, T-029 |
| handoff claims more test coverage than the tests have (e.g. "states include explosions" with empty explosions arrays) | 1 | T-010 |
| smoke screenshots differ between two runs of the same commit (real-time animation during capture), so before/after pairs cannot be compared byte for byte | 1 | T-021 |
| brief or handoff cites a section that does not exist (dangling 'open question N' reference) | 1 | T-023 |
| check added by the owner beyond the brief has no test (disclosed extra SKIP reasons and environment filter) | 2 | T-016, T-017 |
| fix proven only by a one-off evidence script; no unit test pins it (paged history walk, git hardening arguments) | 2 | T-029, T-032 |
| rewrite meant to keep a rule unchanged differs from the old rule on an edge the owner's differential cases did not cover (pathspec `agent-team/` matches a gitlink named agent-team) | 1 | T-032 |
| Handoff's known-limits list misses a bypass the reviewer found (skip-worktree/assume-unchanged edit hides a code change from the dirty line) | 1 | T-036 |
| evidence line written down from an earlier run instead of saved output | 2 | T-018, T-030 |
| brief Done-when names the wrong file or command for its proof (2c names tests/rules.test.js, applyMove tests are in tests/movement.test.js) | 1 | T-030 |
