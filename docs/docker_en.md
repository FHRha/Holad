<div align="right">
  <a href="docker.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/ru.svg" alt="Русский" width="30" style="border-radius: 4px;" /></a>
  <a href="docker_en.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/gb.svg" alt="English" width="30" style="border-radius: 4px;" /></a>
</div>

# Deploying Holad with Docker

This guide provides a comprehensive overview of deploying, configuring, and operating **Holad** using Docker and Docker Compose.

---

## Table of Contents
- [1. Quick Start](#1-quick-start)
  - [Docker Run](#docker-run)
  - [Docker Compose](#docker-compose)
- [2. Environment Variables & Parameters](#2-environment-variables--parameters)
- [3. Configuring the Base Path](#3-configuring-the-base-path)
- [4. Deployment Recipes](#4-deployment-recipes)
  - [Recipe 1: Holad + Navidrome (Full Stack, Eliminates NAT Loopback)](#recipe-1-holad--navidrome-full-stack-eliminates-nat-loopback)
  - [Recipe 2: Holad + Caddy (Automatic Free SSL/HTTPS)](#recipe-2-holad--caddy-automatic-free-sslhttps)
  - [Recipe 3: Holad Behind Nginx / Nginx Proxy Manager / Traefik](#recipe-3-holad-behind-nginx--nginx-proxy-manager--traefik)
- [5. Automatic Updates (Watchtower)](#5-automatic-updates-watchtower)
- [6. Backup & Disaster Recovery](#6-backup--disaster-recovery)
- [7. Raspberry Pi & ARM64 Support](#7-raspberry-pi--arm64-support)

---

## 1. Quick Start

Official multi-architecture images are published to the **GitHub Container Registry**: `ghcr.io/fhrha/holad:latest`.

### Docker Run

```bash
docker run -d \
  --name holad \
  -p 4000:4000 \
  -v ./data:/data \
  -e PUID=1000 \
  -e PGID=1000 \
  --restart unless-stopped \
  ghcr.io/fhrha/holad:latest
```

After starting, navigate to `http://localhost:4000/` in your browser.

---

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  holad:
    image: ghcr.io/fhrha/holad:latest
    container_name: holad
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - PUID=1000
      - PGID=1000
      - PORT=4000
      - BASE_PATH=/
    volumes:
      - ./data:/data

  watchtower:
    image: containrrr/watchtower
    container_name: holad_updater
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 --cleanup holad
```

Start the stack:
```bash
docker compose up -d
```

---

## 2. Environment Variables & Parameters

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Internal port the Node.js server listens on |
| `PUID` | `1000` | Host user ID for proper file ownership in `./data` |
| `PGID` | `1000` | Host group ID for proper file ownership in `./data` |
| `BASE_PATH` | `/` | Web client URL base path. Defaults to `/` (root of domain). Set to `/Holad/` or any subpath if hosting behind a reverse proxy subfolder |
| `ENCRYPTION_KEY` | *(auto)* | Master AES-256-GCM key used for encrypting credentials. If omitted, automatically generated and persisted in `/data/.encryption_key` |
| `BACKUP_ENABLED` | `false` | Enable automated non-blocking SQLite WAL online backups |
| `BACKUP_PATH` | `/data/backups` | Directory inside the volume where backups are stored |
| `BACKUP_INTERVAL_HOURS` | `24` | Backup creation frequency (in hours) |
| `BACKUP_RETENTION_DAYS` | `7` | Retention period for old backups (in days) before automatic cleanup |
| `SUBSONIC_ALLOWED_ENDPOINTS` | *(empty)* | Comma-separated list of additional Subsonic API endpoints permitted through the proxy (e.g. `getStarred2,stream,download`) |
| `NAVIDROME_URL` | *(empty)* | Optional: Navidrome server URL for headless pre-authentication |
| `NAVIDROME_USER` | *(empty)* | Optional: Navidrome username for headless pre-authentication |
| `NAVIDROME_PASS` | *(empty)* | Optional: Navidrome password for headless pre-authentication |
| `DEMO_MODE` | `false` | Enable public interactive demo mode (transparent zero-click login, hidden logout, managed guest pool) |
| `DEMO_POOL_SIZE` | `25` | Maximum number of concurrent demo visitors |
| `DEMO_SESSION_MINUTES` | `30` | Guest session lease TTL in minutes (extended automatically via background heartbeat) |

---

## 3. Configuring the Base Path

In Docker, Holad defaults to a root base path `BASE_PATH=/`. If you are dedicating a domain or subdomain to Holad (e.g. `https://music.example.com/`), no additional path configuration is needed.

### Hosting in a Subpath behind a Reverse Proxy (e.g. `/Holad/`)
If you want to host Holad inside a subfolder behind an existing reverse proxy (e.g. `https://example.com/Holad/`), simply set `BASE_PATH=/Holad`:

```yaml
environment:
  - BASE_PATH=/Holad
```

The server automatically injects `<base href="...">`, encapsulates the UI, login page (`/Holad/login`), Jam sessions (`/Holad/jam`), WebSockets (`/Holad/socket.io`), API (`/Holad/api`), and static assets without rebuilding the image.

---

## 4. Deployment Recipes

### Recipe 1: Holad + Navidrome (Full Stack, Eliminates NAT Loopback)

Running both containers in the same `docker-compose.yml` network **completely eliminates NAT Loopback (Hairpin NAT) issues**. Holad talks to Navidrome directly across Docker's high-speed internal bridge network via the container hostname `http://navidrome:4533`:

```yaml
services:
  navidrome:
    image: deluan/navidrome:latest
    container_name: navidrome
    restart: unless-stopped
    ports:
      - "4533:4533"
    environment:
      ND_SCANSCHEDULE: 1h
      ND_LOGLEVEL: info
    volumes:
      - ./data/navidrome:/data
      - /path/to/your/music:/music:ro

  holad:
    image: ghcr.io/fhrha/holad:latest
    container_name: holad
    restart: unless-stopped
    ports:
      - "4000:4000"
    depends_on:
      - navidrome
    environment:
      - PUID=1000
      - PGID=1000
      - PORT=4000
      - BASE_PATH=/
      # Connects directly through the internal Docker network:
      - NAVIDROME_URL=http://navidrome:4533
    volumes:
      - ./data/holad:/data
```

---

### Recipe 2: Holad + Caddy (Automatic Free SSL/HTTPS)

Caddy automatically provisions and renews Let's Encrypt certificates while providing native WebSocket reverse proxying (`/Holad/socket.io`):

`docker-compose.yml`:
```yaml
services:
  holad:
    image: ghcr.io/fhrha/holad:latest
    container_name: holad
    restart: unless-stopped
    environment:
      - PUID=1000
      - PGID=1000
      - BASE_PATH=/
    volumes:
      - ./data:/data

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - holad

volumes:
  caddy_data:
  caddy_config:
```

Accompanying `Caddyfile`:
```caddy
music.yourdomain.com {
    reverse_proxy holad:4000
}
```

---

### Recipe 3: Holad Behind Nginx / Nginx Proxy Manager / Traefik

Holad automatically serves audio streams with `X-Accel-Buffering: no`, ensuring Nginx relays audio chunks to browsers immediately without buffering delays.

> [!IMPORTANT]
> **Critical Nginx Guidelines:**
> 1. **Clean `proxy-params.conf`:** In your `snippets/proxy-params.conf`, include only standard headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `proxy_http_version 1.1;`). **Never put `Upgrade` or `Connection` in the shared snippet file**. If a location sets them too, Nginx will duplicate them (`Upgrade: websocket, websocket`), causing Node.js to abort the connection with `400 Bad Request: Invalid Upgrade header`.
> 2. **Dedicated Socket Location:** In setups with TLS termination, HTTP/2, or TCP SNI proxies, `$http_upgrade` might not be populated. The most resilient setup is a dedicated `location /socket.io/` (or `/<BASE_PATH>/socket.io/`) with explicit strings: `proxy_set_header Upgrade "websocket";` and `proxy_set_header Connection "upgrade";`.
> 3. **Trailing Slashes:** In `proxy_pass http://127.0.0.1:PORT;`, do **NOT** add a trailing slash when proxying subpaths (it strips the subpath and breaks Socket.IO routing).
> 4. **Timeouts and Buffering:** Always include `proxy_buffering off;` and `proxy_read_timeout 86400s;` so Nginx doesn't buffer long-polling packets or drop WebSockets after 60 seconds.

#### Standard `/etc/nginx/snippets/proxy-params.conf`
```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
```

#### Option A: Dedicated Domain or Subdomain (Root `/`)
```nginx
server {
    server_name music.yourdomain.com;

    # If Navidrome runs on the same domain under /navidrome/
    location /navidrome/ {
        proxy_pass http://127.0.0.1:4533;
        include snippets/proxy-params.conf;
        proxy_buffering off;
        client_max_body_size 0;
    }

    location = /navidrome {
        return 301 /navidrome/;
    }

    # Audio stream without buffering
    location /api/stream/ {
        proxy_pass http://127.0.0.1:4000;
        include snippets/proxy-params.conf;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Holad Connect and Jam WebSockets
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        include snippets/proxy-params.conf;
        proxy_set_header Upgrade "websocket";
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Main Web UI and REST API
    location / {
        proxy_pass http://127.0.0.1:4000;
        include snippets/proxy-params.conf;
    }
}
```

#### Option B: Subpath Deployment (e.g. `BASE_PATH=/Holad/`)
Set `BASE_PATH=/Holad` in your Docker environment. All Holad features are encapsulated inside this subpath prefix:

```nginx
server {
    server_name yourdomain.com;

    # Holad Connect and Jam WebSockets
    location /Holad/socket.io/ {
        proxy_pass http://127.0.0.1:4000; # IMPORTANT: No trailing slash!
        include snippets/proxy-params.conf;
        proxy_set_header Upgrade "websocket";
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Web UI, REST API, and static assets
    location /Holad/ {
        proxy_pass http://127.0.0.1:4000; # IMPORTANT: No trailing slash!
        include snippets/proxy-params.conf;
    }

    location = /Holad {
        return 301 /Holad/;
    }
}
```

> [!TIP]
> **Navidrome with `ND_BASEURL`:**
> If your Navidrome instance is configured with a subpath (e.g., `ND_BASEURL=/navidrome`), make sure to provide the full internal Docker URL including that subpath in Holad's configuration:
> `NAVIDROME_URL=http://navidrome:4533/navidrome`
> This ensures token validation and Holad Connect function properly.

---

### Recipe 4: Public Demo Stand (Demo Mode)

If you want to host a public interactive showcase of Holad for visitors:
- **Instant zero-click entry**: visitors are directly placed inside the player without seeing a login form;
- **Suppressed Logout button**: prevents visitors from accidentally invalidating the shared demo session;
- **Managed guest pool**: limits concurrent active guests (default: `25`), protecting both Navidrome and the host machine from load spikes;
- **Full capacity waiting room**: if all slots are taken, a branded waiting screen with live countdown timer and automatic retries is shown;
- **Isolation and automatic cleanup**: temporary guest sessions and SQLite records are purged upon expiration.

```yaml
services:
  holad-demo:
    image: ghcr.io/fhrha/holad:latest
    container_name: holad-demo
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - PUID=1000
      - PGID=1000
      - PORT=4000
      - BASE_PATH=/
      # Enable demo mode:
      - DEMO_MODE=true
      - DEMO_POOL_SIZE=25
      - DEMO_SESSION_MINUTES=30
      # Navidrome demo showcase credentials:
      - NAVIDROME_URL=https://music.yourdomain.com
      - NAVIDROME_USER=demo_visitor
      - NAVIDROME_PASS=demo_password
    volumes:
      - ./demo_data:/data
```

---

## 5. Automatic Updates (Watchtower)

The `docker-compose.yml` includes the lightweight **Watchtower** container:
- It checks `ghcr.io/fhrha/holad:latest` once every 24 hours (`--interval 86400`).
- When a new image is pushed, Watchtower automatically pulls it, gracefully stops the old container, restarts Holad with the exact same volumes and settings, and cleans up obsolete layers (`--cleanup`).
- If you prefer manual updates, simply remove the `watchtower` service block from `docker-compose.yml`.

---

## 6. Backup & Disaster Recovery

### Automatic Online Backups
Holad uses SQLite configured in Write-Ahead Logging (WAL) mode. This guarantees atomic, non-blocking snapshots without interrupting active music playback.

To enable the automated backup service:
```yaml
environment:
  - BACKUP_ENABLED=true
  - BACKUP_INTERVAL_HOURS=24
  - BACKUP_RETENTION_DAYS=7
```
Backups are saved to `./data/backups/holad_backup_YYYYMMDD_HHMMSS.sqlite`.

### Restoring from Backup
1. Stop the Holad container:
   ```bash
   docker compose stop holad
   ```
2. Copy the desired backup snapshot over the active database file:
   ```bash
   cp ./data/backups/holad_backup_20260908_120000.sqlite ./data/holad.sqlite
   ```
3. Restart the container:
   ```bash
   docker compose start holad
   ```

---

## 7. Raspberry Pi & ARM64 Support

Official Holad Docker images are built as **Multi-Arch** images supporting:
- `linux/amd64` (Standard x86_64 servers, PC, Intel/AMD);
- `linux/arm64` (Raspberry Pi 4 / 5, Orange Pi, Rock Pi, Apple Silicon, Oracle/Hetzner ARM VPS).

Docker automatically detects and pulls the correct architecture for your system when executing `docker compose up -d` or `docker pull ghcr.io/fhrha/holad:latest`.
