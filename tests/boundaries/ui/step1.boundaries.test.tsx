import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';
import {
  getFiAgeMax,
  getLifeExpectancyMin,
  MAX_PLANNING_HORIZON,
} from '@/lib/planningBounds';
import { STEP1_IDS } from '@/lib/testIds';

// ─── Mock store ───────────────────────────────────────────────────────────────
// Step1HouseholdSetup reads state and action functions via usePlannerStore().
// We mock the whole module to control currentAge, lifeExpectancy, and mode.

let plannerState: ReturnType<typeof makePlannerState>;

function makePlannerState(overrides: { age?: number; lifeExpectancy?: number; mode?: 'single' | 'couple'; p2Age?: number } = {}) {
  const { age = 57, lifeExpectancy = 95, mode = 'single', p2Age = 57 } = overrides;
  const base = createDefaultState(age);
  return {
    ...base,
    mode,
    fiAge: age + 3,
    p2FiAge: mode === 'couple' ? p2Age + 3 : undefined,
    person1: { ...base.person1, currentAge: age },
    person2: { ...base.person2, currentAge: p2Age },
    assumptions: { ...base.assumptions, lifeExpectancy },
    setMode: vi.fn(),
    setP1Name: vi.fn(),
    setP1Dob: vi.fn(),
    setP2Name: vi.fn(),
    setP2Dob: vi.fn(),
    setFiAge: vi.fn(),
    setP2FiAge: vi.fn(),
    updateAssumptions: vi.fn(),
    rlssStandard: undefined as any,
    applyRlssTemplate: vi.fn(),
  };
}

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

import Step1HouseholdSetup from '@/components/steps/Step1HouseholdSetup';

describe('Step1 — FI age slider bounds', () => {
  beforeEach(() => {
    plannerState = makePlannerState({ age: 56, lifeExpectancy: 95 });
  });

  test('FI age slider min equals currentAge (age 56)', () => {
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.P1_FI_AGE);
    expect(slider).toHaveAttribute('min', '56');
  });

  test('FI age slider max = lifeExpectancy − 2 (i.e. getFiAgeMax)', () => {
    // getFiAgeMax(95) = 95 - (3 - 1) = 93
    const expectedMax = getFiAgeMax(95);
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.P1_FI_AGE);
    expect(slider).toHaveAttribute('max', String(expectedMax));
  });

  test('FI age slider min equals currentAge (age 74 — upper boundary)', () => {
    plannerState = makePlannerState({ age: 74, lifeExpectancy: 95 });
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.P1_FI_AGE);
    expect(slider).toHaveAttribute('min', '74');
  });

  test('when currentAge equals fiAgeMax slider is disabled', () => {
    // With age 93 and lifeExpectancy 95: fiAgeMax = 93, fiAgeMin = 93 → collapsed range
    plannerState = makePlannerState({ age: 93, lifeExpectancy: 95 });
    plannerState.fiAge = 93;
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.P1_FI_AGE);
    expect(slider).toBeDisabled();
  });
});

describe('Step1 — life expectancy slider bounds', () => {
  test('life expectancy slider min = max(80, age + 2) for age 56', () => {
    plannerState = makePlannerState({ age: 56 });
    // getLifeExpectancyMin(56, 0) = max(80, 56 + 2) = 80
    const expectedMin = getLifeExpectancyMin(56, 0);
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.LIFE_EXPECTANCY);
    expect(slider).toHaveAttribute('min', String(expectedMin));
  });

  test('life expectancy slider min rises above 80 when age is high enough', () => {
    plannerState = makePlannerState({ age: 82, lifeExpectancy: 95 });
    // getLifeExpectancyMin(82, 0) = max(80, 82 + 2) = 84
    const expectedMin = getLifeExpectancyMin(82, 0);
    expect(expectedMin).toBe(84);
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.LIFE_EXPECTANCY);
    expect(slider).toHaveAttribute('min', '84');
  });

  test('life expectancy slider max is always MAX_PLANNING_HORIZON (105)', () => {
    plannerState = makePlannerState({ age: 56 });
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.LIFE_EXPECTANCY);
    expect(slider).toHaveAttribute('max', String(MAX_PLANNING_HORIZON));
  });

  test('slider is disabled when min equals max (collapsed range)', () => {
    // With age = MAX_PLANNING_HORIZON - 2 = 103, min would be 105 = max
    plannerState = makePlannerState({ age: 103, lifeExpectancy: 105 });
    plannerState.fiAge = 103;
    plannerState.assumptions = { ...plannerState.assumptions, lifeExpectancy: 105 };
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.LIFE_EXPECTANCY);
    expect(slider).toBeDisabled();
  });
});

describe('Step1 — mode: P2 fields visibility', () => {
  test('P2 name and DOB inputs absent in single mode', () => {
    plannerState = makePlannerState({ mode: 'single' });
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    expect(screen.queryByTestId(STEP1_IDS.P2_NAME)).not.toBeInTheDocument();
    expect(screen.queryByTestId(STEP1_IDS.P2_DOB)).not.toBeInTheDocument();
  });

  test('P2 name and DOB inputs present in couple mode', () => {
    plannerState = makePlannerState({ mode: 'couple', p2Age: 55 });
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP1_IDS.P2_NAME)).toBeInTheDocument();
    expect(screen.getByTestId(STEP1_IDS.P2_DOB)).toBeInTheDocument();
  });

  test('P2 FI age slider absent in single mode', () => {
    plannerState = makePlannerState({ mode: 'single' });
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    expect(screen.queryByTestId(STEP1_IDS.P2_FI_AGE)).not.toBeInTheDocument();
  });

  test('P2 FI age slider present in couple mode with correct min', () => {
    const p2Age = 55;
    plannerState = makePlannerState({ mode: 'couple', age: 56, p2Age });
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const p2Slider = screen.getByTestId(STEP1_IDS.P2_FI_AGE);
    expect(p2Slider).toBeInTheDocument();
    // P2's FI age min should equal P2's currentAge
    expect(p2Slider).toHaveAttribute('min', String(p2Age));
  });

  test('couple mode: life expectancy slider min accounts for P2 age', () => {
    // getLifeExpectancyMin(p1Age, p2Age) = max(80, p1Age + 2, p2Age)
    // With p1Age = 56 and p2Age = 82: max(80, 58, 82) = 82
    plannerState = makePlannerState({ mode: 'couple', age: 56, p2Age: 82, lifeExpectancy: 95 });
    const expectedMin = getLifeExpectancyMin(56, 82);
    expect(expectedMin).toBe(82);
    render(<Step1HouseholdSetup onNext={vi.fn()} />);
    const slider = screen.getByTestId(STEP1_IDS.LIFE_EXPECTANCY);
    expect(slider).toHaveAttribute('min', '82');
  });
});
