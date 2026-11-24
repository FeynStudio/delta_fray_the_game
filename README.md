# Delta Fray

A retro, browser-based space game where ships are triangles and you attack by flying straight through the enemy. The long-term goal is a real-time, pay-to-play multiplayer game with three factions. Today it is **Phase 1: a two-player hot-seat prototype** on one screen.

## Run it

Requires Node.js 22 or later. The game itself has no dependencies and no build step.

```bash
npm ci
npm run dev
```

Open http://localhost:5173/index.html. Set `PORT` to use another port. Add `?debug=1` to the URL to turn on logging and the `window.__game` test API.

## How to play

Two players share one keyboard and take turns.

| Step | Key | What happens |
| --- | --- | --- |
| 1 | Space | Lock distance on the power gauge (0 to 150 units) |
| 2 | Shift (optional) | Flip the direction dial from forward to backward |
| 3 | Space | Lock direction and launch at once |

- Any enemy inside the area your ship sweeps along its path is destroyed. Grazing counts.
- Touching the map edge destroys your ship. Hitting an enemy and then the edge destroys both.
- Destroyed ships respawn at their base. A ship sitting on its base, unmoved since it spawned, cannot be destroyed and blinks to show it.
- Score: +1 per kill, -2 for a wall death. Negative scores are allowed.
- No path preview, no turn timer, no end condition.

## Design background

- **Pillars:** retro look, every ship flown by a real human, three factions, pay-to-play without pay-to-win, nothing of value can be cashed out.
- **Core skill:** judging the path. There is deliberately no path preview.
- **Money (later phases):** real money buys movement currency (planned at $0.02 per move). Spending must never decide who wins; this is the main open design question for real-time play.
- **Visual style:** primary colors, solid outline lines, a 2D map, ships that slide smoothly.
- **Numbers:** 1280 x 960 unit map, 30-unit ship sides with a 16-unit back edge, 150-unit max move. All tunable values live in `src/config.js`.

Full details: `agent-team/design/DESIGN.md` and `docs/ARCHITECTURE.md`.

## Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| 1 | Hot-seat prototype | Exit gate passed; continuing with current design |
| 2 | Feel and polish | Not started |
| 3 | Online, server-authoritative | Not started |
| 4 | Real-time movement currency | Not started |
| 5 | Three factions at scale | Not started |
| 6 | Payments (no cash-out) | Not started |

See `agent-team/ROADMAP.md`.

## Code layout

| Path | Purpose |
| --- | --- |
| `index.html` | Single page with one canvas |
| `src/rules.js` | Pure game logic (movement, swept hits, walls, respawn, score); no DOM, so it can run on a server later |
| `src/input.js` | Keyboard and gauge state |
| `src/render.js` | All canvas drawing |
| `src/game.js` | Game loop, turn manager, debug API |
| `src/config.js` | Every tunable constant |
| `tests/` | Unit tests (`node --test`) |
| `scenarios/`, `expected/` | Rule scenarios and their expected output; these are the spec |
| `sim/balance.mjs` | Balance simulation against `agent-team/design/balance-targets.json` |
| `scripts/` | Dev server, verify, guards, browser smoke checks |

Phase 1 is plain JavaScript with no framework by design. The planned live-game stack is TypeScript, React, Vite and Supabase.

## Checks

```bash
npm test
./scripts/verify.sh T-### --feature all
./scripts/guards.sh
```

`verify.sh` runs guards, lint, unit tests, rule scenarios, headless-browser smoke checks (Chrome or Edge; set `CHROME_PATH` to choose) and the balance simulation, and writes logs to `agent-team/evidence/T-###/`. Guards ban code comments, TODO/HACK markers, debug prints, silent catch blocks, conflict markers and home-directory paths.

## How work is done

The game is built by an AI agent team under human direction. Every change starts from a task brief in `agent-team/tasks/`, is built on a `task/T-###-short-name` branch, and is checked by an independent reviewer with saved evidence. Only the human merges, deploys or deletes data. Rules: `AGENTS.md`. Where each feature lives: `agent-team/FEATURE_MAP.md`.
