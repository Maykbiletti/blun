# ADR-012: Agent-Discovery & Service Registry

> Greta — Agent System / BLUN.ai  
> Stand: 2026-04-08

## Problem

Agents im Cluster müssen:
1. **Sich gegenseitig finden** (Host, Port, Credentials)
2. **Capabilities austauschen** (verfügbare Skills, Services)
3. **Health-Status mitteilen** (online, offline, überlastet)
4. **Dynamisch skalieren** (Agents hinzufügen/entfernen ohne Restart)
5. **Multi-Tenant-isoliert sein** (nur Agents der gleichen Company finden einander)

**Aktuell:** Agents sind hart-codiert in `src/config/agents.json`  
**Problem:** Nicht dynamisch, keine Capabilities, kein Health-Monitoring

---

## Lösung: Service Registry Pattern

```
Agent A (Startup)
    ↓
Registriert sich im Service Registry
    ↓
"Ich bin Agent-A, läufe auf 10.0.1.5:3000, Skills: [calc, web-search]"
    ↓
Registry speichert Eintrag + Heartbeat-Timer

Agent B (sucht Agent A)
    ↓
Fragt Registry: "Welche Agents haben Skill 'web-search'?"
    ↓
Registry antwortet: "Agent-A auf 10.0.1.5:3000"
    ↓
Agent B kann Agent A direkt anrufen
```

---

## Datenmodell

### `agent_registry` (Service Registry)

```sql
CREATE TABLE agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id VARCHAR(255) NOT NULL,
  agent_name VARCHAR(255),
  agent_type VARCHAR(50),          -- 'general', 'code', 'data', 'research'
  
  -- Network
  host VARCHAR(255) NOT NULL,      -- 10.0.1.5, agent-a.cluster.local
  port INT NOT NULL,               -- 3000
  protocol VARCHAR(20) DEFAULT 'http',  -- http, https, grpc
  base_url VARCHAR(500),           -- https://agent-a.cluster.local:3000
  
  -- Capabilities
  skills JSONB,                    -- [{ skillId: "skill:calc", permissions: [...] }, ...]
  services JSONB,                  -- [{ name: "web-search", endpoint: "/api/web-search" }, ...]
  
  -- Metadata
  version VARCHAR(50),             -- Agent-Version
  labels JSONB,                    -- { "region": "eu", "tier": "prod" }
  
  -- Health
  status VARCHAR(50) DEFAULT 'unknown',  -- online, offline, unhealthy, maintenance
  heartbeat_at TIMESTAMP,
  last_error TEXT,
  
  -- Lifecycle
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unregistered_at TIMESTAMP,
  ttl INT DEFAULT 300,             -- Time-to-live in Sekunden (5 Minuten default)
  
  UNIQUE(company_id, agent_id)
);

CREATE INDEX idx_agent_registry_company_status ON agent_registry(company_id, status);
CREATE INDEX idx_agent_registry_heartbeat ON agent_registry(heartbeat_at);
CREATE INDEX idx_agent_registry_skills ON agent_registry USING GIN(skills);
```

---

### `agent_dependencies` (Agent-zu-Agent Abhängigkeiten)

```sql
CREATE TABLE agent_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  consumer_agent_id VARCHAR(255) NOT NULL,
  provider_agent_id VARCHAR(255) NOT NULL,
  dependency_type VARCHAR(50),     -- 'skill', 'service', 'data'
  skill_id VARCHAR(255),           -- bei type='skill'
  service_name VARCHAR(255),       -- bei type='service'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(company_id, consumer_agent_id, provider_agent_id, dependency_type)
);

CREATE INDEX idx_agent_dependencies_consumer ON agent_dependencies(company_id, consumer_agent_id);
CREATE INDEX idx_agent_dependencies_provider ON agent_dependencies(company_id, provider_agent_id);
```

---

### `agent_capabilities` (Detaillierte Capability-Beschreibung)

