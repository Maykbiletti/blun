#!/bin/bash
# BLUN.ai Smoke Tests — Sandra QA
# 2026-04-07

PASS=0
FAIL=0
TOTAL=0
RESULTS=""

run_test() {
  local name="$1"
  local cmd="$2"
  local expect_code="${3:-200}"
  TOTAL=$((TOTAL + 1))

  # Execute and capture
  local response
  response=$(eval "$cmd" 2>&1)
  local exit_code=$?

  # Extract HTTP code if curl
  local http_code=""
  if echo "$cmd" | grep -q "curl"; then
    http_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | head -n -1)
  else
    local body="$response"
  fi

  # Check result
  if [ "$exit_code" -eq 0 ] && [ "$http_code" = "$expect_code" -o -z "$http_code" ]; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}\n  PASS  ${name}"
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}\n  FAIL  ${name} (got: ${http_code:-exit=$exit_code}, expected: ${expect_code})"
    # Show body on failure
    if [ -n "$body" ]; then
      RESULTS="${RESULTS}\n        -> $(echo "$body" | head -c 200)"
    fi
  fi
}

echo "========================================"
echo "  BLUN.ai SMOKE TESTS"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# ─── 1. Infrastruktur ────────────────────────────────────
echo ""
echo "--- Infrastruktur ---"

run_test "PostgreSQL erreichbar" \
  "pg_isready -h 127.0.0.1 -p 5432 2>&1 && echo" \
  ""

run_test "Redis erreichbar" \
  "redis-cli ping 2>&1 | grep -q PONG && echo" \
  ""

run_test "Nginx läuft" \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:80" \
  "200"

run_test "PM2: blun online" \
  "pm2 jlist 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.find(p=>p.name==='blun'&&p.pm2_env.status==='online')?0:1)\" && echo" \
  ""

run_test "PM2: dieter-daemon online" \
  "pm2 jlist 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d.find(p=>p.name==='dieter-daemon'&&p.pm2_env.status==='online')?0:1)\" && echo" \
  ""

# ─── 2. BLUN Hauptserver (Port 3200) ─────────────────────
echo ""
echo "--- BLUN Hauptserver (Port 3200) ---"

run_test "GET / — Server antwortet" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3200/" \
  "200"

run_test "GET /api/health oder root" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3200/api/health" \
  "200"

run_test "GET /api/agents — Agent-Liste" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3200/api/agents" \
  "200"

run_test "GET /api/skills — Skills-Liste" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3200/api/skills" \
  "200"

run_test "GET /api/conversations — Konversationen" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3200/api/conversations" \
  "200"

run_test "GET /api/models — Modell-Liste" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3200/api/models" \
  "200"

run_test "POST /api/chat — ohne Body (400/422 erwartet)" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://localhost:3200/api/chat -H 'Content-Type: application/json' -d '{}'" \
  "400"

# ─── 3. Upload API (Port 3840) ───────────────────────────
echo ""
echo "--- Upload API (Port 3840) ---"

run_test "GET /health — Upload Service Health" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3840/health" \
  "200"

run_test "GET /api/uploads — Upload-Liste" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3840/api/uploads" \
  "200"

run_test "POST /api/upload — Textdatei hochladen" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST http://localhost:3840/api/upload -F 'file=@/tmp/test-upload.txt' -F 'agent_id=sandra-qa'" \
  "200"

run_test "POST /api/upload — PNG hochladen" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST http://localhost:3840/api/upload -F 'file=@/tmp/test-upload.png' -F 'agent_id=sandra-qa'" \
  "200"

# Oversize-Test (erstelle 11MB Datei)
dd if=/dev/zero of=/tmp/test-oversize.bin bs=1M count=11 2>/dev/null
run_test "POST /api/upload — 11MB Datei abgelehnt (413)" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST http://localhost:3840/api/upload -F 'file=@/tmp/test-oversize.bin' -F 'agent_id=sandra-qa'" \
  "413"
rm -f /tmp/test-oversize.bin

run_test "POST /api/upload — .exe abgelehnt (400)" \
  "echo 'fake' > /tmp/test-bad.exe && curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://localhost:3840/api/upload -F 'file=@/tmp/test-bad.exe' -F 'agent_id=sandra-qa'" \
  "400"
rm -f /tmp/test-bad.exe

# ─── 4. Datenbank ────────────────────────────────────────
echo ""
echo "--- Datenbank ---"

run_test "DB: blun_agents existiert" \
  "psql -h 127.0.0.1 -U postgres -d blun_agents -c 'SELECT 1' -t -q 2>&1 | grep -q 1 && echo" \
  ""

run_test "DB: agents Tabelle hat Einträge" \
  "psql -h 127.0.0.1 -U postgres -d blun_agents -c 'SELECT count(*) FROM agents' -t -q 2>&1 | grep -qE '[1-9]' && echo" \
  ""

run_test "DB: skills Tabelle existiert" \
  "psql -h 127.0.0.1 -U postgres -d blun_agents -c 'SELECT count(*) FROM agent_skills' -t -q 2>&1 | grep -qE '[0-9]' && echo" \
  ""

run_test "DB: conversations Tabelle" \
  "psql -h 127.0.0.1 -U postgres -d blun_agents -c 'SELECT count(*) FROM conversations' -t -q 2>&1 | grep -qE '[0-9]' && echo" \
  ""

# ─── 5. Nginx Reverse Proxy ──────────────────────────────
echo ""
echo "--- Nginx Proxy ---"

run_test "HTTPS/443 — blun.ai antwortet" \
  "curl -s -o /dev/null -w '%{http_code}' --max-time 5 -k https://localhost/" \
  "200"

run_test "CORS Headers vorhanden" \
  "curl -s -I --max-time 5 http://localhost:3200/ 2>/dev/null | grep -qi 'access-control' && echo" \
  ""

# ─── Ergebnis ────────────────────────────────────────────
echo ""
echo "========================================"
echo "  ERGEBNIS"
echo "========================================"
echo -e "$RESULTS"
echo ""
echo "----------------------------------------"
echo "  TOTAL: $TOTAL | PASS: $PASS | FAIL: $FAIL"
echo "----------------------------------------"

if [ "$FAIL" -gt 0 ]; then
  echo "  STATUS: FEHLER GEFUNDEN"
  exit 1
else
  echo "  STATUS: ALLE TESTS BESTANDEN"
  exit 0
fi
