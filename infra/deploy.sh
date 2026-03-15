#!/bin/bash
# ============================================================================
# infra/deploy.sh — One-time Azure infrastructure setup for later-life-planner
# ============================================================================
# Run this once from your local machine before the first pipeline run.
# Prerequisites:
#   • Azure CLI installed and logged in  (az login)
#   • Docker installed locally           (needed to push the agent image)
#   • Access to Azure subscription 81c7ddc0-db49-4fb3-809c-776e3756f2ea
#
# Usage:
#   chmod +x infra/deploy.sh
#   ./infra/deploy.sh
# ============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SUBSCRIPTION_ID="81c7ddc0-db49-4fb3-809c-776e3756f2ea"
RESOURCE_GROUP="rg-later-life-planner"
LOCATION="uksouth"                # UK South (London)
ACR_NAME="acrblackdog69llp"       # Must be globally unique & alphanumeric
PREFIX="llp"
ADO_ORG_URL="https://dev.azure.com/blackdog69"
ADO_POOL_NAME="BlackDog-ACA-Pool"
ADO_PROJECT_NAME="later-life-planner"

# ── Prompt for secrets (not stored in files) ──────────────────────────────────
echo ""
echo "=== later-life-planner Azure Setup ==="
echo ""
read -rsp "Azure DevOps PAT (Agent Pools: read & manage + Build: read & execute, leave empty to skip): " AZP_TOKEN
echo ""
read -rsp "Anthropic API Key: " ANTHROPIC_API_KEY
echo ""
echo ""

if [ -n "$AZP_TOKEN" ]; then
  ENABLE_ADO_AGENT=true
else
  ENABLE_ADO_AGENT=false
  echo ""
  echo "No Azure DevOps PAT provided; the self-hosted agent job will be omitted."
  echo ""
fi

# ── Azure subscription ────────────────────────────────────────────────────────
echo ">> Setting subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

# ── Resource group ────────────────────────────────────────────────────────────
echo ">> Creating resource group: $RESOURCE_GROUP ($LOCATION)..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# ── Deploy Bicep infrastructure ───────────────────────────────────────────────
echo ">> Deploying infrastructure (Bicep)..."
DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters \
    location="$LOCATION" \
    prefix="$PREFIX" \
    acrName="$ACR_NAME" \
    adoOrgUrl="$ADO_ORG_URL" \
    adoPoolName="$ADO_POOL_NAME" \
    adoToken="$AZP_TOKEN" \
    anthropicApiKey="$ANTHROPIC_API_KEY" \
  --output json)

ACR_LOGIN_SERVER=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.acrLoginServer.value')
WEB_APP_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.webAppUrl.value')

echo ">> ACR: $ACR_LOGIN_SERVER"
echo ">> Web App URL: $WEB_APP_URL"

# ── Build and push the ADO agent image ───────────────────────────────────────
if [ "$ENABLE_ADO_AGENT" = true ]; then
  echo ">> Logging in to ACR..."
  az acr login --name "$ACR_NAME"

  echo ">> Building ADO agent image..."
  docker build \
    -t "$ACR_LOGIN_SERVER/ado-agent:latest" \
    -f "$(dirname "$0")/agent.Dockerfile" \
    "$(dirname "$0")"

  echo ">> Pushing ADO agent image..."
  docker push "$ACR_LOGIN_SERVER/ado-agent:latest"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " Infrastructure deployed successfully!"
echo "============================================================"
echo ""
echo " Web App URL  : $WEB_APP_URL  (placeholder until first pipeline run)"
echo " ACR          : $ACR_LOGIN_SERVER"
echo " Resource Grp : $RESOURCE_GROUP"
echo ""
if [ "$ENABLE_ADO_AGENT" = true ]; then
  echo " ── Next steps in Azure DevOps (dev.azure.com/blackdog69) ──"
  echo ""
  echo " 1. Create a new project named: $ADO_PROJECT_NAME"
  echo "    https://dev.azure.com/blackdog69/_new"
  echo ""
  echo " 2. Create agent pool named: $ADO_POOL_NAME"
  echo "    Project Settings → Agent pools → Add pool → Self-hosted"
  echo "    (Grant access permission to all pipelines)"
  echo ""
  echo " 3. Connect your GitHub repo:"
  echo "    Project Settings → Service connections → New → GitHub"
  echo "    Name it: github-connection"
  echo "    Repo: https://github.com/durbs182/later-life-planner"
  echo ""
  echo " 4. Create Azure service connection:"
  echo "    Project Settings → Service connections → New → Azure Resource Manager"
  echo "    Auth method: Service principal (automatic)"
  echo "    Scope: Subscription 81c7ddc0-db49-4fb3-809c-776e3756f2ea"
  echo "    Resource group: $RESOURCE_GROUP"
  echo "    Name it: azure-service-connection"
  echo "    Grant access to all pipelines"
  echo ""
  echo "    Then grant the service principal these roles on the resource group:"
  echo "      az role assignment create \\"
  echo "        --assignee <service-principal-id> \\"
  echo "        --role AcrPush \\"
  echo "        --scope \$(az acr show -n $ACR_NAME --query id -o tsv)"
  echo "      az role assignment create \\"
  echo "        --assignee <service-principal-id> \\"
  echo "        --role Contributor \\"
  echo "        --scope \$(az group show -n $RESOURCE_GROUP --query id -o tsv)"
  echo ""
  echo " 5. Create a variable group:"
  echo "    Pipelines → Library → + Variable group"
  echo "    Name: later-life-planner-secrets"
  echo "    Add variable: ANTHROPIC_API_KEY (mark as secret)"
  echo ""
  echo " 6. Create the pipeline:"
  echo "    Pipelines → New pipeline → GitHub → later-life-planner"
  echo "    → Existing Azure Pipelines YAML → azure-pipelines.yml"
  echo ""
  echo " 7. Authorise the variable group for the pipeline:"
  echo "    Library → later-life-planner-secrets → Pipeline permissions"
  echo ""
  echo " Done! Push to main to trigger your first build."
else
  echo "Azure DevOps PAT was not supplied, so the Azure Pipelines agent job was skipped."
  echo "Use GitHub Actions (CI/CD workflow) as the canonical pipeline instead."
fi
echo "============================================================"
