const { exec } = require('child_process');
const fs = require('fs');

function getCurrentUsage() {
    return new Promise((resolve, reject) => {
        exec('df -h /', (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }

            const lines = stdout.trim().split('\n');
            const diskLine = lines[1];
            const parts = diskLine.split(/\s+/);
            const usagePercent = parseInt(parts[4].replace('%', ''));

            resolve({
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                usagePercent: usagePercent,
                mountPoint: parts[5]
            });
        });
    });
}

function checkDiskUsage() {
    getCurrentUsage()
        .then(usage => {
            if (usage.usagePercent > 80) {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] WARNUNG: Disk usage ${usage.usagePercent}% on ${usage.filesystem} (${usage.used}/${usage.size})\n`;

                fs.appendFile('/tmp/blun-disk.log', logMessage, (err) => {
                    if (err) console.error('Failed to write to log:', err);
                });
            }
        })
        .catch(error => {
            console.error('Disk check failed:', error);
        });
}

// Check every 5 minutes
setInterval(checkDiskUsage, 5 * 60 * 1000);

// Initial check
checkDiskUsage();

module.exports = { getCurrentUsage };