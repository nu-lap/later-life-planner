/**
 * UI component tests — stateless / lightly-stateful primitives.
 * Runs in jsdom (configured via vitest.config.mjs environmentMatchGlobs).
 */

import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import Toggle       from '@/components/ui/Toggle';
import CurrencyInput from '@/components/ui/CurrencyInput';
import ConfirmModal from '@/components/ui/ConfirmModal';
import StepIndicator from '@/components/StepIndicator';
import DisclaimerGate from '@/components/DisclaimerGate';

// ─── Toggle ──────────────────────────────────────────────────────────────────

describe('Toggle', () => {
  test('renders without label when none provided', () => {
    render(<Toggle checked={false} onChange={vi.fn()} />);
    // No label element should be present with text
    expect(screen.queryByText(/.+/)).toBeNull();
  });

  test('renders label when provided', () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Enable feature" />);
    expect(screen.getByText('Enable feature')).toBeInTheDocument();
  });

  test('calls onChange(true) when unchecked and clicked', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle checked={false} onChange={onChange} />);
    // The clickable element is the inner div (the toggle track)
    const track = container.querySelector('div.rounded-full') as HTMLElement;
    fireEvent.click(track);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('calls onChange(false) when checked and clicked', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle checked={true} onChange={onChange} />);
    const track = container.querySelector('div.rounded-full') as HTMLElement;
    fireEvent.click(track);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  test('applies orange background when checked', () => {
    const { container } = render(<Toggle checked={true} onChange={vi.fn()} />);
    const track = container.querySelector('div.rounded-full') as HTMLElement;
    expect(track.className).toContain('bg-orange-500');
  });

  test('applies slate background when unchecked', () => {
    const { container } = render(<Toggle checked={false} onChange={vi.fn()} />);
    const track = container.querySelector('div.rounded-full') as HTMLElement;
    expect(track.className).toContain('bg-slate-300');
  });
});

// ─── CurrencyInput ───────────────────────────────────────────────────────────

describe('CurrencyInput', () => {
  test('renders £ prefix', () => {
    render(<CurrencyInput value={1000} onChange={vi.fn()} />);
    expect(screen.getByText('£')).toBeInTheDocument();
  });

  test('displays value formatted in en-GB locale', () => {
    render(<CurrencyInput value={12500} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('12,500');
  });

  test('displays empty string when value is 0', () => {
    render(<CurrencyInput value={0} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('');
  });

  test('calls onChange with parsed integer on valid input', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  test('strips non-numeric characters', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1,234' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1234);
  });

  test('calls onChange(0) on empty input', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={1000} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(0);
  });

  test('clamps value to max', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} max={10_000} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '50000' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(10_000);
  });

  test('clamps value to min', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} min={100} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(100);
  });

  test('supports pence values when decimalScale is enabled', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={221.2} onChange={onChange} decimalScale={2} />);
    const input = screen.getByRole('textbox');

    expect(input).toHaveValue('221.20');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '221.25' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(221.25);
  });

  test('keeps decimal draft text while typing instead of forcing trailing zeroes mid-entry', () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} decimalScale={2} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1' } });
    expect(input).toHaveValue('1');

    fireEvent.change(input, { target: { value: '123.99' } });
    expect(input).toHaveValue('123.99');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(123.99);
  });
});

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

describe('ConfirmModal', () => {
  test('renders title and message', () => {
    render(
      <ConfirmModal
        title="Delete item"
        message="Are you sure you want to delete this?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this?')).toBeInTheDocument();
  });

  test('has role=dialog with aria-modal', () => {
    render(
      <ConfirmModal title="Test" message="Test msg" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal title="Test" message="Test" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test('uses custom confirmLabel', () => {
    render(
      <ConfirmModal
        title="Test"
        message="Test"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  test('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal title="Test" message="Test" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('calls onCancel when Escape key pressed', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal title="Test" message="Test" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('calls onCancel when backdrop clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmModal title="Test" message="Test" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    // The backdrop is the absolute-positioned div inside the dialog
    const backdrop = container.querySelector('div.absolute') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// ─── StepIndicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Household', description: 'Who is this for?' },
  { label: 'Income',    description: 'Your income sources' },
  { label: 'Assets',   description: 'Your assets' },
  { label: 'Spending', description: 'Your spending' },
];

describe('StepIndicator', () => {
  test('renders all step labels', () => {
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={0}
        maxVisitedStep={0}
        onStepClick={vi.fn()}
      />,
    );
    // Labels are hidden on small screens with 'hidden sm:inline' — they're in the DOM
    expect(screen.getAllByText('Household').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Income').length).toBeGreaterThan(0);
  });

  test('active step button has orange background class', () => {
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={1}
        maxVisitedStep={1}
        onStepClick={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // Step 1 (index 1) is active
    expect(buttons[1].className).toContain('bg-orange-500');
  });

  test('done step shows checkmark ✓', () => {
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={2}
        maxVisitedStep={2}
        onStepClick={vi.fn()}
      />,
    );
    // Steps 0 and 1 are done (i < currentStep=2)
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toContain('✓');
    expect(buttons[1].textContent).toContain('✓');
  });

  test('locked step has disabled attribute', () => {
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={0}
        maxVisitedStep={1}
        onStepClick={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // Steps 2 and 3 are locked (i > maxVisitedStep=1)
    expect(buttons[2]).toBeDisabled();
    expect(buttons[3]).toBeDisabled();
  });

  test('locked step has aria-disabled attribute', () => {
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={0}
        maxVisitedStep={0}
        onStepClick={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // Steps 1, 2, 3 are locked
    expect(buttons[1]).toHaveAttribute('aria-disabled', 'true');
  });

  test('clicking an unlocked done step calls onStepClick with correct index', () => {
    const onStepClick = vi.fn();
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={2}
        maxVisitedStep={2}
        onStepClick={onStepClick}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // Step 0 is done, unlocked
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  test('clicking a locked step does not call onStepClick', () => {
    const onStepClick = vi.fn();
    render(
      <StepIndicator
        steps={STEPS}
        currentStep={0}
        maxVisitedStep={0}
        onStepClick={onStepClick}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[3]); // Step 3 is locked
    expect(onStepClick).not.toHaveBeenCalled();
  });
});

// ─── DisclaimerGate ──────────────────────────────────────────────────────────

describe('DisclaimerGate', () => {
  test('renders "Get started" button', () => {
    render(<DisclaimerGate onAccept={vi.fn()} />);
    expect(screen.getByText(/Get started/)).toBeInTheDocument();
  });

  test('"Get started" button is disabled before checkbox is checked', () => {
    render(<DisclaimerGate onAccept={vi.fn()} />);
    expect(screen.getByText(/Get started/)).toBeDisabled();
  });

  test('"Get started" button is enabled after checking the checkbox', () => {
    render(<DisclaimerGate onAccept={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByText(/Get started/)).not.toBeDisabled();
  });

  test('calls onAccept when button clicked after agreement', () => {
    const onAccept = vi.fn();
    render(<DisclaimerGate onAccept={onAccept} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText(/Get started/));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  test('does not call onAccept when button clicked while disabled', () => {
    const onAccept = vi.fn();
    render(<DisclaimerGate onAccept={onAccept} />);
    fireEvent.click(screen.getByText(/Get started/));
    expect(onAccept).not.toHaveBeenCalled();
  });

  test('renders disclaimer text about financial advice', () => {
    render(<DisclaimerGate onAccept={vi.fn()} />);
    // Multiple elements contain this phrase; confirm at least one is present
    expect(screen.getAllByText(/not regulated financial advice/i).length).toBeGreaterThan(0);
  });
});
