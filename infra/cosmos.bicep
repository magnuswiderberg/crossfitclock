// Database + container inside an existing Cosmos account.
// The account uses provisioned throughput on the free tier, so the container
// declares the 400 RU/s minimum — well inside the 1000 RU/s free allowance.

param accountName string
param databaseName string
param containerThroughput int = 400

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: accountName
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: account
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'data'
  properties: {
    resource: {
      id: 'data'
      partitionKey: {
        paths: ['/handle']
        kind: 'Hash'
      }
    }
    options: {
      throughput: containerThroughput
    }
  }
}

output endpoint string = account.properties.documentEndpoint
