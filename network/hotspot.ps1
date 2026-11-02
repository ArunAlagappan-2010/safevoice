# SafeVoice local network: turns this laptop into a Wi-Fi access point using
# Windows Mobile Hotspot. No modem, router or internet needed.
# Phones join the "SafeVoice" Wi-Fi and open http://192.168.137.1:3000
#
#   powershell -ExecutionPolicy Bypass -File hotspot.ps1 -Action start -KeepAlive
#   powershell -ExecutionPolicy Bypass -File hotspot.ps1 -Action stop
#   powershell -ExecutionPolicy Bypass -File hotspot.ps1 -Action status
#
# Must run in Windows PowerShell 5.1 (powershell.exe), not PowerShell 7.
param(
  [ValidateSet('start', 'stop', 'status', 'firewall')] [string]$Action = 'start',
  [string]$Ssid,
  [string]$Password,
  [int]$Port = 3000,
  [switch]$KeepAlive
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root '.env'

function Read-EnvValue($name) {
  if (Test-Path $EnvFile) {
    $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
    if ($line) { return ($line -split '=', 2)[1].Trim().Trim('"') }
  }
  return $null
}

function Write-EnvValue($name, $value) {
  $lines = @()
  if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile | Where-Object { $_ -notmatch "^\s*$name\s*=" }) }
  $lines += "$name=$value"
  Set-Content -Path $EnvFile -Value $lines -Encoding ascii
}

if (-not $Ssid) { $Ssid = Read-EnvValue 'HOTSPOT_SSID' }
if (-not $Ssid) { $Ssid = 'SafeVoice' }
if (-not $Password) { $Password = Read-EnvValue 'HOTSPOT_PASSWORD' }
if (-not $Password) { $Password = 'safevoice2026' }
if ($Password.Length -lt 8) { throw 'Wi-Fi password must be at least 8 characters.' }

# ---------- firewall: allow phones on the local network to reach the app ----------
function Ensure-Firewall {
  $name = "SafeVoice (TCP $Port, local network)"
  if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) { return }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdmin) {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port `
      -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null
    Write-Host "Firewall: phones on the local network may now reach port $Port."
  } else {
    Write-Host 'Firewall: asking for administrator permission once, to let phones reach the app...'
    Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Action', 'firewall', '-Port', $Port)
  }
}

if ($Action -eq 'firewall') { Ensure-Firewall; exit 0 }

# ---------- Windows Runtime helpers ----------
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Await($op, [Type]$type) {
  $t = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
function AwaitAction($op) { $t = $asTaskAction.Invoke($null, @($op)); $t.Wait(-1) | Out-Null }

$NI = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
$TM = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
$ResultType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]

function Get-Manager {
  # With internet: share it. Without internet (school, no modem): any profile works;
  # the hotspot still runs and phones reach this laptop directly.
  $prof = $NI::GetInternetConnectionProfile()
  if (-not $prof) {
    $prof = $NI::GetConnectionProfiles() | Where-Object {
      $TM::GetTetheringCapabilityFromConnectionProfile($_) -eq 'Enabled' } | Select-Object -First 1
  }
  if (-not $prof) { throw 'No network profile found to host the hotspot. Connect to any Wi-Fi once, or plug in a network cable, then try again.' }
  if ($TM::GetTetheringCapabilityFromConnectionProfile($prof) -ne 'Enabled') {
    throw "Mobile Hotspot is not allowed on this PC ($($TM::GetTetheringCapabilityFromConnectionProfile($prof)))."
  }
  $TM::CreateFromConnectionProfile($prof)
}

function Start-Hotspot($m) {
  $cfg = $m.GetCurrentAccessPointConfiguration()
  if ($cfg.Ssid -ne $Ssid -or $cfg.Passphrase -ne $Password) {
    $cfg.Ssid = $Ssid
    $cfg.Passphrase = $Password
    AwaitAction ($m.ConfigureAccessPointAsync($cfg))
  }
  if ($m.TetheringOperationalState -ne 'On') {
    $r = Await ($m.StartTetheringAsync()) $ResultType
    if ($r.Status -ne 'Success') { throw "Could not start hotspot: $($r.Status) $($r.AdditionalErrorMessage)" }
  }
}

$m = Get-Manager

switch ($Action) {
  'status' {
    Write-Host "Hotspot: $($m.TetheringOperationalState)   Wi-Fi: $($m.GetCurrentAccessPointConfiguration().Ssid)   Phones connected: $($m.ClientCount)/$($m.MaxClientCount)"
  }
  'stop' {
    $r = Await ($m.StopTetheringAsync()) $ResultType
    Write-Host "Hotspot stopped ($($r.Status))."
  }
  'start' {
    Ensure-Firewall
    Write-EnvValue 'HOTSPOT_SSID' $Ssid
    Write-EnvValue 'HOTSPOT_PASSWORD' $Password
    Start-Hotspot $m
    Write-Host ''
    Write-Host "  Wi-Fi network : $Ssid"
    Write-Host "  Password      : $Password"
    Write-Host "  Phones open   : http://192.168.137.1:$Port/"
    Write-Host "  Max phones    : $($m.MaxClientCount)"
    Write-Host ''
    if ($KeepAlive) {
      $Host.UI.RawUI.WindowTitle = 'SafeVoice Wi-Fi'
      Write-Host 'Keeping the hotspot on. Leave this window open (minimise it). Ctrl+C to stop.'
      while ($true) {
        Start-Sleep -Seconds 15
        try {
          $m = Get-Manager
          if ($m.TetheringOperationalState -ne 'On') {
            Write-Host "$(Get-Date -Format HH:mm:ss) Hotspot was off, turning it back on..."
            Start-Hotspot $m
          }
        } catch { Write-Host "$(Get-Date -Format HH:mm:ss) $($_.Exception.Message)" }
      }
    }
  }
}
