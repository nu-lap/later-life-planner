'use client';

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import Header from '@/components/Header';
import type { PlannerSaveStatus } from '@/models/types';

interface Props {
  saveStatus: PlannerSaveStatus;
  children: React.ReactNode;
}

export default function AccountLayoutShell({ saveStatus, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-cream-100">
      <Header
        onReset={() => {}}
        saveStatus={saveStatus}
        showPlannerActions={false}
        authControls={(
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="btn-ghost text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              Planner
            </Link>
            <UserButton />
          </div>
        )}
      />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  );
}

