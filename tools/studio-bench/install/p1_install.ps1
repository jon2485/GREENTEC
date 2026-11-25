<#
GREENTEC studio-bench - P1 installer: ComfyUI portable + Qwen-Image-Edit-2511 multi-angle files.

DRY RUN BY DEFAULT. Without -Execute the script:
  - creates, moves, extracts, downloads or deletes NOTHING;
  - writes exactly one file: its log, <this folder>\results\p1_install-<stage>-<time>-dryrun.log;
  - uses the network only for read-only HEAD requests (allow-list check) and the GitHub release API;
  - proves it: it lists every file under the install root before and after, and reports any difference.
With -Execute it writes only under the install root (default C:\GREENTEC) and logs to <root>\logs.
It never touches drivers, PATH, registry, system Python, firewall, Topaz or any other program, and needs no admin rights.

Stages (one at a time, each after the owner's approval):
  -Stage ComfyUI  pinned v0.46.0 portable (2.09 GB): allow-list + size + SHA256 check, extraction into
                  <root>\ComfyUI_v0.46.0 through a temp folder, custom_nodes allow-list, torch version check,
                  then env_check.py --require-gpu with the bundled Python. ANY GPU/CUDA problem stops here,
                  before ComfyUI is ever started.
  -Stage Models   the pinned model files (31.28 GB; -SkipOptional leaves out the 0.85 GB speed LoRA).
  -Stage Verify   re-hash everything that is installed.

Recovery: re-run the same command. Partial downloads resume (*.partial). A file with a wrong hash goes
to <root>\quarantine and is downloaded once more; a second mismatch stops the script.
Rollback of P1: delete <root>\ComfyUI_v0.46.0 and <root>\models.

  powershell -NoProfile -ExecutionPolicy Bypass -File .\p1_install.ps1 -Stage ComfyUI            (dry run)
  powershell -NoProfile -ExecutionPolicy Bypass -File .\p1_install.ps1 -Stage ComfyUI -Execute   (real)
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('ComfyUI', 'Models', 'Verify')][string]$Stage,
  [switch]$Execute,
  [switch]$SkipOptional,
  [switch]$AllowNoDigest,
  [switch]$NoNetwork,
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'p1_manifest.json'),
  [string]$Root = '',
  [double]$MinFreeGB = 60,
  [double]$MarginGB = 20
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p1_lib.ps1')
$M = Read-Manifest $ManifestPath
if (-not $Root) { $Root = $M.root }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$Comfy = Join-Path $Root "ComfyUI_$($M.comfyui.version)"
$Portable = Join-Path $Comfy 'ComfyUI_windows_portable'
$Py = Join-Path $Portable 'python_embeded\python.exe'
$Models = Join-Path $Root 'models'; $Dl = Join-Path $Root 'downloads'; $Quar = Join-Path $Root 'quarantine'
$Allowed = @($M.allowed_download_hosts)
$ResultsDir = Join-Path $PSScriptRoot 'results'

function Say([string]$m, [string]$c = 'Gray') { Write-Host ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -ForegroundColor $c }
function Act([string]$what, [scriptblock]$do) { if ($Execute) { Say "DO    $what" 'Cyan'; & $do } else { Say "WOULD $what" 'Yellow' } }
function Fail-Or-Note([string]$msg) { if ($Execute) { throw $msg } else { Say "BLOCKER $msg" 'Red'; $script:Blockers++ } }
$script:Blockers = 0

function Assert-Sources([string]$url) {
  if ($NoNetwork) { Say "skip network check (-NoNetwork): $url" 'DarkGray'; return }
  if (-not (Test-HostAllowed $url $Allowed)) { Fail-Or-Note "URL host not on the allow-list: $url"; return }
  $chain = Get-RedirectChain $url (Find-Exe 'curl')
  $bad = @($chain | Where-Object { -not (Test-HostAllowed $_ $Allowed) } | ForEach-Object { ([Uri]$_).Host })
  if ($bad.Count) { Fail-Or-Note ("redirect to a host that is not allowed: {0}" -f ($bad -join ', ')) }
  else { Say ("sources OK: {0}" -f (@($chain | ForEach-Object { ([Uri]$_).Host }) -join ' -> ')) 'DarkGray' }
}

