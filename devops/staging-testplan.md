# BLUN.ai — Staging Server Testplan (Port 3201)
# Sandra / QA — 2026-04-07
# Ziel: Alle kritischen Flows nach Staging-Deployment validieren

---

## Phase 0: Pre-Flight Checks

| # | Test | Kommando | Erwartung |
|---|------|----------|-----------|
| 0.1 | Port 3201 belegt | `ss -tlnp 'sport = :3201'` | Server lauscht |
| 0.2 | PM2 Prozess läuft | `pm2 status blun-staging` | Status: online |
| 0.3 | PM2 kein Restart-Loop | `pm2 status blun-staging` → restarts < 3 | Stabil |
| 0.4 | PostgreSQL erreichbar | `psql -h localhost -U blun -d blun_staging -c '\dt'` | Tabellen gelistet |
| 0.5 | Redis erreichbar | `redis-cli -n 1 ping` | PONG |
| 0.6 | Log-Verzeichnis existiert | `ls /var/log/blun/staging/` | out.log, error.log |
| 0.7 | Disk Space > 5GB | `df -BG /opt/blun/staging` | Genug Platz |
| 0.8 | .env korrekt geladen | `pm2 env blun-staging \| grep NODE_ENV` | staging |

---

## Phase 1: Smoke Tests (Blocker — muss alles grün sein)

| # | Test | Kommando | Erwartung |
|---|------|----------|-----------|
| 1.1 | Health-Endpoint | `curl -s http://localhost:3201/health` | 200 OK, JSON |
| 1.2 | Hauptseite lädt | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3201/` | 200 |
| 1.3 | Statische Assets | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3201/favicon.ico` | 200 oder 204 |
| 1.4 | API-Base erreichbar | `curl -s http://localhost:3201/api/` | JSON Response |
| 1.5 | Swagger UI (Feature-Flag) | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3201/api-docs` | 200 (ENABLE_SWAGGER=true) |
| 1.6 | Debug-Routes aktiv | `curl -s http://localhost:3201/debug/status` | 200 (ENABLE_DEBUG_ROUTES=true) |
| 1.7 | CORS Headers | `curl -s -I http://localhost:3201/api/ \| grep -i access-control` | Header vorhanden |
| 1.8 | Response-Time Baseline | `curl -s -w "time_total: %{time_total}s" http://localhost:3201/health` | < 500ms |
| 1.9 | Kein Error im Log | `tail -50 /var/log/blun/staging/error.log` | Leer oder nur Startup-Meldungen |
| 1.10 | Content-Type korrekt | `curl -s -I http://localhost:3201/api/ \| grep content-type` | application/json |

---

## Phase 2: Datenbank-Integrität

| # | Test | Kommando / Query | Erwartung |
|---|------|-----------------|-----------|
| 2.1 | Tabellen vorhanden | `\dt` in blun_staging | Alle erwarteten Tabellen |
| 2.2 | agent_skills Schema | `\d agent_skills` | Spalten: id, agent_id, skill_id, safe, version, installed_at |
| 2.3 | agents Tabelle | `SELECT count(*) FROM agents;` | > 0 (Seed-Daten) |
| 2.4 | skills Tabelle | `SELECT count(*) FROM skills;` | > 0 (Seed-Daten) |
| 2.5 | Foreign Keys intakt | `\d agent_skills` → FK constraints | FK zu agents, skills |
| 2.6 | Indizes vorhanden | `\di` | Indizes auf agent_id, skill_id |
| 2.7 | safe-Flag Default | `SELECT column_default FROM information_schema.columns WHERE column_name='safe' AND table_name='agent_skills';` | false |
| 2.8 | Migrations-Status | Migrations-Tabelle prüfen | Alle Migrations applied |
| 2.9 | Keine Orphan-Rows | `SELECT * FROM agent_skills WHERE agent_id NOT IN (SELECT id FROM agents);` | 0 Rows |
| 2.10 | Encoding korrekt | `SHOW server_encoding;` | UTF8 |

---

## Phase 3: Auth & Sessions

