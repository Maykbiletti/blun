const express = require('express');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');

const router = express.Router();

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const appendFileAsync = promisify(fs.appendFile);
const execFileAsync = promisify(execFile);

const DEPLOY_LOG_PATH = '/root/blun/logs/deploy.log';
const MAX_LOG_LINES = 500;
const WORKTREE_ROOT = process.cwd();

function isSafeRelativePath(filePath) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
        return false;
    }

    if (path.isAbsolute(filePath)) {
        return false;
    }

    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    return !normalized.startsWith('../') && !normalized.includes('/../');
}

async function ensureLogDir() {
    await fs.promises.mkdir(path.dirname(DEPLOY_LOG_PATH), { recursive: true });
}

async function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(DEPLOY_LOG_PATH)) {
            return;
        }

        const content = await readFileAsync(DEPLOY_LOG_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        if (lines.length >= MAX_LOG_LINES) {
            const keepLines = lines.slice(-Math.floor(MAX_LOG_LINES / 2));
            await writeFileAsync(DEPLOY_LOG_PATH, `${keepLines.join('\n')}\n`);
        }
    } catch (error) {
        console.error('Log rotation error:', error.message);
    }
}

async function logDeploy(entry) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...entry
    };

    try {
        await ensureLogDir();
        await rotateLogIfNeeded();
        await appendFileAsync(DEPLOY_LOG_PATH, `${JSON.stringify(logEntry)}\n`);
    } catch (error) {
        console.error('Deploy logging error:', error.message);
    }
}

async function commitExists(commitHash) {
    try {
        await execFileAsync('git', ['cat-file', '-e', `${commitHash}^{commit}`], { cwd: WORKTREE_ROOT });
        return true;
    } catch {
        return false;
    }
}

async function commitTouchesFile(commitHash, filePath) {
    const { stdout } = await execFileAsync(
        'git',
        ['diff-tree', '--no-commit-id', '--name-only', '-r', commitHash],
        { cwd: WORKTREE_ROOT }
    );

    const changedFiles = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    return changedFiles.includes(filePath);
}

function validatePayload(body) {
    const errors = [];
    const { agentName, file, commitHash } = body || {};

    if (typeof agentName !== 'string' || agentName.trim().length < 2) {
        errors.push('agentName must be a non-empty string');
    }

    if (!isSafeRelativePath(file)) {
        errors.push('file must be a safe relative path inside the repository');
    }

    if (typeof commitHash !== 'string' || !/^[0-9a-f]{7,40}$/i.test(commitHash)) {
        errors.push('commitHash must be a valid git hash (7-40 hex chars)');
    }

    return errors;
}

router.post('/', async (req, res) => {
    const payload = req.body || {};
    const errors = validatePayload(payload);

    if (errors.length > 0) {
        await logDeploy({
            agentName: payload.agentName || 'unknown',
            file: payload.file || 'unknown',
            commitHash: payload.commitHash || 'unknown',
            status: 'FAIL_VALIDATION',
            errors
        });

        return res.status(400).json({
            status: 'FAIL',
            error: 'Invalid payload',
            details: errors,
            timestamp: new Date().toISOString()
        });
    }

    const { agentName, file, commitHash } = payload;

    try {
        const exists = await commitExists(commitHash);
        if (!exists) {
            await logDeploy({ agentName, file, commitHash, status: 'FAIL_COMMIT_NOT_FOUND' });
            return res.status(404).json({
                status: 'FAIL',
                error: 'Commit not found',
                timestamp: new Date().toISOString()
            });
        }

        const touched = await commitTouchesFile(commitHash, file);
        if (!touched) {
            await logDeploy({ agentName, file, commitHash, status: 'FAIL_FILE_NOT_IN_COMMIT' });
            return res.status(409).json({
                status: 'FAIL',
                error: 'Commit does not contain changes for the requested file',
                timestamp: new Date().toISOString()
            });
        }

        await logDeploy({ agentName, file, commitHash, status: 'SUCCESS_VERIFIED' });
        return res.json({
            status: 'SUCCESS',
            message: 'Deploy request verified and accepted',
            agentName,
            file,
            commitHash,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        await logDeploy({
            agentName,
            file,
            commitHash,
            status: 'FAIL_INTERNAL_ERROR',
            error: error.message
        });

        return res.status(500).json({
            status: 'ERROR',
            error: 'Internal server error during deploy verification',
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/logs', async (req, res) => {
    try {
        if (!fs.existsSync(DEPLOY_LOG_PATH)) {
            return res.json({ logs: [], total: 0 });
        }

        const content = await readFileAsync(DEPLOY_LOG_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        const logs = lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        return res.json({
            logs: logs.slice(-50),
            total: logs.length
        });
    } catch {
        return res.status(500).json({ error: 'Failed to read deploy logs' });
    }
});

module.exports = router;
