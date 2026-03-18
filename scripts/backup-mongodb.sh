#!/bin/bash
set -euo pipefail

BACKUP_DIR="/home/cuong-deploy/backups/mongodb"
CONTAINER_NAME="insight_mongodb"
DB_NAME="insight"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/insight_${DATE}"

mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER_NAME" mongodump --db "$DB_NAME" --archive="/tmp/insight_backup.gz" --gzip --quiet
docker cp "${CONTAINER_NAME}:/tmp/insight_backup.gz" "${BACKUP_FILE}.gz"
docker exec "$CONTAINER_NAME" rm -f /tmp/insight_backup.gz
find "$BACKUP_DIR" -name "insight_*.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup: ${BACKUP_FILE}.gz ($(du -sh "${BACKUP_FILE}.gz" | cut -f1))"
