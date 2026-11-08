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
  // Gauge drawing (src/render.js), in game units: a panel at the bottom center of the map.
  gaugeBarWidth: 240,
  gaugeBarHeight: 14,
  gaugeDialRadius: 46,
  gaugeGap: 16, // space between the dial and the power bar
  gaugeMargin: 24, // space between the power bar and the bottom edge
  gaugeLineWidth: 2,
  // Opposite sides of the map on the horizontal center line, 900 units apart, facing each other.
  spawns: [
    { x: 190, y: 480, heading: 0 },
    { x: 1090, y: 480, heading: 180 },
  ],
};

export default config;
