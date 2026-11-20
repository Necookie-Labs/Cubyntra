import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Nunito, Nunito_Sans } from 'next/font/google';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { APP_METADATA, APP_VIEWPORT } from './appMetadata';

// Rounded display face for headings, buttons and big numbers (ADR-018).
const display = Nunito({
  variable: '--font-rounded',
  subsets: ['latin'],
});

// Body text: the same family's plain cut, so the two read as one voice.
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
      className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      {/* No body background: the page gradient is a fixed layer behind it (globals.css). */}
      <body className="min-h-full flex flex-col text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
