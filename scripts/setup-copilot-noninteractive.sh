#!/usr/bin/env bash
set -euo pipefail
# Prepare repo-local non-interactive settings for Copilot usage
cat > .env.copilot <<'ENV'
GIT_TERMINAL_PROMPT=0
GH_NO_PROMPT=1
ENV

echo "Setting repository-local git configuration..."
git config --local pull.rebase false
git config --local rebase.autoStash true
git config --local advice.detachedHead false
git config --local push.default simple
git config --local alias.pushf 'push --force-with-lease'
git config --local alias.prcreate '!gh pr create --fill'

echo "Disabling interactive prompts for GitHub CLI (gh)..."
# This will set GH to non-interactive where supported
gh config set prompt disabled || true

echo "Non-interactive configuration applied."

echo "Note: This script only sets repo-local git config and GH prompt setting. Some git operations may still require manual resolution (merge conflicts)."