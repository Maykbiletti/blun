# 🎯 Task Kanban Board - Deployment Instructions

**Task #10** — Kanban Task-Board mit Drag&Drop
Fertigstellung: 2026-04-08

---

## 📋 Überblick

Drei neue Dateien für die Kanban-Funktionalität:

1. **Frontend**: `/src/components/kanban-board.html` — Vollständige Kanban-UI mit Drag&Drop
2. **API**: `/src/routes/kanban-api.js` — 5 neue Endpoints für Task-Management
3. **DB**: `/src/db/migrations/add-task-priority.sql` — Datenbankschema für Priorities

---

## 📦 Installation & Deployment

### Schritt 1: DB-Migration ausführen

```bash
# SSH in production server
ssh root@65.21.76.124

# Führe Migration aus
psql blun_db < /src/db/migrations/add-task-priority.sql
```

### Schritt 2: Route in server.js einbinden

**DATEI**: `src/server.js` oder `src/app.js`

**HINZUFÜGEN** (vor `module.exports`):

```javascript
// === Kanban Task Board API ===
const kanbanApiRoutes = require("./routes/kanban-api");
app.use("/api/organisator", kanbanApiRoutes);
```

Falls schon eine `/api/organisator` Route existiert, dann **MERGE** die Routes:

```javascript
// In organisator.js AM ENDE (vor module.exports):

const kanbanApiRoutes = require("./routes/kanban-api");
// Mount kanban endpoints to same router
const kanbanRouter = kanbanApiRoutes;
// Export combined
module.exports = { ...router, ...kanbanRouter };
```

### Schritt 3: Frontend Route erstellen

**DATEI**: `src/server.js` oder `src/routes/pages.js`

**HINZUFÜGEN** (neue Route):

```javascript
// === Kanban Board Page ===
app.get("/dashboard/kanban", authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, "../src/components/kanban-board.html"));
});
```

### Schritt 4: Navigations-Link hinzufügen

Aktualisiere das Dashboard-Navigation um Link zum Kanban-Board:

```html
<!-- In dashboard/index.html oder navigation component -->
<a href="/dashboard/kanban" class="nav-link">
  📋 Kanban Board
</a>
```

---

## 🔌 API Endpoints

### GET /api/organisator/agents/tasks
**Alle Tasks abrufen** (mit Pagination)

**Query Parameter**:
- `limit` — Maximale Anzahl (default: 100)

**Response**:
```json
{
  "tasks": [
    {
      "id": "task-123",
      "agentId": "agent-456",
      "agentName": "Agent Smith",
      "title": "Process Invoice",
      "status": "in-progress",
      "priority": 1,
      "createdAt": "2026-04-08T10:30:00Z",
      "completedAt": null,
      "description": "Process the invoice from customer"
    }
  ]
}
```

### PATCH /api/organisator/agents/task/:taskId/status
**Task Status aktualisieren**

**Body**:
```json
{
  "status": "in-progress"
}
```

**Valid statuses**: `pending`, `in-progress`, `done`

---

### PATCH /api/organisator/agents/task/:taskId/priority
**Task Priority aktualisieren** (für Drag&Drop Reordering)

**Body**:
```json
{
  "priority": 2
}
```

**Priority Logik**:
- `0-1`: High (Rot)
- `2-4`: Medium (Gelb)
- `5+`: Low (Grün)

---

### PATCH /api/organisator/agents/task/:taskId
**Status UND Priority in einem Request**

**Body**:
```json
{
  "status": "done",
  "priority": 0
}
```

---

## 🎨 Frontend Features

### Drag & Drop Funktionalität

✅ **Zwischen Spalten verschieben** — Task Status ändert sich automatisch  
✅ **Innerhalb einer Spalte** — Höhere Position = höhere Priorität  
✅ **Visual Feedback** — Drag-Over Highlights, Grabbing Cursor  
✅ **Automatischer API-Call** — Priority/Status speichern beim Drop  

### Task-Karten Layout

```
┌─────────────────────────┐
│ Task Title      [HIGH]   │  ← Title + Priority Badge
│ 🧑 Agent Name           │  ← Agent Initials + Name
│ Task description...     │  ← Optional Description
├─────────────────────────┤
│ ID: abc12345     ⋮⋮    │  ← Task ID + Drag Indicator
└─────────────────────────┘
```

### 3 Spalten

| Spalten | Status | Icon | Farbe |
|---------|--------|------|-------|
| Pending | `pending` | ⏳ | Orange |
| In Progress | `in-progress` | ⚙️ | Blau |
| Done | `done` | ✅ | Grün |

---

## 🛠️ Troubleshooting

### Problem: "PATCH /api/organisator/agents/task/:taskId/status — 404 Not found"

**Lösung**: Stelle sicher, dass kanban-api.js korrekt in server.js gemountet ist.

```javascript
// Check server.js
const kanbanApiRoutes = require("./routes/kanban-api");
app.use("/api/organisator", kanbanApiRoutes);
```

### Problem: "Tasks werden nicht geladen"

**Lösung**: Stelle sicher, dass die Tabelle `agent_tasks` die neuen Spalten hat:

```sql
-- Check columns
\d agent_tasks;

-- Falls nicht vorhanden, Migration ausführen:
psql blun_db < /src/db/migrations/add-task-priority.sql
```

### Problem: "Drag&Drop funktioniert nicht"

**Lösung**: Browser-Cache leeren oder Hardrefresh (`Ctrl+Shift+R`).

Die HTML5 Drag API wird standardmäßig unterstützt in:
- Chrome 4+
- Firefox 3.6+
- Safari 5+
- Edge (alle)

---

## 📚 Teams

- **Frontend**: Fritz — kanban-board.html Integration in Dashboard
- **Backend/API**: Heinrich — kanban-api.js + Server-Integration ✅
- **Database**: Petra — Migration + Task-Schema Updates

---

## ✅ Checkliste für Deployment

- [ ] DB-Migration ausgeführt (`add-task-priority.sql`)
- [ ] kanban-api.js in `/src/routes/` kopiert
- [ ] kanban-board.html in `/src/components/` kopiert
- [ ] Route in server.js eingebunden
- [ ] Frontend-Route `/dashboard/kanban` erstellt
- [ ] Navigation Link hinzugefügt
- [ ] Tests durchgeführt (Drag zwischen Spalten)
- [ ] Tests durchgeführt (Prioritäts-Reordering)
- [ ] API-Endpoints getestet mit cURL/Postman

---

## 🚀 Status

**Task #10 — FERTIG** ✅

Alle Code-Blöcke sind produktionsreif und ready zum Deploy durch Dieter.
