import { createMockDemoState } from '../../../src/lib/mockData';

export const STORAGE_KEY = 'life-planner-v6';
export const DISCLAIMER_KEY = 'llp-disclaimer-accepted';

// currentStep/maxVisitedStep set to 4 so the dashboard loads directly when this plan is seeded
export const COUPLE_PLAN = { ...createMockDemoState(), currentStep: 4, maxVisitedStep: 4 };
