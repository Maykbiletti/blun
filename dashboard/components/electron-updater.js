/**
 * Electron Auto-Updater UI Component
 * Version-Check, Download-Progress, Install & Restart
 */

class ElectronUpdater {
    constructor() {
        this.currentVersion = window.electronAPI?.app?.getVersion() || '1.0.0';
        this.isElectron = window.electronAPI !== undefined;
        this.isChecking = false;
        this.isDownloading = false;
        this.updateAvailable = false;
        this.remoteVersion = null;

        this.bindEvents();
        this.render();

        // Auto-check on startup (delayed)
        setTimeout(() => this.checkForUpdates(), 3000);
    }

    bindEvents() {
        if (!this.isElectron) return;

        // Electron IPC Events
        window.electronAPI.updater?.onUpdateAvailable((info) => {
            this.updateAvailable = true;
            this.remoteVersion = info.version;
            this.isChecking = false;
            this.render();
        });

        window.electronAPI.updater?.onDownloadProgress((progress) => {
            this.updateProgressBar(progress.percent);
        });

        window.electronAPI.updater?.onUpdateDownloaded(() => {
            this.isDownloading = false;
            this.showRestartPrompt();
        });
    }

    async checkForUpdates() {
        if (!this.isElectron || this.isChecking) return;

        this.isChecking = true;
        this.render();

        try {
            const response = await fetch('/api/v1/version');
            const data = await response.json();

            if (!data.ok || !data.version) {
                throw new Error('Version API failed');
            }

            this.remoteVersion = data.version;

            if (this.isNewVersionAvailable(data.version)) {
                this.updateAvailable = true;
            }

            this.isChecking = false;
            this.render();

        } catch (error) {
            console.error('Update check failed:', error);
            this.isChecking = false;
            this.render();
        }
    }

    isNewVersionAvailable(remoteVersion) {
        // Simple version comparison (major.minor.patch)
        const current = this.currentVersion.split('.').map(Number);
        const remote = remoteVersion.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if (remote[i] > current[i]) return true;
            if (remote[i] < current[i]) return false;
        }
        return false;
    }

    async downloadUpdate() {
        if (!this.isElectron || this.isDownloading) return;

        this.isDownloading = true;
        this.render();

        try {
            await window.electronAPI.updater?.downloadUpdate();
        } catch (error) {
            console.error('Download failed:', error);
            this.isDownloading = false;
            this.render();
        }
    }

    updateProgressBar(percent) {
        const progressBar = document.querySelector('.updater-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.textContent = `${Math.round(percent)}%`;
        }
    }

    showRestartPrompt() {
        const container = document.querySelector('.electron-updater');
        if (!container) return;

        container.innerHTML = `
            <div class="update-restart-prompt">
                <h4>🎉 Update bereit!</h4>
                <p>Version ${this.remoteVersion} wurde heruntergeladen.</p>
                <button class="btn-restart" onclick="window.electronUpdater.restartApp()">
                    ↻ Jetzt neustarten
                </button>
                <button class="btn-later" onclick="window.electronUpdater.render()">
                    ⏰ Später
                </button>
            </div>
        `;
    }

    async restartApp() {
        if (this.isElectron) {
            await window.electronAPI.updater?.quitAndInstall();
        }
    }

    render() {
        const container = document.querySelector('.electron-updater');
        if (!container) return;

        if (!this.isElectron) {
            container.innerHTML = '<div class="update-web-version">Web Version - Updates automatisch</div>';
            return;
        }

        let content = '';

        if (this.isChecking) {
            content = `
                <div class="update-checking">
                    <div class="spinner"></div>
                    <span>Suche Updates...</span>
                </div>
            `;
        } else if (this.updateAvailable && !this.isDownloading) {
            content = `
                <div class="update-available">
                    <h4>📦 Update verfügbar!</h4>
                    <p>Version ${this.remoteVersion} → ${this.currentVersion}</p>
                    <button class="btn-download" onclick="window.electronUpdater.downloadUpdate()">
                        ⬇ Jetzt downloaden
                    </button>
                </div>
            `;
        } else if (this.isDownloading) {
            content = `
                <div class="update-downloading">
                    <h4>⬇ Downloading Update...</h4>
                    <div class="progress-container">
                        <div class="updater-progress-bar">0%</div>
                    </div>
                </div>
            `;
        } else {
            content = `
                <div class="update-current">
                    <span class="version-badge">v${this.currentVersion}</span>
                    <button class="btn-check" onclick="window.electronUpdater.checkForUpdates()">
                        🔄 Updates prüfen
                    </button>
                </div>
            `;
        }

        container.innerHTML = content;
    }

    static init() {
        // Auto-create container if not exists
        let container = document.querySelector('.electron-updater');
        if (!container) {
            container = document.createElement('div');
            container.className = 'electron-updater';
            document.body.appendChild(container);
        }

        window.electronUpdater = new ElectronUpdater();
        return window.electronUpdater;
    }
}

// CSS Styles
const updaterStyles = `
<style>
.electron-updater {
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--bg-card, #1e1e2e);
    border: 1px solid var(--border, #313244);
    border-radius: 8px;
    padding: 12px 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 1000;
    max-width: 280px;
    font-size: 14px;
}

.update-checking {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary, #9399b2);
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border, #313244);
    border-top-color: var(--accent, #89b4fa);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.update-available h4,
.update-downloading h4 {
    margin: 0 0 8px 0;
    color: var(--accent, #89b4fa);
    font-size: 14px;
}

.update-available p {
    margin: 0 0 12px 0;
    color: var(--text-secondary, #9399b2);
    font-size: 12px;
}

.btn-download, .btn-check, .btn-restart, .btn-later {
    background: var(--accent, #89b4fa);
    color: var(--bg-primary, #1e1e2e);
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
}

.btn-download:hover, .btn-check:hover, .btn-restart:hover {
    opacity: 0.9;
}

.btn-later {
    background: var(--border, #313244);
    color: var(--text-secondary, #9399b2);
    margin-left: 8px;
}

.progress-container {
    background: var(--border, #313244);
    border-radius: 4px;
    overflow: hidden;
    height: 20px;
    margin-top: 8px;
}

.updater-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent, #89b4fa), var(--success, #a6e3a1));
    width: 0%;
    transition: width 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bg-primary, #1e1e2e);
    font-weight: 500;
    font-size: 11px;
}

.update-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.version-badge {
    background: var(--border, #313244);
    color: var(--text-secondary, #9399b2);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
}

.update-restart-prompt h4 {
    margin: 0 0 8px 0;
    color: var(--success, #a6e3a1);
}

.update-restart-prompt p {
    margin: 0 0 12px 0;
    color: var(--text-secondary, #9399b2);
    font-size: 12px;
}

.update-web-version {
    color: var(--text-secondary, #9399b2);
    font-size: 12px;
    text-align: center;
}
</style>
`;

// Inject styles
document.head.insertAdjacentHTML('beforeend', updaterStyles);

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ElectronUpdater.init);
} else {
    ElectronUpdater.init();
}

export default ElectronUpdater;