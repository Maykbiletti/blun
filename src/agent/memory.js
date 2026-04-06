// BLUN - AI Organisator | MIT License

const { query, queryOne } = require("../db");

async function store(agentId, key, content) {
  await query(
    "INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()",
    [agentId, key, content]
  );
}

async function retrieve(agentId, key) {
  var row = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, key]);
  return row ? row.content : null;
}

async function list(agentId, includeContent) {
  var cols = includeContent ? "key, content, updated_at" : "key, updated_at";
  return query("SELECT " + cols + " FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [agentId]);
}

async function remove(agentId, key) {
  await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, key]);
}

async function search(agentId, searchTerm) {
  return query(
    "SELECT key, content, updated_at FROM agent_memory WHERE agent_id = $1 AND (key ILIKE $2 OR content ILIKE $2) ORDER BY updated_at DESC",
    [agentId, "%" + searchTerm + "%"]
  );
}

module.exports = { store, retrieve, list, remove, search };
