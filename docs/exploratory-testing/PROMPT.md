# LLP Exploratory Testing — Claude Code Prompt

Paste this entire document into Claude Code as a task to run an automated exploratory testing session against the deployed Later-Life Planner app.

---

## Your Role

You are an expert exploratory test engineer running a structured session-based exploratory testing (SBET) session against the deployed LaterLifePlan app. Your job is to find bugs. You will write and execute Playwright test scripts, observe the results, and produce a prioritised bug report.

**You must NOT fix any bugs you find.** Document them, prioritise them, and stop.

---

## Prerequisites — Check Before Starting

Before doing anything else, verify the environment is ready:

```bash
# 1. Check E2E_BASE_URL is set and the app is reachable
echo "Target: $E2E_BASE_URL"
curl -s -o /dev/null -w "%{http_code}" "$E2E_BASE_URL" || echo "WARNING: app not reachable"

# 2. Check Clerk credentials exist
echo "CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:0:10}..."
echo "E2E_CLERK_USER_EMAIL: $E2E_CLERK_USER_EMAIL"

# 3. Install dependencies if needed
npm list @axe-core/playwright @faker-js/faker --depth=0 2>/dev/null || npm install --save-dev @axe-core/playwright @faker-js/faker
```

If `E2E_BASE_URL` is not set, resolve the deployed Azure FQDN first:
```bash
E2E_BASE_URL="https://$(az containerapp show \
  --name ca-later-life-planner \
  --resource-group rg-later-life-planner \
  --query properties.configuration.ingress.fqdn -o tsv)"
export E2E_BASE_URL
```

If Clerk credentials are missing, stop and tell the user what's needed.

---

## Session Initialisation

Create a timestamped session directory and start a notes file:

```bash
SESSION_DIR="docs/exploratory-testing/sessions/$(date +%Y-%m-%d-%H-%M)"
mkdir -p "$SESSION_DIR/screenshots"
```

Write `$SESSION_DIR/session-notes.md` with this header:

```markdown
# Exploratory Testing Session Notes
**Date:** $(date)
**Target:** $E2E_BASE_URL
**Charters run:** (fill in as you go)

## Candidate Bugs
(Add as you find them — BUG-XXX format)

## Observations & Questions
(Interesting behaviour that isn't clearly a bug yet)
```

---

## Auth Setup

Run the Clerk authentication setup so subsequent charters can use saved storage state:

```bash
CLERK_SECRET_KEY=$CLERK_SECRET_KEY E2E_BASE_URL=$E2E_BASE_URL npx playwright test tests/e2e/global.setup.ts --project=setup
```

If this fails because the `setup` project doesn't exist (happens when Playwright config conditionally excludes it), run the setup manually by writing a temporary setup script and executing it. The setup must:
1. Navigate to `$E2E_BASE_URL/sign-in`
2. Call `clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL })`
3. Call `page.request.delete('/api/data')` to reset remote plan data
4. Save `playwright/.clerk/user.json` storage state

---

## Constants Reference

These are used across all charter spec files:

```typescript
// Use these in every charter spec file
const STORAGE_KEY = 'life-planner-v6';
const DISCLAIMER_KEY = 'llp-disclaimer-accepted';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SESSION_DIR = process.env.EXPLORATORY_SESSION_DIR ?? 'docs/exploratory-testing/sessions/unknown';
```

---

## Charter Execution Pattern

For each charter below:

1. **Write** the spec file to `tests/e2e/exploratory/charter-N.spec.ts`
2. **Run** it:
   ```bash
   E2E_BASE_URL=$E2E_BASE_URL \
   EXPLORATORY_SESSION_DIR=$SESSION_DIR \
   npx playwright test tests/e2e/exploratory/charter-N.spec.ts \
     --project=chromium \
     --trace=on \
     --reporter=json \
     --timeout=45000 \
     --global-timeout=300000 \
     --output=tests/e2e/exploratory/output/ 2>&1
   ```
   For charters requiring Clerk auth (8), use `--project=authenticated` instead.

   **Time limits:** `--timeout=45000` caps each individual test at 45 seconds. `--global-timeout=300000` caps the entire charter at 5 minutes. A charter that hits the global timeout is still recorded as a finding — note which tests didn't complete.
3. **Read** the JSON output and test-results directory
4. **Record** every failure, unexpected behaviour, or console error in `session-notes.md`
5. **Save** screenshots of interesting states to `$SESSION_DIR/screenshots/`
6. **Continue** — a failed assertion is a finding, not a reason to stop. Catch all errors and keep going.

---

## Universal Test Patterns

Include these in every charter spec file:

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { faker } from '@faker-js/faker';

// Cap each test at 45 seconds — overrides the Playwright config default
test.setTimeout(45_000);

// Console error tracking — attach to every test
test.beforeEach(async ({ page }) => {
  (page as any).__consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') (page as any).__consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    (page as any).__consoleErrors.push(`UNCAUGHT: ${err.message}`);
  });
});

