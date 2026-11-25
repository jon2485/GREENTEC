<#
GREENTEC studio-bench - P1 pre-check (READ-ONLY).

Installs nothing, downloads nothing, changes no driver, setting or file outside
this folder. Writes one report: .\results\p1_precheck-<time>.json (next to this script).
Also samples the GPU for 15 seconds to see whether it is idle (requirement 7).

Run (no admin needed):
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_precheck.ps1
(-ExecutionPolicy Bypass applies to this one process only; it does not change any setting.)
#>
[CmdletBinding()]
param(
  [string]$Root = 'C:\GREENTEC',
  [int]$IdleSeconds = 15
)
$ErrorActionPreference = 'Stop'
$results = [ordered]@{ tool = 'p1_precheck v1'; time = (Get-Date).ToString('s'); checks = @() }
function Add-Check([string]$name, [string]$status, [string]$detail) {
  $script:results.checks += [ordered]@{ name = $name; status = $status; detail = $detail }
  $color = @{ PASS = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$status]
  Write-Host ("[{0}] {1}: {2}" -f $status, $name, $detail) -ForegroundColor $color
}
function Find-Exe([string]$name) {  # PATH only, never the current folder
  foreach ($d in ($env:PATH -split ';')) {
    if (-not $d -or $d -eq '.') { continue }
    $p = Join-Path $d "$name.exe"
    if (Test-Path -LiteralPath $p -PathType Leaf) { return $p }
  }
  return $null
}

# 1. Windows
$os = Get-CimInstance Win32_OperatingSystem
Add-Check 'windows' 'INFO' ("{0} build {1}" -f $os.Caption, $os.BuildNumber)

# 2. Disk C
$drive = (Split-Path -Qualifier $Root)
$d = Get-PSDrive -Name $drive.TrimEnd(':')
$freeGB = [math]::Round($d.Free / 1GB, 1)
if ($freeGB -ge 150) { Add-Check 'disk' 'PASS' "$drive free $freeGB GB (P1 needs ~45 GB incl. extraction)" }
elseif ($freeGB -ge 60) { Add-Check 'disk' 'WARN' "$drive free $freeGB GB - enough for P1, tight for later stages" }
else { Add-Check 'disk' 'FAIL' "$drive free $freeGB GB - P1 needs at least 60 GB" }

# 3. RAM
$cs = Get-CimInstance Win32_ComputerSystem
$totalGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1); $availGB = [math]::Round($os.FreePhysicalMemory * 1KB / 1GB, 1)
$st = if ($availGB -ge 40) { 'PASS' } elseif ($availGB -ge 28) { 'WARN' } else { 'WARN' }
Add-Check 'ram' $st "total $totalGB GB, free now $availGB GB (loading ~30 GB of model files needs ~35 GB free; close heavy apps before a run)"

# 4. NVIDIA driver
$smi = Find-Exe 'nvidia-smi'
if (-not $smi) { Add-Check 'nvidia-smi' 'FAIL' 'not found on PATH' }
else {
  $q = & $smi --query-gpu=name,driver_version,memory.total,compute_cap,power.limit --format=csv,noheader,nounits
  $f = ($q | Select-Object -First 1) -split ',\s*'
  Add-Check 'gpu' 'INFO' ("{0} | VRAM {1} MiB | compute {2} | power limit {3} W" -f $f[0], $f[2], $f[3], $f[4])
  $ver = [double]($f[1])
  if ($ver -ge 580) { Add-Check 'driver' 'PASS' "driver $($f[1]) >= 580 (CUDA 13.x OK)" }
  else { Add-Check 'driver' 'FAIL' "driver $($f[1]) < 580: ComfyUI v0.46.0 (PyTorch CUDA 13.0) will not run. Driver update needed first (see INSTALL_PLAN_P1.md, step P1.1)" }

  # 5. GPU idle sampling
  $samples = @()
  for ($i = 0; $i -lt $IdleSeconds; $i++) {
    $l = & $smi --query-gpu=utilization.gpu,memory.used,temperature.gpu,power.draw --format=csv,noheader,nounits
    $v = ($l | Select-Object -First 1) -split ',\s*'
    $samples += [pscustomobject]@{ util = [double]$v[0]; mem = [double]$v[1]; temp = [double]$v[2]; power = ($v[3] -as [double]) }
    Start-Sleep -Seconds 1
  }
  $u = ($samples | Measure-Object util -Average -Maximum); $m = ($samples | Measure-Object mem -Maximum); $t = ($samples | Measure-Object temp -Maximum)
  $apps = & $smi --query-compute-apps=process_name,used_memory --format=csv,noheader 2>$null |
          ForEach-Object { $p = $_ -split ',\s*'; '{0} ({1})' -f (Split-Path -Leaf $p[0]), $p[1] }  # program file names only, no paths
  $idle = ($u.Average -lt 10) -and ($m.Maximum -lt 4096) -and ($t.Maximum -lt 65)
  $detail = "util avg {0:N0}% max {1:N0}% | VRAM used max {2:N0} MiB | temp max {3:N0} C | compute apps: {4}" -f $u.Average, $u.Maximum, $m.Maximum, $t.Maximum, ($(if ($apps) { $apps -join '; ' } else { 'none' }))
  Add-Check 'gpu_idle' $(if ($idle) { 'PASS' } else { 'WARN' }) $detail
  $results.gpu_samples = $samples
}

