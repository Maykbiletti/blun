#!/usr/bin/env bash
# ============================================================
# BLUN.ai — Staging Server Setup (Port 3201)
# Mirror von Produktion mit eigener DB
# Guenter / Infra — 2026-04-07
# ============================================================
set -euo pipefail

# --- Konfiguration ---
STAGING_PORT=3201
PROD_APP_DIR="/root/blun"
STAGING_APP_DIR="/opt/blun/staging"
STAGING_DB_NAME="blun_staging"
PROD_DB_NAME="blun"
DB_HOST="localhost"
DB_USER="blun"
LOG_DIR="/var/log/blun/staging"
BACKUP_DIR="/opt/blun/backups/staging"

echo "========================================="
echo " BLUN Staging Server Setup — Port $STAGING_PORT"
echo "========================================="

# --- 1. Voraussetzungen pruefen ---
echo ""
echo "[1/6] Voraussetzungen pruefen..."

# Port frei?
if ss -tlnp | grep -q ":${STAGING_PORT} "; then
    echo "FEHLER: Port $STAGING_PORT ist bereits belegt!"
    ss -tlnp | grep ":${STAGING_PORT} "
    exit 1
fi
echo "  Port $STAGING_PORT ist frei ✓"

# Disk Space (min 10GB)
AVAIL_GB=$(df -BG --output=avail "${STAGING_APP_DIR%/*}" 2>/dev/null | tail -1 | tr -d ' G')
if [ "${AVAIL_GB:-0}" -lt 10 ]; then
    echo "FEHLER: Weniger als 10GB frei (${AVAIL_GB}GB verfuegbar)"
    exit 1
fi
echo "  Disk Space: ${AVAIL_GB}GB frei ✓"

# Prod-Verzeichnis existiert?
if [ ! -d "$PROD_APP_DIR" ]; then
    echo "WARNUNG: Prod-Verzeichnis $PROD_APP_DIR nicht gefunden"
    echo "  Erstelle leeres Staging-Verzeichnis..."
fi

# --- 2. Verzeichnisse anlegen ---
echo ""
echo "[2/6] Verzeichnisse anlegen..."
mkdir -p "$STAGING_APP_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"
echo "  $STAGING_APP_DIR ✓"
echo "  $LOG_DIR ✓"
echo "  $BACKUP_DIR ✓"

# --- 3. App Mirror von Produktion ---
echo ""
echo "[3/6] App Mirror von Produktion..."
if [ -d "$PROD_APP_DIR" ]; then
    rsync -a --delete \
        --exclude='node_modules' \
        --exclude='.env' \
        --exclude='logs/' \
        --exclude='tmp/' \
        --exclude='uploads/' \
        "$PROD_APP_DIR/" "$STAGING_APP_DIR/"
    echo "  rsync von $PROD_APP_DIR → $STAGING_APP_DIR ✓"
else
    echo "  SKIP: Kein Prod-Verzeichnis — manuell clonen noetig"
    echo "  Hinweis: git clone <repo> $STAGING_APP_DIR"
fi

# --- 4. Staging DB erstellen (PostgreSQL) ---
echo ""
echo "[4/6] Staging Datenbank erstellen..."

# DB existiert bereits?
if psql -h "$DB_HOST" -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$STAGING_DB_NAME"; then
    echo "  DB '$STAGING_DB_NAME' existiert bereits"
    read -p "  DB droppen und neu erstellen? (y/N): " CONFIRM
    if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
        dropdb -h "$DB_HOST" -U "$DB_USER" "$STAGING_DB_NAME" 2>/dev/null || true
        echo "  Alte DB gedroppt ✓"
    else
        echo "  Behalte bestehende DB"
    fi
fi

# DB anlegen falls nicht vorhanden
if ! psql -h "$DB_HOST" -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$STAGING_DB_NAME"; then
    createdb -h "$DB_HOST" -U "$DB_USER" "$STAGING_DB_NAME"
    echo "  DB '$STAGING_DB_NAME' erstellt ✓"

    # Prod-Dump in Staging laden
    echo "  Dump von Produktion laden..."
    pg_dump -h "$DB_HOST" -U "$DB_USER" "$PROD_DB_NAME" 2>/dev/null | \
        psql -h "$DB_HOST" -U "$DB_USER" "$STAGING_DB_NAME" > /dev/null 2>&1 && \
        echo "  Prod-Dump in Staging geladen ✓" || \
        echo "  WARNUNG: Prod-Dump fehlgeschlagen — leere DB"
fi

# --- 5. Dependencies installieren ---
echo ""
echo "[5/6] Dependencies installieren..."
cd "$STAGING_APP_DIR"
if [ -f "package.json" ]; then
    npm ci --production 2>/dev/null && echo "  npm ci ✓" || echo "  WARNUNG: npm ci fehlgeschlagen"
elif [ -f "requirements.txt" ]; then
    pip install -r requirements.txt 2>/dev/null && echo "  pip install ✓" || echo "  WARNUNG: pip install fehlgeschlagen"
else
    echo "  SKIP: Kein package.json oder requirements.txt gefunden"
fi

# --- 6. Staging .env erstellen ---
echo ""
echo "[6/6] Staging Environment..."
if [ ! -f "$STAGING_APP_DIR/.env" ]; then
    cp /tmp/blun-devops/staging.env "$STAGING_APP_DIR/.env" 2>/dev/null && \
        echo "  .env kopiert ✓" || \
        echo "  WARNUNG: staging.env nicht gefunden — manuell erstellen"
else
    echo "  .env existiert bereits ✓"
fi

# --- Zusammenfassung ---
echo ""
echo "========================================="
echo " Staging Setup abgeschlossen"
echo "========================================="
echo ""
echo "  App:    $STAGING_APP_DIR"
echo "  Port:   $STAGING_PORT"
echo "  DB:     $STAGING_DB_NAME"
echo "  Logs:   $LOG_DIR"
echo ""
echo "  Starten mit:"
echo "    pm2 start /tmp/blun-devops/staging.ecosystem.config.js"
echo ""
echo "  Health-Check:"
echo "    curl -s http://localhost:$STAGING_PORT/health"
echo ""
