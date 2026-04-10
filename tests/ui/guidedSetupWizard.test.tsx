import { describe, expect, test, vi } from 'vitest';
import { applyPersonDraft } from '@/components/GuidedSetupWizard';

describe('GuidedSetupWizard', () => {
  test('preserves other income stop age when applying the wizard draft to planner state', () => {
    const setIncome = vi.fn();
    const setAsset = vi.fn();

    const draft: Parameters<typeof applyPersonDraft>[0] = {
      statePension: { enabled: true, weeklyAmount: 221.2, startAge: 67 },
      dbPensions: [],
      annuity: { enabled: false, annualIncome: 0, startAge: 65 },
      otherIncome: { enabled: true, annualAmount: 120, startAge: 60, stopAge: 67 },
      dcPensions: [],
      dcContribution: { workplaceSalary: 0, workplaceContributionPercent: 0, sippContributionAnnualGross: 0 },
      isas: [],
      gias: [],
      cashSavings: 0,
      property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 20, owner: 'p1' },
    };

    applyPersonDraft(draft, 'p1', setIncome, setAsset);

    expect(setIncome).toHaveBeenCalledWith('otherIncome', {
      enabled: true,
      annualAmount: 120,
      startAge: 60,
      stopAge: 67,
      description: 'Other income',
    });
  });
});
