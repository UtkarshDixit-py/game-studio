#!/usr/bin/env bash
# Assemble the static site that gets deployed: site/<game>/ for every built game,
# plus the authored launcher. Run `npm run build` first.
#
# Skeleton games (no TASKS.md yet) are skipped so the public site only lists
# games that have actually been built out.
#
# Usage: scripts/build-site.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHA="${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo local)}"
STAMP="${SHA:0:7} · $(date -u '+%Y-%m-%d %H:%M') UTC"

rm -rf site
mkdir -p site

# The documented local preview serves site/ through the Vite dev server. Its
# asset plugin would otherwise re-inline small SVGs inside the prebuilt game
# bundle as URL-encoded data URLs, which Phaser's SVG loader cannot decode.
cat > site/vite.config.mjs <<'EOF'
export default { build: { assetsInlineLimit: 0 } };
EOF

# Shared UI assets are copied once; both the launcher and mechanics shells use
# relative URLs so the output works below a hosting prefix.
mkdir -p site/ui/styles site/ui/assets/fonts
cp packages/ui/src/styles/tokens.css site/ui/styles/tokens.css
cp packages/ui/src/styles/fonts.css site/ui/styles/fonts.css
cp scripts/site/launcher.css site/ui/styles/launcher.css
cp packages/ui/src/assets/fonts/NunitoSans-variable.ttf site/ui/assets/fonts/NunitoSans-variable.ttf
cp packages/ui/src/assets/fonts/OFL.txt site/ui/assets/fonts/OFL.txt

GAMES_JSON="$(mktemp)"
trap 'rm -f "$GAMES_JSON"' EXIT
: > "$GAMES_JSON"

