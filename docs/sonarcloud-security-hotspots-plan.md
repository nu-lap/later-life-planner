# SonarCloud Security Hotspots — Remediation Plan

**Source:** https://sonarcloud.io/project/security_hotspots?id=durbs182_later-life-planner  
**Date:** 2026-05-10  
**Total open hotspots:** 15  

Security hotspots are not confirmed vulnerabilities — they require a human review to decide whether to fix or dismiss. This plan categorises each one, gives a verdict, and describes the concrete action.

---

## Summary

| Priority | Count | Verdict |
|----------|-------|---------|
| HIGH — fix | 2 | Dockerfile COPY permissions (S6504) |
| MEDIUM — fix | 3 | Dockerfile recursive COPY (S6470), Key Vault public access (S6329), Container App cert mode (S6382) |
| MEDIUM — dismiss | 1 | `Math.random()` fallback in `ids.ts` (S2245) |
| LOW — fix | 6 | Secrets expanded in `run` blocks (S7636) |
| LOW — dismiss | 3 | Cosmos sub-resource `identity` blocks (S6378) |

---

## HIGH — Fix

### [S6504] Dockerfile: copied files have write permissions (lines 50–51)

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

## MEDIUM — Fix

### [S6470] Dockerfile: recursive COPY may include sensitive data (line 13)

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

### [S6329] Bicep: Key Vault has public network access enabled (line 145)

**Rule:** `azureresourcemanager:S6329` — "Make sure allowing public network access is safe here."  
**Line:**
```bicep
publicNetworkAccess: 'Enabled'   // infra/main.bicep:145
```

**Why it matters:** The Key Vault is accessed by the Container App via managed identity, so the application data plane does not require public access. Leaving it open unnecessarily increases the attack surface.

**Assessment:** GitHub Actions CI/CD pipelines (external IPs) currently rely on public access to set secrets during deployment. Two options:

- **Option A (preferred):** Add a Key Vault firewall rule that allows the GitHub-hosted runner IP ranges, then set `publicNetworkAccess: 'Disabled'`. This requires maintaining the IP allowlist as GitHub updates runner IPs.
- **Option B (pragmatic):** Keep `'Enabled'` but add `networkAcls` with `defaultAction: 'Deny'` and specific IP rules. Mark hotspot as _acknowledged_ in SonarCloud with a note.

Recommend Option A if deployment is migrated to self-hosted or federated-identity runners; Option B in the interim.

**File:** `infra/main.bicep` line 145

---

### [S6382] Bicep: Container App missing `clientCertificateMode` (line 156)

**Rule:** `azureresourcemanager:S6382` — "Omitting `clientCertificateMode` disables certificate-based authentication."  
**Lines:** `infra/main.bicep` lines 156–161 (the `ingress` block of the Container App).

**Why it matters:** Without an explicit value, the platform defaults to no mutual TLS. For a public-facing web app this is expected, but the intent should be documented explicitly rather than relying on defaults.

**Fix:** Add `clientCertificateMode: 'Ignore'` to the ingress block to make the intent explicit and clear the hotspot. If mTLS is desired in future, change to `'Accept'` or `'Require'`.

```bicep
ingress: {
  external: true
  targetPort: 3000
  transport: 'auto'
  allowInsecure: false
  clientCertificateMode: 'Ignore'
}
```

**File:** `infra/main.bicep` lines 156–161

---

## MEDIUM — Dismiss

### [S2245] `ids.ts`: `Math.random()` in fallback (line 12)

**Rule:** `typescript:S2245` — "Make sure that using this pseudorandom number generator is safe here."  
**Code:**
```ts
globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
```

**Assessment:** The primary path uses `crypto.randomUUID()` which is cryptographically secure. The `Math.random()` fallback only executes in environments where `globalThis.crypto.randomUUID` is unavailable — non-secure HTTP contexts or runtimes older than Node 15. The deployed app runs on Node 20 in a container (always HTTPS), so the fallback is unreachable in production.

**Action:** Dismiss in SonarCloud as "Won't Fix" with the note: _"Fallback is unreachable in the deployed environment (Node 20, HTTPS). Primary path uses crypto.randomUUID()."_

Optionally, remove the fallback entirely to eliminate the question:
```ts
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
```
This is safe since the minimum supported runtime is Node 20.

**File:** `src/lib/ids.ts` line 12

---

## LOW — Fix

