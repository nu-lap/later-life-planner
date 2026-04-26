#!/bin/bash
#
# setup-copilot-worktree.sh
#
# Usage: ./scripts/setup-copilot-worktree.sh <worktree-name> <branch-name>
#
# Example:
#   ./scripts/setup-copilot-worktree.sh llp-ui feature/new-dashboard
#   ./scripts/setup-copilot-worktree.sh llp-engine fix/pension-calc
#
# This script creates an isolated git worktree so Copilot instances can work
# on different branches simultaneously without interfering with each other.
#
# Worktrees are created in ../llp-<worktree-name> alongside the main repo.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <worktree-name> <branch-name>"
  echo ""
  echo "Examples:"
  echo "  $0 llp-ui feature/new-dashboard"
  echo "  $0 llp-engine fix/pension-calc"
  exit 1
fi

WORKTREE_NAME="$1"
BRANCH_NAME="$2"

# Get the main repo root
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_PARENT="$(dirname "$REPO_ROOT")"
WORKTREE_PATH="$REPO_PARENT/llp-$WORKTREE_NAME"

if [[ -d "$WORKTREE_PATH" ]]; then
  echo "❌ Worktree already exists at: $WORKTREE_PATH"
  echo "   To remove it: git worktree remove '$WORKTREE_PATH'"
  exit 1
fi

echo "📦 Creating git worktree..."
echo "   Name: $WORKTREE_NAME"
echo "   Branch: $BRANCH_NAME"
echo "   Path: $WORKTREE_PATH"

# Fetch latest from origin to ensure branch exists
git fetch origin "$BRANCH_NAME" 2>/dev/null || true

# Create worktree
git worktree add "$WORKTREE_PATH" "origin/$BRANCH_NAME" 2>/dev/null || \
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"

# Install dependencies if node_modules is missing
if [[ ! -d "$WORKTREE_PATH/node_modules" ]]; then
  echo "📦 Installing dependencies..."
  cd "$WORKTREE_PATH"
  npm install
  cd "$REPO_ROOT"
fi

echo ""
echo "✅ Worktree created successfully!"
echo ""
echo "📍 Location: $WORKTREE_PATH"
echo ""
echo "🚀 To start working:"
echo "   cd $WORKTREE_PATH"
echo "   npm run dev"
echo ""
echo "📝 To see all worktrees:"
echo "   git worktree list"
echo ""
echo "🗑️  To remove this worktree when done:"
echo "   git worktree remove '$WORKTREE_PATH'"
