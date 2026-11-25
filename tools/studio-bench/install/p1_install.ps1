<#
GREENTEC studio-bench - P1 installer: ComfyUI portable + Qwen-Image-Edit-2511 multi-angle files.

SAFE BY DEFAULT: without -Execute it only prints what it WOULD do (dry run).
Everything it creates lives under C:\GREENTEC. It never touches drivers, PATH,
registry, system Python, Topaz or any other program. It needs no admin rights.

Stages (run one at a time, each after the owner's approval):
  -Stage ComfyUI   download ComfyUI v0.46.0 portable (2.09 GB), verify size + official SHA256
                   (GitHub release digest), extract to C:\GREENTEC\ComfyUI_v0.46.0, write
                   extra_model_paths.yaml, then check the bundled PyTorch against the GPU (env_check.py).
  -Stage Models    download the 5 pinned files (31.28 GB; -SkipOptional leaves out the 0.85 GB speed LoRA),
                   each verified by size + SHA256 from the manifest. Resumable.
  -Stage Verify    re-hash everything that is installed and print a summary.

Recovery: every step can be re-run. Partial downloads resume (*.partial). A file whose hash
does not match is moved to C:\GREENTEC\quarantine and downloaded once more; a second mismatch stops.
Rollback of P1: delete C:\GREENTEC\ComfyUI_v0.46.0 and C:\GREENTEC\models - nothing else was changed.

  powershell -NoProfile -ExecutionPolicy Bypass -File .\p1_install.ps1 -Stage ComfyUI            (dry run)
  powershell -NoProfile -ExecutionPolicy Bypass -File .\p1_install.ps1 -Stage ComfyUI -Execute   (real)
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('ComfyUI', 'Models', 'Verify')][string]$Stage,
  [switch]$Execute,
  [switch]$SkipOptional,
  [switch]$AllowNoDigest
)
$ErrorActionPreference = 'Stop'
$Manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'p1_manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Root = $Manifest.root
$Comfy = Join-Path $Root "ComfyUI_$($Manifest.comfyui.version)"
$Portable = Join-Path $Comfy 'ComfyUI_windows_portable'
$Py = Join-Path $Portable 'python_embeded\python.exe'
$Models = Join-Path $Root 'models'
$Dl = Join-Path $Root 'downloads'; $Logs = Join-Path $Root 'logs'; $Quar = Join-Path $Root 'quarantine'

function Say([string]$m, [string]$c = 'Gray') { Write-Host ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -ForegroundColor $c }
function Act([string]$what, [scriptblock]$do) {
  if ($Execute) { Say "DO   $what" 'Cyan'; & $do } else { Say "WOULD $what" 'Yellow' }
}
function Assert-Inside([string]$path) {  # guard: never write outside the GREENTEC root
  $full = [IO.Path]::GetFullPath($path); $r = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  if (-not $full.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) { throw "refusing to write outside $Root : $full" }
}
function Find-Exe([string]$name) {
  foreach ($d in ($env:PATH -split ';')) { if (-not $d -or $d -eq '.') { continue }; $p = Join-Path $d "$name.exe"; if (Test-Path -LiteralPath $p -PathType Leaf) { return $p } }
  throw "$name.exe not found on PATH"
}
function Get-DriverVersion {
  $smi = Find-Exe 'nvidia-smi'
  [double]((& $smi --query-gpu=driver_version --format=csv,noheader | Select-Object -First 1).Trim())
}
function Get-Sha256([string]$file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() }
function Download-Verified([string]$url, [string]$dest, [long]$size, [string]$sha) {
  Assert-Inside $dest
  if (Test-Path -LiteralPath $dest) {
    if ((Get-Item -LiteralPath $dest).Length -eq $size -and (-not $sha -or (Get-Sha256 $dest) -eq $sha)) { Say "OK   already present and verified: $(Split-Path -Leaf $dest)" 'Green'; return }
    Act "quarantine existing non-matching $(Split-Path -Leaf $dest)" { New-Item -ItemType Directory -Force $Quar | Out-Null; Move-Item -LiteralPath $dest -Destination (Join-Path $Quar ("{0}.{1}" -f (Split-Path -Leaf $dest), (Get-Date -Format 'yyyyMMddHHmmss'))) }
  }
  $part = "$dest.partial"; $curl = Find-Exe 'curl'
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    Act ("download ({0:N2} GB) {1}" -f ($size / 1GB), (Split-Path -Leaf $dest)) {
      New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
      & $curl -L --fail --retry 8 --retry-delay 10 --retry-all-errors -C - --output $part $url
      if ($LASTEXITCODE -ne 0) { throw "curl failed with exit code $LASTEXITCODE (re-run the same command to resume)" }
    }
    if (-not $Execute) { return }
    $len = (Get-Item -LiteralPath $part).Length
    if ($len -ne $size) { throw "size mismatch for $part : $len != $size (re-run to resume)" }
    if ($sha) {
      Say "hashing $(Split-Path -Leaf $dest) ..."
      $h = Get-Sha256 $part
      if ($h -ne $sha) {
        New-Item -ItemType Directory -Force $Quar | Out-Null
        Move-Item -LiteralPath $part -Destination (Join-Path $Quar ("{0}.bad-{1}" -f (Split-Path -Leaf $dest), (Get-Date -Format 'yyyyMMddHHmmss')))
        Say "SHA256 MISMATCH (got $h) - moved to quarantine" 'Red'
        if ($attempt -eq 2) { throw "SHA256 mismatch twice for $(Split-Path -Leaf $dest) - stopping" }
        continue
      }
    }
    Move-Item -LiteralPath $part -Destination $dest
    Say "OK   verified $(Split-Path -Leaf $dest)" 'Green'; return
  }
}

