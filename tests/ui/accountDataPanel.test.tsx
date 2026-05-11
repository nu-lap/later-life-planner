import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AccountDataPanel from '@/components/AccountDataPanel';
import { ACCOUNT_IDS } from '@/lib/testIds';

const defaultProps = {
  saveStatus: 'saved' as const,
  lastSavedAt: null,
  revision: null,
  syncError: null,
  devices: [],
  onReloadRemote: vi.fn(),
  onExportPlan: vi.fn(),
  onImportPlan: vi.fn(),
  onRefreshDevices: vi.fn(),
  onApproveDevice: vi.fn(),
};

describe('AccountDataPanel', () => {
  test('renders export and import buttons with correct testids', () => {
    render(<AccountDataPanel {...defaultProps} />);
    expect(screen.getByTestId(ACCOUNT_IDS.EXPORT_PLAN)).toBeInTheDocument();
    expect(screen.getByTestId(ACCOUNT_IDS.IMPORT_PLAN)).toBeInTheDocument();
    expect(screen.getByTestId(ACCOUNT_IDS.IMPORT_INPUT)).toBeInTheDocument();
  });

  test('calls onExportPlan when export button is clicked', () => {
    const onExportPlan = vi.fn();
    render(<AccountDataPanel {...defaultProps} onExportPlan={onExportPlan} />);
    fireEvent.click(screen.getByTestId(ACCOUNT_IDS.EXPORT_PLAN));
    expect(onExportPlan).toHaveBeenCalledOnce();
  });

  test('calls onImportPlan with the selected file when file input changes', () => {
    const onImportPlan = vi.fn();
    render(<AccountDataPanel {...defaultProps} onImportPlan={onImportPlan} />);
    const file = new File(['{}'], 'plan.json', { type: 'application/json' });
    const input = screen.getByTestId(ACCOUNT_IDS.IMPORT_INPUT);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onImportPlan).toHaveBeenCalledWith(file);
  });

  test('does not call onImportPlan when file input is cleared', () => {
    const onImportPlan = vi.fn();
    render(<AccountDataPanel {...defaultProps} onImportPlan={onImportPlan} />);
    const input = screen.getByTestId(ACCOUNT_IDS.IMPORT_INPUT);
    fireEvent.change(input, { target: { files: [] } });
    expect(onImportPlan).not.toHaveBeenCalled();
  });

  test('shows sync error message when syncError is set', () => {
    render(<AccountDataPanel {...defaultProps} syncError="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  test('shows last saved timestamp when lastSavedAt is set', () => {
    render(<AccountDataPanel {...defaultProps} lastSavedAt="2026-01-15T10:30:00Z" />);
    expect(screen.queryByText('Not saved yet')).toBeNull();
  });

  test('shows no pending approvals message when devices is empty', () => {
    render(<AccountDataPanel {...defaultProps} devices={[]} />);
    expect(screen.getByText('No pending device approvals.')).toBeInTheDocument();
  });
});
