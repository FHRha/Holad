#!/bin/bash
set -e

echo "==================================="
echo "       Holad Installer             "
echo "==================================="



# 1. Ask for configuration
if [ -z "$HOLAD_PORT" ]; then
    if [ -c /dev/tty ]; then
        printf "Enter the internal port for the Node.js backend [3000]: " >/dev/tty
        read -r HOLAD_PORT </dev/tty
    else
        echo "Non-interactive environment detected. Using default port 3000."
    fi
fi
HOLAD_PORT=${HOLAD_PORT:-3000}

if [ -z "$ENABLE_SYSTEMD" ]; then
    if [ -c /dev/tty ]; then
        printf "Do you want to enable systemd autostart? (Y/n): " >/dev/tty
        read -r ENABLE_SYSTEMD </dev/tty
    else
        echo "Non-interactive environment detected. Enabling systemd by default."
    fi
fi
ENABLE_SYSTEMD=${ENABLE_SYSTEMD:-Y}

INSTALL_DIR="/opt/holad"

echo "Installing to $INSTALL_DIR..."
sudo mkdir -p $INSTALL_DIR
echo "Downloading latest release..."
curl -sSL https://github.com/FHRha/Holad/releases/latest/download/holad-linux-release.tar.gz -o /tmp/holad.tar.gz

echo "Extracting release..."
sudo tar -xzf /tmp/holad.tar.gz -C /tmp/
sudo cp -r /tmp/holad-release/* $INSTALL_DIR/
sudo rm -rf /tmp/holad-release
sudo rm /tmp/holad.tar.gz

# Fetch and save current version from GitHub
LATEST_VERSION=$(curl -sSL https://api.github.com/repos/FHRha/Holad/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
if [ ! -z "$LATEST_VERSION" ]; then
    echo "$LATEST_VERSION" | sudo tee $INSTALL_DIR/.version > /dev/null
fi

cd $INSTALL_DIR/server

echo "Installing production dependencies..."
sudo pnpm install --prod || npm install --production

echo "Configuring environment..."
if [ ! -f .env ]; then
    echo "PORT=$HOLAD_PORT" | sudo tee .env > /dev/null
else
    echo ".env already exists, preserving it."
fi

# 2. Setup Systemd Service
if [[ "$ENABLE_SYSTEMD" == "Y" || "$ENABLE_SYSTEMD" == "y" ]]; then
    echo "Creating systemd service..."
    SERVICE_FILE="/etc/systemd/system/holad.service"
    sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=Holad Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOL

    sudo systemctl daemon-reload
    sudo systemctl enable holad
    sudo systemctl start holad
    echo "Systemd service started and enabled."
fi



# 4. Setup CLI
echo "Setting up Holad CLI..."
if [ -f "$INSTALL_DIR/holad_cli.sh" ]; then
    sudo chmod +x $INSTALL_DIR/holad_cli.sh
    sudo ln -sf $INSTALL_DIR/holad_cli.sh /usr/local/bin/Holad
    echo "CLI installed. You can now type 'Holad' in terminal to manage the server."
fi

echo "==================================="
echo "Holad installation complete!"
echo "==================================="
