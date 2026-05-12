import type { Page } from '@playwright/test';

export async function mockApiRoutes(page: Page) {
  await page.route('/api/generate-vision', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ vision: 'Test vision text' }) }),
  );
  await page.route('/api/devices/**', (route) =>
    route.fulfill({ status: 200, body: '{}' }),
  );
  // Return 404 for GET /api/data so usePlanSync sees no remote plan and the wizard
  // starts fresh without a device-approval modal blocking the UI. Tests that need
  // to exercise the real decrypt cycle must call page.unroute('/api/data') before
  // the reload step.
  await page.route('/api/data', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 404 });
    return route.continue();
  });
}
