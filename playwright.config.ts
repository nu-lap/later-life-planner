import { defineConfig, devices } from '@playwright/test';

const hasClerkCreds = !!process.env.CLERK_SECRET_KEY;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    bypassCSP: true,
    trace: 'on-first-retry',
  },
  projects: [
    // Project-based setup: clerkSetup() + sign-in → storageState saved to disk.
    // Only created when CLERK_SECRET_KEY is present (sync tests self-skip otherwise).
    ...(hasClerkCreds ? [
      {
        name: 'setup',
        testMatch: /global\.setup\.ts/,
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'authenticated',
        testMatch: /sync\.spec\.ts/,
        use: {
          ...devices['Desktop Chrome'],
          storageState: 'playwright/.clerk/user.json',
        },
        dependencies: ['setup'],
      },
    ] : []),

    // All other specs (wizard, account, smoke) — no auth required
    {
      name: 'chromium',
      testMatch: /\/(wizard|account|smoke)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Uses dev server so NODE_ENV=development and the Reset button is visible
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
