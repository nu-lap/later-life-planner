import type { Page } from '@playwright/test';

export async function mockApiRoutes(page: Page) {
  await page.route('/api/generate-vision', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ vision: 'Test vision text' }) }),
  );
  await page.route('/api/devices/**', (route) =>
    route.fulfill({ status: 200, body: '{}' }),
  );
  // Mock /api/data completely so no real Cosmos calls escape the test:
  //   GET  → 404  (usePlanSync sees no remote plan; no device-approval modal)
  //   PUT  → 200  (save succeeds without hitting the stale-revision conflict)
  // Tests that need their own /api/data behaviour (e.g. the stateful decrypt-cycle
  // test) must call page.unroute('/api/data') before installing their own handler.
  await page.route('/api/data', async (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 404 });
    if (method === 'PUT' || method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      });
    }
    return route.continue();
  });
}