### [S7636] CI/CD: secrets expanded inline in `run` blocks (6 occurrences)

**Rule:** `githubactions:S7636` — "Avoid expanding secrets in a run block."  
**File:** `.github/workflows/ci-cd.yml`

**Why it matters:** When `${{ secrets.X }}` is interpolated directly into a shell command string, the secret value appears in the expanded command. Depending on runner configuration and third-party action behaviour, this can expose the value in logs or process listings. The safer pattern is to inject the secret as an environment variable on the step and reference it as `$ENV_VAR` in the shell.

**Occurrences and fixes:**

**1. `container-build-check` job — lines 110–111**

Current (secrets inline in `--build-arg`):
```yaml
- name: Build image for validation
  run: |
    docker buildx build \
      --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="${{ secrets.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}" \
      --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}" \
      ...
```

Fix (move secrets to `env:`, reference as shell variables):
```yaml
- name: Build image for validation
  env:
    BUILD_TURNSTILE: ${{ secrets.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}
    BUILD_CLERK_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
  run: |
    docker buildx build \
      --build-arg "NEXT_PUBLIC_TURNSTILE_SITE_KEY=${BUILD_TURNSTILE}" \
      --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${BUILD_CLERK_KEY}" \
      ...
```

**2. `deploy` job — lines 291–293, 302**

Same pattern: the `az containerapp secret set` and `az containerapp update` commands expand secrets inline. Move the secret values to `env:` on the `Update ACA secret and deploy` step and reference them as environment variables in the shell script.

```yaml
- name: Update ACA secret and deploy
  id: deploy
  env:
    SECRET_ANTHROPIC: ${{ secrets.ANTHROPIC_API_KEY }}
    SECRET_TURNSTILE: ${{ secrets.TURNSTILE_SECRET_KEY }}
    SECRET_CLERK: ${{ secrets.CLERK_SECRET_KEY }}
    BUILD_CLERK_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
    BUILD_OPTIMIZER: ${{ secrets.NEXT_PUBLIC_OPTIMIZER_ENABLED || 'true' }}
    BUILD_PRO: ${{ secrets.NEXT_PUBLIC_PRO_ENABLED || 'false' }}
  run: |
    ...
    az containerapp secret set \
      --secrets \
        "anthropic-api-key=${SECRET_ANTHROPIC}" \
        "turnstile-secret-key=${SECRET_TURNSTILE}" \
        "clerk-secret-key=${SECRET_CLERK}"
    az containerapp update \
      --set-env-vars \
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${BUILD_CLERK_KEY}" \
        ...
```

**File:** `.github/workflows/ci-cd.yml`

---

## LOW — Dismiss

### [S6378] Bicep: Cosmos resources missing `identity` block (lines 78, 105, 114)

**Rule:** `azureresourcemanager:S6378` — "Omitting the `identity` block disables Azure Managed Identities."  
**Resources:** `cosmosAccount` (line 78), `cosmosSqlDatabase` (line 105), `cosmosSqlContainer` (line 114)

**Assessment:** Managed Identity on a Cosmos DB account resource is used for the Cosmos DB _control plane_ (ARM operations). Data plane access (reading/writing documents) is handled separately via Cosmos DB SQL RBAC role assignments, which is the pattern already used in this project (`az cosmosdb sql role assignment`). The `cosmosSqlDatabase` and `cosmosSqlContainer` sub-resources do not support `identity` blocks at all.

**Action:** Dismiss all three in SonarCloud as "Won't Fix" with the note: _"Data plane access uses Cosmos DB SQL RBAC, not managed identity on the Cosmos resource. Sub-resources do not support identity blocks."_

---

## Suggested Order of Work

1. **Dockerfile S6504** — two-line change, no behaviour impact, fixes HIGH hotspots
2. **CI/CD S7636** — refactor secret injection in two jobs; fixes 6 LOW hotspots and improves security hygiene
3. **Bicep S6382** — add one field to ingress block, zero behaviour change
4. **Dockerfile S6470 / `.dockerignore`** — audit and update `.dockerignore`, then dismiss
5. **Bicep S6329** — decision point on network access strategy; defer until runner infrastructure is decided
6. **Dismiss `ids.ts` S2245** — add SonarCloud comment and optionally simplify the function
7. **Dismiss Bicep S6378 (x3)** — add SonarCloud comments to the three Cosmos sub-resources
