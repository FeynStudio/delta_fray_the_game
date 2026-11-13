# Repeats

Recurring kinds of issue found in review. At count 3, promote to a guard or a verify.sh check.

| Kind | Count | Tasks |
|---|---|---|
| agent sandbox cannot run the browser smoke check; human run needed (handled, not promoted: smoke.mjs fix ef1704e; no recurrence in T-004, T-005) | 3 | T-001, T-002, T-003 |
| evidence log header missing commit (git did not resolve in the runner's shell) | 2 | T-001, T-002 |
| design doc left stale after a human design decision (logged to BACKLOG, not updated) | 1 | T-001 |
| smoke screenshot cannot show the feature under review (taken in the wrong phase) | 3 | T-002, T-007, T-009 |
| task past ~400 changed lines with no recorded split decision | 1 | T-002 |
| handoff text left stale after a later change or decision | 3 | T-002, T-006, T-009 |
| build started without a recorded human go-ahead (latest tagged decision says don't build) | 1 | T-006 |
| evidence log header commit does not match the code that ran (uncommitted change at run time) | 3 | T-008, T-009, T-017 |
| before evidence overwritten by the after run (verify.sh writes the same artifact file names for every label) | 1 | T-012 |
| file edited outside the brief's Allowed sections (disclosed leftover-conflict cleanup) | 2 | T-014, T-009 |
| owner wrote a 'Decided by human' line the brief reserves for the coordinator (verbatim copy, not an approval) | 1 | T-013 |
| handoff claims more test coverage than the tests have (e.g. "states include explosions" with empty explosions arrays) | 1 | T-010 |
| smoke screenshots differ between two runs of the same commit (real-time animation during capture), so before/after pairs cannot be compared byte for byte | 1 | T-021 |
| brief or handoff cites a section that does not exist (dangling 'open question N' reference) | 1 | T-023 |
| check added by the owner beyond the brief has no test (disclosed extra SKIP reasons and environment filter) | 2 | T-016, T-017 |
