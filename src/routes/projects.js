// Project Manager Routes — isolated customer projects under /root/blun/projects/{slug}
// Plus a special "blun" virtual project pointing at /root/blun (with excludes).
const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
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

async function runGit(root, args) {
  return execFileAsync("git", args, {
    cwd: root,
    maxBuffer: 1024 * 1024 * 8,
    env: process.env
  });
}

function parseGitPorcelain(output) {
  const lines = String(output || "").split(/\r?\n/).filter(Boolean);
  let branch = "";
  let ahead = 0;
  let behind = 0;
  const files = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.startsWith("## ")) {
      const header = line.slice(3);
      const firstSpace = header.indexOf("...");
      branch = firstSpace === -1 ? header : header.slice(0, firstSpace);
      const ab = header.match(/\[ahead\s+(\d+)(?:,\s*behind\s+(\d+))?\]/);
      const ba = header.match(/\[behind\s+(\d+)(?:,\s*ahead\s+(\d+))?\]/);
      if (ab) {
        ahead = parseInt(ab[1] || "0", 10) || 0;
        behind = parseInt(ab[2] || "0", 10) || 0;
      } else if (ba) {
        behind = parseInt(ba[1] || "0", 10) || 0;
        ahead = parseInt(ba[2] || "0", 10) || 0;
      }
      continue;
    }

    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let file = line.slice(3).trim();
    if (file.includes(" -> ")) file = file.split(" -> ").pop();
    const staged = x !== " " && x !== "?";
    const unstaged = y !== " ";
    const untracked = x === "?" || y === "?";
    files.push({
      path: file,
      x,
      y,
      staged,
      unstaged,
      untracked,
      status: `${x}${y}`
    });
  }

  return {
    branch: branch || "(detached)",
    ahead,
    behind,
    files,
    changed: files.length,
    stagedCount: files.filter(f => f.staged).length,
    unstagedCount: files.filter(f => f.unstaged || f.untracked).length,
    clean: files.length === 0
  };
}

function resolveWritableProject(req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) {
    res.status(404).json({ ok: false, error: "Project not found" });
    return null;
  }
  if (proj.virtual) {
    res.status(403).json({ ok: false, error: "BLUN ist read-only" });
    return null;
  }
  return proj;
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
  const proj = resolveWritableProject(req, res);
  if (!proj) return;
  const rel = (req.body && req.body.path) || "";
  const content = (req.body && req.body.content) || "";
  const full = safeFilePath(proj.root, rel);
  if (!full) return res.status(400).json({ ok: false, error: "Invalid path" });
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  res.json({ ok: true });
});

// POST /api/projects/:slug/file — create new file
router.post("/:slug/file", function (req, res) {
  const proj = resolveWritableProject(req, res);
  if (!proj) return;
  const rel = (req.body && req.body.path) || "";
  const content = (req.body && req.body.content) || "";
  const overwrite = !!(req.body && req.body.overwrite);
  const full = safeFilePath(proj.root, rel);
  if (!full) return res.status(400).json({ ok: false, error: "Invalid path" });
  if (fs.existsSync(full) && !overwrite) return res.status(409).json({ ok: false, error: "File exists" });
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  res.json({ ok: true, path: rel });
});

// POST /api/projects/:slug/folder — create new folder
router.post("/:slug/folder", function (req, res) {
  const proj = resolveWritableProject(req, res);
  if (!proj) return;
  const rel = (req.body && req.body.path) || "";
  const full = safeFilePath(proj.root, rel);
  if (!full) return res.status(400).json({ ok: false, error: "Invalid path" });
  fs.mkdirSync(full, { recursive: true });
  res.json({ ok: true, path: rel });
});

