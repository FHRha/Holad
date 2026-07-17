#!/bin/bash
set -e

echo "Starting Holad release build process..."

CREATE_ARCHIVE=true

for arg in "$@"
do
    if [ "$arg" == "--no-archive" ]; then
        CREATE_ARCHIVE=false
    fi
done

echo "Cleaning up previous build..."
rm -rf artifacts/holad-release

# Create artifacts and release directories
mkdir -p artifacts/holad-release/client
mkdir -p artifacts/holad-release/server

echo "Installing client dependencies..."
cd client
pnpm install
echo "Building client..."
pnpm run build
cd ..

echo "Installing server dependencies..."
cd server
pnpm install
echo "Building server..."
pnpm run build
cd ..

echo "Copying files to release folder..."
# Copy client build
cp -r client/dist artifacts/holad-release/client/

# Copy server build and necessary files
cp -r server/dist artifacts/holad-release/server/
cp server/package.json artifacts/holad-release/server/
echo "Creating .env.example..."
cat << 'EOF' > artifacts/holad-release/server/.env.example
PORT=4000
# If you want to manually bind the server, uncomment and edit the line below:
# NAVIDROME_ACCOUNTS='[{"url":"https://your-navidrome.com","user":"admin","token":"...","salt":"..."}]'
EOF

cp holad_cli.sh artifacts/holad-release/

echo "Creating startup scripts..."
cat << 'EOF' > artifacts/holad-release/start.sh
#!/bin/bash
cd server
if [ ! -d "node_modules" ]; then
    echo "Installing production dependencies..."
    npm install --production
fi
node dist/index.js
EOF
chmod +x artifacts/holad-release/start.sh

if [ "$CREATE_ARCHIVE" = true ]; then
    echo "Creating tar.gz archive..."
    cd artifacts
    tar -czf holad-linux-release.tar.gz holad-release/

    # Cleanup
    rm -rf holad-release

    echo "Build complete! Release archive is at artifacts/holad-linux-release.tar.gz"
else
    echo "Build complete! Release files are ready at artifacts/holad-release"
fi
