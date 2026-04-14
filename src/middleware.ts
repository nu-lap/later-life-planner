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
// All /api/* routes authenticate themselves via requireUser() and must not
// be subject to Clerk's protect-rewrite, which rewrites requests into 404s
// when the __client_uat cookie is out of sync on production domains.
const isApiRoute = createRouteMatcher(['/api/(.*)']);
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

  // API routes handle their own authentication via requireUser().
  // Bypassing here prevents Clerk from rewriting requests into 404s when the
  // __client_uat cookie is out of sync (e.g. on non-localhost production domains).
  if (isApiRoute(request)) {
    if (debugEnabled && pathname === '/api/data') {
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
