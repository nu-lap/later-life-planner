import { test, expect } from '@playwright/test';

// Smoke tests run against the deployed URL (E2E_BASE_URL).
// Safe to run against production — read-only, no mutations.

test('home page loads and shows planner branding', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/LaterLifePlan/i);
});

test('/api/data returns 4xx without auth, not 5xx', async ({ page }) => {
  const response = await page.request.get('/api/data');
  expect(response.status()).toBeLessThan(500);
  expect(response.status()).toBeGreaterThanOrEqual(400);
});

test('wizard step 1 renders without errors', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('llp-disclaimer-accepted', '1'));
  await page.goto('/');
  await expect(page.getByTestId('step1-mode-single')).toBeVisible();
  await expect(page.getByTestId('step1-mode-couple')).toBeVisible();
});
