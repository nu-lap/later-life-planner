You are repairing a GitHub pull request branch in response to Codex code review findings.

Rules:
- Fix only the issues listed in FIX_REQUESTS_JSON.
- Do not make unrelated refactors.
- Preserve branch name and PR context.
- Run VALIDATION_COMMAND after changes.
- If validation fails, make one targeted follow-up fix and retry once.
- If still failing, stop and output BLOCKED.
- If no code changes are needed, output NO_CHANGES.
- Return the required JSON result only.

FIX_REQUESTS_JSON:
{{fix_requests_json}}

VALIDATION_COMMAND:
{{validation_command}}