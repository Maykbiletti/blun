class TaskTimeline extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.tasks = [];
    }

    connectedCallback() {
        this.render();
    }

    static get observedAttributes() {
        return ['tasks'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'tasks') {
            this.tasks = newValue ? JSON.parse(newValue) : [];
            this.render();
        }
    }

    setTasks(tasks) {
        this.tasks = tasks || [];
        this.render();
    }

    getStatusColor(status) {
        const colors = {
            'pending': '#fbbf24',
            'running': '#3b82f6',
            'completed': '#10b981',
            'failed': '#ef4444',
            'cancelled': '#6b7280',
            'waiting': '#8b5cf6'
        };
        return colors[status] || '#6b7280';
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: #0f0f0f;
                    color: #e4e4e7;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .timeline-container {
                    padding: 24px;
                    max-height: 600px;
                    overflow-y: auto;
                }

                .timeline-header {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 24px;
                    color: #f4f4f5;
                }

                .timeline {
                    position: relative;
                    padding-left: 32px;
                }

                .timeline::before {
                    content: '';
                    position: absolute;
                    left: 12px;
                    top: 0;
                    bottom: 0;
                    width: 2px;
                    background: linear-gradient(to bottom, #27272a, #3f3f46);
                }

                .timeline-item {
                    position: relative;
                    margin-bottom: 24px;
                    padding: 16px;
                    background: #18181b;
                    border-radius: 8px;
                    border-left: 3px solid transparent;
                    transition: all 0.3s ease;
                }

                .timeline-item:hover {
                    background: #1f1f23;
                    transform: translateX(4px);
                }

                .timeline-item::before {
                    content: '';
                    position: absolute;
                    left: -35px;
                    top: 20px;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: 3px solid #0f0f0f;
                    background: var(--status-color);
                    z-index: 1;
                }

                .timeline-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 16px;
                }

                .timeline-main {
                    flex: 1;
                }

                .timeline-meta {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 4px;
                }

                .task-title {
                    font-size: 16px;
                    font-weight: 500;
                    color: #f4f4f5;
                    margin-bottom: 8px;
                    line-height: 1.4;
                }

                .task-description {
                    font-size: 14px;
                    color: #a1a1aa;
                    line-height: 1.5;
                    margin-bottom: 12px;
                }

                .task-agent {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #27272a;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                    color: #d4d4d8;
                }

                .agent-avatar {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: var(--status-color);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #000;
                    font-size: 10px;
                    font-weight: bold;
                }

                .task-status {
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 500;
                    background: rgba(107, 114, 128, 0.1);
                    color: var(--status-color);
                    border: 1px solid var(--status-color);
                    text-transform: capitalize;
                }

                .task-time {
                    font-size: 12px;
                    color: #71717a;
                    margin-top: 4px;
                }

                .empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    color: #71717a;
                }

                .empty-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                    opacity: 0.5;
                }

                /* Status-specific styles */
                .status-pending { --status-color: #fbbf24; }
                .status-running { --status-color: #3b82f6; }
                .status-completed { --status-color: #10b981; }
                .status-failed { --status-color: #ef4444; }
                .status-cancelled { --status-color: #6b7280; }
                .status-waiting { --status-color: #8b5cf6; }

                .status-running .timeline-item::before {
                    animation: pulse 2s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                /* Scrollbar styling */
                .timeline-container::-webkit-scrollbar {
                    width: 6px;
                }

                .timeline-container::-webkit-scrollbar-track {
                    background: #18181b;
                }

                .timeline-container::-webkit-scrollbar-thumb {
                    background: #3f3f46;
                    border-radius: 3px;
                }

                .timeline-container::-webkit-scrollbar-thumb:hover {
                    background: #52525b;
                }
            </style>

            <div class="timeline-container">
                <div class="timeline-header">
                    🚀 Agent Tasks Timeline
                </div>

                ${this.tasks.length ? `
                    <div class="timeline">
                        ${this.tasks.map(task => `
                            <div class="timeline-item status-${task.status}" style="--status-color: ${this.getStatusColor(task.status)}">
                                <div class="timeline-content">
                                    <div class="timeline-main">
                                        <div class="task-title">${this.escapeHtml(task.title || task.name || 'Untitled Task')}</div>
                                        ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                                        <div class="task-agent">
                                            <div class="agent-avatar">${task.agent ? task.agent.charAt(0).toUpperCase() : 'A'}</div>
                                            ${this.escapeHtml(task.agent || 'Unknown Agent')}
                                        </div>
                                    </div>
                                    <div class="timeline-meta">
                                        <div class="task-status" style="--status-color: ${this.getStatusColor(task.status)}">
                                            ${task.status}
                                        </div>
                                        <div class="task-time">
                                            ${this.formatTime(task.timestamp || task.created_at || task.updatedAt)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-icon">📋</div>
                        <div>No tasks found</div>
                    </div>
                `}
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

customElements.define('task-timeline', TaskTimeline);

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskTimeline;
}