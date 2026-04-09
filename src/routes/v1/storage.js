const express = require('express');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const router = express.Router();

/**
 * GET /api/v1/storage/status
 * Returns disk usage, free space, and mount points
 */
router.get('/status', async (req, res) => {
    try {
        // Get disk usage for root filesystem
        const diskStats = await getDiskUsage('/');

        // Get all mount points
        const mountPoints = await getMountPoints();

        // Get storage info for each mount point
        const storageInfo = await Promise.all(
            mountPoints.map(async (mount) => {
                try {
                    const stats = await getDiskUsage(mount.mountpoint);
                    return {
                        mountpoint: mount.mountpoint,
                        filesystem: mount.filesystem,
                        type: mount.type,
                        ...stats
                    };
                } catch (error) {
                    console.error(`Error getting storage for ${mount.mountpoint}:`, error.message);
                    return {
                        mountpoint: mount.mountpoint,
                        filesystem: mount.filesystem,
                        type: mount.type,
                        error: 'Unable to read storage info'
                    };
                }
            })
        );

        const response = {
            ok: true,
            timestamp: new Date().toISOString(),
            storage: {
                root: diskStats,
                mounts: storageInfo
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Storage status API error:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            ok: false,
            error: 'Unable to retrieve storage information',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get disk usage statistics for a given path
 * @param {string} path - Path to check
 * @returns {Object} Disk usage stats
 */
async function getDiskUsage(path) {
    try {
        const stats = await fs.stat(path);

        // Use df command to get accurate disk usage
        const { stdout } = await execAsync(`df -B1 "${path}" | tail -1`);
        const dfOutput = stdout.trim().split(/\s+/);

        const totalBytes = parseInt(dfOutput[1]) || 0;
        const usedBytes = parseInt(dfOutput[2]) || 0;
        const availableBytes = parseInt(dfOutput[3]) || 0;
        const usagePercent = dfOutput[4] || '0%';

        return {
            path,
            total_bytes: totalBytes,
            used_bytes: usedBytes,
            available_bytes: availableBytes,
            usage_percent: parseInt(usagePercent.replace('%', '')),
            total_gb: Math.round(totalBytes / (1024 * 1024 * 1024) * 100) / 100,
            used_gb: Math.round(usedBytes / (1024 * 1024 * 1024) * 100) / 100,
            available_gb: Math.round(availableBytes / (1024 * 1024 * 1024) * 100) / 100
        };
    } catch (error) {
        console.error(`Error getting disk usage for ${path}:`, error.message);
        throw new Error(`Failed to get disk usage for ${path}`);
    }
}

/**
 * Get all mount points from the system
 * @returns {Array} Array of mount point objects
 */
async function getMountPoints() {
    try {
        // Get mount information from /proc/mounts
        const { stdout } = await execAsync('cat /proc/mounts | grep -E "^/dev" | head -20');

        const mounts = stdout.trim().split('\n')
            .filter(line => line.length > 0)
            .map(line => {
                const parts = line.split(/\s+/);
                return {
                    filesystem: parts[0] || 'unknown',
                    mountpoint: parts[1] || 'unknown',
                    type: parts[2] || 'unknown',
                    options: parts[3] || 'unknown'
                };
            })
            .filter(mount => mount.mountpoint && mount.mountpoint !== 'unknown');

        return mounts;
    } catch (error) {
        console.error('Error getting mount points:', error.message);
        // Return at least root mount as fallback
        return [{
            filesystem: '/dev/root',
            mountpoint: '/',
            type: 'ext4',
            options: 'defaults'
        }];
    }
}

module.exports = router;