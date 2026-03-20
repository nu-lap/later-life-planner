'use client';

interface Props {
  isOpen: boolean;
  hasRemotePlan: boolean;
  onImportLocal: () => void | Promise<void>;
  onStartFresh: () => void | Promise<void>;
  onKeepRemote: () => void | Promise<void>;
}

export default function MigrationPromptModal({
  isOpen,
  hasRemotePlan,
  onImportLocal,
  onStartFresh,
  onKeepRemote,
}: Props) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative mx-4 w-full max-w-xl rounded-2xl border border-orange-100 bg-white p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Local Plan Found</p>
        <h2 id="migration-modal-title" className="mt-2 text-xl font-black text-slate-900">
          Choose how to handle your older local data
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          We detected planner data saved on this browser before account-backed encryption was enabled.
          Choose what to keep.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={onImportLocal}
            className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-left hover:bg-orange-100"
          >
            <p className="text-sm font-bold text-orange-700">Import local plan</p>
            <p className="mt-1 text-xs text-orange-600">
              Encrypt and save your local plan to your account.
            </p>
          </button>

          <button
            onClick={onStartFresh}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
          >
            <p className="text-sm font-bold text-slate-700">Start fresh</p>
            <p className="mt-1 text-xs text-slate-500">
              {hasRemotePlan
                ? 'Replace the current remote plan with a new blank plan.'
                : 'Use a new blank plan and skip importing local data.'}
            </p>
          </button>

          {hasRemotePlan && (
            <button
              onClick={onKeepRemote}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100 sm:col-span-2"
            >
              <p className="text-sm font-bold text-emerald-700">Keep remote plan</p>
              <p className="mt-1 text-xs text-emerald-600">
                Keep the account plan and ignore this browser&apos;s local data.
              </p>
            </button>
          )}
        </div>

        {hasRemotePlan && (
          <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Importing local data will overwrite your existing remote plan after explicit confirmation.
          </p>
        )}
      </div>
    </div>
  );
}
