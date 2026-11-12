#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 2
total=0; passed=0
for f in tests/*.test.js; do
  tap=$(node --test --test-reporter=tap "$f" 2>&1)
  echo "$tap" | grep -E '^(not )?ok [0-9]+ - ' | sed "s|^|$f: |"
  total=$((total + $(echo "$tap" | grep -E '^# tests ' | sed 's/[^0-9]//g')))
  passed=$((passed + $(echo "$tap" | grep -E '^# pass ' | sed 's/[^0-9]//g')))
done
echo "TOTAL tests: $total  pass: $passed  fail: $((total - passed))"
