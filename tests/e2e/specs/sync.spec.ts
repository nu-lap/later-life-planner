import fs from 'fs';
import { test, expect } from '../fixtures/syncTest';
import { mockApiRoutes } from '../fixtures/apiMocks';
import { STORAGE_KEY } from '../fixtures/planFixtures';

// These tests require Clerk test credentials and a live Cosmos DB endpoint.
// They are skipped in CI unless CLERK_SECRET_KEY is set.
test.skip(!process.env.CLERK_SECRET_KEY, 'Requires Clerk test credentials');

test.beforeEach(async ({ page }) => {
  // mockApiRoutes registers a GET /api/data → 404 stub so usePlanSync starts fresh
  // and no device-approval modal blocks the UI regardless of prior Cosmos state.
  await mockApiRoutes(page);
});

test('plan survives full encrypt → save → reload → decrypt cycle', async ({ page, step1, step2, step3, step4 }) => {
  // Replace the static GET→404 stub with a stateful intercept:
  //   - GET before save  → 404 (no device-approval modal)
  //   - PUT              → capture encrypted payload, return success
  //   - GET after reload → serve captured payload so decrypt cycle runs against real crypto
  await page.unroute('/api/data');

  type PutBody = {
    schemaVersion?: number;
    iv?: string;
    ciphertext?: string;
    keyVersion?: number;
    wrappedKey?: string;
  };
  let captured: PutBody | null = null;
  const now = new Date().toISOString();

  await page.route('/api/data', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (captured) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schemaVersion: captured.schemaVersion,
            revision: 1,
            iv: captured.iv,
            ciphertext: captured.ciphertext,
            keyVersion: captured.keyVersion,
            wrappedKey: captured.wrappedKey,
            createdAt: now,
            updatedAt: now,
          }),
        });
      }
      return route.fulfill({ status: 404 });
    }
    if (method === 'PUT' || method === 'POST') {
      captured = await route.request().postDataJSON() as PutBody;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: captured.schemaVersion, revision: 1, createdAt: now, updatedAt: now }),
      });
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

  // Reload — GET /api/data now returns the captured encrypted payload.
  // KPI cards visible proves the plan was decrypted and currentStep restored to 4.
  await page.reload();
  await expect(step4.kpiCards).toBeVisible();
});

test('import replaces plan and saves the new state', async ({ page, account }) => {
  await page.goto('/account');

  // Import a known fixture (sample-plan.json has currentStep: 0, person1.name: 'Alex')
  await account.importFromFile('tests/e2e/fixtures/sample-plan.json');

  // importPlanFromJson is async (file.text() promise) — wait for the save cycle to
  // complete so localStorage is flushed before we navigate away.
  await expect(page.getByTestId('header-save-status')).toHaveText(/saved/i, { timeout: 15_000 });

  // Navigate to root — wizard shows at step 0 (Household) because the imported
  // plan has currentStep: 0. Verify the imported name was hydrated into the store.
  await page.goto('/');
  await expect(page.getByTestId('step1-p1-name')).toHaveValue('Alex');
});

test('export produces a valid JSON file with expected plan fields', async ({ page, account }) => {
  // Navigate to the app first to establish the correct origin for localStorage access.
  await page.goto('/');

  const samplePlan = require('../fixtures/sample-plan.json');
  await page.evaluate(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
  }, { key: STORAGE_KEY, state: samplePlan });

  // Reload the account page so Zustand picks up the localStorage state.
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
