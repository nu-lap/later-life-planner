You are an expert in GitHub Actions, CI/CD policy enforcement, and automated 
code review systems. Your task is to generate a complete GitHub Action workflow 
that replaces the legacy Codex-based review system.

Your output must be a single, valid GitHub Actions workflow YAML file that 
implements the new “Copilot Review Gate” described below. This workflow will 
replace the following files, which must no longer be referenced or required:

- .github/workflows/codex-review.yml
- .github/workflows/codex-auth-refresh.yml

Additionally, the file .github/workflows/codex-auto-fix.yml must be removed and 
its functionality must not be recreated.

---------------------------------------
REQUIREMENTS FOR THE NEW WORKFLOW FILE
---------------------------------------

1. WORKFLOW PURPOSE
   The workflow must:
   - Parse GitHub Copilot PR review comments.
   - Identify comments authored by the user “github-copilot”.
   - Detect blocking issues by searching for any of these terms:
       “security”, “unsafe”, “injection”, “race”, “critical”, 
       “undefined behavior”.
   - Fail the workflow if any blocking issues are found.
   - Pass the workflow if no blocking issues are found.
   - Emit a status check named: Copilot Review Gate.

2. TRIGGERS
   The workflow must run on:
   - pull_request events:
       opened
       synchronize
       reopened

3. IMPLEMENTATION DETAILS
   - Use actions/github-script@v7.
   - Use the GitHub REST API to fetch PR review comments.
   - Filter comments by author “github-copilot”.
   - Count blocking issues using keyword matching.
   - Expose the count as a job output.
   - Exit with non-zero status if blockers > 0.
   - The job must be named: copilot-gate.
   - The workflow must be named: Copilot Review Gate.

4. STYLE AND STRUCTURE
   - Output only the final YAML workflow file.
   - The YAML must be production-ready and valid.
   - Include comments explaining each major step.
   - Do not include placeholder text.
   - Do not mention Codex, tokens, authentication refresh, or legacy files.
   - Do not mention these instructions in the output.

---------------------------------------
YOUR TASK
---------------------------------------

Generate only the final GitHub Action workflow YAML file that satisfies all 
requirements above. The output must be ready to save as:

.github/workflows/copilot-review-gate.yml
