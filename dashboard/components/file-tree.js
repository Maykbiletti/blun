// BLUN Project Manager — file tree + viewer (BLUN dark theme)
(function () {
  // BLUN palette (matches dashboard)
  var C = {
    bg: "#0a0a0a",
    panel: "#1a1a1a",
    panel2: "#262626",
    border: "#262626",
    text: "#e5e5e5",
    dim: "#a3a3a3",
    dim2: "#737373",
    accent: "#3b82f6",
    success: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
    folder: "#a3a3a3"
  };

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
    var d = await api("/" + encodeURIComponent(slug));
    if (!d || !d.ok) return;
    STATE.current = d.project;
    STATE.current.slug = STATE.current.slug || slug;
    STATE.tree = d.tree || [];
    STATE.openPath = null;
    renderProject();
  }

  async function openFile(rel) {
    if (!STATE.current) return;
    var slug = STATE.current.slug;
    var ext = (rel.split(".").pop() || "").toLowerCase();
    var binary = ["png","jpg","jpeg","gif","webp","ico","pdf"];
    var viewer = document.getElementById("pmViewer");
    STATE.openPath = rel;
    refreshTreeHighlight();
    if (binary.indexOf(ext) !== -1) {
      viewer.innerHTML =
        '<div style="padding:8px 12px;color:' + C.dim + ';font-size:12px;background:' + C.panel + ';border-bottom:1px solid ' + C.border + ';font-family:monospace">' + escapeHtml(rel) + '</div>' +
        (ext === "pdf"
          ? '<iframe src="/api/projects/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent(rel) + '" style="width:100%;height:calc(100% - 36px);border:0;background:' + C.bg + '"></iframe>'
          : '<div style="flex:1;overflow:auto;background:' + C.bg + ';display:flex;align-items:center;justify-content:center;padding:16px"><img src="/api/projects/' + encodeURIComponent(slug) + '/file?path=' + encodeURIComponent(rel) + '" style="max-width:100%;max-height:100%"/></div>');
      return;
    }
    var d = await api("/" + encodeURIComponent(slug) + "/file?path=" + encodeURIComponent(rel));
    if (!d || !d.ok) {
      viewer.innerHTML = '<div style="padding:16px;color:' + C.danger + '">Datei konnte nicht geladen werden</div>';
      return;
    }
    var isHtml = ext === "html" || ext === "htm";
    var actions = isHtml
      ? '<button onclick="window.PM.preview(\'' + escAttr(rel) + '\')" style="background:' + C.panel2 + ';color:' + C.text + ';border:1px solid ' + C.border + ';padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">Live-Preview</button>'
      : '';
    viewer.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:' + C.panel + ';border-bottom:1px solid ' + C.border + '">' +
        '<span style="color:' + C.dim + ';font-size:12px;font-family:Consolas,Menlo,monospace">' + escapeHtml(rel) + '</span>' +
        '<span>' + actions + '</span>' +
      '</div>' +
      '<pre style="margin:0;padding:14px;color:' + C.text + ';font-size:12px;line-height:1.55;font-family:Consolas,Menlo,monospace;overflow:auto;flex:1;white-space:pre-wrap;word-break:break-word;background:' + C.bg + '">' +
        escapeHtml(d.content || "") +
      '</pre>';
  }

  function preview(rel) {
    if (!STATE.current) return;
    var slug = STATE.current.slug;
    var url = "/api/projects/" + encodeURIComponent(slug) + "/preview/" + rel.split("/").map(encodeURIComponent).join("/");
    var v = document.getElementById("pmViewer");
    v.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:' + C.panel + ';border-bottom:1px solid ' + C.border + '">' +
        '<span style="color:' + C.dim + ';font-size:12px">Live-Preview: ' + escapeHtml(rel) + '</span>' +
        '<button onclick="window.PM.openFile(\'' + escAttr(rel) + '\')" style="background:' + C.panel2 + ';color:' + C.text + ';border:1px solid ' + C.border + ';padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">Code</button>' +
      '</div>' +
      '<iframe src="' + url + '" style="width:100%;flex:1;border:0;background:#fff"></iframe>';
  }

  function renderTree(nodes, depth) {
    var html = "";
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var pad = (depth * 12 + 8) + "px";
      if (n.type === "dir") {
        html += '<div class="pm-dir" style="padding:3px 8px 3px ' + pad + ';color:' + C.folder + ';font-size:12px;user-select:none">▸ ' + escapeHtml(n.name) + '</div>';
        html += renderTree(n.children || [], depth + 1);
      } else {
        var active = STATE.openPath === n.path;
        var bg = active ? C.panel2 : "transparent";
        var col = active ? C.text : C.dim;
        html += '<div class="pm-file" data-path="' + escAttr(n.path) + '" onclick="window.PM.openFile(\'' + escAttr(n.path) + '\')" style="background:' + bg + ';padding:3px 8px 3px ' + pad + ';color:' + col + ';font-size:12px;cursor:pointer">' + escapeHtml(n.name) + '</div>';
      }
    }
    return html;
  }

  function refreshTreeHighlight() {
    var t = document.getElementById("pmTree");
    if (!t) return;
    var els = t.querySelectorAll(".pm-file");
    for (var i = 0; i < els.length; i++) {
      var p = els[i].getAttribute("data-path");
      if (p === STATE.openPath) { els[i].style.background = C.panel2; els[i].style.color = C.text; }
      else { els[i].style.background = "transparent"; els[i].style.color = C.dim; }
    }
  }

  function renderProject() {
    var c = document.getElementById("projectsContainer");
    if (!c || !STATE.current) return;
    var virtual = !!STATE.current.virtual;
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ' + C.border + ';background:' + C.panel + ';flex-shrink:0">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<button onclick="window.PM.back()" style="background:' + C.panel2 + ';color:' + C.text + ';border:1px solid ' + C.border + ';padding:5px 12px;border-radius:4px;cursor:pointer;font-size:11px">← Zurück</button>' +
          '<strong style="color:' + C.text + ';font-size:14px">' + escapeHtml(STATE.current.name || STATE.current.slug) + '</strong>' +
          (virtual ? '<span style="background:' + C.panel2 + ';color:' + C.warn + ';font-size:10px;padding:2px 6px;border-radius:3px;border:1px solid ' + C.border + '">read-only</span>' : '') +
          '<span style="color:' + C.dim2 + ';font-size:11px">' + escapeHtml(STATE.current.description || "") + '</span>' +
        '</div>' +
        '<div>' +
          '<a href="/api/projects/' + encodeURIComponent(STATE.current.slug) + '/download" style="background:' + C.panel2 + ';color:' + C.text + ';text-decoration:none;padding:6px 14px;border-radius:4px;font-size:12px;border:1px solid ' + C.border + '">⬇ ZIP</a>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex:1;min-height:0">' +
        '<div id="pmTree" style="width:280px;background:' + C.bg + ';border-right:1px solid ' + C.border + ';overflow:auto;padding:8px 0">' + (renderTree(STATE.tree, 0) || '<div style="padding:12px;color:' + C.dim2 + ';font-size:12px">Leer</div>') + '</div>' +
        '<div id="pmViewer" style="flex:1;background:' + C.bg + ';overflow:hidden;display:flex;flex-direction:column"><div style="padding:24px;color:' + C.dim2 + ';font-size:13px">Datei links auswählen…</div></div>' +
      '</div>';
  }

  function renderProjectList() {
    var c = document.getElementById("projectsContainer");
    if (!c) return;
    var rows = STATE.projects.map(function (p) {
      var isBlun = !!p.virtual;
      var badge = isBlun
        ? '<span style="background:' + C.panel2 + ';color:' + C.warn + ';font-size:10px;padding:2px 6px;border-radius:3px;border:1px solid ' + C.border + '">SYSTEM</span>'
        : '';
      var delBtn = isBlun
        ? ''
        : '<button onclick="event.stopPropagation();window.PM.del(\'' + escAttr(p.slug) + '\',\'' + escAttr(p.name) + '\')" title="Projekt löschen" style="background:transparent;color:' + C.dim2 + ';border:1px solid ' + C.border + ';padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px">Löschen</button>';
      return '<div class="pm-card" onclick="window.PM.open(\'' + escAttr(p.slug) + '\')" style="background:' + C.panel + ';border:1px solid ' + C.border + ';border-radius:6px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;gap:8px">' +
          '<strong style="color:' + C.text + ';font-size:14px">' + escapeHtml(p.name) + '</strong>' +
          badge +
        '</div>' +
        '<div style="color:' + C.dim + ';font-size:12px;flex:1;min-height:18px">' + escapeHtml(p.description || "—") + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<span style="color:' + C.dim2 + ';font-size:11px;font-family:monospace">' + escapeHtml(p.slug) + ' · ' + (p.fileCount || 0) + ' Dateien</span>' +
          delBtn +
        '</div>' +
      '</div>';
    }).join("");
    c.innerHTML =
      '<div style="padding:14px 18px;border-bottom:1px solid ' + C.border + ';display:flex;justify-content:space-between;align-items:center;background:' + C.panel + ';flex-shrink:0">' +
        '<h2 style="margin:0;color:' + C.text + ';font-size:16px;font-weight:600">Projekte</h2>' +
        '<button onclick="window.PM.create()" style="background:' + C.panel2 + ';color:' + C.text + ';border:1px solid ' + C.border + ';padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px">+ Neues Projekt</button>' +
      '</div>' +
      '<div style="padding:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;overflow:auto;flex:1;align-content:start">' +
        (rows || '<div style="color:' + C.dim2 + ';grid-column:1/-1;text-align:center;padding:40px">Noch keine Projekte.</div>') +
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

  async function deleteProject(slug, name) {
    if (!confirm('Projekt "' + name + '" wirklich löschen? Alle Dateien gehen verloren.')) return;
    var d = await api("/" + encodeURIComponent(slug), { method: "DELETE" });
    if (d && d.ok) loadProjects();
    else alert((d && d.error) || "Fehler beim Löschen");
  }

  function back() { STATE.current = null; STATE.openPath = null; loadProjects(); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function escAttr(s) { return String(s == null ? "" : s).replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

  window.PM = { open: openProject, openFile: openFile, preview: preview, create: createProject, del: deleteProject, back: back, reload: loadProjects };
  window.renderProjectsView = function () { loadProjects(); };
})();
