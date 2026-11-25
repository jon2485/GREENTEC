<#
GREENTEC studio-bench - P1.0 LOCAL pre-check (read-only, no network).

Reads: Windows version, disk space, RAM, NVIDIA driver + GPU model (nvidia-smi), a 15-second
idle snapshot of the GPU, Visual C++ runtime (registry, read-only), tar/curl presence, Topaz
presence. It does NOT contact the internet (that is p1_netcheck.ps1) and it is NOT a load test.

Writes exactly one file: <ReportDir>\p1_precheck-<time>.json (default: .\results next to this script).
Exit code: 0 = no blocking item, 2 = at least one FAIL.

  powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_precheck.ps1
(-ExecutionPolicy Bypass applies to this one process only; it changes no setting.)
#>
[CmdletBinding()]
param(
  [string]$ManifestPath = '',
  [string]$Root = '',
  [string]$ReportDir = '',
  [int]$IdleSeconds = 15
)
$ErrorActionPreference = 'Stop'
# NOTE: in Windows PowerShell 5.1 $PSScriptRoot is empty inside param() defaults, so defaults are resolved here.
if (-not $ManifestPath) { $ManifestPath = Join-Path $PSScriptRoot 'p1_manifest.json' }
if (-not $ReportDir) { $ReportDir = Join-Path $PSScriptRoot 'results' }
. (Join-Path $PSScriptRoot 'p1_lib.ps1')
$M = Read-Manifest $ManifestPath
if (-not $Root) { $Root = $M.root }
$results = [ordered]@{ tool = 'p1_precheck v2 (local only)'; time = (Get-Date).ToString('s'); checks = @() }
function Add-Check([string]$name, [string]$status, [string]$detail) {
  $script:results.checks += [ordered]@{ name = $name; status = $status; detail = $detail }
  $color = @{ PASS = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$status]
  Write-Host ("[{0}] {1}: {2}" -f $status, $name, $detail) -ForegroundColor $color
}

# 1. Windows
$os = Get-CimInstance Win32_OperatingSystem
Add-Check 'windows' 'INFO' ("{0} build {1}" -f $os.Caption, $os.BuildNumber)

# 2. Disk
$driveLetter = ([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Root))).Substring(0, 1)
$d = Get-PSDrive -Name $driveLetter
$freeGB = [math]::Round($d.Free / 1GB, 1)
if ($freeGB -ge 150) { Add-Check 'disk' 'PASS' "${driveLetter}: free $freeGB GB (P1 needs about 45 GB incl. extraction)" }
elseif ($freeGB -ge 60) { Add-Check 'disk' 'WARN' "${driveLetter}: free $freeGB GB - enough for P1, tight for later stages" }
else { Add-Check 'disk' 'FAIL' "${driveLetter}: free $freeGB GB - P1 needs at least 60 GB" }

# 3. RAM
$cs = Get-CimInstance Win32_ComputerSystem
$totalGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1); $availGB = [math]::Round($os.FreePhysicalMemory * 1KB / 1GB, 1)
Add-Check 'ram' $(if ($availGB -ge 35) { 'PASS' } else { 'WARN' }) "total $totalGB GB, free now $availGB GB (a run needs about 35 GB free; close heavy apps first)"

# 4. NVIDIA driver and GPU model
$smi = Find-Exe 'nvidia-smi'
if (-not $smi) { Add-Check 'nvidia-smi' 'FAIL' 'not found on PATH' }
else {
  $f = Get-SmiValues $smi 'name,driver_version,memory.total,compute_cap,power.limit'
  Add-Check 'gpu' 'INFO' ("{0} | VRAM {1} MiB | compute {2} | power limit {3} W" -f $f[0], $f[2], $f[3], $f[4])
  $modelOk = ($f[0] -match 'RTX PRO 5000') -and ([double]$f[2] -ge 45000) -and ([double]$f[2] -le 52000)
  Add-Check 'gpu_model' $(if ($modelOk) { 'PASS' } else { 'WARN' }) "expected $($M.driver.gpu_model); found $($f[0]) with $($f[2]) MiB"
  $ver = [double]$f[1]
  if ($ver -ge [double]$M.driver.min_version) { Add-Check 'driver' 'PASS' "driver $($f[1]) >= $($M.driver.min_version) (CUDA 13.x OK)" }
  else { Add-Check 'driver' 'FAIL' "driver $($f[1]) < $($M.driver.min_version): ComfyUI v0.46.0 (torch 2.14.1+cu130) will not run. Driver update first (INSTALL_PLAN_P1.md, P1.1)" }

  # 5. GPU idle SNAPSHOT (observation only - not a load or stress test)
  $samples = @()
  for ($i = 0; $i -lt $IdleSeconds; $i++) {
    $v = Get-SmiValues $smi 'utilization.gpu,memory.used,temperature.gpu,power.draw'
    $samples += [pscustomobject]@{ util = [double]$v[0]; mem = [double]$v[1]; temp = [double]$v[2]; power = ($v[3] -as [double]) }
    Start-Sleep -Seconds 1
  }
  $u = $samples | Measure-Object util -Average -Maximum; $mm = $samples | Measure-Object mem -Maximum; $t = $samples | Measure-Object temp -Maximum
  $apps = @(& $smi '--query-compute-apps=process_name,used_memory' '--format=csv,noheader' | Where-Object { $_ -and $_ -notmatch 'No running' } |
          ForEach-Object { $p = $_ -split ',\s*'; '{0} ({1})' -f (Split-Path -Leaf $p[0]), $p[1] })   # program file names only, no paths
  $idle = ($u.Average -lt 10) -and ($mm.Maximum -lt 4096) -and ($t.Maximum -lt 65)
  $detail = "{0}-second observation, no load applied: util avg {1:N0}% max {2:N0}% | VRAM used max {3:N0} MiB | temp max {4:N0} C | compute apps: {5}" -f $IdleSeconds, $u.Average, $u.Maximum, $mm.Maximum, $t.Maximum, $(if ($apps.Count) { $apps -join '; ' } else { 'none' })
  Add-Check 'gpu_idle_snapshot' $(if ($idle) { 'PASS' } else { 'WARN' }) $detail
  $results.gpu_samples = $samples
}

