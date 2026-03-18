# Codex Review Loop (Local Orchestrator)

This repo uses a **local** review loop to orchestrate Codex reviews and automated fixes. The loop runs on your machine and updates a required GitHub status check to block merges until Codex issues are resolved.

## Why local?

- Codex/Claude runs locally where you already develop.
- GitHub Actions timing/race issues are avoided.
- The loop can iterate after every commit until clean.

## Required status check

Set branch protection to require the status check named:

```
codex-review-loop
```

If you previously required `codex-review-watcher / codex-review-gate`, remove it.

## Usage

From the repo root:

```
python scripts/codex_review_loop.py \
  --pr 123 \
  --repair-command "codex exec --prompt-file AGENTS.md" \
  --auto-commit \
  --push \
  --require-clean \
  --require-branch-match
```

You can also omit `--pr` if the current branch already has a PR.

## Environment variables passed to the repair command

The loop sets these environment variables for the repair command:

- `PR_NUMBER`
- `REPO` (OWNER/REPO)
- `HEAD_SHA`
- `HEAD_REF`
- `FIX_REQUESTS_JSON` (path to the extracted Codex requests)

## Common options

- `--poll-interval` (seconds, default 30)
- `--max-wait-minutes` (default 30)
- `--max-iterations` (default 5)
- `--status-context` (default `codex-review-loop`)

## Notes

- The loop **fails closed** if no Codex review arrives in time.
- The loop uses the **first-seen time** for a head SHA (stored in `.codex-orchestrator/state.json`) to avoid stale reviews from earlier commits.
- When Codex reports issues, the loop expects the repair command to fix them, then it will commit and push (if enabled) and wait for the next review.

## Test note

- This line exists to validate the codex-review-loop on a fresh PR.
