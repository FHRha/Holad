#!/bin/bash
set -e

echo "Starting unified Holad build via Node.js..."

# Check if node is installed
if ! command -v node &> /dev/null
then
    echo "Error: Node.js is not installed. Please install Node.js to run the build."
    exit 1
fi

# Run the universal build script
node build_all.js "$@"
