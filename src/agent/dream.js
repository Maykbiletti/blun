// BLUN Agent System — Dream Cycle (Memory Consolidation)
const { query, queryOne } = require("../db");

var _callLLM = null;
var _saveAgentMemory = null;
function setDeps(deps) {
  _callLLM = deps.callLLM;
  _saveAgentMemory = deps.saveAgentMemory;
}

var dreamIntervals = {};

async function dreamCycle(agentId) {
  try {
    var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
    if (!agent || agent.status === 'idle') return;

    var memories = await query("SELECT key, content, updated_at FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [agentId]);
    if (memories.length < 5) return; // not enough to consolidate

    // Find old daily logs (zuletzt_*) older than 3 days
    var now = Date.now();
    var threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    var oldDailyKeys = [];
    for (var i = 0; i < memories.length; i++) {
      if (memories[i].key.startsWith('zuletzt_') && memories[i].updated_at) {
        var age = now - new Date(memories[i].updated_at).getTime();
        if (age > threeDaysMs) oldDailyKeys.push(memories[i]);
      }
    }

    // Consolidate old daily logs into a summary
    if (oldDailyKeys.length >= 3) {
      var summaryParts = oldDailyKeys.map(function(m) { return m.key + ': ' + m.content.substring(0,150); });
      var nl = String.fromCharCode(10); var dreamPrompt = 'Fasse diese ' + oldDailyKeys.length + ' Tageseintraege in EINEM kurzen Absatz zusammen (max 200 Woerter). Nur die wichtigsten Fakten und Entscheidungen:' + nl + nl + summaryParts.join(nl);

      var dreamResult = await _callLLM(agent.model || 'claude-haiku-4-5-20251001', [
        { role: 'user', content: dreamPrompt }
      ], agentId);

      if (dreamResult && dreamResult.content) {
        var weekKey = 'woche_' + new Date().toISOString().substring(0,10);
        await _saveAgentMemory(agentId, weekKey, dreamResult.content.substring(0,500));

        // Delete old daily entries
        for (var j = 0; j < oldDailyKeys.length; j++) {
          await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, oldDailyKeys[j].key]);
        }
        console.log('[dream] ' + agent.name + ': consolidated ' + oldDailyKeys.length + ' daily logs into ' + weekKey);
      }
    }

    // Remove duplicate memories (same content, different keys)
    var seen = {};
    var dupes = [];
    for (var k = 0; k < memories.length; k++) {
      var hash = memories[k].content.substring(0,100).toLowerCase().trim();
      if (seen[hash]) {
        dupes.push(memories[k].key);
      } else {
        seen[hash] = true;
      }
    }
    if (dupes.length > 0) {
      for (var d = 0; d < dupes.length; d++) {
        await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, dupes[d]]);
      }
      console.log('[dream] ' + agent.name + ': removed ' + dupes.length + ' duplicate memories');
    }

  } catch(err) {
    console.error('[dream] ' + agentId + ' error:', err.message);
  }
}

function startDreamCycle(agentId) {
  if (dreamIntervals[agentId]) return;
  // Run every 6 hours
  dreamIntervals[agentId] = setInterval(function() { dreamCycle(agentId); }, 6 * 60 * 60 * 1000);
  // First dream after 30 minutes
  setTimeout(function() { dreamCycle(agentId); }, 30 * 60 * 1000);
}

function stopDreamCycle(agentId) {
  if (dreamIntervals[agentId]) {
    clearInterval(dreamIntervals[agentId]);
    delete dreamIntervals[agentId];
  }
}

module.exports = { dreamCycle, startDreamCycle, stopDreamCycle, setDeps };
