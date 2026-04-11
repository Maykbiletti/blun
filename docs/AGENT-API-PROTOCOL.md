# AGENT API PROTOCOL

## 1. Zweck
Dieses Dokument definiert das verbindliche Task-Protokoll zwischen Orchestrator, Agent-Runner und einzelnen Agents.

Ziele:
- einheitliches Task-Format
- klare Status-Übergänge
- reproduzierbares Error-Handling
- nachvollziehbares Commit-Format

## 2. Begriffe
- **Task**: Ein atomarer Arbeitsauftrag mit eindeutiger `task_id`.
- **Run**: Eine konkrete Ausführung eines Tasks (`run_id`), inkl. Retries.
- **Agent**: Ausführende Instanz mit eigener Rolle und Workspace.
- **Orchestrator**: Komponente, die Tasks erstellt, verteilt und überwacht.

## 3. Task-Format
### 3.1 Pflichtfelder
```json
{
  "task_id": "tsk_2026_04_11_0001",
  "run_id": "run_2026_04_11_0001",
  "created_at": "2026-04-11T12:00:00.000Z",
  "source": "orchestrator",
  "agent": {
    "id": "agent-hanno",
    "role": "product-designer"
  },
  "repo": {
    "root": "/root/blun-worktrees/agent-hanno",
    "branch": "feature/agent-protocol"
  },
  "goal": "Dokumentiere das Agent-Task-Protokoll",
  "constraints": [
    "Keine Änderungen an agent-engine.js, server.js, index.html, db.js"
  ],
  "inputs": {
    "files": [],
    "context": {}
  },
  "deliverables": [
    "docs/AGENT-API-PROTOCOL.md"
  ],
  "status": "queued"
}
```

### 3.2 Feldbeschreibung
- `task_id` (string, required): global eindeutige Task-ID.
- `run_id` (string, required): eindeutige Ausführungs-ID, neu pro Retry.
- `created_at` (ISO-8601, required): Erzeugungszeitpunkt in UTC.
- `source` (string, required): Ursprung (`orchestrator`, `manual`, `system`).
- `agent` (object, required): Ziel-Agent mit `id`, `role`.
- `repo` (object, required): Arbeitskontext (`root`, `branch`).
- `goal` (string, required): fachliches Ziel.
- `constraints` (string[], optional): harte Verbote/Regeln.
- `inputs` (object, optional): Referenzen auf Kontext, Dateien, Parameter.
- `deliverables` (string[], required): erwartete Artefakte.
- `status` (enum, required): aktueller Task-Status.
- `metadata` (object, optional): freie strukturierte Zusatzdaten.

### 3.3 Status-Werte
Zulässige `status`-Werte:
- `queued`
- `assigned`
- `in_progress`
- `blocked`
- `failed`
- `completed`
- `cancelled`

## 4. Status-Übergänge
### 4.1 Erlaubte Übergänge
```text
queued -> assigned
assigned -> in_progress
in_progress -> blocked
in_progress -> failed
in_progress -> completed
in_progress -> cancelled
blocked -> in_progress
blocked -> failed
blocked -> cancelled
failed -> queued            (nur als neuer run_id / Retry)
assigned -> cancelled
queued -> cancelled
```

### 4.2 Übergangsregeln
- Jeder Übergang MUSS ein Status-Event schreiben.
- Jeder Übergang MUSS `updated_at` in UTC setzen.
- Übergänge nach `completed` sind unzulässig.
- Übergänge nach `cancelled` sind unzulässig.
- Retry nach `failed` erfolgt als neuer Run (`run_id` neu, `task_id` gleich).

### 4.3 Status-Event-Format
```json
{
  "task_id": "tsk_2026_04_11_0001",
  "run_id": "run_2026_04_11_0001",
  "from": "in_progress",
  "to": "blocked",
  "timestamp": "2026-04-11T12:22:10.000Z",
  "actor": "agent-hanno",
  "reason": "missing_dependency",
  "details": {
    "dependency": "figma-token-export"
  }
}
```

