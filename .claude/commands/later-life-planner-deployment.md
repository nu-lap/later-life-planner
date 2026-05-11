---
description: Use when working on deployment, CI/CD, Docker, GitHub Actions, Azure Container Registry, Azure Container Apps, or environment-variable wiring for /Users/pauldurbin/later-life-planner. Use for release readiness, pipeline debugging, build-time vs runtime env fixes, or changes to .github/workflows/ci-cd.yml, Dockerfile, or deployment secrets.
---

# Later-Life Planner Deployment

Use this skill for operational work in `/Users/pauldurbin/later-life-planner`.

## Read Only What You Need

- For any deployment or pipeline task, read:
  - `/Users/pauldurbin/later-life-planner/.github/workflows/ci-cd.yml`
  - `/Users/pauldurbin/later-life-planner/Dockerfile`
  - `/Users/pauldurbin/later-life-planner/.env.example`
- If the task touches auth, public envs, or protected routes, also read:
  - `/Users/pauldurbin/later-life-planner/src/app/layout.tsx`
  - `/Users/pauldurbin/later-life-planner/src/app/page.tsx`
  - `/Users/pauldurbin/later-life-planner/src/middleware.ts`
- If the task touches AI features or captcha wiring, also read:
  - `/Users/pauldurbin/later-life-planner/src/app/api/generate-vision/route.ts`
  - `/Users/pauldurbin/later-life-planner/src/components/steps/Step1LifeVision.tsx`
- If the task touches persisted storage rollout or security controls, also read:
  - `/Users/pauldurbin/later-life-planner/docs/storage-plan.md`
  - `/Users/pauldurbin/later-life-planner/docs/security-decisions.md`
- For the current repo-specific deployment map, read:
  - `/Users/pauldurbin/later-life-planner/.claude/commands/references/azure-ci-cd.md`

## Decision Precedence

- Treat `ci-cd.yml` as the source of truth for automated deployment behavior.
- Treat `Dockerfile` as the source of truth for build-time env injection and runtime container shape.
- Treat `.env.example` as the intended env surface, but verify whether each variable is actually wired into CI and Azure.
- Treat `security-decisions.md` as authoritative when deployment changes touch secrets, auth, or encrypted persistence.

## Workflow

1. Identify the deployment target:
   - CI-only validation
   - preview or branch test
   - production deployment
2. Trace the actual release path before proposing changes:
   - PR to `master` runs CI only
   - push or merge to `master` can build and deploy
   - `workflow_dispatch` forces CI, but deploy is still gated to `master`
3. Check the path filters in `ci-cd.yml` before assuming a change will rebuild the container.
4. Separate build-time public env vars from runtime secrets:
   - `NEXT_PUBLIC_*` used in client code often needs to exist during `next build`
   - runtime-only server secrets should be injected into Azure Container Apps as secrets or env vars
5. Validate the full path end-to-end:
   - local `npm run build`
   - workflow build args and secrets
   - container runtime envs
   - Azure Container Apps deployment step
6. Keep deployment changes narrow and testable. Avoid mixing pipeline rewrites with unrelated app changes.

## Working Rules

- Do not assume the repo deploys to Vercel just because the app is Vercel compatible. Verify the active pipeline first.
- Do not assume every variable in `.env.example` is wired into CI or Azure. Prove it from `ci-cd.yml` and `Dockerfile`.
- When fixing deployment issues, state whether the missing value is needed at build time, runtime, or both.
- When deployment work also changes app code, use this skill alongside `/later-life-planner-engineer`.
- Preserve the existing branch and PR workflow unless the user explicitly asks to change release strategy.

## What This Skill Is For

Use this skill when the user asks to:

- deploy the app
- explain the release path
- debug GitHub Actions failures
- debug Docker build failures
- debug Azure Container Apps deployment issues
- wire new secrets or env vars into CI/CD
- decide whether a feature branch change will actually deploy
- align app code with the real deployment platform
