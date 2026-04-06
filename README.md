# KAIROS v2

**Event-driven AI Agent Framework** — real-time, multi-agent orchestration with WebSocket communication, Redis pub/sub, and PostgreSQL persistence.

## Architecture

```
Browser/Dashboard <──WebSocket──> KAIROS Server <──Redis Pub/Sub──> Agent Processes
                  <───REST API──>               <───PostgreSQL────>
```

KAIROS replaces traditional polling-based agent systems with an event-driven architecture. Agents connect via WebSocket, receive messages in real-time, and report tool executions, cost events, and status changes back to the server — which broadcasts them to connected dashboards.

### Core Components

| Component | Description |
|-----------|-------------|
| `server.js` | Express + WebSocket server on port 3200 |
| `src/db.js` | PostgreSQL connection pool |
| `src/redis.js` | Redis pub/sub for inter-process messaging |
| `src/ws.js` | WebSocket server (agent + dashboard connections) |
| `src/agent/runtime.js` | Agent process manager (spawn, monitor, restart) |
| `src/agent/tools.js` | Tool registry with built-in tools |
| `src/agent/memory.js` | Per-agent key-value memory store |
| `src/routes/api.js` | REST API for dashboard and integrations |
| `src/routes/chat.js` | Chat endpoints (send, history, conversations) |
| `src/routes/admin.js` | Admin operations (health, bulk ops, stats) |

## Quick Start

```bash
# 1. Create the database
sudo -u postgres psql -f src/models/schema.sql

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. (Optional) Set a custom API key
KAIROS_API_KEY=your-secret-key npm start
```

The server runs on port **3200** by default (set `KAIROS_PORT` to change).

## WebSocket Protocol

Connect to `ws://host:3200?role=dashboard` for dashboard updates, or `ws://host:3200?role=agent&agentId=UUID` for agent connections.

All messages are JSON with `{ type, payload }`:

| Type | Direction | Description |
|------|-----------|-------------|
| `agent.connect` | Agent -> Server | Agent registers itself |
| `agent.status` | Both | Status change (active/idle/error/offline) |
| `agent.message` | Agent -> Server | Agent sends a chat message |
| `agent.tool.start` | Agent -> Server | Tool execution started |
| `agent.tool.result` | Agent -> Server | Tool execution completed |
| `user.message` | Dashboard -> Agent | User sends message to agent |
| `task.created` | Server -> Both | New task assigned |
| `task.updated` | Server -> Both | Task status changed |
| `dashboard.sync` | Server -> Dashboard | Full state snapshot |
| `cost.report` | Agent -> Server | Token/cost usage report |

## REST API

All API endpoints require the `x-kairos-key` header (except health checks).

### Companies
- `GET /api/companies` — List all companies
- `GET /api/company/:id` — Company detail with agents
- `POST /api/companies` — Create company

### Agents
- `GET /api/agents` — List all agents
- `GET /api/agent/:id` — Agent detail
- `POST /api/agents` — Create agent
- `PATCH /api/agent/:id` — Update agent
- `POST /api/agent/:id/start` — Start agent process
- `POST /api/agent/:id/stop` — Stop agent process
- `POST /api/agent/:id/restart` — Restart agent process

### Chat
- `POST /api/agent/:id/message` — Send message to agent
- `POST /api/chat/send` — Send message (alternative)
- `GET /api/chat/history/:conversationId` — Message history
- `GET /api/chat/conversations` — List conversations

### Tasks
- `GET /api/agent/:id/tasks` — Agent tasks
- `POST /api/agent/:id/task` — Create task
- `PATCH /api/task/:id` — Update task

### Memory
- `GET /api/agent/:id/memory` — List agent memories
- `POST /api/agent/:id/memory` — Store memory entry

### System
- `GET /api/dashboard` — Full dashboard data
- `GET /api/costs` — Cost overview
- `GET /api/tools` — List available tools
- `GET /api/admin/health` — System health check
- `GET /api/admin/stats` — Database statistics

## Built-in Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `ssh` | Remote command execution via SSH |
| `postgres_query` | Run SQL queries |
| `http_request` | Make HTTP requests |
| `file_read` | Read files from the filesystem |
| `file_write` | Write files to the filesystem |

Custom tools can be registered via `tools.register(name, { description, parameters, execute })`.

## Agent Adapters

- **codex_local** — OpenAI Codex CLI
- **gemini_cli** — Google Gemini CLI
- **claude_api** — Anthropic Claude API
- **openai_api** — OpenAI API

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KAIROS_PORT` | `3200` | HTTP/WebSocket port |
| `KAIROS_API_KEY` | `kairos-dev-key` | API authentication key |
| `KAIROS_DB_HOST` | `localhost` | PostgreSQL host |
| `KAIROS_DB_PORT` | `5432` | PostgreSQL port |
| `KAIROS_DB_NAME` | `kairos` | Database name |
| `KAIROS_DB_USER` | `postgres` | Database user |
| `KAIROS_DB_PASSWORD` | *(empty)* | Database password |
| `KAIROS_REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL |

## License

MIT
