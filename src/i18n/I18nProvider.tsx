import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { I18nContext } from './context'
import { LANGUAGE_STORAGE_KEY, labels } from './messages'
import type { Locale } from './messages'
import { useLocation } from 'react-router-dom'
import { OPERATIONS_MODULES } from '../modules/operations/registry'

export default function I18nProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [locale, updateLocale] = useState<Locale>(() => {
    try {
      return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'vi'
    } catch {
      return 'vi'
    }
  })
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      /* Preference works for this session. */
    }
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    const name =
      OPERATIONS_MODULES.find((module) => pathname.startsWith(module.path))?.name || 'Inbox'
    document.title = `${locale === 'vi' ? labels[name] || name : name} · SmartSales Suite`
  }, [locale, pathname])
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (vi: string, en: string) => (locale === 'vi' ? vi : en),
      label: (english: string) => (locale === 'vi' ? labels[english] || english : english),
    }),
    [locale, setLocale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
