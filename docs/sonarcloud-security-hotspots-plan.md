# SonarCloud Security Hotspots — Remediation Plan

**Source:** https://sonarcloud.io/project/security_hotspots?id=durbs182_later-life-planner  
**Date:** 2026-05-10  
**Status:** ✅ **COMPLETE** — All hotspots remediated (2026-05-10, commit 77f6c89)  
**Total hotspots reviewed:** 15  

Security hotspots are not confirmed vulnerabilities — they require a human review to decide whether to fix or dismiss. This plan categorised each one, gave a verdict, and described the concrete action. **All 7 actionable hotspots have been implemented; 1 was dismissed as by-design.**

---

## Summary

| Priority | Count | Status | Details |
|----------|-------|--------|---------|
| HIGH | 1 | ✅ IMPLEMENTED | S6504: Dockerfile COPY permissions (--chmod=555) |
| MEDIUM | 4 | ✅ IMPLEMENTED | S6470, S6329, S6382, S2245 — all fixes deployed |
| LOW | 2 | ✅ IMPLEMENTED | S7636: Secrets in CI/CD (6 occurrences); S6378: Dismissed by design |

---

## HIGH PRIORITY — ✅ IMPLEMENTED

### [S6504] Dockerfile: copied files have write permissions (lines 50–51) — FIXED

**Rule:** `docker:S6504` — "Make sure no write permissions are assigned to the copied resource."  
**Lines:**
```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./   # line 50
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static  # line 51
```

**Why it matters:** `--chown=nextjs:nodejs` makes the `nextjs` user the owner of the copied files, granting it write access. The application only needs to _read_ these files at runtime. If the container process is ever compromised, write access to the application bundle would allow tampering with served assets.

**Fix:** Add `--chmod=555` to restrict permissions to read+execute for owner/group/world. Owner is still set to `nextjs:nodejs` for correct process visibility; write bit is stripped.

```dockerfile
COPY --from=builder --chown=nextjs:nodejs --chmod=555 /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs --chmod=555 /app/.next/static ./.next/static
```

**File:** `Dockerfile` lines 50–51

---

## MEDIUM PRIORITY — ✅ IMPLEMENTED

### [S6470] Dockerfile: recursive COPY may include sensitive data (line 13) — FIXED

**Rule:** `docker:S6470` — "Copying recursively might inadvertently add sensitive data to the container."  
**Line:**
```dockerfile
COPY . .   # line 13 in builder stage
```

**Why it matters:** `COPY . .` in the builder stage pulls in everything not excluded by `.dockerignore`. If `.dockerignore` is incomplete, files like `.env.local`, `*.pem`, test fixtures with real credentials, or local secrets could be baked into the image layer.

**Fix:** Audit and tighten `.dockerignore`. At minimum it should exclude:

```
.env*
*.pem
*.key
*.p12
.git
docs/
tests/
*.test.ts
*.test.tsx
coverage/
.next/cache
```

After tightening, the `COPY . .` is safe and the hotspot can be dismissed in SonarCloud.

**File:** `Dockerfile` line 13 / `.dockerignore`

---

### [S6329] Bicep: Key Vault has public network access enabled (line 145) — FIXED

**Rule:** `azureresourcemanager:S6329` — "Make sure allowing public network access is safe here."

**Implementation:** Added `networkAcls` with Deny-by-default + AzureServices bypass
```bicep
publicNetworkAccess: 'Enabled'   // Still required for GitHub Actions CI/CD
networkAcls: {
  defaultAction: 'Deny'
  bypass: 'AzureServices'        // Allows CI/CD access
}
```

**Rationale:** Option B from original assessment. The Key Vault remains publicly reachable for GitHub Actions, but all other traffic is denied by default. This balances operational requirements (CI/CD secret deployment) with security (no ad-hoc public access).

**Verification:** ✓ Deployed in infra/main.bicep (commit 77f6c89)

**File:** `infra/main.bicep` line 145+

---

### [S6382] Bicep: Container App missing `clientCertificateMode` (line 156) — FIXED

**Rule:** `azureresourcemanager:S6382` — "Omitting `clientCertificateMode` disables certificate-based authentication."

**Implementation:** Added explicit `clientCertificateMode: 'Ignore'`
```bicep
ingress: {
  external: true
  targetPort: 3000
  transport: 'auto'
  allowInsecure: false
  clientCertificateMode: 'Ignore'  ← ADDED
}
```

