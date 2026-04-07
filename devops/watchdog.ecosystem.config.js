// PM2 Watchdog — laeuft als Cron-Job via PM2 (Alternative zu System-Cron)
// pm2 start /tmp/blun-devops/watchdog.ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "pm2-watchdog",
      script: "/tmp/blun-devops/pm2-watchdog.sh",
      cron_restart: "*/2 * * * *",   // Alle 2 Minuten
      autorestart: false,             // Nicht dauerhaft laufen — nur per Cron
      watch: false,
      max_memory_restart: "100M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/blun-watchdog/pm2-stderr.log",
      out_file: "/var/log/blun-watchdog/pm2-stdout.log",
      merge_logs: true,
      env: {
        WATCHDOG_WEBHOOK_URL: "",     // Slack/Discord Webhook hier eintragen
      },
    },
  ],
};
