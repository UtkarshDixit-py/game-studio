# Game Studio

A lean monorepo for shipping small mobile games as separate Play Store apps.
Phaser 3 + TypeScript + Vite, npm workspaces, Vitest, Playwright. One orchestrator
agent (Claude Code) runs architect / developer / tester agents to build each game;
every passing task is committed and pushed. The repo is private, so you test on
your phone from the local dev server over Wi-Fi (section 3).

```
packages/core/       @studio/core: bootstrap (FIT, multi-touch), save, maths, synth audio, BigButton
games/minigolf/      Mini Golf skeleton
games/botbrawl/      Bot Brawl skeleton
scripts/             studio.sh (tmux cockpit), ship-task.sh, board.sh
.claude/             CLAUDE.md is the orchestrator; agents/ has architect, developer, tester
.github/workflows/   ci.yml, pages.yml (manual only while the repo is private)
```

## 1. Prerequisites

- Node 22+ and npm 10+ (`node -v`)
- tmux (`brew install tmux`)
- GitHub CLI (`brew install gh && gh auth login`)
- Claude Code (`npm i -g @anthropic-ai/claude-code`)

## 2. Install and verify

```sh
npm install
npx playwright install chromium
npm run check      # typecheck + unit tests + build every game
npm run e2e        # Playwright smoke tests, phone viewport, all games
npm run dev -w games/minigolf   # local dev server, open the URL on your phone (same Wi-Fi)
```

## 3. GitHub repo and testing on your phone

The repo is private on GitHub. To recreate it from scratch:

```sh
git add -A
git commit -m "studio scaffold"
gh repo create <your-user>/game-studio --private --source=. --remote=origin --push
```

**Phone testing (private repo).** Phone and Mac on the same Wi-Fi:

```sh
npm run dev -w games/minigolf        # live reload while a task is in progress
# or the production build, exactly what ships:
npm run build -w games/minigolf && npm run preview -w games/minigolf
```

Vite prints a `Network: http://<mac-ip>:<port>/` line. Open that URL on the phone.
If it does not load, the Wi-Fi is isolating devices (common on office and guest
networks); use the phone's hotspot for the Mac instead, and allow incoming
connections for `node` if macOS asks.

**GitHub Pages is off.** Pages needs a public repo on the free plan, so
`pages.yml` is manual-only. To switch it on later, make the repo public, set
**Settings → Pages → Source: GitHub Actions**, and restore the `push` trigger
noted at the top of `.github/workflows/pages.yml`. Builds use `base: './'`, so
they work from a Pages sub-folder and inside Capacitor's WebView unchanged.

## 4. Start the studio

```sh
scripts/studio.sh
```

This opens a tmux session with two windows:

- **studio**: Claude Code (the orchestrator) in the left pane labelled `orchestrator`.
  Worker agents spawned as teammates appear as extra labelled panes.
- **board**: live progress board (tasks done/todo per game, recent commits,
  unpushed count). Switch windows with `Ctrl-b w` or `Ctrl-b 1` / `Ctrl-b 0`.

### First prompt to the orchestrator

Paste something like:

```
Read CLAUDE.md. Run the architect for games/minigolf with this idea:
"Top-down mini golf. Drag back from the ball and release to shoot; power from drag
length. 9 short holes with walls, sand that slows the ball, and one moving bumper.
Par per hole, total strokes saved as best score." Show me TASKS.md, then start the
developer/tester loop from T01 and ship each passing task.
```

For the second game, swap the folder and idea (bot arena brawler: top-down, virtual
joystick left thumb, fire button right thumb, waves of bots, original names).

### Agent teams and the tmux panes (experimental)

Worker panes rely on Claude Code **agent teams**, which are experimental. The repo
enables them via `.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }, "teammateMode": "auto" }
```

With `teammateMode: "auto"`, teammates open as split panes when Claude Code runs
inside tmux (which `studio.sh` guarantees) and the orchestrator spawns a *named*
agent. If teammate panes do not appear:

1. Check your Claude Code version supports agent teams
   (`claude --version`; docs: https://code.claude.com/docs/en/agent-teams).
2. Try `"teammateMode": "tmux"` in `.claude/settings.json`. That opens teammates
   in a separate tmux session; Claude prints the attach command.
3. **Fallback:** remove the `env` block (or set the variable to `0`). The
   orchestrator then runs architect/developer/tester as ordinary in-process
   subagents. Everything else (loop, shipping) works the same; you just see
   their output summarised in the orchestrator pane instead of separate panes.
   Press Up/Down then Enter in the orchestrator pane to open a subagent's transcript.

Known limits from the docs: one team per session, teammates cannot spawn their own
teams, `/resume` does not restore in-process teammates.

## 5. How a task ships

1. Orchestrator spawns **developer** (sonnet) with one task from `games/<name>/TASKS.md`.
2. Developer implements it and runs `npm run check`. Never commits.
3. Orchestrator spawns **tester** (haiku), which adds/runs Vitest + Playwright tests
   and replies `PASS` or `FAIL` with evidence. It never edits `src/`.
4. On `PASS`, orchestrator runs `scripts/ship-task.sh "<game>: T## <title>"`, which
   re-runs `npm run check`, commits, and pushes the current branch. CI runs on every push.
5. On `FAIL`, back to step 1 with the evidence, at most 3 times, then it asks you.

Permissions in `.claude/settings.json` allow npm/npx, `git add/commit`, and
`git push origin`; they deny force pushes and reading `.env` files.

## 6. Adding a game

```sh
cp -R games/minigolf games/<name>
rm -rf games/<name>/node_modules games/<name>/dist
```

Edit `games/<name>/package.json` (name `@games/<name>`, a free `dev` port),
`src/logic/config.ts` (id and title) and `index.html` (title). Run `npm install`.
Playwright and CI pick up every folder under `games/` automatically. Then
hand the idea to the orchestrator and let the architect write SPEC.md and TASKS.md.

## 7. Android later

Each game builds to `games/<name>/dist` with a relative base path and a fixed
portrait 480x800 design resolution with FIT scaling. Wrapping with Capacitor is
`npx cap init` + `npx cap add android` pointing `webDir` at `dist`; no code changes
expected. Not added now to keep the repo lean.

## Rules baked into CLAUDE.md

- Game rules and maths are pure TypeScript in `src/logic/` (no Phaser) so Vitest tests them.
- `window.__GAME__` exposes the Phaser game for Playwright.
- Changing `packages/core` is its own task and must keep every game green.
- Touch only, 56px+ buttons, portrait 480x800.
- Original names, art and sounds. Copy mechanics, never branding or assets. No real-money mechanics.

## Reference material

Before running the architect for a game, drop phone screenshots and a short
`notes.md` into `games/<name>/reference/` (see the README there). Screenshots are
for mechanics only, are gitignored, and are never copied as assets.
