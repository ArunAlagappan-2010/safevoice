@echo off
title SafeVoice server
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

netstat -ano -p tcp | findstr /R /C:":3000 .*LISTENING" >nul && (
  echo.
  echo  SafeVoice is already running on this computer. Opening the dashboard...
  start "" http://localhost:3000/counsellor
  timeout /t 4 >nul
  exit /b 0
)

echo.
echo  [1/3] Creating the SafeVoice Wi-Fi (no internet or modem needed)...
start "SafeVoice Wi-Fi" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0network\hotspot.ps1" -Action start -KeepAlive

echo  [2/3] Opening the counsellor dashboard...
start "" /min cmd /c "timeout /t 3 >nul & (start msedge --app=http://localhost:3000/counsellor || start http://localhost:3000/counsellor)"

echo  [3/3] Starting SafeVoice. Keep this window open while the school is using it.
echo.
node server.js
pause
