$ErrorActionPreference = 'Stop'

$port = 18451
$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $bridgeDir

$kernelSource = @'
using System;
using System.Runtime.InteropServices;

public static class SmartSdk {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool SetDllDirectory(string path);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartCommEx_OpenDevice2")]
    public static extern uint OpenDevice(ref IntPtr handle, IntPtr device, int deviceType);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_DrawImage")]
    public static extern uint DrawImage(IntPtr handle, byte page, byte panel, int x, int y, int width, int height, IntPtr imagePath, IntPtr area);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_Print")]
    public static extern uint Print(IntPtr handle);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_CloseDevice")]
    public static extern uint CloseDevice(IntPtr handle);
}
'@

Add-Type -TypeDefinition $kernelSource -Language CSharp
[SmartSdk]::SetDllDirectory($bridgeDir) | Out-Null

function Get-SmartPrinter {
    $configured = Join-Path $bridgeDir 'printer.txt'
    if (Test-Path $configured) {
        $value = (Get-Content $configured -Raw).Trim()
        if ($value) { return $value }
    }
    $printer = Get-CimInstance Win32_Printer | Where-Object {
        $_.Name -match 'IDP|SMART[ -]?51|SMART[ -]?31|SMART[ -]?21'
    } | Select-Object -First 1
    if (-not $printer) { throw 'IDP SMART printer was not found in Windows.' }
    return [string]$printer.Name
}

function Invoke-CardPrint([string]$dataUrl) {
    if (-not $dataUrl.StartsWith('data:image/png;base64,')) {
        throw 'The request must contain a PNG image.'
    }
    $tempPath = Join-Path ([IO.Path]::GetTempPath()) ('rubezh-pass-' + [guid]::NewGuid().ToString('N') + '.png')
    [IO.File]::WriteAllBytes($tempPath, [Convert]::FromBase64String($dataUrl.Substring($dataUrl.IndexOf(',') + 1)))
    $handle = [IntPtr]::Zero
    $devicePtr = [IntPtr]::Zero
    $imagePtr = [IntPtr]::Zero
    $rectPtr = [IntPtr]::Zero
    try {
        $printer = Get-SmartPrinter
        $devicePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($printer)
        $result = [SmartSdk]::OpenDevice([ref]$handle, $devicePtr, 1)
        if ($result -ne 0) { throw "SmartComm could not open '$printer' (code $result)." }

        $imagePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($tempPath)
        $rect = New-Object SmartSdk+RECT
        $rectPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal([Runtime.InteropServices.Marshal]::SizeOf($rect))
        [Runtime.InteropServices.Marshal]::StructureToPtr($rect, $rectPtr, $false)
        # PAGE_FRONT=0, PANEL_COLOR=1; zero dimensions fill the entire card.
        $result = [SmartSdk]::DrawImage($handle, 0, 1, 0, 0, 0, 0, $imagePtr, $rectPtr)
        if ($result -ne 0) { throw "SmartComm could not draw the image (code $result)." }
        $result = [SmartSdk]::Print($handle)
        if ($result -ne 0) { throw "SmartComm rejected the print job (code $result)." }
        return @{ ok = $true; printer = $printer }
    }
    finally {
        if ($handle -ne [IntPtr]::Zero) { [SmartSdk]::CloseDevice($handle) | Out-Null }
        if ($devicePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($devicePtr) }
        if ($imagePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($imagePtr) }
        if ($rectPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($rectPtr) }
        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
    }
}

function Send-Response($stream, [int]$status, [string]$body) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $reason = if ($status -eq 200) { 'OK' } else { 'Bad Request' }
    $header = "HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bytes, 0, $bytes.Length)
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
$listener.Start()
while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
        $requestLine = $reader.ReadLine()
        $contentLength = 0
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            if ($line -match '^Content-Length:\s*(\d+)$') { $contentLength = [int]$Matches[1] }
        }
        if ($requestLine -match '^OPTIONS ') {
            Send-Response $stream 200 '{"ok":true}'
        } elseif ($requestLine -match '^GET /health ') {
            Send-Response $stream 200 (@{ ok = $true; printer = Get-SmartPrinter } | ConvertTo-Json -Compress)
        } elseif ($requestLine -match '^POST /print ' -and $contentLength -gt 0 -and $contentLength -le 16777216) {
            $chars = New-Object char[] $contentLength
            $read = 0
            while ($read -lt $contentLength) { $read += $reader.Read($chars, $read, $contentLength - $read) }
            $payload = (-join $chars) | ConvertFrom-Json
            Send-Response $stream 200 (Invoke-CardPrint $payload.imageDataUrl | ConvertTo-Json -Compress)
        } else {
            Send-Response $stream 400 '{"ok":false,"error":"Invalid request."}'
        }
    } catch {
        try { Send-Response $stream 400 (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress) } catch {}
    } finally {
        $client.Dispose()
    }
}
