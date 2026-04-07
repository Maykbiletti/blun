#!/usr/bin/env bash
###############################################################################
# Watchdog Installation — Cron + PM2 Scheduled Job
# Installiert den PM2 Watchdog als Cron-Job (alle 2 Min)
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHDOG="$SCRIPT_DIR/pm2-watchdog.sh"
CRON_INTERVAL="*/2 * * * *"

echo "=== PM2 Watchdog Installation ==="

# 1. Watchdog-Script ausfuehrbar machen
chmod +x "$WATCHDOG"
echo "[OK] $WATCHDOG ist ausfuehrbar"

# 2. Log-Verzeichnis anlegen
sudo mkdir -p /var/log/blun-watchdog
sudo chown "$(whoami)" /var/log/blun-watchdog
echo "[OK] Log-Verzeichnis /var/log/blun-watchdog angelegt"

# 3. Cron-Job einrichten (idempotent)
CRON_LINE="$CRON_INTERVAL $WATCHDOG >> /var/log/blun-watchdog/cron.log 2>&1"

if crontab -l 2>/dev/null | grep -qF "pm2-watchdog.sh"; then
    echo "[SKIP] Cron-Job existiert bereits"
else
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    echo "[OK] Cron-Job installiert: alle 2 Minuten"
fi

# 4. Einmal manuell ausfuehren zum Testen
echo ""
echo "=== Test-Run ==="
bash "$WATCHDOG"

echo ""
echo "=== Installation fertig ==="
echo "  Watchdog:  $WATCHDOG"
echo "  Cron:      $CRON_INTERVAL"
echo "  Logs:      /var/log/blun-watchdog/watchdog.log"
echo "  Alerts:    /var/log/blun-watchdog/alerts.log"
echo ""
echo "Optional: WATCHDOG_WEBHOOK_URL setzen fuer Slack/Discord Alerts"
echo "  export WATCHDOG_WEBHOOK_URL='https://hooks.slack.com/...'"
