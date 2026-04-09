/**
 * Real-time Agent Status Dashboard
 * WebSocket-basiertes Agent Monitoring System
 */
class AgentMonitor {
    constructor() {
        this.ws = null;
        this.agents = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;

        this.initializeDOM();
        this.connect();
        this.bindEvents();
    }

    initializeDOM() {
        // Create monitoring container if not exists
        if (!document.getElementById('agent-monitor')) {
            const container = document.createElement('div');
            container.id = 'agent-monitor';
            container.className = 'agent-monitor-container';
            document.body.appendChild(container);
        }

        this.renderInterface();
    }

    renderInterface() {
        const container = document.getElementById('agent-monitor');
        container.innerHTML = `
            <div class="agent-monitor-header">
                <h2><i class="fas fa-robot"></i> Agent Status Monitor</h2>
                <div class="connection-status">
                    <span class="status-indicator offline" id="connection-status"></span>
                    <span id="connection-text">Connecting...</span>
                </div>
                <button id="refresh-btn" class="btn-refresh"><i class="fas fa-sync-alt"></i></button>
            </div>

            <div class="agent-stats">
                <div class="stat-card">
                    <span class="stat-value" id="total-agents">0</span>
                    <span class="stat-label">Total Agents</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value active" id="active-agents">0</span>
                    <span class="stat-label">Active</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value idle" id="idle-agents">0</span>
                    <span class="stat-label">Idle</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value error" id="error-agents">0</span>
                    <span class="stat-label">Error</span>
                </div>
            </div>

            <div class="agent-list" id="agent-list">
                <div class="no-agents">
                    <i class="fas fa-robot"></i>
                    <p>No agents connected</p>
                </div>
            </div>
        `;

        this.injectStyles();
    }

