# ADR-005: Skill Marketplace Architektur

**Status:** Proposed | **Datum:** 2026-04-07 | **Autorin:** Greta, Agent Architektin

---

## Kontext

Agents brauchen einen zentralen Ort, um Skills zu finden, zu installieren und zu verwalten. Skills muessen versioniert, geprueft und sicher installierbar sein. Kein Skill darf ohne Review in den Katalog.

---

## 1. Katalog-Struktur

```
skill-marketplace/
├── registry/                  # Zentrale Skill-Registry
│   ├── index.json             # Katalog-Index (ID, Name, Version, Hash)
│   └── manifests/             # Pro Skill ein Manifest
│       ├── web-scraper@1.2.0.json
│       ├── pdf-parser@2.0.1.json
│       └── ...
├── packages/                  # Gepackte Skill-Bundles (.tar.gz)
│   ├── web-scraper-1.2.0.tgz
│   └── ...
├── reviews/                   # Review-Ergebnisse pro Version
│   └── web-scraper@1.2.0-review.json
└── sandbox-profiles/          # Sandbox-Configs pro Safe-Level
    ├── safe-strict.json
    ├── safe-standard.json
    └── unsafe-flagged.json
```

---

## 2. Skill Manifest

```typescript
interface SkillManifest {
  id: string;                    // z.B. "blun.web-scraper"
  name: string;                  // Anzeigename
  version: string;               // SemVer: "1.2.0"
  author: {
    agentId?: string;            // Falls von Agent erstellt
    operatorId?: string;         // Falls von Operator erstellt
    name: string;
  };
  description: string;
  category: SkillCategory;       // "data", "communication", "analysis", ...
  tags: string[];

  // Abhaengigkeiten
  dependencies: SkillDependency[];
  peerDependencies: SkillDependency[];  // Muessen schon installiert sein

  // Sicherheit
  safeFlag: SafeLevel;           // "strict" | "standard" | "unsafe"
  permissions: SkillPermission[];
  sandboxProfile: string;        // Referenz auf Sandbox-Config

  // Kompatibilitaet
  minAgentVersion: string;
  maxAgentVersion?: string;
  compatibleRoles: AgentRole[];  // Welche Rollen duerfen installieren

  // Metadaten
  checksum: string;              // SHA-256 des Bundles
  publishedAt: string;           // ISO-8601
  reviewStatus: ReviewStatus;
  changelog: ChangelogEntry[];
}

type SafeLevel = "strict" | "standard" | "unsafe";

interface SkillDependency {
  skillId: string;
  versionRange: string;          // SemVer Range: "^1.0.0"
  optional: boolean;
}

interface SkillPermission {
  type: "filesystem" | "network" | "ipc" | "env";
  scope: string;                 // z.B. "/tmp/skill-data/**" oder "*.blun.ai"
  access: "read" | "write" | "execute";
}

type ReviewStatus = "pending" | "in-review" | "approved" | "rejected" | "revoked";
```

---

## 3. Safe-Flag Enforcement

```
┌─────────────────────────────────────────────────────────┐
│                  SAFE-FLAG MATRIX                        │
├──────────┬──────────────┬──────────────┬────────────────┤
│          │   STRICT     │  STANDARD    │   UNSAFE       │
├──────────┼──────────────┼──────────────┼────────────────┤
│ DB       │ ✗ Verboten   │ ✗ Verboten   │ ⚠ Nur mit     │
│          │              │              │   Operator-OK  │
├──────────┼──────────────┼──────────────┼────────────────┤
│ Netzwerk │ ✗ Verboten   │ ✓ Allowlist  │ ⚠ Operator-OK  │
│          │              │   nur        │                │
├──────────┼──────────────┼──────────────┼────────────────┤
│ Dateien  │ ✓ Nur eigener│ ✓ Skill-Dir  │ ⚠ Erweitert    │
│          │   Sandbox-Dir│   + /tmp     │                │
├──────────┼──────────────┼──────────────┼────────────────┤
│ IPC      │ ✗ Verboten   │ ✓ Deklarierte│ ✓ Alle         │
│          │              │   Skills     │   registrierten│
├──────────┼──────────────┼──────────────┼────────────────┤
│ Server   │ ✗ Verboten   │ ✗ Verboten   │ ✗ Verboten     │
├──────────┼──────────────┼──────────────┼────────────────┤
│ Auto-    │ ✓ Ja         │ ✓ Ja         │ ✗ Nein,        │
│ Install  │              │              │   manuell      │
├──────────┼──────────────┼──────────────┼────────────────┤
│ Review   │ Automatisch  │ Automatisch  │ Manuelles      │
│          │ + Stichprobe │ + Security   │ Dual-Review    │
│          │              │   Scan       │   Pflicht      │
└──────────┴──────────────┴──────────────┴────────────────┘
```

