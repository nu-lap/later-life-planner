'use client';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  compact?: boolean;
  decimalScale?: number;
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
}: CurrencyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = decimalScale > 0
      ? e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
      : e.target.value.replace(/[^0-9]/g, '');
    const parsed = decimalScale > 0 ? parseFloat(raw) : parseInt(raw, 10);

    if (!isNaN(parsed)) {
      const normalized = decimalScale > 0
        ? Number(parsed.toFixed(decimalScale))
        : parsed;
      onChange(Math.min(max, Math.max(min, normalized)));
    } else if (raw === '') {
      onChange(0);
    }
  };

  const displayValue = value === 0
    ? ''
    : value.toLocaleString('en-GB', decimalScale > 0
      ? { minimumFractionDigits: decimalScale, maximumFractionDigits: decimalScale }
      : undefined);

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm pointer-events-none">
        £
      </span>
      <input
        type="text"
        inputMode={decimalScale > 0 ? 'decimal' : 'numeric'}
        value={displayValue}
        onChange={handleChange}
        placeholder="0"
        className={`input-base pl-7 ${compact ? 'py-1.5 text-sm w-28' : 'w-36'}`}
      />
    </div>
  );
}
