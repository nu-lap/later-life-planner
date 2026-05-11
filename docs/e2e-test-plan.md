# E2E Test Plan: Playwright (Wizard + Sync/Encryption + Account)

## Context

The project has unit tests (Vitest/Node) and RTL component tests (jsdom) but no end-to-end coverage of the running application. This plan adds a **single unified Playwright suite** covering:

- Wizard UI flow (Steps 1–4)
- Full encryption/sync round-trip (DEK generation → encrypt → save to Cosmos → reload → decrypt)
- Account features: export JSON, import JSON backup, reset plan

### Why two test profiles?

The app behaves differently depending on Clerk auth:

- **No Clerk:** full plan state written to localStorage (`'life-planner-v6'`), sync disabled — fast tests with JSON-injected state, no external dependencies
- **With Clerk:** plan lives server-side (encrypted in Cosmos), DEK in IndexedDB — real Clerk session required to exercise the save/load/decrypt path

Both profiles live in the same `tests/e2e/` directory under one `playwright.config.ts`.

---

## File Structure

```
playwright.config.ts
tests/e2e/
  fixtures/
    localTest.ts         ← unauthed: localStorage JSON injection + page objects
    syncTest.ts          ← authed: @clerk/testing session + page objects
    apiMocks.ts          ← route() helpers for AI/device endpoints
    planFixtures.ts      ← typed plan state factories (wraps createMockDemoState)
  pages/
    step1.page.ts
    step2.page.ts
    step3.page.ts
    step4.page.ts
    account.page.ts      ← export, import, reset selectors
  specs/
    wizard.spec.ts       ← wizard UI flow + JSON-seeded state tests
    sync.spec.ts         ← real Clerk auth, full save/load/encrypt round-trip
    account.spec.ts      ← export download, JSON import, reset
    smoke.spec.ts        ← health + navigation checks (deployed URL)
```

---

## New Feature Required: Plan Import

**Export** exists in `AccountOverviewPanel.tsx` and `AccountDataPanel.tsx`. **Import does not** — it must be built before the `account.spec.ts` test can pass.

### Code changes

**1. `src/lib/testIds.ts` — add `ACCOUNT_IDS`:**

```typescript
export const ACCOUNT_IDS = {
  EXPORT_PLAN:  'account-export-plan',
  IMPORT_PLAN:  'account-import-plan',    // new
  IMPORT_INPUT: 'account-import-input',   // new hidden <input type="file">
  RESET_PLAN:   'account-reset-plan',
} as const;
```

**2. `src/hooks/usePlanSync.ts` — add `importPlanFromJson` alongside `exportCanonicalPlan`:**

```typescript
const importPlanFromJson = useCallback((file: File) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      const normalized = normalizePlannerState(parsed);
      usePlannerStore.setState(normalized);
    } catch {
      // surface error to UI — invalid JSON or schema mismatch
    }
  };
  reader.readAsText(file);
}, []);
```

**3. `src/components/account/AccountOverviewPanel.tsx` and `src/components/AccountDataPanel.tsx`:**

- Add hidden `<input type="file" accept=".json" data-testid={ACCOUNT_IDS.IMPORT_INPUT}>` wired to `importPlanFromJson`
- Add visible "Import JSON" button (`data-testid={ACCOUNT_IDS.IMPORT_PLAN}`) that triggers the input click
- Add `data-testid={ACCOUNT_IDS.EXPORT_PLAN}` to the existing export button

**4. `src/components/Header.tsx`:** add `data-testid={ACCOUNT_IDS.RESET_PLAN}` to the reset button.

**5. `src/components/DashboardMain.tsx`:** add `data-testid={STEP4_IDS.KPI_CARDS}` to the KPI grid `<div>` (currently missing).

> **Reset button:** currently dev-only (`NODE_ENV === 'development'`). Tests run against `npm run dev` so this is visible. Do not remove the dev-only gate without sign-off.

---

## JSON State Injection

When Clerk is absent, Zustand persists the full plan to `localStorage['life-planner-v6']`. Injecting a pre-built fixture via `page.addInitScript()` lets tests skip wizard UI input entirely and start from any desired state:

