// BLUN Agent System — Memory Layer System + Noise Filter
const { query, queryOne } = require("../db");

async function saveLayeredMemory(agentId, key, value, layer, tags, category) {
  layer = layer || 'L2';
  var tagArr = tags || [];
  var cat = category || 'general';
  if (typeof tagArr === 'string') tagArr = tagArr.split(',').map(function(t){return t.trim();});
  await query(
    "INSERT INTO agent_memory (agent_id, key, content, layer, tags, category, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, layer = $4, tags = $5, category = $6, updated_at = NOW()",
    [agentId, key, value, layer, tagArr, cat]
  );
}

async function loadLayeredMemory(agentId, maxChars) {
  maxChars = maxChars || 8000;
  var l0 = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1 AND layer = 'L0' ORDER BY updated_at DESC", [agentId]);
  var l1 = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1 AND layer = 'L1' ORDER BY updated_at DESC", [agentId]);
  var l2 = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1 AND layer = 'L2' ORDER BY updated_at DESC", [agentId]);
  var selected = [];
  var totalChars = 0;
  for (var i = 0; i < l0.length; i++) {
    if (totalChars + l0[i].value.length < maxChars) {
      selected.push({layer: 'L0', key: l0[i].key, value: l0[i].value});
      totalChars += l0[i].value.length;
    }
  }
  for (var i = 0; i < l1.length; i++) {
    if (totalChars + l1[i].value.length < maxChars) {
      selected.push({layer: 'L1', key: l1[i].key, value: l1[i].value});
      totalChars += l1[i].value.length;
    }
  }
  for (var i = 0; i < l2.length; i++) {
    if (totalChars >= maxChars) break;
    if (totalChars + l2[i].value.length < maxChars) {
      selected.push({layer: 'L2', key: l2[i].key, value: l2[i].value});
      totalChars += l2[i].value.length;
    }
  }
  return selected;
}

async function promoteMemory(agentId, key) {
  var mem = await queryOne("SELECT * FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, key]);
  if (mem && mem.layer === 'L2') {
    await query("UPDATE agent_memory SET layer = 'L1' WHERE agent_id = $1 AND key = $2", [agentId, key]);
    return true;
  }
  return false;
}

// === NOISE FILTER for auto-extracted memories ===
function filterNoiseFromDecisions(decisions) {
  if (!decisions || !decisions.length) return [];
  var noise = [
    /^(ok|done|yes|ja|passt|alles klar)/i,
    /^(I will|I can|Let me|Ich werde)/i,
    /^(analysing|analyzing|checking|looking)/i,
    /\b(todo|fixme|hack)\b/i,
    /^.{0,15}$/
  ];
  var seen = {};
  return decisions.filter(function(d) {
    for (var n = 0; n < noise.length; n++) {
      if (noise[n].test(d)) return false;
    }
    var sig = d.substring(0, 40).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen[sig]) return false;
    seen[sig] = true;
    return true;
  });
}


module.exports = { saveLayeredMemory, loadLayeredMemory, promoteMemory, filterNoiseFromDecisions };
