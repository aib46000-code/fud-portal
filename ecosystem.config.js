# ────────────────────────────────────────────────────────────────────────────
#  FUD Portal – PM2 Ecosystem Configuration
#  Usage:  pm2 start ecosystem.config.js --env production
# ────────────────────────────────────────────────────────────────────────────
module.exports = {
  apps: [
    {
      name:             'fud-portal',
      script:           './backend/server.js',
      cwd:              '/app',
      instances:        'max',          // cluster mode – 1 process per CPU
      exec_mode:        'cluster',
      autorestart:      true,
      watch:            false,          // never watch in production
      max_memory_restart: '512M',
      restart_delay:    3000,
      wait_ready:       true,
      listen_timeout:   10000,
      kill_timeout:     5000,

      // ── Environment: Development ──────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT:     5000,
      },

      // ── Environment: Production ───────────────────────────────────────────
      env_production: {
        NODE_ENV: 'production',
        PORT:     5000,
      },

      // ── Logging ───────────────────────────────────────────────────────────
      log_date_format:  'YYYY-MM-DD HH:mm:ss Z',
      out_file:         './logs/pm2-out.log',
      error_file:       './logs/pm2-error.log',
      merge_logs:       true,

      // ── Advanced ──────────────────────────────────────────────────────────
      source_map_support: true,
      node_args:          '--max-old-space-size=512',
    },

    // ── Backup Cron Job ─────────────────────────────────────────────────────
    {
      name:     'fud-portal-backup',
      script:   './scripts/backup.sh',
      cron_restart: '0 2 * * *',         // 2 AM every day
      watch:    false,
      autorestart: false,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
