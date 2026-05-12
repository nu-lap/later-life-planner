import { test, expect } from '@playwright/test';

// Smoke tests run against the deployed URL (E2E_BASE_URL).
// Safe to run against production — read-only, no mutations.
// Note: tests that inject localStorage and navigate to '/' belong in wizard.spec.ts
// (dev server, no Clerk). Here Clerk auth.protect() redirects '/' for unauthenticated
// requests, so only tests that work without a session are included.

test('home page loads and shows planner branding', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/LaterLifePlan/i);
});

test('/api/data returns 4xx without auth, not 5xx', async ({ page }) => {
  const response = await page.request.get('/api/data');
  expect(response.status()).toBeLessThan(500);
  expect(response.status()).toBeGreaterThanOrEqual(400);
});

test('/account page renders without a server error', async ({ page }) => {
  const response = await page.goto('/account');
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('main')).toBeVisible();
});
