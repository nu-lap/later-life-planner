'use client';

import { UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePlannerStore } from '@/store/plannerStore';
import Header from '@/components/Header';
import StepIndicator from '@/components/StepIndicator';
import SummaryBar from '@/components/SummaryBar';
import DisclaimerGate from '@/components/DisclaimerGate';
import DeviceApprovalModal from '@/components/DeviceApprovalModal';
import MigrationPromptModal from '@/components/MigrationPromptModal';
import { DISCLAIMER_KEY } from '@/lib/browserStorageKeys';
import { usePlanSync } from '@/hooks/usePlanSync';
import type { PlannerSaveStatus } from '@/models/types';
import Step1HouseholdSetup from '@/components/steps/Step1HouseholdSetup';
import Step1LifeVision from '@/components/steps/Step1LifeVision';
import Step2SpendingGoals from '@/components/steps/Step2SpendingGoals';
import Step3IncomeSources from '@/components/steps/Step3IncomeSources';

const Step4Dashboard = dynamic(() => import('@/components/steps/Step4Dashboard'), { ssr: false });

const STEPS = [
  { label: 'Household',     description: 'Who are we planning for?' },
  { label: 'Life Vision',   description: 'Design your aspirations' },
  { label: 'Spending',      description: 'Set your lifestyle budget' },
  { label: 'Income & Assets', description: 'Map your financial picture' },
  { label: 'Dashboard',     description: 'See your lifetime plan' },
];

interface PlannerShellProps {
  saveStatus: PlannerSaveStatus;
  authControls?: React.ReactNode;
  isSyncReady?: boolean;
  onReloadRemote?: () => Promise<void>;
  migrationPrompt?: React.ReactNode;
}

function PlannerShell({
  saveStatus,
  authControls,
  isSyncReady = true,
  onReloadRemote,
  migrationPrompt,
}: PlannerShellProps) {
  const { currentStep, maxVisitedStep, setCurrentStep, resetPlan } = usePlannerStore();
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    setAccepted(localStorage.getItem(DISCLAIMER_KEY) === '1');
  }, []);
  const goNext = () => setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1));
  const goBack = () => setCurrentStep(Math.max(currentStep - 1, 0));

  function handleAccept() {
    localStorage.setItem(DISCLAIMER_KEY, '1');
    setAccepted(true);
  }

  function handleReset() {
    localStorage.removeItem(DISCLAIMER_KEY);
    resetPlan();
    setAccepted(false);
    // Hard reload to fully reset embedded widgets (e.g., Turnstile)
    window.location.reload();
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentStep]);

  useEffect(() => {
    if (!accepted) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [accepted]);

  if (accepted === null) return null;
  if (!accepted) return <DisclaimerGate onAccept={handleAccept} />;

  if (!isSyncReady) {
    return (
      <div className="min-h-screen flex flex-col bg-cream-100">
        <Header
          onReset={handleReset}
          saveStatus={saveStatus}
          onReloadRemote={onReloadRemote}
          authControls={authControls}
        />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12">
          <section className="game-card text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Secure Sync</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Loading your encrypted plan</h2>
            <p className="mt-2 text-sm text-slate-500">
              Your account data is being fetched and decrypted in this browser.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream-100">
      <Header
        onReset={handleReset}
        saveStatus={saveStatus}
        onReloadRemote={onReloadRemote}
        authControls={authControls}
      />

      {/* Step navigation bar */}
      <div className="sticky top-[56px] z-10 bg-white/80 backdrop-blur-sm border-b border-orange-100/60 no-print">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          <StepIndicator steps={STEPS} currentStep={currentStep} maxVisitedStep={maxVisitedStep} onStepClick={setCurrentStep} />
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="fade-in">
          {currentStep === 0 && <Step1HouseholdSetup onNext={goNext} />}
          {currentStep === 1 && <Step1LifeVision onNext={goNext} onBack={goBack} />}
          {currentStep === 2 && <Step2SpendingGoals onNext={goNext} onBack={goBack} />}
          {currentStep === 3 && <Step3IncomeSources onNext={goNext} onBack={goBack} />}
          {currentStep === 4 && <Step4Dashboard onBack={goBack} />}
        </div>
      </main>

      {/* Live summary bar */}
      {currentStep < 4 && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-orange-100/60 shadow-game no-print">
          <SummaryBar />
        </div>
      )}

      {migrationPrompt}
    </div>
  );
}

function AuthenticatedPlannerShell() {
  const sync = usePlanSync();
  const pendingApprovals = sync.devices.filter((device) => (
    device.status === 'pending' &&
    typeof device.requestExpiresAt === 'string' &&
    new Date(device.requestExpiresAt).getTime() > Date.now()
  )).length;

  return (
    <PlannerShell
      saveStatus={sync.saveStatus}
      onReloadRemote={sync.reloadRemotePlan}
      authControls={(
        <div className="flex items-center gap-2">
          <Link
            href="/account"
            className="btn-ghost text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            Account
          </Link>
          {pendingApprovals > 0 ? (
            <Link
              href="/account/devices"
              className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-rose-100 px-2 py-1 text-[11px] font-black text-rose-700 hover:bg-rose-200"
              aria-label={`${pendingApprovals} pending device approvals`}
              title="Pending device approvals"
            >
              {pendingApprovals}
            </Link>
          ) : null}
          <UserButton />
        </div>
      )}
      isSyncReady={sync.isSyncReady}
      migrationPrompt={(
        <>
          <MigrationPromptModal
            isOpen={sync.migrationPrompt.isOpen}
            hasRemotePlan={sync.migrationPrompt.hasRemotePlan}
            onImportLocal={sync.importLegacyPlan}
            onStartFresh={sync.startFreshPlan}
            onKeepRemote={sync.keepRemotePlan}
          />
          <DeviceApprovalModal
            isOpen={sync.deviceApprovalPrompt.isOpen}
            deviceId={sync.deviceApprovalPrompt.deviceId}
            requestId={sync.deviceApprovalPrompt.requestId}
            expiresAt={sync.deviceApprovalPrompt.expiresAt}
            publicKeyFingerprint={sync.deviceApprovalPrompt.publicKeyFingerprint}
            error={sync.deviceApprovalPrompt.error}
            onClose={sync.closeDeviceApprovalPrompt}
          />
        </>
      )}
    />
  );
}

export default function Home() {
  const hasClerkPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (hasClerkPublishableKey) return <AuthenticatedPlannerShell />;
  return <PlannerShell saveStatus="local" />;
}
