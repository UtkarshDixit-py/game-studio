#!/usr/bin/env bash
# Start the studio cockpit in tmux:
#   window "studio": orchestrator (Claude Code) on the left; worker agents appear as
#                    labelled panes when Claude Code spawns teammates (agent teams).
#   window "board":  live progress board (scripts/board.sh).
#
# Usage: scripts/studio.sh [extra claude args]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="${STUDIO_SESSION:-studio}"

command -v tmux >/dev/null || { echo "tmux not found: brew install tmux" >&2; exit 1; }
command -v claude >/dev/null || { echo "claude not found: npm i -g @anthropic-ai/claude-code" >&2; exit 1; }

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "session '$SESSION' already running"
  if [[ -t 0 ]]; then exec tmux attach -t "$SESSION"; else echo "Attach with:  tmux attach -t $SESSION"; fi
  exit 0
fi

# Agent teams are experimental. These env vars mirror .claude/settings.json so the
# orchestrator opens teammates as split panes inside this window (teammateMode auto).
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

tmux new-session -d -s "$SESSION" -n studio -c "$ROOT" -x 220 -y 60

# Pane border titles show each role. Claude Code names teammate panes after the
# teammate; the lead pane is labelled here.
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "
tmux set-option -t "$SESSION" mouse on
tmux set-option -t "$SESSION" allow-rename off

tmux select-pane -t "$SESSION:studio.0" -T "orchestrator"
tmux send-keys -t "$SESSION:studio.0" "cd '$ROOT' && claude $*" C-m

tmux new-window -t "$SESSION" -n board -c "$ROOT"
tmux select-pane -t "$SESSION:board.0" -T "progress board"
tmux send-keys -t "$SESSION:board.0" "cd '$ROOT' && scripts/board.sh" C-m

tmux select-window -t "$SESSION:studio"
if [[ -t 0 ]]; then
  exec tmux attach -t "$SESSION"
else
  echo "studio session started. Attach with:  tmux attach -t $SESSION"
fi
