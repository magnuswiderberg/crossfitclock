# Regenerates the fixed voice announcements in src/audio/ from Azure AI Speech.
# The clips are committed, so this only needs running when the voice, a style
# or the word list changes. Requires: az CLI, logged in with read access to the
# Speech account.
#
#   .\scripts\build-audio.ps1            # only missing clips
#   .\scripts\build-audio.ps1 -Force     # re-synthesize everything

param(
  [switch]$Force,
  [string]$Voice = 'en-US-AriaNeural',
  [string]$SpeechAccount = 'mwse-speech',
  [string]$SpeechResourceGroup = 'rg-common'
)

$ErrorActionPreference = 'Stop'
$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\audio'

# The app's fixed vocabulary. Custom exercise labels are synthesized on demand
# by /api/speech instead — same voice, same styles (api/src/functions/speech.ts
# holds the server-side copy; keep the styles in step).
$clips = @(
  @{ File = 'work';      Text = 'Work';      Style = 'excited' },
  @{ File = 'rest';      Text = 'Rest';      Style = 'shouting' },
  @{ File = 'get-ready'; Text = 'Get ready'; Style = 'excited' },
  @{ File = 'done';      Text = 'Done';      Style = 'excited' }
)

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory $outDir | Out-Null }

Write-Host "==> Reading Speech key for $SpeechAccount" -ForegroundColor Cyan
# Note: no `2>$null` on az calls - in PS 5.1 that wraps stderr in an
# ErrorRecord, which $ErrorActionPreference = 'Stop' turns terminating.
$key = az cognitiveservices account keys list --name $SpeechAccount --resource-group $SpeechResourceGroup --query key1 --output tsv
if ($LASTEXITCODE -ne 0 -or -not $key) { throw "Could not read the key for $SpeechAccount" }
$region = az cognitiveservices account show --name $SpeechAccount --resource-group $SpeechResourceGroup --query location --output tsv
if ($LASTEXITCODE -ne 0 -or -not $region) { throw "Could not read the region for $SpeechAccount" }

# The SSML goes to the service as a file: passing it inline lets PowerShell
# strip the embedded double quotes, and Set-Content -Encoding utf8 would add a
# BOM that the SSML parser rejects (both fail as an opaque HTTP 400).
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$ssmlPath = Join-Path $env:TEMP 'crossfitclock-ssml.xml'

foreach ($clip in $clips) {
  $target = Join-Path $outDir "$($clip.File).mp3"
  if ((Test-Path $target) -and -not $Force) {
    Write-Host "    $($clip.File).mp3 exists - skipping (use -Force to replace)" -ForegroundColor DarkGray
    continue
  }
  $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ' +
    'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">' +
    "<voice name=`"$Voice`"><mstts:express-as style=`"$($clip.Style)`">" +
    "$($clip.Text)</mstts:express-as></voice></speak>"
  [System.IO.File]::WriteAllText($ssmlPath, $ssml, $utf8NoBom)

  $status = curl.exe -s -w '%{http_code}' -X POST "https://$region.tts.speech.microsoft.com/cognitiveservices/v1" `
    -H "Ocp-Apim-Subscription-Key: $key" `
    -H 'Content-Type: application/ssml+xml' `
    -H 'X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3' `
    -H 'User-Agent: crossfitclock' `
    --data-binary "@$ssmlPath" --output $target
  if ($status -ne '200') { throw "Synthesis failed for '$($clip.Text)' (HTTP $status)" }
  Write-Host "    $($clip.File).mp3  '$($clip.Text)' [$($clip.Style)]  $((Get-Item $target).Length) bytes" -ForegroundColor Green
}

Remove-Item $ssmlPath -ErrorAction SilentlyContinue
Write-Host "==> Done" -ForegroundColor Green
