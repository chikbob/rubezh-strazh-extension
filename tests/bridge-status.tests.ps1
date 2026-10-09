$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
foreach ($file in @('bridge/RubezhPrintBridge.ps1','bridge/install.ps1','bridge/autostart.ps1')) {
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file), [ref]$null, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
$source = Get-Content (Join-Path $root 'bridge/RubezhPrintBridge.ps1') -Raw
$kernel = [regex]::Match($source, "(?s)\`$kernelSource = @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if (-not $kernel) { throw 'SDK wrapper source was not found.' }
Add-Type -Path (Join-Path $root 'bridge/Smart51Profile.cs')
Add-Type -Path (Join-Path $root 'bridge/NativeCsd.cs')
$bridgeDir = Join-Path $root 'bridge'

# Execute the real wait/state logic with no DLL or physical printer attached.
$testSource = @'
public static class BridgeStatusTests {
    static int checks;
    static void Check(bool value, string name) {
        if (!value) throw new Exception(name);
        checks++;
    }
    static void MustFail(Action run, string name) {
        bool failed = false;
        try { run(); } catch (InvalidOperationException) { failed = true; }
        Check(failed, name);
    }
    public static int Run() {
        Check(SmartSdk.IsIdle(0x800UL), "Idle hopper is ready");
        foreach (ulong status in new ulong[] { 1, 8, 0x40, 0x80, 0x200, 0x400, 0x200000, 0x400000 })
            Check(!SmartSdk.IsIdle(status), "Motion/data is not completion: " + status);
        foreach (ulong status in new ulong[] { 0x20000, 0x8000000, 0x10000000, 0x40000000, 0x80000000, 0x4000000000, 0x100000000000, 0x100000000000000 })
            MustFail(() => SmartSdk.IsIdle(status), "Fault/lock/mode blocks printing: " + status);
        // Color -> transient idle -> K -> eject -> stable idle. Must not
        // release the SDK handle during the gap between YMC and resin black.
        ulong[] sequence = { 0x400000, 0x200, 0, 0x40, 0x200, 8, 0, 0, 0 };
        int cursor = 0;
        SmartSdk.WaitForIdle(() => sequence[cursor++], () => {}, 9, 3);
        Check(cursor == 9, "Wait through black panel and ejection");
        bool timedOut = false;
        try { SmartSdk.WaitForIdle(() => 0x200UL, () => {}, 5, 3); }
        catch (TimeoutException) { timedOut = true; }
        Check(timedOut, "Timeout is not success");
        MustFail(() => SmartSdk.WaitForIdle(() => 0x4000000000UL, () => {}, 5, 3), "Ribbon search failure is not success");
        for (int job = 0; job < 100; job++) {
            cursor = 0;
            SmartSdk.WaitForIdle(() => sequence[cursor++], () => {}, 9, 3);
            Check(cursor == 9, "Repeated job wait has no stale state");
        }
        return checks;
    }
}
public static class FakeSmartSdk {
    public struct RECT { public int Left, Top, Right, Bottom; }
    public static int Opened, Closed, Printed, Waited, DocumentsOpened, DocumentsClosed, Previews;
    public static string FailAt = "";
    public static byte[] Settings;
    public static int SettingsWritten;
    public static ulong Status;
    public static bool CurrentHandlePreviewed;
    public static void ValidateDevice(IntPtr device) {}
    public static uint OpenDevice(ref IntPtr handle, IntPtr device, int type) { Opened++; handle = new IntPtr(Opened); CurrentHandlePreviewed=false; return 0; }
    public static ulong ReadStatus(IntPtr handle) { return Status; }
    public static bool IsIdle(ulong value) { return SmartSdk.IsIdle(value); }
    public static uint GetRibbonInfo(IntPtr handle, ref int type, ref int maximum, ref int remaining, ref int grade) {
        type = FailAt == "ribbonType" ? 3 : 2; maximum = 350; remaining = 310; grade = 1; return 0;
    }
    public static byte[] ReadSettings(IntPtr handle) {
        byte[] result = (byte[])Settings.Clone();
        if (FailAt == "verify" && SettingsWritten > 0) result[796] = 99;
        if (FailAt == "nativeProfile") result[852] = 1; // BPResinOnly differs from the verified export.
        return result;
    }
    public static void WriteSettings(IntPtr handle, byte[] settings) { SettingsWritten++; Settings = (byte[])settings.Clone(); }
    public static uint DrawImage(IntPtr handle, byte page, byte panel, int x, int y, int width, int height, IntPtr path, IntPtr area) {
        if (panel == 1 && x + width > 506) throw new Exception("Color bounds mismatch");
        if (x + width > 1012 || y + height > 636) throw new Exception("Image outside card");
        Marshal.StructureToPtr(new RECT { Left = x, Top = y, Right = x + width, Bottom = y + height }, area, false);
        if (FailAt == "bounds" && panel == 1) Marshal.StructureToPtr(new RECT { Left = x, Top = y, Right = 507, Bottom = y + height }, area, false);
        return FailAt == "black" && panel == 2 ? 1u : 0u;
    }
    public static uint DrawText(IntPtr handle, byte page, byte panel, int x, int y, string font, int size, byte style, string text, IntPtr area) {
        if (font != "Arial" || size >= 0 || panel != 2) throw new Exception("Native font parameters mismatch");
        Marshal.StructureToPtr(new RECT { Left = x, Top = y, Right = x + 100, Bottom = y - size }, area, false);
        return 0;
    }
    public static uint Print(IntPtr handle) {
        if (CurrentHandlePreviewed) throw new Exception("Printing handle was contaminated by preview rendering");
        Printed++;
        if (FailAt == "printFault") { Status = 0x4000000000UL; return 0x8000001Bu; } return 0;
    }
    public static void WaitForCompletion(IntPtr handle) {
        Waited++;
        if (FailAt == "wait") Status = 0x4000000000UL;
        SmartSdk.WaitForIdle(() => Status, () => {}, 10, 3);
    }
    public static uint CloseDevice(IntPtr handle) { Closed++; return 0; }
    public static uint OpenDocument(IntPtr handle, string path) {
        if (!System.IO.File.Exists(path)) throw new Exception("Prepared CSD missing");
        DocumentsOpened++; return FailAt == "document" ? 1u : 0u;
    }
    public static uint CloseDocument(IntPtr handle) { DocumentsClosed++; return 0; }
    public static void SaveDocumentPreview(IntPtr handle, string path) {
        Previews++;
        CurrentHandlePreviewed=true;
        if (FailAt == "preview") throw new Exception("Native preview failed");
        System.IO.File.WriteAllBytes(path, new byte[]{1,2,3});
    }
}
'@
Add-Type -TypeDefinition ($kernel + "`n" + $testSource) -Language CSharp
Write-Host ('Bridge status/sequence checks passed: ' + [BridgeStatusTests]::Run())

# A real exported profile and a synthetic native DEVMODE. Never load the DLL.
$profile = [Smart51Profile]::Load((Join-Path $bridgeDir 'sotrudnikiHymcko.sd1'))
$settings = New-Object byte[] (784 + 12976)
$settings[68] = 220
[Array]::Copy($profile, 8, $settings, 784, 12976)
[FakeSmartSdk]::Settings = $settings
# Verify identical settings do not trigger any native setting writes.
[FakeSmartSdk]::SettingsWritten = 0

# Exercise the actual PowerShell job/cache/finally blocks with a fake native
# device; no ribbon movement or print command is sent to any real printer.
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$null)
foreach ($name in @('Assert-PrintObjects','Invoke-CardPrint','Assert-NativeJobProfile','Invoke-NativeCsd','Invoke-PrintRequest')) {
    $function = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    Invoke-Expression ($function.Extent.Text.Replace('[SmartSdk]', '[FakeSmartSdk]').Replace('SmartSdk+RECT', 'FakeSmartSdk+RECT'))
}
function Get-SmartPrinter { return 'Fake SMART-51' }
function Write-BridgeLog([string]$message) {}
function Convert-NativePreview([string]$path) {
    Assert-Bridge (Test-Path $path) 'Native preview file missing'
    return 'data:image/png;base64,U0RL'
}
$createdFiles = [Collections.Generic.List[string]]::new()
function Convert-ToOpaqueBitmap([string]$data, [string]$name, [int]$width, [int]$height) {
    $path = [IO.Path]::GetTempFileName()
    $createdFiles.Add($path)
    return $path
}
function Assert-Bridge([bool]$value, [string]$name) { if (-not $value) { throw $name } }

