Analyze the design system of this codebase with the goal of creating a DESIGN.md file in the project root and giving the user a file for easy copy & pasting.

Reference material:
  Overview : https://stitch.withgoogle.com/docs/design-md/overview/
  Format   : https://stitch.withgoogle.com/docs/design-md/format/
  Spec     : https://github.com/google-labs-code/design.md

Examples from the spec repo:
  https://github.com/google-labs-code/design.md/blob/main/examples/atmospheric-glass/DESIGN.md
  https://github.com/google-labs-code/design.md/blob/main/examples/paws-and-paths/DESIGN.md

Requirements:
- Begin with YAML frontmatter containing all structured design tokens
  (colors, typography, spacing, elevation, motion, radii, shadows, etc.)
- Follow with free-form Markdown that describes the look & feel and
  captures design intent that token values alone cannot convey
- The file must be entirely self-contained — do not reference any
  files, variables, or paths from the codebase
- All token values must use valid YAML design token format

---

## Screenshot capture

Before starting, capture UI screenshots so you can compare your DESIGN.md
tokens against the actual rendered product. Run the screenshot script:

```bash
# Against the deployed app (recommended — matches production styling exactly):
E2E_BASE_URL=https://ca-later-life-planner.salmonstone-6e18fbe9.uksouth.azurecontainerapps.io \
  npx playwright test tests/e2e/ui-screenshots.spec.ts \
  --config=playwright.screenshots.config.ts \
  --project=desktop

# Also capture mobile views:
E2E_BASE_URL=https://ca-later-life-planner.salmonstone-6e18fbe9.uksouth.azurecontainerapps.io \
  npx playwright test tests/e2e/ui-screenshots.spec.ts \
  --config=playwright.screenshots.config.ts \
  --project=mobile

# Against localhost (if the dev server is running):
npx playwright test tests/e2e/ui-screenshots.spec.ts \
  --config=playwright.screenshots.config.ts \
  --project=desktop
```

Screenshots land in `docs/ui-reference-images/<YYYY-MM-DD>/` as numbered PNGs:

| File | What it shows |
|------|---------------|
| `00-disclaimer-gate.png` | Disclaimer / consent modal (no localStorage) |
| `01-step0-mode-selector.png` | Step 0 — household setup, mode picker |
| `02-step0-single-filled.png` | Step 0 — single mode with name/DOB/FI age |
| `03-step0-couple-filled.png` | Step 0 — couple mode with both persons |
| `04-step1-life-vision.png` | Step 1 — life vision panel |
| `05-step2-spending-gogo.png` | Step 2 — Go-Go spending with RLSS moderate |
| `06-step2-spending-slowo.png` | Step 2 — Slo-Go tab active |
| `07-step2-spending-events.png` | Step 2 — with 3 planned events |
| `08-step3-income-assets.png` | Step 3 — income sources + assets panel |
| `09-step4-dashboard-healthy.png` | Step 4 — healthy plan with surplus |
| `10-step4-dashboard-tight.png` | Step 4 — constrained plan (near depletion) |
| `11-step4-dashboard-couple.png` | Step 4 — couple mode dashboard |
| `12-mobile-step0.png` | Step 0 at 390×844 (iPhone 13) |
| `13-mobile-step4-dashboard.png` | Step 4 dashboard at 390×844 |

### Prerequisites

The script uses a pre-saved Clerk auth session from `playwright/.clerk/user.json`.
If that file is missing or expired, re-generate it:

```bash
E2E_BASE_URL=<url> \
CLERK_SECRET_KEY=<key> \
E2E_CLERK_USER_EMAIL=<email> \
  npx playwright test tests/e2e/global.setup.ts --project=setup
```

### Customising the output directory

```bash
UI_SCREENSHOTS_DIR=docs/ui-reference-images/my-run \
E2E_BASE_URL=<url> \
  npx playwright test tests/e2e/ui-screenshots.spec.ts \
  --config=playwright.screenshots.config.ts \
  --project=desktop
```

---

## After capturing screenshots

Load the numbered PNGs into Stitch (or attach them to this prompt) so you can
compare your DESIGN.md against the rendered UI. Revise until both the YAML
tokens and the written description faithfully capture the product's visual
identity.
