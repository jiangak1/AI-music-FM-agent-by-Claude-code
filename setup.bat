@echo off
title AI Radio Setup

echo.
echo ========================================
echo        AI Radio - Setup
echo ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found
    echo Please install Node.js first: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] Node.js version:
node -v
echo.

echo [2/3] Installing dependencies...
cd /d "%~dp0server"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo.

cd /d "%~dp0"
if not exist ".env" (
    echo [3/3] Creating .env from template
    copy .env.example .env >nul
    echo Please edit .env and add your API Key
) else (
    echo [3/3] .env already exists
)

echo.
echo ========================================
echo     Setup complete!
echo     Edit .env to add your API Key
echo     Then double-click start.bat
echo ========================================
echo.
pause
