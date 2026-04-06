// BLUN - AI Organisator | MIT License
/**
 * Software Builder API Routes
 */

const { Router } = require("express");
const path = require("path");
const { query, queryOne } = require("../db");
const { authenticate, requireAuth } = require("../middleware/auth");
const engine = require("../software/engine");

var router = Router();

router.use(authenticate);

// List templates
router.get("/api/templates", function (req, res) {
  res.json(engine.getTemplates());
});

// List user projects
router.get("/api", requireAuth, async function (req, res) {
  try {
    var projects = await query(
      "SELECT * FROM software_projects WHERE user_id = $1 ORDER BY updated_at DESC",
      [req.user.id]
    );
    res.json(projects);
  } catch (err) {
    console.error("[software] list error:", err.message);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// Get project details
router.get("/api/:id", requireAuth, async function (req, res) {
  try {
    var project = await queryOne(
      "SELECT * FROM software_projects WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Include builds
    var builds = await query(
      "SELECT * FROM software_builds WHERE project_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );
    project.builds = builds;
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: "Failed to get project" });
  }
});

// Create project
router.post("/api/create", requireAuth, async function (req, res) {
  try {
    var { name, template, description, platforms, type } = req.body;
    if (!name || !template) {
      return res.status(400).json({ error: "name and template are required" });
    }

    var tpl = engine.getTemplateBySlug(template);
    if (!tpl) return res.status(400).json({ error: "Unknown template: " + template });

    var result = await queryOne(
      "INSERT INTO software_projects (user_id, name, template, description, platforms, type, status) VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING *",
      [req.user.id, name, template, description || "", JSON.stringify(platforms || tpl.platforms), type || tpl.type]
    );

    res.status(201).json(result);
  } catch (err) {
    console.error("[software] create error:", err.message);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// Update project
router.put("/api/:id", requireAuth, async function (req, res) {
  try {
    var project = await queryOne(
      "SELECT * FROM software_projects WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!project) return res.status(404).json({ error: "Project not found" });

    var { name, description, platforms, type } = req.body;
    var updated = await queryOne(
      "UPDATE software_projects SET name = COALESCE($1, name), description = COALESCE($2, description), platforms = COALESCE($3, platforms), type = COALESCE($4, type), updated_at = NOW() WHERE id = $5 RETURNING *",
      [name, description, platforms ? JSON.stringify(platforms) : null, type, req.params.id]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update project" });
  }
});

// Delete project
router.delete("/api/:id", requireAuth, async function (req, res) {
  try {
    var project = await queryOne(
      "SELECT * FROM software_projects WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!project) return res.status(404).json({ error: "Project not found" });

    await query("DELETE FROM software_builds WHERE project_id = $1", [req.params.id]);
    await query("DELETE FROM software_projects WHERE id = $1", [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// Generate code from description
router.post("/api/:id/generate", requireAuth, async function (req, res) {
  try {
    var project = await queryOne(
      "SELECT * FROM software_projects WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!project) return res.status(404).json({ error: "Project not found" });

    var files = engine.generateCode(project.template, project.name, project.description);
    if (!files) return res.status(400).json({ error: "Failed to generate code" });

    engine.writeProject(project.id, files);

    await queryOne(
      "UPDATE software_projects SET code_generated = true, files = $1, status = 'generated', updated_at = NOW() WHERE id = $2 RETURNING *",
      [JSON.stringify(files), project.id]
    );

    res.json({ files: Object.keys(files), content: files });
  } catch (err) {
    console.error("[software] generate error:", err.message);
    res.status(500).json({ error: "Failed to generate code" });
  }
});

// Build for platform
router.post("/api/:id/build", requireAuth, async function (req, res) {
  try {
    var project = await queryOne(
      "SELECT * FROM software_projects WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!project) return res.status(404).json({ error: "Project not found" });

    var { platform } = req.body;
    if (!platform) return res.status(400).json({ error: "platform is required" });

    // Create build record
    var build = await queryOne(
      "INSERT INTO software_builds (project_id, platform, status) VALUES ($1, $2, 'building') RETURNING *",
      [project.id, platform]
    );

    // Run build
    var result = await engine.buildProject(project.id, platform);

    if (result.success) {
      build = await queryOne(
        "UPDATE software_builds SET status = 'completed', artifact_path = $1, artifact_size = $2, completed_at = NOW() WHERE id = $3 RETURNING *",
        [result.artifact, result.size, build.id]
      );
      await queryOne("UPDATE software_projects SET status = 'built', updated_at = NOW() WHERE id = $1", [project.id]);
    } else {
      build = await queryOne(
        "UPDATE software_builds SET status = 'failed', error_log = $1, completed_at = NOW() WHERE id = $2 RETURNING *",
        [result.error, build.id]
      );
    }

    res.json(build);
  } catch (err) {
    console.error("[software] build error:", err.message);
    res.status(500).json({ error: "Failed to build project" });
  }
});

// Download artifact
router.get("/api/:id/download/:platform", requireAuth, async function (req, res) {
  try {
    var project = await queryOne(
      "SELECT * FROM software_projects WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!project) return res.status(404).json({ error: "Project not found" });

    var artifactPath = engine.getArtifactPath(project.id, req.params.platform);
    if (!artifactPath) return res.status(404).json({ error: "No build artifact for this platform" });

    res.download(artifactPath);
  } catch (err) {
    res.status(500).json({ error: "Failed to download" });
  }
});

// Code signing (placeholder)
router.post("/api/:id/sign", requireAuth, async function (req, res) {
  res.json({ status: "pending", message: "Code signing will be available in a future update" });
});

// Publish to store (placeholder)
router.post("/api/:id/publish", requireAuth, async function (req, res) {
  res.json({ status: "pending", message: "Store publishing will be available in a future update" });
});

module.exports = router;
