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
fmt_sq="'([^'\\\\]|\\\\.)*'"
fmt_dq='"([^"\\]|\\.)*"'
fmt_tq='`([^`\\]|\\.)*'
fmt_call='(^|[^[:alnum:]_$])(console\.(log|error|warn|info)|util\.format)[[:space:]]*\([[:space:]]*'
fmt_bad="$fmt_call(\$|[^'\"\`)[:space:]]|($fmt_sq|$fmt_dq|$fmt_tq\`)[[:space:]]*([^,)[:space:]]|\$)|$fmt_tq(\\\$\\{|\$))"
fmt_hits=$(grep -rnE --exclude-dir=node_modules --include='*.js' --include='*.mjs' -- "$fmt_bad" scripts tests sim src agent-team/evidence 2>/dev/null)
if [ -n "$fmt_hits" ]; then
  echo "GUARD FAIL [format-string-literal]: First argument of console.* and util.format must be a fixed string; use '%s' and pass the value after it"
  echo "$fmt_hits"; FAIL=1
fi
node scripts/conflict-markers.mjs || FAIL=1
node scripts/home-paths.mjs || FAIL=1
sm=scripts/smoke.mjs
smoke_fail () { echo "GUARD FAIL [smoke-shape]: $1"; FAIL=1; }
[ "$(grep -o 'p\.screenshot()' "$sm" | wc -l)" = 1 ] || smoke_fail "scripts/smoke.mjs must call p.screenshot() exactly once"
[ "$(grep -c 'nosemgrep' "$sm")" = 1 ] || smoke_fail "scripts/smoke.mjs must hold exactly one nosemgrep line"
[ "$(grep -E '^import ' "$sm" | tr -d '\r' | sha256sum | cut -c1-64)" = "df989a638c055a6a8bbd922ea1c0e95ff7a8d607b49fa84169a56c322cef3e23" ] || smoke_fail "scripts/smoke.mjs top-level imports changed"
grep -E 'import\(' "$sm" | grep -vqE "import\('/src/[a-z]+\.js'\)" && smoke_fail "every in-page import() in scripts/smoke.mjs must use a fixed '/src/...' path"
sed '2d' "$sm" | grep -qE 'child_process|exec|taskkill|tasklist|/IM' && smoke_fail "scripts/smoke.mjs may name child_process only in its line-2 import; no exec, taskkill, tasklist or /IM"
exit $FAIL