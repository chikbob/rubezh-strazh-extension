param([Parameter(Mandatory=$true)][string]$ExtensionId)
$ErrorActionPreference='Stop';$target=Join-Path $env:ProgramFiles 'RubezhPassPrinter';New-Item -ItemType Directory -Force $target|Out-Null
Copy-Item "$PSScriptRoot\..\native-host\publish\RubezhPrintBridge.exe" $target -Force
$manifest=Get-Content "$PSScriptRoot\..\native-host\ru.fmba.rubezh_print_bridge.json" -Raw|ConvertFrom-Json;$manifest.path=(Join-Path $target 'RubezhPrintBridge.exe');$manifest.allowed_origins=@("chrome-extension://$ExtensionId/");$manifestPath=Join-Path $target 'ru.fmba.rubezh_print_bridge.json';$manifest|ConvertTo-Json|Set-Content $manifestPath -Encoding UTF8
$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\ru.fmba.rubezh_print_bridge';New-Item -Path $key -Force|Out-Null;Set-Item -Path $key -Value $manifestPath
$yandex='HKCU:\Software\Yandex\YandexBrowser\NativeMessagingHosts\ru.fmba.rubezh_print_bridge';New-Item -Path $yandex -Force|Out-Null;Set-Item -Path $yandex -Value $manifestPath
Write-Host "Print Bridge установлен. Extension ID: $ExtensionId"
