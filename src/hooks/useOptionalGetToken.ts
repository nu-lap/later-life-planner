'use client';

import { useAuth } from '@clerk/nextjs';

// Stable no-op reference — never captures credentials.
const noopGetToken = async (): Promise<null> => null;

/**
 * Returns Clerk's `getToken` when ClerkProvider is present, or a stable no-op
 * when running in local/non-Clerk mode (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset).
 *
 * `NEXT_PUBLIC_*` env vars are inlined as build-time constants by Next.js, so
 * the branch taken here is fixed for a given build and the hook call order is
 * stable across renders — satisfying React's rules of hooks at runtime even
 * though the conditional looks dynamic.
 *
 * NOTE: Calling `useAuth()` unconditionally is not possible here because Clerk
 * throws a context error when invoked outside of `<ClerkProvider>`. The env-var
 * guard eliminates that code path entirely in non-Clerk builds.
 */
export function useOptionalGetToken(): () => Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return noopGetToken;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth().getToken;
}
