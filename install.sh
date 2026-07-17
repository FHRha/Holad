#!/bin/bash
set -e

echo "==================================="
echo "       Holad Installer             "
echo "==================================="

# 1. Ask for configuration
read -p "Enter the domain or IP for Holad (e.g., example.com): " HOLAD_DOMAIN
read -p "Enter the internal port for the Node.js backend [3000]: " HOLAD_PORT
HOLAD_PORT=${HOLAD_PORT:-3000}
read -p "Do you want to enable systemd autostart? (Y/n): " ENABLE_SYSTEMD
ENABLE_SYSTEMD=${ENABLE_SYSTEMD:-Y}

INSTALL_DIR="/opt/holad"

echo "Installing to $INSTALL_DIR..."
sudo mkdir -p $INSTALL_DIR
# In a real scenario, this script would download the tar.gz from GitHub releases:
# curl -sSL https://github.com/FHRha/Holad/releases/latest/download/holad-linux-release.tar.gz -o /tmp/holad.tar.gz
# sudo tar -xzf /tmp/holad.tar.gz -C /opt
# For now, assuming the archive is extracted into /opt/holad-release and we rename it:
# sudo mv /opt/holad-release/* $INSTALL_DIR/

# Let's mock the process since the user will use this from the repo
echo "Extracting release..."
# (Assuming archive is already downloaded as holad.tar.gz in current dir for local testing)
if [ -f "holad-linux-release.tar.gz" ]; then
    sudo tar -xzf holad-linux-release.tar.gz -C /tmp/
    sudo cp -r /tmp/holad-release/* $INSTALL_DIR/
    sudo rm -rf /tmp/holad-release
else
    echo "Warning: holad-linux-release.tar.gz not found in current directory. Please ensure it's downloaded."
fi

# Fetch and save current version from GitHub
LATEST_VERSION=$(curl -sSL https://api.github.com/repos/FHRha/Holad/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
if [ ! -z "$LATEST_VERSION" ]; then
    echo "$LATEST_VERSION" | sudo tee $INSTALL_DIR/.version > /dev/null
fi

cd $INSTALL_DIR/server

echo "Installing production dependencies..."
sudo pnpm install --prod || npm install --production

echo "Configuring environment..."
echo "PORT=$HOLAD_PORT" | sudo tee .env > /dev/null

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

# 3. Generate Nginx Configuration
echo "Generating Nginx configuration..."
NGINX_CONF="/etc/nginx/sites-available/holad.conf"
sudo bash -c "cat > $NGINX_CONF" <<EOL
server {
    listen 80;
    server_name $HOLAD_DOMAIN;

    # Backend API / Sockets
    location /api/ {
        proxy_pass http://localhost:$HOLAD_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Sockets specifically
    location /socket.io/ {
        proxy_pass http://localhost:$HOLAD_PORT/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # Frontend pages
    location /Holad {
        alias $INSTALL_DIR/client/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /jam {
        alias $INSTALL_DIR/client/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location / {
        root $INSTALL_DIR/client/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
EOL

echo "Nginx configuration generated at $NGINX_CONF."
echo "To enable it, run: sudo ln -s $NGINX_CONF /etc/nginx/sites-enabled/ && sudo systemctl reload nginx"

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
