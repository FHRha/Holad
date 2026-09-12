@echo off
setlocal
echo Starting unified Holad build via Node.js...

:: Default to 2.0.0-localtest for local builds if not already set
if not defined RELEASE_VERSION (
    if not defined GITHUB_REF_NAME (
        set "RELEASE_VERSION=2.0.0-localtest"
    )
)

:: Check if node is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo Please install Node.js from https://nodejs.org to run the build.
    exit /b 1
)

:: Run the universal build script
node "%~dp0build_all.js" %*
set "BUILD_STATUS=%errorlevel%"

if %BUILD_STATUS% neq 0 (
    echo.
    echo [ERROR] Build failed with exit code %BUILD_STATUS%.
    exit /b %BUILD_STATUS%
)

echo.
echo [SUCCESS] Holad build finished successfully!
exit /b 0
