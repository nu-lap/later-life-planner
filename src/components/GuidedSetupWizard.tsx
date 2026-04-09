'use client';

import { useState, useEffect, useRef } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { DEFAULT_ASSUMPTIONS, STATE_PENSION } from '@/config/financialConstants';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetOwner = 'p1' | 'p2' | 'joint';

type DbEntry  = { annualIncome: number; startAge: number };
type DcEntry  = { value: number; growthRate: number };
type IsaEntry = { value: number; growthRate: number };
type GiaEntry = { value: number; baseCost: number; growthRate: number };
type DcContributionDraft = {
  workplaceSalary: number;
  workplaceContributionPercent: number;
  sippContributionAnnualGross: number;
};

type PropertyDraft = {
  enabled: boolean;
  propertyValue: number;
  baseCost: number;
  annualRent: number;
  durationYears: number;
  owner: AssetOwner;
};

type PersonDraft = {
  statePension: { enabled: boolean; weeklyAmount: number; startAge: number };
  dbPensions:   DbEntry[];
  annuity:      { enabled: boolean; annualIncome: number; startAge: number };
  otherIncome:  { enabled: boolean; annualAmount: number; startAge: number };
  dcPensions:   DcEntry[];
  dcContribution: DcContributionDraft;
  isas:         IsaEntry[];
  gias:         GiaEntry[];
  cashSavings:  number;
  property:     PropertyDraft;
};

type JointDraft = {
  gia:      { enabled: boolean; totalValue: number; baseCost: number; growthRate: number };
  property: PropertyDraft;
};

function emptyDraft(): PersonDraft {
  return {
    statePension: { enabled: true, weeklyAmount: STATE_PENSION.FULL_NEW_WEEKLY, startAge: STATE_PENSION.DEFAULT_AGE },
    dbPensions:   [],
    annuity:      { enabled: false, annualIncome: 0, startAge: 65 },
    otherIncome:  { enabled: false, annualAmount: 0, startAge: 65 },
    dcPensions:   [],
    dcContribution: { workplaceSalary: 0, workplaceContributionPercent: 0, sippContributionAnnualGross: 0 },
    isas:         [],
    gias:         [],
    cashSavings:  0,
    property:     { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 20, owner: 'p1' },
  };
}

function emptyJoint(): JointDraft {
  return {
    gia:      { enabled: false, totalValue: 0, baseCost: 0, growthRate: DEFAULT_ASSUMPTIONS.INVESTMENT_GROWTH },
    property: { enabled: false, propertyValue: 0, baseCost: 0, annualRent: 0, durationYears: 20, owner: 'joint' },
  };
}

// ─── Step definitions ─────────────────────────────────────────────────────────

type PersonStepId = 'sp' | 'db' | 'annuity' | 'other' | 'dc' | 'isa' | 'gia' | 'cash' | 'property';
type JointStepId  = 'joint-gia' | 'joint-property';
type StepId = PersonStepId | JointStepId;

const INCOME_STEPS: PersonStepId[] = ['sp', 'db', 'annuity', 'other'];
const ASSET_STEPS:  PersonStepId[] = ['dc', 'isa', 'gia', 'cash', 'property'];
const JOINT_STEPS:  JointStepId[]  = ['joint-gia', 'joint-property'];

