const { Router } = require('express');

const router = Router();

router.get('/health/detailed', function (req, res) {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

module.exports = router;
