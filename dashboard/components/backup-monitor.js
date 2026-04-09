/**
 * Backup Monitor Widget - Guenter
 * Zeigt letzten Backup Status, Größe, Zeitstempel mit Auto-Refresh
 */

class BackupMonitor {
    constructor() {
        this.refreshInterval = 60000; // 60 Sekunden
        this.intervalId = null;
        this.init();
    }

    init() {
        this.render();
        this.startAutoRefresh();
        this.fetchBackupStatus(); // Sofortiger erster Load
    }

    render() {
        const widget = document.createElement('div');
        widget.className = 'backup-monitor-widget';
        widget.innerHTML = `
            <div class="widget-header">
                <h3>🗄️ Backup Monitor</h3>
                <span class="refresh-indicator">●</span>
            </div>
            <div class="backup-status-container">
                <div class="backup-info">
                    <div class="last-backup">
                        <label>Letzter Backup:</label>
                        <span id="last-backup-time">Lade...</span>
                    </div>
                    <div class="backup-size">
                        <label>Größe:</label>
                        <span id="backup-size">-</span>
                    </div>
                    <div class="backup-status">
                        <label>Status:</label>
                        <span id="backup-status-text" class="status-badge">-</span>
                    </div>
                </div>
                <div class="backup-progress">
                    <div class="progress-bar">
                        <div id="backup-health-bar" class="progress-fill"></div>
                    </div>
                    <small id="backup-details">Backup-Details werden geladen...</small>
                </div>
            </div>
            <div class="backup-actions">
                <button id="refresh-backup" class="btn-small">🔄 Aktualisieren</button>
                <button id="trigger-backup" class="btn-small">▶️ Backup starten</button>
            </div>
        `;

        // Widget CSS einbetten
        this.injectStyles();

        // Event Listeners
        widget.querySelector('#refresh-backup').addEventListener('click', () => {
            this.fetchBackupStatus();
        });

        widget.querySelector('#trigger-backup').addEventListener('click', () => {
            this.triggerBackup();
        });

        // Widget zum Dashboard hinzufügen
        const container = document.querySelector('.dashboard-widgets') || document.body;
        container.appendChild(widget);
    }

