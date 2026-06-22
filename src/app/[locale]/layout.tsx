import type { Metadata } from 'next'
import { locales, defaultLocale, type Locale } from '@/i18n/dictionaries'

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isEs = locale === 'es'
  return {
    title: isEs
      ? 'Rift Draft — Simulador de Draft para League of Legends'
      : 'Rift Draft — Draft Simulator for League of Legends',
    description: isEs
      ? 'Simulador de draft competitivo multijugador: Estándar y Fearless Draft con picks, bans y modo stream.'
      : 'Competitive multiplayer draft simulator: Standard & Fearless Draft with picks, bans, and stream mode.',
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map(l => [l, `/${l}`])),
    },
  }
}

// ⚠️ Do NOT render <html> or <body> here — the root layout owns those.
// This layout only handles per-locale metadata and generateStaticParams.
export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
