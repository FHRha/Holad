#!/bin/bash

INSTALL_DIR="/opt/holad"

show_menu() {
    clear
    echo "==================================="
    echo "        Holad Control Panel        "
    echo "==================================="
    echo "1) Status      (Проверить статус сервера)"
    echo "2) Start       (Запустить сервер)"
    echo "3) Stop        (Остановить сервер)"
    echo "4) Restart     (Перезапустить сервер)"
    echo "5) Logs        (Посмотреть логи)"
    echo "6) Config      (Отредактировать .env)"
    echo "7) Update      (Обновить с GitHub / Переустановить)"
    echo "8) Uninstall   (Полностью удалить Holad)"
    echo "0) Exit"
    echo "==================================="
}

while true; do
    show_menu
    read -p "Select an option [0-8]: " choice
    case $choice in
        1)
            sudo systemctl status holad
            read -p "Press Enter to continue..."
            ;;
        2)
            sudo systemctl start holad
            echo "Server started."
            read -p "Press Enter to continue..."
            ;;
        3)
            sudo systemctl stop holad
            echo "Server stopped."
            read -p "Press Enter to continue..."
            ;;
        4)
            sudo systemctl restart holad
            echo "Server restarted."
            read -p "Press Enter to continue..."
            ;;
        5)
            echo "Press Ctrl+C to exit logs view."
            sudo journalctl -u holad -f
            ;;
        6)
            sudo nano $INSTALL_DIR/server/.env
            echo "If you made changes, consider restarting the server (Option 4)."
            read -p "Press Enter to continue..."
            ;;
        7)
            echo "Checking for updates..."
            LATEST_VERSION=$(curl -sSL https://api.github.com/repos/FHRha/Holad/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
            if [ -z "$LATEST_VERSION" ]; then
                LATEST_VERSION="Unknown"
            fi
            
            CURRENT_VERSION="Unknown"
            if [ -f "$INSTALL_DIR/.version" ]; then
                CURRENT_VERSION=$(cat $INSTALL_DIR/.version)
            fi
            
            echo "Current Version: $CURRENT_VERSION"
            echo "Latest Version:  $LATEST_VERSION"
            
            if [ "$CURRENT_VERSION" == "$LATEST_VERSION" ] && [ "$CURRENT_VERSION" != "Unknown" ]; then
                echo "You are currently running the latest version!"
                read -p "Do you want to force reinstall it anyway? (y/N): " FORCE_UPDATE
                if [[ ! "$FORCE_UPDATE" =~ ^[Yy]$ ]]; then
                    continue
                fi
            else
                read -p "Do you want to update now? (Y/n): " DO_UPDATE
                if [[ "$DO_UPDATE" =~ ^[Nn]$ ]]; then
                    continue
                fi
            fi

            echo "Updating Holad from latest GitHub release..."
            sudo systemctl stop holad
            
            # Backup .env and Database into secure directory
            echo "Backing up configuration and database..."
            BACKUP_DIR="$INSTALL_DIR/backups/backup_$(date +%Y%m%d_%H%M%S)"
            sudo mkdir -p "$BACKUP_DIR"
            sudo chmod 700 "$BACKUP_DIR"
            if [ -f "$INSTALL_DIR/server/.env" ]; then
                sudo cp "$INSTALL_DIR/server/.env" "$BACKUP_DIR/.env"
                sudo chmod 600 "$BACKUP_DIR/.env"
            fi
            if [ -f "$INSTALL_DIR/server/holad.sqlite" ]; then
                sudo cp "$INSTALL_DIR/server/holad.sqlite" "$BACKUP_DIR/holad.sqlite"
                sudo chmod 600 "$BACKUP_DIR/holad.sqlite"
            fi
            
            # Download new release
            echo "Downloading latest release..."
            TMP_DIR=$(mktemp -d /tmp/holad_upd_XXXXXX)
            chmod 700 "$TMP_DIR"
            trap 'rm -rf "$TMP_DIR"' EXIT
            DOWNLOAD_BASE="https://github.com/FHRha/Holad/releases/latest/download"
            if curl -sSLf "$DOWNLOAD_BASE/holad-web-release.tar.gz" -o "$TMP_DIR/holad-web-release.tar.gz"; then
                echo "Downloaded holad-web-release.tar.gz"
            elif curl -sSLf "$DOWNLOAD_BASE/holad-linux-release.tar.gz" -o "$TMP_DIR/holad-web-release.tar.gz"; then
                echo "Downloaded holad-linux-release.tar.gz (legacy fallback)"
            else
                echo "Error: Failed to download release bundle."
            fi
            
            if [ -f "$TMP_DIR/holad-web-release.tar.gz" ]; then
                echo "Checking SHA256 checksums if available..."
                if curl -sSLf "$DOWNLOAD_BASE/SHA256SUMS" -o "$TMP_DIR/SHA256SUMS" 2>/dev/null; then
                    (cd "$TMP_DIR" && sha256sum --check --ignore-missing SHA256SUMS) || {
                        echo "Error: SHA256 checksum verification failed!"
                        exit 1
                    }
                    echo "SHA256 checksum verified successfully."
                fi

                echo "Extracting release..."
                tar -xzf "$TMP_DIR/holad-web-release.tar.gz" -C "$TMP_DIR/"
                sudo cp -r "$TMP_DIR"/holad-release/* $INSTALL_DIR/
                
                # Restore .env and DB from secure backup
                if [ -f "$BACKUP_DIR/.env" ]; then
                    echo "Restoring configuration..."
                    sudo cp "$BACKUP_DIR/.env" $INSTALL_DIR/server/.env
                fi
                if [ -f "$BACKUP_DIR/holad.sqlite" ]; then
                    echo "Restoring database..."
                    sudo cp "$BACKUP_DIR/holad.sqlite" $INSTALL_DIR/server/holad.sqlite
                fi
                sudo chmod 700 "$INSTALL_DIR/server"
                if [ -f "$INSTALL_DIR/server/.env" ]; then
                    sudo chmod 600 "$INSTALL_DIR/server/.env"
                fi
                
                if [ "$LATEST_VERSION" != "Unknown" ]; then
                    echo "$LATEST_VERSION" | sudo tee $INSTALL_DIR/.version > /dev/null
                fi
                
                # Install dependencies
                echo "Installing dependencies..."
                cd $INSTALL_DIR/server
                sudo npm install --production
                
                echo "Starting server..."
                sudo systemctl start holad
                echo "Update complete!"
            else
                echo "Error: Failed to download release from GitHub."
            fi
            read -p "Press Enter to continue..."
            ;;
        8)
            echo "WARNING: This will completely remove Holad, including all settings and the systemd service."
            read -p "Are you absolutely sure? (Type 'YES' to confirm): " CONFIRM_UNINSTALL
            if [ "$CONFIRM_UNINSTALL" == "YES" ]; then
                echo "Stopping and disabling service..."
                sudo systemctl stop holad
                sudo systemctl disable holad
                sudo rm -f /etc/systemd/system/holad.service
                sudo systemctl daemon-reload
                
                echo "Removing installation directory..."
                sudo rm -rf $INSTALL_DIR
                
                echo "Removing CLI symlink..."
                sudo rm -f /usr/local/bin/holad
                
                echo "Holad has been completely uninstalled."
                exit 0
            else
                echo "Uninstall cancelled."
                read -p "Press Enter to continue..."
            fi
            ;;
        0)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid option."
            read -p "Press Enter to continue..."
            ;;
    esac
done
