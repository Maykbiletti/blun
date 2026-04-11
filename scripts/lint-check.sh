#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

MODE="all"
COLOR="1"
VERBOSE="0"

START_TS="$(date +%s)"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

ESLINT_EXTENSIONS=("js" "cjs" "mjs" "jsx" "ts" "tsx")
PRETTIER_EXTENSIONS=("js" "cjs" "mjs" "jsx" "ts" "tsx" "json" "md" "yml" "yaml" "css" "scss" "html")

usage() {
  cat <<'USAGE'
Usage: scripts/lint-check.sh [options]

Options:
  --all           check all tracked files (default)
  --changed       check changed files in working tree + staged
  --staged        check staged files only
  --no-color      disable ANSI colors
  --verbose       print additional debug output
  -h, --help      show help

Checks:
  1) node -c for JavaScript files
  2) ESLint with --max-warnings=0
  3) Prettier --check
USAGE
}

color() {
  local code="$1"
  shift

  if [[ "$COLOR" == "1" ]]; then
    printf '\033[%sm%s\033[0m\n' "$code" "$*"
  else
    printf '%s\n' "$*"
  fi
}

info() {
  color "34" "$*"
}

ok() {
  color "32" "$*"
}

warn() {
  color "33" "$*"
}

err() {
  color "31" "$*"
}

debug() {
  if [[ "$VERBOSE" == "1" ]]; then
    printf '[debug] %s\n' "$*"
  fi
}

is_excluded() {
  local path="$1"

  case "$path" in
    node_modules/*|.git/*|dist/*|build/*|coverage/*|tmp/*|admin/dist/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

contains_extension() {
  local file="$1"
  shift
  local ext

  for ext in "$@"; do
    if [[ "$file" == *."$ext" ]]; then
      return 0
    fi
  done

  return 1
}

collect_files_all() {
  git ls-files
}

collect_files_changed() {
  {
    git diff --name-only
    git diff --cached --name-only
  } | awk 'NF' | sort -u
}

collect_files_staged() {
  git diff --cached --name-only
}

collect_candidate_files() {
  local source_cmd="$1"

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    [[ -f "$file" ]] || continue
    is_excluded "$file" && continue
    printf '%s\n' "$file"
  done < <($source_cmd)
}

resolve_bin() {
  local name="$1"

  if [[ -x "./node_modules/.bin/$name" ]]; then
    printf '%s\n' "./node_modules/.bin/$name"
    return 0
  fi

  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  return 1
}

run_node_syntax_check() {
  local -a js_files=("$@")
  local file

  if [[ ${#js_files[@]} -eq 0 ]]; then
    warn "[node -c] no JavaScript files found"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    return 0
  fi

  info "[node -c] checking ${#js_files[@]} JavaScript files"

  for file in "${js_files[@]}"; do
    if node -c "$file" >/tmp/lint-check-nodec.out 2>/tmp/lint-check-nodec.err; then
      PASS_COUNT=$((PASS_COUNT + 1))
      debug "node -c pass: $file"
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
      err "[node -c] failed: $file"
      sed 's/^/  /' /tmp/lint-check-nodec.err
    fi
  done
}

run_eslint_check() {
  local -a eslint_files=("$@")
  local eslint_bin

  if [[ ${#eslint_files[@]} -eq 0 ]]; then
    warn "[eslint] no matching files found"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    return 0
  fi

  if ! eslint_bin="$(resolve_bin eslint)"; then
    err "[eslint] binary not found (install eslint)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 0
  fi

  info "[eslint] checking ${#eslint_files[@]} files"

  if "$eslint_bin" --max-warnings=0 "${eslint_files[@]}" >/tmp/lint-check-eslint.out 2>/tmp/lint-check-eslint.err; then
    PASS_COUNT=$((PASS_COUNT + 1))
    ok "[eslint] passed"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    err "[eslint] failed"
    sed 's/^/  /' /tmp/lint-check-eslint.err
  fi
}

run_prettier_check() {
  local -a prettier_files=("$@")
  local prettier_bin

  if [[ ${#prettier_files[@]} -eq 0 ]]; then
    warn "[prettier] no matching files found"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    return 0
  fi

  if ! prettier_bin="$(resolve_bin prettier)"; then
    err "[prettier] binary not found (install prettier)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 0
  fi

  info "[prettier] checking ${#prettier_files[@]} files"

  if "$prettier_bin" --check "${prettier_files[@]}" >/tmp/lint-check-prettier.out 2>/tmp/lint-check-prettier.err; then
    PASS_COUNT=$((PASS_COUNT + 1))
    ok "[prettier] passed"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    err "[prettier] failed"
    sed 's/^/  /' /tmp/lint-check-prettier.err
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      MODE="all"
      ;;
    --changed)
      MODE="changed"
      ;;
    --staged)
      MODE="staged"
      ;;
    --no-color)
      COLOR="0"
      ;;
    --verbose)
      VERBOSE="1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "unknown option: $1"
      usage
      exit 2
      ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1; then
  err "node is required but not found"
  exit 2
fi

SOURCE_CMD="collect_files_all"
if [[ "$MODE" == "changed" ]]; then
  SOURCE_CMD="collect_files_changed"
elif [[ "$MODE" == "staged" ]]; then
  SOURCE_CMD="collect_files_staged"
fi

mapfile -t CANDIDATE_FILES < <(collect_candidate_files "$SOURCE_CMD")

if [[ ${#CANDIDATE_FILES[@]} -eq 0 ]]; then
  warn "no files found for mode: $MODE"
  exit 0
fi

ESLINT_FILES=()
PRETTIER_FILES=()
JS_FILES=()

for file in "${CANDIDATE_FILES[@]}"; do
  if contains_extension "$file" "${ESLINT_EXTENSIONS[@]}"; then
    ESLINT_FILES+=("$file")
  fi

  if contains_extension "$file" "${PRETTIER_EXTENSIONS[@]}"; then
    PRETTIER_FILES+=("$file")
  fi

  if [[ "$file" == *.js || "$file" == *.cjs || "$file" == *.mjs ]]; then
    JS_FILES+=("$file")
  fi
done

run_node_syntax_check "${JS_FILES[@]}"
run_eslint_check "${ESLINT_FILES[@]}"
run_prettier_check "${PRETTIER_FILES[@]}"

END_TS="$(date +%s)"
DURATION="$((END_TS - START_TS))"

printf '\nSummary\n'
printf '  mode: %s\n' "$MODE"
printf '  pass: %s\n' "$PASS_COUNT"
printf '  fail: %s\n' "$FAIL_COUNT"
printf '  skip: %s\n' "$SKIP_COUNT"
printf '  took: %ss\n' "$DURATION"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi

exit 0
