# Product-a — Agent Rules

## Project
- Purpose: Retro, web-based, real-time, pay-to-play multiplayer space game.
- Stack: TypeScript 5, React, Vite; npm; Vitest for tests; Supabase for data; app code in src/, tests in tests/.
- Run locally: npm ci, then cp .env.example .env, then npm run dev (opens at http://localhost:5173). Never edit .env values.
- Verify: `./scripts/verify.sh T-###`; run npm ci first. Must pass before any task is called done.
- Guards: `./scripts/guards.sh`; must pass; Bans TODO/HACK markers, debug prints, silent catch blocks, and UI importing the data layer. Fix the code, never edit the guards.

## How work flows
1. Every task has a brief in agent-team/tasks/T-###.md. No brief, no work.
2. Build on a branch named task/T-###-short-name. Never on main.
3. Reproduce first: record the current behavior and the commit it was seen on.
4. Save proof to agent-team/evidence/T-###/. The owner never approves its own work.
5. Only the human merges, deploys, sends anything external, or deletes data.

## Non-negotiables
- Do not guess. Read the FEATURE_MAP entry, search the code, or run the tool first.
- Name the files you read before stating a root cause.
- "It builds" is not proof. Run the changed behavior and record what you saw.
- If you could not verify something, say so. Never report an assumption as a result.
- Stay inside the task scope. Log anything else in agent-team/BACKLOG.md.
- Keep each change small and revertible; split work that grows past ~400 changed lines (playbook default).
- Follow the existing paved road for each job (see FEATURE_MAP). Do not invent a second way.
- Stop and write BLOCKED in the brief when you need credentials, approvals, or a human choice.

## Handoff format (end of every task)
- Status: DONE | BLOCKED | PARTIAL
- What changed: [files, one line each]
- Evidence: before (commit, result) → after (commit, result); paths in evidence/
- Not verified: [anything you could not check]
- Follow-ups: [items added to BACKLOG.md]