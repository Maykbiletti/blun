// BLUN - AI Organisator | MIT License
/**
 * KI-Organisator Routes — Chat interface and system management endpoints.
 */

const { Router } = require("express");
const { getOrganisator } = require("../organisator/engine");
const { query } = require("../db");
const { authenticate, requireAuth } = require("../middleware/auth");

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// POST /organisator/chat — Send message to the Organisator
router.post("/chat", async function (req, res) {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    const org = await getOrganisator(req.user.id);
    const response = await org.chat(message);
    res.json(response);
  } catch (err) {
    console.error("[organisator] Chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /organisator/status — Current system overview
router.get("/status", async function (req, res) {
  try {
    const org = await getOrganisator(req.user.id);
    res.json(org.getStatus());
  } catch (err) {
    console.error("[organisator] Status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /organisator/suggestions — Proactive suggestions
router.get("/suggestions", async function (req, res) {
  try {
    const org = await getOrganisator(req.user.id);
    const result = await org.suggest();
    res.json(result);
  } catch (err) {
    console.error("[organisator] Suggestions error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /organisator/logs — Action history
router.get("/logs", async function (req, res) {
  try {
    const limit = parseInt(req.query.limit || "50");
    const logs = await query(
      "SELECT * FROM organisator_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [req.user.id, limit]
    );
    res.json(logs);
  } catch (err) {
    console.error("[organisator] Logs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /organisator/scan — Trigger full system scan
router.post("/scan", async function (req, res) {
  try {
    const org = await getOrganisator(req.user.id);
    const result = await org.scan();
    res.json({
      companies: result.companies.length,
      agents: result.agents.length,
      skills: result.skills.length,
      pendingTasks: result.pendingTasks.length,
      scannedAt: result.scannedAt,
    });
  } catch (err) {
    console.error("[organisator] Scan error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
