## 🇷🇺 Русская версия (Subsonic 403 Fix & Dynamic Base Path)
Это обновление устраняет критическую ошибку 403 при запросах к избранному в Subsonic-прокси, а также полностью перерабатывает архитектуру роутинга веб-клиента для поддержки произвольного базового пути (`BASE_PATH`).

**Главные нововведения и исправления:**
* **Исправление ошибки 403 в Subsonic Proxy (`getStarred2`):**
  * Устранена ошибка `Blocked unauthorized access attempt to endpoint: getStarred2`, приводившая к падению загрузки избранного и стартовой страницы при гостевом и демо-проксировании.
  * В список разрешённых эндпоинтов Subsonic API добавлены `getStarred`, `getStarred2`, `getMusicFolders`, `getLicense`, `stream`, `download` и `createShare`.
  * Добавлена переменная окружения `SUBSONIC_ALLOWED_ENDPOINTS` для динамического расширения allowlist без необходимости пересборки.
* **Поддержка произвольного базового пути (Dynamic `BASE_PATH` Routing):**
  * Клиентский роутер React Router отвязан от хардкода `/Holad/*` и переведён на `basename={getBasePath()}`.
  * Исправлена ошибка сброса навигации на главную страницу при клике на «Альбомы», «Треки», «Избранное», «Радио» при размещении в корне домена (`BASE_PATH=/`).
  * Все ссылки и вызовы `navigate()` внутри веб-клиента стали относительными к текущей базе.
  * Добавлена автоматическая миграция сохранённой стартовой страницы пользователя в настройках (`/Holad/*` ➔ `/*`).
  * Обеспечена обратная совместимость: для существующих закладок и внешних ссылок вида `/Holad/*` работает прозрачный редирект.
* **Улучшения развёртывания (Docker & Installer):**
  * **Docker:** По умолчанию базовый путь переведён на корень домена (`BASE_PATH=/`), что делает Holad готовым к работе на выделенном домене/субдомене «из коробки». Убран небезопасный хак с `sed` по JS-файлам: теперь сервер динамически инжектирует правильный тег `<base href="...">` в HTML.
  * **Скрипт `install.sh`:** Сохранён дефолт `/Holad` для совместимости с существующими конфигурациями Nginx reverse proxy. Добавлен интерактивный выбор пути при установке и CLI-параметры (`-b` / `--base-path`).
  * **Нативные клиенты (Tauri, Capacitor):** Работают локально в корневом пути (`/`).
* **Документация:**
  * Обновлены руководства по развёртыванию в Docker (`docs/docker.md`, `docs/docker_en.md`) и `README.md` на русском и английском языках.

---

## 🇬🇧 English version (Subsonic 403 Fix & Dynamic Base Path)
This release resolves a critical 403 Forbidden error in the Subsonic proxy when fetching starred content and completely overhauls the web client routing architecture to support arbitrary base paths (`BASE_PATH`).

**Major Features & Fixes:**
* **Subsonic Proxy 403 Error Fix (`getStarred2`):**
  * Resolved `Blocked unauthorized access attempt to endpoint: getStarred2` error which previously prevented favorites, likes, and start page tracks from loading during guest and demo proxying.
  * Expanded the proxy allowlist with missing Subsonic endpoints: `getStarred`, `getStarred2`, `getMusicFolders`, `getLicense`, `stream`, `download`, and `createShare`.
  * Introduced the `SUBSONIC_ALLOWED_ENDPOINTS` environment variable for dynamic allowlist expansion without code modifications.
* **Arbitrary Base Path Routing (Dynamic `BASE_PATH`):**
  * Decoupled React Router from hardcoded `/Holad/*` routes using `basename={getBasePath()}`.
  * Fixed navigation bouncing back to the home page when clicking sidebar items (Albums, Tracks, Favorites, Radio) when running under `BASE_PATH=/`.
  * Converted all internal navigation links and `navigate()` calls across all views and components to base-relative paths.
  * Added automatic migration for persisted user start page preferences (`/Holad/*` ➔ `/*`).
  * Maintained full backward compatibility: transparent redirects for legacy `/Holad/*` URLs and bookmarks.
* **Deployment Improvements (Docker & Installer):**
  * **Docker:** Defaulted `BASE_PATH` to `/` (root domain). Holad now works out-of-the-box on dedicated domains and subdomains. Eliminated brittle `sed` JS modifications in favor of dynamic server-side `<base href>` injection.
  * **Install Script (`install.sh`):** Retained `/Holad` default for Nginx reverse proxy compatibility. Added interactive prompt during installation and CLI flags (`-b` / `--base-path`).
  * **Native Clients (Tauri & Capacitor):** Operate cleanly on root base path (`/`).
* **Documentation:**
  * Updated Docker deployment guides (`docs/docker.md`, `docs/docker_en.md`) and root `README.md` / `README_en.md`.
