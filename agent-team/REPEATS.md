# Repeats

Recurring kinds of issue found in review. At count 3, promote to a guard or a verify.sh check.

| Kind | Count | Tasks |
|---|---|---|
| agent sandbox cannot run the browser smoke check; human run needed (handled, not promoted: smoke.mjs fix ef1704e; no recurrence in T-004, T-005) | 3 | T-001, T-002, T-003 |
| evidence log header missing commit (git did not resolve in the runner's shell) | 2 | T-001, T-002 |
| design doc left stale after a human design decision (logged to BACKLOG, not updated) | 1 | T-001 |
| smoke screenshot cannot show the feature under review (taken in the wrong phase) | 2 | T-002, T-007 |
| task past ~400 changed lines with no recorded split decision | 1 | T-002 |
| handoff text left stale after a later change or decision | 2 | T-002, T-006 |
| build started without a recorded human go-ahead (latest tagged decision says don't build) | 1 | T-006 |
| evidence log header commit does not match the code that ran (uncommitted change at run time) | 1 | T-008 |
| owner wrote a 'Decided by human' line the brief reserves for the coordinator (verbatim copy, not an approval) | 1 | T-013 |
