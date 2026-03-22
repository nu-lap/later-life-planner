'use client';

import { useEffect } from 'react';
import AccountLayoutShell from '@/components/account/AccountLayoutShell';
import DeviceApprovalsPanel from '@/components/account/DeviceApprovalsPanel';
import { usePlanSync } from '@/hooks/usePlanSync';

const HAS_CLERK = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function AccountDevicesPageWithClerk() {
  const sync = usePlanSync();
  const { refreshDevices } = sync;

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

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
      <DeviceApprovalsPanel
        devices={sync.devices}
        onRefreshDevices={sync.refreshDevices}
        onApproveDevice={sync.approvePendingDevice}
      />
    </AccountLayoutShell>
  );
}

export default function AccountDevicesPage() {
  if (!HAS_CLERK) {
    return (
      <div className="min-h-screen flex flex-col bg-cream-100">
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12">
          <section className="game-card text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Devices</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Device approvals are disabled</h2>
            <p className="mt-2 text-sm text-slate-500">
              This environment is running without sign-in, so encrypted account sync is not available.
            </p>
          </section>
        </main>
      </div>
    );
  }
  return <AccountDevicesPageWithClerk />;
}
