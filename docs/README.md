# Docs Guide

This folder is organized so the current implementation documents stay easy to find, while point-in-time reviews and operational notes are kept out of the main path.

## Canonical Planning Docs

These are the primary source-of-truth documents for product, implementation order, architecture, and security:

- `prompts/product_prompt.md`
- `implementation-checklist.md`
- `auth-plan.md`
- `storage-plan.md`
- `security-decisions.md`
- `azure-architecture.md`
- `persistence-security-review.md`

## Prompts

Reusable prompt/reference material lives in [`prompts/`](/Users/pauldurbin/later-life-planner/docs/prompts):

- `prompts/product_prompt.md`
- `prompts/branding-expert.md`

## Active Reference Docs

These support implementation but are not the main execution-order docs:

- `testing-plan.md`
- `withdrawal-optimizer-mcp-design.md`
- `codex-later-life-planner-engineer-prompt.md`
- `privacy-notice-outline.md`

## Superseded Docs

These are retained for historical context only. They are not the current implementation source of truth and now live in [`superseded/`](/Users/pauldurbin/later-life-planner/docs/superseded):

- `superseded/auth-implementation-prompt.md`
- `superseded/data-storage-design.md`

## Operations

Operational notes, CI/CD validation writeups, and workflow-specific guidance live in [`operations/`](/Users/pauldurbin/later-life-planner/docs/operations):

- `operations/azure-codex-vault.md`
- `operations/ci-cd-review.md`
- `operations/ci-cd-claude-test-instructions.md`
- `operations/codex-auto-fix-issues.md`
- `operations/device-revocation-dek-rotation-runbook.md`
- `operations/planner-point-in-time-restore-runbook.md`
- `operations/user-deletion-runbook.md`
- `operations/restore-exclusion-control.md`
- `operations/inactive-account-policy-decision.md`
- `operations/dpia-screening-decision.md`
- `operations/dpo-decision-record.md`

## Reviews

Point-in-time assessment documents live in [`reviews/`](/Users/pauldurbin/later-life-planner/docs/reviews):

- `reviews/code-review.md`
- `reviews/code-review-checklist.md`
- `reviews/planner-review-and-implementation-plan.md`

## UI Reference Images

Design references live in [`ui-reference-images/`](/Users/pauldurbin/later-life-planner/docs/ui-reference-images).

## Conventions

- Keep canonical implementation docs at the root of `docs/`, except reusable prompt material which lives in `docs/prompts/`.
- Put one-off reviews in `docs/reviews/`.
- Put operational runbooks and workflow validation notes in `docs/operations/`.
- Put loose design assets in `docs/ui-reference-images/`.
- Avoid adding scratch files to `docs/`; if a note is temporary, keep it out of the repo.
