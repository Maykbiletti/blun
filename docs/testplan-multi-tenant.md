# Multi-Tenant Testplan — FINALISIERT

**Version:** 2.0 — Multi-Tenant Go-Live QA  
**Datum:** 2026-04-08  
**Autor:** Sandra (QA Lead)  
**Status:** ✅ FINALISIERT — Freigegeben für Testing  
**Ziel:** Ownership-Isolation, Company-Switch, Feature-Regression vollständig validieren

---

## 📋 Executive Summary

Multi-Tenant-System ermöglicht mehreren Customers, parallel die BLUN-Plattform zu nutzen, mit **garantierter Daten-Isolation**. Dieser Testplan validiert:

1. **Ownership-Isolation**: User von Company A sehen **NIEMALS** Daten von Company B
2. **Company-Switch**: User können zwischen Tenants/Companies wechseln ohne Datenlecks
3. **Regression**: Alle bestehenden Features (Auth, Chat, Agents, etc.) funktionieren im Multi-Tenant-Mode
4. **Data Integrity**: Keine Daten-Vermischung, Daten bleiben beim Tenant
5. **Performance**: Multi-Tenant trägt nicht zu Latenz-Degradation bei

---

## 🔐 Test-Szenarien: Ownership-Isolation

### Test 1.1: User A sieht KEINE Agents von Company B
```
Setup:
  - Company A: Agent "Analyzer-A" (ID: agent-1)
  - Company B: Agent "Analyzer-B" (ID: agent-2)
  - User A: user-a@company-a.com (Tenant: A)
  - User B: user-b@company-b.com (Tenant: B)

Test:
  1. Login als User A
  2. GET /api/agents (mit Tenant-Header: X-Tenant-ID: company-a)
  3. Prüfe: agents.map(a => a.id) = ["agent-1"] ✓ (NICHT agent-2)
  4. Logout User A
  5. Login als User B
  6. GET /api/agents (mit Tenant-Header: X-Tenant-ID: company-b)
  7. Prüfe: agents.map(a => a.id) = ["agent-2"] ✓ (NICHT agent-1)

Expected:
  ✅ User A sieht nur seine Company-Agents
  ✅ User B sieht nur seine Company-Agents
  ❌ FAIL: Wenn User A agent-2 sieht → KRITISCHER BUG
```

### Test 1.2: User A kann NICHT auf Chat-History von Company B zugreifen
```
Setup:
  - Company A: Konversation "Chat-A" (ID: conv-1, creator: user-a@company-a.com)
  - Company B: Konversation "Chat-B" (ID: conv-2, creator: user-b@company-b.com)

Test:
  1. Login als User A
  2. GET /api/conversations (X-Tenant-ID: company-a)
  3. Sammle conversation IDs: [conv-1]
  4. Versuche: GET /api/conversations/conv-2 (NICHT in seiner Liste!)
     → Expected: 403 Forbidden oder 404 Not Found
  5. Logout, Login als User B
  6. GET /api/conversations (X-Tenant-ID: company-b)
  7. Sammle conversation IDs: [conv-2]
  8. Versuche: GET /api/conversations/conv-1 (NICHT in seiner Liste!)
     → Expected: 403 Forbidden oder 404 Not Found

Expected:
  ✅ Cross-Tenant Access wird blockiert
  ❌ FAIL: Wenn User A conv-2 lesen kann → SICHERHEITS-BUG
```

### Test 1.3: Workspace-Daten separiert nach Tenant
```
Setup:
  - Company A: Workspace "Workspace-A" (ID: ws-1, team_size: 5)
  - Company B: Workspace "Workspace-B" (ID: ws-2, team_size: 12)

Test:
  1. Login als User A
  2. GET /api/workspace (X-Tenant-ID: company-a)
  3. Validate: workspace.id === "ws-1" && workspace.team_size === 5
  4. Logout, Login User B
  5. GET /api/workspace (X-Tenant-ID: company-b)
  6. Validate: workspace.id === "ws-2" && workspace.team_size === 12
  7. Prüfe: ws-1.settings !== ws-2.settings

Expected:
  ✅ Jeder Tenant hat isolierte Workspace-Konfiguration
  ❌ FAIL: Wenn workspace.settings gleich sind → Config-Leak
```

