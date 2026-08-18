$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'RubezhPrintBridge'

# Stop the old bridge before replacing SmartComm2.dll, because Windows locks a loaded DLL.
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*RubezhPrintBridge.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'RubezhPrintBridge.ps1') $installDir -Force
Copy-Item (Join-Path $PSScriptRoot 'autostart.ps1') $installDir -Force
Copy-Item (Join-Path $PSScriptRoot 'enable-autostart.cmd') $installDir -Force
Copy-Item (Join-Path $PSScriptRoot 'disable-autostart.cmd') $installDir -Force

$searchRoots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'IDP'),
    (Join-Path $env:ProgramFiles 'IDP'),
    (Join-Path ${env:ProgramFiles(x86)} 'SMART IDesigner'),
    (Join-Path $env:ProgramFiles 'SMART IDesigner')
) | Where-Object { $_ -and (Test-Path $_) }
$dll = Get-ChildItem $searchRoots -Filter SmartComm2.dll -Recurse -ErrorAction SilentlyContinue | Where-Object {
    $_.DirectoryName -match 'IDesigner'
} | Select-Object -First 1
if (-not $dll) { throw 'SmartComm2.dll was not found. Install SMART IDesigner first.' }
Copy-Item $dll.FullName $installDir -Force
Get-ChildItem $dll.DirectoryName -Filter '*.icm' -ErrorAction SilentlyContinue | Copy-Item -Destination $installDir -Force

$powerShell32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $powerShell32)) { $powerShell32 = 'powershell.exe' }
$scriptPath = Join-Path $installDir 'RubezhPrintBridge.ps1'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
& (Join-Path $installDir 'autostart.ps1') -Action Enable

$bridgeProcess = Start-Process -FilePath $powerShell32 -ArgumentList $arguments -WorkingDirectory $installDir -WindowStyle Hidden -PassThru
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($bridgeProcess.HasExited) { throw "Print Bridge stopped during startup (exit code $($bridgeProcess.ExitCode))." }
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', 18451, $null, $null)
        if ($pending.AsyncWaitHandle.WaitOne(200)) {
            $client.EndConnect($pending)
            $ready = $true
            break
        }
    } catch {} finally { $client.Dispose() }
}
if (-not $ready) { throw 'Print Bridge did not open local port 18451.' }
Write-Host 'RUBEZH Print Bridge installed and started successfully.'
