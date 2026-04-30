import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { paulAndLisaState } from '../fixtures/states';
import { calculateProjections } from '@/lib/calculations';
import IHTOutlookPanel from '@/components/IHTOutlookPanel';
import { GLOSSARY } from '@/lib/glossary';

// Render IHTOutlookPanel in isolation to avoid dashboard composition dependencies
vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => paulAndLisaState(),
}));

test('opens RNRB glossary tooltip when info icon clicked', async () => {
  const state = paulAndLisaState();
  const projections = calculateProjections(state);

  render(<IHTOutlookPanel state={state} projections={projections} />);

  const infoButton = screen.getByTestId('rnrb-info');
  expect(infoButton).toHaveAttribute('aria-haspopup', 'dialog');

  fireEvent.click(infoButton);

  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toBeInTheDocument();
  expect(tooltip).toHaveTextContent(GLOSSARY.RNRB);
});
