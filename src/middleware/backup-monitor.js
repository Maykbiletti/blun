/**
 * Backup Monitor Middleware - Paperclip DB Status Check
 * Überwacht automatisch den Backup-Status der Paperclip-Datenbank
 * @author Guenter - Backend Team
 */

const { Pool } = require('pg');

// Connection Pool für Paperclip DB - das muss man richtig machen
const paperclipPool = new Pool({
    host: process.env.PAPERCLIP_DB_HOST || 'localhost',
    port: process.env.PAPERCLIP_DB_PORT || 5432,
    database: process.env.PAPERCLIP_DB_NAME || 'paperclip_db',
    user: process.env.PAPERCLIP_DB_USER || 'paperclip_user',
    password: process.env.PAPERCLIP_DB_PASSWORD,
    max: 5, // Begrenzt für Monitoring
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

/**
 * Prüft letzten Backup-Zeitstempel aus pg_stat_activity
 * Das muss sauber gemacht werden - keine SQL Injection!
 */
async function getLastBackupTime() {
    const client = await paperclipPool.connect();

    try {
        // Parameterisierte Query - IMMER so machen bei PostgreSQL
        const query = `
            SELECT
                schemaname,
                tablename,
                last_vacuum,
                last_autoanalyze,
                n_tup_ins + n_tup_upd + n_tup_del as total_changes
            FROM pg_stat_user_tables
            WHERE schemaname = $1
            ORDER BY last_vacuum DESC NULLS LAST
            LIMIT $2
        `;

        const result = await client.query(query, ['public', 10]);
        return result.rows;

    } catch (error) {
        // Error loggen mit Context - aber Stack Trace nicht an User
        console.error('Backup Monitor Error:', {
            error: error.message,
            timestamp: new Date().toISOString(),
            component: 'backup-monitor'
        });
        throw new Error('Backup status check failed');

    } finally {
        client.release(); // Connection Pool richtig freigeben
    }
}

/**
 * Analysiert ob Backup erforderlich ist
 * Geschäftslogik sauber getrennt - Single Responsibility
 */
function analyzeBackupStatus(backupData) {
    const now = new Date();
    const criticalHours = 24; // Nach 24h wird's kritisch

    let status = {
        isHealthy: true,
        needsBackup: false,
        criticalTables: [],
        lastBackupAge: null
    };

    if (!backupData || backupData.length === 0) {
        status.isHealthy = false;
        status.needsBackup = true;
        return status;
    }

    // Prüfe jede Tabelle auf Backup-Alter
    for (const table of backupData) {
        if (table.last_vacuum) {
            const backupAge = (now - new Date(table.last_vacuum)) / (1000 * 60 * 60);

            if (backupAge > criticalHours && table.total_changes > 100) {
                status.criticalTables.push({
                    table: table.tablename,
                    ageHours: Math.round(backupAge),
                    changes: table.total_changes
                });
                status.needsBackup = true;
            }
        }
    }

    if (status.criticalTables.length > 0) {
        status.isHealthy = false;
    }

    return status;
}

/**
 * Express Middleware für Backup-Status Check
 * Kann als Route oder Pre-Check verwendet werden
 */
async function backupMonitor(req, res, next) {
    try {
        // Backup-Daten holen - mit Timeout für Performance
        const backupData = await Promise.race([
            getLastBackupTime(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Backup check timeout')), 5000)
            )
        ]);

        // Status analysieren
        const status = analyzeBackupStatus(backupData);

        // Results in Request Object für weitere Middleware
        req.backupStatus = {
            timestamp: new Date().toISOString(),
            paperclipDB: status,
            raw: backupData
        };

        // Warning Header setzen wenn Backup nötig
        if (status.needsBackup) {
            res.set('X-Backup-Warning', 'Paperclip DB needs backup');
        }

        next(); // Weiter zur nächsten Middleware

    } catch (error) {
        // Error loggen aber Request nicht blockieren
        console.error('Backup Monitor Failed:', {
            error: error.message,
            route: req.originalUrl,
            timestamp: new Date().toISOString()
        });

        // Fallback Status setzen
        req.backupStatus = {
            timestamp: new Date().toISOString(),
            paperclipDB: { isHealthy: false, error: 'Monitor unavailable' }
        };

        next(); // Trotzdem weiter - das muss robust sein
    }
}

/**
 * API Route für manuellen Status-Check
 * GET /api/backup-status
 */
async function getBackupStatus(req, res) {
    try {
        const backupData = await getLastBackupTime();
        const status = analyzeBackupStatus(backupData);

        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            paperclipDB: status,
            details: backupData
        });

    } catch (error) {
        console.error('Backup Status API Error:', error.message);

        res.status(500).json({
            ok: false,
            error: 'Unable to check backup status',
            timestamp: new Date().toISOString()
        });
    }
}

// Graceful Shutdown - Pool sauber schließen
process.on('SIGTERM', async () => {
    console.log('Closing Paperclip DB pool...');
    await paperclipPool.end();
});

module.exports = {
    backupMonitor,
    getBackupStatus,
    getLastBackupTime,
    analyzeBackupStatus
};