New-Item -ItemType Directory -Force $Logs | Out-Null
$log = Join-Path $Logs ("p1_install-{0}-{1}{2}.log" -f $Stage, (Get-Date -Format 'yyyyMMdd-HHmmss'), $(if ($Execute) { '' } else { '-dryrun' }))
Start-Transcript -LiteralPath $log | Out-Null
try {
  Say "P1 installer - stage $Stage - $(if ($Execute) {'EXECUTE'} else {'DRY RUN - nothing will be changed'})" 'White'
  Assert-Inside $Comfy; Assert-Inside $Models

  if ($Stage -eq 'ComfyUI') {
    $drv = Get-DriverVersion
    if ($drv -lt $Manifest.driver.min_version) {
      $msg = "NVIDIA driver $drv < $($Manifest.driver.min_version): update the driver first (INSTALL_PLAN_P1.md, step P1.1)."
      if ($Execute) { throw "$msg Nothing was changed." } else { Say "BLOCKER $msg (dry run continues to show the plan)" 'Red' }
    } else { Say "driver $drv OK (>= $($Manifest.driver.min_version))" 'Green' }
    $free = (Get-PSDrive -Name ($Root.Substring(0, 1))).Free
    if ($free -lt 60GB) { throw ("only {0:N1} GB free on {1} - need 60 GB" -f ($free / 1GB), $Root.Substring(0, 2)) }
    if (Test-Path -LiteralPath $Portable) { throw "$Portable already exists - leaving it untouched. Delete it yourself to reinstall." }

    $sha = $Manifest.comfyui.sha256
    if (-not $sha) {
      Say 'reading the official SHA256 digest from the GitHub release API ...'
      try {
        $rel = Invoke-RestMethod -Uri $Manifest.comfyui.api -Headers @{ 'User-Agent' = 'studio-bench' } -TimeoutSec 30
        $asset = $rel.assets | Where-Object { $_.name -eq $Manifest.comfyui.asset }
        if ($asset.digest -match '^sha256:([0-9a-f]{64})$') { $sha = $Matches[1]; Say "official digest: $sha" 'Green' }
        if ($asset.size -and [long]$asset.size -ne [long]$Manifest.comfyui.size) { throw "release size $($asset.size) differs from manifest $($Manifest.comfyui.size)" }
      } catch { Say "could not read the digest: $($_.Exception.Message)" 'Yellow' }
      if (-not $sha -and -not $AllowNoDigest) {
        $msg = 'No official SHA256 digest available (use -AllowNoDigest only after the owner approves; the computed hash will be logged).'
        if ($Execute) { throw "Stopping. $msg" } else { Say "BLOCKER $msg" 'Red' }
      }
    }
    $archive = Join-Path $Dl $Manifest.comfyui.asset
    Download-Verified $Manifest.comfyui.url $archive ([long]$Manifest.comfyui.size) $sha
    if ($Execute -and -not $sha) { Say "computed SHA256 (no official digest): $(Get-Sha256 $archive)" 'Yellow' }

    $tmp = Join-Path $Root '_extract_tmp'
    Act "extract $($Manifest.comfyui.asset) -> $Comfy (via $tmp)" {
      if (Test-Path -LiteralPath $tmp) { Assert-Inside $tmp; Remove-Item -LiteralPath $tmp -Recurse -Force }
      New-Item -ItemType Directory -Force $tmp | Out-Null
      $tar = Find-Exe 'tar'
      & $tar -xf $archive -C $tmp
      if ($LASTEXITCODE -ne 0) { throw "tar could not extract the archive (exit $LASTEXITCODE). Extract it in File Explorer into $tmp and re-run." }
      if (-not (Test-Path -LiteralPath (Join-Path $tmp 'ComfyUI_windows_portable\python_embeded\python.exe'))) { throw 'unexpected archive layout - python_embeded\python.exe missing' }
      New-Item -ItemType Directory -Force $Comfy | Out-Null
      Move-Item -LiteralPath (Join-Path $tmp 'ComfyUI_windows_portable') -Destination $Portable
      Remove-Item -LiteralPath $tmp -Recurse -Force
    }
    $yaml = Join-Path $Portable 'ComfyUI\extra_model_paths.yaml'
    Act "write $yaml -> models in $Models" {
      foreach ($sub in 'diffusion_models', 'text_encoders', 'vae', 'loras', 'clip_vision') { New-Item -ItemType Directory -Force (Join-Path $Models $sub) | Out-Null }
      $base = ($Models -replace '\\', '/') + '/'
      @("greentec:", "    base_path: $base", "    diffusion_models: diffusion_models/", "    text_encoders: text_encoders/", "    vae: vae/", "    loras: loras/", "    clip_vision: clip_vision/") |
        Set-Content -LiteralPath $yaml -Encoding ASCII
    }
    $envCheck = Join-Path (Split-Path -Parent $PSScriptRoot) 'env_check.py'
    Act 'check the bundled PyTorch against this GPU (env_check.py with the portable Python; ComfyUI is NOT started)' {
      & $Py -B $envCheck --disk $Root
      if ($LASTEXITCODE -ne 0) { throw "env_check failed (exit $LASTEXITCODE)" }
    }
    Say 'ComfyUI stage done. Next (after approval): -Stage Models' 'Green'
  }

  if ($Stage -eq 'Models') {
    if (-not (Test-Path -LiteralPath $Portable) -and $Execute) { throw 'ComfyUI stage not done yet' }
    $todo = $Manifest.models | Where-Object { $_.required -or -not $SkipOptional }
    $total = ($todo | Measure-Object size -Sum).Sum
    $free = (Get-PSDrive -Name ($Root.Substring(0, 1))).Free
    Say ("{0} files, {1:N2} GB; free {2:N1} GB" -f @($todo).Count, ($total / 1GB), ($free / 1GB))
    if ($free -lt ($total + 20GB)) { throw 'not enough free space (need files + 20 GB margin)' }
    foreach ($m in $todo) {
      $url = "https://huggingface.co/$($m.repo)/resolve/$($m.revision)/$($m.path)"
      Download-Verified $url (Join-Path (Join-Path $Models $m.dir) $m.name) ([long]$m.size) $m.sha256
    }
    Say 'Models stage done. Next: -Stage Verify, then p1_launch.ps1' 'Green'
  }

  if ($Stage -eq 'Verify') {
    $ok = $true
    foreach ($m in $Manifest.models) {
      $f = Join-Path (Join-Path $Models $m.dir) $m.name
      if (-not (Test-Path -LiteralPath $f)) { Say ("{0,-8} {1}" -f $(if ($m.required) { 'MISSING' } else { 'skipped' }), $m.name) $(if ($m.required) { 'Red' } else { 'Gray' }); if ($m.required) { $ok = $false }; continue }
      $h = Get-Sha256 $f
      if ($h -eq $m.sha256) { Say ("OK       {0}" -f $m.name) 'Green' } else { Say ("BAD HASH {0}" -f $m.name) 'Red'; $ok = $false }
    }
    Say $(if ($ok) { 'All required files verified.' } else { 'Verification FAILED - re-run -Stage Models' }) $(if ($ok) { 'Green' } else { 'Red' })
    if (-not $ok) { exit 1 }
  }
} catch {
  Say "STOPPED: $($_.Exception.Message)" 'Red'
  Say "Log: $log"
  Stop-Transcript | Out-Null
  exit 1
}
Say "Log: $log"
Stop-Transcript | Out-Null
