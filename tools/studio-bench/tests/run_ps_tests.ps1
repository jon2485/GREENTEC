<#
GREENTEC studio-bench - Windows PowerShell 5.1 tests for the P1 scripts (run by GitHub Actions on windows-latest).
Uses a mock nvidia-smi.exe (compiled here from C#) and temporary folders; never touches C:\GREENTEC.
Network is used only in the tests marked [net] (HEAD/GET of one 9 KB file on huggingface.co).
Exit code: number of failed tests.
#>
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$inst = Join-Path (Split-Path -Parent $here) 'install'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("gtbench-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
$script:failed = 0; $script:passed = 0
$script:lastOut = ''
function Check([string]$name, [bool]$cond, [string]$info = '') {
  if ($cond) { $script:passed++; Write-Host "PASS  $name" -ForegroundColor Green }
  else {
    $script:failed++; Write-Host "FAIL  $name  $info" -ForegroundColor Red
    if ($script:lastOut) { Write-Host '----- output of the last script run (tail) -----'; ($script:lastOut -split "`n" | Select-Object -Last 25) | ForEach-Object { Write-Host "  | $_" }; Write-Host '-----'; $script:lastOut = '' }
  }
}
function Run-Ps([string]$script, [string[]]$arguments) {
  # run a script in a fresh Windows PowerShell 5.1 process, return exit code + output
  $ErrorActionPreference = 'Continue'   # PS 5.1 turns redirected native stderr into errors under 'Stop'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script @arguments 2>&1 | Out-String
  $script:lastOut = $out
  return @{ code = $LASTEXITCODE; out = $out }
}
Write-Host ("PowerShell {0} ({1})" -f $PSVersionTable.PSVersion, $PSVersionTable.PSEdition)
Check 'running under Windows PowerShell 5.1' ($PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1)

# ---------- mock nvidia-smi.exe ----------
$mockDir = Join-Path $tmp 'mockbin'; New-Item -ItemType Directory -Force $mockDir | Out-Null
$src = @'
using System;
public static class P {
  static string E(string n, string d) { var v = Environment.GetEnvironmentVariable(n); return string.IsNullOrEmpty(v) ? d : v; }
  public static int Main(string[] a) {
    string q = string.Join(" ", a);
    string drv = E("MOCK_DRV", "573.42");
    if (q.Contains("--query-gpu=name,driver_version")) { Console.WriteLine(E("MOCK_NAME", "NVIDIA RTX PRO 5000 Blackwell") + ", " + drv + ", 48935, 12.0, 300.00"); return 0; }
    if (q.Contains("--query-gpu=driver_version")) { Console.WriteLine(drv); return 0; }
    if (q.Contains("--query-gpu=utilization.gpu")) { Console.WriteLine(E("MOCK_UTIL", "0") + ", " + E("MOCK_MEM", "600") + ", " + E("MOCK_TEMP", "40") + ", 25.00"); return 0; }
    if (q.Contains("--query-compute-apps")) { var app = E("MOCK_APP", ""); Console.WriteLine(app == "" ? "No running processes found" : app); return 0; }
    Console.WriteLine("| NVIDIA-SMI " + drv + "   Driver Version: " + drv + "   CUDA Version: 13.0 |"); return 0;
  }
}
'@
Add-Type -TypeDefinition $src -OutputAssembly (Join-Path $mockDir 'nvidia-smi.exe') -OutputType ConsoleApplication
$env:PATH = "$mockDir;$env:PATH"
Check 'mock nvidia-smi.exe built' (Test-Path (Join-Path $mockDir 'nvidia-smi.exe'))

# ---------- T1/T2 parse + ASCII ----------
foreach ($f in Get-ChildItem -Path $inst -Filter *.ps1) {
  $tokens = $null; $errs = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errs)
  Check "parse (PS 5.1) $($f.Name)" ($errs.Count -eq 0) (($errs | ForEach-Object { "$($_.Extent.StartLineNumber): $($_.Message)" }) -join ' | ')
  $bytes = [IO.File]::ReadAllBytes($f.FullName)
  Check "ASCII only $($f.Name)" (-not ($bytes | Where-Object { $_ -gt 127 } | Select-Object -First 1))
}

# ---------- lib unit tests ----------
. (Join-Path $inst 'p1_lib.ps1')
$allow = @('github.com', 'huggingface.co', '.hf.co')
Check 'host allow: huggingface.co' (Test-HostAllowed 'https://huggingface.co/x' $allow)
Check 'host allow: sub.hf.co' (Test-HostAllowed 'https://us.aws.cdn.hf.co/x' $allow)
Check 'host deny: evilhf.co' (-not (Test-HostAllowed 'https://evilhf.co/x' $allow))
Check 'host deny: http scheme' (-not (Test-HostAllowed 'http://huggingface.co/x' $allow))
Check 'host deny: other' (-not (Test-HostAllowed 'https://example.com/x' $allow))
Check 'loopback: 127.0.0.1' (Test-IsLoopback '127.0.0.1')
Check 'loopback: ::1' (Test-IsLoopback '::1')
Check 'not loopback: 8.8.8.8' (-not (Test-IsLoopback '8.8.8.8'))
$cnd = Join-Path $tmp 'cn'; New-Item -ItemType Directory -Force $cnd | Out-Null; Set-Content (Join-Path $cnd 'ok.py') 'x'; Set-Content (Join-Path $cnd 'evil.py') 'x'
Check 'custom node allow-list flags extras' ((Test-CustomNodes $cnd @('ok.py')) -contains 'evil.py')
Check 'Assert-Inside blocks escape' ($(try { Assert-Inside (Join-Path $tmp '..\x') $tmp; $false } catch { $true }))
Check 'Find-Exe finds mock' ((Find-Exe 'nvidia-smi') -like "$mockDir*")

# ---------- precheck ----------
$rep = Join-Path $tmp 'reports'
$env:MOCK_DRV = '573.42'
$r = Run-Ps (Join-Path $inst 'p1_precheck.ps1') @('-Root', (Join-Path $tmp 'gt'), '-ReportDir', $rep, '-IdleSeconds', '2')
Check 'precheck: old driver -> exit 2' ($r.code -eq 2) "exit $($r.code)"
Check 'precheck: driver FAIL reported' ($r.out -match '\[FAIL\] driver: driver 573.42 < 580')
Check 'precheck: idle check is labelled as observation, not load test' ($r.out -match 'no load applied')
Check 'precheck: no network section (local only)' ($r.out -notmatch 'net https')
Check 'precheck: writes one report only' (@(Get-ChildItem $rep -Filter 'p1_precheck-*.json' -ErrorAction SilentlyContinue).Count -eq 1)
Check 'precheck: install root not created' (-not (Test-Path (Join-Path $tmp 'gt')))
$env:MOCK_DRV = '621.14'; $env:MOCK_APP = 'C:\Users\someone\AppData\Topaz\tvai.exe, 9000 MiB'; $env:MOCK_MEM = '9500'
$r = Run-Ps (Join-Path $inst 'p1_precheck.ps1') @('-Root', (Join-Path $tmp 'gt'), '-ReportDir', $rep, '-IdleSeconds', '2')
Check 'precheck: new driver PASS' ($r.out -match '\[PASS\] driver: driver 621.14')
Check 'precheck: exact model PASS' ($r.out -match '\[PASS\] gpu_model')
Check 'precheck: busy GPU -> idle WARN with app file name only' (($r.out -match '\[WARN\] gpu_idle_snapshot') -and ($r.out -match 'tvai.exe') -and ($r.out -notmatch 'someone'))
$env:MOCK_APP = ''; $env:MOCK_MEM = '600'

# ---------- install dry runs ----------
$gt = Join-Path $tmp 'gt'
$env:MOCK_DRV = '573.42'
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'ComfyUI', '-Root', $gt, '-NoNetwork')
Check 'dry run ComfyUI, old driver: exit 2 (blocker)' ($r.code -eq 2) "exit $($r.code)"
Check 'dry run ComfyUI, old driver: blocker message' ($r.out -match 'BLOCKER NVIDIA driver 573.42')
Check 'dry run: root still does not exist' (-not (Test-Path $gt))
Check 'dry run: verified unchanged' ($r.out -match 'dry run verified')
$env:MOCK_DRV = '621.14'
New-Item -ItemType Directory -Force (Join-Path $gt 'something') | Out-Null; Set-Content (Join-Path $gt 'something\keep.txt') 'keep'
$snapBefore = Get-TreeSnapshot $gt @()
$logsBefore = @(Get-ChildItem (Join-Path $inst 'results') -Filter 'p1_install-*-dryrun.log' -ErrorAction SilentlyContinue).Count
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'ComfyUI', '-Root', $gt, '-NoNetwork')
Check 'dry run ComfyUI, new driver: WOULD download + extract' (($r.out -match 'WOULD download') -and ($r.out -match 'WOULD extract'))
Check 'dry run ComfyUI: no DO lines' ($r.out -notmatch '\bDO    ')
Check 'dry run ComfyUI: files under root unchanged' ((Compare-Object $snapBefore (Get-TreeSnapshot $gt @()) | Measure-Object).Count -eq 0)
Check 'dry run ComfyUI: exactly one new log' (@(Get-ChildItem (Join-Path $inst 'results') -Filter 'p1_install-*-dryrun.log' -ErrorAction SilentlyContinue).Count -eq $logsBefore + 1)
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'Models', '-Root', $gt, '-NoNetwork')
Check 'dry run Models: blocker (ComfyUI missing), nothing written' (($r.code -eq 2) -and ((Compare-Object $snapBefore (Get-TreeSnapshot $gt @()) | Measure-Object).Count -eq 0)) "exit $($r.code)"