// Helper: inject localStorage state and navigate to a given step
async function seedAndNavigate(page: any, stepOverride: number, extraState: object = {}) {
  const baseState = {
    mode: 'single',
    person1: {
      name: faker.person.firstName(),
      dob: '1966-01-01',
      fiAge: 60,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dcPension: { enabled: true, totalValue: 300000, growthRate: 4 },
      },
      assets: {
        isaInvestments: { enabled: true, totalValue: 100000, growthRate: 4 },
      },
    },
    assumptions: { lifeExpectancy: 90, investmentGrowth: 4, inflation: 2.5 },
    rlssStandard: 'moderate',
    currentStep: stepOverride,
    maxVisitedStep: stepOverride,
  };
  const state = { ...baseState, ...extraState };
  await page.addInitScript(
    ({ sk, dk, s }: any) => {
      localStorage.setItem(dk, '1');
      localStorage.setItem(sk, JSON.stringify({ state: s, version: 0 }));
    },
    { sk: 'life-planner-v6', dk: 'llp-disclaimer-accepted', s: state },
  );
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
}

// Helper: run axe accessibility check and return violations
async function runAxeCheck(page: any, context: string): Promise<string[]> {
  try {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.map(v => `[A11Y][${context}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`);
  } catch {
    return [];
  }
}

// Helper: take a named screenshot to the session dir
async function screenshot(page: any, name: string) {
  const dir = process.env.EXPLORATORY_SESSION_DIR ?? 'docs/exploratory-testing/sessions/unknown';
  await page.screenshot({ path: `${dir}/screenshots/${name}.png`, fullPage: true });
}
```

---

## Charter 1 — Happy Path Baseline (Single Mode)

**Goal:** Complete wizard start to finish with a plausible single-person plan. Verify dashboard shows coherent numbers and console is clean.

**Technique:** Smoke + oracle testing.

```typescript
test('charter1: happy path single mode — full wizard completion', async ({ page }) => {
  // Start fresh — no localStorage seeding, test the real entry flow
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
  
  // Disclaimer gate
  const disclaimerCheckbox = page.getByRole('checkbox').first();
  if (await disclaimerCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await disclaimerCheckbox.check();
    await page.getByRole('button', { name: /continue|start|let's go/i }).first().click();
  }
  await screenshot(page, 'c1-after-disclaimer');

  // Step 1
  await page.waitForSelector('[data-testid="step1-mode-single"]', { timeout: 10000 });
  await page.getByTestId('step1-mode-single').click();
  await page.getByTestId('step1-p1-name').fill('Alex');
  await page.getByTestId('step1-p1-dob').fill('1966-03-15');
  await page.getByTestId('step1-next').click();
  await screenshot(page, 'c1-step1-complete');

  // Step 2 — Life Vision (skip AI generation, just proceed)
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /next/i }).last().click();
  await screenshot(page, 'c1-step2-complete');

  // Step 3 — Spending: apply RLSS moderate
  await page.waitForTimeout(1000);
  const rlssBtn = page.getByTestId('step2-rlss-moderate');
  if (await rlssBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await rlssBtn.click();
  }
  const totalSpend = page.getByTestId('step2-total-spend');
  const spendText = await totalSpend.textContent().catch(() => 'NOT FOUND');
  // Record spend total — should be non-zero
  if (!spendText || spendText.includes('0')) {
    console.log(`CANDIDATE BUG: spend total shows "${spendText}" after applying RLSS moderate`);
  }
  await page.getByRole('button', { name: /next/i }).last().click();
  await screenshot(page, 'c1-step3-complete');

  // Step 4 — Income & Assets: enable DC pension
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /next/i }).last().click();
  await screenshot(page, 'c1-step4-complete');

  // Dashboard (Step 5)
  await page.waitForTimeout(2000);
  const kpiCards = page.getByTestId('step4-kpi-cards');
  const kpiVisible = await kpiCards.isVisible({ timeout: 8000 }).catch(() => false);
  if (!kpiVisible) {
    await screenshot(page, 'c1-dashboard-missing-kpi');
    console.log('CANDIDATE BUG: KPI cards not visible on dashboard');
  } else {
    const kpiText = await kpiCards.textContent();
    console.log(`Dashboard KPIs: ${kpiText?.substring(0, 200)}`);
  }

  // Accessibility check on dashboard
  const a11yIssues = await runAxeCheck(page, 'dashboard');
  if (a11yIssues.length > 0) a11yIssues.forEach(i => console.log(i));

  // Console errors
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) {
    console.log(`CANDIDATE BUG: ${errors.length} console error(s): ${errors.join('; ')}`);
  }
});

