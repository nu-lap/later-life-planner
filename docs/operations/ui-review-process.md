# UI Review Process

This runbook describes the end-to-end process for conducting a Playwright-based
UI/UX review of the live LaterLifePlan application, implementing the identified
improvements, validating them on the live build, and cleaning up afterwards.

Any Copilot session can follow these steps verbatim.

---

## 0. Reviewer persona

Before starting the review, adopt the following persona. This shapes the lens
through which findings are identified and written up.

> **You are a senior product designer with 15 years of experience across
> fintech and consumer SaaS.** Your specialisms are:
>
> - **Information hierarchy** — ensuring the most actionable content is
>   immediately visible, not buried below the fold.
> - **Visual language consistency** — colour, typography, spacing, and iconography
>   should follow a coherent system; arbitrary variation erodes user trust.
> - **Accessibility** — WCAG AA compliance as a minimum; font sizes ≥ 13px for
>   body, ≥ 12px for labels; sufficient contrast ratios; keyboard-navigable
>   controls with correct ARIA roles.
> - **UK financial UX** — familiarity with UK-specific conventions (pension,
>   ISA, tax); ability to identify where jargon (e.g. PCLS, UFPLS, NMPA)
>   should be replaced with plain English for a general audience.
> - **Chart design** — axis labels, tick formatting, legends, and captions must
>   be unambiguous; Y-axis should never show fractional currency values; charts
>   must have explanatory captions for first-time readers.
> - **Sign conventions** — metrics that represent a trade-off (e.g. tax paid
>   under one strategy vs another) must use colour consistently with their
>   semantic meaning; green must never indicate "paying more tax".
>
> You are direct and specific. You name the exact component and line-level issue.
> You distinguish between **quick wins** (implementable in one PR without a
> design-system overhaul) and **structural changes** (requiring larger
> rearchitecting). You do not pad findings with generic UX advice.

---

## 1. Prerequisites

- Playwright MCP browser tools must be available in the session.
- The live app must be running at the target URL.
- The reviewer must be signed in to the app before taking screenshots (the app
  redirects to `/sign-in` in headless / unauthenticated mode).
- The local repo must be on a clean branch based on the latest `master`:
  ```bash
  git checkout master && git pull origin master
  ```

---

## 2. Sign in via Playwright

Launch a headful persistent-context browser so auth state survives across
Playwright calls:

1. Use `playwright-browser_navigate` to open the live app URL.
2. If redirected to `/sign-in`, use `playwright-browser_snapshot` to read the
   page and `playwright-browser_click` / `playwright-browser_type` to complete
   sign-in.
3. Once signed in, navigate to the page under review (e.g. the planner root `/`
   and advance to Step 5 via the planner nav).

> **Key facts for LLP:**
> - Live URL: `https://ca-later-life-planner.salmonstone-6e18fbe9.uksouth.azurecontainerapps.io/`
> - The planner is at the root `/`, not `/planner`.
> - localStorage key: `life-planner-v6`; Zustand persist format:
>   `{state: {...plan, currentStep: 4, maxVisitedStep: 4}, version: 0}`
> - To reach Step 5 (Dashboard), inject plan data via `playwright-browser_evaluate`
>   if needed, then navigate to `/`.

---

## 3. Take systematic screenshots

Resize the viewport to a standard desktop size:

```
playwright-browser_resize width=1440 height=900
```

Take 6–8 screenshots at regular vertical offsets across the full page height.
A 5000–6000 px page typically needs offsets of 0, 900, 1800, 2700, 3600, 4500, 5400 px.

Use `playwright-browser_evaluate` to scroll to each offset then
`playwright-browser_take_screenshot`:

```javascript
// example scroll + screenshot pattern
await page.evaluate(() => window.scrollTo(0, 900));
```

Save each screenshot with a descriptive name, e.g.:
`docs/ui-reference-images/review-YYYY-MM-DD-0000px.png`

> Screenshots are **temporary working artefacts**. Do NOT commit them to the repo.
> Delete them during the cleanup step (§ 8).

---

## 4. Write the review document

Create the review document at:

```
docs/reviews/<component>-ui-improvement-plan-YYYY-MM-DD.md
```

Structure the document as follows (see `dashboard-ui-improvement-plan-2026-04-24.md`
as a reference):

1. **Header** — component reviewed, date, reviewer, method, scope
2. **Executive Summary** — 3–5 top findings
3. **Section-by-section findings** — for each UI section:
   - What works
   - Issues
   - Improvements
4. **Priority matrix** — all issues ranked P0 / P1 / P2 / P3 / Nit
5. **Proposed page structure** (if navigation / layout is affected)
6. **Quick wins** — subset of P1/P2 fixes deliverable in a single PR without a
   design-system overhaul

---

## 5. Push the review document as a PR