    injectStyles() {
        if (document.getElementById('agent-monitor-styles')) return;

        const style = document.createElement('style');
        style.id = 'agent-monitor-styles';
        style.textContent = `
            .agent-monitor-container {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                max-height: 80vh;
                background: #1a1a1a;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: 'Inter', system-ui, sans-serif;
                overflow: hidden;
                border: 1px solid #333;
            }

            .agent-monitor-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .agent-monitor-header h2 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .connection-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
            }

            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }

            .status-indicator.online {
                background: #10b981;
            }

            .status-indicator.offline {
                background: #ef4444;
            }

            .btn-refresh {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 6px;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .btn-refresh:hover {
                background: rgba(255,255,255,0.3);
            }

            .agent-stats {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 1px;
                background: #333;
                margin: 16px;
                border-radius: 8px;
                overflow: hidden;
            }

            .stat-card {
                background: #2a2a2a;
                padding: 12px;
                text-align: center;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .stat-value {
                font-size: 18px;
                font-weight: 700;
                color: #fff;
            }

            .stat-value.active {
                color: #10b981;
            }

            .stat-value.idle {
                color: #f59e0b;
            }

            .stat-value.error {
                color: #ef4444;
            }

            .stat-label {
                font-size: 11px;
                color: #888;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .agent-list {
                max-height: 400px;
                overflow-y: auto;
                padding: 0 16px 16px;
            }

            .no-agents {
                text-align: center;
                color: #666;
                padding: 40px 20px;
            }

            .no-agents i {
                font-size: 32px;
                margin-bottom: 12px;
                display: block;
            }

            .agent-item {
                background: #2a2a2a;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                transition: background 0.2s;
            }

            .agent-item:hover {
                background: #333;
            }

            .agent-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex-grow: 1;
            }

            .agent-name {
                color: #fff;
                font-weight: 600;
                font-size: 14px;
            }

            .agent-details {
                font-size: 12px;
                color: #888;
            }

            .agent-status {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .status-active {
                background: rgba(16, 185, 129, 0.2);
                color: #10b981;
                border: 1px solid #10b981;
            }

            .status-idle {
                background: rgba(245, 158, 11, 0.2);
                color: #f59e0b;
                border: 1px solid #f59e0b;
            }

            .status-error {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
                border: 1px solid #ef4444;
            }

            .status-offline {
                background: rgba(107, 114, 128, 0.2);
                color: #6b7280;
                border: 1px solid #6b7280;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            /* Scrollbar */
            .agent-list::-webkit-scrollbar {
                width: 6px;
            }

            .agent-list::-webkit-scrollbar-track {
                background: #1a1a1a;
            }

            .agent-list::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            this.ws = new WebSocket(`ws://localhost:3200/agent-monitor`);

            this.ws.onopen = () => {
                console.log('[AgentMonitor] WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateConnectionStatus(true);
                this.requestAgentList();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('[AgentMonitor] Failed to parse message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('[AgentMonitor] WebSocket disconnected');
                this.isConnected = false;
                this.updateConnectionStatus(false);
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[AgentMonitor] WebSocket error:', error);
            };

        } catch (error) {
            console.error('[AgentMonitor] Connection failed:', error);
            this.attemptReconnect();
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'agent-list':
                this.updateAgentList(data.agents);
                break;
            case 'agent-status':
                this.updateAgentStatus(data.agentId, data.status);
                break;
            case 'agent-connected':
                this.addAgent(data.agent);
                break;
            case 'agent-disconnected':
                this.removeAgent(data.agentId);
                break;
            case 'agent-task-start':
                this.updateAgentTask(data.agentId, data.task);
                break;
            case 'agent-task-complete':
                this.clearAgentTask(data.agentId);
                break;
            default:
                console.log('[AgentMonitor] Unknown message type:', data.type);
        }
    }

    updateAgentList(agents) {
        this.agents.clear();
        agents.forEach(agent => {
            this.agents.set(agent.id, agent);
        });
        this.renderAgentList();
        this.updateStats();
    }

    updateAgentStatus(agentId, status) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = status;
            agent.lastSeen = Date.now();
            this.renderAgentList();
            this.updateStats();
        }
    }

    addAgent(agent) {
        this.agents.set(agent.id, agent);
        this.renderAgentList();
        this.updateStats();
    }

    removeAgent(agentId) {
        this.agents.delete(agentId);
        this.renderAgentList();
        this.updateStats();
    }

    updateAgentTask(agentId, task) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.currentTask = task;
            agent.status = 'active';
            this.renderAgentList();
            this.updateStats();
        }
    }

    clearAgentTask(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.currentTask = null;
            agent.status = 'idle';
            this.renderAgentList();
            this.updateStats();
        }
    }

    renderAgentList() {
        const container = document.getElementById('agent-list');

        if (this.agents.size === 0) {
            container.innerHTML = `
                <div class="no-agents">
                    <i class="fas fa-robot"></i>
                    <p>No agents connected</p>
                </div>
            `;
            return;
        }

        container.innerHTML = Array.from(this.agents.values()).map(agent => {
            const statusClass = `status-${agent.status}`;
            const lastSeen = agent.lastSeen ? new Date(agent.lastSeen).toLocaleTimeString() : 'Never';
            const currentTask = agent.currentTask ? `Task: ${agent.currentTask.substring(0, 30)}...` : 'Idle';

            return `
                <div class="agent-item">
                    <div class="agent-info">
                        <div class="agent-name">${agent.name || agent.id}</div>
                        <div class="agent-details">
                            ${currentTask} • Last seen: ${lastSeen}
                        </div>
                    </div>
                    <div class="agent-status ${statusClass}">
                        ${agent.status}
                    </div>
                </div>
            `;
        }).join('');
    }

    updateStats() {
        const stats = {
            total: this.agents.size,
            active: 0,
            idle: 0,
            error: 0
        };

        this.agents.forEach(agent => {
            switch (agent.status) {
                case 'active':
                    stats.active++;
                    break;
                case 'idle':
                    stats.idle++;
                    break;
                case 'error':
                    stats.error++;
                    break;
            }
        });

        document.getElementById('total-agents').textContent = stats.total;
        document.getElementById('active-agents').textContent = stats.active;
        document.getElementById('idle-agents').textContent = stats.idle;
        document.getElementById('error-agents').textContent = stats.error;
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connection-status');
        const text = document.getElementById('connection-text');

        if (connected) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Disconnected';
        }
    }

    requestAgentList() {
        if (this.isConnected) {
            this.ws.send(JSON.stringify({ type: 'get-agents' }));
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[AgentMonitor] Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        console.log(`[AgentMonitor] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }

    bindEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.requestAgentList();
            }
        });

        // Auto refresh every 30 seconds
        setInterval(() => {
            if (this.isConnected) {
                this.requestAgentList();
            }
        }, 30000);
    }

    // Public methods
    show() {
        document.getElementById('agent-monitor').style.display = 'block';
    }

    hide() {
        document.getElementById('agent-monitor').style.display = 'none';
    }

    toggle() {
        const container = document.getElementById('agent-monitor');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }

    destroy() {
        if (this.ws) {
            this.ws.close();
        }
        const container = document.getElementById('agent-monitor');
        if (container) {
            container.remove();
        }
        const styles = document.getElementById('agent-monitor-styles');
        if (styles) {
            styles.remove();
        }
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.agentMonitor = new AgentMonitor();
    });
} else {
    window.agentMonitor = new AgentMonitor();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AgentMonitor;
}