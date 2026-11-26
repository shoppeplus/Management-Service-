import { createContext, useContext } from 'react'
import type { Locale } from './messages'
import { labels } from './messages'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (vi: string, en: string) => string
  label: (english: string) => string
}
export const I18nContext = createContext<I18nContextValue>({
  locale: 'vi',
  setLocale: () => {},
  t: (vi) => vi,
  label: (english) => labels[english] || english,
})
export function useI18n() {
  return useContext(I18nContext)
}