Assert-Bridge ([Runtime.InteropServices.Marshal]::OffsetOf([Smart51Profile+PrintingSettings], 'Ribbon').ToInt32() -eq 4288) 'SDK ribbon layout changed'
Assert-Bridge ([Runtime.InteropServices.Marshal]::OffsetOf([Smart51Profile+PrintingSettings], 'Resolution').ToInt32() -eq 112) 'SDK resolution layout changed'
$original = [byte[]]$settings.Clone()
# Keep opaque driver data unchanged, including encoding/calibration/reserved data.
$original[0] = 42
$original[784 + 116] = 61
$original[784 + 4400] = 77
$original[796] = 30
$prepared = [Smart51Profile]::Prepare($original, $profile, 2)
Assert-Bridge ($prepared[796] -eq 0) 'Saved zero density was not applied'
Assert-Bridge ($original[796] -eq 30) 'Prepare mutated the original settings'
Assert-Bridge ($prepared[0] -eq 42 -and $prepared[784 + 116] -eq 61 -and $prepared[784 + 4400] -eq 77) 'Opaque native fields were overwritten'
$allowed = [Collections.Generic.HashSet[int]]::new()
foreach ($field in [Smart51Profile]::Fields) {
    $offset = 784 + [Runtime.InteropServices.Marshal]::OffsetOf([Smart51Profile+PrintingSettings], $field).ToInt32()
    0..3 | ForEach-Object { [void]$allowed.Add($offset + $_) }
}
for ($i = 0; $i -lt $original.Length; $i++) {
    if (-not $allowed.Contains($i)) { Assert-Bridge ($prepared[$i] -eq $original[$i]) 'Non-print field changed' }
}
foreach ($bad in @('signature','size','version','dmSize','short','ribbon','readback')) {
    $invalid = [byte[]]$settings.Clone()
    switch ($bad) {
        'signature' { $invalid[788] = 0 }
        'size' { $invalid[784] = 0 }
        'version' { $invalid[792] = 2 }
        'dmSize' { $invalid[68] = 0 }
        'short' { $invalid = New-Object byte[] 200 }
        'readback' { $invalid[796] = 17 }
    }
    $failed = $false
    try {
        if ($bad -eq 'readback') { [Smart51Profile]::Verify($settings, $invalid) }
        else { [void][Smart51Profile]::Prepare($invalid, $profile, $(if ($bad -eq 'ribbon') { 3 } else { 2 })) }
    } catch { $failed = $true }
    Assert-Bridge $failed ('Unsafe profile was accepted: ' + $bad)
}
$corruptPath = [IO.Path]::GetTempFileName()
try {
    $corrupt = [byte[]]$profile.Clone(); $corrupt[20] = 30
    [IO.File]::WriteAllBytes($corruptPath, $corrupt)
    $failed = $false
    try { [void][Smart51Profile]::Load($corruptPath) } catch { $failed = $true }
    Assert-Bridge $failed 'Tampered density profile was accepted'
} finally { Remove-Item $corruptPath }
Write-Host 'Profile tests passed: real export, named SDK layout, full preservation, mismatch/readback rejection and integrity check.'
$objects = @(
    @{ kind='image'; panel=1; x=0; y=84; width=440; height=552; dataUrl='data:image/png;base64,AA==' },
    @{ kind='image'; panel=1; x=33; y=117; width=375; height=482; dataUrl='data:image/png;base64,AA==' },
    @{ kind='image'; panel=2; x=800; y=410; width=205; height=226; dataUrl='data:image/png;base64,AA==' },
    @{ kind='text'; panel=2; x=456; y=560; fontSize=46; bold=$false; text='389369658' }
)
$script:printerNeedsCheck = $false
$badObjects = @($objects | ForEach-Object { $_.Clone() })
$badObjects[0].width = 1012
$beforeOpen = [FakeSmartSdk]::Opened
$badPayload = @{ jobId='printPayload-'+[guid]::NewGuid(); passType='temporary'; objects=$badObjects }
$validationJobs = @{}
Assert-Bridge (-not (Invoke-PrintRequest $badPayload $validationJobs).ok) 'Full-card color image was accepted'
Assert-Bridge ([FakeSmartSdk]::Opened -eq $beforeOpen) 'Invalid object plan opened the printer'
$jobs = @{}
for ($i = 0; $i -lt 100; $i++) {
    # Most jobs use unchanged defaults. The last job exercises apply + restore.
    if ($i -eq 99) { [FakeSmartSdk]::Settings[796] = 30 }
    $payload = @{ jobId = 'printPayload-' + [guid]::NewGuid().ToString(); passType='temporary'; objects=$objects }
    Assert-Bridge (Invoke-PrintRequest $payload $jobs).ok 'A full job must succeed'
    Assert-Bridge (Invoke-PrintRequest $payload $jobs).ok 'Duplicate returns original result'
}
Assert-Bridge ([FakeSmartSdk]::SettingsWritten -eq 2) 'Identical profiles must not be rewritten on every card'
Assert-Bridge ([FakeSmartSdk]::Printed -eq 100) '200 HTTP requests must print only 100 cards'
Assert-Bridge ([FakeSmartSdk]::Waited -eq 100) 'Every accepted print waits for completion'
Assert-Bridge ([FakeSmartSdk]::Opened -eq [FakeSmartSdk]::Closed) 'Handles must be closed after success'
foreach ($failure in @('black','wait','busy','verify','ribbonType','printFault','bounds')) {
    $script:printerNeedsCheck = $false
    [FakeSmartSdk]::FailAt = $failure
    [FakeSmartSdk]::SettingsWritten = 0
    [FakeSmartSdk]::Settings[796] = 30
    [FakeSmartSdk]::Status = if ($failure -eq 'busy') { 0x200 } else { 0 }
    $payload = @{ jobId = 'printPayload-' + [guid]::NewGuid().ToString(); passType='temporary'; objects=$objects }
    $beforePrint = [FakeSmartSdk]::Printed
    Assert-Bridge (-not (Invoke-PrintRequest $payload $jobs).ok) ('Failure must not return success: ' + $failure)
    if ($failure -in @('verify','ribbonType','busy','black','bounds')) { Assert-Bridge ([FakeSmartSdk]::Printed -eq $beforePrint) 'Preflight failure sent a print command' }
    if ($failure -in @('wait','printFault')) { Assert-Bridge ([FakeSmartSdk]::SettingsWritten -eq 1) 'Settings changed after ribbon fault' }
    $before = [FakeSmartSdk]::Printed
    Assert-Bridge (-not (Invoke-PrintRequest $payload $jobs).ok) 'Repeated failed job is not retried'
    Assert-Bridge ([FakeSmartSdk]::Printed -eq $before) 'Failure retry consumed another panel'
    if ($failure -in @('wait','printFault')) {
        $other = @{ jobId = 'printPayload-' + [guid]::NewGuid().ToString(); passType='temporary'; objects=$objects }
        Assert-Bridge (-not (Invoke-PrintRequest $other $jobs).ok) 'A new window must not bypass unconfirmed-print lock'
        Assert-Bridge ([FakeSmartSdk]::Printed -eq $before) 'Unconfirmed-print lock sent another print'
    }
}
Assert-Bridge ([FakeSmartSdk]::Opened -eq [FakeSmartSdk]::Closed) 'Handles must be closed after failures'
foreach ($path in $createdFiles) { Assert-Bridge (-not (Test-Path $path)) 'Panel temporary file leaked' }
Write-Host 'Bridge job tests passed: 100 jobs, duplicates, black-panel failure, ribbon failure, busy preflight and resource cleanup.'

