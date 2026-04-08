#!/bin/bash

# Disk Monitoring — Alert wenn /root > 85% voll
# Cronjob: */10 * * * * /root/blun/scripts/disk-monitor.sh >> /root/backups/disk-monitor.log 2>&1

LOG_FILE="/root/backups/disk-monitor.log"
ALERT_DIR="/root/backups/alerts"
THRESHOLD=85
MONITORED_PATH="/root"

# Helper: log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Helper: alert
alert() {
    local msg="$1"
    log "ALERT: $msg"

    # Write alert file
    mkdir -p "$ALERT_DIR"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $msg" >> "$ALERT_DIR/disk_alert_$(date +%Y%m%d).txt"

    # TODO: Send Slack/Email notification
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"BLUN Disk Alert: $msg\"}" \
    #   $SLACK_WEBHOOK_URL
}

# Get disk usage for /root
DISK_USAGE=$(df -h "$MONITORED_PATH" | tail -1 | awk '{print $5}' | sed 's/%//')

log "Checking $MONITORED_PATH: ${DISK_USAGE}% used"

# Check threshold
if [ "$DISK_USAGE" -gt "$THRESHOLD" ]; then
    DISK_DETAIL=$(df -h "$MONITORED_PATH" | tail -1)
    alert "Disk usage on $MONITORED_PATH is ${DISK_USAGE}% (threshold: ${THRESHOLD}%)"
    log "Details: $DISK_DETAIL"

    # Additional diagnostics
    log "=== Top 10 largest directories in $MONITORED_PATH ==="
    du -sh "$MONITORED_PATH"/* 2>/dev/null | sort -rh | head -10 | while read line; do
        log "$line"
    done

    exit 1  # Signal failure
else
    log "Disk usage OK (${DISK_USAGE}% <= ${THRESHOLD}%)"
    exit 0
fi