## 5. Error-Handling
### 5.1 Error-Klassen
- `validation_error`: ungültiges Task-Payload oder fehlende Pflichtfelder.
- `constraint_violation`: Verstoß gegen Task-Constraints.
- `dependency_error`: fehlende externe Voraussetzung.
- `runtime_error`: Ausführungsfehler während Bearbeitung.
- `timeout_error`: Zeitlimit überschritten.
- `cancelled_error`: Lauf aktiv abgebrochen.

### 5.2 Error-Objekt
```json
{
  "code": "dependency_error",
  "message": "Missing design token file",
  "retryable": true,
  "occurred_at": "2026-04-11T12:24:01.000Z",
  "context": {
    "task_id": "tsk_2026_04_11_0001",
    "run_id": "run_2026_04_11_0001",
    "step": "resolve_inputs"
  }
}
```

### 5.3 Regeln
- Bei `validation_error`: sofort `failed`, kein Retry ohne Payload-Fix.
- Bei `constraint_violation`: sofort `failed`, manuelle Intervention erforderlich.
- Bei `dependency_error`: `blocked` oder `failed` je nach Lösbarkeit.
- Bei `runtime_error`: einmal Retry erlaubt, danach `failed`.
- Bei `timeout_error`: `failed` mit `retryable=true`.
- Fehler müssen deterministisch codiert werden (`code` stabil, maschinenlesbar).

### 5.4 Retry-Policy
- Standard: max. 1 automatischer Retry.
- Backoff: exponentiell (z. B. 30s, 120s).
- Jeder Retry erzeugt neue `run_id`.
- Retry darf nur bei `retryable=true` erfolgen.

## 6. Commit-Format
### 6.1 Commit Message Schema
```text
type(scope): summary

Task: <task_id>
Run: <run_id>
Status: completed|failed

Changes:
- <kurzer Punkt 1>
- <kurzer Punkt 2>

Constraints:
- <beachtete Constraint oder "none">

Refs:
- Deliverable: <pfad>
```

### 6.2 Konventionen
- `type`: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- `scope`: betroffener Bereich, z. B. `agent-protocol`, `wizard-ui`.
- `summary`: max. 72 Zeichen, präzise und aktiv formuliert.
- Kein Sammel-Commit für mehrere unabhängige Tasks.
- Jeder Commit MUSS genau einem `task_id` zuordenbar sein.

### 6.3 Beispiel
```text
docs(agent-protocol): add task lifecycle and error handling spec

Task: tsk_2026_04_11_0001
Run: run_2026_04_11_0001
Status: completed

Changes:
- Added canonical task payload schema
- Defined allowed status transitions and retry semantics
- Added error model and commit contract

Constraints:
- none

Refs:
- Deliverable: docs/AGENT-API-PROTOCOL.md
```

## 7. Minimaler Ablauf
1. Orchestrator erstellt Task mit `status=queued`.
2. Task wird Agent zugewiesen (`assigned`).
3. Agent startet Bearbeitung (`in_progress`).
4. Bei Problem: `blocked` + strukturiertes Error/Event.
5. Nach Lösung wieder `in_progress`.
6. Abschluss mit `completed` oder final `failed`.
7. Commit nach Schema mit `task_id`/`run_id` im Body.

## 8. Validierungsregeln (MUST)
- `task_id`, `run_id`, `goal`, `deliverables`, `status` dürfen nie leer sein.
- `status` muss aus erlaubter Enum stammen.
- `deliverables` müssen relative Repo-Pfade sein.
- `created_at` und Event-Timestamps müssen UTC-ISO-8601 sein.
- Status-Event `from` muss dem zuletzt bekannten Status entsprechen.
- Finalstatus (`completed`, `failed`, `cancelled`) darf nur einmal gesetzt werden.

## 9. Nicht-Ziele
- Keine Definition von UI-Workflows.
- Keine Festlegung transport-spezifischer APIs (HTTP/gRPC/Queue).
- Keine Rollout- oder Deployment-Strategie.
