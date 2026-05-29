'use client';

import { usePlannerStore } from '@/store/plannerStore';
import CurrencyInput from '@/components/ui/CurrencyInput';
import {
  getFiAgeMax,
  getLifeExpectancyMin,
  getMaxSupportedDob,
  getMinSupportedDob,
  getRangeProgress,
  MAX_PLANNING_HORIZON,
} from '@/lib/planningBounds';
import { STEP1_IDS } from '@/lib/testIds';
import clsx from 'clsx';

interface Props { onNext: () => void }

export default function Step1HouseholdSetup({ onNext }: Props) {
  const {
    mode, setMode,
    person1, setP1Name, setP1Dob, setP1Income,
    person2, setP2Name, setP2Dob, setP2Income,
    fiAge, setFiAge,
    p2FiAge: p2FiAgeRaw, setP2FiAge,
    assumptions, updateAssumptions,
    rlssStandard, applyRlssTemplate,
  } = usePlannerStore();

  const p2FiAge = mode === 'couple' ? (p2FiAgeRaw ?? fiAge) : fiAge;
  const ageLabel = (age: number) => `${age} years old`;
  const minSupportedDob = getMinSupportedDob();
  const maxSupportedDob = getMaxSupportedDob();
  const planningHorizonMin = getLifeExpectancyMin(
    person1.currentAge,
    mode === 'couple' ? person2.currentAge : 0,
  );
  const fiAgeMin = person1.currentAge;
  const fiAgeMax = Math.max(fiAgeMin, getFiAgeMax(assumptions.lifeExpectancy));
  const fiProgress = getRangeProgress(fiAge, fiAgeMin, fiAgeMax);
  const p2FiAgeMin = mode === 'couple' ? person2.currentAge : fiAgeMin;
  const p2FiAgeMax = Math.max(p2FiAgeMin, getFiAgeMax(assumptions.lifeExpectancy));
  const p2FiProgress = getRangeProgress(p2FiAge, p2FiAgeMin, p2FiAgeMax);
  const planningHorizonProgress = getRangeProgress(
    assumptions.lifeExpectancy,
    planningHorizonMin,
    MAX_PLANNING_HORIZON,
  );

  return (
    <div className="space-y-6 pb-24">

      {/* Page header */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-navy mb-3 tracking-tight">
          Who are we planning for?
        </h1>
        <p className="text-base text-ink-muted max-w-lg mx-auto leading-relaxed">
          Tell us about your household so we can build a plan around your life stages.
        </p>
      </div>

      {/* Planning mode selection */}
      <div className="game-card">
        <h3 className="section-heading">Household type</h3>
        <div className="grid grid-cols-2 gap-4 mt-4">
          {(['single', 'couple'] as const).map((m) => (
            <label key={m} className="cursor-pointer group relative">
              <input
                type="radio"
                name="household_type"
                value={m}
                checked={mode === m}
                onChange={() => { setMode(m); if (rlssStandard) applyRlssTemplate(rlssStandard); }}
                className="sr-only"
              />
              <button
                data-testid={m === 'single' ? STEP1_IDS.MODE_SINGLE : STEP1_IDS.MODE_COUPLE}
                onClick={() => { setMode(m); if (rlssStandard) applyRlssTemplate(rlssStandard); }}
                className={clsx(
                  'w-full flex flex-col items-center gap-3 p-5 rounded-lg border-2 font-medium transition-all shadow-card',
                  mode === m
                    ? 'border-navy bg-surface text-navy'
                    : 'border-border bg-surface-white text-ink-muted hover:border-navy/50 hover:bg-surface-low'
                )}
              >
                <span className="text-4xl" role="img" aria-label={m === 'single' ? 'person' : 'group'}>
                  {m === 'single' ? '🙋' : '👫'}
                </span>
                <span className="text-sm font-semibold">
                  {m === 'single' ? 'Just me' : 'Me & my partner'}
                </span>
                <span className="text-xs text-ink-muted font-normal text-center leading-snug">
                  {m === 'single'
                    ? "I'm planning for my own retirement."
                    : 'We are planning our future together.'}
                </span>
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* Person details */}
      <div className={`grid gap-4 ${mode === 'couple' ? 'sm:grid-cols-2' : ''}`}>

        {/* Person 1 */}
        <div className="game-card space-y-4">
          <h3 className="text-base font-semibold text-navy border-b border-surface-high pb-3">
            Your Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-muted" htmlFor={`p1-name-${STEP1_IDS.P1_NAME}`}>
                First Name <span className="font-normal text-border-strong">(optional)</span>
              </label>
              <input
                type="text"
                id={`p1-name-${STEP1_IDS.P1_NAME}`}
                data-testid={STEP1_IDS.P1_NAME}
                value={person1.name}
                onChange={(e) => setP1Name(e.target.value)}
                placeholder="e.g. Alex"
                className="input-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="p1-dob" className="text-xs font-semibold text-ink-muted">Date of Birth</label>
              <input
                type="date"
                id="p1-dob"
                data-testid={STEP1_IDS.P1_DOB}
                value={person1.dateOfBirth}
                onChange={(e) => setP1Dob(e.target.value)}
                min={minSupportedDob}
                max={maxSupportedDob}
                className="input-base"
              />
              {person1.currentAge > 0 && (
                <p className="text-xs text-tangerine font-semibold">{ageLabel(person1.currentAge)}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={STEP1_IDS.P1_SALARY} className="text-xs font-semibold text-ink-muted">
              Salary <span className="font-normal text-border-strong">(before tax, optional)</span>
            </label>
            <CurrencyInput
              id={STEP1_IDS.P1_SALARY}
              data-testid={STEP1_IDS.P1_SALARY}
              value={person1.incomeSources.dcPension.workplaceSalary ?? 0}
              onChange={(v) => setP1Income('dcPension', { workplaceSalary: v > 0 ? v : undefined })}
              max={500_000}
              step={1000}
            />
          </div>
        </div>

        {/* Person 2 */}
        {mode === 'couple' && (
          <div className="game-card space-y-4">
            <h3 className="text-base font-semibold text-navy border-b border-surface-high pb-3">
              {person2.name ? `${person2.name}'s Details` : "Partner's Details"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="p2-name" className="text-xs font-semibold text-ink-muted">
                  First Name <span className="font-normal text-border-strong">(optional)</span>
                </label>
                <input
                  type="text"
                  id="p2-name"
                  data-testid={STEP1_IDS.P2_NAME}
                  value={person2.name}
                  onChange={(e) => setP2Name(e.target.value)}
                  placeholder="e.g. Sam"
                  className="input-base"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="p2-dob" className="text-xs font-semibold text-ink-muted">Date of Birth</label>
                <input
                  type="date"
                  id="p2-dob"
                  data-testid={STEP1_IDS.P2_DOB}
                  value={person2.dateOfBirth}
                  onChange={(e) => setP2Dob(e.target.value)}
                  min={minSupportedDob}
                  max={maxSupportedDob}
                  className="input-base"
                />
                {person2.currentAge > 0 && (
                  <p className="text-xs text-tangerine font-semibold">{ageLabel(person2.currentAge)}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={STEP1_IDS.P2_SALARY} className="text-xs font-semibold text-ink-muted">
                Salary <span className="font-normal text-border-strong">(before tax, optional)</span>
              </label>
              <CurrencyInput
                id={STEP1_IDS.P2_SALARY}
                data-testid={STEP1_IDS.P2_SALARY}
                value={person2.incomeSources.dcPension.workplaceSalary ?? 0}
                onChange={(v) => setP2Income('dcPension', { workplaceSalary: v > 0 ? v : undefined })}
                max={500_000}
                step={1000}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sliders */}
      <div className="game-card space-y-6">
        <div className="bg-surface-low rounded-lg p-4 border border-surface-high space-y-6">

          {/* FI age — Person 1 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-navy flex items-center gap-1.5">
                <svg className="w-4 h-4 text-ink-muted" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                </svg>
                {mode === 'couple' ? `${person1.name || 'Person 1'} — financial independence age` : 'Financial independence age'}
                <span className="font-normal text-ink-muted text-xs hidden md:inline">— when work becomes a choice</span>
              </label>
              <span className="text-lg font-bold text-tangerine tabular-nums">{fiAge}</span>
            </div>
            <input
              type="range"
              data-testid={STEP1_IDS.P1_FI_AGE}
              min={fiAgeMin}
              max={fiAgeMax}
              step={1}
              value={fiAge}
              onChange={(e) => setFiAge(parseInt(e.target.value))}
              className="w-full"
              disabled={fiAgeMin === fiAgeMax}
              aria-label={`${person1.name || 'Person 1'} financial independence age`}
              style={{ background: `linear-gradient(to right, #F57C00 ${fiProgress}%, #e4e2dd ${fiProgress}%)` }}
            />
            <div className="flex justify-between text-xs text-ink-muted">
              <span>{fiAgeMin}</span>
              <span>{fiAgeMax}</span>
            </div>
          </div>

          {/* FI age — Person 2 (couple mode) */}
          {mode === 'couple' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-navy">
                  {person2.name || 'Person 2'} — financial independence age
                </label>
                <span className="text-lg font-bold text-tangerine tabular-nums">{p2FiAge}</span>
              </div>
              <input
                type="range"
                data-testid={STEP1_IDS.P2_FI_AGE}
                min={p2FiAgeMin}
                max={p2FiAgeMax}
                step={1}
                value={p2FiAge}
                onChange={(e) => setP2FiAge(parseInt(e.target.value))}
                className="w-full"
                disabled={p2FiAgeMin === p2FiAgeMax}
                aria-label={`${person2.name || 'Person 2'} financial independence age`}
                style={{ background: `linear-gradient(to right, #F57C00 ${p2FiProgress}%, #e4e2dd ${p2FiProgress}%)` }}
              />
              <div className="flex justify-between text-xs text-ink-muted">
                <span>{p2FiAgeMin}</span>
                <span>{p2FiAgeMax}</span>
              </div>
            </div>
          )}

          {/* Planning horizon */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="life-expectancy" className="text-sm font-semibold text-navy flex items-center gap-1.5">
                <svg className="w-4 h-4 text-ink-muted" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                </svg>
                Planning horizon (life expectancy)
              </label>
              <span className="text-lg font-bold text-tangerine tabular-nums">{assumptions.lifeExpectancy}</span>
            </div>
            <input
              type="range"
              id="life-expectancy"
              data-testid={STEP1_IDS.LIFE_EXPECTANCY}
              min={planningHorizonMin}
              max={MAX_PLANNING_HORIZON}
              step={1}
              value={assumptions.lifeExpectancy}
              onChange={(e) => updateAssumptions({ lifeExpectancy: parseInt(e.target.value) })}
              className="w-full"
              disabled={planningHorizonMin === MAX_PLANNING_HORIZON}
              aria-label="Planning horizon (life expectancy)"
              style={{ background: `linear-gradient(to right, #F57C00 ${planningHorizonProgress}%, #e4e2dd ${planningHorizonProgress}%)` }}
            />
            <div className="flex justify-between text-xs text-ink-muted">
              <span>{planningHorizonMin}</span>
              <span>{MAX_PLANNING_HORIZON}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button data-testid={STEP1_IDS.NEXT} onClick={onNext} className="btn-primary px-10 text-sm flex items-center gap-2">
          Set your life vision
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
