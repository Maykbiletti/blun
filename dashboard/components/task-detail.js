// Task Detail Component - History Timeline mit Hover-Details
// Karel - CEO/Operator BLUN

class TaskDetail extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.task = null;
        this.history = [];
        this._activeFilter = 'all';
        this._collapsed = false;
        this._collapseThreshold = 5;
        this._boundHideTooltip = this._hideTooltip.bind(this);
    }

    connectedCallback() {
        this.render();
    }

    disconnectedCallback() {
        document.removeEventListener('click', this._boundHideTooltip);
    }

    static get observedAttributes() {
        return ['task-id'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'task-id' && newValue !== oldValue) {
            this.loadTask(newValue);
        }
    }

    setTask(task) {
        this.task = task;
        this.history = task?.history || this._buildFakeHistory(task);
        this._collapsed = this.history.length > this._collapseThreshold;
        this.render();
    }

    setHistory(history) {
        this.history = history || [];
        this._collapsed = this.history.length > this._collapseThreshold;
        this.render();
    }

    async loadTask(taskId) {
        try {
            const res = await fetch(`/api/tasks/${taskId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.setTask(data);
        } catch (e) {
            console.warn('[task-detail] loadTask failed:', e.message);
        }
    }

    // Wenn keine History im Task, aus Status-Feldern rekonstruieren
    _buildFakeHistory(task) {
        if (!task) return [];
        const entries = [];
        if (task.created_at || task.createdAt) {
            entries.push({
                status: 'created',
                timestamp: task.created_at || task.createdAt,
                agent: task.created_by || task.agent || 'System',
                note: 'Task erstellt'
            });
        }
        if (task.started_at || task.startedAt) {
            entries.push({
                status: 'running',
                timestamp: task.started_at || task.startedAt,
                agent: task.agent || 'Agent',
                note: 'Ausführung gestartet'
            });
        }
        if ((task.status === 'completed' || task.status === 'failed') && (task.updated_at || task.updatedAt)) {
            entries.push({
                status: task.status,
                timestamp: task.updated_at || task.updatedAt,
                agent: task.agent || 'Agent',
                note: task.status === 'completed' ? 'Erfolgreich abgeschlossen' : (task.error || 'Fehler aufgetreten')
            });
        }
        return entries;
    }

    getStatusColor(status) {
        const map = {
            created:   '#a78bfa',
            pending:   '#fbbf24',
            queued:    '#f59e0b',
            running:   '#3b82f6',
            completed: '#10b981',
            done:      '#10b981',
            failed:    '#ef4444',
            error:     '#ef4444',
            cancelled: '#6b7280',
            skipped:   '#6b7280',
            waiting:   '#8b5cf6',
            blocked:   '#f97316',
            reviewing: '#06b6d4',
        };
        return map[status] || '#52525b';
    }

    getStatusIcon(status) {
        const map = {
            created:   '✦',
            pending:   '◐',
            queued:    '⋯',
            running:   '▶',
            completed: '✓',
            done:      '✓',
            failed:    '✕',
            error:     '✕',
            cancelled: '⊘',
            skipped:   '⊘',
            waiting:   '⏸',
            blocked:   '⛔',
            reviewing: '◎',
        };
        return map[status] || '·';
    }

    formatTimestamp(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        if (isNaN(d)) return String(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    formatRelative(ts) {
        if (!ts) return '';
        const diff = Date.now() - new Date(ts);
        if (diff < 0) return 'in der Zukunft';
        if (diff < 60000) return `${Math.floor(diff/1000)}s ago`;
        if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
        if (diff < 2592000000) return `${Math.floor(diff/86400000)}d ago`;
        return `${Math.floor(diff/2592000000)}mo ago`;
    }

    // Delta zwischen zwei Timestamps als lesbarer String
    _formatDelta(tsA, tsB) {
        if (!tsA || !tsB) return null;
        const ms = Math.abs(new Date(tsB) - new Date(tsA));
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
        if (ms < 3600000) return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
        if (ms < 86400000) return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`;
        return `${Math.floor(ms/86400000)}d ${Math.floor((ms%86400000)/3600000)}h`;
    }

    _escHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Einzigartige Status-Typen für Filter
    _getUniqueStatuses() {
        const seen = new Set();
        this.history.forEach(e => { if (e.status) seen.add(e.status); });
        return Array.from(seen);
    }

    // Gefilterte + ggf. kollabierte History
    _getVisibleHistory() {
        let list = this.history;
        if (this._activeFilter !== 'all') {
            list = list.filter(e => e.status === this._activeFilter);
        }
        if (this._collapsed && list.length > this._collapseThreshold) {
            return list.slice(-this._collapseThreshold);
        }
        return list;
    }

    // Summary-Zahlen: Gesamt, Agent-Wechsel, Laufzeit
    _buildSummary() {
        const h = this.history;
        if (!h.length) return null;

        let agentChanges = 0;
        for (let i = 1; i < h.length; i++) {
            if (h[i].agent && h[i-1].agent && h[i].agent !== h[i-1].agent) agentChanges++;
        }

        const first = h[0]?.timestamp;
        const last  = h[h.length-1]?.timestamp;
        const totalTime = this._formatDelta(first, last);

        return { total: h.length, agentChanges, totalTime };
    }

    _renderSummary() {
        const s = this._buildSummary();
        if (!s) return '';
        return `
        <div class="summary-bar">
            <div class="summary-item">
                <span class="summary-num">${s.total}</span>
                <span class="summary-label">Einträge</span>
            </div>
            ${s.agentChanges > 0 ? `
            <div class="summary-item">
                <span class="summary-num">${s.agentChanges}</span>
                <span class="summary-label">Agent-Wechsel</span>
            </div>` : ''}
            ${s.totalTime ? `
            <div class="summary-item">
                <span class="summary-num">${this._escHtml(s.totalTime)}</span>
                <span class="summary-label">Gesamtdauer</span>
            </div>` : ''}
        </div>`;
    }

    _renderFilters() {
        const statuses = this._getUniqueStatuses();
        if (statuses.length < 2) return '';

        const allActive = this._activeFilter === 'all';
        const pills = statuses.map(s => {
            const active = this._activeFilter === s;
            const color = this.getStatusColor(s);
            return `<button class="filter-pill${active ? ' active' : ''}"
                        data-filter="${this._escHtml(s)}"
                        style="${active ? `--fc:${color}` : ''}">
                        ${this.getStatusIcon(s)} ${this._escHtml(s)}
                    </button>`;
        }).join('');

        return `
        <div class="filter-bar">
            <button class="filter-pill${allActive ? ' active all' : ''}" data-filter="all">Alle</button>
            ${pills}
        </div>`;
    }

    _renderHistory() {
        const visible = this._getVisibleHistory();
        const allFiltered = this.history.filter(e =>
            this._activeFilter === 'all' || e.status === this._activeFilter
        );
        const hiddenCount = allFiltered.length - visible.length;

        if (!visible.length) {
            return `<div class="empty">Keine Einträge${this._activeFilter !== 'all' ? ` für Status "${this._escHtml(this._activeFilter)}"` : ''}.</div>`;
        }

        const collapseToggle = hiddenCount > 0 ? `
            <div class="collapse-hint" data-action="expand">
                ↑ ${hiddenCount} ältere Einträge anzeigen
            </div>` : (this._collapsed === false && allFiltered.length > this._collapseThreshold ? `
            <div class="collapse-hint" data-action="collapse">
                ↓ Ältere Einträge ausblenden
            </div>` : '');

        // Vollständige gefilterte Liste für Delta-Berechnung
        const fullFiltered = allFiltered;
        const offsetIndex = allFiltered.length - visible.length;

        const rows = visible.map((entry, visIdx) => {
            const globalIdx = offsetIndex + visIdx;
            const color = this.getStatusColor(entry.status);
            const icon  = this.getStatusIcon(entry.status);
            const isLast = visIdx === visible.length - 1;

            // Agent-Wechsel gegenüber Vorgänger
            const prevEntry = globalIdx > 0 ? fullFiltered[globalIdx - 1] : null;
            const agentChanged = prevEntry && prevEntry.agent && entry.agent && prevEntry.agent !== entry.agent;

            // Delta zum vorherigen Eintrag
            const delta = prevEntry ? this._formatDelta(prevEntry.timestamp, entry.timestamp) : null;

            const tooltipData = JSON.stringify({
                agent: entry.agent || '—',
                prevAgent: prevEntry?.agent || null,
                agentChanged,
                timestamp: this.formatTimestamp(entry.timestamp),
                status: entry.status || '—',
                note: entry.note || entry.reason || entry.message || '—',
                duration: entry.duration ? `${entry.duration}ms` : null,
                delta: delta,
                meta: entry.meta || null
            }).replace(/'/g, '&#39;');

            return `
            <div class="history-entry${isLast ? ' is-last' : ''}${agentChanged ? ' agent-changed' : ''}"
                 data-tooltip='${tooltipData}'
                 style="--sc:${color}">
                <div class="entry-left">
                    <div class="entry-dot" title="${this._escHtml(entry.status)}">
                        <span class="entry-icon">${icon}</span>
                    </div>
                    ${!isLast ? '<div class="entry-line"></div>' : ''}
                </div>
                <div class="entry-body">
                    ${agentChanged ? `<div class="agent-change-badge">
                        <span class="acb-from">${this._escHtml(prevEntry.agent)}</span>
                        <span class="acb-arrow">→</span>
                        <span class="acb-to">${this._escHtml(entry.agent)}</span>
                    </div>` : ''}
                    <div class="entry-header">
                        <span class="entry-status" style="color:${color}">${this._escHtml(entry.status || 'unknown')}</span>
                        ${entry.agent && !agentChanged ? `<span class="entry-agent">
                            <span class="agent-chip">${this._escHtml(entry.agent.charAt(0).toUpperCase())}</span>
                            ${this._escHtml(entry.agent)}
                        </span>` : ''}
                        <span class="entry-time" title="${this.formatTimestamp(entry.timestamp)}">
                            ${this.formatRelative(entry.timestamp)}
                        </span>
                    </div>
                    ${delta ? `<div class="entry-delta">+${this._escHtml(delta)}</div>` : ''}
                    ${entry.note || entry.reason || entry.message ? `
                    <div class="entry-note">${this._escHtml(entry.note || entry.reason || entry.message)}</div>
                    ` : ''}
                </div>
            </div>`;
        }).join('');

        return collapseToggle + rows;
    }

    _hideTooltip() {
        const tip = this.shadowRoot?.querySelector('.tooltip');
        if (tip) tip.classList.remove('visible');
    }

    _attachInteractivity() {
        const root = this.shadowRoot;
        if (!root) return;

        const tooltip = root.querySelector('.tooltip');
        const entries = root.querySelectorAll('.history-entry');
        const wrap    = root.querySelector('.detail-wrap');

        // Tooltip on hover
        entries.forEach(entry => {
            entry.addEventListener('mouseenter', () => {
                let data;
                try { data = JSON.parse(entry.dataset.tooltip); } catch { return; }

                let html = `<div class="tt-row"><span class="tt-label">Status</span><span class="tt-val tt-status" style="color:${this.getStatusColor(data.status)}">${this._escHtml(data.status)}</span></div>`;

                if (data.agentChanged && data.prevAgent) {
                    html += `<div class="tt-row tt-agent-change">
                        <span class="tt-label">Agent</span>
                        <span class="tt-val">
                            <span style="color:#71717a">${this._escHtml(data.prevAgent)}</span>
                            <span style="color:#52525b"> → </span>
                            <span style="color:#e4e4e7">${this._escHtml(data.agent)}</span>
                        </span>
                    </div>`;
                } else {
                    html += `<div class="tt-row"><span class="tt-label">Agent</span><span class="tt-val">${this._escHtml(data.agent)}</span></div>`;
                }

                html += `<div class="tt-row"><span class="tt-label">Zeit</span><span class="tt-val">${this._escHtml(data.timestamp)}</span></div>`;

                if (data.delta) {
                    html += `<div class="tt-row"><span class="tt-label">Δ vorher</span><span class="tt-val tt-delta">+${this._escHtml(data.delta)}</span></div>`;
                }
                if (data.note && data.note !== '—') {
                    html += `<div class="tt-row tt-note"><span class="tt-label">Notiz</span><span class="tt-val">${this._escHtml(data.note)}</span></div>`;
                }
                if (data.duration) {
                    html += `<div class="tt-row"><span class="tt-label">Dauer</span><span class="tt-val">${this._escHtml(data.duration)}</span></div>`;
                }
                if (data.meta) {
                    html += `<div class="tt-row"><span class="tt-label">Meta</span><span class="tt-val tt-meta">${this._escHtml(typeof data.meta === 'object' ? JSON.stringify(data.meta) : data.meta)}</span></div>`;
                }
                tooltip.innerHTML = html;

                // Tooltip-Position: rechts neben Eintrag, innerhalb des Containers
                const rect      = entry.getBoundingClientRect();
                const wrapRect  = wrap.getBoundingClientRect();
                let topPos  = rect.top - wrapRect.top + 8;
                let leftPos = rect.right - wrapRect.left + 12;

                // Overflow-Schutz rechts
                const ttWidth = 260;
                if (leftPos + ttWidth > wrapRect.width - 8) {
                    leftPos = rect.left - wrapRect.left - ttWidth - 12;
                }
                // Overflow-Schutz unten
                tooltip.style.top  = `${topPos}px`;
                tooltip.style.left = `${leftPos}px`;
                tooltip.classList.add('visible');
            });

            entry.addEventListener('mouseleave', () => {
                tooltip.classList.remove('visible');
            });
        });

        // Filter-Buttons
        root.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                this._activeFilter = btn.dataset.filter;
                this._collapsed = false;
                this.render();
            });
        });

        // Collapse-Toggle
        const collapseBtn = root.querySelector('.collapse-hint');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                this._collapsed = collapseBtn.dataset.action === 'expand' ? false : true;
                this.render();
            });
        }

        // History als JSON kopieren
        const copyBtn = root.querySelector('.copy-history-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard?.writeText(JSON.stringify(this.history, null, 2)).then(() => {
                    copyBtn.textContent = '✓ Kopiert';
                    setTimeout(() => { copyBtn.textContent = '⎘ JSON'; }, 1500);
                }).catch(() => {});
            });
        }
    }

    render() {
        const task = this.task;
        this.shadowRoot.innerHTML = `
        <style>
            :host {
                display: block;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                color: #e4e4e7;
                font-size: 14px;
            }

            .detail-wrap {
                background: #0f0f0f;
                border-radius: 10px;
                padding: 24px;
                position: relative;
                min-height: 120px;
            }

            .section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 14px;
            }

            .section-title {
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #71717a;
                margin: 0;
            }

            .copy-history-btn {
                background: transparent;
                border: 1px solid #27272a;
                border-radius: 5px;
                color: #52525b;
                font-size: 11px;
                padding: 3px 9px;
                cursor: pointer;
                transition: color 0.15s, border-color 0.15s;
                font-family: inherit;
            }

            .copy-history-btn:hover {
                color: #a1a1aa;
                border-color: #3f3f46;
            }

            /* Task meta */
            .task-meta {
                margin-bottom: 24px;
                padding-bottom: 20px;
                border-bottom: 1px solid #1c1c1f;
            }

            .task-title {
                font-size: 18px;
                font-weight: 600;
                color: #f4f4f5;
                margin: 0 0 8px 0;
                line-height: 1.4;
            }

            .task-desc {
                color: #a1a1aa;
                font-size: 13px;
                line-height: 1.6;
                margin: 0 0 12px 0;
            }

            .task-badges {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 10px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 500;
                background: #18181b;
                border: 1px solid #27272a;
                color: #a1a1aa;
            }

            .badge.status-badge {
                border-color: var(--sc, #52525b);
                color: var(--sc, #52525b);
            }

            /* Summary Bar */
            .summary-bar {
                display: flex;
                gap: 20px;
                margin-bottom: 18px;
                padding: 10px 14px;
                background: #111113;
                border: 1px solid #1c1c1f;
                border-radius: 7px;
            }

            .summary-item {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .summary-num {
                font-size: 16px;
                font-weight: 600;
                color: #e4e4e7;
                line-height: 1;
            }

            .summary-label {
                font-size: 10px;
                color: #52525b;
                text-transform: uppercase;
                letter-spacing: 0.06em;
            }

            /* Filter Bar */
            .filter-bar {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                margin-bottom: 16px;
            }

            .filter-pill {
                background: #18181b;
                border: 1px solid #27272a;
                border-radius: 20px;
                color: #71717a;
                font-size: 11px;
                padding: 3px 10px;
                cursor: pointer;
                transition: all 0.15s;
                font-family: inherit;
                line-height: 1.5;
            }

            .filter-pill:hover {
                border-color: #3f3f46;
                color: #a1a1aa;
            }

            .filter-pill.active {
                background: #111113;
                border-color: var(--fc, #3f3f46);
                color: var(--fc, #a1a1aa);
            }

            .filter-pill.active.all {
                border-color: #3f3f46;
                color: #d4d4d8;
            }

            /* Collapse hint */
            .collapse-hint {
                font-size: 11px;
                color: #52525b;
                padding: 6px 0 10px 42px;
                cursor: pointer;
                transition: color 0.15s;
            }

            .collapse-hint:hover {
                color: #71717a;
            }

            /* Timeline */
            .history-list {
                position: relative;
                display: flex;
                flex-direction: column;
                gap: 0;
            }

            .history-entry {
                display: flex;
                align-items: flex-start;
                gap: 0;
                position: relative;
                cursor: default;
            }

            .history-entry:hover .entry-body {
                background: #18181b;
                border-color: #27272a;
            }

            .history-entry.agent-changed .entry-body {
                border-left: 2px solid #a78bfa44;
            }

            .entry-left {
                display: flex;
                flex-direction: column;
                align-items: center;
                flex-shrink: 0;
                width: 28px;
            }

            .entry-dot {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: #18181b;
                border: 2px solid var(--sc, #52525b);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                z-index: 2;
                position: relative;
                margin-top: 12px;
                box-shadow: 0 0 0 4px #0f0f0f;
                transition: box-shadow 0.2s;
            }

            .history-entry:hover .entry-dot {
                box-shadow: 0 0 0 4px #18181b, 0 0 12px var(--sc, #52525b)44;
            }

            .entry-icon {
                font-size: 11px;
                color: var(--sc, #52525b);
                line-height: 1;
            }

            .entry-line {
                flex: 1;
                width: 2px;
                min-height: 12px;
                background: linear-gradient(to bottom, var(--sc, #27272a) 0%, #27272a 100%);
                opacity: 0.35;
                z-index: 1;
                margin-bottom: 0;
            }

            .history-entry.is-last .entry-line {
                display: none;
            }

            .entry-body {
                flex: 1;
                margin-left: 14px;
                padding: 10px 14px;
                border-radius: 8px;
                background: #111113;
                border: 1px solid #1c1c1f;
                margin-bottom: 10px;
                margin-top: 6px;
                transition: background 0.15s, border-color 0.15s;
                min-height: 44px;
            }

            /* Agent-Wechsel Badge */
            .agent-change-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                margin-bottom: 6px;
                padding: 2px 8px;
                background: #1e1020;
                border: 1px solid #2d1a40;
                border-radius: 4px;
                color: #c084fc;
            }

            .acb-from { color: #71717a; }
            .acb-arrow { color: #52525b; }
            .acb-to   { color: #c084fc; font-weight: 600; }

            .entry-header {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            .entry-status {
                font-weight: 600;
                font-size: 12px;
                text-transform: capitalize;
                letter-spacing: 0.04em;
            }

            .entry-agent {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 12px;
                color: #71717a;
            }

            .agent-chip {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #3f3f46;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: bold;
                color: #e4e4e7;
                flex-shrink: 0;
            }

            .entry-time {
                margin-left: auto;
                font-size: 11px;
                color: #52525b;
                white-space: nowrap;
            }

            .entry-delta {
                display: inline-block;
                margin-top: 4px;
                font-size: 10px;
                color: #3f3f46;
                letter-spacing: 0.03em;
            }

            .entry-note {
                margin-top: 6px;
                font-size: 12px;
                color: #71717a;
                line-height: 1.5;
            }

            .empty {
                color: #52525b;
                font-size: 13px;
                padding: 24px 0;
                text-align: center;
            }

            /* Tooltip */
            .tooltip {
                position: absolute;
                z-index: 100;
                background: #1c1c1f;
                border: 1px solid #3f3f46;
                border-radius: 8px;
                padding: 12px 14px;
                width: 260px;
                pointer-events: none;
                opacity: 0;
                transform: translateY(-4px);
                transition: opacity 0.15s, transform 0.15s;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            }

            .tooltip.visible {
                opacity: 1;
                transform: translateY(0);
            }

            .tt-row {
                display: flex;
                gap: 10px;
                align-items: flex-start;
                margin-bottom: 6px;
                font-size: 12px;
                line-height: 1.4;
            }

            .tt-row:last-child { margin-bottom: 0; }

            .tt-label {
                color: #71717a;
                min-width: 52px;
                flex-shrink: 0;
                font-size: 11px;
                padding-top: 1px;
            }

            .tt-val {
                color: #d4d4d8;
                word-break: break-word;
            }

            .tt-status {
                font-weight: 600;
                text-transform: capitalize;
            }

            .tt-delta {
                color: #52525b;
                font-size: 11px;
            }

            .tt-note {
                border-top: 1px solid #27272a;
                padding-top: 6px;
                margin-top: 4px;
            }

            .tt-meta {
                font-size: 10px;
                font-family: monospace;
                color: #a1a1aa;
            }

            /* Scrollbar */
            ::-webkit-scrollbar { width: 5px; }
            ::-webkit-scrollbar-track { background: #18181b; }
            ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
        </style>

        <div class="detail-wrap">
            ${task ? `
            <div class="task-meta">
                <div class="task-title">${this._escHtml(task.title || task.name || `Task #${task.id || '?'}`)}</div>
                ${task.description ? `<div class="task-desc">${this._escHtml(task.description)}</div>` : ''}
                <div class="task-badges">
                    ${task.status ? `<span class="badge status-badge" style="--sc:${this.getStatusColor(task.status)}">${this.getStatusIcon(task.status)} ${this._escHtml(task.status)}</span>` : ''}
                    ${task.agent ? `<span class="badge">◎ ${this._escHtml(task.agent)}</span>` : ''}
                    ${task.priority ? `<span class="badge">⬆ ${this._escHtml(task.priority)}</span>` : ''}
                    ${task.id ? `<span class="badge"># ${this._escHtml(String(task.id))}</span>` : ''}
                </div>
            </div>
            ` : ''}

            ${this._renderSummary()}

            <div class="section-header">
                <div class="section-title">History</div>
                ${this.history.length ? `<button class="copy-history-btn">⎘ JSON</button>` : ''}
            </div>

            ${this._renderFilters()}

            <div class="history-list">
                ${this._renderHistory()}
            </div>

            <div class="tooltip"></div>
        </div>`;

        this._attachInteractivity();
    }
}

customElements.define('task-detail', TaskDetail);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskDetail;
}
