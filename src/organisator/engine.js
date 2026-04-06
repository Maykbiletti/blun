// BLUN - AI Organisator | MIT License
/**
 * KI-Organisator Engine — Meta-AI that manages the entire BLUN system.
 * Acts as a CTO: knows all projects, companies, agents, can create/start/stop
 * agents, assign skills, monitor health, and make resource decisions.
 */

const { query, queryOne } = require("../db");
const { getProcessStatus } = require("../agent/runtime");
const { v4: uuid } = require("uuid");

// Intent patterns for rule-based NLU
const INTENTS = [
  { pattern: /\b(list|show|get)\s+(all\s+)?agents\b/i, action: "list_agents" },
  { pattern: /\b(list|show|get)\s+(all\s+)?companies\b/i, action: "list_companies" },
  { pattern: /\b(list|show|get)\s+(all\s+)?skills\b/i, action: "list_skills" },
  { pattern: /\b(system|status|overview|health|scan)\b/i, action: "system_status" },
  { pattern: /\bcreate\s+(a\s+)?company\s+(?:called|named)?\s*["']?([\w\s-]+)["']?/i, action: "create_company", extract: 2 },
  { pattern: /\bcreate\s+(a\s+)?agent\s+(?:called|named)?\s*["']?([\w\s-]+)["']?/i, action: "create_agent", extract: 2 },
  { pattern: /\bstart\s+agent\s+["']?([\w\s-]+)["']?/i, action: "start_agent", extract: 1 },
  { pattern: /\bstop\s+agent\s+["']?([\w\s-]+)["']?/i, action: "stop_agent", extract: 1 },
  { pattern: /\brestart\s+agent\s+["']?([\w\s-]+)["']?/i, action: "restart_agent", extract: 1 },
  { pattern: /\bassign\s+skill\s+["']?([\w\s-]+)["']?\s+to\s+["']?([\w\s-]+)["']?/i, action: "assign_skill" },
  { pattern: /\b(suggest|suggestions?|recommend|ideas?)\b/i, action: "suggest" },
  { pattern: /\b(help|what can you do|commands?)\b/i, action: "help" },
  { pattern: /\b(costs?|spending|budget|billing)\b/i, action: "costs" },
  { pattern: /\b(tasks?|todo|pending)\b/i, action: "tasks" },
];

class Organisator {
  constructor() {
    this.state = null;
    this.userId = null;
    this.cache = {};
  }

  async init(userId) {
    this.userId = userId;
    this.state = await queryOne("SELECT * FROM organisator_state WHERE user_id = $1", [userId]);
    if (!this.state) {
      this.state = await queryOne(
        "INSERT INTO organisator_state (user_id, context, goals) VALUES ($1, $2, $3) RETURNING *",
        [userId, {}, []]
      );
    }
    await this.scan();
    return this;
  }

  async scan() {
    const [companies, agents, skills, costs, tasks, processes] = await Promise.all([
      query("SELECT * FROM companies ORDER BY created_at"),
      query("SELECT a.*, c.name AS company_name FROM agents a LEFT JOIN companies c ON c.id = a.company_id ORDER BY c.name, a.name"),
      query("SELECT s.*, a.name AS agent_name FROM agent_skills s LEFT JOIN agents a ON a.id = s.agent_id ORDER BY s.created_at DESC").catch(() => []),
      query("SELECT COALESCE(SUM(cost_cents),0)::numeric AS total FROM cost_events WHERE created_at > NOW() - INTERVAL '30 days'").catch(() => [{ total: 0 }]),
      query("SELECT * FROM tasks WHERE status != 'done' ORDER BY priority DESC, created_at DESC LIMIT 20").catch(() => []),
      Promise.resolve(getProcessStatus()),
    ]);

    this.cache = {
      companies,
      agents,
      skills,
      totalCost30d: costs[0] ? costs[0].total : 0,
      pendingTasks: tasks,
      processes,
      scannedAt: new Date().toISOString(),
    };

    await query("UPDATE organisator_state SET context = $1, last_action = NOW() WHERE user_id = $2",
      [JSON.stringify({ lastScan: this.cache.scannedAt, agentCount: agents.length, companyCount: companies.length }), this.userId]);

    return this.cache;
  }

  async chat(message) {
    if (!this.cache.scannedAt) await this.scan();

    let matched = null;
    let extracted = null;
    for (const intent of INTENTS) {
      const m = message.match(intent.pattern);
      if (m) {
        matched = intent;
        if (intent.extract) extracted = m[intent.extract] ? m[intent.extract].trim() : null;
        break;
      }
    }

    let response;
    if (matched) {
      response = await this.executeAction(matched.action, extracted, message);
    } else {
      response = this._buildContextualResponse(message);
    }

    await query("INSERT INTO organisator_logs (user_id, action, details) VALUES ($1, $2, $3)",
      [this.userId, matched ? matched.action : "chat", { message, response: response.text || response }]);

    return response;
  }

  async executeAction(action, param, rawMessage) {
    const { startAgent, stopAgent, restartAgent } = require("../agent/runtime");

    switch (action) {
      case "list_agents": {
        const agents = this.cache.agents || [];
        if (agents.length === 0) return { text: "No agents found. Create one with: **create agent [name]**", data: [] };
        const lines = agents.map(a => "- **" + a.name + "** (" + (a.company_name || "no company") + ") — " + (a.status || "idle") + " | " + (a.adapter_type || "codex_local"));
        return { text: "**" + agents.length + " Agents:**\n" + lines.join("\n"), data: agents };
      }

      case "list_companies": {
        const companies = this.cache.companies || [];
        if (companies.length === 0) return { text: "No companies yet. Create one with: **create company [name]**", data: [] };
        const agentCounts = {};
        (this.cache.agents || []).forEach(a => { agentCounts[a.company_id] = (agentCounts[a.company_id] || 0) + 1; });
        const lines = companies.map(c => "- **" + c.name + "** — " + (agentCounts[c.id] || 0) + " agents");
        return { text: "**" + companies.length + " Companies:**\n" + lines.join("\n"), data: companies };
      }

      case "list_skills": {
        const skills = this.cache.skills || [];
        if (skills.length === 0) return { text: "No skills assigned yet.", data: [] };
        const lines = skills.map(s => "- **" + s.name + "** → " + (s.agent_name || "unassigned"));
        return { text: "**" + skills.length + " Skills:**\n" + lines.join("\n"), data: skills };
      }

      case "system_status": {
        await this.scan();
        const c = this.cache;
        const activeCount = (c.agents || []).filter(a => a.status === "active").length;
        const errorCount = (c.agents || []).filter(a => a.status === "error").length;
        const processCount = Object.keys(c.processes || {}).length;
        return {
          text: "**System Status**\n" +
            "- Companies: **" + (c.companies || []).length + "**\n" +
            "- Agents: **" + (c.agents || []).length + "** (" + activeCount + " active, " + errorCount + " errors)\n" +
            "- Running processes: **" + processCount + "**\n" +
            "- Pending tasks: **" + (c.pendingTasks || []).length + "**\n" +
            "- 30d cost: **$" + ((c.totalCost30d || 0) / 100).toFixed(2) + "**\n" +
            "- Last scan: " + c.scannedAt,
          data: c
        };
      }

      case "create_company": {
        if (!param) return { text: "Please specify a company name: **create company [name]**" };
        const company = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *", [param, {}]);
        await this.scan();
        return { text: "Company **" + company.name + "** created successfully.", data: company };
      }

      case "create_agent": {
        if (!param) return { text: "Please specify an agent name: **create agent [name]**" };
        const companies = this.cache.companies || [];
        if (companies.length === 0) return { text: "No companies exist. Create one first: **create company [name]**" };
        const companyId = companies[0].id;
        const agent = await queryOne(
          "INSERT INTO agents (company_id, name, role, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
          [companyId, param, "general", "codex_local", [], {}]
        );
        await this.scan();
        return { text: "Agent **" + agent.name + "** created in company **" + companies[0].name + "**.", data: agent };
      }

      case "start_agent": {
        const agent = await this._findAgent(param);
        if (!agent) return { text: "Agent **" + param + "** not found." };
        const result = await startAgent(agent.id);
        await this.scan();
        return { text: result.success ? "Agent **" + agent.name + "** started." : "Failed to start: " + result.message, data: result };
      }

      case "stop_agent": {
        const agent = await this._findAgent(param);
        if (!agent) return { text: "Agent **" + param + "** not found." };
        const result = await stopAgent(agent.id);
        await this.scan();
        return { text: result.success ? "Agent **" + agent.name + "** stopped." : "Failed to stop: " + result.message, data: result };
      }

      case "restart_agent": {
        const agent = await this._findAgent(param);
        if (!agent) return { text: "Agent **" + param + "** not found." };
        const result = await restartAgent(agent.id);
        await this.scan();
        return { text: result.success ? "Agent **" + agent.name + "** restarted." : "Failed to restart: " + result.message, data: result };
      }

      case "assign_skill": {
        return { text: "Skill assignment via chat coming soon. Use the Skills panel in the dashboard for now." };
      }

      case "costs": {
        const costs = await query(
          "SELECT a.name, SUM(ce.cost_cents)::numeric AS cost FROM cost_events ce JOIN agents a ON a.id = ce.agent_id WHERE ce.created_at > NOW() - INTERVAL '30 days' GROUP BY a.name ORDER BY cost DESC"
        ).catch(() => []);
        if (costs.length === 0) return { text: "No cost data in the last 30 days." };
        const lines = costs.map(c => "- **" + c.name + "**: $" + (c.cost / 100).toFixed(2));
        return { text: "**30-Day Costs by Agent:**\n" + lines.join("\n"), data: costs };
      }

      case "tasks": {
        const tasks = this.cache.pendingTasks || [];
        if (tasks.length === 0) return { text: "No pending tasks." };
        const lines = tasks.map(t => "- [" + t.status + "] **" + t.title + "** (priority " + t.priority + ")");
        return { text: "**Pending Tasks:**\n" + lines.join("\n"), data: tasks };
      }

      case "suggest":
        return await this.suggest();

      case "help":
        return {
          text: "**KI-Organisator — What I can do:**\n" +
            "- **show agents** — List all agents\n" +
            "- **show companies** — List all companies\n" +
            "- **show skills** — List assigned skills\n" +
            "- **status** / **health** — System overview\n" +
            "- **create company [name]** — New company\n" +
            "- **create agent [name]** — New agent\n" +
            "- **start/stop/restart agent [name]** — Control agents\n" +
            "- **costs** — 30-day spending report\n" +
            "- **tasks** — Pending tasks\n" +
            "- **suggestions** — Proactive recommendations\n" +
            "- Or just chat — I'll do my best to help!"
        };

      default:
        return { text: "Unknown action: " + action };
    }
  }

  async suggest() {
    await this.scan();
    const suggestions = [];
    const agents = this.cache.agents || [];
    const companies = this.cache.companies || [];

    const errorAgents = agents.filter(a => a.status === "error");
    if (errorAgents.length > 0) {
      suggestions.push({
        type: "warning",
        title: "Agents in Error State",
        description: errorAgents.map(a => a.name).join(", ") + " — consider restarting them.",
        action: "restart_agents"
      });
    }

    const idleAgents = agents.filter(a => a.status === "idle" || !a.status);
    const pendingTasks = this.cache.pendingTasks || [];
    if (idleAgents.length > 0 && pendingTasks.length > 0) {
      suggestions.push({
        type: "info",
        title: "Idle Agents with Pending Tasks",
        description: idleAgents.length + " idle agents and " + pendingTasks.length + " pending tasks. Consider starting some agents.",
        action: "start_idle"
      });
    }

    const companyIds = new Set(agents.map(a => a.company_id));
    const emptyCompanies = companies.filter(c => !companyIds.has(c.id));
    if (emptyCompanies.length > 0) {
      suggestions.push({
        type: "info",
        title: "Companies Without Agents",
        description: emptyCompanies.map(c => c.name).join(", ") + " have no agents.",
        action: "create_agents"
      });
    }

    if (companies.length === 0) {
      suggestions.push({
        type: "info",
        title: "Getting Started",
        description: "Create your first company to start organizing agents.",
        action: "create_company"
      });
    }

    if (this.cache.totalCost30d > 5000) {
      suggestions.push({
        type: "warning",
        title: "High Spending",
        description: "$" + (this.cache.totalCost30d / 100).toFixed(2) + " spent in the last 30 days.",
        action: "review_costs"
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        type: "success",
        title: "All Good",
        description: "System is running smoothly. " + agents.length + " agents across " + companies.length + " companies.",
        action: null
      });
    }

    return { text: "**Suggestions:**\n" + suggestions.map(s => "- " + s.title + ": " + s.description).join("\n"), data: suggestions };
  }

  _buildContextualResponse(message) {
    const c = this.cache;
    return {
      text: "I'm the **KI-Organisator**, your AI CTO for BLUN. I manage " +
        (c.companies || []).length + " companies and " + (c.agents || []).length + " agents.\n\n" +
        "I didn't quite understand that. Try **help** to see what I can do, or just ask about your agents, companies, costs, or system status."
    };
  }

  async _findAgent(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    const byId = (this.cache.agents || []).find(a => a.id === name);
    if (byId) return byId;
    const byName = (this.cache.agents || []).find(a => a.name.toLowerCase() === lower);
    if (byName) return byName;
    return (this.cache.agents || []).find(a => a.name.toLowerCase().includes(lower));
  }

  getStatus() {
    return {
      companies: (this.cache.companies || []).length,
      agents: (this.cache.agents || []).length,
      activeAgents: (this.cache.agents || []).filter(a => a.status === "active").length,
      errorAgents: (this.cache.agents || []).filter(a => a.status === "error").length,
      runningProcesses: Object.keys(this.cache.processes || {}).length,
      pendingTasks: (this.cache.pendingTasks || []).length,
      totalCost30d: ((this.cache.totalCost30d || 0) / 100).toFixed(2),
      scannedAt: this.cache.scannedAt,
    };
  }
}

const instances = new Map();

async function getOrganisator(userId) {
  if (!instances.has(userId)) {
    const org = new Organisator();
    await org.init(userId);
    instances.set(userId, org);
  }
  return instances.get(userId);
}

module.exports = { Organisator, getOrganisator };
