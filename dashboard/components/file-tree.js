// BLUN Project Manager — file tree + viewer component
(function () {
  var STATE = { current: null, tree: [], openPath: null, projects: [] };

  async function api(path, opts) {
    var r = await fetch("/api/projects" + path, opts || {});
    return r.json();
  }

  async function loadProjects() {
    var d = await api("/");
    STATE.projects = (d && d.projects) || [];
    renderProjectList();
  }

  async function openProject(slug) {
    var d = await api("/" + slug);
    if (!d || !d.ok) return;
    STATE.current = d.project;
    STATE.current.slug = STATE.current.slug || slug;
    STATE.tree = d.tree || [];
    renderProject();
  }

  async function openFile(rel) {
    if (!STATE.current) return;
    var slug = STATE.current.slug;
    var ext = (rel.split(".").pop() || "").toLowerCase();
    var binary = ["png","jpg","jpeg","gif","webp","ico","pdf"];
    var viewer = document.getElementById("pmViewer");
    STATE.openPath = rel;
    if (binary.indexOf(ext) !== -1) {
      viewer.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:12px">' + escapeHtml(rel) + '</div>' +
        (ext === "pdf"
          ? '<iframe src="/api/projects/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent(rel) + '" style="width:100%;height:calc(100% - 36px);border:0;background:#0f172a"></iframe>'
          : '<img src="/api/projects/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent(rel) + '" style="max-width:100%;display:block;margin:12px auto"/>');
      return;
    }
    var d = await api("/" + slug + "/file?path=" + encodeURIComponent(rel));
    if (!d || !d.ok) {
      viewer.innerHTML = '<div style="padding:16px;color:#ef4444">Datei konnte nicht geladen werden</div>';
      return;
    }
    var isHtml = ext === "html" || ext === "htm";
    var actions =
      '<button onclick="window.PM.preview(\'' + rel + '\')" style="background:#3b82f6;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:6px">Live-Preview</button>';
    viewer.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#0f172a;border-bottom:1px solid #1e293b">' +
        '<span style="color:#cbd5e1;font-size:12px;font-family:monospace">' + escapeHtml(rel) + '</span>' +
        '<span>' + (isHtml ? actions : "") + '</span>' +
      '</div>' +
      '<pre style="margin:0;padding:14px;color:#e2e8f0;font-size:12px;line-height:1.55;font-family:Consolas,Menlo,monospace;overflow:auto;height:calc(100% - 36px);white-space:pre-wrap;word-break:break-word">' +
        escapeHtml(d.content || "") +
      '</pre>';
  }

  function preview(rel) {
    if (!STATE.current) return;
    var slug = STATE.current.slug;
    var url = "/api/projects/" + encodeURIComponent(slug) + "/preview/" + rel.split("/").map(encodeURIComponent).join("/");
    var v = document.getElementById("pmViewer");
    v.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#0f172a;border-bottom:1px solid #1e293b">' +
      '<span style="color:#cbd5e1;font-size:12px">Live-Preview: ' + escapeHtml(rel) + '</span>' +
      '<button onclick="window.PM.openFile(\'' + rel + '\')" style="background:#475569;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">Code</button>' +
      '</div>' +
      '<iframe src="' + url + '" style="width:100%;height:calc(100% - 36px);border:0;background:#fff"></iframe>';
  }

  function renderTree(nodes, depth) {
    var html = "";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var pad = (depth * 12) + "px";
      if (n.type === "dir") {
        html += '<div class="pm-dir" style="padding:3px 8px 3px ' + pad + ';color:#fbbf24;font-size:12px">📁 ' + escapeHtml(n.name) + '</div>';
        html += renderTree(n.children || [], depth + 1);
      } else {
        var active = STATE.openPath === n.path ? "background:#1e293b;" : "";
        html += '<div class="pm-file" onclick="window.PM.openFile(\'' + n.path + '\')" style="' + active + 'padding:3px 8px 3px ' + pad + ';color:#cbd5e1;font-size:12px;cursor:pointer">📄 ' + escapeHtml(n.name) + '</div>';
      }
    }
    return html;
  }

  function renderProject() {
    var c = document.getElementById("projectsContainer");
    if (!c || !STATE.current) return;
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #1e293b;background:#0f172a">' +
        '<div>' +
          '<button onclick="window.PM.back()" style="background:#334155;color:#fff;border:0;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:11px;margin-right:10px">← Zurück</button>' +
          '<strong style="color:#f1f5f9">' + escapeHtml(STATE.current.name || STATE.current.slug) + '</strong>' +
          '<span style="color:#64748b;font-size:11px;margin-left:8px">' + escapeHtml(STATE.current.description || "") + '</span>' +
        '</div>' +
        '<div>' +
          '<a href="/api/projects/' + encodeURIComponent(STATE.current.slug) + '/download" style="background:#10b981;color:#fff;text-decoration:none;padding:6px 14px;border-radius:4px;font-size:12px;font-weight:600">⬇ ZIP</a>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;height:calc(100% - 50px)">' +
        '<div id="pmTree" style="width:260px;background:#020617;border-right:1px solid #1e293b;overflow:auto;padding:8px 0">' + renderTree(STATE.tree, 0) + '</div>' +
        '<div id="pmViewer" style="flex:1;background:#0b1220;overflow:hidden;display:flex;flex-direction:column"><div style="padding:24px;color:#64748b;font-size:13px">Datei auswählen…</div></div>' +
      '</div>';
  }

  function renderProjectList() {
    var c = document.getElementById("projectsContainer");
    if (!c) return;
    var rows = STATE.projects.map(function (p) {
      return '<div class="pm-card" onclick="window.PM.open(\'' + p.slug + '\')" style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;cursor:pointer;transition:border-color .15s">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">' +
          '<strong style="color:#f1f5f9;font-size:14px">' + escapeHtml(p.name) + '</strong>' +
          '<span style="color:#64748b;font-size:11px">' + (p.fileCount || 0) + ' Dateien</span>' +
        '</div>' +
        '<div style="color:#94a3b8;font-size:12px;margin-bottom:8px">' + escapeHtml(p.description || "Kein Beschreibungstext") + '</div>' +
        '<div style="color:#475569;font-size:10px;font-family:monospace">' + escapeHtml(p.slug) + '</div>' +
      '</div>';
    }).join("");
    c.innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;background:#0f172a">' +
        '<h2 style="margin:0;color:#f1f5f9;font-size:18px">Projekte</h2>' +
        '<button onclick="window.PM.create()" style="background:#3b82f6;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">+ Neues Projekt</button>' +
      '</div>' +
      '<div style="padding:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;overflow:auto;height:calc(100% - 60px)">' +
        (rows || '<div style="color:#64748b;grid-column:1/-1;text-align:center;padding:40px">Noch keine Projekte. Lege das erste an.</div>') +
      '</div>';
  }

  async function createProject() {
    var name = prompt("Projektname:");
    if (!name) return;
    var description = prompt("Kurzbeschreibung (optional):") || "";
    var d = await api("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, description: description }) });
    if (d && d.ok) { await loadProjects(); openProject(d.project.slug); }
    else alert((d && d.error) || "Fehler");
  }

  function back() { STATE.current = null; STATE.openPath = null; loadProjects(); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  window.PM = { open: openProject, openFile: openFile, preview: preview, create: createProject, back: back, reload: loadProjects };
  window.renderProjectsView = function () { loadProjects(); };
})();