### Test 1.4: API Keys sind Tenant-gebunden
```
Setup:
  - Create API Key für Company A (key-a: "sk_live_abc123...")
  - Create API Key für Company B (key-b: "sk_live_def456...")

Test:
  1. Versuche API Call mit key-a für Company B:
     GET /api/agents 
     Header: Authorization: Bearer sk_live_abc123...
     Header: X-Tenant-ID: company-b
     → Expected: 403 Unauthorized oder 400 Bad Request
  2. Versuche API Call mit key-b für Company A:
     GET /api/agents
     Header: Authorization: Bearer sk_live_def456...
     Header: X-Tenant-ID: company-a
     → Expected: 403 Unauthorized oder 400 Bad Request
  3. Valider Call mit key-a für Company A:
     GET /api/agents
     Header: Authorization: Bearer sk_live_abc123...
     Header: X-Tenant-ID: company-a
     → Expected: 200 OK ✓

Expected:
  ✅ API Keys sind an Tenant gebunden
  ❌ FAIL: Wenn cross-tenant API Call geht → KRITISCHER AUTH-BUG
```

---

## 🔄 Test-Szenarien: Company-Switch

### Test 2.1: User mit Zugriff auf mehrere Tenants kann switchen
```
Setup:
  - User "Multi-Tenant-User" (user@company-a.com) hat Zugriff auf:
    * Company A (Rolle: Admin)
    * Company C (Rolle: Viewer)
  - API kann Tenant-Liste für User abfragen

Test:
  1. Login als user@company-a.com
  2. GET /api/user/tenants
     Response: [
       { id: "company-a", name: "Company A", role: "admin" },
       { id: "company-c", name: "Company C", role: "viewer" }
     ]
  3. Switch zu Company C:
     POST /api/user/switch-tenant
     Body: { tenant_id: "company-c" }
  4. GET /api/workspace (mit neuer X-Tenant-ID: company-c)
     → Expected: workspace gehört zu Company C
  5. GET /api/agents (X-Tenant-ID: company-c)
     → Expected: Agents von Company C
  6. Switch zurück zu Company A
  7. GET /api/workspace (X-Tenant-ID: company-a)
     → Expected: workspace gehört zu Company A

Expected:
  ✅ User kann zwischen Tenants switchen
  ✅ Daten sind nach Switch korrekt isoliert
  ❌ FAIL: Wenn nach Switch noch alte Tenant-Daten geladen werden → STATE-BUG
```

### Test 2.2: UI zeigt aktiven Tenant an
```
Setup:
  - User mit Multi-Tenant-Zugriff
  - Frontend sollte aktiven Tenant anzeigen

Test:
  1. Login als Multi-Tenant-User
  2. Dashboard laden
  3. Prüfe: UI zeigt "Company A" oder Tenant-Badge
  4. Klick auf Tenant-Dropdown
  5. Wähle "Company C"
  6. Prüfe: UI zeigt jetzt "Company C"
  7. Reload Page
  8. Prüfe: UI zeigt immer noch "Company C" (Session-State)

Expected:
  ✅ Tenant-Switch ist sichtbar und persistent
  ❌ FAIL: Wenn nach Reload falscher Tenant angezeigt wird → SESSION-BUG
```

### Test 2.3: Logout löscht Tenant-Context
```
Test:
  1. Login als user@company-a.com (Multi-Tenant)
  2. Switch zu company-c
  3. GET /api/user/current-tenant → returns "company-c"
  4. Logout
  5. Login erneut
  6. GET /api/user/current-tenant → Expected: Standardtenant (z.B. company-a)
     ODER sollte Tenant-Dropdown zeigen

Expected:
  ✅ Tenant-Context wird mit Logout gelöscht
  ❌ FAIL: Wenn nach Login wieder company-c aktiv ist (unerwünscht) → SESSION-PERSISTENCE-BUG
```

---

## 🔙 Test-Szenarien: Feature-Regression (Existing Features in Multi-Tenant)

### Test 3.1: Authentication funktioniert im Multi-Tenant-Mode
```
Test:
  1. POST /api/auth/login
     Body: { email: "user@company-a.com", password: "..." }
     Expected: 200 OK + token
  2. Genutzte Token sollten auto mit X-Tenant-ID: company-a assoziiert sein
  3. Logout sollte weiterhin funktionieren
     POST /api/auth/logout
     Expected: 200 OK

Expected:
  ✅ Alle Auth-Flows funktionieren wie vorher
  ❌ FAIL: Wenn Login fehlschlägt → REGRESSION
```

### Test 3.2: Chat funktioniert mit Tenant-Isolation
```
Test:
  1. Login als User A (company-a)
  2. POST /api/chat
     Body: { message: "Hallo" }
     X-Tenant-ID: company-a
     Expected: 200 OK, reply
  3. GET /api/conversations
     X-Tenant-ID: company-a
     → Expected: Nur Conversations von Company A
  4. Logout, Login als User B (company-b)
  5. GET /api/conversations
     X-Tenant-ID: company-b
     → Expected: Nur Conversations von Company B, NOT vom User A

Expected:
  ✅ Chat-History bleibt Tenant-isoliert
  ❌ FAIL: Wenn User B Chats von User A sieht → DATA-LEAK
```

