class NotificationManager {
    constructor() {
        this.ws = null;
        this.reconnectDelay = 1000; // Start with 1s
        this.maxReconnectDelay = 30000; // Max 30s
        this.reconnectAttempts = 0;
        this.eventQueue = [];
        this.isConnected = false;
        this.reconnectTimer = null;
        this.messageHandlers = new Map();
    }

    connect(url = 'ws://localhost:3000/ws/notifications') {
        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000; // Reset to 1s
                this.flushEventQueue();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Invalid JSON received:', event.data);
                }
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                this.isConnected = false;
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
            };
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        console.log(`Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts + 1})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        }, this.reconnectDelay);
    }

    send(data) {
        const message = JSON.stringify(data);

        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            // Queue event for later transmission
            this.eventQueue.push(data);
            console.log('Message queued (offline):', data);
        }
    }

    flushEventQueue() {
        if (this.eventQueue.length > 0 && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            console.log(`Flushing ${this.eventQueue.length} queued events`);

            const eventsToFlush = [...this.eventQueue];
            this.eventQueue = [];

            eventsToFlush.forEach(event => {
                if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify(event));
                } else {
                    // Re-queue if connection lost during flush
                    this.eventQueue.push(event);
                }
            });
        }
    }

    handleMessage(data) {
        const { type, payload } = data;

        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type)(payload);
        } else {
            console.log('Unhandled notification:', data);
        }
    }

    on(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    off(type) {
        this.messageHandlers.delete(type);
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.isConnected = false;
            this.ws.close();
            this.ws = null;
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            queuedEvents: this.eventQueue.length,
            reconnectAttempts: this.reconnectAttempts,
            reconnectDelay: this.reconnectDelay
        };
    }
}

// Singleton instance
const notifications = new NotificationManager();

// Auto-connect on load
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        notifications.connect();

        // Setup default handlers
        notifications.on('notification', (payload) => {
            showNotification(payload);
        });

        notifications.on('agent_status', (payload) => {
            updateAgentStatus(payload);
        });

        notifications.on('system_alert', (payload) => {
            showSystemAlert(payload);
        });
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        notifications.disconnect();
    });
}

// Helper functions for UI integration
function showNotification(payload) {
    const { title, message, type = 'info', duration = 5000 } = payload;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-header">
            <strong>${title}</strong>
            <button class="notification-close">&times;</button>
        </div>
        <div class="notification-body">${message}</div>
    `;

    const container = document.getElementById('notifications-container') || document.body;
    container.appendChild(notification);

    // Auto-remove after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, duration);

    // Manual close handler
    notification.querySelector('.notification-close').addEventListener('click', () => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });
}

function updateAgentStatus(payload) {
    const { agentId, status, message } = payload;
    const statusElement = document.getElementById(`agent-status-${agentId}`);

    if (statusElement) {
        statusElement.className = `agent-status status-${status}`;
        statusElement.textContent = message || status;
    }
}

function showSystemAlert(payload) {
    const { level, message, persistent = false } = payload;

    const alert = document.createElement('div');
    alert.className = `system-alert alert-${level}`;
    alert.innerHTML = `
        <div class="alert-content">${message}</div>
        ${persistent ? '' : '<button class="alert-close">&times;</button>'}
    `;

    const container = document.getElementById('system-alerts') || document.body;
    container.appendChild(alert);

    if (!persistent) {
        alert.querySelector('.alert-close').addEventListener('click', () => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        });
    }
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NotificationManager, notifications };
}