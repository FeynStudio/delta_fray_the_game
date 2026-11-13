#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
FAIL=0
guard () {
  local hits ex=()
  [ -n "${5:-}" ] && ex=(--exclude="$5")
  hits=$(grep -rnE --exclude-dir=node_modules "${ex[@]}" -- "$2" "$3" 2>/dev/null)
  if [ -n "$hits" ]; then echo "GUARD FAIL [$1]: $4"; echo "$hits"; FAIL=1; fi
}
need () {
  if [ ! -e "$2" ]; then echo "GUARD FAIL [$1]: $3"; FAIL=1; fi
}
 
guard "no-hack-markers" 'TODO|FIXME|HACK|XXX' \
  src "Fix it now or log it in agent-team/BACKLOG.md"
guard "no-debug-prints" 'console\.(log|warn|error|info|debug)\(|debugger' \
  src "Use the project logger in src/log.js" "log.js"
guard "no-silent-catch" 'catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{[[:space:]]*\}' \
  src "Handle the error or log it with src/log.js"
guard "no-frameworks" "from ['\"](react|vue|phaser|pixi|three|lodash|babylon|kaboom)" \
  src "Plain JavaScript only, no frameworks or game engines"
guard "no-cdn-engines" "<script[^>]*src=['\"][^'\"]*(react|vue|phaser|pixi|three|lodash|babylon|kaboom)" \
  index.html "Plain JavaScript only, no frameworks or game engines"
 
need "rules-exists" src/rules.js "src/rules.js must exist and hold all game rules"
guard "rules-no-dom" '(^|[^[:alnum:]_$])(document|window|canvas|getContext|addEventListener)([^[:alnum:]_$]|$)' \
  src/rules.js "rules.js stays pure; move DOM and canvas code to render.js or input.js"
guard "rules-no-timing" '(^|[^[:alnum:]_$])(requestAnimationFrame|performance|Date|setTimeout|setInterval)([^[:alnum:]_$]|$)' \
  src/rules.js "rules.js stays pure; pass time in as an argument from game.js"
guard "rules-no-random" 'Math\.random' \
  src/rules.js "rules.js must be deterministic; pass any randomness in as an argument"
guard "rules-imports-config-only" "from ['\"](\./(input|render|game|log)\.js|[^.'\"])|import\(|require\(" \
  src/rules.js "rules.js may only import ./config.js"
guard "render-no-state-change" '(^|[^[:alnum:]_$])state\.[A-Za-z_.]+[[:space:]]*(=[^=]|\+=|-=|\+\+|--)' \
  src/render.js "render.js reads state only; change state in rules.js or game.js"
guard "no-magic-numbers" '(^|[^[:alnum:]_$])(1280|960|150|900)([^[:alnum:]_$]|$)' \
  src "Read tunable values from src/config.js" "config.js"
node scripts/no-comments.mjs || FAIL=1
exit $FAIL