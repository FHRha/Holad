#!/bin/bash
# Background SQLite online backup daemon for Holad

BACKUP_DIR="${BACKUP_PATH:-/data/backups}"
INTERVAL_SEC=$((${BACKUP_INTERVAL_HOURS:-24} * 3600))
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
DB_FILE="${DATABASE_PATH:-/data/holad.sqlite}"
PUID=${PUID:-1000}
PGID=${PGID:-1000}

mkdir -p "$BACKUP_DIR"
chown -R "$PUID:$PGID" "$BACKUP_DIR"

while true; do
    sleep "$INTERVAL_SEC"
    
    if [ -f "$DB_FILE" ]; then
        TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
        TARGET_FILE="$BACKUP_DIR/holad_backup_${TIMESTAMP}.sqlite"
        
        # Perform non-blocking online atomic SQLite WAL backup
        if sqlite3 "$DB_FILE" ".backup '$TARGET_FILE'"; then
            chmod 600 "$TARGET_FILE"
            chown "$PUID:$PGID" "$TARGET_FILE"
            echo "[Holad Backup] Successfully created online backup: $TARGET_FILE"
        else
            echo "[Holad Backup] Error: Failed to create SQLite backup!"
        fi
        
        # Cleanup backups older than RETENTION_DAYS
        find "$BACKUP_DIR" -name "holad_backup_*.sqlite" -type f -mtime +"$RETENTION_DAYS" -delete
    fi
done
