# Draws the SafeVoice icon (same shapes as public/logo.svg) at every size the
# website and the Android app need. Run again after changing the logo colours.
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$web = Join-Path $root 'public\icons'
$res = Join-Path $PSScriptRoot 'app\res'

function C($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

# bg: 'none' | 'tile' (rounded mist tile) | 'full' (edge-to-edge, for maskable icons)
function Draw-Icon([int]$size, [string]$bg, [double]$scale, [string]$out) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($bg -ne 'none') {
    $r = if ($bg -eq 'full') { 0 } else { $size * 0.22 }
    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($r -eq 0) { $p.AddRectangle($rect) } else {
      $d = $r * 2
      $p.AddArc(0, 0, $d, $d, 180, 90); $p.AddArc($size - $d, 0, $d, $d, 270, 90)
      $p.AddArc($size - $d, $size - $d, $d, $d, 0, 90); $p.AddArc(0, $size - $d, $d, $d, 90, 90); $p.CloseFigure()
    }
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (C '#eef6f3'), (C '#ece9f8'), 45
    $g.FillPath($bgBrush, $p)
  }
  # Logo drawn in a 64-unit box, centred and scaled.
  $u = $size * $scale / 64
  $off = ($size - 64 * $u) / 2
  $g.TranslateTransform($off, $off); $g.ScaleTransform($u, $u)

  $shield = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shield.AddLine(32, 4, 8, 12.5); $shield.AddLine(8, 12.5, 8, 30)
  $shield.AddBezier(8, 30, 8, 45.2, 18.1, 55.9, 32, 59.5)
  $shield.AddBezier(32, 59.5, 45.9, 55.9, 56, 45.2, 56, 30)
  $shield.AddLine(56, 30, 56, 12.5); $shield.CloseFigure()
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF 8, 4, 48, 56), (C '#3a958e'), (C '#7467bd'), 45
  $g.FillPath($grad, $shield)

  $bubble = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bubble.AddArc(19, 19.5, 10, 10, 180, 90); $bubble.AddArc(35, 19.5, 10, 10, 270, 90)
  $bubble.AddArc(35, 28.5, 10, 10, 0, 90); $bubble.AddLine(40, 38.5, 31.5, 38.5)
  $bubble.AddLine(31.5, 38.5, 25, 44); $bubble.AddLine(25, 44, 25, 38.5)
  $bubble.AddArc(19, 28.5, 10, 10, 90, 90); $bubble.CloseFigure()
  $g.FillPath([System.Drawing.Brushes]::White, $bubble)
  foreach ($dot in @(@(26, '#2a7c76'), @(32, '#5f7fa8'), @(38, '#7467bd'))) {
    $b = New-Object System.Drawing.SolidBrush (C $dot[1])
    $g.FillEllipse($b, $dot[0] - 2, 27, 4, 4)
  }
  $g.Dispose()
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Draw-Icon 192 'tile' 0.78 "$web\icon-192.png"
Draw-Icon 512 'tile' 0.78 "$web\icon-512.png"
Draw-Icon 512 'full' 0.56 "$web\icon-maskable-512.png"
Draw-Icon 180 'full' 0.70 "$web\apple-touch-icon.png"

# Android launcher icons (legacy square + round use the same tile).
$dens = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($k in $dens.Keys) { Draw-Icon $dens[$k] 'tile' 0.8 "$res\mipmap-$k\ic_launcher.png" }

# Windows .ico (PNG-compressed, 256 px) for the desktop shortcut.
$png = Join-Path $env:TEMP 'sv-ico.png'
Draw-Icon 256 'none' 1.0 $png
$bytes = [IO.File]::ReadAllBytes($png)
$ms = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $ms
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)
$w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0)
$w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$bytes.Length); $w.Write([uint32]22)
$w.Write($bytes); $w.Flush()
[IO.File]::WriteAllBytes("$web\safevoice.ico", $ms.ToArray())
Write-Host 'Icons written.'
