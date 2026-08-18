@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart.ps1" -Action Disable
if errorlevel 1 (
  echo Failed to disable autostart.
  pause
  exit /b 1
)
pause
