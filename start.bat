@echo off
title AI Radio

echo.
echo ========================================
echo        AI Radio - FM 102.4 MHz
echo ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found
    echo Please run setup.bat first
    pause
    exit /b 1
)

where cargo >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Rust / Cargo not found, falling back to browser mode
    goto browser_mode
)

if not exist "%~dp0server\node_modules\" (
    echo Installing dependencies first...
    cd /d "%~dp0server"
    call npm install
    cd /d "%~dp0"
)

if not exist "%~dp0.env" (
    copy "%~dp0.env.example" "%~dp0.env" >nul
)

echo Starting AI Radio (Tauri desktop mode)...
echo.

cd /d "%~dp0"
cargo tauri dev

goto end

:browser_mode
echo Starting AI Radio in browser mode...
echo.
cd /d "%~dp0server"
node index.js

:end
echo.
echo AI Radio stopped.
pause
