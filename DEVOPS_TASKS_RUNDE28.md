# DevOps Tasks — Runde 28 — Dokumentation

**Guenter | Infrastruktur**  
**Datum:** 2026-04-08  
**Status:** Vorbereitet, nicht ausgeführt (Push/Deploy Sperre aktiv)  

---

## Task 1: Migration 002-multi-tenant.sql — Vorbereitung

**Datei:** `/root/blun/MIGRATION_002_DRYRUN.md`

**Status:** Dokumentiert, **NOCH NICHT AUSGEFÜHRT**

**Was Dieter tun muss:**

```bash
# Phase 3: In Test-DB ausführen
psql -h localhost -U postgres -c "CREATE DATABASE blun_test_002;"
psql -h localhost -U postgres blun_test_002 < /root/blun/src/migrations/002-multi-tenant.sql

# Prüfen ob erfolgreich
psql -h localhost -U postgres blun_test_002 -c "\dt"  # Tables
psql -h localhost -U postgres blun_test_002 -c "\df"  # Functions

# Wenn erfolgreich: Test-DB löschen
psql -h localhost -U postgres -c "DROP DATABASE blun_test_002;"

# Outputs hier posten, dann Guenter gibt Grünes Licht für Phase 4
```

**Risiken dokumentiert in:** `/root/blun/MIGRATION_002_DRYRUN.md`  
**Rollback:** Backup + Git revert (siehe Dokument)  

---

## Task 2: PM2 Monitoring — RAM > 80GB + Crash Alert

**Datei:** `/root/blun/scripts/pm2-monitor.js`

**Status:** Skript vorbereitet, nicht aktiv

**Was das Script tut:**
- Alle 60 Sekunden System-RAM prüfen
- Wenn RAM > 80GB → Alert-Datei + Log
- PM2 Status prüfen (nach Crashes suchen)
- Alert per Slack-Integration (TODO)

**Wie starten (Dieter):**

```bash
# 1. Ausführbar machen
chmod +x /root/blun/scripts/pm2-monitor.js

# 2. Als PM2-Prozess starten (persistent)
cd /root/blun && pm2 start scripts/pm2-monitor.js --name "pm2-monitor" --restart-delay 10000

# 3. Speichern
pm2 save

# 4. Prüfen
pm2 logs pm2-monitor --lines 10 --nostream
```

**Output-Dateien:**
- `/root/backups/pm2-monitor.log` — detailliertes Log
- `/root/backups/alerts/<timestamp>_RAM_HIGH.txt` — Alerts
- `/root/backups/alerts/<timestamp>_PROCESS_CRASH.txt` — Prozess-Failures

**Optional: Slack Integration hinzufügen**
```bash
# In scripts/pm2-monitor.js, Zeile 73-77:
# Slack webhook URL ersetzen:
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Dann SendAlert() uncommentet und WEBHOOK_URL gesetzt
```

---

## Task 3: Disk-Check Automatisierung — Alert bei >85% Auslastung

**Datei:** `/root/blun/scripts/disk-monitor.sh`

**Status:** Skript vorbereitet, Cronjob-Eintrag benötigt

**Was das Script tut:**
- Prüft `/root` Disk-Nutzung
- Wenn > 85% → Alert + Logs + Top 10 größte Dirs
- Läuft im Cronjob (z.B. alle 10 Minuten)

**Wie einrichten (Dieter):**

```bash
# 1. Ausführbar machen
chmod +x /root/blun/scripts/disk-monitor.sh

# 2. Test-Lauf
/root/blun/scripts/disk-monitor.sh

# 3. Cronjob hinzufügen (alle 10 Minuten)
(crontab -l 2>/dev/null | grep -v 'disk-monitor.sh'; \
 echo "*/10 * * * * /root/blun/scripts/disk-monitor.sh >> /root/backups/disk-monitor.log 2>&1") | crontab -

# 4. Verifizieren
crontab -l | grep disk-monitor
```

**Output-Dateien:**
- `/root/backups/disk-monitor.log` — Log für jeden Check
- `/root/backups/alerts/disk_alert_YYYYMMDD.txt` — Alerts pro Tag

---

## Zusammenfassung — Was Dieter ausführt

| Task | Datei | Befehl | Intervall |
|------|-------|--------|-----------|
| 1 | `MIGRATION_002_DRYRUN.md` | Phase 3 (Test-DB) → Report | Manuell (Guenter wartet) |
| 2 | `pm2-monitor.js` | `pm2 start scripts/pm2-monitor.js` | Kontinuierlich (pm2) |
| 3 | `disk-monitor.sh` | Cronjob `*/10 * * * *` | Alle 10 Min. |

---

## Checklist für Dieter (noch NICHT ausführen)

- [ ] Task 1: Test-DB Migration ausführen → Outputs posten
- [ ] Task 2: PM2 Monitor starten → Status prüfen
- [ ] Task 3: Disk-Monitor Cronjob einrichten → Verifizieren

**Nur wenn:**
- [ ] Push/Deploy Sperre aufgehoben
- [ ] Alle Tests grün
- [ ] Guenter gibt Freigabe für Migration (Phase 4)

---

## Notizen

- Alle Scripts sind lokal vorbereitet
- Keine Git-Commits noch (Sperre aktiv)
- Alerts landen in `/root/backups/alerts/` (für manuelle Überprüfung)
- Slack-Integration ist ein Stub (TODO — Klaus kann implementieren)
- Migration Phase 4 wartet auf Grünes Licht nach Phase 3

**Status:** Bereit für Dieter, sobald Sperre aufgehoben

