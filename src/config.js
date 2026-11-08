// All tunable game numbers live here (docs/DESIGN.md "Game Constants").
// One plain, mutable object: rules read it at call time, so tests and scenarios can override values.
// Units are game units, never screen pixels. Heading in degrees: 0 = right (+x), 90 = down (+y).
const config = {
  worldWidth: 1280,
  worldHeight: 960,
  shipSize: 30, // equilateral triangle side length
  maxMove: 150,
  // Opposite sides of the map on the horizontal center line, 900 units apart, facing each other.
  spawns: [
    { x: 190, y: 480, heading: 0 },
    { x: 1090, y: 480, heading: 180 },
  ],
};

export default config;