```typescript
// planFixtures.ts — evaluated at Node build time, not in browser
export const SINGLE_PLAN = createDefaultState(57);    // src/lib/mockData.ts
export const COUPLE_PLAN = createMockDemoState();
```

```typescript
// localTest.ts
await page.addInitScript(({ key, state }) => {
  localStorage.setItem('llp-disclaimer-accepted', 'true');
  localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
}, { key: 'life-planner-v6', state: COUPLE_PLAN });
```

Zustand's `mergePersistedPlannerState` hydration fills missing fields from defaults — partial fixtures are safe.

---

## Clerk Testing (`syncTest` fixture)

`@clerk/testing` provides `setupClerkTestingToken({ page })` — injects a real Clerk session token before page navigation without going through the sign-in UI.

**Required CI secrets:**

| Secret | Purpose |
|--------|---------|
| `CLERK_PUBLISHABLE_KEY_TEST` | Clerk test environment publishable key |
| `CLERK_SECRET_KEY_TEST` | Clerk test environment secret key |
| `E2E_CLERK_USER_ID` | Dedicated test user created in Clerk dashboard |
| `AZURE_COSMOSDB_ENDPOINT` | Already exists for deploy; reused here |

```typescript
// syncTest.ts
import { setupClerkTestingToken } from '@clerk/testing/playwright';
export const test = base.extend({
  page: async ({ page }, use) => {
    await setupClerkTestingToken({ page });
    await use(page);
  },
});
```

---

## Page Objects

### `account.page.ts`

```typescript
export class AccountPage {
  readonly exportButton = this.page.getByTestId('account-export-plan');
  readonly importButton = this.page.getByTestId('account-import-plan');
  readonly importInput  = this.page.getByTestId('account-import-input');
  readonly resetButton  = this.page.getByTestId('account-reset-plan');

  constructor(private page: Page) {}

  async importFromFile(jsonPath: string) {
    await this.importInput.setInputFiles(jsonPath);  // Playwright native file upload
  }
}
```

### `step1.page.ts`

```typescript
export class Step1Page {
  readonly modeSingle = this.page.getByTestId('step1-mode-single');
  readonly modeCouple = this.page.getByTestId('step1-mode-couple');
  readonly p1Name     = this.page.getByTestId('step1-p1-name');
  readonly p1Dob      = this.page.getByTestId('step1-p1-dob');
  readonly p2Name     = this.page.getByTestId('step1-p2-name');
  readonly p2Dob      = this.page.getByTestId('step1-p2-dob');
  readonly nextButton = this.page.getByTestId('step1-next');

  constructor(private page: Page) {}

  async goto() { await this.page.goto('/'); }

  // Range sliders reject .fill() — must dispatch events via evaluate
  async setSlider(testId: string, value: number) {
    await this.page.getByTestId(testId).evaluate((el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
}
```

### `step2.page.ts`

```typescript
export class Step2Page {
  readonly careReserveToggle = this.page.getByTestId('step2-care-reserve-toggle');
  readonly addPlannedEvent   = this.page.getByTestId('step2-add-planned-event');
  // No testid on next button — fall back to role
  get nextButton() { return this.page.getByRole('button', { name: /next/i }).last(); }

  constructor(private page: Page) {}

  rlssButton(standard: string) { return this.page.getByTestId(`step2-rlss-${standard}`); }
  stageTab(stageId: string)    { return this.page.getByTestId(`step2-stage-${stageId}`); }
}
```

### `step4.page.ts`

```typescript
export class Step4Page {
  get kpiCards()             { return this.page.getByTestId('step4-kpi-cards'); }
  tabButton(id: string)      { return this.page.getByTestId(`step4-tab-${id}`); }
  strategyButton(id: string) { return this.page.getByTestId(`step4-strategy-${id}`); }

  constructor(private page: Page) {}
}
```

---

## Spec Highlights

### `wizard.spec.ts` (no Clerk)

```typescript
test('single user — JSON-injected plan loads dashboard', async ({ page, step4 }) => {
  // COUPLE_PLAN injected via addInitScript in localTest fixture
  await page.goto('/');
  await expect(step4.kpiCards).toBeVisible();
});

test('wizard navigation — single user completes all steps via UI', async ({ step1, step2, step4 }) => {
  await step1.goto();
  await step1.fillSingleMode('Alex', '1965-04-15');
  await step1.nextButton.click();
  await step2.rlssButton('moderate').click();
  await step2.nextButton.click();
  await page.getByRole('button', { name: /next/i }).last().click();  // step3 next
  await expect(step4.kpiCards).toBeVisible();
});
```

