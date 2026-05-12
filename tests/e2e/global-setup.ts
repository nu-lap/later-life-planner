import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Must run serially — required when fullyParallel is true
setup.describe.configure({ mode: 'serial' });

export const authFile = path.join(__dirname, '../../playwright/.clerk/user.json');

setup('global setup', async ({}) => {
  await clerkSetup();
});

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  // emailAddress strategy uses a server-side token — bypasses all verification and MFA
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
  });
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
