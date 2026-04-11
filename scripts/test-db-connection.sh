#!/usr/bin/env bash
set -uo pipefail

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
DB="${PGDATABASE:-postgres}"
USER_NAME="${PGUSER:-postgres}"
QUERY="${TEST_QUERY:-SELECT NOW();}"

json_escape() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

if ! command -v psql >/dev/null 2>&1; then
  printf '{"ok":false,"error":"psql_not_found"}\n'
  exit 1
fi

CONN_URI="postgresql://${USER_NAME}@${HOST}:${PORT}/${DB}"

if ! CONNECTION_CHECK=$(psql "$CONN_URI" -tA -c "SELECT 1" 2>&1); then
  ERROR_ESCAPED=$(printf '%s' "$CONNECTION_CHECK" | json_escape)
  printf '{"ok":false,"error":"connection_failed","details":"%s"}\n' "$ERROR_ESCAPED"
  exit 1
fi

if ! TABLE_COUNT=$(psql "$CONN_URI" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>&1); then
  ERROR_ESCAPED=$(printf '%s' "$TABLE_COUNT" | json_escape)
  printf '{"ok":false,"error":"table_count_failed","details":"%s"}\n' "$ERROR_ESCAPED"
  exit 1
fi

if ! TEST_RESULT=$(psql "$CONN_URI" -tA -c "$QUERY" 2>&1); then
  ERROR_ESCAPED=$(printf '%s' "$TEST_RESULT" | json_escape)
  printf '{"ok":false,"error":"test_query_failed","details":"%s"}\n' "$ERROR_ESCAPED"
  exit 1
fi

TABLE_COUNT_CLEAN=$(printf '%s' "$TABLE_COUNT" | tr -d '[:space:]')
TEST_RESULT_CLEAN=$(printf '%s' "$TEST_RESULT" | sed '/^[[:space:]]*$/d')
TEST_RESULT_ESCAPED=$(printf '%s' "$TEST_RESULT_CLEAN" | json_escape)

printf '{'
printf '"ok":true,'
printf '"connection":"ok",'
printf '"host":"%s",' "$HOST"
printf '"port":%s,' "$PORT"
printf '"database":"%s",' "$DB"
printf '"user":"%s",' "$USER_NAME"
printf '"tableCount":%s,' "${TABLE_COUNT_CLEAN:-0}"
printf '"testQuery":"%s",' "$(printf '%s' "$QUERY" | json_escape)"
printf '"testResult":"%s"' "$TEST_RESULT_ESCAPED"
printf '}\n'
