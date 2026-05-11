import { test, expect } from '../fixtures/localTest';
import { mockApiRoutes } from '../fixtures/apiMocks';
import { DISCLAIMER_KEY } from '../fixtures/planFixtures';

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test('JSON-injected couple plan loads dashboard directly', async ({ page, step4 }) => {
  await page.goto('/');
  await expect(step4.kpiCards).toBeVisible();
});

test('single user — completes all four steps via UI', async ({ page, step1, step2, step3, step4 }) => {
  // Override the injected couple plan with a fresh navigation (no local state)
  await page.addInitScript(({ disclaimerKey }) => {
    localStorage.clear();
    localStorage.setItem(disclaimerKey, '1');
  }, { disclaimerKey: DISCLAIMER_KEY });

  await step1.goto();
  await step1.fillSingleMode('Alex', '1970-06-15');
  await step1.nextButton.click();

  await step2.rlssButton('moderate').click();
  await step2.nextButton.click();

  await step3.nextButton.click();

  await expect(step4.kpiCards).toBeVisible();
});

test('couple mode — P2 fields are visible after switching mode', async ({ page, step1 }) => {
  await page.addInitScript(({ disclaimerKey }) => {
    localStorage.clear();
    localStorage.setItem(disclaimerKey, '1');
  }, { disclaimerKey: DISCLAIMER_KEY });

  await step1.goto();
  await step1.modeCouple.click();
  await expect(step1.p2Name).toBeVisible();
  await expect(step1.p2Dob).toBeVisible();
});

test('step 3 assets tab toggle works', async ({ page, step3 }) => {
  // COUPLE_PLAN starts at step 4; clear localStorage so we start fresh at step 1
  await page.addInitScript(({ disclaimerKey }) => {
    localStorage.clear();
    localStorage.setItem(disclaimerKey, '1');
  }, { disclaimerKey: DISCLAIMER_KEY });

  await page.goto('/');
  // Navigate to step 3
  await page.getByTestId('step1-next').click();
  await page.getByRole('button', { name: /next/i }).last().click();

  await step3.tabAssets.click();
  await expect(page.getByText('ISA')).toBeVisible();

  await step3.tabIncome.click();
  await expect(page.getByText('DC / Personal Pension')).toBeVisible();
});

test('step 4 strategy buttons are rendered', async ({ page, step4 }) => {
  await page.goto('/');
  await expect(step4.strategyButton('standard-ufpls')).toBeVisible();
  await expect(step4.strategyButton('pcls-bed-isa')).toBeVisible();
});

test('RLSS moderate template updates spend display', async ({ page, step1, step2 }) => {
  await page.addInitScript(({ disclaimerKey }) => {
    localStorage.clear();
    localStorage.setItem(disclaimerKey, '1');
  }, { disclaimerKey: DISCLAIMER_KEY });

  await step1.goto();
  await step1.fillSingleMode('Alex', '1970-06-15');
  await step1.nextButton.click();

  await step2.rlssButton('moderate').click();
  const totalSpend = page.getByTestId('step2-total-spend');
  await expect(totalSpend).not.toHaveText('£0');
});
