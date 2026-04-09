// BLUN Agent System — Skills Loader + Registry
const { query } = require("../db");

var skillCache = new Map();

async function loadSkills(agentId) {
  var cached = skillCache.get(agentId);
  if (cached && Date.now() - cached.ts < 300000) return cached.skills; // 5min cache

  var skills = await query(
    "SELECT s.id, s.name, s.code, s.description, s.category FROM skills s JOIN agent_skills as2 ON as2.skill_id = s.id WHERE as2.agent_id = $1 AND s.safe = true ORDER BY s.category, s.name",
    [agentId]
  );

  skillCache.set(agentId, { skills: skills, ts: Date.now() });
  return skills;
}

function formatSkillsForPrompt(skills, maxChars) {
  maxChars = maxChars || 5000;
  if (!skills || !skills.length) return "";

  var result = "\n\n=== DEINE SKILLS (AKTIV NUTZEN!) ===\n";
  result += "Du MUSST diese Skills bei jeder Aufgabe aktiv anwenden.\n\n";
  var used = result.length;

  for (var i = 0; i < skills.length && used < maxChars; i++) {
    var sk = skills[i];
    var content = (sk.code || sk.description || "").substring(0, 3000);
    var entry = "### SKILL: " + sk.name + "\n" + content + "\n\n";
    result += entry;
    used += entry.length;
  }

  return result;
}

async function assignSkillsByDepartment(agentId, department) {
  var deptKeywords = {
    "Frontend & Design": ["css", "html", "javascript", "responsive", "ui", "ux"],
    "Backend & Coding": ["node", "express", "api", "database", "sql"],
    "Infrastruktur & DevOps": ["deploy", "docker", "nginx", "server", "monitoring"],
    "Qualitaetskontrolle": ["test", "qa", "review", "security", "audit"],
    "Marketing & Content": ["seo", "content", "social", "marketing", "analytics"],
    "Management": ["planning", "review", "architecture", "strategy"]
  };

  var keywords = deptKeywords[department] || [];
  if (!keywords.length) return [];

  var likeClause = keywords.map(function(k, i) { return "LOWER(s.name) LIKE $" + (i + 1) + " OR LOWER(s.category) LIKE $" + (i + 1); }).join(" OR ");
  var params = keywords.map(function(k) { return "%" + k + "%"; });

  var matching = await query("SELECT s.id FROM skills s WHERE (" + likeClause + ") AND s.safe = true", params);
  var assigned = 0;
  for (var i = 0; i < matching.length; i++) {
    try {
      await query("INSERT INTO agent_skills (agent_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [agentId, matching[i].id]);
      assigned++;
    } catch(e) {}
  }
  return assigned;
}

function clearCache(agentId) {
  if (agentId) skillCache.delete(agentId);
  else skillCache.clear();
}

module.exports = { loadSkills, formatSkillsForPrompt, assignSkillsByDepartment, clearCache };
