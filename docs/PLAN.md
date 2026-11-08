# Galaxy Shooter — Plan

## Vision

- Retro, web-based, real-time multiplayer space game.
- Three factions. Every ship is controlled by a real human player.
- Pay-to-play: real money buys movement currency and upgrades (e.g., bigger ships).
- Nothing of value can be taken out of the game (no cash-out, no trading for real value).
- Under consideration: earning movement currency by playing.

## Core Mechanic

- No shooting. A ship attacks by flying into an enemy.
- Each move = a direction + a distance (up to a fixed max, same for all ships).
- The full area a ship sweeps along its path is checked. Any enemy ship inside it is destroyed. Which part of the ship hits doesn't matter.
- No dodge mechanic, in the prototype or the full game.

## Prototype 1 — Scope

### Setup

- Two ships, one per side, in a fixed, bounded map.
- Local hot-seat: two players take turns on one screen. No networking.
- Endless play, no end condition.

### Map & Dimensions (starting values, tune in playtest)

- Map: 1280 × 960 game units, scaled to fill the screen at any resolution (hit math stays in game units).
- Ship: The two long sides are still 30 units, but the back edge is now 16 units instead of 30, which makes the tip about 31 degrees with a visible heading.
- Max move distance: \~150 units.
- Spawn points: opposite edges, \~900 units apart (opponents meet in roughly 3–6 moves).

### Controls

1. Space (1st press): locks distance on a power gauge.
2. Direction gauge appears, defaulting to the forward 180° range. Shift flips it to the backward 180° range.
3. Space (2nd press): locks direction and launches immediately. No confirm step.

- Gauges sweep slowly, favoring careful, skill-based aim over reflexes.
- Heading: forward moves turn the ship to face its travel direction. Backward moves keep its heading (mainly visual).
- No turn timer.

### Rules

- Hit: any enemy inside the swept path is destroyed.
- Edges are solid. A ship that reaches an edge is destroyed.
- If a path destroys an enemy and then reaches the edge, both ships are destroyed.
- Destroyed ships respawn at their side's spawn point (spawn points can't be attacked).
- No path preview and no kill confirmation before launch. Judging the path is part of the challenge.

## Tech — Prototype 1

- Single HTML page + canvas, plain JavaScript. No game engine, no server.
- Code split by concern:
  - **Rules** (pure logic: state, movement, swept-area hit detection, edge checks). No drawing or input code.
  - **Input** (Space and Shift, gauge state).
  - **Rendering** (canvas drawing, gauges, explosions).
  - **Game loop / turn manager**.
- The rules module must run unchanged on a server later.

## Online Version — Anti-Cheat Principles

- Server-authoritative: the server is the referee and never trusts the browser.
- Clients send intentions only (direction + distance). The server validates the move, runs the rules, and announces results.
- The server holds all currency balances and purchases.
- The server rejects illegal moves: over the max distance, insufficient currency, or sent too fast.
- Each player receives only nearby game state (no full-map visibility at scale).

## Deferred Decisions

- Wraparound map edges.
- Spawn protection.
- Whether the cat-and-mouse dynamic (first ship in range strikes first) feels good. Decide after playtesting.

## Roadmap

1. Prototype 1: local hot-seat, two ships.
2. Prototype 2: same game, two players online (server + syncing).
3. Real-time play: replace turns with movement currency, and resolve simultaneous moves.
4. Factions and scale: three sides, many ships, maps larger than one screen.
5. Payments and economy: pricing, bigger ships, possible earn-by-playing.
