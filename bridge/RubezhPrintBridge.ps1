$ErrorActionPreference = 'Stop'

$port = 18451
$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $bridgeDir

$kernelSource = @'
using System;
using System.IO;
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

    [DllImport("SmartComm2.dll", CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_DrawText")]
    public static extern uint DrawText(IntPtr handle, byte page, byte panel, int x, int y, string font, int fontSize, byte style, string text, IntPtr area);

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

    [DllImport("SmartComm2.dll", CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_OpenDocument")]
    public static extern uint OpenDocument(IntPtr handle, string path);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_CloseDocument")]
    public static extern uint CloseDocument(IntPtr handle);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_GetPreviewBitmap")]
    private static extern uint GetPreviewBitmap(IntPtr handle, byte page, ref IntPtr bitmap);

    public static void SaveDocumentPreview(IntPtr handle, string path) {
        IntPtr bitmap = IntPtr.Zero;
        uint result = GetPreviewBitmap(handle, 0, ref bitmap);
        if (result != 0 || bitmap == IntPtr.Zero) throw new InvalidOperationException("Cannot render native CSD preview (code " + result + "). No print was sent.");
        int header = Marshal.ReadInt32(bitmap, 0), width = Marshal.ReadInt32(bitmap, 4), height = Marshal.ReadInt32(bitmap, 8);
        int bits = (ushort)Marshal.ReadInt16(bitmap, 14), compression = Marshal.ReadInt32(bitmap, 16);
        if (header != 40 || width < 1 || width > 4096 || height == 0 || Math.Abs((long)height) > 4096 || (bits != 24 && bits != 32) || compression != 0)
            throw new InvalidOperationException("Unsupported native preview DIB; no print was sent.");
        int bytes = checked(40 + ((width * bits + 31) / 32 * 4) * Math.Abs(height));
        byte[] dib = new byte[bytes];
        Marshal.Copy(bitmap, dib, 0, bytes);
        // The pointer belongs to SmartComm; never free it.
        using (BinaryWriter output = new BinaryWriter(File.Create(path))) {
            output.Write((ushort)0x4d42); output.Write(14 + bytes); output.Write(0); output.Write(54); output.Write(dib);
        }
    }

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_GetPrinterSettings2")]
    private static extern uint GetPrinterSettings(IntPtr handle, IntPtr settings, ref int length);

    [DllImport("SmartComm2.dll", CallingConvention = CallingConvention.Winapi, EntryPoint = "SmartComm_SetPrinterSettings2")]
    private static extern uint SetPrinterSettings(IntPtr handle, IntPtr settings, int length);

    public static byte[] ReadSettings(IntPtr handle) {
        int length = 65536;
        IntPtr buffer = Marshal.AllocHGlobal(length);
        try {
            uint result = GetPrinterSettings(handle, buffer, ref length);
            if (result != 0 || length < 220 || length > 65536)
                throw new InvalidOperationException("Cannot read driver settings (code " + result + ", bytes=" + length + ").");
            byte[] settings = new byte[length];
            Marshal.Copy(buffer, settings, 0, length);
            return settings;
        } finally { Marshal.FreeHGlobal(buffer); }
    }

    public static void WriteSettings(IntPtr handle, byte[] settings) {
        IntPtr buffer = Marshal.AllocHGlobal(settings.Length);
        try {
            Marshal.Copy(settings, 0, buffer, settings.Length);
            uint result = SetPrinterSettings(handle, buffer, settings.Length);
            if (result != 0) throw new InvalidOperationException("Cannot apply driver settings (code " + result + ").");
        } finally { Marshal.FreeHGlobal(buffer); }
    }

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

Add-Type -Path (Join-Path $bridgeDir 'Smart51Profile.cs')
Add-Type -Path (Join-Path $bridgeDir 'NativeCsd.cs')
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

function Assert-PrintObjects($objects) {
    if (@($objects).Count -lt 2 -or @($objects).Count -gt 24) { throw 'Invalid native print object count.' }
    $hasColor = $false
    $hasIdentifier = $false
    foreach ($item in $objects) {
        foreach ($name in @('x','y','panel')) {
            if ($null -eq $item.$name -or $item.$name -ne [int]$item.$name) { throw 'Invalid native object coordinates.' }
        }
        if ($item.x -lt 0 -or $item.y -lt 0 -or $item.x -ge 1012 -or $item.y -ge 636) { throw 'Native object is outside the card.' }
        if ($item.kind -eq 'image') {
            if ($item.panel -notin @(1,2) -or $item.width -le 0 -or $item.height -le 0 -or $item.width -ne [int]$item.width -or $item.height -ne [int]$item.height -or $item.x+$item.width -gt 1012 -or $item.y+$item.height -gt 636) { throw 'Invalid image bounds.' }
            if ($item.panel -eq 1) {
                if ($item.x+$item.width -gt 506) { throw 'Color object exceeds the hYMCKO half-panel; no print was sent.' }
                $hasColor = $true
            }
            if (-not ([string]$item.dataUrl).StartsWith('data:image/png;base64,')) { throw 'Native objects require PNG images.' }
        } elseif ($item.kind -eq 'text') {
            if ($item.panel -ne 2 -or $item.fontSize -lt 18 -or $item.fontSize -gt 104 -or $item.fontSize -ne [int]$item.fontSize -or -not $item.text -or $item.text.Length -gt 512 -or $item.text -match '[\x00-\x1f]') { throw 'Invalid native text object.' }
            if ($item.text -match '^\d{6,12}$') { $hasIdentifier = $true }
        } else { throw 'Unknown native object type.' }
    }
    if (-not $hasColor -or -not $hasIdentifier) { throw 'Native print plan is missing color objects or the identifier.' }
}

function Invoke-CardPrint($objects) {
    if ($script:printerNeedsCheck) { throw 'Previous print was not confirmed. Check the printer display and ribbon, then restart the bridge while the printer is idle. No new print was sent.' }
    # Validate the shipped export before opening or moving the printer.
    $profile = [Smart51Profile]::Load((Join-Path $bridgeDir 'sotrudnikiHymcko.sd1'))
    Assert-PrintObjects $objects
    $originalSettings = $null
    $settingsTouched = $false
    $printWasSent = $false
    $printCompleted = $false
    $imagePaths = @{}
    $handle = [IntPtr]::Zero
    $devicePtr = [IntPtr]::Zero
    $rectPtr = [IntPtr]::Zero
    try {
        for ($i = 0; $i -lt @($objects).Count; $i++) {
            $item = $objects[$i]
            if ($item.kind -eq 'image') { $imagePaths[$i] = Convert-ToOpaqueBitmap $item.dataUrl ('rubezh-object-' + $i) $item.width $item.height }
        }
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
        $originalSettings = [SmartSdk]::ReadSettings($handle)
        Write-BridgeLog ('Original driver settings: ' + [Smart51Profile]::Describe($originalSettings))
        $jobSettings = [Smart51Profile]::Prepare($originalSettings, $profile, $ribbonType)
        # The supplied log shows the installed defaults already match. Do not
        # write/reset an identical profile around every card.
        if (-not [Smart51Profile]::Matches($jobSettings, $originalSettings)) {
            $settingsTouched = $true
            [SmartSdk]::WriteSettings($handle, $jobSettings)
        }
        [Smart51Profile]::Verify($jobSettings, [SmartSdk]::ReadSettings($handle))
        Write-BridgeLog ('Verified iDesigner job settings: ' + [Smart51Profile]::Describe($jobSettings))
        Write-BridgeLog "Print started: printer=$printer; profile=sotrudnikiHymcko.sd1; ribbonResult=$ribbonResult ribbonType=$ribbonType ribbonRemaining=$ribbonRemaining ribbonMaximum=$ribbonMaximum ribbonGrade=$ribbonGrade"

        $rect = New-Object SmartSdk+RECT
        $rectPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal([Runtime.InteropServices.Marshal]::SizeOf($rect))
        [Runtime.InteropServices.Marshal]::StructureToPtr($rect, $rectPtr, $false)
        # Native SDK objects, not a full-card YMC raster. Blank text-side pixels
        # must not enlarge the color print area beyond the half-length ribbon.
        for ($i = 0; $i -lt @($objects).Count; $i++) {
            $item = $objects[$i]
            if ($item.kind -eq 'image') {
                $imagePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($imagePaths[$i])
                try { $result = [SmartSdk]::DrawImage($handle, 0, $item.panel, $item.x, $item.y, $item.width, $item.height, $imagePtr, $rectPtr) }
                finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($imagePtr) }
            } else {
                $style = if ($item.bold) { 1 } else { 0 }
                $result = [SmartSdk]::DrawText($handle, 0, 2, $item.x, $item.y, 'Arial', (-[int]$item.fontSize), $style, $item.text, $rectPtr)
            }
            if ($result -ne 0) { throw "SmartComm could not draw native object $i (code $result)." }
            $drawn = [Runtime.InteropServices.Marshal]::PtrToStructure($rectPtr, [type][SmartSdk+RECT])
            if ($drawn.Left -lt 0 -or $drawn.Top -lt 0 -or $drawn.Right -gt 1012 -or $drawn.Bottom -gt 636 -or ($item.panel -eq 1 -and $drawn.Right -gt 506)) { throw 'SDK object bounds exceed the card or hYMCKO color area; no print was sent.' }
            Write-BridgeLog "Native object: index=$i kind=$($item.kind) panel=$($item.panel) left=$($drawn.Left) top=$($drawn.Top) right=$($drawn.Right) bottom=$($drawn.Bottom)"
        }
        $printWasSent = $true
        $script:printerNeedsCheck = $true
        $result = [SmartSdk]::Print($handle)
        if ($result -ne 0) { throw "SmartComm rejected the print job (code $result)." }
        Write-BridgeLog "Print accepted by SmartComm: result=$result ribbonType=$ribbonType ribbonRemaining=$ribbonRemaining"
        [SmartSdk]::WaitForCompletion($handle)
        $finalStatus = [SmartSdk]::ReadStatus($handle)
        if (-not [SmartSdk]::IsIdle($finalStatus)) { throw 'Printer became busy after the completion check.' }
        $printCompleted = $true
        $script:printerNeedsCheck = $false
        Write-BridgeLog ('Print completed; finalStatus=0x{0:X16}' -f $finalStatus)
        return @{ ok = $true; printer = $printer; ribbonType = $ribbonType; ribbonRemaining = $ribbonRemaining }
    }
    finally {
        if ($handle -ne [IntPtr]::Zero) {
            if ($settingsTouched) {
                try {
                    # Never change settings during motion or after a ribbon fault.
                    if ((-not $printWasSent -or $printCompleted) -and [SmartSdk]::IsIdle([SmartSdk]::ReadStatus($handle))) {
                        [SmartSdk]::WriteSettings($handle, $originalSettings)
                        [Smart51Profile]::Verify($originalSettings, [SmartSdk]::ReadSettings($handle))
                        Write-BridgeLog 'Original driver settings restored while idle.'
                    } else { Write-BridgeLog 'Settings restore skipped: printer is busy or print completion is unconfirmed.' }
                } catch { Write-BridgeLog ('Settings restore skipped or failed: ' + $_.Exception.Message) }
            }
            try { Write-BridgeLog ('Close device: result=' + [SmartSdk]::CloseDevice($handle)) }
            catch { Write-BridgeLog ('Close device failed: ' + $_.Exception.Message) }
        }
        if ($devicePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($devicePtr) }
        if ($rectPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($rectPtr) }
        foreach ($path in $imagePaths.Values) { if ($path) { Remove-Item $path -Force -ErrorAction SilentlyContinue } }
    }
}

function Convert-NativePreview([string]$path) {
    Add-Type -AssemblyName System.Drawing
    $image = [Drawing.Image]::FromFile($path)
    $stream = [IO.MemoryStream]::new()
    try {
        $image.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
        return 'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray())
    } finally { $stream.Dispose(); $image.Dispose() }
}

function Invoke-NativeCsd($payload, [bool]$previewOnly) {
    if ($script:printerNeedsCheck) { throw 'Previous print was not confirmed. Check the printer, then restart the bridge while idle. No new print was sent.' }
    if ($payload.passType -notin @('employee','mosn')) { throw 'Native CSD is for employee and MOSN passes only.' }
    if (-not ([string]$payload.photoDataUrl).StartsWith('data:image/png;base64,')) { throw 'Native source photo is required.' }
    $master = [NativeCsd]::Load((Join-Path $bridgeDir 'employee-native.csd'))
    $photo = [Convert]::FromBase64String($payload.photoDataUrl.Substring($payload.photoDataUrl.IndexOf(',') + 1))
    $values = [string[]]@($payload.surname,$payload.name,$payload.patronymic,$payload.position,$payload.employeeNumber,$payload.passNumber)
    if ($payload.passType -eq 'mosn') { $values[4] = '' }
    $document = [NativeCsd]::Prepare($master,$values,$photo,($payload.passType -eq 'mosn'))
    $csdPath = Join-Path ([IO.Path]::GetTempPath()) ('rubezh-native-' + [guid]::NewGuid().ToString('N') + '.csd')
    $previewPath = [IO.Path]::ChangeExtension($csdPath,'.bmp')
    $handle = [IntPtr]::Zero
    $devicePtr = [IntPtr]::Zero
    $opened = $false
    try {
        [IO.File]::WriteAllBytes($csdPath,$document)
        $printer = Get-SmartPrinter
        $devicePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($printer)
        [SmartSdk]::ValidateDevice($devicePtr)
        $result = [SmartSdk]::OpenDevice([ref]$handle,$devicePtr,1)
        if ($result -ne 0) { throw "Cannot open native CSD device (code $result)." }
        $status = [SmartSdk]::ReadStatus($handle)
        Write-BridgeLog ('Native CSD preflight status=0x{0:X16}' -f $status)
        if (-not [SmartSdk]::IsIdle($status)) { throw 'Printer is busy; native CSD was not sent.' }
        $type=-1; $maximum=-1; $remaining=-1; $grade=-1
        $result = [SmartSdk]::GetRibbonInfo($handle,[ref]$type,[ref]$maximum,[ref]$remaining,[ref]$grade)
        if ($result -ne 0 -or $type -ne 2 -or $remaining -le 0) { throw 'Native CSD requires an available hYMCKO ribbon.' }
        $result = [SmartSdk]::OpenDocument($handle,$csdPath)
        if ($result -ne 0) { throw "Cannot open prepared CSD (code $result). No print was sent." }
        $opened = $true
        # Do not add DrawImage/DrawText or overwrite the CSD's stored profile.
        [SmartSdk]::SaveDocumentPreview($handle,$previewPath)
        Write-BridgeLog "Native CSD loaded and rendered: previewOnly=$previewOnly ribbonType=$type ribbonRemaining=$remaining"
        if ($previewOnly) {
            return @{ok=$true;previewDataUrl=(Convert-NativePreview $previewPath)}
        }
        $script:printerNeedsCheck = $true
        $result = [SmartSdk]::Print($handle)
        if ($result -ne 0) { throw "Native CSD print failed (code $result)." }
        [SmartSdk]::WaitForCompletion($handle)
        if (-not [SmartSdk]::IsIdle([SmartSdk]::ReadStatus($handle))) { throw 'Native CSD completion is unconfirmed.' }
        $script:printerNeedsCheck = $false
        Write-BridgeLog 'Native CSD print completed.'
        return @{ok=$true;printer=$printer}
    } finally {
        if ($opened) { try { Write-BridgeLog ('Close native CSD: result=' + [SmartSdk]::CloseDocument($handle)) } catch { Write-BridgeLog $_.Exception.Message } }
        if ($handle -ne [IntPtr]::Zero) { [void][SmartSdk]::CloseDevice($handle) }
        if ($devicePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($devicePtr) }
        foreach ($file in @($csdPath,$previewPath)) { Remove-Item $file -Force -ErrorAction SilentlyContinue }
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
        try {
            if ($payload.passType -in @('employee','mosn')) { $jobs[$jobId] = Invoke-NativeCsd $payload $false }
            elseif ($payload.passType -eq 'temporary') { $jobs[$jobId] = Invoke-CardPrint $payload.objects }
            else { throw 'Update the extension: pass type is required.' }
            Write-BridgeLog ('Job completed: ' + $jobId)
        }
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
            Send-Response $stream 200 (@{ ok = $true; printer = Get-SmartPrinter; protocolVersion = 7 } | ConvertTo-Json -Compress)
        } elseif ($requestLine -match '^POST /(print|preview) ' -and $contentLength -gt 0 -and $contentLength -le 16777216) {
            $previewOnly = $Matches[1] -eq 'preview'
            $chars = New-Object char[] $contentLength
            $read = 0
            while ($read -lt $contentLength) {
                $count = $reader.Read($chars, $read, $contentLength - $read)
                if ($count -le 0) { throw 'Incomplete print request; nothing was sent to the printer.' }
                $read += $count
            }
            $payload = (-join $chars) | ConvertFrom-Json
            if ($previewOnly) { Send-Response $stream 200 (Invoke-NativeCsd $payload $true | ConvertTo-Json -Compress) }
            else { Send-Response $stream 200 (Invoke-PrintRequest $payload $jobs | ConvertTo-Json -Compress) }
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
