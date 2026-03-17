# Azure Architecture

Status: draft

This document defines the Azure-side architecture for Later-Life Planner.

It covers:

- the current production deployment topology
- the target Azure services needed for encrypted persistence
- CI/CD authentication and control-plane access
- container build, push, and deploy flow
- runtime identity boundaries between GitHub, Azure, Clerk, and the app

It should be read alongside:

- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `.github/workflows/ci-cd.yml`
- `.github/workflows/codex-auto-fix.yml`

## Scope

This document covers:

- GitHub Actions to Azure deployment flow
- Azure Container Registry and Azure Container Apps
- current and planned Azure resources
- build-time versus runtime configuration boundaries
- CI/CD identities and secrets
- the target persistence path for Cosmos DB and Key Vault

This document does not define:

- planner domain logic
- detailed browser crypto implementation
- Clerk tenant configuration details

## Summary

Later-Life Planner currently deploys from GitHub Actions to Azure Container Apps through Azure Container Registry.

Current production path:

- GitHub Actions builds the container image
- GitHub Actions pushes the image to ACR
- GitHub Actions updates ACA to the new SHA-tagged image
- ACA runs the Next.js standalone server
- Clerk provides end-user authentication

Target persistence extension:

- keep the existing ACR -> ACA delivery path
- add Azure Cosmos DB for encrypted planner documents
- add Azure Key Vault for wrapped-key support
- use browser-side encryption so the server persists ciphertext only
- use ACA runtime identity for Azure data-plane access where possible

## Current Azure Estate

### Deployed today

| Component | Service | Current identifier | Purpose |
| --- | --- | --- | --- |
| Resource group | Azure Resource Group | `rg-later-life-planner` | Main deployment scope |
| Container registry | Azure Container Registry | `acrblackdog69llp` | Stores app images |
| Runtime | Azure Container Apps | `ca-later-life-planner` | Hosts the Next.js app |
| CI deploy identity | Azure service principal | via `AZURE_CREDENTIALS` | Lets GitHub Actions push and deploy |
| Planner persistence account | Azure Cosmos DB | `cosmos-llp-uks` | Stores encrypted planner documents (manual provision) |
| Planner database | Cosmos DB SQL database | `later-life-planner` | Logical database for planner storage (manual provision) |
| Planner container | Cosmos DB SQL container | `user-plans` | Partition key `/id` (manual provision) |
| Application key vault | Azure Key Vault | `kv-llp-app` | Wrap/unwrap support for data keys (manual provision) |

### Operational Azure dependencies already in use

| Component | Service | Identifier source | Purpose |
| --- | --- | --- | --- |
| Codex auth vault | Azure Key Vault | `AZURE_KEYVAULT_NAME` GitHub secret | Stores `codex-auth-json` for Codex workflows |
| Codex workflow identity | Azure service principal | `AZURE_CREDENTIALS_CODEX_KV` | Grants Key Vault access to Codex workflows |

The Codex automation vault is an operations concern. It should remain separate from the application Key Vault used for planner encryption support.

## Target Azure Additions For Persistence

These resources are required before the encrypted persistence phases are complete.
They currently exist in the live Azure subscription but are not yet represented in IaC.

| Component | Service | Target state | Notes |
| --- | --- | --- | --- |
| Planner persistence account | Azure Cosmos DB | Provisioned manually | Stores encrypted planner documents |
| Logical database | Cosmos DB database | `later-life-planner` | Defined in `docs/storage-plan.md` |
| Logical container | Cosmos DB container | `user-plans` | Partition key `/id`, one doc per Clerk user |
| Application key vault | Azure Key Vault | Provisioned manually | Wraps and unwraps per-user data keys |
| Runtime app identity | Managed identity | Provisioned manually | ACA system-assigned identity for Cosmos DB and Key Vault |

## Recommended Resource Layout

Recommended v1 layout:

- keep ACR and ACA in `rg-later-life-planner`
- keep Cosmos DB and the application Key Vault in the same subscription
- use either:
  - the same resource group for simplicity, or
  - a separate data/security resource group for stricter ownership boundaries

Recommended default for v1:

