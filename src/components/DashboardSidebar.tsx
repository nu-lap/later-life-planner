'use client';

import { useState } from 'react';
import type { PlannerState, CareReserve, DrawdownStrategy, GoalRegistry } from '@/models/types';
import type { YearlyProjection } from '@/lib/types';
import type { OptimizerPolicyOverride } from '@/financialEngine/types';
import { formatCurrency } from '@/lib/calculations';
import ProFeatureBanner from '@/components/ProFeatureBanner';
import clsx from 'clsx';

interface DashboardSidebarProps {
  state: PlannerState;
  projections: YearlyProjection[];
  proEnabled: boolean;
  optimizerEnabled: boolean;
  activeStrategy: DrawdownStrategy;
  effectivePclsAge: number;
  onStrategyChange: (strategy: DrawdownStrategy) => void;
  onPclsAgeChange: (age: number) => void;
  goalRegistry?: GoalRegistry;
  onGoalRegistryChange?: (registry: GoalRegistry) => void;
  careReserve?: CareReserve;
  onCareReserveChange?: (reserve: Partial<CareReserve>) => void;
  optimizerResult?: any;
  onProCta?: (source: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

interface SectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SidebarSection({ title, icon, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-slate-200 pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 mb-3 hover:text-orange-600 transition-colors"
      >
        <span className="text-lg">{icon}</span>
        <span className="font-semibold text-sm text-slate-700">{title}</span>
        <span className={`ml-auto text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="space-y-3 pl-6">{children}</div>}
    </div>
  );
}

export default function DashboardSidebar({
  state,
  projections,
  proEnabled,
  optimizerEnabled,
  activeStrategy,
  effectivePclsAge,
  onStrategyChange,
  onPclsAgeChange,
  goalRegistry,
  onGoalRegistryChange,
  careReserve,
  onCareReserveChange,
  optimizerResult,
  onProCta,
  isOpen,
  onToggle,
}: DashboardSidebarProps) {
  const firstYear = projections[0];
  const lifetimeIncomeTax = projections.reduce((s, p) => s + p.incomeTaxPaid, 0);
  const lifetimeCGT = projections.reduce((s, p) => s + p.totalCgtPaid, 0);
  const lifetimeTotalTax = lifetimeIncomeTax + lifetimeCGT;
  const lifetimeIncome = projections.reduce((s, p) => s + p.totalIncome, 0);
  const taxFreeYears = projections.filter(p => Math.round(p.totalTaxPaid) === 0).length;
  const effectiveRate = lifetimeIncome > 0 ? (lifetimeTotalTax / lifetimeIncome) * 100 : 0;

  const strategies = [
    {
      id: 'standard-ufpls' as DrawdownStrategy,
      label: 'Flexible pension drawdown',
      icon: '💧',
      description: 'Draw flexibly from your pension — each withdrawal is 25% tax-free and 75% taxable, using your tax-free entitlement gradually over time.',
    },
    {
      id: 'pcls-bed-isa' as DrawdownStrategy,
      label: 'Tax-free lump sum + ISA transfer',
      icon: '🚀',
      description: `Once your pension pot is large enough that any further growth would be fully taxable on withdrawal, it could make sense to take your entire tax-free entitlement now and move it into an ISA — where future growth is sheltered from tax. Each subsequent year, up to the ISA annual allowance is transferred from your investment account into your ISA wrapper.`,
    },
  ] as const;

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-40 md:hidden w-12 h-12 rounded-full bg-orange-500 text-white shadow-lg flex items-center justify-center hover:bg-orange-600 transition-colors"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      {/* Sidebar overlay (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed md:static inset-y-0 right-0 w-80 md:w-80 bg-white border-l border-slate-200 shadow-lg md:shadow-none z-40 md:z-auto',
          'overflow-y-auto transition-transform duration-300 md:translate-x-0',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="p-4 space-y-6">
          {/* Close button (mobile) */}
          <div className="flex items-center justify-between md:hidden mb-4">
            <h2 className="font-bold text-lg">Dashboard Controls</h2>
            <button
              onClick={onToggle}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>

          {/* Withdrawal Strategies (always visible) */}
          <SidebarSection title="Withdrawal Strategy" icon="⚙️" defaultOpen>
            <div className="space-y-2">
              {strategies.map(option => (
                <button
                  key={option.id}
                  onClick={() => onStrategyChange(option.id)}
                  className={clsx(
                    'text-left rounded-lg border-2 p-2 transition-all text-sm',
                    activeStrategy === option.id
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{option.icon}</span>
                    <span className={`font-bold text-xs ${activeStrategy === option.id ? 'text-orange-800' : 'text-slate-800'}`}>
                      {option.label}
                    </span>
                    {activeStrategy === option.id && (
                      <span className="ml-auto text-xs font-bold bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded">Active</span>
                    )}
                  </div>
                  <p className={`text-xs leading-tight ${activeStrategy === option.id ? 'text-orange-700' : 'text-slate-500'}`}>
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
            
            {/* PCLS Age Input (shown when strategy is pcls-bed-isa) */}
            {activeStrategy === 'pcls-bed-isa' && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Lump sum age
                </label>
                <input
                  type="number"
                  value={effectivePclsAge}
                  onChange={(e) => onPclsAgeChange(Math.max(state.person1.currentAge, parseInt(e.target.value) || effectivePclsAge))}
                  min={state.person1.currentAge}
                  max={120}
                  className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-blue-600 mt-1">Strategy applies from age {effectivePclsAge}</p>
              </div>
            )}
          </SidebarSection>

          {/* Goal Priorities (Pro-gated) */}
          {proEnabled ? (
            <SidebarSection title="Goal Priorities" icon="🎯">
              <p className="text-xs text-slate-500 mb-2">Reorder and adjust priorities in the main Goal Priority panel below the charts.</p>
            </SidebarSection>
          ) : (
            <div className="border-t border-slate-200 pt-3">
              <div className="rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 p-3">
                <p className="font-semibold text-xs text-orange-900 mb-1">Goal Priorities</p>
                <p className="text-xs text-orange-700 mb-2">Reorder goals and set spending targets to match your priorities.</p>
                <button
                  onClick={() => onProCta?.('goal-priorities')}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 underline"
                >
                  Unlock with Pro →
                </button>
              </div>
            </div>
          )}

          {/* Optimizer (Pro-gated) */}
          {proEnabled && optimizerEnabled ? (
            <SidebarSection title="Withdrawal Optimizer" icon="⚡">
              <p className="text-xs text-slate-500">AI-powered withdrawal sequencing to minimize lifetime tax.</p>
              {optimizerResult && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs">
                  <p className="font-semibold text-emerald-900 mb-1">Estimated tax saving</p>
                  <p className="text-emerald-800 font-black text-base">
                    {formatCurrency(optimizerResult.estimatedSavings || 0, true)}
                  </p>
                </div>
              )}
            </SidebarSection>
          ) : null}

          {/* IHT / Estate Planning (Pro-gated) */}
          {proEnabled ? (
            <SidebarSection title="IHT & Estate" icon="🏛️">
              <p className="text-xs text-slate-500">Plan your inheritance and manage inheritance tax liability.</p>
            </SidebarSection>
          ) : (
            <div className="border-t border-slate-200 pt-3">
              <div className="rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 p-3">
                <p className="font-semibold text-xs text-orange-900 mb-1">IHT & Estate Planning</p>
                <p className="text-xs text-orange-700 mb-2">Explore inheritance scenarios and optimize your estate plan.</p>
                <button
                  onClick={() => onProCta?.('iht-planning')}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 underline"
                >
                  Unlock with Pro →
                </button>
              </div>
            </div>
          )}

          {/* Care Reserve (always visible) */}
          <SidebarSection title="Care Reserve" icon="🛡️" defaultOpen={careReserve?.enabled}>
            {careReserve ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={careReserve.enabled}
                    onChange={(e) => onCareReserveChange?.({ enabled: e.target.checked })}
                    className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    id="care-reserve-enabled"
                  />
                  <label htmlFor="care-reserve-enabled" className="font-semibold text-slate-700 cursor-pointer">
                    Enable care reserve
                  </label>
                </div>

                {careReserve.enabled && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 space-y-2">
                    <label className="block font-semibold text-slate-700">Target amount</label>
                    <div className="flex gap-2 items-center">
                      <span className="text-slate-500">£</span>
                      <input
                        type="number"
                        value={careReserve.amount}
                        onChange={(e) => onCareReserveChange?.({ amount: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                        min="0"
                        step="10000"
                      />
                    </div>
                    <p className="text-xs text-blue-600">
                      Projected: {formatCurrency(firstYear?.careReserveBalance ?? careReserve.amount, true)} at {state.fiAge}
                    </p>
                  </div>
                )}

                {!careReserve.enabled && (
                  <p className="text-slate-500 italic">Disabled. Enable above to set aside funds for later-life care.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Not configured. Add a care reserve in your assumptions to set aside funds for later-life care.</p>
            )}
          </SidebarSection>

          {/* Tax Summary (always visible) */}
          <SidebarSection title="Tax Summary" icon="📉">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2 bg-rose-50 border border-rose-100">
                <p className="text-xs text-rose-600 font-bold">Income Tax</p>
                <p className="text-sm font-black text-rose-800">{formatCurrency(lifetimeIncomeTax, true)}</p>
              </div>
              <div className="rounded-lg p-2 bg-amber-50 border border-amber-100">
                <p className="text-xs text-amber-600 font-bold">CGT</p>
                <p className="text-sm font-black text-amber-800">{formatCurrency(lifetimeCGT, true)}</p>
              </div>
              <div className="rounded-lg p-2 bg-sky-50 border border-sky-100">
                <p className="text-xs text-sky-600 font-bold">Effective Rate</p>
                <p className="text-sm font-black text-sky-800">{effectiveRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg p-2 bg-emerald-50 border border-emerald-100">
                <p className="text-xs text-emerald-600 font-bold">Tax-free Years</p>
                <p className="text-sm font-black text-emerald-800">{taxFreeYears}</p>
              </div>
            </div>
          </SidebarSection>
        </div>
      </aside>
    </>
  );
}
