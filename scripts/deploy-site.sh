#!/usr/bin/env bash
# Build every game, assemble site/, and deploy that static folder to Vercel.
#
# The upload is made from a temporary copy outside the git repo, so Vercel
# receives plain built files with no commit attached. That keeps source code
# off Vercel and avoids its commit-author check, which blocks CLI deploys on
# the Hobby plan when it cannot match the commit author to the account.
#
# Needs the Vercel CLI, a login, and a linked project (.vercel/project.json;
# created by the first `vercel deploy` or by `vercel link`).
#
# Usage: scripts/deploy-site.sh            # production
#        scripts/deploy-site.sh --preview  # private preview deployment
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="--prod"
if [[ "${1:-}" == "--preview" ]]; then TARGET=""; fi

command -v vercel >/dev/null || { echo "vercel CLI not found: npm install --global vercel" >&2; exit 1; }
[[ -f .vercel/project.json ]] || { echo "project not linked: run 'vercel link' once" >&2; exit 1; }

echo "==> build"
npm run build
bash scripts/build-site.sh

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/site" "$TMP/.vercel"
cp -R site/. "$TMP/site/"
cp .vercel/project.json "$TMP/.vercel/project.json"
# Same settings as the repo's vercel.json, but with install and build switched
# off: the files are already built.
cat > "$TMP/vercel.json" <<'JSON'
{
  "framework": null,
  "installCommand": "",
  "buildCommand": "",
  "outputDirectory": "site",
  "trailingSlash": true
}
JSON

echo "==> deploy ${TARGET:-preview}"
cd "$TMP"
# TARGET is empty for a preview; ${TARGET:+...} drops it instead of passing "".
vercel deploy ${TARGET:+"$TARGET"} --yes
