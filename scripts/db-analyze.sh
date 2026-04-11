#!/usr/bin/env bash
set -euo pipefail

TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${DB_ANALYZE_OUTPUT_DIR:-./tmp/db-audit}"
ANALYZE_LOG="${OUT_DIR}/analyze-${TS}.log"
CSV_FILE="${OUT_DIR}/index-fragmentation-${TS}.csv"

mkdir -p "${OUT_DIR}"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found in PATH" >&2
  exit 1
fi

DB_HOST="${BLUN_DB_HOST:-localhost}"
DB_PORT="${BLUN_DB_PORT:-5432}"
DB_NAME="${BLUN_DB_NAME:-blun}"
DB_USER="${BLUN_DB_USER:-postgres}"
DB_PASSWORD="${BLUN_DB_PASSWORD:-${PGPASSWORD:-}}"

PSQL_BASE=(psql -v ON_ERROR_STOP=1 -X)
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL_CONN=("${DATABASE_URL}")
else
  PSQL_CONN=( -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" )
fi

run_psql() {
  PGPASSWORD="${DB_PASSWORD}" "${PSQL_BASE[@]}" "${PSQL_CONN[@]}" "$@"
}

echo "[${TS}] running ANALYZE ..."
run_psql -c "ANALYZE VERBOSE;" >"${ANALYZE_LOG}" 2>&1

echo "[${TS}] exporting index fragmentation report ..."

HAS_PGSTATINDEX="$({
  run_psql -At -c "SELECT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'pgstatindex');"
} 2>/dev/null || echo "f")"

if [[ "${HAS_PGSTATINDEX}" == "t" ]]; then
  set +e
  run_psql -c "\\copy (
WITH idx AS (
  SELECT
    n.nspname AS schema_name,
    t.relname AS table_name,
    i.relname AS index_name,
    am.amname AS access_method,
    i.oid AS index_oid,
    pg_relation_size(i.oid) AS index_size_bytes,
    COALESCE(s.idx_scan, 0) AS idx_scan,
    COALESCE(s.idx_tup_read, 0) AS idx_tup_read,
    COALESCE(s.idx_tup_fetch, 0) AS idx_tup_fetch
  FROM pg_class i
  JOIN pg_index x ON x.indexrelid = i.oid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = i.relam
  LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
  WHERE i.relkind = 'i'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT
  schema_name,
  table_name,
  index_name,
  access_method,
  index_size_bytes,
  pg_size_pretty(index_size_bytes) AS index_size,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  ROUND(COALESCE(psi.avg_leaf_density, 0)::numeric, 2) AS avg_leaf_density_pct,
  ROUND(COALESCE(psi.leaf_fragmentation, 0)::numeric, 2) AS leaf_fragmentation_pct,
  CASE
    WHEN psi.leaf_fragmentation IS NULL THEN 'n/a'
    WHEN psi.leaf_fragmentation >= 30 THEN 'high'
    WHEN psi.leaf_fragmentation >= 15 THEN 'medium'
    ELSE 'low'
  END AS fragmentation_level
FROM idx
LEFT JOIN LATERAL (
  SELECT
    (pgstatindex(idx.index_oid)).avg_leaf_density AS avg_leaf_density,
    (pgstatindex(idx.index_oid)).leaf_fragmentation AS leaf_fragmentation
  WHERE idx.access_method = 'btree'
) psi ON TRUE
ORDER BY leaf_fragmentation_pct DESC NULLS LAST, index_size_bytes DESC
) TO STDOUT WITH CSV HEADER;" >"${CSV_FILE}" 2>>"${ANALYZE_LOG}"
  rc=$?
  set -e
else
  rc=1
fi

if [[ ${rc} -ne 0 ]]; then
  run_psql -c "\\copy (
WITH idx AS (
  SELECT
    n.nspname AS schema_name,
    t.relname AS table_name,
    i.relname AS index_name,
    am.amname AS access_method,
    pg_relation_size(i.oid) AS index_size_bytes,
    COALESCE(s.idx_scan, 0) AS idx_scan,
    COALESCE(s.idx_tup_read, 0) AS idx_tup_read,
    COALESCE(s.idx_tup_fetch, 0) AS idx_tup_fetch
  FROM pg_class i
  JOIN pg_index x ON x.indexrelid = i.oid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = i.relam
  LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
  WHERE i.relkind = 'i'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT
  schema_name,
  table_name,
  index_name,
  access_method,
  index_size_bytes,
  pg_size_pretty(index_size_bytes) AS index_size,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  CASE
    WHEN idx_tup_read > 0 THEN ROUND((100 - ((idx_tup_fetch::numeric / idx_tup_read) * 100))::numeric, 2)
    WHEN idx_scan = 0 AND index_size_bytes >= 1048576 THEN 100
    ELSE 0
  END AS fragmentation_proxy_pct,
  CASE
    WHEN idx_scan = 0 AND index_size_bytes >= 1048576 THEN 'unused_large'
    WHEN idx_tup_read > 0 AND (100 - ((idx_tup_fetch::numeric / idx_tup_read) * 100)) >= 30 THEN 'high'
    WHEN idx_tup_read > 0 AND (100 - ((idx_tup_fetch::numeric / idx_tup_read) * 100)) >= 15 THEN 'medium'
    ELSE 'low'
  END AS fragmentation_level,
  'fallback_stat_proxy' AS method
FROM idx
ORDER BY fragmentation_proxy_pct DESC, index_size_bytes DESC
) TO STDOUT WITH CSV HEADER;" >"${CSV_FILE}" 2>>"${ANALYZE_LOG}"
fi

echo "ANALYZE_LOG=${ANALYZE_LOG}"
echo "INDEX_CSV=${CSV_FILE}"
