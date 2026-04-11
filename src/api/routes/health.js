const { Router } = require("express");
const { query } = require("../../db");

const router = Router();
const startTime = Date.now();

async function fetchHealthFromBlunTables() {
  const agentsSql = `
    SELECT COUNT(*) AS count
    FROM blun_agents
    WHERE status = 'active'
  `;

  const pendingTasksSql = `
    SELECT COUNT(*) AS count
    FROM agent_tasks
    WHERE status = 'pending'
  `;

  const processingTasksSql = `
    SELECT COUNT(*) AS count
    FROM agent_tasks
    WHERE status = 'processing'
  `;

  const agentsResult = await query(agentsSql);
  const pendingResult = await query(pendingTasksSql);
  const processingResult = await query(processingTasksSql);

  return {
    agents_online: parseInt(agentsResult[0]?.count || 0, 10),
    pending_tasks: parseInt(pendingResult[0]?.count || 0, 10),
    processing_tasks: parseInt(processingResult[0]?.count || 0, 10)
  };
}

async function fetchHealthFromCoreTables() {
  const agentsSql = `
    SELECT COUNT(*) AS count
    FROM agents
    WHERE status = 'active'
  `;

  const pendingTasksSql = `
    SELECT COUNT(*) AS count
    FROM tasks
    WHERE status = 'pending'
  `;

  const processingTasksSql = `
    SELECT COUNT(*) AS count
    FROM tasks
    WHERE status = 'processing'
  `;

  const agentsResult = await query(agentsSql);
  const pendingResult = await query(pendingTasksSql);
  const processingResult = await query(processingTasksSql);

  return {
    agents_online: parseInt(agentsResult[0]?.count || 0, 10),
    pending_tasks: parseInt(pendingResult[0]?.count || 0, 10),
    processing_tasks: parseInt(processingResult[0]?.count || 0, 10)
  };
}

async function loadHealth() {
  try {
    return await fetchHealthFromBlunTables();
  } catch (err) {
    const message = String(err && err.message ? err.message : "").toLowerCase();
    const missingBlunTable =
      message.includes("relation \"blun_agents\"") ||
      message.includes("relation \"agent_tasks\"");

    if (!missingBlunTable) {
      throw err;
    }

    return fetchHealthFromCoreTables();
  }
}

router.get("/", async function getHealth(req, res) {
  try {
    const health = await loadHealth();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    res.json({
      status: "up",
      uptime: uptime,
      agents_online: health.agents_online,
      pending_tasks: health.pending_tasks,
      processing_tasks: health.processing_tasks
    });
  } catch (err) {
    console.error("[health] GET /api/health failed:", err.message);
    res.status(503).json({
      status: "down",
      error: "Health check failed"
    });
  }
});

module.exports = router;
