'use client';

import { useState, type ChangeEvent } from 'react';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  compact?: boolean;
  decimalScale?: number;
  ariaLabel?: string;
  'data-testid'?: string;
}

export default function CurrencyInput({
  value,
  onChange,
  min = 0,
  max = 999999,
  step = 100,
  className = '',
  compact = false,
  decimalScale = 0,
  ariaLabel,
  'data-testid': testId,
}: CurrencyInputProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null);

  const formatDisplayValue = (nextValue: number): string => (
    nextValue === 0
      ? ''
      : nextValue.toLocaleString('en-GB', decimalScale > 0
        ? { minimumFractionDigits: decimalScale, maximumFractionDigits: decimalScale }
        : undefined)
  );

  const formatDraftValue = (nextValue: number): string => {
    if (nextValue === 0) return '';
    return decimalScale > 0 ? nextValue.toFixed(decimalScale) : String(nextValue);
  };

  const commitValue = (rawInput: string) => {
    const raw = decimalScale > 0
      ? rawInput.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
      : rawInput.replace(/[^0-9]/g, '');
    const parsed = decimalScale > 0 ? parseFloat(raw) : parseInt(raw, 10);

    if (!isNaN(parsed)) {
      const normalized = decimalScale > 0
        ? Number(parsed.toFixed(decimalScale))
        : parsed;
      const clamped = Math.min(max, Math.max(min, normalized));
      if (clamped !== value) onChange(clamped);
    } else if (raw === '') {
      if (value !== 0) onChange(0);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = decimalScale > 0
      ? e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
      : e.target.value.replace(/[^0-9]/g, '');
    setDraftValue(raw);
  };

  const displayValue = draftValue ?? formatDisplayValue(value);

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm pointer-events-none">
        £
      </span>
      <input
        type="text"
        inputMode={decimalScale > 0 ? 'decimal' : 'numeric'}
        aria-label={ariaLabel}
        data-testid={testId}
        value={displayValue}
        onFocus={() => setDraftValue(formatDraftValue(value))}
        onChange={handleChange}
        onBlur={(event) => {
          commitValue(event.target.value);
          setDraftValue(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        placeholder="0"
        className={`input-base pl-7 ${compact ? 'py-1.5 text-sm w-28' : 'w-36'}`}
      />
    </div>
  );
}
