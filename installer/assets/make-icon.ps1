# Genera installer\assets\sobremesa.ico (el mismo dibujo que src/app/icon.tsx: estrella mostaza
# sobre verde). El .ico esta en el repo; este script solo hace falta si cambia el dibujo.
#
#   powershell -ExecutionPolicy Bypass -File installer\assets\make-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$star = @(@(12, 2.6), @(14.9, 8.5), @(21.4, 9.4), @(16.7, 14.0), @(17.8, 20.5), @(12, 17.4), @(6.2, 20.5), @(7.3, 14.0), @(2.6, 9.4), @(9.1, 8.5))
$sizes = @(16, 24, 32, 48, 64, 256)

function New-IconPng([int]$Size) {
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = [single]($Size * 14 / 64)
  $d = $radius * 2
  $edge = [single]($Size - 0.5)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($edge - $d, 0, $d, $d, 270, 90)
  $path.AddArc($edge - $d, $edge - $d, $d, $d, 0, 90)
  $path.AddArc(0, $edge - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $green = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#2f6b4f'))
  $g.FillPath($green, $path)

  $scale = $Size * 40 / 64 / 24
  $offset = $Size * 12 / 64
  $points = $star | ForEach-Object { New-Object System.Drawing.PointF([single]($offset + $_[0] * $scale), [single]($offset + $_[1] * $scale)) }
  $mustard = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#e3a21a'))
  $g.FillPolygon($mustard, [System.Drawing.PointF[]]$points)
  $g.Dispose()

  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  return , $stream.ToArray()
}

$images = $sizes | ForEach-Object { , (New-IconPng $_) }
$out = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($out)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dimension = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
  $offset += $images[$i].Length
}
foreach ($image in $images) { $writer.Write([byte[]]$image) }
$writer.Flush()
$file = Join-Path $PSScriptRoot 'sobremesa.ico'
[System.IO.File]::WriteAllBytes($file, $out.ToArray())
Write-Host "Icono: $file ($($out.Length) bytes)"
