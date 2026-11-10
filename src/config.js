// All tunable game numbers live here (docs/ARCHITECTURE.md "Game Constants").
// One plain, mutable object: rules read it at call time, so tests and scenarios can override values.
// Units are game units, never screen pixels. Heading in degrees: 0 = right (+x), 90 = down (+y).
const config = {
  worldWidth: 1280,
  worldHeight: 960,
  shipSize: 30, // length of each of the two long sides (tip to back corner)
  shipWidth: 16, // width of the back edge; narrower than shipSize makes a slim triangle
  shipLineWidth: 2, // outline thickness; ships are drawn as an outline only
  maxMove: 150,
  moveAnimMs: 600, // one move takes this long on screen, at constant speed along a straight line
  // Gauges (src/input.js). Slow sweeps favor careful aim over reflexes (docs/PLAN.md "Controls").
  gaugePowerSweepMs: 2000, // power reading 0 -> 1 (then back) takes this long
  gaugeNeedleSweepMs: 3000, // needle crosses its whole range (-max -> +max) in this long
  gaugeNeedleMax: 90, // needle stays within -max..+max degrees: a 180-degree side
  // Gauge drawing (src/render.js), in game units. Gauges sit on the ship whose turn it is.
  // Drawn size = base size x scale.
  gaugeBarWidth: 240,
  gaugeBarHeight: 14,
  gaugePowerScale: 0.3, // 60% of the earlier 0.5 (human, 2026-11-08)
  gaugeDialRadius: 46,
  gaugeDialScale: 0.56, // 80% of the earlier 0.7 (human, 2026-11-08)
  // The power bar sits this far below the farthest point the dial can ever reach from the ship centre,
  // so it never overlaps the dial and never moves when the dial appears or flips.
  gaugePowerGap: 4,
  gaugeDialGap: 4, // space between the nose (forward) or tail (backward) and the dial's flat side
  gaugeEdgeMargin: 4, // gauges are kept at least this far inside the map edges
  gaugeLineWidth: 2,
  // Explosions (T-007): a destroyed ship's outline breaks into 6 pieces that fly outward and shrink.
  // Decoration only: play does not wait for them (human, 2026-11-09).
  explosionMs: 1000, // an explosion lasts this long, then it is removed
  explosionEndScale: 0.5, // each piece's length goes from 1 to this over explosionMs
  explosionCuts: [0.35, 0.6, 0.45], // each side (tip-left, left-right, right-tip) is cut once at this fraction
  explosionSpeed: 40, // game units per second each piece moves away from the ship's centre
  // Score (T-012): each player's score, drawn in their corner. Scores may go below 0 (human, 2026-11-09).
  scoreStart: 0, // both players start here
  scoreKill: 1, // added to the mover for each enemy its move destroys
  scoreWall: -2, // added to the mover when its move ends at the wall (hit-then-wall gets both)
  scoreFontSize: 28, // game units
  scoreMargin: 16, // distance of the score text from the map's top and side edges
  // Opposite sides of the map on the horizontal center line, 900 units apart, facing each other.
  spawns: [
    { x: 190, y: 480, heading: 0 },
    { x: 1090, y: 480, heading: 180 },
  ],
};

export default config;
