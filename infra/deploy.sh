#!/bin/bash
# ============================================================================
# infra/deploy.sh — One-time Azure infrastructure setup for later-life-planner
# ============================================================================
# Run this once from your local machine before the first pipeline run.
# Prerequisites:
#   • Azure CLI installed and logged in  (az login)
#   • Docker installed locally
#   • Access to Azure subscription 81c7ddc0-db49-4fb3-809c-776e3756f2ea
#
# Usage:
#   chmod +x infra/deploy.sh
#   ./infra/deploy.sh
# ============================================================================
set -euo pipefail

SUBSCRIPTION_ID="81c7ddc0-db49-4fb3-809c-776e3756f2ea"
RESOURCE_GROUP="rg-later-life-planner"
LOCATION="uksouth"
ACR_NAME="acrblackdog69llp"
PREFIX="llp"

echo ""
echo "=== later-life-planner Azure Setup ==="
echo ""
read -rsp "Anthropic API Key: " ANTHROPIC_API_KEY
echo ""
echo ""

echo ">> Setting subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

echo ">> Creating resource group: $RESOURCE_GROUP ($LOCATION)..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo ">> Deploying infrastructure (Bicep)..."
DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters \
    location="$LOCATION" \
    prefix="$PREFIX" \
    acrName="$ACR_NAME" \
    anthropicApiKey="$ANTHROPIC_API_KEY" \
  --output json)

ACR_LOGIN_SERVER=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.acrLoginServer.value')
WEB_APP_URL=$(echo "$DEPLOY_OUTPUT" | jq -r '.properties.outputs.webAppUrl.value')

echo ">> ACR: $ACR_LOGIN_SERVER"
echo ">> Web App URL: $WEB_APP_URL"

echo ""
echo "============================================================"
echo " Infrastructure deployed successfully!"
echo "============================================================"
echo ""
echo " Web App URL  : $WEB_APP_URL  (placeholder until first pipeline run)"
echo " ACR          : $ACR_LOGIN_SERVER"
echo " Resource Grp : $RESOURCE_GROUP"
echo ""
echo "Next steps:"
echo "  1. Push your changes to GitHub."
echo "  2. The repo's CI/CD workflow will build/push the container and update the Container App."
echo "============================================================"
