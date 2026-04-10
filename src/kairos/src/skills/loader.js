// BLUN - AI Organisator | MIT License
/**
 * Skill Loader — loads combined skills for an agent at runtime
 */

const { query } = require('../db');

async function loadSkillsForAgent(agentId) {
  var rows = await query(
    'SELECT s.* FROM skills s JOIN agent_skills a_s ON a_s.skill_id = s.id WHERE a_s.agent_id = $1 AND a_s.enabled = true ORDER BY s.name',
    [agentId]
  );

  if (rows.length === 0) {
    return { systemPrompt: '', tools: [], skills: [] };
  }

  var prompts = [];
  var allTools = [];
  var skillNames = [];

  for (var i = 0; i < rows.length; i++) {
    var skill = rows[i];
    skillNames.push(skill.name);

    if (skill.system_prompt) {
      prompts.push('## Skill: ' + skill.name + '\n' + skill.system_prompt);
    }

    var tools = skill.tools || [];
    for (var j = 0; j < tools.length; j++) {
      if (allTools.indexOf(tools[j]) === -1) {
        allTools.push(tools[j]);
      }
    }
  }

  return {
    systemPrompt: prompts.join('\n\n'),
    tools: allTools,
    skills: skillNames
  };
}

module.exports = { loadSkillsForAgent };
