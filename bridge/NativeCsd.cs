using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;

// Narrow serializer for the supplied, fixed CSD revision. All unchanged
// printer/object/style/embedded-background bytes are retained verbatim.
// CString payloads are length-prefixed UTF-16; embedded images are length-prefixed.
// This is deliberately NOT a general-purpose CSD parser.
public static class NativeCsd {
    public static readonly string[] Slots = { "RUBEZH_SURNAME", "RUBEZH_NAME", "RUBEZH_PATRONYMIC", "RUBEZH_POSITION", "RUBEZH_EMPLOYEE_NUMBER", "RUBEZH_PASS_NUMBER" };
    public static byte[] CString(string value) {
        byte[] data = Encoding.Unicode.GetBytes(value);
        byte[] result = new byte[4 + data.Length];
        Buffer.BlockCopy(BitConverter.GetBytes(value.Length), 0, result, 0, 4);
        Buffer.BlockCopy(data, 0, result, 4, data.Length);
        return result;
    }
    static int FindOnce(byte[] data, byte[] needle) {
        int found = -1;
        for (int i = 0; i <= data.Length - needle.Length; i++) {
            if (data[i] != needle[0]) continue;
            int j = 1; while (j < needle.Length && data[i+j] == needle[j]) j++;
            if (j != needle.Length) continue;
            if (found != -1) throw new InvalidOperationException("Ambiguous native template slot.");
            found = i;
        }
        if (found < 0) throw new InvalidOperationException("Missing native template slot.");
        return found;
    }
    static byte[] Splice(byte[] data, int start, int count, byte[] value) {
        if (start < 0 || count < 0 || start > data.Length - count) throw new InvalidOperationException("Invalid native template span.");
        byte[] result = new byte[data.Length - count + value.Length];
        Buffer.BlockCopy(data, 0, result, 0, start);
        Buffer.BlockCopy(value, 0, result, start, value.Length);
        Buffer.BlockCopy(data, start + count, result, start + value.Length, data.Length - start - count);
        return result;
    }
    public static byte[] ReplaceString(byte[] data, string oldValue, string newValue) {
        return ReplaceText(data,oldValue,newValue,false);
    }
    static byte[] ReplaceText(byte[] data, string oldValue, string newValue, bool twoLines) {
        if (newValue == null || newValue.Length > 200 || newValue.IndexOf('\0') >= 0 || newValue.IndexOf('\r') >= 0 ||
            (!twoLines && newValue.IndexOf('\n') >= 0) || (twoLines && newValue.Split('\n').Length > 2))
            throw new InvalidOperationException("Invalid native template text.");
        byte[] oldString = CString(oldValue);
        return Splice(data, FindOnce(data, oldString), oldString.Length, CString(newValue));
    }
    public static byte[] ReplacePhoto(byte[] data, byte[] photo) {
        // csdCEA7.tmp is the portrait object, NOT the background or emblem.
        byte[] name = CString("csdCEA7.tmp");
        int lengthOffset = FindOnce(data, name) + name.Length;
        int oldLength = BitConverter.ToInt32(data, lengthOffset);
        if (photo == null || photo.Length < 33 || photo.Length > 4*1024*1024 ||
            BitConverter.ToUInt32(photo, 0) != 0x474e5089 || BitConverter.ToUInt32(photo, 4) != 0x0a1a0a0d ||
            photo[16] != 0 || photo[17] != 0 || photo[18] != 1 || photo[19] != 130 ||
            photo[20] != 0 || photo[21] != 0 || photo[22] != 1 || photo[23] != 246 ||
            photo[24] != 8 || (photo[25] != 2 && photo[25] != 6))
            throw new InvalidOperationException("Native portrait must be an opaque 386 x 502 PNG.");
        byte[] replacement = new byte[4 + photo.Length];
        Buffer.BlockCopy(BitConverter.GetBytes(photo.Length), 0, replacement, 0, 4);
        Buffer.BlockCopy(photo, 0, replacement, 4, photo.Length);
        return Splice(data, lengthOffset, 4 + oldLength, replacement);
    }
    public static byte[] ExtractPhoto(byte[] data) {
        byte[] name = CString("csdCEA7.tmp");
        int offset = FindOnce(data, name) + name.Length;
        int length = BitConverter.ToInt32(data, offset);
        if (length < 1 || length > data.Length - offset - 4) throw new InvalidOperationException("Invalid embedded portrait span.");
        byte[] result = new byte[length];
        Buffer.BlockCopy(data, offset + 4, result, 0, length);
        return result;
    }
    public static byte[] Load(string path) {
        byte[] data = File.ReadAllBytes(path);
        string hash;
        using (SHA256 sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
        if (hash != "c812bfdec1cb11fbc5542b574996b758da84e02966e8d22c93846323a5b954da") throw new InvalidOperationException("Native CSD template integrity check failed; no print was sent.");
        return data;
    }
    public static byte[] Prepare(byte[] master, string[] values, byte[] photo, bool mosn) {
        if (values == null || values.Length != Slots.Length || String.IsNullOrWhiteSpace(values[0]) || String.IsNullOrWhiteSpace(values[1]) || !System.Text.RegularExpressions.Regex.IsMatch(values[5], "^[0-9]{6,12}$"))
            throw new InvalidOperationException("Missing native pass data.");
        byte[] result = (byte[])master.Clone();
        if (values[3] != null && values[3].IndexOf('\n') >= 0) {
            // SHA-locked master: position rectangle is 609 bytes before its
            // CString. Its bottom remains above the number row at y=391.
            int rect = FindOnce(result,CString(Slots[3])) - 609;
            int[] expected = {456,296,556,50};
            for (int i=0;i<4;i++) if (BitConverter.ToInt32(result,rect+i*4)!=expected[i])
                throw new InvalidOperationException("Unexpected native position layout; no print was sent.");
            Buffer.BlockCopy(BitConverter.GetBytes(90),0,result,rect+12,4);
        }
        for (int i = 0; i < Slots.Length; i++) result = ReplaceText(result, Slots[i], values[i], i==3);
        if (mosn) result = ReplaceString(result, "\u0422\u0430\u0431. \u2116 ", "\u041c\u041e\u0421\u041d");
        return ReplacePhoto(result, photo);
    }
}