# ---------- Verify (read-only) with a test manifest ----------
$vroot = Join-Path $tmp 'v'; New-Item -ItemType Directory -Force (Join-Path $vroot 'models\vae') | Out-Null
$file = Join-Path $vroot 'models\vae\a.bin'; [IO.File]::WriteAllText($file, 'hello')
$m = Get-Content (Join-Path $inst 'p1_manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$m.models = @([pscustomobject]@{ dir = 'vae'; name = 'a.bin'; repo = 'x/y'; revision = 'r'; path = 'a.bin'; size = 5; sha256 = (Get-Sha256Lower $file); required = $true })
$tm = Join-Path $tmp 'test_manifest.json'; ($m | ConvertTo-Json -Depth 8) | Set-Content $tm -Encoding UTF8
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'Verify', '-Root', $vroot, '-ManifestPath', $tm, '-NoNetwork')
Check 'verify: good file -> OK' ($r.out -match 'OK       a.bin')
[IO.File]::WriteAllText($file, 'HELLO')
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'Verify', '-Root', $vroot, '-ManifestPath', $tm, '-NoNetwork')
Check 'verify: corrupted file -> BAD HASH' ($r.out -match 'BAD HASH a.bin')

# ---------- [net] real resumable verified download + quarantine ----------
$droot = Join-Path $tmp 'd'; New-Item -ItemType Directory -Force (Join-Path $droot 'ComfyUI_v0.46.0\ComfyUI_windows_portable') | Out-Null
$m.models = @([pscustomobject]@{ dir = 'test'; name = 'README.md'; repo = 'Comfy-Org/Qwen-Image'; revision = '1f12b17be14c89b026c51a91d67c32f84bb047bc'; path = 'README.md'; size = 9239; sha256 = '94dc8893156fd87263175a4f4967da2bb3cc3dc2573ed4ca8cb45a909a92930a'; required = $true })
($m | ConvertTo-Json -Depth 8) | Set-Content $tm -Encoding UTF8
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'Models', '-Root', $droot, '-ManifestPath', $tm, '-Execute', '-MarginGB', '0')
Check '[net] execute: download verified' (($r.code -eq 0) -and (Test-Path (Join-Path $droot 'models\test\README.md'))) "exit $($r.code) $($r.out)"
Check '[net] execute: redirect chain checked against allow-list' ($r.out -match 'sources OK: huggingface.co')
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'Models', '-Root', $droot, '-ManifestPath', $tm, '-Execute', '-MarginGB', '0')
Check '[net] execute again: already present' ($r.out -match 'already present and verified')
$m.models[0].sha256 = ('0' * 64); $m.models[0].name = 'README2.md'
($m | ConvertTo-Json -Depth 8) | Set-Content $tm -Encoding UTF8
$r = Run-Ps (Join-Path $inst 'p1_install.ps1') @('-Stage', 'Models', '-Root', $droot, '-ManifestPath', $tm, '-Execute', '-MarginGB', '0')
Check '[net] wrong hash: stops with exit 1' ($r.code -eq 1)
Check '[net] wrong hash: file quarantined twice, not installed' ((@(Get-ChildItem (Join-Path $droot 'quarantine') -Filter 'README2.md.bad-*').Count -ge 1) -and -not (Test-Path (Join-Path $droot 'models\test\README2.md')))
$m.comfyui.url = 'https://example.com/ComfyUI.7z'
($m | ConvertTo-Json -Depth 8) | Set-Content $tm -Encoding UTF8
$r = Run-Ps (Join-Path $inst 'p1_netcheck.ps1') @('-ManifestPath', $tm, '-ReportDir', $rep)
Check '[net] netcheck: host not on allow-list -> exit 2' (($r.code -eq 2) -and ($r.out -match 'not on the allow-list: example.com'))

