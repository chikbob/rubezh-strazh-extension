@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart.ps1" -Action Enable
if errorlevel 1 (
  echo Failed to enable autostart.
  pause
  exit /b 1
)
pause
