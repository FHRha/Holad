## 🇷🇺 Русская версия
Это самое масштабное обновление Holad! Мы проделали огромную работу, превратив Holad из веб-плеера в полноценное кроссплатформенное приложение с поддержкой оффлайн-режима и совместного прослушивания.

**Главные нововведения:**
* **Нативные приложения (Desktop & Android):** Выпущены Holad Portable для Windows/Linux (на базе Tauri) и полноценный APK для Android. Одно приложение — все платформы!
* **Оффлайн-режим и кэширование:** Добавлена возможность скачивать отдельные треки, альбомы и плейлисты для прослушивания без интернета. Поддерживается управление загрузками и индикация прогресса.
* **Jam-сессии (Совместное прослушивание):** Теперь вы можете создать комнату, скинуть ссылку друзьям и слушать музыку идеально синхронно в реальном времени.
* **Удаленное управление и синхронизация (Beta):** Начато внедрение синхронизации устройств в рамках одного аккаунта через WebSockets.
* **Универсальная система сборки:** Полностью переработан CI/CD и скрипты релизов. Теперь сборка сервера, клиента и нативных приложений происходит в один клик.

**Улучшения UI и исправления (со времен 1.0.5):**
* **Новый экран подключения:** Для нативных клиентов добавлен стильный экран авторизации к вашему серверу (с фирменным зеленым акцентом).
* **Мобильный опыт:** Исправлены свайпы модальных окон, заблокировано случайное срабатывание pull-to-refresh при жестах. 
* **Оптимизация:** Тяжелые эффекты размытия переведены на аппаратное ускорение (`transform-gpu`), устранив лаги при скроллинге.
* **Исправления багов:** Починена генерация ссылок (без лишнего `/Holad`), исправлена критическая React-ошибка #310, заблокировано случайное обновление страницы (F5/Ctrl+R) в десктопной версии.

---

## 🇬🇧 English version
This is the biggest Holad update yet! We've done a massive amount of work, transforming Holad from a web player into a fully-fledged cross-platform application with offline support and synchronized listening.

**Major New Features:**
* **Native Apps (Desktop & Android):** Released Holad Portable for Windows/Linux (powered by Tauri) and a full Android APK. One codebase, everywhere!
* **Offline Mode & Caching:** Added the ability to download individual tracks, albums, and playlists for offline playback. Includes download management and progress indicators.
* **Jam Sessions (Listen Together):** You can now create a room, share a link with friends, and listen to music perfectly in sync in real-time.
* **Remote Control & Device Sync (Beta):** Initial implementation of cross-device synchronization for the same account using WebSockets.
* **Universal Build System:** Completely overhauled CI/CD and release scripts. Server, client, and native apps are now built in a single unified step.

**UI Improvements & Fixes (since 1.0.5):**
* **New Connection Screen:** Added a stylish server connection and login screen for native clients (featuring the signature green accent).
* **Mobile Experience:** Fixed modal swipe gestures and disabled accidental pull-to-refresh triggers during drag actions.
* **Performance:** Heavy blur effects are now hardware-accelerated (`transform-gpu`), eliminating stuttering during scrolling.
* **Bug Fixes:** Fixed share link generation (removed trailing `/Holad`), resolved critical React Error #310, and blocked accidental page reloads (F5/Ctrl+R) in the desktop app.
