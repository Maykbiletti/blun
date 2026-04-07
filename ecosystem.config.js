module.exports = {
  apps: [
    {
      name: 'blun',
      script: './server.js',
      cwd: '/root/blun',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3200
      },
      error_file: '/root/.pm2/logs/blun-error.log',
      out_file: '/root/.pm2/logs/blun-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      autorestart: true,
      watch: false
    },
    {
      name: 'blun-staging',
      script: './server.js',
      cwd: '/root/blun',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'staging',
        PORT: 3201
      },
      error_file: '/root/.pm2/logs/blun-staging-error.log',
      out_file: '/root/.pm2/logs/blun-staging-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      autorestart: true,
      watch: false
    }
  ]
};
