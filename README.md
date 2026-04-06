<p align="center">
  <!-- Replace with your logo -->
  <img src="https://via.placeholder.com/200x200?text=BLUN" alt="BLUN Logo" width="200" />
</p>

<h1 align="center">BLUN</h1>

<p align="center">
  <strong>Event-driven AI Agent Framework</strong><br>
  Orchestrate multiple AI agents with real-time WebSocket communication, persistent memory, and built-in tool execution.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node.js 18+" /></a>
</p>

---

## What is BLUN?

BLUN is a lightweight, self-hosted framework for running multiple AI agents across different companies and teams. Each agent connects via WebSocket, executes tools, maintains persistent memory, and reports costs -- all visible through a real-time dashboard.

### Features

- **Multi-agent orchestration** -- Run dozens of agents across multiple companies from a single server
- **Real-time WebSocket** -- Live dashboard updates, agent status, tool execution streams
- **Pluggable adapters** -- Support for Codex, Gemini CLI, Claude API, OpenAI API out of the box
- **Built-in tool system** -- bash, SSH, SQL, HTTP, file read/write with full execution logging
- **Persistent memory** -- Per-agent key-value memory backed by PostgreSQL
- **Cost tracking** -- Token usage and cost reporting per agent, model, and provider
- **Task management** -- Hierarchical tasks with priority and status tracking
- **Conversation history** -- Full message history with sender attribution
- **Auto-restart** -- Agents automatically recover from crashes (up to 3 retries)
- **Redis pub/sub** -- Inter-process communication for distributed deployments
- **Migration tools** -- Built-in script to migrate from Paperclip

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/blun-ai/blun.git
cd blun
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your PostgreSQL and Redis credentials
```

### 3. Run

```bash
npm run db:init    # Create database and tables
npm start          # Start the server on port 3200
```

Open `http://localhost:3200` to verify the server is running, or connect to `ws://localhost:3200?role=dashboard` for real-time updates.

---

## Architecture

```
                          +------------------+
                          |    Dashboard     |
                          |   (WebSocket)    |
                          +--------+---------+
                                   |
                          +--------+---------+
                          |   BLUN Server    |
                          |   Express + WS   |
                          +--+-----+------+--+
                             |     |      |
                +------------+  +--+--+   +------------+
                |               |     |                |
         +------+------+  +----+---+ +----+---+  +----+------+
         |  PostgreSQL  |  | Redis  | | Redis  |  |  Agent    |
         |  (persist)   |  | (pub)  | | (sub)  |  |  Processes|
         +-------------+  +--------+ +--------+  +----------+
                                                   |  |  |
                                            +------+  |  +------+
                                            |         |         |
                                        +---+---+ +---+---+ +--+----+
                                        | Codex | |Gemini | |Claude |
                                        +-------+ +-------+ +-------+
```

### Key Components

| Component | Path | Description |
|-----------|------|-------------|
| Server | `server.js` | Express HTTP + WebSocket entry point |
| Database | `src/db.js` | PostgreSQL connection pool |
| Redis | `src/redis.js` | Pub/sub and caching |
| WebSocket | `src/ws.js` | Agent and dashboard connections |
| Runtime | `src/agent/runtime.js` | Agent process lifecycle |
| Tools | `src/agent/tools.js` | Tool registry and execution |
| Memory | `src/agent/memory.js` | Per-agent persistent memory |
| REST API | `src/routes/api.js` | CRUD for companies, agents, tasks |
| Chat API | `src/routes/chat.js` | Conversation endpoints |
| Admin API | `src/routes/admin.js` | Health, stats, bulk operations |
| Schema | `src/models/schema.sql` | Full database schema |

---

## API Overview

All API requests require the `x-blun-key` header (set in `.env`).

### Companies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List all companies |
| POST | `/api/companies` | Create a company |
| GET | `/api/company/:id` | Get company with agents |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create an agent |
| PATCH | `/api/agent/:id` | Update agent config |
| POST | `/api/agent/:id/start` | Start agent process |
| POST | `/api/agent/:id/stop` | Stop agent process |
| POST | `/api/agent/:id/message` | Send message to agent |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/send` | Send a chat message |
| GET | `/api/chat/history/:id` | Get conversation history |
| GET | `/api/chat/conversations` | List conversations |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/health` | Health check (no auth) |
| GET | `/api/admin/stats` | Global statistics |
| POST | `/api/admin/agents/start-all` | Start all agents |
| POST | `/api/admin/agents/stop-all` | Stop all agents |

### WebSocket

Connect to `ws://host:port?role=dashboard` for real-time events:

- `agent.status` -- Agent online/offline/error
- `agent.message` -- Agent chat messages
- `agent.tool.start` / `agent.tool.result` -- Tool execution
- `cost.report` -- Token usage events
- `dashboard.sync` -- Full state snapshot

---

## Requirements

- **Node.js** >= 18
- **PostgreSQL** >= 14
- **Redis** >= 6

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[MIT](LICENSE) -- BLUN Contributors
