@echo off
cd /d "%~dp0"
taskkill /fi "WINDOWTITLE eq SafeVoice Wi-Fi*" >nul 2>nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0network\hotspot.ps1" -Action stop
pause
