@echo off
title SafeVoice
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
netstat -ano -p tcp | findstr /R /C:":3000 .*LISTENING" >nul && (
  echo SafeVoice is already running on this computer. Opening the demo...
  start "" http://localhost:3000/demo
  timeout /t 4 >nul
  exit /b 0
)
if not exist "node_modules\@anthropic-ai\sdk" (
  echo Installing the optional Claude SDK...
  call npm install --no-audit --no-fund
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000/demo"
node server.js
pause
