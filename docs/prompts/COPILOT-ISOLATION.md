# Copilot Isolation & Collaboration Guidelines

This file establishes working practices for multiple concurrent Copilot instances on the later-life-planner repository.

## 🎯 Quick Start: Using Git Worktrees

**Multiple Copilot instances should each use a separate git worktree** to work on different branches simultaneously without interference.

### For a New Copilot Instance

```bash
# 1. Navigate to the repo
cd /Users/pauldurbin/github/later-life-planner

# 2. Create an isolated worktree for your branch
./scripts/setup-copilot-worktree.sh llp-ui feature/my-task

# 3. Switch to your worktree
cd ../llp-llp-ui

# 4. Start working (all git/npm commands work normally)
npm run dev
git status
git commit -m "fix: my change"
git push origin feature/my-task

# 5. When done, clean up
cd /Users/pauldurbin/github/later-life-planner
git worktree remove ../llp-llp-ui
```

### See All Worktrees
```bash
cd /Users/pauldurbin/github/later-life-planner
git worktree list
```

---

## 🔐 Isolation Rules (CRITICAL)

### Branch Isolation
- **Always work on a feature branch**, never directly on `master` or `origin/master`
- **Create a new branch** for each task: `feature/xyz`, `fix/xyz`, `docs/xyz`, or `chore/xyz`
- **Never force-push** to branches that already have PRs or have been pushed to origin
- **Never rebase/amend commits** that have been pushed — if needed, create a new commit instead
- **Do NOT assume commit history is stable** — always `git pull` the remote branch before making changes to branches that have been pushed

### Git Workflow for Multi-Agent Safety
```bash
# Before starting work on an existing branch:
git pull origin <branch-name>

# Always create isolated feature branches:
git checkout -b feature/<task-name>

# After committing locally:
git push origin feature/<task-name>
# DO NOT force-push (git push --force is forbidden)

# Create PR immediately after first push to prevent confusion
gh pr create --draft  # if still in progress
gh pr create         # if ready for review
```

### File & State Isolation
- **Do NOT edit files without checking git status first**: `git status`
- **Do NOT assume local state is current**: Always `git pull` before reading/modifying shared files
- **Do NOT leave uncommitted changes**: Commit or stash before switching branches
- **Do NOT edit environment files** (`.env*`) or secrets — these are shared and locked

### Workspace Hygiene
- **Clean up temporary files** at end of session (test artifacts, screenshots, scripts in working dir)
- **Do NOT commit build artifacts, node_modules, or generated files**
- **Do NOT leave uncommitted changes** for other instances to discover
- **Do NOT create merge conflicts**: Coordinate via PR comments if multiple instances touch the same files

## 🔄 Coordination Practices

### Detecting Other Instances
Before starting work:
```bash
git fetch origin
git branch -a  # See all branches
gh pr list     # See all open PRs
```

If you see an active PR touching your intended files, check PR comments for coordination status.

### Communicating Intent
When starting work on shared areas (e.g., financialEngine, Step components):
1. Create your feature branch immediately
2. Mention it in context if you're touching high-contention files
3. Commit incrementally with clear messages (helps other instances understand progress)
4. Link related issues/PRs in commit messages

### Handling Conflicts
- **If another instance is working on the same files**: Create a new branch and coordinate in the PR
- **If you encounter a merge conflict**: Never force-push; instead create a new commit that resolves it
- **If branches diverge**: Use rebase only on unpushed local commits; use merge commits for pushed branches

## 📋 Pre-Work Checklist

Every Copilot instance must follow this before making changes:

- [ ] Run `git status` and `git fetch origin`
- [ ] Verify current branch: `git branch` (should not be `master`)
- [ ] If on an existing branch with a PR: `git pull origin <branch>`
- [ ] Create a new feature branch if starting fresh: `git checkout -b feature/<descriptive-name>`
- [ ] Confirm no uncommitted changes: `git status` (should be clean)
- [ ] Run linter/build to verify baseline: `npm run lint && npm run build`

## 🚀 After-Work Checklist

- [ ] Stage all changes: `git add -A`
- [ ] Create clear, atomic commits: `git commit -m "fix: description"`
- [ ] Push to origin: `git push origin <branch-name>`
- [ ] Create or update PR: `gh pr create` or `gh pr view`
- [ ] Clean up temporary files in working directory
- [ ] Verify no uncommitted changes: `git status` (should be clean)
- [ ] Note branch name in session summary for handoff

## ⚠️ Forbidden Practices

**NEVER:**
- Force-push to any branch: `git push --force`, `git push -f`
- Amend/rebase pushed commits: `git commit --amend`, `git rebase` (on pushed branches)
- Edit `.env*` or secrets files
- Leave uncommitted changes
- Assume commit history is stable without pulling first
- Create PRs from `master` branch

## 🛠️ Git Worktrees for Concurrent Development

### What is a Worktree?

A **git worktree** is an isolated checkout of the repository in a separate directory. Each worktree can have a different branch checked out. This allows **multiple Copilot instances to work simultaneously on different branches without interfering with each other**.

**Problem without worktrees:** All instances share the same `.git/index`, so `git checkout feature/xyz` in one instance affects all others.

**Solution with worktrees:** Each instance uses its own worktree directory, enabling true parallel work.

### Setup

**For a new Copilot instance starting a task:**

```bash
cd /Users/pauldurbin/github/later-life-planner

# Create a worktree for your branch
./scripts/setup-copilot-worktree.sh llp-task-name feature/my-feature

# Navigate to your worktree
cd ../llp-llp-task-name

# All git/npm commands work normally from here
npm run dev
git status
git commit -m "fix: my change"
```

**Script parameters:**
- `llp-task-name` — Unique worktree identifier (e.g., `llp-ui`, `llp-engine`, `llp-docs`)
  - Creates worktree at: `../llp-llp-task-name`
- `feature/my-feature` — Branch name (fetches from origin if not local)

### Usage

```bash
# List all active worktrees
git worktree list

# Remove a worktree when done (from main repo)
cd /Users/pauldurbin/github/later-life-planner
git worktree remove ../llp-llp-task-name
```

### Layout Example

```
/Users/pauldurbin/github/
├── later-life-planner/           ← main repo (any branch)
├── llp-llp-ui/                   ← Copilot-1 worktree (feature/dashboard)
├── llp-llp-engine/               ← Copilot-2 worktree (fix/pension-calc)
└── llp-llp-docs/                 ← Copilot-3 worktree (docs/user-guide)
```

Each instance works independently; no checkout conflicts.

### Important Notes

- **node_modules are separate** — `setup-copilot-worktree.sh` installs dependencies in each worktree
- **Git objects are shared** — Worktrees share the `.git` directory from the main repo (efficient)
- **Always clean up** — Remove worktrees when done: `git worktree remove <path>`
- **Create PRs from worktrees** — Works normally; the worktree is just a checkout

## 📝 Communication

If multiple instances are working on overlapping areas:
- Use PR comments to describe your approach
- Link related PRs and issues
- Mention specific file ranges you're modifying
- Note any blocking dependencies

This ensures smooth collaboration and prevents silent conflicts.
