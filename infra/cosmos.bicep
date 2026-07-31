// Database + container inside an existing (serverless) Cosmos account.
// Serverless account: no throughput options on database or container.

param accountName string
param databaseName string

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
  }
}

output endpoint string = account.properties.documentEndpoint