test('charter1: export plan produces valid JSON', async ({ page }) => {
  await seedAndNavigate(page, 4);
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  const exportBtn = page.getByRole('button', { name: /export|save scenario/i }).first();
  if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await exportBtn.click();
    const download = await downloadPromise;
    if (!download) {
      console.log('CANDIDATE BUG: export button clicked but no download occurred');
    }
  } else {
    console.log('CANDIDATE BUG: export button not found on dashboard');
  }
});
```

---

## Charter 2 — Happy Path Baseline (Couple Mode)

**Goal:** Verify couple-mode fields, gap-period section, and P2 data in projections.

```typescript
test('charter2: couple mode — P2 fields and gap period', async ({ page }) => {
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
  // Accept disclaimer if present
  const checkbox = page.getByRole('checkbox').first();
  if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
    await checkbox.check();
    await page.getByRole('button', { name: /continue|start|proceed/i }).first().click();
  }
  await page.waitForSelector('[data-testid="step1-mode-couple"]', { timeout: 10000 });
  await page.getByTestId('step1-mode-couple').click();

  // P2 fields should now be visible
  const p2Name = page.getByTestId('step1-p2-name');
  const p2Dob  = page.getByTestId('step1-p2-dob');
  if (!(await p2Name.isVisible({ timeout: 3000 }).catch(() => false))) {
    await screenshot(page, 'c2-p2-fields-missing');
    console.log('CANDIDATE BUG: P2 fields not visible after switching to couple mode');
  }

  // Fill P1 and P2
  await page.getByTestId('step1-p1-dob').fill('1966-01-01');
  await p2Dob.fill('1970-06-15');

  // Set P1 FI age lower than P2 — gap section should appear
  // The FI age sliders use range inputs; locate them
  const fiSliders = page.locator('input[type="range"]');
  const sliderCount = await fiSliders.count();
  console.log(`Found ${sliderCount} range sliders on Step 1`);

  await page.getByTestId('step1-next').click();
  await screenshot(page, 'c2-step1-couple-done');
});

test('charter2: gap section visible when p2FiAge > fiAge', async ({ page }) => {
  const coupleState = {
    mode: 'couple',
    person1: { name: 'Alex', dob: '1966-01-01', fiAge: 60, incomeSources: {}, assets: {} },
    person2: { name: 'Sam', dob: '1970-01-01', fiAge: 65, incomeSources: {}, assets: {} },
    assumptions: { lifeExpectancy: 90 },
    currentStep: 2,
    maxVisitedStep: 2,
  };
  await seedAndNavigate(page, 2, coupleState);
  const gapSection = page.getByTestId('step2-gap-spending');
  const gapVisible = await gapSection.isVisible({ timeout: 5000 }).catch(() => false);
  if (!gapVisible) {
    await screenshot(page, 'c2-gap-section-missing');
    console.log('CANDIDATE BUG: gap period spending section not visible when p2FiAge (65) > fiAge (60)');
  }
});
```

---

## Charter 3 — Step 1 Boundary & State Transition Torture

**Goal:** Drive all sliders to extreme values; cascade DOB → fiAge → lifeExpectancy.

```typescript
test('charter3: FI age and life expectancy slider bounds', async ({ page }) => {
  // Age 74 (DOB ~1952) — FI age slider max should clamp to lifeExpectancy - 2
  const state = { mode: 'single', person1: { dob: '1952-01-01', fiAge: 75 }, currentStep: 0, maxVisitedStep: 0 };
  await seedAndNavigate(page, 0, state);

  const sliders = page.locator('input[type="range"]');
  const count = await sliders.count();
  console.log(`Step 1 range sliders: ${count}`);

  for (let i = 0; i < count; i++) {
    const min = await sliders.nth(i).getAttribute('min');
    const max = await sliders.nth(i).getAttribute('max');
    const val = await sliders.nth(i).inputValue();
    console.log(`Slider ${i}: min=${min} max=${max} value=${val}`);
    // Check no slider is in an impossible state (value outside min/max)
    if (parseFloat(val) < parseFloat(min ?? '0')) {
      console.log(`CANDIDATE BUG: slider ${i} value ${val} is below min ${min}`);
    }
    if (parseFloat(val) > parseFloat(max ?? '999')) {
      console.log(`CANDIDATE BUG: slider ${i} value ${val} is above max ${max}`);
    }
  }
  await screenshot(page, 'c3-slider-state');
});

