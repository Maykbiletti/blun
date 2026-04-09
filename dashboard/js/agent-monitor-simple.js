/**
 * Einfacher Agent Status Monitor
 * HTTP-basiertes Agent Monitoring ohne WebSocket
 */
class SimpleAgentMonitor {
    constructor() {
        this.agents = new Map();
        this.pollInterval = 5000; // 5 Sekunden
        this.polling = false;

        this.initializeDOM();
        this.startPolling();
        this.bindEvents();
    }

    initializeDOM() {
        // Create monitoring container if not exists
        if (!document.getElementById('simple-agent-monitor')) {
            const container = document.createElement('div');
            container.id = 'simple-agent-monitor';
            container.className = 'simple-monitor-container';
            document.body.appendChild(container);
        }

        this.renderInterface();
    }

    renderInterface() {
        const container = document.getElementById('simple-agent-monitor');
        container.innerHTML = `
            <div class="monitor-header">
                <h3>🤖 Agent Monitor</h3>
                <div class="status-info">
                    <span id="last-update">Never updated</span>
                    <button id="refresh-now">↻</button>
                </div>
            </div>

            <div class="stats-row">
                <div class="stat">
                    <div class="stat-num" id="total">0</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat active">
                    <div class="stat-num" id="active">0</div>
                    <div class="stat-label">Active</div>
                </div>
                <div class="stat idle">
                    <div class="stat-num" id="idle">0</div>
                    <div class="stat-label">Idle</div>
                </div>
                <div class="stat error">
                    <div class="stat-num" id="error">0</div>
                    <div class="stat-label">Error</div>
                </div>
            </div>

            <div class="agent-grid" id="agent-grid">
                <div class="no-data">No agents found</div>
            </div>
        `;

        this.injectSimpleStyles();
    }

    injectSimpleStyles() {
        if (document.getElementById('simple-monitor-styles')) return;

        const style = document.createElement('style');
        style.id = 'simple-monitor-styles';
        style.textContent = `
            .simple-monitor-container {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 350px;
                background: #2a2a2a;
                color: #fff;
                border-radius: 8px;
                border: 1px solid #444;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 9999;
                font-family: system-ui, sans-serif;
            }

            .monitor-header {
                padding: 12px 16px;
                background: #333;
                border-radius: 7px 7px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #444;
            }

            .monitor-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
            }

            .status-info {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                color: #aaa;
            }

            #refresh-now {
                background: #444;
                border: none;
                color: #fff;
                padding: 4px 6px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
            }

            #refresh-now:hover {
                background: #555;
            }

            .stats-row {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 1px;
                background: #444;
                margin: 12px;
                border-radius: 4px;
                overflow: hidden;
            }

            .stat {
                background: #333;
                padding: 8px;
                text-align: center;
                min-height: 50px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 2px;
            }

            .stat-num {
                font-size: 16px;
                font-weight: bold;
                color: #fff;
            }

            .stat.active .stat-num {
                color: #22c55e;
            }

            .stat.idle .stat-num {
                color: #eab308;
            }

            .stat.error .stat-num {
                color: #ef4444;
            }

            .stat-label {
                font-size: 10px;
                color: #aaa;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .agent-grid {
                padding: 12px;
                max-height: 200px;
                overflow-y: auto;
            }

            .no-data {
                text-align: center;
                color: #666;
                padding: 20px;
                font-style: italic;
            }

            .agent-row {
                background: #333;
                margin-bottom: 6px;
                padding: 8px 10px;
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 13px;
            }

            .agent-name {
                font-weight: 500;
                color: #fff;
            }

            .agent-status {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
            }

            .agent-status.active {
                background: rgba(34, 197, 94, 0.2);
                color: #22c55e;
            }

            .agent-status.idle {
                background: rgba(234, 179, 8, 0.2);
                color: #eab308;
            }

            .agent-status.error {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .agent-grid::-webkit-scrollbar {
                width: 4px;
            }

            .agent-grid::-webkit-scrollbar-thumb {
                background: #555;
                border-radius: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    async fetchAgentData() {
        try {
            // Simuliere Agent-Daten da kein echter Backend-Endpoint
            const mockData = this.generateMockData();
            this.updateDisplay(mockData);
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('[SimpleAgentMonitor] Fetch error:', error);
            this.updateLastUpdateTime('Error');
        }
    }

    generateMockData() {
        // Mock-Daten für Demo-Zwecke
        return {
            agents: [
                { id: 'agent-1', name: 'Heinrich', status: 'active', lastTask: 'Building dashboard component' },
                { id: 'agent-2', name: 'Greta', status: 'idle', lastTask: 'Completed architecture review' },
                { id: 'agent-3', name: 'Dieter', status: 'active', lastTask: 'Deploying to server' },
                { id: 'agent-4', name: 'Agent-X', status: 'error', lastTask: 'Connection timeout' }
            ]
        };
    }

    updateDisplay(data) {
        // Update stats
        const stats = this.calculateStats(data.agents);
        document.getElementById('total').textContent = stats.total;
        document.getElementById('active').textContent = stats.active;
        document.getElementById('idle').textContent = stats.idle;
        document.getElementById('error').textContent = stats.error;

        // Update agent list
        this.renderAgentGrid(data.agents);
    }

    calculateStats(agents) {
        const stats = { total: agents.length, active: 0, idle: 0, error: 0 };

        agents.forEach(agent => {
            if (stats[agent.status] !== undefined) {
                stats[agent.status]++;
            }
        });

        return stats;
    }

    renderAgentGrid(agents) {
        const grid = document.getElementById('agent-grid');

        if (agents.length === 0) {
            grid.innerHTML = '<div class="no-data">No agents found</div>';
            return;
        }

        grid.innerHTML = agents.map(agent => `
            <div class="agent-row">
                <span class="agent-name">${agent.name}</span>
                <span class="agent-status ${agent.status}">${agent.status}</span>
            </div>
        `).join('');
    }

    updateLastUpdateTime(status = null) {
        const element = document.getElementById('last-update');
        if (status === 'Error') {
            element.textContent = 'Update failed';
            element.style.color = '#ef4444';
        } else {
            element.textContent = new Date().toLocaleTimeString();
            element.style.color = '#aaa';
        }
    }

    startPolling() {
        if (this.polling) return;

        this.polling = true;
        this.fetchAgentData(); // Initial fetch

        this.pollTimer = setInterval(() => {
            this.fetchAgentData();
        }, this.pollInterval);
    }

    stopPolling() {
        this.polling = false;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    bindEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-now') {
                this.fetchAgentData();
            }
        });
    }

    // Public methods
    show() {
        document.getElementById('simple-agent-monitor').style.display = 'block';
        this.startPolling();
    }

    hide() {
        document.getElementById('simple-agent-monitor').style.display = 'none';
        this.stopPolling();
    }

    destroy() {
        this.stopPolling();
        const container = document.getElementById('simple-agent-monitor');
        if (container) container.remove();
        const styles = document.getElementById('simple-monitor-styles');
        if (styles) styles.remove();
    }
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.simpleAgentMonitor = new SimpleAgentMonitor();
    });
} else {
    window.simpleAgentMonitor = new SimpleAgentMonitor();
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleAgentMonitor;
}