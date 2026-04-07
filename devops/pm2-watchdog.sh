#!/usr/bin/env bash
###############################################################################
# PM2 Watchdog — Kein Silent Fail
# Prueft alle PM2 Prozesse, restartet bei Fehler, alertet immer
# Ausfuehrung: crontab -e → */2 * * * * /tmp/blun-devops/pm2-watchdog.sh
###############################################################################

set -euo pipefail

LOG_DIR="/var/log/blun-watchdog"
LOG_FILE="$LOG_DIR/watchdog.log"
ALERT_LOG="$LOG_DIR/alerts.log"
WEBHOOK_URL="${WATCHDOG_WEBHOOK_URL:-}"  # Slack/Discord Webhook (optional)
MAX_RESTARTS=5          # Max Restarts innerhalb RESTART_WINDOW bevor Eskalation
RESTART_WINDOW=600      # Sekunden (10 Minuten)
RESTART_COUNT_FILE="$LOG_DIR/.restart_counts"
HEALTH_CHECK_TIMEOUT=5  # Sekunden

mkdir -p "$LOG_DIR"
touch "$RESTART_COUNT_FILE"

# --- Logging ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    local level="$1"
    local msg="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $msg" | tee -a "$ALERT_LOG" "$LOG_FILE"

    # Webhook Notification (Slack/Discord)
    if [[ -n "$WEBHOOK_URL" ]]; then
        curl -sf -X POST "$WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"[$level] PM2 Watchdog @ $(hostname): $msg\"}" \
            --max-time 5 2>/dev/null || true
    fi

    # Systemd Journal (fuer journalctl Zugriff)
    logger -t "pm2-watchdog" "[$level] $msg" 2>/dev/null || true
}

# --- Restart-Counter (Flap Detection) ---
get_restart_count() {
    local name="$1"
    local now
    now=$(date +%s)
    # Format: name|timestamp|count
    local line
    line=$(grep "^${name}|" "$RESTART_COUNT_FILE" 2>/dev/null || echo "")
    if [[ -n "$line" ]]; then
        local ts count
        ts=$(echo "$line" | cut -d'|' -f2)
        count=$(echo "$line" | cut -d'|' -f3)
        if (( now - ts < RESTART_WINDOW )); then
            echo "$count"
            return
        fi
    fi
    echo "0"
}

increment_restart_count() {
    local name="$1"
    local now
    now=$(date +%s)
    local current
    current=$(get_restart_count "$name")
    local new_count=$((current + 1))
    # Update oder Insert
    if grep -q "^${name}|" "$RESTART_COUNT_FILE" 2>/dev/null; then
        sed -i "s|^${name}|.*|${name}|${now}|${new_count}|" "$RESTART_COUNT_FILE"
    else
        echo "${name}|${now}|${new_count}" >> "$RESTART_COUNT_FILE"
    fi
    echo "$new_count"
}

# --- PM2 Daemon Check ---
check_pm2_daemon() {
    if ! pm2 pid 2>/dev/null | grep -q '[0-9]'; then
        alert "CRITICAL" "PM2 Daemon laeuft NICHT! Starte PM2..."
        pm2 resurrect 2>/dev/null || pm2 start 2>/dev/null || true
        sleep 2
        if ! pm2 pid 2>/dev/null | grep -q '[0-9]'; then
            alert "CRITICAL" "PM2 Daemon konnte NICHT gestartet werden! Manueller Eingriff noetig!"
            exit 1
        fi
        alert "WARN" "PM2 Daemon wurde neu gestartet via resurrect"
    fi
}

# --- HTTP Health-Check ---
http_health_check() {
    local port="$1"
    local name="$2"
    if [[ -n "$port" ]]; then
        local status_code
        status_code=$(curl -sf -o /dev/null -w "%{http_code}" \
            --max-time "$HEALTH_CHECK_TIMEOUT" \
            "http://localhost:${port}/health" 2>/dev/null || echo "000")
        if [[ "$status_code" != "200" ]]; then
            alert "WARN" "$name — Health-Check FAILED auf Port $port (HTTP $status_code)"
            return 1
        fi
    fi
    return 0
}

# --- Port aus PM2 Config extrahieren ---
get_process_port() {
    local name="$1"
    # Versuche Port aus PM2 env oder args zu lesen
    local port
    port=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == '$name':
            # Check env
            env = p.get('pm2_env', {})
            if 'PORT' in env.get('env', {}):
                print(env['env']['PORT'])
                break
            # Check args
            args = env.get('args', '') or ''
            if '--port' in args:
                parts = args.split()
                for i, a in enumerate(parts):
                    if a == '--port' and i+1 < len(parts):
                        print(parts[i+1])
                        break
except: pass
" 2>/dev/null || echo "")
    echo "$port"
}