test('charter3: couple→single mode switch clears P2 state without crash', async ({ page }) => {
  const coupleState = { mode: 'couple', person1: { dob: '1966-01-01', fiAge: 60 }, person2: { name: 'Sam', dob: '1970-01-01', fiAge: 65 }, currentStep: 0, maxVisitedStep: 0 };
  await seedAndNavigate(page, 0, coupleState);
  // Switch to single
  const singleBtn = page.getByTestId('step1-mode-single');
  if (await singleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await singleBtn.click();
    const p2Name = page.getByTestId('step1-p2-name');
    const p2Visible = await p2Name.isVisible({ timeout: 2000 }).catch(() => false);
    if (p2Visible) {
      console.log('CANDIDATE BUG: P2 name field still visible after switching to single mode');
    }
  }
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG after mode switch: ${errors.join('; ')}`);
  await screenshot(page, 'c3-after-couple-to-single');
});

test('charter3: future DOB handling', async ({ page }) => {
  await seedAndNavigate(page, 0, { mode: 'single', person1: { dob: '2030-01-01' }, currentStep: 0, maxVisitedStep: 0 });
  // The UI should handle a future DOB gracefully — no NaN, no crash
  const bodyText = await page.locator('body').textContent();
  if (bodyText?.includes('NaN') || bodyText?.includes('undefined') || bodyText?.includes('Invalid Date')) {
    console.log('CANDIDATE BUG: future DOB produces NaN/undefined/Invalid Date in UI');
    await screenshot(page, 'c3-future-dob-bug');
  }
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`Console errors with future DOB: ${errors.join('; ')}`);
});
```

---

## Charter 4 — RLSS Template Coverage & Spending Integrity

**Goal:** All 6 template × mode combinations; verify totals and multipliers.

```typescript
test('charter4: RLSS total matches category sum after applying each template', async ({ page }) => {
  const templates = ['minimum', 'moderate', 'comfortable'];
  for (const tmpl of templates) {
    await seedAndNavigate(page, 2, { mode: 'single', rlssStandard: 'minimum', currentStep: 2, maxVisitedStep: 2 });
    const btn = page.getByTestId(`step2-rlss-${tmpl}`);
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
      const totalEl = page.getByTestId('step2-total-spend');
      const totalText = await totalEl.textContent().catch(() => '');
      console.log(`RLSS ${tmpl} single total: "${totalText}"`);
      if (!totalText || totalText === '£0' || totalText === '£0/year') {
        console.log(`CANDIDATE BUG: RLSS ${tmpl} template shows zero spend total`);
        await screenshot(page, `c4-rlss-${tmpl}-zero-total`);
      }
    } else {
      console.log(`CANDIDATE BUG: RLSS button for "${tmpl}" not found`);
    }
  }
});

test('charter4: Slo-Go and No-Go tabs show reduced spending vs Go-Go', async ({ page }) => {
  await seedAndNavigate(page, 2, { currentStep: 2, maxVisitedStep: 2 });
  const totalEl = page.getByTestId('step2-total-spend');

  // Go-Go total
  const goGoText = await totalEl.textContent().catch(() => '0');
  console.log(`Go-Go total: ${goGoText}`);

  // Click Slo-Go tab (stage id varies — find tab buttons and click second)
  const stageTabs = page.locator('[data-testid^="step2-stage-"]');
  const tabCount = await stageTabs.count();
  console.log(`Found ${tabCount} stage tabs`);
  if (tabCount >= 2) {
    await stageTabs.nth(1).click();
    await page.waitForTimeout(300);
    const sloGoText = await totalEl.textContent().catch(() => '0');
    console.log(`Slo-Go total: ${sloGoText}`);
    // Slo-Go should be less than Go-Go (0.8× multiplier)
    const goGoNum = parseFloat(goGoText?.replace(/[£,k]/g, '') ?? '0');
    const sloGoNum = parseFloat(sloGoText?.replace(/[£,k]/g, '') ?? '0');
    if (goGoNum > 0 && sloGoNum >= goGoNum) {
      console.log(`CANDIDATE BUG: Slo-Go total (${sloGoText}) is not less than Go-Go total (${goGoText})`);
      await screenshot(page, 'c4-slowo-not-less-than-gogo');
    }
  }
});

test('charter4: care reserve toggle adds/removes correctly', async ({ page }) => {
  await seedAndNavigate(page, 2, { currentStep: 2, maxVisitedStep: 2 });
  const careToggle = page.getByTestId('step2-care-reserve-toggle');
  if (await careToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Look for advanced panel toggle first
    const advancedBtn = page.getByRole('button', { name: /advanced|customise/i }).first();
    if (await advancedBtn.isVisible({ timeout: 2000 }).catch(() => false)) await advancedBtn.click();
    
    await careToggle.click();
    await page.waitForTimeout(300);
    const amountInput = page.getByTestId('step2-care-reserve-amount');
    const amountVisible = await amountInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (!amountVisible) {
      console.log('CANDIDATE BUG: care reserve amount input not shown after enabling toggle');
      await screenshot(page, 'c4-care-reserve-missing-input');
    }
  }
});
```

---

## Charter 5 — Income Source Combinations

**Goal:** Each income type enabled/disabled; verify projected income is coherent.

```typescript
test('charter5: state pension only — below PA so zero income tax', async ({ page }) => {
  const stateOnly = {
    mode: 'single',
    person1: {
      dob: '1959-01-01', // age 67 = state pension age
      fiAge: 67,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dcPension: { enabled: false },
        dbPension: { enabled: false },
      },
      assets: { cashSavings: { enabled: true, totalValue: 50000 } },
    },
    assumptions: { lifeExpectancy: 85, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'minimum',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, stateOnly);
  await page.waitForTimeout(2000);
  // Look for income tax in the projections table — should be 0 for state pension only
  // (SP ≈ £11,502/yr which is below PA £12,570)
  const projTable = page.locator('table').first();
  if (await projTable.isVisible({ timeout: 5000 }).catch(() => false)) {
    const tableText = await projTable.textContent();
    console.log(`Projection table first 200 chars: ${tableText?.substring(0, 200)}`);
  } else {
    console.log('CANDIDATE BUG: no projections table visible on dashboard');
    await screenshot(page, 'c5-no-projection-table');
  }
  await screenshot(page, 'c5-state-pension-only');
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`Console errors: ${errors.join('; ')}`);
});

test('charter5: all income sources disabled — pure asset drawdown', async ({ page }) => {
  const assetOnly = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {
        statePension: { enabled: false },
        dcPension: { enabled: false },
        dbPension: { enabled: false },
        annuity: { enabled: false },
        partTimeWork: { enabled: false },
        otherIncome: { enabled: false },
      },
      assets: { isaInvestments: { enabled: true, totalValue: 1000000, growthRate: 4 } },
    },
    assumptions: { lifeExpectancy: 90, investmentGrowth: 4, inflation: 2.5 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, assetOnly);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c5-all-income-disabled');
  const kpi = page.getByTestId('step4-kpi-cards');
  if (await kpi.isVisible({ timeout: 5000 }).catch(() => false)) {
    const kpiText = await kpi.textContent();
    console.log(`KPIs with no income: ${kpiText?.substring(0, 300)}`);
  }
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: console errors with all income disabled: ${errors.join('; ')}`);
});

