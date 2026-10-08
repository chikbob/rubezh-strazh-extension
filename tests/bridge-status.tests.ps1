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
    public static int Opened, Closed, Printed, Waited;
    public static string FailAt = "";
    public static ulong Status;
    public static void ValidateDevice(IntPtr device) {}
    public static uint OpenDevice(ref IntPtr handle, IntPtr device, int type) { Opened++; handle = new IntPtr(1); return 0; }
    public static ulong ReadStatus(IntPtr handle) { return Status; }
    public static bool IsIdle(ulong value) { return SmartSdk.IsIdle(value); }
    public static uint GetRibbonInfo(IntPtr handle, ref int type, ref int maximum, ref int remaining, ref int grade) {
        type = 2; maximum = 350; remaining = 310; grade = 1; return 0;
    }
    public static uint DrawImage(IntPtr handle, byte page, byte panel, int x, int y, int width, int height, IntPtr path, IntPtr area) {
        if (panel == 1 && (x != 0 || y != 0 || width != 1012 || height != 638)) throw new Exception("Color bounds mismatch");
        if (panel == 2 && (x != 0 || y != 0 || width != 1012 || height != 638)) throw new Exception("Black bounds mismatch");
        Marshal.StructureToPtr(new RECT { Left = x, Top = y, Right = x + width, Bottom = y + height }, area, false);
        return FailAt == "black" && panel == 2 ? 1u : 0u;
    }
    public static uint Print(IntPtr handle) { Printed++; return 0; }
    public static void WaitForCompletion(IntPtr handle) {
        Waited++;
        SmartSdk.WaitForIdle(() => FailAt == "wait" ? 0x4000000000UL : 0UL, () => {}, 10, 3);
    }
    public static uint CloseDevice(IntPtr handle) { Closed++; return 0; }
}
'@
Add-Type -TypeDefinition ($kernel + "`n" + $testSource) -Language CSharp
Write-Host ('Bridge status/sequence checks passed: ' + [BridgeStatusTests]::Run())

# Exercise the actual PowerShell job/cache/finally blocks with a fake native
# device; no ribbon movement or print command is sent to any real printer.
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$null)
foreach ($name in @('Invoke-CardPrint','Invoke-PrintRequest')) {
    $function = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    Invoke-Expression ($function.Extent.Text.Replace('[SmartSdk]', '[FakeSmartSdk]').Replace('SmartSdk+RECT', 'FakeSmartSdk+RECT'))
}
function Get-SmartPrinter { return 'Fake SMART-51' }
function Write-BridgeLog([string]$message) {}
$createdFiles = [Collections.Generic.List[string]]::new()
function Convert-ToOpaqueBitmap([string]$data, [string]$name, [int]$width, [int]$height) {
    $path = [IO.Path]::GetTempFileName()
    $createdFiles.Add($path)
    return $path
}
function Assert-Bridge([bool]$value, [string]$name) { if (-not $value) { throw $name } }
$jobs = @{}
for ($i = 0; $i -lt 100; $i++) {
    $payload = @{ jobId = 'printPayload-' + [guid]::NewGuid().ToString(); colorImageDataUrl = 'color'; blackImageDataUrl = 'black' }
    Assert-Bridge (Invoke-PrintRequest $payload $jobs).ok 'A full job must succeed'
    Assert-Bridge (Invoke-PrintRequest $payload $jobs).ok 'Duplicate returns original result'
}
Assert-Bridge ([FakeSmartSdk]::Printed -eq 100) '200 HTTP requests must print only 100 cards'
Assert-Bridge ([FakeSmartSdk]::Waited -eq 100) 'Every accepted print waits for completion'
Assert-Bridge ([FakeSmartSdk]::Opened -eq [FakeSmartSdk]::Closed) 'Handles must be closed after success'
foreach ($failure in @('black','wait','busy')) {
    [FakeSmartSdk]::FailAt = $failure
    [FakeSmartSdk]::Status = if ($failure -eq 'busy') { 0x200 } else { 0 }
    $payload = @{ jobId = 'printPayload-' + [guid]::NewGuid().ToString(); colorImageDataUrl = 'color'; blackImageDataUrl = 'black' }
    Assert-Bridge (-not (Invoke-PrintRequest $payload $jobs).ok) ('Failure must not return success: ' + $failure)
    $before = [FakeSmartSdk]::Printed
    Assert-Bridge (-not (Invoke-PrintRequest $payload $jobs).ok) 'Repeated failed job is not retried'
    Assert-Bridge ([FakeSmartSdk]::Printed -eq $before) 'Failure retry consumed another panel'
}
Assert-Bridge ([FakeSmartSdk]::Opened -eq [FakeSmartSdk]::Closed) 'Handles must be closed after failures'
foreach ($path in $createdFiles) { Assert-Bridge (-not (Test-Path $path)) 'Panel temporary file leaked' }
Write-Host 'Bridge job tests passed: 100 jobs, duplicates, black-panel failure, ribbon failure, busy preflight and resource cleanup.'
