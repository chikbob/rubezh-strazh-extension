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

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartCommEx_GetDeviceList2")]
    private static extern uint GetDeviceList(IntPtr devices, int option);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_DrawImage")]
    public static extern uint DrawImage(IntPtr handle, byte page, byte panel, int x, int y, int width, int height, IntPtr imagePath, IntPtr area);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_GetPrinterSettings2")]
    private static extern uint GetPrinterSettings2(IntPtr handle, IntPtr settings, ref int length);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_SetPrinterSettings2")]
    private static extern uint SetPrinterSettings2(IntPtr handle, IntPtr settings, int length);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_Print")]
    public static extern uint Print(IntPtr handle);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_CloseDevice")]
    public static extern uint CloseDevice(IntPtr handle);

    public static void SetJobColorDensity(IntPtr handle, int density) {
        // SMART51_DEVMODE = DEVMODEW (220) + reserved (564) + OEM header (12).
        // dwASMain is the first DWORD after that header (offset 796).
        const int settingsCapacity = 16384;
        const int mainDensityOffset = 796;
        IntPtr settings = Marshal.AllocHGlobal(settingsCapacity);
        try {
            int length = settingsCapacity;
            uint result = GetPrinterSettings2(handle, settings, ref length);
            if (result != 0) throw new InvalidOperationException("SmartComm could not read SMART-51 print settings (code " + result + ").");
            if (length <= mainDensityOffset + 4) throw new InvalidOperationException("SmartComm returned an unsupported SMART-51 settings block (" + length + " bytes).");
            Marshal.WriteInt32(settings, mainDensityOffset, Math.Max(-100, Math.Min(100, density)));
            result = SetPrinterSettings2(handle, settings, length);
            if (result != 0) throw new InvalidOperationException("SmartComm could not apply color density (code " + result + ").");
        } finally {
            Marshal.FreeHGlobal(settings);
        }
    }

    public static string GetFirstDeviceDescription() {
        const int maxDevices = 32;
        const int itemSize = 1028;
        IntPtr buffer = Marshal.AllocHGlobal(4 + maxDevices * itemSize);
        try {
            for (int offset = 0; offset < 4 + maxDevices * itemSize; offset += 4) Marshal.WriteInt32(buffer, offset, 0);
            uint result = GetDeviceList(buffer, 3);
            if (result != 0) throw new InvalidOperationException("SmartComm device scan failed (code " + result + ").");
            int count = Marshal.ReadInt32(buffer);
            if (count < 1) throw new InvalidOperationException("SmartComm did not find a connected IDP SMART device.");
            IntPtr firstItem = IntPtr.Add(buffer, 4);
            string description = Marshal.PtrToStringUni(IntPtr.Add(firstItem, 512), 256).TrimEnd('\0');
            if (String.IsNullOrWhiteSpace(description)) description = Marshal.PtrToStringUni(firstItem, 128).TrimEnd('\0');
            return description;
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
    }
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
    return [SmartSdk]::GetFirstDeviceDescription()
}

function Get-ColorDensity {
    $configured = Join-Path $bridgeDir 'color-density.txt'
    if (Test-Path $configured) {
        $value = 0
        if (-not [int]::TryParse((Get-Content $configured -Raw).Trim(), [ref]$value)) {
            throw 'color-density.txt must contain an integer from -100 to 100.'
        }
        if ($value -lt -100 -or $value -gt 100) { throw 'color-density.txt must be from -100 to 100.' }
        return $value
    }
    return 80
}

function Convert-ToOpaqueBitmap([string]$dataUrl, [string]$name) {
    if (-not $dataUrl.StartsWith('data:image/png;base64,')) { throw 'The request must contain PNG panel images.' }
    Add-Type -AssemblyName System.Drawing
    $pngPath = Join-Path ([IO.Path]::GetTempPath()) ($name + '-' + [guid]::NewGuid().ToString('N') + '.png')
    $bmpPath = [IO.Path]::ChangeExtension($pngPath, '.bmp')
    [IO.File]::WriteAllBytes($pngPath, [Convert]::FromBase64String($dataUrl.Substring($dataUrl.IndexOf(',') + 1)))
    $source = [Drawing.Image]::FromFile($pngPath)
    try {
        $bitmap = [Drawing.Bitmap]::new($source.Width, $source.Height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $graphics = [Drawing.Graphics]::FromImage($bitmap)
            try { $graphics.Clear([Drawing.Color]::White); $graphics.DrawImageUnscaled($source, 0, 0) } finally { $graphics.Dispose() }
            $bitmap.SetResolution(300, 300)
            $bitmap.Save($bmpPath, [Drawing.Imaging.ImageFormat]::Bmp)
        } finally { $bitmap.Dispose() }
    } finally { $source.Dispose(); Remove-Item $pngPath -Force -ErrorAction SilentlyContinue }
    return $bmpPath
}

function Invoke-CardPrint([string]$colorDataUrl, [string]$blackDataUrl) {
    $colorPath = Convert-ToOpaqueBitmap $colorDataUrl 'rubezh-color'
    $blackPath = Convert-ToOpaqueBitmap $blackDataUrl 'rubezh-black'
    $handle = [IntPtr]::Zero
    $devicePtr = [IntPtr]::Zero
    $colorPtr = [IntPtr]::Zero
    $blackPtr = [IntPtr]::Zero
    $rectPtr = [IntPtr]::Zero
    try {
        $printer = Get-SmartPrinter
        $devicePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($printer)
        $result = [SmartSdk]::OpenDevice([ref]$handle, $devicePtr, 1)
        if ($result -ne 0) { throw "SmartComm could not open '$printer' (code $result)." }
        $colorDensity = Get-ColorDensity
        [SmartSdk]::SetJobColorDensity($handle, $colorDensity)

        $colorPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($colorPath)
        $blackPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($blackPath)
        $rect = New-Object SmartSdk+RECT
        $rectPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal([Runtime.InteropServices.Marshal]::SizeOf($rect))
        [Runtime.InteropServices.Marshal]::StructureToPtr($rect, $rectPtr, $false)
        # PAGE_FRONT=0, PANEL_COLOR=1; zero dimensions fill the entire card.
        $result = [SmartSdk]::DrawImage($handle, 0, 1, 0, 0, 0, 0, $colorPtr, $rectPtr)
        if ($result -ne 0) { throw "SmartComm could not draw the color panel (code $result)." }
        $result = [SmartSdk]::DrawImage($handle, 0, 2, 0, 0, 0, 0, $blackPtr, $rectPtr)
        if ($result -ne 0) { throw "SmartComm could not draw the black panel (code $result)." }
        $result = [SmartSdk]::Print($handle)
        if ($result -ne 0) { throw "SmartComm rejected the print job (code $result)." }
        return @{ ok = $true; printer = $printer; colorDensity = $colorDensity }
    }
    finally {
        if ($handle -ne [IntPtr]::Zero) { [SmartSdk]::CloseDevice($handle) | Out-Null }
        if ($devicePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($devicePtr) }
        if ($colorPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($colorPtr) }
        if ($blackPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($blackPtr) }
        if ($rectPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($rectPtr) }
        Remove-Item $colorPath,$blackPath -Force -ErrorAction SilentlyContinue
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
            Send-Response $stream 200 (Invoke-CardPrint $payload.colorImageDataUrl $payload.blackImageDataUrl | ConvertTo-Json -Compress)
        } else {
            Send-Response $stream 400 '{"ok":false,"error":"Invalid request."}'
        }
    } catch {
        try { Send-Response $stream 400 (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress) } catch {}
    } finally {
        $client.Dispose()
    }
}
