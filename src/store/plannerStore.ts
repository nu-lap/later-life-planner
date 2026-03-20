'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PlannerState, PlanningMode, LifeStage, GIAAsset, CareReserve,
  PersonIncomeSources, PersonAssets, Assumptions, AspirationTag, RlssStandard, PersistedPlannerState,
} from '@/models/types';
import {
  createDefaultState, createMockDemoState, buildDefaultLifeStages,
  buildCategoriesForRlss, ageFromDOB, dobFromAge,
} from '@/lib/mockData';
import { clampDateOfBirth, normalizePlanningBounds } from '@/lib/planningBounds';
import { STATE_PENSION } from '@/config/financialConstants';
import { LEGACY_PLANNER_STORAGE_KEY } from '@/lib/browserStorageKeys';
import {
  extractPersistedPlannerState,
  extractPlannerUiState,
  hydratePlannerState,
} from '@/lib/persistedPlan';

type Actions = {
  setCurrentStep: (step: number) => void;
  setMode: (mode: PlanningMode) => void;

  setFiAge: (age: number) => void;

  setP1Name:  (name: string) => void;
  setP1Dob:   (dob: string)  => void;
  setP1Age:   (age: number)  => void;
  setP1Income: (key: keyof PersonIncomeSources, updates: Record<string, unknown>) => void;
  setP1Asset:  (key: keyof PersonAssets,        updates: Record<string, unknown>) => void;

  setP2Name:  (name: string) => void;
  setP2Dob:   (dob: string)  => void;
  setP2Age:   (age: number)  => void;
  setP2Income: (key: keyof PersonIncomeSources, updates: Record<string, unknown>) => void;
  setP2Asset:  (key: keyof PersonAssets,        updates: Record<string, unknown>) => void;

  setJointGia: (updates: Partial<GIAAsset>) => void;
  setCareReserve: (updates: Partial<CareReserve>) => void;

  setLifeVision: (vision: string) => void;
  toggleAspiration: (tag: AspirationTag) => void;
  updateLifeStage: (id: string, updates: Partial<LifeStage>) => void;
  updateSpendingAmount: (categoryId: string, stageId: string, amount: number) => void;
  updateAssumptions: (updates: Partial<Assumptions>) => void;

  applyRlssTemplate: (standard: RlssStandard) => void;
  setRlssStandard: (standard: RlssStandard | null) => void;

  loadDemo: () => void;
  hydrateCanonicalPlan: (persistedState: Partial<PersistedPlannerState>) => void;
  loadState: (persistedState: Partial<PersistedPlannerState>) => void;
  resetPlan: () => void;
};

function syncLifeStages(existingStages: LifeStage[], fiAge: number, lifeExpectancy: number) {
  return buildDefaultLifeStages(fiAge, lifeExpectancy).map((nextStage) => {
    const existingStage = existingStages.find((stage) => stage.id === nextStage.id);
    return existingStage
      ? { ...existingStage, startAge: nextStage.startAge, endAge: nextStage.endAge }
      : nextStage;
  });
}

function mergePersistedPlannerState(
  persistedState: unknown,
  currentState: PlannerState & Actions,
): PlannerState & Actions {
  if (!persistedState || typeof persistedState !== 'object') return currentState;
  const nextUiState = extractPlannerUiState({
    ...currentState,
    currentStep: typeof (persistedState as Partial<PlannerState>).currentStep === 'number'
      ? (persistedState as Partial<PlannerState>).currentStep as number
      : currentState.currentStep,
    maxVisitedStep: typeof (persistedState as Partial<PlannerState>).maxVisitedStep === 'number'
      ? (persistedState as Partial<PlannerState>).maxVisitedStep as number
      : currentState.maxVisitedStep,
  });

  return {
    ...currentState,
    ...hydratePlannerState(
      {
        ...currentState,
        ...nextUiState,
      },
      persistedState as Partial<PersistedPlannerState>,
    ),
  };
}

