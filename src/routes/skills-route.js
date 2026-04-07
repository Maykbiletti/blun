// Skills + Livelog routes
module.exports = function(router, query, queryOne) {

  // All agents' skills (for list view)
  router.get("/skills/all-agents", async function(req, res) {
    try {
      var rows = await query("SELECT as2.agent_id, s.name FROM agent_skills as2 JOIN skills s ON s.id = as2.skill_id ORDER BY as2.agent_id");
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // === SKILLS CATALOG ===
  router.post("/skills", async function(req, res) {
    try {
      var { name, description, prompt } = req.body;
      if(!name) return res.status(400).json({error:'name required'});
      var existing = await queryOne("SELECT id FROM skills WHERE name=$1", [name]);
      if(existing) return res.json({id:existing.id, name:name, exists:true});
      var r = await queryOne("INSERT INTO skills (name, description, prompt) VALUES ($1,$2,$3) RETURNING id, name", [name, description||'', prompt||'']);
      res.json(r);
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  router.get("/skills", async function(req, res) {
    try {
      var skills = await query("SELECT * FROM skills WHERE safe = true ORDER BY category, name");
      res.json(skills);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Agent's installed skills
  router.get("/agents/:id/skills", async function(req, res) {
    try {
      var skills = await query(
        "SELECT s.*, as2.installed_at, as2.installed_by FROM agent_skills as2 JOIN skills s ON s.id = as2.skill_id WHERE as2.agent_id = $1 ORDER BY as2.installed_at DESC",
        [req.params.id]
      );
      res.json(skills);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Install skill for agent
  router.post("/agents/:id/skills/:skillId", async function(req, res) {
    try {
      var skill = await queryOne("SELECT * FROM skills WHERE id = $1 AND safe = true", [req.params.skillId]);
      if (!skill) return res.status(404).json({ error: "Skill nicht gefunden oder nicht sicher" });
      await query(
        "INSERT INTO agent_skills (agent_id, skill_id, installed_by) VALUES ($1, $2, $3) ON CONFLICT (agent_id, skill_id) DO NOTHING",
        [req.params.id, req.params.skillId, req.body.by || "manual"]
      );
      res.json({ ok: true, skill: skill.name });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Uninstall skill
  router.delete("/agents/:id/skills/:skillId", async function(req, res) {
    try {
      await query("DELETE FROM agent_skills WHERE agent_id = $1 AND skill_id = $2", [req.params.id, req.params.skillId]);
      res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Auto-install: agent picks skills based on role
  router.post("/agents/:id/skills/auto", async function(req, res) {
    try {
      var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [req.params.id]);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      var role = (agent.role || "").toLowerCase();
      var dept = (agent.department || "").toLowerCase();
      var allSkills = await query("SELECT * FROM skills WHERE safe = true");
      var installed = [];
      allSkills.forEach(function(s) {
        var match = false;
        var cat = s.category.toLowerCase();
        // Match by role/department keywords
        if ((role + dept).match(/marketing|seo|social/) && cat.match(/marketing|kommunikation/)) match = true;
        if ((role + dept).match(/backend|frontend|coding|dev/) && cat.match(/coding/)) match = true;
        if ((role + dept).match(/qa|test/) && cat.match(/qa/)) match = true;
        if ((role + dept).match(/business|sales/) && cat.match(/business/)) match = true;
        if ((role + dept).match(/video|medien|design/) && cat.match(/medien|kreativ/)) match = true;
        if ((role + dept).match(/infra|devops|server/) && cat.match(/coding/)) match = true;
        // Everyone gets basic skills
        if (s.name === "text_summary" || s.name === "translate" || s.name === "brainstorm") match = true;
        if (match) installed.push(s);
      });
      for (var i = 0; i < installed.length; i++) {
        await query(
          "INSERT INTO agent_skills (agent_id, skill_id, installed_by) VALUES ($1, $2, 'auto') ON CONFLICT (agent_id, skill_id) DO NOTHING",
          [req.params.id, installed[i].id]
        );
      }
      res.json({ ok: true, installed: installed.map(function(s) { return s.name; }) });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // === LIVELOG ===
  router.get("/livelog", async function(req, res) {
    try {
      var limit = parseInt(req.query.limit) || 50;
      var logs = await query(
        "SELECT 'heartbeat' as type, h.agent_id, a.name as agent_name, h.status, h.tokens_used, h.cost, '' as content, h.created_at " +
        "FROM agent_heartbeats h JOIN blun_agents a ON a.id = h.agent_id " +
        "WHERE h.created_at > NOW() - INTERVAL '2 hours' " +
        "UNION ALL " +
        "SELECT 'chat' as type, c.agent_id, a.name as agent_name, c.role as status, 0 as tokens_used, 0 as cost, substring(c.content, 1, 200) as content, c.created_at " +
        "FROM agent_conversations c JOIN blun_agents a ON a.id = c.agent_id " +
        "WHERE c.created_at > NOW() - INTERVAL '2 hours' " +
        "UNION ALL " +
        "SELECT 'task' as type, t.agent_id, a.name as agent_name, t.status, 0 as tokens_used, 0 as cost, substring(t.task, 1, 200) as content, t.created_at " +
        "FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id " +
        "WHERE t.created_at > NOW() - INTERVAL '2 hours' " +
        "ORDER BY created_at DESC LIMIT $1",
        [limit]
      );
      res.json(logs);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
};
