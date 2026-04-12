Agent startup README

This repository includes a local agent startup script at .copilot/agent-startup.sh.
When sourced at the start of a shell session inside the repository it will:

- locate the repository root
- source the repository-local .env.copilot (if present)
- run scripts/setup-copilot-noninteractive.sh (if present)

To enable this on session start, add a snippet to your shell profile (e.g. ~/.bashrc or ~/.zshrc).
Example (recommended):

# Source repo-local agent startup when opening a shell inside the repo
if command -v git >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$repo_root" ] && [ -f "$repo_root/.copilot/agent-startup.sh" ]; then
    # shellcheck disable=SC1090
    . "$repo_root/.copilot/agent-startup.sh"
  fi
fi

This is safe and idempotent: the startup script will quietly skip missing files and will not cause the session to fail if the setup script returns an error.
