const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class MigrationRunner {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = new sqlite3.Database(dbPath);
    }

    async initMigrationsTable() {
        return new Promise((resolve, reject) => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT UNIQUE NOT NULL,
                    status TEXT DEFAULT 'pending',
                    started_at DATETIME,
                    completed_at DATETIME,
                    error_message TEXT
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async getMigrationStatus(filename) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT status, started_at, completed_at, error_message FROM migrations WHERE filename = ?',
                [filename],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async markMigrationStarted(filename) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR REPLACE INTO migrations (filename, status, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [filename, 'pending'],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async markMigrationCompleted(filename) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE migrations SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE filename = ?',
                ['done', filename],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async markMigrationFailed(filename, error) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE migrations SET status = ?, completed_at = CURRENT_TIMESTAMP, error_message = ? WHERE filename = ?',
                ['failed', error, filename],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async runMigration(migrationPath) {
        const filename = path.basename(migrationPath);

        // Check if already completed
        const status = await this.getMigrationStatus(filename);
        if (status?.status === 'done') {
            console.log(`Migration ${filename} already completed at ${status.completed_at}`);
            return;
        }

        if (status?.status === 'failed') {
            console.log(`Migration ${filename} previously failed: ${status.error_message}`);
            console.log('Retrying...');
        }

        // Mark as started
        await this.markMigrationStarted(filename);

        try {
            // Read and execute migration
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            await new Promise((resolve, reject) => {
                this.db.exec(migrationSQL, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Mark as completed
            await this.markMigrationCompleted(filename);
            console.log(`Migration ${filename} completed successfully`);

        } catch (error) {
            // Mark as failed
            await this.markMigrationFailed(filename, error.message);
            console.error(`Migration ${filename} failed:`, error);
            throw error;
        }
    }

    async getAllMigrationStatuses() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT filename, status, started_at, completed_at, error_message FROM migrations ORDER BY filename',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async runAllMigrations(migrationDir = './migrations') {
        await this.initMigrationsTable();

        if (!fs.existsSync(migrationDir)) {
            console.log('No migrations directory found');
            return;
        }

        const files = fs.readdirSync(migrationDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const migrationPath = path.join(migrationDir, file);
            await this.runMigration(migrationPath);
        }
    }

    close() {
        this.db.close();
    }
}

module.exports = { MigrationRunner };