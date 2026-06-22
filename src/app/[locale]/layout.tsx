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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const validLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale

  return (
    <html lang={validLocale}>
      <body>{children}</body>
    </html>
  )
}
