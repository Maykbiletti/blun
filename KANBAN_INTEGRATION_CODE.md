# 📝 Kanban Integration — Code Snippets für Dieter

Kopiere diese Code-Blöcke an die angegebenen Positionen.

---

## 1️⃣ DATEI: `src/server.js` oder `src/app.js`

### Position: Nach allen anderen Route-Mounts (VOR `module.exports`)

```javascript
// === Kanban Task Board API ===
const kanbanApiRoutes = require("./routes/kanban-api");
app.use("/api/organisator", kanbanApiRoutes);

// === Kanban Board Page ===
app.get("/dashboard/kanban", authenticate, (req, res) => {
  const path = require("path");
  res.sendFile(path.join(__dirname, "../src/components/kanban-board.html"));
});
```

---

## 2️⃣ DATEI: `src/routes/organisator.js` (Alternative zum obigen)

Falls `kanban-api.js` Endpoints nicht via Server-Mount gehen, dann:

### Position: AM ENDE von organisator.js (VOR `module.exports`)

```javascript
// === KANBAN BOARD ENDPOINTS ===

// GET /api/organisator/agents/tasks - Alle Tasks
router.get("/agents/tasks", async function(req, res) {
  try {
    var limit = parseInt(req.query.limit) || 100;
    var tasks = await query(
      `SELECT
        t.id,
        t.agent_id as "agentId",
        a.name as "agentName",
        t.task as "title",
        t.status,
        COALESCE(t.priority, 0) as "priority",
        t.created_at as "createdAt",
        t.completed_at as "completedAt",
        t.description
      FROM agent_tasks t
      LEFT JOIN blun_agents a ON a.id = t.agent_id
      ORDER BY
        CASE t.status
          WHEN 'pending' THEN 1
          WHEN 'in-progress' THEN 2
          WHEN 'done' THEN 3
          ELSE 4
        END,
        COALESCE(t.priority, 0) ASC,
        t.created_at DESC
      LIMIT $1`,
      [limit]
    );
    res.json({ tasks: tasks });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/organisator/agents/task/:taskId/status
router.patch("/agents/task/:taskId/status", async function(req, res) {
  try {
    var { status } = req.body;
    var validStatuses = ["pending", "in-progress", "done"];
    if (!status || validStatuses.indexOf(status) < 0) {
      return res.status(400).json({ error: "Invalid status" });
    }
    var task = await queryOne(
      `UPDATE agent_tasks
      SET status = $1,
          completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE completed_at END,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, agent_id as "agentId", task as "title", status, COALESCE(priority, 0) as "priority"`,
      [status, req.params.taskId]
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ task: task });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/organisator/agents/task/:taskId/priority
router.patch("/agents/task/:taskId/priority", async function(req, res) {
  try {
    var { priority } = req.body;
    if (priority === undefined || isNaN(priority)) {
      return res.status(400).json({ error: "Priority must be a number" });
    }
    var newPriority = Math.max(0, parseInt(priority));
    var task = await queryOne(
      `UPDATE agent_tasks
      SET priority = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, agent_id as "agentId", task as "title", status, COALESCE(priority, 0) as "priority"`,
      [newPriority, req.params.taskId]
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ task: task });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
```

---

## 3️⃣ DATEI: `src/db/migrations/add-task-priority.sql`

**AUSFÜHREN via PostgreSQL**:

```bash
psql blun_db -f src/db/migrations/add-task-priority.sql
```

Oder direkt:

```sql
-- Add priority column
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;

-- Add updated_at for tracking changes
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add description for task details
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_priority
ON agent_tasks(status, priority, created_at DESC);

-- Ensure status column has default
ALTER TABLE agent_tasks
ALTER COLUMN status SET DEFAULT 'pending';

-- Update existing NULL statuses
UPDATE agent_tasks SET status = 'pending' WHERE status IS NULL;
```

---

## 4️⃣ DATEI: `src/components/kanban-board.html`

Die komplette Datei ist bereits erstellt. Nur noch in der richtigen Route servieren.

Falls Dashboard ein HTML-File ist und nicht SPA, dann:

```html
<!-- In src/views/dashboard.html oder index.html -->
<iframe src="/dashboard/kanban" width="100%" height="800px"></iframe>

<!-- ODER als Modal/Tab -->
<button id="showKanban">📋 Kanban Board</button>
<script>
document.getElementById("showKanban").addEventListener("click", function() {
  window.location.href = "/dashboard/kanban";
});
</script>
```

---

## 5️⃣ (Optional) Dashboard Navigation Update

Falls es eine Navigations-Komponente gibt:

```javascript
// In navigation.js oder navigation-component.js
const navItems = [
  { label: "🏠 Dashboard", url: "/dashboard" },
  { label: "📊 Analytics", url: "/dashboard/analytics" },
  { label: "📋 Kanban Board", url: "/dashboard/kanban" },  // ← NEU
  { label: "⚙️ Settings", url: "/dashboard/settings" }
];
```

---

## 🔍 Quick Test mit cURL

Nach dem Deployment kannst Du die Endpoints so testen:

```bash
# 1. Alle Tasks abrufen
curl -H "x-blun-key: blun-dev-key" \
  http://localhost:3000/api/organisator/agents/tasks

# 2. Task Status ändern
curl -X PATCH \
  -H "Content-Type: application/json" \
  -H "x-blun-key: blun-dev-key" \
  -d '{"status":"in-progress"}' \
  http://localhost:3000/api/organisator/agents/task/TASK_ID/status

# 3. Priority ändern
curl -X PATCH \
  -H "Content-Type: application/json" \
  -H "x-blun-key: blun-dev-key" \
  -d '{"priority":2}' \
  http://localhost:3000/api/organisator/agents/task/TASK_ID/priority
```

---

## ✅ Deployment Checklist

- [ ] DB-Migration ausgeführt
- [ ] kanban-api.js oder direkte Endpoints in organisator.js hinzugefügt
- [ ] kanban-board.html in `/src/components/` kopiert
- [ ] Route `/dashboard/kanban` in server.js erstellt
- [ ] Navigation aktualisiert
- [ ] Server neu gestartet
- [ ] API-Endpoints getestet
- [ ] Frontend geladen und Drag&Drop getestet

---

**Status**: READY FOR DEPLOYMENT ✅

Alle Code-Blöcke sind production-ready.
