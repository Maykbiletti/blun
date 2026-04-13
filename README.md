<div align="center">

<img src="./blun-logo.svg" alt="BLUN" width="120" />

# BLUN — Your AI Company

> Build, run, and grow your business with AI agents that learn, remember, and develop their own personality.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/Maykbiletti/blun?style=social)](https://github.com/Maykbiletti/blun)

[Website](https://blun.ai) | [Dashboard](https://blun.ai/dashboard) | [BLUN King Chat](https://blun.ai/app)

</div>

---

## What is BLUN?

**Business Logic Unified Network** — a complete AI platform where AI agents work as your employees. Each agent has its own role, skills, memories, and personality. They grow with you, learn from every conversation, and never forget what matters.

Your KI-Operator manages everything. You set the goals, the Operator handles the rest.

---

## Platform Overview

### BLUN Dashboard
Full-featured web application for managing your AI company:
- **Agent Management** — Create, configure, and monitor AI agents
- **Live Feed** — Watch your agents work in real time (heartbeats, tasks, conversations)
- **Kanban Board** — Drag-and-drop task management across agents
- **Project Manager** — Isolated project folders with file tree, viewer, and ZIP download
- **Canvas** — Agent code output with diff preview and merge functionality
- **Monitor Dashboard** — System health, GPU, RAM, disk, all services at a glance
- **Company Management** — Multi-company support with context switching
- **Team Accounts** — Invite colleagues, role-based access (Owner/Admin/Member)

### BLUN King — AI Chat App
Your personal AI assistant, available everywhere:
- **Mobile App** (iOS & Android via Expo)
- **Web App** at blun.ai/app
- **Telegram Bot** with full chat + voice support
- **Voice Input** — Speech-to-text with high-accuracy transcription
- **Knowledge Base** — RAG-powered answers from your own knowledge database
- **Web Search** — Real-time web search integration for factual queries
- **Multi-Language** — German, English, Turkish, French, Spanish, Arabic, Russian, Chinese
- **Learn Mode** — Teach your AI new knowledge via `/learn` command

### Website & Software Builder
Build without code:
- **Website Wizard** — Describe your website, BLUN builds it
- **Software Builder** — Full application scaffolding from description
- **Landing Pages** — Professional pages generated in minutes

---

## Core Concepts

### Agents with Personality
Every agent builds a unique personality through experience — conversations, mistakes, successes. Not a generic chatbot, but a colleague that knows your business, your preferences, and your history.

### Persistent Memory
Agents remember everything. Not just facts, but context. Upload your Telegram history, documents, notes — your agents know you from day one. Memories persist across sessions, devices, and platforms.

### Knowledge System
- **954+ knowledge chunks** across 14 domains (Legal, Finance, Medical, Cooking, Social Media, Education, Travel, Sports, Music, Gaming, E-Commerce, Handwerk, Gastro, Immobilien)
- **Guardrails** — Built-in safety for medical, legal, and financial advice
- **Copywriting Packs** — Instagram, Email, Landing Pages, Product Descriptions
- **Multilingual Packs** — Localized knowledge in 8+ languages
- **Auto-Indexing** — New knowledge is automatically indexed on startup
- **User Learning** — Users can teach the AI via `/learn` endpoint

### Skills System
20+ built-in skills with automatic assignment based on agent role:

| Category | Skills |
|---|---|
| **Business** | Marketing, SEO, Sales, Accounting, Legal |
| **Technical** | Coding, QA, Infrastructure, DevOps |
| **Creative** | Design, Video, Copywriting, Social Media |
| **Support** | Customer Service, Email, Phone, Chat |

### Model-Agnostic
Works with any AI model — Claude, GPT, Gemini, Llama, Mistral, DeepSeek, or any local model. Switch models per agent. Run everything locally on your own hardware, or use cloud APIs. Your choice.

### Multi-KI Architecture
- **Smart Routing** — Automatically picks the best model for each task
- **Fallback System** — If one provider fails, seamlessly switches to another
- **Cost Optimization** — Routes simple tasks to cheaper models, complex tasks to capable ones
- **Provider Dashboard** — See which models are active, their costs, speed, and quality scores

---

## What can your agents do?

| Role | Examples |
|---|---|
| **KI-Operator** | Manages all agents, delegates tasks, makes decisions autonomously |
| **Marketing & SEO** | Social media, content, keywords, campaigns, competitor analysis |
| **Backend & Coding** | APIs, databases, server management, code review |
| **Frontend & Design** | UI/UX, websites, landing pages, animations |
| **QA & Testing** | Bug reports, test plans, cross-browser testing |
| **Video & Media** | Scripts, editing, AI video generation |
| **Business & Sales** | Pitch decks, pricing, affiliate programs |
| **Legal & Tax** | Contracts, GDPR, terms of service, tax advice |
| **Infrastructure** | Servers, CI/CD, DNS, backups, monitoring |
| **Support** | Email, phone, SMS, Telegram — agents talk to your customers |

---

## Platform Features

- **Dashboard** — 4-tab layout with agents, chat, monitoring, settings
- **Kanban Board** — Drag-and-drop task management
- **Project Manager** — File tree, code viewer, ZIP download
- **Canvas** — Live agent code output with diff preview
- **Live Feed** — Real-time agent heartbeats and activity
- **Billing** — Stripe integration with invoice generation
- **Admin Panel** — Plan editor, user management, system status
- **Monitor** — GPU, RAM, disk, PM2 processes, Ollama status
- **Watchdog** — Automatic alerts via Telegram when services go down
- **Voice Chat** — Speech-to-text and text-to-speech
- **Federation** — Connect multiple BLUN instances
- **i18n** — 8 languages (DE, EN, ES, FR, PT, TR, AR, RU)
- **Responsive** — Works on desktop, tablet, and mobile
- **PWA** — Install as app on any device
- **Telegram Integration** — One-click bot setup, chat with agents via Telegram
- **Knowledge RAG** — Agents answer from your knowledge base
- **Web Search** — Real-time DuckDuckGo integration
- **Auto-Backup** — Syntax checks before deploy, automatic backups

---

## Infrastructure & Reliability

- **Safe Deploy** — Syntax validation before every restart
- **Watchdog System** — 60-second health checks on all services
- **Auto-Recovery** — Services restart automatically on failure
- **Telegram Alerts** — Instant notification when something breaks
- **Memory Limits** — Per-process RAM limits prevent OOM crashes
- **Log Rotation** — Automatic log cleanup, no disk overflow
- **ChromaDB Auto-Repair** — Knowledge base self-heals if corrupted

---

## Getting Started

1. Go to [blun.ai](https://blun.ai)
2. Create an account
3. Your KI-Operator is ready — tell it what you need

Or self-host:

```bash
git clone https://github.com/Maykbiletti/blun.git
cd blun
npm install
npm run dev
```

Requires Node.js 20+, PostgreSQL 16+, Redis 7+.

---

## Pricing

| | Starter | Pro | Business | Enterprise |
|---|:---:|:---:|:---:|:---:|
| **Price** | **49 EUR/mo** | **149 EUR/mo** | **399 EUR/mo** | **Custom** |
| Agents | 3 | 10 | Unlimited | Unlimited |
| Skills | 5 | Unlimited | Unlimited | Unlimited |
| Knowledge Upload | Limited | Full | Full | Full |
| Local Models | Yes | Yes | Yes | Yes |
| API Models | Limited | Full | Full | Full |
| BLUN King Chat | Basic | Full | Full | Full |
| Website Builder | 1 site | 3 sites | 10 sites | Unlimited |
| Custom Domains | — | 1 | 5 | Unlimited |
| Team Members | 1 | 5 | 20 | Unlimited |
| Priority Support | — | Email | Priority | Dedicated |
| Monitoring Dashboard | — | Yes | Yes | Yes |

All prices excl. VAT. Self-host for free, forever.

---

## Extras & Add-ons

| Add-on | Price |
|---|---|
| Additional Agents (5 pack) | 29 EUR/mo |
| Additional Team Members (10 pack) | 39 EUR/mo |
| Custom Domain | 9 EUR/mo |
| Priority Support | 49 EUR/mo |
| Dedicated GPU Instance | 199 EUR/mo |
| White-Label License | On request |

---

## Roadmap

- [ ] Google OAuth & Passkey Login
- [ ] BLUN Mobile App (native iOS & Android)
- [ ] BLUN Desktop App (Windows, Mac, Linux)
- [ ] Agent Marketplace (buy & sell agent templates)
- [ ] Skill Marketplace (community skills, 30% commission)
- [ ] Affiliate System
- [ ] VS Code Extension
- [ ] Discord Integration
- [ ] WhatsApp Integration
- [ ] Animated Agent Avatars
- [ ] Agent University (skills, certificates, mentoring)
- [ ] Auto-Scaling Infrastructure

---

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **Backend**: Node.js, Express, WebSocket
- **Database**: PostgreSQL 16, Redis 7
- **AI**: Model-agnostic (any provider, any local model)
- **Voice**: Whisper (STT), Piper (TTS)
- **Knowledge**: ChromaDB (vector store), RAG pipeline
- **Billing**: Stripe
- **Monitoring**: Custom watchdog, PM2, health checks
- **Deploy**: PM2, Nginx, Let's Encrypt SSL

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Built with passion by [BLUN](https://blun.ai).