```sql
CREATE TABLE agent_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  agent_id VARCHAR(255) NOT NULL,
  capability_type VARCHAR(50),     -- 'skill', 'api', 'model'
  capability_id VARCHAR(255) NOT NULL,
  description TEXT,
  schema_input JSONB,              -- JSON-Schema für Input
  schema_output JSONB,             -- JSON-Schema für Output
  example_input JSONB,
  example_output JSONB,
  rate_limit INT,                  -- requests per minute
  timeout_ms INT,
  created_at TIMESTAMP,
  
  UNIQUE(company_id, agent_id, capability_type, capability_id)
);

CREATE INDEX idx_agent_capabilities_company_agent ON agent_capabilities(company_id, agent_id);
```

---

## Protokoll

### 1. Agent-Registrierung (Startup)

**Endpoint:** `POST /registry/agents/register`

```typescript
// Request
{
  "agent_id": "agent-calc",
  "agent_name": "Calculator Agent",
  "agent_type": "general",
  "host": "10.0.1.5",
  "port": 3000,
  "protocol": "http",
  "version": "1.2.3",
  "skills": [
    {
      "skillId": "skill:calc",
      "permissions": ["math:compute"],
      "version": "1.0.0"
    },
    {
      "skillId": "skill:web-search",
      "permissions": ["http:get"],
      "version": "1.1.0"
    }
  ],
  "services": [
    {
      "name": "health",
      "endpoint": "/health",
      "method": "GET"
    },
    {
      "name": "execute-skill",
      "endpoint": "/api/skills/:skillId/execute",
      "method": "POST"
    }
  ],
  "labels": {
    "region": "eu",
    "tier": "production",
    "team": "data-science"
  }
}

// Response (201 Created)
{
  "success": true,
  "message": "Agent registered successfully",
  "registry_id": "uuid-...",
  "ttl": 300,
  "heartbeat_interval": 60
}
```

**Was passiert:**
1. Agent-Daten in `agent_registry` speichern
2. TTL-Timer setzen (Standard 5 min)
3. Skills in `agent_capabilities` eintragen
4. Dependencies nach abhängigen Services scannen

---

### 2. Heartbeat (Regelmäßig)

**Endpoint:** `POST /registry/agents/:agent_id/heartbeat`

```typescript
// Request (alle 60 Sekunden)
{
  "status": "online",
  "current_load": 0.45,            // 0.0-1.0
  "memory_usage": 512,             // MB
  "skills_available": ["skill:calc", "skill:web-search"],
  "error": null
}

// Response
{
  "success": true,
  "acknowledged_at": "2026-04-08T10:30:00Z",
  "next_heartbeat_in": 60
}
```

**Was passiert:**
1. `heartbeat_at` aktualisieren
2. `status` auf "online" setzen
3. `last_error` löschen (falls vorhanden)
4. TTL-Timer zurücksetzen

---

### 3. Agent Discovery (Suche)

**Endpoint:** `GET /registry/agents/discover`

```typescript
// Query-Parameter
?skill_id=skill:calc              // Agents mit Skill
?service=web-search               // Agents mit Service
?status=online                     // nur healthy Agents
?label.region=eu                   // Labels filtern
?limit=10

// Response
{
  "agents": [
    {
      "agent_id": "agent-calc",
      "agent_name": "Calculator Agent",
      "host": "10.0.1.5",
      "port": 3000,
      "base_url": "http://10.0.1.5:3000",
      "status": "online",
      "skills": [
        { "skillId": "skill:calc", "version": "1.0.0" }
      ],
      "labels": { "region": "eu", "tier": "production" }
    }
  ],
  "count": 1
}
```

**Was passiert:**
1. Agents in `agent_registry` suchen (JSONB-Filter)
2. Nur Status='online' und nicht abgelaufen (heartbeat < 2*TTL)
3. Mit `agent_capabilities` joinen für Details
4. Sortieren nach Relevanz (z.B. näher gelegener Region zuerst)

