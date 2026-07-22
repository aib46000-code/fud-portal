#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
#  FUD Portal – Automated Database Backup Script
#  Schedule: Daily via PM2 cron or crontab
#  Retention: 30 days local, optional S3/Backblaze upload
#
#  Usage:
#    chmod +x scripts/backup.sh
#    ./scripts/backup.sh
#
#  Crontab (alternative to PM2):
#    0 2 * * * /path/to/fud-portal/scripts/backup.sh >> /var/log/fud-backup.log 2>&1
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/app}"
DB_PATH="${DB_PATH:-$APP_DIR/data/fud_portal.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/fud_portal_${TIMESTAMP}.db"
LOG_PREFIX="[FUD-Backup]"

# ── Ensure backup directory exists ────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') Starting backup..."

# ── Check source database exists ──────────────────────────────────────────
if [ ! -f "$DB_PATH" ]; then
  echo "$LOG_PREFIX ERROR: Database not found at $DB_PATH"
  exit 1
fi

# ── SQLite online backup (safe even when server is running) ───────────────
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "$LOG_PREFIX Backup created: $BACKUP_FILE ($SIZE)"
else
  echo "$LOG_PREFIX ERROR: Backup failed!"
  exit 1
fi

# ── Compress backup ───────────────────────────────────────────────────────
gzip -9 "$BACKUP_FILE"
echo "$LOG_PREFIX Compressed: ${BACKUP_FILE}.gz"

# ── Remove backups older than RETENTION_DAYS ──────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "fud_portal_*.db.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "$LOG_PREFIX Removed $DELETED old backup(s) (>${RETENTION_DAYS}d)"
fi

# ── Optional: Upload to S3 / Backblaze B2 ────────────────────────────────
# Uncomment and configure if you have AWS CLI or rclone installed:
#
# if command -v aws &> /dev/null && [ -n "${AWS_BACKUP_BUCKET:-}" ]; then
#   aws s3 cp "${BACKUP_FILE}.gz" "s3://$AWS_BACKUP_BUCKET/backups/$(basename ${BACKUP_FILE}.gz)"
#   echo "$LOG_PREFIX Uploaded to S3: s3://$AWS_BACKUP_BUCKET/backups/"
# fi
#
# if command -v rclone &> /dev/null && [ -n "${RCLONE_REMOTE:-}" ]; then
#   rclone copy "${BACKUP_FILE}.gz" "$RCLONE_REMOTE:fud-portal-backups/"
#   echo "$LOG_PREFIX Uploaded via rclone to $RCLONE_REMOTE"
# fi

# ── Count total backups ───────────────────────────────────────────────────
TOTAL=$(find "$BACKUP_DIR" -name "fud_portal_*.db.gz" | wc -l)
echo "$LOG_PREFIX Done. Total backups on disk: $TOTAL"