$nativeMaster = [NativeCsd]::Load((Join-Path $bridgeDir 'employee-native.csd'))
$nativePhoto = [NativeCsd]::ExtractPhoto($nativeMaster)
$nativeValues = [string[]]@('TestSurname','TestName','TestPatronymic','Position','99999','349602761')
$nativeDocument = [NativeCsd]::Prepare($nativeMaster,$nativeValues,$nativePhoto,$false)
$twoValues=[string[]]$nativeValues.Clone();$twoValues[3]="First line`nSecond line"
$twoDocument=[NativeCsd]::Prepare($nativeMaster,$twoValues,$nativePhoto,$false)
# Inspect two independent serialized text objects, not a multiline CString.
function Find-TestBytes([byte[]]$data,[byte[]]$needle) {
    for($i=0;$i -le $data.Length-$needle.Length;$i++) {
        if($data[$i] -ne $needle[0]){continue}
        $match=$true
        for($j=1;$j -lt $needle.Length;$j++){if($data[$i+$j] -ne $needle[$j]){$match=$false;break}}
        if($match){return $i}
    }
    return -1
}
Assert-Bridge ([BitConverter]::ToInt32($nativeMaster,1529694+12) -eq 50) 'Master field height changed'
Assert-Bridge ([BitConverter]::ToUInt16($nativeMaster,25749) -eq 12) 'Master object count changed'
foreach($doc in @($nativeDocument,$twoDocument)) {
    Assert-Bridge ([BitConverter]::ToUInt16($doc,25749) -eq 13) 'Second position object missing'
}
$first=Find-TestBytes $twoDocument ([NativeCsd]::CString('First line'))
$second=Find-TestBytes $twoDocument ([NativeCsd]::CString('Second line'))
Assert-Bridge ($first -gt 0 -and $second -gt $first) 'Position split text missing'
Assert-Bridge ((Find-TestBytes $twoDocument ([NativeCsd]::CString("First line`nSecond line"))) -eq -1) 'SDK still receives a multiline text object'
foreach($pair in @(@($first,296),@($second,341))) {
    $rect=$pair[0]-609
    Assert-Bridge ([BitConverter]::ToInt32($twoDocument,$rect) -eq 456) 'Position object left differs'
    Assert-Bridge ([BitConverter]::ToInt32($twoDocument,$rect+4) -eq $pair[1]) 'Position object top differs'
    Assert-Bridge ([BitConverter]::ToInt32($twoDocument,$rect+8) -eq 556) 'Position object width differs'
    Assert-Bridge ([BitConverter]::ToInt32($twoDocument,$rect+12) -eq 50) 'Position object height differs'
    # All remaining font, alignment, margins, border and panel bytes must match.
    for($i=16;$i -lt 609;$i++){Assert-Bridge ($twoDocument[$rect+$i] -eq $nativeMaster[1529694+$i]) 'Position font/style metadata changed'}
}
# A short title still creates an empty continuation object (one string slot only).
$short=Find-TestBytes $nativeDocument ([NativeCsd]::CString('Position'))
$emptyStart=$short+([NativeCsd]::CString('Position')).Length
Assert-Bridge ([BitConverter]::ToInt32($nativeDocument,$emptyStart+16) -eq 341) 'Empty continuation has wrong top'
Assert-Bridge ([BitConverter]::ToInt32($nativeDocument,$emptyStart+621) -eq 0) 'Short title continuation is not empty'
for($i=0;$i -lt 25713;$i++){Assert-Bridge ($twoDocument[$i] -eq $nativeMaster[$i]) 'Two-line CSD changed printer chunk'}
$threeValues=[string[]]$nativeValues.Clone();$threeValues[3]="One`nTwo`nThree"
$failed=$false;try{[void][NativeCsd]::Prepare($nativeMaster,$threeValues,$nativePhoto,$false)}catch{$failed=$true}
Assert-Bridge $failed 'Native CSD accepted three position lines'
foreach($offset in @(25749,1529694)) {
    $badMaster=[byte[]]$nativeMaster.Clone();$badMaster[$offset]=0
    $failed=$false;try{[void][NativeCsd]::Prepare($badMaster,$twoValues,$nativePhoto,$false)}catch{$failed=$true}
    Assert-Bridge $failed 'Native CSD accepted an unsupported object list/layout'
}
$mosnValues=[string[]]$nativeValues.Clone();$mosnValues[4]=''
$mosnValues[3]="Comment first`nComment continuation"
$mosnDocument=[NativeCsd]::Prepare($nativeMaster,$mosnValues,$nativePhoto,$true)
Assert-Bridge ($mosnDocument.Length -gt 25713) 'MOSN template preparation failed'
Assert-Bridge ((Find-TestBytes $mosnDocument ([NativeCsd]::CString('Comment continuation'))) -gt 0) 'MOSN continuation is missing'
# Independent check of every replacement and exact original PRN settings chunk.
$masterText = [Text.Encoding]::Unicode.GetString($nativeMaster)
$documentText = [Text.Encoding]::Unicode.GetString($nativeDocument)
foreach ($slot in [NativeCsd]::Slots) { Assert-Bridge (-not $documentText.Contains($slot)) 'Native placeholder remained' }
for ($i = 0; $i -lt 25713; $i++) { Assert-Bridge ($nativeMaster[$i] -eq $nativeDocument[$i]) 'Native CSD printer chunk changed' }
$nativePayload = @{jobId='printPayload-'+[guid]::NewGuid();passType='employee';surname=$nativeValues[0];name=$nativeValues[1];patronymic=$nativeValues[2];position=$nativeValues[3];employeeNumber=$nativeValues[4];passNumber=$nativeValues[5];photoDataUrl=('data:image/png;base64,'+[Convert]::ToBase64String($nativePhoto))}
$script:printerNeedsCheck=$false
[FakeSmartSdk]::Status=0
[FakeSmartSdk]::FailAt=''
[Array]::Copy($profile,8,[FakeSmartSdk]::Settings,784,12976)
$beforeNativePrint=[FakeSmartSdk]::Printed
$nativeJobs=@{}
Assert-Bridge (Invoke-NativeCsd $nativePayload $true).ok 'Preview-only CSD request failed'
Assert-Bridge ([FakeSmartSdk]::Printed -eq $beforeNativePrint) 'Preview moved a print job'
Assert-Bridge (-not $script:printerNeedsCheck) 'Preview set unconfirmed-print lock'
$beforeSettings=[FakeSmartSdk]::SettingsWritten
Assert-Bridge (Invoke-PrintRequest $nativePayload $nativeJobs).ok 'Native CSD job failed'
Assert-Bridge (Invoke-PrintRequest $nativePayload $nativeJobs).ok 'Native CSD duplicate lost cached result'
Assert-Bridge ([FakeSmartSdk]::Printed -eq $beforeNativePrint+1) 'Native CSD duplicate printed again'
Assert-Bridge ([FakeSmartSdk]::DocumentsOpened -eq [FakeSmartSdk]::DocumentsClosed) 'Native document leaked'
Assert-Bridge ([FakeSmartSdk]::SettingsWritten -eq $beforeSettings) 'Native CSD rewrote printer settings'
for($i=0;$i -lt 20;$i++) {
    $copy=$nativePayload.Clone();$copy.jobId='printPayload-'+[guid]::NewGuid();$copy.position="First line`nContinuation"
    $before=[FakeSmartSdk]::Printed
    Assert-Bridge (Invoke-PrintRequest $copy $nativeJobs).ok 'Repeated isolated native job failed'
    Assert-Bridge (Invoke-PrintRequest $copy $nativeJobs).ok 'Repeated isolated job lost cached result'
    Assert-Bridge ([FakeSmartSdk]::Printed -eq $before+1) 'Repeated isolated job printed twice'
}
Assert-Bridge ([FakeSmartSdk]::SettingsWritten -eq $beforeSettings) 'Repeated native jobs changed settings'
foreach ($bad in @('photo','text','number')) {
    $values=[string[]]$nativeValues.Clone();$photo=[byte[]]$nativePhoto.Clone()
    if ($bad -eq 'photo') { $photo[19]=0 }
    if ($bad -eq 'text') { $values[0]="Test`nSurname" }
    if ($bad -eq 'number') { $values[5]='not-an-identifier' }
    $failed=$false
    try { [void][NativeCsd]::Prepare($nativeMaster,$values,$photo,$false) } catch { $failed=$true }
    Assert-Bridge $failed ('Invalid native data accepted: '+$bad)
}
foreach ($failure in @('document','preview','nativeProfile','printFault')) {
    $script:printerNeedsCheck=$false
    [FakeSmartSdk]::Status=0
    [FakeSmartSdk]::FailAt=$failure
    $copy=$nativePayload.Clone();$copy.jobId='printPayload-'+[guid]::NewGuid()
    $before=[FakeSmartSdk]::Printed
    Assert-Bridge (-not (Invoke-PrintRequest $copy $nativeJobs).ok) 'Native failure returned success'
    if ($failure -ne 'printFault') { Assert-Bridge ([FakeSmartSdk]::Printed -eq $before) 'Unrenderable CSD sent a print' }
}
Assert-Bridge ([FakeSmartSdk]::Opened -eq [FakeSmartSdk]::Closed) 'Native device leaked'
Write-Host 'Native CSD tests passed: sanitized template, unchanged printer bytes, photo substitution, SDK render gate, deduplication and cleanup.'
