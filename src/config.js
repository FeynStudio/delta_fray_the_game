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
  // Opposite sides of the map on the horizontal center line, 900 units apart, facing each other.
  spawns: [
    { x: 190, y: 480, heading: 0 },
    { x: 1090, y: 480, heading: 180 },
  ],
};

export default config;
