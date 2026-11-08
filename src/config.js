// All tunable game numbers live here (docs/DESIGN.md "Game Constants").
// One plain, mutable object: rules read it at call time, so tests and scenarios can override values.
// Units are game units, never screen pixels. Heading in degrees: 0 = right (+x), 90 = down (+y).
const config = {
  worldWidth: 1280,
  worldHeight: 960,
  shipSize: 30, // length of each of the two long sides (tip to back corner)
  shipWidth: 16, // width of the back edge; narrower than shipSize makes a slim triangle
  shipLineWidth: 2, // outline thickness; ships are drawn as an outline only
  maxMove: 150,
  // Gauges (src/input.js). Slow sweeps favor careful aim over reflexes (docs/PLAN.md "Controls").
  gaugePowerSweepMs: 2000, // power reading 0 -> 1 (then back) takes this long
  gaugeNeedleSweepMs: 3000, // needle crosses its whole range (-max -> +max) in this long
  gaugeNeedleMax: 90, // needle stays within -max..+max degrees: a 180-degree side
  // Gauge drawing (src/render.js), in game units. Gauges sit on the ship whose turn it is.
  // Drawn size = base size x scale.
  gaugeBarWidth: 240,
  gaugeBarHeight: 14,
  gaugePowerScale: 0.5,
  gaugeDialRadius: 46,
  gaugeDialScale: 0.7,
  gaugePowerGap: 6, // space between the ship (or the dial, if it hangs lower) and the power bar below it
  gaugeDialGap: 4, // space between the nose (forward) or tail (backward) and the dial's flat side
  gaugeEdgeMargin: 4, // gauges are kept at least this far inside the map edges
  gaugeLineWidth: 2,
  // Opposite sides of the map on the horizontal center line, 900 units apart, facing each other.
  spawns: [
    { x: 190, y: 480, heading: 0 },
    { x: 1090, y: 480, heading: 180 },
  ],
};

export default config;
