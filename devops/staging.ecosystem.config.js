// ============================================================
// BLUN.ai — PM2 Staging Ecosystem Config (Port 3201)
// Guenter / Infra — 2026-04-07
// ============================================================

module.exports = {
  apps: [
    {
      name: 'blun-staging',
      script: 'server.js',            // Hauptscript — anpassen falls anders
      cwd: '/opt/blun/staging',
      instances: 1,                    // Staging: Single Instance reicht
      exec_mode: 'fork',
      port: 3201,

      // Environment
      env: {
        NODE_ENV: 'staging',
        BLUN_PORT: 3201,
        BLUN_DB_HOST: '127.0.0.1',
        BLUN_DB_PORT: 5432,
        BLUN_DB_NAME: 'blun_staging',
        BLUN_DB_USER: 'blun',
        BLUN_DB_PASSWORD: 'blun2026secure',
        BLUN_DB_POOL: 10,
        BLUN_REDIS_URL: 'redis://127.0.0.1:6379/1',
        BLUN_API_KEY: 'blun-staging-key',
        LOG_LEVEL: 'debug',
      },

      // Restart-Policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,            // 5s zwischen Restarts
      max_memory_restart: '2G',       // Staging: 2GB Limit

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/blun/staging/error.log',
      out_file: '/var/log/blun/staging/out.log',
      merge_logs: true,
      log_type: 'json',

      // Watch (optional fuer Staging — auto-reload bei Aenderungen)
      watch: false,                   // auf true setzen fuer Dev-Modus
      ignore_watch: [
        'node_modules',
        'logs',
        'tmp',
        '.git',
        'uploads',
      ],

      // Health-Check
      listen_timeout: 10000,
      kill_timeout: 5000,
    },

    // --- DB Backup Cron fuer Staging ---
    {
      name: 'blun-staging-db-backup',
      script: '/tmp/blun-devops/staging-db-backup.sh',
      cron_restart: '0 */6 * * *',    // Alle 6 Stunden
      autorestart: false,
      exec_mode: 'fork',

      env: {
        DB_NAME: 'blun_staging',
        BACKUP_DIR: '/opt/blun/backups/staging',
        RETENTION_DAYS: 7,
      },

      out_file: '/var/log/blun/staging/backup.log',
      error_file: '/var/log/blun/staging/backup-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
