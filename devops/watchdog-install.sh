#!/usr/bin/env bash
###############################################################################
# Watchdog Installation — Crontab + Log-Rotation + PM2 Hardening
###############################################################################

set -euo pipefail

WATCHDOG_SCRIPT="/tmp/blun-devops/pm2-watchdog.sh"
LOG_DIR="/var/log/blun-watchdog"
CRON_INTERVAL="*/2"  # Alle 2 Minuten

echo "=== PM2 Watchdog Installation ==="

# 1. Ausfuehrbar machen
chmod +x "$WATCHDOG_SCRIPT"
echo "[OK] Watchdog Script ausfuehrbar"

# 2. Log-Verzeichnis
mkdir -p "$LOG_DIR"
echo "[OK] Log-Verzeichnis: $LOG_DIR"

# 3. Logrotate Config
cat > /etc/logrotate.d/blun-watchdog << 'LOGROTATE'
/var/log/blun-watchdog/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
LOGROTATE
echo "[OK] Log-Rotation konfiguriert (14 Tage)"

# 4. Crontab eintragen (idempotent)
CRON_CMD="$CRON_INTERVAL * * * * $WATCHDOG_SCRIPT >> $LOG_DIR/cron.log 2>&1"
(crontab -l 2>/dev/null | grep -v "pm2-watchdog" ; echo "$CRON_CMD") | crontab -
echo "[OK] Crontab: $CRON_CMD"

# 5. PM2 Hardening — Auto-Restart Defaults setzen
echo ""
echo "=== PM2 Hardening ==="

# PM2 Startup (ueberlebt Reboot)
pm2 startup 2>/dev/null || echo "[SKIP] pm2 startup (evtl. manuell ausfuehren)"
pm2 save 2>/dev/null || echo "[SKIP] pm2 save"

# PM2 Log-Rotation Modul
pm2 install pm2-logrotate 2>/dev/null || echo "[SKIP] pm2-logrotate bereits installiert"
pm2 set pm2-logrotate:max_size 50M 2>/dev/null || true
pm2 set pm2-logrotate:retain 10 2>/dev/null || true
pm2 set pm2-logrotate:compress true 2>/dev/null || true
echo "[OK] PM2 Log-Rotation: max 50MB, 10 Dateien, komprimiert"

# 6. Optional: Webhook URL setzen
echo ""
echo "=== Optional: Webhook fuer Alerts ==="
echo "Fuer Slack/Discord Alerts:"
echo "  export WATCHDOG_WEBHOOK_URL='https://hooks.slack.com/services/...'"
echo "  Oder in /etc/environment eintragen fuer Persistenz."

# 7. Erster Testlauf
echo ""
echo "=== Testlauf ==="
bash "$WATCHDOG_SCRIPT" && echo "[OK] Watchdog Testlauf erfolgreich" || echo "[WARN] Testlauf mit Fehlern — Log pruefen: $LOG_DIR/watchdog.log"

echo ""
echo "=== Installation abgeschlossen ==="
echo "Watchdog laeuft alle 2 Minuten via Crontab."
echo "Logs:   $LOG_DIR/watchdog.log"
echo "Alerts: $LOG_DIR/alerts.log"
echo "Test:   bash $WATCHDOG_SCRIPT"
