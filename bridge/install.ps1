$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'RubezhPrintBridge'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'Rubezh Print Bridge.lnk'

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'RubezhPrintBridge.ps1') $installDir -Force

$searchRoots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'IDP'),
    (Join-Path $env:ProgramFiles 'IDP'),
    (Join-Path ${env:ProgramFiles(x86)} 'SMART IDesigner'),
    (Join-Path $env:ProgramFiles 'SMART IDesigner')
) | Where-Object { $_ -and (Test-Path $_) }
$dll = Get-ChildItem $searchRoots -Filter SmartComm2.dll -Recurse -ErrorAction SilentlyContinue | Where-Object {
    $_.DirectoryName -match 'IDesigner'
} | Select-Object -First 1
if (-not $dll) { throw 'SmartComm2.dll не найден. Сначала установите SMART IDesigner.' }
Copy-Item $dll.FullName $installDir -Force
Get-ChildItem $dll.DirectoryName -Filter '*.icm' -ErrorAction SilentlyContinue | Copy-Item -Destination $installDir -Force

$powerShell32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $powerShell32)) { $powerShell32 = 'powershell.exe' }
$scriptPath = Join-Path $installDir 'RubezhPrintBridge.ps1'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShell32
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7
$shortcut.Save()

Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*RubezhPrintBridge.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath $powerShell32 -ArgumentList $arguments -WorkingDirectory $installDir -WindowStyle Hidden
Write-Host 'RUBEZH Print Bridge установлен и запущен.'
