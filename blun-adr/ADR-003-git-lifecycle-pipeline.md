# ADR-003: Git Lifecycle — Agent Code → Review → Commit Pipeline

**Status:** Proposed | **Datum:** 2026-04-07 | **Autorin:** Greta, Agent Architektin

---

## Kernidee

Jeder Agent-generierte Code durchlaeuft eine **definierte Pipeline mit 6 Stages**, bevor er committet wird. Kein Code landet ohne Review im Repository.

```
DRAFT ──▶ VALIDATE ──▶ REVIEW ──▶ APPROVE ──▶ COMMIT ──▶ MERGE
```

---

## 1. Stage 1: DRAFT

Agent erstellt Code auf einem **isolierten Feature-Branch**.

```typescript
interface DraftStage {
  branchPattern: "feature/{agentId}/{taskId}";
  baseBranch: string;
  isolation: true;

  metadata: {
    agentId: string;
    taskId: string;
    taskDescription: string;
    confidence: number;          // 0-100
    filesChanged: string[];
    estimatedRisk: "low" | "medium" | "high";
  };
}
```

**Branch-Konvention:** `feature/{agent-name}-{nr}/{task-kurz}`
Beispiel: `feature/greta-001/websocket-layer`

**Regeln:**
- Ein Branch pro Task
- Agent darf nur auf eigenen Feature-Branch schreiben
- Kein Force-Push erlaubt
- Branch-Schutz auf `main`, `develop`, `staging`

---

## 2. Stage 2: VALIDATE (automatisch)

Automatische Quality Gates — kein menschlicher Eingriff noetig.

```typescript
interface ValidateStage {
  checks: ValidationCheck[];
  blockOnFailure: true;
  maxRetries: 3;
  timeout: 300_000;              // 5 Minuten
}

interface ValidationCheck {
  name: string;
  command: string;
  required: boolean;
  autofix: boolean;
}
```

| # | Check | Command | Required | Autofix |
|---|---|---|---|---|
| 1 | Lint | `eslint --fix` | Ja | Ja |
| 2 | TypeScript | `tsc --noEmit` | Ja | Ja |
| 3 | Unit Tests | `vitest run --changed` | Ja | Nein |
| 4 | Formatting | `prettier --check` | Ja | Ja |
| 5 | Security Scan | `npm audit --audit-level=high` | Ja | Nein |
| 6 | Bundle Size | `size-limit` | Warnung | Nein |
| 7 | Dependency Check | Keine neuen Deps ohne Whitelist | Ja | Nein |

**Autofix-Loop:** Agent bekommt Fehler-Output → fixt automatisch → pushed Fix-Commit → erneuter Check. Nach 3 Retries → Eskalation an Operator.

---

## 3. Stage 3: REVIEW

Routing nach Agent-Confidence und Task-Risiko.

```typescript
enum ReviewMode {
  AGENT_REVIEW    = "agent_review",     // confidence >= 80 AND risk = low
  OPERATOR_REVIEW = "operator_review",  // confidence >= 50 OR risk = medium
  DUAL_REVIEW     = "dual_review",      // confidence < 50 OR risk = high OR sensitive files
}
```

**Sensitive Files (immer DUAL_REVIEW):**
`**/*.env*`, `**/auth/**`, `**/payment/**`, `**/config/production.*`, `**/Dockerfile`, `**/docker-compose*.yml`, `**/.github/workflows/**`, `**/package.json`

**Diff-Summary (auto-generiert):**

```typescript
interface DiffSummary {
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  linesAdded: number;
  linesRemoved: number;
  summary: string;
  breakingChanges: boolean;
  newDependencies: string[];
  affectedTests: string[];
}
```

**Agent-Review Result:**

```typescript
interface AgentReviewResult {
  reviewerAgentId: string;
  verdict: "approve" | "request_changes" | "escalate";
  comments: {
    file: string;
    line: number;
    severity: "info" | "suggestion" | "issue" | "blocker";
    message: string;
  }[];
  securityConcerns: string[];
  performanceConcerns: string[];
}
```

---

## 4. Stage 4: APPROVE

```typescript
interface ApproveStage {
  approvedBy: string;             // "operator" | agentId
  approvedAt: number;
  conditions?: string[];
  action: "approve" | "approve_with_changes" | "reject" | "request_changes";
}
```

| Aktion | Effekt |
|---|---|
| `approve` | → Weiter zu COMMIT |
| `approve_with_changes` | Agent aendert → zurueck zu VALIDATE |
| `request_changes` | Agent bekommt Feedback → zurueck zu DRAFT |
| `reject` | Pipeline stoppt, Branch wird archiviert |

---

