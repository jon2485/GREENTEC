# GREENTEC studio-bench - shared functions for the P1 scripts (Windows PowerShell 5.1 compatible, ASCII only).
# Dot-sourced by p1_precheck.ps1, p1_netcheck.ps1, p1_install.ps1, p1_launch.ps1 and by the tests.

function Find-Exe([string]$Name) {
  # PATH only, never the current folder (Windows would otherwise run a stray copy from the working directory)
  $cwd = (Get-Location).ProviderPath.TrimEnd('\')
  foreach ($d in ($env:PATH -split ';')) {
    if (-not $d -or $d -eq '.') { continue }
    try { $full = [IO.Path]::GetFullPath($d).TrimEnd('\') } catch { continue }
    if ($full -ieq $cwd) { continue }
    $p = Join-Path $full "$Name.exe"
    if (Test-Path -LiteralPath $p -PathType Leaf) { return $p }
  }
  return $null
}

function Read-Manifest([string]$Path) {
  Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Test-Inside([string]$Path, [string]$Root) {
  $full = [IO.Path]::GetFullPath($Path); $r = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  return $full.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-Inside([string]$Path, [string]$Root) {
  if (-not (Test-Inside $Path $Root)) { throw "refusing to write outside $Root : $Path" }
}

function Test-HostAllowed([string]$Url, [string[]]$Allowed) {
  # exact host, or a sub-domain of an entry written as '.example.com'
  try { $u = [Uri]$Url } catch { return $false }
  if ($u.Scheme -ne 'https') { return $false }
  $h = $u.Host.ToLowerInvariant()
  foreach ($a in $Allowed) {
    $a = $a.ToLowerInvariant()
    if ($a.StartsWith('.')) { if ($h.EndsWith($a) -or $h -eq $a.Substring(1)) { return $true } }
    elseif ($h -eq $a) { return $true }
  }
  return $false
}

function Get-RedirectChain([string]$Url, [string]$Curl) {
  # HEAD request that follows redirects; returns every URL in the chain (start + each Location)
  $chain = @($Url)
  # no 2> redirection: in Windows PowerShell 5.1 redirected native stderr turns into errors under ErrorActionPreference=Stop
  $hdr = & $Curl -sIL --proto '=https' --proto-redir '=https' --max-redirs 6 --max-time 60 $Url
  foreach ($line in $hdr) {
    if ($line -match '^(?i)location:\s*(\S+)') {
      $loc = $Matches[1]
      if ($loc -notmatch '^https?://') { $base = [Uri]$chain[-1]; $loc = (New-Object Uri($base, $loc)).AbsoluteUri }
      $chain += $loc
    }
  }
  return ,$chain
}

function Get-TreeSnapshot([string]$Root, [string[]]$Exclude) {
  # list of "relative path|size|lastwrite" for every file under Root (used to prove that a dry run changed nothing)
  if (-not (Test-Path -LiteralPath $Root)) { return @() }
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  Get-ChildItem -LiteralPath $Root -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object {
    $f = $_.FullName; -not ($Exclude | Where-Object { $_ -and $f.StartsWith([IO.Path]::GetFullPath($_), [StringComparison]::OrdinalIgnoreCase) })
  } | ForEach-Object { '{0}|{1}|{2}' -f $_.FullName.Substring($rootFull.Length), $_.Length, $_.LastWriteTimeUtc.Ticks } | Sort-Object
}

function Get-Sha256Lower([string]$File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }

function Get-SmiValues([string]$Smi, [string]$Query) {
  $line = & $Smi "--query-gpu=$Query" '--format=csv,noheader,nounits' | Select-Object -First 1
  return @($line -split ',\s*')
}

function Test-CustomNodes([string]$Dir, [string[]]$AllowedNames) {
  # returns the names of anything in custom_nodes that is not on the allow-list
  if (-not (Test-Path -LiteralPath $Dir)) { return @() }
  return @(Get-ChildItem -LiteralPath $Dir -Force | Where-Object { $AllowedNames -notcontains $_.Name } | ForEach-Object { $_.Name })
}

function Test-IsLoopback([string]$Address) {
  if (-not $Address) { return $true }
  return ($Address -eq '0.0.0.0' -or $Address -eq '::' -or $Address -like '127.*' -or $Address -eq '::1' -or $Address -like '::ffff:127.*')
}

function Get-ExternalConnections([int[]]$ProcessIds) {
  # TCP connections of the given processes whose remote end is NOT this computer
  $conns = Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $ProcessIds -contains $_.OwningProcess }
  return @($conns | Where-Object { -not (Test-IsLoopback $_.RemoteAddress) } | ForEach-Object { '{0}:{1} ({2})' -f $_.RemoteAddress, $_.RemotePort, $_.State })
}

function Get-ChildProcessIds([int]$ParentId) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId)
  $ids = @($ParentId); $added = $true
  while ($added) {
    $added = $false
    foreach ($p in $all) { if (($ids -contains [int]$p.ParentProcessId) -and -not ($ids -contains [int]$p.ProcessId)) { $ids += [int]$p.ProcessId; $added = $true } }
  }
  return $ids
}
