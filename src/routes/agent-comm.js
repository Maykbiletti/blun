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

module.exports = router;