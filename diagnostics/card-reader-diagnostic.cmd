@echo off
setlocal EnableExtensions

fltmc >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator privileges...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "TARGETDIR=%USERPROFILE%\Desktop"
set "LOGFILE=%TARGETDIR%\card-reader-diagnostic.txt"
set "PSFILE=%TEMP%\rubezh-card-reader-diagnostic.ps1"

if not exist "%TARGETDIR%" mkdir "%TARGETDIR%"
if not exist "%TARGETDIR%" (
  echo ERROR: Cannot create "%TARGETDIR%".
  pause
  exit /b 1
)

>"%PSFILE%" echo $ErrorActionPreference = 'Continue'
>>"%PSFILE%" echo Write-Host 'RUBEZH CARD READER DIAGNOSTIC'
>>"%PSFILE%" echo Write-Host ('Time: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
>>"%PSFILE%" echo Write-Host ('Computer: ' + $env:COMPUTERNAME)
>>"%PSFILE%" echo Write-Host ('User: ' + $env:USERNAME)
>>"%PSFILE%" echo Write-Host ('Windows: ' + (Get-CimInstance Win32_OperatingSystem).Caption)
>>"%PSFILE%" echo Write-Host "`n=== SMART CARD SERVICES: BEFORE ==="
>>"%PSFILE%" echo Get-Service SCardSvr,ScDeviceEnum ^| Format-List Name,DisplayName,Status,StartType
>>"%PSFILE%" echo Write-Host "`n=== STARTING PC/SC SERVICE ==="
>>"%PSFILE%" echo Set-Service SCardSvr -StartupType Manual
>>"%PSFILE%" echo Start-Service SCardSvr
>>"%PSFILE%" echo Start-Sleep -Seconds 2
>>"%PSFILE%" echo Get-Service SCardSvr,ScDeviceEnum ^| Format-List Name,DisplayName,Status,StartType
>>"%PSFILE%" echo Write-Host "`n=== PRESENT ACR / SMART-CARD / USB DEVICES ==="
>>"%PSFILE%" echo Get-PnpDevice -PresentOnly ^| Where-Object { $_.FriendlyName -match 'ACR1281^|smart.card^|CCID^|reader' -or $_.InstanceId -match 'VID_072F.PID_2224' } ^| Sort-Object Class,FriendlyName ^| Format-List Status,Class,FriendlyName,InstanceId,Problem,ConfigManagerErrorCode
>>"%PSFILE%" echo Write-Host "`n=== ACR1281 DEVICE PROPERTIES ==="
>>"%PSFILE%" echo $devices = Get-PnpDevice ^| Where-Object { $_.FriendlyName -match 'ACR1281' -or $_.InstanceId -match 'VID_072F.PID_2224' }
>>"%PSFILE%" echo foreach ($device in $devices) { Write-Host ('--- ' + $device.FriendlyName + ' ---'); Write-Host $device.InstanceId; Get-PnpDeviceProperty -InstanceId $device.InstanceId ^| Where-Object { $_.KeyName -match 'DriverVersion^|DriverDate^|DriverProvider^|Service^|ProblemCode^|InstallDate^|LocationInfo^|MatchingDeviceId' } ^| Format-Table KeyName,Data -Wrap }
>>"%PSFILE%" echo Write-Host "`n=== DEVICES WITH CURRENT ERRORS ==="
>>"%PSFILE%" echo Get-PnpDevice -PresentOnly ^| Where-Object { $_.Status -ne 'OK' } ^| Format-Table Status,Class,FriendlyName,InstanceId -Wrap
>>"%PSFILE%" echo Write-Host "`n=== PC/SC CARD TEST ==="
>>"%PSFILE%" echo Write-Host 'Place a pass on the ACR1281 reader now. Waiting 10 seconds...'
>>"%PSFILE%" echo Start-Sleep -Seconds 10
>>"%PSFILE%" echo $certOut = Join-Path $env:TEMP 'rubezh-certutil-scinfo.txt'
>>"%PSFILE%" echo $certErr = Join-Path $env:TEMP 'rubezh-certutil-scinfo-error.txt'
>>"%PSFILE%" echo Remove-Item $certOut,$certErr -Force -ErrorAction SilentlyContinue
>>"%PSFILE%" echo $process = Start-Process certutil.exe -ArgumentList '-silent','-scinfo' -RedirectStandardOutput $certOut -RedirectStandardError $certErr -PassThru
>>"%PSFILE%" echo if (-not $process.WaitForExit(30000)) { $process.Kill(); Write-Host 'certutil timed out after 30 seconds.' }
>>"%PSFILE%" echo if (Test-Path $certOut) { Get-Content $certOut }
>>"%PSFILE%" echo if (Test-Path $certErr) { Get-Content $certErr }
>>"%PSFILE%" echo Write-Host "`n=== EVENT LOG: SMART CARD / USB, LAST 3 DAYS ==="
>>"%PSFILE%" echo Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=(Get-Date).AddDays(-3)} -ErrorAction SilentlyContinue ^| Where-Object { $_.ProviderName -match 'SmartCard^|USB^|Kernel-PnP^|WUDF' -and $_.Message -match 'ACR^|072F^|2224^|smart.card^|reader' } ^| Select-Object -First 80 TimeCreated,Id,LevelDisplayName,ProviderName,Message ^| Format-List
>>"%PSFILE%" echo Write-Host "`n=== DIAGNOSTIC COMPLETE ==="

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PSFILE%" >"%LOGFILE%" 2>&1
set "RESULT=%ERRORLEVEL%"
del "%PSFILE%" >nul 2>&1

echo.
if exist "%LOGFILE%" (
  for %%A in ("%LOGFILE%") do echo Diagnostic log saved: "%%~fA" ^(%%~zA bytes^)
  echo Send this file to the developer.
) else (
  echo ERROR: The log file was not created.
)
echo PowerShell exit code: %RESULT%
echo.
pause
