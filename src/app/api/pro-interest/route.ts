import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { recordProInterest } from '@/lib/cosmos';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { userId } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const sourcePanel: string = typeof body.sourcePanel === 'string' ? body.sourcePanel.slice(0, 60) : 'unknown';

    await recordProInterest({ userId, sourcePanel });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    // Auth failure — return 401
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
      return NextResponse.json({ ok: false, reason: 'unauthenticated' }, { status: 401 });
    }
    // Cosmos failure is non-critical — log and succeed silently
    console.error('[pro-interest] Failed to record interest:', err);
    return NextResponse.json({ ok: true });
  }
}

