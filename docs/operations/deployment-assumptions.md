# Deployment Assumptions (v1)

Status: active  
Owner: platform + engineering (`NxLap Ltd`)  
Last reviewed: 2026-03-27  
Review cadence: Quarterly and on infrastructure/deployment changes

## Hosting Baseline

The expected production baseline is:

- Next.js application running in Azure Container Apps
- image build/publish via GitHub Actions CI/CD
- Azure Container Registry for runtime image source
- Clerk for authentication
- Azure Cosmos DB (`later-life-planner` / `user-plans`) for encrypted planner persistence

## Runtime Security Assumptions

1. App identity:
- Container App uses managed identity for Cosmos data-plane access where possible.

2. Secret handling:
- runtime secrets are injected via ACA environment variables
- no plaintext planner payloads are written to logs

3. Encryption boundary:
- planner encryption/decryption is browser-side
- server persists ciphertext only

4. Protected APIs:
- authenticated routes derive `userId` from verified Clerk context only
- protected routes apply rate limiting

## Deployment Workflow Assumptions

- `master` is the production deployment branch.
- CI runs tests and lint before deploy.
- Deploys are traceable to immutable commit SHAs.
- Recovery and deletion operations are owned by `nxlap-data-ops`.

## Non-Goals For v1 Deployment

- multi-region active/active failover
- blue/green orchestration at app layer
- automatic inactive-account purge
