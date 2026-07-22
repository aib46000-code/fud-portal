# 🚀 FUD Portal — Deployment & Operations Guide

Comprehensive deployment, operational, and maintenance documentation for **FUD Portal** — a full-featured School Management System built with Node.js, Express, SQLite3, and Vanilla HTML/CSS/JS.

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Quick Start (Local Development)](#2-quick-start-local-development)
3. [Ubuntu VPS Deployment](#3-ubuntu-vps-deployment-pm2--nginx--certbot)
4. [Render.com Deployment](#4-rendercom-deployment)
5. [Railway Deployment](#5-railway-deployment)
6. [Docker Deployment](#6-docker-deployment)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Database Management](#8-database-management-backup-restore-migrations)
9. [Monitoring & Health Checks](#9-monitoring--health-checks)
10. [Troubleshooting](#10-troubleshooting-common-issues)

---

## 1. Prerequisites

### Runtime Requirements
| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | v20.x LTS | v22.x LTS |
| RAM | 1 GB | 2 GB |
| Disk | 10 GB SSD | 20 GB SSD |
| CPU | 1 vCPU | 2 vCPU |

> [!NOTE]
> FUD Portal serves its Vanilla HTML/CSS/JS frontend statically via Express. No separate build step (Webpack/Vite) is required.

**Required build tools** (for native `sqlite3` bindings):
```bash
# Ubuntu/Debian
sudo apt-get install -y python3 make g++ build-essential

# Alpine (Docker)
apk add --no-cache python3 make g++
```

---

## 2. Quick Start (Local Development)

```bash
# Clone
git clone https://github.com/your-org/fud-portal.git
cd fud-portal

# Install
npm install

# Configure
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, admin credentials

# Initialize database
npm run setup

# Start dev server
npm run dev
# → http://localhost:5000
```

**Useful endpoints:**
| URL | Description |
|-----|-------------|
| `http://localhost:5000/` | Frontend (index.html) |
| `http://localhost:5000/api/health` | Health check |
| `http://localhost:5000/api/metrics` | Runtime metrics |

---

## 3. Ubuntu VPS Deployment (PM2 + Nginx + Certbot)

### Option A — Automated (Recommended)

```bash
# Clone to server
sudo git clone https://github.com/your-org/fud-portal.git /var/www/fud-portal
cd /var/www/fud-portal

# Copy and edit .env FIRST
sudo cp .env.example .env
sudo nano .env

# Run automated deploy script
sudo DOMAIN=portal.your-school.edu.ng bash scripts/deploy-ubuntu.sh
```

The script automatically installs: Node.js 20, PM2, Nginx, Certbot, UFW, fail2ban, logrotate, and daily backup cron.

---

### Option B — Manual Step-by-Step

#### Step 1: System Preparation
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y nginx sqlite3 certbot python3-certbot-nginx \
  ufw fail2ban git curl build-essential python3 make g++
```

#### Step 2: Install Node.js 20 + PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

#### Step 3: Create App User & Directories
```bash
sudo useradd --system --no-create-home --shell /bin/false fudportal
sudo mkdir -p /var/www/fud-portal /var/data/fud-portal \
              /var/log/fud-portal /var/backups/fud-portal
sudo chown -R fudportal:fudportal /var/www/fud-portal \
  /var/data/fud-portal /var/log/fud-portal /var/backups/fud-portal
```

#### Step 4: Deploy Application
```bash
cd /var/www/fud-portal
sudo git clone https://github.com/your-org/fud-portal.git .
sudo npm ci --omit=dev
sudo cp .env.example .env
sudo nano .env   # Set all required values
```

#### Step 5: Generate Secrets
```bash
# Run this twice — use first output for JWT_SECRET, second for JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> [!IMPORTANT]
> `JWT_SECRET` and `JWT_REFRESH_SECRET` must be **different** values. Never reuse secrets across environments.

#### Step 6: Configure Nginx
```bash
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp nginx/conf.d/fud-portal.conf /etc/nginx/sites-available/fud-portal
# Edit to set your domain:
sudo sed -i 's/your-domain.com/portal.your-school.edu.ng/g' \
  /etc/nginx/sites-available/fud-portal
sudo ln -sf /etc/nginx/sites-available/fud-portal \
            /etc/nginx/sites-enabled/fud-portal
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

#### Step 7: TLS Certificate
```bash
sudo certbot --nginx -d portal.your-school.edu.ng \
  --non-interactive --agree-tos \
  -m admin@your-school.edu.ng --redirect
```

#### Step 8: Firewall
```bash
sudo ufw allow ssh && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

#### Step 9: Start with PM2
```bash
cd /var/www/fud-portal
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # Follow the printed command to enable auto-start
```

#### Step 10: Daily Backups
```bash
chmod +x /var/www/fud-portal/scripts/backup.sh
echo "0 2 * * * fudportal BACKUP_DIR=/var/backups/fud-portal \
  DB_PATH=/var/data/fud-portal/fud_portal.db \
  /var/www/fud-portal/scripts/backup.sh >> /var/log/fud-portal/backup.log 2>&1" \
  | sudo tee /etc/cron.d/fud-portal-backup
```

---

## 4. Render.com Deployment

> [!WARNING]
> SQLite requires persistent storage. You **MUST** attach a Render Disk — without it, data resets on every deploy.

### Steps

1. Push repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com) → **New → Blueprint**
3. Connect repository — Render auto-detects `render.yaml`
4. Set these **secret** environment variables in Render Dashboard:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | 48+ char random hex |
| `JWT_REFRESH_SECRET` | Different 48+ char random hex |
| `ADMIN_EMAIL` | Your admin email |
| `ADMIN_PASSWORD` | Strong admin password |
| `EMAIL_USER` | SMTP email |
| `EMAIL_PASS` | SMTP password |
| `FRONTEND_URL` | `https://fud-portal.onrender.com` |

### Render Config (render.yaml)
| Setting | Value |
|---------|-------|
| Build Command | `npm ci --omit=dev` |
| Start Command | `node backend/server.js` |
| Health Check | `/api/health` |
| Disk Mount | `/var/data` (5 GB) |
| DB_PATH | `/var/data/fud_portal.db` |
| UPLOAD_DIR | `/var/data/uploads` |

---

## 5. Railway Deployment

### Steps

1. Create project on [Railway.app](https://railway.app) → Connect GitHub repo
2. Add a **Volume** → Mount path: `/app/data`
3. Set environment variables:

```env
NODE_ENV=production
PORT=5000
DB_PATH=/app/data/fud_portal.db
UPLOAD_DIR=/app/data/uploads
LOG_DIR=/app/data/logs
JWT_SECRET=<48-char-hex>
JWT_REFRESH_SECRET=<different-48-char-hex>
FRONTEND_URL=https://your-app.up.railway.app
ADMIN_EMAIL=admin@your-school.edu.ng
ADMIN_PASSWORD=<strong-password>
EMAIL_USER=<smtp-email>
EMAIL_PASS=<smtp-password>
```

4. Deploy — Railway auto-detects `railway.json` settings

---

## 6. Docker Deployment

### Quick Start
```bash
# Copy and edit .env
cp .env.example .env
nano .env

# Build and start (app + nginx)
docker-compose up -d --build

# View logs
docker-compose logs -f app

# Initialize database (first run)
docker-compose exec app npm run setup

# Status
docker-compose ps
```

### Architecture
| Service | Image | Role |
|---------|-------|------|
| `app` | `node:20-alpine` | Node.js Express server |
| `nginx` | `nginx:1.25-alpine` | Reverse proxy + TLS |

### Named Volumes (persistent)
| Volume | Mount | Contents |
|--------|-------|----------|
| `db_data` | `/app/data` | SQLite database |
| `uploads` | `/app/uploads` | User uploaded files |
| `logs` | `/app/logs` | Application logs |

### Update Deployment
```bash
git pull origin main
docker-compose up -d --build
# Zero-downtime: nginx serves while new image builds
```

---

## 7. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | ✅ | `production` | Runtime environment |
| `PORT` | ✅ | `5000` | HTTP server port |
| `DB_PATH` | ✅ | `./backend/database/fud_portal.db` | SQLite database file path |
| `JWT_SECRET` | ✅ | — | Access token signing secret (48+ chars) |
| `JWT_EXPIRES_IN` | ✅ | `15m` | Access token TTL |
| `JWT_REFRESH_SECRET` | ✅ | — | Refresh token signing secret (48+ chars, different) |
| `JWT_REFRESH_EXPIRES_IN` | ✅ | `7d` | Refresh token TTL |
| `BCRYPT_ROUNDS` | — | `12` | bcrypt work factor |
| `ADMIN_EMAIL` | ✅ | — | Initial superadmin email |
| `ADMIN_PASSWORD` | ✅ | — | Initial superadmin password |
| `FRONTEND_URL` | ✅ | `http://localhost:5000` | CORS allowed origin |
| `UPLOAD_DIR` | ✅ | `./uploads` | File upload directory |
| `MAX_FILE_SIZE_MB` | — | `10` | Max upload size in MB |
| `LOG_DIR` | — | `./logs` | Log file directory |
| `LOG_LEVEL` | — | `warn` | Winston log level |
| `EMAIL_SERVICE` | — | `gmail` | Nodemailer service |
| `EMAIL_HOST` | — | `smtp.gmail.com` | SMTP hostname |
| `EMAIL_PORT` | — | `587` | SMTP port |
| `EMAIL_USER` | — | — | SMTP username |
| `EMAIL_PASS` | — | — | SMTP password |
| `EMAIL_FROM` | — | — | Sender address |
| `BACKUP_DIR` | — | `/var/backups/fud-portal` | Backup destination |
| `BACKUP_RETENTION_DAYS` | — | `30` | Days to keep backups |

---

## 8. Database Management (Backup, Restore, Migrations)

### Migrations
```bash
npm run migrate    # Create/update schema
npm run seed       # Insert default admin
npm run setup      # migrate + seed
```

### Manual Backup
```bash
bash scripts/backup.sh
# Creates: /var/backups/fud-portal/fud_portal_YYYYMMDD_HHMMSS.db.gz
```

### Restore from Backup
```bash
pm2 stop fud-portal
gunzip -c /var/backups/fud-portal/fud_portal_20260722_020000.db.gz \
  > /tmp/restore.db
cp /tmp/restore.db /var/data/fud-portal/fud_portal.db
chown fudportal:fudportal /var/data/fud-portal/fud_portal.db
pm2 start fud-portal
```

> [!CAUTION]
> Always stop the app before replacing the active database file.

### SQLite Admin Shell
```bash
sqlite3 /var/data/fud-portal/fud_portal.db
.tables                          # list all tables
PRAGMA journal_mode;             # should return: wal
PRAGMA foreign_keys;             # should return: 1
SELECT count(*) FROM users;      # count total users
.quit
```

---

## 9. Monitoring & Health Checks

### PM2 Commands
```bash
pm2 status                       # process status overview
pm2 logs fud-portal --lines 100  # view recent logs
pm2 monit                        # real-time CPU/memory monitor
pm2 reload fud-portal            # zero-downtime reload
pm2 restart fud-portal           # hard restart
```

### Health Endpoint
```bash
curl https://your-domain.com/api/health
```
```json
{
  "success": true,
  "message": "FUD Portal API is running",
  "version": "1.0.0",
  "env": "production",
  "uptime": 86400,
  "timestamp": "2026-07-22T15:00:00.000Z"
}
```

### Metrics Endpoint
```bash
curl https://your-domain.com/api/metrics
```
```json
{
  "success": true,
  "data": {
    "uptime_seconds": 86400,
    "memory": {
      "rss_mb": 64.5,
      "heap_used_mb": 32.1,
      "heap_total_mb": 48.0,
      "external_mb": 2.3
    },
    "node_version": "v20.15.0",
    "pid": 1234,
    "env": "production",
    "timestamp": "2026-07-22T15:00:00.000Z"
  }
}
```

### Uptime Monitoring (Free)
Set up [UptimeRobot](https://uptimerobot.com) to ping `/api/health` every 5 minutes — get instant alerts if the server goes down.

### Log Files
| File | Location | Contents |
|------|----------|----------|
| App errors | `LOG_DIR/error.log` | Winston error-level logs |
| Combined | `LOG_DIR/combined.log` | All levels |
| PM2 out | `./logs/pm2-out.log` | stdout |
| PM2 err | `./logs/pm2-error.log` | stderr |
| Nginx access | `/var/log/nginx/access.log` | HTTP requests |
| Nginx error | `/var/log/nginx/error.log` | Nginx errors |

---

## 10. Troubleshooting Common Issues

### `SQLITE_BUSY: database is locked`
- **Cause**: Concurrent writes on non-WAL database, or database on NFS mount
- **Fix**: Ensure `PRAGMA journal_mode = WAL` in db.js (already set). Never mount SQLite on NFS.

### `HTTP 413 Payload Too Large` on uploads
- **Cause**: File exceeds limit in Nginx or Express
- **Fix**: Set `client_max_body_size 15M;` in Nginx and `MAX_FILE_SIZE_MB=10` in `.env`

### `JsonWebTokenError: invalid signature`
- **Cause**: JWT secret mismatch (different between processes or deployments)
- **Fix**: Ensure `JWT_SECRET` is identical across all server instances

### `EACCES: permission denied`
- **Cause**: App user lacks write access to DB, uploads, or logs directory
- **Fix**:
  ```bash
  sudo chown -R fudportal:fudportal /var/data/fud-portal \
    /var/www/fud-portal/uploads /var/log/fud-portal
  ```

### `EADDRINUSE: address already in use :::5000`
- **Cause**: Port 5000 taken by another process
- **Fix**:
  ```bash
  sudo lsof -i :5000
  sudo kill -9 <PID>
  ```

### SQLite3 build fails during `npm install`
- **Cause**: Missing native build tools
- **Fix**:
  ```bash
  sudo apt-get install -y python3 build-essential make g++
  npm rebuild sqlite3
  ```

### Email not sending / stuck in queue
- **Cause**: Wrong SMTP credentials, Gmail requires App Password (not account password)
- **Fix**: Generate Gmail App Password at myaccount.google.com/apppasswords
- **Test**:
  ```bash
  node email_system_test.js
  ```

### Student can't login after password change
- **Cause**: All sessions are revoked when password changes (by design — security feature)
- **Fix**: This is expected. Student must login with new password.

---

*FUD Portal v1.0.0 — Ahmaditech School Management System*
