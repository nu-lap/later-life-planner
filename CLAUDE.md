# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run all tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage

# Run a single test file
npx vitest run tests/unit/projectionEngine.test.ts
```

## Architecture Overview

UK later-life financial planning SaaS (Next.js 14 App Router, TypeScript). Users aged 50–75 define their ideal retirement, then the engine calculates whether income and assets can fund it across their lifetime.

**Core data flow:**
1. User inputs → Zustand store (localStorage-persisted)
2. Store → `projectionEngine.ts` → year-by-year simulation
3. Results → `Step4Dashboard.tsx` charts and metrics

**Main layers:**

| Layer | Location | Purpose |
|-------|----------|---------|
| Wizard UI | `src/components/steps/` | 5-step planning flow |
| Financial engine | `src/financialEngine/` | Year-by-year tax + drawdown projection |
| Constants | `src/config/financialConstants.ts` | All UK tax rates / pension rules (2024/25 HMRC) |
| Types | `src/models/types.ts` | Domain types shared across all layers |
| State | `src/store/plannerStore.ts` | Zustand store with persist middleware |
| Sync | `src/hooks/usePlanSync.ts` | Device registration, encryption, Cosmos upload/download |
| API routes | `src/app/api/` | `data/` (save/load), `devices/` (approval), `generate-vision/` (Anthropic) |
| Crypto | `src/lib/crypto.ts`, `src/lib/deviceCrypto.ts` | AES-256-GCM plan encryption; HPKE device key wrapping |
| DB | `src/lib/cosmos.ts` | Azure Cosmos DB client & document models |

## Financial Engine

All UK-specific rules live in `src/config/financialConstants.ts` — update rates there only.

`projectionEngine.ts` runs a year-by-year loop from FI age to life expectancy:
- **Drawdown waterfall:** DC within personal allowance → GIA within CGT budget → ISA → remaining GIA → cash → DC above PA
- **UFPLS:** 25% tax-free / 75% taxable per DC withdrawal; tracks per-person Lump Sum Allowance (£268,275)
- **Joint GIA:** capital gains split 50/50 between spouses; each uses own £3,000 CGT exempt
- **Life stages:** Go-Go / Slo-Go / No-Go spending multipliers applied per year

`taxCalculations.ts` handles income tax bands, CGT, and UFPLS helpers. All functions are pure — easy to unit test.

## Encryption & Sync Architecture

End-to-end encrypted — the server never sees plaintext plan data.

- **DEK** (Data Encryption Key): AES-256-GCM, stored in browser IndexedDB, never sent to server
- **Cosmos documents:** plan payload is encrypted with the DEK before upload
- **Multi-device:** HPKE (X25519) wraps the DEK for each approved device; device registers its public key, owner approves on a trusted device
- **`usePlanSync`** orchestrates: device registration → approval polling → DEK delivery → encrypted plan sync + conflict resolution

## Authentication

Clerk for auth. All `/api/*` routes use `requireUser()` from `src/lib/auth/requireUser.ts`. Middleware in `src/middleware.ts` protects server routes. Account and device management at `/account`.

## Testing

Tests in `tests/unit/` (Vitest, Node environment) and `tests/ui/` (jsdom, React Testing Library). The vitest config (`vitest.config.mjs`) sets the environment per folder.

When touching the financial engine, always run:
```bash
npx vitest run tests/unit/projectionEngine.test.ts tests/unit/taxCalculations.test.ts
```

## Key Environment Variables

See `.env.example`. Required for local dev:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
- `AZURE_COSMOSDB_ENDPOINT` / `AZURE_COSMOSDB_DATABASE` / `AZURE_COSMOSDB_CONTAINER`
- `AZURE_KEY_VAULT_URL` / `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`
- `ANTHROPIC_API_KEY` (for AI vision generation)

## Path Aliases

`@/*` resolves to `src/*` (configured in `tsconfig.json` baseUrl/paths).

## Multi-Agent Isolation (CRITICAL for Copilot Instances)

**Multiple Copilot instances often work on this repo concurrently.** Always follow isolation practices:

### Before Starting Work
```bash
git fetch origin
git status
git pull origin <branch-name>  # if on existing branch
```

### During Work
- **Always create a new feature branch** (`feature/xyz`, `fix/xyz`, `docs/xyz`)
- **Never force-push** — create new commits instead of amending pushed commits
- **Commit incrementally** with clear messages to help other instances track progress
- **Create PR immediately** after first push to signal your intent

### After Finishing
- Verify no uncommitted changes: `git status`
- Clean up temporary files (screenshots, scripts, artifacts)
- Note branch name in session summary

### Forbidden Practices
- ❌ `git push --force` or `git push -f`
- ❌ `git commit --amend` or `git rebase` on pushed branches
- ❌ Edit `.env*` files or secrets
- ❌ Leave uncommitted changes
- ❌ Assume commit history is stable without pulling

**See `docs/COPILOT-ISOLATION.md` for full guidelines.**
