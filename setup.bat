@echo off
title V2 Backend - DSD 2025-2026

cd /d "%~dp0"

echo.
echo  ================================
echo   V2 Backend - Team V2
echo   DSD 2025-2026
echo  ================================
echo.
echo  [1/2] Installing packages...
echo  (This may take 1-2 minutes the first time)
echo.

call npm install

if %errorlevel% neq 0 (
  echo.
  echo  ERROR: npm install failed!
  echo  Make sure Node.js is installed from https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo  [2/2] Starting server...
echo.
echo  Open your browser at: http://localhost:3000/health
echo  Press Ctrl+C to stop the server.
echo.

call node src/server.js

pause
