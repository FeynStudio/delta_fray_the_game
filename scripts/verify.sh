#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
TASK=${1:-adhoc}; shift || true
FEATURE=all; LABEL=run
while [ $# -gt 0 ]; do
  case $1 in
    --feature) FEATURE=${2:-}; shift 2 || shift;;
    --label) LABEL=${2:-}; shift 2 || shift;;
    *) shift;;
  esac
done
case $FEATURE in
  all|render|input|movement|hits|turns|config|balance) ;;
  *) echo "Unknown feature: '$FEATURE' (use render|input|movement|hits|turns|config|balance|all)"; exit 2;;
esac
OUT=agent-team/evidence/$TASK; mkdir -p "$OUT"
LOG="$OUT/$LABEL-$FEATURE.log"; FAIL=0
echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo none)  branch: $(git branch --show-current 2>/dev/null || echo none)  $(date -u +%FT%TZ)" | tee "$LOG"
 
check () {
  local name=$1; shift
  if "$@" >>"$LOG" 2>&1; then echo "PASS $name" | tee -a "$LOG"
  else echo "FAIL $name" | tee -a "$LOG"; FAIL=1; fi
}
 
want () { [ "$FEATURE" = all ] || [ "$FEATURE" = "$1" ]; }
 
scenario () {
  local f=$1
  check "$f scenario runs" node scripts/run-scenario.mjs "scenarios/$f.json" --out "$OUT/$f.json"
  check "$f output" diff -u "expected/$f.json" "$OUT/$f.json"
}
 
smoke () {
  local f=$1
  check "$f browser runs" node scripts/smoke.mjs --feature "$f" --out "$OUT/$f-smoke.json"
  check "$f browser output" diff -u "expected/$f-smoke.json" "$OUT/$f-smoke.json"
}
 
check "guards" ./scripts/guards.sh
check "lint" bash -c 'shopt -s nullglob; files=(src/*.js tests/*.js scripts/*.mjs); [ ${#files[@]} -gt 0 ] || exit 1; for f in "${files[@]}"; do node --check "$f" || exit 1; done'
check "unit tests" bash -c 'shopt -s nullglob; files=(tests/*.test.js); [ ${#files[@]} -gt 0 ] || exit 1; node --test "${files[@]}"'
 
if want render; then
  smoke render
fi
 
if want input; then
  smoke input
fi
 
if want movement; then
  scenario movement
fi
 
if want hits; then
  scenario hits
fi
 
if want turns; then
  scenario turns
  smoke turns
fi
 
if want config; then
  check "config: no magic numbers" bash -c 'shopt -s nullglob; for f in src/*.js; do [ "$(basename "$f")" = config.js ] && continue; grep -nwE "1280|960|150|900" "$f" && exit 1; done; exit 0'
  check "config: override honored" node scripts/run-scenario.mjs scenarios/config-override.json --out "$OUT/config.json"
  check "config output" diff -u expected/config.json "$OUT/config.json"
fi

if want balance; then
  check "balance sim" node sim/balance.mjs --games 2000 --out "$OUT/balance.json"
fi

echo "RESULT: $([ $FAIL = 0 ] && echo PASS || echo FAIL)" | tee -a "$LOG"
exit $FAIL