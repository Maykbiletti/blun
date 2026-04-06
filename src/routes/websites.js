// BLUN - AI Organisator | MIT License
/**
 * Website Builder API Routes
 */

const { Router } = require("express");
const { query, queryOne } = require("../db");
const { authenticate, requireAuth } = require("../middleware/auth");
const engine = require("../websites/engine");

var router = Router();

router.use(authenticate);

// List available templates
router.get("/api/templates", function (req, res) {
  res.json(engine.getTemplates());
});

// List user websites
router.get("/api", requireAuth, async function (req, res) {
  try {
    var sites = await query(
      "SELECT * FROM websites WHERE user_id = $1 ORDER BY updated_at DESC",
      [req.user.id]
    );
    res.json(sites);
  } catch (err) {
    console.error("[websites] list error:", err.message);
    res.status(500).json({ error: "Failed to list websites" });
  }
});

// Get website details
router.get("/api/:id", requireAuth, async function (req, res) {
  try {
    var site = await queryOne(
      "SELECT * FROM websites WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!site) return res.status(404).json({ error: "Website not found" });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: "Failed to get website" });
  }
});

// Create website
router.post("/api/create", requireAuth, async function (req, res) {
  try {
    var { name, template, description } = req.body;
    if (!name || !template) {
      return res.status(400).json({ error: "name and template are required" });
    }

    var tpl = engine.getTemplateBySlug(template);
    if (!tpl) return res.status(400).json({ error: "Unknown template: " + template });

    var content = await engine.generateContent(template, name, description || "");

    var result = await queryOne(
      "INSERT INTO websites (user_id, name, template, description, content, status) VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING *",
      [req.user.id, name, template, description || "", JSON.stringify(content)]
    );

    res.status(201).json(result);
  } catch (err) {
    console.error("[websites] create error:", err.message);
    res.status(500).json({ error: "Failed to create website" });
  }
});

// Update website
router.put("/api/:id", requireAuth, async function (req, res) {
  try {
    var site = await queryOne(
      "SELECT * FROM websites WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!site) return res.status(404).json({ error: "Website not found" });

    var { name, content, description, settings } = req.body;
    var result = await queryOne(
      "UPDATE websites SET name = COALESCE($1, name), content = COALESCE($2, content), description = COALESCE($3, description), settings = COALESCE($4, settings), updated_at = NOW() WHERE id = $5 AND user_id = $6 RETURNING *",
      [
        name || null,
        content ? JSON.stringify(content) : null,
        description || null,
        settings ? JSON.stringify(settings) : null,
        req.params.id,
        req.user.id
      ]
    );
    res.json(result);
  } catch (err) {
    console.error("[websites] update error:", err.message);
    res.status(500).json({ error: "Failed to update website" });
  }
});

// Delete website
router.delete("/api/:id", requireAuth, async function (req, res) {
  try {
    var site = await queryOne(
      "SELECT * FROM websites WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!site) return res.status(404).json({ error: "Website not found" });

    await engine.unpublish(site.id);
    await query("DELETE FROM websites WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[websites] delete error:", err.message);
    res.status(500).json({ error: "Failed to delete website" });
  }
});

// Publish website
router.post("/api/:id/publish", requireAuth, async function (req, res) {
  try {
    var site = await queryOne(
      "SELECT * FROM websites WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!site) return res.status(404).json({ error: "Website not found" });

    var url = await engine.publish(site);

    await query(
      "UPDATE websites SET status = 'published', published_url = $1, published_at = NOW(), updated_at = NOW() WHERE id = $2",
      [url, site.id]
    );

    res.json({ ok: true, url: url });
  } catch (err) {
    console.error("[websites] publish error:", err.message);
    res.status(500).json({ error: "Failed to publish website" });
  }
});

// Connect custom domain
router.post("/api/:id/domain", requireAuth, async function (req, res) {
  try {
    var { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "domain is required" });

    var site = await queryOne(
      "SELECT * FROM websites WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!site) return res.status(404).json({ error: "Website not found" });

    await engine.configureDomain(site.id, domain);

    await query(
      "UPDATE websites SET custom_domain = $1, updated_at = NOW() WHERE id = $2",
      [domain, site.id]
    );

    res.json({ ok: true, domain: domain, dns_instructions: {
      type: "A", name: "@", value: "46.225.233.195", ttl: 300,
      note: "Point your domain A record to 46.225.233.195, then SSL will be provisioned automatically."
    }});
  } catch (err) {
    console.error("[websites] domain error:", err.message);
    res.status(500).json({ error: "Failed to configure domain" });
  }
});

// Preview (render without publishing)
router.get("/api/:id/preview", requireAuth, async function (req, res) {
  try {
    var site = await queryOne(
      "SELECT * FROM websites WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!site) return res.status(404).json({ error: "Website not found" });

    var html = engine.renderSite(site);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("[websites] preview error:", err.message);
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

module.exports = router;