- same subscription
- same environment boundary
- separate logical services
- separate Key Vaults for:
  - operations automation secrets
  - application wrapped-key support

Current decision:

- use the existing `rg-later-life-planner` for v1 persistence resources

## IaC Backfill Required

The persistence resources were created directly in Azure to unblock Phase 1.5.

Before production persistence ships, add these to `infra/main.bicep` (or a dedicated data stack):

- Cosmos DB account `cosmos-llp-uks`
- SQL database `later-life-planner`
- SQL container `user-plans` with partition key `/id`
- Key Vault `kv-llp-app` with RBAC and purge protection
- ACA system-assigned identity and role assignments for Cosmos DB + Key Vault

## Deployment Wiring Status

The ACA environment variables for Cosmos DB and Key Vault are set manually in Azure today.

The CI/CD workflow does not yet write these values during deploy, so it should be updated before automated redeploys become the default path for persistence work.

## High-Level Architecture

```text
Browser
  -> Clerk (sign-in, sign-up, session)
  -> Azure Container Apps / Next.js
       -> verify Clerk auth
       -> Cosmos DB (ciphertext document read/write)
       -> Azure Key Vault (wrap/unwrap data key)
  <- browser decrypts and hydrates planner state

GitHub Actions CI/CD
  -> azure/login with AZURE_CREDENTIALS
  -> docker buildx build
  -> push image to ACR
  -> az containerapp update deploys image to ACA

GitHub Actions Codex workflows
  -> azure/login with AZURE_CREDENTIALS_CODEX_KV
  -> Azure Key Vault secret access for codex-auth-json
```

## Runtime Application Architecture

### App hosting

- The app runs as a Next.js standalone Node server in Azure Container Apps.
- ACA exposes public HTTPS ingress.
- Container images are pulled from ACR.

### Authentication

- Clerk is the user identity provider.
- `/sign-in` and `/sign-up` remain public.
- `/` and protected API routes rely on Clerk middleware and server-side auth helpers.

### Persistence path

For the persistence phases, the app runtime will:

1. verify Clerk auth
2. resolve the user identity from Clerk only
3. read or write ciphertext documents in Cosmos DB
4. use Key Vault for wrapped-key operations
5. avoid logging or persisting planner plaintext on the server

### Browser responsibility

The browser remains responsible for:

- generating or recovering the data key
- encrypting planner state before upload
- decrypting planner state after download

### Server responsibility

The server remains responsible for:

- request authentication
- authorization by verified user identity
- ciphertext payload validation
- Cosmos DB persistence
- Key Vault wrapping support

## Identity And Access Model

### End users

- Identity provider: Clerk
- Trusted user identifier: Clerk `userId`
- User identity must not come from request body or query parameters

### GitHub Actions deploy workflow

- Credential source: GitHub secret `AZURE_CREDENTIALS`
- Login method: `azure/login`
- Current auth type: secret-based service principal
- Required permissions:
  - ACR push
  - ACA update
  - ACA secret and env update

Recommended future improvement:

- replace secret-based Azure login with GitHub OIDC federation

### GitHub Actions Codex workflows

- Credential source: GitHub secret `AZURE_CREDENTIALS_CODEX_KV`
- Purpose: access the operations Key Vault used to restore Codex auth state
- This identity should remain separate from the main deploy identity where practical

### ACA runtime identity

Recommended target:

- enable a system-assigned or user-assigned managed identity on ACA

Use that runtime identity for:

- Cosmos DB data-plane access
- Azure Key Vault wrap and unwrap operations

Preferred rule:

- do not place Azure client secrets for Cosmos DB or Key Vault inside the app container unless there is a hard blocker

## CI/CD Architecture

### Pull requests to `master`

The `CI/CD` workflow runs:

- `changes`
- `test`
- `container-build-check` when container-affecting files changed
- `merge-gate`

Properties:

- no Azure login in the PR validation path
- no ACR push
- no ACA deploy
- `merge-gate` is the required status check on `master`

### Push or merge to `master`

The same workflow continues into production deployment:

