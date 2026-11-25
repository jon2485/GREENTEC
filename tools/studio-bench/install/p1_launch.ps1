<#
GREENTEC studio-bench - start the P1 ComfyUI with layered network isolation, and watch it.

Layers (none of them changes the firewall or any system setting):
  1. No third-party code: --disable-all-custom-nodes, and the launcher refuses to start if
     custom_nodes holds anything but the two files shipped with ComfyUI (checked by SHA256).
     ComfyUI-Manager is not installed and --enable-manager is never passed.
  2. --offline: the web UI may not contact the internet; paid partner/API nodes are off.
  3. Fail-closed proxy: HTTP_PROXY/HTTPS_PROXY/ALL_PROXY point to a dead local port, so Python
     libraries that honour proxy settings cannot reach the internet; NO_PROXY keeps 127.0.0.1 working.
     HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE / HF_DATASETS_OFFLINE stop model-hub downloads.
  4. Listens on 127.0.0.1 only.
  5. Watchdog: every 2 seconds it lists the TCP connections of ComfyUI and its child processes.
     Any connection to a non-local address is logged with IP and port, and ComfyUI is stopped at once
     (use -WatchOnly to log without stopping). Limitation: code that opens raw sockets and ignores
     proxy settings can still TRY to connect - the watchdog sees it and stops ComfyUI, but the first
     packets may already be sent. Only an OS firewall rule blocks that; it is optional and needs the
     owner's explicit approval (INSTALL_PLAN_P1.md section 6).

  powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_launch.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 8188,
  [switch]$WatchOnly,
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'p1_manifest.json'),
  [string]$Root = ''
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p1_lib.ps1')
$M = Read-Manifest $ManifestPath
if (-not $Root) { $Root = $M.root }
$Portable = Join-Path $Root "ComfyUI_$($M.comfyui.version)\ComfyUI_windows_portable"
$Py = Join-Path $Portable 'python_embeded\python.exe'
if (-not (Test-Path -LiteralPath $Py)) { throw "ComfyUI not installed at $Portable (run p1_install.ps1 -Stage ComfyUI -Execute first)" }

# layer 1: custom_nodes allow-list
$cn = Join-Path $Portable 'ComfyUI\custom_nodes'
$extra = Test-CustomNodes $cn @($M.isolation.custom_nodes_allowed)
if ($extra.Count) { throw ("refusing to start: unexpected items in custom_nodes: {0}" -f ($extra -join ', ')) }
foreach ($p in $M.isolation.custom_nodes_sha256.PSObject.Properties) {
  $f = Join-Path $cn $p.Name
  if ((Test-Path -LiteralPath $f) -and (Get-Sha256Lower $f) -ne $p.Value) { throw "refusing to start: custom_nodes\$($p.Name) was modified" }
}

$In = Join-Path $Root 'project\input'; $Out = Join-Path $Root 'project\output'; $LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $In, $Out, $LogDir | Out-Null
$netlog = Join-Path $LogDir ("p1_network-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

# layer 3: environment for the ComfyUI process only (this window), nothing system-wide
foreach ($kv in $M.isolation.env.PSObject.Properties) { Set-Item -Path ("Env:{0}" -f $kv.Name) -Value $kv.Value }

# --disable-auto-launch: the browser is opened by this script, not by ComfyUI, so it is never a child
# of ComfyUI and its own internet traffic is not mistaken for ComfyUI traffic by the watchdog.
$argList = @('-s', (Join-Path $Portable 'ComfyUI\main.py'), '--windows-standalone-build', '--disable-auto-launch', '--disable-all-custom-nodes', '--offline',
             '--listen', '127.0.0.1', '--port', "$Port", '--input-directory', $In, '--output-directory', $Out)
$quoted = ($argList | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }) -join ' '
Write-Host "Starting ComfyUI on http://127.0.0.1:$Port  (isolation layers 1-5 active; network log: $netlog)" -ForegroundColor Green
$proc = Start-Process -FilePath $Py -ArgumentList $quoted -WorkingDirectory $Portable -NoNewWindow -PassThru
"$(Get-Date -Format s) started pid $($proc.Id)" | Add-Content -LiteralPath $netlog

$opened = $false; $t0 = Get-Date
# layer 5: watchdog
try {
  while (-not $proc.HasExited) {
    Start-Sleep -Seconds 2
    if (-not $opened -and ((Get-Date) - $t0).TotalSeconds -lt 300) {
      try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/system_stats" -UseBasicParsing -TimeoutSec 2; Start-Process "http://127.0.0.1:$Port/"; $opened = $true } catch { }
    }
    $ids = Get-ChildProcessIds $proc.Id
    $ext = Get-ExternalConnections $ids
    if ($ext.Count) {
      $msg = "$(Get-Date -Format s) EXTERNAL CONNECTION by ComfyUI: $($ext -join '; ')"
      $msg | Add-Content -LiteralPath $netlog
      Write-Host $msg -ForegroundColor Red
      if (-not $WatchOnly) {
        Write-Host 'Stopping ComfyUI (watchdog). Nothing was uploaded by this launcher; report the log.' -ForegroundColor Red
        foreach ($id in ($ids | Sort-Object -Descending)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
        break
      }
    }
  }
} finally {
  "$(Get-Date -Format s) ComfyUI ended" | Add-Content -LiteralPath $netlog
}
