#!/usr/bin/env bash
# ============================================================
# BLUN.ai — Staging DB Backup (von PM2 Cron alle 6h aufgerufen)
# Guenter / Infra — 2026-04-07
# ============================================================
set -euo pipefail

DB_NAME="${DB_NAME:-blun_staging}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-blun}"
BACKUP_DIR="${BACKUP_DIR:-/opt/blun/backups/staging}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"
LOG_TAG="blun-staging-db-backup"

mkdir -p "$BACKUP_DIR"

echo "[${TIMESTAMP}] Staging DB Backup gestartet — ${DB_NAME}"
logger -t "$LOG_TAG" "Backup gestartet: ${DB_NAME}"

# --- Disk-Space Check ---
AVAIL_MB=$(df -BM --output=avail "$BACKUP_DIR" 2>/dev/null | tail -1 | tr -d ' M')
if [ "${AVAIL_MB:-0}" -lt 500 ]; then
    echo "FEHLER: Weniger als 500MB frei auf Backup-Partition (${AVAIL_MB}MB)"
    logger -t "$LOG_TAG" "FEHLER: Disk space zu niedrig: ${AVAIL_MB}MB"
    exit 1
fi

# --- Dump erstellen ---
if pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_FILE"; then
    SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    echo "Backup erstellt: ${BACKUP_FILE} (${SIZE})"
    logger -t "$LOG_TAG" "OK: ${BACKUP_FILE} (${SIZE})"
else
    echo "FEHLER: pg_dump fehlgeschlagen"
    logger -t "$LOG_TAG" "FEHLER: pg_dump fehlgeschlagen fuer ${DB_NAME}"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# --- Alte Backups rotieren ---
DELETED=$(find "$BACKUP_DIR" -name "db_${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "Rotation: ${DELETED} alte Backups geloescht (aelter als ${RETENTION_DAYS} Tage)"
    logger -t "$LOG_TAG" "Rotation: ${DELETED} Backups geloescht"
fi

echo "[$(date +%Y%m%d-%H%M%S)] Backup abgeschlossen"
