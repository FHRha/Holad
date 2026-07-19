<div align="right">
  <a href="README.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/ru.svg" alt="Русский" width="30"/></a>
  <a href="README_en.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/gb.svg" alt="English" width="30"/></a>
</div>

<div align="center">
  <img src="client/public/icons/favicon_tab.png" alt="Holad Logo" width="150" height="150">
  
  # Holad
  
  **Аудио-опыт нового поколения.** 
  Современная, кастомизируемая стриминговая платформа и плеер. Holad выступает в роли элегантного и быстрого клиента для серверов Subsonic/Navidrome.
  Создавая этот проект, я вдохновлялся **Spotify**, **Feishin** и **Substream**. Огромное спасибо их разработчикам за труд и идеи!

  [![GitHub release (latest by date)](https://img.shields.io/github/v/release/FHRha/Holad)](https://github.com/FHRha/Holad/releases)
  [![License: Non-Commercial](https://img.shields.io/badge/License-Non_Commercial-red.svg)](LICENSE)

  <br />
  
  <h3>📥 Скачать Holad</h3>

  <a href="https://github.com/FHRha/Holad/releases/latest">
    <img src="https://img.shields.io/badge/Windows-Setup_.exe_%2F_.msi-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows Download" />
  </a>
  <a href="https://github.com/FHRha/Holad/releases/latest">
    <img src="https://img.shields.io/badge/Linux-AppImage_%2F_DEB-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux Download" />
  </a>
  <a href="https://github.com/FHRha/Holad/releases/latest">
    <img src="https://img.shields.io/badge/Android-APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android Download" />
  </a>
  <a href="https://github.com/FHRha/Holad/releases/latest">
    <img src="https://img.shields.io/badge/Web_Server-Self--Hosted_.tar.gz-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Web Server Download" />
  </a>

  <br />
  <p><i>* P.S. Код и заготовки для продукции Apple (macOS и iOS) уже есть, но так как автор бедный студент без продукции Apple, возможности скомпилировать и выложить их пока нет 😅🍏</i></p>
</div>

---

## Особенности

- **Интеграция с Subsonic / Navidrome**: Holad безопасно проксирует запросы к вашему серверу, скрывая учетные данные и обеспечивая плавное воспроизведение.
- **Современный UI/UX**: Потрясающий визуальный интерфейс с плавными анимациями, поддержкой светлой/темной темы и настраиваемыми элементами (Drag-and-Drop).
- **HoladConnect**: Мгновенная синхронизация состояния плеера между всеми вашими устройствами. Начните слушать на ПК и продолжите на телефоне без прерываний!
- **Jam Сессии**: Слушайте музыку вместе с друзьями в реальном времени. Создавайте комнаты и управляйте очередью воспроизведения сообща.
- **Мультиязычность**: Встроенная поддержка нескольких языков (в данный момент доступны **Русский** и **Английский**).
- **Self-Hosted**: Полный контроль над вашими данными. Легко разворачивается на собственном Linux или Windows сервере.

## Скриншоты

### Главный экран
![Главный экран](.github/assets/ru-main.png)

### Плеер и визуализация
![Плеер](.github/assets/ru-visual.png)

## Быстрый старт (Linux)

Чтобы установить Holad на ваш сервер одной командой, выполните:

```bash
curl -sSL https://raw.githubusercontent.com/FHRha/Holad/main/install.sh | bash
```

Скрипт скачает последний релиз, установит его в `/opt/holad`, подтянет зависимости и создаст службу `systemd` для фоновой работы на порту 4000. 
*Для ручной сборки используйте `build_release.sh` (Linux/macOS) или `build_release.bat` (Windows).*

### Настройка Nginx

Если вы используете **Nginx** в качестве reverse proxy (рекомендуется), добавьте следующие блоки `location` внутрь вашего серверного блока (в файл `/etc/nginx/sites-available/...`), чтобы проксировать запросы к плееру без конфликтов:

```nginx
    # --- Holad Player ---
    
    # 1. Интерфейс плеера
    location /Holad {
        proxy_pass http://127.0.0.1:4000/Holad;
        include snippets/proxy-params.conf;
    }

    # 2. Страница входа
    location /login {
        proxy_pass http://127.0.0.1:4000/login;
        include snippets/proxy-params.conf;
    }

    # 3. Интерфейс совместных сессий
    location /jam {
        proxy_pass http://127.0.0.1:4000/jam;
        include snippets/proxy-params.conf;
    }

    # 4. Веб-сокеты для HoladConnect и Jam-сессий
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000/socket.io/;
        include snippets/proxy-params.conf;
    }
```
*(Примечание: `include snippets/proxy-params.conf;` подключает стандартные заголовки для проксирования. В Ubuntu/Debian вы можете использовать встроенный `include proxy_params;`. Если вы используете свой файл `snippets/proxy-params.conf`, убедитесь, что в нём прописано следующее:)*
```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

После внесения изменений выполните `sudo nginx -s reload`.

### Решение проблем со входом (NAT Loopback)
Для защиты от SSRF сервер Holad разрешает вход только если URL, который вы вводите в браузере, совпадает с внешним доменом. Однако, если Holad установлен в домашней сети, при попытке проверить этот домен запрос может зависнуть из-за блокировки вашим роутером "разворота" трафика (отсутствие Hairpin NAT).
Чтобы исправить это, подскажите серверу обращаться к локалхосту напрямую:
```bash
echo "127.0.0.1 ВАШ_ДОМЕН" | sudo tee -a /etc/hosts
```

## Архитектура

- **Frontend**: React 19, Vite, TailwindCSS, Zustand, Framer Motion, Socket.io-client, dnd-kit.
- **Backend**: Node.js, Express, Socket.io (для HoladConnect и Jam-сессий), TypeScript.

## Лицензия

Проект распространяется под **Holad Non-Commercial License**. 
Вы можете свободно использовать, изучать и модифицировать код для личных, некоммерческих целей. Любое коммерческое использование (продажа, интеграция в платные продукты, монетизация) строго запрещено без разрешения создателя (FHRha). Подробнее см. файл [LICENSE](LICENSE).
