# Builds SafeVoice.apk with the plain Android SDK tools (no Gradle, no Android Studio).
# Run android\setup-tools.ps1 once first. Output: android\SafeVoice.apk, also copied to
# public\download\SafeVoice.apk so phones can download it from the SafeVoice server.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$tools = Join-Path $here 'tools'
$jdk = (Get-ChildItem $tools -Directory -Filter 'jdk-17*' | Select-Object -First 1).FullName
if (-not $jdk) { throw 'Run android\setup-tools.ps1 first.' }
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"
$sdk = Join-Path $tools 'sdk'
$bt = Join-Path $sdk 'build-tools\34.0.0'
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'
$app = Join-Path $here 'app'
$out = Join-Path $here 'build'

if (Test-Path $out) { Remove-Item $out -Recurse -Force }   # build output only, regenerated every time
New-Item -ItemType Directory -Force "$out\gen", "$out\classes", "$out\dex" | Out-Null

function Run($exe) {
  & $exe @args
  if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed ($LASTEXITCODE)" }
}

Write-Host '1/6 Compiling resources'
Run "$bt\aapt2.exe" compile --dir "$app\res" -o "$out\res.zip"

Write-Host '2/6 Linking manifest, resources and assets'
Run "$bt\aapt2.exe" link -o "$out\unsigned.apk" -I $androidJar --manifest "$app\AndroidManifest.xml" `
  -A "$app\assets" --java "$out\gen" --min-sdk-version 21 --target-sdk-version 34 `
  --version-code 1 --version-name 1.0 "$out\res.zip"

Write-Host '3/6 Compiling Java'
$sources = Get-ChildItem "$app\src", "$out\gen" -Recurse -Filter *.java | ForEach-Object FullName
Run "$jdk\bin\javac.exe" --release 8 -nowarn -encoding UTF-8 -classpath $androidJar -d "$out\classes" @sources

Write-Host '4/6 Converting to Android bytecode'
$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName
Run "$bt\d8.bat" --release --min-api 21 --lib $androidJar --output "$out\dex" @classes

Write-Host '5/6 Packaging'
Push-Location "$out\dex"
try { Run "$bt\aapt.exe" add "$out\unsigned.apk" classes.dex | Out-Null } finally { Pop-Location }
Run "$bt\zipalign.exe" -f -p 4 "$out\unsigned.apk" "$out\aligned.apk"

Write-Host '6/6 Signing'
$ks = Join-Path $here 'safevoice.keystore'
if (-not (Test-Path $ks)) {
  Run "$jdk\bin\keytool.exe" -genkeypair -keystore $ks -alias safevoice -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass safevoice -keypass safevoice -dname 'CN=SafeVoice, O=SafeVoice Hackathon, C=IN'
}
$apk = Join-Path $here 'SafeVoice.apk'
Run "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:safevoice --key-pass pass:safevoice --out $apk "$out\aligned.apk"
Run "$bt\apksigner.bat" verify $apk

$dl = Join-Path (Split-Path $here) 'public\download'
New-Item -ItemType Directory -Force $dl | Out-Null
Copy-Item $apk (Join-Path $dl 'SafeVoice.apk') -Force
Write-Host ("Built {0} ({1:N0} KB)" -f $apk, ((Get-Item $apk).Length / 1KB))
