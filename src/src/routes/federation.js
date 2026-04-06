// BLUN - AI Organisator | MIT License
// Federation routes

const express = require("express");
const router = express.Router();
const fed = require("../federation/engine");
const { authenticate, requireAuth, requireAdmin } = require("../middleware/auth");

// Public endpoint: receive messages from remote instances (no auth)
router.post("/receive", async function (req, res) {
  try {
    var { from_agent, to_agent, content, source_instance } = req.body;
    if (!from_agent || !to_agent || !content) {
      return res.status(400).json({ error: "Missing from_agent, to_agent, or content" });
    }
    var result = await fed.receiveMessage(source_instance || "unknown", from_agent, to_agent, content);
    res.json(result);
  } catch (err) {
    console.error("[federation] receive error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// All other routes require auth
router.use(authenticate);
router.use(requireAuth);

router.post("/peers", requireAdmin, async function (req, res) {
  try {
    var { name, url, api_key } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    var peer = await fed.addPeer(name, url, api_key);
    res.json(peer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/peers", async function (req, res) {
  try {
    res.json(await fed.listPeers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/peers/:id", requireAdmin, async function (req, res) {
  try {
    await fed.removePeer(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/peers/:id", requireAdmin, async function (req, res) {
  try {
    var peer = await fed.updatePeer(req.params.id, req.body);
    res.json(peer || { error: "Nothing to update" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/send", async function (req, res) {
  try {
    var { peer_id, from_agent, to_agent, content } = req.body;
    if (!peer_id || !from_agent || !to_agent || !content) {
      return res.status(400).json({ error: "Missing peer_id, from_agent, to_agent, or content" });
    }
    var result = await fed.sendMessage(peer_id, from_agent, to_agent, content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/messages", async function (req, res) {
  try {
    var limit = parseInt(req.query.limit) || 50;
    var offset = parseInt(req.query.offset) || 0;
    res.json(await fed.getMessages(limit, offset));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/heartbeat", requireAdmin, async function (req, res) {
  try {
    var results = await fed.heartbeat();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