# 6. Tools that ship with Windows
$curl = Find-Exe 'curl'; $tar = Find-Exe 'tar'
Add-Check 'curl.exe' $(if ($curl) { 'PASS' } else { 'FAIL' }) $(if ($curl) { (& $curl --version | Select-Object -First 1) } else { 'not found' })
if ($tar) {
  $tv = (& $tar --version | Select-Object -First 1)
  Add-Check 'tar.exe' $(if ($tv -match 'libarchive') { 'PASS' } else { 'WARN' }) "$tv (needed to extract .7z; fallback: extract in File Explorer)"
} else { Add-Check 'tar.exe' 'WARN' 'not found - extract the .7z in File Explorer instead' }

# 7. Existing GREENTEC folders (nothing is changed)
foreach ($sub in 'ComfyUI_v0.46.0', 'models', 'downloads', 'logs') {
  $p = Join-Path $Root $sub
  Add-Check "folder $sub" 'INFO' $(if (Test-Path -LiteralPath $p) { 'exists' } else { 'not yet created' })
}

# 8. Topaz - detect only, to make sure nothing of ours overlaps (requirement 1)
$topazDirs = @('C:\Program Files\Topaz Labs LLC', 'C:\Program Files\Topaz Labs', 'C:\ProgramData\Topaz Labs LLC') | Where-Object { Test-Path -LiteralPath $_ }
Add-Check 'topaz' 'INFO' $(if ($topazDirs) { 'found (will not be touched): ' + ($topazDirs -join '; ') } else { 'no standard Topaz folder found' })
$topazProc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Topaz*' -or $_.ProcessName -like '*Video AI*' } | Select-Object -ExpandProperty ProcessName -Unique
if ($topazProc) { Add-Check 'topaz_running' 'WARN' ('running now: ' + ($topazProc -join ', ') + ' - close it before measurements and before a driver update') }
if ($Root -match 'Topaz') { Add-Check 'root' 'FAIL' 'install root must not be inside a Topaz folder' }

# 9. Python
Add-Check 'python' 'INFO' 'not required: the ComfyUI portable build brings its own isolated Python 3.13 (python_embeded)'

# 10. Network reachability (HEAD only)
foreach ($u in 'https://github.com', 'https://api.github.com', 'https://huggingface.co') {
  try { $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 15; Add-Check "net $u" 'PASS' "HTTP $($r.StatusCode)" }
  catch { Add-Check "net $u" 'WARN' $_.Exception.Message }
}

$out = Join-Path $PSScriptRoot 'results'; New-Item -ItemType Directory -Force -Path $out | Out-Null
$file = Join-Path $out ("p1_precheck-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$json = $results | ConvertTo-Json -Depth 5
foreach ($pair in @(@($env:USERPROFILE, '<HOME>'), @($env:USERNAME, '<USER>'), @($env:COMPUTERNAME, '<HOST>'))) {
  if ($pair[0] -and $pair[0].Length -gt 2) { $json = $json -replace [regex]::Escape($pair[0]), $pair[1] }
}
Set-Content -LiteralPath $file -Value $json -Encoding UTF8
$fails = @($results.checks | Where-Object { $_.status -eq 'FAIL' }).Count
Write-Host ''
Write-Host $(if ($fails) { "$fails blocking item(s). Nothing was changed." } else { 'No blocking items. Nothing was changed.' })
Write-Host "Report: $file"
