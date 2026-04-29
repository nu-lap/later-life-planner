'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import Toggle from '@/components/ui/Toggle';
import CurrencyInput from '@/components/ui/CurrencyInput';
import InfoIcon from '@/components/ui/InfoIcon';
import GuidedSetupWizard from '@/components/GuidedSetupWizard';
import { CGT, STATE_PENSION } from '@/config/financialConstants';
import { GLOSSARY } from '@/lib/glossary';
import type { PersonIncomeSources, PersonAssets, AssetOwner } from '@/lib/types';
import type { PrimaryResidenceAsset } from '@/models/types';
import clsx from 'clsx';

interface Props { onNext: () => void; onBack: () => void }

// ─── Primitives ───────────────────────────────────────────────────────────────

function FieldRow({ label, hint, children, labelExtra }: { label: string; hint?: React.ReactNode; children: React.ReactNode; labelExtra?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          {labelExtra}
        </div>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0 self-start sm:self-center">{children}</div>
    </div>
  );
}

function AgeStepper({ value, onChange, min, max, label }: {
  value: number; onChange: (v: number) => void; min: number; max: number; label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-slate-500">{label}</span>}
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Decrease age (current: ${value})`}
        className="w-11 h-11 rounded-xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg leading-none flex items-center justify-center transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
      >−</button>
      <span className="w-10 text-center font-black text-slate-800 tabular-nums text-sm">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase age (current: ${value})`}
        className="w-11 h-11 rounded-xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg leading-none flex items-center justify-center transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
      >+</button>
    </div>
  );
}

function PctInput({
  value,
  onChange,
  label,
  max = 15,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-slate-500">{label}</span>}
      <div className="relative">
        <input type="number" min={0} max={max} step={0.5} value={value}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
          className="w-24 input-base text-center py-1.5 text-sm pr-8" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
      </div>
    </div>
  );
}

