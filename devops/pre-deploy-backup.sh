#!/usr/bin/env bash
###############################################################################
# BLUN Pre-Deploy Backup — Automatisches Backup vor jedem Deploy
# Guenter — Infra Engineer — BLUN.ai
#
# Usage:
#   bash pre-deploy-backup.sh /pfad/zur/app [backup-dir]
#   bash pre-deploy-backup.sh /opt/blun-app
#   bash pre-deploy-backup.sh /opt/blun-app /mnt/backups/blun
#
# Wird von blun-deploy.sh aufgerufen BEVOR neuer Code live geht.
###############################################################################
set -euo pipefail

# --- Konfiguration ---
APP_DIR="${1:?Fehler: APP_DIR als erstes Argument angeben (z.B. /opt/blun-app)}"
BACKUP_BASE="${2:-/var/backups/blun-deploys}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
APP_NAME="$(basename "$APP_DIR")"
BACKUP_DIR="${BACKUP_BASE}/${APP_NAME}"
BACKUP_PATH="${BACKUP_DIR}/${APP_NAME}_${TIMESTAMP}"
BACKUP_ARCHIVE="${BACKUP_PATH}.tar.gz"
MAX_BACKUPS=10                # Letzte 10 Backups behalten
MIN_DISK_MB=2000              # Mindestens 2GB frei auf Backup-Partition
LOG_FILE="/var/log/blun-watchdog/deploy-backups.log"

# --- Farben ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" 2>/dev/null || echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
die() { log "${RED}FEHLER: $1${NC}"; exit 1; }

###############################################################################
# 1. Validierung
###############################################################################
log "${YELLOW}=== Pre-Deploy Backup gestartet ===${NC}"
log "App:       ${APP_DIR}"
log "Backup:    ${BACKUP_ARCHIVE}"

# App-Verzeichnis muss existieren
[[ -d "$APP_DIR" ]] || die "App-Verzeichnis $APP_DIR existiert nicht"

# Log-Verzeichnis anlegen
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

###############################################################################
# 2. Disk-Space Check
###############################################################################
BACKUP_MOUNT="$(df "$BACKUP_BASE" 2>/dev/null | tail -1 | awk '{print $4}' || echo 0)"
# df gibt Bloecke in 1K aus
BACKUP_FREE_MB=$(( ${BACKUP_MOUNT:-0} / 1024 ))

if [[ "$BACKUP_FREE_MB" -lt "$MIN_DISK_MB" ]]; then
    die "Nicht genug Speicher auf Backup-Partition: ${BACKUP_FREE_MB}MB frei, brauche mindestens ${MIN_DISK_MB}MB"
fi
log "${GREEN}Disk-Check OK${NC}: ${BACKUP_FREE_MB}MB frei"

###############################################################################
# 3. Backup-Verzeichnis anlegen
###############################################################################
mkdir -p "$BACKUP_DIR" || die "Kann Backup-Verzeichnis nicht anlegen: $BACKUP_DIR"

###############################################################################
# 4. Git-Info sichern (falls Git-Repo)
###############################################################################
GIT_INFO=""
if [[ -d "${APP_DIR}/.git" ]]; then
    GIT_BRANCH="$(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
    GIT_COMMIT="$(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    GIT_DIRTY="$(cd "$APP_DIR" && git status --porcelain 2>/dev/null | wc -l || echo '?')"
    GIT_INFO="Branch: ${GIT_BRANCH}, Commit: ${GIT_COMMIT}, Uncommitted: ${GIT_DIRTY}"
    log "Git-Info: ${GIT_INFO}"
fi

###############################################################################
# 5. Backup erstellen (tar.gz mit Ausschluessen)
###############################################################################
log "Erstelle Backup..."

EXCLUDE_PATTERNS=(
    --exclude='node_modules'
    --exclude='.git'
    --exclude='*.log'
    --exclude='*.tmp'
    --exclude='.cache'
    --exclude='dist'
    --exclude='build'
    --exclude='__pycache__'
    --exclude='.venv'
    --exclude='venv'
    --exclude='.next'
)

tar czf "$BACKUP_ARCHIVE" \
    "${EXCLUDE_PATTERNS[@]}" \
    -C "$(dirname "$APP_DIR")" \
    "$(basename "$APP_DIR")" \
    2>/dev/null || die "tar fehlgeschlagen"

# Groesse pruefen
BACKUP_SIZE="$(du -sh "$BACKUP_ARCHIVE" | cut -f1)"
log "${GREEN}Backup erstellt${NC}: ${BACKUP_ARCHIVE} (${BACKUP_SIZE})"

###############################################################################
# 6. Manifest schreiben (fuer Rollback-Info)
###############################################################################
MANIFEST="${BACKUP_PATH}.manifest"
cat > "$MANIFEST" <<MANIFEST_EOF
# BLUN Deploy Backup Manifest
timestamp=${TIMESTAMP}
app_dir=${APP_DIR}
app_name=${APP_NAME}
backup_file=${BACKUP_ARCHIVE}
backup_size=${BACKUP_SIZE}
git_info=${GIT_INFO}
hostname=$(hostname)
user=$(whoami)
pm2_list=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
    procs=json.load(sys.stdin)
    print(','.join(f\"{p['name']}:{p['pm2_env']['status']}\" for p in procs))
except: print('n/a')
" 2>/dev/null || echo 'n/a')
MANIFEST_EOF

log "Manifest geschrieben: ${MANIFEST}"

###############################################################################
# 7. Alte Backups aufraeumen (Rotation)
###############################################################################
BACKUP_COUNT="$(find "$BACKUP_DIR" -name "*.tar.gz" -type f | wc -l)"
if [[ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]]; then
    DELETE_COUNT=$(( BACKUP_COUNT - MAX_BACKUPS ))
    log "${YELLOW}Rotation${NC}: ${BACKUP_COUNT} Backups vorhanden, loesche aelteste ${DELETE_COUNT}"

    # Aelteste Backups + Manifests loeschen
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf '%T@ %p\n' \
        | sort -n \
        | head -n "$DELETE_COUNT" \
        | awk '{print $2}' \
        | while read -r old_backup; do
            rm -f "$old_backup" "${old_backup%.tar.gz}.manifest"
            log "Geloescht: $(basename "$old_backup")"
        done
fi

###############################################################################
# 8. Zusammenfassung
###############################################################################
log "${GREEN}=== Backup erfolgreich ===${NC}"
log "Datei:     ${BACKUP_ARCHIVE}"
log "Groesse:   ${BACKUP_SIZE}"
log "Backups:   $(find "$BACKUP_DIR" -name "*.tar.gz" -type f | wc -l) / ${MAX_BACKUPS} (max)"
log ""

# Exitcode 0 = Deploy darf weitermachen
exit 0