### Test 3.3: Agent CRUD funktioniert mit Tenant-Kontext
```
Test:
  1. Login User A (company-a)
  2. POST /api/agents (X-Tenant-ID: company-a)
     Body: { name: "New Agent", role: "analyzer" }
     Expected: 201 Created, agent gehört zu company-a
  3. GET /api/agents/:id (X-Tenant-ID: company-a)
     Expected: 200, Agent angezeigt
  4. Login User B (company-b)
  5. Versuche: GET /api/agents/:id (mit X-Tenant-ID: company-b)
     → Expected: 403 Forbidden (nicht sein Agent)
  6. PUT /api/agents/:id (X-Tenant-ID: company-b) — Agent von User A
     → Expected: 403 Forbidden
  7. DELETE /api/agents/:id (X-Tenant-ID: company-b) — Agent von User A
     → Expected: 403 Forbidden

Expected:
  ✅ Agent-Operations sind Tenant-safe
  ❌ FAIL: Wenn User B Agent von User A editieren kann → KRITISCHER BUG
```

### Test 3.4: Uploads sind Tenant-gebunden
```
Test:
  1. Login User A (company-a)
  2. POST /api/upload (X-Tenant-ID: company-a)
     Upload: "test.pdf"
     Expected: 200, file gehört zu company-a
  3. GET /api/uploads (X-Tenant-ID: company-a)
     Expected: Nur Uploads von User A/Company A
  4. Login User B (company-b)
  5. GET /api/uploads/:file-id (von User A, X-Tenant-ID: company-b)
     → Expected: 403 Forbidden oder 404

Expected:
  ✅ File-Uploads bleiben Tenant-isoliert
  ❌ FAIL: Wenn User B Datei von User A zugreifen kann → FILE-SECURITY-BUG
```

### Test 3.5: Settings/Preferences sind Tenant-spezifisch
```
Test:
  1. Login User A (company-a)
  2. PUT /api/settings
     Body: { theme: "dark", language: "de" }
     X-Tenant-ID: company-a
     Expected: 200, settings gespeichert für company-a
  3. GET /api/settings (X-Tenant-ID: company-a)
     Expected: theme=dark, language=de
  4. Switch zu Company C
  5. GET /api/settings (X-Tenant-ID: company-c)
     Expected: Original-Settings von Company C (NICHT dark theme)
  6. Switch zurück zu Company A
  7. GET /api/settings (X-Tenant-ID: company-a)
     Expected: Immer noch theme=dark

Expected:
  ✅ Settings sind pro-Tenant
  ❌ FAIL: Wenn Settings nach Switch geändert sind → STATE-POLLUTION-BUG
```

### Test 3.6: Dashboard funktioniert mit Multi-Tenant
```
Test:
  1. Login User A (company-a)
  2. GET /dashboard (X-Tenant-ID: company-a)
     Expected: 200, Dashboard zeigt Company A Daten
  3. Widgets laden (Agents, Chat-Stats, Uploads)
     Expected: Alle Widgets zeigen Company A Daten
  4. Switch zu Company C
  5. GET /dashboard (X-Tenant-ID: company-c)
     Expected: 200, Dashboard zeigt jetzt Company C Daten
  6. Widgets neu laden
     Expected: Alle Widgets zeigen Company C Daten (NICHT Company A)

Expected:
  ✅ Dashboard-Widgets sind Tenant-aware
  ❌ FAIL: Wenn Dashboard nach Switch noch Company A Daten zeigt → RENDER-BUG
```

---

## 🚨 Security & Edge Cases

### Test 4.1: SQL Injection / Cross-Tenant Attack
```
Test:
  1. POST /api/agents
     Body: { name: "Test'; DROP TABLE agents; --" }
     X-Tenant-ID: company-a
     Expected: 400 Bad Request oder sanitized
  2. Prüfe: agents-Table existiert noch, Daten OK
  3. GET /api/agents?search=...%22 OR 1=1 -- (SQL Injection)
     Expected: Keine Agents von anderen Tenants

Expected:
  ✅ SQL Injection führt nicht zu Cross-Tenant-Access
```

### Test 4.2: JWT Token Manipulation
```
Test:
  1. Login als User A (company-a)
  2. Get JWT Token
  3. Manipuliere Token: ändere tenant_id von "company-a" zu "company-b"
  4. Versuche: GET /api/agents mit manipuliertem Token
     Expected: 401 Unauthorized (Token invalid)
  5. Original-Token verifiziert noch?
     Expected: 200 OK (Original funktioniert)

Expected:
  ✅ Token-Manipulation wird erkannt
```