# 6. Visual C++ 2015-2022 x64 runtime (PyTorch needs it; registry read only)
$vc = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue
if ($vc -and $vc.Installed -eq 1) { Add-Check 'vc_runtime' 'PASS' "installed, version $($vc.Version)" }
else { Add-Check 'vc_runtime' 'WARN' 'Visual C++ 2015-2022 x64 runtime not found - PyTorch may fail with a c10.dll error. Installing it needs your approval.' }

# 7. Tools that ship with Windows
$curl = Find-Exe 'curl'; $tar = Find-Exe 'tar'
Add-Check 'curl.exe' $(if ($curl) { 'PASS' } else { 'FAIL' }) $(if ($curl) { (& $curl --version | Select-Object -First 1) } else { 'not found' })
if ($tar) { $tv = (& $tar --version | Select-Object -First 1); Add-Check 'tar.exe' $(if ($tv -match 'libarchive') { 'PASS' } else { 'WARN' }) "$tv (extracts the .7z; fallback: File Explorer)" }
else { Add-Check 'tar.exe' 'WARN' 'not found - extract the .7z in File Explorer instead' }

# 8. GREENTEC folders (nothing is changed)
foreach ($sub in "ComfyUI_$($M.comfyui.version)", 'models', 'downloads', 'logs') {
  Add-Check "folder $sub" 'INFO' $(if (Test-Path -LiteralPath (Join-Path $Root $sub)) { 'exists' } else { 'not yet created' })
}

# 9. Topaz - detect only (requirement: never touched)
$topazDirs = @('C:\Program Files\Topaz Labs LLC', 'C:\Program Files\Topaz Labs', 'C:\ProgramData\Topaz Labs LLC') | Where-Object { Test-Path -LiteralPath $_ }
Add-Check 'topaz' 'INFO' $(if ($topazDirs) { 'found (will not be touched): ' + ($topazDirs -join '; ') } else { 'no standard Topaz folder found' })
$topazProc = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Topaz*' } | Select-Object -ExpandProperty ProcessName -Unique)
if ($topazProc.Count) { Add-Check 'topaz_running' 'WARN' ('running now: ' + ($topazProc -join ', ') + ' - close it before measurements and before a driver update') }
foreach ($td in $topazDirs) { if (Test-Inside $Root $td) { Add-Check 'root' 'FAIL' "install root $Root is inside a Topaz folder" } }

Add-Check 'python' 'INFO' 'not required: the ComfyUI portable build brings its own isolated Python 3.13'

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$file = Join-Path $ReportDir ("p1_precheck-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$json = $results | ConvertTo-Json -Depth 5
foreach ($pair in @(@($env:USERPROFILE, '<HOME>'), @($env:USERNAME, '<USER>'), @($env:COMPUTERNAME, '<HOST>'))) {
  if ($pair[0] -and $pair[0].Length -gt 2) { $json = $json -replace [regex]::Escape($pair[0]), $pair[1] }
}
Set-Content -LiteralPath $file -Value $json -Encoding UTF8
$fails = @($results.checks | Where-Object { $_.status -eq 'FAIL' }).Count
Write-Host ''
Write-Host $(if ($fails) { "$fails blocking item(s). Nothing was changed." } else { 'No blocking items. Nothing was changed.' })
Write-Host "Report: $file"
exit $(if ($fails) { 2 } else { 0 })