| # | Test | Kommando | Erwartung |
|---|------|----------|-----------|
| 3.1 | Login erfolgreich | `curl -X POST localhost:3201/api/auth/login -d '{"user":"test","pass":"test"}'` | 200, JWT Token |
| 3.2 | Login falsche Credentials | `curl -X POST localhost:3201/api/auth/login -d '{"user":"x","pass":"x"}'` | 401 Unauthorized |
| 3.3 | Geschützte Route ohne Token | `curl -s localhost:3201/api/agents` | 401 |
| 3.4 | Geschützte Route mit Token | `curl -H "Authorization: Bearer <token>" localhost:3201/api/agents` | 200 |
| 3.5 | Abgelaufener Token | Token mit exp in Vergangenheit senden | 401 |
| 3.6 | Manipulierter Token | Token-Payload ändern, senden | 401 |
| 3.7 | Admin-Route als User | `/api/admin/*` mit User-Token | 403 |
| 3.8 | Admin-Route als Admin | `/api/admin/*` mit Admin-Token | 200 |

---

## Phase 4: Canvas + Livelog (TASK 1 — P0)

| # | Test | Methode | Erwartung |
|---|------|---------|-----------|
| 4.1 | Canvas-Seite lädt | `curl localhost:3201/canvas` oder UI-Route | 200, HTML/JS |
| 4.2 | WebSocket-Verbindung (Livelog) | `wscat -c ws://localhost:3201/ws/livelog` | Verbindung hergestellt |
| 4.3 | Agent starten → Livelog streamt | WS-Message empfangen | Stream-Daten kommen an |
| 4.4 | Stop-Button → Agent stoppt | POST `/api/agent/stop` | 200, Agent idle |
| 4.5 | Stop → kein Orphan-Prozess | `pm2 status` / `ps aux` prüfen | Kein Zombie |
| 4.6 | Übernehmen → Content persistiert | POST `/api/canvas/adopt` | 200, Content gespeichert |
| 4.7 | Split-Screen-Route | UI-Zustand per Query-Param oder Route | Korrekte Aufteilung |
| 4.8 | Livelog bei 1000 Zeilen | Stress: 1000 Messages senden | Keine Disconnects |

---

## Phase 5: Skill-Katalog (TASK 3 — P0)

| # | Test | Methode | Erwartung |
|---|------|---------|-----------|
| 5.1 | Skill-Liste laden | `GET /api/skills` | 200, JSON Array |
| 5.2 | Skill mit safe=true anzeigen | `GET /api/skills?safe=true` | Nur safe Skills |
| 5.3 | Skill installieren (safe=true) | `POST /api/skills/:id/install` | 200, Installation OK |
| 5.4 | Skill installieren (safe=false) | `POST /api/skills/:id/install` | 403 Forbidden |
| 5.5 | Skill installieren ohne Auth | Kein Token senden | 401 |
| 5.6 | Install — DB-Eintrag prüfen | `SELECT * FROM agent_skills WHERE skill_id=:id` | Row vorhanden |
| 5.7 | Doppel-Install | Gleichen Skill nochmal installieren | Idempotent, kein Duplikat |
| 5.8 | Deinstallation | `DELETE /api/skills/:id/uninstall` | 200, Row gelöscht |
| 5.9 | Admin: safe-Flag setzen | `PATCH /api/admin/skills/:id {safe: true}` | 200, Flag aktualisiert |
| 5.10 | User: safe-Flag setzen | `PATCH /api/admin/skills/:id` mit User-Token | 403 |

---

## Phase 6: Agent Network Graph (TASK 2)

| # | Test | Methode | Erwartung |
|---|------|---------|-----------|
| 6.1 | Agents-Liste | `GET /api/agents` | 200, JSON Array mit Agents |
| 6.2 | Agent-Detail | `GET /api/agents/:id` | 200, Agent-Objekt |
| 6.3 | Agent-Connections | `GET /api/agents/:id/connections` | 200, Verbindungen |
| 6.4 | Graph-Daten Endpoint | `GET /api/graph/agents` | 200, Nodes + Edges |
| 6.5 | WebSocket: Live-Updates | WS auf `/ws/agents` | Node-Updates empfangen |

---

## Phase 7: Performance & Stabilität

