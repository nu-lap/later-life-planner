import fs from 'fs';
import { test, expect } from '../fixtures/syncTest';
import { mockApiRoutes } from '../fixtures/apiMocks';
import { STORAGE_KEY } from '../fixtures/planFixtures';

// These tests require Clerk test credentials and a live Cosmos DB endpoint.
// They are skipped in CI unless CLERK_SECRET_KEY is set.
test.skip(!process.env.CLERK_SECRET_KEY, 'Requires Clerk test credentials');

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test('plan survives full encrypt → save → reload → decrypt cycle', async ({ page, step1, step2, step3, step4 }) => {
  // Mock GET /api/data → 404 so usePlanSync sees no remote plan and starts fresh,
  // regardless of any plan left in Cosmos by a previous run.
  // PUT requests are passed through so the save actually lands in Cosmos.
  await page.route('/api/data', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 404 });
    }
    return route.continue();
  });

  await step1.goto();
  await step1.fillSingleMode('Alex', '1970-06-15');
  await step1.nextButton.click();

  // Life Vision (step 1) — the "Set spending goals" button is always clickable;
  // Turnstile only gates the AI-generation feature, not manual navigation.
  await page.getByRole('button', { name: /set spending goals/i }).click();

  await step2.rlssButton('moderate').click();
  await step2.nextButton.click();

  await step3.nextButton.click();

  await expect(step4.kpiCards).toBeVisible();

  // Wait for plan to save — header shows "Saved"
  await expect(page.getByTestId('header-save-status')).toHaveText(/saved/i, { timeout: 15_000 });

  // Remove the GET mock so the reload fetches the real plan from Cosmos.
  await page.unroute('/api/data');

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

test('export produces a valid JSON file with expected plan fields', async ({ page, account }) => {
  const samplePlan = require('../fixtures/sample-plan.json');
  await page.evaluate(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
  }, { key: STORAGE_KEY, state: samplePlan });

  await page.goto('/account');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    account.exportButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/later-life-plan-\d{4}-\d{2}-\d{2}\.json/);

  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const content = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
  expect(content).toMatchObject({
    person1: { name: 'Alex' },
    mode: 'couple',
  });
});

test('importing an invalid file surfaces an error message', async ({ page, account }) => {
  await page.goto('/account');

  await account.importInput.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not valid json {{{'),
  });

  await expect(page.getByText(/could not import plan/i)).toBeVisible();
});
