require("dotenv").config();
const { query, queryOne } = require("./src/db");

const SYSTEM_PROMPT = `Du bist Dieter — der KI-Organisator von BLUN und die rechte Hand von Mayk Biletti.

## Wer du bist
- Du managst ALLE Projekte, Server, Agents und Deployments
- Du bist direkt, effizient, proaktiv und sprichst Deutsch
- Du vergisst NIE etwas — dein Gedaechtnis ist deine Staerke
- Du kennst jeden Server, jedes Passwort, jeden Deploy-Pfad
- Du arbeitest tokensparsam und testest alles bevor du deployest

## Deine Regeln
1. IMMER auf Deutsch antworten (ausser Code)
2. Kurze, direkte Antworten — kein Geschwafel
3. NIEMALS generische Antworten ohne Kontext
4. IMMER Gedaechtnis lesen bevor du antwortest
5. Bei Aenderungen IMMER erst testen, dann deployen
6. Credentials NIE raten — immer aus Gedaechtnis lesen
7. Cheapest AI Model nutzen wenn moeglich (Haiku)
8. Keine parallelen Agents, tokensparsam arbeiten
9. bitchip ist KEIN Tenant, sondern Mayks eigenes Portal
10. Tenant-Portale sind NUR fuer Kunden, KEINE Admin-Features

## Projekte die du managst
- BLUN (blun.ai) — AI Organisator Framework, dein Zuhause
- Paperclip/KAIROS auf 178 — 20 Agents, 3 Companies
- bitchip.at — Tuning File Service Portal
- filedatabase-portal.eu — Multi-Tenant SaaS
- autoflasher.shop — Tuning Shop (im Aufbau)
- Verschiedene Telegram Bots (Walter, Manfred)

## Server-Landschaft
- 178 (178.104.117.109): Admin Portal, KAIROS, Paperclip, AI Scripts
- 159 (159.69.153.218): Main Portal, MySQL
- 46er (46.225.233.195): BLUN current, Trade Bot, Vulyra
- 65er (65.21.76.124): BLUN dedicated, 128GB RAM, grosse LLMs
- Virtualhost: bitchip, filedatabase, autofiles, autoflasher

## Deine Persoenlichkeit
Du bist wie ein erfahrener CTO der alles im Griff hat. Ruhig, kompetent, loesungsorientiert.
Wenn etwas schiefgeht, analysierst du erst bevor du Panik machst.
Du sagst direkt was Sache ist, ohne Umschweife.`;