1. `test` passes
2. `build-and-push` logs into Azure
3. `az acr login` authenticates the runner to ACR
4. `docker buildx build --push` builds and publishes the image
5. images are tagged with:
   - GitHub run number
   - commit SHA
   - `latest`
6. `deploy` updates ACA to the immutable SHA-tagged image
7. `deploy` updates ACA secrets and env vars
8. the deployed ACA revision is restarted deterministically

### Auto-fix workflow on CI failure

`Codex Auto-Fix on Failure` is triggered by a failed `CI/CD` workflow run.

It:

1. checks out the failing ref
2. restores Codex auth from the operations Key Vault
3. applies a minimal source fix
4. reruns tests
5. opens a PR back to the failing branch

This flow is compatible with `master` branch protection because it opens a fix PR rather than bypassing the blocked merge.

## Container Build Architecture

### Build location

- Container builds happen in GitHub Actions runners.
- ACR is used as the image registry, not as the build engine.

This is important because the current setup does not rely on ACR Tasks.

### Dockerfile stages

The current Dockerfile uses three stages:

1. `deps`
   - installs Node dependencies
2. `builder`
   - copies source
   - injects build-time public envs
   - runs `npm run build`
3. `runner`
   - copies standalone Next.js output into the production image

### Image identity

- image repository: `acrblackdog69llp.azurecr.io/later-life-planner`
- immutable deployment tag: `github.sha`
- convenience tags:
  - `github.run_number`
  - `latest`

## Configuration Boundaries

### Build-time configuration

These values are required during `docker buildx build` because they affect `next build` or the client bundle:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`

### Runtime configuration

These values belong in ACA env vars or ACA secrets:

- `TURNSTILE_SECRET_KEY`
- `CLERK_SECRET_KEY`
- `ANTHROPIC_API_KEY`
- future Cosmos DB and Key Vault identifiers

Current nuance:

- the deploy workflow explicitly updates Clerk and Turnstile settings
- other runtime settings such as `ANTHROPIC_API_KEY` may be pre-provisioned on ACA outside the workflow and still need to be treated as runtime configuration

## Recommended Persistence Runtime Configuration

Prefer managed identity plus resource identifiers instead of a broad connection string.

Recommended runtime configuration surface:

- `AZURE_COSMOS_ENDPOINT`
- `AZURE_COSMOS_DATABASE_NAME=later-life-planner`
- `AZURE_COSMOS_CONTAINER_NAME=user-plans`
- `AZURE_KEYVAULT_URL`
- `AZURE_KEYVAULT_KEY_NAME` or full key identifier

If a temporary fallback is needed:

- document the exception explicitly
- keep it out of the image build
- treat it as transitional rather than architectural

## Provisioning Order For The Next Slice

1. Decide whether persistence resources live in the existing resource group or a dedicated data resource group.
2. Create the Cosmos DB account.
3. Create database `later-life-planner`.
4. Create container `user-plans` with partition key `/id`.
5. Create the application Key Vault for wrapped-key operations.
6. Enable ACA managed identity.
7. Grant ACA identity access to Cosmos DB and Key Vault.
8. Add required resource identifiers to ACA configuration and GitHub configuration where needed.
9. Smoke-test access from the running app environment.
10. Start the persistence code in `src/lib/crypto.ts`, `src/lib/cosmos.ts`, and the protected data routes.

## Security Boundaries

- Browser holds plaintext planner data and performs encryption and decryption.
- Server handles auth, validation, storage, and wrapped-key operations.
- Cosmos DB stores encrypted planner documents only.
- Key Vault manages wrapping keys, not planner plaintext.
- Deploy credentials and Codex automation credentials remain separate.
- `master` merges are blocked unless the required CI check passes.

## Out Of Scope For V1

- private endpoints or VNet integration
- field-level database querying
- server-side planner calculations from persisted data
- user-managed encryption passphrases
- ACR Tasks or alternate image build systems

## Follow-Up Hardening

Recommended next hardening after the persistence foundation lands:

- move the main deploy workflow from `AZURE_CREDENTIALS` to GitHub OIDC federation
- keep the ACA runtime on managed identity for Cosmos DB and Key Vault
- document final live resource names and RBAC assignments once provisioned
