// BLUN — Tool Registry API
var express = require("express");
var router = express.Router();
var { executeTool, listTools } = require("../agent/tools");

// GET /api/tools — list all registered tools
router.get("/", function(req, res) {
  res.json({ ok: true, tools: listTools() });
});

// POST /api/tools/execute — execute a tool for an agent
router.post("/execute", async function(req, res) {
  try {
    var { agentId, toolName, params } = req.body;
    if (!toolName) return res.status(400).json({ ok: false, error: "toolName required" });
    var result = await executeTool(agentId || 0, toolName, params || {});
    res.json({ ok: result.success, ...result });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/tools/executions/:agentId — get tool execution history
router.get("/executions/:agentId", async function(req, res) {
  try {
    var { pool } = require("../../src/db");
    var rows = await pool.query("SELECT * FROM tool_executions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50", [req.params.agentId]);
    res.json({ ok: true, executions: rows.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
