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
// Shared Azure AI Speech account, created by hand and used by several apps —
// Azure allows one free (F0) account per kind per subscription, so this repo
// references it rather than creating one. Must be kind 'SpeechServices'; the
// multi-service 'AIServices' resource has no free tier.
param speechAccountName string = 'mwse-speech'
param speechResourceGroup string = 'rg-common'

module cosmos 'cosmos.bicep' = {
  name: 'crossfitclock-cosmos'
  scope: resourceGroup(cosmosResourceGroup)
  params: {
    accountName: cosmosAccountName
    databaseName: cosmosDatabaseName
  }
}

resource speech 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: speechAccountName
  scope: resourceGroup(speechResourceGroup)
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

// The managed functions read Cosmos and Speech config from app settings. Both
// keys are resolved at deployment time; neither lands in source or outputs.
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
    // Without these, /api/speech reports every clip failed and the client
    // falls back to the Web Speech voice.
    SPEECH_KEY: speech.listKeys().key1
    SPEECH_REGION: speech.location
  }
}

output swaHostname string = swa.properties.defaultHostname
