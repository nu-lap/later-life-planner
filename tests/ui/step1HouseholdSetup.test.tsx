import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';
import { STEP1_IDS } from '@/lib/testIds';

const setModeMock = vi.fn();
const setP1NameMock = vi.fn();
const setP1DobMock = vi.fn();
const setP2NameMock = vi.fn();
const setP2DobMock = vi.fn();
const setFiAgeMock = vi.fn();
const setP2FiAgeMock = vi.fn();
const updateAssumptionsMock = vi.fn();
const onNextMock = vi.fn();

const baseSingle = createDefaultState(57);

let plannerState: any = {
  ...baseSingle,
  mode: 'single',
  fiAge: 60,
  p2FiAge: undefined,
  setMode: setModeMock,
  setP1Name: setP1NameMock,
  setP1Dob: setP1DobMock,
  setP2Name: setP2NameMock,
  setP2Dob: setP2DobMock,
  setFiAge: setFiAgeMock,
  setP2FiAge: setP2FiAgeMock,
  updateAssumptions: updateAssumptionsMock,
  rlssStandard: undefined,
  applyRlssTemplate: vi.fn(),
};

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

import Step1HouseholdSetup from '@/components/steps/Step1HouseholdSetup';

describe('Step1HouseholdSetup — single mode', () => {
  beforeEach(() => {
    setModeMock.mockReset();
    setP1NameMock.mockReset();
    setP1DobMock.mockReset();
    setFiAgeMock.mockReset();
    updateAssumptionsMock.mockReset();
    onNextMock.mockReset();
    plannerState = { ...plannerState, mode: 'single', p2FiAge: undefined };
  });

  test('renders mode selector buttons', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    expect(screen.getByTestId(STEP1_IDS.MODE_SINGLE)).toBeInTheDocument();
    expect(screen.getByTestId(STEP1_IDS.MODE_COUPLE)).toBeInTheDocument();
  });

  test('clicking couple mode button calls setMode', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    fireEvent.click(screen.getByTestId(STEP1_IDS.MODE_COUPLE));
    expect(setModeMock).toHaveBeenCalledWith('couple');
  });

  test('clicking single mode button calls setMode', () => {
    plannerState = { ...plannerState, mode: 'couple' };
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    fireEvent.click(screen.getByTestId(STEP1_IDS.MODE_SINGLE));
    expect(setModeMock).toHaveBeenCalledWith('single');
  });

  test('renders person 1 name input and calls setP1Name on change', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    const input = screen.getByTestId(STEP1_IDS.P1_NAME);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(setP1NameMock).toHaveBeenCalledWith('Alice');
  });

  test('renders person 1 DOB input and calls setP1Dob on change', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    const input = screen.getByTestId(STEP1_IDS.P1_DOB);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '1967-03-15' } });
    expect(setP1DobMock).toHaveBeenCalledWith('1967-03-15');
  });

  test('p1 FI age slider calls setFiAge on change', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    const slider = screen.getByTestId(STEP1_IDS.P1_FI_AGE);
    fireEvent.change(slider, { target: { value: '62' } });
    expect(setFiAgeMock).toHaveBeenCalledWith(62);
  });

  test('life expectancy slider calls updateAssumptions on change', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    const slider = screen.getByTestId(STEP1_IDS.LIFE_EXPECTANCY);
    fireEvent.change(slider, { target: { value: '90' } });
    expect(updateAssumptionsMock).toHaveBeenCalledWith({ lifeExpectancy: 90 });
  });

  test('next button calls onNext', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    fireEvent.click(screen.getByTestId(STEP1_IDS.NEXT));
    expect(onNextMock).toHaveBeenCalledOnce();
  });

  test('person 2 inputs are not rendered in single mode', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    expect(screen.queryByTestId(STEP1_IDS.P2_NAME)).toBeNull();
    expect(screen.queryByTestId(STEP1_IDS.P2_DOB)).toBeNull();
    expect(screen.queryByTestId(STEP1_IDS.P2_FI_AGE)).toBeNull();
  });
});

describe('Step1HouseholdSetup — couple mode', () => {
  const coupleBase = createDefaultState(57);

  beforeEach(() => {
    setModeMock.mockReset();
    setP2NameMock.mockReset();
    setP2DobMock.mockReset();
    setP2FiAgeMock.mockReset();
    onNextMock.mockReset();
    plannerState = {
      ...plannerState,
      ...coupleBase,
      mode: 'couple',
      fiAge: 60,
      p2FiAge: 62,
      setMode: setModeMock,
      setP1Name: setP1NameMock,
      setP1Dob: setP1DobMock,
      setP2Name: setP2NameMock,
      setP2Dob: setP2DobMock,
      setFiAge: setFiAgeMock,
      setP2FiAge: setP2FiAgeMock,
      updateAssumptions: updateAssumptionsMock,
      rlssStandard: undefined,
      applyRlssTemplate: vi.fn(),
    };
  });

  test('renders person 2 name and DOB inputs in couple mode', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    expect(screen.getByTestId(STEP1_IDS.P2_NAME)).toBeInTheDocument();
    expect(screen.getByTestId(STEP1_IDS.P2_DOB)).toBeInTheDocument();
  });

  test('person 2 name input calls setP2Name on change', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    const input = screen.getByTestId(STEP1_IDS.P2_NAME);
    fireEvent.change(input, { target: { value: 'Bob' } });
    expect(setP2NameMock).toHaveBeenCalledWith('Bob');
  });

  test('person 2 FI age slider is rendered in couple mode', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    expect(screen.getByTestId(STEP1_IDS.P2_FI_AGE)).toBeInTheDocument();
  });

  test('person 2 FI age slider calls setP2FiAge on change', () => {
    render(<Step1HouseholdSetup onNext={onNextMock} />);
    const slider = screen.getByTestId(STEP1_IDS.P2_FI_AGE);
    fireEvent.change(slider, { target: { value: '65' } });
    expect(setP2FiAgeMock).toHaveBeenCalledWith(65);
  });
});
