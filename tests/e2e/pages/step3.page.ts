import type { Page, Locator } from '@playwright/test';

export class Step3Page {
  readonly tabIncome: Locator;
  readonly tabAssets: Locator;

  constructor(private page: Page) {
    this.tabIncome = page.getByTestId('step3-tab-income');
    this.tabAssets = page.getByTestId('step3-tab-assets');
  }

  get nextButton() {
    return this.page.getByRole('button', { name: /next/i }).last();
  }
}
