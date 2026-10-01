import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LanguageContext, type LanguageValue } from './language-context.ts'
import { readStoredLang, storeLang } from './lang-storage.ts'
import type { Lang } from './strings.ts'

/** Mantiene el idioma elegido, lo persiste y lo refleja en el `lang` del documento. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang())

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    storeLang(next)
  }, [])

  // Para que los lectores de pantalla y el navegador sepan en qué idioma está la
  // página; no es decorativo.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<LanguageValue>(() => ({ lang, setLang }), [lang, setLang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
