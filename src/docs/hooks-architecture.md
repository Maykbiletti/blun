# Hooks Architecture — BLUN Agent System

- Autor: Greta (Agent Architektin)
- Datum: 2026-04-08
- Status: Accepted

## Überblick

Hooks sind Event-gesteuerte Erweiterungspunkte im Agent-Lifecycle. Sie ermöglichen
es, auf System-Events zu reagieren ohne Core-Code zu ändern.

## Hook-Typen

### Lifecycle Hooks

| Hook | Trigger | Payload | Verwendung |
|---|---|---|---|
| `agent.created` | Neuer Agent registriert | `{ agentId, role, config }` | Initiale Konfiguration, Monitoring-Setup |
| `agent.started` | Agent-Prozess gestartet | `{ agentId, pid, timestamp }` | Health-Check Registration |
| `agent.stopped` | Agent-Prozess gestoppt | `{ agentId, reason, exitCode }` | Cleanup, Restart-Logic |
| `agent.error` | Unbehandelter Fehler | `{ agentId, error, context }` | Alerting, Error-Tracking |

### Task Hooks

| Hook | Trigger | Payload | Verwendung |
|---|---|---|---|
| `task.received` | Agent erhält Task | `{ taskId, action, source }` | Logging, Rate-Limit Check |
| `task.started` | Task-Execution beginnt | `{ taskId, agentId, tools }` | Audit-Trail |
| `task.completed` | Task erfolgreich | `{ taskId, result, duration }` | Metriken, Feed-Post (ADR-010) |
| `task.failed` | Task fehlgeschlagen | `{ taskId, error, retryable }` | Alerting, Auto-Retry |
| `task.delegated` | Task weitergeleitet | `{ taskId, from, to, reason }` | Delegation-Tracking |

### Security Hooks

| Hook | Trigger | Payload | Verwendung |
|---|---|---|---|
| `security.tool_denied` | Tool-Allowlist blockiert | `{ agentId, tool, reason }` | Security-Audit |
| `security.permission_check` | Permission-Prüfung | `{ agentId, resource, action, result }` | Compliance-Log |
| `security.sandbox_violation` | Sandbox-Grenze verletzt | `{ skillId, violation, details }` | Skill-Deaktivierung |

### Skill Hooks

| Hook | Trigger | Payload | Verwendung |
|---|---|---|---|
| `skill.installed` | Skill registriert | `{ skillId, version, trustLevel }` | Registry-Update |
| `skill.executed` | Skill ausgeführt | `{ skillId, executionId, metrics }` | Usage-Tracking |
| `skill.failed` | Skill-Execution fehlgeschlagen | `{ skillId, error, sandboxState }` | Diagnostik |

## Hook-Registration

```typescript
interface HookDefinition {
  event: string;                    // z.B. 'task.completed'
  handler: string;                  // Pfad zum Handler-Modul
  priority: number;                 // 0-100, höher = früher
  filter?: Record<string, any>;    // Event-Payload Filter
  async: boolean;                   // true = fire-and-forget
  timeout: number;                  // Max Ausführungszeit in ms
  enabled: boolean;
}

interface HookRegistry {
  register(hook: HookDefinition): void;
  unregister(event: string, handler: string): void;
  emit(event: string, payload: any): Promise<HookResult[]>;
  listByEvent(event: string): HookDefinition[];
}

interface HookResult {
  handler: string;
  status: 'success' | 'error' | 'timeout' | 'skipped';
  duration: number;
  error?: string;
}
```

## Execution-Modell

```
Event emittiert
  │
  ├─ Hooks nach Priority sortieren (höchste zuerst)
  │
  ├─ Für jeden Hook:
  │   ├─ Filter prüfen (payload muss matchen)
  │   ├─ async=true → fire-and-forget (kein Warten)
  │   ├─ async=false → await mit Timeout
  │   └─ Fehler in einem Hook stoppt NICHT die anderen
  │
  └─ HookResult[] zurückgeben
```

## Hook-Chain Regeln

1. **Hooks sind nicht-blockierend für den Core-Flow** — ein fehlgeschlagener Hook
   verhindert nie die Task-Execution
2. **Reihenfolge über Priority** — bei gleicher Priority: Registrierungsreihenfolge
3. **Timeout pro Hook** — Default 5000ms, konfigurierbar
4. **Keine Hook-zu-Hook Abhängigkeiten** — Hooks dürfen keine anderen Hooks direkt triggern
5. **Idempotenz** — Hooks können bei Retry mehrfach aufgerufen werden

## Integration mit bestehenden ADRs

- **ADR-008 (Tool-Allowlist):** `security.tool_denied` Hook für Audit-Trail
- **ADR-009 (Agent-to-Agent):** `task.delegated` Hook für Delegation-Tracking
- **Skill-System:** `skill.*` Hooks für Usage-Metriken und Sandbox-Monitoring

## Beispiel: Auto-Post bei Task-Completion

```typescript
// Hook-Registration für Instagram-Feed (ADR-010)
hookRegistry.register({
  event: 'task.completed',
  handler: 'src/hooks/feed-auto-post.ts',
  priority: 50,
  filter: { 'result.public': true },
  async: true,      // Feed-Post blockiert nicht den Task-Flow
  timeout: 10000,
  enabled: true,
});
```
