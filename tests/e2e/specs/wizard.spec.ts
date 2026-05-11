import { test, expect } from '../fixtures/localTest';
import { mockApiRoutes } from '../fixtures/apiMocks';
import { COUPLE_PLAN, DISCLAIMER_KEY, STORAGE_KEY } from '../fixtures/planFixtures';

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test('JSON-injected couple plan loads dashboard directly', async ({ page, step4 }) => {
  await page.goto('/');
  await expect(step4.kpiCards).toBeVisible();
});

// Step 1 interaction test — does not navigate beyond Household (Life Vision has a
// Turnstile captcha that makes multi-step UI navigation fragile in CI).
test('step 1 — single mode hides P2 fields and accepts name input', async ({ page, step1 }) => {
  await page.addInitScript(
    ({ disclaimerKey }) => { localStorage.clear(); localStorage.setItem(disclaimerKey, '1'); },
    { disclaimerKey: DISCLAIMER_KEY },
  );

  await step1.goto();
  await step1.modeSingle.click();
  await step1.p1Name.fill('Jordan');
  await expect(step1.p1Name).toHaveValue('Jordan');
  await expect(step1.p2Name).not.toBeVisible();
});

test('couple mode — P2 fields are visible after switching mode', async ({ page, step1 }) => {
  await page.addInitScript(
    ({ disclaimerKey }) => { localStorage.clear(); localStorage.setItem(disclaimerKey, '1'); },
    { disclaimerKey: DISCLAIMER_KEY },
  );

  await step1.goto();
  await step1.modeCouple.click();
  await expect(step1.p2Name).toBeVisible();
  await expect(step1.p2Dob).toBeVisible();
});

// Inject directly at step 3 (Income & Assets) to avoid Turnstile on Life Vision.
test('step 3 assets tab toggle works', async ({ page, step3 }) => {
  await page.addInitScript(
    ({ disclaimerKey, storageKey, state }) => {
      localStorage.setItem(disclaimerKey, '1');
      localStorage.setItem(storageKey, JSON.stringify({ state, version: 0 }));
    },
    { disclaimerKey: DISCLAIMER_KEY, storageKey: STORAGE_KEY, state: { ...COUPLE_PLAN, currentStep: 3 } },
  );

  await page.goto('/');
  await step3.tabAssets.click();
  await expect(page.getByText('ISA')).toBeVisible();

  await step3.tabIncome.click();
  await expect(page.getByText('DC / Personal Pension')).toBeVisible();
});

// Inject directly at step 2 (Spending Goals) to avoid Turnstile on Life Vision.
test('RLSS moderate template updates spend display', async ({ page, step2 }) => {
  await page.addInitScript(
    ({ disclaimerKey, storageKey, state }) => {
      localStorage.setItem(disclaimerKey, '1');
      localStorage.setItem(storageKey, JSON.stringify({ state, version: 0 }));
    },
    { disclaimerKey: DISCLAIMER_KEY, storageKey: STORAGE_KEY, state: { ...COUPLE_PLAN, currentStep: 2 } },
  );

  await page.goto('/');
  await step2.rlssButton('moderate').click();
  const totalSpend = page.getByTestId('step2-total-spend');
  await expect(totalSpend).not.toHaveText('£0');
});
