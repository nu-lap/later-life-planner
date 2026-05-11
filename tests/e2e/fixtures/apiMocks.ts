import type { Page } from '@playwright/test';

export async function mockApiRoutes(page: Page) {
  await page.route('/api/generate-vision', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ vision: 'Test vision text' }) }),
  );
  await page.route('/api/devices/**', (route) =>
    route.fulfill({ status: 200, body: '{}' }),
  );
}
