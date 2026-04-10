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
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
                'SELECT applied_at FROM migrations WHERE filename = ?',
                [filename],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async markMigrationApplied(filename) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO migrations (filename) VALUES (?)',
                [filename],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async runMigration(migrationPath) {
        const filename = path.basename(migrationPath);

        // Check if already applied
        const status = await this.getMigrationStatus(filename);
        if (status) {
            console.log(`Migration ${filename} already applied at ${status.applied_at}`);
            return;
        }

        try {
            // Read and execute migration
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            await new Promise((resolve, reject) => {
                this.db.exec(migrationSQL, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Mark as applied
            await this.markMigrationApplied(filename);
            console.log(`Migration ${filename} applied successfully`);

        } catch (error) {
            console.error(`Failed to run migration ${filename}:`, error);
            throw error;
        }
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