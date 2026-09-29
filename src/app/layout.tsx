import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "Cubyntra — Computer Vision Rubik's Cube Scanner & Solver",
  description:
    "High-precision, 100% client-side Computer Vision Rubik's Cube scanner, state validator, solver, and interactive 3D digital twin by Necookie Labs. See it. Solve it.",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set by the boot script before paint and may differ from this default.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-page text-neutral-100 font-sans selection:bg-sky-500/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
