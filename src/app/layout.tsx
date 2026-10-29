import type { Metadata, Viewport } from 'next';
import '@fontsource/geist-sans/latin.css';
import '@fontsource/geist-mono/latin.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'K.A.I.A. · Fra spørgsmål til overblik',
  description:
    'Undersøg kommunens økonomi, strategier og scenarier med et sammenhængende, simuleret datagrundlag.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f7f8' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Spring til indhold
        </a>
        {children}
      </body>
    </html>
  );
}
