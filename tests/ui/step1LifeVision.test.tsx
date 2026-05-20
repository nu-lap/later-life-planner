import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';

// next/script is SSR-only and not needed in jsdom
vi.mock('next/script', () => ({ default: () => null }));

const setLifeVisionMock   = vi.fn();
const toggleAspirationMock = vi.fn();
const updateLifeStageMock  = vi.fn();
const updateAssumptionsMock = vi.fn();
const onNextMock  = vi.fn();
const onBackMock  = vi.fn();

const base = createDefaultState(57);

let plannerState: any = {
  ...base,
  setLifeVision:    setLifeVisionMock,
  toggleAspiration: toggleAspirationMock,
  updateLifeStage:  updateLifeStageMock,
  updateAssumptions: updateAssumptionsMock,
};

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

import Step1LifeVision from '@/components/steps/Step1LifeVision';

describe('Step1LifeVision — rendering', () => {
  beforeEach(() => {
    setLifeVisionMock.mockReset();
    toggleAspirationMock.mockReset();
    updateLifeStageMock.mockReset();
    onNextMock.mockReset();
    onBackMock.mockReset();
    plannerState = { ...base, setLifeVision: setLifeVisionMock, toggleAspiration: toggleAspirationMock, updateLifeStage: updateLifeStageMock, updateAssumptions: updateAssumptionsMock };
  });

  test('renders the Life Vision heading', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    expect(screen.getByText(/ideal life look like/i)).toBeInTheDocument();
  });

  test('renders life stage cards', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    expect(screen.getByText(/Your life stages/i)).toBeInTheDocument();
  });

  test('renders aspiration chips', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    expect(screen.getByText('Travel')).toBeInTheDocument();
    expect(screen.getByText('Hobbies')).toBeInTheDocument();
  });

  test('"Set spending goals" button calls onNext', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    fireEvent.click(screen.getByText(/Set spending goals/i));
    expect(onNextMock).toHaveBeenCalledTimes(1);
  });

  test('"Skip for now" button calls onNext', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    fireEvent.click(screen.getByText(/Skip for now/i));
    expect(onNextMock).toHaveBeenCalledTimes(1);
  });

  test('"Back" button calls onBack', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    fireEvent.click(screen.getByText(/← Back/i));
    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  test('clicking an aspiration chip calls toggleAspiration', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    fireEvent.click(screen.getByText('Travel'));
    expect(toggleAspirationMock).toHaveBeenCalledWith('travel');
  });

  test('typing in the life vision textarea calls setLifeVision', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    const textarea = screen.getByPlaceholderText(/I want to/i);
    fireEvent.change(textarea, { target: { value: 'Travel the world' } });
    expect(setLifeVisionMock).toHaveBeenCalledWith('Travel the world');
  });
});

describe('Step1LifeVision — life stage controls', () => {
  beforeEach(() => {
    updateLifeStageMock.mockReset();
    plannerState = { ...base, setLifeVision: setLifeVisionMock, toggleAspiration: toggleAspirationMock, updateLifeStage: updateLifeStageMock, updateAssumptions: updateAssumptionsMock };
  });

  test('clicking + on a non-last stage calls updateLifeStage', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[0]);
    expect(updateLifeStageMock).toHaveBeenCalled();
  });

  test('clicking − on a non-last stage calls updateLifeStage', () => {
    render(<Step1LifeVision onNext={onNextMock} onBack={onBackMock} />);
    const minusButtons = screen.getAllByText('−');
    fireEvent.click(minusButtons[0]);
    expect(updateLifeStageMock).toHaveBeenCalled();
  });
});