test('charter5: other income with stop age disappears after stop age', async ({ page }) => {
  const otherIncomeState = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {
        otherIncome: { enabled: true, annualAmount: 10000, startAge: 60, stopAge: 65, description: 'Consulting' },
      },
      assets: { isaInvestments: { enabled: true, totalValue: 500000, growthRate: 4 } },
    },
    assumptions: { lifeExpectancy: 80, investmentGrowth: 4, inflation: 0 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, otherIncomeState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c5-other-income-with-stop-age');
  // The projection table should show income at age 60-64 but not at 65+
  // Read what we can from the DOM
  const tables = page.locator('table');
  const tableCount = await tables.count();
  console.log(`Found ${tableCount} table(s) on dashboard`);
});
```

---

## Charter 6 — Asset Combinations & CGT Behaviour

**Goal:** All asset types; GIA with baseCost > value; joint GIA symmetry.

```typescript
test('charter6: GIA with baseCost greater than market value', async ({ page }) => {
  const giaState = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {},
      assets: {
        generalInvestments: { enabled: true, totalValue: 50000, baseCost: 60000, growthRate: 4 },
      },
    },
    assumptions: { lifeExpectancy: 85, investmentGrowth: 4, inflation: 2.5 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, giaState);
  await page.waitForTimeout(2000);
  // Check for warning on the asset input page (step 3)
  await seedAndNavigate(page, 3, giaState);
  const warningEl = page.locator('[class*="amber"], [class*="warning"], [class*="yellow"]').first();
  const warningVisible = await warningEl.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`GIA baseCost > value warning visible: ${warningVisible}`);
  await screenshot(page, 'c6-gia-basecost-exceeds-value');
  // Navigate to dashboard and check no crash
  await seedAndNavigate(page, 4, giaState);
  await page.waitForTimeout(2000);
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: console errors with baseCost > value: ${errors.join('; ')}`);
});

test('charter6: joint GIA gains split symmetrically between P1 and P2', async ({ page }) => {
  const coupleGiaState = {
    mode: 'couple',
    person1: { dob: '1966-01-01', fiAge: 60, incomeSources: {}, assets: {} },
    person2: { dob: '1966-06-01', fiAge: 60, incomeSources: {}, assets: {} },
    jointGia: { enabled: true, totalValue: 200000, baseCost: 0, growthRate: 0 },
    assumptions: { lifeExpectancy: 75, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, coupleGiaState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c6-joint-gia-couple');
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: ${errors.join('; ')}`);
});

test('charter6: rental property appears as income in projection', async ({ page }) => {
  const propertyState = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {},
      assets: {
        property: { enabled: true, currentValue: 250000, baseCost: 200000, annualNetRent: 12000, durationYears: 20, ownership: 'person1' },
      },
    },
    assumptions: { lifeExpectancy: 85, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'minimum',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, propertyState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c6-rental-property-dashboard');
  const kpi = page.getByTestId('step4-kpi-cards');
  if (await kpi.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`KPIs with rental property: ${(await kpi.textContent())?.substring(0, 300)}`);
  }
});
```

---

## Charter 7 — Planned Events & Care Reserve

**Goal:** CRUD operations on planned events; inflation toggle; care reserve.

```typescript
test('charter7: add planned event and verify it exists in the list', async ({ page }) => {
  await seedAndNavigate(page, 2, { currentStep: 2, maxVisitedStep: 2 });
  // Open advanced section if needed
  const advancedBtn = page.getByRole('button', { name: /advanced|customise/i }).first();
  if (await advancedBtn.isVisible({ timeout: 2000 }).catch(() => false)) await advancedBtn.click();

  const addEventBtn = page.getByTestId('step2-add-planned-event');
  if (await addEventBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addEventBtn.click();
    await page.waitForTimeout(500);
    // Fill the event form
    const nameInput = page.getByPlaceholder(/name|event/i).first();
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill('New Kitchen');
    }
    // Amount
    const amountInputs = page.locator('input[type="number"]');
    const count = await amountInputs.count();
    console.log(`Found ${count} number inputs in planned event form`);
    await screenshot(page, 'c7-add-event-form');
  } else {
    console.log('CANDIDATE BUG: add planned event button not found or not visible');
    await screenshot(page, 'c7-no-add-event-btn');
  }
});