## 5. Stage 5: COMMIT

Automatischer, signierter Commit nach Approval. **Conventional Commits** Format.

```typescript
interface CommitMessage {
  type: "feat" | "fix" | "refactor" | "docs" | "test" | "chore";
  scope?: string;
  description: string;
  body?: string;
  trailers: {
    "Agent": string;              // "Greta <agent_greta_001>"
    "Task": string;               // "BLUN-042"
    "Reviewed-by": string;
    "Confidence": string;
    "Risk": string;
  };
}
```

Beispiel:
```
feat(websocket): add reconnect logic with exponential backoff

Implements automatic reconnection for WebSocket connections.
Starts at 1s delay, doubles up to 30s max, with jitter.

Agent: Greta <agent_greta_001>
Task: BLUN-042
Reviewed-by: Operator
Confidence: 85
Risk: low
```

---

## 6. Stage 6: MERGE

```typescript
interface MergeStage {
  strategy: "squash" | "rebase" | "merge-commit";
  targetBranch: string;
  cleanup: {
    deleteBranch: true;
    notifyAgents: string[];
    triggerDeploy?: string;
  };
}
```

| Szenario | Strategie |
|---|---|
| Einzelner sauberer Commit | Fast-Forward |
| Mehrere Commits (Autofix etc.) | Squash |
| Langlebiger Branch mit Historie | Merge-Commit |

---

## 7. Pipeline State Machine

```typescript
type PipelineStage = "draft" | "validate" | "review" | "approve" | "commit" | "merge" | "failed" | "rejected";
```

**Erlaubte Transitionen:**

```
draft ──────────▶ validate
validate ───────▶ review          (alle Checks bestanden)
validate ───────▶ draft           (autofix fehlgeschlagen)
review ─────────▶ approve         (approved)
review ─────────▶ draft           (changes_requested)
approve ────────▶ commit          (freigegeben)
approve ────────▶ validate        (approve_with_changes)
approve ────────▶ rejected
commit ─────────▶ merge           (commit erfolgreich)
commit ─────────▶ failed          (merge conflict)
merge ──────────▶ DONE
```

---

## 8. API Contracts

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/v1/pipeline` | POST | Neue Pipeline starten |
| `/api/v1/pipeline/:id` | GET | Pipeline-Status |
| `/api/v1/pipeline/:id/stage` | GET | Aktueller Stage + Details |
| `/api/v1/pipeline/:id/approve` | POST | Operator Approval |
| `/api/v1/pipeline/:id/reject` | POST | Operator Rejection |
| `/api/v1/pipeline/:id/review` | POST | Review-Kommentar |
| `/api/v1/pipelines?agent={id}` | GET | Alle Pipelines eines Agents |

---

## 9. WebSocket Events (ADR-001 konform)

| Event | Trigger |
|---|---|
| `pipeline.stage.changed` | Stage-Transition |
| `pipeline.check.passed` | Check bestanden |
| `pipeline.check.failed` | Check fehlgeschlagen |
| `pipeline.review.requested` | Review wartet auf Operator |
| `pipeline.approved` | Pipeline approved |
| `pipeline.merged` | Code in Target-Branch |
| `pipeline.failed` | Pipeline fehlgeschlagen |

---

## 10. Sicherheitsregeln

```typescript
const SECURITY_RULES = {
  protectedBranches: ["main", "develop", "staging", "release/*"],
  agentCanPushTo: "feature/{ownAgentId}/**",
  maxFilesPerPipeline: 20,
  maxLinesChanged: 500,           // Warnung ab 500, Block ab 1000
  forbidden: ["eval(", "exec(", "dangerouslySetInnerHTML", "process.env"],
};
```

---

## 11. Tech-Stack

| Komponente | Technologie |
|---|---|
| Pipeline-Engine | XState (State Machine) |
| Git-Operationen | simple-git (Node.js) |
| Checks | GitHub Actions / lokale Runner |
| State | PostgreSQL |
| Realtime | WebSocket (ADR-001) |
| Dashboard | React + Zustand |

---

## 12. Offene Punkte

- [ ] Parallel-Pipelines: Kann ein Agent mehrere gleichzeitig haben?
- [ ] Conflict-Resolution: Agent oder Operator bei Merge-Konflikten?
- [ ] Rollback-Stage: Automatisches Revert bei Post-Merge-Failure?
- [ ] Rate-Limiting: Max Pipelines pro Agent pro Stunde?
- [ ] Review-SLA: Timeout wenn Operator nicht reagiert?

---

**Abhaengigkeiten:** ADR-001 (WebSocket), ADR-002 (Network Graph zeigt Pipeline-Status)
