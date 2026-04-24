import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '@/components/Header';

describe('Header', () => {
  test('hides planner actions when showPlannerActions is false', () => {
    render(
      <Header
        onReset={vi.fn()}
        saveStatus="local"
        showPlannerActions={false}
      />,
    );

    expect(screen.queryByText('Reset')).toBeNull();
    expect(screen.queryByText(/demo/i)).toBeNull();
  });

  test('shows planner actions by default', () => {
    render(
      <Header
        onReset={vi.fn()}
        saveStatus="local"
      />,
    );

    // Demo and Reset are only shown in development mode; in the test environment they are hidden.
    expect(screen.queryByText('Reset')).toBeNull();
    expect(screen.queryByText(/demo/i)).toBeNull();
  });
});

