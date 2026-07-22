#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
#  FUD Portal – Ubuntu VPS Deployment Script
#  Tested on: Ubuntu 20.04 / 22.04 LTS
#  Run as: sudo bash deploy-ubuntu.sh
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail
COLOR_GREEN='\033[0;32m'; COLOR_RED='\033[0;31m'; NC='\033[0m'

ok()   { echo -e "${COLOR_GREEN}✔ $1${NC}"; }
fail() { echo -e "${COLOR_RED}✘ $1${NC}"; exit 1; }
step() { echo -e "\n\033[1;36m▶ $1\033[0m"; }

APP_USER="fudportal"
APP_DIR="/var/www/fud-portal"
DOMAIN="${DOMAIN:-your-domain.com}"
NODE_VERSION="20"

step "1. System update"
apt-get update -qq && apt-get upgrade -y -qq
ok "System updated"

step "2. Install Node.js $NODE_VERSION"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
ok "Node.js $(node -v) installed"

step "3. Install dependencies"
apt-get install -y -qq nginx sqlite3 certbot python3-certbot-nginx ufw fail2ban git
ok "nginx, sqlite3, certbot, ufw, fail2ban installed"

step "4. Install PM2"
npm install -g pm2 --silent
ok "PM2 $(pm2 -v) installed"

step "5. Create app user"
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false "$APP_USER"
fi
ok "App user '$APP_USER' ready"

step "6. Create directory structure"
mkdir -p "$APP_DIR" /var/data/fud-portal /var/log/fud-portal /var/backups/fud-portal
chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/data/fud-portal /var/log/fud-portal /var/backups/fud-portal
ok "Directories created"

step "7. Configure UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ok "Firewall configured (SSH + 80 + 443 only)"

step "8. Configure fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
action   = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath  = /var/log/nginx/error.log
findtime = 600
bantime  = 7200
maxretry = 10
EOF
systemctl restart fail2ban
ok "fail2ban configured"

step "9. Copy Nginx config"
cp "$APP_DIR/nginx/nginx.conf"          /etc/nginx/nginx.conf
cp "$APP_DIR/nginx/conf.d/fud-portal.conf" /etc/nginx/sites-available/fud-portal
sed -i "s/your-domain.com/$DOMAIN/g"   /etc/nginx/sites-available/fud-portal
ln -sf /etc/nginx/sites-available/fud-portal /etc/nginx/sites-enabled/fud-portal
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx configured"

step "10. Obtain TLS certificate (Let's Encrypt)"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos \
  --email "admin@$DOMAIN" \
  --redirect
ok "TLS certificate obtained"

step "11. Install app dependencies"
cd "$APP_DIR"
npm ci --omit=dev
ok "npm dependencies installed"

step "12. Setup .env"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  # Generate secure random JWT secrets
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$APP_DIR/.env"
  sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET|" "$APP_DIR/.env"
  sed -i "s|DB_PATH=.*|DB_PATH=/var/data/fud-portal/fud_portal.db|" "$APP_DIR/.env"
  sed -i "s|LOG_DIR=.*|LOG_DIR=/var/log/fud-portal|" "$APP_DIR/.env"
  sed -i "s|UPLOAD_DIR=.*|UPLOAD_DIR=$APP_DIR/uploads|" "$APP_DIR/.env"
  sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|" "$APP_DIR/.env"
  sed -i "s|NODE_ENV=.*|NODE_ENV=production|" "$APP_DIR/.env"
  echo -e "${COLOR_RED}⚠ IMPORTANT: Edit $APP_DIR/.env with your SMTP, admin credentials, etc.${NC}"
fi

step "13. Start application with PM2"
cd "$APP_DIR"
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u "$APP_USER" --hp "/var/www/fud-portal" | tail -1 | bash
ok "PM2 started and configured to run on boot"

step "14. Setup daily backup cron"
chmod +x "$APP_DIR/scripts/backup.sh"
echo "0 2 * * * $APP_USER BACKUP_DIR=/var/backups/fud-portal DB_PATH=/var/data/fud-portal/fud_portal.db $APP_DIR/scripts/backup.sh >> /var/log/fud-portal/backup.log 2>&1" \
  > /etc/cron.d/fud-portal-backup
ok "Daily backup cron at 2:00 AM configured"

step "15. Setup logrotate"
cat > /etc/logrotate.d/fud-portal <<EOF
/var/log/fud-portal/*.log {
  daily
  missingok
  rotate 30
  compress
  delaycompress
  notifempty
  copytruncate
}
EOF
ok "Log rotation configured (30 days)"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  FUD Portal deployed successfully!"
echo "  URL: https://$DOMAIN"
echo "  App: pm2 status"
echo "  Logs: pm2 logs fud-portal"
echo "  ⚠  Edit $APP_DIR/.env with SMTP and admin settings!"
echo "════════════════════════════════════════════════════════"
