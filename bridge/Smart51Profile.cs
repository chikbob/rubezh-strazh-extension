using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

// Layout from IDP's SMART51_DEVMODE / OEMDEV51 header, not an arbitrary
// density offset. Only named printing fields are copied. Reserved bytes,
// encoding, laminating, positioning and device-control fields remain intact.
public static class Smart51Profile {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct PrintingSettings {
        public uint Size, Signature, Version;
        public uint Main, Yellow, Magenta, Cyan, Black, Overlay;
        public uint CorrectColor, CorrectMono, CorrectOverlay;
        public uint BPText, BPDot, BPThreshold, BPDitherDegree, BPResin, BPResinOnly;
        public uint Erase, FastAlignment;
        public uint WaitRFUse, WaitRFSide, WaitRFPos, WaitRFTime;
        public uint WaitICUse, WaitICSide, WaitICPos, WaitICTime, Resolution;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)] public byte[] AdvancedReserved;
        public uint Supply, Tray;
        public uint PrintUse, Side, ColorFront, ColorBack, FlipFront, FlipBack, MediaFront, MediaBack;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)] public string UserMediaFront;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)] public string UserMediaBack;
        public uint Ribbon, Speed, Quality, Dither, HeatControl, RibbonSplit, AntiAliasing, ColorSense, Config;
    }
    const int OemOffset = 220 + 564;
    const int OemSize = 12976;
    const uint Signature = 0x53443531;
    public static readonly string[] Fields = {
        "Main", "Yellow", "Magenta", "Cyan", "Black", "Overlay",
        "BPText", "BPDot", "BPThreshold", "BPDitherDegree", "BPResin", "BPResinOnly",
        "Resolution", "Supply", "Tray", "PrintUse", "Side", "ColorFront", "ColorBack",
        "FlipFront", "FlipBack", "MediaFront", "MediaBack", "Ribbon", "Speed", "Quality",
        "Dither", "HeatControl", "RibbonSplit", "AntiAliasing", "ColorSense", "Config"
    };
    static int Offset(string name) { return Marshal.OffsetOf(typeof(PrintingSettings), name).ToInt32(); }
    static uint Value(byte[] data, int start, string name) { return BitConverter.ToUInt32(data, start + Offset(name)); }
    static void CheckHeader(byte[] data, int start) {
        if (data.Length < start + OemSize || BitConverter.ToUInt32(data, start) != OemSize ||
            BitConverter.ToUInt32(data, start + 4) != Signature || BitConverter.ToUInt32(data, start + 8) != 1)
            throw new InvalidOperationException("Unsupported SMART-51 driver settings layout; no print was sent. OEM header at " + start + ", buffer bytes=" + data.Length + ", header=" + (data.Length >= start + 12 ? BitConverter.ToString(data, start, 12) : "truncated") + ".");
    }
    public static byte[] Load(string path) {
        byte[] profile = File.ReadAllBytes(path);
        // This is the user's exported, reviewed hYMCKO profile. Do not accept
        // an arbitrary sd1 file with unreviewed heat or device options.
        string hash;
        using (SHA256 sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(profile)).Replace("-", "").ToLowerInvariant();
        if (hash != "f63e011c2049890bbbf32c522d7574c3b2e5c2b883908356e130cf4cc13f8897") throw new InvalidOperationException("The bundled iDesigner profile is missing or changed; reinstall the bridge.");
        if (profile.Length != OemSize + 8 || BitConverter.ToUInt32(profile, 0) != 0x31354453)
            throw new InvalidOperationException("Invalid SD51 profile.");
        CheckHeader(profile, 8);
        return profile;
    }
    public static void ValidateDeviceSettings(byte[] current) {
        if (current.Length < OemOffset + OemSize || BitConverter.ToUInt16(current, 68) != 220)
            throw new InvalidOperationException("Unsupported SMART-51 DEVMODE size; no print was sent.");
        CheckHeader(current, OemOffset);
    }
    public static byte[] Prepare(byte[] current, byte[] profile, int ribbonType) {
        ValidateDeviceSettings(current);
        CheckHeader(profile, 8);
        if (ribbonType != 2 || Value(profile, 8, "Ribbon") != 2 || Value(profile, 8, "Resolution") != 0)
            throw new InvalidOperationException("This verified profile requires hYMCKO ribbon and 300 dpi; no print was sent.");
        byte[] result = (byte[])current.Clone();
        foreach (string field in Fields) Buffer.BlockCopy(profile, 8 + Offset(field), result, OemOffset + Offset(field), 4);
        return result;
    }
    public static void Verify(byte[] expected, byte[] actual) {
        ValidateDeviceSettings(actual);
        foreach (string field in Fields)
            if (Value(expected, OemOffset, field) != Value(actual, OemOffset, field))
                throw new InvalidOperationException("Driver did not confirm iDesigner setting: " + field + "; no print was sent.");
    }
    public static bool Matches(byte[] expected, byte[] actual) {
        ValidateDeviceSettings(expected);
        ValidateDeviceSettings(actual);
        foreach (string field in Fields)
            if (Value(expected, OemOffset, field) != Value(actual, OemOffset, field)) return false;
        return true;
    }
    public static string Describe(byte[] settings) {
        ValidateDeviceSettings(settings);
        string result = "";
        foreach (string field in Fields) result += field + "=" + Value(settings, OemOffset, field) + " ";
        return result.TrimEnd();
    }
}
