import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  PLAN_SYNC_DEBUG_HEADER,
  PLAN_SYNC_TRACE_HEADER,
} from '@/lib/planSyncDebug';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/.well-known/microsoft-identity-association.json',
]);
const isClerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const authMiddleware = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const traceId = request.headers.get(PLAN_SYNC_TRACE_HEADER);
  const debugEnabled = request.headers.get(PLAN_SYNC_DEBUG_HEADER) === '1';

  if (debugEnabled && pathname === '/api/data') {
    console.info('[plan-sync] middleware:start', {
      traceId,
      method: request.method,
      pathname,
      publicRoute: isPublicRoute(request),
    });
  }

  // Let the route handler authenticate /api/data itself so Clerk doesn't
  // rewrite valid save requests into a 404 when the browser session is stale.
  if (pathname === '/api/data') {
    if (debugEnabled) {
      console.info('[plan-sync] middleware:bypass', {
        traceId,
        method: request.method,
        pathname,
      });
    }
    return NextResponse.next();
  }

  if (!isPublicRoute(request)) {
    await auth.protect();

    if (debugEnabled && pathname === '/api/data') {
      console.info('[plan-sync] middleware:passed', {
        traceId,
        method: request.method,
        pathname,
      });
    }
  }
});

export default isClerkConfigured
  ? authMiddleware
  : (() => NextResponse.next());

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|jpg|jpeg|gif|png|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
