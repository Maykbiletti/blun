// BLUN Agent System — Agent Memory Module (extracted from agent-engine.js)
const { query, queryOne } = require("../db");

async function store(agentId, key, content, tags, category) {
  var tagArr = tags && tags.length ? tags : null;
  await query(
    "INSERT INTO agent_memory (agent_id, key, content, tags, category) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (agent_id, key) DO UPDATE SET content = EXCLUDED.content, tags = COALESCE($4, agent_memory.tags), category = COALESCE($5, agent_memory.category), updated_at = NOW()",
    [agentId, key, content, tagArr, category || null]
  );
}

async function retrieve(agentId, key) {
  var row = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, key]);
  return row ? row.content : null;
}

async function list(agentId, includeContent) {
  var cols = includeContent ? "key, content, layer, tags, category, updated_at" : "key, layer, updated_at";
  return query("SELECT " + cols + " FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [agentId]);
}

async function remove(agentId, key) {
  await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, key]);
}

async function search(agentId, searchTerm) {
  return query(
    "SELECT key, content, layer, tags, updated_at FROM agent_memory WHERE agent_id = $1 AND (key ILIKE $2 OR content ILIKE $2) ORDER BY updated_at DESC LIMIT 20",
    [agentId, "%" + searchTerm + "%"]
  );
}

async function searchByTag(agentId, tag) {
  return query(
    "SELECT key, content, layer, tags, updated_at FROM agent_memory WHERE agent_id = $1 AND $2 = ANY(tags) ORDER BY updated_at DESC LIMIT 20",
    [agentId, tag]
  );
}

async function loadLayered(agentId, taskText, budget) {
  // L0 + L1 always loaded, L2 keyword-matched
  budget = budget || 8000;
  var result = "";
  var used = 0;

  // L0 Identity (always)
  var l0 = await query("SELECT key, content FROM agent_memory WHERE agent_id = $1 AND layer = 'L0' ORDER BY key", [agentId]);
  for (var i = 0; i < l0.length && used < budget * 0.3; i++) {
    var chunk = l0[i].key + ": " + (l0[i].content || "").substring(0, 1500) + "\n";
    result += chunk; used += chunk.length;
  }

  // L1 Essential rules + skills (always)
  var l1 = await query("SELECT key, content FROM agent_memory WHERE agent_id = $1 AND layer = 'L1' ORDER BY key", [agentId]);
  for (var j = 0; j < l1.length && used < budget * 0.7; j++) {
    var chunk2 = l1[j].key + ": " + (l1[j].content || "").substring(0, 3000) + "\n";
    result += chunk2; used += chunk2.length;
  }

  // L2 Project (keyword-matched from task)
  if (taskText && used < budget) {
    var keywords = (taskText || "").toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; }).slice(0, 5);
    if (keywords.length) {
      var likeClause = keywords.map(function(k, idx) { return "LOWER(content) LIKE $" + (idx + 3); }).join(" OR ");
      var params = [agentId, "L2"].concat(keywords.map(function(k) { return "%" + k + "%"; }));
      var l2 = await query("SELECT key, content FROM agent_memory WHERE agent_id = $1 AND layer = $2 AND (" + likeClause + ") ORDER BY updated_at DESC LIMIT 5", params);
      for (var k = 0; k < l2.length && used < budget; k++) {
        var chunk3 = l2[k].key + ": " + (l2[k].content || "").substring(0, 2000) + "\n";
        result += chunk3; used += chunk3.length;
      }
    }
  }

  return result;
}

module.exports = { store, retrieve, list, remove, search, searchByTag, loadLayered };
