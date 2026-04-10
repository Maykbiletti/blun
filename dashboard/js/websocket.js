class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000; // 30 seconds
        this.baseDelay = 1000; // 1 second
        this.reconnectTimeout = null;
        this.isConnecting = false;
        this.shouldReconnect = true;

        this.connect();
    }

    connect() {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.isConnecting = true;

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = (event) => {
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                console.log('WebSocket connected');
                this.onOpen && this.onOpen(event);
            };

            this.ws.onmessage = (event) => {
                this.onMessage && this.onMessage(event);
            };

            this.ws.onclose = (event) => {
                this.isConnecting = false;
                console.log('WebSocket closed:', event.code, event.reason);
                this.onClose && this.onClose(event);

                if (this.shouldReconnect) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (event) => {
                this.isConnecting = false;
                console.error('WebSocket error:', event);
                this.onError && this.onError(event);
            };

        } catch (error) {
            this.isConnecting = false;
            console.error('WebSocket connection failed:', error);
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected, cannot send data');
        }
    }

    close() {
        this.shouldReconnect = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // Event handlers - can be overridden
    onOpen = null;
    onMessage = null;
    onClose = null;
    onError = null;
}

// Auto-connect to notifications WebSocket
const wsManager = new WebSocketManager(`ws://${window.location.host}/ws`);

wsManager.onMessage = function(event) {
    try {
        const data = JSON.parse(event.data);

        if (data.type === 'notification') {
            displayNotification(data.message, data.level || 'info');
        }

        // Trigger custom event for other components
        window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }));

    } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
    }
};

wsManager.onOpen = function() {
    // Update connection status
    document.body.classList.add('ws-connected');
    document.body.classList.remove('ws-disconnected');
};

wsManager.onClose = function() {
    // Update connection status
    document.body.classList.remove('ws-connected');
    document.body.classList.add('ws-disconnected');
};

function displayNotification(message, level = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${level}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 4000);
}

// Export for external access
window.wsManager = wsManager;