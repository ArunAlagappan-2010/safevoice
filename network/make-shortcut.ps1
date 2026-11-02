# Puts a "SafeVoice" icon on the desktop that starts everything with one double-click.
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $desktop 'SafeVoice.lnk'))
$lnk.TargetPath = Join-Path $root 'Start SafeVoice.bat'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = Join-Path $root 'public\icons\safevoice.ico'
$lnk.Description = 'Start SafeVoice: Wi-Fi, server and counsellor dashboard'
$lnk.Save()
Write-Host "Shortcut created on your desktop: SafeVoice"
