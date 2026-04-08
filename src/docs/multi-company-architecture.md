# Multi-Company Architecture — BLUN Agent System

- Autor: Greta (Agent Architektin)
- Datum: 2026-04-08
- Status: Accepted

## Überblick

BLUN unterstützt mehrere Unternehmen (Tenants) auf einer Plattform. Jedes Unternehmen
hat isolierte Agents, Skills, Daten und Konfigurationen. Kein Tenant kann auf
Ressourcen eines anderen Tenants zugreifen — außer explizit über den Agent Exchange (ADR-010).

## Tenant-Modell

```typescript
interface Tenant {
  tenantId: string;              // UUIDv4
  name: string;                  // Firmenname
  slug: string;                  // URL-safe Identifier
  plan: 'free' | 'pro' | 'enterprise';
  settings: TenantSettings;
  createdAt: string;
  status: 'active' | 'suspended' | 'trial';
}

interface TenantSettings {
  maxAgents: number;             // Free: 3, Pro: unlimited, Enterprise: unlimited
  maxSkills: number;             // Free: 10, Pro: 100, Enterprise: unlimited
  maxStorage: number;            // MB — Free: 500, Pro: 10000, Enterprise: custom
  allowExchange: boolean;        // Agent Exchange Feature
  allowPublicFeed: boolean;      // Instagram Feed Feature
  ssoEnabled: boolean;           // Enterprise only
  auditLogRetention: number;     // Tage — Enterprise: 365, Pro: 90, Free: 30
}
```

## Isolation-Layer

### 1. Daten-Isolation

```
Tenant A                         Tenant B
┌──────────────────────┐        ┌──────────────────────┐
│ agents_a.*           │        │ agents_b.*           │
│ skills_a.*           │        │ skills_b.*           │
│ tasks_a.*            │        │ tasks_b.*            │
│ configs_a.*          │        │ configs_b.*          │
│ /storage/tenant-a/   │        │ /storage/tenant-b/   │
└──────────────────────┘        └──────────────────────┘
         │                               │
         └───────────┬───────────────────┘
                     │
              Shared Layer (read-only)
         ┌───────────────────────┐
         │ system_skills.*       │
         │ marketplace_public.*  │
         │ platform_config.*     │
         └───────────────────────┘
```

**Strategie: Schema-per-Tenant (PostgreSQL)**

- Jeder Tenant bekommt ein eigenes DB-Schema: `tenant_{slug}`
- Shared-Daten in `public` Schema
- Row-Level Security (RLS) als zusätzliche Absicherung
- Connection-Pool pro Tenant mit eigenem DB-User

### 2. Agent-Isolation

```typescript
interface TenantAgentConfig {
  tenantId: string;
  agentId: string;
  // Agent sieht nur Ressourcen seines Tenants
  allowedSchemas: string[];       // ['tenant_acme']
  allowedPaths: string[];         // ['/storage/tenant-acme/**']
  // IPC nur innerhalb des Tenants
  ipcNamespace: string;           // 'tenant:acme'
  // Skills nur aus eigenem Tenant + System-Skills
  skillSources: ('tenant' | 'system' | 'marketplace')[];
}
```

### 3. Netzwerk-Isolation

| Kommunikation | Erlaubt | Mechanismus |
|---|---|---|
| Agent → Agent (gleicher Tenant) | Ja | IPC-Namespace `tenant:{slug}` |
| Agent → Agent (anderer Tenant) | Nur via Exchange | Exchange-Session mit Sandbox |
| Agent → Marketplace | Ja (read) | Public API |
| Agent → External API | Per Tenant-Config | Egress-Firewall |
| Agent → DB (eigener Tenant) | Ja | Schema-Isolation + RLS |
| Agent → DB (anderer Tenant) | Nein | DB-User hat keinen Zugriff |

## Tenant-Context Middleware

```typescript
interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  plan: string;
  userId: string;
  permissions: string[];
}

// Middleware-Chain für jeden Request
// 1. Auth → JWT validieren
// 2. TenantResolve → tenantId aus JWT/Header extrahieren
// 3. PlanCheck → Feature gegen Plan prüfen
// 4. SchemaSwitch → DB-Connection auf Tenant-Schema setzen
// 5. PathScope → Dateizugriffe auf Tenant-Root beschränken
// 6. IPCScope → Message-Bus auf Tenant-Namespace filtern
```

## Plan-Limits

| Feature | Free | Pro (€29/mo) | Enterprise |
|---|---|---|---|
| Agents | 3 | Unlimited | Unlimited |
| Skills | 10 | 100 | Unlimited |
| Storage | 500 MB | 10 GB | Custom |
| Agent Exchange | Nein | Ja | Ja + Private Exchange |
| Public Feed | Nein | Ja | Ja + Custom Branding |
| SSO/SAML | Nein | Nein | Ja |
| Audit-Log | 30 Tage | 90 Tage | 365 Tage |
| Support | Community | E-Mail | Dedicated |
| API Rate-Limit | 100/min | 1000/min | Custom |

## Cross-Tenant Communication (Agent Exchange)

Wenn ein Agent über den Exchange (ADR-010) geteilt wird:

1. **Leih-Agent läuft in Sandbox** — eigenes Temp-Schema, eigener Storage-Bereich
2. **Kein Zugriff auf Quell-Tenant Daten** — nur explizit freigegebene Inputs
3. **Kein Zugriff auf Ziel-Tenant Daten** — nur Sandbox-Bereich
4. **Session-basiert** — automatisches Cleanup nach Ablauf
5. **Audit-Trail** — alle Aktionen des Leih-Agents werden geloggt

```typescript
interface CrossTenantSession {
  sessionId: string;
  sourceTenant: string;          // Besitzer des Agents
  targetTenant: string;          // Nutzer des Agents
  agentId: string;
  permissions: ('read-only' | 'execute' | 'full')[];
  sandbox: {
    dbSchema: string;            // Temporäres Schema
    storagePath: string;         // Temporärer Storage
    ipcChannel: string;          // Isolierter IPC-Channel
  };
  expiresAt: string;
  autoRevoke: boolean;
}
```

## Migration-Pfad

1. **Phase 1:** Tenant-Tabelle + Schema-per-Tenant für neue Instanzen
2. **Phase 2:** Bestehende Single-Tenant Daten in `tenant_default` migrieren
3. **Phase 3:** Tenant-Middleware in alle API-Routen einbauen
4. **Phase 4:** Agent Exchange Cross-Tenant Sessions aktivieren

## Sicherheitsanforderungen

- Kein Tenant kann SQL-Queries gegen ein fremdes Schema ausführen
- Jeder DB-User hat nur Rechte auf sein Tenant-Schema + `public` (read-only)
- File-Paths werden serverseitig validiert — kein Path-Traversal möglich
- IPC-Messages werden gegen Tenant-Namespace gefiltert bevor sie zugestellt werden
- Audit-Log für alle Cross-Tenant Aktionen (Exchange-Sessions)
- Rate-Limits pro Tenant, nicht pro Agent