function Download-Verified([string]$url, [string]$dest, [long]$size, [string]$sha) {
  Assert-Inside $dest $Root
  Assert-Sources $url
  if (Test-Path -LiteralPath $dest) {
    if ((Get-Item -LiteralPath $dest).Length -eq $size -and (Get-Sha256Lower $dest) -eq $sha) { Say "OK    already present and verified: $(Split-Path -Leaf $dest)" 'Green'; return }
    Act "move non-matching existing $(Split-Path -Leaf $dest) to quarantine" {
      New-Item -ItemType Directory -Force $Quar | Out-Null
      Move-Item -LiteralPath $dest -Destination (Join-Path $Quar ("{0}.{1}" -f (Split-Path -Leaf $dest), (Get-Date -Format 'yyyyMMddHHmmss')))
    }
  }
  $part = "$dest.partial"; $curl = Find-Exe 'curl'
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    Act ("download ({0:N2} GB) {1}" -f ($size / 1GB), $url) {
      New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
      & $curl -L --fail --proto '=https' --proto-redir '=https' --max-redirs 6 --retry 8 --retry-delay 10 --retry-all-errors -C - --output $part $url
      if ($LASTEXITCODE -ne 0) { throw "curl failed with exit code $LASTEXITCODE (re-run the same command to resume)" }
    }
    if (-not $Execute) { return }
    $len = (Get-Item -LiteralPath $part).Length
    if ($len -ne $size) { throw "size mismatch for $part : $len != $size (re-run to resume)" }
    Say "hashing $(Split-Path -Leaf $dest) ..."
    $h = Get-Sha256Lower $part
    if ($h -ne $sha) {
      New-Item -ItemType Directory -Force $Quar | Out-Null
      Move-Item -LiteralPath $part -Destination (Join-Path $Quar ("{0}.bad-{1}-try{2}" -f (Split-Path -Leaf $dest), (Get-Date -Format 'yyyyMMddHHmmssfff'), $attempt))
      Say "SHA256 MISMATCH (got $h, expected $sha) - moved to quarantine" 'Red'
      if ($attempt -eq 2) { throw "SHA256 mismatch twice for $(Split-Path -Leaf $dest) - stopping" }
      continue
    }
    Move-Item -LiteralPath $part -Destination $dest
    Say "OK    verified $(Split-Path -Leaf $dest)" 'Green'; return
  }
}

