// BLUN Kanban Board — Drag & Drop Task Management
(function() {
  var COLUMNS = [
    { id: 'pending', label: 'Ausstehend', color: '#f59e0b' },
    { id: 'processing', label: 'In Arbeit', color: '#3b82f6' },
    { id: 'completed', label: 'Erledigt', color: '#22c55e' },
    { id: 'failed', label: 'Fehlgeschlagen', color: '#ef4444' }
  ];

  // Inject hover style once
  if (!document.getElementById('kanban-hover-css')) {
    var st = document.createElement('style');
    st.id = 'kanban-hover-css';
    st.textContent = '.kanban-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(59,130,246,0.25);border-color:#3b82f6 !important}';
    document.head.appendChild(st);
  }

  var dragState = { taskId: null, fromCol: null };

  var __lastBoardHash = null;
  function hashStr(s) { var h = 0, i; for (i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h; }

  window.renderKanban = function(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var cid = localStorage.getItem('blun_company');
    if (cid) headers['x-company-id'] = cid;

    fetch('/api/organisator/kanban', { headers: headers }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.error) { el.innerHTML = '<div style="color:#ef4444;padding:20px">' + data.error + '</div>'; return; }
      // Build a fingerprint of the data — only id+status+priority+agent matter
      var fp = data.map(function(t) { return t.id + ':' + t.status + ':' + (t.priority||0); }).join(',');
      var h = hashStr(fp);
      if (h === __lastBoardHash) return; // nothing changed, skip render
      __lastBoardHash = h;
      var firstRender = !el.firstChild;
      var newHtml = buildBoard(data);
      if (firstRender) {
        el.innerHTML = newHtml;
      } else {
        // Smooth swap: build offscreen, swap with no flicker
        var tmp = document.createElement('div');
        tmp.style.cssText = el.firstChild.style.cssText || '';
        tmp.innerHTML = newHtml;
        // Replace inner of the existing container without removing scroll positions of cols
        var oldCols = el.querySelectorAll('.kanban-cards');
        var newCols = tmp.querySelectorAll('.kanban-cards');
        var oldScrolls = [];
        for (var i = 0; i < oldCols.length; i++) oldScrolls.push(oldCols[i].scrollTop);
        el.innerHTML = newHtml;
        var refreshed = el.querySelectorAll('.kanban-cards');
        for (var j = 0; j < refreshed.length && j < oldScrolls.length; j++) refreshed[j].scrollTop = oldScrolls[j];
      }
      initDragDrop(el);
    }).catch(function(e) {
      el.innerHTML = '<div style="color:#ef4444;padding:20px">Fehler: ' + e.message + '</div>';
    });
  };

  function buildBoard(data) {
    var html = '<div style="display:flex;gap:12px;height:100%;padding:12px;overflow-x:auto">';
    COLUMNS.forEach(function(col) {
      var tasks = data.filter(function(t) {
        if (col.id === 'processing') return t.status === 'processing' || t.status === 'in_progress';
        if (col.id === 'failed') return t.status === 'failed' || t.status === 'cancelled';
        return t.status === col.id;
      });
      html += '<div class="kanban-col" data-col="' + col.id + '" style="flex:1;min-width:240px;background:#1a1a2e;border-radius:8px;display:flex;flex-direction:column">';
      html += '<div style="padding:10px 12px;font-weight:600;font-size:13px;border-bottom:2px solid ' + col.color + ';color:' + col.color + ';display:flex;justify-content:space-between;align-items:center">';
      html += col.label + '<span style="background:#262640;padding:2px 8px;border-radius:10px;font-size:11px;color:#94a3b8">' + tasks.length + '</span></div>';
      html += '<div class="kanban-cards" data-col="' + col.id + '" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;min-height:60px">';
      tasks.forEach(function(t) {
        html += buildCard(t);
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function buildCard(t) {
    var agentColor = t.agent_name ? stringToColor(t.agent_name) : '#64748b';
    var statusIcon = t.status === 'completed' ? '&#10003;' : t.status === 'processing' || t.status === 'in_progress' ? '&#9881;' : '&#9679;';
    return '<div class="kanban-card" draggable="true" data-task-id="' + t.id + '" data-agent-id="' + t.agent_id + '" onclick="window.openTaskPopup(\'' + t.id + '\')" ' +
      'style="background:#16213e;border:1px solid #2a2a4a;border-radius:6px;padding:10px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s,border-color 0.15s;border-left:3px solid ' + agentColor + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
      '<span style="font-size:12px;font-weight:500;color:#e2e8f0;line-height:1.3">' + escK(t.task.substring(0, 80)) + (t.task.length > 80 ? '...' : '') + '</span>' +
      '<span style="font-size:10px;color:#64748b;white-space:nowrap;margin-left:8px">#' + t.id + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-size:11px;color:' + agentColor + ';font-weight:500">' + escK(t.agent_name || '?') + '</span>' +
      '<span style="font-size:10px;color:#64748b">' + statusIcon + '</span></div>' + '<div style="font-size:9px;color:#475569;margin-top:6px;text-align:right;font-style:italic">Klick fuer Details &rarr;</div></div>';
  }

  function stringToColor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    var h = Math.abs(hash) % 360;
    return 'hsl(' + h + ',65%,55%)';
  }

  function escK(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function initDragDrop(board) {
    var cards = board.querySelectorAll('.kanban-card');
    var cols = board.querySelectorAll('.kanban-cards');

    cards.forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        dragState.taskId = card.dataset.taskId;
        dragState.agentId = card.dataset.agentId;
        dragState.fromCol = card.closest('.kanban-cards').dataset.col;
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function() { card.style.opacity = '1'; });
    });

    cols.forEach(function(col) {
      col.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.style.background = 'rgba(59,130,246,0.1)'; });
      col.addEventListener('dragleave', function() { col.style.background = ''; });
      col.addEventListener('drop', function(e) {
        e.preventDefault();
        col.style.background = '';
        var newStatus = col.dataset.col;
        if (newStatus === dragState.fromCol) {
          // Same column: reorder by priority (only for pending)
          if (newStatus === 'pending') {
            var dropY = e.clientY;
            var cardsInCol = Array.prototype.slice.call(col.querySelectorAll('.kanban-card'));
            var draggedCard = cardsInCol.filter(function(c) { return c.dataset.taskId === dragState.taskId; })[0];
            if (draggedCard) {
              var others = cardsInCol.filter(function(c) { return c.dataset.taskId !== dragState.taskId; });
              var insertBefore = others.find(function(c) {
                var rect = c.getBoundingClientRect();
                return dropY < rect.top + rect.height / 2;
              });
              if (insertBefore) col.insertBefore(draggedCard, insertBefore);
              else col.appendChild(draggedCard);
              var newOrder = Array.prototype.slice.call(col.querySelectorAll('.kanban-card')).map(function(c) { return parseInt(c.dataset.taskId, 10); });
              var headers2 = { 'Content-Type': 'application/json' };
              var token2 = localStorage.getItem('blun_token');
              if (token2) headers2['Authorization'] = 'Bearer ' + token2;
              fetch('/api/organisator/tasks/reorder', { method: 'POST', headers: headers2, body: JSON.stringify({ ids: newOrder }) }).then(function() { renderKanban('kanbanContainer'); });
            }
          }
          return;
        }
        moveTask(dragState.taskId, dragState.agentId, newStatus);
      });
    });
  }

  function moveTask(taskId, agentId, newStatus) {
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    fetch('/api/organisator/agents/' + agentId + '/tasks/' + taskId, {
      method: 'PUT', headers: headers, body: JSON.stringify({ status: newStatus })
    }).then(function() {
      renderKanban('kanbanContainer');
    });
  }

  window.openTaskPopup = function(taskId) {
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var cid = localStorage.getItem('blun_company');
    if (cid) headers['x-company-id'] = cid;
    var existing = document.getElementById('taskPopupOverlay');
    if (existing) existing.remove();
    var ov = document.createElement('div');
    ov.id = 'taskPopupOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
    ov.innerHTML = '<div style="background:#16213e;border:1px solid #2a2a4a;border-radius:10px;max-width:720px;width:100%;max-height:85vh;overflow-y:auto;padding:24px;color:#e2e8f0;font-family:system-ui"><div style="text-align:center;color:#64748b">Lade...</div></div>';
    document.body.appendChild(ov);
    fetch('/api/organisator/tasks/' + taskId + '/details', { headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) { ov.firstChild.innerHTML = '<div style="color:#ef4444">Fehler: ' + d.error + '</div>'; return; }
        ov.firstChild.innerHTML = renderTaskPopup(d);
      })
      .catch(function(e) {
        ov.firstChild.innerHTML = '<div style="color:#ef4444">Fehler: ' + e.message + '</div>';
      });
  };

  function renderTaskPopup(d) {
    var p = d.parsed || {};
    var commits = (p.commits || 0);
    var files = (p.changed_files_count || 0);
    var shas = p.commit_shas || [];
    var cli = p.cli || d.agent_adapter || '?';
    var model = p.model || d.agent_model || '?';
    var olen = p.output_length || 0;
    var statusColor = d.status === 'completed' ? '#22c55e' : d.status === 'processing' ? '#3b82f6' : d.status === 'failed' ? '#ef4444' : '#f59e0b';
    var statusLabel = { completed:'Erledigt', processing:'In Arbeit', pending:'Wartet', failed:'Fehlgeschlagen' }[d.status] || d.status;
    var created = d.created_at ? new Date(d.created_at).toLocaleString('de-DE') : '?';
    var done = d.completed_at ? new Date(d.completed_at).toLocaleString('de-DE') : null;
    var dur = '';
    if (d.created_at && d.completed_at) {
      var ms = new Date(d.completed_at) - new Date(d.created_at);
      var s = Math.round(ms/1000); dur = s < 60 ? s + 's' : Math.round(s/60) + 'min';
    }
    var html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:12px">';
    html += '<div><div style="font-size:11px;color:#64748b">Task #' + d.id + '</div>';
    html += '<div style="font-size:16px;font-weight:600;color:#fff;margin-top:4px;line-height:1.3">' + escK(d.task) + '</div></div>';
    html += '<button onclick="document.getElementById(\'taskPopupOverlay\').remove()" style="background:#262640;border:1px solid #2a2a4a;color:#e2e8f0;width:30px;height:30px;border-radius:6px;cursor:pointer;font-size:16px;flex-shrink:0">&times;</button>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
    html += '<span style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + ';padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">' + statusLabel + '</span>';
    html += '<span style="background:#262640;color:#94a3b8;padding:4px 10px;border-radius:12px;font-size:11px">Agent: ' + escK(d.agent_name || '?') + '</span>';
    html += '<span style="background:#262640;color:#94a3b8;padding:4px 10px;border-radius:12px;font-size:11px">CLI: ' + escK(cli) + '</span>';
    html += '<span style="background:#262640;color:#94a3b8;padding:4px 10px;border-radius:12px;font-size:11px">Model: ' + escK(model) + '</span>';
    if (dur) html += '<span style="background:#262640;color:#94a3b8;padding:4px 10px;border-radius:12px;font-size:11px">Dauer: ' + dur + '</span>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
    html += pillBox('Erstellt', created);
    html += pillBox('Abgeschlossen', done || '-');
    html += pillBox('Commits', String(commits));
    html += pillBox('Geaenderte Dateien', String(files));
    html += '</div>';
    if (shas && shas.length) {
      html += '<div style="margin-bottom:14px"><div style="font-size:11px;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Commit SHAs</div>';
      shas.forEach(function(s) {
        var short = String(s).substring(0,10);
        html += '<div style="background:#0d1117;border:1px solid #2a2a4a;padding:6px 10px;border-radius:4px;font-family:monospace;font-size:11px;color:#22c55e;margin-bottom:4px">' + escK(short) + '</div>';
      });
      html += '</div>';
    }
    var isFailed = (d.status === 'failed' || d.status === 'cancelled');
    var pipeline;
    if (isFailed) {
      pipeline = [
        { label: 'Erstellt', state: 'ok' },
        { label: 'Bearbeitet', state: 'ok' },
        { label: d.status === 'cancelled' ? 'Abgebrochen' : 'Fehlgeschlagen', state: 'fail' },
        { label: 'Deployed', state: 'skip' },
        { label: 'Live', state: 'skip' }
      ];
    } else {
      pipeline = [
        { label: 'Erstellt', state: 'ok' },
        { label: 'Bearbeitet', state: (d.status === 'processing' || d.status === 'completed') ? 'ok' : 'wait' },
        { label: 'Commitet', state: commits > 0 ? 'ok' : (d.status === 'completed' ? 'fail' : 'wait') },
        { label: 'Deployed', state: (d.status === 'completed' && commits > 0) ? 'ok' : 'wait' },
        { label: 'Live', state: (d.status === 'completed' && commits > 0) ? 'ok' : 'wait' }
      ];
    }
    html += '<div style="margin-bottom:16px"><div style="font-size:11px;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Pipeline</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    pipeline.forEach(function(st) {
      var c, icon;
      if (st.state === 'ok') { c = '#22c55e'; icon = '&#10003;'; }
      else if (st.state === 'fail') { c = '#ef4444'; icon = '&#10007;'; }
      else if (st.state === 'skip') { c = '#334155'; icon = '&#8722;'; }
      else { c = '#475569'; icon = '&#9711;'; }
      html += '<div style="background:#0d1117;border:1px solid ' + c + ';color:' + c + ';padding:5px 10px;border-radius:6px;font-size:11px;font-weight:500">' + icon + ' ' + st.label + '</div>';
    });
    html += '</div>';
    if (isFailed) {
      var reason = d.feedback || (p.error || p.last_error || 'Kein Grund hinterlegt');
      html += '<div style="margin-top:10px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;padding:10px;border-radius:6px;color:#fca5a5;font-size:12px"><strong>Grund:</strong> ' + escK(String(reason)) + '</div>';
      html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">';
      html += '<button onclick="window.retryTask(' + d.id + ', null)" style="background:#3b82f6;border:none;color:#fff;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500">&#x21bb; Erneut versuchen</button>';
      html += '<button onclick="window.retryTaskOther(' + d.id + ')" style="background:#262640;border:1px solid #2a2a4a;color:#e2e8f0;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px">An anderen Agent</button>';
      html += '<button onclick="window.cancelTaskFromPopup(' + d.id + ', ' + d.agent_id + ')" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px">Verwerfen</button>';
      html += '</div>';
    }
    html += '</div>';
    if (p.raw_output) {
      html += '<div><div style="font-size:11px;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Output</div>';
      html += '<pre style="background:#0d1117;border:1px solid #2a2a4a;padding:10px;border-radius:6px;font-size:11px;color:#94a3b8;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-word">' + escK(p.raw_output) + '</pre></div>';
    } else if (olen) {
      html += '<div style="font-size:11px;color:#64748b">Output: ' + olen + ' Zeichen geschrieben</div>';
    }
    return html;
  }

  function pillBox(label, value) {
    return '<div style="background:#0d1117;border:1px solid #2a2a4a;padding:8px 12px;border-radius:6px"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">' + label + '</div><div style="font-size:13px;color:#e2e8f0;margin-top:3px">' + escK(String(value)) + '</div></div>';
  }


  // Auto-refresh kanban every 8s when page visible and no popup open
  if (!window.__kanbanAutoRefresh) {
    window.__kanbanAutoRefresh = setInterval(function() {
      var p = document.getElementById('page-kanban');
      if (!p) return;
      if (p.style.display === 'none' || p.offsetParent === null) return;
      if (document.getElementById('taskPopupOverlay')) return;
      var c = document.getElementById('kanbanContainer');
      if (c) renderKanban('kanbanContainer');
    }, 8000);
  }



  window.retryTask = function(taskId, agentId) {
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    fetch('/api/organisator/tasks/' + taskId + '/retry', { method: 'POST', headers: headers, body: JSON.stringify(agentId ? { agent_id: agentId } : {}) })
      .then(function() { var ov = document.getElementById('taskPopupOverlay'); if (ov) ov.remove(); renderKanban('kanbanContainer'); });
  };

  window.retryTaskOther = function(taskId) {
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var cid = localStorage.getItem('blun_company');
    if (cid) headers['x-company-id'] = cid;
    fetch('/api/organisator/agents', { headers: headers }).then(function(r) { return r.json(); }).then(function(agents) {
      var arr = (Array.isArray(agents) ? agents : (agents.agents || []));
      var list = arr.map(function(a) { return a.id + ' - ' + a.name + ' (' + (a.role || '?') + ')'; }).join(String.fromCharCode(10));
      var pick = prompt('Welcher Agent soll uebernehmen? Gib die ID ein:' + String.fromCharCode(10,10) + list);
      if (pick) window.retryTask(taskId, parseInt(pick, 10));
    });
  };

  window.cancelTaskFromPopup = function(taskId, agentId) {
    if (!confirm('Task #' + taskId + ' endgueltig verwerfen?')) return;
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    fetch('/api/organisator/agents/' + agentId + '/tasks/' + taskId, { method: 'PUT', headers: headers, body: JSON.stringify({ status: 'cancelled' }) })
      .then(function() { var ov = document.getElementById('taskPopupOverlay'); if (ov) ov.remove(); renderKanban('kanbanContainer'); });
  };



  function startDeployCountdown(container) {
    var bar = document.createElement('div');
    bar.id = 'kanbanDeployCountdown';
    bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#0d1117;border:1px solid #2a2a4a;border-radius:8px;padding:10px 16px;margin-bottom:12px;font-family:system-ui;font-size:13px;color:#e2e8f0';
    bar.innerHTML = '<div><span style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Naechster Auto-Deploy</span> <span id="kanbanDeployTimer" style="color:#22c55e;font-weight:600;margin-left:8px">--:--:--</span></div><div><span style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Heute deployed</span> <span id="kanbanDeployedToday" style="color:#3b82f6;font-weight:600;margin-left:8px">0</span></div>';
    container.parentNode.insertBefore(bar, container);
    var nextAt = 0;
    function fetchData() {
      var headers = { 'Content-Type': 'application/json' };
      var token = localStorage.getItem('blun_token');
      if (token) headers['Authorization'] = 'Bearer ' + token;
      var cid = localStorage.getItem('blun_company');
      if (cid) headers['x-company-id'] = cid;
      fetch('/api/organisator/next-deploy', { headers: headers })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.next_deploy_at) {
            nextAt = d.next_deploy_at;
            var dt = document.getElementById('kanbanDeployedToday');
            if (dt) dt.textContent = d.deployed_today || 0;
          }
        }).catch(function() {});
    }
    function tick() {
      var t = document.getElementById('kanbanDeployTimer');
      if (!t) return;
      if (!nextAt) { t.textContent = '--:--:--'; return; }
      var ms = Math.max(0, nextAt - Date.now());
      var h = Math.floor(ms/3600000);
      var m = Math.floor((ms%3600000)/60000);
      var sec = Math.floor((ms%60000)/1000);
      t.textContent = (h<10?'0':'')+h+':'+(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;
    }
    fetchData();
    setInterval(fetchData, 30000);
    setInterval(tick, 1000);
  }

  // mount on first render
  var __cdMounted = false;
  var __origRender = window.renderKanban;
  if (typeof __origRender === 'function') {
    window.renderKanban = function(containerId) {
      var r = __origRender.apply(this, arguments);
      if (!__cdMounted) {
        var c = document.getElementById(containerId);
        if (c) { startDeployCountdown(c); __cdMounted = true; }
      }
      return r;
    };
  }
})();
