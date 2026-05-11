# PR Workflow Reference

Use these commands when the skill tells you to monitor or repair a PR.

## Core PR Status

Inspect the PR head and current status rollup:

```bash
gh pr view <pr> --json number,title,url,headRefName,headRefOid,statusCheckRollup
```

Watch the PR checks until they complete:

```bash
gh pr checks <pr> --watch --interval 5
```

## Workflow Runs And Logs

List recent runs for the branch:

```bash
gh run list --branch <branch> --limit 20
```

Inspect a run summary:

```bash
gh run view <run-id>
```

Inspect full logs for a failed run or job:

```bash
gh run view <run-id> --log
gh run view <run-id> --job <job-id> --log
```

The workflows that normally matter for Later Life Planner PRs are:

- `.github/workflows/copilot-review.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/security-scans.yml`
- `.github/workflows/ci-cd.yml`

## Copilot Review Threads

List review threads on a PR:

```bash
gh api graphql \
  -f query='query($owner:String!, $repo:String!, $number:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { id isResolved comments(first:20) { nodes { author { login } body path url } } } } } } }' \
  -F owner=<owner> \
  -F repo=<repo> \
  -F number=<pr>
```

Resolve a review thread after the fix is on the PR:

```bash
gh api graphql \
  -f query='mutation($threadId:ID!) { resolveReviewThread(input:{threadId:$threadId}) { thread { id isResolved } } }' \
  -F threadId=<thread-id>
```

Only resolve a thread when the current PR code addresses that finding.

## Commit Strategy

- Collate all failures for the current head before editing.
- Make one commit per independent failure or root cause.
- Push the whole batch once so the PR reruns once.
