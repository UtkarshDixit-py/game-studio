#!/usr/bin/env bash
# Ship one passing task: run the full check, commit everything, push the current branch.
# The orchestrator runs this ONLY after the tester replied PASS.
#
# Usage: scripts/ship-task.sh "minigolf: T03 ball friction"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "usage: scripts/ship-task.sh \"<commit message>\"" >&2
  exit 2
fi
case "$MSG" in
  *--force*|*-f\ *|*--mirror*) echo "refusing: message looks like a git flag" >&2; exit 2 ;;
esac

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  echo "refusing: detached HEAD" >&2
  exit 2
fi

echo "==> npm run check"
npm run check

if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
  echo "==> nothing to commit"
else
  echo "==> commit"
  git add -A
  git commit -q -m "$MSG"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "==> push origin $BRANCH"
  # Plain push only. Never force, never delete, never mirror.
  git push origin "$BRANCH"
else
  echo "==> no 'origin' remote yet; committed locally only. See README to create the GitHub repo." >&2
fi

echo "==> shipped: $MSG"
