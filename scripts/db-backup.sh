#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/blun"
TIMESTAMP="$(date +%Y%m%d-%H%M)"
BACKUP_FILE="${BACKUP_DIR}/${TIMESTAMP}.sql.gz"
TMP_FILE="${BACKUP_FILE}.tmp"

mkdir -p "${BACKUP_DIR}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump "${DATABASE_URL}" | gzip -9 > "${TMP_FILE}"
else
  pg_dump | gzip -9 > "${TMP_FILE}"
fi

mv "${TMP_FILE}" "${BACKUP_FILE}"

find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sql.gz' -mtime +7 -delete
