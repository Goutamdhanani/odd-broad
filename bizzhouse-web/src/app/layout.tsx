import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'BizzHouse — WhatsApp Business API Platform',
  description:
    'High-throughput WhatsApp Business messaging, broadcast marketing, and unified customer conversations with atomic per-message wallet billing.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="antialiased min-h-screen bg-[var(--bh-bg-base)] text-[var(--bh-text-primary)]">
        {/* Global Refraction SVG Filter Definition */}
        <svg
          width="0"
          height="0"
          className="absolute pointer-events-none"
          style={{ position: 'absolute', width: 0, height: 0 }}
          aria-hidden="true"
        >
          <defs>
            <filter id="bh-refraction" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.024"
                numOctaves="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="14"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        {/* Atmosphere Light Field + Grain */}
        <div className="bh-atmosphere" aria-hidden="true" />
        <div className="bh-atmosphere-noise" aria-hidden="true" />

        {/* Page Content */}
        {children}

        {/* Toast Notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(255, 255, 255, 0.92)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              color: '#1d1d1f',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
              borderRadius: '16px',
              backdropFilter: 'blur(24px) saturate(180%)',
              fontSize: '13.5px',
            },
          }}
        />
        {/* Razorpay Checkout SDK — loaded on all pages so wallet top-up works */}
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