---

## 4. Install / Uninstall Flow

### Install

```
  Agent/Operator               Marketplace              Sandbox
       │                           │                       │
       │  1. install(skillId,ver)  │                       │
       │──────────────────────────▶│                       │
       │                           │                       │
       │  2. Check: reviewStatus   │                       │
       │     == "approved"?        │                       │
       │                           │                       │
       │  3. Check: safeFlag       │                       │
       │     compatible mit Rolle? │                       │
       │                           │                       │
       │  4. Resolve Dependencies  │                       │
       │     (topologisch sortiert)│                       │
       │                           │                       │
       │  5. Checksum verify       │                       │
       │     (SHA-256)             │                       │
       │                           │                       │
       │  ◄── bei "unsafe": ──────▶│                       │
       │  Operator-Confirmation    │                       │
       │  required!                │                       │
       │                           │                       │
       │                           │  6. Create Sandbox    │
       │                           │─────────────────────▶│
       │                           │                       │
       │                           │  7. Extract Bundle    │
       │                           │─────────────────────▶│
       │                           │                       │
       │                           │  8. Run postInstall   │
       │                           │─────────────────────▶│
       │                           │     (sandboxed!)      │
       │                           │                       │
       │  9. Register in Agent     │                       │
       │     Skill-Inventory       │                       │
       │◄──────────────────────────│                       │
       │                           │                       │
       │  10. emit: skill.installed│                       │
       │──────────────────────────▶│ (WebSocket)           │
```

### Uninstall

1. Check: Abhaengige Skills? → Ja: Warnung + Kaskade oder Abbruch
2. Run preUninstall Hook (sandboxed)
3. Entferne Sandbox-Dir
4. Entferne aus Agent Skill-Inventory
5. Pruefe: Verwaiste Dependencies → Optional Cleanup
6. emit: `skill.uninstalled` (WebSocket)

---

## 5. Versionierung

```typescript
interface VersionPolicy {
  // SemVer strikt
  format: "major.minor.patch";

  // Upgrade-Regeln
  autoUpgrade: {
    patch: true;       // 1.2.0 → 1.2.1 automatisch
    minor: boolean;    // 1.2.0 → 1.3.0 je nach Config
    major: false;      // 1.x → 2.x NIE automatisch
  };

  // Parallele Versionen
  allowParallel: false;  // Nur eine Version pro Skill aktiv

  // Rollback
  rollback: {
    keepPrevious: 2;     // Letzte 2 Versionen aufheben
    autoRollbackOnError: true;
  };

  // Deprecation
  deprecation: {
    warningPeriodDays: 30;
    forceRemoveAfterDays: 90;
    notifyInstalledAgents: true;
  };
}

// Dependency Resolution
type ResolutionStrategy = "highest-compatible" | "locked";

interface DependencyResolver {
  resolve(deps: SkillDependency[]): ResolvedDependency[];
  detectConflicts(deps: SkillDependency[]): Conflict[];
  topologicalSort(deps: ResolvedDependency[]): InstallOrder[];
}
```

---

## 6. Review-Pipeline

