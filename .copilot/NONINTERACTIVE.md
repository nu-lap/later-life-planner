This repository contains helper configuration to run git and GH CLI non-interactively for Copilot operations.

What was applied by scripts/setup-copilot-noninteractive.sh:

- Created .env.copilot with environment variables:
  - GIT_TERMINAL_PROMPT=0
  - GH_NO_PROMPT=1
- Set repository-local git config:
  - pull.rebase = false
  - rebase.autoStash = true
  - advice.detachedHead = false
  - push.default = simple
  - alias.pushf = "push ---force-with-lease"
  - alias.prcreate = "!gh pr create --fill"
- Disabled interactive prompts for GitHub CLI where supported: `gh config set prompt disabled`.

Security note: Disabling prompts can be dangerous. These settings allow automated operations to proceed without interactive confirmation; review before merging to a shared branch.