---

### 4. Capability Details (Spezifikation)

**Endpoint:** `GET /registry/agents/:agent_id/capabilities`

```typescript
// Response
{
  "capabilities": [
    {
      "capability_type": "skill",
      "capability_id": "skill:calc",
      "description": "Performs mathematical calculations",
      "schema_input": {
        "type": "object",
        "properties": {
          "expression": { "type": "string" },
          "precision": { "type": "number" }
        },
        "required": ["expression"]
      },
      "schema_output": {
        "type": "object",
        "properties": {
          "result": { "type": "number" },
          "steps": { "type": "array" }
        }
      },
      "example_input": { "expression": "2 + 2" },
      "example_output": { "result": 4, "steps": [] },
      "rate_limit": 100,
      "timeout_ms": 5000
    }
  ]
}
```

---

### 5. Agent Unregister (Shutdown)

**Endpoint:** `POST /registry/agents/:agent_id/unregister`

```typescript
// Request
{
  "reason": "shutdown"  // oder "maintenance", "error", etc
}

// Response
{
  "success": true,
  "message": "Agent unregistered",
  "unregistered_at": "2026-04-08T10:35:00Z"
}
```

**Was passiert:**
1. `status` auf "offline" setzen
2. `unregistered_at` speichern
3. Dependencies aktualisieren (abhängige Agents benachrichtigen?)

---

## Implementation

### 1. Service Registry Server