const HAS_CLERK_SYNC = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function extractLocalPersistState(state: PlannerState & Actions): PlannerState | ReturnType<typeof extractPlannerUiState> {
  if (HAS_CLERK_SYNC) {
    return extractPlannerUiState(state);
  }

  return {
    ...extractPersistedPlannerState(state),
    ...extractPlannerUiState(state),
  };
}

export const usePlannerStore = create<PlannerState & Actions>()(
  persist(
    (set, get) => ({
      ...createDefaultState(STATE_PENSION.DEFAULT_AGE),

      setCurrentStep: (step) => set((s) => ({
        currentStep: step,
        maxVisitedStep: Math.max(s.maxVisitedStep, step),
      })),
      setMode: (mode) => set((s) => {
        const normalized = normalizePlanningBounds(
          s.person1.currentAge,
          mode === 'couple' ? s.person2.currentAge : 0,
          s.fiAge,
          s.assumptions.lifeExpectancy,
        );

        return {
          mode,
          fiAge: normalized.fiAge,
          lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
          assumptions: { ...s.assumptions, lifeExpectancy: normalized.lifeExpectancy },
          spendingCategories: buildCategoriesForRlss(s.rlssStandard ?? 'minimum', mode),
        };
      }),

      // FI age setter — rebuilds life stages anchored to new FI age
      setFiAge: (fiAge) =>
        set((s) => {
          const normalized = normalizePlanningBounds(
            s.person1.currentAge,
            s.mode === 'couple' ? s.person2.currentAge : 0,
            fiAge,
            s.assumptions.lifeExpectancy,
          );

          return {
            fiAge: normalized.fiAge,
            lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
            assumptions: { ...s.assumptions, lifeExpectancy: normalized.lifeExpectancy },
          };
        }),

      setP1Name: (name) => set((s) => ({ person1: { ...s.person1, name } })),

      // DOB setter — recomputes age and rebuilds life stages (preserving endAge from lifeExpectancy)
      // Also clamps fiAge to currentAge if the person is already at or past their freedom phase.
      setP1Dob: (dateOfBirth) =>
        set((s) => {
          const normalizedDob = clampDateOfBirth(dateOfBirth);
          const normalized = normalizePlanningBounds(
            ageFromDOB(normalizedDob, s.person1.currentAge),
            s.mode === 'couple' ? s.person2.currentAge : 0,
            s.fiAge,
            s.assumptions.lifeExpectancy,
          );

          return {
            person1: {
              ...s.person1,
              dateOfBirth: normalizedDob || dateOfBirth,
              currentAge: normalized.currentAge,
            },
            fiAge: normalized.fiAge,
            lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
            assumptions: { ...s.assumptions, lifeExpectancy: normalized.lifeExpectancy },
          };
        }),

      // Legacy age setter (used by slider fallback)
      setP1Age: (age) =>
        set((s) => {
          const normalized = normalizePlanningBounds(
            age,
            s.mode === 'couple' ? s.person2.currentAge : 0,
            s.fiAge,
            s.assumptions.lifeExpectancy,
          );

          return {
            person1: {
              ...s.person1,
              dateOfBirth: dobFromAge(normalized.currentAge),
              currentAge: normalized.currentAge,
            },
            fiAge: normalized.fiAge,
            lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
            assumptions: { ...s.assumptions, lifeExpectancy: normalized.lifeExpectancy },
          };
        }),

      setP1Income: (key, updates) =>
        set((s) => ({
          person1: {
            ...s.person1,
            incomeSources: { ...s.person1.incomeSources, [key]: { ...s.person1.incomeSources[key], ...updates } },
          },
        })),
      setP1Asset: (key, updates) =>
        set((s) => ({
          person1: {
            ...s.person1,
            assets: { ...s.person1.assets, [key]: { ...s.person1.assets[key], ...updates } },
          },
        })),

      setP2Name: (name) => set((s) => ({ person2: { ...s.person2, name } })),

      setP2Dob: (dateOfBirth) =>
        set((s) => {
          const normalizedDob = clampDateOfBirth(dateOfBirth);
          const normalized = normalizePlanningBounds(
            s.person1.currentAge,
            ageFromDOB(normalizedDob, s.person2.currentAge),
            s.fiAge,
            s.assumptions.lifeExpectancy,
          );

          return {
            person2: {
              ...s.person2,
              dateOfBirth: normalizedDob || dateOfBirth,
              currentAge: normalized.secondaryCurrentAge,
            },
            fiAge: normalized.fiAge,
            lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
            assumptions: { ...s.assumptions, lifeExpectancy: normalized.lifeExpectancy },
          };
        }),

      setP2Age: (age) =>
        set((s) => {
          const normalized = normalizePlanningBounds(
            s.person1.currentAge,
            age,
            s.fiAge,
            s.assumptions.lifeExpectancy,
          );

          return {
            person2: {
              ...s.person2,
              dateOfBirth: dobFromAge(normalized.secondaryCurrentAge),
              currentAge: normalized.secondaryCurrentAge,
            },
            fiAge: normalized.fiAge,
            lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
            assumptions: { ...s.assumptions, lifeExpectancy: normalized.lifeExpectancy },
          };
        }),

      setP2Income: (key, updates) =>
        set((s) => ({
          person2: {
            ...s.person2,
            incomeSources: { ...s.person2.incomeSources, [key]: { ...s.person2.incomeSources[key], ...updates } },
          },
        })),
      setP2Asset: (key, updates) =>
        set((s) => ({
          person2: {
            ...s.person2,
            assets: { ...s.person2.assets, [key]: { ...s.person2.assets[key], ...updates } },
          },
        })),

      setJointGia: (updates) =>
        set((s) => ({ jointGia: { ...s.jointGia, ...updates } })),

      setCareReserve: (updates) =>
        set((s) => ({ careReserve: { ...s.careReserve, ...updates } })),

      setLifeVision: (lifeVision) => set({ lifeVision }),
      toggleAspiration: (tag) =>
        set((s) => ({
          aspirations: s.aspirations.includes(tag)
            ? s.aspirations.filter((a) => a !== tag)
            : [...s.aspirations, tag],
        })),
      updateLifeStage: (id, updates) =>
        set((s) => ({ lifeStages: s.lifeStages.map((ls) => ls.id === id ? { ...ls, ...updates } : ls) })),
      updateSpendingAmount: (categoryId, stageId, amount) =>
        set((s) => ({
          spendingCategories: s.spendingCategories.map((cat) =>
            cat.id === categoryId
              ? { ...cat, amounts: { ...cat.amounts, [stageId]: Math.max(0, amount) } }
              : cat
          ),
        })),
      updateAssumptions: (updates) =>
        set((s) => {
          const newAssumptions = { ...s.assumptions, ...updates };
          if (updates.lifeExpectancy !== undefined) {
            const normalized = normalizePlanningBounds(
              s.person1.currentAge,
              s.mode === 'couple' ? s.person2.currentAge : 0,
              s.fiAge,
              newAssumptions.lifeExpectancy,
            );

            return {
              fiAge: normalized.fiAge,
              assumptions: { ...newAssumptions, lifeExpectancy: normalized.lifeExpectancy },
              lifeStages: syncLifeStages(s.lifeStages, normalized.fiAge, normalized.lifeExpectancy),
            };
          }
          return { assumptions: newAssumptions };
        }),


      applyRlssTemplate: (standard) =>
        set((s) => ({
          rlssStandard: standard,
          spendingCategories: buildCategoriesForRlss(standard, s.mode),
        })),

      setRlssStandard: (rlssStandard) => set({ rlssStandard }),

      loadDemo: () => set(createMockDemoState()),
      hydrateCanonicalPlan: (persistedState) =>
        set((s) => ({
          ...hydratePlannerState(
            {
              ...s,
              ...extractPlannerUiState(s),
            },
            persistedState,
          ),
          ...extractPlannerUiState(s),
        })),
      loadState: (persistedState) => get().hydrateCanonicalPlan(persistedState),
      resetPlan: () => set(createDefaultState(STATE_PENSION.DEFAULT_AGE)),
    }),
    {
      name: LEGACY_PLANNER_STORAGE_KEY,
      merge: mergePersistedPlannerState,
      partialize: (state) => extractLocalPersistState(state),
    }
  )
);
