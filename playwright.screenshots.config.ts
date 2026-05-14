import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /ui-screenshots\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    bypassCSP: true,
    headless: true,
    trace: 'off',
    storageState: 'playwright/.clerk/user.json',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: /ui-screenshots\.spec\.ts/,
      grep: /mobile/,
    },
  ],
});
