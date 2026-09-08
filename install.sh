#!/bin/bash
set -e

echo "==================================="
echo "       Holad Installer             "
echo "==================================="



while [[ "$#" -gt 0 ]]; do
    case $1 in
        -p|--port) HOLAD_PORT="$2"; shift ;;
        --no-systemd) ENABLE_SYSTEMD="n" ;;
        -v|--version) TARGET_VERSION="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

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

if [ -z "$TARGET_VERSION" ]; then
    DOWNLOAD_BASE="https://github.com/FHRha/Holad/releases/latest/download"
else
    DOWNLOAD_BASE="https://github.com/FHRha/Holad/releases/download/$TARGET_VERSION"
fi

TMP_DIR=$(mktemp -d /tmp/holad_inst_XXXXXX)
chmod 700 "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading release from $DOWNLOAD_BASE..."
if curl -sSLf "$DOWNLOAD_BASE/holad-web-release.tar.gz" -o "$TMP_DIR/holad-web-release.tar.gz"; then
    echo "Downloaded holad-web-release.tar.gz"
elif curl -sSLf "$DOWNLOAD_BASE/holad-linux-release.tar.gz" -o "$TMP_DIR/holad-web-release.tar.gz"; then
    echo "Downloaded holad-linux-release.tar.gz (legacy fallback)"
else
    echo "Error: Failed to download release bundle."
    exit 1
fi

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
sudo chmod 700 "$INSTALL_DIR/server"
if [ -f "$INSTALL_DIR/server/.env" ]; then
    sudo chmod 600 "$INSTALL_DIR/server/.env"
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
