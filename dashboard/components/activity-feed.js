// Activity Feed Component - Live WebSocket Events für Dashboard
// Marlene - Video/Medien Team BLUN.ai

class ActivityFeed {
    constructor() {
        this.events = [];
        this.maxEvents = 100;
        this.ws = null;
        this.element = null;
        this.init();
    }

    init() {
        this.createElement();
        this.connectWebSocket();
        this.bindEvents();
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'activity-feed';
        this.element.innerHTML = `
            <div class="activity-feed-header">
                <h3>🔥 Live Activity</h3>
                <div class="activity-status">
                    <span class="status-indicator offline"></span>
                    <span class="status-text">Connecting...</span>
                </div>
            </div>
            <div class="activity-list"></div>
        `;

        this.addStyles();
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .activity-feed {
                background: #1a1a1a;
                border-radius: 12px;
                padding: 20px;
                height: 400px;
                display: flex;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: #fff;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            }

            .activity-feed-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #333;
            }

            .activity-feed-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }

            .activity-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #999;
            }

            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #666;
                animation: pulse 2s infinite;
            }

            .status-indicator.online {
                background: #00ff88;
            }

            .status-indicator.offline {
                background: #ff4444;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .activity-list {
                flex: 1;
                overflow-y: auto;
                padding-right: 5px;
            }

            .activity-list::-webkit-scrollbar {
                width: 6px;
            }

            .activity-list::-webkit-scrollbar-track {
                background: #2a2a2a;
                border-radius: 3px;
            }

            .activity-list::-webkit-scrollbar-thumb {
                background: #555;
                border-radius: 3px;
            }

            .activity-item {
                padding: 12px;
                margin-bottom: 8px;
                background: #2a2a2a;
                border-radius: 8px;
                border-left: 3px solid #666;
                transition: all 0.3s ease;
                animation: fadeIn 0.5s ease;
            }

            .activity-item.new {
                border-left-color: #00ff88;
                background: rgba(0, 255, 136, 0.1);
            }

            .activity-item.task-completed {
                border-left-color: #00ff88;
            }

            .activity-item.tool-start {
                border-left-color: #ffaa00;
            }

            .activity-item.tool-result {
                border-left-color: #0088ff;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .activity-time {
                font-size: 11px;
                color: #888;
                margin-bottom: 4px;
            }

            .activity-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }

            .activity-agent {
                font-weight: 600;
                color: #00ff88;
                font-size: 13px;
            }

            .activity-type {
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 4px;
                background: rgba(255,255,255,0.1);
                color: #ccc;
            }

            .activity-description {
                font-size: 13px;
                color: #ccc;
                line-height: 1.4;
            }

            .activity-empty {
                text-align: center;
                color: #666;
                font-style: italic;
                margin-top: 50px;
            }
        `;
        document.head.appendChild(style);
    }

    connectWebSocket() {
        try {
            // WebSocket zur BLUN Server Verbindung
            this.ws = new WebSocket('ws://65.21.76.124:3200/ws');

            this.ws.onopen = () => {
                this.updateStatus('online', 'Connected');
                this.addEvent('system', 'connection', 'WebSocket connected to BLUN server');
            };

            this.ws.onclose = () => {
                this.updateStatus('offline', 'Disconnected');
                this.addEvent('system', 'connection', 'WebSocket connection lost');
            };

            this.ws.onerror = (error) => {
                this.updateStatus('offline', 'Error');
                this.addEvent('system', 'error', 'WebSocket connection error');
            };

            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };

        } catch (error) {
            this.updateStatus('offline', 'Failed to connect');
            this.addEvent('system', 'error', 'Failed to establish WebSocket connection');
        }
    }

    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Filter auf relevante Agent Events
            if (data.type === 'agent.task.completed') {
                this.addEvent(
                    data.agent || 'Unknown Agent',
                    'task-completed',
                    `Task completed: ${data.task || 'Unknown task'}`
                );
            }
            else if (data.type === 'agent.tool.start') {
                this.addEvent(
                    data.agent || 'Unknown Agent',
                    'tool-start',
                    `Started tool: ${data.tool || 'Unknown tool'}`
                );
            }
            else if (data.type === 'agent.tool.result') {
                this.addEvent(
                    data.agent || 'Unknown Agent',
                    'tool-result',
                    `Tool result: ${data.tool || 'Unknown tool'} - ${data.status || 'completed'}`
                );
            }

        } catch (error) {
            console.warn('Failed to parse WebSocket message:', error);
        }
    }

    addEvent(agent, type, description) {
        const event = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            agent: agent,
            type: type,
            description: description
        };

        // Neues Event am Anfang hinzufügen
        this.events.unshift(event);

        // Max 100 Events beibehalten
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
        }

        this.renderEvents();
    }

    renderEvents() {
        const listElement = this.element.querySelector('.activity-list');

        if (this.events.length === 0) {
            listElement.innerHTML = '<div class="activity-empty">No activity yet...</div>';
            return;
        }

        const eventsHTML = this.events.map(event => `
            <div class="activity-item ${event.type}" data-event-id="${event.id}">
                <div class="activity-time">${this.formatTime(event.timestamp)}</div>
                <div class="activity-header">
                    <span class="activity-agent">${this.escapeHtml(event.agent)}</span>
                    <span class="activity-type">${this.escapeHtml(event.type)}</span>
                </div>
                <div class="activity-description">${this.escapeHtml(event.description)}</div>
            </div>
        `).join('');

        listElement.innerHTML = eventsHTML;

        // Highlight neues Event kurz
        const firstItem = listElement.querySelector('.activity-item');
        if (firstItem) {
            firstItem.classList.add('new');
            setTimeout(() => {
                firstItem.classList.remove('new');
            }, 2000);
        }
    }

    updateStatus(status, text) {
        const indicator = this.element.querySelector('.status-indicator');
        const statusText = this.element.querySelector('.status-text');

        indicator.className = `status-indicator ${status}`;
        statusText.textContent = text;
    }

    formatTime(date) {
        return date.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    bindEvents() {
        // Auto-reconnect bei Verbindungsabbruch
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
                this.connectWebSocket();
            }
        }, 5000);
    }

    // Public API
    mount(parent) {
        parent.appendChild(this.element);
    }

    destroy() {
        if (this.ws) {
            this.ws.close();
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    // Simuliere Test-Events (für Entwicklung)
    simulateTestEvents() {
        const testEvents = [
            { agent: 'Marlene', type: 'task-completed', desc: 'Video component created successfully' },
            { agent: 'Dieter', type: 'tool-start', desc: 'Reading dashboard configuration' },
            { agent: 'Kai', type: 'tool-result', desc: 'Database query executed - 42 results' },
            { agent: 'System', type: 'tool-start', desc: 'Backup process initiated' }
        ];

        testEvents.forEach((event, index) => {
            setTimeout(() => {
                this.addEvent(event.agent, event.type, event.desc);
            }, index * 1000);
        });
    }
}

// Export für Verwendung im Dashboard
window.ActivityFeed = ActivityFeed;

// Auto-Initialize wenn DOM bereit ist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wird vom Dashboard geladen
    });
}