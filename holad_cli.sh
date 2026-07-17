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
            
            # Backup .env
            echo "Backing up configuration..."
            if [ -f "$INSTALL_DIR/server/.env" ]; then
                sudo cp $INSTALL_DIR/server/.env /tmp/holad_env_backup
            fi
            
            # Download new release
            echo "Downloading latest release..."
            curl -sSL https://github.com/FHRha/Holad/releases/latest/download/holad-linux-release.tar.gz -o /tmp/holad-update.tar.gz
            
            if [ -f "/tmp/holad-update.tar.gz" ]; then
                echo "Extracting release..."
                sudo tar -xzf /tmp/holad-update.tar.gz -C /tmp/
                sudo cp -r /tmp/holad-release/* $INSTALL_DIR/
                sudo rm -rf /tmp/holad-release
                sudo rm /tmp/holad-update.tar.gz
                
                # Restore .env
                if [ -f "/tmp/holad_env_backup" ]; then
                    echo "Restoring configuration..."
                    sudo cp /tmp/holad_env_backup $INSTALL_DIR/server/.env
                    sudo rm /tmp/holad_env_backup
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
