import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: ({ fallbackRedirectUrl }: { fallbackRedirectUrl: string }) => (
    <div data-testid="clerk-sign-in" data-fallback={fallbackRedirectUrl} />
  ),
  SignUp: ({ fallbackRedirectUrl }: { fallbackRedirectUrl: string }) => (
    <div data-testid="clerk-sign-up" data-fallback={fallbackRedirectUrl} />
  ),
}));

vi.mock('@/components/ClerkSetupNotice', () => ({
  default: ({ title, body }: { title: string; body: string }) => (
    <section data-testid="clerk-setup">
      <h1>{title}</h1>
      <p>{body}</p>
    </section>
  ),
}));

import SignInPage from '@/app/sign-in/[[...sign-in]]/page';
import SignUpPage from '@/app/sign-up/[[...sign-up]]/page';

describe('auth routes', () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    authMock.mockResolvedValue({ userId: null });
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  });

  test('sign-in route redirects authenticated users to planner', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    redirectMock.mockImplementation(() => {
      throw new Error('redirected');
    });

    await expect(SignInPage()).rejects.toThrow('redirected');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  test('sign-up route redirects authenticated users to planner', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    redirectMock.mockImplementation(() => {
      throw new Error('redirected');
    });

    await expect(SignUpPage()).rejects.toThrow('redirected');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  test('sign-in route shows setup notice when Clerk key is missing', async () => {
    const element = await SignInPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Sign-in is not configured yet');
    expect(html).toContain('missing the Clerk publishable key');
    expect(html).toContain('data-testid="clerk-setup"');
  });

  test('sign-up route shows setup notice when Clerk key is missing', async () => {
    const element = await SignUpPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Sign-up is not configured yet');
    expect(html).toContain('missing the Clerk publishable key');
    expect(html).toContain('data-testid="clerk-setup"');
  });

  test('sign-in route renders Clerk SignIn when key is present', async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_123';

    const element = await SignInPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-testid="clerk-sign-in"');
    expect(html).toContain('data-fallback="/"');
  });

  test('sign-up route renders Clerk SignUp when key is present', async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_123';

    const element = await SignUpPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-testid="clerk-sign-up"');
    expect(html).toContain('data-fallback="/"');
  });
});

