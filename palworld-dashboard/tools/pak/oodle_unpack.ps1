# Giải nén các block Oodle theo manifest.json (do sftp_pakget.js ghi) -> file .uasset/.uexp
# rồi xếp vào cây thư mục gốc extracted/Pal/Content/... cho UAssetCLI (uasset + uexp cùng chỗ).
param([string]$RawDir, [string]$OutRoot)
$dll = "C:\Users\nguye\Desktop\palworld-analysis\oodle\bin\oodle-data-shared.dll"
if (-not (Test-Path $dll)) { throw "thiếu $dll" }
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class Oodle {
  [DllImport(@"$dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern long OodleLZ_Decompress(byte[] src, long srcLen, byte[] dst, long dstLen, int fuzzSafe, int checkCRC, int verbosity, IntPtr decBufBase, long decBufSize, IntPtr cb, IntPtr cbUser, IntPtr decMem, long decMemSize, int threadPhase);
}
"@
$man = Get-Content (Join-Path $RawDir 'manifest.json') -Raw | ConvertFrom-Json
foreach ($e in $man) {
  $name = [IO.Path]::GetFileName($e.out)                     # Pal__Content__...__DT_x.uasset
  $rel = $name -replace '__', '/'                              # Pal/Content/.../DT_x.uasset
  $dest = Join-Path $OutRoot $rel
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  if ($e.method -eq 'None') { [IO.File]::Copy($e.out, $dest, $true); Write-Output ("copy  " + $rel + " (" + $e.usize + " B)"); continue }
  if ($e.method -notmatch 'Oodle') { throw ("method chưa hỗ trợ: " + $e.method) }
  $outBuf = New-Object byte[] $e.usize; $pos = 0
  foreach ($b in $e.blocks) {
    $src = [IO.File]::ReadAllBytes($b.file)
    $dst = New-Object byte[] $b.rawLen
    $n = [Oodle]::OodleLZ_Decompress($src, $src.Length, $dst, $dst.Length, 1, 0, 0, [IntPtr]::Zero, 0, [IntPtr]::Zero, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0)
    if ($n -ne $b.rawLen) { throw ("Oodle fail " + $rel + " block " + $b.file + ": ra " + $n + " / cần " + $b.rawLen) }
    [Array]::Copy($dst, 0, $outBuf, $pos, $n); $pos += $n
  }
  if ($pos -ne $e.usize) { throw ("tổng lệch " + $rel + ": " + $pos + " / " + $e.usize) }
  [IO.File]::WriteAllBytes($dest, $outBuf)
  $sig = ($outBuf[0..3] | ForEach-Object { $_.ToString('X2') }) -join ' '
  Write-Output ("oodle " + $rel + " (" + $e.usize + " B, " + $e.blocks.Count + " block) đầu file: " + $sig)
}
