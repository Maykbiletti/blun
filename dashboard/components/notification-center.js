class NotificationCenter {
    constructor() {
        this.notifications = [];
        this.maxNotifications = 50;
        this.isVisible = false;
        this.socket = null;
        this.badgeCount = 0;

        this.init();
    }

    init() {
        this.createUI();
        this.connectWebSocket();
        this.bindEvents();
    }

    createUI() {
        // Badge Icon im Header
        const headerRight = document.querySelector('.header-right') || document.querySelector('.header');
        if (headerRight) {
            const bellIcon = document.createElement('div');
            bellIcon.className = 'notification-bell';
            bellIcon.innerHTML = `
                <button class="bell-btn" aria-label="Notifications">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                    </svg>
                    <span class="badge" style="display: none;">0</span>
                </button>
            `;
            headerRight.appendChild(bellIcon);
            this.bellButton = bellIcon.querySelector('.bell-btn');
            this.badge = bellIcon.querySelector('.badge');
        }

        // Notification Panel
        const panel = document.createElement('div');
        panel.className = 'notification-panel';
        panel.innerHTML = `
            <div class="notification-header">
                <h3>Notifications</h3>
                <button class="clear-all-btn">Clear All</button>
            </div>
            <div class="notification-list"></div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        this.notificationList = panel.querySelector('.notification-list');

        // Toast Container
        const toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
        this.toastContainer = toastContainer;

        this.addStyles();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('Notification WebSocket connected');
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (e) {
                console.error('Invalid WebSocket message:', e);
            }
        };

        this.socket.onclose = () => {
            console.log('Notification WebSocket disconnected, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(data) {
        const { type, payload } = data;

        if (type === 'agent.task.completed') {
            this.addNotification({
                id: Date.now(),
                type: 'success',
                title: 'Task Completed',
                message: `Agent "${payload.agentName}" finished: ${payload.task}`,
                timestamp: new Date(),
                data: payload
            });
        }
        else if (type === 'agent.tool.result') {
            this.addNotification({
                id: Date.now(),
                type: 'info',
                title: 'Tool Result',
                message: `${payload.tool} executed by ${payload.agentName}`,
                timestamp: new Date(),
                data: payload
            });
        }
    }

    addNotification(notification) {
        // Buffer Management - keep max 50
        if (this.notifications.length >= this.maxNotifications) {
            this.notifications.shift();
        }

        this.notifications.unshift(notification);
        this.updateBadge();
        this.updatePanel();
        this.showToast(notification);
    }

    showToast(notification) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${notification.type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-title">${notification.title}</div>
                <div class="toast-message">${notification.message}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;

        this.toastContainer.appendChild(toast);

        // Auto dismiss nach 3s
        const autoDismiss = setTimeout(() => {
            this.removeToast(toast);
        }, 3000);

        // Manual close
        toast.querySelector('.toast-close').onclick = () => {
            clearTimeout(autoDismiss);
            this.removeToast(toast);
        };

        // Animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });
    }

    removeToast(toast) {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    updateBadge() {
        this.badgeCount = this.notifications.filter(n => !n.read).length;

        if (this.badgeCount > 0) {
            this.badge.textContent = this.badgeCount > 99 ? '99+' : this.badgeCount;
            this.badge.style.display = 'block';
        } else {
            this.badge.style.display = 'none';
        }
    }

    updatePanel() {
        this.notificationList.innerHTML = '';

        if (this.notifications.length === 0) {
            this.notificationList.innerHTML = '<div class="no-notifications">No notifications</div>';
            return;
        }

        this.notifications.forEach(notification => {
            const item = document.createElement('div');
            item.className = `notification-item ${notification.read ? 'read' : 'unread'}`;
            item.innerHTML = `
                <div class="notification-icon ${notification.type}"></div>
                <div class="notification-content">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                    <div class="notification-time">${this.formatTime(notification.timestamp)}</div>
                </div>
            `;

            item.onclick = () => {
                notification.read = true;
                this.updateBadge();
                this.updatePanel();
            };

            this.notificationList.appendChild(item);
        });
    }

    bindEvents() {
        // Toggle Panel
        if (this.bellButton) {
            this.bellButton.onclick = () => {
                this.togglePanel();
            };
        }

        // Clear All
        this.panel.querySelector('.clear-all-btn').onclick = () => {
            this.clearAll();
        };

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.panel.contains(e.target) && !this.bellButton.contains(e.target)) {
                this.hidePanel();
            }
        });
    }

    togglePanel() {
        if (this.isVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }

    showPanel() {
        this.isVisible = true;
        this.panel.classList.add('panel-show');

        // Mark all as read when opening
        this.notifications.forEach(n => n.read = true);
        this.updateBadge();
        this.updatePanel();
    }

    hidePanel() {
        this.isVisible = false;
        this.panel.classList.remove('panel-show');
    }

    clearAll() {
        this.notifications = [];
        this.updateBadge();
        this.updatePanel();
    }

    formatTime(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'now';
    }

    addStyles() {
        const styles = `
            .notification-bell {
                position: relative;
                margin-left: 16px;
            }

            .bell-btn {
                background: none;
                border: none;
                cursor: pointer;
                padding: 8px;
                border-radius: 50%;
                color: var(--text-color, #333);
                transition: all 0.2s;
                position: relative;
            }

            .bell-btn:hover {
                background: var(--bg-hover, rgba(0,0,0,0.1));
            }

            .badge {
                position: absolute;
                top: 2px;
                right: 2px;
                background: #ff4757;
                color: white;
                border-radius: 50%;
                padding: 2px 6px;
                font-size: 11px;
                font-weight: bold;
                min-width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .notification-panel {
                position: fixed;
                top: 60px;
                right: 16px;
                width: 320px;
                max-height: 400px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                opacity: 0;
                transform: translateY(-8px);
                pointer-events: none;
                transition: all 0.2s;
            }

            .notification-panel.panel-show {
                opacity: 1;
                transform: translateY(0);
                pointer-events: all;
            }

            .notification-header {
                padding: 16px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .notification-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
            }

            .clear-all-btn {
                background: none;
                border: none;
                color: #666;
                cursor: pointer;
                font-size: 12px;
            }

            .clear-all-btn:hover {
                color: #333;
            }

            .notification-list {
                max-height: 320px;
                overflow-y: auto;
            }

            .no-notifications {
                padding: 32px 16px;
                text-align: center;
                color: #666;
                font-size: 14px;
            }

            .notification-item {
                display: flex;
                padding: 12px 16px;
                border-bottom: 1px solid #f5f5f5;
                cursor: pointer;
                transition: background 0.2s;
            }

            .notification-item:hover {
                background: #f8f9fa;
            }

            .notification-item.unread {
                background: #f0f8ff;
                border-left: 3px solid #007bff;
            }

            .notification-icon {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                margin-right: 12px;
                flex-shrink: 0;
            }

            .notification-icon.success {
                background: #28a745;
            }

            .notification-icon.info {
                background: #17a2b8;
            }

            .notification-icon.warning {
                background: #ffc107;
            }

            .notification-icon.error {
                background: #dc3545;
            }

            .notification-content {
                flex: 1;
                min-width: 0;
            }

            .notification-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 4px;
            }

            .notification-message {
                font-size: 12px;
                color: #666;
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .notification-time {
                font-size: 11px;
                color: #999;
            }

            .toast-container {
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 2000;
                pointer-events: none;
            }

            .toast {
                background: white;
                border: 1px solid #ddd;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                margin-bottom: 8px;
                padding: 12px 16px;
                display: flex;
                align-items: center;
                max-width: 300px;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s;
                pointer-events: all;
            }

            .toast.toast-show {
                opacity: 1;
                transform: translateX(0);
            }

            .toast.toast-hide {
                opacity: 0;
                transform: translateX(100%);
            }

            .toast-success {
                border-left: 4px solid #28a745;
            }

            .toast-info {
                border-left: 4px solid #17a2b8;
            }

            .toast-warning {
                border-left: 4px solid #ffc107;
            }

            .toast-error {
                border-left: 4px solid #dc3545;
            }

            .toast-content {
                flex: 1;
                min-width: 0;
            }

            .toast-title {
                font-weight: 600;
                font-size: 13px;
                margin-bottom: 2px;
            }

            .toast-message {
                font-size: 12px;
                color: #666;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .toast-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                padding: 0 0 0 8px;
                color: #999;
            }

            .toast-close:hover {
                color: #666;
            }

            @media (max-width: 768px) {
                .notification-panel {
                    right: 8px;
                    left: 8px;
                    width: auto;
                    top: 56px;
                }

                .toast-container {
                    left: 8px;
                    right: 8px;
                }

                .toast {
                    max-width: none;
                }
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    // Public API
    notify(type, title, message, data = null) {
        this.addNotification({
            id: Date.now(),
            type,
            title,
            message,
            timestamp: new Date(),
            data
        });
    }
}

// Auto-Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.notificationCenter = new NotificationCenter();
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationCenter;
}