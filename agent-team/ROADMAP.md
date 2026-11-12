Roadmap — Space Shooter (Delta Fray)
Owner: Henry. Agents read this file but never edit it; they propose changes with /plan-phase.

Current phase: 1 — Hot-seat prototype

Triage only briefs backlog lines that belong to the current phase. A phase ends when every exit-gate box is ticked; then run /plan-phase next, approve the plan, and update the current phase line above.

Phase 1 — Hot-seat prototype
Status: In progress
Goal: Two ships take turns on one screen; colliding destroys the enemy.
In scope:
Two ships (one per side), turn-based, hot-seat on one screen
Spacebar controls: strength gauge, then direction gauge (Shift flips forward/backward)
Swept-path hit detection: any enemy inside the path is destroyed
Solid map edge: hitting it destroys the ship
Respawn at each player's base; no end condition
Out of scope: networking, currency, factions, payments
Exit gate:
 verify.sh and guards pass on main
 Balance targets in balance-targets.json pass (e.g. opponents meet within 3–6 moves)
 Human playtest: decide whether the cat-and-mouse dynamic is fun
 Decision recorded: continue to Phase 2, rework, or change direction


Phase 2 — Feel and polish
Status: Not started
Goal: Tune the gauge, feedback and visuals based on Phase 1 playtest notes.
In scope: gauge speed and readability, hit and death feedback, turn indicator, visual style from DESIGN.md
Out of scope: networking, currency, factions, payments
Exit gate:
 Design reviewer approves all player-facing changes
 Second human playtest confirms the changes improved the feel


Phase 3 — Online, server-authoritative
Status: Not started
Goal: Run the same game rules on a server, so two remote players can play a match.
In scope: server runs the rules module; clients send move intentions only; server validates moves, decides hits, and limits what each player sees
Out of scope: currency, factions, payments
Exit gate:
 Two remote players complete a match
 Server rejects invalid or tampered moves (covered by tests)
 Security review passes


Phase 4 — Real-time movement currency
Status: Not started
Goal: Replace turns with spending a movement currency to move.
In scope: currency balance held on the server, real-time movement, earn-by-playing (if approved)
Out of scope: real-money purchases, factions
Exit gate:
 Balance simulation updated for real-time play; pacing targets pass
 Human playtest of real-time pacing


Phase 5 — Factions and scale
Status: Not started
Goal: Three factions on a larger map with many players.
In scope: three factions, bigger map, more concurrent players, larger ship sizes
Out of scope: payments
Exit gate:
 Load test passes at the target player count
 Faction balance targets pass in simulation


Phase 6 — Payments
Status: Not started
Goal: Players can buy movement and upgrades with real money; nothing can be cashed out.
In scope: purchases of movement currency and upgrades (e.g. bigger ships), payment provider integration
Out of scope: cash-out or trading anything of real value
Exit gate:
 Security review passes
 Rule confirmed by review and simulation: spending never decides who wins
 Payment flow tested end to end in test mode


Decision log
Date: N/A
Phase: N/A
Decision: N/A
Why: N/A