count=0
for dir in games/*/; do
  name="$(basename "$dir")"
  [[ -f "$dir/TASKS.md" ]] || { echo "skip $name (skeleton, no TASKS.md)"; continue; }
  [[ -d "$dir/dist" ]] || { echo "error: $name has no dist/; run 'npm run build' first" >&2; exit 1; }
  if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "error: invalid game folder name '$name'" >&2
    exit 1
  fi

  mkdir -p "site/$name"
  cp -R "$dir/dist/." "site/$name/"

  mechanics=false
  if [[ -f "$dir/MECHANICS.html" ]]; then
    mechanics=true
    MECH_TITLE="$(sed -n 's:.*<title>\(.*\)</title>.*:\1:p' "$dir/MECHANICS.html" | head -1)"
    [[ -n "$MECH_TITLE" ]] || MECH_TITLE="$name mechanics"
    # A game's MECHANICS.html is a page body without a document shell; wrap it.
    # Its leading title/meta move into the shell head, so the output is valid
    # HTML while the source stays a standalone page body.
    {
      echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
      echo '<meta name="robots" content="noindex">'
      echo "<title>$(printf '%s' "$MECH_TITLE" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</title>"
      echo '<link rel="stylesheet" href="../ui/styles/tokens.css">'
      echo '<link rel="stylesheet" href="../ui/styles/fonts.css">'
      echo '<style>'
      echo 'html{background:var(--ui-background)}'
      echo 'body{margin:0;background:var(--ui-background);color:var(--ui-text);font-family:var(--ui-font)}'
      echo '.ui-back-wrap{max-width:880px;margin:0 auto}'
      echo '.ui-back{display:inline-flex;align-items:center;min-height:44px;color:var(--ui-text);font:600 16px/20px var(--ui-font);text-decoration:none}'
      echo '.ui-back:hover{text-decoration:underline}'
      echo '.ui-back:focus-visible{outline:3px solid var(--ui-text);outline-offset:2px}'
      echo 'main{display:block}'
      echo '</style></head><body>'
      echo '<div class="ui-back-wrap"><a class="ui-back" href="../">All games</a></div>'
      echo '<main>'
      awk 'NR==1 && /<title>/ { next } NR==2 && /claude:viewport-fit-sides/ { next } { print }' "$dir/MECHANICS.html"
      echo '</main></body></html>'
    } > "site/$name/mechanics.html"
  fi

  printf '{"id":"%s","mechanics":%s}\n' "$name" "$mechanics" >> "$GAMES_JSON"
  count=$((count + 1))
done

if (( count == 0 )); then
  echo "error: no games to publish" >&2
  exit 1
fi

# Render the authored launcher. Node is already required by the build; metadata
# is escaped here, never interpolated raw into the page.
node - "$ROOT/scripts/site/index.html" "$GAMES_JSON" "$STAMP" > site/index.html <<'NODE'
const fs = require('node:fs');
const [templatePath, gamesPath, stamp] = process.argv.slice(2);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const known = {
  minigolf: {
    title: 'Putt Duel',
    description: 'Three holes. You versus the bot.',
    play: 'Play Putt Duel',
    rules: 'Rules & mechanics',
    preview: `<svg viewBox="0 0 400 152" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="400" height="152" fill="#172334"/>
      <rect x="16" y="12" width="368" height="128" fill="#246342"/>
      <rect x="150" y="44" width="104" height="64" fill="#397EEB"/>
      <path d="M158 58 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" fill="none" stroke="#F4F7FF" stroke-width="1.5" opacity=".85"/>
      <path d="M158 78 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" fill="none" stroke="#F4F7FF" stroke-width="1.5" opacity=".85"/>
      <rect x="166" y="34" width="42" height="10" fill="#F0A45D" stroke="#49301E"/>
      <rect x="166" y="108" width="42" height="10" fill="#F0A45D" stroke="#49301E"/>
      <rect x="138" y="66" width="10" height="34" fill="#F0A45D" stroke="#49301E"/>
      <rect x="256" y="66" width="10" height="34" fill="#F0A45D" stroke="#49301E"/>
      <rect x="286" y="24" width="10" height="48" fill="#172334" stroke="#B8C4D9" stroke-width="1.5"/>
      <rect x="286" y="62" width="66" height="10" fill="#172334" stroke="#B8C4D9" stroke-width="1.5"/>
      <circle cx="338" cy="42" r="7" fill="#080D13"/>
      <rect x="44" y="102" width="34" height="26" fill="#F4F7FF" opacity=".92"/>
      <path d="M44 102h17v13H44zM61 115h17v13H61z" fill="#72829C"/>
      <circle cx="61" cy="115" r="4" fill="#F4F7FF"/>
      <polygon points="354,16 357,24 365,25 359,30 361,38 354,34 347,38 349,30 343,25 351,24" fill="#FFD76A"/>
    </svg>`,
  },
};

const neutralPreview = `<svg viewBox="0 0 400 152" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <rect width="400" height="152" fill="#1B2333"/>
  <rect x="24" y="24" width="352" height="104" rx="16" fill="#263249" stroke="#34425B"/>
  <circle cx="200" cy="76" r="26" fill="none" stroke="#72829C" stroke-width="3"/>
  <circle cx="200" cy="76" r="6" fill="#A99CFF"/>
  <circle cx="120" cy="76" r="4" fill="#65DFBD"/>
  <circle cx="280" cy="76" r="4" fill="#65DFBD"/>
</svg>`;

const titleFromId = (id) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const card = (game) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(game.id)) throw new Error(`Invalid game id ${game.id}`);
  const meta = known[game.id] ?? {
    title: titleFromId(game.id),
    description: 'A small game from Game Studio.',
    play: `Play ${titleFromId(game.id)}`,
    rules: 'Rules & mechanics',
    preview: neutralPreview,
  };
  const href = `./${game.id}/`;
  return `<article class="game-card">
      <div class="game-card__preview" aria-hidden="true">${meta.preview}</div>
      <div class="game-card__content">
        <h2 class="game-card__title">${escapeHtml(meta.title)}</h2>
        <p class="game-card__description">${escapeHtml(meta.description)}</p>
        <a class="game-card__play" href="${escapeHtml(href)}">${escapeHtml(meta.play)}</a>
        ${game.mechanics ? `<a class="game-card__rules" href="${escapeHtml(`${href}mechanics.html`)}">${escapeHtml(meta.rules)}</a>` : ''}
      </div>
    </article>`;
};

const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes('{{GAME_CARDS}}') || !template.includes('{{BUILD_STAMP}}')) {
  throw new Error('Launcher template is missing its insertion markers');
}
const games = fs.readFileSync(gamesPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const html = template
  .replace('{{GAME_CARDS}}', games.map(card).join('\n'))
  .replace('{{BUILD_STAMP}}', escapeHtml(stamp));
process.stdout.write(html);
NODE

echo "site ready: $count game(s)"
find site -maxdepth 2 | sort | head -30
