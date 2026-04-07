import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import AuthStateSync from '@/components/AuthStateSync';
import './globals.css';

export const metadata: Metadata = {
  title: 'LaterLifePlan — Design the life you want',
  description: 'Plan the lifestyle you want in later life and understand how your income sources and assets can fund it.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hasClerkPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const body = (
    <>
      {hasClerkPublishableKey ? <AuthStateSync /> : null}
      {children}
    </>
  );

  if (!hasClerkPublishableKey) {
    return (
      <html lang="en">
        <body className="min-h-screen bg-cream-100">
          {body}
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-cream-100">{body}</body>
      </html>
    </ClerkProvider>
  );
}
