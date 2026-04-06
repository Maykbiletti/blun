<div align="center">

<!-- Logo placeholder -->
<img src="./blun-logo.svg" alt="BLUN" width="120" />

<br />
<br />

# BLUN

**Your AI team, organized. Like having a CTO that never sleeps.**

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![npm](https://img.shields.io/npm/v/blun?color=cb3837&logo=npm)](https://www.npmjs.com/package/blun)
[![GitHub Stars](https://img.shields.io/github/stars/Maykbiletti/blun?style=social)](https://github.com/Maykbiletti/blun)

[Website](https://blun.ai) | [Dashboard](https://blun.ai/dashboard) | [Documentation](#documentation) | [Discord](#community)

</div>

---

## What is BLUN?

Imagine you hire a bunch of smart freelancers -- a developer, a researcher, a writer, a data analyst. They are all talented individually. But without someone coordinating them, it is chaos. Everyone works on their own thing, nobody talks to each other, tasks fall through the cracks.

**BLUN is the manager they need.**

You give BLUN a bunch of AI agents (think ChatGPT, Claude, Gemini, or even local models running on your laptop). BLUN turns them into an actual team. It assigns roles, delegates tasks, makes sure they communicate, and reports back to you.

You do not write code to orchestrate them. You do not build pipelines. You just say what you want done, and BLUN figures out who does what.

It is like Slack for AI agents -- except the manager is also an AI, and it actually works.

---

## Features

### KI-Organisator -- Your AI CTO
A meta-AI that sits above all your agents. It knows every project, every agent's strengths, and decides who works on what -- like a CTO that actually reads every Jira ticket.

### Code Canvas -- Watch AI Code Live
See your agents write code in real time, right in the browser. Syntax-highlighted, streaming, no refresh needed.

### Skills Marketplace -- Teach Your Agents Anything
Install skills from Git repositories or build your own. Tax advisor, DevOps, research, copywriting -- agents auto-discover and load what they need.

### Federation -- Connect With Anyone
Link BLUN instances across the internet. Your agents can collaborate with agents on completely different servers. Think email, but for AI teams.

### Telegram Integration -- One Click
Paste your bot token, done. Your agents now live in Telegram and respond to users directly in chat.

### Voice and Avatar -- Talk Face to Face
*Coming soon.* Give your agents a face and a voice. Video-call your AI team like you would a human colleague.

### Multi-Model -- Use Any AI
OpenAI, Claude, Gemini, Mistral, local LLMs via Ollama -- assign different models to different agents. Switch anytime. Zero vendor lock-in.

### Local Mode -- Works Offline
Runs on SQLite out of the box. No cloud, no internet required. Scale to PostgreSQL and Redis when you are ready.

---

## Get Started in 30 Seconds

```bash
npx create-blun my-project
cd my-project
blun start
```

Open `http://localhost:3000` -- your dashboard is live.

---

## BLUN vs. Others

| Feature | BLUN | CrewAI | AutoGen | LangGraph |
|---|:---:|:---:|:---:|:---:|
| Built-in Dashboard UI | Yes | No | No | No |
| One-command setup | Yes | No | No | No |
| Telegram integration | Yes | No | No | No |
| Federation (cross-server) | Yes | No | No | No |
| Skills marketplace | Yes | No | No | No |
| Multi-model per agent | Yes | Partial | Partial | Partial |
| Real-time WebSocket | Yes | No | No | No |
| Works offline (SQLite) | Yes | No | No | No |
| Built-in billing (Stripe) | Yes | No | No | No |
| Code Canvas (live coding view) | Yes | No | No | No |
| No Python required | Yes | No | No | No |
| Open source (MIT) | Yes | Yes | Yes | Yes |

---

## Plans

| | Free | Pro | Team |
|---|:---:|:---:|:---:|
| **Price** | 0 EUR / month | 5 EUR / month | 15 EUR / month |
| Agents | 3 | 10 | Unlimited |
| Skills | 5 | Unlimited | Unlimited |
| Federation | -- | Yes | Yes |
| Priority Support | -- | -- | Yes |
| Custom Branding | -- | -- | Yes |

Self-host for free forever. Cloud plans include hosting and automatic updates.

---

## Architecture

```
                          +------------------+
                          |   BLUN Dashboard |
                          |   (React + WS)   |
                          +--------+---------+
                                   |
                          +--------+---------+
                          |  KI-Organisator  |
                          |   (Meta-Agent)   |
                          +--------+---------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
     +--------+------+   +--------+------+   +--------+------+
     |  Agent: Dev   |   | Agent: Research|   | Agent: Writer |
     |  Model: GPT-4 |   | Model: Claude  |   | Model: Gemini |
     +-------+-------+   +-------+-------+   +-------+-------+
              |                    |                    |
     +--------+--------------------+--------------------+--------+
     |                     Skills Layer                          |
     |  [code] [research] [tax] [devops] [writing] [custom...]  |
     +---------------------------+-------------------------------+
                                 |
     +---------------------------+-------------------------------+
     |                    Runtime Layer                          |
     |  SQLite/PostgreSQL  |  WebSocket  |  Telegram  |  Stripe |
     +-----------------------------------------------------------+
```

---

## Screenshots

<!-- screenshot: dashboard -->
<!-- screenshot: code-canvas -->
<!-- screenshot: skills-marketplace -->
<!-- screenshot: telegram-chat -->
<!-- screenshot: federation-map -->

*Screenshots coming soon. Run `blun start` to see it yourself.*

---

## All 14 Systems

1. **KI-Organisator** -- Meta-AI orchestration
2. **Code Canvas** -- Live code streaming
3. **Skills Marketplace** -- Installable agent skills
4. **Federation Protocol** -- Cross-instance agent communication
5. **Telegram Bridge** -- One-click bot integration
6. **Voice/Avatar Engine** -- Agent video presence (coming soon)
7. **Multi-Model Router** -- Per-agent model selection
8. **Local Runtime** -- SQLite, offline-first
9. **Billing Engine** -- Stripe subscriptions and invoices
10. **Dashboard** -- Real-time React UI
11. **WebSocket Layer** -- Event-driven agent communication
12. **Auth System** -- JWT, OAuth, role-based access
13. **Plugin API** -- Extend anything via hooks
14. **CLI** -- Full management from the terminal

---

## Contributing

We welcome contributions of all kinds.

```bash
git clone https://github.com/Maykbiletti/blun.git
cd blun
npm install
npm run dev
```

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

---

## Built With

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| React | Dashboard UI |
| WebSocket (ws) | Real-time communication |
| SQLite / PostgreSQL | Data storage |
| Stripe | Billing and subscriptions |
| Telegram Bot API | Chat integration |
| OpenAI / Claude / Gemini | AI model providers |

---

## Community

- [GitHub Discussions](https://github.com/Maykbiletti/blun/discussions)
- [Discord](#) -- Coming soon
- [Twitter / X](https://twitter.com/blun_ai) -- Coming soon

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Built by [Maykbiletti](https://github.com/Maykbiletti). Open source, forever.