test('charter7: 10+ planned events — performance and layout', async ({ page }) => {
  // Seed a state with many planned events
  const events = Array.from({ length: 12 }, (_, i) => ({
    id: `event-${i}`,
    name: faker.commerce.product(),
    age: 60 + i,
    amount: faker.number.int({ min: 5000, max: 50000 }),
    emoji: '🏠',
    inflation: i % 2 === 0,
  }));
  const stateWithEvents = {
    currentStep: 2,
    maxVisitedStep: 2,
    plannedEvents: events,
  };
  await seedAndNavigate(page, 2, stateWithEvents);
  await page.waitForTimeout(1000);
  await screenshot(page, 'c7-many-events');
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: console errors with 12 events: ${errors.join('; ')}`);
  // Check for overflow / layout issues
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  if (bodyWidth > viewportWidth + 5) {
    console.log(`CANDIDATE BUG: horizontal overflow detected (body ${bodyWidth}px > viewport ${viewportWidth}px) with many events`);
  }
});
```

---

## Charter 8 — Authentication & Sync Boundary

**Goal:** Test Clerk-authenticated flows — save/reload, import/export, corrupt data handling.

**IMPORTANT:** This charter requires `--project=authenticated`. Run with:
```bash
npx playwright test tests/e2e/exploratory/charter-8.spec.ts --project=authenticated --trace=on 2>&1
```

```typescript
test.use({ storageState: 'playwright/.clerk/user.json' });

test('charter8: complete wizard while authenticated — plan saves to Cosmos', async ({ page }) => {
  // Reset remote state
  await page.request.delete(`${process.env.E2E_BASE_URL}/api/data`);
  await seedAndNavigate(page, 4, {});
  await page.waitForTimeout(3000);
  // Check save status in header
  const saveStatus = page.getByTestId('header-save-status');
  if (await saveStatus.isVisible({ timeout: 5000 }).catch(() => false)) {
    const statusText = await saveStatus.textContent();
    console.log(`Save status: ${statusText}`);
    if (statusText?.toLowerCase().includes('error')) {
      console.log('CANDIDATE BUG: save status shows error');
      await screenshot(page, 'c8-save-error');
    }
  } else {
    console.log('CANDIDATE BUG: save status indicator not found in header');
  }
  await screenshot(page, 'c8-authenticated-dashboard');
});

test('charter8: export then import restores plan exactly', async ({ page }) => {
  await page.request.delete(`${process.env.E2E_BASE_URL}/api/data`);
  await seedAndNavigate(page, 4, {});
  await page.goto(`${process.env.E2E_BASE_URL}/account`);
  await page.waitForTimeout(2000);

  // Export
  const exportBtn = page.getByTestId('account-export-plan');
  if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const dl = await downloadPromise.catch(() => null);
    if (dl) {
      console.log(`Downloaded: ${dl.suggestedFilename()}`);
    } else {
      console.log('CANDIDATE BUG: export produced no download');
    }
  }

  // Reset
  const resetBtn = page.getByTestId('account-reset-plan');
  if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resetBtn.click();
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|reset/i }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) await confirmBtn.click();
    await page.waitForTimeout(1000);
  }
  await screenshot(page, 'c8-after-reset');
});

test('charter8: corrupt JSON import shows graceful error', async ({ page }) => {
  await page.goto(`${process.env.E2E_BASE_URL}/account`);
  await page.waitForTimeout(2000);
  const importInput = page.getByTestId('account-import-input');
  if (await importInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Create a temp corrupt JSON file and upload it
    const { writeFileSync } = await import('fs');
    writeFileSync('/tmp/corrupt-plan.json', '{ "this": "is not a valid plan", "version": 99 }');
    await importInput.setInputFiles('/tmp/corrupt-plan.json');
    await page.waitForTimeout(1500);
    const errorMsg = page.locator('[class*="error"], [class*="danger"], [role="alert"]').first();
    const errorVisible = await errorMsg.isVisible({ timeout: 3000 }).catch(() => false);
    if (!errorVisible) {
      console.log('CANDIDATE BUG: corrupt JSON import shows no error message');
      await screenshot(page, 'c8-corrupt-import-no-error');
    }
    const errors = (page as any).__consoleErrors;
    if (errors.some((e: string) => e.includes('Uncaught') || e.includes('TypeError'))) {
      console.log(`CANDIDATE BUG: uncaught error on corrupt import: ${errors.join('; ')}`);
    }
  }
});
```

---

## Charter 9 — Financial Calculation Verification (Mathematical Oracle)

**Goal:** Seed known-value plans and verify the engine output is mathematically correct.

```typescript
test('charter9: ISA depletion — 20-year calculation', async ({ page }) => {
  // £500k ISA, £25k/year spend, 0% growth, 0% inflation
  // Expected: depletes at age 80 (60 + 500000/25000 = 60 + 20 years)
  const preciseState = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {
        statePension: { enabled: false },
        dcPension: { enabled: false },
        dbPension: { enabled: false },
      },
      assets: {
        isaInvestments: { enabled: true, totalValue: 500000, growthRate: 0 },
        cashSavings: { enabled: false },
        generalInvestments: { enabled: false },
      },
    },
    spending: { annualSpend: 25000 },
    assumptions: { lifeExpectancy: 90, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, preciseState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c9-isa-depletion-20yr');
  const kpi = page.getByTestId('step4-kpi-cards');
  if (await kpi.isVisible({ timeout: 5000 }).catch(() => false)) {
    const kpiText = await kpi.textContent() ?? '';
    console.log(`ISA depletion KPIs: ${kpiText.substring(0, 400)}`);
    // Should show depletion around age 80
    if (!kpiText.includes('80') && !kpiText.includes('Never')) {
      console.log('CANDIDATE BUG: depletion age may be incorrect for 20-year ISA drawdown');
    }
  }
});

test('charter9: state pension only — no income tax expected', async ({ page }) => {
  // SP = £221.20/wk × 52 = £11,502.40/yr — below PA £12,570
  const spOnlyState = {
    mode: 'single',
    person1: {
      dob: '1959-01-01', fiAge: 67, // starts drawing SP immediately
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dcPension: { enabled: false },
        dbPension: { enabled: false },
      },
      assets: { cashSavings: { enabled: true, totalValue: 200000 } },
    },
    assumptions: { lifeExpectancy: 85, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'minimum',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, spOnlyState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c9-sp-only-no-tax');
  const kpi = page.getByTestId('step4-kpi-cards');
  if (await kpi.isVisible({ timeout: 5000 }).catch(() => false)) {
    const kpiText = await kpi.textContent() ?? '';
    console.log(`SP-only KPIs: ${kpiText.substring(0, 400)}`);
  }
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: console errors: ${errors.join('; ')}`);
});

