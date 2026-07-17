<div align="right">
  <a href="README.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/ru.svg" alt="Русский" width="30"/></a>
  <a href="README_en.md"><img src="https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/gb.svg" alt="English" width="30"/></a>
</div>

<div align="center">
  <img src="client/public/icons/favicon_tab.png" alt="Holad Logo" width="150" height="150">
  
  # Holad
  
  **Your Next-Generation Audio Experience.** 
  A modern, highly customizable streaming platform and player. Holad acts as an elegant and lightning-fast client for your Subsonic/Navidrome servers.
  While building this project, I was heavily inspired by **Spotify**, **Feishin**, and **Substream**. A massive thank you to their developers for their hard work and ideas!

  [![GitHub release (latest by date)](https://img.shields.io/github/v/release/FHRha/Holad)](https://github.com/FHRha/Holad/releases)
  [![License: Non-Commercial](https://img.shields.io/badge/License-Non_Commercial-red.svg)](LICENSE)
</div>

---

## Features

- **Subsonic / Navidrome Integration**: Holad securely proxies requests to your server, hiding credentials while providing seamless playback.
- **Modern UI/UX**: A visually stunning interface with smooth animations, light/dark themes, and customizable drag-and-drop elements.
- **HoladConnect**: Instant synchronization of player state across all your devices. Start listening on your PC and continue seamlessly on your phone!
- **Jam Sessions**: Listen to music together with friends in real-time. Create rooms and manage the playback queue collaboratively.
- **Localization**: Built-in multi-language support (currently **Russian** and **English** are available).
- **Self-Hosted**: Full control over your data. Deploy it easily on your own Linux or Windows server.

## Screenshots

### Main Dashboard
![Main Dashboard](.github/assets/en-main.png)

### Player & Visualization
![Player](.github/assets/en-visual.png)

## Quick Start (Production)

To install Holad on your Linux server in one command, run:

```bash
curl -sSL https://raw.githubusercontent.com/FHRha/Holad/main/install.sh | bash
```

The script will guide you through the setup, including systemd service creation, Nginx configuration, and environment setup.
For manual builds, use `build_release.sh` (Linux/macOS) or `build_release.bat` (Windows).

## Architecture

- **Frontend**: React 19, Vite, TailwindCSS, Zustand, Framer Motion, Socket.io-client, dnd-kit.
- **Backend**: Node.js, Express, Socket.io (for HoladConnect and Jam sessions), TypeScript.

## License

This project is distributed under the **Holad Non-Commercial License**. 
You are free to use, study, and modify the code for personal, non-commercial purposes. Any commercial use (selling, integrating into paid products, monetizing) is strictly prohibited without explicit permission from the creator (FHRha). See the [LICENSE](LICENSE) file for details.