> **Do NOT push directly to `master`** — branch protection rules require PRs.

```bash
git checkout -b docs/<component>-ui-review-YYYY-MM-DD
git add docs/reviews/<component>-ui-improvement-plan-YYYY-MM-DD.md
git commit -m "docs: add <component> UI/UX critical review and improvement plan (Month YYYY)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push origin docs/<component>-ui-review-YYYY-MM-DD
gh pr create \
  --title "docs: <component> UI/UX critical review & improvement plan" \
  --body "Adds the Playwright-based UI/UX review document identifying improvements to <component>." \
  --base master
```

---

## 6. Implement quick wins

Create a feature branch from the latest `master` (or from the review doc branch
if it was just merged):

```bash
git checkout master && git pull origin master
git checkout -b feat/<component>-quick-wins
```

Work through the quick wins list in the review document one by one.
Commit atomically so each quick win is traceable if a regression is needed.

After all changes:

```bash
npm run build   # must pass cleanly
npm run test    # fix any tests broken by UI changes before pushing
```

Push and create a PR:

```bash
git push origin feat/<component>-quick-wins
gh pr create \
  --title "feat(<component>): quick-win UI improvements from <Month YYYY> review" \
  --body "Implements the quick-win subset from docs/reviews/<component>-ui-improvement-plan-YYYY-MM-DD.md" \
  --base master
```

---

## 7. Validate quick wins on the live build

After the quick-wins PR is merged and the CI/CD pipeline has deployed the new
image, validate each quick win against the live app using Playwright.

For each quick win:

1. Navigate to the relevant section of the page.
2. Take a screenshot or use `playwright-browser_snapshot` to capture the
   accessibility tree.
3. Assert the expected change is visible (e.g. anchor nav pills present, person
   label font size increased, Demo/Reset hidden, chart Y-axis is integer-only).

Document the validation outcome in your session notes or update the review doc
with a "Validated ✅" annotation against each quick win.

---

## 8. Cleanup

After the review is complete and all PRs are merged, delete all temporary artefacts:

### 8a. Screenshots (untracked files in project root or docs/)

```bash
# List any leftover screenshot files
git status --short | grep -E '\.(png|jpg|jpeg)$'

# Delete them
rm -f llp-*.png llp-signin.png docs/ui-reference-images/review-*.png
# (adjust glob as appropriate for files actually created)
```

### 8b. Debugging / one-off scripts

If any `scripts/check-*.ts`, `scripts/get-*.ts`, or other ad-hoc debugging
scripts were created during the session, delete them:

```bash
git status --short | grep 'scripts/'
rm -f scripts/check-fixture.ts scripts/get-fixture.ts
# delete any others identified
```

### 8c. Playwright session artefacts (outside the repo)

```bash
rm -rf /tmp/llp-playwright-profile
rm -f /tmp/llp-auth-state.json
```

### 8d. Confirm working tree is clean

```bash
git status --short
# expected output: empty (nothing to commit)
```

---

## Reference: Dashboard UI review (April 2026)

The first use of this process reviewed `Step4Dashboard` (the full dashboard
step) on 24 April 2026. The artefacts from that review are:

| Artefact | Location |
|---|---|
| Review document | `docs/reviews/dashboard-ui-improvement-plan-2026-04-24.md` |
| Review doc PR | #278 |
| Quick wins PR | #279 |
| Validation | Done on live Azure build post-merge |

**8 quick wins implemented:**

| # | Change | Component |
|---|---|---|
| QW1 | Anchor nav bar (5 pills with icons + section IDs) | `Step4Dashboard.tsx` |
| QW2 | Person label font: `text-[10px]` → `text-xs text-slate-500` | `OptimizerPanel.tsx` |
| QW3 | Move Action Plan above strategy comparison table | `OptimizerPanel.tsx` |
| QW4 | Strategy comparison collapsed by default (`showStrategyComparison = false`) | `OptimizerPanel.tsx` |
| QW5 | Tax Impact card: green → slate neutral + tradeoff note | `OptimizerPanel.tsx` |
| QW6 | Demo/Reset buttons gated: `NODE_ENV === 'development'` only | `Header.tsx` |
| QW7 | Chart Y-axis: `tickCount={6} allowDecimals={false}` | `LifetimeChart.tsx`, `AssetChart.tsx` |
| QW8 | Caption below income chart explaining bars above/below the dashed line | `Step4Dashboard.tsx` |

**Tests that broke and were fixed:**

| Test file | Reason | Fix |
|---|---|---|
| `header.test.tsx` | Demo/Reset now hidden in non-dev | Assert they are hidden |
| `optimizerPanel.test.tsx` (×2) | Tax card label renamed | Update expected label text |
| `optimizerPanel.test.tsx` | Comparison collapsed by default | Click "Show comparison" before asserting |
