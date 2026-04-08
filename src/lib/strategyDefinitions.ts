import type { PlanningMode } from '@/lib/types';

export type StrategyPlanMode = PlanningMode;

export interface StrategyDefinition {
  label: string;
  description: string;
  applicableModes: StrategyPlanMode[];
}

export function getBaselineWaterfallDescription(mode: StrategyPlanMode): string {
  if (mode === 'single') {
    return "LaterLifePlan's standard order is DC pension within the personal allowance plus 25% tax-free, then GIA within the CGT allowance, then ISA, then remaining GIA, then DC pension above the personal allowance.";
  }

  return "LaterLifePlan's standard order is DC pension within each person's personal allowance plus 25% tax-free, then GIA within the CGT allowance, then ISA, then remaining GIA, then DC pension above the personal allowance. Once ISA withdrawals are needed in a couple plan, both ISAs are used evenly as household tax-free savings.";
}

export function getStrategyDisplayLabel(mode: StrategyPlanMode, rawLabel: string): string {
  if (rawLabel.includes('Paul-DC-First')) {
    return mode === 'single' ? 'Even DC drawdown' : 'Partner 1-first DC drawdown';
  }

  switch (rawLabel) {
    case '1-LLP-Baseline':
      return 'LLP baseline waterfall';
    case '2-Couple-equal':
      return mode === 'single' ? 'Even DC drawdown' : 'Couple-equal DC drawdown';
    case '3-Proportional':
      return 'Proportional DC drawdown';
    case '4-Lisa-first':
      return mode === 'single' ? 'Alternative DC drawdown' : 'Partner 2-first DC drawdown';
    case '5-ISA-preserve':
      return 'ISA-preserve';
    default:
      return rawLabel;
  }
}

export function getStrategyDefinitions(
  mode: StrategyPlanMode,
  person1Name: string,
  person2Name?: string,
): StrategyDefinition[] {
  const coupleMode = mode === 'couple';
  const otherPersonName = person2Name || 'Partner 2';
  const strategyDefinitions: StrategyDefinition[] = [
    {
      label: 'LLP baseline waterfall',
      description: getBaselineWaterfallDescription(mode),
      applicableModes: ['single', 'couple'],
    },
    {
      label: mode === 'single' ? 'Even DC drawdown' : 'Couple-equal DC drawdown',
      description: coupleMode
        ? 'Split taxable pension withdrawals evenly between both partners where possible, and split ISA withdrawals evenly when ISA money is needed.'
        : 'Split taxable pension withdrawals evenly across the available DC pots where possible.',
      applicableModes: ['single', 'couple'],
    },
    {
      label: 'Proportional DC drawdown',
      description: coupleMode
        ? 'Split taxable pension withdrawals in proportion to each partner’s pension pot size, and split ISA withdrawals in proportion to the ISA balances.'
        : 'Split taxable pension withdrawals across the available DC pots in proportion to the pot sizes.',
      applicableModes: ['single', 'couple'],
    },
    {
      label: mode === 'single' ? 'Alternative DC drawdown' : 'Partner 2-first DC drawdown',
      description: coupleMode
        ? `Draw from ${otherPersonName}'s pension before ${person1Name}'s pension, and use ${otherPersonName}'s ISA before ${person1Name}'s ISA once ISA withdrawals are needed.`
        : 'Use an alternative DC drawdown order to compare with the baseline waterfall.',
      applicableModes: ['single', 'couple'],
    },
    {
      label: 'ISA-preserve',
      description: 'Delay ISA withdrawals until later years and lean on pensions, GIA, or cash first.',
      applicableModes: ['single', 'couple'],
    },
  ];

  return strategyDefinitions.filter((definition) => definition.applicableModes.includes(mode));
}
