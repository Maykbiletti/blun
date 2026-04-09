/**
 * Storage Monitor Widget
 * Zeigt Live Storage-Auslastung mit Balkenanzeige und Warn-Threshold bei 80%
 *
 * @author Guenter - BLUN Infra Team
 * @date 2026-04-09
 */

class StorageMonitor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.refreshInterval = null;
        this.warnThreshold = 80; // Warn-Threshold bei 80%

        if (!this.container) {
            console.error('StorageMonitor: Container nicht gefunden:', containerId);
            return;
        }

        this.init();
    }

    init() {
        this.render();
        this.startAutoRefresh();
    }

    render() {
        this.container.innerHTML = `
            <div class="storage-monitor-widget">
                <div class="widget-header">
                    <h3>💾 Storage Monitor</h3>
                    <div class="refresh-indicator" id="storage-refresh-indicator">
                        <span class="loading-spinner">🔄</span>
                    </div>
                </div>
                <div class="storage-content" id="storage-content">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Lade Storage-Daten...</p>
                    </div>
                </div>
                <div class="widget-footer">
                    <small>Aktualisiert alle 30s | Warnung ab ${this.warnThreshold}%</small>
                </div>
            </div>

            <style>
                .storage-monitor-widget {
                    background: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 8px;
                    padding: 16px;
                    color: #e2e8f0;
                    font-family: 'Courier New', monospace;
                }

                .widget-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    border-bottom: 1px solid #334155;
                    padding-bottom: 8px;
                }

                .widget-header h3 {
                    margin: 0;
                    color: #60a5fa;
                    font-size: 16px;
                }

                .refresh-indicator {
                    font-size: 12px;
                    color: #94a3b8;
                }

                .loading-spinner {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .storage-content {
                    min-height: 120px;
                }

                .loading-state {
                    text-align: center;
                    padding: 20px;
                }

                .spinner {
                    border: 2px solid #334155;
                    border-top: 2px solid #60a5fa;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 10px;
                }

                .storage-item {
                    margin-bottom: 16px;
                    padding: 12px;
                    background: #0f172a;
                    border-radius: 6px;
                    border-left: 4px solid #60a5fa;
                }

                .storage-item.warning {
                    border-left-color: #f59e0b;
                }

                .storage-item.danger {
                    border-left-color: #ef4444;
                }

                .storage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .mount-point {
                    font-weight: bold;
                    color: #e2e8f0;
                }

                .usage-percent {
                    font-size: 14px;
                    font-weight: bold;
                }

                .usage-percent.normal { color: #22c55e; }
                .usage-percent.warning { color: #f59e0b; }
                .usage-percent.danger { color: #ef4444; }

                .progress-bar {
                    width: 100%;
                    height: 8px;
                    background: #334155;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }

                .progress-fill {
                    height: 100%;
                    transition: width 0.3s ease;
                    border-radius: 4px;
                }

                .progress-fill.normal { background: #22c55e; }
                .progress-fill.warning { background: #f59e0b; }
                .progress-fill.danger { background: #ef4444; }

                .storage-details {
                    font-size: 12px;
                    color: #94a3b8;
                    display: flex;
                    justify-content: space-between;
                }

                .error-state {
                    text-align: center;
                    padding: 20px;
                    color: #ef4444;
                }

                .widget-footer {
                    margin-top: 16px;
                    padding-top: 8px;
                    border-top: 1px solid #334155;
                    text-align: center;
                    color: #64748b;
                }
            </style>
        `;

        this.loadStorageData();
    }

    async loadStorageData() {
        const refreshIndicator = document.getElementById('storage-refresh-indicator');
        const content = document.getElementById('storage-content');

        try {
            if (refreshIndicator) {
                refreshIndicator.style.display = 'block';
            }

            const response = await fetch('/api/v1/storage/status');

            if (!response.ok) {
                throw new Error(`Storage API Error: ${response.status}`);
            }

            const data = await response.json();
            this.renderStorageData(data);

        } catch (error) {
            console.error('Storage Monitor Error:', error);
            this.renderError(error.message);
        } finally {
            if (refreshIndicator) {
                refreshIndicator.style.display = 'none';
            }
        }
    }

    renderStorageData(data) {
        const content = document.getElementById('storage-content');

        if (!data.mountPoints || data.mountPoints.length === 0) {
            this.renderError('Keine Mount Points gefunden');
            return;
        }

        const storageHtml = data.mountPoints.map(mount => {
            const usagePercent = Math.round((mount.used / mount.total) * 100);
            const status = this.getStatusLevel(usagePercent);

            return `
                <div class="storage-item ${status}">
                    <div class="storage-header">
                        <span class="mount-point">${mount.mountPoint || '/'}</span>
                        <span class="usage-percent ${status}">${usagePercent}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${status}" style="width: ${usagePercent}%"></div>
                    </div>
                    <div class="storage-details">
                        <span>Verwendet: ${this.formatBytes(mount.used)}</span>
                        <span>Verfügbar: ${this.formatBytes(mount.available)}</span>
                        <span>Total: ${this.formatBytes(mount.total)}</span>
                    </div>
                </div>
            `;
        }).join('');

        content.innerHTML = storageHtml;
    }

    renderError(errorMessage) {
        const content = document.getElementById('storage-content');
        content.innerHTML = `
            <div class="error-state">
                <p>⚠️ Fehler beim Laden der Storage-Daten</p>
                <small>${errorMessage}</small>
            </div>
        `;
    }

    getStatusLevel(percent) {
        if (percent >= 90) return 'danger';
        if (percent >= this.warnThreshold) return 'warning';
        return 'normal';
    }

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    startAutoRefresh() {
        // Initial Load
        this.loadStorageData();

        // Auto-Refresh alle 30 Sekunden
        this.refreshInterval = setInterval(() => {
            this.loadStorageData();
        }, 30000);
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Widget automatisch verfügbar machen
window.StorageMonitor = StorageMonitor;

// Auto-Init wenn DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Widget kann manuell initialisiert werden:
    // const storageWidget = new StorageMonitor('storage-monitor-container');
});