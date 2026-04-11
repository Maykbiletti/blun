# BLUN Architecture Overview

## System Summary

BLUN is an **event-driven AI agent framework** combining Express HTTP server, WebSocket real-time communication, Redis pub/sub messaging, and PostgreSQL persistence. The system manages distributed AI agents, task execution, skill loading, and multi-user collaboration.

Current active branch: `admin-arch-base`  
Last updated: 2026-04-11

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BLUN SYSTEM ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────────┐
                              │   Browser/Client │
                              │  (Dashboard UI)  │
                              └────────┬─────────┘
                                       │ HTTP/WebSocket
                    ┌──────────────────┴──────────────────┐
                    │                                     │
        ┌───────────▼──────────────┐      ┌──────────────▼──────────────┐
        │   Express HTTP Server    │      │   WebSocket Upgrade Layer   │
        │   (server.js)            │      │   (src/ws.js)               │
        └───────────┬──────────────┘      └──────────────┬──────────────┘
                    │                                     │
      ┌─────────────┴─────────────────────────────────────┴─────────────┐
      │                    Middleware Pipeline                           │
      │  [Auth] → [Input Validator] → [Activity Log] → [CORS/Security]  │
      └─────────────┬─────────────────────────────────────┬─────────────┘
                    │                                     │
      ┌─────────────┴─────────────────┐   ┌──────────────┴──────────────┐
      │    HTTP Routes / API Layer    │   │    Real-time Events         │
      │                               │   │    (Redis Pub/Sub)          │
      ├─────────────────────────────┤   │                              │
      │ Core Routes:                │   ├──────────────────────────────┤
      │ ├─ /api/{resource}         │   │ • Agent state changes         │
      │ ├─ /chat                   │   │ • Task progress updates       │
      │ ├─ /admin/*                │   │ • Skill executions           │
      │ ├─ /auth                   │   │ • Federated events           │
      │ ├─ /billing                │   │ • User notifications          │
      │ ├─ /skills                 │   └──────────────────────────────┘
      │ ├─ /organisator            │
      │ ├─ /v1/*                   │
      │ ├─ /websites               │
      │ ├─ /software               │
      │ ├─ /federation             │
      │ ├─ /canvas                 │
      │ └─ /support                │
      └──────────────┬──────────────┘
                     │
        ┌────────────┴──────────────────────────┐
        │                                       │
        │    ┌──────────────────────────────┐   │
        │    │   Agent System (Runtime)      │   │
        │    │  (src/agent/runtime.js)       │   │
        │    │                              │   │
        │    │  • Agent lifecycle mgmt       │   │
        │    │  • Process spawning (child)   │   │
        │    │  • Heartbeat monitoring       │   │
        │    │  • State persistence          │   │
        │    └────────────┬───────────────────┘   │
        │                 │                       │
        │    ┌────────────▼──────────────────┐   │
        │    │  Adapters & Execution         │   │
        │    │                              │   │
        │    │  ├─ Claude API Adapter       │   │
        │    │  ├─ Gemini CLI Adapter       │   │
        │    │  ├─ OpenAI API Adapter       │   │
        │    │  └─ Codex Local Adapter      │   │
        │    │                              │   │
        │    │  [Spawns subprocess]          │   │
        │    └────────────┬───────────────────┘   │
        │                 │                       │
        │    ┌────────────▼──────────────────┐   │
        │    │  Agent Services               │   │
        │    │                              │   │
        │    │  ├─ Tools (tools.js)         │   │
        │    │  ├─ Memory (memory.js)       │   │
        │    │  ├─ Skills (skills-loader.js)│   │
        │    │  ├─ Messaging (messaging.js) │   │
        │    │  └─ Code Graph (code-graph.js)    │
        │    └────────────────────────────────┘   │
        │                                       │
        └───────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
  ┌─────▼──────┐   ┌───────▼────────┐  ┌──────▼──────┐
  │ PostgreSQL │   │ Redis Instance │  │   File I/O  │
  │ Database   │   │ (Pub/Sub, Cache)  │   (Workspaces)
  │            │   │                │  │             │
  │ Tables:    │   │ Channels:      │  │ Agent dirs: │
  │ • agents   │   │ • agent-state  │  │ • /workspaces
  │ • tasks    │   │ • chat-stream  │  │ • /uploads  │
  │ • skills   │   │ • events       │  │             │
  │ • users    │   │ • notifications    │             │
  │ • sessions │   │                │  │             │
  │ • logs     │   │                │  │             │
  └────────────┘   └────────────────┘  └─────────────┘
```

---

## Core Components

### 1. Server Entry Point (`server.js`)

- Initializes Express HTTP server with CORS, helmet security, Morgan logging
- Mounts all route handlers from `/src/routes`
- Establishes database connection pool (PostgreSQL)
- Sets up Redis pub/sub subscriber for event broadcasting
- Attaches WebSocket upgrade handler via `attachWS()`
- Serves static files from `/dashboard` directory

**Key Responsibilities:**
- Request/response lifecycle
- Authentication middleware chain
- Static asset serving
- Error handling & recovery

### 2. Agent Runtime (`src/agent/runtime.js`)

Manages lifecycle of individual agents running as child processes.

**Core Workflow:**

```
startAgent(agentId)
    ↓
Load agent config from DB
    ↓
Select adapter (claude_api / gemini_cli / openai_api / codex_local)
    ↓
Create workspace directory
    ↓
Insert heartbeat record
    ↓
Spawn child process with adapter
    ↓
Monitor heartbeats, capture stdout/stderr
    ↓
Update task/state on completion or error
```

**Sandboxing:**
- Only safe environment variables passed to subprocess
- No API keys, DB credentials, or encryption keys exposed
- Agent cannot directly access main process memory

### 3. HTTP Routes & API Endpoints

#### Core Routes (in `/src/routes/`)

| Route | Purpose | Key Files |
|-------|---------|-----------|
| `/api/*` | Generic API handlers | `api.js` |
| `/chat` | Chat interface | `chat.js` |
| `/admin/*` | Admin panel & controls | `admin.js`, `admin-panel.js`, `admin-plans.js` |
| `/auth` | Login/logout/sessions | `auth.js`, `middleware/auth.js` |
| `/billing` | Subscription & payment | `billing.js` |
| `/skills` | Skill registry & loading | `skills.js`, `skills-route.js` |
| `/organisator` | Organisator engine | `organisator.js` |
| `/v1/*` | API versioning | `v1/health.js`, `v1/agents.js`, `v1/billing.js`, `v1/storage.js`, `v1/conversations.js` |
| `/websites` | Website builder | `websites.js`, `website-wizard.js` |
| `/software` | Software registry | `software.js` |
| `/federation` | Federation protocol | `federation.js` |
| `/canvas` | Drawing/markup canvas | `canvas.js` |
| `/support` | Help desk & chat | `support-chat.js` |
| `/tools` | Tool discovery | `tools-route.js` |
| `/voice` | Voice input/output | `voice.js` |

#### API v1 Endpoints Structure

```
GET  /api/v1/health           → System status
GET  /api/v1/agents           → List active agents
GET  /api/v1/agents/{id}      → Agent details & task stats
POST /api/v1/agents/{id}/task → Queue task for agent
GET  /api/v1/billing/status   → Billing info
GET  /api/v1/storage/quota    → Storage usage
POST /api/v1/conversations    → Create conversation
```

### 4. WebSocket Layer (`src/ws.js`)

Enables real-time bidirectional communication.

**Event Types:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `agent:state-change` | Server→Client | `{agentId, status, taskCount}` |
| `chat:message` | Both | `{conversationId, text, sender}` |
| `skill:execute` | Server→Client | `{skillId, args, result}` |
| `error:notification` | Server→Client | `{code, message, context}` |
| `task:progress` | Server→Client | `{taskId, percent, current, total}` |

### 5. Middleware Pipeline

Executes in order:

1. **Authentication** (`src/middleware/auth.js`)
   - Verifies JWT/session token
   - Attaches user context to request

2. **Input Validator** (`src/middleware/input-validator.js`)
   - Sanitizes query/body parameters
   - Prevents injection attacks

3. **Activity Logging** (`src/middleware/activity.js`)
   - Records user actions for audit trail

4. **Plans/Quotas** (`src/middleware/plans.js`)
   - Enforces rate limits based on subscription tier

5. **CORS & Security** (`src/middleware/cors.js`, helmet in server.js)
   - Allows/denies cross-origin requests
   - Sets security headers

### 6. Database Layer (`src/db.js`)

PostgreSQL connection pool.

**Core Tables:**

```sql
agents           → Agent metadata, configs, adapters
tasks            → Task queue, status, logs
skills           → Registered skills/tools
users            → User accounts, authentication
sessions         → Active sessions
conversations    → Chat history
heartbeats       → Agent liveness proofs
migrations       → Schema version control
```

### 7. Redis (`src/redis.js`)

In-memory pub/sub broker.

**Channels:**

- `agent-state:*` → Agent status changes
- `chat-stream:*` → Chat message broadcasts
- `task-updates:*` → Task progress
- `events` → System-wide events
- `notifications` → User notifications

---

## Agent Roles & Responsibilities

### 1. **AI Agent (Codex/Claude/Gemini/OpenAI)**

**When Spawned:**
- Receives workspace directory path
- Gets minimal environment (task params, model key)
- Runs isolation-safe subprocess

**Capabilities:**
- Execute skills from skill registry
- Read/write within workspace
- Emit heartbeats to show liveness
- Return JSON task result on completion

**Tools Available:**
- File I/O (workspace scoped)
- HTTP calls (rate-limited)
- Local CLI tools (Codex, Gemini)
- Custom skills (from registry)

---

### 2. **Organisator Engine** (`src/organisator/engine.js`)

**Purpose:** Task orchestration and workflow routing.

**Responsibilities:**
- Parses task requirements
- Selects best agent for job (skill matching)
- Queues task with params
- Monitors completion
- Handles retries on failure
- Combines results from multi-agent pipelines

**Example Flow:**
```
User: "Build a website"
    ↓
Organisator breaks into subtasks:
  [Design mockup] → [Write HTML/CSS] → [Deploy]
    ↓
Assign to specialised agents
    ↓
Merge final output
```

---

### 3. **Federation Engine** (`src/federation/engine.js`)

**Purpose:** Inter-instance communication (BLUN instances can connect).

**Responsibilities:**
- Discover other BLUN nodes
- Forward tasks to remote agents
- Aggregate results
- Handle network failures
- Maintain distributed consensus

**Protocol:** REST API + WebSocket fallback

---

### 4. **Websites Engine** (`src/websites/engine.js`)

**Purpose:** Website generation and hosting.

**Responsibilities:**
- Generate HTML/CSS/JS from specifications
- Deploy to managed hosting
- Track domain mappings
- Serve static assets
- Update DNS records

---

### 5. **Software Engine** (`src/software/engine.js`)

**Purpose:** Software/package registry and discovery.

**Responsibilities:**
- Index available software
- Version management
- Dependency resolution
- License compliance checking
- Integration with agent tools

---

### 6. **Skills System** (`src/skills/`)

**Registry** (`skills/registry.js`):
- Central catalog of callable skills
- Versioning & compatibility
- Permission checks

**Loader** (`skills/loader.js`):
- Dynamically loads skill modules
- Provides to agent at startup
- Unloads on agent termination

**Available Skills (Examples):**
- `file_read` / `file_write`
- `http_get` / `http_post`
- `bash_execute` (rate-limited, sandboxed)
- `image_generate` (via API)
- `code_format` / `code_lint`
- Custom domain-specific skills

---

## Data Flow Examples

### Example 1: User Requests Agent Task

```
User submits "Write Python function for X"
    ↓
POST /api/tasks { agent_id, description, params }
    ↓
auth.js verifies session
    ↓
input-validator.js cleans params
    ↓
/api route handler inserts task into DB
    ↓
agent/runtime.js detects new task via DB poll
    ↓
Spawns adapter process (e.g., claude-adapter.js)
    ↓
Adapter queries skills registry
    ↓
Agent receives: workspace path + task params + available skills
    ↓
Agent runs, outputs result JSON
    ↓
Runtime captures output, updates task.status = 'completed'
    ↓
Redis broadcast on task-updates channel
    ↓
WebSocket layer sends update to client
    ↓
Browser displays result in real-time
```

### Example 2: Real-time Chat

```
User types message in browser
    ↓
WebSocket emits chat:message { conversationId, text }
    ↓
Server receives in /src/ws.js handler
    ↓
Inserts into conversations table
    ↓
Broadcasts to all connected clients on channel
    ↓
If agent auto-reply enabled:
    └─→ Agent picks up from chat route handler
        └─→ Generates response
        └─→ Broadcasts back
```

---

## Key Architectural Patterns

### 1. **Process Isolation**

Agents run as child processes with minimal env to prevent:
- Direct access to API keys
- Unauthorized file system access
- Memory leaks affecting main process

### 2. **Pub/Sub Messaging**

Redis channels decouple components:
- Agent runtime doesn't need HTTP to notify web server
- Multiple servers can consume same events
- Supports horizontal scaling

### 3. **Heartbeat Monitoring**

Agents periodically write to heartbeats table:
- Server detects hung/crashed agents
- Automatic restart triggered
- Prevents zombie processes

### 4. **Adapter Pattern**

Abstract AI provider differences:
- Same task interface regardless of Claude/Gemini/OpenAI
- Easy to add new providers
- Provider-specific args isolated

### 5. **Workspace Isolation**

Each agent gets dedicated directory:
- File I/O scoped to workspace
- No cross-agent contamination
- Workspace can be archived/deleted

### 6. **Role-Based Middleware**

Plans/billing middleware:
- Free tier: 5 agents max, 1 task/min
- Pro tier: unlimited agents, 10 tasks/min
- Enterprise: custom limits

---

## Deployment Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| HTTP Server | Node.js + Express | Request handling |
| Real-time | WebSocket (ws.js) | Bidirectional push |
| Database | PostgreSQL | Persistent storage |
| Cache/Pub/Sub | Redis | Event broadcasting |
| Process Mgmt | Node child_process | Agent spawning |
| Authentication | JWT / Session cookies | User verification |
| Frontend | Static HTML/JS | Browser UI |

---

## File Structure

```
/root/blun/
├── server.js                    # Main entry point
├── dieter-daemon.js             # Background daemon
├── dashboard/                   # Frontend assets
│   ├── index.html              # Main SPA
│   ├── pages/                  # Feature pages
│   ├── components/             # Reusable UI
│   ├── js/                     # Client logic
│   └── css/                    # Styling
├── src/
│   ├── db.js                   # PostgreSQL pool
│   ├── redis.js                # Redis client
│   ├── ws.js                   # WebSocket handler
│   ├── agent/
│   │   ├── runtime.js          # Lifecycle mgmt
│   │   ├── tools.js            # Available tools
│   │   ├── memory.js           # State/memory
│   │   ├── messaging.js        # IPC
│   │   ├── skills-loader.js    # Skill injection
│   │   └── adapters/           # Provider adapters
│   ├── routes/                 # HTTP endpoints
│   │   ├── api.js
│   │   ├── chat.js
│   │   ├── admin.js
│   │   ├── v1/                 # API v1
│   │   └── ...
│   ├── middleware/             # Pipeline stages
│   │   ├── auth.js
│   │   ├── input-validator.js
│   │   └── ...
│   ├── services/               # Business logic
│   ├── organisator/            # Workflow engine
│   ├── federation/             # Multi-instance
│   ├── websites/               # Website builder
│   └── software/               # Software registry
├── migrations/                 # DB schema
├── docs/                       # Documentation
└── package.json                # Dependencies
```

---

## Security Boundaries

### Protected Files (Never Modified By Agents)

```
server.js
dieter-daemon.js
index.html (main dashboard)
src/db.js
agent-engine.js (if exists)
```

### Sandboxed Areas

```
src/agent/adapters/*            (agent code runs here)
/workspaces/{agentId}/*         (agent file I/O)
/uploads/*                      (user uploads, scanned)
```

---

## Performance Considerations

1. **Agent Concurrency**
   - Each agent is separate child process
   - No shared memory contention
   - Horizontal scaling: spawn more agents

2. **Database Queries**
   - Use connection pooling (pg.Pool)
   - Indexed queries on agent_id, task_id, user_id
   - Consider read replicas for analytics

3. **WebSocket Scaling**
   - Use Redis pub/sub for multi-server deployments
   - Clients subscribe to topics, not individual WebSocket handlers
   - Load balancer sticky sessions or socket.io adapters

4. **Skill Loading**
   - Skills cached in memory after first load
   - Reload only on skill registry update
   - Lazy-load large dependencies

---

## Future Extensions

- **Agentic Loops**: Agents can spawn sub-agents
- **Distributed Training**: Agents share learnings via federation
- **Custom Skill Marketplace**: Third-party skill distribution
- **Analytics Dashboard**: Performance metrics, cost attribution
- **Multi-Region Failover**: Agents migrate on region down

---

## Glossary

| Term | Definition |
|------|-----------|
| **Agent** | Autonomous AI task executor (Claude, Gemini, OpenAI, local) |
| **Task** | Unit of work assigned to agent (e.g., "write code") |
| **Skill** | Callable tool/utility available to agent (e.g., file_write) |
| **Workspace** | Agent's isolated file system directory |
| **Adapter** | Provider-specific integration (Claude vs Gemini logic) |
| **Heartbeat** | Periodic liveness signal from agent to main server |
| **Federation** | Inter-BLUN-instance communication protocol |
| **Organisator** | Task orchestration and workflow routing engine |

---

**Maintained by BLUN Engineering**  
Last updated: April 11, 2026
