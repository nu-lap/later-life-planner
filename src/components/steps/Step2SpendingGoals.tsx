'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { getStageTotals, getStageTotalSpending, formatCurrency } from '@/lib/calculations';
import { RLSS_STANDARDS } from '@/lib/mockData';
import { syncCareReserveGoal } from '@/lib/goalOrchestration';
import { CARE_RESERVE } from '@/config/financialConstants';
import type { SpendingTier, RlssStandard, PlannedEvent } from '@/models/types';
import clsx from 'clsx';
import { newId } from '@/lib/ids';

// ─── Planned Events helpers ───────────────────────────────────────────────────

const QUICK_ADD_EVENTS: Array<{ emoji: string; name: string; amount: number }> = [
  { emoji: '🏠', name: 'Home renovation',  amount: 20000 },
  { emoji: '🚗', name: 'New car',           amount: 25000 },
  { emoji: '✈️', name: 'Dream holiday',    amount: 10000 },
  { emoji: '💍', name: "Child's wedding",  amount: 15000 },
  { emoji: '🎓', name: 'Education gift',   amount: 10000 },
  { emoji: '🛥️', name: 'Boat / campervan', amount: 30000 },
];

interface Props { onNext: () => void; onBack: () => void }

const TIER_CFG: Record<SpendingTier, { label: string; desc: string; color: string; bg: string; border: string }> = {
  essential:    { label: 'Essential',       desc: 'Housing, food, utilities, transport, insurance, healthcare', color: 'text-sky-700',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  moderate:     { label: 'Lifestyle',       desc: 'Travel, dining, hobbies',                                   color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
  aspirational: { label: 'Family & Giving', desc: 'Family support, charity, gifts',                           color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  variable:     { label: 'Other',           desc: 'Home improvements, major purchases, contingency buffer',    color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
};

const STANDARD_CFG: Record<RlssStandard, { bg: string; ring: string; text: string; badge: string }> = {
  minimum:     { bg: 'bg-slate-50',   ring: 'ring-slate-400',   text: 'text-slate-700',   badge: 'bg-slate-100 text-slate-700' },
  moderate:    { bg: 'bg-sky-50',     ring: 'ring-sky-400',     text: 'text-sky-700',     badge: 'bg-sky-100 text-sky-700' },
  comfortable: { bg: 'bg-emerald-50', ring: 'ring-emerald-400', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
};

const STAGE_COLORS = { 'go-go': '#f97316', 'slo-go': '#10b981', 'no-go': '#8b5cf6' };

function clampCareReserveAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(CARE_RESERVE.MAX_AMOUNT, Math.max(0, value));
}

export default function Step2SpendingGoals({ onNext, onBack }: Props) {
  const state = usePlannerStore();
  const {
    mode,
    lifeStages,
    spendingCategories,
    updateSpendingAmount,
    rlssStandard,
    applyRlssTemplate,
    careReserve,
    goalRegistry,
    setCareReserve,
    setGoalRegistry,
    plannedEvents,
    addPlannedEvent,
    updatePlannedEvent,
    removePlannedEvent,
    person1,
  } = state;

  const [activeStageId, setActiveStageId] = useState(lifeStages[0]?.id ?? 'active');
  const [openTiers, setOpenTiers] = useState<Record<string, boolean>>({ essential: true, moderate: true, aspirational: false, variable: false });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Planned Events editor state
  const [editingEvent, setEditingEvent] = useState<PlannedEvent | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);

  const activeStage = lifeStages.find(s => s.id === activeStageId) ?? lifeStages[0];
  const totalSpend  = getStageTotalSpending(state, activeStageId);
  const tierTotals  = getStageTotals(state, activeStageId);
  const standards   = RLSS_STANDARDS[mode];

  // Benchmark label
  const min = standards.minimum.annual;
  const mod = standards.moderate.annual;
  const com = standards.comfortable.annual;
  let benchmarkLabel = 'Below Minimum';
  let benchmarkColor = 'text-slate-500';
  if (totalSpend >= com)  { benchmarkLabel = 'Comfortable+';          benchmarkColor = 'text-emerald-600'; }
  else if (totalSpend >= mod) { benchmarkLabel = 'Moderate–Comfortable'; benchmarkColor = 'text-sky-600'; }
  else if (totalSpend >= min) { benchmarkLabel = 'Minimum–Moderate';     benchmarkColor = 'text-amber-600'; }

  const toggleTier = (tier: string) => setOpenTiers(p => ({ ...p, [tier]: !p[tier] }));
  const careReserveProgress = Math.min(
    100,
    Math.max(0, (clampCareReserveAmount(careReserve?.amount ?? 0) / CARE_RESERVE.MAX_AMOUNT) * 100),
  );

  function updateCareReserve(nextReserve: Partial<typeof careReserve>) {
    const merged = {
      enabled: careReserve?.enabled ?? false,
      amount: careReserve?.amount ?? 0,
      ...nextReserve,
    };
    const clamped = {
      ...merged,
      amount: clampCareReserveAmount(merged.amount ?? 0),
    };

    setCareReserve(clamped);
    setGoalRegistry(syncCareReserveGoal(goalRegistry, clamped));
  }

  const currentP1Age = person1.currentAge;
  const maxP1Age = state.assumptions.lifeExpectancy;

  function openNewEvent(preset?: { emoji: string; name: string; amount: number }) {
    setEditingEvent({
      id: newId(),
      name: preset?.name ?? '',
      emoji: preset?.emoji ?? '🎯',
      p1Age: Math.min(maxP1Age, Math.max(currentP1Age, (plannedEvents[plannedEvents.length - 1]?.p1Age ?? currentP1Age) + 1)),
      amount: preset?.amount ?? 10000,
      inflationLinked: true,
    });
    setShowEventForm(true);
  }

  function saveEvent(event: PlannedEvent) {
    const existing = plannedEvents.find((e) => e.id === event.id);
    if (existing) {
      updatePlannedEvent(event.id, event);
    } else {
      addPlannedEvent(event);
    }
    setShowEventForm(false);
    setEditingEvent(null);
  }

  return (
    <div className="space-y-5 pb-24">

      {/* Hero */}
      <div className="text-center pt-4 pb-2">
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-bold px-4 py-1.5 rounded-full mb-3">
          💰 Step 3 of 5 — Spending Goals
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2 tracking-tight">
          What will your life{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">cost?</span>
        </h2>
        <p className="text-slate-500">Start with a UK benchmark, then make it yours.</p>
      </div>

      {/* RLSS Lifestyle cards */}
      <div className="game-card bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100">
        <h3 className="section-heading">Choose your lifestyle</h3>
        <p className="text-xs text-slate-500 mb-4">
          UK Retirement Living Standards (PLSA 2024) · <strong>{mode === 'couple' ? 'Two-person' : 'One-person'}</strong> household · <a href="https://www.retirementlivingstandards.org.uk/" target="_blank" rel="noopener noreferrer" className="underline text-orange-600 hover:text-orange-800">More info</a>
        </p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {(['minimum', 'moderate', 'comfortable'] as RlssStandard[]).map((key) => {
            const std   = standards[key];
            const cfg   = STANDARD_CFG[key];
            const active = rlssStandard === key;
            return (
              <button
                key={key}
                onClick={() => applyRlssTemplate(key)}
                className={clsx(
                  'relative text-left p-3 rounded-2xl border-2 transition-all focus:outline-none',
                  active
                    ? `${cfg.bg} ring-2 ${cfg.ring} ring-offset-1 border-transparent`
                    : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                {active && <span className="absolute top-2 right-2 text-sm">✓</span>}
                <div className="text-xl mb-1.5">{std.emoji}</div>
                <p className={clsx('font-black text-xs mb-1', active ? cfg.text : 'text-slate-700')}>{std.label}</p>
                <p className="text-lg font-black text-slate-900 leading-none">
                  {formatCurrency(std.annual, true)}
                </p>
                <p className="text-xs font-normal text-slate-400 mb-1">/yr</p>
                <p className="text-xs text-slate-500 leading-snug line-clamp-2">{std.description}</p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-400">
          Selecting a standard sets your spending plan. Customise by category below if needed.
        </p>
      </div>

      {/* Spending Smile explanation — QW4: moved above life-stage tabs */}
      <div className="game-card-sm bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">📉</span>
          <div>
            <p className="font-black text-sm text-violet-800 mb-1">The Spending Smile</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Research consistently shows that spending follows a natural curve in later life — highest in the
              Go-Go years, gently declining through the Slo-Go years, with a possible uptick in
              later years for care needs. Your three life stages already reflect this — spend more confidently
              in your Go-Go Years, knowing spending naturally reduces over time.{' '}
              <a href="https://www.youtube.com/watch?v=E8Y3rTJa2HI" target="_blank" rel="noopener noreferrer" className="underline text-violet-600 hover:text-violet-800">Inspired by Dan Haylett · Humans vs Retirement</a>
            </p>
          </div>
        </div>
      </div>

      {/* Stage tabs — QW3: active colour unified to brand orange */}
      <div className="flex gap-2">
        {lifeStages.map(stage => (
          <button
            key={stage.id}
            onClick={() => setActiveStageId(stage.id)}
            className={clsx(
              'flex-1 py-2.5 px-3 rounded-2xl font-semibold text-sm transition-all border-2',
              activeStageId === stage.id ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            )}
            style={activeStageId === stage.id ? { backgroundColor: '#f97316', borderColor: '#f97316' } : {}}
          >
            {stage.label}
            <span className="ml-1.5 text-xs opacity-75">{stage.startAge}–{stage.endAge}</span>
          </button>
        ))}
      </div>

      {/* Total + benchmark */}
      <div className="bg-slate-800 text-white rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-1">Annual spending · {activeStage?.label}</p>
          <p className="text-3xl font-black">{formatCurrency(totalSpend, true)}</p>
        </div>
        <p className={clsx('text-sm font-semibold', benchmarkColor)}>{benchmarkLabel}</p>
      </div>

      {/* Advanced planning toggle */}
      <div className={clsx(
        'rounded-2xl border-2 overflow-hidden transition-all',
        showAdvanced ? 'border-slate-200' : 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100'
      )}>
        <button
          onClick={() => setShowAdvanced(p => !p)}
          aria-expanded={showAdvanced}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <div>
              <p className="font-black text-base text-slate-800">Advanced planning</p>
              <p className="text-xs text-slate-500">Customise by category · Care Reserve</p>
            </div>
          </div>
          <span className="text-slate-400 font-semibold text-sm">{showAdvanced ? '▲ Hide' : '▼ Show'}</span>
        </button>

      {/* Advanced: category breakdown + Care Reserve */}
      {showAdvanced && (
        <div className="border-t border-slate-200 p-4 space-y-4">

          {/* Tier totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tierTotals.map(({ tier, total }) => {
              const cfg = TIER_CFG[tier as SpendingTier];
              return (
                <div key={tier} className={`rounded-2xl p-4 border ${cfg.bg} ${cfg.border}`}>
                  <p className={`text-xs font-bold mb-1 ${cfg.color}`}>{cfg.label}</p>
                  <p className="text-xl font-black text-slate-800">{formatCurrency(total, true)}</p>
                </div>
              );
            })}
          </div>

          {/* RLSS benchmark bar */}
          <div className="game-card-sm">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">vs UK standards</span>
              <span className={clsx('text-xs font-bold', benchmarkColor)}>{benchmarkLabel}</span>
            </div>
            <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-slate-200 rounded-l-full" style={{ width: `${Math.min(100, (min / (com * 1.3)) * 100)}%` }} />
              <div className="absolute inset-y-0 bg-sky-100" style={{ left: `${(min / (com * 1.3)) * 100}%`, width: `${((mod - min) / (com * 1.3)) * 100}%` }} />
              <div className="absolute inset-y-0 bg-emerald-100" style={{ left: `${(mod / (com * 1.3)) * 100}%`, width: `${((com - mod) / (com * 1.3)) * 100}%` }} />
              <div className="absolute inset-y-0 w-1 bg-slate-800 rounded-full -translate-x-1/2"
                style={{ left: `${Math.min(98, (totalSpend / (com * 1.3)) * 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-slate-400">Min {formatCurrency(min, true)}</span>
              <span className="text-xs text-slate-400">Mod {formatCurrency(mod, true)}</span>
              <span className="text-xs text-slate-400">Com {formatCurrency(com, true)}</span>
            </div>
          </div>

          {/* Copy from stage */}
          {lifeStages.indexOf(activeStage) > 0 && (
            <div className="text-right">
              <button
                onClick={() => {
                  const prev = lifeStages[lifeStages.indexOf(activeStage) - 1];
                  spendingCategories.forEach(cat => {
                    updateSpendingAmount(cat.id, activeStageId, cat.amounts[prev.id] ?? 0);
                  });
                }}
                className="text-sm text-orange-600 hover:text-orange-700 font-semibold"
              >
                ↩ Copy from &quot;{lifeStages[lifeStages.indexOf(activeStage) - 1]?.label}&quot;
              </button>
            </div>
          )}

          {/* Category sliders by tier */}
          {(['essential', 'moderate', 'aspirational', 'variable'] as SpendingTier[]).map(tier => {
            const cfg  = TIER_CFG[tier];
            const cats = spendingCategories.filter(c => c.tier === tier);
            const tot  = tierTotals.find(t => t.tier === tier)?.total ?? 0;
            const open = openTiers[tier];
            return (
              <div key={tier} className={`rounded-2xl border ${cfg.bg} ${cfg.border} overflow-hidden`}>
                <button
                  onClick={() => toggleTier(tier)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div>
                    <span className={`font-black text-base ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs text-slate-500 ml-2">{cfg.desc}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-black text-lg ${cfg.color}`}>{formatCurrency(tot, true)}</span>
                    <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-slate-200/60 px-4 pb-2">
                    {cats.map(cat => {
                      const val = cat.amounts[activeStageId] ?? 0;
                      const pct = (val / cat.maxValue) * 100;
                      return (
                        <div key={cat.id} className="py-3 border-b border-slate-100/80 last:border-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{cat.icon}</span>
                              <div>
                                <p className="font-semibold text-sm text-slate-800">{cat.name}</p>
                                <p className="text-xs text-slate-400">{cat.description}</p>
                              </div>
                            </div>
                            <span className={clsx('font-black text-base', cfg.color)}>{formatCurrency(val, true)}</span>
                          </div>
                          <input
                            type="range" min={0} max={cat.maxValue} step={100} value={val}
                            onChange={(e) => updateSpendingAmount(cat.id, activeStageId, parseInt(e.target.value))}
                            className="w-full"
                            style={{ background: `linear-gradient(to right, ${STAGE_COLORS[activeStageId as keyof typeof STAGE_COLORS] ?? '#f97316'} ${pct}%, #e2e8f0 ${pct}%)` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Care Reserve */}
          <div className="game-card border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">🛡️</span>
                <div>
                  <h3 className="section-heading mb-0">Care Reserve</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Earmark a portion of your portfolio for potential late-life care costs — kept invested
                    but excluded from your normal spending plan.
                  </p>
                </div>
              </div>
              <button
                aria-label={careReserve?.enabled ? 'Disable care reserve' : 'Enable care reserve'}
                onClick={() => updateCareReserve({ enabled: !careReserve?.enabled })}
                className={clsx(
                  'flex-shrink-0 ml-4 w-12 h-6 rounded-full transition-colors relative',
                  careReserve?.enabled ? 'bg-teal-500' : 'bg-slate-200'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform',
                  careReserve?.enabled ? 'translate-x-6' : 'translate-x-0.5'
                )} />
              </button>
            </div>

            {careReserve?.enabled && (
              <div className="border-t border-teal-100 pt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-700">Reserve amount</span>
                      <p className="text-xs text-slate-500">This also sets the Care reserve goal target used by the optimiser.</p>
                    </div>
                    <span className="text-base font-black text-teal-700">{formatCurrency(careReserve.amount)}</span>
                  </div>
                  <div className="mb-3 flex max-w-xs flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-teal-700" htmlFor="care-reserve-amount">
                      Care reserve target
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
                      <input
                        id="care-reserve-amount"
                        type="number"
                        min={0}
                        max={CARE_RESERVE.MAX_AMOUNT}
                        step={5000}
                        value={careReserve.amount}
                        onChange={(e) => updateCareReserve({ amount: parseInt(e.target.value || '0', 10) || 0 })}
                        className="w-full rounded-xl border border-teal-200 bg-white py-2 pl-7 pr-3 text-sm font-semibold text-slate-700 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={CARE_RESERVE.MAX_AMOUNT}
                    step={5000}
                    value={careReserve.amount}
                    onChange={(e) => updateCareReserve({ amount: parseInt(e.target.value, 10) })}
                    className="w-full"
                    style={{
                      background: `linear-gradient(to right, #0d9488 ${careReserveProgress}%, #e2e8f0 ${careReserveProgress}%)`
                    }}
                  />
                  <div className="flex justify-between mt-1 text-xs text-slate-400">
                    <span>£0</span>
                    <span>{formatCurrency(CARE_RESERVE.DEFAULT_AMOUNT, true)} suggested</span>
                    <span>{formatCurrency(CARE_RESERVE.MAX_AMOUNT, true)}</span>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-teal-100 bg-white/70 p-3 text-xs text-teal-900">
                    <p className="mb-1 font-bold">🏥 Care costs</p>
                    <p>Keeps capital set aside for later-life care instead of treating it as normal spending money.</p>
                  </div>
                  <div className="rounded-xl border border-cyan-100 bg-white/70 p-3 text-xs text-cyan-900">
                    <p className="mb-1 font-bold">📈 Still invested</p>
                    <p>The reserve stays invested and can keep growing with the rest of the plan.</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-white/70 p-3 text-xs text-emerald-900">
                    <p className="mb-1 font-bold">🧾 Estate value</p>
                    <p>If you never need care, the reserve still remains part of your final estate.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* ── Planned Events ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-100 bg-purple-50 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="section-heading mb-0">🎯 Planned big purchases</h3>
            <p className="text-xs text-purple-700 mt-0.5">
              One-off expenses layered on top of your regular spending — the plan shows which investment bucket to use.
            </p>
          </div>
          <button
            onClick={() => openNewEvent()}
            className="shrink-0 ml-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 transition-colors"
          >
            + Add
          </button>
        </div>

        {/* Quick-add chips */}
        {!showEventForm && (
          <div className="flex flex-wrap gap-2 mb-4">
            {QUICK_ADD_EVENTS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => openNewEvent(preset)}
                className="rounded-full border border-purple-200 bg-white hover:bg-purple-100 text-purple-800 text-xs font-medium px-3 py-1 transition-colors"
              >
                {preset.emoji} {preset.name}
              </button>
            ))}
          </div>
        )}

        {/* Inline event form */}
        {showEventForm && editingEvent && (
          <EventForm
            event={editingEvent}
            minAge={currentP1Age}
            maxAge={maxP1Age}
            onChange={setEditingEvent}
            onSave={saveEvent}
            onCancel={() => { setShowEventForm(false); setEditingEvent(null); }}
          />
        )}

        {/* Event list */}
        {plannedEvents.length > 0 && (
          <div className="space-y-2 mt-2">
            {[...plannedEvents]
              .sort((a, b) => a.p1Age - b.p1Age)
              .map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-xl border border-purple-100 bg-white px-4 py-3"
                >
                  <span className="text-xl">{event.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{event.name}</p>
                    <p className="text-xs text-slate-500">
                      Age {event.p1Age} · {formatCurrency(event.amount, true)} (today&apos;s money)
                      {event.inflationLinked && <span className="ml-1 text-purple-600">· inflation-adjusted</span>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setEditingEvent({ ...event }); setShowEventForm(true); }}
                      className="text-xs text-slate-500 hover:text-purple-700 font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removePlannedEvent(event.id)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {plannedEvents.length === 0 && !showEventForm && (
          <p className="text-xs text-purple-500 text-center py-2">
            No planned events yet — use the chips above or click + Add.
          </p>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <button onClick={onNext} className="btn-primary px-10 text-base">
          Next: Income & Assets →
        </button>
      </div>
    </div>
  );
}

// ─── Inline Event Form ────────────────────────────────────────────────────────

const EMOJI_OPTIONS = ['🎯', '🏠', '🚗', '✈️', '💍', '🎓', '🛥️', '🎸', '🏡', '💻', '🌍', '🎁'];

interface EventFormProps {
  event: PlannedEvent;
  minAge: number;
  maxAge: number;
  onChange: (event: PlannedEvent) => void;
  onSave: (event: PlannedEvent) => void;
  onCancel: () => void;
}

function EventForm({ event, minAge, maxAge, onChange, onSave, onCancel }: EventFormProps) {
  const isValid = event.name.trim().length > 0 && event.amount > 0 && event.p1Age >= minAge && event.p1Age <= maxAge;

  function toggleInflation() { onChange({ ...event, inflationLinked: !event.inflationLinked }); }
  function handleInflationKeyDown(e: React.KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleInflation(); }
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-white p-4 mb-4 space-y-3">
      {/* Emoji picker */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Icon</p>
        <div className="flex flex-wrap gap-1.5">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-pressed={event.emoji === emoji}
              aria-label={emoji}
              onClick={() => onChange({ ...event, emoji })}
              className={clsx(
                'w-9 h-9 rounded-lg text-lg transition-all',
                event.emoji === emoji
                  ? 'bg-purple-100 ring-2 ring-purple-400 scale-110'
                  : 'bg-slate-50 hover:bg-purple-50',
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs font-semibold text-slate-600 block mb-1">What is it?</label>
        <input
          type="text"
          value={event.name}
          onChange={(e) => onChange({ ...event, name: e.target.value })}
          placeholder="e.g. Kitchen renovation"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          maxLength={60}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Age */}
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Your age when you spend it</label>
          <input
            type="number"
            min={minAge}
            max={maxAge}
            value={event.p1Age}
            onChange={(e) => onChange({ ...event, p1Age: Math.min(maxAge, Math.max(minAge, Number(e.target.value))) })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Amount (today&apos;s £)</label>
          <input
            type="number"
            min={100}
            step={500}
            value={event.amount}
            onChange={(e) => onChange({ ...event, amount: Math.max(0, Number(e.target.value)) })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>
      </div>

      {/* Inflation toggle */}
      <div className="flex items-center gap-3">
        <button
          id={`inflation-toggle-${event.id}`}
          type="button"
          role="switch"
          aria-checked={event.inflationLinked}
          onClick={toggleInflation}
          onKeyDown={handleInflationKeyDown}
          className={clsx(
            'relative shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300',
            event.inflationLinked ? 'bg-purple-500' : 'bg-slate-200',
          )}
        >
          <span className={clsx(
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
            event.inflationLinked ? 'translate-x-5' : 'translate-x-1',
          )} />
        </button>
        <label
          htmlFor={`inflation-toggle-${event.id}`}
          className="text-sm text-slate-700 cursor-pointer"
        >
          Adjust for inflation between now and when you spend it
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => isValid && onSave(event)}
          disabled={!isValid}
          className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-bold py-2 transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium py-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
