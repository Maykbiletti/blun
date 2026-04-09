/**
 * Electron Custom Title Bar
 * Desktop-native window controls mit min/max/close buttons
 */

class DesktopTitlebar {
    constructor() {
        this.isElectron = this.detectElectron();
        this.platform = this.detectPlatform();
        this.isMaximized = false;

        if (this.isElectron) {
            this.init();
            this.bindEvents();
            this.updateMaximizeButton();
        }
    }

    detectElectron() {
        return window.electronAPI !== undefined ||
               window.require !== undefined ||
               navigator.userAgent.includes('Electron');
    }

    detectPlatform() {
        if (!this.isElectron) return 'web';
        return window.electronAPI?.platform ||
               window.require?.('os').platform() ||
               'unknown';
    }

    init() {
        // Title Bar HTML erstellen
        const titleBar = document.createElement('div');
        titleBar.className = 'desktop-titlebar';
        titleBar.innerHTML = this.getTitleBarHTML();

        // CSS Styles injizieren
        this.injectStyles();

        // Title Bar an Body prependen
        document.body.prepend(titleBar);

        // Main Content Padding anpassen
        this.adjustMainContent();
    }

    getTitleBarHTML() {
        const isMac = this.platform === 'darwin';
        const controlsPosition = isMac ? 'left' : 'right';

        return `
            <div class="titlebar-drag-area">
                <div class="titlebar-title">BLUN.ai</div>
                <div class="titlebar-controls ${controlsPosition}">
                    ${isMac ? this.getMacControls() : this.getWindowsControls()}
                </div>
            </div>
        `;
    }

    getMacControls() {
        return `
            <button class="titlebar-btn titlebar-close mac" data-action="close">
                <div class="mac-control-dot close-dot"></div>
            </button>
            <button class="titlebar-btn titlebar-minimize mac" data-action="minimize">
                <div class="mac-control-dot minimize-dot"></div>
            </button>
            <button class="titlebar-btn titlebar-maximize mac" data-action="maximize">
                <div class="mac-control-dot maximize-dot"></div>
            </button>
        `;
    }

    getWindowsControls() {
        return `
            <button class="titlebar-btn titlebar-minimize" data-action="minimize">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <rect x="2" y="9" width="8" height="1" fill="currentColor"/>
                </svg>
            </button>
            <button class="titlebar-btn titlebar-maximize" data-action="maximize">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>
                </svg>
            </button>
            <button class="titlebar-btn titlebar-close windows" data-action="close">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1"/>
                </svg>
            </button>
        `;
    }