# ---- log + dry-run proof ----
if ($Execute) { $LogDir = Join-Path $Root 'logs'; Assert-Inside $LogDir $Root; New-Item -ItemType Directory -Force $LogDir | Out-Null }
else { $LogDir = $ResultsDir; New-Item -ItemType Directory -Force $LogDir | Out-Null }
$log = Join-Path $LogDir ("p1_install-{0}-{1}{2}.log" -f $Stage, (Get-Date -Format 'yyyyMMdd-HHmmss'), $(if ($Execute) { '' } else { '-dryrun' }))
$before = if (-not $Execute) { @(Get-TreeSnapshot $Root @($ResultsDir)) } else { @() }
$rootExisted = Test-Path -LiteralPath $Root
Start-Transcript -LiteralPath $log | Out-Null
$exitCode = 0
try {
  Say ("P1 installer - stage {0} - {1} - root {2}" -f $Stage, $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN: nothing will be created, moved, extracted, downloaded or deleted' }), $Root) 'White'
  foreach ($td in @('C:\Program Files\Topaz Labs LLC', 'C:\Program Files\Topaz Labs', 'C:\ProgramData\Topaz Labs LLC')) { if (Test-Inside $Root $td) { throw "install root is inside a Topaz folder: $td" } }

  if ($Stage -eq 'ComfyUI') {
    $smi = Find-Exe 'nvidia-smi'
    if (-not $smi) { Fail-Or-Note 'nvidia-smi not found' }
    else {
      $drv = [double](Get-SmiValues $smi 'driver_version')[0]
      if ($drv -lt [double]$M.driver.min_version) { Fail-Or-Note "NVIDIA driver $drv < $($M.driver.min_version): update the driver first (INSTALL_PLAN_P1.md, P1.1). Nothing was changed." }
      else { Say "driver $drv OK (>= $($M.driver.min_version))" 'Green' }
    }
    $free = (Get-PSDrive -Name $Root.Substring(0, 1)).Free
    if ($free -lt $MinFreeGB * 1GB) { Fail-Or-Note ("only {0:N1} GB free on {1} - need {2} GB" -f ($free / 1GB), $Root.Substring(0, 2), $MinFreeGB) }
    if (Test-Path -LiteralPath $Portable) { Fail-Or-Note "$Portable already exists - left untouched. Delete it yourself to reinstall." }

    $sha = $M.comfyui.sha256
    if (-not $NoNetwork) {
      try {
        $rel = Invoke-RestMethod -Uri $M.comfyui.api -Headers @{ 'User-Agent' = 'greentec-studio-bench' } -TimeoutSec 30
        $asset = $rel.assets | Where-Object { $_.name -eq $M.comfyui.asset }
        if ($asset.digest -match '^sha256:([0-9a-f]{64})$') {
          if ($Matches[1] -ne $sha) { Fail-Or-Note "GitHub digest $($Matches[1]) differs from the pinned SHA256 $sha" } else { Say 'GitHub release digest matches the pinned SHA256' 'Green' }
        } else { Say 'GitHub API gave no digest - the pinned SHA256 is used' 'Yellow' }
        if ($asset.size -and [long]$asset.size -ne [long]$M.comfyui.size) { Fail-Or-Note "release size $($asset.size) differs from pinned $($M.comfyui.size)" }
      } catch { Say "GitHub API not reachable ($($_.Exception.Message)) - the pinned SHA256 is used" 'Yellow' }
    }
    if (-not $sha -and -not $AllowNoDigest) { Fail-Or-Note 'no SHA256 to verify against' }

    $archive = Join-Path $Dl $M.comfyui.asset
    Download-Verified $M.comfyui.url $archive ([long]$M.comfyui.size) $sha

    $tmp = Join-Path $Root '_extract_tmp'
    Act "extract $($M.comfyui.asset) into $Comfy (through $tmp)" {
      Assert-Inside $tmp $Root
      if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
      New-Item -ItemType Directory -Force $tmp | Out-Null
      & (Find-Exe 'tar') -xf $archive -C $tmp
      if ($LASTEXITCODE -ne 0) { throw "tar could not extract the archive (exit $LASTEXITCODE). Extract it in File Explorer into $tmp and re-run." }
      if (-not (Test-Path -LiteralPath (Join-Path $tmp 'ComfyUI_windows_portable\python_embeded\python.exe'))) { throw 'unexpected archive layout - python_embeded\python.exe missing' }
      New-Item -ItemType Directory -Force $Comfy | Out-Null
      Move-Item -LiteralPath (Join-Path $tmp 'ComfyUI_windows_portable') -Destination $Portable
      Remove-Item -LiteralPath $tmp -Recurse -Force
    }
    Act 'check custom_nodes contains only the two files shipped with ComfyUI' {
      $extra = Test-CustomNodes (Join-Path $Portable 'ComfyUI\custom_nodes') @($M.isolation.custom_nodes_allowed)
      if ($extra.Count) { throw ("unexpected custom nodes: {0}" -f ($extra -join ', ')) }
      foreach ($p in $M.isolation.custom_nodes_sha256.PSObject.Properties) {
        if ((Get-Sha256Lower (Join-Path $Portable "ComfyUI\custom_nodes\$($p.Name)")) -ne $p.Value) { throw "custom_nodes\$($p.Name) differs from the pinned file" }
      }
    }
    Act "check bundled PyTorch is $($M.comfyui.torch_version_expected)" {
      $tv = Get-Content -LiteralPath (Join-Path $Portable 'python_embeded\Lib\site-packages\torch\version.py') -Raw
      if ($tv -notmatch [regex]::Escape("__version__ = '$($M.comfyui.torch_version_expected)'")) { throw 'bundled torch version is not the pinned one' }
    }
    $yaml = Join-Path $Portable 'ComfyUI\extra_model_paths.yaml'
    Act "write $yaml (models live in $Models)" {
      foreach ($sub in 'diffusion_models', 'text_encoders', 'vae', 'loras', 'clip_vision') { New-Item -ItemType Directory -Force (Join-Path $Models $sub) | Out-Null }
      $base = ($Models -replace '\\', '/') + '/'
      @('greentec:', "    base_path: $base", '    diffusion_models: diffusion_models/', '    text_encoders: text_encoders/', '    vae: vae/', '    loras: loras/', '    clip_vision: clip_vision/') | Set-Content -LiteralPath $yaml -Encoding ASCII
    }
    $envCheck = Join-Path (Split-Path -Parent $PSScriptRoot) 'env_check.py'
    Act 'GPU gate: env_check.py --require-gpu with the bundled Python (ComfyUI is NOT started)' {
      & $Py -B $envCheck --disk $Root --require-gpu
      if ($LASTEXITCODE -ne 0) { throw "GPU gate FAILED (env_check exit $LASTEXITCODE): PyTorch does not see the GPU, lacks sm_120 kernels, or the bf16 test failed. ComfyUI must not be started. Send the env report." }
      Say 'GPU gate passed' 'Green'
    }
    Say 'ComfyUI stage finished. Next (after approval): -Stage Models' 'Green'
  }

  if ($Stage -eq 'Models') {
    if (-not (Test-Path -LiteralPath $Portable)) { Fail-Or-Note 'ComfyUI stage not done yet' }
    $todo = @($M.models | Where-Object { $_.required -or -not $SkipOptional })
    $total = ($todo | Measure-Object size -Sum).Sum
    $free = (Get-PSDrive -Name $Root.Substring(0, 1)).Free
    Say ("{0} files, {1:N2} GB; free {2:N1} GB" -f $todo.Count, ($total / 1GB), ($free / 1GB))
    if ($free -lt ($total + $MarginGB * 1GB)) { Fail-Or-Note ("not enough free space (files + {0} GB margin)" -f $MarginGB) }
    foreach ($m in $todo) {
      Download-Verified "https://huggingface.co/$($m.repo)/resolve/$($m.revision)/$($m.path)" (Join-Path (Join-Path $Models $m.dir) $m.name) ([long]$m.size) $m.sha256
    }
    Say 'Models stage finished. Next: -Stage Verify, then p1_launch.ps1' 'Green'
  }

  if ($Stage -eq 'Verify') {
    $ok = $true
    foreach ($m in $M.models) {
      $f = Join-Path (Join-Path $Models $m.dir) $m.name
      if (-not (Test-Path -LiteralPath $f)) { Say ("{0,-8} {1}" -f $(if ($m.required) { 'MISSING' } else { 'skipped' }), $m.name) $(if ($m.required) { 'Red' } else { 'Gray' }); if ($m.required) { $ok = $false }; continue }
      if ((Get-Sha256Lower $f) -eq $m.sha256) { Say ("OK       {0}" -f $m.name) 'Green' } else { Say ("BAD HASH {0}" -f $m.name) 'Red'; $ok = $false }
    }
    Say $(if ($ok) { 'All required files verified.' } else { 'Verification FAILED - re-run -Stage Models' }) $(if ($ok) { 'Green' } else { 'Red' })
    if (-not $ok) { $exitCode = 1 }
  }

  if (-not $Execute) {
    $after = @(Get-TreeSnapshot $Root @($ResultsDir))
    $diff = @(Compare-Object -ReferenceObject $before -DifferenceObject $after)
    if ($diff.Count -or ($rootExisted -ne (Test-Path -LiteralPath $Root))) { Say "DRY RUN CHANGED FILES UNDER $Root - this is a bug, please report it:" 'Red'; $diff | ForEach-Object { Say "  $($_.SideIndicator) $($_.InputObject)" 'Red' }; $exitCode = 3 }
    else { Say ("dry run verified: {0} file(s) under {1} unchanged; only this log was written: {2}" -f $before.Count, $Root, $log) 'Green' }
    if ($script:Blockers) { Say "$($script:Blockers) blocker(s) must be solved before -Execute" 'Red'; if ($exitCode -eq 0) { $exitCode = 2 } }
  }
} catch {
  Say "STOPPED: $($_.Exception.Message)" 'Red'
  $exitCode = 1
}
Say "Log: $log"
Stop-Transcript | Out-Null
exit $exitCode
