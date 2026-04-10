const express = require('express');
const router = express.Router();

// WebSocket notification helper
function sendWsNotification(type, data) {
  // Assuming global ws notification system
  if (global.wsClients) {
    const notification = { type, data, timestamp: new Date().toISOString() };
    global.wsClients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(notification));
      }
    });
  }
}

router.post('/api/agent/message', (req, res) => {
  const timeoutMs = 30000; // 30 seconds

  // Set timeout for the request
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      // Send timeout notification via WebSocket
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
    // Simulate agent processing
    const processAgentMessage = async () => {
      // Clear timeout when processing completes
      clearTimeout(timeout);

      if (!res.headersSent) {
        res.json({
          success: true,
          message: 'Agent message processed',
          timestamp: new Date().toISOString()
        });
      }
    };

    // Start agent message processing
    processAgentMessage().catch(error => {
      clearTimeout(timeout);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: error.message
        });
      }
    });

  } catch (error) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
});

module.exports = router;