import type { Page, Locator } from '@playwright/test';

export class Step2Page {
  readonly careReserveToggle: Locator;
  readonly addPlannedEvent: Locator;

  constructor(private page: Page) {
    this.careReserveToggle = page.getByTestId('step2-care-reserve-toggle');
    this.addPlannedEvent   = page.getByTestId('step2-add-planned-event');
  }

  // No testid on next button — fall back to role
  get nextButton() {
    return this.page.getByRole('button', { name: /next/i }).last();
  }

  rlssButton(standard: string) {
    return this.page.getByTestId(`step2-rlss-${standard}`);
  }

  stageTab(stageId: string) {
    return this.page.getByTestId(`step2-stage-${stageId}`);
  }
}
