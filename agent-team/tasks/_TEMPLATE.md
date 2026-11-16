# T-### [Short title]
Status: DRAFT | READY | IN PROGRESS | IN REVIEW | BLOCKED | DONE
Owner role: owner
Created: [date]
Verify feature: [render | input | movement | hits | turns | config | all]  (passed as --feature to every verify.sh run for this task)

## Goal
[One sentence: what changes for the user.]

## Context
[Original request or bug report, pasted as-is. Links. Relevant FEATURE_MAP entries.]

## Done when
- [ ] [Observable check 1, e.g. verify.sh --feature export passes on a double click]
- [ ] [Observable check 2]
- [ ] Before/after evidence saved; ./scripts/verify.sh and guards pass

## Out of scope
- [Things not to touch]

## Finish line
Done means ALL of:
- Every "Done when" item above is checked
- ./scripts/verify.sh T-### --feature [Verify feature] and guards pass on the task branch

## Allowed
- Work only on branch task/T-###-*; commit and push that branch

## Not allowed
- Merge, deploy, delete data, send anything outside the repo, add paid services
- Edit guards, CI, evals, settings, DESIGN.md or ROADMAP.md

## Stop rule
- Blocked by access, a missing dependency or a human decision: set Status: BLOCKED, write the exact need, and stop.
- verify.sh fails 3 times on the same error: stop and write what you tried.
- Hard stop after 2 review rounds.

## Decisions
(human answers only, one line each, also copied to agent-team/DECISIONS.md)
- Decided by human in session, YYYY-MM-DD: "[the human's answer, word for word]"

## Handoff
(owner fills in)

## Review
(reviewer fills in)