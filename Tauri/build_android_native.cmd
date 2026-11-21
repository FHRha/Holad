@echo off
setlocal

echo ========================================================
echo   Holad - Build Android Native Library (libholad_lib.so)
echo ========================================================

set "CARGO_HOME=C:\rust\cargo"
set "RUSTUP_HOME=C:\rust\rustup"
set "NDK_ROOT=C:\Users\8FEE~1\AppData\Local\Android\Sdk\ndk\27.2.12479018"
set "PATH=%NDK_ROOT%\toolchains\llvm\prebuilt\windows-x86_64\bin;%PATH%"

cd /d "%~dp0src-tauri" || exit /b 1

echo Building release for aarch64-linux-android with custom-protocol...
cargo build --release --target aarch64-linux-android --features custom-protocol || exit /b 1

echo Copying libholad_lib.so to Android jniLibs...
set "DEST_DIR=%~dp0src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

copy /y "%~dp0src-tauri\target\aarch64-linux-android\release\libholad_lib.so" "%DEST_DIR%\libholad_lib.so" || exit /b 1

echo ========================================================
echo   Native library build completed successfully!
echo   Output: %DEST_DIR%\libholad_lib.so
echo ========================================================
endlocal
