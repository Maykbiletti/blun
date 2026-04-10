class NotificationBell extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.notifications = [];
        this.unreadCount = 0;
        this.isOpen = false;
        this.fetchInterval = null;

        this.render();
        this.setupEventListeners();
        this.startPolling();
    }

    connectedCallback() {
        this.fetchNotifications();
    }

    disconnectedCallback() {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    position: relative;
                    display: inline-block;
                }

                .bell-container {
                    position: relative;
                    cursor: pointer;
                    padding: 8px;
                    background: #1f2937;
                    border: 1px solid #374151;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                }

                .bell-container:hover {
                    background: #374151;
                    border-color: #4b5563;
                }

                .bell-icon {
                    width: 20px;
                    height: 20px;
                    fill: #d1d5db;
                    transition: fill 0.2s ease;
                }

                .bell-container:hover .bell-icon {
                    fill: #f3f4f6;
                }

                .badge {
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    background: #ef4444;
                    color: white;
                    border-radius: 10px;
                    min-width: 18px;
                    height: 18px;
                    font-size: 11px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transform: scale(0);
                    transition: transform 0.2s ease;
                }

                .badge.show {
                    transform: scale(1);
                }

                .dropdown {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 8px;
                    width: 320px;
                    max-height: 400px;
                    background: #1f2937;
                    border: 1px solid #374151;
                    border-radius: 8px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                    z-index: 1000;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-10px);
                    transition: all 0.3s ease;
                }

                .dropdown.open {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }

                .dropdown-header {
                    padding: 16px;
                    border-bottom: 1px solid #374151;
                    font-size: 16px;
                    font-weight: 600;
                    color: #f3f4f6;
                }

                .notifications-list {
                    max-height: 320px;
                    overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: #4b5563 #1f2937;
                }

                .notifications-list::-webkit-scrollbar {
                    width: 6px;
                }

                .notifications-list::-webkit-scrollbar-track {
                    background: #1f2937;
                }

                .notifications-list::-webkit-scrollbar-thumb {
                    background: #4b5563;
                    border-radius: 3px;
                }

                .notification-item {
                    padding: 12px 16px;
                    border-bottom: 1px solid #374151;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                }

                .notification-item:hover {
                    background: #374151;
                }

                .notification-item:last-child {
                    border-bottom: none;
                }

                .notification-item.unread {
                    background: rgba(59, 130, 246, 0.1);
                    border-left: 3px solid #3b82f6;
                }

                .notification-title {
                    font-size: 14px;
                    font-weight: 500;
                    color: #f3f4f6;
                    margin-bottom: 4px;
                }

                .notification-message {
                    font-size: 13px;
                    color: #d1d5db;
                    line-height: 1.4;
                    margin-bottom: 4px;
                }

                .notification-time {
                    font-size: 11px;
                    color: #9ca3af;
                }

                .empty-state {
                    padding: 32px 16px;
                    text-align: center;
                    color: #9ca3af;
                    font-size: 14px;
                }

                .mark-all-read {
                    padding: 12px 16px;
                    border-top: 1px solid #374151;
                    text-align: center;
                    cursor: pointer;
                    color: #3b82f6;
                    font-size: 14px;
                    font-weight: 500;
                    transition: background-color 0.2s ease;
                }

                .mark-all-read:hover {
                    background: #374151;
                }
            </style>

            <div class="bell-container">
                <svg class="bell-icon" viewBox="0 0 24 24">
                    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 19V20H3V19L5 17V11C5 7.9 7 5.2 10 4.3V4C10 2.9 10.9 2 12 2C13.1 2 14 2.9 14 4V4.3C17 5.2 19 7.9 19 11V17L21 19ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z"/>
                </svg>
                <div class="badge"></div>
            </div>

            <div class="dropdown">
                <div class="dropdown-header">Notifications</div>
                <div class="notifications-list"></div>
                <div class="mark-all-read" style="display: none;">Mark all as read</div>
            </div>
        `;
    }

    setupEventListeners() {
        const bellContainer = this.shadowRoot.querySelector('.bell-container');
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        const markAllRead = this.shadowRoot.querySelector('.mark-all-read');

        bellContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        markAllRead.addEventListener('click', () => {
            this.markAllAsRead();
        });

        document.addEventListener('click', () => {
            if (this.isOpen) {
                this.closeDropdown();
            }
        });

        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    async fetchNotifications() {
        try {
            const response = await fetch('/api/notifications');
            if (response.ok) {
                const data = await response.json();
                this.notifications = data.notifications || [];
                this.updateUI();
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }

    updateUI() {
        this.updateBadge();
        this.updateDropdown();
    }

    updateBadge() {
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        const badge = this.shadowRoot.querySelector('.badge');

        if (this.unreadCount > 0) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.classList.add('show');
        } else {
            badge.classList.remove('show');
        }
    }

    updateDropdown() {
        const notificationsList = this.shadowRoot.querySelector('.notifications-list');
        const markAllRead = this.shadowRoot.querySelector('.mark-all-read');

        if (this.notifications.length === 0) {
            notificationsList.innerHTML = '<div class="empty-state">No notifications</div>';
            markAllRead.style.display = 'none';
        } else {
            notificationsList.innerHTML = this.notifications
                .slice(0, 20) // Show max 20 notifications
                .map(notification => this.renderNotification(notification))
                .join('');

            markAllRead.style.display = this.unreadCount > 0 ? 'block' : 'none';

            // Add click listeners to notification items
            notificationsList.querySelectorAll('.notification-item').forEach((item, index) => {
                item.addEventListener('click', () => {
                    this.markAsRead(index);
                });
            });
        }
    }

    renderNotification(notification) {
        const timeAgo = this.formatTimeAgo(new Date(notification.timestamp));
        const unreadClass = notification.read ? '' : 'unread';

        return `
            <div class="notification-item ${unreadClass}">
                <div class="notification-title">${this.escapeHtml(notification.title)}</div>
                <div class="notification-message">${this.escapeHtml(notification.message)}</div>
                <div class="notification-time">${timeAgo}</div>
            </div>
        `;
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        this.isOpen = true;
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        dropdown.classList.add('open');
    }

    closeDropdown() {
        this.isOpen = false;
        const dropdown = this.shadowRoot.querySelector('.dropdown');
        dropdown.classList.remove('open');
    }

    async markAsRead(index) {
        const notification = this.notifications[index];
        if (!notification.read) {
            try {
                const response = await fetch(`/api/notifications/${notification.id}/read`, {
                    method: 'POST'
                });
                if (response.ok) {
                    notification.read = true;
                    this.updateUI();
                }
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        }
    }

    async markAllAsRead() {
        try {
            const response = await fetch('/api/notifications/mark-all-read', {
                method: 'POST'
            });
            if (response.ok) {
                this.notifications.forEach(n => n.read = true);
                this.updateUI();
            }
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    }

    startPolling() {
        // Initial fetch
        this.fetchNotifications();

        // Poll every 30 seconds
        this.fetchInterval = setInterval(() => {
            this.fetchNotifications();
        }, 30000);
    }
}

customElements.define('notification-bell', NotificationBell);