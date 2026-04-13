# BLUN API Reference

## Authentication
All API requests require either:
- `x-blun-key` header with your API key
- Session cookie from login

## Endpoints

### Chat
- `POST /api/king/chat` — Send message to BLUN King
- `POST /api/king/transcribe-b64` — Speech-to-text (base64 audio)
- `POST /api/king/learn` — Teach King new knowledge

### Agents
- `GET /api/agents` — List all agents
- `POST /api/agents` — Create agent
- `GET /api/agents/:id` — Get agent details
- `POST /api/chat/message` — Send message to agent

### Health
- `GET /api/health` — Basic health check
- `GET /api/health-detailed` — Detailed system status

### Billing
- `GET /billing/plans` — Available plans
- `POST /billing/subscribe` — Subscribe to plan

For full API docs, visit [blun.ai/docs](https://blun.ai/docs)
