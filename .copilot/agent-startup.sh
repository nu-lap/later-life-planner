#!/usr/bin/env bash
# Repo-local agent startup script
# - Locate repository root (walks up to find .git)
# - Source .env.copilot if present
# - Run scripts/setup-copilot-noninteractive.sh if present
# Safe, idempotent, and does not fail the session if the setup script errors.

# Prefer Git to locate the repository root so this also works when sourced
# from non-Bash shells where BASH_SOURCE is not defined.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -n "$repo_root" ] && [ -d "$repo_root" ]; then
  repo_root="$(cd "$repo_root" >/dev/null 2>&1 && pwd)"
else
  # Fall back to the script location for cases where Git-based detection is
  # unavailable. Use BASH_SOURCE when present, otherwise fall back to $0.
  script_path="${BASH_SOURCE[0]:-$0}"
  script_dir="$(cd "$(dirname "$script_path")" >/dev/null 2>&1 && pwd)"

  # Walk up from script_dir to find the git repo root (a directory containing .git)
  repo_root="$script_dir"
  while [ "$repo_root" != "/" ] && [ ! -d "$repo_root/.git" ]; do
    repo_root="$(dirname "$repo_root")"
  done

  if [ -d "$repo_root/.git" ]; then
    repo_root="$(cd "$repo_root" >/dev/null 2>&1 && pwd)"
  else
    # Fallback to the parent of .copilot (likely the repo root)
    repo_root="$(cd "$script_dir/.." >/dev/null 2>&1 && pwd)"
  fi
fi

# Source .env.copilot if present (do not fail on errors)
env_file="$repo_root/.env.copilot"
if [ -f "$env_file" ]; then
  # shellcheck disable=SC1090
  . "$env_file" || true
fi

# Run the non-interactive setup script if present. Don't fail the session if it errors.
setup_script="$repo_root/scripts/setup-copilot-noninteractive.sh"
if [ -x "$setup_script" ]; then
  "$setup_script" || true
elif [ -f "$setup_script" ]; then
  bash "$setup_script" || true
fi

# End of script
return 0 2>/dev/null || exit 0
