import type { Page, Locator } from '@playwright/test';

export class Step4Page {
  constructor(private page: Page) {}

  get kpiCards(): Locator {
    return this.page.getByTestId('step4-kpi-cards');
  }

  tabButton(id: string): Locator {
    return this.page.getByTestId(`step4-tab-${id}`);
  }

  strategyButton(id: string): Locator {
    return this.page.getByTestId(`step4-strategy-${id}`);
  }
}
