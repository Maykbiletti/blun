/**
 * Toast Notification System
 * Zeigt temporäre Benachrichtigungen für User-Feedback
 */
class ToastManager {
    constructor() {
        this.container = null;
        this.activeToasts = new Set();
        this.init();
    }

    init() {
        // Toast Container erstellen falls nicht vorhanden
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            this.container.setAttribute('aria-live', 'polite');
            this.container.setAttribute('aria-atomic', 'false');
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    show(message, type = 'info', duration = 3000) {
        if (!message) return null;

        const toast = this.createToast(message, type);
        this.container.appendChild(toast);
        this.activeToasts.add(toast);

        // Slide-in Animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => {
                this.hide(toast);
            }, duration);
        }

        return toast;
    }

    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');

        const icon = this.getTypeIcon(type);

        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon" aria-hidden="true">${icon}</span>
                <span class="toast-message">${this.escapeHtml(message)}</span>
                <button
                    type="button"
                    class="toast-close"
                    aria-label="Benachrichtigung schließen"
                    onclick="window.toastManager.hide(this.closest('.toast'))"
                >
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
        `;

        return toast;
    }

    getTypeIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ⓘ'
        };
        return icons[type] || icons.info;
    }

    hide(toast) {
        if (!toast || !this.activeToasts.has(toast)) return;

        toast.classList.add('toast-hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.activeToasts.delete(toast);
        }, 300); // Animation duration
    }

    hideAll() {
        this.activeToasts.forEach(toast => {
            this.hide(toast);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Globale Instanz erstellen
if (!window.toastManager) {
    window.toastManager = new ToastManager();
}

// Utility-Funktionen für einfache Nutzung
function showToast(message, type = 'info') {
    return window.toastManager.show(message, type);
}

function showSuccess(message) {
    return window.toastManager.show(message, 'success');
}

function showError(message) {
    return window.toastManager.show(message, 'error');
}

function showWarning(message) {
    return window.toastManager.show(message, 'warning');
}

function showInfo(message) {
    return window.toastManager.show(message, 'info');
}

function hideAllToasts() {
    window.toastManager.hideAll();
}

// CSS Styles
const toastStyles = `
<style>
.toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
    pointer-events: none;
}

@media (max-width: 640px) {
    .toast-container {
        top: 10px;
        right: 10px;
        left: 10px;
        max-width: none;
    }
}

.toast {
    pointer-events: auto;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s ease-out;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    border-left: 4px solid;
    background: white;
    max-width: 100%;
}

.toast-show {
    transform: translateX(0);
    opacity: 1;
}

.toast-hide {
    transform: translateX(100%);
    opacity: 0;
}

.toast-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    min-height: 44px; /* Touch-Target */
}

.toast-icon {
    font-size: 18px;
    font-weight: bold;
    margin-top: 2px;
    flex-shrink: 0;
}

.toast-message {
    flex: 1;
    line-height: 1.4;
    word-wrap: break-word;
    font-size: 14px;
    color: #374151;
}

.toast-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
    margin: -4px;
    border-radius: 4px;
    min-width: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 0.2s;
}

.toast-close:hover {
    background-color: rgba(0, 0, 0, 0.1);
}

.toast-close:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

/* Toast Types */
.toast-success {
    border-left-color: #10b981;
}

.toast-success .toast-icon {
    color: #10b981;
}

.toast-error {
    border-left-color: #ef4444;
}

.toast-error .toast-icon {
    color: #ef4444;
}

.toast-warning {
    border-left-color: #f59e0b;
}

.toast-warning .toast-icon {
    color: #f59e0b;
}

.toast-info {
    border-left-color: #3b82f6;
}

.toast-info .toast-icon {
    color: #3b82f6;
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
    .toast {
        background: #1f2937;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .toast-message {
        color: #f3f4f6;
    }

    .toast-close:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
    .toast {
        transition: opacity 0.2s ease-out;
        transform: none !important;
    }
}
</style>
`;

// CSS automatisch injizieren falls nicht vorhanden
if (!document.getElementById('toast-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'toast-styles';
    styleElement.innerHTML = toastStyles;
    document.head.appendChild(styleElement);
}