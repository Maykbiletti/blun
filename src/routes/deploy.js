const express = require('express');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const appendFileAsync = promisify(fs.appendFile);

const router = express.Router();
const DEPLOY_LOG_PATH = '/root/blun/logs/deploy.log';
const MAX_LOG_LINES = 500;

// Rotate log if it exceeds max lines
async function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(DEPLOY_LOG_PATH)) {
            return;
        }

        const content = await readFileAsync(DEPLOY_LOG_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length >= MAX_LOG_LINES) {
            // Keep only the last 250 lines
            const keepLines = lines.slice(-250);
            await writeFileAsync(DEPLOY_LOG_PATH, keepLines.join('\n') + '\n');
        }
    } catch (error) {
        console.error('Log rotation error:', error);
    }
}

// Log deploy event
async function logDeploy(agentName, file, commitHash, status) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        agentName,
        file,
        commitHash,
        status
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
        await rotateLogIfNeeded();
        await appendFileAsync(DEPLOY_LOG_PATH, logLine);
    } catch (error) {
        console.error('Deploy logging error:', error);
    }
}

// POST /deploy
router.post('/', async (req, res) => {
    try {
        const { agentName, file, commitHash } = req.body;

        if (!agentName || !file || !commitHash) {
            await logDeploy(agentName || 'unknown', file || 'unknown', commitHash || 'unknown', 'FAIL_MISSING_PARAMS');
            return res.status(400).json({
                error: 'Missing required parameters: agentName, file, commitHash'
            });
        }

        // Simulate deploy logic
        const deploySuccess = Math.random() > 0.1; // 90% success rate

        if (deploySuccess) {
            await logDeploy(agentName, file, commitHash, 'SUCCESS');
            res.json({
                status: 'SUCCESS',
                message: 'Deploy completed successfully',
                timestamp: new Date().toISOString()
            });
        } else {
            await logDeploy(agentName, file, commitHash, 'FAIL_DEPLOY_ERROR');
            res.status(500).json({
                status: 'FAIL',
                error: 'Deploy failed during execution',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        await logDeploy(req.body?.agentName || 'unknown', req.body?.file || 'unknown', req.body?.commitHash || 'unknown', 'FAIL_INTERNAL_ERROR');
        res.status(500).json({
            status: 'ERROR',
            error: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /deploy/logs - View recent deploy logs
router.get('/logs', async (req, res) => {
    try {
        if (!fs.existsSync(DEPLOY_LOG_PATH)) {
            return res.json({ logs: [] });
        }

        const content = await readFileAsync(DEPLOY_LOG_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        const logs = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);

        res.json({
            logs: logs.slice(-50), // Return last 50 entries
            total: logs.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read deploy logs' });
    }
});

module.exports = router;