class AgentTaskBoard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.agents = [];
        this.filter = 'all';
        this.onFilterClick = this.onFilterClick.bind(this);
    }

    static get observedAttributes() {
        return ['agents', 'filter'];
    }

    connectedCallback() {
        this.render();
        this.shadowRoot.addEventListener('click', this.onFilterClick);
    }

    disconnectedCallback() {
        this.shadowRoot.removeEventListener('click', this.onFilterClick);
    }

    attributeChangedCallback(name, _oldValue, newValue) {
        if (name === 'agents') {
            this.setAgentsFromAttribute(newValue);
            return;
        }

        if (name === 'filter') {
            this.setFilter(newValue || 'all');
        }
    }

    setAgentsFromAttribute(value) {
        if (!value) {
            this.agents = [];
            this.render();
            return;
        }

        try {
            const parsed = JSON.parse(value);
            this.setAgents(parsed);
        } catch (_error) {
            this.agents = [];
            this.render();
        }
    }

    setAgents(agents) {
        this.agents = Array.isArray(agents) ? agents : [];
        this.render();
    }

    setFilter(filter) {
        const normalized = this.normalizeFilter(filter);
        if (this.filter === normalized) return;

        this.filter = normalized;
        this.render();

        this.dispatchEvent(new CustomEvent('agent-task-board-filter-change', {
            detail: { filter: this.filter },
            bubbles: true
        }));
    }

    normalizeFilter(filter) {
        const value = (filter || '').toLowerCase();
        if (value === 'idle' || value === 'busy' || value === 'blocked' || value === 'all') {
            return value;
        }
        return 'all';
    }

    normalizeStatus(status) {
        const value = (status || '').toLowerCase();

        if (value === 'idle' || value === 'ready' || value === 'available') {
            return 'idle';
        }

        if (value === 'busy' || value === 'running' || value === 'working' || value === 'active') {
            return 'busy';
        }

        if (value === 'blocked' || value === 'error' || value === 'failed' || value === 'offline') {
            return 'blocked';
        }

        return 'idle';
    }

    getCounts() {
        const counts = {
            idle: 0,
            busy: 0,
            blocked: 0,
            total: this.agents.length
        };

        for (const agent of this.agents) {
            const status = this.normalizeStatus(agent && agent.status);
            counts[status] += 1;
        }

        return counts;
    }

    getFilteredAgents() {
        if (this.filter === 'all') {
            return this.agents;
        }

        return this.agents.filter((agent) => this.normalizeStatus(agent && agent.status) === this.filter);
    }

    formatTime(value) {
        if (!value) return 'Unbekannt';

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unbekannt';

        return date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    renderCard(agent, idx) {
        const safeAgent = agent || {};
        const status = this.normalizeStatus(safeAgent.status);
        const name = this.escapeHtml(safeAgent.name || `Agent ${idx + 1}`);
        const task = this.escapeHtml(safeAgent.currentTask || safeAgent.task || safeAgent.lastTask || 'Kein aktiver Task');
        const updated = this.formatTime(safeAgent.updatedAt || safeAgent.lastUpdate || safeAgent.timestamp);

        return `
            <article class="agent-card" data-status="${status}">
                <header class="agent-card__header">
                    <h3 class="agent-card__name">${name}</h3>
                    <span class="status-badge status-badge--${status}">${status}</span>
                </header>
                <p class="agent-card__task">${task}</p>
                <footer class="agent-card__meta">Letztes Update: ${updated}</footer>
            </article>
        `;
    }

    renderFilters(counts) {
        const items = [
            { key: 'all', label: 'Alle', count: counts.total },
            { key: 'idle', label: 'Idle', count: counts.idle },
            { key: 'busy', label: 'Busy', count: counts.busy },
            { key: 'blocked', label: 'Blocked', count: counts.blocked }
        ];

        return items
            .map(({ key, label, count }) => {
                const activeClass = key === this.filter ? ' is-active' : '';
                return `
                    <button class="filter-chip${activeClass}" type="button" data-filter="${key}">
                        <span>${label}</span>
                        <strong>${count}</strong>
                    </button>
                `;
            })
            .join('');
    }

    onFilterClick(event) {
        const button = event.target.closest('[data-filter]');
        if (!button) return;

        const filter = button.getAttribute('data-filter');
        this.setFilter(filter);
    }

    render() {
        const counts = this.getCounts();
        const filteredAgents = this.getFilteredAgents();

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    --bg: #0f172a;
                    --surface: #111827;
                    --surface-2: #1f2937;
                    --text: #e5e7eb;
                    --muted: #9ca3af;
                    --line: #374151;
                    --idle: #22c55e;
                    --busy: #3b82f6;
                    --blocked: #ef4444;
                    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }

                .board {
                    background: linear-gradient(160deg, #0b1220 0%, var(--bg) 65%);
                    border: 1px solid #1e293b;
                    border-radius: 12px;
                    padding: 16px;
                    color: var(--text);
                }

                .board__head {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 14px;
                }

                .board__title {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    letter-spacing: 0.01em;
                }

                .board__summary {
                    font-size: 12px;
                    color: var(--muted);
                    white-space: nowrap;
                }

                .filters {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 14px;
                }

                .filter-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    border: 1px solid var(--line);
                    background: #0b1220;
                    color: var(--text);
                    border-radius: 999px;
                    padding: 6px 10px;
                    cursor: pointer;
                    font-size: 12px;
                }

                .filter-chip strong {
                    font-size: 11px;
                    color: var(--muted);
                }

                .filter-chip.is-active {
                    border-color: #64748b;
                    background: #1e293b;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 12px;
                }

                .agent-card {
                    border: 1px solid var(--line);
                    background: linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%);
                    border-radius: 10px;
                    padding: 12px;
                }

                .agent-card__header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .agent-card__name {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    line-height: 1.3;
                }

                .status-badge {
                    border: 1px solid;
                    border-radius: 999px;
                    padding: 2px 8px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .status-badge--idle {
                    color: var(--idle);
                    border-color: color-mix(in srgb, var(--idle) 55%, transparent);
                    background: color-mix(in srgb, var(--idle) 14%, transparent);
                }

                .status-badge--busy {
                    color: var(--busy);
                    border-color: color-mix(in srgb, var(--busy) 55%, transparent);
                    background: color-mix(in srgb, var(--busy) 14%, transparent);
                }

                .status-badge--blocked {
                    color: var(--blocked);
                    border-color: color-mix(in srgb, var(--blocked) 55%, transparent);
                    background: color-mix(in srgb, var(--blocked) 14%, transparent);
                }

                .agent-card__task {
                    margin: 0 0 10px 0;
                    font-size: 13px;
                    color: #cbd5e1;
                    min-height: 34px;
                    line-height: 1.4;
                }

                .agent-card__meta {
                    color: var(--muted);
                    font-size: 11px;
                }

                .empty {
                    border: 1px dashed var(--line);
                    border-radius: 10px;
                    padding: 24px;
                    text-align: center;
                    color: var(--muted);
                    font-size: 13px;
                }

                @media (max-width: 700px) {
                    .board {
                        padding: 12px;
                    }

                    .board__head {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                }
            </style>
            <section class="board">
                <header class="board__head">
                    <h2 class="board__title">Agent Task Board</h2>
                    <div class="board__summary">${counts.total} Agents</div>
                </header>
                <div class="filters">${this.renderFilters(counts)}</div>
                ${filteredAgents.length
                    ? `<div class="grid">${filteredAgents.map((agent, idx) => this.renderCard(agent, idx)).join('')}</div>`
                    : '<div class="empty">Keine Agents im aktuellen Filter.</div>'}
            </section>
        `;
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('agent-task-board')) {
    customElements.define('agent-task-board', AgentTaskBoard);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AgentTaskBoard;
}

if (typeof window !== 'undefined') {
    window.AgentTaskBoard = AgentTaskBoard;
}
