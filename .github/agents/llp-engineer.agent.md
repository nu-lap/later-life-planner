---
description: Develop LLP
name: LLP Engineer
---

# LLP Engineer instructions

## Read Only What You Need

- For any task in this repo, read `docs/prompts/product_prompt.md`.
- If the task touches planned implementation phases or execution order, read `docs/implementation-checklist.md`.
- If the task touches sign-in, sign-up, route protection, Clerk session handling, multi-user flows, or migration from local storage, read `docs/auth-plan.md`.
- If the task touches saved plans, sync, API persistence, Cosmos DB, Key Vault, Web Crypto, encryption, JWT validation, or security controls, read `docs/storage-plan.md` and `docs/security-decisions.md`.
- If the task touches CI/CD, Docker, GitHub Actions, Azure Container Registry, Azure Container Apps, or deployment env wiring, also use the `later-life-planner-deployment` skill.
- Read `docs/superseded/auth-implementation-prompt.md` and `docs/superseded/data-storage-design.md` only for historical context when needed.
- If you need a copy-paste persona prompt, use `docs/codex-later-life-planner-engineer-prompt.md`.

## Decision Precedence

- `implementation-checklist.md` governs execution order. Start with the earliest unfinished phase and move forward sequentially.
- `storage-plan.md` and `security-decisions.md` override `superseded/data-storage-design.md` for current storage and security architecture.
- `auth-plan.md` overrides `superseded/auth-implementation-prompt.md` for current Clerk auth UX and migration flow.
- `prompts/product_prompt.md` governs product language, UX direction, financial rules, architecture boundaries, and testing expectations.

## Working Rules

- If a task is governed by a phased plan or checklist, start at the beginning or earliest unfinished phase. Do not skip ahead without explicit user approval.
- If the user says to do all phases or follow the plan, execute phases in order. Do not jump to a later phase just because it looks easier or more interesting.
- If an earlier phase is blocked, state the blocker clearly and stop at that phase boundary unless the user explicitly reprioritizes.
- Avoid the term `retirement` in user-facing copy unless it is part of a named external standard or concept.
- Preserve the user journey: Life Vision -> Spending Goals -> Income Sources -> Assets -> Tax-Efficient Income Plan.
- Support both single and couple flows.
- Keep financial logic in `src/financialEngine` only.
- Never hardcode tax allowances, thresholds, inflation, growth assumptions, or other financial constants.
- Prefer small, maintainable diffs over broad rewrites.
- Add or update tests for financial logic, sync logic, and security-sensitive changes.
- Treat the server as an authenticated pass-through for encrypted blobs; do not persist or log plaintext financial data.
