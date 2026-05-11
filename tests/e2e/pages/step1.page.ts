import type { Page, Locator } from '@playwright/test';

export class Step1Page {
  readonly modeSingle: Locator;
  readonly modeCouple: Locator;
  readonly p1Name: Locator;
  readonly p1Dob: Locator;
  readonly p2Name: Locator;
  readonly p2Dob: Locator;
  readonly nextButton: Locator;

  constructor(private page: Page) {
    this.modeSingle = page.getByTestId('step1-mode-single');
    this.modeCouple = page.getByTestId('step1-mode-couple');
    this.p1Name     = page.getByTestId('step1-p1-name');
    this.p1Dob      = page.getByTestId('step1-p1-dob');
    this.p2Name     = page.getByTestId('step1-p2-name');
    this.p2Dob      = page.getByTestId('step1-p2-dob');
    this.nextButton = page.getByTestId('step1-next');
  }

  async goto() {
    await this.page.goto('/');
  }

  // Range sliders reject .fill() — must set value and dispatch events
  async setSlider(testId: string, value: number) {
    await this.page.getByTestId(testId).evaluate((el, v) => {
      (el as HTMLInputElement).value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  async fillSingleMode(name: string, dob: string) {
    await this.modeSingle.click();
    await this.p1Name.fill(name);
    await this.p1Dob.fill(dob);
  }

  async fillCoupleMode(
    p1: { name: string; dob: string },
    p2: { name: string; dob: string },
  ) {
    await this.modeCouple.click();
    await this.p1Name.fill(p1.name);
    await this.p1Dob.fill(p1.dob);
    await this.p2Name.fill(p2.name);
    await this.p2Dob.fill(p2.dob);
  }
}
