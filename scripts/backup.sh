#!/bin/bash
# BLUN Database Backup Script
# Guenter — Infra/Backup

set -euo pipefail

BACKUP_DIR="/root/backups"
DB_NAME="blun"
DB_USER="blun"
DATE=$(date +%Y%m%d)
BACKUP_FILE="${BACKUP_DIR}/blun_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Backup gestartet: $DB_NAME -> $BACKUP_FILE"

pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "[$(date)] Backup fertig: $BACKUP_FILE ($SIZE)"

# Alte Backups loeschen (aelter als 30 Tage)
find "$BACKUP_DIR" -name "blun_*.sql.gz" -mtime +30 -delete
echo "[$(date)] Alte Backups bereinigt (>30 Tage)"
