/**
 * Model Status Monitor - Live WebSocket Health Dashboard
 * Überwacht Modell-Health in Echtzeit
 */

class ModelStatusMonitor {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.models = new Map();
        this.isConnected = false;
        this.healthCheckInterval = null;
        this.serverHealth = { status: 'unknown', responseTime: null, lastCheck: null };

        this.initializeUI();
        this.connect();
        this.startHealthMonitoring();

        // Auto-reconnect bei Page-Reload
        window.addEventListener('beforeunload', () => {
            if (this.ws) this.ws.close();
            if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        });
    }

    initializeUI() {
        // Status Container erstellen falls nicht vorhanden
        let container = document.getElementById('model-status-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'model-status-container';
            container.className = 'model-status-dashboard';
            document.body.appendChild(container);
        }

        container.innerHTML = `
            <div class="status-header">
                <h3>🤖 Model Health Monitor</h3>
                <div class="connection-status">
                    <span id="ws-status" class="status-offline">Disconnected</span>
                </div>
            </div>
            <div class="server-health" id="server-health">
                <div class="health-card">
                    <div class="health-title">Llama Server Health</div>
                    <div class="health-status" id="server-status">🔴 Unknown</div>
                    <div class="health-metrics" id="server-metrics">
                        <span id="server-response-time">Response: -ms</span>
                        <span id="server-last-check">Last: Never</span>
                    </div>
                </div>
            </div>
            <div class="models-grid" id="models-grid">
                <div class="loading">Connecting to WebSocket...</div>
            </div>
            <div class="status-actions">
                <button id="refresh-btn" onclick="modelMonitor.forceRefresh()">🔄 Refresh</button>
                <button id="clear-btn" onclick="modelMonitor.clearErrors()">🧹 Clear Errors</button>
                <button id="health-check-btn" onclick="modelMonitor.runHealthCheck()">⚡ Health Check</button>
            </div>
        `;

        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('model-status-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'model-status-styles';
        styles.textContent = `
            .model-status-dashboard {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 350px;
                background: #1e1e1e;
                border: 1px solid #333;
                border-radius: 8px;
                color: #fff;
                font-family: 'Monaco', 'Consolas', monospace;
                font-size: 12px;
                z-index: 9999;
                max-height: 80vh;
                overflow-y: auto;
            }

            .status-header {
                padding: 10px;
                border-bottom: 1px solid #333;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .status-header h3 {
                margin: 0;
                font-size: 14px;
            }

            .status-online { color: #00ff00; }
            .status-offline { color: #ff4444; }
            .status-warning { color: #ffaa00; }

            .server-health {
                padding: 10px;
                border-bottom: 1px solid #333;
            }

            .health-card {
                background: #2a2a2a;
                border-radius: 4px;
                padding: 8px;
                border-left: 4px solid #333;
            }

            .health-title {
                font-weight: bold;
                margin-bottom: 4px;
                font-size: 12px;
            }

            .health-status {
                font-size: 14px;
                margin-bottom: 4px;
            }

            .health-metrics {
                font-size: 10px;
                color: #aaa;
            }

            .health-metrics span {
                margin-right: 10px;
            }

            .models-grid {
                padding: 10px;
            }

            .model-card {
                background: #2a2a2a;
                border-radius: 4px;
                padding: 8px;
                margin-bottom: 8px;
                border-left: 4px solid #333;
            }

            .model-healthy { border-left-color: #00ff00; }
            .model-error { border-left-color: #ff4444; }
            .model-warning { border-left-color: #ffaa00; }
            .model-unknown { border-left-color: #666; }

            .model-name {
                font-weight: bold;
                margin-bottom: 4px;
            }

            .model-metrics {
                font-size: 10px;
                color: #aaa;
            }

            .model-metrics span {
                margin-right: 10px;
            }

            .status-actions {
                padding: 10px;
                border-top: 1px solid #333;
                text-align: center;
            }

            .status-actions button {
                background: #444;
                color: #fff;
                border: 1px solid #666;
                border-radius: 4px;
                padding: 5px 10px;
                margin: 0 5px;
                cursor: pointer;
                font-size: 11px;
            }

            .status-actions button:hover {
                background: #555;
            }

            .loading {
                text-align: center;
                color: #aaa;
                padding: 20px;
            }

            .error-log {
                background: #3a1a1a;
                border-radius: 4px;
                padding: 6px;
                margin-top: 4px;
                font-size: 10px;
                color: #ff9999;
            }
        `;

        document.head.appendChild(styles);
    }

    startHealthMonitoring() {
        // Initial health check
        this.runHealthCheck();

        // Set up periodic health checks every 30 seconds
        this.healthCheckInterval = setInterval(() => {
            this.runHealthCheck();
        }, 30000);
    }

    async runHealthCheck() {
        const startTime = performance.now();

        try {
            // Check llama server health
            const healthResponse = await fetch('/api/v1/models/health', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 10000
            });

            const endTime = performance.now();
            const responseTime = Math.round(endTime - startTime);

            if (healthResponse.ok) {
                const healthData = await healthResponse.json();

                this.serverHealth = {
                    status: 'healthy',
                    responseTime: responseTime,
                    lastCheck: new Date().toISOString(),
                    ...healthData
                };

                // Load available models from config
                try {
                    const configResponse = await fetch('/api/v1/models/config');
                    if (configResponse.ok) {
                        const configData = await configResponse.json();
                        this.updateConfigModels(configData.models || []);
                    }
                } catch (configErr) {
                    console.warn('[ModelStatus] Config fetch failed:', configErr);
                }

            } else {
                this.serverHealth = {
                    status: 'error',
                    responseTime: responseTime,
                    lastCheck: new Date().toISOString(),
                    error: `HTTP ${healthResponse.status}: ${healthResponse.statusText}`
                };
            }

        } catch (error) {
            this.serverHealth = {
                status: 'offline',
                responseTime: null,
                lastCheck: new Date().toISOString(),
                error: error.message || 'Connection failed'
            };
        }

        this.updateServerHealthUI();
    }

    updateConfigModels(configModels) {
        configModels.forEach(modelName => {
            if (!this.models.has(modelName)) {
                this.models.set(modelName, {
                    name: modelName,
                    status: 'available',
                    responseTime: null,
                    errorRate: 0,
                    uptime: 100,
                    lastCheck: new Date().toISOString(),
                    source: 'config'
                });
            }
        });

        this.renderModels(Array.from(this.models.values()));
    }

    updateServerHealthUI() {
        const statusElement = document.getElementById('server-status');
        const responseTimeElement = document.getElementById('server-response-time');
        const lastCheckElement = document.getElementById('server-last-check');
        const healthCard = document.querySelector('.health-card');

        if (!statusElement) return;

        const health = this.serverHealth;

        // Update status text and color
        switch (health.status) {
            case 'healthy':
                statusElement.textContent = '🟢 Healthy';
                statusElement.className = 'health-status status-online';
                healthCard.style.borderLeftColor = '#00ff00';
                break;
            case 'error':
                statusElement.textContent = '🟡 Error';
                statusElement.className = 'health-status status-warning';
                healthCard.style.borderLeftColor = '#ffaa00';
                break;
            case 'offline':
                statusElement.textContent = '🔴 Offline';
                statusElement.className = 'health-status status-offline';
                healthCard.style.borderLeftColor = '#ff4444';
                break;
            default:
                statusElement.textContent = '⚪ Unknown';
                statusElement.className = 'health-status';
                healthCard.style.borderLeftColor = '#666';
        }

        // Update metrics
        if (responseTimeElement) {
            const responseText = health.responseTime ? `${health.responseTime}ms` : 'N/A';
            responseTimeElement.textContent = `Response: ${responseText}`;
        }

        if (lastCheckElement) {
            const lastCheckText = health.lastCheck ?
                new Date(health.lastCheck).toLocaleTimeString() : 'Never';
            lastCheckElement.textContent = `Last: ${lastCheckText}`;
        }

        // Show error in console if present
        if (health.error) {
            console.error('[ModelStatus] Server health error:', health.error);
        }
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/model-status`;

        console.log('[ModelStatus] Connecting to:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[ModelStatus] WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateConnectionStatus(true);

                // Initial status request
                this.sendMessage({ type: 'get_status' });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (err) {
                    console.error('[ModelStatus] Parse error:', err);
                }
            };

            this.ws.onclose = () => {
                console.log('[ModelStatus] WebSocket disconnected');
                this.isConnected = false;
                this.updateConnectionStatus(false);
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[ModelStatus] WebSocket error:', error);
                this.updateConnectionStatus(false);
            };

        } catch (err) {
            console.error('[ModelStatus] Connection failed:', err);
            this.updateConnectionStatus(false);
            this.attemptReconnect();
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'model_status':
                this.updateModelStatus(data.models);
                break;
            case 'model_update':
                this.updateSingleModel(data.model);
                break;
            case 'server_health':
                if (data.health) {
                    this.serverHealth = { ...this.serverHealth, ...data.health };
                    this.updateServerHealthUI();
                }
                break;
            case 'inference_result':
                this.handleInferenceResult(data);
                break;
            case 'error':
                console.error('[ModelStatus] Server error:', data.error);
                this.addErrorToUI(data.error, data.source || 'Server');
                break;
            default:
                console.log('[ModelStatus] Unknown message:', data);
        }
    }

    handleInferenceResult(data) {
        if (data.model && data.responseTime) {
            const model = this.models.get(data.model);
            if (model) {
                model.responseTime = data.responseTime;
                model.lastInference = new Date().toISOString();
                model.status = data.success ? 'healthy' : 'error';
                if (data.error) {
                    model.lastError = data.error;
                }
                this.renderModels(Array.from(this.models.values()));
            }
        }
    }

    addErrorToUI(error, source) {
        // Add error notification to UI
        const grid = document.getElementById('models-grid');
        if (grid) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-notification';
            errorDiv.innerHTML = `
                <div style="background: #5a2d2d; padding: 8px; margin-bottom: 8px; border-radius: 4px; border-left: 4px solid #ff4444;">
                    <strong>[${source}]</strong> ${error}
                    <button onclick="this.parentElement.parentElement.remove()" style="float: right; background: none; border: none; color: #fff; cursor: pointer;">×</button>
                </div>
            `;
            grid.insertBefore(errorDiv, grid.firstChild);

            // Auto-remove after 10 seconds
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.remove();
                }
            }, 10000);
        }
    }

    updateModelStatus(models) {
        this.models.clear();

        if (!models || models.length === 0) {
            this.renderModels([]);
            return;
        }

        models.forEach(model => {
            this.models.set(model.name, model);
        });

        this.renderModels(Array.from(this.models.values()));
    }

    updateSingleModel(model) {
        this.models.set(model.name, model);
        this.renderModels(Array.from(this.models.values()));
    }

    renderModels(models) {
        const grid = document.getElementById('models-grid');
        if (!grid) return;

        if (models.length === 0) {
            grid.innerHTML = '<div class="loading">No models found</div>';
            return;
        }

        const html = models.map(model => {
            const statusClass = this.getStatusClass(model.status);
            const lastCheck = model.lastCheck ?
                new Date(model.lastCheck).toLocaleTimeString() : 'Never';

            const responseTime = model.responseTime ? `${model.responseTime}ms` : 'N/A';
            const errorRate = model.errorRate ? `${model.errorRate}%` : '0%';
            const uptime = model.uptime ? `${model.uptime}%` : 'N/A';

            let errorLog = '';
            if (model.lastError) {
                errorLog = `<div class="error-log">Error: ${model.lastError}</div>`;
            }

            return `
                <div class="model-card ${statusClass}">
                    <div class="model-name">${model.name}</div>
                    <div class="model-metrics">
                        <span>⏱️ ${responseTime}</span>
                        <span>❌ ${errorRate}</span>
                        <span>⬆️ ${uptime}</span>
                        <span>🕐 ${lastCheck}</span>
                    </div>
                    ${errorLog}
                </div>
            `;
        }).join('');

        grid.innerHTML = html;
    }

    getStatusClass(status) {
        switch (status) {
            case 'healthy': return 'model-healthy';
            case 'error': return 'model-error';
            case 'warning': return 'model-warning';
            default: return 'model-unknown';
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('ws-status');
        if (!statusElement) return;

        if (connected) {
            statusElement.textContent = 'Connected';
            statusElement.className = 'status-online';
        } else {
            statusElement.textContent = 'Disconnected';
            statusElement.className = 'status-offline';
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[ModelStatus] Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        console.log(`[ModelStatus] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('[ModelStatus] Cannot send message, not connected');
        }
    }

    forceRefresh() {
        console.log('[ModelStatus] Force refresh requested');
        this.sendMessage({ type: 'force_refresh' });
    }

    clearErrors() {
        console.log('[ModelStatus] Clear errors requested');
        this.sendMessage({ type: 'clear_errors' });

        // Lokale Errors auch clearen
        this.models.forEach(model => {
            if (model.lastError) {
                delete model.lastError;
            }
        });
        this.renderModels(Array.from(this.models.values()));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Auto-Initialize wenn DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.modelMonitor = new ModelStatusMonitor();
    console.log('[ModelStatus] Monitor initialized');
});

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelStatusMonitor;
}