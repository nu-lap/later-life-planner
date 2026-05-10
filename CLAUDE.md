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

- When adding or changing behaviour, add corresponding tests using the frameworks already present.
- Keep tests deterministic, isolated, and fast.
- Favour small, focused tests that clearly document expected behaviour.
- When unsure of existing patterns, find similar tests in the repo and mirror their style.

## Code Style

- Prefer clear and maintainable code over clever solutions.
- Follow existing patterns and conventions you see in the codebase.
- When modifying code, preserve current behaviour unless the change is explicitly requested.
- Propose minimal, focused changes that directly address the problem at hand.

## Security

- Avoid insecure patterns: command injection, unsafe string interpolation into shell commands, unvalidated user input.
- Prefer well-known, maintained libraries over custom security-sensitive code.
- Validate and sanitise external inputs before use.
- Handle errors explicitly — do not silently swallow exceptions.

## Comments

Add a comment only when the **why** is non-obvious: a hidden constraint, a subtle invariant, or a workaround for a specific bug. Do not describe what the code does — well-named identifiers already do that.

## GitHub Actions Conventions

- Use clear, descriptive names for workflows and jobs.
- Minimise `permissions:` blocks to the principle of least privilege.
- Prefer official `actions/*` and well-maintained third-party actions.
- Reuse existing patterns for triggers, job naming, and status checks rather than inventing new conventions.

## PR Review Format

When writing PR review feedback, use this exact structure for each actionable finding:

- `Severity: P0` / `P1` / `P2` / `P3` / `Nit`
- `Impact: <one sentence explaining risk or regression>`
- `Required action: <one concrete fix instruction>`

Severity definitions:
- **P0** — release-blocking, requires immediate remediation
- **P1** — high-risk defect, security issue, data loss, or major correctness regression
- **P2** — important correctness, reliability, or maintainability issue; fix before merge
- **P3** — minor issue or improvement
- **Nit** — style / documentation / readability suggestion

Only create inline review comments for P0, P1, and P2 findings. Put P3 and Nit feedback in the top-level review summary. If no blocking issues are found, state that explicitly in the summary.

## Key Environment Variables

See `.env.example`. Required for local dev:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
- `AZURE_COSMOSDB_ENDPOINT` / `AZURE_COSMOSDB_DATABASE` / `AZURE_COSMOSDB_CONTAINER`
- `AZURE_KEY_VAULT_URL` / `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`
- `ANTHROPIC_API_KEY` (for AI vision generation)

## Path Aliases

`@/*` resolves to `src/*` (configured in `tsconfig.json` baseUrl/paths).

## Multi-Agent Isolation (CRITICAL)

**Multiple agents often work on this repo concurrently.** Use git worktrees to work on different branches simultaneously without interference.

### Quick Start

```bash
# Create an isolated worktree for your task
./scripts/setup-copilot-worktree.sh llp-myname feature/my-task

# Switch to it
cd ../llp-llp-myname

# Work normally
npm run dev
git commit -m "fix: ..."
git push origin feature/my-task

# Clean up when done
cd /Users/pauldurbin/github/later-life-planner
git worktree remove ../llp-llp-myname
```

### Branch Rules

- **Always work on a feature branch** — never directly on `master`
- **Never force-push** to branches that already have a PR or have been pushed to origin
- **Never rebase/amend pushed commits** — create a new commit instead
- **Always `git pull` before editing** a branch that has been pushed

### Pre-Work Checklist

- [ ] `git status` and `git fetch origin`
- [ ] Confirm current branch is not `master`
- [ ] If on an existing pushed branch: `git pull origin <branch>`
- [ ] Create a new feature branch if starting fresh: `git checkout -b feature/<name>`
- [ ] Confirm working tree is clean: `git status`

### After-Work Checklist

- [ ] Commit all changes with a clear, atomic message
- [ ] `git push origin <branch-name>`
- [ ] Create or update PR: `gh pr create` or `gh pr view`
- [ ] Clean up temporary files
- [ ] Verify clean working tree: `git status`

### Forbidden

- `git push --force` / `git push -f`
- `git commit --amend` or `git rebase` on pushed branches
- Editing `.env*` or secrets files
- Leaving uncommitted changes
- Creating PRs from `master`

**See `docs/COPILOT-ISOLATION.md` for full worktree details.**
