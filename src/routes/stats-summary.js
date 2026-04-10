var express = require("express");
var router = express.Router();
var db = require("../db");

// GET /api/stats/summary — aggregated platform stats
router.get("/", async function(req, res) {
  try {
    var totalUsers = await db.queryOne(
      "SELECT COUNT(*) as count FROM companies"
    );
    var totalTasks = await db.queryOne(
      "SELECT COUNT(*) as count FROM tasks"
    );
    var completedTasks = await db.queryOne(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'done'"
    );
    var activeAgents = await db.queryOne(
      "SELECT COUNT(*) as count FROM agents WHERE status = 'active'"
    );

    res.json({
      total_users: parseInt(totalUsers.count, 10) || 0,
      total_tasks: parseInt(totalTasks.count, 10) || 0,
      completed_tasks: parseInt(completedTasks.count, 10) || 0,
      active_agents: parseInt(activeAgents.count, 10) || 0
    });
  } catch(err) {
    console.error("[stats-summary] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats", details: err.message });
  }
});

module.exports = router;