    async fetchBackupStatus() {
        try {
            this.updateRefreshIndicator(true);

            const response = await fetch('/api/backup-status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.updateBackupDisplay(data);

        } catch (error) {
            console.error('Backup Status Fehler:', error);
            this.showError('Fehler beim Laden der Backup-Daten');
        } finally {
            this.updateRefreshIndicator(false);
        }
    }

    updateBackupDisplay(data) {
        // Zeitstempel formatieren
        const lastBackupElement = document.getElementById('last-backup-time');
        if (data.lastBackup) {
            const date = new Date(data.lastBackup);
            lastBackupElement.textContent = this.formatDate(date);

            // Alter berechnen für Health-Check
            const hoursOld = (Date.now() - date.getTime()) / (1000 * 60 * 60);
            this.updateHealthBar(hoursOld);
        } else {
            lastBackupElement.textContent = 'Kein Backup gefunden';
            this.updateHealthBar(999); // Kritisch
        }

        // Backup-Größe
        const sizeElement = document.getElementById('backup-size');
        sizeElement.textContent = data.size ? this.formatBytes(data.size) : 'Unbekannt';

        // Status Badge
        const statusElement = document.getElementById('backup-status-text');
        statusElement.textContent = data.status || 'Unbekannt';
        statusElement.className = `status-badge status-${(data.status || 'unknown').toLowerCase()}`;

        // Details aktualisieren
        const detailsElement = document.getElementById('backup-details');
        const details = [];
        if (data.type) details.push(`Typ: ${data.type}`);
        if (data.compression) details.push(`Komprimierung: ${data.compression}`);
        if (data.location) details.push(`Ort: ${data.location}`);

        detailsElement.textContent = details.join(' • ') || 'Keine weiteren Details verfügbar';
    }

    updateHealthBar(hoursOld) {
        const healthBar = document.getElementById('backup-health-bar');
        let percentage = 100;
        let color = '#4CAF50'; // Grün
        let status = 'Aktuell';

        if (hoursOld > 72) { // Über 3 Tage
            percentage = 20;
            color = '#f44336'; // Rot
            status = 'Kritisch veraltet';
        } else if (hoursOld > 48) { // Über 2 Tage
            percentage = 40;
            color = '#ff9800'; // Orange
            status = 'Veraltet';
        } else if (hoursOld > 24) { // Über 1 Tag
            percentage = 70;
            color = '#ffc107'; // Gelb
            status = 'Sollte aktualisiert werden';
        }

        healthBar.style.width = `${percentage}%`;
        healthBar.style.backgroundColor = color;

        // Status-Text aktualisieren
        const detailsElement = document.getElementById('backup-details');
        const currentText = detailsElement.textContent;
        if (!currentText.includes('•')) {
            detailsElement.textContent = `Status: ${status}`;
        } else {
            detailsElement.textContent = `Status: ${status} • ${currentText}`;
        }
    }

    async triggerBackup() {
        try {
            const triggerBtn = document.getElementById('trigger-backup');
            triggerBtn.disabled = true;
            triggerBtn.textContent = '⏳ Startet...';

            const response = await fetch('/api/backup-trigger', {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            // Erfolgs-Feedback
            triggerBtn.textContent = '✅ Gestartet';
            setTimeout(() => {
                triggerBtn.disabled = false;
                triggerBtn.textContent = '▶️ Backup starten';
            }, 2000);

            // Status nach 5 Sekunden aktualisieren
            setTimeout(() => this.fetchBackupStatus(), 5000);

        } catch (error) {
            console.error('Backup Trigger Fehler:', error);
            const triggerBtn = document.getElementById('trigger-backup');
            triggerBtn.textContent = '❌ Fehler';
            setTimeout(() => {
                triggerBtn.disabled = false;
                triggerBtn.textContent = '▶️ Backup starten';
            }, 3000);
        }
    }

    showError(message) {
        document.getElementById('last-backup-time').textContent = 'Fehler';
        document.getElementById('backup-size').textContent = '-';
        document.getElementById('backup-status-text').textContent = message;
        document.getElementById('backup-status-text').className = 'status-badge status-error';
        document.getElementById('backup-details').textContent = 'Verbindung zum Server fehlgeschlagen';
    }

    updateRefreshIndicator(loading) {
        const indicator = document.querySelector('.refresh-indicator');
        if (loading) {
            indicator.style.color = '#ff9800';
            indicator.style.animation = 'pulse 1s infinite';
        } else {
            indicator.style.color = '#4CAF50';
            indicator.style.animation = 'none';
        }
    }

    startAutoRefresh() {
        // Altes Interval clearen falls vorhanden
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        // Neues Interval starten
        this.intervalId = setInterval(() => {
            this.fetchBackupStatus();
        }, this.refreshInterval);
    }

    stopAutoRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(date) {
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };
        return date.toLocaleDateString('de-DE', options);
    }

    injectStyles() {
        if (document.getElementById('backup-monitor-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'backup-monitor-styles';
        styles.textContent = `
            .backup-monitor-widget {
                background: #fff;
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                margin: 16px 0;
                min-width: 320px;
            }

            .widget-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                border-bottom: 1px solid #eee;
                padding-bottom: 8px;
            }

            .widget-header h3 {
                margin: 0;
                color: #333;
                font-size: 16px;
            }

            .refresh-indicator {
                font-size: 12px;
                color: #4CAF50;
            }

            .backup-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 16px;
            }

            .backup-info > div {
                display: flex;
                flex-direction: column;
            }

            .backup-info label {
                font-size: 12px;
                color: #666;
                margin-bottom: 4px;
            }

            .backup-info span {
                font-size: 14px;
                font-weight: 500;
                color: #333;
            }

            .status-badge {
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px !important;
                font-weight: 600 !important;
            }

            .status-success { background: #e8f5e8; color: #2e7d32; }
            .status-failed, .status-error { background: #fdeaea; color: #c62828; }
            .status-running { background: #fff3e0; color: #f57c00; }
            .status-unknown { background: #f5f5f5; color: #616161; }

            .backup-progress {
                margin-bottom: 16px;
            }

            .progress-bar {
                width: 100%;
                height: 8px;
                background: #f0f0f0;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 8px;
            }

            .progress-fill {
                height: 100%;
                transition: width 0.3s ease, background-color 0.3s ease;
                border-radius: 4px;
            }

            .backup-actions {
                display: flex;
                gap: 8px;
            }

            .btn-small {
                padding: 6px 12px;
                border: 1px solid #ddd;
                background: #fff;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }

            .btn-small:hover {
                background: #f5f5f5;
                border-color: #999;
            }

            .btn-small:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            #backup-details {
                color: #666;
                font-size: 11px;
                line-height: 1.3;
            }
        `;

        document.head.appendChild(styles);
    }

    // Cleanup beim Zerstören der Komponente
    destroy() {
        this.stopAutoRefresh();
        const widget = document.querySelector('.backup-monitor-widget');
        if (widget) {
            widget.remove();
        }
    }
}

// Auto-Initialisierung wenn DOM bereit ist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.backupMonitor = new BackupMonitor();
    });
} else {
    window.backupMonitor = new BackupMonitor();
}

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackupMonitor;
}