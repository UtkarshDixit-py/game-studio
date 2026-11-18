# Game Studio

An open-source monorepo for building small mobile web games with Phaser 3 and
TypeScript, where one Claude Code orchestrator runs architect, developer and
tester agents to build each game task by task. Every game is a portrait,
touch-only web app that can later be wrapped as an Android app.

**Play the games:** https://games-ten-steel.vercel.app

## Games

| Game | Folder | Status | Play |
| --- | --- | --- | --- |
| Putt Duel | `games/minigolf` | Playable. Mini golf match play against a bot, three holes with walls, sand, water, conveyors, portals, breakable props and stars. | [Open](https://games-ten-steel.vercel.app/minigolf/) |
| Bot Brawl | `games/botbrawl` | Skeleton only. Not built yet. | |

Each game has a `SPEC.md` (what it is) and a `TASKS.md` (the checklist it was
built from), both written by the architect agent.

## What is in here

```
packages/core/       @studio/core: bootstrap (FIT scaling, multi-touch), save data, maths, synth audio, BigButton
games/minigolf/      Putt Duel
games/botbrawl/      Bot Brawl skeleton
scripts/             studio.sh (tmux cockpit), ship-task.sh, board.sh, build-site.sh
CLAUDE.md            instructions for the orchestrator agent
.claude/agents/      architect, developer and tester agent definitions
.github/workflows/   ci.yml (check + browser tests on every push), pages.yml (optional, manual)
vercel.json          build and hosting config for the live site
```

Stack: Phaser 3, TypeScript, Vite, npm workspaces, Vitest for unit tests,
Playwright for browser tests in a phone viewport.

## Quick start

Needs Node 22+ and npm 10+.

```sh
git clone https://github.com/UtkarshDixit-py/game-studio.git
cd game-studio
npm install
npx playwright install chromium
npm run check                   # typecheck + unit tests + build every game
npm run e2e                     # Playwright tests, phone viewport, all games
npm run dev -w games/minigolf   # local dev server with live reload
```

### Testing on a phone

With the phone and the computer on the same Wi-Fi, run the dev server and open the
`Network: http://<ip>:<port>/` URL that Vite prints. If it does not load, the
network is isolating devices (common on office and guest Wi-Fi); use the phone's
hotspot instead.

## Deploying

`vercel.json` builds every game and serves `site/`: an index page plus
`/<game>/` for each built-out game. Skeletons without a `TASKS.md` are skipped
(see `scripts/build-site.sh`). To host your own copy on Vercel:

```sh
npm install --global vercel
vercel login
vercel deploy --prod --yes      # first run creates the project and prints the URL
```

Connect the GitHub repo to the project in the Vercel dashboard to deploy on every
push. Builds use `base: './'`, so the same output also works from a sub-folder on
any static host. `.github/workflows/pages.yml` is an optional GitHub Pages
deploy, off by default; see the comment at the top of that file.

## The agent studio

The games here were built by Claude Code agents. You talk to one orchestrator; it
plans, delegates and ships. You need [Claude Code](https://code.claude.com)
(`npm i -g @anthropic-ai/claude-code`), tmux (`brew install tmux`) and the GitHub
CLI (`brew install gh && gh auth login`).

```sh
scripts/studio.sh
```

This opens a tmux session with two windows:

- **studio**: Claude Code, the orchestrator, in a pane labelled `orchestrator`.
  Worker agents spawned as teammates appear as extra labelled panes.
- **board**: live progress board showing tasks done and to do per game, recent
  commits and the unpushed count. Switch windows with `Ctrl-b 1` and `Ctrl-b 0`.

### First prompt to the orchestrator

Paste something like:

```
Read CLAUDE.md. Run the architect for games/botbrawl with this idea:
"Top-down bot arena brawler. Virtual joystick under the left thumb, fire button
under the right thumb, waves of bots, original names." Show me TASKS.md, then
start the developer/tester loop from T01 and ship each passing task.
```

### How a task ships

1. The orchestrator spawns the **developer** with one task from `games/<name>/TASKS.md`.
2. The developer implements it and runs `npm run check`. It never commits.
3. The orchestrator spawns the **tester**, which adds and runs Vitest and
   Playwright tests and replies `PASS` or `FAIL` with evidence. It never edits `src/`.
4. On `PASS`, the orchestrator runs `scripts/ship-task.sh "<game>: T## <title>"`,
   which re-runs `npm run check`, commits and pushes the current branch.
5. On `FAIL`, it goes back to step 1 with the evidence, at most three times, then
   asks the human.

Permissions in `.claude/settings.json` allow npm, npx, `git add`, `git commit` and
`git push origin`. They deny force pushes and reading `.env` files.

### Agent teams and the tmux panes (experimental)

Worker panes rely on Claude Code **agent teams**, which are experimental. The repo
enables them in `.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }, "teammateMode": "auto" }
```

With `teammateMode: "auto"`, teammates open as split panes when Claude Code runs
inside tmux, which `studio.sh` guarantees, and the orchestrator spawns a named
agent. If teammate panes do not appear:

1. Check that your Claude Code version supports agent teams
   (`claude --version`; docs: https://code.claude.com/docs/en/agent-teams).
2. Try `"teammateMode": "tmux"` in `.claude/settings.json`. That opens teammates
   in a separate tmux session, and Claude prints the attach command.
3. **Fallback:** remove the `env` block or set the variable to `0`. The
   orchestrator then runs the workers as ordinary in-process subagents. The loop
   and shipping work the same; you see their output summarised in the
   orchestrator pane instead of in separate panes.

Known limits from the docs: one team per session, teammates cannot spawn their own
teams, and `/resume` does not restore in-process teammates.

## Adding a game

```sh
cp -R games/botbrawl games/<name>
rm -rf games/<name>/node_modules games/<name>/dist
```

Edit `games/<name>/package.json` (name `@games/<name>` and a free `dev` port),
`src/logic/config.ts` (id and title) and `index.html` (title). Run `npm install`.
Playwright and CI pick up every folder under `games/` automatically. Then hand the
idea to the orchestrator and let the architect write `SPEC.md` and `TASKS.md`.

Optionally drop phone screenshots and a short `notes.md` into
`games/<name>/reference/` first. Screenshots are for studying mechanics only, are
gitignored, and are never copied as assets.

## Architecture rules

These are enforced through `CLAUDE.md` and the agent definitions.

- Game rules and maths are pure TypeScript in `src/logic/` with no Phaser imports,
  so Vitest can test them. Scenes stay thin.
- `window.__GAME__` exposes the Phaser game so Playwright can inspect it.
- Changing `packages/core` is its own task and must keep every game green.
- Mobile first: touch only, buttons 56px or larger, portrait 480x800.
- Original names, art and sounds only. Mechanics may be borrowed; branding and
  assets never are. No real-money mechanics anywhere.

## Android later

Each game builds to `games/<name>/dist` with a relative base path and a fixed
portrait 480x800 design resolution with FIT scaling. Wrapping with Capacitor is
`npx cap init` plus `npx cap add android` with `webDir` pointing at `dist`. It is
not added yet, to keep the repo lean.

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run
`npm run check` and `npm run e2e`, and keep to the architecture rules above.

## License

[MIT](LICENSE). All game names, art and sounds in this repo are original.