    injectStyles() {
        const styles = `
            .desktop-titlebar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 32px;
                background: var(--bg-secondary, #f8f9fa);
                border-bottom: 1px solid var(--border-color, #e5e7eb);
                z-index: 9999;
                user-select: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .titlebar-drag-area {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 100%;
                padding: 0 12px;
                -webkit-app-region: drag;
            }

            .titlebar-title {
                font-size: 13px;
                font-weight: 500;
                color: var(--text-primary, #374151);
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                pointer-events: none;
            }

            .titlebar-controls {
                display: flex;
                gap: 8px;
                -webkit-app-region: no-drag;
            }

            .titlebar-controls.left {
                order: -1;
                margin-left: 0;
            }

            .titlebar-controls.right {
                margin-left: auto;
            }

            .titlebar-btn {
                width: 28px;
                height: 20px;
                border: none;
                background: transparent;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: background-color 0.15s ease;
                color: var(--text-secondary, #6b7280);
            }

            .titlebar-btn:hover {
                background: var(--bg-hover, #e5e7eb);
            }

            .titlebar-btn.mac {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                margin-right: 8px;
            }

            .mac-control-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
            }

            .close-dot {
                background: #ff5f57;
            }

            .minimize-dot {
                background: #ffbd2e;
            }

            .maximize-dot {
                background: #28ca42;
            }

            .titlebar-btn.mac:hover .mac-control-dot {
                opacity: 0.8;
            }

            .titlebar-close.windows:hover {
                background: #e53e3e !important;
                color: white;
            }

            /* Dark Mode */
            @media (prefers-color-scheme: dark) {
                .desktop-titlebar {
                    background: var(--bg-dark, #1f2937);
                    border-bottom-color: var(--border-dark, #374151);
                }

                .titlebar-title {
                    color: var(--text-dark, #f3f4f6);
                }

                .titlebar-btn {
                    color: var(--text-dark-secondary, #9ca3af);
                }

                .titlebar-btn:hover {
                    background: var(--bg-dark-hover, #374151);
                }
            }

            /* Main Content Anpassung */
            body.has-titlebar {
                padding-top: 32px;
            }

            .dashboard-container.has-titlebar {
                margin-top: 32px;
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    adjustMainContent() {
        document.body.classList.add('has-titlebar');
        const dashContainer = document.querySelector('.dashboard-container');
        if (dashContainer) {
            dashContainer.classList.add('has-titlebar');
        }
    }

    bindEvents() {
        // Window Control Buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.titlebar-btn');
            if (!btn) return;

            const action = btn.dataset.action;
            this.handleWindowAction(action);
        });

        // Window State Updates
        if (window.electronAPI) {
            window.electronAPI.onWindowStateChange?.((state) => {
                this.isMaximized = state.isMaximized;
                this.updateMaximizeButton();
            });
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.metaKey || e.ctrlKey) {
                switch (e.key) {
                    case 'w':
                        e.preventDefault();
                        this.handleWindowAction('close');
                        break;
                    case 'm':
                        e.preventDefault();
                        this.handleWindowAction('minimize');
                        break;
                }
            }
        });
    }

    handleWindowAction(action) {
        if (!this.isElectron) return;

        switch (action) {
            case 'minimize':
                this.minimizeWindow();
                break;
            case 'maximize':
                this.toggleMaximize();
                break;
            case 'close':
                this.closeWindow();
                break;
        }
    }

    minimizeWindow() {
        if (window.electronAPI?.minimizeWindow) {
            window.electronAPI.minimizeWindow();
        } else if (window.require) {
            const { remote } = window.require('electron');
            remote.getCurrentWindow().minimize();
        }
    }

    toggleMaximize() {
        if (window.electronAPI?.toggleMaximize) {
            window.electronAPI.toggleMaximize();
        } else if (window.require) {
            const { remote } = window.require('electron');
            const win = remote.getCurrentWindow();
            win.isMaximized() ? win.unmaximize() : win.maximize();
        }

        this.isMaximized = !this.isMaximized;
        this.updateMaximizeButton();
    }

    closeWindow() {
        if (window.electronAPI?.closeWindow) {
            window.electronAPI.closeWindow();
        } else if (window.require) {
            const { remote } = window.require('electron');
            remote.getCurrentWindow().close();
        }
    }

    updateMaximizeButton() {
        const btn = document.querySelector('.titlebar-maximize');
        if (!btn) return;

        if (this.platform !== 'darwin') {
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.innerHTML = this.isMaximized ?
                    '<rect x="3" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/><rect x="1" y="1" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/>' :
                    '<rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>';
            }
        }
    }

    // Utility Methods
    hide() {
        const titlebar = document.querySelector('.desktop-titlebar');
        if (titlebar) {
            titlebar.style.display = 'none';
            document.body.classList.remove('has-titlebar');
        }
    }

    show() {
        const titlebar = document.querySelector('.desktop-titlebar');
        if (titlebar) {
            titlebar.style.display = 'block';
            document.body.classList.add('has-titlebar');
        }
    }

    destroy() {
        const titlebar = document.querySelector('.desktop-titlebar');
        if (titlebar) {
            titlebar.remove();
            document.body.classList.remove('has-titlebar');
        }
    }

    setTitle(title) {
        const titleElement = document.querySelector('.titlebar-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
}

// Auto-Init wenn Electron erkannt wird
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.desktopTitlebar = new DesktopTitlebar();
    });
} else {
    window.desktopTitlebar = new DesktopTitlebar();
}

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DesktopTitlebar;
}