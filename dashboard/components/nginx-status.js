class NginxStatusPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.refreshInterval = 5000; // 5s
        this.intervalId = null;
        this.isRunning = false;

        this.init();
        this.startPolling();
    }

    init() {
        this.container.innerHTML = `
            <div class="nginx-status-panel">
                <div class="panel-header">
                    <h3>🔧 Nginx Status</h3>
                    <button id="nginx-toggle" class="btn-small">⏸️ Pause</button>
                    <span id="nginx-last-update" class="timestamp">-</span>
                </div>

                <div class="status-grid">
                    <!-- Active Connections -->
                    <div class="status-card">
                        <div class="status-label">Aktive Verbindungen</div>
                        <div class="status-value" id="nginx-connections">-</div>
                        <div class="status-trend" id="nginx-connections-trend"></div>
                    </div>

                    <!-- Request Rate -->
                    <div class="status-card">
                        <div class="status-label">Request/s</div>
                        <div class="status-value" id="nginx-requests">-</div>
                        <div class="status-trend" id="nginx-requests-trend"></div>
                    </div>

                    <!-- Response Time -->
                    <div class="status-card">
                        <div class="status-label">Response Time</div>
                        <div class="status-value" id="nginx-response-time">-</div>
                        <div class="status-trend" id="nginx-response-trend"></div>
                    </div>

                    <!-- Upstream Health -->
                    <div class="status-card">
                        <div class="status-label">Upstream Health</div>
                        <div class="status-value" id="nginx-upstream">-</div>
                        <div class="status-indicator" id="nginx-upstream-status"></div>
                    </div>
                </div>

                <!-- Error Rate -->
                <div class="error-section">
                    <div class="error-row">
                        <span class="error-label">4xx Errors:</span>
                        <span id="nginx-4xx" class="error-count">0</span>
                        <span id="nginx-4xx-rate" class="error-rate">(0/s)</span>
                    </div>
                    <div class="error-row">
                        <span class="error-label">5xx Errors:</span>
                        <span id="nginx-5xx" class="error-count">0</span>
                        <span id="nginx-5xx-rate" class="error-rate">(0/s)</span>
                    </div>
                </div>

                <!-- Status Message -->
                <div class="status-message" id="nginx-status-msg">Lade Nginx-Status...</div>
            </div>
        `;

        // Event Listener für Toggle Button
        document.getElementById('nginx-toggle').addEventListener('click', () => {
            this.togglePolling();
        });

        this.addStyles();
    }

    async fetchNginxStats() {
        try {
            const response = await fetch('/api/v1/nginx/stats', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 3000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.updateDisplay(data);
            this.setStatus('✅ Nginx läuft normal', 'success');

        } catch (error) {
            console.error('Nginx Stats Error:', error);
            this.setStatus(`❌ Fehler: ${error.message}`, 'error');
            this.clearDisplay();
        }
    }

    updateDisplay(data) {
        const now = new Date().toLocaleTimeString('de-DE');
        document.getElementById('nginx-last-update').textContent = now;

        // Active Connections
        this.updateValue('nginx-connections', data.connections || 0);
        this.updateTrend('nginx-connections-trend', data.connections, this.lastConnections);
        this.lastConnections = data.connections;

        // Request Rate
        this.updateValue('nginx-requests', `${data.requestRate || 0}/s`);
        this.updateTrend('nginx-requests-trend', data.requestRate, this.lastRequestRate);
        this.lastRequestRate = data.requestRate;

        // Response Time
        const responseTime = data.avgResponseTime || 0;
        this.updateValue('nginx-response-time', `${responseTime}ms`);
        this.updateTrend('nginx-response-trend', responseTime, this.lastResponseTime);
        this.lastResponseTime = responseTime;

        // Upstream Health
        const upstreamStatus = data.upstream?.status || 'unknown';
        const upstreamText = data.upstream?.healthy ? '✅ Healthy' : '❌ Down';
        this.updateValue('nginx-upstream', upstreamText);

        const upstreamIndicator = document.getElementById('nginx-upstream-status');
        upstreamIndicator.className = `status-indicator ${data.upstream?.healthy ? 'healthy' : 'unhealthy'}`;

        // Error Rates
        this.updateValue('nginx-4xx', data.errors?.count4xx || 0);
        this.updateValue('nginx-4xx-rate', `(${data.errors?.rate4xx || 0}/s)`);
        this.updateValue('nginx-5xx', data.errors?.count5xx || 0);
        this.updateValue('nginx-5xx-rate', `(${data.errors?.rate5xx || 0}/s)`);

        // Highlight kritische Werte
        this.highlightCritical(data);
    }

    updateValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    updateTrend(elementId, current, previous) {
        const element = document.getElementById(elementId);
        if (!element || previous === undefined) return;

        const diff = current - previous;
        if (diff > 0) {
            element.textContent = '↗️';
            element.className = 'status-trend up';
        } else if (diff < 0) {
            element.textContent = '↘️';
            element.className = 'status-trend down';
        } else {
            element.textContent = '→';
            element.className = 'status-trend stable';
        }
    }

    highlightCritical(data) {
        // Kritische Werte hervorheben
        const connectionsEl = document.getElementById('nginx-connections');
        if (data.connections > 1000) {
            connectionsEl.className = 'status-value critical';
        } else if (data.connections > 500) {
            connectionsEl.className = 'status-value warning';
        } else {
            connectionsEl.className = 'status-value';
        }

        const responseTimeEl = document.getElementById('nginx-response-time');
        if (data.avgResponseTime > 2000) {
            responseTimeEl.className = 'status-value critical';
        } else if (data.avgResponseTime > 1000) {
            responseTimeEl.className = 'status-value warning';
        } else {
            responseTimeEl.className = 'status-value';
        }

        // Hohe Error-Rate
        const errorRate = (data.errors?.rate4xx || 0) + (data.errors?.rate5xx || 0);
        if (errorRate > 10) {
            document.querySelector('.error-section').className = 'error-section critical';
        } else if (errorRate > 5) {
            document.querySelector('.error-section').className = 'error-section warning';
        } else {
            document.querySelector('.error-section').className = 'error-section';
        }
    }

    clearDisplay() {
        this.updateValue('nginx-connections', '-');
        this.updateValue('nginx-requests', '-');
        this.updateValue('nginx-response-time', '-');
        this.updateValue('nginx-upstream', '-');
        this.updateValue('nginx-4xx', '0');
        this.updateValue('nginx-5xx', '0');
        this.updateValue('nginx-4xx-rate', '(0/s)');
        this.updateValue('nginx-5xx-rate', '(0/s)');
    }

    setStatus(message, type = 'info') {
        const statusEl = document.getElementById('nginx-status-msg');
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
    }

    startPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.isRunning = true;
        this.fetchNginxStats(); // Sofort laden

        this.intervalId = setInterval(() => {
            this.fetchNginxStats();
        }, this.refreshInterval);

        document.getElementById('nginx-toggle').textContent = '⏸️ Pause';
    }

    stopPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        document.getElementById('nginx-toggle').textContent = '▶️ Start';
        this.setStatus('⏸️ Polling gestoppt', 'warning');
    }

    togglePolling() {
        if (this.isRunning) {
            this.stopPolling();
        } else {
            this.startPolling();
        }
    }

    addStyles() {
        if (document.getElementById('nginx-status-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'nginx-status-styles';
        styles.textContent = `
            .nginx-status-panel {
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 16px;
                color: #fff;
                font-family: 'Monaco', 'Menlo', monospace;
                margin: 16px 0;
            }

            .panel-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid #333;
            }

            .panel-header h3 {
                margin: 0;
                color: #00ff88;
                font-size: 18px;
            }

            .btn-small {
                background: #333;
                border: 1px solid #555;
                color: #fff;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }

            .btn-small:hover {
                background: #555;
            }

            .timestamp {
                color: #888;
                font-size: 12px;
                margin-left: auto;
            }

            .status-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 12px;
                margin-bottom: 16px;
            }

            .status-card {
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                padding: 12px;
                text-align: center;
            }

            .status-label {
                color: #aaa;
                font-size: 12px;
                margin-bottom: 4px;
            }

            .status-value {
                font-size: 20px;
                font-weight: bold;
                color: #00ff88;
                margin-bottom: 4px;
            }

            .status-value.warning {
                color: #ff8800;
            }

            .status-value.critical {
                color: #ff0044;
                animation: blink 1s infinite;
            }

            .status-trend {
                font-size: 14px;
            }

            .status-trend.up {
                color: #ff8800;
            }

            .status-trend.down {
                color: #00ff88;
            }

            .status-trend.stable {
                color: #888;
            }

            .status-indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                display: inline-block;
                margin-left: 8px;
            }

            .status-indicator.healthy {
                background: #00ff88;
                box-shadow: 0 0 8px #00ff88;
            }

            .status-indicator.unhealthy {
                background: #ff0044;
                box-shadow: 0 0 8px #ff0044;
            }

            .error-section {
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 12px;
            }

            .error-section.warning {
                border-color: #ff8800;
                background: #2a1a00;
            }

            .error-section.critical {
                border-color: #ff0044;
                background: #2a0000;
                animation: pulse 2s infinite;
            }

            .error-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 4px 0;
            }

            .error-label {
                color: #aaa;
                font-size: 14px;
            }

            .error-count {
                color: #fff;
                font-weight: bold;
            }

            .error-rate {
                color: #888;
                font-size: 12px;
            }

            .status-message {
                padding: 8px;
                border-radius: 4px;
                text-align: center;
                font-size: 14px;
            }

            .status-message.success {
                background: #1a3a1a;
                color: #00ff88;
                border: 1px solid #00ff88;
            }

            .status-message.error {
                background: #3a1a1a;
                color: #ff0044;
                border: 1px solid #ff0044;
            }

            .status-message.warning {
                background: #3a2a1a;
                color: #ff8800;
                border: 1px solid #ff8800;
            }

            .status-message.info {
                background: #1a2a3a;
                color: #0088ff;
                border: 1px solid #0088ff;
            }

            @keyframes blink {
                50% { opacity: 0.5; }
            }

            @keyframes pulse {
                50% { opacity: 0.8; }
            }
        `;
        document.head.appendChild(styles);
    }

    destroy() {
        this.stopPolling();
        if (document.getElementById('nginx-status-styles')) {
            document.getElementById('nginx-status-styles').remove();
        }
    }
}

// Auto-Initialize wenn DOM bereit
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.nginxStatusPanel = new NginxStatusPanel('nginx-status-container');
    });
} else {
    window.nginxStatusPanel = new NginxStatusPanel('nginx-status-container');
}