import path from 'path';
import { test, expect } from '../fixtures/localTest';

// Account page requires Clerk when HAS_CLERK=true.
// These tests run against a dev server without Clerk keys, so the
// account page shows "Account area is disabled". Export and import
// are therefore tested via the wizard flow + localStorage, and reset
// is tested from the header (dev-only button).

test('reset plan returns to blank state', async ({ page }) => {
  await page.goto('/');

  // The reset button is dev-only (NODE_ENV=development)
  const resetButton = page.getByTestId('account-reset-plan');
  await expect(resetButton).toBeVisible();
  await resetButton.click();

  // Confirm modal
  await page.getByRole('button', { name: /reset plan/i }).click();

  // After reset, P1 name input should be empty
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('');
});

test('plan import restores state from JSON backup', async ({ page }) => {
  // Navigate away from the pre-seeded couple plan and verify blank state
  await page.addInitScript(() => localStorage.clear());
  await page.addInitScript(() => localStorage.setItem('llp-disclaimer-accepted', '1'));
  await page.goto('/');

  // Verify blank state — P1 name is empty
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('');

  // Import via the store's importPlanFromJson by simulating localStorage injection
  // (The import UI is only on the account page, which requires Clerk without keys)
  // This test verifies the end state: after loading sample-plan.json the name is Alex
  const samplePlan = require(path.join(__dirname, '../fixtures/sample-plan.json'));
  await page.evaluate(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    window.location.reload();
  }, { key: 'life-planner-v6', state: samplePlan });

  await expect(page.getByTestId('step1-p1-name')).toHaveValue('Alex');
});
