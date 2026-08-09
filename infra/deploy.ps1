# Full deploy: infra (Bicep) + app content (SWA CLI).
# Requires: az CLI (logged in), Node 20+. Run from anywhere.
#
#   copy infra\deploy.local.example.json infra\deploy.local.json   (fill it in, once)
#   .\infra\deploy.ps1

param(
  [string]$ResourceGroup = 'rg-static-sites',
  [string]$SwaName = 'swa-crossfitclock',
  # Defaults match main.bicep's cosmosAccountName / cosmosResourceGroup; only
  # used to seed the easter-egg share code after the deploy.
  [string]$CosmosAccountName = 'mwse-cosmos',
  [string]$CosmosResourceGroup = 'rg-common',
  [string]$TenantId,
  [string]$SubscriptionId
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# The deploy target identifies someone's Azure directory, so it isn't hardcoded
# here. It comes from deploy.local.json (gitignored, sits beside this script);
# explicit parameters override it, and environment variables cover CI, where
# there's no working tree to drop a file into.
$configPath = Join-Path $PSScriptRoot 'deploy.local.json'
if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  if (-not $TenantId) { $TenantId = $config.tenantId }
  if (-not $SubscriptionId) { $SubscriptionId = $config.subscriptionId }
}
if (-not $TenantId) { $TenantId = $env:AZURE_TENANT_ID }
if (-not $SubscriptionId) { $SubscriptionId = $env:AZURE_SUBSCRIPTION_ID }

if (-not $TenantId -or -not $SubscriptionId) {
  # Single-quoted here-string: the $env: references are instructions to read,
  # not values to expand.
  throw @'
Deploy target not configured. Create infra\deploy.local.json (gitignored):

  copy infra\deploy.local.example.json infra\deploy.local.json

...then fill in tenantId and subscriptionId. Run `az account show` to see the
values for the currently active account (tenantId, and id = subscription).

Alternatives: pass -TenantId / -SubscriptionId, or set the environment
variables $env:AZURE_TENANT_ID and $env:AZURE_SUBSCRIPTION_ID (used by CI).
'@
}

# Every az command below silently targets whichever subscription happens to be
# active, so a stale login would deploy this app into the wrong directory.
Write-Host "==> Checking Azure login" -ForegroundColor Cyan
# Note: no `2>$null` on these az calls. Redirecting a native command's stderr
# in PS 5.1 wraps it in an ErrorRecord, which $ErrorActionPreference = 'Stop'
# turns terminating - az's own message would replace the guidance below.
$accountJson = az account show --output json
if ($LASTEXITCODE -ne 0 -or -not $accountJson) {
  throw "Not logged in to Azure. Run: az login --tenant $TenantId"
}
$account = $accountJson | ConvertFrom-Json

# Wrong subscription is recoverable without a re-login, as long as it's one the
# current identity can see; wrong tenant is not.
if ($account.id -ne $SubscriptionId) {
  Write-Host "    active subscription is '$($account.name)' - switching to $SubscriptionId" -ForegroundColor Yellow
  az account set --subscription $SubscriptionId
  if ($LASTEXITCODE -eq 0) { $account = az account show --output json | ConvertFrom-Json }
}

if ($account.tenantId -ne $TenantId -or $account.id -ne $SubscriptionId) {
  throw @"
Wrong Azure context.
  active:   tenant $($account.tenantId) / subscription $($account.id) ($($account.name))
  expected: tenant $TenantId / subscription $SubscriptionId
Run: az login --tenant $TenantId
"@
}
Write-Host "    $($account.name) as $($account.user.name)" -ForegroundColor DarkGray

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

Write-Host "==> Seeding the easter-egg share code" -ForegroundColor Cyan
# The landing page prints 7K4M as its example code, so it resolves to a real
# workout. Never fatal: a missing easter egg is not a broken deploy.
try {
  $cosmosEndpoint = az cosmosdb show --name $CosmosAccountName --resource-group $CosmosResourceGroup --query 'documentEndpoint' --output tsv
  $cosmosKey = az cosmosdb keys list --name $CosmosAccountName --resource-group $CosmosResourceGroup --query 'primaryMasterKey' --output tsv
  if ($LASTEXITCODE -ne 0 -or -not $cosmosEndpoint -or -not $cosmosKey) { throw 'could not read Cosmos credentials' }

  $env:COSMOS_ENDPOINT = $cosmosEndpoint
  $env:COSMOS_KEY = $cosmosKey
  node (Join-Path $root 'api/scripts/seed-share.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'seed script failed' }
}
catch {
  Write-Host "    skipped: $_" -ForegroundColor Yellow
}
finally {
  if (Test-Path Env:\COSMOS_ENDPOINT) { Remove-Item Env:\COSMOS_ENDPOINT }
  if (Test-Path Env:\COSMOS_KEY) { Remove-Item Env:\COSMOS_KEY }
}

$hostname = az staticwebapp show --name $SwaName --resource-group $ResourceGroup --query 'defaultHostname' --output tsv
Write-Host "==> Done: https://$hostname" -ForegroundColor Green
