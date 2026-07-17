@echo off
setlocal enabledelayedexpansion

echo Starting Holad release build process (Windows)...

set CREATE_ARCHIVE=true

:parse_args
if "%~1"=="" goto end_parse
if "%~1"=="--no-archive" set CREATE_ARCHIVE=false
shift
goto parse_args
:end_parse

echo Cleaning up previous build...
if exist "artifacts\holad-release" rmdir /s /q "artifacts\holad-release"

:: Create artifacts and release directories
if not exist "artifacts\holad-release\client" mkdir "artifacts\holad-release\client"
if not exist "artifacts\holad-release\server" mkdir "artifacts\holad-release\server"

echo Installing client dependencies...
cd client
call pnpm install
echo Building client...
call pnpm run build
cd ..

echo Installing server dependencies...
cd server
call pnpm install
echo Building server...
call pnpm run build
cd ..

echo Copying files to release folder...
:: Copy client build
xcopy "client\dist" "artifacts\holad-release\client\dist" /E /I /H /Y

:: Copy server build and necessary files
xcopy "server\dist" "artifacts\holad-release\server\dist" /E /I /H /Y
copy "server\package.json" "artifacts\holad-release\server\"

echo Creating .env.example...
(
echo PORT=4000
echo # If you want to manually bind the server, uncomment and edit the line below:
echo # NAVIDROME_ACCOUNTS='[{"url":"https://your-navidrome.com","user":"admin","token":"...","salt":"..."}]'
) > "artifacts\holad-release\server\.env.example"

copy "holad_cli.sh" "artifacts\holad-release\"

echo Creating startup scripts...
(
echo @echo off
echo cd server
echo if not exist "node_modules" ^(
echo     echo Installing production dependencies...
echo     call npm install --production
echo ^)
echo node dist\index.js
echo pause
) > "artifacts\holad-release\start.bat"

if "%CREATE_ARCHIVE%"=="true" (
    echo Creating tar.gz archive...
    cd artifacts
    tar -czf holad-windows-release.tar.gz holad-release
    :: Cleanup
    rmdir /s /q holad-release
    echo Build complete! Release archive is at artifacts\holad-windows-release.tar.gz
) else (
    echo Build complete! Release files are ready at artifacts\holad-release
)
