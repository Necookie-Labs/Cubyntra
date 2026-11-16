import type { Metadata } from 'next';
import { Geist_Mono, Nunito_Sans, Pixelify_Sans } from 'next/font/google';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

// Pixel display face for headings only; body text stays in a readable sans.
const pixel = Pixelify_Sans({
  variable: '--font-pixel',
  subsets: ['latin'],
});

const body = Nunito_Sans({
  variable: '--font-body',
  subsets: ['latin'],
});

// Move notation and numbers.
const code = Geist_Mono({
  variable: '--font-code',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "Cubyntra — Computer Vision Rubik's Cube Scanner & Solver",
  description:
    "Rubik's Cube scanner, state validator, solver and interactive 3D digital twin by Necookie Labs, running on your own computer. Camera images never leave the device that took them. See it. Solve it.",
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
      className={`${pixel.variable} ${body.variable} ${code.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-ground text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
