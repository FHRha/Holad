#!/bin/bash
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# 1. Configure PUID and PGID for the node user (LinuxServer.io standard)
if [ "$PUID" != "0" ]; then
    groupmod -o -g "$PGID" node 2>/dev/null || true
    usermod -o -u "$PUID" -g "$PGID" node 2>/dev/null || true
fi

# Ensure data directory exists
mkdir -p /data

# 2. Smart persistent ENCRYPTION_KEY management
# Preserves encryption across container recreation even if the user didn't set ENCRYPTION_KEY in env
KEY_FILE="/data/.encryption_key"
if [ -z "$ENCRYPTION_KEY" ]; then
    if [ -f "$KEY_FILE" ]; then
        export ENCRYPTION_KEY=$(cat "$KEY_FILE" | tr -d '\r\n')
    else
        echo "[Holad Docker] ENCRYPTION_KEY not set. Generating persistent encryption key..."
        NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        echo "$NEW_KEY" > "$KEY_FILE"
        chmod 600 "$KEY_FILE"
        export ENCRYPTION_KEY="$NEW_KEY"
        echo "[Holad Docker] Persistent key saved to $KEY_FILE"
    fi
else
    # If key was explicitly supplied via environment, persist a copy to /data
    echo "$ENCRYPTION_KEY" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
fi

# 3. Dynamic BASE_PATH customization for Web Client (default: /Holad/)
CUSTOM_BASE="${BASE_PATH:-${VITE_APP_BASE}}"
if [ -n "$CUSTOM_BASE" ] && [ "$CUSTOM_BASE" != "/Holad/" ]; then
    # Ensure proper trailing slash
    if [ "$CUSTOM_BASE" != "/" ]; then
        [[ "$CUSTOM_BASE" != /* ]] && CUSTOM_BASE="/$CUSTOM_BASE"
        [[ "$CUSTOM_BASE" != */ ]] && CUSTOM_BASE="$CUSTOM_BASE/"
    fi
    echo "[Holad Docker] Configuring custom client base path: $CUSTOM_BASE"
    find /app/client/dist -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \) -exec sed -i "s|/Holad/|${CUSTOM_BASE}|g" {} + 2>/dev/null || true
fi

# 4. Ensure permissions on persistent volume and application directories
chown -R "$PUID:$PGID" /data /app/client/dist

# 5. Optional background database backup daemon
if [ "$BACKUP_ENABLED" = "true" ] || [ "$BACKUP_ENABLED" = "1" ]; then
    echo "[Holad Backup] Automatic backup service enabled (interval: ${BACKUP_INTERVAL_HOURS:-24}h, retention: ${BACKUP_RETENTION_DAYS:-7}d)."
    /usr/local/bin/backup.sh &
fi

# 6. Drop privileges and execute application
if [ "$PUID" = "0" ]; then
    exec "$@"
else
    exec gosu node "$@"
fi
