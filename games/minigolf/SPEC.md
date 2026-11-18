# Putt Duel — SPEC

## Pitch
A one-screen mini golf match against a bot: three short holes, the whole course
visible, drag back anywhere to shoot. Fewer shots wins the hole; most holes won
takes the match.

## Core loop
Place ball in start zone → drag-back aim → release → ball rolls through hazards →
turn passes to the bot → repeat until both have holed out or hit the shot cap →
hole score band → next hole → match result → play again.

## Controls (touch only, 480x800 portrait)
- **Place**: tap inside the highlighted start zone (zone is at least 56x56 px).
  Taps outside the zone do nothing.
- **Aim (pull-back)**: touch down *anywhere* on the screen; a grey dot marks the
  touch-down point. Drag away from it. Shot direction is **opposite** to the drag
  (slingshot). Power = clamp(dragLength / 180 px, 0, 1). A tapered white line
  from the ball, length `power * 120 px`, and a `NN%` label beside the ball show
  the shot. Release to shoot. Releasing with power < 0.05 cancels.
- **Continue / menu**: `BigButton`s only, 56 px or larger. No keyboard, no hover.

## Rules (course units = design pixels; course playfield 400x560, origin top-left)
Physics (`src/logic/physics.ts`, pure, no Phaser, no wall-clock, no Math.random):
- Fixed step `FIXED_DT = 1/120` s. Same inputs ⇒ identical positions (bitwise).
- Ball radius 8. Shot speed = `power * 640` u/s.
- Friction: linear deceleration, grass 240 u/s², sand 1200 u/s². Speed < 5 and
  not on a conveyor ⇒ ball is at rest (velocity exactly 0).
- Playfield edges and interior walls are axis-aligned rectangles. On contact the
  ball is pushed out along the hit normal and the normal velocity component is
  reflected × 0.85.
- **Hole** (circle r=11): captured when centre distance < 11 and speed ≤ 260;
  faster balls roll over it.
- **Water** (rect): ball centre inside ⇒ ball returns to where this shot started,
  velocity 0, shot still counts.
- **Conveyor** (rect, dir up/down/left/right, belt speed 160 u/s): friction acts
  on velocity *relative to the belt*, so a ball on a conveyor never rests; it
  moves at belt speed until it leaves.
- **Portal** (circle r=14, paired by id, each with an exit direction): entering A
  places the ball at `B.centre + exitDir * 23` with speed preserved and heading
  along `exitDir`. The ball ignores portals until it is outside every portal.
- **Breakable prop** (rect): first hit bounces × 0.5 and marks the prop broken
  for the rest of the hole (both players); broken props are ignored.
- **Star** (circle r=12): rolling over it removes it for the hole and gives the
  collector +1 shot allowance on this hole.
- A ball still moving after 12 s of roll is stopped where it is.
- Balls never collide with each other (determinism, simpler AI).

Match (`src/logic/match.ts`): two players, 3 holes, shot caps 5 / 4 / 6.
- Hole start: both balls unplaced; player `holeIndex % 2` goes first (human on
  holes 1 and 3). Placing and the first shot are the same turn.
- After each shot rolls to rest: holed ⇒ `holed`; else if
  `shots ≥ cap + extraShots` ⇒ `out`. If both are finished ⇒ hole over. Otherwise
  the turn goes to the other player if they are still playing, else stays.
- Hole points: both holed, fewer shots ⇒ 1 point, tie ⇒ 0 each. One holed, other
  out ⇒ holed player 1. Both out ⇒ 0 each.
- Match result after hole 3: more points wins; equal ⇒ draw.
- The match state is a plain JSON object: `{ version, seed, rngState, holeIndex,
  points, activePlayer, phase, hole: { shots, extraShots, result, balls,
  brokenProps, collectedStars, lastResult } }`. `phase ∈ placing | aiming |
  rolling | holeOver | matchOver`. `JSON.parse(JSON.stringify(s))` is a complete
  restore. RNG is mulberry32 stored as a u32 in `rngState`; only the AI uses it.

Opponent (`src/logic/opponent.ts`): `interface Opponent { choosePlacement(state,
course): Vec2; chooseShot(state, course): { angle, power } }`. The only
implementation now is `createAiOpponent({ skill })`: it simulates a deterministic
grid of candidate placements × angles × powers with the real physics, scores
holed > closest-to-hole, water heavily penalised, then adds seeded noise scaled
by `1 - skill` (skill 1 ⇒ none). Pass-and-play or remote players later implement
the same interface without touching `match.ts`.

## Progression and save data
Save key `minigolf:save` via `createSaveStore`: `{ version: 1, wins, losses,
draws, inProgress: MatchState | null, muted }`. Saved after every completed
turn and at hole over (never mid-roll). Title shows record and a Continue button
when `inProgress` is set.

## Scenes
- `Title`: name, record `W-L-D`, Play, Continue (if saved), mute toggle.
- `Play`: HUD band (two player cards: name, points badge, `SHOT n`, tick/dash,
  active pill), course 400x560 at (40,150) with a 12 px border and `MAX SHOTS n`
  banner on its top edge, one-line hint band on hole 1, hole-over score band with
  Continue, match-over overlay with result and Play again.
- Query params for tests: `?hole=2` starts at that hole, `?seed=123` fixes the
  seed.

## Art and sound
Primitive shapes only: green court, dark grey walls, blue water, tan sand,
striped arrow conveyors, purple portal rings, orange props, yellow star, white
ball (human) and black ball (bot). All audio from `SynthAudio` tones.

## Out of scope
Online play, accounts, turn timer, pass-and-play UI, pink patches, ball-ball
collision, camera movement, more than 3 holes, real-money anything.
