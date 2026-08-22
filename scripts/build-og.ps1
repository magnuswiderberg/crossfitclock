# Renders scripts/og-card.html to public/og-image.png — the 1200x630 social card
# behind every link preview. Re-run after changing the headline or sub-line
# there (keep them in step with the hero on index.html).
#
# Needs a Chromium: Playwright's headless shell if it's on the machine
# (npx playwright install chromium puts it under %LOCALAPPDATA%\ms-playwright),
# otherwise Chrome or Edge from Program Files, or pass -Browser <path>.
param([string]$Browser)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if (-not $Browser) {
  $shell = Get-ChildItem "$env:LOCALAPPDATA\ms-playwright\chromium_headless_shell-*\chrome-headless-shell-win64\chrome-headless-shell.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
  $candidates = @(
    $shell
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }
  if (-not $candidates) { throw 'No Chromium found. Pass -Browser <path to chrome.exe>.' }
  $Browser = $candidates[0]
}

$src = 'file:///' + ((Join-Path $root 'scripts\og-card.html') -replace '\\', '/')
$out = Join-Path $root 'public\og-image.png'

# --virtual-time-budget lets the web fonts finish loading before the capture.
$flags = @(
  '--headless', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1200,630', '--virtual-time-budget=3000',
  "--screenshot=$out", $src
)
& $Browser @flags
if ($LASTEXITCODE -ne 0) { throw "Render failed ($LASTEXITCODE)" }
Write-Host "Wrote $out"
