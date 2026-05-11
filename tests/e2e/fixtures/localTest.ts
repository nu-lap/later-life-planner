import { test as base } from '@playwright/test';
import { Step1Page } from '../pages/step1.page';
import { Step2Page } from '../pages/step2.page';
import { Step3Page } from '../pages/step3.page';
import { Step4Page } from '../pages/step4.page';
import { AccountPage } from '../pages/account.page';
import { STORAGE_KEY, DISCLAIMER_KEY, COUPLE_PLAN } from './planFixtures';

type Fixtures = {
  step1: Step1Page;
  step2: Step2Page;
  step3: Step3Page;
  step4: Step4Page;
  account: AccountPage;
};

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await page.addInitScript(
      ({ storageKey, disclaimerKey, state }) => {
        localStorage.setItem(disclaimerKey, 'true');
        localStorage.setItem(storageKey, JSON.stringify({ state, version: 0 }));
      },
      { storageKey: STORAGE_KEY, disclaimerKey: DISCLAIMER_KEY, state: COUPLE_PLAN },
    );
    await use(page);
  },
  step1:   async ({ page }, use) => { await use(new Step1Page(page)); },
  step2:   async ({ page }, use) => { await use(new Step2Page(page)); },
  step3:   async ({ page }, use) => { await use(new Step3Page(page)); },
  step4:   async ({ page }, use) => { await use(new Step4Page(page)); },
  account: async ({ page }, use) => { await use(new AccountPage(page)); },
});

export { expect } from '@playwright/test';
