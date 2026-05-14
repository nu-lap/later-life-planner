/**
 * UI screenshot capture for Stitch / DESIGN.md authoring.
 *
 * Run:
 *   E2E_BASE_URL=<url> npx playwright test tests/e2e/ui-screenshots.spec.ts \
 *     --config=playwright.screenshots.config.ts
 *
 * Output goes to docs/ui-reference-images/<YYYY-MM-DD>/.
 * Requires playwright/.clerk/user.json (run global.setup.ts first if missing).
 */
import { test } from '@playwright/test';
import { mockApiRoutes } from './fixtures/apiMocks';

const STORAGE_KEY = 'life-planner-v6';
const DISCLAIMER_KEY = 'llp-disclaimer-accepted';
// Suppresses MigrationPromptModal for the test account stored in playwright/.clerk/user.json
const MIGRATION_KEY = 'llp-sync-migration-v1:user_3DdagRPqqvia9Ca3SThV7WjXMTj';

const OUT_DIR =
  process.env.UI_SCREENSHOTS_DIR ??
  `docs/ui-reference-images/${new Date().toISOString().slice(0, 10)}`;

// Mock API routes so the device-approval and migration modals never appear.
// Must be registered before page.goto — beforeEach runs before addInitScript calls.
test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

async function shot(page: any, name: string) {
  await page.screenshot({
    path: `${OUT_DIR}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}

async function seed(page: any, step: number, extra: object = {}) {
  const base = {
    mode: 'single',
    fiAge: 60,
    person1: {
      name: 'Alex',
      dateOfBirth: '1966-03-15',
      currentAge: 60,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dbPension: { enabled: false, annualIncome: 0, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: true,
          totalValue: 320000,
          growthRate: 4,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: true, annualIncome: 12000, stopAge: 64 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 60, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: true, totalValue: 25000 },
        isaInvestments: { enabled: true, totalValue: 95000, growthRate: 4 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p1' },
      },
    },
    person2: {
      name: '',
      dateOfBirth: '1971-01-01',
      currentAge: 55,
      incomeSources: {
        statePension: { enabled: false, weeklyAmount: 221.20, startAge: 67 },
        dbPension: { enabled: false, annualIncome: 0, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: false,
          totalValue: 0,
          growthRate: 4,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: false, annualIncome: 0, stopAge: 65 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 55, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: false, totalValue: 0 },
        isaInvestments: { enabled: false, totalValue: 0, growthRate: 4 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p2' },
      },
    },
    assumptions: { lifeExpectancy: 90, investmentGrowth: 4, inflation: 2.5, statePensionSoleIncomeExempt: true },
    rlssStandard: 'moderate',
    currentStep: step,
    maxVisitedStep: step,
    ...extra,
  };

  await page.addInitScript(
    ({ sk, dk, s, mk }: any) => {
      localStorage.setItem(dk, '1');
      localStorage.setItem(sk, JSON.stringify({ state: s, version: 0 }));
      localStorage.setItem(mk, 'start-fresh');
    },
    { sk: STORAGE_KEY, dk: DISCLAIMER_KEY, s: base, mk: MIGRATION_KEY },
  );
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000', { timeout: 30000 });
  await page.waitForTimeout(1500);
}

// ─── Disclaimer gate ────────────────────────────────────────────────────────

test('disclaimer-gate', async ({ page }) => {
  // Navigate with no localStorage at all so the disclaimer modal is shown
  await page.addInitScript(() => localStorage.clear());
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, '00-disclaimer-gate');
});

// ─── Step 0: Household setup ─────────────────────────────────────────────────

test('step0-mode-selector', async ({ page }) => {
  await page.addInitScript(
    ({ dk, mk }: any) => {
      localStorage.setItem(dk, '1');
      localStorage.setItem(mk, 'start-fresh');
    },
    { dk: DISCLAIMER_KEY, mk: MIGRATION_KEY },
  );
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, '01-step0-mode-selector');
});

test('step0-single-mode-filled', async ({ page }) => {
  await seed(page, 0, { mode: 'single', currentStep: 0, maxVisitedStep: 0 });
  const singleBtn = page.getByTestId('step1-mode-single');
  if (await singleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await singleBtn.click();
    await page.waitForTimeout(400);
  }
  await shot(page, '02-step0-single-filled');
});

test('step0-couple-mode-filled', async ({ page }) => {
  await seed(page, 0, {
    mode: 'couple',
    fiAge: 60,
    p2FiAge: 63,
    currentStep: 0,
    maxVisitedStep: 0,
    person2: {
      name: 'Jordan',
      dateOfBirth: '1970-06-15',
      currentAge: 56,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dbPension: { enabled: false, annualIncome: 0, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: true,
          totalValue: 180000,
          growthRate: 4,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: false, annualIncome: 0, stopAge: 65 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 56, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: false, totalValue: 0 },
        isaInvestments: { enabled: true, totalValue: 60000, growthRate: 4 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p2' },
      },
    },
  });
  const coupleBtn = page.getByTestId('step1-mode-couple');
  if (await coupleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await coupleBtn.click();
    await page.waitForTimeout(400);
  }
  await shot(page, '03-step0-couple-filled');
});

// ─── Step 1: Life vision ─────────────────────────────────────────────────────

test('step1-life-vision', async ({ page }) => {
  await seed(page, 1, { currentStep: 1, maxVisitedStep: 1 });
  await shot(page, '04-step1-life-vision');
});

// ─── Step 2: Spending goals ───────────────────────────────────────────────────

test('step2-spending-gogo', async ({ page }) => {
  await seed(page, 2, { currentStep: 2, maxVisitedStep: 2, rlssStandard: 'moderate' });
  await shot(page, '05-step2-spending-gogo');
});

test('step2-spending-slowo-tab', async ({ page }) => {
  await seed(page, 2, { currentStep: 2, maxVisitedStep: 2, rlssStandard: 'moderate' });
  const sloGoTab = page.locator('[data-testid^="step2-stage-"]').nth(1);
  if (await sloGoTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sloGoTab.click();
    await page.waitForTimeout(400);
  }
  await shot(page, '06-step2-spending-slowo');
});

test('step2-spending-with-events', async ({ page }) => {
  await seed(page, 2, {
    currentStep: 2,
    maxVisitedStep: 2,
    rlssStandard: 'moderate',
    plannedEvents: [
      { id: 'ev-1', name: 'New kitchen', age: 62, amount: 25000, emoji: '🍳', inflation: false },
      { id: 'ev-2', name: 'World cruise', age: 65, amount: 18000, emoji: '🚢', inflation: true },
      { id: 'ev-3', name: 'New car', age: 68, amount: 35000, emoji: '🚗', inflation: false },
    ],
  });
  await shot(page, '07-step2-spending-events');
});

// ─── Step 3: Income & assets ──────────────────────────────────────────────────

test('step3-income-sources', async ({ page }) => {
  await seed(page, 3, {
    currentStep: 3,
    maxVisitedStep: 3,
    person1: {
      name: 'Alex',
      dateOfBirth: '1966-03-15',
      currentAge: 60,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dbPension: { enabled: true, annualIncome: 8400, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: true,
          totalValue: 320000,
          growthRate: 4,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: true, annualIncome: 12000, stopAge: 64 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 60, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: true, totalValue: 25000 },
        isaInvestments: { enabled: true, totalValue: 95000, growthRate: 4 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p1' },
      },
    },
  });
  await shot(page, '08-step3-income-assets');
});

// ─── Step 4: Dashboard ────────────────────────────────────────────────────────

test('step4-dashboard-healthy', async ({ page }) => {
  await seed(page, 4, { currentStep: 4, maxVisitedStep: 4 });
  await page.waitForTimeout(1000);
  await shot(page, '09-step4-dashboard-healthy');
});

test('step4-dashboard-tight', async ({ page }) => {
  // Plan where assets run low — shows warning state
  await seed(page, 4, {
    currentStep: 4,
    maxVisitedStep: 4,
    fiAge: 55,
    person1: {
      name: 'Alex',
      dateOfBirth: '1972-03-15',
      currentAge: 54,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 180.00, startAge: 67 },
        dbPension: { enabled: false, annualIncome: 0, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: true,
          totalValue: 90000,
          growthRate: 3,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: false, annualIncome: 0, stopAge: 65 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 55, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: true, totalValue: 15000 },
        isaInvestments: { enabled: true, totalValue: 40000, growthRate: 3 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p1' },
      },
    },
    rlssStandard: 'comfortable',
    assumptions: { lifeExpectancy: 90, investmentGrowth: 3, inflation: 3, statePensionSoleIncomeExempt: true },
  });
  await page.waitForTimeout(1000);
  await shot(page, '10-step4-dashboard-tight');
});

test('step4-dashboard-couple', async ({ page }) => {
  await seed(page, 4, {
    mode: 'couple',
    fiAge: 60,
    p2FiAge: 63,
    currentStep: 4,
    maxVisitedStep: 4,
    person1: {
      name: 'Alex',
      dateOfBirth: '1966-03-15',
      currentAge: 60,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dbPension: { enabled: false, annualIncome: 0, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: true,
          totalValue: 320000,
          growthRate: 4,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: true, annualIncome: 12000, stopAge: 64 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 60, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: true, totalValue: 25000 },
        isaInvestments: { enabled: true, totalValue: 95000, growthRate: 4 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p1' },
      },
    },
    person2: {
      name: 'Jordan',
      dateOfBirth: '1970-06-15',
      currentAge: 56,
      incomeSources: {
        statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
        dbPension: { enabled: false, annualIncome: 0, startAge: 65 },
        annuity: { enabled: false, annualIncome: 0, startAge: 65 },
        dcPension: {
          enabled: true,
          totalValue: 180000,
          growthRate: 4,
          workplaceContributionPercent: 0,
          workplaceSalary: 0,
          sippContributionAnnualGross: 0,
        },
        partTimeWork: { enabled: false, annualIncome: 0, stopAge: 65 },
        otherIncome: { enabled: false, annualAmount: 0, description: '', startAge: 56, stopAge: 0 },
      },
      assets: {
        cashSavings: { enabled: false, totalValue: 0 },
        isaInvestments: { enabled: true, totalValue: 60000, growthRate: 4 },
        generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 4 },
        property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 10, owner: 'p2' },
      },
    },
  });
  await page.waitForTimeout(1000);
  await shot(page, '11-step4-dashboard-couple');
});

// ─── Mobile views ─────────────────────────────────────────────────────────────

test('mobile-step0', async ({ page }) => {
  await page.addInitScript(
    ({ dk, mk }: any) => {
      localStorage.setItem(dk, '1');
      localStorage.setItem(mk, 'start-fresh');
    },
    { dk: DISCLAIMER_KEY, mk: MIGRATION_KEY },
  );
  await page.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3000', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, '12-mobile-step0');
});

test('mobile-step4-dashboard', async ({ page }) => {
  await seed(page, 4, { currentStep: 4, maxVisitedStep: 4 });
  await page.waitForTimeout(1000);
  await shot(page, '13-mobile-step4-dashboard');
});
