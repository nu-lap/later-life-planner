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
  // Navigate to /sign-in (public route) so Clerk loads.
  // '/' is protected — auth.protect() rewrites to 404 on production domains,
  // so Clerk never loads and clerk.signIn() has no context to work with.
  await page.goto('/sign-in');
  // emailAddress strategy uses a server-side token — bypasses all verification and MFA
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
  });
  // Wipe any stale plan from a previous run so tests start clean.
  // Without this, the device approval modal blocks the UI (existing encrypted
  // plan in Cosmos, no DEK in fresh IndexedDB = can't decrypt = modal appears).
  await page.request.delete('/api/data');

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