// PATCH /api/projects/:slug/path — rename/move file or folder
router.patch("/:slug/path", function (req, res) {
  const proj = resolveWritableProject(req, res);
  if (!proj) return;

  const fromRel = (req.body && req.body.from) || "";
  const toRel = (req.body && req.body.to) || "";
  const fromFull = safeFilePath(proj.root, fromRel);
  const toFull = safeFilePath(proj.root, toRel);

  if (!fromFull || !toFull) return res.status(400).json({ ok: false, error: "Invalid path" });
  if (!fs.existsSync(fromFull)) return res.status(404).json({ ok: false, error: "Source not found" });
  if (fs.existsSync(toFull)) return res.status(409).json({ ok: false, error: "Target exists" });

  fs.mkdirSync(path.dirname(toFull), { recursive: true });
  fs.renameSync(fromFull, toFull);
  res.json({ ok: true, from: fromRel, to: toRel });
});

// DELETE /api/projects/:slug/file?path=foo/bar.txt
router.delete("/:slug/file", function (req, res) {
  const proj = resolveWritableProject(req, res);
  if (!proj) return;

  const rel = req.query.path || "";
  const full = safeFilePath(proj.root, rel);
  if (!full || !fs.existsSync(full)) return res.status(404).json({ ok: false, error: "Path not found" });

  const st = fs.statSync(full);
  if (st.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
  else fs.unlinkSync(full);
  res.json({ ok: true, path: rel, type: st.isDirectory() ? "dir" : "file" });
});

// GET /api/projects/:slug/git/status
router.get("/:slug/git/status", async function (req, res) {
  const proj = resolveProject(req.params.slug);
  if (!proj) return res.status(404).json({ ok: false, error: "Project not found" });

  try {
    const { stdout } = await runGit(proj.root, ["status", "--porcelain=1", "-b"]);
    const parsed = parseGitPorcelain(stdout);

    let lastCommit = null;
    try {
      const { stdout: hashOut } = await runGit(proj.root, ["rev-parse", "--short", "HEAD"]);
      const hash = String(hashOut || "").trim();
      const { stdout: msgOut } = await runGit(proj.root, ["log", "-1", "--pretty=%s"]);
      lastCommit = { hash, message: String(msgOut || "").trim() };
    } catch (e) {}

    res.json({ ok: true, git: parsed, lastCommit });
  } catch (e) {
    res.status(400).json({ ok: false, error: "Git status unavailable", detail: e.stderr || e.message });
  }
});

// POST /api/projects/:slug/git/commit
router.post("/:slug/git/commit", async function (req, res) {
  const proj = resolveWritableProject(req, res);
  if (!proj) return;

  const message = String((req.body && req.body.message) || "").trim();
  const paths = Array.isArray(req.body && req.body.paths) ? req.body.paths.filter(Boolean) : [];

  if (!message) return res.status(400).json({ ok: false, error: "Commit message required" });

  try {
    if (paths.length) {
      await runGit(proj.root, ["add"].concat(paths));
    } else {
      await runGit(proj.root, ["add", "-A"]);
    }

    await runGit(proj.root, ["commit", "-m", message]);

    const { stdout: hashOut } = await runGit(proj.root, ["rev-parse", "--short", "HEAD"]);
    const { stdout: msgOut } = await runGit(proj.root, ["log", "-1", "--pretty=%s"]);
    res.json({
      ok: true,
      commit: {
        hash: String(hashOut || "").trim(),
        message: String(msgOut || "").trim()
      }
    });
  } catch (e) {
    const stderr = String(e.stderr || e.message || "");
    if (/nothing to commit/i.test(stderr)) {
      return res.status(409).json({ ok: false, error: "Nothing to commit" });
    }
    res.status(400).json({ ok: false, error: "Commit failed", detail: stderr });
  }
});

// POST /api/projects/:slug/git/push
router.post("/:slug/git/push", async function (req, res) {
  const proj = resolveWritableProject(req, res);
  if (!proj) return;

  const remote = String((req.body && req.body.remote) || "origin").trim() || "origin";
  let branch = String((req.body && req.body.branch) || "").trim();

  try {
    if (!branch) {
      const { stdout } = await runGit(proj.root, ["rev-parse", "--abbrev-ref", "HEAD"]);
      branch = String(stdout || "").trim();
    }
    await runGit(proj.root, ["push", remote, branch]);
    res.json({ ok: true, remote, branch });
  } catch (e) {
    res.status(400).json({ ok: false, error: "Push failed", detail: e.stderr || e.message });
  }
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
