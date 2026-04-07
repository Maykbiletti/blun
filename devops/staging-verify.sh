#!/usr/bin/env bash
# ============================================================
# BLUN.ai — Staging Quick-Verify (nach Setup ausfuehren)
# Prueft ob Staging 3201 komplett steht
# Guenter / Infra — 2026-04-07
# ============================================================

PORT=3201
PASS=0
FAIL=0
WARN=0

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "OK" ]; then
        echo "  [OK]   $label"
        PASS=$((PASS + 1))
    elif [ "$result" = "WARN" ]; then
        echo "  [WARN] $label"
        WARN=$((WARN + 1))
    else
        echo "  [FAIL] $label"
        FAIL=$((FAIL + 1))
    fi
}

echo "========================================="
echo " BLUN Staging Verify — Port $PORT"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# --- 1. Port Check ---
if ss -tlnp | grep -q ":${PORT} "; then
    check "Port $PORT lauscht" "OK"
else
    check "Port $PORT lauscht" "FAIL"
fi

# --- 2. HTTP Health ---
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 "http://localhost:${PORT}/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    check "HTTP /health → 200" "OK"
elif [ "$HTTP_CODE" = "000" ]; then
    check "HTTP /health → keine Verbindung" "FAIL"
else
    check "HTTP /health → $HTTP_CODE (erwartet 200)" "WARN"
fi

# --- 3. PM2 Prozess ---
if command -v pm2 &>/dev/null; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'blun-staging':
            print(p.get('pm2_env', {}).get('status', 'unknown'))
            break
    else:
        print('not_found')
except:
    print('error')
" 2>/dev/null)
    if [ "$PM2_STATUS" = "online" ]; then
        check "PM2 blun-staging: online" "OK"
    elif [ "$PM2_STATUS" = "not_found" ]; then
        check "PM2 blun-staging: nicht registriert" "FAIL"
    else
        check "PM2 blun-staging: $PM2_STATUS" "FAIL"
    fi
else
    check "PM2 nicht installiert" "FAIL"
fi

# --- 4. App-Verzeichnis ---
if [ -d "/opt/blun/staging" ]; then
    check "App-Verzeichnis /opt/blun/staging existiert" "OK"
    if [ -f "/opt/blun/staging/.env" ]; then
        check ".env vorhanden" "OK"
        # Pruefen ob Platzhalter noch drin sind
        if grep -q "HIER.AENDERN\|HIER_AENDERN" /opt/blun/staging/.env 2>/dev/null; then
            check ".env: Platzhalter noch nicht ersetzt!" "WARN"
        else
            check ".env: Secrets konfiguriert" "OK"
        fi
    else
        check ".env fehlt" "FAIL"
    fi
    if [ -f "/opt/blun/staging/package.json" ] || [ -f "/opt/blun/staging/requirements.txt" ]; then
        check "App-Code vorhanden" "OK"
    else
        check "Kein package.json/requirements.txt" "WARN"
    fi
else
    check "App-Verzeichnis /opt/blun/staging fehlt" "FAIL"
fi

# --- 5. Staging DB ---
if command -v psql &>/dev/null; then
    if psql -h localhost -U blun -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "blun_staging"; then
        check "DB blun_staging existiert" "OK"
    else
        check "DB blun_staging nicht gefunden" "FAIL"
    fi
else
    check "psql nicht verfuegbar — DB-Check uebersprungen" "WARN"
fi

# --- 6. Log-Verzeichnis ---
if [ -d "/var/log/blun/staging" ]; then
    check "Log-Verzeichnis vorhanden" "OK"
else
    check "Log-Verzeichnis /var/log/blun/staging fehlt" "WARN"
fi

# --- 7. Backup-Verzeichnis ---
if [ -d "/opt/blun/backups/staging" ]; then
    check "Backup-Verzeichnis vorhanden" "OK"
else
    check "Backup-Verzeichnis fehlt" "WARN"
fi

# --- Ergebnis ---
echo ""
echo "========================================="
TOTAL=$((PASS + FAIL + WARN))
echo " Ergebnis: ${PASS}/${TOTAL} OK | ${FAIL} FAIL | ${WARN} WARN"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo " STAGING NICHT BEREIT — FAILs beheben!"
    exit 1
else
    echo ""
    echo " STAGING BEREIT"
    exit 0
fi
