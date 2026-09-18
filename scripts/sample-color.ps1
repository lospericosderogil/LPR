Add-Type -AssemblyName System.Drawing
$imgPath = 'C:\Users\41636428\.gemini\antigravity\brain\757139d8-a305-45c4-b9db-bada28b38772\.user_uploaded\media_1789745106115.png'
$bmp = New-Object System.Drawing.Bitmap($imgPath)
$w = $bmp.Width
$h = $bmp.Height
Write-Host "Dimensions: $w x $h"

$redX = @()
$redY = @()
for ($x = 0; $x -lt $w; $x++) {
    for ($y = 0; $y -lt $h; $y++) {
        $c = $bmp.GetPixel($x, $y)
        if ($c.R -gt 200 -and $c.G -lt 50 -and $c.B -lt 50) {
            $redX += $x
            $redY += $y
        }
    }
}
$minX = ($redX | Measure-Object -Minimum).Minimum
$maxX = ($redX | Measure-Object -Maximum).Maximum
$minY = ($redY | Measure-Object -Minimum).Minimum
$maxY = ($redY | Measure-Object -Maximum).Maximum
Write-Host "Red box bounds: X: $minX to $maxX, Y: $minY to $maxY"

$centerX = [int](($minX + $maxX) / 2)
$centerY = [int](($minY + $maxY) / 2)
$targetColor = $bmp.GetPixel($centerX, $centerY)
$hex = "#{0:X2}{1:X2}{2:X2}" -f $targetColor.R, $targetColor.G, $targetColor.B
Write-Host "TARGET COLOR: R=$($targetColor.R), G=$($targetColor.G), B=$($targetColor.B) -> Hex: $hex"
$bmp.Dispose()