### `account.spec.ts` (no Clerk)

```typescript
test('export downloads a JSON file with correct filename', async ({ page, account }) => {
  await page.goto('/account');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    account.exportButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/later-life-plan-\d{4}-\d{2}-\d{2}\.json/);
});

test('import restores plan from JSON backup', async ({ page, account }) => {
  await page.goto('/account');
  await account.importFromFile('tests/e2e/fixtures/sample-plan.json');
  await page.goto('/');
  await expect(page.getByText('Alex')).toBeVisible();
});

test('reset returns plan to defaults', async ({ page, account }) => {
  await page.goto('/');
  await account.resetButton.click();
  await page.getByRole('button', { name: /confirm/i }).click();
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('');
});
```

### `sync.spec.ts` (Clerk authed via `syncTest`)

```typescript
test('plan survives full encrypt → save → reload → decrypt cycle', async ({ page, step4 }) => {
  await page.goto('/');
  // Complete wizard via UI as authenticated user
  // ...
  await expect(step4.kpiCards).toBeVisible();
  await expect(page.getByTestId('header-save-status')).toHaveText(/saved/i);

  await page.reload();
  await expect(step4.kpiCards).toBeVisible();
  await expect(page.getByText('Alex')).toBeVisible();
});
```

### `smoke.spec.ts`

```typescript
test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Later Life Planner/i);
});

test('/api/data returns 4xx without auth, not 5xx', async ({ page }) => {
  const res = await page.request.get('/api/data');
  expect(res.status()).toBeLessThan(500);
});
```

---

## `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    bypassCSP: true,     // required for addInitScript localStorage seeding
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

Uses `npm run dev` so `NODE_ENV === 'development'` and the reset button is visible.

---

## `package.json` Scripts

```json
"test:e2e":        "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:smoke":  "E2E_BASE_URL=$DEPLOYED_URL playwright test tests/e2e/specs/smoke.spec.ts"
```

---

## CI Job (`.github/workflows/ci-cd.yml`)

Add after the existing `test` job:

```yaml
e2e:
  needs: [test]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm' }
    - run: npm ci
    - run: npx playwright install --with-deps chromium

    # wizard + account: dev server, no Clerk needed
    - name: Start dev server
      run: npm run dev &
      env:
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA'
    - name: Wait for dev server
      run: npx wait-on http://localhost:3000
    - run: npx playwright test tests/e2e/specs/wizard.spec.ts tests/e2e/specs/account.spec.ts
      env: { CI: true }

    # sync/encryption: Clerk + Cosmos (skipped if secrets absent)
    - run: npx playwright test tests/e2e/specs/sync.spec.ts
      if: ${{ secrets.CLERK_SECRET_KEY_TEST != '' }}
      env:
        CI: true
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY_TEST }}
        CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_TEST }}
        AZURE_COSMOSDB_ENDPOINT: ${{ secrets.AZURE_COSMOSDB_ENDPOINT }}
        E2E_CLERK_USER_ID: ${{ secrets.E2E_CLERK_USER_ID }}
```

Add `e2e` to the `merge-gate` required status checks.

---

## Installation

```bash
npm install --save-dev @playwright/test @clerk/testing
npx playwright install chromium
```

---

## Verification Steps

```bash
# 1. Install
npm install --save-dev @playwright/test @clerk/testing
npx playwright install chromium

# 2. Wizard + account tests (no Clerk)
npm run dev &
npx playwright test tests/e2e/specs/wizard.spec.ts tests/e2e/specs/account.spec.ts

# 3. Sync test (needs Clerk test environment keys + Cosmos access)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... CLERK_SECRET_KEY=sk_test_... \
  npx playwright test tests/e2e/specs/sync.spec.ts

# 4. Smoke against deployed URL
DEPLOYED_URL=https://your-app.azurecontainerapps.io npm run test:e2e:smoke

# 5. TypeScript check
npx tsc --noEmit
```
