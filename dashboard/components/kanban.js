// BLUN Kanban Board — Drag & Drop Task Management
(function() {
  var COLUMNS = [
    { id: 'pending', label: 'Ausstehend', color: '#f59e0b' },
    { id: 'processing', label: 'In Arbeit', color: '#3b82f6' },
    { id: 'completed', label: 'Erledigt', color: '#22c55e' }
  ];

  var dragState = { taskId: null, fromCol: null };

  window.renderKanban = function(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    
    // Fetch tasks
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('blun_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var cid = localStorage.getItem('blun_company');
    if (cid) headers['x-company-id'] = cid;
    
    fetch('/api/organisator/kanban', { headers: headers }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.error) { el.innerHTML = '<div style="color:#ef4444;padding:20px">' + data.error + '</div>'; return; }
      el.innerHTML = buildBoard(data);
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
    return '<div class="kanban-card" draggable="true" data-task-id="' + t.id + '" data-agent-id="' + t.agent_id + '" ' +
      'style="background:#16213e;border:1px solid #2a2a4a;border-radius:6px;padding:10px;cursor:grab;transition:transform 0.15s,box-shadow 0.15s;border-left:3px solid ' + agentColor + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
      '<span style="font-size:12px;font-weight:500;color:#e2e8f0;line-height:1.3">' + escK(t.task.substring(0, 80)) + (t.task.length > 80 ? '...' : '') + '</span>' +
      '<span style="font-size:10px;color:#64748b;white-space:nowrap;margin-left:8px">#' + t.id + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-size:11px;color:' + agentColor + ';font-weight:500">' + escK(t.agent_name || '?') + '</span>' +
      '<span style="font-size:10px;color:#64748b">' + statusIcon + '</span></div></div>';
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
        if (newStatus === dragState.fromCol) return;
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
})();
