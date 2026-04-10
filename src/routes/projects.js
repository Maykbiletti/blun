// Project Manager Routes — isolated customer projects under /root/blun/projects/{slug}
const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const router = express.Router();

const PROJECTS_ROOT = path.resolve(__dirname, "../../projects");
if (!fs.existsSync(PROJECTS_ROOT)) fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

function slugify(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function safeProjectPath(slug) {
  const safe = slugify(slug);
  if (!safe) return null;
  const full = path.join(PROJECTS_ROOT, safe);
  if (!full.startsWith(PROJECTS_ROOT + path.sep) && full !== PROJECTS_ROOT) return null;
  return full;
}

function safeFilePath(projectDir, rel) {
  const norm = path.normalize(rel || "").replace(/^[\\/]+/, "");
  const full = path.join(projectDir, norm);
  if (!full.startsWith(projectDir + path.sep) && full !== projectDir) return null;
  return full;
}

function buildTree(dir, base) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    if (e.isDirectory()) {
      out.push({ type: "dir", name: e.name, path: rel, children: buildTree(full, base) });
    } else {
      let size = 0;
      try { size = fs.statSync(full).size; } catch (e2) {}
      out.push({ type: "file", name: e.name, path: rel, size });
    }
  }
  return out;
}

// GET /api/projects — list all projects
router.get("/", function (req, res) {
  try {
    const items = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith("."))
      .map(d => {
        const full = path.join(PROJECTS_ROOT, d.name);
        let meta = {};
        const metaFile = path.join(full, ".blun-project.json");
        if (fs.existsSync(metaFile)) {
          try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch (e) {}
        }
        let fileCount = 0;
        try {
          const walk = (p) => {
            for (const e of fs.readdirSync(p, { withFileTypes: true })) {
              if (e.name.startsWith(".")) continue;
              const fp = path.join(p, e.name);
              if (e.isDirectory()) walk(fp); else fileCount++;
            }
          };
          walk(full);
        } catch (e) {}
        const stat = fs.statSync(full);
        return {
          slug: d.name,
          name: meta.name || d.name,
          description: meta.description || "",
          created: meta.created || stat.birthtime || stat.ctime,
          updated: stat.mtime,
          fileCount: fileCount
        };
      })
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    res.json({ ok: true, projects: items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/projects — create project
router.post("/", function (req, res) {
  const name = (req.body && req.body.name) || "";
  const description = (req.body && req.body.description) || "";
  const slug = slugify(name);
  if (!slug) return res.status(400).json({ ok: false, error: "Invalid name" });
  const dir = safeProjectPath(slug);
  if (!dir) return res.status(400).json({ ok: false, error: "Invalid path" });
  if (fs.existsSync(dir)) return res.status(409).json({ ok: false, error: "Project exists" });
  fs.mkdirSync(dir, { recursive: true });
  const meta = { name: name, description: description, created: new Date().toISOString(), slug: slug };
  fs.writeFileSync(path.join(dir, ".blun-project.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, "README.md"), "# " + name + "\n\n" + description + "\n");
  res.json({ ok: true, project: meta });
});

// GET /api/projects/:slug — project info + tree
router.get("/:slug", function (req, res) {
  const dir = safeProjectPath(req.params.slug);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ ok: false, error: "Not found" });
  let meta = {};
  const metaFile = path.join(dir, ".blun-project.json");
  if (fs.existsSync(metaFile)) {
    try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch (e) {}
  }
  res.json({ ok: true, project: meta, tree: buildTree(dir, dir) });
});

// GET /api/projects/:slug/file?path=foo/bar.txt — read file content
router.get("/:slug/file", function (req, res) {
  const dir = safeProjectPath(req.params.slug);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ ok: false, error: "Project not found" });
  const full = safeFilePath(dir, req.query.path || "");
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return res.status(404).json({ ok: false, error: "File not found" });
  }
  const stat = fs.statSync(full);
  if (stat.size > 2 * 1024 * 1024) return res.status(413).json({ ok: false, error: "File too large" });
  const ext = path.extname(full).toLowerCase();
  const binary = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"];
  if (binary.indexOf(ext) !== -1) {
    res.setHeader("Content-Type", ext === ".pdf" ? "application/pdf" : (ext === ".svg" ? "image/svg+xml" : "image/" + ext.slice(1)));
    return fs.createReadStream(full).pipe(res);
  }
  res.json({ ok: true, path: req.query.path, content: fs.readFileSync(full, "utf8"), size: stat.size });
});

// PUT /api/projects/:slug/file — write file content
router.put("/:slug/file", function (req, res) {
  const dir = safeProjectPath(req.params.slug);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ ok: false, error: "Project not found" });
  const rel = (req.body && req.body.path) || "";
  const content = (req.body && req.body.content) || "";
  const full = safeFilePath(dir, rel);
  if (!full) return res.status(400).json({ ok: false, error: "Invalid path" });
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  res.json({ ok: true });
});

// DELETE /api/projects/:slug — delete project
router.delete("/:slug", function (req, res) {
  const dir = safeProjectPath(req.params.slug);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ ok: false, error: "Not found" });
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

// GET /api/projects/:slug/download — zip download
router.get("/:slug/download", function (req, res) {
  const dir = safeProjectPath(req.params.slug);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ ok: false, error: "Not found" });
  const slug = path.basename(dir);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="' + slug + '.zip"');
  const zip = spawn("zip", ["-r", "-q", "-", "."], { cwd: dir });
  zip.stdout.pipe(res);
  zip.stderr.on("data", function (d) { console.error("[projects.zip]", d.toString()); });
  zip.on("error", function (e) { try { res.status(500).end(); } catch (x) {} });
});

// GET /api/projects/:slug/preview/* — serve project files for live preview
router.get("/:slug/preview/*", function (req, res) {
  const dir = safeProjectPath(req.params.slug);
  if (!dir || !fs.existsSync(dir)) return res.status(404).send("Not found");
  let rel = req.params[0] || "index.html";
  if (rel.endsWith("/") || rel === "") rel += "index.html";
  const full = safeFilePath(dir, rel);
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).send("Not found");
  res.sendFile(full);
});

module.exports = router;
