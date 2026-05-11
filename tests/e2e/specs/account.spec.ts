import path from 'path';
import { test, expect } from '@playwright/test';
import { DISCLAIMER_KEY } from '../fixtures/planFixtures';

// Account page requires Clerk when HAS_CLERK=true.
// These tests run against a dev server without Clerk keys, so the
// account page shows "Account area is disabled". Export and import
// are therefore tested via the wizard flow + localStorage, and reset
// is tested from the header (dev-only button).
//
// IMPORTANT: these tests use bare `test` (not localTest) so that the
// disclaimer-only addInitScript does NOT re-seed plan data on every
// reload (which localTest's fixture would do, breaking post-reset checks).

test('reset plan returns to blank state', async ({ page }) => {
  // Only seed the disclaimer on every page load — no plan data.
  // This means the app starts at step 1 with a blank plan, and after
  // handleReset() triggers window.location.reload() the store stays blank.
  await page.addInitScript(
    ({ disclaimerKey }) => { localStorage.setItem(disclaimerKey, '1'); },
    { disclaimerKey: DISCLAIMER_KEY },
  );

  await page.goto('/');

  // The reset button is dev-only (NODE_ENV=development)
  const resetButton = page.getByTestId('account-reset-plan');
  await expect(resetButton).toBeVisible();
  await resetButton.click();

  // Confirm modal
  await page.getByRole('button', { name: /reset plan/i }).click();

  // After reset + reload, P1 name input should be empty
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('');
});

test('plan import restores state from JSON backup', async ({ page }) => {
  // Only seed the disclaimer — no plan data, so the store starts blank.
  // The samplePlan is injected via page.evaluate() which runs once on the
  // current page; on the subsequent reload the addInitScript only re-seeds
  // the disclaimer and does NOT clear or overwrite life-planner-v6.
  await page.addInitScript(
    ({ disclaimerKey }) => { localStorage.setItem(disclaimerKey, '1'); },
    { disclaimerKey: DISCLAIMER_KEY },
  );

  await page.goto('/');

  // Verify blank state — P1 name is empty
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('');

  // Inject the sample plan and reload so Zustand hydrates from it
  const samplePlan = require(path.join(__dirname, '../fixtures/sample-plan.json'));
  await page.evaluate(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    window.location.reload();
  }, { key: 'life-planner-v6', state: samplePlan });

  await expect(page.getByTestId('step1-p1-name')).toHaveValue('Alex');
});
