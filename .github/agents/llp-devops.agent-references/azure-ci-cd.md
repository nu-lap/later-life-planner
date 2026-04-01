# Later-Life Planner Azure CI/CD

This reference captures the current automated deployment path for this repository.

## Current Deployment Topology

- Source control: GitHub
- CI runner: GitHub Actions
- Container registry: Azure Container Registry `acrsharedresourcesuks`
- Runtime platform: Azure Container Apps `ca-later-life-planner`
- Resource group: `rg-later-life-planner`

The app is Vercel compatible, but the repo's automated deployment path currently targets Azure Container Apps.

## Trigger Matrix

Defined in `.github/workflows/ci-cd.yml`:

- `pull_request` to `master`: CI only
- `push` to `master`: CI, then maybe container build and deploy
- `workflow_dispatch`: forces the change filters to true, but deploy still remains gated to `master`

## Job Flow

### 1. `changes`

Uses `dorny/paths-filter` to decide whether to run:

- `ci`
- `container`

Important effect:

- a docs-only change may not rebuild the image
- a source or Dockerfile change usually will

### 2. `test`

Runs when `ci == true`:

- `npm ci`
- `npm run lint`
- `npm test`

It passes `ANTHROPIC_API_KEY` into tests.

### 3. `build-and-push`

Runs only when:

- branch is `master`
- `container == true`

What it does:

- logs into Azure
- logs into ACR
- builds the Docker image with `docker buildx`
- pushes tags for:
  - GitHub run number
  - commit SHA
  - `latest`

### 4. `deploy`

Runs only after a successful `build-and-push` on `master`.

What it does:

- logs into Azure
- updates Azure Container Apps secrets
- points the container app at the new image
- restarts the latest revision
- prints the app URL

## Build-Time vs Runtime Env Wiring

This repo currently has a mixed env model.

### Build-time values

Anything baked into the client bundle or used during `next build` must be present during Docker build.

Current example:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

The Dockerfile accepts it as a build arg and exports it before `npm run build`.

### Runtime values

Secrets used only on the server can be injected into the running container.

Current example:

- `TURNSTILE_SECRET_KEY`

The deploy job writes it as an Azure Container Apps secret and exposes it via `secretref:`.

## Current Gaps To Check First

Before changing deployment behavior, verify whether these values are wired:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `ANTHROPIC_API_KEY`

Why this matters:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is read in client-visible app code, so it may need build-time handling depending on how the code is compiled.
- `CLERK_SECRET_KEY` is required for protected middleware and server-side Clerk flows.
- `ANTHROPIC_API_KEY` is required at runtime for the AI vision route.

Do not assume these are already set in Azure just because they appear in `.env.example`.

## Release Checklist

1. Confirm the branch and target environment.
2. Run local validation:
   - `npm run build`
   - `npm test`
3. Confirm any new env var is wired correctly:
   - build arg if needed at build time
   - ACA secret or env var if needed at runtime
4. Confirm the workflow path filters will actually trigger the needed jobs.
5. Push the branch and open a PR if the change should be reviewed first.
6. Merge to `master` for automated deploy under the current strategy.
7. Verify:
   - GitHub Actions job status
   - pushed image tag
   - Azure Container App revision
   - live app behavior

## Common Pitfalls

- Assuming PRs deploy: they do not under the current workflow.
- Assuming `workflow_dispatch` deploys any branch: it still does not bypass the `master` gate.
- Assuming `.env.example` means Azure is configured: it only documents desired variables.
- Fixing runtime secrets but forgetting build-time public vars.
- Updating app code for Clerk or other client-side features without updating Docker build inputs.
