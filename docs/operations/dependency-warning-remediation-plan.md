# Dependency Warning Remediation Plan

This document captures the package warnings seen in GitHub Actions run `24093826277` and the recommended upgrade order to clean them up with minimal risk.

## Observed warnings

The `build-and-push` job reported these dependency warnings:

- `next@14.2.5` is deprecated and has a security vulnerability.
- `eslint@8.57.1` is deprecated.
- `@clerk/types@4.101.20` is deprecated.
- `@clerk/clerk-react@5.61.3` is deprecated.
- `rimraf@3.0.2` is deprecated.
- `inflight@1.0.6` is deprecated.
- `glob@7.2.3` is deprecated.
- `glob@10.3.10` is deprecated.
- `@humanwhocodes/object-schema@2.0.3` is deprecated.
- `@humanwhocodes/config-array@0.13.0` is deprecated.

There was also a workflow-level warning that `azure/login` is still running on Node.js 20. That is not a package warning, but it should be tracked separately after the dependency cleanup.

## Recommended order

### 1. Patch Next.js first

Upgrade `next` from `14.2.5` to the latest patched `14.2.x` release.

Reason:
- this is the only warning in the current build log that explicitly calls out a security issue
- it is a direct runtime dependency
- it is low risk to address before larger toolchain changes

Validation after the change:
- `npm install`
- `npm test`
- `npm run build`
- `npm run lint`

### 2. Tackle Clerk separately

Review the current Clerk release line and determine whether a small `@clerk/nextjs` bump can remove any transitive warnings without requiring a full Core 3 migration.

If the warnings remain, plan a dedicated Core 3 migration as a separate change set.

Reason:
- the deprecations for `@clerk/types` and `@clerk/clerk-react` point at the Clerk package family
- Clerk Core 3 has broader compatibility requirements and should not be mixed into the Next.js security patch

### 3. Upgrade ESLint and the lint toolchain

Update `eslint` and `eslint-config-next` together, then re-run lint and build.

Reason:
- the `rimraf`, `inflight`, `glob`, and `@humanwhocodes/*` warnings are likely coming from the older ESLint stack
- this is a tooling-only batch and should be isolated from runtime dependency changes

### 4. Re-check the build logs after each batch

Only upgrade other direct dependencies if they appear in the next build log.

Recommended follow-up checks:
- `@azure/*`
- `zod`
- `recharts`
- `zustand`
- test toolchain packages such as `vitest` and `jsdom`

## Acceptance criteria

The cleanup is complete when:

- the build log no longer reports the `next@14.2.5` security warning
- the build log no longer reports the current ESLint and Clerk deprecation warnings
- `npm install`, `npm test`, `npm run build`, and `npm run lint` all pass
- any remaining warnings are explicitly accepted as transitive or workflow-level items

## Out of scope

- The Node.js 20 warning for `azure/login` is tracked separately.
- No package changes should be bundled with unrelated feature work.
- Do not use suppression files or ignore rules to hide warnings.
