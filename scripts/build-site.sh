#!/usr/bin/env bash
# Assemble the static site that gets deployed: site/<game>/ for every built game,
# plus an index page linking to them. Run `npm run build` first.
#
# Skeleton games (no TASKS.md yet) are skipped so the public site only lists
# games that have actually been built out.
#
# Usage: scripts/build-site.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHA="${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo local)}"
STAMP="${SHA:0:7} &middot; $(date -u '+%Y-%m-%d %H:%M') UTC"

rm -rf site
mkdir -p site

links=""
count=0
for dir in games/*/; do
  name="$(basename "$dir")"
  [[ -f "$dir/TASKS.md" ]] || { echo "skip $name (skeleton, no TASKS.md)"; continue; }
  [[ -d "$dir/dist" ]] || { echo "error: $name has no dist/; run 'npm run build' first" >&2; exit 1; }
  mkdir -p "site/$name"
  cp -R "$dir/dist/." "site/$name/"
  links+="<a href=\"./$name/\">$name</a>"
  # A game's MECHANICS.html is a page body without a document shell; wrap it.
  if [[ -f "$dir/MECHANICS.html" ]]; then
    {
      echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
      echo '<style>body{margin:0}</style></head><body>'
      cat "$dir/MECHANICS.html"
      echo '</body></html>'
    } > "site/$name/mechanics.html"
    links+="<a class=\"sub\" href=\"./$name/mechanics.html\">$name mechanics</a>"
  fi
  count=$((count + 1))
done

if (( count == 0 )); then
  echo "error: no games to publish" >&2
  exit 1
fi

cat > site/index.html <<EOF
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Game Studio</title>
<style>
body{font-family:sans-serif;background:#111;color:#eee;margin:0;padding:24px}
a{display:block;padding:20px;margin:12px 0;background:#2563eb;color:#fff;border-radius:12px;
text-decoration:none;font-size:22px;font-weight:bold;text-align:center;text-transform:capitalize}
a.sub{background:none;border:1px solid #444;color:#ccc;font-size:15px;font-weight:normal;padding:12px;margin-top:-4px}
p{color:#888;font-size:13px}
</style>
</head>
<body>
<h1>Game Studio</h1>
$links
<p>Build $STAMP</p>
</body>
</html>
EOF

echo "site ready: $count game(s)"
find site -maxdepth 2 | sort | head -30
