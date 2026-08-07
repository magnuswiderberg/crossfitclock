// Deploys the Static Web App (app + managed functions) into the target
// resource group, and the Cosmos database/container into the resource group
// that holds the existing Cosmos account.
//
//   az deployment group create -g rg-static-sites -f infra/main.bicep
//
// See infra/deploy.ps1 for the full deploy (infra + app content).

param swaName string = 'swa-crossfitclock'
// Static Web Apps only run in a handful of regions. West Europe would be
// closest to the Sweden Central Cosmos account, but it is currently closed to
// new customers ("RequestDisallowedByAzure"), so this uses East US 2 — the
// resource group's own region. Sync is one round trip on app load, so the
// extra hop to Cosmos is not felt during a workout.
param location string = 'eastus2'
param cosmosAccountName string = 'mwse-cosmos'
param cosmosResourceGroup string = 'rg-common'
param cosmosDatabaseName string = 'crossfitclock'

module cosmos 'cosmos.bicep' = {
  name: 'crossfitclock-cosmos'
  scope: resourceGroup(cosmosResourceGroup)
  params: {
    accountName: cosmosAccountName
    databaseName: cosmosDatabaseName
  }
}

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// The managed functions read Cosmos config from app settings. The key is
// resolved at deployment time; it never lands in source or outputs.
resource swaSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    COSMOS_ENDPOINT: cosmos.outputs.endpoint
    COSMOS_KEY: listKeys(
      resourceId(subscription().subscriptionId, cosmosResourceGroup, 'Microsoft.DocumentDB/databaseAccounts', cosmosAccountName),
      '2024-05-15'
    ).primaryMasterKey
    COSMOS_DATABASE: cosmosDatabaseName
  }
}

output swaHostname string = swa.properties.defaultHostname
