import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Plus_Jakarta_Sans } from 'next/font/google';
import AuthStateSync from '@/components/AuthStateSync';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plus-jakarta-sans',
});

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
      <html lang="en" className={plusJakartaSans.variable}>
        <body className="min-h-screen bg-surface">
          {body}
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider>
      <html lang="en" className={plusJakartaSans.variable}>
        <body className="min-h-screen bg-surface">{body}</body>
      </html>
    </ClerkProvider>
  );
}
