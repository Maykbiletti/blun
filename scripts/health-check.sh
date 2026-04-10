#!/usr/bin/env bash
set -u

LOG_FILE="/var/log/blun-health.log"
APP_NAME="blun"
APP_PORT="3200"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S%z'
}

log_error() {
  local message="$1"
  local log_dir
  log_dir="$(dirname "$LOG_FILE")"
  mkdir -p "$log_dir" 2>/dev/null || true

  if [ -w "$LOG_FILE" ] || [ -w "$log_dir" ]; then
    printf '[%s] %s\n' "$(timestamp)" "$message" >> "$LOG_FILE"
  fi
}

check_pm2_online() {
  if ! command -v pm2 >/dev/null 2>&1; then
    log_error "pm2 not found"
    return 1
  fi

  local status
  status="$(pm2 jlist 2>/dev/null | node -e '
let input = "";
process.stdin.on("data", d => input += d);
process.stdin.on("end", () => {
  try {
    const apps = JSON.parse(input);
    const app = apps.find(a => a && a.name === process.argv[1]);
    if (!app || !app.pm2_env || !app.pm2_env.status) process.exit(2);
    process.stdout.write(String(app.pm2_env.status));
  } catch (_) {
    process.exit(3);
  }
});
' "$APP_NAME")"

  if [ "$status" != "online" ]; then
    log_error "pm2 app '$APP_NAME' is not online (status: ${status:-unknown})"
    return 1
  fi

  return 0
}

check_port_3200() {
  if command -v ss >/dev/null 2>&1; then
    if ! ss -ltn "( sport = :$APP_PORT )" 2>/dev/null | awk 'NR>1 {found=1} END {exit found?0:1}'; then
      log_error "port $APP_PORT is not listening"
      return 1
    fi
    return 0
  fi

  if command -v lsof >/dev/null 2>&1; then
    if ! lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      log_error "port $APP_PORT is not listening"
      return 1
    fi
    return 0
  fi

  if ! timeout 2 bash -c "</dev/tcp/127.0.0.1/$APP_PORT" >/dev/null 2>&1; then
    log_error "port $APP_PORT is not reachable"
    return 1
  fi

  return 0
}

check_db_reachable() {
  local db_host="${BLUN_DB_HOST:-localhost}"
  local db_port="${BLUN_DB_PORT:-5432}"
  local db_name="${BLUN_DB_NAME:-blun}"
  local db_user="${BLUN_DB_USER:-postgres}"

  if command -v pg_isready >/dev/null 2>&1; then
    if ! pg_isready -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -t 5 >/dev/null 2>&1; then
      log_error "database not reachable (host=$db_host port=$db_port db=$db_name user=$db_user)"
      return 1
    fi
    return 0
  fi

  if command -v psql >/dev/null 2>&1; then
    if ! PGPASSWORD="${BLUN_DB_PASSWORD:-}" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c 'SELECT 1;' >/dev/null 2>&1; then
      log_error "database not reachable via psql (host=$db_host port=$db_port db=$db_name user=$db_user)"
      return 1
    fi
    return 0
  fi

  log_error "database check unavailable (pg_isready/psql not found)"
  return 1
}

failed=0

check_pm2_online || failed=1
check_port_3200 || failed=1
check_db_reachable || failed=1

exit "$failed"
