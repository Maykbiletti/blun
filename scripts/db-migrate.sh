#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-${ROOT_DIR}/migrations}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-blun}"
DB_USER="${DB_USER:-blun}"
DB_PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"
MIGRATIONS_TABLE="${MIGRATIONS_TABLE:-schema_migrations}"

export PGPASSWORD="${DB_PASSWORD}"

usage() {
  cat <<USAGE
Usage:
  scripts/db-migrate.sh up [--to <migration.sql>]
  scripts/db-migrate.sh rollback [--steps <n>]
  scripts/db-migrate.sh status

Env (optional):
  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, MIGRATIONS_DIR, MIGRATIONS_TABLE

Rollback files:
  For migration <name>.sql, rollback is expected at <name>.down.sql.
USAGE
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

psql_base() {
  psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 \
    "$@"
}

psql_query() {
  local sql="$1"
  psql_base -Atqc "$sql"
}

sql_escape() {
  local s="$1"
  printf "%s" "${s//\'/\'\'}"
}

ensure_prerequisites() {
  command -v psql >/dev/null 2>&1 || die "psql not found"
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found"
  [[ -d "$MIGRATIONS_DIR" ]] || die "Migrations directory not found: $MIGRATIONS_DIR"

  psql_base <<SQL
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  rollback_file TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL
}

list_migration_files() {
  find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' ! -name '*.down.sql' -printf '%f\n' | sort
}

migration_abs_path() {
  local filename="$1"
  printf '%s/%s' "$MIGRATIONS_DIR" "$filename"
}

rollback_file_for() {
  local filename="$1"
  printf '%s/%s' "$MIGRATIONS_DIR" "${filename%.sql}.down.sql"
}

is_applied() {
  local filename="$1"
  local escaped
  escaped="$(sql_escape "$filename")"
  local count
  count="$(psql_query "SELECT COUNT(1) FROM ${MIGRATIONS_TABLE} WHERE filename='${escaped}';")"
  [[ "$count" != "0" ]]
}

apply_one() {
  local filename="$1"
  local file rollback_file checksum file_escaped rollback_escaped

  file="$(migration_abs_path "$filename")"
  [[ -f "$file" ]] || die "Missing migration file: $file"

  if is_applied "$filename"; then
    log "skip already applied: $filename"
    return 0
  fi

  rollback_file="$(rollback_file_for "$filename")"
  checksum="$(sha256sum "$file" | awk '{print $1}')"

  file_escaped="$(sql_escape "$filename")"
  if [[ -f "$rollback_file" ]]; then
    rollback_escaped="$(sql_escape "$(basename "$rollback_file")")"
  else
    rollback_escaped=""
  fi

  log "apply: $filename"

  {
    printf 'BEGIN;\n'
    cat "$file"
    printf '\n'
    if [[ -n "$rollback_escaped" ]]; then
      printf "INSERT INTO %s (filename, checksum, rollback_file) VALUES ('%s','%s','%s');\n" \
        "$MIGRATIONS_TABLE" "$file_escaped" "$checksum" "$rollback_escaped"
    else
      printf "INSERT INTO %s (filename, checksum, rollback_file) VALUES ('%s','%s',NULL);\n" \
        "$MIGRATIONS_TABLE" "$file_escaped" "$checksum"
    fi
    printf 'COMMIT;\n'
  } | psql_base

  log "applied: $filename"
}

command_up() {
  local target=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --to)
        shift
        [[ $# -gt 0 ]] || die "missing value for --to"
        target="$1"
        ;;
      *)
        die "unknown argument for up: $1"
        ;;
    esac
    shift
  done

  local files count=0
  mapfile -t files < <(list_migration_files)
  [[ ${#files[@]} -gt 0 ]] || { log "no migration files found"; return 0; }

  local seen_target=0
  for filename in "${files[@]}"; do
    apply_one "$filename"
    ((count+=1))

    if [[ -n "$target" && "$filename" == "$target" ]]; then
      seen_target=1
      break
    fi
  done

  if [[ -n "$target" && "$seen_target" -eq 0 ]]; then
    die "target migration not found: $target"
  fi

  log "up done"
}

rollback_one() {
  local filename rollback_name rollback_path filename_escaped
  filename="$1"

  rollback_name="$(psql_query "SELECT COALESCE(rollback_file, '') FROM ${MIGRATIONS_TABLE} WHERE filename='$(sql_escape "$filename")';")"
  [[ -n "$rollback_name" ]] || die "no rollback file registered for migration: $filename"

  rollback_path="${MIGRATIONS_DIR}/${rollback_name}"
  [[ -f "$rollback_path" ]] || die "rollback file missing: $rollback_path"

  filename_escaped="$(sql_escape "$filename")"

  log "rollback: $filename using ${rollback_name}"

  {
    printf 'BEGIN;\n'
    cat "$rollback_path"
    printf '\n'
    printf "DELETE FROM %s WHERE filename='%s';\n" "$MIGRATIONS_TABLE" "$filename_escaped"
    printf 'COMMIT;\n'
  } | psql_base

  log "rolled back: $filename"
}

command_rollback() {
  local steps=1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --steps)
        shift
        [[ $# -gt 0 ]] || die "missing value for --steps"
        steps="$1"
        ;;
      *)
        die "unknown argument for rollback: $1"
        ;;
    esac
    shift
  done

  [[ "$steps" =~ ^[0-9]+$ ]] || die "--steps must be a positive integer"
  [[ "$steps" -gt 0 ]] || die "--steps must be greater than 0"

  local rows
  rows="$(psql_query "SELECT filename FROM ${MIGRATIONS_TABLE} ORDER BY id DESC LIMIT ${steps};")"
  [[ -n "$rows" ]] || { log "nothing to rollback"; return 0; }

  while IFS= read -r filename; do
    [[ -n "$filename" ]] || continue
    rollback_one "$filename"
  done <<< "$rows"

  log "rollback done"
}

command_status() {
  local files
  mapfile -t files < <(list_migration_files)

  printf '%-6s %-45s %s\n' 'STATE' 'MIGRATION' 'DETAIL'
  printf '%-6s %-45s %s\n' '-----' '---------' '------'

  local filename applied_row applied_checksum current_checksum applied_time
  for filename in "${files[@]}"; do
    current_checksum="$(sha256sum "$(migration_abs_path "$filename")" | awk '{print $1}')"
    applied_row="$(psql_query "SELECT checksum || '|' || to_char(applied_at, 'YYYY-MM-DD HH24:MI:SS') FROM ${MIGRATIONS_TABLE} WHERE filename='$(sql_escape "$filename")';")"

    if [[ -z "$applied_row" ]]; then
      printf '%-6s %-45s %s\n' 'PEND' "$filename" '-'
      continue
    fi

    applied_checksum="${applied_row%%|*}"
    applied_time="${applied_row#*|}"

    if [[ "$applied_checksum" != "$current_checksum" ]]; then
      printf '%-6s %-45s %s\n' 'DRIFT' "$filename" "checksum mismatch, applied ${applied_time}"
    else
      printf '%-6s %-45s %s\n' 'DONE' "$filename" "applied ${applied_time}"
    fi
  done
}

main() {
  [[ $# -gt 0 ]] || { usage; exit 1; }

  local cmd="$1"
  shift

  case "$cmd" in
    up)
      ensure_prerequisites
      command_up "$@"
      ;;
    rollback)
      ensure_prerequisites
      command_rollback "$@"
      ;;
    status)
      ensure_prerequisites
      command_status "$@"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      die "unknown command: $cmd"
      ;;
  esac
}

main "$@"
