# ==========================================
# 1. Build Client (React 19 + Vite)
# ==========================================
FROM node:22-bookworm-slim AS client-builder

WORKDIR /app/client
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY client/package.json client/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY client/ ./
ARG VITE_APP_BASE=./
ENV VITE_APP_BASE=${VITE_APP_BASE}
RUN pnpm run build

# ==========================================
# 2. Build Server (Node.js + TypeScript)
# ==========================================
FROM node:22-bookworm-slim AS server-builder

WORKDIR /app/server
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY server/ ./
RUN pnpm run build

# ==========================================
# 3. Production Dependencies (with C++ build tools for native addons)
# ==========================================
FROM node:22-bookworm-slim AS prod-deps

WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ==========================================
# 4. Production Runtime
# ==========================================
FROM node:22-bookworm-slim AS runner

LABEL maintainer="FHRha <https://github.com/FHRha>"
LABEL org.opencontainers.image.source="https://github.com/FHRha/Holad"
LABEL org.opencontainers.image.description="Holad - Modern self-hosted audio streaming client for Subsonic/Navidrome"

WORKDIR /app

# Install system utilities:
# - gosu: Safely drop from root to node user with dynamic PUID/PGID
# - tini: Proper init process (PID 1) handling signals (SIGTERM/SIGINT)
# - sqlite3: Online WAL backups without locking
# - curl: Container healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gosu \
    tini \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

# Copy pre-compiled production dependencies
COPY --from=prod-deps /app/server/node_modules ./node_modules
COPY server/package.json ./

# Copy compiled backend and frontend
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/migrate.js ./
COPY --from=client-builder /app/client/dist /app/client/dist

# Copy entrypoint and backup helper scripts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/backup.sh

# Ensure persistent data directory exists
RUN mkdir -p /data

# Default environment configuration
ENV NODE_ENV=production \
    PORT=4000 \
    BASE_PATH=/ \
    DATABASE_PATH=/data/holad.sqlite \
    PUID=1000 \
    PGID=1000 \
    BACKUP_ENABLED=false \
    BACKUP_PATH=/data/backups \
    BACKUP_INTERVAL_HOURS=24 \
    BACKUP_RETENTION_DAYS=7

VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/favicon.ico || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
