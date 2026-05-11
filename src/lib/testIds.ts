/**
 * Centralized test ID constants for data-testid attributes.
 * Import these in both components and tests to prevent string drift.
 *
 * Usage in components:   data-testid={STEP1_IDS.NEXT}
 * Usage in tests:        screen.getByTestId(STEP1_IDS.NEXT)
 */

export const STEP1_IDS = {
  MODE_SINGLE:       'step1-mode-single',
  MODE_COUPLE:       'step1-mode-couple',
  P1_NAME:           'step1-p1-name',
  P1_DOB:            'step1-p1-dob',
  P2_NAME:           'step1-p2-name',
  P2_DOB:            'step1-p2-dob',
  P1_FI_AGE:         'step1-p1-fi-age',
  P2_FI_AGE:         'step1-p2-fi-age',
  LIFE_EXPECTANCY:   'step1-life-expectancy',
  NEXT:              'step1-next',
} as const;

export const STEP2_IDS = {
  STAGE_TAB:              (stageId: string) => `step2-stage-${stageId}`,
  RLSS_BUTTON:            (standard: string) => `step2-rlss-${standard}`,
  TOTAL_SPEND_DISPLAY:    'step2-total-spend',
  CARE_RESERVE_TOGGLE:    'step2-care-reserve-toggle',
  CARE_RESERVE_AMOUNT:    'step2-care-reserve-amount',
  GAP_SPENDING_INPUT:     'step2-gap-spending',
  ADD_PLANNED_EVENT:      'step2-add-planned-event',
} as const;

export const STEP3_IDS = {
  TAB_INCOME:            'step3-tab-income',
  TAB_ASSETS:            'step3-tab-assets',
  P1_ISA_CONTRIBUTION:   'step3-p1-isa-contribution',
  P1_GIA_CONTRIBUTION:   'step3-p1-gia-contribution',
  P2_ISA_CONTRIBUTION:   'step3-p2-isa-contribution',
  JOINT_GIA_CONTRIBUTION: 'step3-joint-gia-contribution',
} as const;

export const STEP4_IDS = {
  TAB_BUTTON:        (tabId: string) => `step4-tab-${tabId}`,
  STRATEGY_BUTTON:   (strategyId: string) => `step4-strategy-${strategyId}`,
  KPI_CARDS:         'step4-kpi-cards',
} as const;

export const HEADER_IDS = {
  SAVE_STATUS:   'header-save-status',
  ACCOUNT_LINK:  'header-account-link',
} as const;
