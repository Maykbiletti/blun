const express = require('express');
const WebSocket = require('ws');
const router = express.Router();

// WebSocket clients with heartbeat
const wsClients = new Map();

// WebSocket notification helper with heartbeat
function sendWsNotification(type, data) {
  const notification = { type, data, timestamp: new Date().toISOString() };
  wsClients.forEach((clientData, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(notification));
    }
  });
}

// Heartbeat ping every 20s
function heartbeat() {
  wsClients.forEach((clientData, client) => {
    if (client.readyState === WebSocket.OPEN) {
      clientData.isAlive = false;
      client.ping();
    } else {
      wsClients.delete(client);
    }
  });
}

setInterval(heartbeat, 20000);

// WebSocket upgrade handler
function handleWebSocketUpgrade(server) {
  const wss = new WebSocket.Server({
    server,
    path: '/api/agent/ws'
  });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');

    // Initialize client with heartbeat data
    wsClients.set(ws, {
      isAlive: true,
      connectedAt: Date.now(),
      lastPong: Date.now()
    });

    // Handle pong response
    ws.on('pong', () => {
      const clientData = wsClients.get(ws);
      if (clientData) {
        clientData.isAlive = true;
        clientData.lastPong = Date.now();
      }
    });

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    });

    // Handle connection error
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: Date.now()
    }));
  });

  // Clean up dead connections
  setInterval(() => {
    wsClients.forEach((clientData, client) => {
      if (!clientData.isAlive) {
        console.log('Terminating dead WebSocket connection');
        client.terminate();
        wsClients.delete(client);
      }
    });
  }, 35000);

  return wss;
}

// Export the WebSocket handler
router.handleWebSocketUpgrade = handleWebSocketUpgrade;

router.post('/api/agent/message', (req, res) => {
  const timeoutMs = 30000; // 30 seconds
  let isProcessing = false;

  // Set request timeout to ensure it doesn't hang
  req.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      sendWsNotification('agent_timeout', {
        message: 'Agent request timeout exceeded',
        timeout: timeoutMs,
        timestamp: new Date().toISOString()
      });
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Agent request timeout exceeded'
      });
    }
  });

  // Set response timeout as backup
  const timeout = setTimeout(() => {
    if (!res.headersSent && !isProcessing) {
      sendWsNotification('agent_timeout', {
        message: 'Agent response timeout exceeded',
        timeout: timeoutMs,
        timestamp: new Date().toISOString()
      });
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Agent response timeout exceeded'
      });
    }
  }, timeoutMs);

  try {
    isProcessing = true;

    // Simulate agent processing with actual delay
    const processAgentMessage = async () => {
      try {
        // Simulate processing work that might hang
        await new Promise((resolve, reject) => {
          const processTimeout = setTimeout(() => {
            reject(new Error('Agent processing timeout'));
          }, 25000); // 25s max processing time

          setTimeout(() => {
            clearTimeout(processTimeout);
            resolve();
          }, Math.random() * 5000); // Random delay 0-5s
        });

        clearTimeout(timeout);
        isProcessing = false;

        if (!res.headersSent) {
          res.json({
            success: true,
            message: 'Agent message processed',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        clearTimeout(timeout);
        isProcessing = false;

        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
          });
        }
      }
    };

    processAgentMessage();

  } catch (error) {
    clearTimeout(timeout);
    isProcessing = false;

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
});

// Client-side WebSocket reconnect logic (for reference)
const clientWSExample = `
class AgentWebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.heartbeatInterval = null;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          console.log('Received pong from server');
        }
        this.onMessage(data);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.stopHeartbeat();
        this.reconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.reconnect();
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

    console.log(\`Reconnecting in \${delay}ms (attempt \${this.reconnectAttempts})\`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onMessage(data) {
    // Override this method to handle messages
    console.log('Received message:', data);
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage: const client = new AgentWebSocketClient('ws://localhost:3000/api/agent/ws');
//        client.connect();
`;

module.exports = router;