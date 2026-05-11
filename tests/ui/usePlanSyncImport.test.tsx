import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { usePlannerStore } from '@/store/plannerStore';
import { createMockDemoState } from '@/lib/mockData';

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: null }),
}));

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return { ...actual, getUserDekB64: async () => null };
});

let latestSync: ReturnType<typeof usePlanSync> | null = null;

function Harness() {
  latestSync = usePlanSync();
  return null;
}

describe('usePlanSync importPlanFromJson', () => {
  beforeEach(() => {
    latestSync = null;
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
    localStorage.clear();
  });

  test('valid JSON file hydrates the store with the imported plan', async () => {
    render(<Harness />);

    const demoState = createMockDemoState();
    const file = new File([JSON.stringify(demoState)], 'plan.json', { type: 'application/json' });

    await act(async () => {
      latestSync!.importPlanFromJson(file);
      // file.text() is async — allow microtasks to flush
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(usePlannerStore.getState().person1.name).toBe('Alex');
    expect(usePlannerStore.getState().mode).toBe('couple');
  });

  test('invalid JSON does not crash and leaves store unchanged', async () => {
    render(<Harness />);

    const before = usePlannerStore.getState().person1.name;
    const file = new File(['not valid json {{{'], 'bad.json', { type: 'application/json' });

    await act(async () => {
      latestSync!.importPlanFromJson(file);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(usePlannerStore.getState().person1.name).toBe(before);
  });

  test('file read failure does not crash', async () => {
    render(<Harness />);

    const file = new File(['{}'], 'plan.json', { type: 'application/json' });
    vi.spyOn(file, 'text').mockRejectedValueOnce(new Error('read error'));

    await act(async () => {
      latestSync!.importPlanFromJson(file);
      await new Promise((r) => setTimeout(r, 0));
    });

    // No assertion needed — test passes if no uncaught exception is thrown
    expect(true).toBe(true);
  });
});