| # | Test | Methode | Erwartung |
|---|------|---------|-----------|
| 7.1 | 50 parallele Requests | `ab -n 50 -c 10 http://localhost:3201/api/skills` | Alle 200, keine 5xx |
| 7.2 | 100 parallele Requests | `ab -n 100 -c 20 http://localhost:3201/health` | p99 < 500ms |
| 7.3 | Memory nach 10min Last | `pm2 monit` | < 500MB |
| 7.4 | Kein Memory-Leak (30min) | Memory-Snapshots vergleichen | Kein linearer Anstieg |
| 7.5 | CPU bei idle | `pm2 monit` bei Leerlauf | < 5% |
| 7.6 | DB Connection Pool | Connections prüfen | Pool nicht exhausted |
| 7.7 | Log-Rotation | Log-Größe nach 1h | Kein exponentielles Wachstum |
| 7.8 | Graceful Restart | `pm2 reload blun-staging` | Zero-Downtime, kein Request-Loss |

---

## Phase 8: Security Quick-Check

| # | Test | Methode | Erwartung |
|---|------|---------|-----------|
| 8.1 | SQL Injection | `GET /api/skills?name='; DROP TABLE skills;--` | Kein DB-Schaden, Input escaped |
| 8.2 | XSS in Skill-Name | Skill mit `<script>alert(1)</script>` Name | Wird escaped in Response |
| 8.3 | Path Traversal | `GET /api/files/../../etc/passwd` | 403 oder 400 |
| 8.4 | Rate-Limit (falls aktiv) | 100 Requests in 10s | 429 nach Threshold |
| 8.5 | Staging-Secrets nicht exponiert | `curl localhost:3201/debug/env` | Keine Secrets in Response |
| 8.6 | CSRF-Token Validierung | POST ohne CSRF-Token | 403 |
| 8.7 | Helmet/Security-Headers | `curl -I localhost:3201/` | X-Frame-Options, CSP etc. |
| 8.8 | .env nicht per HTTP abrufbar | `curl localhost:3201/.env` | 403 oder 404 |

---

## Automatisierung: Quick-Smoke Script

```bash
#!/usr/bin/env bash
# staging-smoke.sh — Schneller Smoke-Test für Port 3201
set -euo pipefail

BASE="http://localhost:3201"
PASS=0
FAIL=0

check() {
    local name="$1" url="$2" expected="$3"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$status" = "$expected" ]; then
        echo "  ✓ $name ($status)"
        ((PASS++))
    else
        echo "  ✗ $name — erwartet $expected, bekommen $status"
        ((FAIL++))
    fi
}

echo "=== BLUN Staging Smoke Test ==="
echo ""

# Server erreichbar?
if ! curl -s --connect-timeout 3 "$BASE/health" > /dev/null 2>&1; then
    echo "ABBRUCH: Server auf Port 3201 nicht erreichbar!"
    exit 1
fi

echo "[Smoke Tests]"
check "Health"          "$BASE/health"       "200"
check "Hauptseite"      "$BASE/"             "200"
check "API Base"        "$BASE/api/"         "200"
check "Swagger"         "$BASE/api-docs"     "200"
check "Skills-Liste"    "$BASE/api/skills"   "200"
check "Agents-Liste"    "$BASE/api/agents"   "200"

echo ""
echo "[Security]"
check "Env nicht exponiert" "$BASE/.env"      "403"
check "Path Traversal"      "$BASE/../../etc/passwd" "400"

echo ""
echo "[Auth]"
check "Ohne Token → 401"    "$BASE/api/agents" "401"

echo ""
echo "=== Ergebnis: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

---

## Checkliste: Vor jedem Staging-Deployment

- [ ] `staging-smoke.sh` läuft ohne Fehler
- [ ] Phase 1 (Smoke) komplett grün
- [ ] Phase 2 (DB) — Schema + Migrations geprüft
- [ ] Phase 3 (Auth) — Login + Token-Validierung OK
- [ ] Phase 4–6 — Feature-Tests nach Bedarf
- [ ] Phase 7 — Kein Memory-Leak nach 30min
- [ ] Phase 8 — Keine offensichtlichen Security-Lücken
- [ ] Error-Log sauber: `tail -100 /var/log/blun/staging/error.log`
- [ ] PM2 restarts = 0 nach Deployment

---

## Testumgebung

| Parameter | Wert |
|-----------|------|
| Server | localhost:3201 |
| DB | blun_staging (PostgreSQL, Port 5432) |
| Redis | localhost:6379, DB 1 |
| PM2 Config | `/tmp/blun-devops/staging.ecosystem.config.js` |
| Logs | `/var/log/blun/staging/` |
| App-Dir | `/opt/blun/staging` |
| Node-Env | staging |
