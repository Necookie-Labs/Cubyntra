import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Nunito_Sans, Pixelify_Sans } from 'next/font/google';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { APP_METADATA, APP_VIEWPORT } from './appMetadata';

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

export const metadata: Metadata = APP_METADATA;
export const viewport: Viewport = APP_VIEWPORT;

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
