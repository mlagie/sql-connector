#!/usr/bin/env bash

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

MIN_COVERAGE=90
COVERAGE_FILE="coverage/coverage-final.json"

# ============================================================================
# Validation
# ============================================================================

if [ ! -f "$COVERAGE_FILE" ]; then
    echo "❌ Coverage file not found: $COVERAGE_FILE"
    exit 1
fi

# ============================================================================
# Coverage calculation
# ============================================================================

read stmt_pct branch_pct func_pct <<< "$(jq -r '
def statements_pct:
    ([ .[] | .s | to_entries[] ] as $s
    | if ($s | length) == 0
      then 100
      else (([$s[] | select(.value > 0)] | length) * 100 / ($s | length))
      end);

def branches_pct:
    ([ .[] | .b | to_entries[] | .value[] ] as $b
    | if ($b | length) == 0
      then 100
      else (([$b[] | select(. > 0)] | length) * 100 / ($b | length))
      end);

def functions_pct:
    ([ .[] | .f | to_entries[] ] as $f
    | if ($f | length) == 0
      then 100
      else (([$f[] | select(.value > 0)] | length) * 100 / ($f | length))
      end);

[
    statements_pct,
    branches_pct,
    functions_pct
] | @tsv
' "$COVERAGE_FILE")"

# coverage-final.json ne contient pas directement les lignes
# On utilise les statements comme approximation
lines_pct="$stmt_pct"

# Formatage sur 2 décimales
stmt_pct=$(printf "%.2f" "$stmt_pct")
branch_pct=$(printf "%.2f" "$branch_pct")
func_pct=$(printf "%.2f" "$func_pct")
lines_pct=$(printf "%.2f" "$lines_pct")

average=$(awk "BEGIN {
    printf \"%.2f\", ($stmt_pct + $branch_pct + $func_pct + $lines_pct) / 4
}")

# ============================================================================
# Report
# ============================================================================

echo "Coverage Report"
echo "=============================="
printf "Statements : %.2f%%\n" "$stmt_pct"
printf "Branches   : %.2f%%\n" "$branch_pct"
printf "Functions  : %.2f%%\n" "$func_pct"
printf "Lines      : %.2f%%\n" "$lines_pct"
echo "------------------------------"
printf "Average    : %.2f%%\n" "$average"
printf "Required   : %.2f%%\n" "$MIN_COVERAGE"
echo "=============================="

# ============================================================================
# Threshold check
# ============================================================================

if awk "BEGIN { exit !($average >= $MIN_COVERAGE) }"; then
    echo "✅ Coverage threshold reached"
    exit 0
else
    echo "❌ Coverage threshold not reached"
    exit 1
fi