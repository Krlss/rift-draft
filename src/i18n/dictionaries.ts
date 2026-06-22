import en from './en.json'
import es from './es.json'

export type Locale = 'en' | 'es'
export const locales: Locale[] = ['en', 'es']
export const defaultLocale: Locale = 'en'

export type Dictionary = typeof en

const dictionaries: Record<Locale, Dictionary> = { en, es }

export function getDictionary(locale: string): Dictionary {
  return dictionaries[(locale as Locale) in dictionaries ? (locale as Locale) : defaultLocale]
}
