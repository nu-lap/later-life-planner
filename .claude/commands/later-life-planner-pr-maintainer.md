---
description: Use when creating, updating, or stabilizing a GitHub pull request for /Users/pauldurbin/later-life-planner. Apply after commits are pushed and the PR must be monitored through Copilot PR Review, CodeQL, Security Scans, and CI/CD; when failures must be collated and fixed in separate commits; and when review conversations must be resolved after fixes land.
---

# Later Life Planner PR Maintainer

Use this skill for PR work in `/Users/pauldurbin/later-life-planner` once a branch has been pushed or is about to be pushed for review.

Read `.claude/commands/references/pr-workflow.md` for the exact `gh` commands and GraphQL snippets.

## Workflow

1. Identify the PR context.
   - Confirm the PR number, branch name, and current head SHA.
   - Assume these workflows are relevant unless the PR clearly skips them:
     - `.github/workflows/copilot-review.yml`
     - `.github/workflows/codeql.yml`
     - `.github/workflows/security-scans.yml`
     - `.github/workflows/ci-cd.yml`
   - Treat `review-gate` as a summary gate. If it fails, inspect the underlying review result rather than fixing `review-gate` directly.

2. Push intentionally.
   - If you are still diagnosing multiple failures, do not push partial fixes one by one.
   - After a push, wait for the PR workflows to finish so you have the full failure set for that head.
   - If you need multiple fixes, make one local commit per independent failure or root cause.
   - Once all fixes are committed locally, push them together so GitHub Actions reruns once for the updated head.

3. Monitor the PR until all current runs finish.
   - Use `gh pr checks <pr> --watch --interval 5`.
   - If checks fail, inspect the failed runs and job logs with `gh run view`.
   - Keep notes by failure source: review findings, CodeQL, Security Scans, CI/CD.

4. Collate failures before editing.
   - Reduce the output to a concrete fix list with file paths and required changes.
   - Deduplicate failures that share one root cause.
   - Fix the underlying code or workflow issue, not just the symptom reported by a gate job.

5. Commit fixes separately.
   - Use a separate commit for each independent failure you fix.
   - If one code change resolves multiple reports caused by the same root cause, keep that in one commit.
   - Do not mix unrelated fixes into the same commit just because they were discovered in the same run.

6. Push once and watch again.
   - Push all outstanding fix commits together.
   - Wait again for the full PR status to settle.
   - Repeat the cycle only if the new head introduces or reveals more failures.

7. Resolve review conversations after the fixes are on the PR.
   - After the relevant fix is pushed, list unresolved review threads.
   - Resolve only the threads that the current code actually addresses.
   - Leave unresolved threads open if the finding is still valid or if the fix has not landed yet.

## Operating Rules

- Prefer `gh pr checks` for the high-level wait loop and `gh run view --log` for the detailed failure text.
- Re-check the PR head SHA before pushing. If the head changed while you were working, refresh your failure list against the new head instead of pushing stale fixes blindly.
- Keep the user informed of the failure set, the planned fix commits, and the final post-push status.
- If a failure requires clarification or policy input, stop after collating the failures and ask the user before making a speculative fix.
- When addressing security or CodeQL findings, do not add inline suppression comments (e.g., `# nosem`, `// nosemgrep`, `// ignore`) or similar disablement pragmas. Fix the underlying issue instead.
- If an Autofix suggestion is present on the PR, use it as a hint to implement an actual fix rather than suppressing the check.
- Never bypass scanners by adding ignore lists or opt-out files. Remediate findings directly.

## Expected Outcomes

- Every failing signal from the relevant workflows is accounted for.
- Each independent fix is in its own commit.
- Only one push is used to trigger the verification rerun for the batch of fixes.
- Resolved review findings have their GitHub review conversations marked resolved.
