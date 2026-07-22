# FUD Portal — Production Deployment Checklist

> Work through every item before going live. Check off each item as you complete it.

---

## Phase 1 — Pre-Deployment

### Source Code
- [ ] All tests passing: `node security_audit.js` → 56/56
- [ ] All E2E tests passing: `node e2e_tests.js` → 55/55
- [ ] No `console.log` debug statements left in production code
- [ ] `NODE_ENV` will be set to `production`
- [ ] `.env` is NOT committed to git (check `.gitignore`)
- [ ] `.env.example` is committed (with no real secrets)
- [ ] `package-lock.json` is committed
- [ ] No dev-only packages in `dependencies` (only in `devDependencies`)

### Server / Hosting
- [ ] Ubuntu 20.04 / 22.04 LTS (or Docker host) provisioned
- [ ] Minimum: 1 vCPU, 1 GB RAM, 20 GB SSD
- [ ] Domain name purchased and DNS pointing to server IP
- [ ] SSH key-based authentication enabled
- [ ] Root login via SSH disabled (`PermitRootLogin no`)
- [ ] Swap space configured (1–2 GB)

---

## Phase 2 — Environment Configuration

### Generate Secure Secrets
```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
```

### .env Checklist
- [ ] `NODE_ENV=production`
- [ ] `PORT=5000`
- [ ] `DB_PATH` → absolute path outside web root
- [ ] `JWT_SECRET` → 48+ char random hex (unique per environment)
- [ ] `JWT_REFRESH_SECRET` → 48+ char random hex (different from JWT_SECRET)
- [ ] `JWT_EXPIRES_IN=15m`
- [ ] `JWT_REFRESH_EXPIRES_IN=7d`
- [ ] `BCRYPT_ROUNDS=12`
- [ ] `ADMIN_EMAIL` → changed from default
- [ ] `ADMIN_PASSWORD` → strong password, changed from default
- [ ] `FRONTEND_URL` → your actual domain (`https://fud-portal.edu.ng`)
- [ ] `EMAIL_USER` → real SMTP email address
- [ ] `EMAIL_PASS` → real SMTP password (Gmail App Password)
- [ ] `UPLOAD_DIR` → absolute path
- [ ] `LOG_DIR` → absolute path
- [ ] `LOG_LEVEL=warn`
- [ ] File permissions: `chmod 600 .env`

---

## Phase 3 — Server Setup (Ubuntu VPS)

### System
- [ ] `apt update && apt upgrade -y` completed
- [ ] Node.js 20 installed: `node -v` → v20.x.x
- [ ] PM2 installed globally: `npm install -g pm2`
- [ ] Nginx installed and running
- [ ] Certbot installed for TLS
- [ ] fail2ban installed and active

### Firewall (UFW)
- [ ] UFW enabled and active
- [ ] Only ports open: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- [ ] All other ports blocked by default

---

## Phase 4 — Application Deployment

### Files & Permissions
- [ ] Project deployed to `/var/www/fud-portal`
- [ ] `npm ci --omit=dev` completed successfully
- [ ] Upload directory created with correct permissions
- [ ] Log directory created with correct permissions
- [ ] Data directory created outside web root
- [ ] All directories owned by app user (not root)
- [ ] `chmod +x scripts/backup.sh` executed

### Database
- [ ] Database file creates on first run
- [ ] Default superadmin created with your credentials
- [ ] WAL mode active: `PRAGMA journal_mode;` → `wal`
- [ ] Foreign keys enforced: `PRAGMA foreign_keys;` → `1`

### PM2
- [ ] `pm2 start ecosystem.config.js --env production` → online
- [ ] `pm2 save` completed
- [ ] `pm2 startup` configured for boot-time start
- [ ] Reboot test passed: server restarts → app auto-starts

---

## Phase 5 — TLS / Nginx

- [ ] Nginx config valid: `nginx -t` → ok
- [ ] Let's Encrypt certificate obtained for domain + www
- [ ] HTTP → HTTPS redirect: `curl -I http://your-domain.com` → `301`
- [ ] HTTPS working: `curl https://your-domain.com/api/health` → `200`
- [ ] HSTS header present
- [ ] Auto-renewal dry-run: `certbot renew --dry-run` → success
- [ ] Security headers grade: **A+** on securityheaders.com

---

## Phase 6 — Functional Verification

- [ ] Health: `curl https://your-domain.com/api/health` → `{"success":true,...}`
- [ ] Metrics: `curl https://your-domain.com/api/metrics` → memory data
- [ ] Student registration works
- [ ] Student login works + JWT issued
- [ ] Admin login works + dashboard accessible
- [ ] CBT test creation works
- [ ] CBT submission works
- [ ] Media upload works (admin only)
- [ ] Notifications delivered
- [ ] Password change works
- [ ] Logout invalidates session
- [ ] Email delivery tested (password reset flow)

---

## Phase 7 — Security Verification

- [ ] Security audit: `node security_audit.js` → **56/56 passed**
- [ ] `/.env` returns 404: `curl https://your-domain.com/.env`
- [ ] `/.git/config` returns 404
- [ ] `/uploads/` directory listing blocked
- [ ] Rate limiting: 11+ rapid auth requests → 429
- [ ] Invalid JWT → 401
- [ ] SSL Labs score: **A** or **A+**

---

## Phase 8 — Monitoring & Backups

- [ ] Daily backup cron active: `crontab -l | grep backup`
- [ ] Manual backup tested: `bash scripts/backup.sh` → `.db.gz` created
- [ ] Backup restore tested: sqlite3 can open backup file
- [ ] Log rotation configured: `/etc/logrotate.d/fud-portal`
- [ ] UptimeRobot / cron ping monitoring `/api/health` every 5 min
- [ ] `pm2 logs fud-portal` clean (no errors)

---

## Phase 9 — Performance

- [ ] Gzip active: response includes `Content-Encoding: gzip`
- [ ] HTML `Cache-Control: no-cache` (always fresh)
- [ ] CSS/JS `Cache-Control: public, max-age=604800`
- [ ] Font `Cache-Control: public, max-age=31536000, immutable`
- [ ] API health < 50ms response time
- [ ] Admin stats < 200ms response time

---

## Phase 10 — Post-Launch

- [ ] Monitor logs for 30 min after launch
- [ ] Run full E2E suite against production URL
- [ ] Verify first daily backup completes
- [ ] Change admin password after first login
- [ ] Document any customizations made
- [ ] Schedule monthly `npm audit` review
- [ ] Schedule quarterly backup restore test

---

## Quick Reference Commands

```bash
# PM2
pm2 status
pm2 logs fud-portal --lines 50
pm2 restart fud-portal
pm2 monit

# Health
curl http://localhost:5000/api/health

# Backup
bash /var/www/fud-portal/scripts/backup.sh

# Errors
tail -100 /var/log/fud-portal/error.log

# Nginx
nginx -t && systemctl reload nginx

# SQLite
sqlite3 /var/data/fud-portal/fud_portal.db ".tables"

# Disk
df -h && du -sh /var/backups/fud-portal/
```
