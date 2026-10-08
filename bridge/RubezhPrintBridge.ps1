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

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_GetRibbonInfo")]
    public static extern uint GetRibbonInfo(IntPtr handle, ref int type, ref int maximum, ref int remaining, ref int grade);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_GetStatus")]
    private static extern uint GetStatus(IntPtr handle, IntPtr status);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_GetDeviceInfo2")]
    private static extern uint GetDeviceInfo2(IntPtr info, IntPtr device, int deviceType);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_Print")]
    public static extern uint Print(IntPtr handle);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_CloseDevice")]
    public static extern uint CloseDevice(IntPtr handle);

    public static void ValidateDevice(IntPtr device) {
        IntPtr info = Marshal.AllocHGlobal(4096);
        try {
            uint result = GetDeviceInfo2(info, device, 1);
            if (result != 0) throw new InvalidOperationException("Cannot identify the printer (code " + result + ").");
            // SMART_PRINTER_STANDARD: WCHAR name[128], id[64], dev[64],
            // int dev_type, int pid. Read-only model check, never patch DEVMODE.
            int group = Marshal.ReadInt32(info, 516) >> 4;
            if (group == 0x381 || group == 0x370 || (group >= 0x385 && group <= 0x388))
                throw new InvalidOperationException("This bridge requires the SMART-21/31/51 SDK device family.");
        } finally { Marshal.FreeHGlobal(info); }
    }

    public static ulong ReadStatus(IntPtr handle) {
        IntPtr buffer = Marshal.AllocHGlobal(16);
        try {
            uint result = GetStatus(handle, buffer);
            if (result != 0) throw new InvalidOperationException("Cannot read printer status (code " + result + ").");
            return unchecked((ulong)Marshal.ReadInt64(buffer));
        } finally { Marshal.FreeHGlobal(buffer); }
    }

    // SMART-51 status masks from the supplied IDP SDK header. Require drained
    // print buffer, stopped motors and no error/cover/lock/SBS/test state.
    public static bool IsIdle(ulong status) {
        if ((status & 0xFFFFFFFF00000000UL) != 0 || (status & 0xD8020000UL) != 0)
            throw new InvalidOperationException("Printer is not ready; status=0x" + status.ToString("X16") + ". Check the printer display. Do not resend a partially printed card.");
        return (status & 0x206007FFUL) == 0;
    }

    public static void WaitForIdle(Func<ulong> read, Action pause, int attempts, int stableSamples) {
        int stable = 0;
        for (int i = 0; i < attempts; i++) {
            stable = IsIdle(read()) ? stable + 1 : 0;
            if (stable >= stableSamples) return;
            pause();
        }
        throw new TimeoutException("Printer did not finish within the timeout. Check the printer before starting another job.");
    }

    public static void WaitForCompletion(IntPtr handle) {
        WaitForIdle(() => ReadStatus(handle), () => System.Threading.Thread.Sleep(200), 900, 10);
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

function Write-BridgeLog([string]$message) {
    $line = ('{0:u} {1}' -f (Get-Date), $message)
    Add-Content -Path (Join-Path $bridgeDir 'bridge.log') -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

function Convert-ToOpaqueBitmap([string]$dataUrl, [string]$name, [int]$width, [int]$height) {
    if (-not $dataUrl.StartsWith('data:image/png;base64,')) { throw 'The request must contain PNG panel images.' }
    Add-Type -AssemblyName System.Drawing
    $pngPath = Join-Path ([IO.Path]::GetTempPath()) ($name + '-' + [guid]::NewGuid().ToString('N') + '.png')
    $bmpPath = [IO.Path]::ChangeExtension($pngPath, '.bmp')
    [IO.File]::WriteAllBytes($pngPath, [Convert]::FromBase64String($dataUrl.Substring($dataUrl.IndexOf(',') + 1)))
    $source = $null
    try {
        $source = [Drawing.Image]::FromFile($pngPath)
        if ($source.Width -ne $width -or $source.Height -ne $height) { throw "Invalid $name panel size. Update the extension and bridge together." }
        $bitmap = [Drawing.Bitmap]::new($source.Width, $source.Height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $graphics = [Drawing.Graphics]::FromImage($bitmap)
            try { $graphics.Clear([Drawing.Color]::White); $graphics.DrawImageUnscaled($source, 0, 0) } finally { $graphics.Dispose() }
            $bitmap.SetResolution(300, 300)
            $bitmap.Save($bmpPath, [Drawing.Imaging.ImageFormat]::Bmp)
            Write-BridgeLog "Panel prepared: name=$name size=$width x $height dpi=300 format=24bppRgb"
        } finally { $bitmap.Dispose() }
    } catch {
        Remove-Item $bmpPath -Force -ErrorAction SilentlyContinue
        throw
    } finally { if ($source) { $source.Dispose() }; Remove-Item $pngPath -Force -ErrorAction SilentlyContinue }
    return $bmpPath
}

function Invoke-CardPrint([string]$colorDataUrl, [string]$blackDataUrl) {
    $colorPath = $null
    $blackPath = $null
    $handle = [IntPtr]::Zero
    $devicePtr = [IntPtr]::Zero
    $colorPtr = [IntPtr]::Zero
    $blackPtr = [IntPtr]::Zero
    $rectPtr = [IntPtr]::Zero
    try {
        $colorPath = Convert-ToOpaqueBitmap $colorDataUrl 'rubezh-color' 1012 638
        $blackPath = Convert-ToOpaqueBitmap $blackDataUrl 'rubezh-black' 1012 638
        $printer = Get-SmartPrinter
        $devicePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($printer)
        [SmartSdk]::ValidateDevice($devicePtr)
        $result = [SmartSdk]::OpenDevice([ref]$handle, $devicePtr, 1)
        if ($result -ne 0) { throw "SmartComm could not open '$printer' (code $result)." }
        $initialStatus = [SmartSdk]::ReadStatus($handle)
        Write-BridgeLog ('Preflight status=0x{0:X16}' -f $initialStatus)
        if (-not [SmartSdk]::IsIdle($initialStatus)) { throw 'Printer is busy or has pending print data. Wait for the previous job to finish.' }
        $ribbonType = -1
        $ribbonMaximum = -1
        $ribbonRemaining = -1
        $ribbonGrade = -1
        $ribbonResult = [SmartSdk]::GetRibbonInfo($handle, [ref]$ribbonType, [ref]$ribbonMaximum, [ref]$ribbonRemaining, [ref]$ribbonGrade)
        if ($ribbonResult -ne 0) { throw "Cannot check ribbon (code $ribbonResult)." }
        if ($ribbonRemaining -le 0) { throw 'The ribbon is empty.' }
        Write-BridgeLog "Print started: printer=$printer; settings=unchanged; ribbonResult=$ribbonResult ribbonType=$ribbonType ribbonRemaining=$ribbonRemaining ribbonMaximum=$ribbonMaximum ribbonGrade=$ribbonGrade"

        $colorPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($colorPath)
        $blackPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($blackPath)
        $rect = New-Object SmartSdk+RECT
        $rectPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal([Runtime.InteropServices.Marshal]::SizeOf($rect))
        [Runtime.InteropServices.Marshal]::StructureToPtr($rect, $rectPtr, $false)
        # Both inputs cover the full card with an explicit white background.
        # The driver/profile handles hYMCKO; do not crop the SDK color surface.
        $result = [SmartSdk]::DrawImage($handle, 0, 1, 0, 0, 1012, 638, $colorPtr, $rectPtr)
        if ($result -ne 0) { throw "SmartComm could not draw the color panel (code $result)." }
        $drawn = [Runtime.InteropServices.Marshal]::PtrToStructure($rectPtr, [type][SmartSdk+RECT])
        Write-BridgeLog "Color drawing: left=$($drawn.Left) top=$($drawn.Top) right=$($drawn.Right) bottom=$($drawn.Bottom)"
        $result = [SmartSdk]::DrawImage($handle, 0, 2, 0, 0, 1012, 638, $blackPtr, $rectPtr)
        if ($result -ne 0) { throw "SmartComm could not draw the black panel (code $result)." }
        $drawn = [Runtime.InteropServices.Marshal]::PtrToStructure($rectPtr, [type][SmartSdk+RECT])
        Write-BridgeLog "Black drawing: left=$($drawn.Left) top=$($drawn.Top) right=$($drawn.Right) bottom=$($drawn.Bottom)"
        $result = [SmartSdk]::Print($handle)
        if ($result -ne 0) { throw "SmartComm rejected the print job (code $result)." }
        Write-BridgeLog "Print accepted by SmartComm: result=$result ribbonType=$ribbonType ribbonRemaining=$ribbonRemaining"
        [SmartSdk]::WaitForCompletion($handle)
        Write-BridgeLog ('Print completed; finalStatus=0x{0:X16}' -f [SmartSdk]::ReadStatus($handle))
        return @{ ok = $true; printer = $printer; ribbonType = $ribbonType; ribbonRemaining = $ribbonRemaining }
    }
    finally {
        if ($handle -ne [IntPtr]::Zero) {
            try { Write-BridgeLog ('Close device: result=' + [SmartSdk]::CloseDevice($handle)) }
            catch { Write-BridgeLog ('Close device failed: ' + $_.Exception.Message) }
        }
        if ($devicePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($devicePtr) }
        if ($colorPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($colorPtr) }
        if ($blackPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($blackPtr) }
        if ($rectPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($rectPtr) }
        foreach ($path in @($colorPath,$blackPath)) { if ($path) { Remove-Item $path -Force -ErrorAction SilentlyContinue } }
    }
}

function Invoke-PrintRequest($payload, [hashtable]$jobs) {
    $jobId = [string]$payload.jobId
    if ($jobId -notmatch '^printPayload-[a-f0-9-]{36}$') { throw 'Update the extension: a unique print job ID is required.' }
    if (-not $jobs.ContainsKey($jobId)) {
        if ($jobs.Count -ge 5000) { throw 'Restart the bridge while the printer is idle to clear the completed job history.' }
        # Reserve before touching the device: a lost HTTP response must
        # never cause the same card to consume a second set of panels.
        $jobs[$jobId] = @{ ok = $false; error = 'Print completion is unknown. Check the printer before repeating.' }
        Write-BridgeLog ('Job started: ' + $jobId)
        try { $jobs[$jobId] = Invoke-CardPrint $payload.colorImageDataUrl $payload.blackImageDataUrl; Write-BridgeLog ('Job completed: ' + $jobId) }
        catch { $jobs[$jobId] = @{ ok = $false; error = $_.Exception.Message }; Write-BridgeLog ('Job ' + $jobId + ' failed: ' + $_.Exception.ToString()) }
    } else { Write-BridgeLog ('Duplicate job ignored: ' + $jobId) }
    return $jobs[$jobId]
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
$jobs = @{}
while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $stream.ReadTimeout = 10000
        $stream.WriteTimeout = 10000
        $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
        $requestLine = $reader.ReadLine()
        if (-not $requestLine) { continue }
        $contentLength = 0
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            if ($line -match '^Content-Length:\s*(\d+)$') { $contentLength = [int]$Matches[1] }
        }
        if ($requestLine -match '^OPTIONS ') {
            Send-Response $stream 200 '{"ok":true}'
        } elseif ($requestLine -match '^GET /health ') {
            Send-Response $stream 200 (@{ ok = $true; printer = Get-SmartPrinter; protocolVersion = 3 } | ConvertTo-Json -Compress)
        } elseif ($requestLine -match '^POST /print ' -and $contentLength -gt 0 -and $contentLength -le 16777216) {
            $chars = New-Object char[] $contentLength
            $read = 0
            while ($read -lt $contentLength) {
                $count = $reader.Read($chars, $read, $contentLength - $read)
                if ($count -le 0) { throw 'Incomplete print request; nothing was sent to the printer.' }
                $read += $count
            }
            $payload = (-join $chars) | ConvertFrom-Json
            Send-Response $stream 200 (Invoke-PrintRequest $payload $jobs | ConvertTo-Json -Compress)
        } else {
            Send-Response $stream 400 '{"ok":false,"error":"Invalid request."}'
        }
    } catch {
        Write-BridgeLog ('ERROR: ' + $_.Exception.ToString())
        try { Send-Response $stream 400 (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress) } catch {}
    } finally {
        $client.Dispose()
    }
}
