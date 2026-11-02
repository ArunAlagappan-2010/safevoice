# Downloads a portable JDK 17 and the Android SDK pieces needed to build the
# SafeVoice APK into android\tools. Nothing is installed system-wide.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$tools = Join-Path $PSScriptRoot 'tools'
New-Item -ItemType Directory -Force $tools | Out-Null

function Get-Zip($url, $name) {
  $zip = Join-Path $tools "$name.zip"
  if (-not (Test-Path $zip)) {
    Write-Host "Downloading $name ..."
    Invoke-WebRequest -Uri $url -OutFile "$zip.part" -UseBasicParsing
    Move-Item "$zip.part" $zip
  }
  return $zip
}

# JDK 17 (Microsoft build of OpenJDK)
if (-not (Get-ChildItem $tools -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue)) {
  $z = Get-Zip 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip' 'jdk17'
  Expand-Archive $z -DestinationPath $tools -Force
}
$jdk = (Get-ChildItem $tools -Directory -Filter 'jdk-17*' | Select-Object -First 1).FullName
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"

# Android command-line tools -> tools\sdk\cmdline-tools\latest
$sdk = Join-Path $tools 'sdk'
$latest = Join-Path $sdk 'cmdline-tools\latest'
if (-not (Test-Path "$latest\bin\sdkmanager.bat")) {
  $z = Get-Zip 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' 'cmdline-tools'
  $tmp = Join-Path $tools 'cmdline-tmp'
  Expand-Archive $z -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force (Split-Path $latest) | Out-Null
  Move-Item (Join-Path $tmp 'cmdline-tools') $latest
  Remove-Item $tmp -Recurse
}

# Accept the SDK licenses (approved by the user) and fetch build-tools + platform
$sm = "$latest\bin\sdkmanager.bat"
$yes = Join-Path $tools 'yes.txt'
Set-Content $yes ("y`r`n" * 30) -Encoding ascii -NoNewline
cmd /c "`"$sm`" --sdk_root=`"$sdk`" --licenses < `"$yes`"" | Out-Null
& $sm --sdk_root=$sdk 'build-tools;34.0.0' 'platforms;android-34'
Write-Host "Android tools ready in $tools"
