import type { Metadata, Viewport } from 'next'
import { Inter, Libre_Baskerville } from 'next/font/google'

import { SITE_URL } from '@/lib/env'
import './globals.css'

/*
 * The reference store loads Inter at 300/700 (plus italics) and Libre
 * Baskerville at 400, served from the Shopify CDN. next/font self-hosts the
 * same faces, which removes that CDN dependency and eliminates the render-
 * blocking request.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-inter',
  display: 'swap',
})

const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-libre-baskerville',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL()),
  title: { default: 'AMIRIANI', template: '%s | AMIRIANI' },
  description: 'AMIRIANI',
  openGraph: {
    siteName: 'AMIRIANI',
    type: 'website',
    locale: 'en_BE',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${libreBaskerville.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Dawn's stylesheets gate their scroll animations on `html.js`, so
          without JS everything stays visible. Setting the class before paint
          avoids a flash of already-animated content.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.className += ' js';`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
