import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e/exploratory',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    bypassCSP: true,
    trace: 'on',
    headless: false,
    launchOptions: {
      slowMo: 200,
    },
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /charter-(?!8)\d+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
    },
    {
      name: 'authenticated',
      testMatch: /charter-8\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
    },
  ],
});
