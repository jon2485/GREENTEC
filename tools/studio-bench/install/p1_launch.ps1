<#
GREENTEC studio-bench - start the P1 ComfyUI locally and offline.

- Listens on 127.0.0.1 only (not reachable from the network).
- --offline: the web UI may not contact the internet; paid API nodes are disabled.
- HF_HUB_OFFLINE=1 / TRANSFORMERS_OFFLINE=1: Python code may not download models by itself.
- Inputs/outputs go to C:\GREENTEC\project\ (never inside Topaz or system folders).
Stop it with Ctrl+C in this window.

  powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_launch.ps1
#>
param([int]$Port = 8188)
$ErrorActionPreference = 'Stop'
$Manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'p1_manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Root = $Manifest.root
$Portable = Join-Path $Root "ComfyUI_$($Manifest.comfyui.version)\ComfyUI_windows_portable"
$Py = Join-Path $Portable 'python_embeded\python.exe'
if (-not (Test-Path -LiteralPath $Py)) { throw "ComfyUI not installed at $Portable (run p1_install.ps1 -Stage ComfyUI first)" }
$In = Join-Path $Root 'project\input'; $Out = Join-Path $Root 'project\output'
New-Item -ItemType Directory -Force $In, $Out | Out-Null
$env:HF_HUB_OFFLINE = '1'; $env:TRANSFORMERS_OFFLINE = '1'; $env:PYTHONUTF8 = '1'
Set-Location -LiteralPath $Portable
& $Py -s (Join-Path $Portable 'ComfyUI\main.py') --windows-standalone-build --listen 127.0.0.1 --port $Port --offline --input-directory $In --output-directory $Out
