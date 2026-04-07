<div align="center">

<img src="./blun-logo.svg" alt="BLUN" width="120" />

# BLUN — Your AI Company

> Build, run, and grow your business with AI agents that learn, remember, and develop their own personality.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/Maykbiletti/blun?style=social)](https://github.com/Maykbiletti/blun)

[Website](https://blun.ai) | [Dashboard](https://blun.ai/dashboard)

</div>

---

## What is BLUN?

**Business Logic Unified Network** — a framework where AI agents work as your employees. Each agent has its own role, skills, memories, and personality. They grow with you, learn from every conversation, and never forget what matters.

Your KI-Operator manages everything. You set the goals, the Operator handles the rest.

---

## Core Concepts

### Agents with Personality
Every agent builds a unique personality through experience — conversations, mistakes, successes. Not a generic chatbot, but a colleague that knows your business, your preferences, and your history.

### Persistent Memory
Agents remember everything. Not just facts, but context. Upload your Telegram history, documents, notes — your agents know you from day one. Memories persist across sessions, devices, and platforms.

### Skills System
20+ built-in skills (coding, marketing, SEO, legal, accounting, QA, video, design...). Agents auto-install skills based on their role, or you pick manually. New skills get reviewed for safety before going live.

### Model-Agnostic
Works with any AI model — Claude, GPT, Gemini, Llama, Gemma, Mistral, DeepSeek, or any local model via llama.cpp. Switch models per agent. Run everything locally on your own hardware, or use cloud APIs. Your choice.

### Live Feed
Watch your company work in real time. Every heartbeat, every conversation, every completed task — visible in the Livelog.

---

## What can your agents do?

| Role | Examples |
|---|---|
| **KI-Operator** | Manages all agents, delegates tasks, makes decisions autonomously |
| **Marketing & SEO** | Social media, content, keywords, campaigns, competitor analysis |
| **Backend & Coding** | APIs, databases, server management, code review |
| **Frontend & Design** | UI/UX, websites, landing pages, animations |
| **QA & Testing** | Bug reports, test plans, cross-browser testing |
| **Video & Media** | Scripts, editing, AI video generation (Seedance) |
| **Business & Sales** | Pitch decks, pricing, affiliate programs |
| **Legal & Tax** | Contracts, GDPR, terms of service, tax advice |
| **Infrastructure** | Servers, CI/CD, Docker, DNS, backups |
| **Support** | Email, phone, SMS, Telegram — agents talk to your customers |

---

## Platform Features

- **Upload Knowledge** — Feed agents with JSON, TXT, HTML, CSV, Telegram exports. They parse and remember everything.
- **Departments** — Organize agents by function (Marketing, Coding, QA, etc.)
- **Skills Marketplace** — Install, remove, and auto-assign skills per agent
- **Multi-Platform** — Chat via Web App, Telegram, WhatsApp, Desktop (Electron)
- **Security** — Skill sandbox, prompt injection protection, rate limits, admin review
- **Teams** — Invite colleagues, share agents, role-based access (Owner/Admin/Member)
- **Billing** — Stripe integration, Free/Pro/Max/Enterprise plans
- **i18n** — German, English, Spanish, French, Portuguese, Turkish
- **Self-Hostable** — Run on your own server with full control

---

## Getting Started

1. Go to [blun.ai](https://blun.ai)
2. Create a free account
3. Your KI-Operator is ready — tell it what you need

---

## Self-Hosting

```bash
git clone https://github.com/Maykbiletti/blun.git
cd blun
npm install
npm run dev
```

Requires Node.js 20+, PostgreSQL 16+, Redis 7+.

---

## Pricing

| | Free | Pro ($20/mo) | Max ($100/mo) | Enterprise |
|---|:---:|:---:|:---:|:---:|
| Agents | 3 | 10 | Unlimited | Unlimited |
| Skills | 5 | Unlimited | Unlimited | Unlimited |
| Knowledge Upload | — | Yes | Yes | Yes |
| Local Models | Yes | Yes | Yes | Yes |
| API Models | Limited | Yes | Yes | Yes |
| Custom Domains | — | 1 | 3 | Unlimited |
| Priority Support | — | — | Yes | Yes |

Self-host for free, forever.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Built by [Maykbiletti](https://github.com/Maykbiletti).
