# BLUN API Reference

## Base

- Base URL: `http://localhost:3200`
- JSON API Prefix: `/api`
- Billing Prefix: `/billing`

## Authentication

Most endpoints require one of:

- Header `x-blun-key: <BLUN_API_KEY>`
- Header `x-api-key: <BLUN_API_KEY>`
- Logged-in session cookie

Example:

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/health
```

---

## Health Endpoints

### GET `/api/health`

```bash
curl -sS \
  -H "x-blun-key: $BLUN_API_KEY" \
  http://localhost:3200/api/health
```

### GET `/api/admin/health`

```bash
curl -sS \
  -H "x-blun-key: $BLUN_API_KEY" \
  http://localhost:3200/api/admin/health
```

---

## Agent Endpoints

## Core Agent API (`/api`)

### GET `/api/agents`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agents
```

### POST `/api/agents`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": 1,
    "name": "Helga",
    "role": "assistant",
    "model": "gpt-5.4"
  }' \
  http://localhost:3200/api/agents
```

### GET `/api/agent/:id`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1
```

### PATCH `/api/agent/:id`

```bash
curl -sS -X PATCH \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "active", "title": "Senior Agent" }' \
  http://localhost:3200/api/agent/1
```

### POST `/api/agent/:id/start`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/start
```

### POST `/api/agent/:id/stop`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/stop
```

### POST `/api/agent/:id/restart`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/restart
```

### POST `/api/agent/:id/message`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "Please summarize latest customer feedback." }' \
  http://localhost:3200/api/agent/1/message
```

### GET `/api/agent/:id/conversations`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/conversations
```

### GET `/api/conversation/:id`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/conversation/1
```

### GET `/api/agent/:id/memory`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/memory
```

### POST `/api/agent/:id/memory`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "key": "product_context", "content": "BLUN focuses on agent orchestration." }' \
  http://localhost:3200/api/agent/1/memory
```

### GET `/api/agent/:id/heartbeats`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/heartbeats
```

### GET `/api/agents/:id/skills`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agents/1/skills
```

## Organisator Agent API (`/api/organisator`)

### GET `/api/organisator/agents`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents
```

### POST `/api/organisator/agents`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hanno",
    "role": "designer",
    "model": "gpt-5.4",
    "heartbeat_interval": 60
  }' \
  http://localhost:3200/api/organisator/agents
```

### GET `/api/organisator/agents/running`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/running
```

### POST `/api/organisator/agents/bulk-start`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/bulk-start
```

### POST `/api/organisator/agents/bulk-stop`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/bulk-stop
```

### PUT `/api/organisator/agents/bulk-model`

```bash
curl -sS -X PUT \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "model": "gpt-5.4-mini" }' \
  http://localhost:3200/api/organisator/agents/bulk-model
```

### PUT `/api/organisator/agents/:id`

```bash
curl -sS -X PUT \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "department": "design", "model": "gpt-5.4" }' \
  http://localhost:3200/api/organisator/agents/1
```

### DELETE `/api/organisator/agents/:id`

```bash
curl -sS -X DELETE -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1
```

### POST `/api/organisator/agents/:id/start`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/start
```

### POST `/api/organisator/agents/:id/stop`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/stop
```

### POST `/api/organisator/agents/create`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Rolf", "role": "operator", "department": "ops" }' \
  http://localhost:3200/api/organisator/agents/create
```

### GET `/api/organisator/agents/:id/conversations`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/conversations
```

### POST `/api/organisator/agents/:id/chat`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Status update for today" }' \
  http://localhost:3200/api/organisator/agents/1/chat
```

### POST `/api/organisator/agents/:id/internal-chat`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Delegate task to QA" }' \
  http://localhost:3200/api/organisator/agents/1/internal-chat
```

### GET `/api/organisator/agents/:id/heartbeats`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" "http://localhost:3200/api/organisator/agents/1/heartbeats?limit=20"
```

### GET `/api/organisator/agents/:id/output`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/output
```

### POST `/api/organisator/agents/:id/merge`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/merge
```

### POST `/api/organisator/agents/:id/upload`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -F "file=@./sample.txt" \
  http://localhost:3200/api/organisator/agents/1/upload
