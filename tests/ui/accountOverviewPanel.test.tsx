import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AccountOverviewPanel from '@/components/account/AccountOverviewPanel';
import { ACCOUNT_IDS } from '@/lib/testIds';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const defaultProps = {
  saveStatus: 'saved' as const,
  lastSavedAt: null,
  revision: null,
  syncError: null,
  pendingApprovals: 0,
  onReloadRemote: vi.fn(),
  onExportPlan: vi.fn(),
  onImportPlan: vi.fn(),
};

describe('AccountOverviewPanel', () => {
  test('renders export and import buttons with correct testids', () => {
    render(<AccountOverviewPanel {...defaultProps} />);
    expect(screen.getByTestId(ACCOUNT_IDS.EXPORT_PLAN)).toBeInTheDocument();
    expect(screen.getByTestId(ACCOUNT_IDS.IMPORT_PLAN)).toBeInTheDocument();
    expect(screen.getByTestId(ACCOUNT_IDS.IMPORT_INPUT)).toBeInTheDocument();
  });

  test('calls onExportPlan when export button is clicked', () => {
    const onExportPlan = vi.fn();
    render(<AccountOverviewPanel {...defaultProps} onExportPlan={onExportPlan} />);
    fireEvent.click(screen.getByTestId(ACCOUNT_IDS.EXPORT_PLAN));
    expect(onExportPlan).toHaveBeenCalledOnce();
  });

  test('calls onImportPlan with the selected file when file input changes', () => {
    const onImportPlan = vi.fn();
    render(<AccountOverviewPanel {...defaultProps} onImportPlan={onImportPlan} />);
    const file = new File(['{}'], 'plan.json', { type: 'application/json' });
    const input = screen.getByTestId(ACCOUNT_IDS.IMPORT_INPUT);
    fireEvent.change(input, { target: { files: [file] } });
    expect(onImportPlan).toHaveBeenCalledWith(file);
  });

  test('does not call onImportPlan when file input is cleared', () => {
    const onImportPlan = vi.fn();
    render(<AccountOverviewPanel {...defaultProps} onImportPlan={onImportPlan} />);
    const input = screen.getByTestId(ACCOUNT_IDS.IMPORT_INPUT);
    fireEvent.change(input, { target: { files: [] } });
    expect(onImportPlan).not.toHaveBeenCalled();
  });

  test('shows sync error message when syncError is set', () => {
    render(<AccountOverviewPanel {...defaultProps} syncError="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  test('shows pending approvals badge when pendingApprovals > 0', () => {
    render(<AccountOverviewPanel {...defaultProps} pendingApprovals={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('shows last saved timestamp when lastSavedAt is set', () => {
    render(<AccountOverviewPanel {...defaultProps} lastSavedAt="2026-01-15T10:30:00Z" />);
    // formatTimestamp renders a locale string — just verify "Not saved yet" is absent
    expect(screen.queryByText('Not saved yet')).toBeNull();
  });

  test('reload remote button is disabled when syncError contains corrupted payload message', () => {
    render(
      <AccountOverviewPanel
        {...defaultProps}
        syncError="Saved plan data is corrupted or unreadable."
      />,
    );
    expect(screen.getByText('Reload remote')).toBeDisabled();
  });
});
