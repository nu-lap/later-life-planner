import type { Page, Locator } from '@playwright/test';

export class AccountPage {
  readonly exportButton: Locator;
  readonly importButton: Locator;
  readonly importInput: Locator;
  readonly resetButton: Locator;

  constructor(private page: Page) {
    this.exportButton = page.getByTestId('account-export-plan');
    this.importButton = page.getByTestId('account-import-plan');
    this.importInput  = page.getByTestId('account-import-input');
    this.resetButton  = page.getByTestId('account-reset-plan');
  }

  async goto() {
    await this.page.goto('/account');
  }

  async importFromFile(jsonPath: string) {
    await this.importInput.setInputFiles(jsonPath);
  }
}
