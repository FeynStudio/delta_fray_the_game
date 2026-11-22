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
| before evidence overwritten by the after run (verify.sh writes the same artifact file names for every label) (PROMOTED 2026-11-20: the human changed scripts/verify.sh line 17 to OUT=agent-team/evidence/$TASK/$LABEL, commit 569c7ec, pull request #11, 9bfe02e; raised by the T-031 reviewer) | 3 | T-012, T-019, T-031 |
| file edited outside the brief's Allowed sections (disclosed leftover-conflict cleanup) | 2 | T-014, T-009 |
| owner wrote a 'Decided by human' line the brief reserves for the coordinator (verbatim copy, not an approval) | 2 | T-013, T-029 |
| handoff claims more test coverage than the tests have (e.g. "states include explosions" with empty explosions arrays) | 1 | T-010 |
| smoke screenshots differ between two runs of the same commit (real-time animation during capture), so before/after pairs cannot be compared byte for byte (HANDLED 2026-11-22: T-027 merged, pull request #12, d0c076c; every smoke screenshot goes through fixedShot; raised by the T-027 reviewer 2026-11-20) | 1 | T-021 |
| brief or handoff cites a section that does not exist (dangling 'open question N' reference) | 1 | T-023 |
| check added by the owner beyond the brief has no test (disclosed extra SKIP reasons and environment filter) | 2 | T-016, T-017 |
| fix proven only by a one-off evidence script; no unit test pins it (paged history walk, git hardening arguments) | 2 | T-029, T-032 |
| rewrite meant to keep a rule unchanged differs from the old rule on an edge the owner's differential cases did not cover (pathspec `agent-team/` matches a gitlink named agent-team) | 1 | T-032 |
| Handoff's known-limits list misses a bypass the reviewer found (skip-worktree/assume-unchanged edit hides a code change from the dirty line) (handled, not promoted, marked 2026-11-18: both T-024 reviewers judged a code guard a poor fit and suggested a checklist step; it is coordinator working rule (9) in agent-team/BACKLOG.md, 2026-11-18 close entry for T-039, T-041, T-038, T-040 and T-024: every brief whose task adds, changes or documents a path or name filter gets a Done-when item in which the owner probes encoded separators, case variants, short names, stream names and links before writing "never" about it) | 3 | T-036, T-041, T-024 |
| evidence line written down from an earlier run instead of saved output | 2 | T-018, T-030 |
| brief Done-when names the wrong file or command for its proof (2c names tests/rules.test.js, applyMove tests are in tests/movement.test.js) | 1 | T-030 |
| brief Done-when asks for evidence a committed file cannot hold (git status after the commit that adds the file) | 2 | T-037, T-038 |
| new test fails on a platform the owner did not run because of path handling (temp dir behind a symlink or junction: macOS /var, Windows junction) | 1 | T-039 |
| guard's documented rule omits the false hits it makes on ordinary text (web routes such as /home/<page> flagged by the home-path pattern) | 1 | T-041 |
| Handoff misstates what a commit contains (names a file the commit does not touch) | 1 | T-038 |
| evidence hand-pasted from terminal output or a patch re-made without a run (disclosed, cross-checked) | 2 | T-040, T-019 |
| brief scope check lists a file that the review-record step itself changes on the branch (REPEATS.md after review round 1) | 1 | T-039 |
| one-off evidence script or test run leaves its throw-away temp fixture behind when the process ends early (cause not found, not reproduced by the reviewer) | 1 | T-042 |
| brief's fixed set-up point lands where the frame cannot show the case it is for (title-centre x is the space between words) | 1 | T-031 |
| negative control exercises only the first failure branch of a multi-branch check (later branches and the second page size never shown to fail) | 2 | T-020, T-027 |
| Done-when names a command the unattended run has no permission for (sha256sum); owner substituted an equivalent (git blob id) | 1 | T-027 |
| FEATURE_MAP line of an earlier task left stale by a change to the helper it describes (T-017 stateShot clock line) | 1 | T-027 |
