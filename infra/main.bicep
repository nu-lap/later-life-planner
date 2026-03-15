// ============================================================================
// later-life-planner — Azure Infrastructure
// ============================================================================
// Deploys:
//   • Azure Container Registry (Basic)
//   • Log Analytics Workspace
//   • Container Apps Environment
//   • ACA Job  — self-hosted Azure DevOps agent (scales 0→N per pipeline queue)
//   • ACA App  — the Next.js web app             (scales 0→3 per HTTP traffic)
// ============================================================================

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short prefix used in resource names')
param prefix string = 'llp'

@description('Name of the Azure Container Registry (must be globally unique, alphanumeric only)')
param acrName string

@description('Azure DevOps organisation URL, e.g. https://dev.azure.com/blackdog69')
param adoOrgUrl string = ''

@description('Azure DevOps agent pool name')
param adoPoolName string = ''

@secure()
@description('Azure DevOps Personal Access Token (needs Agent Pools: read & manage scope). Leave empty to skip the Azure Pipelines agent job.')
param adoToken string = ''

@secure()
@description('Anthropic API key for the web app')
param anthropicApiKey string

var adoEnabled = (adoToken != '' && adoOrgUrl != '' && adoPoolName != '')

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
  properties: { adminUserEnabled: false }
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

// ── Self-hosted ADO Agent — ACA Job ──────────────────────────────────────────
// Uses KEDA Azure Pipelines scaler.
// Starts a new container per queued pipeline job; exits (and deregisters) when done.
// minExecutions=0 means zero cost when idle.
resource agentJob 'Microsoft.App/jobs@2023-05-01' = if (adoEnabled) {
  name: 'job-ado-agent-${prefix}'
  location: location
  properties: {
    environmentId: cae.id
    configuration: {
      triggerType: 'Event'
      replicaTimeout: 1800      // 30 min max per pipeline run
      replicaRetryLimit: 0
      eventTriggerConfig: {
        replicaCompletionCount: 1
        parallelism: 1
        scale: {
          minExecutions: 0
          maxExecutions: 10
          pollingInterval: 30
          rules: [
            {
              name: 'azure-pipelines-scaler'
              type: 'azure-pipelines'
              metadata: {
                poolName: adoPoolName
                targetPipelinesQueueLength: '1'
              }
              auth: [
                {
                  secretRef: 'ado-pat'
                  triggerParameter: 'personalAccessToken'
                }
                {
                  secretRef: 'ado-org-url'
                  triggerParameter: 'organizationURL'
                }
              ]
            }
          ]
        }
      }
      secrets: [
        { name: 'ado-pat', value: adoToken }
        { name: 'ado-org-url', value: adoOrgUrl }
      ]
    }
    template: {
      containers: [
        {
          // Image built and pushed by infra/deploy.sh before first pipeline run
          image: '${acr.properties.loginServer}/ado-agent:latest'
          name: 'ado-agent'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'AZP_URL', value: adoOrgUrl }
            { name: 'AZP_TOKEN', secretRef: 'ado-pat' }
            { name: 'AZP_POOL', value: adoPoolName }
            { name: 'AZP_AGENT_NAME', value: 'aca-agent' }
          ]
        }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

resource agentJobAcrRole 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = if (adoEnabled) {
  name: guid(agentJob.id, acr.id, 'agent-acr-pull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: agentJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    agentJob
  ]
}

// ── Web App — ACA App ─────────────────────────────────────────────────────────
// HTTP ingress, scales to 0 replicas when no traffic.
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
        minReplicas: 0    // Scale to zero when idle
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

// ── Outputs ───────────────────────────────────────────────────────────────────
output acrLoginServer string = acr.properties.loginServer
output webAppUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output agentJobName string = agentJob.name
