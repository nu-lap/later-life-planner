// ============================================================================
// later-life-planner — Azure infrastructure
// ============================================================================
// Deploys:
//   • Azure Container Registry (Basic)
//   • Log Analytics Workspace
//   • Container Apps Environment
//   • Azure Container App for the Next.js frontend
//   • Azure Cosmos DB account + SQL database/container for encrypted persistence
//   • Azure Key Vault for wrapped-key support
//   • Managed identity role assignments for Cosmos DB + Key Vault
// ============================================================================

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short prefix used in resource names')
param prefix string = 'llp'

@description('Name of the Azure Container Registry (must be globally unique, alphanumeric only)')
param acrName string

@secure()
@description('Anthropic API key for the web app')
param anthropicApiKey string

@description('Name of the Cosmos DB account for planner persistence')
param cosmosAccountName string = 'cosmos-llp-uks'

@description('Cosmos DB SQL database name')
param cosmosDatabaseName string = 'later-life-planner'

@description('Cosmos DB SQL container name')
param cosmosContainerName string = 'user-plans'

@description('Name of the application Key Vault for wrapped-key support')
param keyVaultName string = 'kv-llp-app'

// ── Log Analytics ─────────────────────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'law-${prefix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Container Registry ────────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// ── Container Apps Environment ────────────────────────────────────────────────
resource cae 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-${prefix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ── Planner persistence resources ─────────────────────────────────────────────
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      }
    }
  }
}

resource cosmosSqlDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  name: '${cosmosAccount.name}/${cosmosDatabaseName}'
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource cosmosSqlContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  name: '${cosmosAccount.name}/${cosmosDatabaseName}/${cosmosContainerName}'
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

resource appKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

// ── Web App — ACA App ─────────────────────────────────────────────────────────
resource webApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-later-life-planner'
  location: location
  properties: {
    environmentId: cae.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        { name: 'anthropic-api-key', value: anthropicApiKey }
      ]
      registries: [
        {
          server: acr.properties.loginServer
          identity: 'SystemAssigned'
        }
      ]
    }
    template: {
      containers: [
        {
          // Placeholder image — replaced on first pipeline deploy
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          name: 'later-life-planner'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'ANTHROPIC_API_KEY'
              secretRef: 'anthropic-api-key'
            }
            {
              name: 'AZURE_COSMOSDB_ENDPOINT'
              value: cosmosAccount.properties.documentEndpoint
            }
            {
              name: 'AZURE_COSMOSDB_DATABASE'
              value: cosmosDatabaseName
            }
            {
              name: 'AZURE_COSMOSDB_CONTAINER'
              value: cosmosContainerName
            }
            {
              name: 'AZURE_KEY_VAULT_URL'
              value: appKeyVault.properties.vaultUri
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaler'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

resource webAppAcrRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(webApp.id, acr.id, 'webapp-acr-pull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    webApp
  ]
}

resource webAppCosmosDataRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-04-15' = {
  name: '${cosmosAccount.name}/${guid(cosmosAccount.id, webApp.identity.principalId, 'webapp-cosmos-data-contributor')}'
  properties: {
    principalId: webApp.identity.principalId
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    scope: cosmosAccount.id
  }
  dependsOn: [
    webApp
  ]
}

resource webAppKeyVaultCryptoUserRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(webApp.id, appKeyVault.id, 'webapp-keyvault-crypto-user')
  scope: appKeyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '12338af0-0e69-4776-bea7-57ae8d297424')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    webApp
  ]
}

output acrLoginServer string = acr.properties.loginServer
output webAppUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabase string = cosmosDatabaseName
output cosmosContainer string = cosmosContainerName
output keyVaultUrl string = appKeyVault.properties.vaultUri
