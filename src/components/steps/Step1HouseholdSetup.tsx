'use client';

import { usePlannerStore } from '@/store/plannerStore';
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
    person1, setP1Name, setP1Dob,
    person2, setP2Name, setP2Dob,
    fiAge, setFiAge,
    p2FiAge: p2FiAgeRaw, setP2FiAge,
    assumptions, updateAssumptions,
    rlssStandard, applyRlssTemplate,
  } = usePlannerStore();

  // In couple mode, p2FiAge defaults to fiAge if not explicitly set
  const p2FiAge = mode === 'couple' ? (p2FiAgeRaw ?? fiAge) : fiAge;

  // Format a date value for display (age label)
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

      {/* Hero */}
      <div className="text-center py-10">
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-bold px-4 py-1.5 rounded-full mb-4">
          👋 Step 1 of 5 — Household Setup
        </div>
        <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4 leading-tight tracking-tight">
          Who are we<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">
            planning for?
          </span>
        </h2>
        <p className="text-lg text-slate-500 max-w-xl mx-auto">
          Tell us about your household so we can build a plan around your life stages.
        </p>
      </div>

      {/* Planning mode */}
      <div className="game-card">
        <h3 className="section-heading">Household type</h3>
        <div className="grid grid-cols-2 gap-3">
          {(['single', 'couple'] as const).map((m) => (
            <button
              key={m}
              data-testid={m === 'single' ? STEP1_IDS.MODE_SINGLE : STEP1_IDS.MODE_COUPLE}
              onClick={() => { setMode(m); if (rlssStandard) applyRlssTemplate(rlssStandard); }}
              className={clsx(
                'flex flex-col items-center gap-2 p-5 rounded-2xl border-2 font-semibold transition-all',
                mode === m
                  ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
              )}
            >
              <span className="text-3xl">{m === 'single' ? '🙋' : '👫'}</span>
              <span className="text-base">{m === 'single' ? 'Just me' : 'Me & my partner'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Person details */}
      <div className={`grid gap-4 ${mode === 'couple' ? 'sm:grid-cols-2' : ''}`}>

        {/* Person 1 */}
        <div className="game-card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-sm">
              {mode === 'couple' ? '1' : 'Me'}
            </div>
            <h3 className="font-black text-slate-800">{person1.name || (mode === 'couple' ? 'Person 1' : 'Your details')}</h3>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">
              {mode === 'couple' ? 'Your name' : 'Your name'} <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              data-testid={STEP1_IDS.P1_NAME}
              value={person1.name}
              onChange={(e) => setP1Name(e.target.value)}
              placeholder={mode === 'couple' ? 'e.g. Alex' : 'e.g. Alex'}
              className="input-base"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">
              Date of birth
            </label>
            <input
              type="date"
              data-testid={STEP1_IDS.P1_DOB}
              value={person1.dateOfBirth}
              onChange={(e) => setP1Dob(e.target.value)}
              min={minSupportedDob}
              max={maxSupportedDob}
              className="input-base"
            />
            {person1.currentAge > 0 && (
              <p className="text-xs text-orange-600 font-semibold mt-1.5">{ageLabel(person1.currentAge)}</p>
            )}
          </div>
        </div>

        {/* Person 2 */}
        {mode === 'couple' && (
          <div className="game-card space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-sm">
                2
              </div>
              <h3 className="font-black text-slate-800">{person2.name || 'Person 2'}</h3>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                Partner&apos;s name <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                data-testid={STEP1_IDS.P2_NAME}
                value={person2.name}
                onChange={(e) => setP2Name(e.target.value)}
                placeholder="e.g. Sam"
                className="input-base"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                Date of birth
              </label>
              <input
                type="date"
                data-testid={STEP1_IDS.P2_DOB}
                value={person2.dateOfBirth}
                onChange={(e) => setP2Dob(e.target.value)}
                min={minSupportedDob}
                max={maxSupportedDob}
                className="input-base"
              />
              {person2.currentAge > 0 && (
                <p className="text-xs text-emerald-600 font-semibold mt-1.5">{ageLabel(person2.currentAge)}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Financial independence age */}
      <div className="game-card">
        <h3 className="section-heading">
          Financial independence age
          <span className="font-normal text-slate-400 text-sm ml-2">— when work becomes a choice</span>
        </h3>
        <p className="section-subheading">
          The age from which work becomes a choice, not a necessity. Life stages — Go-Go Years, Slo-Go Years,
          No-Go Years — begin here. You can still work beyond this age if you want to — this is about having options.
        </p>

        {/* Person 1 (or solo) slider */}
        <div className={mode === 'couple' ? 'mb-5' : ''}>
          {mode === 'couple' && (
            <p className="text-sm font-semibold text-slate-700 mb-2">
              {person1.name || 'Person 1'}
            </p>
          )}
          <div className="flex items-center gap-4">
            <input
              type="range"
              data-testid={STEP1_IDS.P1_FI_AGE}
              min={fiAgeMin}
              max={fiAgeMax}
              step={1}
              value={fiAge}
              onChange={(e) => setFiAge(parseInt(e.target.value))}
              className="flex-1"
              disabled={fiAgeMin === fiAgeMax}
              aria-label={`${person1.name || 'Person 1'} financial independence age`}
              style={{ background: `linear-gradient(to right, #f97316 ${fiProgress}%, #e2e8f0 ${fiProgress}%)` }}
            />
            <div className="w-16 h-14 bg-orange-500 text-white font-black text-xl rounded-2xl flex items-center justify-center flex-shrink-0">
              {fiAge}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            {fiAge > person1.currentAge
              ? <span>Building phase: age {person1.currentAge} → {fiAge - 1}{fiAge - person1.currentAge >= 7 ? ' · Drag left to explore early retirement' : ''}</span>
              : <span>Freedom phase starts now</span>
            }
            <span>Freedom phase starts: age {fiAge}</span>
          </div>
        </div>

        {/* Person 2 slider — couple mode only */}
        {mode === 'couple' && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">
              {person2.name || 'Person 2'}
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                data-testid={STEP1_IDS.P2_FI_AGE}
                min={p2FiAgeMin}
                max={p2FiAgeMax}
                step={1}
                value={p2FiAge}
                onChange={(e) => setP2FiAge(parseInt(e.target.value))}
                className="flex-1"
                disabled={p2FiAgeMin === p2FiAgeMax}
                aria-label={`${person2.name || 'Person 2'} financial independence age`}
                style={{ background: `linear-gradient(to right, #f97316 ${p2FiProgress}%, #e2e8f0 ${p2FiProgress}%)` }}
              />
              <div className="w-16 h-14 bg-orange-500 text-white font-black text-xl rounded-2xl flex items-center justify-center flex-shrink-0">
                {p2FiAge}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              {p2FiAge > person2.currentAge
                ? <span>Building phase: age {person2.currentAge} → {p2FiAge - 1}</span>
                : <span>Freedom phase starts now</span>
              }
              <span>Freedom phase starts: age {p2FiAge}</span>
            </div>
          </div>
        )}
      </div>

      {/* Planning horizon */}
      <div className="game-card">
        <h3 className="section-heading">Planning horizon</h3>
        <p className="section-subheading">We&apos;ll model your plan to this age. Being optimistic is wise.</p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            data-testid={STEP1_IDS.LIFE_EXPECTANCY}
            min={planningHorizonMin}
            max={MAX_PLANNING_HORIZON}
            step={1}
            value={assumptions.lifeExpectancy}
            onChange={(e) => updateAssumptions({ lifeExpectancy: parseInt(e.target.value) })}
            className="flex-1"
            disabled={planningHorizonMin === MAX_PLANNING_HORIZON}
            style={{ background: `linear-gradient(to right, #8b5cf6 ${planningHorizonProgress}%, #e2e8f0 ${planningHorizonProgress}%)` }}
          />
          <div className="w-16 h-14 bg-violet-500 text-white font-black text-xl rounded-2xl flex items-center justify-center flex-shrink-0">
            {assumptions.lifeExpectancy}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button data-testid={STEP1_IDS.NEXT} onClick={onNext} className="btn-primary px-12 text-lg">
          Set your life vision →
        </button>
      </div>
    </div>
  );
}
