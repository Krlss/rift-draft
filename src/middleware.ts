import { NextRequest, NextResponse } from 'next/server'

const locales = ['en', 'es']
const defaultLocale = 'en'

function getLocale(request: NextRequest): string {
  // 1. Check cookie preference
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && locales.includes(cookieLocale)) return cookieLocale

  // 2. Check Accept-Language header
  const acceptLang = request.headers.get('accept-language')
  if (acceptLang) {
    const preferred = acceptLang.split(',')[0].split('-')[0].toLowerCase()
    if (locales.includes(preferred)) return preferred
  }

  return defaultLocale
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files, api routes, and _next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // files with extensions (favicon.ico, etc.)
  ) {
    return NextResponse.next()
  }

  // Check if pathname already has a locale prefix
  const hasLocale = locales.some(
    locale => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  )

  if (!hasLocale) {
    // Redirect /draft → /en/draft (or browser-preferred locale)
    const locale = getLocale(request)
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname}`
    const response = NextResponse.redirect(url)
    response.headers.set('x-locale', locale)
    return response
  }

  // Pass locale to root layout via header so it can set lang= correctly
  const response = NextResponse.next()
  const currentLocale = pathname.split('/')[1]
  response.headers.set('x-locale', locales.includes(currentLocale) ? currentLocale : defaultLocale)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
