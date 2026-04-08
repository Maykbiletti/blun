/**
 * PM2 Ecosystem Config — BLUN Comms (Telegram Bot + Notification Webhooks)
 * Deployment: pm2 start ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'blun-telegram',
      script: './telegram-bot.js',
      cwd: '/root/blun/comms/',
      env: {
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: '',  // <-- Dieter: Token hier eintragen!
        BLUN_API_URL: 'http://localhost:3200'
      },
      max_memory_restart: '150M',
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/root/blun/logs/telegram-error.log',
      out_file: '/root/blun/logs/telegram-out.log'
    },
    {
      name: 'blun-webhooks',
      script: './webhooks/notification-webhook.js',
      cwd: '/root/blun/comms/',
      env: {
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: '',  // <-- Dieter: gleicher Token wie oben
        MAYK_CHAT_ID: '',        // <-- Dieter: Mayk's Telegram Chat-ID
        WEBHOOK_SECRET: ''       // <-- Dieter: beliebiger Secret-String
      },
      max_memory_restart: '100M',
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/root/blun/logs/webhooks-error.log',
      out_file: '/root/blun/logs/webhooks-out.log'
    }
  ]
};
