// Project Manager Routes — isolated customer projects under /root/blun/projects/{slug}
// Plus a special "blun" virtual project pointing at /root/blun (with excludes).
const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const router = express.Router();

const BLUN_ROOT = path.resolve(__dirname, "../..");
const PROJECTS_ROOT = path.join(BLUN_ROOT, "projects");
if (!fs.existsSync(PROJECTS_ROOT)) fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

// Folders/files we never traverse or include in BLUN-as-project view.
const GLOBAL_EXCLUDES = new Set([
  "node_modules", ".git", ".pm2", "dist", "build", ".next", ".cache",
  "projects", "logs", "tmp", ".vscode", ".idea", "coverage", ".nyc_output"
]);

function isExcluded(name) {
  if (!name) return true;
  if (name.startsWith(".")) return true;
  if (name.endsWith(".bak") || name.indexOf(".bak_") !== -1) return true;
  return GLOBAL_EXCLUDES.has(name);
}

function slugify(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Resolve a project slug to its root dir.
// "blun" is virtual: maps to /root/blun (read-only, not deletable, excluded subdirs).
function resolveProject(slug) {
  if (!slug) return null;
  if (slug === "blun") return { root: BLUN_ROOT, virtual: true, slug: "blun", name: "BLUN", description: "Das BLUN-System selbst" };
  const safe = slugify(slug);
  if (!safe) return null;
  const full = path.join(PROJECTS_ROOT, safe);
  if (!full.startsWith(PROJECTS_ROOT + path.sep) && full !== PROJECTS_ROOT) return null;
  if (!fs.existsSync(full)) return null;
  return { root: full, virtual: false, slug: safe };
}

function safeFilePath(root, rel) {
  const norm = path.normalize(rel || "").replace(/^[\\/]+/, "");
  const full = path.join(root, norm);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  // Reject any path containing an excluded segment
  const segs = path.relative(root, full).split(/[\\/]/);
  for (const s of segs) if (s && isExcluded(s)) return null;
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
    if (isExcluded(e.name)) continue;
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

function countFiles(dir) {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (isExcluded(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) n += countFiles(fp); else n++;
    }
  } catch (e) {}
  return n;
}

// GET /api/projects — list all (incl. blun virtual project)
router.get("/", function (req, res) {
  try {
    const list = [];
    // BLUN itself first
    list.push({
      slug: "blun",
      name: "BLUN",
      description: "Das BLUN-System selbst (read-only)",
      virtual: true,
      created: null,
      updated: fs.statSync(BLUN_ROOT).mtime,
      fileCount: countFiles(BLUN_ROOT)
    });
    const items = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith("."))
      .map(d => {
        const full = path.join(PROJECTS_ROOT, d.name);
        let meta = {};
        const metaFile = path.join(full, ".blun-project.json");
        if (fs.existsSync(metaFile)) {
          try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch (e) {}
        }
        const stat = fs.statSync(full);
        return {
          slug: d.name,
          name: meta.name || d.name,
          description: meta.description || "",
          virtual: false,
          created: meta.created || stat.birthtime || stat.ctime,
          updated: stat.mtime,
          fileCount: countFiles(full)
        };
      })
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    res.json({ ok: true, projects: list.concat(items) });
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
  if (slug === "blun") return res.status(400).json({ ok: false, error: "Reserved slug" });
  const dir = path.join(PROJECTS_ROOT, slug);
  if (fs.existsSync(dir)) return res.status(409).json({ ok: false, error: "Project exists" });
  fs.mkdirSync(dir, { recursive: true });
  const meta = { name: name, description: description, created: new Date().toISOString(), slug: slug };
  fs.writeFileSync(path.join(dir, ".blun-project.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, "README.md"), "# " + name + "\n\n" + description + "\n");
  res.json({ ok: true, project: meta });
});

// GET /api/projects/:slug — info + tree
router.get("/:slug", function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).json({ ok: false, error: "Not found" });
  let meta = { slug: proj.slug, name: proj.name, description: proj.description, virtual: proj.virtual };
  const metaFile = path.join(proj.root, ".blun-project.json");
  if (!proj.virtual && fs.existsSync(metaFile)) {
    try { Object.assign(meta, JSON.parse(fs.readFileSync(metaFile, "utf8")), { slug: proj.slug, virtual: false }); } catch (e) {}
  }
  res.json({ ok: true, project: meta, tree: buildTree(proj.root, proj.root) });
});

// GET /api/projects/:slug/file?path=foo/bar.txt
router.get("/:slug/file", function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).json({ ok: false, error: "Project not found" });
  const full = safeFilePath(proj.root, req.query.path || "");
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

// PUT /api/projects/:slug/file — write file (blocked for blun)
router.put("/:slug/file", function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).json({ ok: false, error: "Project not found" });
  if (proj.virtual) return res.status(403).json({ ok: false, error: "BLUN ist read-only" });
  const rel = (req.body && req.body.path) || "";
  const content = (req.body && req.body.content) || "";
  const full = safeFilePath(proj.root, rel);
  if (!full) return res.status(400).json({ ok: false, error: "Invalid path" });
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  res.json({ ok: true });
});

// DELETE /api/projects/:slug
router.delete("/:slug", function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).json({ ok: false, error: "Not found" });
  if (proj.virtual) return res.status(403).json({ ok: false, error: "BLUN kann nicht gelöscht werden" });
  fs.rmSync(proj.root, { recursive: true, force: true });
  res.json({ ok: true });
});

// GET /api/projects/:slug/download — zip
router.get("/:slug/download", function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).json({ ok: false, error: "Not found" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="' + proj.slug + '.zip"');
  const exclArgs = [];
  for (const x of GLOBAL_EXCLUDES) { exclArgs.push("-x", x + "/*", "-x", "*/" + x + "/*"); }
  const args = ["-r", "-q", "-", "."].concat(exclArgs);
  const zip = spawn("zip", args, { cwd: proj.root });
  zip.stdout.pipe(res);
  zip.stderr.on("data", function (d) { console.error("[projects.zip]", d.toString()); });
  zip.on("error", function () { try { res.status(500).end(); } catch (x) {} });
});

// GET /api/projects/:slug/preview/* — serve files for live preview iframe
router.get("/:slug/preview/*", function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).send("Not found");
  let rel = req.params[0] || "index.html";
  if (rel.endsWith("/") || rel === "") rel += "index.html";
  const full = safeFilePath(proj.root, rel);
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).send("Not found");
  res.sendFile(full);
});

module.exports = router;
