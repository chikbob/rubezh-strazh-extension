param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Enable', 'Disable')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'RubezhPrintBridge'
$scriptPath = Join-Path $installDir 'RubezhPrintBridge.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'Rubezh Print Bridge.lnk'

if ($Action -eq 'Disable') {
    Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
    Write-Host 'RUBEZH Print Bridge autostart is disabled.'
    exit 0
}

if (-not (Test-Path $scriptPath)) {
    throw 'Print Bridge is not installed. Run install.cmd first.'
}

$powerShell32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $powerShell32)) { $powerShell32 = 'powershell.exe' }
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShell32
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $installDir
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Host 'RUBEZH Print Bridge autostart is enabled.'
