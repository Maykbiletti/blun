# Migration 002-multi-tenant.sql — Dry-Run & Rollback-Plan

**Datum:** 2026-04-08  
**Status:** VORBEREITET, NOCH NICHT AUSGEFÜHRT  
**Ausführend:** Dieter  

---

## Schritt-für-Schritt Dry-Run

### Phase 1: Backup (VORHER)
```bash
# 1. Datenbank-Snapshot VOR Migration
pg_dump -h localhost -U postgres blun --file=/root/backups/blun_pre_002_$(date +%Y%m%d_%H%M%S).sql

# 2. Git Checkpoint
cd /root/blun && git tag "pre-migration-002-$(date +%Y%m%d_%H%M%S)" && git push pro --tags
```

**Was passiert:**
- Kompletter DB-Dump in `/root/backups/`
- Git Tag für schnellen Rollback

**Risiken:** Keine — nur Read

---

### Phase 2: Syntax-Check (DRY-RUN)
```bash
# 3. Syntax validieren (kein Commit)
psql -h localhost -U postgres blun --dry-run < /root/blun/src/migrations/002-multi-tenant.sql
```

**Was passiert:**
- psql parsed das SQL ohne auszuführen
- Fehler werden angezeigt (Syntax, Referenzen, etc.)

**Risiken:** Keine — Read-Only

---

### Phase 3: Migrations-Simulation
```bash
# 4. In TEST-DB ausführen (Simulation)
psql -h localhost -U postgres -c "CREATE DATABASE blun_test_002;"
psql -h localhost -U postgres blun_test_002 < /root/blun/src/migrations/001-multi-tenant-schema.sql  # falls benötigt
psql -h localhost -U postgres blun_test_002 < /root/blun/src/migrations/002-multi-tenant.sql

# 5. Ergebnis prüfen
psql -h localhost -U postgres blun_test_002 -c "\dt" # Tables prüfen
psql -h localhost -U postgres blun_test_002 -c "\df" # Functions prüfen
```

**Was passiert:**
- Migration läuft in isolierter Test-DB
- Wir sehen **exakt** was in Prod passiert
- Keine Auswirkung auf Live-Daten

**Risiken:** Keine — Test-DB wird danach gelöscht

---

### Phase 4: Echte Migration (NOCH NICHT!)
```bash
# ERST WENN Phase 3 erfolgreich UND genehmigt
psql -h localhost -U postgres blun < /root/blun/src/migrations/002-multi-tenant.sql
```

---

## Was die Migration macht

| Schritt | SQL-Befehl | Effekt | Risiko |
|---------|-----------|--------|--------|
| 1 | `ALTER TABLE companies ADD ...` | 4 neue Spalten (owner_user_id, schema_name, email, description) | GERING — IF NOT EXISTS, existierende Daten unverändert |
| 2 | `UPDATE companies SET schema_name ...` | Backfill für 0-N Reihen | GERING — nur neue Spalte |
| 3 | `ALTER TABLE sessions ADD ...` | +1 Spalte (active_company_id) | GERING — neue Spalte, optional |
| 4 | `CREATE INDEX` | Performance-Index auf companies(owner_user_id) | KEINE — nur Index |
| 5 | `CREATE FUNCTION create_company_schema()` | Neue PL/pgSQL Funktion | KEINE — neue Function |
| 6 | `ALTER TABLE ... ENABLE RLS` | Row-Level Security aktivieren | **HOCH** — könnte Queries brechen wenn Policies nicht stimmen |
| 7 | `CREATE POLICY ...` | RLS Policy für companies | HOCH — restringiert Zugriff |

---

## Rollback-Plan

**Wenn Phase 3 FEHLSCHLÄGT:**
```bash
# 1. Backup restore
pg_restore -d blun /root/backups/blun_pre_002_<timestamp>.sql

# 2. Git revert (falls committed)
cd /root/blun && git revert -n <commit-hash> && git commit -m "Revert migration 002"
```

**Wenn Phase 4 nach einigen Minuten fehlschlägt:**
```bash
# 1. Sofort RLS Policy rückgängig machen
psql -h localhost -U postgres blun -c "DROP POLICY IF EXISTS companies_owner_policy ON companies;"
psql -h localhost -U postgres blun -c "ALTER TABLE companies DISABLE ROW LEVEL SECURITY;"

# 2. Test: Apps still working?
curl http://localhost:3200/api/health

# 3. Wenn nicht: Full Rollback
pg_restore -d blun /root/backups/blun_pre_002_<timestamp>.sql
pm2 restart blun
```

---

## Voraussetzungen VOR Ausführung

- [ ] `pg_dump` erreichbar auf 65.21.76.124
- [ ] `/root/backups/` hat mind. 50GB frei (DB-Größe * 2)
- [ ] Alle Apps (blun, blun-staging) sind am Laufen
- [ ] Kein anderer wird DB ändern während Migration
- [ ] Backup-Tag ist im Remote-Git

---

## Checkliste für Dieter

```bash
# Vor Phase 3:
(crontab -l 2>/dev/null | grep backup) # → sollte laufen
df -h /root/backups/ # → mind. 50GB frei?
pm2 status # → blun + blun-staging online?
cd /root/blun && git status # → clean?

# Phase 3 starten: Wenn alles ✓
# Outputs hier posten:
# - Test-DB Migration-Resultat
# - \dt und \df von blun_test_002

# Phase 4 NUR wenn Phase 3 erfolgreich (Guenter gibt Grünes Licht)
```

---

## Status

**Dokumentation:** ✓ Fertig  
**Ausführung:** ⏸ Wartet auf Dieter + Go von Guenter  
**Backup:** Sobald Go, sofort Backup vor Phase 3  

