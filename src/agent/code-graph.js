// BLUN Agent System — Code Graph
const { query, queryOne } = require("../db");
var fs = require("fs");

async function indexFileToGraph(filePath, content) {
  var imports = [];
  var reqMatches = content.match(/require\(["']([^"']+)["']\)/g) || [];
  for (var i = 0; i < reqMatches.length; i++) {
    var m = reqMatches[i].match(/require\(["']([^"']+)["']\)/);
    if (m) imports.push(m[1]);
  }
  var symbols = [];
  var funcMatches = content.match(/(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g) || [];
  for (var i = 0; i < funcMatches.length; i++) {
    var m = funcMatches[i].match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (m) symbols.push({name: m[1], type: 'function'});
  }
  for (var s = 0; s < symbols.length; s++) {
    await query(
      "INSERT INTO code_graph (file_path, symbol_name, symbol_type, imports, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING",
      [filePath, symbols[s].name, symbols[s].type, imports]
    );
  }
  return {file: filePath, symbols: symbols.length, imports: imports.length};
}

async function findRelatedFiles(filePath) {
  var rows = await query(
    "SELECT DISTINCT file_path FROM code_graph WHERE $1 = ANY(imports) OR file_path = $1",
    [filePath]
  );
  return rows.map(function(r) { return r.file_path; });
}

async function suggestAgentForFile(filePath) {
  var mapping = {
    'dashboard': 'Frontend & Design',
    'routes': 'Backend & Coding',
    'agent-engine': 'Agent System',
    'server.js': 'Infrastruktur & DevOps',
    'billing': 'Business & Billing',
    '.css': 'Frontend & Design',
    '.html': 'Frontend & Design'
  };
  var dept = null;
  var keys = Object.keys(mapping);
  for (var i = 0; i < keys.length; i++) {
    if (filePath.indexOf(keys[i]) !== -1) { dept = mapping[keys[i]]; break; }
  }
  if (!dept) return null;
  var agent = await queryOne("SELECT id, name FROM blun_agents WHERE department = $1 AND status = 'active' ORDER BY RANDOM() LIMIT 1", [dept]);
  return agent;
}


module.exports = { indexFileToGraph, findRelatedFiles, suggestAgentForFile };