**Rationale:** No mTLS required for public-facing web app. The explicit declaration makes intent clear and future-proofs the configuration if mTLS is needed (can be changed to `'Accept'` or `'Require'`).

**Verification:** ✓ Deployed in infra/main.bicep (commit 77f6c89)

**File:** `infra/main.bicep` lines 156–161

---

### [S2245] `ids.ts`: `Math.random()` in fallback — FIXED (Removed)

**Rule:** `typescript:S2245` — "Make sure that using this pseudorandom number generator is safe here."

**Implementation:** Removed unreachable fallback entirely
```ts
// Before (had fallback):
globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

// After (current src/lib/ids.ts):
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
```

**Rationale:** Minimum supported runtime is Node 20, where `crypto.randomUUID()` is always available. Fallback was unreachable in production anyway. Removing it eliminates the question entirely and simplifies the code.

**Verification:** ✓ Implemented in src/lib/ids.ts (commit 77f6c89)

**File:** `src/lib/ids.ts`

---

## LOW PRIORITY — ✅ IMPLEMENTED

### [S7636] CI/CD: secrets expanded inline in `run` blocks (6 occurrences) — FIXED

**Rule:** `githubactions:S7636` — "Avoid expanding secrets in a run block."

**Why it matters:** When `${{ secrets.X }}` is interpolated directly into a shell command string, the secret value appears in the expanded command. Depending on runner configuration and third-party action behaviour, this can expose the value in logs or process listings. The safer pattern is to inject the secret as an environment variable on the step and reference it as `$ENV_VAR` in the shell.

**Implementation:** Moved all secret expansions to `env:` sections

**Occurrences fixed:**

1. **`container-build-check` job** (lines 112–130) — Secrets moved to `env:`, referenced as shell variables in `docker buildx build` command
2. **`deploy` job** (lines ~290+) — Secrets moved to `env:`, referenced in `az containerapp secret set` and `az containerapp update` commands

**Example (container-build-check job, current code):**
```yaml
- name: Build image for validation
  env:
    BUILD_TURNSTILE: ${{ secrets.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}
    BUILD_CLERK_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
    BUILD_OPTIMIZER: ${{ secrets.NEXT_PUBLIC_OPTIMIZER_ENABLED || 'true' }}
    BUILD_PRO: ${{ secrets.NEXT_PUBLIC_PRO_ENABLED || 'false' }}
  run: |
    docker buildx build \
      --build-arg "NEXT_PUBLIC_TURNSTILE_SITE_KEY=${BUILD_TURNSTILE}" \
      --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${BUILD_CLERK_KEY}" \
      ...
```

**Verification:** ✓ All 6 occurrences fixed in .github/workflows/ci-cd.yml (commit 77f6c89)

---

### [S6378] Bicep: Cosmos resources missing `identity` block (lines 78, 105, 114) — DISMISSED (By Design)

**Rule:** `azureresourcemanager:S6378` — "Omitting the `identity` block disables Azure Managed Identities."

**Resources:** `cosmosAccount` (line 78), `cosmosSqlDatabase` (line 105), `cosmosSqlContainer` (line 114)

**Rationale:** Data plane access (reading/writing documents) uses Cosmos DB SQL RBAC role assignments, not managed identity on the Cosmos resource. This is the correct pattern for this project. The `cosmosSqlDatabase` and `cosmosSqlContainer` sub-resources do not support `identity` blocks in Bicep.

**Action:** Dismissed in SonarCloud as "Won't Fix"

**Verification:** ✓ By-design use of SQL RBAC confirmed in infra/main.bicep

---

## Completion Summary

**All 7 actionable hotspots have been remediated.** Implementation details:

| Hotspot | Priority | Status | Commit | Date |
|---------|----------|--------|--------|------|
| S6504 | HIGH | ✅ Fixed | 77f6c89 | 2026-05-10 |
| S6470 | MEDIUM | ✅ Fixed | 77f6c89 | 2026-05-10 |
| S6329 | MEDIUM | ✅ Fixed | 77f6c89 | 2026-05-10 |
| S6382 | MEDIUM | ✅ Fixed | 77f6c89 | 2026-05-10 |
| S2245 | MEDIUM | ✅ Fixed | 77f6c89 | 2026-05-10 |
| S7636 | LOW | ✅ Fixed | 77f6c89 | 2026-05-10 |
| S6378 | LOW | ✅ Dismissed | — | By design |

**Archive status:** This document can be moved to `docs/superseded/` once SonarCloud dashboard confirms all hotspots are closed/dismissed.
