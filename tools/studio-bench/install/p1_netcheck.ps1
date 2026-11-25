<#
GREENTEC studio-bench - P1.0 INTERNET check (read-only).

Sends HEAD requests ONLY to the pinned download URLs in p1_manifest.json, follows their redirects
without downloading anything, and checks that every host in each chain is on the manifest's
allow-list. Separate from the local hardware check on purpose.

Writes exactly one file: <ReportDir>\p1_netcheck-<time>.json. Exit code: 0 = all OK, 2 = a URL failed
or redirected to a host that is not allowed.

  powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_netcheck.ps1
#>
[CmdletBinding()]
param(
  [string]$ManifestPath = '',
  [string]$ReportDir = ''
)
$ErrorActionPreference = 'Stop'
# NOTE: in Windows PowerShell 5.1 $PSScriptRoot is empty inside param() defaults, so defaults are resolved here.
if (-not $ManifestPath) { $ManifestPath = Join-Path $PSScriptRoot 'p1_manifest.json' }
if (-not $ReportDir) { $ReportDir = Join-Path $PSScriptRoot 'results' }
. (Join-Path $PSScriptRoot 'p1_lib.ps1')
$M = Read-Manifest $ManifestPath
$allowed = @($M.allowed_download_hosts)
$curl = Find-Exe 'curl'
if (-not $curl) { Write-Host 'curl.exe not found'; exit 2 }
$urls = @($M.comfyui.url) + @($M.models | ForEach-Object { "https://huggingface.co/$($_.repo)/resolve/$($_.revision)/$($_.path)" })
$rows = @(); $bad = 0
foreach ($u in $urls) {
  $chain = Get-RedirectChain $u $curl
  $notAllowed = @($chain | Where-Object { -not (Test-HostAllowed $_ $allowed) } | ForEach-Object { ([Uri]$_).Host })
  $final = & $curl -s -o NUL -I -L --proto '=https' --proto-redir '=https' --max-redirs 6 --max-time 60 -w '%{http_code}' $u
  $ok = ($final -eq '200') -and ($notAllowed.Count -eq 0)
  if (-not $ok) { $bad++ }
  $hosts = @($chain | ForEach-Object { ([Uri]$_).Host }) -join ' -> '
  Write-Host ("[{0}] HTTP {1}  {2}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $final, $hosts) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
  if ($notAllowed.Count) { Write-Host ("       not on the allow-list: {0}" -f ($notAllowed -join ', ')) -ForegroundColor Red }
  $rows += [ordered]@{ url = $u; http = $final; hosts = $hosts; not_allowed = $notAllowed; ok = $ok }
}
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$file = Join-Path $ReportDir ("p1_netcheck-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
([ordered]@{ tool = 'p1_netcheck v1'; time = (Get-Date).ToString('s'); allowed = $allowed; results = $rows } | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $file -Encoding UTF8
Write-Host ''; Write-Host $(if ($bad) { "$bad URL(s) failed. Nothing was downloaded." } else { 'All download sources reachable and on the allow-list. Nothing was downloaded.' })
Write-Host "Report: $file"
exit $(if ($bad) { 2 } else { 0 })