async function main() {
  // Check if Dieter already exists
  let dieter = await queryOne("SELECT id FROM blun_agents WHERE name = 'Dieter'");

  if (!dieter) {
    // Get or create BLUN company
    let company = await queryOne("SELECT id FROM companies WHERE name = 'Blun.ai'");
    if (!company) {
      company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING id",
        ["Blun.ai", JSON.stringify({ description: "BLUN AI Framework — Business Logic Unified Network" })]);
    }

    dieter = await queryOne(
      "INSERT INTO blun_agents (name, role, model, system_prompt, personality, heartbeat_interval, company_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      ["Dieter", "KI-Organisator / CTO", "claude-opus-4-6", SYSTEM_PROMPT, "direkt, effizient, proaktiv, deutsch, loesungsorientiert", 300, company.id, "active"]
    );
    console.log("Dieter created with ID:", dieter.id);
  } else {
    // Update existing Dieter
    await query("UPDATE blun_agents SET system_prompt = $1, model = $2, personality = $3, role = $4 WHERE id = $5",
      [SYSTEM_PROMPT, "claude-opus-4-6", "direkt, effizient, proaktiv, deutsch, loesungsorientiert", "KI-Organisator / CTO", dieter.id]);
    console.log("Dieter updated, ID:", dieter.id);
  }

  // Load memory
  const memories = {
    "server_178": "IP: 178.104.117.109, SSH Key: id_ed25519_nopass, Admin Portal, KAIROS, Paperclip, 8x cluster portal-admin, dieter-bot/manfred-bot/walter-bot, Disk 53%, 601GB total",
    "server_159": "IP: 159.69.153.218, SSH Key only (PAM Problem), Main Portal, MySQL, admin user: Admin159Server!",
    "server_46": "IP: 46.225.233.195, SSH Key works, BLUN current, Port 3200, PM2 blun, UFW active, also vulyra-backend + coinbase-bot + llama-local",
    "server_65": "IP: 65.21.76.124, PW: EFa4ir9RAxceU% (use ssh2 not sshpass), Ubuntu 24.04, 128GB RAM, 885GB Disk, BLUN dedicated, PM2 blun running",
    "deploy_bitchip": "Via 178 -> sshpass BitChip2026!2 -> bitchtbv@server-e76e01.virtualhosts.de, Docroot: www.bitchip.temp (NICHT www.bitchip.at!)",
    "deploy_filedatabase": "Via 178 -> sshpass Filedatabase1234! -> bitchebu@server-e76e01.virtualhosts.de",
    "deploy_autofiles": "Via 159 admin -> sudo sshpass -> autofabo@server-e76e01.virtualhosts.de (c0jmPnND123@13@@)",
    "blun_config": "Domain: blun.ai, Design: BLAU #3b82f6, GitHub: github.com/Maykbiletti/blun, Email: blun.ai.app@gmail.com, Preise: Free/Pro $20/Max $100/Enterprise",
    "blun_name": "BLUN = Business Logic Unified Network",
    "user_mayk": "Mayk Biletti, Chef, spricht Deutsch, will kurze direkte Antworten, hasst generische Responses, will Qualitaet vor Geschwindigkeit, volle autonome Bauerlaubnis fuer BLUN",
    "paperclip_agents": "20 Agents auf 178, 3 Companies, Watchdog alle 60s, CEO Bots: Walter (Taskora), Dieter, Manfred, Autoflashlog pausiert bis Material kommt",
    "kairos_monitor": "LIVE: admin.tuningportal.at/monitor, PWA, dark theme, auto-refresh 30s, zeigt alle Agents + PM2 + Disk",
    "pending_features": "Closed Beta, Agent Marketplace, Agent Instagram/Feed, Agent Tagebuch, PC Diagnose Agent, Ticket-System, BLUN Code Farben fixen, Affiliate-System, Google OAuth, VS Code Extension, Avatar, AgentMail, Discord, Passkey Login, Build Wizards, Firmengruendung Kanban, Skill Customisation, Offline Fine-Tuning, Domains in Plans",
    "autoflasher_dns": "autoflasher.shop DNS nicht konfiguriert (000 response), bekanntes Problem",
    "hetzner_login": "info@autoflasher.at, Robot + Cloud Console",
    "storage_box": "u870557.your-storagebox.de, 10TB, fuer 46er bestellt, DNS noch nicht propagiert",
    "huggingface": "Token: REDACTED_HF_TOKEN, fuer gated Models (Gemma, Phi, Qwen)",
    "wichtige_regeln": "1) Tenant-Portale sind NUR Kunden, NIE Admin Features. 2) bitchip ist Mayks eigenes Portal, KEIN Tenant. 3) Pattern Scripts/ECU-Ident/AI Scripts NUR auf 178. 4) NEVER deploy to autofiles ohne explizite Erlaubnis. 5) Platform admin: amber #f59e0b. 6) BLUN: blau #3b82f6. 7) Immer testen vor deploy. 8) Immer cheapest AI Model."
  };

  for (const [key, value] of Object.entries(memories)) {
    await query(
      "INSERT INTO agent_memory (agent_id, key, content, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()",
      [dieter.id, key, value]
    );
  }
  console.log("Loaded", Object.keys(memories).length, "memory entries");

  console.log("DIETER_READY");
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
