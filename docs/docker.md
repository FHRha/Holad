<div align="right">
  <a href="docker.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/ru.svg" alt="Русский" width="30" style="border-radius: 4px;" /></a>
  <a href="docker_en.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/gb.svg" alt="English" width="30" style="border-radius: 4px;" /></a>
</div>

# 🐳 Развёртывание Holad в Docker

Данное руководство подробно описывает процесс запуска, настройки и эксплуатации **Holad** в контейнерах Docker и Docker Compose.

---

## Содержание
- [1. Быстрый старт](#1-быстрый-старт)
  - [Docker Run](#docker-run)
  - [Docker Compose](#docker-compose)
- [2. Переменные окружения и параметры](#2-переменные-окружения-и-параметры)
- [3. Настройка базового пути (Base Path)](#3-настройка-базового-пути-base-path)
- [4. Готовые рецепты развёртывания](#4-готовые-рецепты-развёртывания)
  - [Рецепт 1: Holad + Navidrome (Полный стек, решение NAT Loopback)](#рецепт-1-holad--navidrome-полный-стек-решение-nat-loopback)
  - [Рецепт 2: Holad + Caddy (Автоматический бесплатный SSL/HTTPS)](#рецепт-2-holad--caddy-автоматический-бесплатный-sslhttps)
  - [Рецепт 3: Holad за Nginx / Nginx Proxy Manager / Traefik](#рецепт-3-holad-за-nginx--nginx-proxy-manager--traefik)
- [5. Автоматические обновления (Watchtower)](#5-автоматические-обновления-watchtower)
- [6. Резервное копирование и восстановление](#6-резервное-копирование-и-восстановление)
- [7. Поддержка Raspberry Pi и ARM64](#7-поддержка-raspberry-pi-и-arm64)

---

## 1. Быстрый старт

Официальные образы публикуются в реестре **GitHub Container Registry**: `ghcr.io/fhrha/holad:latest`.

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

После запуска откройте `http://localhost:4000/` в браузере.

---

### Docker Compose

Создайте файл `docker-compose.yml`:

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

Запустите контейнеры:
```bash
docker compose up -d
```

---

## 2. Переменные окружения и параметры

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `4000` | Внутренний порт Node.js веб-сервера |
| `PUID` | `1000` | UID пользователя хоста для корректных прав на файлы в `./data` |
| `PGID` | `1000` | GID группы хоста для корректных прав на файлы в `./data` |
| `BASE_PATH` | `/` | Базовый путь веб-клиента. По умолчанию `/` (корень домена). Укажите `/Holad/` или другой подпуть для работы за reverse proxy |
| `ENCRYPTION_KEY` | *(авто)* | Мастер-ключ AES-256-GCM для шифрования токенов в базе. Если не указан, автоматически генерируется и сохраняется в `/data/.encryption_key` |
| `BACKUP_ENABLED` | `false` | Включение автоматического онлайн-бэкапа SQLite |
| `BACKUP_PATH` | `/data/backups` | Папка внутри тома для сохранения резервных копий |
| `BACKUP_INTERVAL_HOURS` | `24` | Частота создания бэкапов (в часах) |
| `BACKUP_RETENTION_DAYS` | `7` | Срок хранения резервных копий (в днях), старые удаляются автоматически |
| `SUBSONIC_ALLOWED_ENDPOINTS` | *(пусто)* | Дополнительные эндпоинты Subsonic API через запятую, разрешенные для проксирования гостям и авторизованным клиентам (например: `getStarred2,stream,download`) |
| `NAVIDROME_URL` | *(пусто)* | Опционально: URL вашего сервера Navidrome для Headless-авторизации |
| `NAVIDROME_USER` | *(пусто)* | Опционально: Логин для Headless-авторизации |
| `NAVIDROME_PASS` | *(пусто)* | Опционально: Пароль для Headless-авторизации |
| `DEMO_MODE` | `false` | Режим публичного интерактивного демо-показа (прозрачный вход без пароля, скрытая кнопка выхода, изолированный пул гостевых слотов) |
| `DEMO_POOL_SIZE` | `25` | Максимальное количество одновременных гостей демо-сервера |
| `DEMO_SESSION_MINUTES` | `30` | Время жизни сессии гостя в минутах (автоматически продлевается фоновым heartbeat) |

---

## 3. Настройка базового пути (Base Path)

В Docker Holad по умолчанию настроен на корневой базовый путь `BASE_PATH=/` (корень домена). Если вы выделяете под Holad отдельный домен или поддомен (например, `https://music.example.com/`), дополнительная настройка роутинга не требуется.

### Размещение в подпапке за существующим reverse proxy (например, `/Holad/`)
Если вы хотите разместить плеер в подпапке за существующим Nginx-прокси вместе с другими сервисами (например, `https://example.com/Holad/`), задайте переменную `BASE_PATH=/Holad/`:

```yaml
environment:
  - BASE_PATH=/Holad/
```

Сервер автоматически инжектирует соответствующий `<base href="...">`, отдаёт статические файлы и маршрутизирует запросы API и сокетов без необходимости пересборки образа.

---

## 4. Готовые рецепты развёртывания

### Рецепт 1: Holad + Navidrome (Полный стек, решение NAT Loopback)

Главное преимущество запуска обоих сервисов в одном `docker-compose.yml` — **полное устранение проблемы NAT Loopback (Hairpin NAT)**. Holad подключается к Navidrome напрямую по внутренней сети Docker по имени контейнера `http://navidrome:4533`:

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
      # Holad общается с Navidrome напрямую на скорости виртуального сетевого моста:
      - NAVIDROME_URL=http://navidrome:4533
    volumes:
      - ./data/holad:/data
```

---

### Рецепт 2: Holad + Caddy (Автоматический бесплатный SSL/HTTPS)

Caddy автоматически выпускает и обновляет SSL-сертификаты Let's Encrypt и нативно проксирует WebSockets (`/Holad/socket.io`):

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

Файл `Caddyfile` рядом:
```caddy
music.yourdomain.com {
    reverse_proxy holad:4000
}
```

---

### Рецепт 3: Holad за Nginx / Nginx Proxy Manager / Traefik

При использовании внешнего Nginx убедитесь, что включена поддержка WebSockets для пути `/Holad/socket.io/`:

```nginx
server {
    server_name music.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### Рецепт 4: Публичный демо-стенд (Demo Mode)

Если вы хотите развернуть публичный ознакомительный демо-сайт Holad для посетителей:
- **Мгновенный вход без формы логина**: посетитель сразу попадает в плеер;
- **Отсутствие кнопки «Выйти»**: предотвращает случайный сброс авторизации;
- **Управляемый пул слотов**: ограничение максимального числа одновременных гостей (по умолчанию `25`), что защищает Navidrome и сервер от перегрузки;
- **Красивый экран ожидания**: при исчерпании свободных слотов показывается экран с живым обратным отсчётом и автоповтором;
- **Изоляция и автоочистка**: временные сессии гостей и их записи в SQLite автоматически очищаются по истечении аренды.

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
      # Включение демо-режима:
      - DEMO_MODE=true
      - DEMO_POOL_SIZE=25
      - DEMO_SESSION_MINUTES=30
      # Учётные данные Navidrome для демо-показа:
      - NAVIDROME_URL=https://music.yourdomain.com
      - NAVIDROME_USER=demo_visitor
      - NAVIDROME_PASS=demo_password
    volumes:
      - ./demo_data:/data
```

---

## 5. Автоматические обновления (Watchtower)

В `docker-compose.yml` встроен сервис **Watchtower**:
- Раз в 24 часа (`--interval 86400`) он проверяет наличие новых версий образа в `ghcr.io/fhrha/holad:latest`.
- При выходе обновления Watchtower автоматически скачивает свежий образ, корректно перезапускает Holad и удаляет старые слои (`--cleanup`).
- Если автообновление не требуется, просто удалите блок `watchtower` из `docker-compose.yml`.

---

## 6. Резервное копирование и восстановление

### Автоматический онлайн-бэкап
Holad использует базу данных SQLite в режиме Write-Ahead Logging (WAL). Это позволяет делать горячие консистентные снапшоты без остановки плеера.

Чтобы включить встроенный сервис бэкапов, добавьте в переменные контейнера:
```yaml
environment:
  - BACKUP_ENABLED=true
  - BACKUP_INTERVAL_HOURS=24
  - BACKUP_RETENTION_DAYS=7
```
Бэкапы будут автоматически сохраняться в `./data/backups/holad_backup_YYYYMMDD_HHMMSS.sqlite`.

### Восстановление из бэкапа
1. Остановите контейнер:
   ```bash
   docker compose stop holad
   ```
2. Скопируйте нужный файл резервной копии поверх рабочей базы:
   ```bash
   cp ./data/backups/holad_backup_20260908_120000.sqlite ./data/holad.sqlite
   ```
3. Запустите контейнер:
   ```bash
   docker compose start holad
   ```

---

## 7. Поддержка Raspberry Pi и ARM64

Официальный Docker-образ Holad собирается в формате **Multi-Arch** и нативно поддерживает:
- `linux/amd64` (стандартные серверы x86_64, ПК, Intel/AMD);
- `linux/arm64` (Raspberry Pi 4 / 5, Orange Pi, Rock Pi, Apple Silicon, ARM-инстансы Oracle/Hetzner).

Docker автоматически выберет нужную архитектуру при скачивании образа `ghcr.io/fhrha/holad:latest`.
