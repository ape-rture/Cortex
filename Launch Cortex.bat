@echo off
setlocal
title Cortex UI
cd /d "d:\Documenten\Programmeren\Personal Assistant"
set "PORT=8787"
set "PID="
for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "PID=%%I"

if defined PID (
  echo Cortex UI is already running on port %PORT% with PID %PID%.
  start "" http://localhost:%PORT%
  exit /b 0
)

start "" http://localhost:%PORT%
node --import tsx src/ui/server.ts
