import DraftPage from '@/app/draft/page'
import { getDictionary, locales, defaultLocale, type Locale } from '@/i18n/dictionaries'

export async function generateStaticParams() {
  return locales.map(locale => ({ locale }))
}

export default async function LocaleDraftPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const validLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale
  const dict = getDictionary(validLocale)

  return <DraftPage dict={dict} locale={validLocale} />
}