const STEP_META: Record<StepId, { icon: string; title: string; desc: string; section: string }> = {
  sp:             { icon: '🏛️', title: 'State Pension',                  desc: 'UK new State Pension',                     section: 'Income' },
  db:             { icon: '🏢', title: 'DB / Final salary pension',       desc: 'Guaranteed employer scheme',               section: 'Income' },
  annuity:        { icon: '📜', title: 'Annuity',                         desc: 'Guaranteed income for life',               section: 'Income' },
  other:          { icon: '💸', title: 'Other regular income',            desc: 'Trust, gift, or other stream',             section: 'Income' },
  dc:             { icon: '💼', title: 'DC / Personal pension pot(s)',     desc: 'Workplace pension, SIPP',                  section: 'Savings & Investments' },
  isa:            { icon: '📈', title: 'ISA(s)',                           desc: 'Stocks & Shares or Cash ISA',              section: 'Savings & Investments' },
  gia:            { icon: '📊', title: 'General investment account(s)',    desc: 'Shares or funds outside an ISA',           section: 'Savings & Investments' },
  cash:           { icon: '💵', title: 'Cash savings',                    desc: 'Savings accounts, Premium Bonds',          section: 'Savings & Investments' },
  property:       { icon: '🏘️', title: 'Rental property',                 desc: 'Property value & rental income',           section: 'Savings & Investments' },
  'joint-gia':    { icon: '🤝', title: 'Joint investment account',        desc: 'GIA held in both names',                   section: 'Joint' },
  'joint-property': { icon: '🏠', title: 'Joint property',               desc: 'Property held in both names',              section: 'Joint' },
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function AgeStepper({ value, onChange, min = 55, max = 85 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-bold text-xl flex items-center justify-center transition-colors">−</button>
      <span className="w-12 text-center font-black text-slate-800 text-lg tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-bold text-xl flex items-center justify-center transition-colors">+</button>
    </div>
  );
}

function GrowthStepper({
  value,
  onChange,
  max = 15,
  step = 0.5,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(0, Math.round((value - step) * 10) / 10))} disabled={value <= 0}
        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-bold text-xl flex items-center justify-center transition-colors">−</button>
      <span className="w-14 text-center font-black text-slate-800 text-lg tabular-nums">{value}%</span>
      <button type="button" onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))} disabled={value >= max}
        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-bold text-xl flex items-center justify-center transition-colors">+</button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

function ItemCard({ children, onRemove, title }: { children: React.ReactNode; onRemove?: () => void; title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-600">{title}</span>
        {onRemove && <button onClick={onRemove} className="text-xs text-rose-400 hover:text-rose-600 font-semibold">Remove</button>}
      </div>
      {children}
    </div>
  );
}

function YesNoToggle({ value, onChange, yesLabel = 'Yes', noLabel = 'No' }: {
  value: boolean; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string;
}) {
  return (
    <div className="flex gap-3">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={clsx('flex-1 py-3 rounded-2xl border-2 font-bold text-sm transition-all',
            value === v ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500 hover:border-orange-200'
          )}>
          {v ? yesLabel : noLabel}
        </button>
      ))}
    </div>
  );
}

// ─── Property form (reused for individual + joint) ────────────────────────────