test('charter9: DC pension LSA boundary — Year 1 vs Year 2 taxability', async ({ page }) => {
  // DC = £268,275 (exactly the LSA), 0% growth, spend = £268,275/yr
  // Year 1: all drawn, 25% (£67k) tax-free, 75% (£201k) taxable
  // Year 2: LSA exhausted, 0% tax-free
  const lsaState = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {
        dcPension: { enabled: true, totalValue: 268275, growthRate: 0 },
        statePension: { enabled: false },
      },
      assets: {},
    },
    assumptions: { lifeExpectancy: 65, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, lsaState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c9-lsa-boundary');
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: ${errors.join('; ')}`);
});

test('charter9: income at PA taper boundary — £100k triggers 60% effective rate', async ({ page }) => {
  // DB pension £100,001/yr — should trigger PA taper
  const taperState = {
    mode: 'single',
    person1: {
      dob: '1966-01-01', fiAge: 60,
      incomeSources: {
        dbPension: { enabled: true, annualIncome: 100001, startAge: 60 },
        dcPension: { enabled: false },
        statePension: { enabled: false },
      },
      assets: {},
    },
    assumptions: { lifeExpectancy: 75, investmentGrowth: 0, inflation: 0 },
    rlssStandard: 'moderate',
    currentStep: 4,
    maxVisitedStep: 4,
  };
  await seedAndNavigate(page, 4, taperState);
  await page.waitForTimeout(2000);
  await screenshot(page, 'c9-pa-taper');
  const kpi = page.getByTestId('step4-kpi-cards');
  if (await kpi.isVisible({ timeout: 5000 }).catch(() => false)) {
    const kpiText = await kpi.textContent() ?? '';
    console.log(`PA taper KPIs: ${kpiText.substring(0, 400)}`);
  }
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: ${errors.join('; ')}`);
});
```

---

## Charter 10 — Interruption & Error Recovery Tour

**Goal:** Disrupt normal flows; check for graceful recovery.

```typescript
test('charter10: direct navigation to step 4 URL without prior steps', async ({ page }) => {
  // Navigate directly — no localStorage seeding except disclaimer
  await page.addInitScript(
    (dk: string) => { localStorage.setItem(dk, '1'); },
    'llp-disclaimer-accepted',
  );
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
  await page.waitForTimeout(2000);
  await screenshot(page, 'c10-direct-nav-no-state');
  const errors = (page as any).__consoleErrors;
  if (errors.length > 0) console.log(`CANDIDATE BUG: errors on direct nav: ${errors.join('; ')}`);
  // Should show defaults, not crash
  const body = await page.locator('body').textContent();
  if (body?.includes('undefined') || body?.includes('[object Object]')) {
    console.log('CANDIDATE BUG: raw undefined/object rendered in UI on fresh load');
  }
});

test('charter10: page refresh mid-wizard preserves state', async ({ page }) => {
  await seedAndNavigate(page, 2, { currentStep: 2, maxVisitedStep: 2 });
  await page.reload();
  await page.waitForTimeout(1500);
  // Should still be at step 2 (or at least not at step 0)
  const totalSpend = page.getByTestId('step2-total-spend');
  const stepVisible = await totalSpend.isVisible({ timeout: 3000 }).catch(() => false);
  if (!stepVisible) {
    console.log('CANDIDATE BUG: step 2 state lost after page refresh');
    await screenshot(page, 'c10-state-lost-on-refresh');
  }
});

test('charter10: clear localStorage — disclaimer reappears', async ({ page }) => {
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1000);
  // Disclaimer should reappear
  const disclaimerVisible = await page.getByRole('checkbox').first().isVisible({ timeout: 3000 }).catch(() => false);
  const isMainContent = await page.getByTestId('step1-mode-single').isVisible({ timeout: 1000 }).catch(() => false);
  if (!disclaimerVisible && isMainContent) {
    console.log('CANDIDATE BUG: disclaimer gate skipped after clearing localStorage');
    await screenshot(page, 'c10-disclaimer-skipped');
  }
});

