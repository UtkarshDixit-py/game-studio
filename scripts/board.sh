#!/usr/bin/env bash
# Progress board: task counts per game, recent commits, unpushed count.
# Refreshes every few seconds. Used by studio.sh in its second tmux window.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
INTERVAL="${BOARD_INTERVAL:-5}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }

while true; do
  clear
  bold "GAME STUDIO BOARD   $(date '+%H:%M:%S')   branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
  echo

  bold "Tasks"
  printf '  %-14s %5s %5s %5s  %s\n' game done todo total progress
  for dir in games/*/; do
    name="$(basename "$dir")"
    tasks="$dir/TASKS.md"
    if [[ -f "$tasks" ]]; then
      done_n=$(grep -cE '^- \[x\] T[0-9]+' "$tasks" || true)
      todo_n=$(grep -cE '^- \[ \] T[0-9]+' "$tasks" || true)
      total=$((done_n + todo_n))
      if (( total > 0 )); then
        filled=$(( done_n * 20 / total ))
        bar="$(printf '%*s' "$filled" '' | tr ' ' '#')$(printf '%*s' $((20 - filled)) '' | tr ' ' '.')"
      else
        bar="...................."
      fi
      printf '  %-14s %5s %5s %5s  [%s]\n' "$name" "$done_n" "$todo_n" "$total" "$bar"
    else
      printf '  %-14s %5s %5s %5s  %s\n' "$name" - - - "no TASKS.md yet (run architect)"
    fi
  done
  echo

  bold "Recent commits"
  git log --oneline --no-decorate -8 2>/dev/null | sed 's/^/  /' || dim "  no commits yet"
  echo

  bold "Sync"
  if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo '?')
    behind=$(git rev-list --count 'HEAD..@{u}' 2>/dev/null || echo '?')
    echo "  unpushed: $ahead   behind remote: $behind"
  else
    echo "  no upstream set (push once with: git push -u origin main)"
  fi
  dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo "  uncommitted changes: $dirty"
  echo
  dim "refresh ${INTERVAL}s   Ctrl-C to stop   prefix+w to switch windows"
  sleep "$INTERVAL"
done
