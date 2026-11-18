# Mini golf reference notes (mechanics only)

Source: 5 phone screenshots + 1 gameplay video in `screenshots/` (gitignored).
Everything below describes mechanics and layout to copy. No names, art, sounds or
text from the source are to be reused.

## Screen layout (portrait)

- Top band: player 1 (left) and player 2 (right) with avatar, running score badge,
  and `SHOT: n` for the current hole. A "your turn" pill and a turn timer bar sit
  over the active player.
- Course area: a tall rectangle with a thick wall border, roughly 1:1.4 aspect,
  sits in the middle of the screen. Above it a banner shows `MAX SHOTS: n`
  (per-hole shot cap: 4, 5 and 6 seen).
- A tutorial overlay band appears across the middle on the first holes
  ("place your ball on a starting area", "drag from the center of the screen to shoot").

## Core loop

1. **Place the ball.** The hole has a highlighted start zone (a small checkered
   square, bottom-left on most holes). The player taps anywhere inside it to place
   the ball. This is a real choice: placement affects the line.
2. **Aim and shoot by dragging anywhere.** The drag starts from screen centre, not
   from the ball. Drag direction and length set shot direction and power. A
   pulsing ring on the start zone shows aim feedback. Release to shoot.
3. Ball rolls with friction, bounces off walls, interacts with hazards, stops.
4. Repeat until the ball is in the hole or the shot cap is reached.
5. **Hole score panel**: a dark overlay listing each player's strokes for that hole.
   Then the next hole.

## Hazards and tiles seen

- **Walls**: thick brick segments; inner walls form L-shapes, corridors and
  partial boxes. Ball bounces.
- **Water**: large blue blobs. Ball entering water resets (penalty) to its last
  position or the start.
- **Sand**: beige patches that slow the ball sharply.
- **Conveyor strips**: bands of arrows (up, down, left, right). A ball on them is
  pushed in the arrow direction. Used to make corridors one-way or to carry a ball
  along a wall.
- **Portals**: rainbow swirl pairs. Ball entering one exits the other keeping its
  velocity.
- **Bonus pickups**: a star token on a pink patch, collected by rolling over it.
- Decorative props (buildings, animals, trees) are purely visual; our version uses
  primitive shapes and must not copy them.

## Multiplayer

Source is 1v1 online turn-based with a turn timer. For our first version: single
player versus par, with a local "pass the phone" 2-player mode as a later task.
No real-money mechanics, no chat.

## What to copy

- Shot cap per hole instead of unlimited strokes.
- Free placement inside a start zone.
- Drag-anywhere aiming with a visible aim line and power indicator.
- Hazard set: walls, water, sand, conveyor, portal, star pickup.
- Score panel after each hole, total strokes at the end, best score saved.

## What to avoid

- Any names, logos, pixel-art props, avatar styles or UI chrome from the source.
- Online multiplayer, accounts, chat, timers tied to a server.
