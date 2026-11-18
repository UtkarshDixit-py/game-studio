# Mini golf reference notes (mechanics only)

Source: 5 phone screenshots and one 3m40s gameplay video in `screenshots/`
(gitignored). The video shows three complete holes of a 1v1 match.
Everything below describes mechanics and layout to copy. No names, art, sounds or
text from the source are to be reused.

## Screen layout (portrait)

- Top band: the two players side by side, each with a running match score badge
  and `SHOT: n` for the current hole. The active player gets a "your turn" pill
  and a draining turn-timer bar.
- Course: a tall rectangle with a thick wall border, about 1:1.4, in the middle
  of the screen. A banner on its top edge shows `MAX SHOTS: n`.
- The whole course is visible at once. No camera scrolling or zoom.
- One-line tutorial bands appear over the course on the first hole.

## Turn flow (confirmed from video)

1. **Place the ball.** Each hole has one highlighted start zone (a small checkered
   square). The player taps inside it to place the ball. Placement is a real
   choice because it changes the first line.
2. **Aim.** Touch down anywhere on screen. A grey dot marks the touch-down point.
   Dragging away from it draws a white tapered aim line from the ball, with a
   power percentage next to the ball (39%, 47%, 50%, 88% seen). Line length
   scales with power. A pulsing ring surrounds the ball being aimed.
3. **Release** to shoot. The ball rolls with friction, bounces off walls, and
   stops. The shot counter goes up by one.
4. Turns alternate between the two players, one shot each. Both balls stay on the
   course. A "your turn" bubble points at the ball when control returns.
5. The hole ends for a player when the ball drops, or when the shot cap is hit.
   A player who holed out gets a tick next to the shot count. A player who ran
   out of shots shows a dash instead of a number.
6. **Hole score panel**: a dark band across the course listing each player's
   points for that hole. Then the next hole loads.

Not determinable from the frames: whether the drag is pull-back (slingshot) or
push-forward, and whether the two balls collide. Decide in SPEC.md. Pull-back is
the common convention.

## Scoring (confirmed from video)

- Match play, not stroke play. The player who holes out in fewer shots wins the
  hole and gets 1 point. The loser gets 0. The badge shows the running total.
- Per-hole shot caps seen: 5, 4, 6. Failing to hole out within the cap loses the hole.

## The three holes in the video

1. **Open field, cap 5.** Start zone bottom-left. A big water blob in the centre
   ringed with props. Hole top-right inside an L-shaped wall that opens upward,
   so the ball has to come in from above. Teaches placement, power and water.
2. **Portal and peg field, cap 4.** Three stacked bands separated by walls.
   Bottom band has the start zone, a portal, sand and water. The portal carries
   the ball to the top band. Between them is a field of staggered short wall
   pegs laid over a downward conveyor, with a row of five holes at the bottom.
   The ball is pushed down through the pegs and may need extra shots from inside
   the field. Missing the portal wastes a shot in the bottom band.
3. **Conveyor maze, cap 6.** Start zone at the bottom of a narrow left corridor.
   A downward conveyor band sits just above the start, so the first shot needs
   high power to get past it, then upward bands carry the ball on. Across the
   top, then down the right side, and into a walled box in the centre holding
   the hole, with sand beside it. Two vertical channels of rightward conveyors
   push the ball sideways. A star pickup sits on a pink patch in the top-right.

## Hazards and tiles

- **Walls**: thick straight segments forming L-shapes, corridors, boxes and
  short pegs. Ball bounces.
- **Water**: large blobs. Ball entering water is reset with the shot counted.
- **Sand**: patches that slow the ball sharply.
- **Conveyors**: bands of arrows in four directions that push a ball resting or
  rolling on them. Used for one-way corridors, for shots that need a minimum
  power, and under the peg field.
- **Portals**: matched pairs. Ball entering one leaves from the other.
- **Breakable props**: decorative objects on the course act as obstacles and
  break apart when the ball hits them, clearing the path for later shots.
- **Star pickup**: collected by rolling over it. Its effect is not visible in
  the video.
- **Pink patches**: a surface type in hole 3. Its effect is not visible in the
  video. A ball came to rest on one.

## Design decisions for our version

The source is online 1v1. We have no server, so pick one for SPEC.md:

- **Solo vs par** (simplest): shot cap per hole, stars for finishing under par,
  best total saved.
- **Pass-and-play**: two players on one phone, alternate shots, match-play points
  exactly as above.
- **Solo vs a simple AI opponent**: keeps the match-play tension without a server.

Suggested order: solo vs par first, pass-and-play as a later task since the
turn logic is the same state machine with two balls.

## What to copy

- Whole course on one screen, tall rectangle, thick border.
- Tap-to-place inside a start zone.
- Drag-anywhere aiming with tapered aim line and power percentage.
- Per-hole shot cap shown on the course.
- Hazard set: walls, water, sand, conveyors, portals, breakable obstacles, star pickups.
- Hole design that teaches one idea each: open field, then portal plus peg
  field, then conveyor maze.
- Score band after each hole.

## What to avoid

- Any names, logos, props, avatars, colours-as-branding or UI chrome from the source.
- Online play, accounts, chat, server-driven timers.
- Real-money mechanics of any kind.