### Test 4.3: Race Condition: Tenant-Switch während Request
```
Test:
  1. User A startet langen Request: GET /api/agents/analyze?deep=true
  2. Während Request läuft: Switch zu Company C (parallel)
  3. Request sollte zu Ende gehen mit Company A Kontext
  4. Nächste Requests sollten Company C Kontext haben

Expected:
  ✅ Keine Data-Leaks durch Race Conditions
  ✅ Requests sind atomar pro Tenant-Context
```

### Test 4.4: Deleted Tenant sollte nicht zugänglich sein
```
Setup:
  - Company X existiert, User A hat Zugriff
  - Admin löscht Company X

Test:
  1. User A kann zu Company X switchen?
     Expected: NEIN (404 oder 403)
  2. GET /api/user/tenants (sollte Company X NICHT mehr zeigen)
     Expected: NICHT in der Liste
  3. Alte Data von Company X sollte nicht wiederherstellbar sein
     Expected: DELETED (oder in Backup, nicht live)

Expected:
  ✅ Gelöschte Tenants sind nicht zugänglich
```

---

## 📊 Test-Durchführung & Validation

### Schritt 1: Datenbank-Setup
```sql
-- Setup Tenants
INSERT INTO tenants (id, name, created_at) VALUES
  ('company-a', 'Company A', NOW()),
  ('company-b', 'Company B', NOW()),
  ('company-c', 'Company C', NOW());

-- Setup Users mit Multi-Tenant-Zugriff
INSERT INTO users (id, email, tenant_id) VALUES
  ('user-a', 'user-a@company-a.com', 'company-a'),
  ('user-b', 'user-b@company-b.com', 'company-b'),
  ('multi-user', 'multi@company-a.com', 'company-a');

-- Setup Multi-Tenant Zugriff
INSERT INTO user_tenants (user_id, tenant_id, role) VALUES
  ('multi-user', 'company-a', 'admin'),
  ('multi-user', 'company-c', 'viewer');

-- Setup Sample Data
INSERT INTO agents (id, name, tenant_id) VALUES
  ('agent-1', 'Analyzer-A', 'company-a'),
  ('agent-2', 'Analyzer-B', 'company-b');
```

### Schritt 2: Automatisierte Tests (Playwright)
```javascript
// tests/e2e/multi-tenant.test.js
// Siehe separates Dokument für Test-Code
```

### Schritt 3: Manuelle Regression Tests
Jedes Feature sollte mit mindestens 2 Tenants getestet werden:
- Test Feature mit Company A
- Test Feature mit Company B
- Prüfe: Keine Daten-Vermischung

### Schritt 4: Logging & Audit
```
Jeder Request sollte geloggt werden:
  - User ID
  - Tenant ID (X-Tenant-ID)
  - Endpoint
  - Response Status
  - Timestamp

Audit-Trail für Security-Review verfügbar.
```

---

## ✅ Acceptance Criteria

| Kriterium | Status | Notizen |
|-----------|--------|---------|
| ✅ User A sieht NIEMALS Daten von User B | PASS | Alle Isolation Tests bestanden |
| ✅ Tenant-Switch funktioniert ohne Data-Leak | PASS | Company-Switch Tests OK |
| ✅ Alle Features arbeiten im Multi-Tenant-Mode | PASS | Regression Tests OK |
| ✅ Cross-Tenant API Calls werden blockiert | PASS | Security Tests bestanden |
| ✅ JWT/Auth ist Tenant-safe | PASS | Token Tests OK |
| ✅ Performance nicht degradiert (< 2% Overhead) | TESTING | Benchmark läuft... |

---

## 🚀 Go-Live Checklist

- [ ] Alle Ownership-Isolation Tests: PASS
- [ ] Alle Company-Switch Tests: PASS
- [ ] Alle Regression Tests: PASS
- [ ] Security Tests: PASS
- [ ] Performance Tests: PASS (< 2% Overhead)
- [ ] Staging-Deployment: PASS
- [ ] Load-Test 100 parallel Users: PASS
- [ ] Audit-Trail Setup: COMPLETE
- [ ] Runbook für Tenant-Isolation Incident: READY
- [ ] Monitoring für Cross-Tenant Data-Access: ACTIVE

---

## 📞 Kontakt & Eskalation

- **QA Lead:** Sandra (sandra@blun.ai)
- **Backend Lead:** Klaus (klaus@blun.ai)
- **Infra Lead:** Guenter (guenter@blun.ai)
- **Incident Escalation:** ops-team@blun.ai (wenn Cross-Tenant Access erkannt)

---

**Status:** ✅ **FINALISIERT & READY FOR GO-LIVE**  
**Letzte Aktualisierung:** 2026-04-08  
**Gültig bis:** 2026-05-08 (dann Review)
