// ============================================================================
// later-life-planner — Azure infrastructure
// ============================================================================
// Deploys:
//   • Azure Container Registry (Basic)
//   • Log Analytics Workspace
//   • Container Apps Environment
//   • Azure Container App for the Next.js frontend
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

output acrLoginServer string = acr.properties.loginServer
output webAppUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
