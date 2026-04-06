# BLUN

**AI Organisator** -- open-source framework that organizes your AI agents into productive teams. One command to install. Zero complexity.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)

## Architecture

```
Browser/Dashboard <--WebSocket--> BLUN Server <--Redis Pub/Sub--> Agent Processes
                  <---REST API-->             <---PostgreSQL---->
```

BLUN replaces traditional polling-based agent systems with an event-driven architecture. Agents connect via WebSocket, receive messages in real-time, and report tool executions, cost events, and status changes back to the server.

## Quick Start

```bash
# Install globally
npm install -g blun

# Create a new project
blun init my-project
cd my-project

# Start
blun start
```

Or manually:

```bash
git clone https://github.com/Maykbiletti/blun.git
cd blun
cp .env.example .env
npm install
sudo -u postgres psql -f src/models/schema.sql
npm start
```

The dashboard is at `http://localhost:3200/dashboard`.

## Features

- **Real-time agents** -- WebSocket-powered, event-driven, no polling
- **Multi-model** -- OpenAI, Claude, Gemini, local LLMs -- switch per agent
- **Skills system** -- Install domain knowledge as packages (tax advisor, devops, research...)
- **Tool registry** -- 6 built-in tools, install more from Git
- **Agent teams** -- Organize agents into companies with roles
- **Chat** -- Real-time bidirectional user-agent communication
- **Memory** -- Per-agent persistent key-value store
- **Dashboard** -- PWA with dark theme, live updates, mobile-ready
- **Auth** -- User login, sessions, OAuth (GitHub, Google)
- **Billing** -- Stripe subscriptions, invoices, plan limits
- **CLI** -- Full command-line interface for all operations
- **Federation** -- Cross-instance agent communication (coming soon)

## Core Components

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
| `src/routes/chat.js` | Chat endpoints |
| `src/routes/auth.js` | Authentication (login, register, OAuth) |
| `src/routes/billing.js` | Stripe billing and subscriptions |
| `src/routes/skills.js` | Skills management |

## REST API

All API endpoints require the `x-blun-key` header (except health checks and auth).

### Companies
- `GET /api/companies` -- List all companies
- `GET /api/company/:id` -- Company detail with agents
- `POST /api/companies` -- Create company

### Agents
- `GET /api/agents` -- List all agents
- `GET /api/agent/:id` -- Agent detail
- `POST /api/agents` -- Create agent
- `PATCH /api/agent/:id` -- Update agent
- `POST /api/agent/:id/start` -- Start agent process
- `POST /api/agent/:id/stop` -- Stop agent process
- `POST /api/agent/:id/restart` -- Restart agent process

### Chat
- `POST /api/agent/:id/message` -- Send message to agent
- `GET /api/chat/history/:conversationId` -- Message history
- `GET /api/chat/conversations` -- List conversations

### Skills
- `GET /skills` -- List installed skills
- `POST /skills/install` -- Install a skill
- `POST /skills/:id/assign/:agentId` -- Assign skill to agent
- `GET /skills/registry` -- Browse available skills

### Auth
- `POST /auth/register` -- Create account
- `POST /auth/login` -- Login
- `GET /auth/me` -- Current user

### Billing
- `GET /billing/plans` -- Available plans
- `POST /billing/checkout` -- Start subscription
- `GET /billing/subscription` -- Current subscription

### System
- `GET /api/dashboard` -- Full dashboard data
- `GET /api/admin/health` -- System health check

## Built-in Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `ssh` | Remote command execution via SSH |
| `postgres_query` | Run SQL queries |
| `http_request` | Make HTTP requests |
| `file_read` | Read files from the filesystem |
| `file_write` | Write files to the filesystem |

## Agent Adapters

- **codex_local** -- OpenAI Codex CLI
- **gemini_cli** -- Google Gemini CLI
- **claude_api** -- Anthropic Claude API
- **openai_api** -- OpenAI API

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BLUN_PORT` | `3200` | HTTP/WebSocket port |
| `BLUN_API_KEY` | `blun-dev-key` | API authentication key |
| `BLUN_DB_HOST` | `localhost` | PostgreSQL host |
| `BLUN_DB_PORT` | `5432` | PostgreSQL port |
| `BLUN_DB_NAME` | `blun` | Database name |
| `BLUN_DB_USER` | `postgres` | Database user |
| `BLUN_DB_PASSWORD` | *(empty)* | Database password |
| `BLUN_REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL |

## CLI

```bash
blun init [name]       # Create new project
blun start             # Start server
blun stop              # Stop server
blun status            # Show health
blun agent list        # List agents
blun agent create      # Create agent
blun company list      # List companies
blun skill install     # Install skill
blun help              # Show all commands
```

## Plans

| | Free | Pro (5/mo) | Team (15/mo) | Enterprise |
|---|---|---|---|---|
| Agents | 3 | Unlimited | Unlimited | Unlimited |
| Companies | 1 | 10 | 50 | Unlimited |
| Messages | 1000/day | Unlimited | Unlimited | Unlimited |
| Shared Projects | -- | -- | Yes | Yes |
| Federation | -- | -- | Yes | Yes |
| Admin Panel | -- | -- | Yes | Yes |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