```

### GET `/api/organisator/agents/:id/skills`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/skills
```

### POST `/api/organisator/agents/:id/skills/:skillId`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "by": "manual" }' \
  http://localhost:3200/api/organisator/agents/1/skills/2
```

### DELETE `/api/organisator/agents/:id/skills/:skillId`

```bash
curl -sS -X DELETE -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/skills/2
```

### POST `/api/organisator/agents/:id/skills/auto`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/skills/auto
```

### POST `/api/organisator/agents/:id/skills/bulk`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "skill_ids": [1,2,3] }' \
  http://localhost:3200/api/organisator/agents/1/skills/bulk
```

### PUT `/api/organisator/agents/:id/skills/:skillId/toggle`

```bash
curl -sS -X PUT \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true }' \
  http://localhost:3200/api/organisator/agents/1/skills/2/toggle
```

### POST `/api/organisator/skills/auto-assign/:agentId`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "department": "Engineering" }' \
  http://localhost:3200/api/organisator/skills/auto-assign/1
```

### GET `/api/organisator/skills/all-agents`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/skills/all-agents
```

---

## Task Endpoints

## Core Task API (`/api`)

### GET `/api/agent/:id/tasks`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/agent/1/tasks
```

### POST `/api/agent/:id/task`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Prepare release notes",
    "description": "Compile all user-facing changes",
    "priority": 2
  }' \
  http://localhost:3200/api/agent/1/task
```

### PATCH `/api/task/:id`

```bash
curl -sS -X PATCH \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "done" }' \
  http://localhost:3200/api/task/10
```

## Organisator Task API (`/api/organisator`)

### POST `/api/organisator/tasks/reset`

```bash
curl -sS -X POST -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/tasks/reset
```

### POST `/api/organisator/agents/:id/task`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "task": "Create onboarding wizard UX flow" }' \
  http://localhost:3200/api/organisator/agents/1/task
```

### GET `/api/organisator/agents/:id/tasks`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/tasks
```

### PUT `/api/organisator/agents/:id/tasks/:taskId`

```bash
curl -sS -X PUT \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "completed" }' \
  http://localhost:3200/api/organisator/agents/1/tasks/100
```

### DELETE `/api/organisator/agents/:id/tasks/:taskId`

```bash
curl -sS -X DELETE -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/agents/1/tasks/100
```

### PUT `/api/organisator/agents/:agentId/tasks/:taskId`

```bash
curl -sS -X PUT \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "processing" }' \
  http://localhost:3200/api/organisator/agents/1/tasks/100
```

### POST `/api/organisator/tasks/:id/comment`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "user_id": 1, "comment": "Please prioritize this for today." }' \
  http://localhost:3200/api/organisator/tasks/100/comment
```

### GET `/api/organisator/tasks/:id/comments`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/api/organisator/tasks/100/comments
```

---

## Billing Endpoints

All billing routes are mounted under `/billing`.

### GET `/billing/api/config`

```bash
curl -sS http://localhost:3200/billing/api/config
```

### GET `/billing/plans`

```bash
curl -sS http://localhost:3200/billing/plans
```

### GET `/billing/subscription`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/billing/subscription
```

### GET `/billing/api/subscription`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/billing/api/subscription
```

### GET `/billing/invoices`

```bash
curl -sS -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/billing/invoices
```

### POST `/billing/api/create-subscription`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "plan": "pro" }' \
  http://localhost:3200/billing/api/create-subscription
```

### POST `/billing/api/cancel`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3200/billing/api/cancel
```

### POST `/billing/checkout`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "plan": "team" }' \
  http://localhost:3200/billing/checkout
```

### POST `/billing/portal`

```bash
curl -sS -X POST \
  -H "x-blun-key: $BLUN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3200/billing/portal
```

### POST `/billing/webhook`

```bash
curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "stripe-signature: <stripe_signature>" \
  -d '{"id":"evt_test","type":"checkout.session.completed","data":{"object":{}}}' \
  http://localhost:3200/billing/webhook
```

### GET `/billing`

```bash
curl -i -H "x-blun-key: $BLUN_API_KEY" http://localhost:3200/billing
```