function OwnerSelect({ value, onChange, mode, p1Label, p2Label }: {
  value: AssetOwner; onChange: (v: AssetOwner) => void; mode: 'single' | 'couple';
  p1Label: string; p2Label: string;
}) {
  if (mode === 'single') return null;
  const opts: { v: AssetOwner; label: string }[] = [
    { v: 'p1',    label: p1Label },
    { v: 'p2',    label: p2Label },
    { v: 'joint', label: 'Joint' },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={clsx('px-2.5 py-1 rounded-lg text-xs font-bold border transition-all',
            value === o.v ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({ icon, title, desc, enabled, onToggle, toggleAriaLabel, children }: {
  icon: string; title: string; desc: string;
  enabled: boolean; onToggle: (v: boolean) => void;
  toggleAriaLabel?: string;
  children?: React.ReactNode;
}) {
  const effectiveToggleAriaLabel = toggleAriaLabel ?? `Enable ${title}`;
  return (
    <div className={clsx('rounded-2xl border-2 overflow-hidden transition-all',
      enabled ? 'border-orange-200 bg-white' : 'border-slate-200 bg-slate-50/50'
    )}>
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5 flex-shrink-0">{icon}</span>
          <div>
            <p className={clsx('font-bold text-sm', enabled ? 'text-slate-800' : 'text-slate-500')}>{title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
          </div>
        </div>
        <Toggle checked={enabled} onChange={onToggle} ariaLabel={effectiveToggleAriaLabel} />
      </div>
      {enabled && children && (
        <div className="border-t border-orange-100 px-4 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Priority group ───────────────────────────────────────────────────────────

function PriorityGroup({ number, title, subtitle, badge, badgeClass, children }: {
  number: number; title: string; subtitle: string;
  badge?: string; badgeClass?: string; children: React.ReactNode;
}) {
  return (
    <div className="game-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-slate-800 text-white text-sm font-black flex items-center justify-center flex-shrink-0">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <h3 className="font-black text-slate-800 text-base">{title}</h3>
            {badge && (
              <span className={clsx('text-xs font-bold px-2.5 py-0.5 rounded-full', badgeClass)}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── Income section ───────────────────────────────────────────────────────────

function IncomeSection({ currentAge, fiAge, lifeExpectancy, src, assets, set }: {
  currentAge: number;
  fiAge: number;
  lifeExpectancy: number;
  src: PersonIncomeSources;
  assets: PersonAssets;
  set: (key: keyof PersonIncomeSources, u: Record<string, unknown>) => void;
}) {
  const hasRentalProperty = assets.property.enabled && assets.property.annualRent > 0;
  const annuity = src.annuity ?? { enabled: false, annualIncome: 0, startAge: 65 };

  return (
    <div className="space-y-4">
      <PriorityGroup number={1} title="Guaranteed & Secure Income"
        subtitle="Fill your personal allowance first — lowest tax drag"
      >
        <SourceCard icon="🏢" title="DB / Final Salary Pension"
          desc="Guaranteed income from an employer scheme — indexed to inflation"
          enabled={src.dbPension.enabled} onToggle={(v) => set('dbPension', { enabled: v })}
        >
          <FieldRow label="Annual income (in today's money)">
            <CurrencyInput value={src.dbPension.annualIncome} onChange={(v) => set('dbPension', { annualIncome: v })} max={100000} step={100} />
          </FieldRow>
          <FieldRow label="Start age">
            <AgeStepper value={src.dbPension.startAge} onChange={(v) => set('dbPension', { startAge: v })} min={55} max={75} />
          </FieldRow>
        </SourceCard>

        <SourceCard icon="📜" title="Annuity"
          desc="Purchased annuity — inflation-linked guaranteed income for life (level/fixed annuity coming soon)"
          enabled={annuity.enabled} onToggle={(v) => set('annuity', { enabled: v })}
        >
          <FieldRow label="Annual income">
            <CurrencyInput value={annuity.annualIncome} onChange={(v) => set('annuity', { annualIncome: v })} max={100000} step={100} />
          </FieldRow>
          <FieldRow label="Starts at age">
            <AgeStepper value={annuity.startAge} onChange={(v) => set('annuity', { startAge: v })} min={55} max={85} />
          </FieldRow>
          <div className="py-2 text-xs text-sky-700 bg-sky-50 rounded-xl px-3">
            Annuity income is taxable and modelled as inflation-linked alongside DB pension and State Pension. Level (fixed) annuity support is coming soon.
          </div>
        </SourceCard>

        <SourceCard icon="🏛️" title="State Pension"
          desc={`UK new State Pension — up to £${STATE_PENSION.FULL_NEW_WEEKLY.toFixed(2)}/week`}
          enabled={src.statePension.enabled} onToggle={(v) => set('statePension', { enabled: v })}
        >
          <FieldRow label="Weekly amount" hint={<>Check your forecast at{' '}<a href="https://www.gov.uk/check-state-pension" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">gov.uk/check-state-pension</a></>}>
            <CurrencyInput value={src.statePension.weeklyAmount} onChange={(v) => set('statePension', { weeklyAmount: v })} max={300} step={0.01} decimalScale={2} />
          </FieldRow>
          <FieldRow
            label="Start age"
            hint={`Statutory minimum is ${STATE_PENSION.CURRENT_MIN_AGE}, rising to ${STATE_PENSION.DEFAULT_AGE} by ${STATE_PENSION.RISE_TO_67_BY_YEAR}`}
          >
            <AgeStepper
              value={src.statePension.startAge}
              onChange={(v) => set('statePension', { startAge: v })}
              min={STATE_PENSION.CURRENT_MIN_AGE}
              max={75}
            />
          </FieldRow>
          <div className="py-2 text-xs text-sky-700 bg-sky-50 rounded-xl px-3">
            Annual: <strong>£{(src.statePension.weeklyAmount * 52).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> · Indexed to inflation
          </div>
        </SourceCard>
      </PriorityGroup>

      <PriorityGroup number={2} title="Property Income"
        subtitle="Rental income — taxed as income in your personal assessment"
        badge="Taxed as income" badgeClass="bg-amber-100 text-amber-700"
      >
        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🏘️</span>
            <div>
              {hasRentalProperty ? (
                <>
                  <p className="font-bold text-slate-800 text-sm">Rental property configured</p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Annual net rent: <span className="font-bold text-emerald-600">£{assets.property.annualRent.toLocaleString('en-GB')}/yr</span>{' '}
                    for {assets.property.durationYears} year{assets.property.durationYears !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Property details are in the Assets tab below.</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-800 text-sm">No rental income configured</p>
                  <p className="text-xs text-slate-400 mt-0.5">Enable a property in the <strong>Assets tab</strong> and set annual rental income.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </PriorityGroup>

      <PriorityGroup number={3} title="Flexible Income"
        subtitle="DC pension, work and other sources — drawn after guaranteed income"
      >
        <SourceCard icon="💼" title="DC / Personal Pension"
          desc="Workplace or personal pension pot — flexible drawdown"
          enabled={src.dcPension.enabled} onToggle={(v) => set('dcPension', { enabled: v })}
        >
          <FieldRow label="Current pot value">
            <CurrencyInput value={src.dcPension.totalValue} onChange={(v) => set('dcPension', { totalValue: v })} max={2000000} step={1000} />
          </FieldRow>
          <FieldRow label="Annual growth rate">
            <PctInput value={src.dcPension.growthRate} onChange={(v) => set('dcPension', { growthRate: v })} />
          </FieldRow>
          <FieldRow
            label="Workplace salary"
            hint="Used only to project workplace pension contributions before your FI age."
          >
            <CurrencyInput
              value={src.dcPension.workplaceSalary ?? 0}
              onChange={(v) => set('dcPension', { workplaceSalary: v })}
              max={500000}
              step={1000}
            />
          </FieldRow>
          <FieldRow
            label="Workplace pension contribution"
            hint="Fixed % of salary added each year until FI age. Salary is assumed to rise with inflation."
          >
            <PctInput
              value={src.dcPension.workplaceContributionPercent ?? 0}
              onChange={(v) => set('dcPension', { workplaceContributionPercent: v })}
              max={50}
            />
          </FieldRow>
          <FieldRow
            label="SIPP contribution (gross / year)"
            hint="Gross annual amount before basic-rate tax relief, increased with inflation until FI age."
            labelExtra={<InfoIcon term="SIPP" tooltip={GLOSSARY.SIPP} />}
          >
            <CurrencyInput
              value={src.dcPension.sippContributionAnnualGross ?? 0}
              onChange={(v) => set('dcPension', { sippContributionAnnualGross: v })}
              max={200000}
              step={500}
            />
          </FieldRow>
          <FieldRow label="Drawdown starts">
            <span className="text-sm font-bold text-orange-600">Age {fiAge} <span className="font-normal text-slate-400">(your financial independence age)</span></span>
          </FieldRow>
          <div className="py-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3">
            Each withdrawal is 25% tax-free and 75% taxable income. The full pot stays invested until needed. Workplace and SIPP contributions are projected only until FI age.
          </div>
        </SourceCard>

        <SourceCard icon="💻" title="Work / Consultancy"
          desc="Part-time work, freelance or self-employment"
          enabled={src.partTimeWork.enabled} onToggle={(v) => set('partTimeWork', { enabled: v })}
        >
          <FieldRow label="Annual income">
            <CurrencyInput value={src.partTimeWork.annualIncome} onChange={(v) => set('partTimeWork', { annualIncome: v })} max={150000} step={500} />
          </FieldRow>
          <FieldRow label="Work optional from age">
            <AgeStepper value={src.partTimeWork.stopAge} onChange={(v) => set('partTimeWork', { stopAge: v })} min={currentAge + 1} max={80} />
          </FieldRow>
        </SourceCard>

        <SourceCard icon="💸" title="Other Income"
          desc="Trust income, regular gift, or any other stream"
          enabled={src.otherIncome.enabled} onToggle={(v) => set('otherIncome', { enabled: v })}
        >
          <FieldRow label="Description">
            <input type="text" value={src.otherIncome.description}
              onChange={(e) => set('otherIncome', { description: e.target.value })}
              placeholder="e.g. Trust income" className="input-base py-1.5 text-sm w-44" />
          </FieldRow>
          <FieldRow label="Annual amount">
            <CurrencyInput value={src.otherIncome.annualAmount} onChange={(v) => set('otherIncome', { annualAmount: v })} max={200000} step={500} />
          </FieldRow>
          <FieldRow label="From age">
            <AgeStepper
              value={src.otherIncome.startAge}
              onChange={(v) => {
                const newStart = v;
                const updates: Record<string, unknown> = { startAge: newStart };
                // If stopAge is set and now <= newStart, push it forward
                if (src.otherIncome.stopAge > 0 && src.otherIncome.stopAge <= newStart) {
                  updates.stopAge = Math.min(newStart + 1, lifeExpectancy);
                }
                set('otherIncome', updates);
              }}
              min={currentAge}
              max={lifeExpectancy - 1}
            />
          </FieldRow>
          <FieldRow label="To age">
            <div className="flex items-center gap-3">
              {src.otherIncome.stopAge > 0 ? (
                <AgeStepper
                  value={src.otherIncome.stopAge}
                  onChange={(v) => set('otherIncome', { stopAge: v })}
                  min={src.otherIncome.startAge + 1}
                  max={lifeExpectancy}
                />
              ) : (
                <span className="text-sm text-slate-500 italic">Indefinite</span>
              )}
              <button
                type="button"
                onClick={() => set('otherIncome', {
                  stopAge: src.otherIncome.stopAge > 0 ? 0 : Math.min(src.otherIncome.startAge + 5, lifeExpectancy),
                })}
                className="text-xs text-slate-400 hover:text-orange-500 underline transition-colors"
              >
                {src.otherIncome.stopAge > 0 ? 'Set indefinite' : 'Set end age'}
              </button>
            </div>
          </FieldRow>
        </SourceCard>
      </PriorityGroup>
    </div>
  );
}

// ─── Assets section ───────────────────────────────────────────────────────────

function AssetsSection({ assets, set, mode, p1Label, p2Label, sharedGia, onSharedGiaChange, primaryResidence, setPrimaryResidence }: {
  assets: PersonAssets;
  set: (key: keyof PersonAssets, u: Record<string, unknown>) => void;
  mode: 'single' | 'couple';
  p1Label: string; p2Label: string;
  sharedGia: import('@/models/types').GIAAsset;
  onSharedGiaChange: (updates: Partial<import('@/models/types').GIAAsset>) => void;
  primaryResidence: PrimaryResidenceAsset;
  setPrimaryResidence: (updates: Partial<PrimaryResidenceAsset>) => void;
}) {
  const { cashSavings, isaInvestments, generalInvestments, property } = assets;
  const giaGain      = generalInvestments.enabled ? Math.max(0, generalInvestments.totalValue - generalInvestments.baseCost) : 0;
  const jointGiaGain = sharedGia.enabled ? Math.max(0, sharedGia.totalValue - sharedGia.baseCost) : 0;
  const propGain     = property.enabled  ? Math.max(0, property.propertyValue - property.baseCost) : 0;

  return (
    <div className="space-y-4">
      <SourceCard icon="💵" title="Cash Savings"
        desc="Current accounts, savings accounts, Premium Bonds"
        enabled={cashSavings.enabled} onToggle={(v) => set('cashSavings', { enabled: v })}
      >
        <FieldRow label="Total cash savings">
          <CurrencyInput value={cashSavings.totalValue} onChange={(v) => set('cashSavings', { totalValue: v })} max={500000} step={1000} />
        </FieldRow>
      </SourceCard>

      <SourceCard icon="📈" title="ISA & Investments"
        desc="Stocks & Shares ISA — withdrawals are completely tax-free"
        enabled={isaInvestments.enabled} onToggle={(v) => set('isaInvestments', { enabled: v })}
      >
        <FieldRow label="Total ISA value">
          <CurrencyInput value={isaInvestments.totalValue} onChange={(v) => set('isaInvestments', { totalValue: v })} max={2000000} step={1000} />
        </FieldRow>
        <FieldRow label="Annual growth rate">
          <PctInput value={isaInvestments.growthRate} onChange={(v) => set('isaInvestments', { growthRate: v })} />
        </FieldRow>
        <div className="py-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3">
          Completely tax-free on withdrawal — no income tax, no CGT, no impact on personal allowance.
        </div>
      </SourceCard>

      {/* Individual GIA */}
      <SourceCard icon="📊" title="GIA — Individual"
        desc="Shares, funds or bonds held in your own name"
        enabled={generalInvestments.enabled} onToggle={(v) => set('generalInvestments', { enabled: v })}
      >
        <FieldRow label="Current market value">
          <CurrencyInput value={generalInvestments.totalValue} onChange={(v) => set('generalInvestments', { totalValue: v })} max={2000000} step={1000} />
        </FieldRow>
        <FieldRow label="Purchase price / base cost" hint="Original cost — for CGT calculation" labelExtra={<InfoIcon term="CGT" tooltip={GLOSSARY.CGT} />}>
          <CurrencyInput value={generalInvestments.baseCost} onChange={(v) => set('generalInvestments', { baseCost: v })} max={2000000} step={1000} />
        </FieldRow>
        <FieldRow label="Annual growth rate">
          <PctInput value={generalInvestments.growthRate} onChange={(v) => set('generalInvestments', { growthRate: v })} />
        </FieldRow>
        {giaGain > 0 && (
          <div className="py-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3">
            Unrealised gain: <strong>£{giaGain.toLocaleString('en-GB')}</strong> · CGT applies on gains above the £{CGT.ANNUAL_EXEMPT.toLocaleString('en-GB')} annual exempt amount.
          </div>
        )}
      </SourceCard>

      {/* Joint GIA — shared between both persons, editable from either tab */}
      {mode === 'couple' && (
        <SourceCard icon="🤝" title="GIA — Joint"
          desc={`Jointly-held investments — gains split 50/50 between ${p1Label} & ${p2Label} for CGT`}
          enabled={sharedGia.enabled} onToggle={(v) => onSharedGiaChange({ enabled: v })}
        >
          <FieldRow label="Current market value">
            <CurrencyInput value={sharedGia.totalValue} onChange={(v) => onSharedGiaChange({ totalValue: v })} max={2000000} step={1000} />
          </FieldRow>
          <FieldRow label="Purchase price / base cost" hint="Original cost — for CGT calculation" labelExtra={<InfoIcon term="CGT" tooltip={GLOSSARY.CGT} />}>
            <CurrencyInput value={sharedGia.baseCost} onChange={(v) => onSharedGiaChange({ baseCost: v })} max={2000000} step={1000} />
          </FieldRow>
          <FieldRow label="Annual growth rate">
            <PctInput value={sharedGia.growthRate} onChange={(v) => onSharedGiaChange({ growthRate: v })} />
          </FieldRow>
          {jointGiaGain > 0 && (
            <div className="py-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3">
              Unrealised gain: <strong>£{jointGiaGain.toLocaleString('en-GB')}</strong> · Gains split equally across both persons&apos; CGT allowances.
            </div>
          )}
        </SourceCard>
      )}

      <SourceCard icon="🏘️" title="Rental Property"
        desc="Capture property value for CGT planning and rental income for projections"
        enabled={property.enabled} onToggle={(v) => set('property', { enabled: v })}
      >
        <FieldRow label="Current property value">
          <CurrencyInput value={property.propertyValue} onChange={(v) => set('property', { propertyValue: v })} max={5000000} step={5000} />
        </FieldRow>
        <FieldRow label="Purchase price / base cost" hint="For CGT planning" labelExtra={<InfoIcon term="CGT" tooltip={GLOSSARY.CGT} />}>
          <CurrencyInput value={property.baseCost} onChange={(v) => set('property', { baseCost: v })} max={5000000} step={5000} />
        </FieldRow>
        <FieldRow label="Annual net rental income" hint="After allowable expenses">
          <CurrencyInput value={property.annualRent} onChange={(v) => set('property', { annualRent: v })} max={100000} step={500} />
        </FieldRow>
        {mode === 'couple' && (
          <FieldRow label="Ownership">
            <OwnerSelect value={property.owner ?? 'p1'} onChange={(v) => set('property', { owner: v })} mode={mode} p1Label={p1Label} p2Label={p2Label} />
          </FieldRow>
        )}
        {property.annualRent > 0 && (
          <FieldRow label="Duration (years from now)">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={50} value={property.durationYears}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) set('property', { durationYears: Math.min(50, Math.max(1, v)) }); }}
                className="w-20 input-base text-center py-1.5 text-sm" />
              <span className="text-sm text-slate-500">years</span>
            </div>
          </FieldRow>
        )}
        {propGain > 0 && (
          <div className="py-2 text-xs text-sky-700 bg-sky-50 rounded-xl px-3">
            Unrealised gain: <strong>£{propGain.toLocaleString('en-GB')}</strong> · Base cost captured for future CGT planning.
          </div>
        )}
      </SourceCard>

      <SourceCard icon="🏠" title="Primary Residence"
        desc="Your main home — already part of your estate for Inheritance Tax"
        enabled={primaryResidence.enabled} onToggle={(v) => setPrimaryResidence({ enabled: v })}
        toggleAriaLabel="Primary residence enabled"
      >
        <FieldRow label="Estimated current value">
          <CurrencyInput value={primaryResidence.currentValue} onChange={(v) => setPrimaryResidence({ currentValue: v })} max={5000000} step={5000} ariaLabel="Primary residence current market value" />
        </FieldRow>
        <FieldRow label="Outstanding mortgage" hint="Reduces net estate value">
          <CurrencyInput value={primaryResidence.mortgageOutstanding} onChange={(v) => setPrimaryResidence({ mortgageOutstanding: v })} max={2000000} step={5000} ariaLabel="Primary residence outstanding mortgage" />
        </FieldRow>
        <FieldRow label="Passes to direct descendants?">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={primaryResidence.leavesToDescendants}
              onChange={(e) => setPrimaryResidence({ leavesToDescendants: e.target.checked })}
              className="w-4 h-4 rounded accent-emerald-500"
              aria-label="Passes to direct descendants"
            />
            <span className="text-sm text-slate-600">Yes — required to claim the <span className="inline-flex items-center gap-0.5">Residence Nil-Rate Band <InfoIcon term="RNRB" tooltip={GLOSSARY.RNRB} /></span></span>
          </label>
        </FieldRow>
        {primaryResidence.enabled && primaryResidence.currentValue > 0 && (
          <div className="py-2 text-xs text-violet-700 bg-violet-50 rounded-xl px-3">
            Net estate value: <strong>£{Math.max(0, primaryResidence.currentValue - primaryResidence.mortgageOutstanding).toLocaleString('en-GB')}</strong>
            {' '}· No CGT on your main home (Principal Private Residence relief).
          </div>
        )}
      </SourceCard>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Step3IncomeSources({ onNext, onBack }: Props) {
  const {
    mode, fiAge,
    person1, setP1Income, setP1Asset,
    person2, setP2Income, setP2Asset,
    jointGia, setJointGia,
    primaryResidence, setPrimaryResidence,
    assumptions, updateAssumptions,
  } = usePlannerStore();

  const [activePerson, setActivePerson] = useState<'person1' | 'person2'>('person1');
  const [activeTab, setActiveTab]       = useState<'income' | 'assets'>('income');
  const [showGuided, setShowGuided]     = useState(false);

  const p1Label = person1.name || 'You';
  const p2Label = person2.name || 'Partner';

  const isPerson1 = mode === 'single' || activePerson === 'person1';
  const person    = isPerson1 ? person1 : person2;
  const setIncome = isPerson1 ? setP1Income : setP2Income;
  const setAsset  = isPerson1 ? setP1Asset  : setP2Asset;

  return (
    <div className="space-y-5 pb-24">

      {/* Hero */}
      <div className="text-center pt-4 pb-2">
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-bold px-4 py-1.5 rounded-full mb-3">
          💷 Step 4 of 5 — Income & Assets
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2 tracking-tight">
          Where will the{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">money come from?</span>
        </h2>
        <p className="text-slate-500">Capture all income streams and assets. Guaranteed sources first.</p>
      </div>

      {/* Guided setup entry point */}
      {!showGuided ? (
        <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">✨</span>
            <div>
              <p className="font-bold text-slate-800 text-sm">First time here?</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Use our guided setup to add your pensions, ISAs and savings step by step.
                {mode === 'couple' && ' We\'ll go through each person in turn.'}
              </p>
            </div>
          </div>
          <button onClick={() => setShowGuided(true)} className="btn-primary text-sm flex-shrink-0 whitespace-nowrap">
            Get started →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <GuidedSetupWizard onDone={() => setShowGuided(false)} />
          <button onClick={() => setShowGuided(false)} className="text-xs text-slate-400 hover:text-slate-600 w-full text-center">
            Cancel and enter manually instead
          </button>
        </div>
      )}

      {/* Person selector (couple only) */}
      {mode === 'couple' && (
        <div className="flex gap-2">
          {(['person1', 'person2'] as const).map((p) => {
            const label  = p === 'person1' ? p1Label : p2Label;
            const active = activePerson === p;
            const color  = p === 'person1' ? { on: 'bg-orange-500 border-orange-500 text-white', off: 'bg-white border-slate-200 text-slate-600 hover:border-slate-300' }
                                           : { on: 'bg-emerald-500 border-emerald-500 text-white', off: 'bg-white border-slate-200 text-slate-600 hover:border-slate-300' };
            return (
              <button key={p} onClick={() => { setActivePerson(p); setActiveTab('income'); }}
                className={clsx('flex-1 py-2.5 px-4 rounded-2xl border-2 font-semibold text-sm transition-all', active ? color.on : color.off)}
              >
                {p === 'person1' ? '👤' : '👥'} {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Income / Assets switcher */}
      <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
        {(['income', 'assets'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={clsx('flex-1 py-2.5 rounded-xl font-bold text-sm transition-all',
              activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab === 'income' ? '💷 Income' : '🏦 Assets'}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'income' ? (
        <IncomeSection currentAge={person.currentAge} fiAge={fiAge} lifeExpectancy={assumptions.lifeExpectancy} src={person.incomeSources} assets={person.assets} set={setIncome} />
      ) : (
        <AssetsSection
          assets={person.assets} set={setAsset} mode={mode}
          p1Label={p1Label} p2Label={p2Label}
          sharedGia={jointGia}
          onSharedGiaChange={setJointGia}
          primaryResidence={primaryResidence}
          setPrimaryResidence={setPrimaryResidence}
        />
      )}

      {/* Assumptions */}
      <div className="game-card bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200">
        <h3 className="section-heading">Model assumptions</h3>
        <p className="text-xs text-slate-500 mb-4">Applied to all projections. Defaults are UK long-run averages.</p>
        <div className="grid sm:grid-cols-2 sm:gap-x-8">
          <FieldRow label="Investment growth" hint="Expected annual return on investments">
            <PctInput value={assumptions.investmentGrowth} onChange={(v) => updateAssumptions({ investmentGrowth: v })} />
          </FieldRow>
          <FieldRow label="Inflation" hint="Applied to future spending and indexed income">
            <PctInput value={assumptions.inflation} onChange={(v) => updateAssumptions({ inflation: v })} />
          </FieldRow>
        </div>

        {/* State Pension sole-income exemption — UI-hidden, code-controlled via assumptions.statePensionSoleIncomeExempt */}
        <div className="border-t border-slate-200 mt-3 pt-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            In the 2024 Autumn Budget the UK government confirmed that people whose only income is the State Pension
            will not pay income tax on it. This plan reflects that commitment.
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <button onClick={onNext} className="btn-primary px-10 text-base">See my dashboard →</button>
      </div>
    </div>
  );
}