```
  ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
  │ SUBMIT   │───▶│ AUTOMATED │───▶│ SECURITY │───▶│ APPROVAL │
  │          │    │ CHECKS    │    │ REVIEW   │    │          │
  └──────────┘    └───────────┘    └──────────┘    └──────────┘
       │               │                │                │
       ▼               ▼                ▼                ▼
  Manifest        ✓ Lint/Format    ✓ Kein DB-Import   Strict/Standard:
  vollstaendig?   ✓ TypeScript OK  ✓ Kein net.Server     Auto-Approve
  Checksum OK?    ✓ Tests pass     ✓ Kein fs ausser      wenn alle
  SemVer korrekt? ✓ Bundle-Size      Sandbox-Dir         Checks ✓
  Changelog?        < 5MB          ✓ Kein eval/exec
                  ✓ Keine          ✓ Kein process.env  Unsafe:
                    Secrets/Keys     (ausser deklariert)  Manuelles
                  ✓ Dependencies   ✓ Safe-Flag            Dual-Review
                    resolved         korrekt?              (2 Reviewer)
                                   ✓ Permission-Scope
                                     minimal?
                                                       ┌──────────┐
                                              ───────▶ │PUBLISHED │
                                                       └──────────┘
```

### Automatische Security-Checks (AST-basiert)

```typescript
const BLOCKED_PATTERNS: SecurityRule[] = [
  { pattern: /require\(['"]pg['"]\)/,       rule: "no-db-direct",     safe: ["strict","standard"] },
  { pattern: /net\.createServer/,           rule: "no-server",         safe: ["strict","standard","unsafe"] },
  { pattern: /eval\s*\(/,                   rule: "no-eval",           safe: ["strict","standard"] },
  { pattern: /child_process/,              rule: "no-child-process",   safe: ["strict","standard"] },
  { pattern: /process\.env(?!\.__SKILL_)/, rule: "no-env-access",      safe: ["strict"] },
  { pattern: /fs\.\w+.*(?!\/sandbox\/)/,   rule: "fs-sandbox-only",    safe: ["strict"] },
  { pattern: /\.connect\(.*:.*\)/,         rule: "no-raw-socket",      safe: ["strict","standard"] },
];
```

---

## 7. API Endpoints

```
POST   /api/marketplace/skills                    # Skill einreichen
GET    /api/marketplace/skills                    # Katalog durchsuchen
GET    /api/marketplace/skills/:id                # Skill-Details
GET    /api/marketplace/skills/:id/versions       # Alle Versionen
GET    /api/marketplace/skills/:id/reviews        # Review-Status

POST   /api/marketplace/install                   # Skill installieren
DELETE /api/marketplace/install/:skillId           # Skill deinstallieren
GET    /api/marketplace/install/agent/:agentId     # Installierte Skills

POST   /api/marketplace/reviews/:id/approve       # Review genehmigen
POST   /api/marketplace/reviews/:id/reject        # Review ablehnen
POST   /api/marketplace/skills/:id/deprecate      # Skill deprecaten
```

---

## 8. WebSocket Events

```typescript
type MarketplaceEvent =
  | { type: "skill.submitted";      payload: { skillId: string; version: string; author: string } }
  | { type: "skill.review.started"; payload: { skillId: string; reviewerId: string } }
  | { type: "skill.review.passed";  payload: { skillId: string; version: string } }
  | { type: "skill.review.failed";  payload: { skillId: string; reason: string } }
  | { type: "skill.published";      payload: { skillId: string; version: string; safeFlag: SafeLevel } }
  | { type: "skill.installed";      payload: { skillId: string; agentId: string; version: string } }
  | { type: "skill.uninstalled";    payload: { skillId: string; agentId: string } }
  | { type: "skill.deprecated";     payload: { skillId: string; removeBy: string } }
  | { type: "skill.update.available"; payload: { skillId: string; from: string; to: string } };
```

---

## Abhaengigkeiten

- **ADR-001** (WebSocket) — fuer Real-Time Events
- **ADR-004** (Skill Sandbox) — fuer Safe-Flag Enforcement Runtime
- **ADR-006** (Multi-Tenant) — Marketplace muss Tenant-scoped sein
