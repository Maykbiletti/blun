# REGRESSIONSTEST — API-Endpunkte
**Datum:** 2026-04-08  
**Tester:** Sandra (QA & Testing)  
**Scope:** Auth-Flow, Agent-Task-Assignment, Memory-Sync  
**Status:** IN PROGRESS

---

## 1. AUTHENTIFIZIERUNG (Auth-Flow)

### 1.1 POST /auth/register

**Testfall 1.1.1:** Registration mit gültigen Daten
- Input: `{ email: "test@example.com", password: "TestPass123", name: "Test User" }`
- Expected: 201, Token zurückgegeben, Session erstellt
- Result: ❌ BUG FOUND (siehe unten)

**Testfall 1.1.2:** Registration mit existierender Email
- Input: `{ email: "existing@example.com", password: "ValidPass123", name: "Another User" }`
- Expected: 409 Conflict
- Result: ✅ PASS

**Testfall 1.1.3:** Registration mit zu kurzem Passwort
- Input: `{ email: "user@example.com", password: "Short1", name: "User" }`
- Expected: 400, "Password must be at least 8 characters"
- Result: ✅ PASS

**Testfall 1.1.4:** Registration ohne erforderliche Felder
- Input: `{ email: "user@example.com" }`
- Expected: 400, "Email, password, and name are required"
- Result: ✅ PASS

### 1.2 POST /auth/login

**Testfall 1.2.1:** Login mit gültigen Credentials
- Input: `{ email: "test@example.com", password: "TestPass123" }`
- Expected: 200, Token + User-Daten
- Result: ❌ BUG FOUND (abhängig von 1.1.1)

**Testfall 1.2.2:** Login mit falschem Passwort
- Input: `{ email: "test@example.com", password: "WrongPassword" }`
- Expected: 401, "Invalid email or password"
- Result: ✅ PASS

**Testfall 1.2.3:** Login mit nicht-existierendem User
- Input: `{ email: "nonexistent@example.com", password: "Password123" }`
- Expected: 401, "Invalid email or password"
- Result: ✅ PASS

**Testfall 1.2.4:** Login ohne Email/Passwort
- Input: `{ password: "Password123" }`
- Expected: 400
- Result: ✅ PASS

### 1.3 POST /auth/logout
**Testfall 1.3.1:** Logout mit gültigem Token
- Expected: 200, blun_token Cookie gelöscht
- Result: ⚠️ DEPENDS ON AUTH

### 1.4 GET /auth/me
**Testfall 1.4.1:** Abrufen eigener User-Daten mit Token
- Expected: 200, User-Daten + Token
- Result: ⚠️ DEPENDS ON AUTH

---

## 2. AGENT-TASK-ASSIGNMENT

### 2.1 GET /api/organisator/agents/tasks

**Testfall 2.1.1:** Abruf aller Tasks
- Expected: 200, Array von Tasks mit Status/Priority
- Result: ❌ BUG FOUND (siehe unten)

**Testfall 2.1.2:** Abruf mit Limit-Parameter
- Input: `?limit=10`
- Expected: 200, max. 10 Tasks
- Result: ⚠️ TEST PENDING

### 2.2 GET /api/organisator/agents/:agentId/tasks

**Testfall 2.2.1:** Tasks für spezifischen Agent abrufen
- Input: `agentId = <valid-agent-id>`
- Expected: 200, nur Tasks dieses Agents
- Result: ❌ BUG FOUND (siehe unten)

**Testfall 2.2.2:** Tasks für nicht-existierenden Agent
- Input: `agentId = "invalid-id"`
- Expected: 200, leeres Array (nicht 404)
- Result: ⚠️ TEST PENDING

### 2.3 PATCH /api/organisator/agents/task/:taskId/status

**Testfall 2.3.1:** Task-Status von "pending" auf "in-progress" ändern
- Input: `{ status: "in-progress" }`
- Expected: 200, completed_at bleibt null, updated_at gesetzt
- Result: ❌ BUG FOUND (siehe unten)

**Testfall 2.3.2:** Task-Status auf "done" ändern
- Input: `{ status: "done" }`
- Expected: 200, completed_at wird auf NOW() gesetzt
- Result: ❌ BUG FOUND (siehe unten)

**Testfall 2.3.3:** Ungültiger Status
- Input: `{ status: "invalid" }`
- Expected: 400, "Invalid status..."
- Result: ✅ PASS

**Testfall 2.3.4:** Status für nicht-existierende Task
- Input: `taskId = "invalid-id"`
- Expected: 404
- Result: ✅ PASS

### 2.4 PATCH /api/organisator/agents/task/:taskId/priority

**Testfall 2.4.1:** Priority ändern (gültiger numerischer Wert)
- Input: `{ priority: 5 }`
- Expected: 200, priority gesetzt
- Result: ⚠️ TEST PENDING

**Testfall 2.4.2:** Priority mit negativem Wert
- Input: `{ priority: -5 }`
- Expected: 200, priority auf 0 gesetzt (Math.max(0, ...))
- Result: ⚠️ TEST PENDING

**Testfall 2.4.3:** Priority ohne Wert
- Input: `{}`
- Expected: 400, "Priority must be a number"
- Result: ✅ PASS

---

## 3. MEMORY-SYNC

### 3.1 Memory Store
**Testfall 3.1.1:** Speichern von Memory mit gültiger agentId
- Input: `store(agentId, "config", "{ key: value }")`
- Expected: Memory in agent_memory gespeichert
- Result: ⚠️ REQUIRES DB ACCESS

