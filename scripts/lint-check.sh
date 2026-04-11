#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 2

START_TS="$(date +%s)"
CHECK_MODE="${1:-all}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue() { printf '\033[34m%s\033[0m\n' "$*"; }

is_excluded_path() {
  local path="$1"
  case "$path" in
    ./node_modules/*|./.git/*|./dist/*|./build/*|./coverage/*|./tmp/*|./admin/dist/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

collect_files() {
  local ext="$1"
  while IFS= read -r -d '' file; do
    if is_excluded_path "$file"; then
      continue
    fi
    printf '%s\0' "$file"
  done < <(find . -type f -name "*.${ext}" -print0)
}

run_js_checks() {
  local file
  local checked=0
  blue "[js] node --check started"

  while IFS= read -r -d '' file; do
    checked=$((checked + 1))
    if node --check "$file" >/tmp/lint-check-js.out 2>/tmp/lint-check-js.err; then
      PASS_COUNT=$((PASS_COUNT + 1))
      printf '[PASS] %s\n' "$file"
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
      red "[FAIL] $file"
      sed 's/^/  /' /tmp/lint-check-js.err
    fi
  done < <(collect_files "js")

  if [ "$checked" -eq 0 ]; then
    yellow "[js] no files found"
    SKIP_COUNT=$((SKIP_COUNT + 1))
  fi
}

run_sh_checks() {
  local file
  local checked=0
  blue "[sh] bash -n started"

  while IFS= read -r -d '' file; do
    checked=$((checked + 1))
    if bash -n "$file" >/tmp/lint-check-sh.out 2>/tmp/lint-check-sh.err; then
      PASS_COUNT=$((PASS_COUNT + 1))
      printf '[PASS] %s\n' "$file"
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
      red "[FAIL] $file"
      sed 's/^/  /' /tmp/lint-check-sh.err
    fi
  done < <(collect_files "sh")

  if [ "$checked" -eq 0 ]; then
    yellow "[sh] no files found"
    SKIP_COUNT=$((SKIP_COUNT + 1))
  fi
}

run_json_checks() {
  local file
  local checked=0
  blue "[json] JSON.parse started"

  while IFS= read -r -d '' file; do
    checked=$((checked + 1))
    if node -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1],"utf8"));' "$file" >/tmp/lint-check-json.out 2>/tmp/lint-check-json.err; then
      PASS_COUNT=$((PASS_COUNT + 1))
      printf '[PASS] %s\n' "$file"
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
      red "[FAIL] $file"
      sed 's/^/  /' /tmp/lint-check-json.err
    fi
  done < <(collect_files "json")

  if [ "$checked" -eq 0 ]; then
    yellow "[json] no files found"
    SKIP_COUNT=$((SKIP_COUNT + 1))
  fi
}

show_usage() {
  cat <<'USAGE'
Usage: scripts/lint-check.sh [all|js|sh|json]
  all   run all checks (default)
  js    run Node syntax checks for .js files
  sh    run Bash syntax checks for .sh files
  json  run JSON parse checks for .json files
USAGE
}

run_mode() {
  case "$CHECK_MODE" in
    all)
      run_js_checks
      run_sh_checks
      run_json_checks
      ;;
    js)
      run_js_checks
      ;;
    sh)
      run_sh_checks
      ;;
    json)
      run_json_checks
      ;;
    -h|--help|help)
      show_usage
      exit 0
      ;;
    *)
      red "Unknown mode: $CHECK_MODE"
      show_usage
      exit 2
      ;;
  esac
}

run_mode

END_TS="$(date +%s)"
DURATION="$((END_TS - START_TS))"

echo ""
echo "Summary"
echo "  pass: $PASS_COUNT"
echo "  fail: $FAIL_COUNT"
echo "  skip: $SKIP_COUNT"
echo "  took: ${DURATION}s"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
