'use client';

import AccountLayoutShell from '@/components/account/AccountLayoutShell';
import AccountOverviewPanel from '@/components/account/AccountOverviewPanel';
import { usePlanSync } from '@/hooks/usePlanSync';

const HAS_CLERK = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function countPendingApprovals(devices: Array<{ status: string; requestExpiresAt?: string | null }>): number {
  return devices.filter((device) => (
    device.status === 'pending' &&
    typeof device.requestExpiresAt === 'string' &&
    new Date(device.requestExpiresAt).getTime() > Date.now()
  )).length;
}

function AccountPageWithClerk() {
  const sync = usePlanSync();
  const pendingApprovals = countPendingApprovals(sync.devices);

  if (!sync.isSyncReady) {
    return (
      <AccountLayoutShell saveStatus={sync.saveStatus}>
        <section className="game-card text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Secure Sync</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Loading your encrypted plan</h2>
          <p className="mt-2 text-sm text-slate-500">
            Your account data is being fetched and decrypted in this browser.
          </p>
        </section>
      </AccountLayoutShell>
    );
  }

  return (
    <AccountLayoutShell saveStatus={sync.saveStatus}>
      <AccountOverviewPanel
        saveStatus={sync.saveStatus}
        lastSavedAt={sync.lastSavedAt}
        revision={sync.revision}
        syncError={sync.syncError}
        pendingApprovals={pendingApprovals}
        onReloadRemote={sync.reloadRemotePlan}
        onExportPlan={sync.exportCanonicalPlan}
        onImportPlan={sync.importPlanFromJson}
      />
    </AccountLayoutShell>
  );
}

export default function AccountPage() {
  if (!HAS_CLERK) {
    return (
      <div className="min-h-screen flex flex-col bg-cream-100">
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12">
          <section className="game-card text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Account</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Account area is disabled</h2>
            <p className="mt-2 text-sm text-slate-500">
              This environment is running without sign-in, so encrypted account sync is not available.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return <AccountPageWithClerk />;
}
