<#
GREENTEC studio-bench - Topaz + driver snapshot (read-only), for the before/after driver comparison.

Records: NVIDIA driver version, installed Topaz products and versions (from the Windows "installed
programs" list in the registry, read-only), and - if given - the timing and SHA256 of a reference
Topaz output you produced by hand. Run it BEFORE the driver update (-Label before) and AFTER (-Label after).

Writes exactly one file: .\results\topaz-<label>-<time>.json

  powershell -NoProfile -ExecutionPolicy Bypass -File .\p1_topaz_snapshot.ps1 -Label before -JobSeconds 214 -OutputFile "D:\test\ref_out.mp4"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('before', 'after')][string]$Label,
  [double]$JobSeconds = 0,
  [string]$OutputFile = '',
  [string]$Notes = '',
  [string]$ReportDir = (Join-Path $PSScriptRoot 'results')
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p1_lib.ps1')
$smi = Find-Exe 'nvidia-smi'
$drv = if ($smi) { (Get-SmiValues $smi 'driver_version')[0] } else { 'nvidia-smi not found' }
$keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
$topaz = @(Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Topaz*' } |
           ForEach-Object { [ordered]@{ name = $_.DisplayName; version = $_.DisplayVersion } })
$out = [ordered]@{ label = $Label; time = (Get-Date).ToString('s'); nvidia_driver = $drv; topaz_installed = $topaz; reference_job_seconds = $JobSeconds; notes = $Notes }
if ($OutputFile) {
  if (Test-Path -LiteralPath $OutputFile) { $fi = Get-Item -LiteralPath $OutputFile; $out.reference_output = [ordered]@{ name = $fi.Name; bytes = $fi.Length; sha256 = (Get-Sha256Lower $fi.FullName) } }
  else { $out.reference_output = 'file not found' }
}
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$file = Join-Path $ReportDir ("topaz-{0}-{1}.json" -f $Label, (Get-Date -Format 'yyyyMMdd-HHmmss'))
($out | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $file -Encoding UTF8
Write-Host ("driver {0}; Topaz: {1}" -f $drv, $(if ($topaz.Count) { ($topaz | ForEach-Object { "$($_.name) $($_.version)" }) -join ', ' } else { 'none found' }))
Write-Host "Saved: $file"
