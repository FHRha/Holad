@echo off
echo Starting unified Holad build via Node.js...

:: Check if node is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install Node.js to run the build.
    exit /b 1
)

:: Run the universal build script
node build_all.js %*
