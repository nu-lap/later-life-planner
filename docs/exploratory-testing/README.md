# Exploratory Testing

Automated session-based exploratory testing (SBET) for LaterLifePlan, run by Claude Code against the deployed app.

## Quick Start

1. Set required environment variables:
   ```bash
   export E2E_BASE_URL="https://$(az containerapp show \
     --name ca-later-life-planner \
     --resource-group rg-later-life-planner \
     --query properties.configuration.ingress.fqdn -o tsv)"
   export CLERK_SECRET_KEY=sk_test_...
   export E2E_CLERK_USER_EMAIL=your-test-user@example.com
   ```

2. Paste the contents of `PROMPT.md` into Claude Code as a task.

3. Claude Code will run all 10 charters and produce a timestamped bug report in `sessions/`.

## What It Tests

| Charter | Focus | Technique |
|---------|-------|-----------|
| 1 | Full wizard — single mode | Smoke + oracle |
| 2 | Full wizard — couple mode | Parallel path |
| 3 | Step 1 slider bounds & mode switching | Boundary value + state transition |
| 4 | RLSS templates and spending integrity | Consistency oracle |
| 5 | All income source combinations | Pairwise + financial oracle |
| 6 | All asset types and CGT behaviour | Financial oracle + negative testing |
| 7 | Planned events and care reserve | CRUD + consistency |
| 8 | Auth, save/reload, import/export | Session boundary + integration |
| 9 | Known-value financial calculations | Mathematical oracle |
| 10 | Interruption, refresh, mobile | Interruption tour + error guessing |

## Output

Each session writes to `sessions/YYYY-MM-DD-HH-MM/`:

```
sessions/
  2026-05-13-10-30/
    session-notes.md    ← Live notes during testing
    bug-report.md       ← Final prioritised bug report
    screenshots/        ← Evidence for each candidate bug
```

## Bug Priority Guide

| Priority | Meaning |
|----------|---------|
| **P0** | Crash, data loss, unhandled exception |
| **P1** | Wrong financial calculation or auth bypass |
| **P2** | Feature broken, incorrect state |
| **P3** | UX issue, missing validation, layout bug |
| **Nit** | Cosmetic |

## Tools Required

- Playwright + @playwright/test (already installed)
- @clerk/testing (already installed)
- @axe-core/playwright (installed)
- @faker-js/faker (installed)

## Important: No Auto-Fix

Claude Code running this prompt will **never modify application code**. It finds, documents, and prioritises bugs only. Ask Claude Code to fix specific bugs separately after reviewing the report.
