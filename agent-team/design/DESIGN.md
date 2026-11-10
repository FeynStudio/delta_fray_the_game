# Design — Galaxy Shooter (Delta Fray)

## Pillars (3–5 feelings the product must deliver)
- Retro, web-based, real-time multiplayer space game.
- Three factions. Every ship is controlled by a real human player.
- Pay-to-play: real money buys movement currency.
- Nothing of value can be taken out of the game (no cash-out, no trading for real value).
- Consider adding different types of ships/facilities/faction rewards/faction specific perks in the future. 

## Audience
- All ages should be able to play and enjoy. 
- Pay-to-play mechanism is present but not in bold and right in players' face. 
- Paying must never make a player much stronger. 

## Rules and numbers
- Ship is a triangle where the two long sides are 30 units and the back edge is 16 units.
- Max move 150 units per action.
- Balance targets: in agent-team/design/balance-targets.json, enforced by the balance simulation. 

## Decided, don't reopen
- No path preview: judging the path is the skill. 
- Real money buys movement in-game currency: make the game accessible for all and ensure no pay-to-win situation.
- Faction merit is another in-game currency for upgrades in the future releases: additional game dynamics. 

## Open questions (for playtests)
- In a real-time game, the player who pays more gets more moves and more time on the map. Whether that decides who wins is the main open design question.
- Free movement allowance or move cap per minute for game balance.

## Visual style
- Colors: primary colors
- Type: solid lines
- Layout: 2D map
- Motion and feedback: smooth sliding of ship

## Money
- Spending never decides who wins. 
- User paying to control ship in its faction. 
- Each move cost $0.02.