import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BodySchema = z.object({
  aspirations: z.array(z.string().max(32)).max(10).optional().default([]),
  mode: z.enum(['single', 'couple']),
  turnstileToken: z.string().optional(),
});

const MAX_TOTAL_ASPIRATION_CHARS = 200;

const SYSTEM_PROMPT = `You write short, plain-English later-life vision statements.
Rules:
- Use everyday words. Never use words like "envision", "curate", "tapestry", "rootedness", "embark", "journey", "intentional", "meaningful", or similar abstract filler.
- Write like a real person talking to a friend — warm and direct, not like a brochure.
- Short sentences. No jargon.
- Split the response into 2–3 short paragraphs, each on a new line.
- No bullet points, no headings, no sign-off.`;

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const rl = rateLimit(`vision:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.ok) {
    return new Response('Too many requests. Please try again shortly.', {
      status: 429,
      headers: { 'Retry-After': Math.ceil(rl.resetInMs / 1000).toString() },
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('AI features are not configured.', { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response('Invalid request payload.', { status: 400 });
  }
  const { aspirations, mode, turnstileToken } = parsed.data;
  const totalChars = aspirations.reduce((s, a) => s + a.length, 0);
  if (totalChars > MAX_TOTAL_ASPIRATION_CHARS) {
    return new Response('Aspiration list is too long.', { status: 400 });
  }

  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return new Response('Captcha required.', { status: 400 });
    }
    const form = new FormData();
    form.append('secret', process.env.TURNSTILE_SECRET_KEY);
    form.append('response', turnstileToken);
    form.append('remoteip', ip);
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const verify = await verifyRes.json().catch(() => null);
    if (!verify?.success) {
      return new Response('Captcha verification failed.', { status: 400 });
    }
  }

  const aspirationList = (aspirations as string[]).length > 0
    ? (aspirations as string[]).join(', ')
    : 'enjoying later life';

  const prompt = mode === 'couple'
    ? `Write a life vision statement for a couple planning later life. Their priorities are: ${aspirationList}. Use "we" and "us". Keep it real and personal — 2 to 3 short paragraphs.`
    : `Write a life vision statement for someone planning later life. Their priorities are: ${aspirationList}. Keep it real and personal — 2 to 3 short paragraphs.`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const anthropicStream = client.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 250,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of anthropicStream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
