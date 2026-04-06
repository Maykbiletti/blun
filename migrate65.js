require("dotenv").config();
const {query} = require("./src/db");
async function migrate() {
  await query("CREATE TABLE IF NOT EXISTS companies (id SERIAL PRIMARY KEY, name TEXT NOT NULL, config JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())");
  await query("CREATE TABLE IF NOT EXISTS blun_agents (id SERIAL PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT 'assistant', model TEXT DEFAULT 'tinyllama-1.1b', system_prompt TEXT DEFAULT '', personality TEXT DEFAULT '', heartbeat_interval INT DEFAULT 60, company_id INT REFERENCES companies(id), status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())");
  await query("CREATE TABLE IF NOT EXISTS agent_tasks (id SERIAL PRIMARY KEY, agent_id INT REFERENCES blun_agents(id) ON DELETE CASCADE, task TEXT NOT NULL, status TEXT DEFAULT 'pending', result TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)");
  await query("CREATE TABLE IF NOT EXISTS agent_memory (id SERIAL PRIMARY KEY, agent_id INT REFERENCES blun_agents(id) ON DELETE CASCADE, key TEXT NOT NULL, content TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(agent_id, key))");
  await query("CREATE TABLE IF NOT EXISTS agent_conversations (id SERIAL PRIMARY KEY, agent_id INT REFERENCES blun_agents(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())");
  await query("CREATE TABLE IF NOT EXISTS agent_heartbeats (id SERIAL PRIMARY KEY, agent_id INT, status TEXT, cost NUMERIC DEFAULT 0, tokens_used INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())");
  await query("CREATE TABLE IF NOT EXISTS agent_university (id SERIAL PRIMARY KEY, agent_id INT REFERENCES blun_agents(id) ON DELETE CASCADE, course_name TEXT NOT NULL, status TEXT DEFAULT 'enrolled', started_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)");
  await query("CREATE TABLE IF NOT EXISTS agent_marketplace (id SERIAL PRIMARY KEY, agent_id INT REFERENCES blun_agents(id), status TEXT DEFAULT 'draft', clone_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())");
  await query("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT DEFAULT 'user', plan TEXT DEFAULT 'free', avatar TEXT, created_at TIMESTAMPTZ DEFAULT NOW())");
  console.log("MIGRATIONS_OK");
  process.exit(0);
}
migrate().catch(e => { console.error(e.message); process.exit(1); });
