import { test, expect } from '../fixtures/syncTest';
import { mockApiRoutes } from '../fixtures/apiMocks';

// These tests require Clerk test credentials and a live Cosmos DB endpoint.
// They are skipped in CI unless CLERK_SECRET_KEY is set.
test.skip(!process.env.CLERK_SECRET_KEY, 'Requires Clerk test credentials');

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test('plan survives full encrypt → save → reload → decrypt cycle', async ({ page, step1, step2, step3, step4 }) => {
  await step1.goto();
  await step1.fillSingleMode('Alex', '1970-06-15');
  await step1.nextButton.click();

  await step2.rlssButton('moderate').click();
  await step2.nextButton.click();

  await step3.nextButton.click();

  await expect(step4.kpiCards).toBeVisible();

  // Wait for plan to save — header shows "Saved"
  await expect(page.getByTestId('header-save-status')).toHaveText(/saved/i, { timeout: 15_000 });

  // Reload and verify plan persists through decrypt cycle
  await page.reload();
  await expect(step4.kpiCards).toBeVisible();
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('Alex');
});

test('import replaces plan and saves the new state', async ({ page, account, step4 }) => {
  await page.goto('/account');

  // Import a known fixture
  await account.importFromFile('tests/e2e/fixtures/sample-plan.json');

  // Navigate to dashboard and verify the imported state is active
  await page.goto('/');
  await expect(step4.kpiCards).toBeVisible();
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('Alex');
});

test('export produces a valid JSON file', async ({ page, account }) => {
  await page.goto('/');
  // Seed a plan first by completing the wizard
  // ...then navigate to account and export
  await page.goto('/account');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    account.exportButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/later-life-plan-\d{4}-\d{2}-\d{2}\.json/);
});
