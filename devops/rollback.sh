#!/usr/bin/env bash
###############################################################################
# BLUN Rollback — Stellt letztes Backup wieder her
# Guenter — Infra Engineer — BLUN.ai
#
# Usage:
#   bash rollback.sh /pfad/zur/app                    # Letztes Backup
#   bash rollback.sh /pfad/zur/app 20260407-143022     # Bestimmter Timestamp
#   bash rollback.sh --list /pfad/zur/app              # Alle Backups anzeigen
###############################################################################
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BACKUP_BASE="/var/backups/blun-deploys"
LOG_FILE="/var/log/blun-watchdog/deploy-backups.log"

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" 2>/dev/null || echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
die() { log "${RED}FEHLER: $1${NC}"; exit 1; }

# --- List-Modus ---
if [[ "${1:-}" == "--list" ]]; then
    APP_DIR="${2:?Fehler: APP_DIR angeben}"
    APP_NAME="$(basename "$APP_DIR")"
    BACKUP_DIR="${BACKUP_BASE}/${APP_NAME}"

    echo -e "${YELLOW}Verfuegbare Backups fuer ${APP_NAME}:${NC}"
    echo "────────────────────────────────────────"

    if [[ ! -d "$BACKUP_DIR" ]]; then
        echo "Keine Backups gefunden."
        exit 0
    fi

    find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf '%T@ %p\n' \
        | sort -rn \
        | while read -r _ filepath; do
            fname="$(basename "$filepath")"
            fsize="$(du -sh "$filepath" | cut -f1)"
            ts="${fname##*_}"
            ts="${ts%.tar.gz}"
            manifest="${filepath%.tar.gz}.manifest"
            git_info=""
            if [[ -f "$manifest" ]]; then
                git_info="$(grep '^git_info=' "$manifest" | cut -d= -f2-)"
            fi
            echo -e "  ${GREEN}${ts}${NC}  ${fsize}  ${git_info}"
        done

    echo "────────────────────────────────────────"
    echo "Rollback: bash rollback.sh $APP_DIR <timestamp>"
    exit 0
fi

# --- Rollback-Modus ---
APP_DIR="${1:?Fehler: APP_DIR als erstes Argument angeben}"
TIMESTAMP="${2:-}"
APP_NAME="$(basename "$APP_DIR")"
BACKUP_DIR="${BACKUP_BASE}/${APP_NAME}"

[[ -d "$BACKUP_DIR" ]] || die "Kein Backup-Verzeichnis gefunden: $BACKUP_DIR"

# Backup finden
if [[ -n "$TIMESTAMP" ]]; then
    BACKUP_ARCHIVE="${BACKUP_DIR}/${APP_NAME}_${TIMESTAMP}.tar.gz"
    [[ -f "$BACKUP_ARCHIVE" ]] || die "Backup nicht gefunden: $BACKUP_ARCHIVE"
else
    BACKUP_ARCHIVE="$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf '%T@ %p\n' | sort -rn | head -1 | awk '{print $2}')"
    [[ -n "$BACKUP_ARCHIVE" ]] || die "Keine Backups vorhanden in $BACKUP_DIR"
fi

log "${YELLOW}=== Rollback gestartet ===${NC}"
log "App:       ${APP_DIR}"
log "Backup:    ${BACKUP_ARCHIVE}"

# Sicherheitsabfrage
echo -e "${RED}ACHTUNG: Aktueller Code in ${APP_DIR} wird ueberschrieben!${NC}"
echo -e "Backup:  $(basename "$BACKUP_ARCHIVE")"
read -r -p "Fortfahren? (ja/nein): " confirm
[[ "$confirm" == "ja" ]] || { log "Rollback abgebrochen."; exit 1; }

# PM2 Prozesse stoppen
log "Stoppe PM2 Prozesse fuer ${APP_NAME}..."
pm2 stop "$APP_NAME" 2>/dev/null || true

# Aktuellen Stand sichern (Notfall-Backup)
EMERGENCY_BACKUP="${BACKUP_DIR}/${APP_NAME}_PRE-ROLLBACK_$(date +%Y%m%d-%H%M%S).tar.gz"
log "Notfall-Backup des aktuellen Stands: ${EMERGENCY_BACKUP}"
tar czf "$EMERGENCY_BACKUP" \
    --exclude='node_modules' --exclude='.git' --exclude='*.log' \
    -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" 2>/dev/null || true

# Wiederherstellen
log "Stelle Backup wieder her..."
PARENT_DIR="$(dirname "$APP_DIR")"

# Altes Verzeichnis leeren (aber .git und .env behalten)
find "$APP_DIR" -mindepth 1 -maxdepth 1 \
    ! -name '.git' \
    ! -name '.env' \
    ! -name 'node_modules' \
    -exec rm -rf {} + 2>/dev/null || true

# Backup entpacken
tar xzf "$BACKUP_ARCHIVE" -C "$PARENT_DIR" || die "Entpacken fehlgeschlagen"

# Dependencies neu installieren
if [[ -f "${APP_DIR}/package.json" ]]; then
    log "Installiere npm Dependencies..."
    cd "$APP_DIR" && npm ci --production 2>/dev/null || npm install --production 2>/dev/null || log "${YELLOW}npm install fehlgeschlagen — manuell pruefen${NC}"
fi

if [[ -f "${APP_DIR}/requirements.txt" ]]; then
    log "Installiere pip Dependencies..."
    cd "$APP_DIR" && pip install -r requirements.txt 2>/dev/null || log "${YELLOW}pip install fehlgeschlagen — manuell pruefen${NC}"
fi

# PM2 neu starten
log "Starte PM2 Prozesse..."
pm2 restart "$APP_NAME" 2>/dev/null || pm2 start "$APP_DIR" --name "$APP_NAME" 2>/dev/null || true
sleep 3

# Health-Check
PM2_STATUS="$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
    procs=json.load(sys.stdin)
    for p in procs:
        if p['name']=='$APP_NAME':
            print(p['pm2_env']['status'])
            break
    else: print('not_found')
except: print('error')
" 2>/dev/null || echo 'unknown')"

if [[ "$PM2_STATUS" == "online" ]]; then
    log "${GREEN}=== Rollback erfolgreich ===${NC}"
    log "App laeuft wieder mit Backup von: $(basename "$BACKUP_ARCHIVE")"
else
    log "${RED}=== Rollback ausgefuehrt, aber App-Status: ${PM2_STATUS} ===${NC}"
    log "Bitte manuell pruefen: pm2 status"
fi