# ---------- launcher refuses foreign custom nodes ----------
$lroot = Join-Path $tmp 'l'; $lp = Join-Path $lroot 'ComfyUI_v0.46.0\ComfyUI_windows_portable'
New-Item -ItemType Directory -Force (Join-Path $lp 'python_embeded'), (Join-Path $lp 'ComfyUI\custom_nodes') | Out-Null
Set-Content (Join-Path $lp 'python_embeded\python.exe') 'not a real python'
Set-Content (Join-Path $lp 'ComfyUI\custom_nodes\evil_node.py') 'import socket'
$r = Run-Ps (Join-Path $inst 'p1_launch.ps1') @('-Root', $lroot)
Check 'launch: refuses unexpected custom node' (($r.code -ne 0) -and ($r.out -match 'refusing to start: unexpected items in custom_nodes: evil_node.py'))

# ---------- topaz snapshot ----------
$r = Run-Ps (Join-Path $inst 'p1_topaz_snapshot.ps1') @('-Label', 'before', '-ReportDir', $rep)
Check 'topaz snapshot writes a report' (@(Get-ChildItem $rep -Filter 'topaz-before-*.json' -ErrorAction SilentlyContinue).Count -eq 1)

Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''; Write-Host "passed $script:passed, failed $script:failed"
exit $script:failed