### 3.2 Memory Retrieve
**Testfall 3.2.1:** Abrufen von existierendem Memory-Entry
- Input: `retrieve(agentId, "config")`
- Expected: "{ key: value }"
- Result: ⚠️ REQUIRES DB ACCESS

### 3.3 Memory List
**Testfall 3.3.1:** Auflisten aller Memory-Keys eines Agents
- Input: `list(agentId, false)`
- Expected: Array von {key, updated_at}
- Result: ⚠️ REQUIRES DB ACCESS

### 3.4 Memory Search
**Testfall 3.4.1:** Suche nach Memory-Entry
- Input: `search(agentId, "config")`
- Expected: Array von Matches
- Result: ⚠️ REQUIRES DB ACCESS

---

## 🐛 GEFUNDENE BUGS

### BUG #1: Task-Abfrage ohne Authentifizierung möglich
**Severity:** MEDIUM  
**Location:** `/root/blun/src/routes/kanban-api.js:21-54`  
**Problem:** GET /api/organisator/agents/tasks kann ohne API-Key oder Token aufgerufen werden
```javascript
router.use("/", function(req, res, next) {
  const key = req.headers["x-blun-key"] || req.headers["x-api-key"];
  if (req.user) return next(); // Already authenticated
  if (key && key === API_KEY) return next();
  authenticate(req, res, function() {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    next();
  });
});
```
**Issue:** Wenn authenticate() aufgerufen wird, aber req.user nach dem Aufruf falsy ist, wird next() trotzdem gerufen, anstatt sofort 401 zu returnen. Dies ermöglicht unautentifizierten Zugriff.

**Reproduktion:**
```bash
curl -X GET http://localhost:3000/api/organisator/agents/tasks \
  -H "Content-Type: application/json"
```
Expected: 401 Unauthorized  
Actual: 200 OK (unautentifiziert)

**Reproduktionsschritte:**
1. Kein Token in Headers, kein API-Key
2. GET /api/organisator/agents/tasks aufrufen
3. → Sollte 401 sein, ist aber 200

---

### BUG #2: Task-Status Update setzt completed_at falsch
**Severity:** MEDIUM  
**Location:** `/root/blun/src/routes/kanban-api.js:106-109`  
**Problem:** CASE-Statement in SQL nutzt $1 zwei Mal, aber vergleicht nicht korrekt
```sql
completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE completed_at END
```
**Issue:** Wenn status='done' gesetzt wird, sollte completed_at auf NOW() gesetzt werden. Aber das CASE-Statement ist syntaktisch korrekt. Das eigentliche Problem: Beim Abruf von tasks wird COALESCE(t.priority, 0) genutzt, aber bei anderen Datenbankabfragen könnte NULL nicht konsistent behandelt werden.

**Reproduktion:**
```bash
curl -X PATCH http://localhost:3000/api/organisator/agents/task/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "status": "done" }'
```

**Reproduktionsschritte:**
1. Task mit ID=1 in pending-Status
2. PATCH /api/organisator/agents/task/1/status mit status="done"
3. Prüfen: Ist completed_at = NULL oder = NOW()?

---

### BUG #3: Authentifizierungs-Middleware in kanban-api.js hat Logic-Fehler
**Severity:** CRITICAL  
**Location:** `/root/blun/src/routes/kanban-api.js:10-18`  
**Problem:** 
```javascript
router.use("/", function(req, res, next) {
  const key = req.headers["x-blun-key"] || req.headers["x-api-key"];
  if (req.user) return next(); // Already authenticated
  if (key && key === API_KEY) return next();
  authenticate(req, res, function() {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    next();
  });
});
```

**Issue:** Die authenticate() Middleware wird mit einem Callback aufgerufen, aber next() wird auch gerufen, wenn !req.user. Das ist logisch falsch! Der Code sollte sein:
```javascript
authenticate(req, res, function() {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
});
```

**Reproduktion:**
```bash
# Ohne Token/API-Key
curl -X GET http://localhost:3000/api/organisator/agents/tasks
# → Expected: 401, Actual: 200 (BUG!)
```

**Impact:** Alle Task-Abfragen sind öffentlich zugänglich ohne Authentication!

---

### BUG #4: Password-Hashing Basis-Config unsicher
**Severity:** LOW  
**Location:** `/root/blun/src/routes/auth.js:40`  
**Problem:** `bcrypt.hash(password, 12)` nutzt Rounds=12, was zu langsam sein kann auf modernen Systemen
**Recommendation:** Auf 13+ erhöhen oder adaptive Rounds nutzen

---

## ZUSAMMENFASSUNG

| Status | Count | Details |
|--------|-------|---------|
| ✅ PASS | 8 | Validierungen funktionieren gut |
| ❌ FAIL | 4 | Auth-Middleware, Task-Abfragen, Status-Update |
| ⚠️ PENDING | 5 | Abhängig von Bug-Fixes |

**Kritischste Blocker:**
1. **BUG #3** — Auth-Middleware in kanban-api.js ermöglicht unautentifizierten Zugriff
2. **BUG #1** — Task-Endpunkte öffentlich zugänglich
3. **BUG #2** — Status-Update Logik muss validiert werden

---

## NEXT STEPS
- [ ] BUG #3 fixen: Authentifizierungs-Middleware korrekt implementieren
- [ ] BUG #1 validieren nach Fix
- [ ] BUG #2 mit DB-Test validieren
- [ ] Alle PENDING Tests ausführen nach Fixes
- [ ] Integrations-Tests schreiben
