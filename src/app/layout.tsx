import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'

const SITE_URL = 'https://rift-draft.vercel.app'
const REPO_URL = 'https://github.com/Krlss/rift-draft'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Rift Draft — Draft Simulator for League of Legends',
    template: '%s | Rift Draft',
  },
  description:
    'Competitive multiplayer draft simulator for League of Legends. Supports Standard & Fearless Draft with picks, bans, ready check, stream mode, and encrypted invite links.',
  keywords: [
    'League of Legends', 'LoL', 'draft', 'fearless draft', 'draft simulator',
    'competitive draft', 'picks bans', 'draft tool', 'lol draft simulator',
    'multiplayer draft', 'draft online', 'lol draft free',
  ],
  authors: [{ name: 'Rift Draft', url: REPO_URL }],
  creator: 'Rift Draft',
  applicationName: 'Rift Draft',
  category: 'gaming',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Rift Draft',
    title: 'Rift Draft — Draft Simulator for League of Legends',
    description: 'Competitive multiplayer draft: Standard & Fearless. Picks, bans, stream mode, encrypted links.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Rift Draft — LoL Draft Simulator' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rift Draft — Draft Simulator for League of Legends',
    description: 'Competitive multiplayer draft: Standard & Fearless. Picks, bans, stream mode.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read locale set by middleware so html lang= matches the current route
  const headersList = await headers()
  const locale = headersList.get('x-locale') ?? 'en'

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://ddragon.leagueoflegends.com" />
        <link rel="preconnect" href="https://raw.communitydragon.org" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Rift Draft',
              description: 'Competitive multiplayer draft simulator for League of Legends',
              url: SITE_URL,
              applicationCategory: 'GameApplication',
              operatingSystem: 'Any',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              inLanguage: locale,
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