function PropertyForm({ draft, onChange, showOwner, p1Label, p2Label }: {
  draft: PropertyDraft;
  onChange: (d: PropertyDraft) => void;
  showOwner: boolean;
  p1Label: string;
  p2Label: string;
}) {
  const upd = (p: Partial<PropertyDraft>) => onChange({ ...draft, ...p });
  const ownerOpts: { v: AssetOwner; label: string }[] = [
    { v: 'p1', label: p1Label },
    { v: 'p2', label: p2Label },
    { v: 'joint', label: 'Joint' },
  ];

  return (
    <div className="space-y-4">
      <Field label="Current property value">
        <CurrencyInput value={draft.propertyValue} onChange={(v) => upd({ propertyValue: v })} max={5000000} step={5000} />
      </Field>
      <Field label="Purchase price / base cost" hint="Original cost — used for capital gains tax calculation">
        <CurrencyInput value={draft.baseCost} onChange={(v) => upd({ baseCost: v })} max={5000000} step={5000} />
      </Field>
      <Field label="Annual net rental income" hint="Leave at £0 if not rented out">
        <CurrencyInput value={draft.annualRent} onChange={(v) => upd({ annualRent: v })} max={100000} step={500} />
      </Field>
      {draft.annualRent > 0 && (
        <Field label="How many years will you keep renting it out?">
          <AgeStepper value={draft.durationYears} onChange={(v) => upd({ durationYears: v })} min={1} max={50} />
        </Field>
      )}
      {showOwner && (
        <Field label="Ownership">
          <div className="flex gap-2">
            {ownerOpts.map((o) => (
              <button key={o.v} type="button" onClick={() => upd({ owner: o.v })}
                className={clsx('flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all',
                  draft.owner === o.v ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500 hover:border-orange-200'
                )}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

// ─── Auto-scroll hook ─────────────────────────────────────────────────────────

function useScrollOnAdd(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prev.current = count;
  }, [count]);
  return ref;
}

// ─── Income step screens ──────────────────────────────────────────────────────

function StepSP({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const sp = draft.statePension;
  const upd = (p: Partial<typeof sp>) => onChange({ ...draft, statePension: { ...sp, ...p } });
  return (
    <div className="space-y-5">
      {sp.enabled ? (
        <>
          <Field
            label="Weekly amount"
            hint={`Check your forecast at gov.uk/check-state-pension · Full amount is £${STATE_PENSION.FULL_NEW_WEEKLY.toFixed(2)}/week`}
          >
            <CurrencyInput value={sp.weeklyAmount} onChange={(v) => upd({ weeklyAmount: v })} max={300} step={1} />
          </Field>
          <Field label="Expected start age">
            <AgeStepper value={sp.startAge} onChange={(v) => upd({ startAge: v })} min={66} max={75} />
          </Field>
          <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 text-xs text-sky-700">
            Annual value: <strong>£{(sp.weeklyAmount * 52).toLocaleString('en-GB')}</strong> · Increases with inflation each year
          </div>
          <button type="button" onClick={() => upd({ enabled: false })}
            className="text-xs text-slate-400 hover:text-slate-600 underline">
            {isPartner ? "They won't have a State Pension" : "I won't have a State Pension"}
          </button>
        </>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-4 text-center space-y-2">
          <p className="text-sm text-slate-500">State Pension excluded from {isPartner ? 'their' : 'your'} plan.</p>
          <button type="button" onClick={() => upd({ enabled: true })}
            className="text-sm text-orange-600 hover:text-orange-700 font-semibold underline">
            Add it back
          </button>
        </div>
      )}
    </div>
  );
}

function StepDB({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const dbs = draft.dbPensions;
  const add = () => onChange({ ...draft, dbPensions: [...dbs, { annualIncome: 0, startAge: 65 }] });
  const remove = (i: number) => onChange({ ...draft, dbPensions: dbs.filter((_, idx) => idx !== i) });
  const upd = (i: number, p: Partial<DbEntry>) => onChange({ ...draft, dbPensions: dbs.map((e, idx) => idx === i ? { ...e, ...p } : e) });
  const bottomRef = useScrollOnAdd(dbs.length);
  return (
    <div className="space-y-4">
      <YesNoToggle value={dbs.length > 0} onChange={(v) => v ? (dbs.length === 0 && add()) : onChange({ ...draft, dbPensions: [] })} yesLabel={isPartner ? 'Yes, they have one' : 'Yes, I have one'} noLabel="No" />
      {dbs.map((db, i) => (
        <ItemCard key={i} title={`Scheme ${i + 1}`} onRemove={dbs.length > 1 ? () => remove(i) : undefined}>
          <Field label="Annual income (today's £)">
            <CurrencyInput value={db.annualIncome} onChange={(v) => upd(i, { annualIncome: v })} max={100000} step={100} />
          </Field>
          <Field label="Starts at age">
            <AgeStepper value={db.startAge} onChange={(v) => upd(i, { startAge: v })} min={55} max={75} />
          </Field>
        </ItemCard>
      ))}
      {dbs.length > 0 && (
        <>
          <button onClick={add} className="w-full py-2.5 rounded-2xl border-2 border-dashed border-orange-200 text-orange-600 hover:bg-orange-50 text-sm font-semibold transition-all">
            + Add another DB scheme
          </button>
          {dbs.length > 1 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-700">
              Combined annual income: <strong>£{dbs.reduce((s, e) => s + e.annualIncome, 0).toLocaleString('en-GB')}</strong>
            </div>
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}

function StepAnnuity({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const a = draft.annuity;
  const upd = (p: Partial<typeof a>) => onChange({ ...draft, annuity: { ...a, ...p } });
  return (
    <div className="space-y-5">
      <YesNoToggle value={a.enabled} onChange={(v) => upd({ enabled: v })} yesLabel={isPartner ? 'Yes, they have one' : 'Yes, I have one'} noLabel="No" />
      {a.enabled && (
        <>
          <Field label="Annual income">
            <CurrencyInput value={a.annualIncome} onChange={(v) => upd({ annualIncome: v })} max={100000} step={100} />
          </Field>
          <Field label="Starts at age">
            <AgeStepper value={a.startAge} onChange={(v) => upd({ startAge: v })} min={55} max={85} />
          </Field>
        </>
      )}
    </div>
  );
}

function StepOther({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const o = draft.otherIncome;
  const upd = (p: Partial<typeof o>) => onChange({ ...draft, otherIncome: { ...o, ...p } });
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Trust income, a regular gift, part-time work — anything not already captured.</p>
      <YesNoToggle value={o.enabled} onChange={(v) => upd({ enabled: v })} yesLabel={isPartner ? 'Yes, they have some' : 'Yes, I have some'} noLabel="No" />
      {o.enabled && (
        <>
          <Field label="Annual amount">
            <CurrencyInput value={o.annualAmount} onChange={(v) => upd({ annualAmount: v })} max={200000} step={500} />
          </Field>
          <Field label="Starts at age">
            <AgeStepper value={o.startAge} onChange={(v) => upd({ startAge: v })} min={50} max={85} />
          </Field>
        </>
      )}
    </div>
  );
}

// ─── Asset step screens ───────────────────────────────────────────────────────

function StepDC({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const dcs = draft.dcPensions;
  const contribution = draft.dcContribution;
  const add = () => onChange({ ...draft, dcPensions: [...dcs, { value: 0, growthRate: DEFAULT_ASSUMPTIONS.INVESTMENT_GROWTH }] });
  const remove = (i: number) => onChange({ ...draft, dcPensions: dcs.filter((_, idx) => idx !== i) });
  const upd = (i: number, p: Partial<DcEntry>) => onChange({ ...draft, dcPensions: dcs.map((e, idx) => idx === i ? { ...e, ...p } : e) });
  const updContribution = (p: Partial<DcContributionDraft>) => onChange({ ...draft, dcContribution: { ...contribution, ...p } });
  const total = dcs.reduce((s, e) => s + e.value, 0);
  const bottomRef = useScrollOnAdd(dcs.length);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Workplace pension, SIPP, or any personal pension pot.</p>
      <YesNoToggle value={dcs.length > 0} onChange={(v) => v ? (dcs.length === 0 && add()) : onChange({ ...draft, dcPensions: [], dcContribution: { workplaceSalary: 0, workplaceContributionPercent: 0, sippContributionAnnualGross: 0 } })} yesLabel={isPartner ? 'Yes, they have one' : 'Yes, I have one'} noLabel="No" />
      {dcs.map((dc, i) => (
        <ItemCard key={i} title={`Pension pot ${i + 1}`} onRemove={dcs.length > 1 ? () => remove(i) : undefined}>
          <Field label="Current value">
            <CurrencyInput value={dc.value} onChange={(v) => upd(i, { value: v })} max={2000000} step={1000} />
          </Field>
          <Field label="Expected annual growth" hint="A balanced portfolio typically returns 4–6% before charges">
            <GrowthStepper value={dc.growthRate} onChange={(v) => upd(i, { growthRate: v })} />
          </Field>
        </ItemCard>
      ))}
      {dcs.length > 0 && (
        <>
          <ItemCard title="Ongoing pension contributions">
            <Field label="Workplace salary" hint="Current salary in today's money. Used to project workplace pension contributions until FI age.">
              <CurrencyInput value={contribution.workplaceSalary} onChange={(v) => updContribution({ workplaceSalary: v })} max={500000} step={1000} />
            </Field>
            <Field label="Workplace pension contribution" hint="Fixed % of salary added each year until FI age. Salary is assumed to rise with inflation.">
              <GrowthStepper value={contribution.workplaceContributionPercent} onChange={(v) => updContribution({ workplaceContributionPercent: v })} max={50} />
            </Field>
            <Field label="SIPP contribution (gross / year)" hint="Gross annual amount before basic-rate tax relief, increased with inflation until FI age.">
              <CurrencyInput value={contribution.sippContributionAnnualGross} onChange={(v) => updContribution({ sippContributionAnnualGross: v })} max={200000} step={500} />
            </Field>
          </ItemCard>
          <button onClick={add} className="w-full py-2.5 rounded-2xl border-2 border-dashed border-orange-200 text-orange-600 hover:bg-orange-50 text-sm font-semibold transition-all">
            + Add another pension pot
          </button>
          {dcs.length > 1 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-700">
              Combined value: <strong>£{total.toLocaleString('en-GB')}</strong>
            </div>
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}

function StepISA({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const isas = draft.isas;
  const add = () => onChange({ ...draft, isas: [...isas, { value: 0, growthRate: DEFAULT_ASSUMPTIONS.INVESTMENT_GROWTH }] });
  const remove = (i: number) => onChange({ ...draft, isas: isas.filter((_, idx) => idx !== i) });
  const upd = (i: number, p: Partial<IsaEntry>) => onChange({ ...draft, isas: isas.map((e, idx) => idx === i ? { ...e, ...p } : e) });
  const total = isas.reduce((s, e) => s + e.value, 0);
  const bottomRef = useScrollOnAdd(isas.length);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Stocks & Shares ISA or Cash ISA — withdrawals are completely tax-free.</p>
      <YesNoToggle value={isas.length > 0} onChange={(v) => v ? (isas.length === 0 && add()) : onChange({ ...draft, isas: [] })} yesLabel={isPartner ? 'Yes, they have one' : 'Yes, I have one'} noLabel="No" />
      {isas.map((isa, i) => (
        <ItemCard key={i} title={`ISA ${i + 1}`} onRemove={isas.length > 1 ? () => remove(i) : undefined}>
          <Field label="Current value">
            <CurrencyInput value={isa.value} onChange={(v) => upd(i, { value: v })} max={2000000} step={1000} />
          </Field>
          <Field label="Expected annual growth">
            <GrowthStepper value={isa.growthRate} onChange={(v) => upd(i, { growthRate: v })} />
          </Field>
        </ItemCard>
      ))}
      {isas.length > 0 && (
        <>
          <button onClick={add} className="w-full py-2.5 rounded-2xl border-2 border-dashed border-orange-200 text-orange-600 hover:bg-orange-50 text-sm font-semibold transition-all">
            + Add another ISA
          </button>
          {isas.length > 1 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-700">
              Combined value: <strong>£{total.toLocaleString('en-GB')}</strong>
            </div>
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}

function StepGIA({ draft, onChange, isPartner }: { draft: PersonDraft; onChange: (d: PersonDraft) => void; isPartner?: boolean }) {
  const gias = draft.gias;
  const add = () => onChange({ ...draft, gias: [...gias, { value: 0, baseCost: 0, growthRate: DEFAULT_ASSUMPTIONS.INVESTMENT_GROWTH }] });
  const remove = (i: number) => onChange({ ...draft, gias: gias.filter((_, idx) => idx !== i) });
  const upd = (i: number, p: Partial<GiaEntry>) => onChange({ ...draft, gias: gias.map((e, idx) => idx === i ? { ...e, ...p } : e) });
  const total = gias.reduce((s, e) => s + e.value, 0);
  const bottomRef = useScrollOnAdd(gias.length);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Shares, funds or bonds held {isPartner ? 'in their name' : 'in your own name'} — outside an ISA or pension.</p>
      <YesNoToggle value={gias.length > 0} onChange={(v) => v ? (gias.length === 0 && add()) : onChange({ ...draft, gias: [] })} yesLabel={isPartner ? 'Yes, they have one' : 'Yes, I have one'} noLabel="No" />
      {gias.map((gia, i) => (
        <ItemCard key={i} title={`Account ${i + 1}`} onRemove={gias.length > 1 ? () => remove(i) : undefined}>
          <Field label="Current market value">
            <CurrencyInput value={gia.value} onChange={(v) => upd(i, { value: v })} max={2000000} step={1000} />
          </Field>
          <Field label="Purchase price / base cost" hint="Original cost — used for capital gains tax">
            <CurrencyInput value={gia.baseCost} onChange={(v) => upd(i, { baseCost: v })} max={2000000} step={1000} />
          </Field>
          <Field label="Expected annual growth">
            <GrowthStepper value={gia.growthRate} onChange={(v) => upd(i, { growthRate: v })} />
          </Field>
        </ItemCard>
      ))}
      {gias.length > 0 && (
        <>
          <button onClick={add} className="w-full py-2.5 rounded-2xl border-2 border-dashed border-orange-200 text-orange-600 hover:bg-orange-50 text-sm font-semibold transition-all">
            + Add another account
          </button>
          {gias.length > 1 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-700">
              Combined value: <strong>£{total.toLocaleString('en-GB')}</strong>
            </div>
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}

function StepCash({ draft, onChange }: { draft: PersonDraft; onChange: (d: PersonDraft) => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Current accounts, savings accounts, Premium Bonds — enter the combined total.</p>
      <Field label="Total cash savings">
        <CurrencyInput value={draft.cashSavings} onChange={(v) => onChange({ ...draft, cashSavings: v })} max={500000} step={1000} />
      </Field>
    </div>
  );
}

function StepProperty({ draft, onChange, mode, p1Label, p2Label }: {
  draft: PersonDraft; onChange: (d: PersonDraft) => void;
  mode: 'single' | 'couple'; p1Label: string; p2Label: string;
}) {
  const p = draft.property;
  const upd = (partial: Partial<PropertyDraft>) => onChange({ ...draft, property: { ...p, ...partial } });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">A buy-to-let or second property held in your name.</p>
      <YesNoToggle value={p.enabled} onChange={(v) => upd({ enabled: v })} />
      {p.enabled && (
        <PropertyForm
          draft={p}
          onChange={(d) => onChange({ ...draft, property: d })}
          showOwner={mode === 'couple'}
          p1Label={p1Label}
          p2Label={p2Label}
        />
      )}
    </div>
  );
}

// ─── Joint step screens ───────────────────────────────────────────────────────

function StepJointGIA({ draft, onChange }: { draft: JointDraft; onChange: (d: JointDraft) => void }) {
  const g = draft.gia;
  const upd = (p: Partial<typeof g>) => onChange({ ...draft, gia: { ...g, ...p } });
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Shares or funds held in both names — gains are split 50/50 for CGT purposes.</p>
      <YesNoToggle value={g.enabled} onChange={(v) => upd({ enabled: v })} />
      {g.enabled && (
        <>
          <Field label="Current market value">
            <CurrencyInput value={g.totalValue} onChange={(v) => upd({ totalValue: v })} max={2000000} step={1000} />
          </Field>
          <Field label="Purchase price / base cost" hint="Original cost — split equally across both CGT allowances">
            <CurrencyInput value={g.baseCost} onChange={(v) => upd({ baseCost: v })} max={2000000} step={1000} />
          </Field>
          <Field label="Expected annual growth">
            <GrowthStepper value={g.growthRate} onChange={(v) => upd({ growthRate: v })} />
          </Field>
        </>
      )}
    </div>
  );
}

function StepJointProperty({ draft, onChange, p1Label, p2Label }: {
  draft: JointDraft; onChange: (d: JointDraft) => void;
  p1Label: string; p2Label: string;
}) {
  const p = draft.property;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">A property held jointly in both names.</p>
      <YesNoToggle value={p.enabled} onChange={(v) => onChange({ ...draft, property: { ...p, enabled: v } })} />
      {p.enabled && (
        <PropertyForm
          draft={p}
          onChange={(d) => onChange({ ...draft, property: d })}
          showOwner={false}
          p1Label={p1Label}
          p2Label={p2Label}
        />
      )}
    </div>
  );
}

// ─── Consolidate draft → store ────────────────────────────────────────────────

function weightedAvgGrowth(items: { value: number; growthRate: number }[]): number {
  const total = items.reduce((s, e) => s + e.value, 0);
  if (total === 0) return 4;
  return Math.round((items.reduce((s, e) => s + e.growthRate * e.value, 0) / total) * 10) / 10;
}

function applyPersonDraft(
  draft: PersonDraft,
  owner: 'p1' | 'p2',
  setIncome: (k: string, u: Record<string, unknown>) => void,
  setAsset:  (k: string, u: Record<string, unknown>) => void,
) {
  setIncome('statePension', { enabled: draft.statePension.enabled, weeklyAmount: draft.statePension.weeklyAmount, startAge: draft.statePension.startAge });

  const dbTotal = draft.dbPensions.reduce((s, e) => s + e.annualIncome, 0);
  // Use income-weighted average start age so a large pension starting later isn't
  // pulled forward by a small pension starting earlier (which would overstate income).
  const dbStartAge = draft.dbPensions.length === 0 ? 65
    : dbTotal === 0
      ? Math.round(draft.dbPensions.reduce((s, e) => s + e.startAge, 0) / draft.dbPensions.length)
      : Math.round(draft.dbPensions.reduce((s, e) => s + e.startAge * e.annualIncome, 0) / dbTotal);
  setIncome('dbPension', { enabled: dbTotal > 0, annualIncome: dbTotal, startAge: dbStartAge });

  setIncome('annuity', { enabled: draft.annuity.enabled, annualIncome: draft.annuity.annualIncome, startAge: draft.annuity.startAge });
  setIncome('otherIncome', { enabled: draft.otherIncome.enabled, annualAmount: draft.otherIncome.annualAmount, startAge: draft.otherIncome.startAge, stopAge: 0, description: 'Other income' });

  const dcTotal = draft.dcPensions.reduce((s, e) => s + e.value, 0);
  const hasFutureContribution = draft.dcContribution.workplaceSalary > 0
    || draft.dcContribution.workplaceContributionPercent > 0
    || draft.dcContribution.sippContributionAnnualGross > 0;
  setIncome('dcPension', {
    enabled: dcTotal > 0 || hasFutureContribution,
    totalValue: dcTotal,
    growthRate: weightedAvgGrowth(draft.dcPensions),
    workplaceSalary: draft.dcContribution.workplaceSalary,
    workplaceContributionPercent: draft.dcContribution.workplaceContributionPercent,
    sippContributionAnnualGross: draft.dcContribution.sippContributionAnnualGross,
  });

  const isaTotal = draft.isas.reduce((s, e) => s + e.value, 0);
  setAsset('isaInvestments', { enabled: isaTotal > 0, totalValue: isaTotal, growthRate: weightedAvgGrowth(draft.isas) });

  const giaTotal = draft.gias.reduce((s, e) => s + e.value, 0);
  setAsset('generalInvestments', { enabled: giaTotal > 0, totalValue: giaTotal, baseCost: draft.gias.reduce((s, e) => s + e.baseCost, 0), growthRate: weightedAvgGrowth(draft.gias) });

  setAsset('cashSavings', { enabled: draft.cashSavings > 0, totalValue: draft.cashSavings });

  setAsset('property', {
    enabled:       draft.property.enabled,
    propertyValue: draft.property.propertyValue,
    baseCost:      draft.property.baseCost,
    annualRent:    draft.property.annualRent,
    durationYears: draft.property.durationYears,
    owner:         draft.property.owner !== 'joint' ? owner : 'joint',
  });
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface Props { onDone: () => void }

export default function GuidedSetupWizard({ onDone }: Props) {
  const { mode, person1, person2, setP1Income, setP1Asset, setP2Income, setP2Asset, setJointGia } = usePlannerStore();

  const p1Label = person1.name || 'You';
  const p2Label = person2.name || 'Partner';

  type WizardStep =
    | { kind: 'person'; person: 'p1' | 'p2'; stepId: PersonStepId }
    | { kind: 'joint';  stepId: JointStepId };

  const steps: WizardStep[] = [
    ...INCOME_STEPS.map(s => ({ kind: 'person' as const, person: 'p1' as const, stepId: s })),
    ...ASSET_STEPS.map(s  => ({ kind: 'person' as const, person: 'p1' as const, stepId: s })),
    ...(mode === 'couple' ? [
      ...INCOME_STEPS.map(s => ({ kind: 'person' as const, person: 'p2' as const, stepId: s })),
      ...ASSET_STEPS.map(s  => ({ kind: 'person' as const, person: 'p2' as const, stepId: s })),
      ...JOINT_STEPS.map(s  => ({ kind: 'joint'  as const, stepId: s })),
    ] : []),
  ];

  const [idx, setIdx]   = useState(0);
  const [p1, setP1]     = useState<PersonDraft>(emptyDraft);
  const [p2, setP2]     = useState<PersonDraft>(() => ({ ...emptyDraft(), property: { ...emptyDraft().property, owner: 'p2' } }));
  const [joint, setJoint] = useState<JointDraft>(emptyJoint);
  const current = steps[idx];
  const isLast  = idx === steps.length - 1;
  const meta    = STEP_META[current.stepId];

  // Transition labels
  const prevStep = idx > 0 ? steps[idx - 1] : null;
  const isNewPerson = current.kind === 'person' && prevStep?.kind === 'person' && current.person !== prevStep.person;
  const isJointSection = current.kind === 'joint' && prevStep?.kind !== 'joint';

  const personLabel = current.kind === 'person'
    ? (current.person === 'p1' ? p1Label : p2Label)
    : 'Joint';

  // Section colour: p1 = orange, p2 = emerald, joint = violet
  const sectionColor =
    current.kind === 'joint'                              ? 'text-violet-600 bg-violet-50 border-violet-200' :
    current.kind === 'person' && current.person === 'p2' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                                                            'text-orange-600 bg-orange-50 border-orange-200';

  function handleSave() {
    applyPersonDraft(p1, 'p1',
      setP1Income as (k: string, u: Record<string, unknown>) => void,
      setP1Asset  as (k: string, u: Record<string, unknown>) => void,
    );
    if (mode === 'couple') {
      applyPersonDraft(p2, 'p2',
        setP2Income as (k: string, u: Record<string, unknown>) => void,
        setP2Asset  as (k: string, u: Record<string, unknown>) => void,
      );
      setJointGia({ enabled: joint.gia.enabled, totalValue: joint.gia.totalValue, baseCost: joint.gia.baseCost, growthRate: joint.gia.growthRate });
      // Joint property → write to p1's property slot with owner='joint' if no p1 individual property
      if (joint.property.enabled && !p1.property.enabled) {
        (setP1Asset as (k: string, u: Record<string, unknown>) => void)('property', {
          enabled: true, propertyValue: joint.property.propertyValue, baseCost: joint.property.baseCost,
          annualRent: joint.property.annualRent, durationYears: joint.property.durationYears, owner: 'joint',
        });
      }
    }
    onDone();
  }

  function renderContent() {
    if (current.kind === 'joint') {
      if (current.stepId === 'joint-gia')      return <StepJointGIA draft={joint} onChange={setJoint} />;
      if (current.stepId === 'joint-property') return <StepJointProperty draft={joint} onChange={setJoint} p1Label={p1Label} p2Label={p2Label} />;
    }
    if (current.kind === 'person') {
      const draft    = current.person === 'p1' ? p1 : p2;
      const setDraft = current.person === 'p1' ? setP1 : setP2;
      const isPartner = current.person === 'p2';
      switch (current.stepId) {
        case 'sp':       return <StepSP       draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'db':       return <StepDB       draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'annuity':  return <StepAnnuity  draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'other':    return <StepOther    draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'dc':       return <StepDC       draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'isa':      return <StepISA      draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'gia':      return <StepGIA      draft={draft} onChange={setDraft} isPartner={isPartner} />;
        case 'cash':     return <StepCash     draft={draft} onChange={setDraft} />;
        case 'property': return <StepProperty draft={draft} onChange={setDraft} mode={mode} p1Label={p1Label} p2Label={p2Label} />;
      }
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">

        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-100">
          {/* Transition banners */}
          {(isNewPerson || isJointSection) && (
            <div className={clsx('rounded-xl border px-3 py-2 text-xs font-bold mb-3', sectionColor)}>
              {isNewPerson    && `Now setting up ${personLabel}`}
              {isJointSection && '🤝 Joint assets'}
            </div>
          )}

          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{meta.icon}</span>
              <div>
                <p className="font-black text-slate-800 leading-tight">{meta.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{personLabel} · {meta.section}</p>
              </div>
            </div>
            <button onClick={onDone}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-lg leading-none transition-colors flex-shrink-0 ml-3">
              ×
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1 mt-3 flex-wrap">
            {steps.map((s, i) => {
              const isCurrent = i === idx;
              const isDone    = i < idx;
              const color     =
                s.kind === 'joint'                               ? (isCurrent ? 'bg-violet-500' : isDone ? 'bg-violet-300' : 'bg-slate-200') :
                s.kind === 'person' && s.person === 'p2'         ? (isCurrent ? 'bg-emerald-500' : isDone ? 'bg-emerald-300' : 'bg-slate-200') :
                                                                    (isCurrent ? 'bg-orange-500'  : isDone ? 'bg-orange-300'  : 'bg-slate-200');
              // Divider before p2 and joint sections
              const showDivider = i > 0 && (
                (s.kind === 'person' && s.person === 'p2' && steps[i - 1].kind === 'person' && (steps[i - 1] as { person: string }).person === 'p1') ||
                (s.kind === 'joint' && steps[i - 1].kind !== 'joint')
              );
              return (
                <div key={i} className="flex items-center gap-1">
                  {showDivider && <div className="w-px h-3 bg-slate-300 mx-1" />}
                  <div className={clsx('rounded-full transition-all', isCurrent ? 'w-5 h-2' : 'w-2 h-2', color)} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50/50 sm:rounded-b-3xl">
          <button onClick={() => idx > 0 ? setIdx(i => i - 1) : onDone()} className="btn-secondary text-sm">
            {idx > 0 ? '← Back' : 'Cancel'}
          </button>
          <span className="text-xs text-slate-400">{idx + 1} / {steps.length}</span>
          <button onClick={isLast ? handleSave : () => setIdx(i => i + 1)} className="btn-primary px-8 text-sm">
            {isLast ? 'Save →' : 'Next →'}
          </button>
        </div>

      </div>
    </div>
  );
}