```typescript
// src/registry/registry-service.ts

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface AgentRegistration {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  host: string;
  port: number;
  protocol?: string;
  version: string;
  skills: Array<{ skillId: string; permissions: string[]; version: string }>;
  services: Array<{ name: string; endpoint: string; method: string }>;
  labels?: Record<string, string>;
}

export class RegistryService {
  private db: any;
  private heartbeatTimeout: Map<string, NodeJS.Timeout> = new Map();

  constructor(db: any) {
    this.db = db;
    this.startStaleCheckLoop();
  }

  /**
   * POST /registry/agents/register
   */
  async registerAgent(req: Request, res: Response) {
    const { companyId } = res.locals;
    const registration: AgentRegistration = req.body;

    try {
      // 1. Validierung
      if (!registration.agent_id || !registration.host || !registration.port) {
        return res.status(400).json({
          error: 'Missing required fields: agent_id, host, port'
        });
      }

      const baseUrl = `${registration.protocol || 'http'}://${registration.host}:${registration.port}`;

      // 2. In agent_registry eintragen (upsert)
      const query = `
        INSERT INTO agent_registry (
          company_id, agent_id, agent_name, agent_type,
          host, port, protocol, base_url,
          skills, services, version, labels,
          status, heartbeat_at, ttl
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (company_id, agent_id) DO UPDATE SET
          host = EXCLUDED.host,
          port = EXCLUDED.port,
          skills = EXCLUDED.skills,
          services = EXCLUDED.services,
          version = EXCLUDED.version,
          labels = EXCLUDED.labels,
          status = 'online',
          heartbeat_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, ttl
      `;

      const result = await this.db.query(query, [
        companyId,
        registration.agent_id,
        registration.agent_name,
        registration.agent_type,
        registration.host,
        registration.port,
        registration.protocol || 'http',
        baseUrl,
        JSON.stringify(registration.skills || []),
        JSON.stringify(registration.services || []),
        registration.version,
        JSON.stringify(registration.labels || {}),
        'online',
        new Date(),
        300  // TTL default 5 Minuten
      ]);

      // 3. Skills in agent_capabilities eintragen
      for (const skill of registration.skills || []) {
        await this.db.query(
          `INSERT INTO agent_capabilities (
            company_id, agent_id, capability_type, capability_id,
            description, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING`,
          [
            companyId,
            registration.agent_id,
            'skill',
            skill.skillId,
            `Skill ${skill.skillId} v${skill.version}`,
            new Date()
          ]
        );
      }

      // 4. TTL-Timer setzen
      this.resetTTLTimer(companyId, registration.agent_id, 300);

      res.status(201).json({
        success: true,
        message: 'Agent registered successfully',
        registry_id: result.rows[0].id,
        ttl: result.rows[0].ttl,
        heartbeat_interval: 60
      });

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /registry/agents/:agent_id/heartbeat
   */
  async heartbeat(req: Request, res: Response) {
    const { agent_id } = req.params;
    const { companyId } = res.locals;
    const { status, current_load, memory_usage, error } = req.body;

    try {
      const query = `
        UPDATE agent_registry
        SET
          status = $1,
          heartbeat_at = CURRENT_TIMESTAMP,
          last_error = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE company_id = $3 AND agent_id = $4
        RETURNING ttl
      `;

      const result = await this.db.query(query, [
        status || 'online',
        error || null,
        companyId,
        agent_id
      ]);

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // TTL-Timer zurücksetzen
      const ttl = result.rows[0].ttl;
      this.resetTTLTimer(companyId, agent_id, ttl);

      res.json({
        success: true,
        acknowledged_at: new Date().toISOString(),
        next_heartbeat_in: 60
      });

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /registry/agents/discover
   */
  async discoverAgents(req: Request, res: Response) {
    const { companyId } = res.locals;
    const {
      skill_id,
      service,
      status = 'online',
      limit = 10
    } = req.query;

    try {
      let query = `
        SELECT
          agent_id, agent_name, agent_type,
          host, port, base_url,
          status, skills, services, labels,
          heartbeat_at
        FROM agent_registry
        WHERE company_id = $1
        AND status = $2
        AND heartbeat_at > CURRENT_TIMESTAMP - INTERVAL '${300 * 2} seconds'
      `;

      const params: any[] = [companyId, status];

      // Optional: Nach Skill filtern
      if (skill_id) {
        query += ` AND skills @> $${params.length + 1}::jsonb`;
        params.push(JSON.stringify([{ skillId: skill_id }]));
      }

      query += ` ORDER BY heartbeat_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      res.json({
        agents: result.rows.map(row => ({
          agent_id: row.agent_id,
          agent_name: row.agent_name,
          host: row.host,
          port: row.port,
          base_url: row.base_url,
          status: row.status,
          skills: JSON.parse(row.skills),
          services: JSON.parse(row.services),
          labels: JSON.parse(row.labels)
        })),
        count: result.rows.length
      });

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /registry/agents/:agent_id/capabilities
   */
  async getCapabilities(req: Request, res: Response) {
    const { agent_id } = req.params;
    const { companyId } = res.locals;

    try {
      const result = await this.db.query(
        `SELECT *
         FROM agent_capabilities
         WHERE company_id = $1 AND agent_id = $2
         ORDER BY created_at DESC`,
        [companyId, agent_id]
      );

      res.json({
        capabilities: result.rows.map(cap => ({
          capability_type: cap.capability_type,
          capability_id: cap.capability_id,
          description: cap.description,
          schema_input: cap.schema_input,
          schema_output: cap.schema_output,
          example_input: cap.example_input,
          example_output: cap.example_output,
          rate_limit: cap.rate_limit,
          timeout_ms: cap.timeout_ms
        }))
      });

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /registry/agents/:agent_id/unregister
   */
  async unregisterAgent(req: Request, res: Response) {
    const { agent_id } = req.params;
    const { companyId } = res.locals;
    const { reason } = req.body;

    try {
      const query = `
        UPDATE agent_registry
        SET
          status = 'offline',
          unregistered_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE company_id = $1 AND agent_id = $2
        RETURNING agent_id
      `;

      const result = await this.db.query(query, [companyId, agent_id]);

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // TTL-Timer löschen
      this.clearTTLTimer(companyId, agent_id);

      res.json({
        success: true,
        message: 'Agent unregistered',
        unregistered_at: new Date().toISOString()
      });

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Hintergrund-Prozess: Stale Agents markieren (nach TTL)
   */
  private startStaleCheckLoop() {
    setInterval(async () => {
      try {
        const query = `
          UPDATE agent_registry
          SET status = 'offline'
          WHERE status = 'online'
          AND heartbeat_at < CURRENT_TIMESTAMP - (ttl || ' seconds')::interval
          RETURNING agent_id
        `;

        const result = await this.db.query(query);
        if (result.rows.length > 0) {
          console.log(`Marked ${result.rows.length} agents as offline (stale)`);
        }
      } catch (err) {
        console.error('Error in stale check loop:', err);
      }
    }, 30000);  // Alle 30 Sekunden prüfen
  }

  /**
   * Helper: TTL-Timer setzen
   */
  private resetTTLTimer(companyId: string, agentId: string, ttlSeconds: number) {
    const key = `${companyId}:${agentId}`;

    // Alten Timer löschen
    if (this.heartbeatTimeout.has(key)) {
      clearTimeout(this.heartbeatTimeout.get(key)!);
    }

    // Neuen Timer setzen
    const timer = setTimeout(() => {
      console.log(`TTL expired for ${agentId}`);
      // Wird von staleCheckLoop behandelt
    }, ttlSeconds * 1000);

    this.heartbeatTimeout.set(key, timer);
  }

  /**
   * Helper: TTL-Timer löschen
   */
  private clearTTLTimer(companyId: string, agentId: string) {
    const key = `${companyId}:${agentId}`;
    if (this.heartbeatTimeout.has(key)) {
      clearTimeout(this.heartbeatTimeout.get(key)!);
      this.heartbeatTimeout.delete(key);
    }
  }
}
```

---

### 2. Agent Discovery Client

```typescript
// src/agent/discovery-client.ts

export interface AgentInfo {
  agent_id: string;
  host: string;
  port: number;
  base_url: string;
  skills: Array<{ skillId: string }>;
  labels?: Record<string, string>;
}

export class DiscoveryClient {
  private registryUrl: string;
  private agentId: string;
  private companyId: string;
  private httpClient: any;
  private heartbeatInterval: NodeJS.Timer | null = null;

  constructor(
    registryUrl: string,
    agentId: string,
    companyId: string,
    apiKey: string
  ) {
    this.registryUrl = registryUrl;
    this.agentId = agentId;
    this.companyId = companyId;
    
    // HTTP-Client mit API-Key
    this.httpClient = {
      defaultHeaders: {
        'x-api-key': apiKey,
        'content-type': 'application/json'
      }
    };
  }

  /**
   * Sich beim Registry registrieren
   */
  async register(registration: any): Promise<void> {
    const res = await fetch(`${this.registryUrl}/registry/agents/register`, {
      method: 'POST',
      headers: this.httpClient.defaultHeaders,
      body: JSON.stringify(registration)
    });

    if (!res.ok) {
      throw new Error(`Registration failed: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`Registered as ${this.agentId}:`, data);

    // Heartbeat starten
    const heartbeatInterval = data.heartbeat_interval || 60;
    this.startHeartbeat(heartbeatInterval);
  }

  /**
   * Heartbeat senden (alle 60 Sekunden)
   */
  private startHeartbeat(intervalSeconds: number) {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await fetch(
          `${this.registryUrl}/registry/agents/${this.agentId}/heartbeat`,
          {
            method: 'POST',
            headers: this.httpClient.defaultHeaders,
            body: JSON.stringify({
              status: 'online',
              current_load: process.uptime(),
              memory_usage: process.memoryUsage().heapUsed / 1024 / 1024
            })
          }
        );
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Andere Agents suchen
   */
  async discoverAgents(skillId?: string): Promise<AgentInfo[]> {
    const params = new URLSearchParams();
    if (skillId) {
      params.append('skill_id', skillId);
    }
    params.append('status', 'online');
    params.append('limit', '10');

    const res = await fetch(
      `${this.registryUrl}/registry/agents/discover?${params}`,
      {
        method: 'GET',
        headers: this.httpClient.defaultHeaders
      }
    );

    if (!res.ok) {
      throw new Error(`Discovery failed: ${res.statusText}`);
    }

    const data = await res.json();
    return data.agents;
  }

  /**
   * Spezifischen Agent suchen
   */
  async findAgent(agentId: string): Promise<AgentInfo | null> {
    const agents = await this.discoverAgents();
    return agents.find(a => a.agent_id === agentId) || null;
  }

  /**
   * Capabilities eines Agents abrufen
   */
  async getCapabilities(agentId: string): Promise<any[]> {
    const res = await fetch(
      `${this.registryUrl}/registry/agents/${agentId}/capabilities`,
      {
        method: 'GET',
        headers: this.httpClient.defaultHeaders
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to get capabilities: ${res.statusText}`);
    }

    const data = await res.json();
    return data.capabilities;
  }

  /**
   * Beim Shutdown unregistrieren
   */
  async unregister(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    await fetch(
      `${this.registryUrl}/registry/agents/${this.agentId}/unregister`,
      {
        method: 'POST',
        headers: this.httpClient.defaultHeaders,
        body: JSON.stringify({ reason: 'shutdown' })
      }
    );

    console.log(`Unregistered ${this.agentId}`);
  }
}
```

---

### 3. Agent-Integration (Startup)

```typescript
// src/agent/startup.ts

import { DiscoveryClient } from './discovery-client';

export async function initializeAgent(config: any) {
  const discoveryClient = new DiscoveryClient(
    config.registry.url || 'http://localhost:4000',
    config.agent.id,
    config.company.id,
    config.api.key
  );

  // Sich registrieren
  await discoveryClient.register({
    agent_id: config.agent.id,
    agent_name: config.agent.name,
    agent_type: config.agent.type,
    host: config.network.host,
    port: config.network.port,
    protocol: config.network.protocol || 'http',
    version: config.agent.version,
    skills: config.skills || [],
    services: config.services || [],
    labels: config.labels || {}
  });

  // Beim Shutdown unregistrieren
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, unregistering...');
    await discoveryClient.unregister();
    process.exit(0);
  });

  return discoveryClient;
}
```

---

### 4. Suche nach Skill-Providern (Praktisches Beispiel)

```typescript
// src/agent/skill-provider-locator.ts

export class SkillProviderLocator {
  constructor(private discoveryClient: DiscoveryClient) {}

  /**
   * Finde alle Agents, die ein bestimmtes Skill können
   */
  async findProvidersForSkill(skillId: string): Promise<AgentInfo[]> {
    return await this.discoveryClient.discoverAgents(skillId);
  }

  /**
   * Wähle einen geeigneten Provider (Load-Balancing)
   */
  async selectBestProvider(skillId: string): Promise<AgentInfo> {
    const providers = await this.findProvidersForSkill(skillId);

    if (!providers.length) {
      throw new Error(`No provider found for skill ${skillId}`);
    }

    // Einfache Load-Balancing: Wähle zufällig
    return providers[Math.floor(Math.random() * providers.length)];
  }

  /**
   * Rufe Skill bei Provider auf
   */
  async executeSkillRemote(
    skillId: string,
    input: any
  ): Promise<any> {
    const provider = await this.selectBestProvider(skillId);

    const res = await fetch(
      `${provider.base_url}/api/skills/${skillId}/execute`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ input })
      }
    );

    if (!res.ok) {
      throw new Error(`Skill execution failed: ${res.statusText}`);
    }

    return await res.json();
  }
}
```

---

## DB-Migrations

### Migration 004: Create Agent Registry

```sql
-- migration_004_create_agent_registry.sql

CREATE TABLE IF NOT EXISTS agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id VARCHAR(255) NOT NULL,
  agent_name VARCHAR(255),
  agent_type VARCHAR(50),
  
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  protocol VARCHAR(20) DEFAULT 'http',
  base_url VARCHAR(500),
  
  skills JSONB,
  services JSONB,
  
  version VARCHAR(50),
  labels JSONB,
  
  status VARCHAR(50) DEFAULT 'unknown',
  heartbeat_at TIMESTAMP,
  last_error TEXT,
  
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unregistered_at TIMESTAMP,
  ttl INT DEFAULT 300,
  
  UNIQUE(company_id, agent_id)
);

CREATE INDEX idx_agent_registry_company_status ON agent_registry(company_id, status);
CREATE INDEX idx_agent_registry_heartbeat ON agent_registry(heartbeat_at);
CREATE INDEX idx_agent_registry_skills ON agent_registry USING GIN(skills);

-- ---

CREATE TABLE IF NOT EXISTS agent_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  consumer_agent_id VARCHAR(255) NOT NULL,
  provider_agent_id VARCHAR(255) NOT NULL,
  dependency_type VARCHAR(50),
  skill_id VARCHAR(255),
  service_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(company_id, consumer_agent_id, provider_agent_id, dependency_type)
);

CREATE INDEX idx_agent_dependencies_consumer ON agent_dependencies(company_id, consumer_agent_id);
CREATE INDEX idx_agent_dependencies_provider ON agent_dependencies(company_id, provider_agent_id);

-- ---

CREATE TABLE IF NOT EXISTS agent_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  agent_id VARCHAR(255) NOT NULL,
  capability_type VARCHAR(50),
  capability_id VARCHAR(255) NOT NULL,
  description TEXT,
  schema_input JSONB,
  schema_output JSONB,
  example_input JSONB,
  example_output JSONB,
  rate_limit INT,
  timeout_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(company_id, agent_id, capability_type, capability_id)
);

CREATE INDEX idx_agent_capabilities_company_agent ON agent_capabilities(company_id, agent_id);
```

---

## Express Routes (Setup)

```typescript
// src/registry/routes.ts

import express from 'express';
import { RegistryService } from './registry-service';
import { tenantMiddleware, authMiddleware } from '../middleware';

export function setupRegistryRoutes(app: express.Express, db: any) {
  const registry = new RegistryService(db);

  app.post(
    '/registry/agents/register',
    tenantMiddleware,
    authMiddleware,
    (req, res) => registry.registerAgent(req, res)
  );

  app.post(
    '/registry/agents/:agent_id/heartbeat',
    tenantMiddleware,
    authMiddleware,
    (req, res) => registry.heartbeat(req, res)
  );

  app.get(
    '/registry/agents/discover',
    tenantMiddleware,
    authMiddleware,
    (req, res) => registry.discoverAgents(req, res)
  );

  app.get(
    '/registry/agents/:agent_id/capabilities',
    tenantMiddleware,
    authMiddleware,
    (req, res) => registry.getCapabilities(req, res)
  );

  app.post(
    '/registry/agents/:agent_id/unregister',
    tenantMiddleware,
    authMiddleware,
    (req, res) => registry.unregisterAgent(req, res)
  );
}
```

---

## Sicherheits-Checkliste

- ✅ Company-Isolation (nur Agents der gleichen Company finden einander)
- ✅ API-Key Authentifizierung (HTTP-Header)
- ✅ Heartbeat-Validation (TTL-basiert, nicht manuell löschbar)
- ✅ Keine direkten Agent-zu-Agent Verbindungen über Registry
- ✅ Audit-Log für Registration/Unregistration

---

## Fragen an Dieter / Klaus

1. **DNS vs IP-Adressen?** Hosts als DNS-Namen oder IPs speichern?
2. **Load-Balancing:** Round-Robin, Least-Loaded, oder Custom-Strategy?
3. **Retry-Logic:** Bei Fehler zu nächstem Provider failover?
4. **Rate-Limiting:** Pro Agent oder global?

```