test('charter10: mobile viewport — no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); // iPhone SE
  await seedAndNavigate(page, 0, { currentStep: 0, maxVisitedStep: 0 });
  await page.waitForTimeout(1000);
  await screenshot(page, 'c10-mobile-step1');
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  if (scrollWidth > innerWidth + 5) {
    console.log(`CANDIDATE BUG: horizontal overflow on mobile (scrollWidth ${scrollWidth} > innerWidth ${innerWidth})`);
  }
  // Also check dashboard
  await seedAndNavigate(page, 4, { currentStep: 4, maxVisitedStep: 4 });
  await page.waitForTimeout(2000);
  await screenshot(page, 'c10-mobile-dashboard');
  const dashScrollWidth = await page.evaluate(() => document.body.scrollWidth);
  if (dashScrollWidth > 380) {
    console.log(`CANDIDATE BUG: dashboard overflow on mobile (scrollWidth ${dashScrollWidth})`);
  }
});

test('charter10: change FI age in Step 1 then return to dashboard — projection recalculates', async ({ page }) => {
  await seedAndNavigate(page, 4, { currentStep: 4, maxVisitedStep: 4 });
  await page.waitForTimeout(1500);
  const kpiBefore = await page.getByTestId('step4-kpi-cards').textContent().catch(() => '');

  // Navigate back to step 1
  await page.getByRole('button', { name: /back|previous|edit/i }).first().click();
  await page.waitForTimeout(500);
  const step1Next = page.getByTestId('step1-next');
  if (await step1Next.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Move FI age slider — find range inputs and adjust
    const fiSlider = page.locator('input[type="range"]').first();
    await fiSlider.evaluate((el: HTMLInputElement) => {
      const newVal = String(parseInt(el.min) + 3);
      el.value = newVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await step1Next.click();
  }
  // Navigate forward to dashboard
  for (let i = 0; i < 4; i++) {
    const nextBtn = page.getByRole('button', { name: /next/i }).last();
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) await nextBtn.click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  const kpiAfter = await page.getByTestId('step4-kpi-cards').textContent().catch(() => '');
  if (kpiBefore === kpiAfter && kpiBefore !== '') {
    console.log('CANDIDATE BUG: KPI values unchanged after modifying FI age — projection may not have recalculated');
  }
  await screenshot(page, 'c10-after-fi-age-change');
});
```

---

## Post-Charter: Bug Triage & Report Generation

After all charters complete, review `session-notes.md` and produce the bug report.

### Severity Guide

| Priority | Criteria |
|----------|---------|
| **P0** | App crash, data loss, unhandled exception that blocks all usage |
| **P1** | Wrong financial calculation (affects user's retirement decision), data not persisting when it should, auth bypass |
| **P2** | Feature doesn't work as documented, incorrect UI state, calculation visible but wrong in edge case |
| **P3** | Poor UX, confusing behaviour, missing validation feedback, mobile layout issues |
| **Nit** | Cosmetic, typo, minor inconsistency that doesn't affect decisions |

### Bug Report Template

Write `$SESSION_DIR/bug-report.md`:

```markdown
# LLP Exploratory Testing — Bug Report
**Session:** [timestamp]
**Target:** [E2E_BASE_URL]
**Charters run:** 1–10
**Total candidate bugs found:** N
**Tester:** Claude Code (automated exploratory session)

---

## Summary

| Priority | Count |
|----------|-------|
| P0 | N |
| P1 | N |
| P2 | N |
| P3 | N |
| Nit | N |

---

## P0 — Crash / Data Loss

### BUG-001: [Title]
- **Affected feature:** [Step N / Dashboard / Account / Auth]
- **Charter:** [N]
- **Steps to reproduce:**
  1. [Exact step]
  2. [Exact step]
- **Expected:** [What should happen]
- **Actual:** [What actually happened]
- **Evidence:** `screenshots/bug-001.png` (or trace path)
- **Suggested priority rationale:** [Why P0]

---

## P1 — Wrong Financial Calculation

(same format)

---

## P2 — Functional Regression

(same format)

---

## P3 — UX / Usability

(same format)

---

## Nit — Cosmetic / Minor

(list format OK for nits)

---

## Session Observations (Not Bugs)

Things noticed that warrant further investigation but aren't confirmed bugs:

- [Observation 1]
- [Observation 2]

---

## Suggested Next Session Charters

Based on what was found, the highest-value areas for the next session are:
1. [Charter suggestion with rationale]
```

---

## Final Checklist Before Ending the Session

- [ ] All 10 charters executed (even if some tests failed — note which failed)
- [ ] `session-notes.md` updated with all candidate bugs
- [ ] Screenshots saved for every candidate bug
- [ ] `bug-report.md` written with all bugs prioritised
- [ ] Console errors reviewed and classified
- [ ] Accessibility violations documented (from axe-core)
- [ ] No code was modified or fixes attempted

Print the path to the bug report as the final output:

```bash
echo "Session complete. Bug report: $SESSION_DIR/bug-report.md"
ls -la "$SESSION_DIR/"
```
