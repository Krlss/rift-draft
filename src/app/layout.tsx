import type { Metadata } from 'next'
import './globals.css'

const SITE_URL = 'https://rift-draft.vercel.app'
const REPO_URL = 'https://github.com/Krlss/rift-draft'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Rift Draft — Simulador de Draft para League of Legends',
    template: '%s | Rift Draft',
  },
  description:
    'Simulador de draft competitivo multijugador para League of Legends. Supports Standard y Fearless Draft con picks, bans, ready check, modo stream y links de invitación encriptados.',
  keywords: [
    'League of Legends', 'LoL', 'draft', 'fearless draft', 'simulador draft',
    'draft competitivo', 'picks bans', 'draft tool', 'lol draft simulator',
    'draft multijugador', 'draft online', 'draft lol gratis',
  ],
  authors: [{ name: 'Rift Draft', url: REPO_URL }],
  creator: 'Rift Draft',
  applicationName: 'Rift Draft',
  category: 'gaming',
  // Canonical
  alternates: { canonical: '/' },
  // Open Graph — rich previews in Discord, Telegram, WhatsApp, etc.
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    url: SITE_URL,
    siteName: 'Rift Draft',
    title: 'Rift Draft — Simulador de Draft para League of Legends',
    description:
      'Draft competitivo multijugador: Standard & Fearless. Picks, bans, modo stream, links encriptados.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Rift Draft — Simulador de Draft LoL',
      },
    ],
  },
  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'Rift Draft — Simulador de Draft para League of Legends',
    description:
      'Draft competitivo multijugador: Standard & Fearless. Picks, bans, modo stream.',
    images: ['/og-image.png'],
  },
  // Robots — allow indexing
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  // Icons
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Preconnect to DDragon CDN for faster image loads */}
        <link rel="preconnect" href="https://ddragon.leagueoflegends.com" />
        <link rel="preconnect" href="https://raw.communitydragon.org" />
        {/* JSON-LD structured data for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Rift Draft',
              description: 'Simulador de draft competitivo multijugador para League of Legends',
              url: SITE_URL,
              applicationCategory: 'GameApplication',
              operatingSystem: 'Any',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              inLanguage: 'es',
            }),
          }}
        />
      </head>
      <body>
        <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
