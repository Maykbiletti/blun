#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is not installed." >&2
  exit 1
fi

mapfile -d '' JS_FILES < <(find . -type f -name '*.js' \
  ! -path './node_modules/*' \
  ! -path './.git/*' \
  -print0)

if [ "${#JS_FILES[@]}" -eq 0 ]; then
  echo "No .js files found."
  exit 0
fi

echo "Running node -c on ${#JS_FILES[@]} JS files..."
for file in "${JS_FILES[@]}"; do
  node -c "$file" >/dev/null
done

echo "Running ESLint..."
eslint_status=0
npx --no-install eslint "${JS_FILES[@]}" || eslint_status=$?

echo "Running Prettier check..."
prettier_status=0
npx --no-install prettier --check "${JS_FILES[@]}" || prettier_status=$?

if [ "$eslint_status" -ne 0 ] || [ "$prettier_status" -ne 0 ]; then
  exit 1
fi

exit 0
