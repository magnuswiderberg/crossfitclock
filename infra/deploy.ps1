# Full deploy: infra (Bicep) + app content (SWA CLI).
# Requires: az CLI (logged in), Node 20+. Run from anywhere.
#
#   .\infra\deploy.ps1

param(
  [string]$ResourceGroup = 'rg-magnuswiderbergse',
  [string]$SwaName = 'swa-crossfitclock'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Deploying infrastructure (Bicep)" -ForegroundColor Cyan
az deployment group create `
  --resource-group $ResourceGroup `
  --template-file (Join-Path $PSScriptRoot 'main.bicep') `
  --parameters swaName=$SwaName `
  --query properties.outputs `
  --output json
if ($LASTEXITCODE -ne 0) { throw 'Bicep deployment failed' }

Write-Host "==> Building app" -ForegroundColor Cyan
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'App build failed' }

  Write-Host "==> Deploying to Static Web App '$SwaName'" -ForegroundColor Cyan
  $token = az staticwebapp secrets list --name $SwaName --resource-group $ResourceGroup --query 'properties.apiKey' --output tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not fetch SWA deployment token' }

  npx --yes @azure/static-web-apps-cli deploy ./dist --api-location ./api --api-language node --api-version 22 --deployment-token $token --env production
  if ($LASTEXITCODE -ne 0) { throw 'SWA deploy failed' }
}
finally {
  Pop-Location
}

$hostname = az staticwebapp show --name $SwaName --resource-group $ResourceGroup --query 'defaultHostname' --output tsv
Write-Host "==> Done: https://$hostname" -ForegroundColor Green
