# CLAUDE.md — Galaxy Shooter

## Project Summary

Retro, browser-based game. Ships are triangles. A ship attacks by flying into an enemy: any enemy inside the area a ship sweeps along its path is destroyed. Long term: real-time online multiplayer, three factions, pay-to-play. Full plan: `docs/plan.md`. Follow it. If something is unclear or conflicts, ask before deciding.

## Current Phase

**Prototype 1 only:** local hot-seat, two players taking turns on one screen, two ships. Do NOT build: networking, servers, accounts, payments, currency, factions, or anything from later roadmap phases.

## Tech Rules

- Plain JavaScript (ES modules). No TypeScript.
- One HTML page with a single canvas.
- No frameworks, no game engines, no build step. Must run by opening `index.html` via a simple local server.
- Dependencies only for testing, and only if needed.

## Architecture Rules

- `src/rules.js`: pure game logic only (state, movement, swept-area hit detection, edge checks, respawn). No DOM, canvas, keyboard, or timing code. It must be able to run unchanged on a server later.
- `src/input.js`: keyboard handling and gauge state.
- `src/render.js`: all canvas drawing.
- `src/game.js`: game loop and turn manager; connects the other modules.
- `src/config.js`: all tunable constants. Never hard-code these elsewhere.
- All game math uses game units, never screen pixels. Rendering scales the 1280 × 960 world to fit the screen.

## Game Constants (starting values, in config.js)

- Map: 1280 × 960 units
- Ship: equilateral triangle, 30 units per side
- Max move distance: 150 units
- Spawn points: opposite edges, \~900 units apart
- Gauge sweep: slow (careful aim, not reflexes)

## Controls

1. Space: lock distance (power gauge)
2. Direction gauge defaults to forward 180°; Shift flips it to backward 180°
3. Space: lock direction and launch immediately

## Rules Summary

- Enemy inside the swept path is destroyed (any part counts).
- Reaching a map edge destroys the moving ship. Hitting an enemy and then the edge destroys both.
- Destroyed ships respawn at their spawn point. Spawn points can't be attacked. Endless play.
- No turn timer.

## Do NOT Add

- Path preview or kill confirmation before launch
- Dodging or evasion mechanics
- Map wraparound
- Spawn protection
- Any feature not in the plan without asking first

## Workflow

- Build in small slices, in this order: map + ship drawing, gauges + controls, movement, hit detection + edges, respawn.
- Each slice: implement, then write or update tests, then run them.
- Hit detection and edge logic in `rules.js` must have unit tests, including edge cases (grazing contact, hit-then-wall, max-distance moves).
- A slice is not done until its tests pass and the game runs in the browser.
- Keep changes small and explain what changed after each slice.