# --- Memory Check ---
check_memory_usage() {
    local name="$1"
    local mem_bytes="$2"
    local max_mem_gb="${3:-0}"

    if [[ "$max_mem_gb" != "0" ]] && [[ -n "$mem_bytes" ]]; then
        local mem_gb
        mem_gb=$(echo "$mem_bytes" | awk '{printf "%.1f", $1/1024/1024/1024}')
        local threshold
        threshold=$(echo "$max_mem_gb * 0.9" | bc 2>/dev/null || echo "0")
        if (( $(echo "$mem_gb > $threshold" | bc 2>/dev/null || echo 0) )); then
            alert "WARN" "$name — RAM bei ${mem_gb}GB (Limit: ${max_mem_gb}GB, 90% Threshold)"
        fi
    fi
}

# --- Hauptlogik ---
main() {
    log "--- Watchdog Run Start ---"

    # 1. PM2 Daemon pruefen
    check_pm2_daemon

    # 2. Alle Prozesse holen
    local pm2_json
    pm2_json=$(pm2 jlist 2>/dev/null || echo "[]")

    local proc_count
    proc_count=$(echo "$pm2_json" | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    print(len(procs))
except: print('0')
" 2>/dev/null || echo "0")

    if [[ "$proc_count" == "0" ]]; then
        alert "WARN" "Keine PM2 Prozesse gefunden! Versuche resurrect..."
        pm2 resurrect 2>/dev/null || true
        return
    fi

    log "Pruefe $proc_count PM2 Prozesse..."

    # 3. Jeden Prozess pruefen
    echo "$pm2_json" | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        env = p.get('pm2_env', {})
        name = p.get('name', 'unknown')
        status = env.get('status', 'unknown')
        restarts = env.get('restart_time', 0)
        pid = p.get('pid', 0)
        memory = p.get('monit', {}).get('memory', 0)
        cpu = p.get('monit', {}).get('cpu', 0)
        print(f'{name}|{status}|{restarts}|{pid}|{memory}|{cpu}')
except: pass
" 2>/dev/null | while IFS='|' read -r name status restarts pid memory cpu; do

        case "$status" in
            "online")
                log "OK: $name (PID: $pid, RAM: $((memory/1024/1024))MB, CPU: ${cpu}%)"

                # Health-Check fuer HTTP-Services
                local port
                port=$(get_process_port "$name")
                if [[ -n "$port" ]]; then
                    if ! http_health_check "$port" "$name"; then
                        log "RESTART: $name — Health-Check failed trotz online Status"
                        local count
                        count=$(increment_restart_count "$name")
                        if (( count >= MAX_RESTARTS )); then
                            alert "CRITICAL" "$name — $count Restarts in ${RESTART_WINDOW}s! Flapping detected! STOPPE Prozess."
                            pm2 stop "$name" 2>/dev/null
                        else
                            alert "WARN" "$name — Restart #$count wegen Health-Check Failure"
                            pm2 restart "$name" 2>/dev/null
                        fi
                    fi
                fi
                ;;

            "stopped"|"errored")
                alert "CRITICAL" "$name ist $status! (Restarts bisher: $restarts)"
                local count
                count=$(increment_restart_count "$name")
                if (( count >= MAX_RESTARTS )); then
                    alert "CRITICAL" "$name — $count Restarts in ${RESTART_WINDOW}s! FLAPPING! Kein weiterer Restart. Manueller Eingriff noetig!"
                else
                    alert "WARN" "$name — Restart #$count (Status war: $status)"
                    pm2 restart "$name" 2>/dev/null
                    sleep 3
                    # Verify restart worked
                    local new_status
                    new_status=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == '$name':
            print(p.get('pm2_env', {}).get('status', 'unknown'))
            break
except: pass
" 2>/dev/null || echo "unknown")
                    if [[ "$new_status" == "online" ]]; then
                        alert "INFO" "$name — Restart erfolgreich, Status: online"
                    else
                        alert "CRITICAL" "$name — Restart FEHLGESCHLAGEN, Status: $new_status"
                    fi
                fi
                ;;

            *)
                alert "WARN" "$name — Unbekannter Status: $status"
                ;;
        esac
    done

    # 4. Disk-Space Check (Models brauchen viel Platz)
    local disk_usage
    disk_usage=$(df / --output=pcent | tail -1 | tr -d ' %')
    if (( disk_usage > 90 )); then
        alert "CRITICAL" "Disk Usage bei ${disk_usage}%! Platz wird knapp!"
    elif (( disk_usage > 80 )); then
        alert "WARN" "Disk Usage bei ${disk_usage}%"
    fi

    # 5. RAM Check (wichtig fuer LLM Modelle)
    local ram_free_mb
    ram_free_mb=$(free -m | awk '/^Mem:/ {print $7}')
    if (( ram_free_mb < 2048 )); then
        alert "CRITICAL" "Nur noch ${ram_free_mb}MB RAM frei! Modelle koennten OOM gehen!"
    elif (( ram_free_mb < 4096 )); then
        alert "WARN" "RAM wird knapp: ${ram_free_mb}MB frei"
    fi

    log "--- Watchdog Run Ende ---"
}

main "$@"
